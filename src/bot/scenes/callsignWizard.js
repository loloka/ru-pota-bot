import { Scenes } from 'telegraf';
import db from '../../db/database.js';

const baseCallsignRegex = /^([A-Z0-9]{1,4}\/)?([A-Z0-9]{1,3}[0-9][A-Z0-9]{1,5})(\/[A-Z0-9]{1,4})?$/;
const hasLetterRegex = /[A-Z]/;

export const callsignWizard = new Scenes.WizardScene(
  'CALLSIGN_WIZARD',
  async (ctx) => {
    // 1. Group chat block
    if (ctx.chat?.type !== 'private') {
      try { await ctx.deleteMessage(); } catch(e){}
      
      let msgText = `ℹ️ Для регистрации вашего позывного пройдите в личные сообщения 👇`;
      let opts = {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '👉 Открыть личные сообщения 👈', url: `https://t.me/${ctx.botInfo.username}` }]]
        }
      };
      
      if (ctx.state.user) {
        const status = ctx.state.user.status;
        if (status === 'approved') {
          msgText = `✅ Вы уже зарегистрированы как <b>${ctx.state.user.callsign}</b>!`;
          opts.reply_markup = undefined;
        } else if (status === 'pending') {
          msgText = `⏳ Ваш позывной <b>${ctx.state.user.callsign}</b> находится на модерации.`;
          opts.reply_markup = undefined;
        }
      }
      
      const msg = await ctx.reply(msgText, opts);
      setTimeout(() => { ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(()=>{}) }, 7000);
      return ctx.scene.leave();
    }

    // 2. Idempotency check (already registered?)
    if (ctx.state.user) {
      const status = ctx.state.user.status;
      if (status === 'approved') {
        await ctx.reply(`✅ Вы уже зарегистрированы как <b>${ctx.state.user.callsign}</b>!`, { parse_mode: 'HTML' });
        return ctx.scene.leave();
      } else if (status === 'pending') {
        await ctx.reply(`⏳ Ваш позывной <b>${ctx.state.user.callsign}</b> находится на модерации. Ожидайте подтверждения!`, { parse_mode: 'HTML' });
        return ctx.scene.leave();
      }
    }

    // If they clicked the inline button, answer the callback query to remove loading state
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch (e) {}
    }
    await ctx.reply('📡 Пожалуйста, введите ваш радиолюбительский позывной:\n\n<i>Для отмены введите /cancel</i>', {
      parse_mode: 'HTML',
      /* removed */
    });
    return ctx.wizard.next();
  },
  async (ctx) => {
    const text = ctx.message?.text?.toUpperCase();
    if (!text) return;
    
    if (!baseCallsignRegex.test(text) || !hasLetterRegex.test(text)) {
      await ctx.reply(
        '❌ <b>Недопустимый формат позывного.</b>\n\n' +
        'Пожалуйста, введите корректный позывной (например: R9OGL, R9OGL/P).',
        { parse_mode: 'HTML' }
      );
      return; // stay on this step to try again
    }

    const userId = ctx.from.id;
    try {
      // Check if callsign is already registered to someone else
      const checkStmt = db.prepare('SELECT telegram_id, status FROM users WHERE callsign = ?');
      const existingUser = checkStmt.get(text);
      
      if (existingUser && existingUser.telegram_id !== userId) {
        if (existingUser.status === 'approved' || existingUser.status === 'pending') {
          await ctx.reply(
            `❌ Этот позывной уже зарегистрирован в системе. Если это ваш позывной либо произошла какая-то ошибка, обратитесь к администратору: @r9ogl\n\n` +
            `Либо попробуйте ещё раз /callsign`
          );
          return ctx.scene.leave();
        }
      }

      const stmt = db.prepare(`
        INSERT INTO users (telegram_id, callsign, status, reject_reason)
        VALUES (?, ?, 'pending', NULL)
        ON CONFLICT(telegram_id) DO UPDATE SET callsign=excluded.callsign, status='pending', reject_reason=NULL
      `);
      stmt.run(userId, text);
      
      // Update ctx.state so following middlewares see the change
      ctx.state.user = { callsign: text, status: 'pending' };

      await ctx.reply(`✅ Ваш позывной <b>${text}</b> успешно принят!\n\n⏳ Теперь он находится на модерации. Мы пришлем уведомление, как только администратор его проверит.`, { parse_mode: 'HTML' });

      // Notify Admin
      const adminId = process.env.ADMIN_ID;
      if (adminId) {
        try {
          const userLink = ctx.from.username ? `@${ctx.from.username}` : `<a href="tg://user?id=${userId}">${ctx.from.first_name || 'пользователь'}</a>`;
          await ctx.telegram.sendMessage(
            adminId, 
            `🔔 <b>Новая заявка на модерацию!</b>\nПозывной: <b>${text}</b>\nОт: ${userLink}\nID: <code>${userId}</code>\n\n👉 Выберите действие ниже или зайдите в <a href="https://pota.r9o.ru/">админ-панель</a>.`, 
            { 
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✅ Одобрить', callback_data: `admin_appr:${userId}` },
                    { text: '❌ Отклонить', callback_data: `admin_rej:${userId}` }
                  ]
                ]
              }
            }
          );
        } catch (e) {
          console.error('Failed to notify admin', e.message);
        }
      }
    } catch (e) {
      console.error(e);
      await ctx.reply('❌ Произошла ошибка при сохранении.');
    }
    return ctx.scene.leave();
  }
);

callsignWizard.command('cancel', async (ctx) => {
  await ctx.reply('🚫 Регистрация отменена. Для начала работы нажмите /start');
  return ctx.scene.leave();
});

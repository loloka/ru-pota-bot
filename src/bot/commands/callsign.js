import db from '../../db/database.js';
import { deleteUserMessage, replyWithAutoDelete } from '../utils.js';

export const callsignHandler = async (ctx) => {
  const isPrivate = ctx.chat?.type === 'private';
  
  if (!isPrivate) {
    await deleteUserMessage(ctx);
    
    if (ctx.state.user) {
      const status = ctx.state.user.status;
      if (status === 'approved') {
        return replyWithAutoDelete(ctx, `✅ Вы уже зарегистрированы как <b>${ctx.state.user.callsign}</b>!`, { parse_mode: 'HTML' });
      } else if (status === 'pending') {
        return replyWithAutoDelete(ctx, `⏳ Ваш позывной <b>${ctx.state.user.callsign}</b> находится на модерации.`, { parse_mode: 'HTML' });
      }
    }
    
    return replyWithAutoDelete(ctx, 
      `ℹ️ Для регистрации вашего позывного пройдите в личные сообщения 👇`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: '👉 Открыть личные сообщения 👈', url: `https://t.me/${ctx.botInfo.username}` }]]
        }
      }
    );
  }

  // Check if already registered
  if (ctx.state.user) {
    const status = ctx.state.user.status;
    if (status === 'approved') {
      return ctx.reply(`✅ Вы уже зарегистрированы как <b>${ctx.state.user.callsign}</b>!\nДоступные команды: /spot, /stats, /park, /sub`, { parse_mode: 'HTML' });
    } else if (status === 'pending') {
      return ctx.reply(`⏳ Ваш позывной <b>${ctx.state.user.callsign}</b> находится на модерации. Ожидайте подтверждения!`, { parse_mode: 'HTML' });
    }
  }

  const userId = ctx.from?.id;
  const text = ctx.message?.text || '';
  const args = text.split(' ');
  
  if (args.length < 2) {
    return ctx.reply('ℹ️ Использование: /callsign [ПОЗЫВНОЙ]');
  }

  const callsign = args[1].toUpperCase();

  // Strict validation for amateur radio callsign format
  // 1. Must have at least one letter somewhere in the base callsign
  // 2. Base callsign must have a digit (ITU region)
  // 3. Allows optional prefix (e.g. EA/) and suffix (e.g. /P)
  const baseCallsignRegex = /^([A-Z0-9]{1,4}\/)?([A-Z0-9]{1,3}[0-9][A-Z0-9]{1,5})(\/[A-Z0-9]{1,4})?$/;
  const hasLetterRegex = /[A-Z]/;
  
  if (!baseCallsignRegex.test(callsign) || !hasLetterRegex.test(callsign)) {
    return ctx.reply(
      '❌ <b>Недопустимый формат позывного.</b>\n\n' +
      'Позывной должен соответствовать радиолюбительским стандартам ITU (содержать буквы и минимум одну цифру).\n' +
      '<i>Примеры: R9OGL, R9OGL/P, EA/R9OGL</i>',
      { parse_mode: 'HTML' }
    );
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO users (telegram_id, callsign, status)
      VALUES (?, ?, 'pending')
      ON CONFLICT(telegram_id) DO UPDATE SET callsign=excluded.callsign, status='pending'
    `);
    stmt.run(userId, callsign);

    await ctx.reply(`✅ Ваш позывной ${callsign} успешно зарегистрирован! Ждём одобрения модерации.`);

    // Notify Admin
    const adminId = process.env.ADMIN_ID;
    if (adminId) {
      try {
        const userLink = ctx.from.username ? `@${ctx.from.username}` : `<a href="tg://user?id=${userId}">${ctx.from.first_name || 'пользователь'}</a>`;
        await ctx.telegram.sendMessage(
          adminId, 
          `🔔 <b>Новая заявка на модерацию!</b>\nПозывной: <b>${callsign}</b>\nОт: ${userLink}\nID: <code>${userId}</code>\n\n👉 Зайдите в <a href="http://localhost:3000/">админ-панель</a> для проверки.`, 
          { parse_mode: 'HTML' }
        );
      } catch (e) {
        console.error('Failed to notify admin', e.message);
      }
    }
  } catch (error) {
    console.error('Error saving callsign:', error);
    await ctx.reply('❌ Произошла ошибка при сохранении позывного.');
  }
};

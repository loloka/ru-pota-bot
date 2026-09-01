import db from '../../db/database.js';
import { deleteUserMessage, replyWithAutoDelete } from '../utils.js';

export const getSubsKeyboard = (userId) => {
  const stmt = db.prepare('SELECT target_callsign FROM subscriptions WHERE telegram_id = ?');
  const subs = stmt.all(userId);
  
  if (subs.length === 0) {
    return { 
      text: 'ℹ️ <b>У вас пока нет подписок.</b>\n\nВы можете подписаться на споты интересующего вас активатора или друга. Как только он отправит спот в кластер, бот моментально пришлет вам уведомление!\n\nДля подписки используйте команду:\n👉 <code>/sub [ПОЗЫВНОЙ]</code>', 
      reply_markup: undefined 
    };
  }
  
  const keyboard = subs.map(s => ([{ text: `❌ Отписаться от ${s.target_callsign}`, callback_data: `delsub:${s.target_callsign}` }]));
  return {
    text: '🔔 <b>Ваши активные подписки:</b>\n\nНажмите на кнопку ниже, чтобы удалить подписку.',
    reply_markup: { inline_keyboard: keyboard }
  };
};

export const subHandler = async (ctx) => {
  if (ctx.chat?.type !== 'private') {
    await deleteUserMessage(ctx);
    return replyWithAutoDelete(ctx, 
      `ℹ️ Управление подписками доступно только в личных сообщениях 👇`, 
      {
        reply_markup: {
          inline_keyboard: [[{ text: '👉 Перейти к боту 👈', url: `https://t.me/${ctx.botInfo.username}` }]]
        }
      }
    );
  }

  const userId = ctx.from.id;
  const args = ctx.message.text.split(' ');

  if (args.length < 2) {
    const { text, reply_markup } = getSubsKeyboard(userId);
    return ctx.reply(text, { parse_mode: 'HTML', reply_markup });
  }

  const targetCallsign = args[1].toUpperCase();

  const baseCallsignRegex = /^([A-Z0-9]{1,4}\/)?([A-Z0-9]{1,3}[0-9][A-Z0-9]{1,5})(\/[A-Z0-9]{1,4})?$/;
  const hasLetterRegex = /[A-Z]/;
  
  if (!baseCallsignRegex.test(targetCallsign) || !hasLetterRegex.test(targetCallsign)) {
    return ctx.reply(
      '❌ <b>Недопустимый формат позывного.</b>\n\n' +
      'Пожалуйста, введите команду заново с корректным позывным (например: <code>/sub R9OGL</code>).',
      { parse_mode: 'HTML' }
    );
  }

  try {
    const stmt = db.prepare('INSERT INTO subscriptions (telegram_id, target_callsign) VALUES (?, ?)');
    stmt.run(userId, targetCallsign);
    await ctx.reply(`✅ Вы успешно подписались на уведомления о спотах от <b>${targetCallsign}</b>!`, { parse_mode: 'HTML' });
  } catch (error) {
    // If already subscribed, remove subscription (toggle behavior)
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      try {
        const delStmt = db.prepare('DELETE FROM subscriptions WHERE telegram_id = ? AND target_callsign = ?');
        delStmt.run(userId, targetCallsign);
        await ctx.reply(`❌ Вы отписались от уведомлений о спотах от <b>${targetCallsign}</b>.`, { parse_mode: 'HTML' });
      } catch (err) {
        console.error('Error deleting sub:', err);
        await ctx.reply('❌ Ошибка при управлении подпиской.');
      }
    } else {
      console.error('Error adding sub:', error);
      await ctx.reply('❌ Произошла ошибка базы данных.');
    }
  }
};

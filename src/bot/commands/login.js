import crypto from 'crypto';
import db from '../../db/database.js';
import { deleteUserMessage, replyWithAutoDelete } from '../utils.js';

export const loginHandler = async (ctx) => {
  const isPrivate = ctx.chat?.type === 'private';

  if (!isPrivate) {
    await deleteUserMessage(ctx);
    return replyWithAutoDelete(
      ctx,
      '🔐 Код авторизации для входа на сайт выдаётся только в личных сообщениях с ботом.',
      {
        reply_markup: {
          inline_keyboard: [[{ text: '👉 Открыть личные сообщения 👈', url: `https://t.me/${ctx.botInfo.username}?start=login` }]]
        }
      }
    );
  }

  const userId = ctx.from?.id;
  const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(userId);

  if (!user || !user.callsign) {
    return ctx.reply(
      '⚠️ <b>Вы ещё не зарегистрировали позывной</b>\n\n' +
      'Для входа на сайт под своим радиолюбительским профилем сначала зарегистрируйтесь с помощью команды /callsign.',
      { parse_mode: 'HTML' }
    );
  }

  if (user.status === 'pending') {
    return ctx.reply(
      `⏳ Ваш позывной <b>${user.callsign}</b> находится на модерации администратора.\n\n` +
      `Как только заявка будет одобрена, вы получите уведомление и сможете войти на сайт.`,
      { parse_mode: 'HTML' }
    );
  }

  if (user.status === 'rejected') {
    return ctx.reply(
      `❌ Ваша регистрация была отклонена: <i>${user.reject_reason || 'Причина не указана'}</i>.\n\n` +
      `Подайте заявку заново с помощью /callsign.`,
      { parse_mode: 'HTML' }
    );
  }

  // Generate 6-digit code
  const code = String(crypto.randomInt(100000, 999999));
  const token = `code_${crypto.randomBytes(8).toString('hex')}`;
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  // Invalidate previous unused codes for this telegram_id
  db.prepare(`
    UPDATE telegram_login_sessions 
    SET status = 'expired' 
    WHERE telegram_id = ? AND status = 'confirmed'
  `).run(userId);

  db.prepare(`
    INSERT INTO telegram_login_sessions (token, code, telegram_id, callsign, status, expires_at)
    VALUES (?, ?, ?, ?, 'confirmed', ?)
  `).run(token, code, userId, user.callsign, expiresAt);

  console.log(`\x1b[32m[Telegram Auth]\x1b[0m 🔐 Выдан код ${code} для пользователя ${user.callsign} (TG: ${userId})`);

  return ctx.reply(
    `🔐 <b>Код авторизации на сайте:</b>\n\n` +
    `👉 <code>${code}</code> 👈 <i>(нажмите, чтобы скопировать)</i>\n\n` +
    `⏳ Код действителен <b>10 минут</b>.\n` +
    `Введите его на сайте <a href="https://pota.r9o.ru">pota.r9o.ru</a> для мгновенного входа в профиль оператора <b>${user.callsign}</b>. 73! 🌲📡`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 Открыть сайт pota.r9o.ru', url: 'https://pota.r9o.ru' }]
        ]
      }
    }
  );
};

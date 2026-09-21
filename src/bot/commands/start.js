import crypto from 'crypto';
import { deleteUserMessage, replyWithAutoDelete } from '../utils.js';
import db from '../../db/database.js';
import { loginHandler } from './login.js';

let lastGroupStartMsgId = null;

export const startHandler = async (ctx) => {
  const isPrivate = ctx.chat?.type === 'private';
  const username = ctx.from?.first_name || ctx.from?.username || 'Пользователь';

  // Если это публичная группа / канал
  if (!isPrivate) {
    await deleteUserMessage(ctx);
    
    // Удаляем предыдущее сообщение от бота, чтобы не спамить
    if (lastGroupStartMsgId) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, lastGroupStartMsgId);
      } catch (e) {}
    }

    let msg;
    // Если пользователь уже зарегистрирован
    if (ctx.state.user && ctx.state.user.status === 'approved') {
      msg = await ctx.reply(
        `👋 Привет, ${username}! Вы зарегистрированы как <b>${ctx.state.user.callsign}</b>.\n\n` +
        `<b>Доступные команды в группе:</b>\n` +
        `🔸 <code>/onair</code> — Кто в эфире прямо сейчас\n` +
        `🔸 <code>/stats</code> — Ваша статистика\n` +
        `🔸 <code>/stats [ПОЗЫВНОЙ]</code> — Статистика радиолюбителя\n` +
        `🔸 <code>/park [РЕФЕРЕНЦИЯ]</code> — Инфо по парку\n\n` +
        `Для отправки спотов и управления подписками перейдите по кнопке ниже 👇`,
        { 
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '👉 Открыть личные сообщения 👈', url: `https://t.me/${ctx.botInfo.username}` }]]
          }
        }
      );
    } else {
      // Для новых пользователей в группе
      msg = await ctx.reply(
        `👋 Привет, ${username}!\n\n` +
        `📻 <b>Бот RU-POTA</b> — ваш помощник для работы с кластером POTA.\n\n` +
        `<b>Доступные команды:</b>\n` +
        `🔸 <code>/onair</code> — Кто в эфире прямо сейчас\n` +
        `🔸 <code>/stats [ПОЗЫВНОЙ]</code> — Статистика радиолюбителя\n` +
        `🔸 <code>/park [РЕФЕРЕНЦИЯ]</code> — Инфо по парку\n\n` +
        `Чтобы подписываться на споты нужного вам активатора либо самому отправлять споты, пройдите в личные сообщения 👇`, 
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '👉 Открыть личные сообщения 👈', url: `https://t.me/${ctx.botInfo.username}` }]]
          }
        }
      );
    }

    lastGroupStartMsgId = msg.message_id;

    // Авто-удаление сообщения через 2 минуты
    setTimeout(async () => {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id);
        if (lastGroupStartMsgId === msg.message_id) lastGroupStartMsgId = null;
      } catch (e) {}
    }, 2 * 60 * 1000);

    return;
  }

  // Define main menu keyboard
  const mainMenu = {
    keyboard: [
      [{ text: '📡 Управление спотами' }, { text: '📊 Моя статистика' }],
      [{ text: '🏞 Инфо по парку' }, { text: '🔍 Поиск позывного' }],
      [{ text: '🔔 Мои подписки' }, { text: '📻 Кто в эфире' }],
      [{ text: '❓ Справка' }]
    ],
    resize_keyboard: true
  };

  // Check startPayload for account linking or web login (e.g. /start link_abc123 or /start auth_xyz789 or /start login)
  const text = ctx.message?.text || '';
  const payload = ctx.startPayload || (text.includes(' ') ? text.split(' ')[1] : '');

  if (payload === 'login') {
    return loginHandler(ctx);
  }

  if (payload && payload.startsWith('auth_')) {
    const token = payload;
    const session = db.prepare('SELECT * FROM telegram_login_sessions WHERE token = ?').get(token);

    if (!session || Date.now() > session.expires_at) {
      return ctx.reply(
        '⚠️ <b>Срок действия сессии входа истёк или ссылка не найдена</b>\n\n' +
        'Пожалуйста, вернитесь на сайт pota.r9o.ru и нажмите кнопку входа заново, либо запросите код командой /login.',
        { parse_mode: 'HTML' }
      );
    }

    const userId = ctx.from.id;
    const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(userId);

    if (!user || !user.callsign) {
      return ctx.reply(
        '⚠️ <b>Вы ещё не зарегистрировали позывной в боте</b>\n\n' +
        'Чтобы войти на сайт под своим радиолюбительским профилем, сначала зарегистрируйтесь через /callsign.',
        { parse_mode: 'HTML' }
      );
    }

    // Generate 6-digit code as backup
    const code = String(crypto.randomInt(100000, 999999));

    db.prepare(`
      UPDATE telegram_login_sessions 
      SET telegram_id = ?, callsign = ?, code = ?, status = 'confirmed'
      WHERE token = ?
    `).run(userId, user.callsign, code, token);

    console.log(`\x1b[32m[Telegram Auth]\x1b[0m ✅ Подтверждён вход на сайт для ${user.callsign} (TG: ${userId}) через deep-link ${token}`);

    return ctx.reply(
      `🎉 <b>Вход на сайт pota.r9o.ru подтверждён!</b>\n\n` +
      `👤 Оператор: <b>${user.callsign}</b>\n` +
      `🆔 Telegram ID: <code>${userId}</code>\n\n` +
      `🌐 Страница в браузере обновится автоматически в течение пары секунд.\n` +
      `Если авто-вход не сработал, вы можете ввести одноразовый код вручную:\n👉 <code>${code}</code> 👈\n\n` +
      `73! До встречи в эфире 🌲📡`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🌐 Вернуться на сайт pota.r9o.ru', url: 'https://pota.r9o.ru' }]
          ]
        }
      }
    );
  }

  if (payload && payload.startsWith('link_')) {
    const token = payload;
    const linkRecord = db.prepare('SELECT * FROM telegram_link_tokens WHERE token = ?').get(token);

    if (linkRecord) {
      if (Date.now() > linkRecord.expires_at) {
        db.prepare('DELETE FROM telegram_link_tokens WHERE token = ?').run(token);
        return ctx.reply(
          '⚠️ <b>Срок действия ссылки истек</b>\n\nПожалуйста, запросите новую ссылку для привязки Telegram в личном кабинете на сайте <a href="https://pota.r9o.ru">pota.r9o.ru</a>.',
          { parse_mode: 'HTML' }
        );
      }

      const currentTgId = ctx.from.id;
      const webTgId = linkRecord.web_telegram_id;
      const callsign = linkRecord.callsign;

      // Check if currentTgId already exists in users
      const existingTgUser = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(currentTgId);
      const webUser = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(webTgId);

      if (existingTgUser) {
        // Link web user credentials to existing Telegram user
        db.prepare(`
          UPDATE users 
          SET web_token = COALESCE(?, web_token),
              email = COALESCE(?, email),
              callsign = COALESCE(users.callsign, ?),
              status = CASE WHEN users.status = 'approved' OR ? = 'approved' THEN 'approved' ELSE users.status END
          WHERE telegram_id = ?
        `).run(webUser?.web_token || null, webUser?.email || null, callsign, webUser?.status || 'pending', currentTgId);

        // Migrate subscriptions from webTgId to currentTgId
        if (webTgId !== currentTgId) {
          const webSubs = db.prepare('SELECT type, target, target_name FROM subscriptions WHERE telegram_id = ?').all(webTgId);
          for (const s of webSubs) {
            db.prepare(`
              INSERT INTO subscriptions (telegram_id, type, target, target_name)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(telegram_id, type, target) DO NOTHING
            `).run(currentTgId, s.type, s.target, s.target_name);
          }
          // Migrate user notifications
          db.prepare('UPDATE user_notifications SET user_id = ? WHERE user_id = ?').run(currentTgId, webTgId);
          // Clean up old temporary web user
          db.prepare('DELETE FROM users WHERE telegram_id = ?').run(webTgId);
        }
      } else {
        // Update web user row to the real telegram_id
        db.prepare(`
          UPDATE users
          SET telegram_id = ?
          WHERE telegram_id = ?
        `).run(currentTgId, webTgId);

        db.prepare('UPDATE subscriptions SET telegram_id = ? WHERE telegram_id = ?').run(currentTgId, webTgId);
        db.prepare('UPDATE user_notifications SET user_id = ? WHERE user_id = ?').run(currentTgId, webTgId);
      }

      // Delete token
      db.prepare('DELETE FROM telegram_link_tokens WHERE token = ?').run(token);

      console.log(`\x1b[32m[Telegram Link]\x1b[0m 🔗 Привязан Telegram ID ${currentTgId} к позывному ${callsign}`);

      return ctx.reply(
        `🎉 <b>Telegram успешно привязан!</b>\n\n` +
        `Ваш Telegram-аккаунт успешно связан с позывным <b>${callsign}</b>.\n` +
        `Теперь все персональные оповещения по подпискам на операторов и парки будут приходить сюда в ЛС!\n\n` +
        `Вы также можете управлять спотами и подписками через меню бота. 73! 🌲📡`,
        { parse_mode: 'HTML', reply_markup: mainMenu }
      );
    } else {
      return ctx.reply('⚠️ Ссылка привязки не найдена или уже была использована.', { parse_mode: 'HTML' });
    }
  }

  // Если это личные сообщения
  if (ctx.state.user) {
    const status = ctx.state.user.status;
    const reason = ctx.state.user.reject_reason || 'Причина не указана';
    if (status === 'approved') {
      return ctx.reply(
        `👋 Привет, ${username}! Я бот RU-POTA 🤖\n\n` +
        `✅ Ваш позывной в системе: <b>${ctx.state.user.callsign}</b>\n\n` +
        `<b>Ваши возможности:</b>\n` +
        `🔸 <code>/spot</code> (или кнопка) — Управление спотами\n` +
        `🔸 <code>/stats</code> — Ваша статистика (чужая: <code>/stats ПОЗЫВНОЙ</code>)\n` +
        `🔸 <code>/sub [ПОЗЫВНОЙ/ПАРК]</code> — Подписка на споты (напр. /sub R9OGL, /sub RU-0065)\n` +
        `🔸 <code>/park [РЕФЕРЕНЦИЯ]</code> — Инфо по парку\n` +
        `🔸 <code>/callsign</code> — Сменить позывной (при необходимости)\n` +
        `🔸 <code>/onair</code> (или кнопка) — Кто в эфире прямо сейчас\n` +
        `🔸 <code>/help</code> — Полная справка\n\n` +
        `Используйте меню ниже для быстрой работы:`,
        { parse_mode: 'HTML', reply_markup: mainMenu }
      );
    } else if (status === 'pending') {
      return ctx.reply(`⏳ Ваш позывной <b>${ctx.state.user.callsign}</b> находится на модерации. Ожидайте подтверждения!`, { parse_mode: 'HTML' });
    } else if (status === 'rejected') {
      return ctx.reply(
        `❌ Ваша заявка (позывной ${ctx.state.user.callsign}) была отклонена.\n\n` +
        `<b>Причина:</b> ${reason}\n\n` +
        `Вы можете подать повторную заявку. Для этого нажмите кнопку ниже.`,
        { 
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '📝 Подать заявку заново', callback_data: 'start_callsign' }]]
          }
        }
      );
    }
  }

  // Define unregistered user menu
  const unregisteredMenu = {
    keyboard: [
      [{ text: '📝 Регистрация' }, { text: '📊 Моя статистика' }],
      [{ text: '🏞 Инфо по парку' }, { text: '🔍 Поиск позывного' }],
      [{ text: '🔔 Мои подписки' }, { text: '📻 Кто в эфире' }],
      [{ text: '❓ Справка' }]
    ],
    resize_keyboard: true
  };

  // Новый пользователь
  return ctx.reply(
    `👋 Привет, ${username}! Я бот RU-POTA 🤖\n\n` +
    `Я помогаю радиолюбителям работать с кластером POTA.\n\n` +
    `<b>Доступные команды:</b>\n` +
    `🔸 <code>/stats [ПОЗЫВНОЙ]</code> — Статистика радиолюбителя\n` +
    `🔸 <code>/sub [ПОЗЫВНОЙ/ПАРК]</code> — Подписка на споты (напр. /sub R9OGL, /sub RU-0065)\n` +
    `🔸 <code>/park [РЕФЕРЕНЦИЯ]</code> — Инфо по парку\n` +
    `🔸 <code>/callsign</code> — Зарегистрировать позывной\n` +
    `🔸 <code>/onair</code> (или кнопка) — Кто в эфире прямо сейчас\n` +
    `🔸 <code>/help</code> — Полная справка\n\n` +
    `Чтобы получить доступ к <b>отправке спотов</b>, необходимо зарегистрировать свой радиолюбительский позывной.`,
    {
      parse_mode: 'HTML',
      reply_markup: unregisteredMenu
    }
  );
};

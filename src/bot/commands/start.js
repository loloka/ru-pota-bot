import { deleteUserMessage, replyWithAutoDelete } from '../utils.js';

export const startHandler = async (ctx) => {
  const isPrivate = ctx.chat?.type === 'private';
  const username = ctx.from?.first_name || ctx.from?.username || 'Пользователь';

  // Если это публичная группа / канал
  if (!isPrivate) {
    await deleteUserMessage(ctx);
    
    // Если пользователь уже зарегистрирован
    if (ctx.state.user && ctx.state.user.status === 'approved') {
      return ctx.reply(
        `👋 Привет, ${username}! Вы зарегистрированы как <b>${ctx.state.user.callsign}</b>.\n\n` +
        `<b>Доступные команды в группе:</b>\n` +
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
    }
    
    // Для новых пользователей в группе
    return ctx.reply(
      `👋 Привет, ${username}!\n\n` +
      `📻 <b>Бот RU-POTA</b> — ваш помощник для работы с кластером POTA.\n\n` +
      `<b>Доступные команды:</b>\n` +
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

  // Define main menu keyboard
  const mainMenu = {
    keyboard: [
      [{ text: '📡 Управление спотами' }, { text: '📊 Моя статистика' }],
      [{ text: '🏞 Инфо по парку' }, { text: '🔔 Мои подписки' }],
      [{ text: '❓ Справка' }]
    ],
    resize_keyboard: true
  };

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
        `🔸 <code>/stats</code> — Ваша статистика\n` +
        `🔸 <code>/sub</code> — Подписка на споты (друга/активатора)\n` +
        `🔸 <code>/park [РЕФЕРЕНЦИЯ]</code> — Инфо по парку\n\n` +
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
      [{ text: '📝 Регистрация' }, { text: '🔔 Мои подписки' }],
      [{ text: '📊 Моя статистика' }, { text: '🏞 Инфо по парку' }],
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
    `🔸 <code>/sub</code> — Подписка на споты (друга/активатора)\n` +
    `🔸 <code>/park [РЕФЕРЕНЦИЯ]</code> — Инфо по парку\n` +
    `🔸 <code>/callsign</code> — Зарегистрировать позывной\n\n` +
    `Чтобы получить доступ к <b>отправке спотов</b>, необходимо зарегистрировать свой радиолюбительский позывной.`,
    {
      parse_mode: 'HTML',
      reply_markup: unregisteredMenu
    }
  );
};

export const deleteUserMessage = async (ctx) => {
  if (ctx.chat?.type !== 'private' && ctx.message?.message_id) {
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id);
    } catch (e) {
      console.error('Failed to delete user message:', e.description || e.message);
    }
  }
};

export const replyWithAutoDelete = async (ctx, text, options = {}, delayMs = 7000) => {
  let opts = options;
  let delay = delayMs;

  if (typeof options === 'number') {
    delay = options < 1000 ? options * 1000 : options;
    opts = { parse_mode: 'HTML' };
  } else if (typeof options === 'object' && options !== null) {
    if (!opts.parse_mode) {
      opts = { parse_mode: 'HTML', ...opts };
    }
  }

  try {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const msg = await ctx.telegram.sendMessage(chatId, text, opts);
    if (ctx.chat?.type !== 'private') {
      setTimeout(async () => {
        try {
          await ctx.telegram.deleteMessage(chatId, msg.message_id);
        } catch (e) {} // Ignore errors
      }, delay);
    }
    return msg;
  } catch (e) {
    console.error('Failed to reply with auto delete:', e.message || e);
  }
};

import db from '../db/database.js';

export const getMainMenu = (ctx) => {
  let user = ctx.state?.user;
  if (!user && ctx.from?.id) {
    try {
      user = db.prepare('SELECT callsign, status FROM users WHERE telegram_id = ?').get(ctx.from.id);
    } catch (e) {}
  }

  if (user && user.status === 'approved') {
    return {
      keyboard: [
        [{ text: '📡 Управление спотами' }, { text: '📊 Моя статистика' }],
        [{ text: '🏞 Инфо по парку' }, { text: '🔍 Поиск позывного' }],
        [{ text: '🔔 Мои подписки' }, { text: '📻 Кто в эфире' }],
        [{ text: '❓ Справка' }]
      ],
      resize_keyboard: true
    };
  }
  return {
    keyboard: [
      [{ text: '📝 Регистрация' }, { text: '📊 Моя статистика' }],
      [{ text: '🏞 Инфо по парку' }, { text: '🔍 Поиск позывного' }],
      [{ text: '🔔 Мои подписки' }, { text: '📻 Кто в эфире' }],
      [{ text: '❓ Справка' }]
    ],
    resize_keyboard: true
  };
};

/**
 * Extracts base callsign from slashed callsigns (e.g., UN7ECA/P -> UN7ECA, R1/UN7ECA/P -> UN7ECA, RA/OH2XYZ -> OH2XYZ)
 * so profile links lead to the correct user page on next.pota.app.
 * @param {string} callsign 
 * @returns {string} Base callsign
 */
export const getBaseCallsign = (callsign = '') => {
  if (!callsign) return '';
  const clean = String(callsign).trim().toUpperCase();
  if (!clean.includes('/')) return clean;
  const parts = clean.split('/');
  const validParts = parts.filter(p => /[A-Z]/.test(p) && /[0-9]/.test(p));
  if (validParts.length > 0) {
    return validParts.reduce((a, b) => a.length >= b.length ? a : b);
  }
  return parts.reduce((a, b) => a.length >= b.length ? a : b);
};

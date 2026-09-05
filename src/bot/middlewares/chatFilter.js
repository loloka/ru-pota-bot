import dotenv from 'dotenv';
import db from '../../db/database.js';
import { deleteUserMessage, replyWithAutoDelete } from '../utils.js';

dotenv.config();

const ACTIVITY_CHANNEL_ID = process.env.ACTIVITY_CHANNEL_ID;
const MAIN_CHAT_ID = process.env.MAIN_CHAT_ID;

/**
 * Normalizes numeric Telegram chat IDs to ensure matching with or without -100 prefix
 */
export const normalizeChatId = (id) => {
  if (!id) return '';
  let str = String(id).trim();
  if (/^-?\d+$/.test(str)) {
    if (str.startsWith('-100')) return str;
    if (str.startsWith('-')) return `-100${str.substring(1)}`;
    return `-100${str}`;
  }
  return str;
};

/**
 * Middleware to filter and route messages based on chat ID
 */
export const chatFilter = (ctx, next) => {
  const chatId = ctx.chat?.id?.toString();
  const normalizedChatId = normalizeChatId(chatId);
  const normalizedActivityId = normalizeChatId(ACTIVITY_CHANNEL_ID);
  const normalizedMainChatId = normalizeChatId(MAIN_CHAT_ID);

  // Ignore all messages from the activity channel
  if (normalizedActivityId && normalizedChatId === normalizedActivityId) {
    return;
  }

  // Attach context flags
  ctx.state.isMainChat = !!(normalizedMainChatId && normalizedChatId === normalizedMainChatId);
  ctx.state.isPrivate = ctx.chat?.type === 'private';
  
  return next();
};

/**
 * Middleware to ensure the user is registered (has callsign)
 */
export const requireRegistration = async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  const stmt = db.prepare('SELECT callsign, status, reject_reason FROM users WHERE telegram_id = ?');
  const user = stmt.get(userId);

  if (user) {
    ctx.state.user = user;
    return next();
  }

  // User is not registered; only intercept specific commands if needed
  if (ctx.message?.text?.startsWith('/')) {
    const rawCommand = ctx.message.text.split(' ')[0];
    const command = rawCommand.split('@')[0];
    if (command === '/spot') {
      if (ctx.chat?.type !== 'private') {
        await deleteUserMessage(ctx);
        await replyWithAutoDelete(ctx, '⚠️ Сначала зарегистрируйте свой позывной в личных сообщениях: /callsign 👇', {
          reply_markup: {
            inline_keyboard: [[{ text: '👉 Открыть личные сообщения 👈', url: `https://t.me/${ctx.botInfo.username}` }]]
          }
        });
      } else {
        await ctx.reply('⚠️ Сначала зарегистрируйте свой позывной: /callsign');
      }
      return;
    }
  }
  
  return next();
};

/**
 * Middleware to delete system messages (e.g. "User joined group")
 */
export const deleteSystemMessages = async (ctx, next) => {
  if (ctx.message?.new_chat_members || ctx.message?.left_chat_member) {
    try {
      await ctx.deleteMessage();
    } catch (e) {
      console.error('Failed to delete system message:', e.message);
    }
  }
  return next();
};

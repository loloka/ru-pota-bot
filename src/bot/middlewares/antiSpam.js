import db from '../../db/database.js';
import { replyWithAutoDelete } from '../utils.js';
import { normalizeChatId } from './chatFilter.js';
import dotenv from 'dotenv';

dotenv.config();

// Configuration & Environment Variables with safe defaults
const getShieldConfig = () => ({
  enabled: process.env.SHIELD_ENABLED !== 'false',
  captchaTimeoutSec: parseInt(process.env.SHIELD_CAPTCHA_TIMEOUT, 10) || 120,
  strictNameCheck: process.env.SHIELD_STRICT_NAME_CHECK !== 'false',
  blockNewbieLinks: process.env.SHIELD_BLOCK_NEWBIE_LINKS !== 'false',
  mainChatId: process.env.MAIN_CHAT_ID,
  activityChannelId: process.env.ACTIVITY_CHANNEL_ID,
  adminId: process.env.ADMIN_ID
});

// Regular expressions for Echelon 1: Profile Face-Control
export const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
export const ASIAN_REGEX = /[\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u30FF\uAC00-\uD7AF]/;

// Stop-words in profile names (case-insensitive)
export const NAME_STOP_WORDS = [
  'crypto', 'крипт', 'инвест', 'заработ', 'трейдинг', 'сигнал',
  'доход', 'акци', 'poker', 'casino', 'казино', '18+',
  'dating', 'girls', 'знакомств', 'порно', 'виагра', 'взлом'
];

// Regular expressions for Echelon 4: Scam stop-phrases
export const SCAM_PATTERNS = [
  /(?:требуются|ищ[уем]|набор)\s+(?:сотрудник|курьер|девушек|людей|водител|модератор)/iu,
  /(?:заработок|доход|выплат[аы]|оплат[аы])\s+(?:от\s+)?\d+/iu,
  /(?:пассивный\s+доход|криптовалют|сигнал[ы]?\s+на\s+|трейдинг|схем[ыа]\s+заработка|арбитраж\s+крипт)/iu,
  /(?:переходи\s+по\s+ссылк|подпишись\s+на\s+канал|пиши\s+в\s+лс|в\s+закрепленн\w+|ссылка\s+в\s+профил\w+)/iu,
  /(?:удаленн\w+\s+работ\w+|работа\s+на\s+дому)\s*(?:от|:|-|\d)/iu,
  /(?:мефедрон|гашиш|бошки|шишки|соли|закладк\w+|нарко\w+)/iu,
  /(?:18\+|порно\s*видео|секс\s*чат|интим\s*знакомств)/iu
];

// In-memory store for pending captchas: Map<userId, { timer, messageId, chatId, member }>
export const pendingCaptchas = new Map();

/**
 * Escapes characters for Telegram HTML parse mode
 */
export const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

/**
 * Determines if the context belongs to the target moderated chat (MAIN_CHAT_ID)
 */
export const isTargetChat = (ctx) => {
  if (!ctx.chat) return false;
  if (ctx.chat.type === 'private' || ctx.chat.type === 'channel') return false;

  const cfg = getShieldConfig();
  const currentChatId = normalizeChatId(ctx.chat.id);
  const mainChatId = normalizeChatId(cfg.mainChatId);
  const activityChannelId = normalizeChatId(cfg.activityChannelId);

  // Exclude activity channel
  if (activityChannelId && currentChatId === activityChannelId) {
    return false;
  }
  // Match main chat if configured
  if (mainChatId) {
    return currentChatId === mainChatId;
  }
  // Fallback to any group/supergroup if MAIN_CHAT_ID is not configured
  return ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
};

/**
 * Checks if user is an approved radio amateur in the SQLite database
 */
export const isUserApproved = (userId) => {
  if (!userId) return false;
  try {
    const row = db.prepare('SELECT status FROM users WHERE telegram_id = ?').get(userId);
    return row && row.status === 'approved';
  } catch (err) {
    return false;
  }
};

/**
 * Checks if user is an admin in the chat or matches ADMIN_ID
 */
export const isUserAdmin = async (ctx, userId) => {
  if (!userId) return false;
  const cfg = getShieldConfig();
  if (cfg.adminId && userId.toString() === cfg.adminId.toString()) {
    return true;
  }
  try {
    const member = await ctx.getChatMember(userId);
    return ['creator', 'administrator'].includes(member.status);
  } catch (err) {
    return false;
  }
};

/**
 * Checks if user was previously banned in RU-POTA Shield
 */
export const isUserBlockedInDb = (telegramId) => {
  if (!telegramId) return false;
  try {
    const row = db.prepare('SELECT id FROM blocked_users WHERE telegram_id = ? AND action = ? LIMIT 1').get(telegramId, 'banned');
    return !!row;
  } catch (err) {
    return false;
  }
};

/**
 * Logs a blocked or kicked user to SQLite database for audit and Web Admin display
 */
export const logBlockedUser = ({ telegramId, firstName, lastName, username, reason, details, action }) => {
  try {
    db.prepare(`
      INSERT INTO blocked_users (telegram_id, first_name, last_name, username, reason, details, action)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      telegramId,
      firstName || null,
      lastName || null,
      username || null,
      reason,
      details ? String(details).substring(0, 300) : null,
      action
    );
  } catch (err) {
    console.error('[Shield DB] Ошибка сохранения записи блокировки:', err.message);
  }
};

/**
 * Echelon 1: Profile Face-Control
 * Returns { isSpam: boolean, reason?: string, details?: string }
 */
export const checkProfile = (user) => {
  if (!user) return { isSpam: false };

  const firstName = user.first_name || '';
  const lastName = user.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim();
  const username = user.username || '';
  const lowerName = fullName.toLowerCase();
  const lowerUser = username.toLowerCase();

  // 1. Script checks (Arabic / Farsi / Urdu)
  if (ARABIC_REGEX.test(fullName) || ARABIC_REGEX.test(username)) {
    return {
      isSpam: true,
      reason: 'Арабская вязь в профиле',
      details: fullName || username
    };
  }

  // 2. Script checks (Chinese / Japanese / Korean glyphs)
  if (ASIAN_REGEX.test(fullName) || ASIAN_REGEX.test(username)) {
    return {
      isSpam: true,
      reason: 'Азиатские иероглифы в профиле',
      details: fullName || username
    };
  }

  // 3. Links in first name or last name
  const hasLinkInName = /(?:https?:\/\/|t\.me\/|telegram\.me\/)/i.test(fullName);
  if (hasLinkInName) {
    return {
      isSpam: true,
      reason: 'Ссылка в имени профиля',
      details: fullName
    };
  }

  // 4. Standalone '@' handle advertising in name/surname
  if (firstName.includes('@') || lastName.includes('@')) {
    return {
      isSpam: true,
      reason: 'Упоминание @канала/бота в имени',
      details: fullName
    };
  }

  // 5. Commercial / scam stop-words in name or username
  for (const word of NAME_STOP_WORDS) {
    if (lowerName.includes(word) || lowerUser.includes(word)) {
      return {
        isSpam: true,
        reason: `Стоп-слово в профиле («${word}»)`,
        details: fullName || username
      };
    }
  }

  return { isSpam: false };
};

/**
 * Handler for 'new_chat_members' event
 */
export const handleNewChatMembers = async (ctx) => {
  if (!isTargetChat(ctx)) return;

  const cfg = getShieldConfig();
  if (!cfg.enabled) return;

  // Always delete the Telegram service join message to keep chat spotless
  try {
    await ctx.deleteMessage();
  } catch (e) {}

  const newMembers = (ctx.message?.new_chat_members || []).filter(m => !m.is_bot);
  if (newMembers.length === 0) return;

  for (const member of newMembers) {
    const fullName = [member.first_name, member.last_name].filter(Boolean).join(' ');
    const fromUser = member.username ? `@${member.username}` : fullName;

    console.log(`\x1b[35m[Shield]\x1b[0m 👤 Вход участника: ${fromUser} (ID: ${member.id}) в чат "${ctx.chat?.title || ctx.chat?.id}"`);

    // Fast check: Is user already marked as banned in our database?
    if (isUserBlockedInDb(member.id)) {
      try {
        await ctx.banChatMember(member.id);
        console.log(`\x1b[31m[Shield]\x1b[0m 🚫 Повторный вход заблокированного пользователя: ${fromUser} (ID: ${member.id})`);
      } catch (e) {}
      continue;
    }

    // Echelon 1: Profile Face-Control
    if (cfg.strictNameCheck) {
      const check = checkProfile(member);
      if (check.isSpam) {
        try {
          await ctx.banChatMember(member.id);
          logBlockedUser({
            telegramId: member.id,
            firstName: member.first_name,
            lastName: member.last_name,
            username: member.username,
            reason: 'profile_face_control',
            details: `${check.reason}: ${check.details}`,
            action: 'banned'
          });
          console.log(`\x1b[31m[Shield]\x1b[0m 🚫 Спам-аккаунт заблокирован на входе: ${fromUser} (ID: ${member.id}) [${check.reason}]`);

          // Brief auto-deleting notice in chat (10s) so admins/chat see shield in action without chat clutter
          await replyWithAutoDelete(
            ctx,
            `🛡️ <b>RU-POTA Shield:</b> Пользователь ${escapeHtml(fullName)} заблокирован (подозрение на спам-бота).`,
            { parse_mode: 'HTML' },
            10000
          );
        } catch (err) {
          console.error(`[Shield] Ошибка при бане спам-аккаунта (${member.id}):`, err.message);
        }
        continue; // Do not process captcha for banned user
      }
    }

    // Whitelist ("Зелёный коридор"): approved radio amateurs & chat admins
    const isApproved = isUserApproved(member.id);
    const isAdmin = await isUserAdmin(ctx, member.id);

    if (isAdmin) {
      console.log(`\x1b[32m[Shield]\x1b[0m 👑 Участник ${fromUser} (ID: ${member.id}) является администратором группы (Зелёный коридор)`);
      continue;
    }

    if (isApproved) {
      console.log(`\x1b[32m[Shield]\x1b[0m 🌲 Вход радиолюбителя с позывным (Зелёный коридор): ${fromUser} (ID: ${member.id})`);
      const ham = db.prepare('SELECT callsign FROM users WHERE telegram_id = ?').get(member.id);
      const callsignBadge = ham?.callsign ? ` (<b>${escapeHtml(ham.callsign)}</b>)` : '';
      const name = escapeHtml(member.first_name || 'радиолюбитель');

      const approvedWelcome = 
        `👋 Приветствуем, <b>${name}</b>${callsignBadge}! Рады видеть вас в сообществе RU-POTA 🌲\n\n` +
        `📱 Вам доступно наше мини-приложение: <a href="https://t.me/ru_pota_bot/app"><b>t.me/ru_pota_bot/app</b></a>\n\n` +
        `🤖 <b>Доступные команды в группе:</b>\n` +
        `🔸 <code>/stats ПОЗЫВНОЙ</code> — узнать статистику об охотнике / активаторе\n` +
        `🔸 <code>/park РЕФЕРЕНЦИЯ</code> — узнать информацию о парке\n` +
        `🔸 <code>/onair</code> — кто сейчас на связи\n\n` +
        `Приятного общения и удачных активаций! 73/44!`;

      await replyWithAutoDelete(
        ctx,
        approvedWelcome,
        {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{ text: '🌲 Открыть RU-POTA Hub', url: 'https://t.me/ru_pota_bot/app' }]
            ]
          }
        },
        45000
      );
      continue;
    }

    // Echelon 2: Interactive Smart Captcha for newcomers
    console.log(`\x1b[33m[Shield]\x1b[0m ⏳ Новичок без позывного: ${fromUser} (ID: ${member.id}) -> Наложение mute и отправка капчи...`);

    try {
      // 1. Restrict new member (read-only mode)
      try {
        await ctx.restrictChatMember(member.id, {
          permissions: {
            can_send_messages: false
          }
        });
      } catch (restErr) {
        console.error(`\x1b[31m[Shield]\x1b[0m ❌ Ошибка restrictChatMember (${member.id}): ${restErr.message}. Проверьте, что бот назначен администратором группы с правом блокировки пользователей!`);
      }

      // 2. Send captcha message with inline button
      const timeoutSec = cfg.captchaTimeoutSec;
      const text = `👋 Привет, <b>${escapeHtml(member.first_name)}</b>! Добро пожаловать в сообщество RU-POTA 🌲\n\nЧтобы подтвердить, что вы радиолюбитель, а не бот, нажмите кнопку ниже в течение ${timeoutSec} секунд:`;
      const captchaMsg = await ctx.reply(text, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🌲 Я радиолюбитель / Я не бот', callback_data: `shield_verify:${member.id}` }]
          ]
        }
      });

      // 3. Set up timeout timer in memory
      const timer = setTimeout(async () => {
        try {
          // Delete captcha message
          await ctx.telegram.deleteMessage(ctx.chat.id, captchaMsg.message_id).catch(() => {});

          // Soft kick (banChatMember + unbanChatMember so user can rejoin later)
          await ctx.telegram.banChatMember(ctx.chat.id, member.id);
          await ctx.telegram.unbanChatMember(ctx.chat.id, member.id);

          logBlockedUser({
            telegramId: member.id,
            firstName: member.first_name,
            lastName: member.last_name,
            username: member.username,
            reason: 'captcha_timeout',
            details: `Не нажал кнопку подтверждения за ${timeoutSec}с`,
            action: 'kicked'
          });

          console.log(`\x1b[33m[Shield]\x1b[0m ⏱️ Кик по таймауту капчи: ${fromUser} (ID: ${member.id})`);
        } catch (err) {
          console.error(`[Shield] Ошибка при кике по таймауту капчи (${member.id}):`, err.message);
        } finally {
          pendingCaptchas.delete(member.id);
        }
      }, timeoutSec * 1000);

      pendingCaptchas.set(member.id, {
        timer,
        messageId: captchaMsg.message_id,
        chatId: ctx.chat.id,
        member
      });
    } catch (err) {
      console.error(`[Shield] Ошибка настройки капчи для ${member.id}:`, err.message);
    }
  }
};

/**
 * Action handler for callback query 'shield_verify:<userId>'
 */
export const handleShieldVerify = async (ctx) => {
  const targetUserId = parseInt(ctx.match[1], 10);
  const clickerId = ctx.from?.id;

  // Protect against other chat members clicking the button
  if (clickerId !== targetUserId) {
    return ctx.answerCbQuery('⚠️ Эта кнопка предназначена для другого участника.', { show_alert: true });
  }

  // Clear pending timer
  const pending = pendingCaptchas.get(targetUserId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingCaptchas.delete(targetUserId);
  }

  // Unrestrict chat member (restore standard chat permissions)
  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, targetUserId, {
      permissions: {
        can_send_messages: true,
        can_send_media_messages: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true
      }
    });
  } catch (err) {
    console.error(`[Shield] Ошибка снятия ограничений для (${targetUserId}):`, err.message);
  }

  // Delete captcha message from chat to keep it clean
  try {
    await ctx.deleteMessage();
  } catch (e) {}

  // Friendly alert for successful verification
  await ctx.answerCbQuery('🌲 Добро пожаловать в RU-POTA! Приятного общения и 73/44!', { show_alert: true });

  const fromUser = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  console.log(`\x1b[32m[Shield]\x1b[0m ✅ Капча успешно пройдена: ${fromUser} (ID: ${targetUserId})`);

  // Post welcoming and onboarding message in chat for the verified newcomer (auto-delete after 30s)
  try {
    const ham = db.prepare('SELECT callsign, status FROM users WHERE telegram_id = ?').get(targetUserId);
    const welcomeName = escapeHtml(ctx.from.first_name || 'радиолюбитель');

    let welcomeText = '';
    if (ham?.callsign && ham.status === 'approved') {
      welcomeText = 
        `🌲 Добро пожаловать в RU-POTA, <b>${welcomeName}</b> (<b>${escapeHtml(ham.callsign)}</b>)!\n\n` +
        `📱 Вам доступно наше мини-приложение: <a href="https://t.me/ru_pota_bot/app"><b>t.me/ru_pota_bot/app</b></a>\n\n` +
        `🤖 <b>Доступные вам команды в группе:</b>\n` +
        `🔸 <code>/stats ПОЗЫВНОЙ</code> — узнать статистику об охотнике / активаторе\n` +
        `🔸 <code>/park РЕФЕРЕНЦИЯ</code> — узнать информацию о парке\n` +
        `🔸 <code>/onair</code> — кто сейчас на связи\n\n` +
        `Приятного общения и удачных активаций! 73/44!`;
    } else if (ham?.callsign && ham.status === 'pending') {
      welcomeText = 
        `🌲 Рады приветствовать в сообществе RU-POTA, <b>${welcomeName}</b>!\n` +
        `<i>Ваш позывной <b>${escapeHtml(ham.callsign)}</b> находится на проверке у координатора.</i>\n\n` +
        `📱 Вам доступно наше мини-приложение: <a href="https://t.me/ru_pota_bot/app"><b>t.me/ru_pota_bot/app</b></a>\n\n` +
        `🤖 <b>Доступные вам команды в группе:</b>\n` +
        `🔸 <code>/stats ПОЗЫВНОЙ</code> — узнать статистику об охотнике / активаторе\n` +
        `🔸 <code>/park РЕФЕРЕНЦИЯ</code> — узнать информацию о парке\n` +
        `🔸 <code>/onair</code> — кто сейчас на связи\n\n` +
        `Приятного общения и 73/44!`;
    } else {
      welcomeText = 
        `🌲 Рады приветствовать в сообществе RU-POTA, <b>${welcomeName}</b>!\n\n` +
        `📱 Вам доступно наше мини-приложение: <a href="https://t.me/ru_pota_bot/app"><b>t.me/ru_pota_bot/app</b></a>\n\n` +
        `🤖 <b>Доступные вам команды в группе:</b>\n` +
        `🔸 <code>/stats ПОЗЫВНОЙ</code> — узнать статистику об охотнике / активаторе\n` +
        `🔸 <code>/park РЕФЕРЕНЦИЯ</code> — узнать информацию о парке\n` +
        `🔸 <code>/onair</code> — кто сейчас на связи\n\n` +
        `📻 <i>Если вы радиолюбитель, зарегистрируйте свой позывной в личных сообщениях боту @ru_pota_bot — это снимет ограничения новичка на отправку ссылок и откроет отправку спотов!</i>\n\n` +
        `Желаем приятного общения и 73/44!`;
    }

    await replyWithAutoDelete(
      ctx,
      welcomeText,
      {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🌲 Открыть RU-POTA Hub', url: 'https://t.me/ru_pota_bot/app' },
              { text: '🤖 Личка бота', url: 'https://t.me/ru_pota_bot' }
            ]
          ]
        }
      },
      60000
    );
  } catch (wErr) {
    console.error(`[Shield] Ошибка отправки приветственного сообщения (${targetUserId}):`, wErr.message);
  }
};

/**
 * Handler for 'left_chat_member' event
 */
export const handleLeftChatMember = async (ctx) => {
  if (!isTargetChat(ctx)) return;

  // Always delete the Telegram service leave message
  try {
    await ctx.deleteMessage();
  } catch (e) {}

  const leftMember = ctx.message?.left_chat_member;
  if (!leftMember) return;

  // If user left while captcha was pending, clear timer and delete captcha message
  if (pendingCaptchas.has(leftMember.id)) {
    const pending = pendingCaptchas.get(leftMember.id);
    clearTimeout(pending.timer);
    try {
      await ctx.telegram.deleteMessage(pending.chatId, pending.messageId);
    } catch (e) {}
    pendingCaptchas.delete(leftMember.id);
  }
};

/**
 * Middleware: Message filtering (Echelon 3 Sandbox & Echelon 4 Scam Filter)
 */
export const shieldMessageGuard = async (ctx, next) => {
  // Only apply to messages in the target moderated chat
  if (!isTargetChat(ctx)) {
    return next();
  }

  const cfg = getShieldConfig();
  if (!cfg.enabled) {
    return next();
  }

  const msg = ctx.message;
  if (!msg) {
    return next();
  }

  const userId = ctx.from?.id;
  if (!userId) {
    return next();
  }

  // Never touch Telegram service notifications, anonymous admin, or linked channel forwards
  if (
    userId === 777000 ||
    userId === 1087968824 ||
    ctx.from?.is_bot ||
    msg.is_automatic_forward ||
    (msg.sender_chat && ctx.chat?.id === msg.sender_chat.id)
  ) {
    return next();
  }

  // Admins and Bot Owner are always exempt
  const isAdmin = await isUserAdmin(ctx, userId);
  if (isAdmin) {
    return next();
  }

  const text = msg.text || msg.caption || '';
  const entities = msg.entities || msg.caption_entities || [];
  const fromUser = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || userId);

  // Echelon 4: Stop-Words / Scam Filter
  let scamMatch = null;
  for (const pattern of SCAM_PATTERNS) {
    if (pattern.test(text)) {
      scamMatch = pattern.toString();
      break;
    }
  }

  if (scamMatch) {
    try {
      // 1. Delete scam message immediately
      await ctx.deleteMessage();

      // 2. Ban spammer
      await ctx.banChatMember(userId);

      logBlockedUser({
        telegramId: userId,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
        username: ctx.from.username,
        reason: 'scam_words',
        details: text.substring(0, 150),
        action: 'banned'
      });

      console.log(`\x1b[31m[Shield]\x1b[0m 🚫 Обнаружен скам-текст! Спамер заблокирован: ${fromUser} (ID: ${userId}) [Паттерн: ${scamMatch}]`);

      // 3. Temporary auto-deleting warning in chat (10s)
      await replyWithAutoDelete(
        ctx,
        `🛡️ <b>RU-POTA Shield:</b> Сообщение удалено, пользователь ${escapeHtml(fromUser)} заблокирован за спам.`,
        { parse_mode: 'HTML' },
        10000
      );
    } catch (err) {
      console.error(`[Shield] Ошибка обработки скам-сообщения (${userId}):`, err.message);
    }
    return; // Stop middleware chain
  }

  // Echelon 3: Sandbox Links Guard for newcomers without an approved callsign
  const isApproved = isUserApproved(userId);
  if (!isApproved && cfg.blockNewbieLinks) {
    const hasUrlEntity = entities.some(e => e.type === 'url' || e.type === 'text_link');
    const hasRawLink = /(?:https?:\/\/|t\.me\/|telegram\.me\/)/i.test(text);
    const isForward = !!(msg.forward_from || msg.forward_from_chat || msg.forward_sender_name || msg.forward_date);
    
    // Check channel mentions: e.g. @somechannel (allow @ru_pota_bot or bot's own username)
    const botUsername = (ctx.botInfo?.username || 'ru_pota_bot').toLowerCase();
    const hasChannelMention = entities.some(e => {
      if (e.type === 'mention') {
        const mentionText = text.substring(e.offset, e.offset + e.length).toLowerCase().replace('@', '');
        return mentionText !== botUsername;
      }
      return false;
    });

    if (hasUrlEntity || hasRawLink || isForward || hasChannelMention) {
      try {
        await ctx.deleteMessage();

        logBlockedUser({
          telegramId: userId,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
          username: ctx.from.username,
          reason: 'newbie_link',
          details: `Попытка отправки ссылки/пересылки без позывного: ${text.substring(0, 100)}`,
          action: 'warned'
        });

        console.log(`\x1b[33m[Shield]\x1b[0m ⚠️ Ссылка/пересылка от новичка без позывного заблокирована: ${fromUser} (ID: ${userId})`);

        const warnText = `⚠️ В целях защиты от спама отправка внешних ссылок и пересылка постов новичками ограничена. Зарегистрируйте ваш позывной через бота @${botUsername}.`;
        await replyWithAutoDelete(ctx, warnText, {}, 15000);
      } catch (err) {
        console.error(`[Shield] Ошибка карантина ссылок (${userId}):`, err.message);
      }
      return; // Stop middleware chain
    }
  }

  return next();
};

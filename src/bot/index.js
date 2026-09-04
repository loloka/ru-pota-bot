import { Telegraf, Scenes, session } from 'telegraf';
import dotenv from 'dotenv';
import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'https';
import db from '../db/database.js';


// Import middlewares
import { chatFilter, requireRegistration, deleteSystemMessages } from './middlewares/chatFilter.js';
import { rateLimit } from './middlewares/rateLimit.js';

// Import command handlers
import { callsignHandler } from './commands/callsign.js';
import { statsHandler } from './commands/stats.js';
import { subHandler, getSubsKeyboard, getDeleteSubsKeyboard } from './commands/sub.js';
import { banHandler, muteHandler, kickHandler } from './commands/mod.js';
import { onairHandler, onairActionHandler } from './commands/onair.js';

// Import scenes
import { spotWizard } from './scenes/spotWizard.js';
import { callsignWizard } from './scenes/callsignWizard.js';
import { parkWizard } from './scenes/parkWizard.js';
import { editSpotWizard } from './scenes/editSpotWizard.js';
import { subWizard } from './scenes/subWizard.js';
import { statsWizard } from './scenes/statsWizard.js';

// Import background workers
import { startClusterWorker } from '../services/clusterWorker.js';
import { pinManager, isChannelChat } from '../services/pinManager.js';

// Import admin server
import { startAdminServer } from '../web/admin.js';
import { WELCOME_PINNED_POST } from './texts/welcomePost.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // fallback to cwd


const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('FATAL: BOT_TOKEN is not defined in environment variables.');
  process.exit(1);
}

const telegrafOptions = {};

// 1. HTTP Proxy via apiRoot (Cloudflare Worker)
if (process.env.TG_API_ROOT) {
  telegrafOptions.telegram = { 
    apiRoot: process.env.TG_API_ROOT,
    agent: new https.Agent({ keepAlive: true }) // Reuse TCP connection to bypass provider SYN throttling!
  };
} 
// 2. SOCKS5 Proxy (VLESS / Tor)
else if (process.env.TG_PROXY) {
  telegrafOptions.telegram = { agent: new SocksProxyAgent(process.env.TG_PROXY) };
}

const bot = new Telegraf(BOT_TOKEN, telegrafOptions);

// Global middlewares BEFORE scenes
bot.use(chatFilter);
bot.use(deleteSystemMessages);
bot.use(requireRegistration);

// Configure scenes and sessions
const stage = new Scenes.Stage([spotWizard, callsignWizard, parkWizard, editSpotWizard, subWizard, statsWizard]);
bot.use(session());
bot.use(rateLimit({ window: 5000, limit: 4 }));
bot.action(/^admin_appr:(\d+)$/, async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const targetId = parseInt(ctx.match[1], 10);
  
  try {
    const db = (await import('../db/database.js')).default;
    const user = db.prepare('SELECT callsign, status FROM users WHERE telegram_id = ?').get(targetId);
    if (!user) return ctx.answerCbQuery('Пользователь не найден!');

    if (user.status !== 'pending') {
      await ctx.editMessageText(
        ctx.callbackQuery.message.text + `\n\nℹ️ <b>Уже обработано (статус: ${user.status})</b>`,
        { parse_mode: 'HTML', reply_markup: undefined }
      );
      return ctx.answerCbQuery('Заявка уже была обработана ранее!');
    }

    db.prepare('UPDATE users SET status = ? WHERE telegram_id = ?').run('approved', targetId);
    
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + `\n\n✅ <b>ОДОБРЕНО</b>`,
      { parse_mode: 'HTML', reply_markup: undefined }
    );
    
    await ctx.telegram.sendMessage(
      targetId,
      `🎉 Ваш аккаунт подтвержден. Спасибо что вы с нами :)\nТеперь у вас есть возможность отправлять споты в наш канал и кластер POTA!\n\nНажмите /start чтобы обновить меню.`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {
    console.error(e);
    await ctx.answerCbQuery('Ошибка', { show_alert: true });
  }
});

bot.action(/^admin_rej:(\d+)$/, async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const targetId = parseInt(ctx.match[1], 10);
  
  try {
    const db = (await import('../db/database.js')).default;
    const user = db.prepare('SELECT callsign, status FROM users WHERE telegram_id = ?').get(targetId);
    if (!user) return ctx.answerCbQuery('Пользователь не найден!');

    if (user.status !== 'pending') {
      await ctx.editMessageText(
        ctx.callbackQuery.message.text + `\n\nℹ️ <b>Уже обработано (статус: ${user.status})</b>`,
        { parse_mode: 'HTML', reply_markup: undefined }
      );
      return ctx.answerCbQuery('Заявка уже была обработана ранее!');
    }

    db.prepare('UPDATE users SET status = ?, reject_reason = ? WHERE telegram_id = ?').run('rejected', 'Отклонено администратором', targetId);
    
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + `\n\n❌ <b>ОТКЛОНЕНО</b>`,
      { parse_mode: 'HTML', reply_markup: undefined }
    );
    
    await ctx.telegram.sendMessage(
      targetId,
      `❌ Ваша заявка (позывной ${user.callsign}) была отклонена.\n\n<b>Причина:</b> Отклонено администратором\n\nВы можете подать повторную заявку используя команду /callsign`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {
    console.error(e);
    await ctx.answerCbQuery('Ошибка', { show_alert: true });
  }
});

bot.use(stage.middleware());

// Debug & Console user activity logger
bot.use((ctx, next) => {
  if (ctx.message?.text) {
    const fromUser = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || ctx.from?.id);
    const chatType = ctx.chat?.type === 'private' ? 'ЛС' : `Чат (${ctx.chat?.title || ctx.chat?.id})`;
    console.log(`\x1b[36m[User Msg]\x1b[0m \x1b[33m${fromUser}\x1b[0m [${chatType}]: \x1b[1m${ctx.message.text}\x1b[0m`);
  } else if (ctx.callbackQuery?.data) {
    const fromUser = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || ctx.from?.id);
    console.log(`\x1b[35m[Inline Action]\x1b[0m \x1b[33m${fromUser}\x1b[0m: клик \x1b[1m${ctx.callbackQuery.data}\x1b[0m`);
  }
  return next();
});

import { startHandler } from './commands/start.js';
// Start command
bot.start(startHandler);

// Interactive actions
bot.action('start_callsign', (ctx) => ctx.scene.enter('CALLSIGN_WIZARD'));
bot.action('sub_add_callsign', (ctx) => ctx.scene.enter('SUB_WIZARD', { subType: 'callsign' }));
bot.action('sub_add_park', (ctx) => ctx.scene.enter('SUB_WIZARD', { subType: 'park' }));

bot.action('sub_delete_menu', async (ctx) => {
  await ctx.answerCbQuery();
  const { text, reply_markup } = getDeleteSubsKeyboard(ctx.from.id);
  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup });
});

bot.action('sub_action_back', async (ctx) => {
  await ctx.answerCbQuery();
  const { text, reply_markup } = getSubsKeyboard(ctx.from.id);
  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup });
});

bot.action('sub_toggle_alerts', async (ctx) => {
  const userId = ctx.from.id;
  const userRecord = db.prepare('SELECT notifications_enabled FROM users WHERE telegram_id = ?').get(userId);
  const current = userRecord ? Boolean(userRecord.notifications_enabled ?? 1) : true;
  const next = current ? 0 : 1;
  db.prepare('UPDATE users SET notifications_enabled = ? WHERE telegram_id = ?').run(next, userId);

  await ctx.answerCbQuery(next === 1 ? '🔔 Оповещения в ЛС включены' : '🔕 Оповещения временно отключены');
  const { text, reply_markup } = getSubsKeyboard(userId);
  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup });
});


bot.action(/^delete_msg:(\d+)$/, async (ctx) => {
  const allowedUserId = parseInt(ctx.match[1], 10);
  const clickerId = ctx.from?.id;
  const adminId = parseInt(process.env.ADMIN_ID, 10);
  
  let isChatAdmin = false;
  if (ctx.chat?.type !== 'private') {
    try {
      const member = await ctx.getChatMember(clickerId);
      isChatAdmin = ['creator', 'administrator'].includes(member.status);
    } catch (e) {}
  }

  if (clickerId === allowedUserId || clickerId === adminId || isChatAdmin) {
    try {
      await ctx.deleteMessage();
    } catch (e) {}
  } else {
    try {
      await ctx.answerCbQuery('⛔ Только автор запроса (или администратор) может удалить это сообщение.', { show_alert: true });
    } catch (e) {}
  }
});

bot.action(/^onair_(view|refresh|flt):(.+)$/, onairActionHandler);

bot.action(/^delsub:(callsign|park):(.+)$/, async (ctx) => {
  const type = ctx.match[1];
  const target = ctx.match[2];
  const userId = ctx.from.id;
  
  try {
    const db = (await import('../db/database.js')).default;
    db.prepare('DELETE FROM subscriptions WHERE telegram_id = ? AND type = ? AND target = ?').run(userId, type, target);
    await ctx.answerCbQuery(`Удалена подписка: ${target}`);
    
    const { text, reply_markup } = getDeleteSubsKeyboard(userId);
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup });
  } catch (e) {
    console.error('Error deleting sub from inline button:', e);
    await ctx.answerCbQuery('Ошибка при удалении подписки.', { show_alert: true });
  }
});

// Command registration
bot.command('callsign', (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length > 1) {
    return ctx.scene.enter('CALLSIGN_WIZARD', { directCallsign: args[1] });
  }
  return ctx.scene.enter('CALLSIGN_WIZARD');
});
bot.command('spot', async (ctx) => {
  if (ctx.chat?.type !== 'private') {
    const { deleteUserMessage, replyWithAutoDelete } = await import('./utils.js');
    await deleteUserMessage(ctx);
    await replyWithAutoDelete(ctx, 'ℹ️ Оформление спотов доступно только в личных сообщениях 👇', {
      reply_markup: {
        inline_keyboard: [[{ text: '👉 Открыть личные сообщения 👈', url: `https://t.me/${ctx.botInfo.username}` }]]
      }
    });
    return;
  }
  
  try {
    const db = (await import('../db/database.js')).default;
    const user = db.prepare('SELECT last_spot_msg_id, status, callsign, reject_reason FROM users WHERE telegram_id = ?').get(ctx.from.id);
    if (!user || !user.callsign) {
      return ctx.reply('⚠️ Позывной не найден. Для публикации спотов в канал зарегистрируйтесь с помощью команды /callsign');
    }
    if (user.status === 'pending') {
      return ctx.reply(`⏳ Ваш позывной <b>${user.callsign}</b> находится на проверке администратором. Публикация спотов в канал станет доступна сразу после одобрения заявки!`, { parse_mode: 'HTML' });
    }
    if (user.status === 'rejected') {
      const reason = user.reject_reason ? `\nПричина: <i>${user.reject_reason}</i>` : '';
      return ctx.reply(`❌ Ваша заявка на позывной <b>${user.callsign}</b> была отклонена.${reason}\n\nВы можете подать заявку повторно с помощью команды /callsign`, { parse_mode: 'HTML' });
    }
    if (user.status !== 'approved') {
      return ctx.reply('⚠️ Публикация спотов доступна только подтвержденным радиолюбителям.');
    }
    if (user.last_spot_msg_id) {
      return ctx.reply('У вас есть ранее опубликованный спот. Что вы хотите с ним сделать?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✏️ Изменить пункт', callback_data: 'spot_action_edit' }],
            [{ text: '🗑 Удалить из канала', callback_data: 'spot_action_delete' }],
            [{ text: '➕ Создать новый', callback_data: 'spot_action_new' }]
          ]
        }
      });
    }
  } catch(e) {}
  return ctx.scene.enter('SPOT_WIZARD');
});
// Persistent Welcome Message for new members (never deleted, visible to everyone)
bot.on('new_chat_members', async (ctx) => {
  try {
    await ctx.deleteMessage(); // Delete the "user joined" service message to avoid clutter
  } catch (e) {}

  const newMembers = ctx.message.new_chat_members.filter(m => !m.is_bot);
  if (newMembers.length === 0) return;

  const names = newMembers.map(m => m.first_name).join(', ');
  const text = `👋 Добро пожаловать, ${names}! Рады видеть вас в сообществе RU-POTA 🌲\n\n🤖 Для отправки спотов и подписки на нужного корреспондента можете перейти в личные сообщения: @${ctx.botInfo.username} либо нажмите /start`;

  try {
    await ctx.reply(text);
  } catch (e) {}
});

bot.on('left_chat_member', async (ctx) => {
  try {
    await ctx.deleteMessage(); // Delete the "user left" system message
  } catch (e) {}
});

// Automatic Spot Pinning & Timed Unpinning in Connected Discussion Group
bot.on('pinned_message', async (ctx) => {
  const pinned = ctx.message?.pinned_message;
  if (!pinned) return;

  // Clean up the Telegram service message "[User/Channel] pinned a message" to keep chat clean
  try {
    await ctx.deleteMessage();
  } catch (e) {}

  // Check if pinned message is a spot or forwarded from the activity channel
  const isFromChannel = pinned.is_automatic_forward ||
    (pinned.sender_chat && isChannelChat(pinned.sender_chat)) ||
    (pinned.forward_from_chat && isChannelChat(pinned.forward_from_chat)) ||
    (pinned.text && (pinned.text.includes('POTA Cluster Spot') || pinned.text.includes('НОВЫЙ СПОТ') || pinned.text.includes('Freq:')));

  if (isFromChannel) {
    pinManager.scheduleSpotUnpin(ctx.telegram, ctx.chat.id, pinned.message_id);
  }
});

// Detect automatic forwards from activity channel into group and schedule 30-minute unpin
bot.use(async (ctx, next) => {
  if (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') {
    const msg = ctx.message;
    if (msg) {
      const isChannelForward = msg.is_automatic_forward ||
        (msg.sender_chat && isChannelChat(msg.sender_chat)) ||
        (msg.forward_from_chat && isChannelChat(msg.forward_from_chat));

      if (isChannelForward) {
        pinManager.scheduleSpotUnpin(ctx.telegram, ctx.chat.id, msg.message_id);
      }
    }
  }
  return next();
});

bot.command('start', startHandler);
bot.command('onair', onairHandler);
bot.command('stats', statsHandler);
bot.command('sub', subHandler);
bot.command('ban', banHandler);
bot.command('kick', kickHandler);
bot.command('mute', muteHandler);

// Admin-only command to update pinned welcome message in groups
bot.command('editwelcome', async (ctx) => {
  const adminId = process.env.ADMIN_ID;
  if (!ctx.from || ctx.from.id.toString() !== adminId) {
    return ctx.reply('⛔ Команда доступна только администратору бота.');
  }

  const args = ctx.message.text.split(' ').filter(Boolean);
  let targetChatId = ctx.chat.id;
  let targetMsgId = 474;

  if (args.length === 2) {
    // e.g. /editwelcome 474
    targetMsgId = parseInt(args[1], 10);
  } else if (args.length >= 3) {
    // e.g. /editwelcome -1004485477242 474
    targetChatId = args[1];
    targetMsgId = parseInt(args[2], 10);
  }

  try {
    await ctx.telegram.editMessageText(targetChatId, targetMsgId, undefined, WELCOME_PINNED_POST, {
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
    await ctx.reply(`✅ Закрепленное сообщение #${targetMsgId} успешно обновлено новыми данными!`);
  } catch (err) {
    console.error('Failed to edit welcome post via bot command:', err);
    await ctx.reply(`❌ Ошибка обновления: ${err.message}`);
  }
});

bot.command('park', (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length > 1) {
    return ctx.scene.enter('PARK_WIZARD', { parkRef: args[1] });
  }
  return ctx.scene.enter('PARK_WIZARD');
});

// Spot Action Handlers
bot.action('spot_action_new', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.deleteMessage().catch(()=>{});
  const db = (await import('../db/database.js')).default;
  const user = db.prepare('SELECT status, callsign FROM users WHERE telegram_id = ?').get(ctx.from.id);
  if (!user || user.status !== 'approved' || !user.callsign) {
    return ctx.reply('⚠️ Публикация спотов доступна только подтвержденным радиолюбителям с позывным.');
  }
  db.prepare('UPDATE users SET last_spot_msg_id = NULL, last_spot_data = NULL WHERE telegram_id = ?').run(ctx.from.id);
  return ctx.scene.enter('SPOT_WIZARD');
});

bot.action('spot_action_stop_respot', async (ctx) => {
  await ctx.answerCbQuery();
  const db = (await import('../db/database.js')).default;
  const user = db.prepare('SELECT last_spot_data FROM users WHERE telegram_id = ?').get(ctx.from.id);
  if (user && user.last_spot_data) {
    try {
      const s = JSON.parse(user.last_spot_data);
      s.autoRespot = false;
      db.prepare('UPDATE users SET last_spot_data = ? WHERE telegram_id = ?').run(JSON.stringify(s), ctx.from.id);
      await ctx.editMessageText('🛑 Авто-респот остановлен.');
    } catch (e) {}
  }
});

bot.action('spot_action_delete', async (ctx) => {
  await ctx.answerCbQuery();
  const db = (await import('../db/database.js')).default;
  const user = db.prepare('SELECT last_spot_msg_id FROM users WHERE telegram_id = ?').get(ctx.from.id);
  
  if (user && user.last_spot_msg_id) {
    let channelId = process.env.ACTIVITY_CHANNEL_ID;
    if (channelId && !channelId.startsWith('-100') && !channelId.startsWith('@') && /^[0-9-]+$/.test(channelId)) {
      channelId = channelId.startsWith('-') ? `-100${channelId.substring(1)}` : `-100${channelId}`;
    } else if (channelId && channelId.includes('t.me/')) {
      channelId = `@${channelId.split('t.me/')[1].replace('/', '')}`;
    }
    
    try {
      await ctx.telegram.deleteMessage(channelId, user.last_spot_msg_id);
      await ctx.editMessageText('✅ Спот успешно удален из канала.');
    } catch(e) {
      await ctx.editMessageText('❌ Не удалось удалить спот (возможно он уже удален или слишком старый).');
    }
    db.prepare('UPDATE users SET last_spot_msg_id = NULL, last_spot_data = NULL WHERE telegram_id = ?').run(ctx.from.id);
  } else {
    await ctx.editMessageText('❌ Спот не найден.');
  }
});

bot.action('spot_action_edit', async (ctx) => {
  await ctx.answerCbQuery();
  const db = (await import('../db/database.js')).default;
  const user = db.prepare('SELECT status, callsign FROM users WHERE telegram_id = ?').get(ctx.from.id);
  if (!user || user.status !== 'approved' || !user.callsign) {
    return ctx.reply('⚠️ Публикация спотов доступна только подтвержденным радиолюбителям с позывным.');
  }
  await ctx.editMessageText('Какой пункт вы хотите изменить?', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Частоту', callback_data: 'edit_field_freq' }, { text: 'Модуляцию', callback_data: 'edit_field_mode' }],
        [{ text: 'Мощность', callback_data: 'edit_field_pwr' }, { text: 'RDA', callback_data: 'edit_field_rda' }],
        [{ text: 'Комментарий', callback_data: 'edit_field_comment' }],
        [{ text: '🔙 Отмена', callback_data: 'cancel_edit_field' }]
      ]
    }
  });
});

bot.hears('📡 Управление спотами', async (ctx) => {
  ctx.message.text = '/spot'; // simulate command
  try {
    const db = (await import('../db/database.js')).default;
    const user = db.prepare('SELECT last_spot_msg_id, last_spot_data, status, callsign, reject_reason FROM users WHERE telegram_id = ?').get(ctx.from.id);
    if (!user || !user.callsign) {
      return ctx.reply('⚠️ Позывной не найден. Для публикации спотов в канал зарегистрируйтесь с помощью команды /callsign');
    }
    if (user.status === 'pending') {
      return ctx.reply(`⏳ Ваш позывной <b>${user.callsign}</b> находится на проверке администратором. Публикация спотов в канал станет доступна сразу после одобрения заявки!`, { parse_mode: 'HTML' });
    }
    if (user.status === 'rejected') {
      const reason = user.reject_reason ? `\nПричина: <i>${user.reject_reason}</i>` : '';
      return ctx.reply(`❌ Ваша заявка на позывной <b>${user.callsign}</b> была отклонена.${reason}\n\nВы можете подать заявку повторно с помощью команды /callsign`, { parse_mode: 'HTML' });
    }
    if (user.status !== 'approved') {
      return ctx.reply('⚠️ Публикация спотов доступна только подтвержденным радиолюбителям.');
    }
    if (user.last_spot_msg_id) {
      let isAutoRespot = false;
      try {
        if (user.last_spot_data) {
          const s = JSON.parse(user.last_spot_data);
          isAutoRespot = !!s.autoRespot;
        }
      } catch(e) {}

      let keyboard = [
        [{ text: '✏️ Изменить пункт', callback_data: 'spot_action_edit' }],
        [{ text: '🗑 Удалить из канала', callback_data: 'spot_action_delete' }]
      ];
      if (isAutoRespot) {
        keyboard.push([{ text: '🛑 Стоп авто-респот', callback_data: 'spot_action_stop_respot' }]);
      }
      keyboard.push([{ text: '➕ Создать новый', callback_data: 'spot_action_new' }]);

      return ctx.reply('У вас есть ранее опубликованный активный спот. Вы можете отредактировать его, и изменения моментально отобразятся в канале и на сайте POTA.', {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
    }
  } catch(e) {}
  return ctx.scene.enter('SPOT_WIZARD');
});

bot.hears(['📻 Кто в эфире', '📻 В эфире'], onairHandler);
bot.hears('📊 Моя статистика', (ctx) => { ctx.message.text='/stats'; return import('./commands/stats.js').then(m=>m.statsHandler(ctx)); });
bot.hears('🏞 Инфо по парку', (ctx) => { ctx.message.text='/park'; return ctx.scene.enter('PARK_WIZARD'); });
bot.hears('🔍 Поиск позывного', (ctx) => { return ctx.scene.enter('STATS_WIZARD'); });
bot.hears('🔔 Мои подписки', (ctx) => { ctx.message.text='/sub'; return import('./commands/sub.js').then(m=>m.subHandler(ctx)); });
bot.hears('📝 Регистрация', (ctx) => { ctx.message.text='/callsign'; return ctx.scene.enter('CALLSIGN_WIZARD'); });

// Help handlers
const helpText = `📚 *Справка по боту RU-POTA*

*Основные команды:*
/start — Главное меню и клавиатура
/spot — Отправить спот в кластер (только для одобренных)
/stats — Узнать свою статистику
/stats ПОЗЫВНОЙ — Узнать статистику другого радиолюбителя
/park [референция] — Узнать информацию о парке (например, RU-0065)
/sub — Открыть меню управления подписками\n/sub [ПОЗЫВНОЙ] — Быстрая подписка/отписка на позывной\n/sub [ПАРК] — Быстрая подписка/отписка на парк (напр. /sub RU-0065)
/callsign — Сменить или зарегистрировать позывной (при необходимости)
/onair — Кто в эфире прямо сейчас (активные активаторы)

*Как отправить спот?*
1. Пройдите регистрацию (кнопка в меню).
2. Дождитесь одобрения администратора.
3. Нажмите "Управление спотами" или введите /spot.

*Ошибки и зависания?*
Если бот не отвечает, попробуйте отправить /cancel или /start.

🛠 *Бот работает в режиме бета-тестирования.*
По всем вопросам, багам и предложениям пишите: @r9ogl`;

const helpHandler = async (ctx) => {
  if (ctx.chat?.type !== 'private') {
    const { deleteUserMessage, replyWithAutoDelete } = await import('./utils.js');
    await deleteUserMessage(ctx);
    await replyWithAutoDelete(ctx, helpText, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply(helpText, { parse_mode: 'Markdown' });
  }
};

bot.command('help', helpHandler);
bot.hears('❓ Справка', helpHandler);

// Handle keyboard buttons if pressed out of context
bot.hears(['СЕЙЧАС НА СВЯЗИ', 'ПЛАНИРУЮ'], (ctx) => {
  return ctx.reply('⚠️ Пожалуйста, начните создание спота заново с помощью команды /spot');
});

bot.action('cancel_edit_field', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('Редактирование отменено.');
});

bot.action(/^edit_field_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.deleteMessage().catch(()=>{});
  const field = ctx.match[1];
  return ctx.scene.enter('EDIT_SPOT_WIZARD', { field });
});



bot.catch((err, ctx) => {
  console.error(`Ooops, encountered an error for ${ctx.updateType}`, err);
});

console.log(`
\x1b[32m╔════════════════════════════════════════════════════╗\x1b[0m
\x1b[32m║\x1b[0m   🌲 \x1b[1mRU-POTA Telegram Bot v1.13.4\x1b[0m 📡              \x1b[32m║\x1b[0m

\x1b[32m║\x1b[0m   Сообщество: \x1b[33mParks on the Air (RU-POTA)\x1b[0m          \x1b[32m║\x1b[0m
\x1b[32m╚════════════════════════════════════════════════════╝\x1b[0m
`);

// Launch bot
bot.launch({
  drop_pending_updates: true,
  polling: {
    timeout: 20 // Set to 20 seconds to prevent Cloudflare Worker 30s limit kills
  }
}).then(() => {
  console.log('\x1b[32m[Telegram Bot]\x1b[0m ✅ Бот успешно подключен к Telegram и принимает команды!');
}).catch(err => {
  console.error('\x1b[31m[Telegram Bot]\x1b[0m ❌ Ошибка запуска бота:', err.message);
});

// Start the background cluster worker
startClusterWorker(bot.telegram);

// Start the spot auto-unpin worker (checks every 30s)
pinManager.startPinWorker(bot.telegram);

// Start the admin web panel
startAdminServer(bot.telegram);

// Enable graceful stop
process.once('SIGINT', () => {
  console.log('\n\x1b[33m[Shutdown]\x1b[0m Остановка бота по сигналу SIGINT...');
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  console.log('\n\x1b[33m[Shutdown]\x1b[0m Остановка бота по сигналу SIGTERM...');
  bot.stop('SIGTERM');
});

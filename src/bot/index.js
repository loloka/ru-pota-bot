import { Telegraf, Scenes, session } from 'telegraf';
import dotenv from 'dotenv';

// Import middlewares
import { chatFilter, requireRegistration, deleteSystemMessages } from './middlewares/chatFilter.js';
import { rateLimit } from './middlewares/rateLimit.js';

// Import command handlers
import { callsignHandler } from './commands/callsign.js';
import { statsHandler } from './commands/stats.js';
import { subHandler, getSubsKeyboard } from './commands/sub.js';
import { banHandler, muteHandler } from './commands/mod.js';

// Import scenes
import { spotWizard } from './scenes/spotWizard.js';
import { callsignWizard } from './scenes/callsignWizard.js';
import { parkWizard } from './scenes/parkWizard.js';
import { editSpotWizard } from './scenes/editSpotWizard.js';

// Import background worker
import { startClusterWorker } from '../services/clusterWorker.js';

// Import admin server
import { startAdminServer } from '../web/admin.js';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const ACTIVITY_CHANNEL_ID = process.env.ACTIVITY_CHANNEL_ID;

if (!BOT_TOKEN) {
  console.error('FATAL: BOT_TOKEN is not defined in environment variables.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Global middlewares BEFORE scenes
bot.use(chatFilter);
bot.use(deleteSystemMessages);
bot.use(requireRegistration);

// Configure scenes and sessions
const stage = new Scenes.Stage([spotWizard, callsignWizard, parkWizard, editSpotWizard]);
bot.use(session());
bot.use(rateLimit({ window: 5000, limit: 4 }));
bot.use(stage.middleware());

// Debug all incoming updates
bot.use((ctx, next) => {
  const logStr = 'Received update: ' + JSON.stringify(ctx.update) + '\n';
  import('fs').then(fs => fs.appendFileSync('debug.log', logStr));
  return next();
});

import { startHandler } from './commands/start.js';
// Start command
bot.start(startHandler);

// Interactive actions
bot.action('start_callsign', (ctx) => ctx.scene.enter('CALLSIGN_WIZARD'));
bot.action(/^delete_msg:(\d+)$/, async (ctx) => {
  const allowedUserId = parseInt(ctx.match[1], 10);
  const clickerId = ctx.from?.id;
  const adminId = parseInt(process.env.ADMIN_ID, 10);
  
  if (clickerId === allowedUserId || clickerId === adminId) {
    try {
      await ctx.deleteMessage();
    } catch (e) {}
  } else {
    try {
      await ctx.answerCbQuery('⛔ Только автор запроса (или администратор) может удалить это сообщение.', { show_alert: true });
    } catch (e) {}
  }
});

bot.action(/^delsub:(.+)$/, async (ctx) => {
  const targetCallsign = ctx.match[1];
  const userId = ctx.from.id;
  
  try {
    const db = (await import('../db/database.js')).default;
    db.prepare('DELETE FROM subscriptions WHERE telegram_id = ? AND target_callsign = ?').run(userId, targetCallsign);
    await ctx.answerCbQuery(`Отписались от ${targetCallsign}`);
    
    const { text, reply_markup } = getSubsKeyboard(userId);
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup });
  } catch (e) {
    console.error('Error deleting sub from inline button:', e);
    await ctx.answerCbQuery('Ошибка при удалении подписки.', { show_alert: true });
  }
});

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
    const user = db.prepare('SELECT last_spot_msg_id FROM users WHERE telegram_id = ?').get(ctx.from.id);
    if (user && user.last_spot_msg_id) {
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
let lastWelcomeMsgId = null;

bot.on('new_chat_members', async (ctx) => {
  try {
    await ctx.deleteMessage(); // Delete the "user joined" system message
  } catch (e) {}

  const newMembers = ctx.message.new_chat_members.filter(m => !m.is_bot);
  if (newMembers.length === 0) return;

  const names = newMembers.map(m => m.first_name).join(', ');
  const text = `👋 Добро пожаловать, ${names}! Рады видеть вас в сообществе RU-POTA 🌲\n\n🤖 Для отправки спотов и просмотра статистики перейдите в личные сообщения: @${ctx.botInfo.username}`;

  if (lastWelcomeMsgId) {
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, lastWelcomeMsgId);
    } catch (e) {}
  }

  try {
    const msg = await ctx.reply(text);
    lastWelcomeMsgId = msg.message_id;
    
    // Auto-delete the welcome message after 2 minutes to keep chat clean
    setTimeout(async () => {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id);
        if (lastWelcomeMsgId === msg.message_id) lastWelcomeMsgId = null;
      } catch (e) {}
    }, 2 * 60 * 1000);
  } catch (e) {}
});

bot.on('left_chat_member', async (ctx) => {
  try {
    await ctx.deleteMessage(); // Delete the "user left" system message
  } catch (e) {}
});

bot.command('start', startHandler);
bot.command('stats', statsHandler);
bot.command('sub', subHandler);
bot.command('ban', banHandler);
bot.command('mute', muteHandler);

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
    let channelId = ACTIVITY_CHANNEL_ID;
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
    const user = db.prepare('SELECT last_spot_msg_id, last_spot_data FROM users WHERE telegram_id = ?').get(ctx.from.id);
    if (user && user.last_spot_msg_id) {
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

bot.hears('📊 Моя статистика', (ctx) => { ctx.message.text='/stats'; return import('./commands/stats.js').then(m=>m.statsHandler(ctx)); });
bot.hears('🏞 Инфо по парку', (ctx) => { ctx.message.text='/park'; return ctx.scene.enter('PARK_WIZARD'); });

// Handle lingering wizard buttons if pressed out of context
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

console.log('🤖 Запуск RU-POTA бота...');

// Start the bot without blocking
bot.launch().catch(err => {
  console.error('Failed to launch bot:', err);
});

console.log('✅ Бот успешно запущен и готов к работе!');

// Start the background cluster worker
startClusterWorker(bot.telegram);

// Start the admin web panel
startAdminServer(bot.telegram);

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

import { Scenes } from 'telegraf';
import dotenv from 'dotenv';
import db from '../../db/database.js';
import { potaApi } from '../../api/potaApi.js';
import { deleteUserMessage, replyWithAutoDelete } from '../utils.js';
import axios from 'axios';
dotenv.config();

const ACTIVITY_CHANNEL_ID = process.env.ACTIVITY_CHANNEL_ID;

export const spotWizard = new Scenes.WizardScene(
  'SPOT_WIZARD',
  // Step 1: Status
  async (ctx) => {
    if (ctx.chat?.type !== 'private') {
      await deleteUserMessage(ctx);
      await replyWithAutoDelete(ctx, 
        `ℹ️ Оформление спотов доступно только в личных сообщениях 👇`, 
        {
          reply_markup: {
            inline_keyboard: [[{ text: '👉 Открыть личные сообщения 👈', url: `https://t.me/${ctx.botInfo.username}` }]]
          }
        }
      );
      return ctx.scene.leave();
    }

    const user = ctx.state.user;
    if (!user) {
      await ctx.reply('⚠️ Позывной не найден. Зарегистрируйтесь командой /callsign');
      return ctx.scene.leave();
    }
    if (user.status !== 'approved') {
      await ctx.reply('⏳ Ваш позывной еще не прошел модерацию. Вы пока не можете отправлять споты.');
      return ctx.scene.leave();
    }
    
    ctx.wizard.state.spot = { callsign: user.callsign };
    
    await ctx.reply('🚀 Оформление нового спота. Укажите статус:\n\n<i>или введите /cancel для отмены</i>', {
      parse_mode: 'HTML',
      reply_markup: {
        keyboard: [[{ text: 'СЕЙЧАС НА СВЯЗИ' }, { text: 'ПЛАНИРУЮ' }]],
        one_time_keyboard: true,
        resize_keyboard: true
      }
    });
    return ctx.wizard.next();
  },
  // Step 2: Time
  async (ctx) => {
    if (!ctx.message?.text) return;
    const status = ctx.message.text.toUpperCase();
    ctx.wizard.state.spot.status = status;
    
    if (status === 'ПЛАНИРУЮ') {
      await ctx.reply('📅 Введите дату и примерное время в UTC\n\n<i>(Например: 02.09 ~12:00 или точно 12:00-14:00)</i>:', {
        parse_mode: 'HTML',
        /* removed */
      });
    } else {
      await ctx.reply('⏳ До какого времени вы планируете работать в UTC?\n\n<i>(Можно просто написать 17:00, бот сам добавит "до". Либо отправьте "-", чтобы пропустить этот шаг)</i>', {
        parse_mode: 'HTML',
        /* removed */
      });
    }
    return ctx.wizard.next();
  },
  // Step 3: Freq
  async (ctx) => {
    if (!ctx.message?.text) return;
    ctx.wizard.state.spot.timeStr = ctx.message.text !== '-' ? ctx.message.text : '';
    await ctx.reply('📡 Введите точную частоту (например, 7.175, 7.175 MHz или 7175):');
    return ctx.wizard.next();
  },
  // Step 4: Park Reference
  async (ctx) => {
    if (!ctx.message?.text) return;
    ctx.wizard.state.spot.freq = ctx.message.text;
    await ctx.reply('🏞️ Введите референцию парка POTA (например, RU-0073). Название парка подгрузится автоматически:');
    return ctx.wizard.next();
  },
  // Step 5: Park Fetch & RDA
  async (ctx) => {
    if (!ctx.message?.text) return;
    const ref = ctx.message.text.toUpperCase().trim();
    
    if (!/^[A-Z0-9]{1,4}-\d{4}$/.test(ref)) {
      await ctx.reply('❌ Неверный формат. Пожалуйста, введите референцию в формате RU-1234:');
      return;
    }

    try {
      const res = await axios.get(`https://api.pota.app/park/${ref}`);
      if (res.data && res.data.name) {
        ctx.wizard.state.spot.reference = res.data.reference;
        ctx.wizard.state.spot.parkName = res.data.name;
        ctx.wizard.state.spot.parkType = res.data.parktypeDesc || '';
        
        const fullParkName = res.data.parktypeDesc ? `${res.data.name} (${res.data.parktypeDesc})` : res.data.name;
        
        await ctx.reply(
          `✅ Найден парк: <b>${fullParkName}</b>\n\n` +
          `📍 Введите RDA (например, MA-01). Если это граница районов, укажите через дробь (например, NS-03/NS-04).\n\n` +
          `<i>Отправьте "-", чтобы пропустить.</i>`, 
          { parse_mode: 'HTML' }
        );
        return ctx.wizard.next();
      }
    } catch (err) {
      await ctx.reply(`❌ Парк ${ref} не найден в базе POTA.\nПожалуйста, проверьте номер и введите заново:`);
      return;
    }
  },
  // Step 6: Mode
  async (ctx) => {
    if (!ctx.message?.text) return;
    ctx.wizard.state.spot.rda = ctx.message.text !== '-' ? ctx.message.text.toUpperCase() : '';
    
    await ctx.reply('⚙️ Введите модуляцию (выберите на клавиатуре или введите вручную, например CW/SSB):', {
      reply_markup: {
        keyboard: [
          [{ text: 'CW' }, { text: 'SSB' }, { text: 'FT8' }],
          [{ text: 'FM' }, { text: 'CW/SSB' }, { text: 'DIGI' }]
        ],
        one_time_keyboard: true,
        resize_keyboard: true
      }
    });
    return ctx.wizard.next();
  },
  // Step 7: Power
  async (ctx) => {
    if (!ctx.message?.text) return;
    ctx.wizard.state.spot.mode = ctx.message.text.toUpperCase();
    await ctx.reply('⚡ Введите мощность (например, 100W или 5W QRP):', {
      /* removed */
    });
    return ctx.wizard.next();
  },
  // Step 8: Comment
  async (ctx) => {
    if (!ctx.message?.text) return;
    ctx.wizard.state.spot.pwr = ctx.message.text;
    await ctx.reply('📝 Введите любой комментарий (например, информация об антенне).\n\n<i>Отправьте "-", чтобы пропустить.</i>', {
      parse_mode: 'HTML'
    });
    return ctx.wizard.next();
  },
  // Step 9: Ask auto-respot
  async (ctx) => {
    if (!ctx.message?.text) return;
    ctx.wizard.state.spot.baseComment = ctx.message.text !== '-' ? ctx.message.text : '';

    if (ctx.wizard.state.spot.status === 'СЕЙЧАС НА СВЯЗИ') {
      await ctx.reply('🔄 Включить авто-респот на сайт POTA?\n\n(Бот будет автоматически отправлять этот же спот еще 3 раза, каждые 10 минут)', {
        reply_markup: {
          keyboard: [
            [{ text: '✅ Да (3 раза каждые 10 мин)' }, { text: '❌ Нет' }]
          ],
          one_time_keyboard: true,
          resize_keyboard: true
        }
      });
      return ctx.wizard.next();
    } else {
      ctx.wizard.state.spot.autoRespot = false;
      return ctx.wizard.steps[ctx.wizard.cursor + 1](ctx);
    }
  },
  // Step 10: Finish
  async (ctx) => {
    if (ctx.wizard.state.spot.status === 'СЕЙЧАС НА СВЯЗИ') {
      if (!ctx.message?.text) return;
      ctx.wizard.state.spot.autoRespot = ctx.message.text.includes('Да');
    }
    
    let baseComment = ctx.wizard.state.spot.baseComment;
    const s = ctx.wizard.state.spot;
    const rdaStr = s.rda ? ` (RDA: ${s.rda})` : '';
    
    let dateStr = new Date().toLocaleDateString('ru-RU');
    let statusLine = `📅 ${dateStr} [${s.status}]`;
    let timeInfo = '';
    if (s.status === 'ПЛАНИРУЮ') {
      statusLine = `📅 План: ${s.timeStr}`;
      if (s.timeStr) timeInfo = `QSO planned ${s.timeStr}`;
    } else if (s.timeStr) {
      const cleanTime = s.timeStr.replace(/^до\s*/i, '');
      statusLine += ` (до ${cleanTime})`;
      timeInfo = `QRT ~${cleanTime}`;
    }
    
    let commentParts = [];
    if (timeInfo) commentParts.push(timeInfo);
    if (baseComment) commentParts.push(baseComment);
    if (s.pwr && s.pwr !== '-') commentParts.push(s.pwr);
    if (s.rda && s.rda !== '-') commentParts.push(`RDA: ${s.rda}`);
    
    let comment = commentParts.join(' | ');
    
    const fullParkName = s.parkType ? `${s.parkName} (${s.parkType})` : s.parkName;
    
    const actLink = `<a href="https://next.pota.app/profile/${s.callsign}">${s.callsign}</a>`;
    const refLink = `<a href="https://next.pota.app/park/${s.reference}">${s.reference}</a>`;

    const formattedSpot = `${statusLine}\n` +
                          `📻 <b>${actLink}</b>\n` +
                          `🏞️ <b>${refLink}</b> ${fullParkName}${rdaStr}\n` +
                          `⚙️ Freq: ${s.freq} | ${s.mode} | ${s.pwr}\n` +
                          (comment ? `📝 ${comment}` : '');

    let channelId = ACTIVITY_CHANNEL_ID;
    if (channelId && !channelId.startsWith('-100') && !channelId.startsWith('@') && /^[0-9-]+$/.test(channelId)) {
      if (channelId.startsWith('-')) {
        channelId = '-100' + channelId.substring(1);
      } else {
        channelId = '-100' + channelId;
      }
    } else if (channelId && channelId.includes('t.me/')) {
      channelId = '@' + channelId.split('t.me/')[1].replace('/', '');
    }

    try {
      const msg = await ctx.telegram.sendMessage(channelId, formattedSpot, { parse_mode: 'HTML', disable_web_page_preview: true });
      await ctx.reply('✅ Спот успешно опубликован в канале активности!');
      
      // Save spot to DB for editing later
      s.baseComment = baseComment;
      s.comment = comment; // full comment
      db.prepare('UPDATE users SET last_spot_msg_id = ?, last_spot_data = ? WHERE telegram_id = ?').run(msg.message_id, JSON.stringify(s), ctx.from.id);
      
      // Post to POTA API
      const spotter = ctx.state.user?.callsign || 'UNKNOWN';
      const freqNumber = String(s.freq).replace(/[^0-9.]/g, '');
      const spotId = await potaApi.postSpot({
        activator: s.callsign,
        frequency: freqNumber,
        mode: s.mode,
        reference: s.reference,
        spotter: spotter,
        comments: comment
      });
      
      if (spotId !== null) {
        console.log(`[POTA API] Successfully posted spot: ${s.callsign} @ ${s.reference}, ID: ${spotId}`);
        if (spotId > 0) {
          // Add to DB so clusterWorker ignores it
          const insertStmt = db.prepare(`
            INSERT INTO spots (spot_id, callsign, reference, frequency, mode, comment, source)
            VALUES (?, ?, ?, ?, ?, ?, 'bot')
          `);
          insertStmt.run(spotId, s.callsign, s.reference, freqNumber, s.mode, comment);
        }
        
        // Auto-respot logic
        if (s.autoRespot) {
          await ctx.reply('⏱ Авто-респот включен. Бот отправит этот спот на сайт POTA еще 3 раза (каждые 10 минут).');
          let respotCount = 0;
          const interval = setInterval(async () => {
            respotCount++;
            if (respotCount > 3) {
              clearInterval(interval);
              return;
            }
            try {
              // Read latest spot data from DB
              const u = db.prepare('SELECT last_spot_data FROM users WHERE telegram_id = ?').get(ctx.from.id);
              if (!u || !u.last_spot_data) {
                clearInterval(interval); // Spot was deleted
                return;
              }
              const latestSpot = JSON.parse(u.last_spot_data);
              if (!latestSpot.autoRespot) {
                clearInterval(interval); // Auto-respot cancelled manually
                return;
              }
              
              const latestFreq = String(latestSpot.freq).replace(/[^0-9.]/g, '');
              const newSpotId = await potaApi.postSpot({
                activator: latestSpot.callsign,
                frequency: latestFreq,
                mode: latestSpot.mode,
                reference: latestSpot.reference,
                spotter: spotter,
                comments: latestSpot.comment
              });
              if (newSpotId && newSpotId > 0) {
                db.prepare(`
                  INSERT INTO spots (spot_id, callsign, reference, frequency, mode, comment, source)
                  VALUES (?, ?, ?, ?, ?, ?, 'bot_respot')
                `).run(newSpotId, latestSpot.callsign, latestSpot.reference, latestFreq, latestSpot.mode, latestSpot.comment);
              }
            } catch(e) {
              console.error('Auto-respot error:', e.message);
            }
          }, 10 * 60 * 1000);
        }
      } else {
        console.error(`[POTA API] Failed to post spot: ${s.callsign} @ ${s.reference}`);
      }
      
    } catch (err) {
      console.error('Failed to send spot to channel', err.message);
      await ctx.reply(`❌ Ошибка при публикации спота: ${err.message}`);
    }
    
    return ctx.scene.leave();
  }
);

spotWizard.command('cancel', async (ctx) => {
  await ctx.reply('🚫 Оформление спота отменено. Для начала работы нажмите /start');
  return ctx.scene.leave();
});
import { Scenes } from 'telegraf';
import db from '../../db/database.js';
import { potaApi } from '../../api/potaApi.js';
import { pinManager } from '../../services/pinManager.js';
import { getMainMenu, getBaseCallsign } from '../utils.js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const ACTIVITY_CHANNEL_ID = process.env.ACTIVITY_CHANNEL_ID;

export const editSpotWizard = new Scenes.WizardScene(
  'EDIT_SPOT_WIZARD',
  async (ctx) => {
    const field = ctx.scene.state.field; // passed from action
    if (!field) return ctx.scene.leave();

    const fieldNames = {
      freq: 'частоту (пишите в формате 7.175, 7.175 MHz или 7175)',
      mode: 'модуляцию (например, CW)',
      pwr: 'мощность (например, 100W)',
      rda: 'RDA (например, MA-01)',
      comment: 'комментарий (или отправьте "-" чтобы удалить)'
    };
    
    let currentVal = '';
    try {
      const u = db.prepare('SELECT last_spot_data FROM users WHERE telegram_id = ?').get(ctx.from.id);
      if (u && u.last_spot_data) {
        const s = JSON.parse(u.last_spot_data);
        if (field === 'freq') currentVal = s.freq;
        if (field === 'mode') currentVal = s.mode;
        if (field === 'pwr') currentVal = s.pwr;
        if (field === 'rda') currentVal = s.rda;
        if (field === 'comment') currentVal = s.baseComment;
      }
    } catch(e) {}
    
    let msg = `✏️ Введите новую ${fieldNames[field]}:\n\n`;
    if (currentVal) {
      msg += `Текущее значение:\n<code>${currentVal}</code>\n\n`;
    }
    msg += `<i>или введите /cancel для отмены</i>`;

    await ctx.reply(msg, { parse_mode: 'HTML' });
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message?.text) return;
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) {
      await ctx.scene.leave();
      if (text.toUpperCase() === '/CANCEL') {
        await ctx.reply('🚫 Редактирование отменено.');
      } else {
        await ctx.reply('🚫 Редактирование отменено. Пожалуйста, повторите вашу команду.');
      }
      return;
    }

    const field = ctx.scene.state.field;
    
    // Load spot
    const u = db.prepare('SELECT last_spot_msg_id, last_spot_data FROM users WHERE telegram_id = ?').get(ctx.from.id);
    if (!u || !u.last_spot_data || !u.last_spot_msg_id) {
      await ctx.reply('❌ Не найден спот для редактирования.');
      return ctx.scene.leave();
    }
    
    let s;
    try { s = JSON.parse(u.last_spot_data); } catch(e) { return ctx.scene.leave(); }
    
    // Apply
    if (field === 'freq') s.freq = text;
    if (field === 'mode') s.mode = text.toUpperCase();
    if (field === 'pwr') s.pwr = text;
    if (field === 'rda') s.rda = text !== '-' ? text.toUpperCase() : '';
    if (field === 'comment') s.baseComment = text !== '-' ? text : '';

    // Reconstruct
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
    if (s.baseComment) commentParts.push(s.baseComment);
    if (s.pwr && s.pwr !== '-') commentParts.push(s.pwr);
    if (s.rda && s.rda !== '-') commentParts.push(`RDA: ${s.rda}`);
    
    let comment = commentParts.join(' | ');
    s.comment = comment; // update the stored full comment
    
    const fullParkName = s.parkType ? `${s.parkName} (${s.parkType})` : s.parkName;
    
    const baseCall = getBaseCallsign(s.callsign);
    const actLink = `<a href="https://next.pota.app/profile/${encodeURIComponent(baseCall)}">${s.callsign}</a>`;
    const refLink = `<a href="https://next.pota.app/park/${s.reference}">${s.reference}</a>`;

    const formattedSpot = `${statusLine}\n` +
                          `📻 <b>${actLink}</b>\n` +
                          `🏞️ <b>${refLink}</b> ${fullParkName}${rdaStr}\n` +
                          `⚙️ Freq: ${s.freq} | ${s.mode} | ${s.pwr}\n` +
                          (s.comment ? `📝 ${s.comment}` : '');

    let channelId = ACTIVITY_CHANNEL_ID;
    if (channelId && !channelId.startsWith('-100') && !channelId.startsWith('@') && /^[0-9-]+$/.test(channelId)) {
      channelId = channelId.startsWith('-') ? `-100${channelId.substring(1)}` : `-100${channelId}`;
    } else if (channelId && channelId.includes('t.me/')) {
      channelId = `@${channelId.split('t.me/')[1].replace('/', '')}`;
    }

    try {
      // 1. Unpin old spot from channel & delete from discussion group
      if (u.last_spot_msg_id) {
        try {
          await pinManager.unpinSpotNow(ctx.telegram, channelId, u.last_spot_msg_id);
        } catch (unpinErr) {}
      }

      // 2. Broadcast fresh spot as a NEW message so everyone in channel & group gets alerted
      const sentMsg = await ctx.telegram.sendMessage(channelId, formattedSpot, { parse_mode: 'HTML', disable_web_page_preview: true });
      const newMsgId = sentMsg.message_id;

      // 3. Pin new spot silently and schedule auto-unpin
      try {
        await ctx.telegram.pinChatMessage(channelId, newMsgId, { disable_notification: true });
        try { await ctx.telegram.deleteMessage(channelId, newMsgId + 1); } catch (delErr) {}
      } catch (pinErr) {}
      pinManager.scheduleSpotUnpin(ctx.telegram, channelId, newMsgId, undefined, newMsgId);

      // 4. Normalize frequency data in s for 100% TMA & POTA compatibility
      const freqNumber = String(s.freq).replace(/[^0-9.]/g, '');
      let numVal = parseFloat(freqNumber.replace(',', '.'));
      if (!isNaN(numVal) && numVal > 0) {
        if (numVal < 1000) {
          s.freqMHz = numVal.toFixed(3);
          s.frequency = String(Math.round(numVal * 1000));
        } else {
          s.freqMHz = (numVal / 1000).toFixed(3);
          s.frequency = String(Math.round(numVal));
        }
      }

      // 5. Update user in DB with new message ID and complete spot data
      db.prepare('UPDATE users SET last_spot_msg_id = ?, last_spot_data = ? WHERE telegram_id = ?').run(newMsgId, JSON.stringify(s), ctx.from.id);
      
      // 6. Post updated spot to POTA API
      const spotter = ctx.state.user?.callsign || 'UNKNOWN';
      const spotId = await potaApi.postSpot({
        activator: s.callsign,
        frequency: s.frequency || freqNumber,
        mode: s.mode,
        reference: s.reference,
        spotter: spotter,
        comments: s.comment || ''
      });
      
      if (spotId && spotId > 0) {
        try {
          db.prepare(`
            INSERT INTO spots (spot_id, callsign, reference, frequency, mode, comment, source, msg_id)
            VALUES (?, ?, ?, ?, ?, ?, 'bot_edit', ?)
          `).run(spotId, s.callsign, s.reference, s.frequency || freqNumber, s.mode, s.comment || '', newMsgId);
        } catch(e) {}
      }

      await ctx.reply(`✅ Спот успешно обновлен и опубликован новым сообщением!\n📻 <b>${s.callsign}</b> @ <b>${s.reference}</b>\n⚙️ Freq: <b>${s.freq}</b> | <b>${s.mode}</b>`, {
        parse_mode: 'HTML',
        reply_markup: getMainMenu(ctx)
      });
    } catch (err) {
      console.error('Error posting updated spot', err);
      await ctx.reply(`❌ Ошибка публикации обновленного спота: ${err.message}`, {
        reply_markup: getMainMenu(ctx)
      });
    }
    
    return ctx.scene.leave();
  }
);

import { Scenes } from 'telegraf';
import db from '../../db/database.js';
import { potaApi } from '../../api/potaApi.js';
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
    const text = ctx.message.text;
    if (text.toUpperCase() === '/CANCEL') {
      await ctx.reply('🚫 Редактирование отменено.');
      return ctx.scene.leave();
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
    
    const actLink = `<a href="https://next.pota.app/profile/${s.callsign}">${s.callsign}</a>`;
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
      await ctx.telegram.editMessageText(channelId, u.last_spot_msg_id, undefined, formattedSpot, { parse_mode: 'HTML', disable_web_page_preview: true });
      db.prepare('UPDATE users SET last_spot_data = ? WHERE telegram_id = ?').run(JSON.stringify(s), ctx.from.id);
      
      // Post updated spot to POTA API
      const spotter = ctx.state.user?.callsign || 'UNKNOWN';
      const freqNumber = String(s.freq).replace(/[^0-9.]/g, '');
      const spotId = await potaApi.postSpot({
        activator: s.callsign,
        frequency: freqNumber,
        mode: s.mode,
        reference: s.reference,
        spotter: spotter,
        comments: s.comment || ''
      });
      
      if (spotId && spotId > 0) {
        try {
          db.prepare(`
            INSERT INTO spots (spot_id, callsign, reference, frequency, mode, comment, source)
            VALUES (?, ?, ?, ?, ?, ?, 'bot_edit')
          `).run(spotId, s.callsign, s.reference, freqNumber, s.mode, s.comment || '');
        } catch(e) {} // ignore unique constraint if it somehow matches
      }

      await ctx.reply('✅ Спот успешно обновлен в канале и на сайте POTA!');
    } catch (err) {
      console.error('Error editing message', err);
      if (err.description && err.description.includes('are exactly the same')) {
         await ctx.reply('✅ Спот обновлен (изменений не было).');
      } else {
         await ctx.reply(`❌ Ошибка обновления сообщения в канале: ${err.message}`);
      }
    }
    
    return ctx.scene.leave();
  }
);

import { potaApi } from '../api/potaApi.js';
import db from '../db/database.js';
import dotenv from 'dotenv';
dotenv.config();

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '60000', 10);
const ACTIVITY_CHANNEL_ID = process.env.ACTIVITY_CHANNEL_ID;
const ALLOWED_PREFIXES = (process.env.ALLOWED_PREFIXES || 'RU-,BY-,KZ-').split(',').map(p => p.trim());

export const startClusterWorker = (telegramClient) => {
  const intervalSec = Math.round(POLL_INTERVAL_MS / 1000);
  console.log(`\x1b[36m[Cluster Worker]\x1b[0m 🚀 Запущен воркер кластера (опрос каждые ${intervalSec}с, фильтр: \x1b[33m${ALLOWED_PREFIXES.join(', ')}\x1b[0m)`);

  const pollCluster = async () => {
    try {
      const spots = await potaApi.getSpots();
      if (!Array.isArray(spots) || spots.length === 0) return;
      
      let processedCount = 0;

      for (const spot of spots) {
        // 1. GEO Filter (Check reference prefix)
        const ref = spot.reference || '';
        const isAllowed = ALLOWED_PREFIXES.some(prefix => ref.startsWith(prefix));
        if (!isAllowed) continue;

        // 2. Deduplication Check by spotId
        if (!spot.spotId) continue; 
        
        const checkStmt = db.prepare('SELECT id FROM spots WHERE spot_id = ?');
        if (checkStmt.get(spot.spotId)) {
          continue; // Already processed this spot
        }

        processedCount++;
        console.log(`\x1b[32m[Cluster Spot]\x1b[0m 📻 Новый спот: \x1b[1m${spot.activator}\x1b[0m @ \x1b[33m${ref}\x1b[0m (${spot.frequency} kHz, ${spot.mode})`);

        // 3. Format and Broadcast to Activity Channel
        const actLink = `<a href="https://next.pota.app/profile/${spot.activator}">${spot.activator}</a>`;
        const refLink = `<a href="https://next.pota.app/park/${ref}">${ref}</a>`;
        const msg = `🌐 <b>POTA Cluster Spot</b>\n` +
                    `📻 <b>${actLink}</b> @ 🏞️ <b>${refLink}</b>\n` +
                    `⚙️ Freq: ${spot.frequency} kHz | ${spot.mode}\n` +
                    (spot.comments ? `📝 ${spot.comments}` : '');
                    
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
        
        let msgId = null;            
        try {
          const sentMsg = await telegramClient.sendMessage(channelId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
          msgId = sentMsg.message_id;
          console.log(`\x1b[34m[Broadcast]\x1b[0m 📢 Спот ${spot.activator} опубликован в канал`);
        } catch (e) {
          console.error(`\x1b[31m[Broadcast Error]\x1b[0m Не удалось отправить спот в канал:`, e.message);
        }

        // 4. Save to DB to prevent duplicate processing (and save msgId for web panel deletion)
        const insertStmt = db.prepare(`
          INSERT INTO spots (spot_id, callsign, reference, frequency, mode, comment, source, msg_id)
          VALUES (?, ?, ?, ?, ?, ?, 'cluster', ?)
        `);
        insertStmt.run(spot.spotId, spot.activator, ref, spot.frequency || '', spot.mode || '', spot.comments || '', msgId);
        
        // 5. Notify Subscribed Users (Callsigns and Parks)
        const activator = (spot.activator || '').toUpperCase();
        const callsignSubscribers = db.prepare(`
          SELECT s.telegram_id 
          FROM subscriptions s
          LEFT JOIN users u ON u.telegram_id = s.telegram_id
          WHERE s.type = ? AND s.target = ? AND (u.notifications_enabled IS NULL OR u.notifications_enabled = 1)
        `).all('callsign', activator);
        const parkSubscribers = db.prepare(`
          SELECT s.telegram_id 
          FROM subscriptions s
          LEFT JOIN users u ON u.telegram_id = s.telegram_id
          WHERE s.type = ? AND s.target = ? AND (u.notifications_enabled IS NULL OR u.notifications_enabled = 1)
        `).all('park', ref.toUpperCase());


        // Merge subscribers and track the reasons for notification
        const notificationsMap = new Map();

        for (const sub of callsignSubscribers) {
          notificationsMap.set(sub.telegram_id, `🚨 <b>Ваш друг ${spot.activator} сейчас в эфире!</b>\n\n${msg}`);
        }

        for (const sub of parkSubscribers) {
          if (!notificationsMap.has(sub.telegram_id)) {
            notificationsMap.set(sub.telegram_id, `🏞 <b>Новая активность в отслеживаемом парке ${ref}!</b>\n\n${msg}`);
          }
        }

        for (const [userId, userMsg] of notificationsMap.entries()) {
          try {
            await telegramClient.sendMessage(userId, userMsg, { parse_mode: 'HTML', disable_web_page_preview: true });
            console.log(`\x1b[35m[Notification]\x1b[0m 🔔 Уведомление отправлено пользователю ${userId}`);
          } catch (e) {
            console.error(`\x1b[31m[Notification Error]\x1b[0m Ошибка отправки подписчику ${userId}:`, e.message);
          }
        }
      }
    } catch (error) {
      console.warn(`\x1b[33m[Cluster Worker]\x1b[0m ⚠️ Ошибка цикла опроса: ${error.message}`);
    }
  };

  // Run immediately on start
  pollCluster();
  
  // Then schedule loop
  setInterval(pollCluster, POLL_INTERVAL_MS);
};

import { potaApi } from '../api/potaApi.js';
import db from '../db/database.js';
import { pinManager } from './pinManager.js';
import { getBandFromKHz } from '../bot/commands/onair.js';
import dotenv from 'dotenv';
dotenv.config();

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '60000', 10);
const ACTIVITY_CHANNEL_ID = process.env.ACTIVITY_CHANNEL_ID;
const ALLOWED_PREFIXES = (process.env.ALLOWED_PREFIXES || 'RU-,BY-,KZ-').split(',').map(p => p.trim());
const CLUSTER_SPOT_COOLDOWN_MINUTES = parseInt(process.env.CLUSTER_SPOT_COOLDOWN_MINUTES || '20', 10);
const SPOT_COOLDOWN_MS = CLUSTER_SPOT_COOLDOWN_MINUTES * 60 * 1000;

// In-memory cache of recent broadcasts to throttle repetitive RBN skimmers
// Key format: `${cleanCall}@${ref}:${band}:${mode}` -> timestamp in ms
const recentBroadcasts = new Map();

export const startClusterWorker = (telegramClient) => {
  const intervalSec = Math.round(POLL_INTERVAL_MS / 1000);
  console.log(`\x1b[36m[Cluster Worker]\x1b[0m 🚀 Запущен воркер кластера (опрос каждые ${intervalSec}с, кулдаун RBN: ${CLUSTER_SPOT_COOLDOWN_MINUTES}м, фильтр: \x1b[33m${ALLOWED_PREFIXES.join(', ')}\x1b[0m)`);

  const pollCluster = async () => {
    try {
      // Memory cleanup: purge entries older than 2 hours
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      for (const [key, time] of recentBroadcasts.entries()) {
        if (time < twoHoursAgo) {
          recentBroadcasts.delete(key);
        }
      }

      const spots = await potaApi.getSpots();
      if (!Array.isArray(spots) || spots.length === 0) return;
      
      let processedCount = 0;

      for (const spot of spots) {
        // 1. GEO Filter (Check reference prefix)
        const ref = (spot.reference || '').toUpperCase().trim();
        const isAllowed = ALLOWED_PREFIXES.some(prefix => ref.startsWith(prefix));
        if (!isAllowed) continue;

        // 2. Deduplication Check by spotId
        if (!spot.spotId) continue; 
        
        const checkStmt = db.prepare('SELECT id FROM spots WHERE spot_id = ?');
        if (checkStmt.get(spot.spotId)) {
          continue; // Already processed this spot
        }

        // 3. Normalization & Anti-Spam Throttling (RBN skimmer flood protection)
        const rawActivator = (spot.activator || '').toUpperCase().trim();
        const baseActivator = rawActivator.replace(/\/(P|M|MM|AM|[0-9])$/i, '');
        const callKey = baseActivator || rawActivator;

        const freq = spot.frequency || '';
        const band = getBandFromKHz(freq);
        const mode = (spot.mode || '').toUpperCase().trim() || 'SSB';
        const isQrt = /\bQRT\b/i.test(spot.comments || '');
        const throttleKey = `${callKey}@${ref}:${band}:${mode}`;

        const now = Date.now();
        let lastBroadcastTime = recentBroadcasts.get(throttleKey) || 0;

        // If not found in-memory (e.g. after bot restart), check recent spots in SQLite
        if (!lastBroadcastTime) {
          try {
            const recentRows = db.prepare(`
              SELECT created_at, frequency, mode 
              FROM spots 
              WHERE (callsign = ? OR callsign = ? OR callsign LIKE ?)
                AND reference = ? 
                AND source IN ('cluster', 'bot')
                AND msg_id IS NOT NULL
              ORDER BY id DESC 
              LIMIT 10
            `).all(rawActivator, callKey, `${callKey}/%`, ref);

            for (const row of recentRows) {
              const rowBand = getBandFromKHz(row.frequency);
              const rowMode = (row.mode || '').toUpperCase().trim() || 'SSB';
              if (rowBand === band && rowMode === mode) {
                const rowTime = new Date(row.created_at + 'Z').getTime();
                if (!isNaN(rowTime) && rowTime > lastBroadcastTime) {
                  lastBroadcastTime = rowTime;
                }
              }
            }
          } catch (e) {
            // Non-critical fallback
          }
        }

        const elapsedMs = now - lastBroadcastTime;
        if (!isQrt && lastBroadcastTime > 0 && elapsedMs < SPOT_COOLDOWN_MS) {
          // Throttled! Repetitive skimmer spot on same band & mode within cooldown window
          const minsAgo = Math.max(1, Math.round(elapsedMs / 60000));
          console.log(`\x1b[33m[Cluster Spot]\x1b[0m ⏳ Пропуск повторного RBN-спота для \x1b[1m${rawActivator}\x1b[0m @ \x1b[33m${ref}\x1b[0m (${band} ${mode}, респот через ${minsAgo}м при кулдауне ${CLUSTER_SPOT_COOLDOWN_MINUTES}м)`);

          // Record into SQLite as cluster_throttled so we never reprocess this spotId
          try {
            db.prepare(`
              INSERT INTO spots (spot_id, callsign, reference, frequency, mode, comment, source, msg_id)
              VALUES (?, ?, ?, ?, ?, ?, 'cluster_throttled', NULL)
            `).run(spot.spotId, rawActivator, ref, freq, mode, spot.comments || '', null);
          } catch (e) {}

          continue; // Suppress broadcast and notifications
        }

        processedCount++;
        console.log(`\x1b[32m[Cluster Spot]\x1b[0m 📻 Новый спот: \x1b[1m${spot.activator}\x1b[0m @ \x1b[33m${ref}\x1b[0m (${band} ${mode}, ${spot.frequency} kHz)`);

        // 4. Format and Broadcast to Activity Channel
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

          if (isQrt) {
            // Activator went QRT: do NOT pin, unpin earlier pinned spot for this station
            try {
              const prevPinned = db.prepare(`
                SELECT p.message_id 
                FROM pinned_spots p
                JOIN spots s ON s.msg_id = p.message_id
                WHERE p.chat_id = ? AND p.status = 'pinned' AND (s.callsign = ? OR s.callsign = ? OR s.callsign LIKE ?)
              `).all(String(channelId), rawActivator, callKey, `${callKey}/%`);

              for (const row of prevPinned) {
                await pinManager.unpinSpotNow(telegramClient, channelId, row.message_id);
              }
            } catch (pinErr) {}
          } else {
            // Pin spot silently in channel and schedule auto-unpin after configured minutes
            try {
              await telegramClient.pinChatMessage(channelId, msgId, { disable_notification: true });
            } catch (pinErr) {}
            pinManager.scheduleSpotUnpin(telegramClient, channelId, msgId);
          }
        } catch (e) {
          console.error(`\x1b[31m[Broadcast Error]\x1b[0m Не удалось отправить спот в канал:`, e.message);
        }

        // 5. Save to DB to prevent duplicate processing (and save msgId for web panel deletion)
        const insertStmt = db.prepare(`
          INSERT INTO spots (spot_id, callsign, reference, frequency, mode, comment, source, msg_id)
          VALUES (?, ?, ?, ?, ?, ?, 'cluster', ?)
        `);
        insertStmt.run(spot.spotId, rawActivator, ref, spot.frequency || '', spot.mode || '', spot.comments || '', msgId);
        
        // Update last broadcast timestamp for this band & mode
        recentBroadcasts.set(throttleKey, Date.now());

        // 6. Notify Subscribed Users (Callsigns and Parks, matching base callsign too)
        const callsignSubscribers = db.prepare(`
          SELECT s.telegram_id 
          FROM subscriptions s
          LEFT JOIN users u ON u.telegram_id = s.telegram_id
          WHERE s.type = ? AND (s.target = ? OR s.target = ?) AND (u.notifications_enabled IS NULL OR u.notifications_enabled = 1)
        `).all('callsign', rawActivator, callKey);
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

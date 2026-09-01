import { potaApi } from '../api/potaApi.js';
import db from '../db/database.js';
import dotenv from 'dotenv';
dotenv.config();

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '60000', 10);
const ACTIVITY_CHANNEL_ID = process.env.ACTIVITY_CHANNEL_ID;
const ALLOWED_PREFIXES = (process.env.ALLOWED_PREFIXES || 'RU-,BY-,KZ-').split(',').map(p => p.trim());

export const startClusterWorker = (telegramClient) => {
  console.log(`[Cluster Worker] Started. Polling every ${POLL_INTERVAL_MS}ms. Prefix filter: ${ALLOWED_PREFIXES.join(', ')}`);

  setInterval(async () => {
    try {
      const spots = await potaApi.getSpots();
      if (!Array.isArray(spots)) return;
      
      for (const spot of spots) {
        // 1. GEO Filter (Check reference prefix)
        const ref = spot.reference || '';
        const isAllowed = ALLOWED_PREFIXES.some(prefix => ref.startsWith(prefix));
        if (!isAllowed) continue;

        // 2. Deduplication Check
        // spotId is a unique identifier from the POTA API
        if (!spot.spotId) continue; 
        
        const checkStmt = db.prepare('SELECT id FROM spots WHERE spot_id = ?');
        if (checkStmt.get(spot.spotId)) {
          continue; // Already processed this spot
        }

        // 3. Save to DB to prevent duplicate processing
        const insertStmt = db.prepare(`
          INSERT INTO spots (spot_id, callsign, reference, frequency, mode, comment, source)
          VALUES (?, ?, ?, ?, ?, ?, 'cluster')
        `);
        insertStmt.run(spot.spotId, spot.activator, ref, spot.frequency || '', spot.mode || '', spot.comments || '',);

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
                    
        try {
          await telegramClient.sendMessage(channelId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
        } catch (e) {
          console.error('[Cluster Worker] Failed to send spot to channel:', e.message);
        }
        
        // 5. Notify Subscribed Users
        const subsStmt = db.prepare('SELECT telegram_id FROM subscriptions WHERE target_callsign = ?');
        const subscribers = subsStmt.all((spot.activator || '').toUpperCase());
        
        for (const sub of subscribers) {
          try {
            await telegramClient.sendMessage(sub.telegram_id, `🔔 <b>Уведомление о подписке!</b>\n\n${msg}`, { parse_mode: 'HTML', disable_web_page_preview: true });
          } catch (e) {
            console.error(`[Cluster Worker] Failed to notify subscriber ${sub.telegram_id}:`, e.message);
          }
        }
      }
    } catch (error) {
      console.error('[Cluster Worker] Error during poll cycle:', error.message);
    }
  }, POLL_INTERVAL_MS);
};

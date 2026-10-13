import { potaApi } from '../api/potaApi.js';
import db from '../db/database.js';
import { locationService } from './locationService.js';
import { getBaseCallsign, isBroadcastMutedCallsign } from '../bot/utils.js';
import dotenv from 'dotenv';

dotenv.config();

const ACTIVITY_CHANNEL_ID = process.env.ACTIVITY_CHANNEL_ID;
const ALLOWED_PREFIXES = (process.env.ALLOWED_PREFIXES || 'RU-,BY-,KZ-').split(',').map(p => p.trim());
const SCHEDULE_POLL_INTERVAL_MS = parseInt(process.env.SCHEDULE_POLL_INTERVAL_MS || '300000', 10); // default 5 minutes

// Callsign prefix regex for RU / CIS operators
const CIS_CALLSIGN_REGEX = /^(R[A-Z0-9]|UA|UB|UC|UD|UE|UF|UG|UH|UI|RA|RN|RK|RU|RV|RW|RX|RY|RZ|EW|EV|UN|UL|UP|UQ)/;

/**
 * Format Telegram HTML announcement for a scheduled activation
 */
export function formatScheduleAnnouncement(plan) {
  const baseCall = getBaseCallsign(plan.activator);
  const actLink = `<a href="https://next.pota.app/profile/${encodeURIComponent(baseCall)}">${plan.activator}</a>`;
  const refLink = `<a href="https://next.pota.app/park/${plan.reference}">${plan.reference}</a>`;

  const dateText = plan.startDate === plan.endDate || !plan.endDate
    ? plan.startDate
    : `${plan.startDate} – ${plan.endDate}`;
  const timeText = plan.startTime
    ? (plan.endTime ? `${plan.startTime}–${plan.endTime} UTC` : `${plan.startTime} UTC`)
    : '';

  const locResolved = locationService.resolveLocation(plan.locationDesc || '', plan.reference);
  const locParts = [];
  if (locResolved.flag && locResolved.flag !== '🌐') locParts.push(locResolved.flag);
  if (locResolved.countryName) locParts.push(locResolved.countryName);
  if (locResolved.regionName) locParts.push(locResolved.regionName);
  const locLine = locParts.length > 0 ? `\n📍 <b>${locParts.join(' • ')}</b>` : '';

  const parkTitle = plan.name ? ` — <i>${plan.name}</i>` : '';
  const freqLine = plan.frequencies ? `\n⚙️ Диапазоны / моды: <i>${plan.frequencies}</i>` : '';
  const commClean = plan.comments ? plan.comments.replace(/<[^>]+>/g, '').trim() : '';
  const commLine = commClean ? `\n📝 Примечание: <i>${commClean}</i>` : '';

  return `🗓 <b>Анонс активации POTA</b>\n\n` +
         `📻 <b>${actLink}</b> планирует выезд:\n` +
         `📅 <b>${dateText}</b>${timeText ? ` (${timeText})` : ''}\n` +
         `🏞️ <b>${refLink}</b>${parkTitle}${locLine}${freqLine}${commLine}`;
}

/**
 * Dispatch notification for scheduled activation to subscribers
 */
function dispatchScheduleSubscriberNotification(telegramClient, userId, plan, htmlMsg) {
  try {
    const locResolved = locationService.resolveLocation(plan.locationDesc || '', plan.reference || '');
    const locParts = [];
    if (locResolved.flag && locResolved.flag !== '🌐') locParts.push(locResolved.flag);
    if (locResolved.countryName) locParts.push(locResolved.countryName);
    if (locResolved.regionName) locParts.push(locResolved.regionName);
    const cleanLoc = locParts.length > 0 ? locParts.join(' • ') : '';

    const dateText = plan.startDate === plan.endDate || !plan.endDate ? plan.startDate : `${plan.startDate}–${plan.endDate}`;
    const cleanMsg = [
      `📅 ${dateText}`,
      plan.name ? plan.name : '',
      cleanLoc,
      plan.frequencies ? `⚙️ ${plan.frequencies}` : '',
      plan.comments ? `📝 ${plan.comments.replace(/<[^>]+>/g, '').trim()}` : ''
    ].filter(Boolean).join(' • ');

    db.prepare(`
      INSERT INTO user_notifications (user_id, type, title, message, callsign, reference, frequency, mode, spot_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      'schedule_announced',
      `🗓 Новый анонс: ${plan.activator} @ ${plan.reference}`,
      cleanMsg,
      plan.activator,
      plan.reference,
      plan.frequencies || null,
      null,
      plan.startDate || null
    );
  } catch (e) {
    console.warn(`[Schedule Worker] Failed to save user_notification for user ${userId}:`, e.message);
  }

  // Telegram Direct Message
  if (telegramClient) {
    telegramClient.sendMessage(userId, htmlMsg, {
      parse_mode: 'HTML',
      disable_web_page_preview: true
    }).catch(err => {
      if (err.description && (err.description.includes('blocked') || err.description.includes('chat not found'))) {
        try {
          db.prepare('UPDATE users SET notifications_enabled = 0 WHERE telegram_id = ?').run(userId);
        } catch (_) {}
      }
    });
  }
}

/**
 * Start background worker to monitor new scheduled activations
 */
export function startScheduleWorker(telegramClient) {
  console.log(`\x1b[36m[Schedule Worker]\x1b[0m 🚀 Запуск службы мониторинга анонсов POTA (интервал: ${Math.round(SCHEDULE_POLL_INTERVAL_MS / 1000)}с)...`);

  const pollSchedules = async () => {
    try {
      const plans = await potaApi.getScheduledActivations();
      if (!Array.isArray(plans) || plans.length === 0) return;

      const todayStr = new Date().toISOString().slice(0, 10);

      // Check if scheduled_broadcasts is completely empty
      // If table is completely empty, seed it with current plans without spamming channel on very first boot
      const countRow = db.prepare('SELECT COUNT(*) as count FROM scheduled_broadcasts').get();
      const isInitialBoot = !countRow || countRow.count === 0;

      const checkStmt = db.prepare('SELECT scheduled_id FROM scheduled_broadcasts WHERE scheduled_id = ?');
      const insertStmt = db.prepare(`
        INSERT INTO scheduled_broadcasts (scheduled_id, activator, reference, start_date, end_date, msg_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      let newCount = 0;

      for (const plan of plans) {
        if (!plan.scheduledActivitiesId) continue;

        // Skip plans that have already ended in the past
        const endDate = plan.endDate || plan.startDate || '';
        if (endDate && endDate < todayStr) continue;

        const ref = (plan.reference || '').toUpperCase().trim();
        const act = (plan.activator || '').toUpperCase().trim();
        const isRuPark = ALLOWED_PREFIXES.some(prefix => ref.startsWith(prefix));
        const isRuCall = CIS_CALLSIGN_REGEX.test(act);

        // Filter: only announce RU/CIS relevant parks or operators
        if (!isRuPark && !isRuCall) continue;

        // Check if already broadcasted
        const existing = checkStmt.get(plan.scheduledActivitiesId);
        if (existing) continue;

        // On very first cold-start boot with clean DB, seed existing plans silently
        if (isInitialBoot) {
          try {
            insertStmt.run(plan.scheduledActivitiesId, act, ref, plan.startDate || '', plan.endDate || '', null);
          } catch (_) {}
          continue;
        }

        // New schedule found!
        newCount++;
        console.log(`\x1b[32m[Schedule Worker]\x1b[0m 🗓 Новый анонс POTA: \x1b[1m${act}\x1b[0m @ \x1b[33m${ref}\x1b[0m (${plan.startDate})`);

        const baseCall = getBaseCallsign(act);
        const callKey = act.replace(/\/(P|M|MM|AM|[0-9])$/i, '');
        const isMuted = isBroadcastMutedCallsign(act) || isBroadcastMutedCallsign(callKey) || isBroadcastMutedCallsign(baseCall);

        const htmlMsg = formatScheduleAnnouncement(plan);
        let msgId = null;

        // Broadcast to Activity Channel if not muted
        if (!isMuted && ACTIVITY_CHANNEL_ID && telegramClient) {
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
            const sentMsg = await telegramClient.sendMessage(channelId, htmlMsg, {
              parse_mode: 'HTML',
              disable_web_page_preview: true
            });
            msgId = sentMsg.message_id;
            console.log(`\x1b[34m[Broadcast]\x1b[0m 📢 Анонс активации ${act} @ ${ref} опубликован в канал`);
          } catch (e) {
            console.error(`\x1b[31m[Broadcast Error]\x1b[0m Не удалось отправить анонс в канал:`, e.message);
          }
        }

        // Record to DB as broadcasted
        try {
          insertStmt.run(plan.scheduledActivitiesId, act, ref, plan.startDate || '', plan.endDate || '', msgId);
        } catch (dbErr) {
          console.warn('[Schedule Worker] DB insert warning:', dbErr.message);
        }

        // Notify Personal Subscribers (callsign & park subscriptions)
        if (telegramClient) {
          try {
            const callsignSubscribers = db.prepare(`
              SELECT s.telegram_id 
              FROM subscriptions s
              LEFT JOIN users u ON u.telegram_id = s.telegram_id
              WHERE s.type = ? AND (s.target = ? OR s.target = ? OR s.target = ?) AND (u.notifications_enabled IS NULL OR u.notifications_enabled = 1)
            `).all('callsign', act, callKey, baseCall);

            const parkSubscribers = db.prepare(`
              SELECT s.telegram_id 
              FROM subscriptions s
              LEFT JOIN users u ON u.telegram_id = s.telegram_id
              WHERE s.type = ? AND s.target = ? AND (u.notifications_enabled IS NULL OR u.notifications_enabled = 1)
            `).all('park', ref);

            const subscribersToNotify = new Set();
            for (const sub of callsignSubscribers) subscribersToNotify.add(sub.telegram_id);
            for (const sub of parkSubscribers) subscribersToNotify.add(sub.telegram_id);

            for (const userId of subscribersToNotify) {
              dispatchScheduleSubscriberNotification(telegramClient, userId, plan, htmlMsg);
            }
          } catch (subErr) {
            console.warn('[Schedule Worker] Subscriptions notification warning:', subErr.message);
          }
        }
      }

      if (isInitialBoot) {
        console.log(`\x1b[36m[Schedule Worker]\x1b[0m ℹ️ База анонсов инициализирована (сохранено текущих планов: ${plans.length})`);
      }
    } catch (err) {
      console.warn(`\x1b[33m[Schedule Worker]\x1b[0m ⚠️ Ошибка цикла проверки анонсов: ${err.message}`);
    }
  };

  // Run on startup
  pollSchedules();

  // Schedule regular loop
  setInterval(pollSchedules, SCHEDULE_POLL_INTERVAL_MS);
}

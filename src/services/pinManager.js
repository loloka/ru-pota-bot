import db from '../db/database.js';
import dotenv from 'dotenv';
dotenv.config();

const DEFAULT_PIN_MINUTES = parseInt(process.env.SPOT_PIN_DURATION_MINUTES || '30', 10);
const DEFAULT_PIN_DURATION_MS = DEFAULT_PIN_MINUTES * 60 * 1000;
export const DELETE_EXPIRED_SPOTS_IN_GROUP = process.env.DELETE_EXPIRED_SPOTS_IN_GROUP !== 'false';

/**
 * Check if given chat ID or chat object matches the configured ACTIVITY_CHANNEL_ID
 * @param {string|number|Object} chatOrId 
 * @returns {boolean}
 */
export function isChannelChat(chatOrId) {
  if (!chatOrId) return false;
  const rawChannel = process.env.ACTIVITY_CHANNEL_ID;
  if (!rawChannel) return false;

  const channelClean = String(rawChannel)
    .replace(/^-100/, '')
    .replace(/^@/, '')
    .replace(/.*t\.me\//, '')
    .trim()
    .toLowerCase();

  if (typeof chatOrId === 'object') {
    if (chatOrId.id && isChannelChat(chatOrId.id)) return true;
    if (chatOrId.username && chatOrId.username.toLowerCase() === channelClean) return true;
    return false;
  }

  const idClean = String(chatOrId)
    .replace(/^-100/, '')
    .replace(/^@/, '')
    .trim()
    .toLowerCase();

  return idClean === channelClean || String(chatOrId) === String(rawChannel);
}

/**
 * Get configured or default permanent pinned message ID for the activity channel (e.g. msg 25)
 * @returns {number|null}
 */
export function getPermanentChannelPinId() {
  if (process.env.ACTIVITY_CHANNEL_PINNED_MSG_ID) {
    const val = parseInt(process.env.ACTIVITY_CHANNEL_PINNED_MSG_ID, 10);
    if (!isNaN(val) && val > 0) return val;
  }
  const rawChannel = String(process.env.ACTIVITY_CHANNEL_ID || '').toLowerCase();
  if (rawChannel.includes('pota_activity') || rawChannel.includes('3954691719')) {
    return 25;
  }
  return 25; // Default fallback to message 25 for activity channel
}

export const pinManager = {
  /**
   * Schedule a spot message to be unpinned after delayMs
   * @param {Object} telegramClient 
   * @param {string|number} chatId 
   * @param {number} messageId 
   * @param {number} [delayMs] 
   */
  scheduleSpotUnpin(telegramClient, chatId, messageId, delayMs = DEFAULT_PIN_DURATION_MS, channelMsgId = null) {
    if (!chatId || !messageId) return;
    const now = Date.now();
    const unpinAt = now + delayMs;

    try {
      db.prepare(`
        INSERT INTO pinned_spots (chat_id, message_id, channel_msg_id, pinned_at, unpin_at, status)
        VALUES (?, ?, ?, ?, ?, 'pinned')
        ON CONFLICT(chat_id, message_id) DO UPDATE SET 
          channel_msg_id = coalesce(excluded.channel_msg_id, pinned_spots.channel_msg_id),
          unpin_at = excluded.unpin_at, 
          status = 'pinned'
      `).run(String(chatId), Number(messageId), channelMsgId ? Number(channelMsgId) : null, now, unpinAt);

      const mins = Math.round(delayMs / 60000);
      console.log(`\x1b[35m[Pin Manager]\x1b[0m 📌 Запланировано авто-открепление спота (чат \x1b[33m${chatId}\x1b[0m, msg \x1b[36m${messageId}\x1b[0m) через ${mins} мин.`);
    } catch (err) {
      console.warn('[Pin Manager] ⚠️ Ошибка сохранения таймера открепления:', err.message);
    }
  },

  /**
   * Immediately unpin a spot from a chat (and delete from group if not activity channel)
   * If chatId is the channel, also cleans up linked auto-forwarded posts in discussion groups!
   * @param {Object} telegramClient 
   * @param {string|number} chatId 
   * @param {number} messageId 
   */
  async unpinSpotNow(telegramClient, chatId, messageId) {
    if (!chatId || !messageId || !telegramClient) return;
    try {
      await telegramClient.unpinChatMessage(chatId, messageId);
      console.log(`\x1b[35m[Pin Manager]\x1b[0m 📍 Спот мгновенно откреплен (чат ${chatId}, msg ${messageId})`);
    } catch (err) {
      // Ignored if already unpinned or deleted
    }

    if (DELETE_EXPIRED_SPOTS_IN_GROUP && !isChannelChat(chatId)) {
      try {
        await telegramClient.deleteMessage(chatId, messageId);
        console.log(`\x1b[35m[Pin Manager]\x1b[0m 🗑️ Спот мгновенно удален из группы (чат ${chatId}, msg ${messageId})`);
      } catch (delErr) {
        // Ignored if already deleted or bot lacks permission
      }
    }

    try {
      db.prepare("UPDATE pinned_spots SET status = 'unpinned' WHERE chat_id = ? AND message_id = ?").run(String(chatId), Number(messageId));
    } catch (e) {}

    // If unpinning a spot in the channel, also clean up linked forwarded posts in discussion groups
    if (isChannelChat(chatId)) {
      try {
        const linkedGroupSpots = db.prepare(`
          SELECT id, chat_id, message_id 
          FROM pinned_spots 
          WHERE channel_msg_id = ? AND status = 'pinned' AND chat_id != ?
        `).all(Number(messageId), String(chatId));

        for (const linked of linkedGroupSpots) {
          try {
            await telegramClient.unpinChatMessage(linked.chat_id, linked.message_id);
          } catch (e) {}
          if (DELETE_EXPIRED_SPOTS_IN_GROUP) {
            try {
              await telegramClient.deleteMessage(linked.chat_id, linked.message_id);
              console.log(`\x1b[35m[Pin Manager]\x1b[0m 🗑️ Связанный спот мгновенно удален из группы (чат ${linked.chat_id}, msg ${linked.message_id})`);
            } catch (e) {}
          }
          try {
            db.prepare("UPDATE pinned_spots SET status = 'unpinned' WHERE id = ?").run(linked.id);
          } catch (e) {}
        }
      } catch (linkedErr) {
        console.warn('[Pin Manager] ⚠️ Ошибка очистки связанных спотов в группах:', linkedErr.message);
      }
    }
  },

  /**
   * Start background worker that unpins expired spots periodically and cleans up group chats
   * @param {Object} telegramClient 
   * @param {number} [checkIntervalMs] 
   */
  startPinWorker(telegramClient, checkIntervalMs = 30000) {
    console.log(`\x1b[35m[Pin Manager]\x1b[0m 🚀 Запущен воркер авто-открепления спотов (интервал: ${Math.round(checkIntervalMs / 1000)}с, таймаут: ${DEFAULT_PIN_MINUTES} мин., авто-удаление в группах: ${DELETE_EXPIRED_SPOTS_IN_GROUP ? 'вкл' : 'выкл'})`);

    const checkAndUnpin = async () => {
      try {
        const now = Date.now();
        const expiredSpots = db.prepare(`
          SELECT id, chat_id, message_id 
          FROM pinned_spots 
          WHERE status = 'pinned' AND unpin_at <= ?
          LIMIT 20
        `).all(now);

        for (const spot of expiredSpots) {
          // 1. Unpin from chat (channel or group)
          try {
            await telegramClient.unpinChatMessage(spot.chat_id, spot.message_id);
            console.log(`\x1b[35m[Pin Manager]\x1b[0m 📍 Спот успешно откреплен по таймеру (чат \x1b[33m${spot.chat_id}\x1b[0m, msg \x1b[36m${spot.message_id}\x1b[0m)`);
          } catch (err) {
            const msg = err.message || '';
            if (!msg.includes('message is not pinned') && !msg.includes('message to unpin not found') && !msg.includes('chat not found')) {
              console.warn(`\x1b[35m[Pin Manager]\x1b[0m ⚠️ Не удалось открепить msg ${spot.message_id} в ${spot.chat_id}: ${msg}`);
            }
          }

          // 2. In discussion / main groups: delete the spot message so the chat isn't cluttered!
          // In the channel, the spot is preserved in history as intended.
          if (DELETE_EXPIRED_SPOTS_IN_GROUP && !isChannelChat(spot.chat_id)) {
            try {
              await telegramClient.deleteMessage(spot.chat_id, spot.message_id);
              console.log(`\x1b[35m[Pin Manager]\x1b[0m 🗑️ Спот удален из группы по таймеру (чат \x1b[33m${spot.chat_id}\x1b[0m, msg \x1b[36m${spot.message_id}\x1b[0m)`);
            } catch (delErr) {
              const dMsg = delErr.message || '';
              if (!dMsg.includes('message to delete not found') && !dMsg.includes('chat not found')) {
                console.warn(`\x1b[35m[Pin Manager]\x1b[0m ⚠️ Не удалось удалить спот из группы ${spot.chat_id}: ${dMsg}`);
              }
            }
          }

          db.prepare("UPDATE pinned_spots SET status = 'unpinned' WHERE id = ?").run(spot.id);

          // If this was a channel spot, also clean up linked messages in discussion groups
          if (isChannelChat(spot.chat_id)) {
            try {
              const linkedGroupSpots = db.prepare(`
                SELECT id, chat_id, message_id 
                FROM pinned_spots 
                WHERE channel_msg_id = ? AND status = 'pinned' AND chat_id != ?
              `).all(Number(spot.message_id), String(spot.chat_id));

              for (const linked of linkedGroupSpots) {
                try {
                  await telegramClient.unpinChatMessage(linked.chat_id, linked.message_id);
                } catch (e) {}
                if (DELETE_EXPIRED_SPOTS_IN_GROUP) {
                  try {
                    await telegramClient.deleteMessage(linked.chat_id, linked.message_id);
                    console.log(`\x1b[35m[Pin Manager]\x1b[0m 🗑️ Связанный спот удален из группы по таймеру канала (чат ${linked.chat_id}, msg ${linked.message_id})`);
                  } catch (e) {}
                }
                try {
                  db.prepare("UPDATE pinned_spots SET status = 'unpinned' WHERE id = ?").run(linked.id);
                } catch (e) {}
              }
            } catch (linkedErr) {}
          }
        }

        // Ensure permanent welcome/navigation message (e.g. msg 25) remains pinned in activity channel
        await pinManager.ensurePermanentChannelPin(telegramClient);
      } catch (err) {
        console.error('[Pin Manager] ❌ Ошибка в цикле проверки:', err.message);
      }
    };

    // Run first check right away, then interval
    checkAndUnpin().catch(() => {});
    return setInterval(checkAndUnpin, checkIntervalMs);
  },

  /**
   * Pins a spot message silently in the activity channel, schedules its auto-unpin,
   * and automatically cleans up any service message ("pinned a message") generated by Telegram.
   * @param {Object} telegramClient 
   * @param {string|number} channelId 
   * @param {number} messageId 
   * @param {number} [delayMs] 
   */
  async pinSpotInChannel(telegramClient, channelId, messageId, delayMs = DEFAULT_PIN_DURATION_MS) {
    if (!telegramClient || !channelId || !messageId) return;
    try {
      await telegramClient.pinChatMessage(channelId, messageId, { disable_notification: true });
    } catch (e) {
      console.warn(`[Pin Manager] ⚠️ Ошибка закрепления спота msg ${messageId}:`, e.message);
    }

    this.scheduleSpotUnpin(telegramClient, channelId, messageId, delayMs, messageId);

    // Asynchronously delete Telegram's service messages ("pinned a message") after Telegram creates them
    setTimeout(async () => {
      try {
        const realSpotRows = db.prepare("SELECT msg_id FROM spots WHERE msg_id IS NOT NULL").all();
        const realSpotIds = new Set(realSpotRows.map(r => Number(r.msg_id)));

        for (let offset = 1; offset <= 3; offset++) {
          const candidateId = Number(messageId) + offset;
          if (!realSpotIds.has(candidateId)) {
            try {
              await telegramClient.deleteMessage(channelId, candidateId);
            } catch (e) {}
          }
        }
      } catch (e) {}
    }, 600);
  },

  /**
   * Ensure permanent welcome/navigation message (e.g. msg 25) remains pinned in the activity channel
   * @param {Object} telegramClient 
   */
  async ensurePermanentChannelPin(telegramClient) {
    const rawChannel = process.env.ACTIVITY_CHANNEL_ID;
    if (!rawChannel || !telegramClient) return;

    let channelId = rawChannel;
    if (channelId && !channelId.startsWith('-100') && !channelId.startsWith('@') && /^[0-9-]+$/.test(channelId)) {
      channelId = channelId.startsWith('-') ? `-100${channelId.substring(1)}` : `-100${channelId}`;
    } else if (channelId && channelId.includes('t.me/')) {
      channelId = `@${channelId.split('t.me/')[1].replace('/', '')}`;
    }

    const permanentPinId = getPermanentChannelPinId();
    if (!permanentPinId) return;

    try {
      const chat = await telegramClient.getChat(channelId);
      // Check if permanentPinId is currently pinned
      const activePinsCount = db.prepare(`
        SELECT COUNT(*) as count 
        FROM pinned_spots 
        WHERE (chat_id = ? OR chat_id = ?) AND status = 'pinned'
      `).get(String(channelId), String(rawChannel))?.count || 0;

      // If nothing is pinned, or if no spots are active and current pinned message is not permanentPinId:
      if (!chat?.pinned_message || (activePinsCount === 0 && chat.pinned_message.message_id !== permanentPinId)) {
        await telegramClient.pinChatMessage(channelId, permanentPinId, { disable_notification: true });
        console.log(`\x1b[35m[Pin Manager]\x1b[0m 📌 Закреплен постоянный пост канала: msg ${permanentPinId}`);
        // Give Telegram 600ms to insert the service message at the tail, then clean it up
        setTimeout(async () => {
          try {
            await this.cleanupChannelServiceMessages(telegramClient);
          } catch (e) {}
        }, 600);
      }
    } catch (e) {
      // Ignored if bot lacks permission or post not found
    }
  },

  /**
   * Clean up all Telegram service messages ("pinned a message", "pinned a deleted message")
   * and stale pins from the activity channel.
   * Guarantees all valid spot posts and permanent pinned post remain untouched.
   * NEVER sends visible probe messages to the channel.
   * @param {Object} telegramClient 
   * @returns {Promise<{ deletedCount: number, unpinnedCount: number }>}
   */
  async cleanupChannelServiceMessages(telegramClient) {
    const rawChannel = process.env.ACTIVITY_CHANNEL_ID;
    if (!rawChannel || !telegramClient) return { deletedCount: 0, unpinnedCount: 0 };

    let channelId = rawChannel;
    if (channelId && !channelId.startsWith('-100') && !channelId.startsWith('@') && /^[0-9-]+$/.test(channelId)) {
      channelId = channelId.startsWith('-') ? `-100${channelId.substring(1)}` : `-100${channelId}`;
    } else if (channelId && channelId.includes('t.me/')) {
      channelId = `@${channelId.split('t.me/')[1].replace('/', '')}`;
    }

    let deletedCount = 0;
    let unpinnedCount = 0;

    try {
      // 1. Get all known valid spot msg_ids from SQLite to guarantee we NEVER touch real spots
      const realSpotRows = db.prepare("SELECT msg_id FROM spots WHERE msg_id IS NOT NULL").all();
      const realSpotIds = new Set(realSpotRows.map(r => Number(r.msg_id)));

      // 2. Determine highest known message ID from DB and chat metadata (WITHOUT sending any dummy probe messages!)
      const maxSpotRow = db.prepare("SELECT MAX(msg_id) as max_id FROM spots WHERE msg_id IS NOT NULL").get();
      const maxPinRow = db.prepare("SELECT MAX(message_id) as max_id FROM pinned_spots").get();
      const maxChanPinRow = db.prepare("SELECT MAX(channel_msg_id) as max_id FROM pinned_spots").get();
      const maxUserSpotRow = db.prepare("SELECT MAX(last_spot_msg_id) as max_id FROM users WHERE last_spot_msg_id IS NOT NULL").get();

      let currentPinnedId = null;
      try {
        const chat = await telegramClient.getChat(channelId);
        if (chat?.pinned_message?.message_id) {
          currentPinnedId = Number(chat.pinned_message.message_id);
        }
      } catch (e) {}

      const permanentPinId = getPermanentChannelPinId();

      const maxKnownId = Math.max(
        Number(maxSpotRow?.max_id || 0),
        Number(maxPinRow?.max_id || 0),
        Number(maxChanPinRow?.max_id || 0),
        Number(maxUserSpotRow?.max_id || 0),
        currentPinnedId || 0,
        permanentPinId || 0
      );

      if (maxKnownId > 0) {
        // Scan backwards up to 300 messages, AND forward up to 50 messages past maxKnownId
        // (to clean any lingering service messages like "POTA activity закрепил(а)...")
        const startId = Math.max(1, maxKnownId - 300);
        const endId = maxKnownId + 50;
        console.log(`\x1b[35m[Pin Manager]\x1b[0m 🧹 Запущена очистка сервисных сообщений в канале ${channelId} (диапазон msg ${startId}..${endId})...`);

        let consecutiveNotFoundPastMax = 0;
        for (let id = startId; id <= endId; id++) {
          // NEVER touch valid spots!
          if (realSpotIds.has(id)) continue;
          // NEVER touch permanent channel post (e.g. msg 25)!
          if (permanentPinId && id === permanentPinId) continue;
          // NEVER touch active pinned welcome post if set
          if (currentPinnedId && id === currentPinnedId) continue;

          try {
            await telegramClient.deleteMessage(channelId, id);
            deletedCount++;
            console.log(`\x1b[35m[Pin Manager]\x1b[0m 🗑️ Удалено сервисное/лишнее сообщение в канале: msg ${id}`);
            consecutiveNotFoundPastMax = 0;
            // Polite pause to stay well below Telegram rate limits
            await new Promise(r => setTimeout(r, 40));
          } catch (delErr) {
            if (id > maxKnownId) {
              consecutiveNotFoundPastMax++;
              // If 10 consecutive messages do not exist past the max known ID, we've reached the end of channel history
              if (consecutiveNotFoundPastMax >= 10) {
                break;
              }
            }
          }
        }
        console.log(`\x1b[35m[Pin Manager]\x1b[0m ✅ Очистка канала завершена: удалено ${deletedCount} сервисных сообщений`);
      }

      // 3. Unpin expired spots in channel (> 30 min)
      const now = Date.now();
      const expiredPins = db.prepare(`
        SELECT id, message_id 
        FROM pinned_spots 
        WHERE (chat_id = ? OR chat_id = ?) AND status = 'pinned' AND unpin_at <= ?
      `).all(String(channelId), String(rawChannel), now);

      for (const pin of expiredPins) {
        try {
          await telegramClient.unpinChatMessage(channelId, pin.message_id);
          unpinnedCount++;
        } catch (e) {}
        db.prepare("UPDATE pinned_spots SET status = 'unpinned' WHERE id = ?").run(pin.id);
      }

      // 4. Ensure permanent channel post remains pinned in the channel header
      await this.ensurePermanentChannelPin(telegramClient);

    } catch (err) {
      console.warn('[Pin Manager] ⚠️ Ошибка при очистке канала:', err.message);
    }

    return { deletedCount, unpinnedCount };
  }
};

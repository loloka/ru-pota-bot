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
      } catch (err) {
        console.error('[Pin Manager] ❌ Ошибка в цикле проверки:', err.message);
      }
    };

    // Run first check right away, then interval
    checkAndUnpin().catch(() => {});
    return setInterval(checkAndUnpin, checkIntervalMs);
  }
};

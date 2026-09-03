import { potaApi } from '../../api/potaApi.js';
import { deleteUserMessage } from '../utils.js';

/**
 * Extracts base callsign from slashed callsigns (e.g., R9OGL/P -> R9OGL, UA9/R9OGL -> R9OGL)
 * so profile links lead to the correct user page on next.pota.app.
 * @param {string} callsign 
 * @returns {string} Base callsign
 */
export function getBaseCallsign(callsign = '') {
  const clean = callsign.trim().toUpperCase();
  if (!clean.includes('/')) return clean;
  const parts = clean.split('/');
  const validParts = parts.filter(p => /[A-Z]/.test(p) && /[0-9]/.test(p));
  if (validParts.length > 0) {
    return validParts.reduce((a, b) => a.length >= b.length ? a : b);
  }
  return parts.reduce((a, b) => a.length >= b.length ? a : b);
}

/**
 * Formats frequency into MHz with 3 decimal places (e.g., 7140 -> 7.140 MHz, 14044 -> 14.044 MHz).
 * @param {string|number} freq 
 * @returns {string} Formatted frequency string
 */
export function formatFrequency(freq) {
  if (!freq) return 'N/A';
  const num = parseFloat(freq);
  if (isNaN(num)) return String(freq);
  const mhz = num > 100 ? num / 1000 : num;
  return `${mhz.toFixed(3)} MHz`;
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Formats elapsed minutes into human-readable text.
 * Escapes < as &lt; for Telegram HTML parser.
 * @param {number} diffMinutes 
 * @returns {string} e.g. "5 мин назад", "&lt; 1 мин назад"
 */
export function formatMinutesAgo(diffMinutes) {
  if (diffMinutes <= 0) return '&lt; 1 мин назад';
  return `${diffMinutes} мин назад`;
}

function formatSpotExtra(s) {
  if (s.comments && s.comments.trim()) {
    let c = s.comments.trim();
    if (c.length > 55) c = c.slice(0, 52) + '...';
    let line = `\n  💬 ${escapeHtml(c)}`;
    if (s.spotter && !c.includes(s.spotter)) {
      line += ` [${escapeHtml(s.spotter)}]`;
    }
    return line;
  } else if (s.spotter && s.spotter !== s.activator) {
    return `\n  👤 Споттер: ${escapeHtml(s.spotter)}`;
  }
  return '';
}

function renderSpotItem(s) {
  const actLink = `<b><a href="https://next.pota.app/profile/${encodeURIComponent(s.baseCall)}">${escapeHtml(s.activator)}</a></b>`;
  const parkLink = `<b><a href="https://next.pota.app/park/${encodeURIComponent(s.reference)}">${escapeHtml(s.reference)}</a></b>`;
  let loc = '';
  if (s.locationDesc) {
    const primaryLoc = s.locationDesc.split(',')[0].trim();
    if (primaryLoc) loc = ` (${escapeHtml(primaryLoc)})`;
  }
  const freq = formatFrequency(s.frequency);
  const mode = escapeHtml(s.mode || 'N/A');
  const timeAgo = formatMinutesAgo(s.diffMinutes);
  const extra = formatSpotExtra(s);
  return `• ${actLink} @ ${parkLink}${loc}\n  Частота: ${freq} (${mode}) | ${timeAgo}${extra}`;
}

/**
 * Fetches spots and generates formatted HTML message and reply markup.
 * @param {'mix'|'ru'|'auto'} requestedMode 
 * @param {number|string} userId 
 * @returns {Promise<{text: string, reply_markup: object}>}
 */
export async function fetchAndFormatOnAir(requestedMode = 'mix', userId = '') {
  const allowedPrefixes = (process.env.ALLOWED_PREFIXES || 'RU-,BY-,KZ-')
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);

  const allSpots = await potaApi.getSpots();
  const now = Date.now();

  const ruSpots = [];
  const worldSpots = [];

  if (Array.isArray(allSpots)) {
    for (const spot of allSpots) {
      if (!spot.spotTime) continue;
      const spotDate = new Date(spot.spotTime.endsWith('Z') ? spot.spotTime : spot.spotTime + 'Z');
      const diffMs = now - spotDate.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);

      const ref = spot.reference || '';
      const isRu = allowedPrefixes.some(p => ref.startsWith(p));

      // RU/CIS: within last 40 minutes (with small clock skew tolerance)
      if (isRu && diffMinutes >= -1 && diffMinutes <= 40) {
        ruSpots.push({
          ...spot,
          diffMinutes: Math.max(0, diffMinutes),
          timestamp: spotDate.getTime()
        });
      }

      // World: within last 15 minutes
      if (diffMinutes >= -1 && diffMinutes <= 15) {
        worldSpots.push({
          ...spot,
          diffMinutes: Math.max(0, diffMinutes),
          timestamp: spotDate.getTime()
        });
      }
    }
  }

  // Sort RU spots (newest first) - keep re-spots to show all live activity
  ruSpots.sort((a, b) => b.timestamp - a.timestamp);
  const seenRuSpotIds = new Set();
  const processedRu = [];
  for (const s of ruSpots) {
    if (s.spotId && seenRuSpotIds.has(s.spotId)) continue;
    if (s.spotId) seenRuSpotIds.add(s.spotId);
    processedRu.push({ ...s, baseCall: getBaseCallsign(s.activator || '') });
  }

  // Sort World spots (newest first) - exclude exact spots already in RU section
  worldSpots.sort((a, b) => b.timestamp - a.timestamp);
  const seenWorldSpotIds = new Set(seenRuSpotIds);
  const processedWorld = [];
  for (const s of worldSpots) {
    if (s.spotId && seenWorldSpotIds.has(s.spotId)) continue;
    if (s.spotId) seenWorldSpotIds.add(s.spotId);
    processedWorld.push({ ...s, baseCall: getBaseCallsign(s.activator || '') });
  }

  let activeMode = requestedMode === 'auto' ? 'mix' : requestedMode;
  const deleteBtn = [{ text: '❌ Удалить сообщение', callback_data: `delete_msg:${userId}` }];

  if (activeMode === 'ru') {
    // Pure RU mode
    let text = '';
    if (processedRu.length === 0) {
      text = `📻 <b>Сейчас в эфире: RU / СНГ</b>\n\n` +
             `На данный момент в кластере POTA нет активных станций из нашего региона (за последние 40 минут).\n` +
             `Вы можете стать первым — отправьте спот через /spot!`;
    } else {
      text = `📻 <b>СЕЙЧАС В ЭФИРЕ: RU / СНГ (${processedRu.length})</b>\n\n`;
      text += processedRu.map(renderSpotItem).join('\n\n');
    }

    const reply_markup = {
      inline_keyboard: [
        [{ text: '🌐 RU/СНГ + МИР', callback_data: `onair_view:mix:${userId}` }],
        [{ text: '🔄 Обновить', callback_data: `onair_refresh:ru:${userId}` }],
        deleteBtn
      ]
    };

    return { text, reply_markup };
  } else {
    // Unified 'mix' mode (RU stations proudly on top + World stations below)
    let text = '';

    if (processedRu.length > 0) {
      text = `📻 <b>СЕЙЧАС В ЭФИРЕ</b>\n\n` +
             `🌲 <b>НАШ РЕГИОН — RU / СНГ (${processedRu.length}):</b>\n` +
             processedRu.map(renderSpotItem).join('\n\n');

      const worldSlice = processedWorld.slice(0, 10);
      if (worldSlice.length > 0) {
        text += `\n\n🌍 <b>ВЕСЬ МИР (Топ-${worldSlice.length}):</b>\n` +
                worldSlice.map(renderSpotItem).join('\n\n');
      }

      const reply_markup = {
        inline_keyboard: [
          [{ text: '🇷🇺 Только RU/СНГ', callback_data: `onair_view:ru:${userId}` }],
          [{ text: '🔄 Обновить', callback_data: `onair_refresh:mix:${userId}` }],
          deleteBtn
        ]
      };

      return { text, reply_markup };
    } else {
      // In RU/CIS no stations right now -> show friendly notice + World list (top 15)
      const worldSlice = processedWorld.slice(0, 15);
      if (worldSlice.length === 0) {
        text = `📻 <b>Сейчас в эфире: Весь мир</b>\n\n` +
               `На данный момент в кластере POTA нет активных станций за последние 15 минут.`;
      } else {
        text = `📻 <b>СЕЙЧАС В ЭФИРЕ: ВЕСЬ МИР (Топ-${worldSlice.length})</b>\n\n` +
               `ℹ️ В регионе RU/СНГ за 40 мин активности нет. Свежие станции за последние 15 минут:\n\n` +
               worldSlice.map(renderSpotItem).join('\n\n');
      }

      const reply_markup = {
        inline_keyboard: [
          [{ text: '🇷🇺 Проверить RU/СНГ', callback_data: `onair_view:ru:${userId}` }],
          [{ text: '🔄 Обновить', callback_data: `onair_refresh:mix:${userId}` }],
          deleteBtn
        ]
      };

      return { text, reply_markup };
    }
  }
}

/**
 * Main command handler for /onair and keyboard button '📻 Кто в эфире'
 * @param {import('telegraf').Context} ctx 
 */
export const onairHandler = async (ctx) => {
  await deleteUserMessage(ctx);
  const userId = ctx.from?.id;

  try {
    const { text, reply_markup } = await fetchAndFormatOnAir('auto', userId);
    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup,
      disable_web_page_preview: true
    });
  } catch (error) {
    console.error('Error handling /onair:', error);
    await ctx.reply('❌ Ошибка при получении данных из кластера POTA.', {
      reply_markup: {
        inline_keyboard: [[{ text: '❌ Удалить сообщение', callback_data: `delete_msg:${userId}` }]]
      }
    });
  }
};

/**
 * Handler for switching views or refreshing onair list via inline buttons
 * @param {import('telegraf').Context} ctx 
 */
export const onairActionHandler = async (ctx) => {
  const actionType = ctx.match[1]; // 'view' or 'refresh'
  let mode = ctx.match[2]; // 'ru' or 'world'
  let matchUserId = ctx.match[3];

  if (mode && mode.includes(':')) {
    const parts = mode.split(':');
    mode = parts[0];
    matchUserId = parts[1];
  }

  const targetUserId = matchUserId ? parseInt(matchUserId, 10) : ctx.from?.id;
  const clickerId = ctx.from?.id;
  const adminId = parseInt(process.env.ADMIN_ID, 10);
  const isPrivate = ctx.chat?.type === 'private';

  // Permission check: in group chats, only requester, bot admin, or chat admins can interact
  if (!isPrivate && targetUserId && clickerId !== targetUserId && clickerId !== adminId) {
    let isChatAdmin = false;
    try {
      const member = await ctx.getChatMember(clickerId);
      isChatAdmin = ['creator', 'administrator'].includes(member.status);
    } catch (e) {}

    if (!isChatAdmin) {
      return ctx.answerCbQuery('⛔ Управлять этим списком может только автор запроса или администратор.', { show_alert: true });
    }
  }

  try {
    const { text, reply_markup } = await fetchAndFormatOnAir(mode, targetUserId);
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup,
      disable_web_page_preview: true
    });

    if (actionType === 'refresh') {
      await ctx.answerCbQuery('🔄 Список обновлен');
    } else {
      await ctx.answerCbQuery(mode === 'ru' ? '🇷🇺 Только RU/СНГ' : '🌐 RU/СНГ + МИР');
    }
  } catch (err) {
    if (err.description?.includes('message is not modified')) {
      await ctx.answerCbQuery('ℹ️ Список уже актуален');
    } else {
      console.error('Error in onairActionHandler:', err.message);
      await ctx.answerCbQuery('⚠️ Не удалось обновить');
    }
  }
};

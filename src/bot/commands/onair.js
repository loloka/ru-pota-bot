import { potaApi } from '../../api/potaApi.js';
import { deleteUserMessage } from '../utils.js';
import db from '../../db/database.js';

// Supported filter options
export const AVAILABLE_BANDS = [
  '80m', '40m', '30m', '20m',
  '17m', '15m', '12m', '10m',
  '160m', '6m', '2m', '70cm'
];

export const AVAILABLE_MODES = [
  'CW', 'SSB', 'FT8', 'FM', 'DIGI'
];

// Fallback in-memory store for users not yet registered in SQLite
const memoryFilters = new Map();

/**
 * Get user onair filters
 * @param {number|string} userId 
 * @returns {{ bands: string[], modes: string[] }}
 */
export function getUserOnairFilters(userId) {
  if (!userId) return { bands: [], modes: [] };
  try {
    const row = db.prepare('SELECT onair_filters FROM users WHERE telegram_id = ?').get(userId);
    if (row && row.onair_filters) {
      const parsed = JSON.parse(row.onair_filters);
      return {
        bands: Array.isArray(parsed.bands) ? parsed.bands : [],
        modes: Array.isArray(parsed.modes) ? parsed.modes : []
      };
    }
  } catch (e) {}

  if (memoryFilters.has(String(userId))) {
    return memoryFilters.get(String(userId));
  }

  return { bands: [], modes: [] };
}

/**
 * Save user onair filters
 * @param {number|string} userId 
 * @param {{ bands: string[], modes: string[] }} filters 
 */
export function saveUserOnairFilters(userId, filters) {
  if (!userId) return;
  const safe = {
    bands: Array.isArray(filters.bands) ? filters.bands : [],
    modes: Array.isArray(filters.modes) ? filters.modes : []
  };
  try {
    const res = db.prepare('UPDATE users SET onair_filters = ? WHERE telegram_id = ?').run(JSON.stringify(safe), userId);
    if (res.changes === 0) {
      memoryFilters.set(String(userId), safe);
    }
  } catch (e) {
    memoryFilters.set(String(userId), safe);
  }
}

/**
 * Get a compact readable summary of active filters (e.g. "40m, 20m • CW")
 * @param {{ bands: string[], modes: string[] }} filters 
 * @returns {string}
 */
export function getFilterSummaryText(filters) {
  if (!filters) return '';
  const parts = [];
  if (filters.bands && filters.bands.length > 0) {
    parts.push(filters.bands.join(', '));
  }
  if (filters.modes && filters.modes.length > 0) {
    parts.push(filters.modes.join(', '));
  }
  return parts.join(' • ');
}

/**
 * Frequency to Ham Band mapping
 * @param {string|number} khz 
 * @returns {string}
 */
export function getBandFromKHz(khz) {
  let f = parseFloat(khz);
  if (isNaN(f) || f <= 0) return 'Другой';
  if (f < 1000) f = f * 1000;
  if (f >= 1800 && f <= 2000) return '160m';
  if (f >= 3500 && f <= 4000) return '80m';
  if (f >= 5351 && f <= 5367) return '60m';
  if (f >= 7000 && f <= 7300) return '40m';
  if (f >= 10100 && f <= 10150) return '30m';
  if (f >= 14000 && f <= 14350) return '20m';
  if (f >= 18068 && f <= 18168) return '17m';
  if (f >= 21000 && f <= 21450) return '15m';
  if (f >= 24890 && f <= 24990) return '12m';
  if (f >= 28000 && f <= 29700) return '10m';
  if (f >= 50000 && f <= 54000) return '6m';
  if (f >= 144000 && f <= 148000) return '2m';
  if (f >= 430000 && f <= 440000) return '70cm';
  return 'Другой';
}

/**
 * Checks whether a spot matches the active filters
 * @param {object} spot 
 * @param {{ bands: string[], modes: string[] }} filters 
 * @returns {boolean}
 */
export function spotMatchesFilter(spot, filters) {
  if (!filters) return true;
  const { bands = [], modes = [] } = filters;

  if (bands.length > 0) {
    const band = getBandFromKHz(spot.frequency);
    if (!bands.includes(band)) {
      return false;
    }
  }

  if (modes.length > 0) {
    const m = (spot.mode || '').toUpperCase().trim();
    const matches = modes.some(target => {
      if (target === 'CW') return m === 'CW';
      if (target === 'SSB') return ['SSB', 'USB', 'LSB', 'AM'].includes(m);
      if (target === 'FT8') return ['FT8', 'FT4'].includes(m);
      if (target === 'FM') return m === 'FM';
      if (target === 'DIGI') return ['DIGI', 'FT8', 'FT4', 'JS8', 'RTTY', 'PSK'].includes(m);
      return m === target;
    });
    if (!matches) return false;
  }

  return true;
}

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
  const band = getBandFromKHz(s.frequency);
  const mode = escapeHtml(s.mode || 'N/A');
  const timeAgo = formatMinutesAgo(s.diffMinutes);
  const extra = formatSpotExtra(s);
  return `• ${actLink} @ ${parkLink}${loc}\n  Частота: ${freq} [${band} • ${mode}] | ${timeAgo}${extra}`;
}

/**
 * Renders the interactive filter selection keyboard with checkboxes
 * @param {number|string} userId 
 * @param {'mix'|'ru'} activeView 
 * @returns {{ text: string, reply_markup: object }}
 */
export function renderFilterMenu(userId, activeView = 'mix') {
  const filters = getUserOnairFilters(userId);
  const selectedBands = new Set(filters.bands);
  const selectedModes = new Set(filters.modes);
  const summary = getFilterSummaryText(filters);

  const text = 
    `⚙️ <b>Настройка фильтра эфира (/onair)</b>\n\n` +
    `Отмечайте нужные диапазоны и модуляции галочками.\n` +
    `<i>Если ничего не выбрано — отображаются все станции.</i>\n\n` +
    `🎯 Текущий фильтр: <b>${escapeHtml(summary || 'Все диапазоны и моды')}</b>`;

  const inline_keyboard = [];

  // Bands (3 rows)
  const bandRows = [
    ['80m', '40m', '30m', '20m'],
    ['17m', '15m', '12m', '10m'],
    ['160m', '6m', '2m', '70cm']
  ];

  for (const row of bandRows) {
    inline_keyboard.push(row.map(b => ({
      text: `${selectedBands.has(b) ? '✅' : '⬜'} ${b}`,
      callback_data: `onair_flt:toggle:b:${b}:${activeView}:${userId}`
    })));
  }

  // Modes
  const modeRow = ['CW', 'SSB', 'FT8', 'FM', 'DIGI'];
  inline_keyboard.push(modeRow.map(m => ({
    text: `${selectedModes.has(m) ? '✅' : '⬜'} ${m}`,
    callback_data: `onair_flt:toggle:m:${m}:${activeView}:${userId}`
  })));

  // Preset & Reset
  inline_keyboard.push([
    { text: '🎯 40, 30, 20 CW', callback_data: `onair_flt:preset:popular:${activeView}:${userId}` },
    { text: '🧹 Сбросить всё', callback_data: `onair_flt:reset:${activeView}:${userId}` }
  ]);

  // Apply & Back
  inline_keyboard.push([
    { text: '◀️ Применить и показать эфир', callback_data: `onair_flt:apply:${activeView}:${userId}` }
  ]);

  return { text, reply_markup: { inline_keyboard } };
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

  const userFilters = getUserOnairFilters(userId);
  const filterSummary = getFilterSummaryText(userFilters);

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

      // RU/CIS: within last 40 minutes
      if (isRu && diffMinutes >= -1 && diffMinutes <= 40) {
        if (spotMatchesFilter(spot, userFilters)) {
          ruSpots.push({
            ...spot,
            diffMinutes: Math.max(0, diffMinutes),
            timestamp: spotDate.getTime()
          });
        }
      }

      // World: within last 15 minutes
      if (diffMinutes >= -1 && diffMinutes <= 15) {
        if (spotMatchesFilter(spot, userFilters)) {
          worldSpots.push({
            ...spot,
            diffMinutes: Math.max(0, diffMinutes),
            timestamp: spotDate.getTime()
          });
        }
      }
    }
  }

  // Sort RU spots (newest first)
  ruSpots.sort((a, b) => b.timestamp - a.timestamp);
  const seenRuSpotIds = new Set();
  const processedRu = [];
  for (const s of ruSpots) {
    if (s.spotId && seenRuSpotIds.has(s.spotId)) continue;
    if (s.spotId) seenRuSpotIds.add(s.spotId);
    processedRu.push({ ...s, baseCall: getBaseCallsign(s.activator || '') });
  }

  // Sort World spots (newest first)
  worldSpots.sort((a, b) => b.timestamp - a.timestamp);
  const seenWorldSpotIds = new Set(seenRuSpotIds);
  const processedWorld = [];
  for (const s of worldSpots) {
    if (s.spotId && seenWorldSpotIds.has(s.spotId)) continue;
    if (s.spotId) seenWorldSpotIds.add(s.spotId);
    processedWorld.push({ ...s, baseCall: getBaseCallsign(s.activator || '') });
  }

  let activeMode = requestedMode === 'auto' ? 'mix' : requestedMode;

  // Filter button label
  const filterBtnLabel = filterSummary 
    ? `⚙️ Фильтр: ${filterSummary} ✏️` 
    : `⚙️ Настроить фильтр (Диапазоны / Моды)`;

  const filterBtn = [{ text: filterBtnLabel, callback_data: `onair_flt:open:${activeMode}:${userId}` }];
  const refreshBtn = [{ text: '🔄 Обновить', callback_data: `onair_refresh:${activeMode}:${userId}` }];
  const deleteBtn = [{ text: '❌ Удалить сообщение', callback_data: `delete_msg:${userId}` }];

  if (activeMode === 'ru') {
    // Pure RU mode
    let text = '';
    const filterHeader = filterSummary ? `🎯 <i>Фильтр: ${escapeHtml(filterSummary)}</i>\n\n` : '\n\n';

    if (processedRu.length === 0) {
      if (filterSummary) {
        text = `📻 <b>Сейчас в эфире: RU / СНГ</b>\n` +
               filterHeader +
               `По выбранным диапазонам/модам активных станций из нашего региона за 40 минут не найдено.\n` +
               `Нажмите кнопку фильтра ниже, чтобы изменить условия, или сбросьте фильтр.`;
      } else {
        text = `📻 <b>Сейчас в эфире: RU / СНГ</b>\n\n` +
               `На данный момент в кластере POTA нет активных станций из нашего региона (за последние 40 минут).\n` +
               `Вы можете стать первым — отправьте спот через /spot!`;
      }
    } else {
      text = `📻 <b>СЕЙЧАС В ЭФИРЕ: RU / СНГ (${processedRu.length})</b>\n` +
             filterHeader +
             processedRu.map(renderSpotItem).join('\n\n');
    }

    const inline_keyboard = [
      filterBtn,
      ...(filterSummary && processedRu.length === 0 ? [[{ text: '🧹 Сбросить фильтр', callback_data: `onair_flt:reset_to_list:${activeMode}:${userId}` }]] : []),
      [{ text: '🌐 RU/СНГ + МИР', callback_data: `onair_view:mix:${userId}` }],
      refreshBtn,
      deleteBtn
    ];

    return { text, reply_markup: { inline_keyboard } };
  } else {
    // Unified 'mix' mode
    let text = '';
    const filterHeader = filterSummary ? `🎯 <i>Фильтр: ${escapeHtml(filterSummary)}</i>\n\n` : '\n\n';

    if (processedRu.length > 0) {
      text = `📻 <b>СЕЙЧАС В ЭФИРЕ</b>\n` +
             filterHeader +
             `🌲 <b>НАШ РЕГИОН — RU / СНГ (${processedRu.length}):</b>\n` +
             processedRu.map(renderSpotItem).join('\n\n');

      const worldSlice = processedWorld.slice(0, 10);
      if (worldSlice.length > 0) {
        text += `\n\n🌍 <b>ВЕСЬ МИР (Топ-${worldSlice.length}):</b>\n` +
                worldSlice.map(renderSpotItem).join('\n\n');
      }

      const inline_keyboard = [
        filterBtn,
        [{ text: '🇷🇺 Только RU/СНГ', callback_data: `onair_view:ru:${userId}` }],
        refreshBtn,
        deleteBtn
      ];

      return { text, reply_markup: { inline_keyboard } };
    } else {
      // No RU stations matching filter
      const worldSlice = processedWorld.slice(0, 15);
      if (worldSlice.length === 0) {
        if (filterSummary) {
          text = `📻 <b>Сейчас в эфире</b>\n` +
                 filterHeader +
                 `По выбранному фильтру (<b>${escapeHtml(filterSummary)}</b>) активных станций не найдено.\n` +
                 `Нажмите кнопку фильтра ниже, чтобы выбрать другие диапазоны/моды.`;
        } else {
          text = `📻 <b>Сейчас в эфире: Весь мир</b>\n\n` +
                 `На данный момент в кластере POTA нет активных станций за последние 15 минут.`;
        }
      } else {
        text = `📻 <b>СЕЙЧАС В ЭФИРЕ: ВЕСЬ МИР (Топ-${worldSlice.length})</b>\n` +
               filterHeader +
               `ℹ️ В регионе RU/СНГ за 40 мин активности нет. Свежие станции за последние 15 минут:\n\n` +
               worldSlice.map(renderSpotItem).join('\n\n');
      }

      const inline_keyboard = [
        filterBtn,
        ...(filterSummary && worldSlice.length === 0 ? [[{ text: '🧹 Сбросить фильтр', callback_data: `onair_flt:reset_to_list:${activeMode}:${userId}` }]] : []),
        [{ text: '🇷🇺 Проверить RU/СНГ', callback_data: `onair_view:ru:${userId}` }],
        refreshBtn,
        deleteBtn
      ];

      return { text, reply_markup: { inline_keyboard } };
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
 * Handler for switching views, refreshing onair list, or managing band/mode filters via inline buttons
 * @param {import('telegraf').Context} ctx 
 */
export const onairActionHandler = async (ctx) => {
  const actionCategory = ctx.match[1]; // 'view' | 'refresh' | 'flt'
  const rest = ctx.match[2]; // payload
  const tokens = rest.split(':');
  
  // Last token is always userId if present
  const targetUserId = parseInt(tokens[tokens.length - 1], 10) || ctx.from?.id;
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
    // ----------------------------------------------------
    // 1. Filter Sub-actions (onair_flt:...)
    // ----------------------------------------------------
    if (actionCategory === 'flt') {
      const subAction = tokens[0]; // 'open' | 'toggle' | 'preset' | 'reset' | 'reset_to_list' | 'apply'

      if (subAction === 'open') {
        const mode = tokens[1] || 'mix';
        const { text, reply_markup } = renderFilterMenu(targetUserId, mode);
        await ctx.editMessageText(text, {
          parse_mode: 'HTML',
          reply_markup,
          disable_web_page_preview: true
        });
        return ctx.answerCbQuery('⚙️ Настройка фильтров');
      }

      if (subAction === 'toggle') {
        // onair_flt:toggle:<type>:<val>:<mode>:<userId>
        const type = tokens[1]; // 'b' (band) or 'm' (mode)
        const val = tokens[2];
        const mode = tokens[3] || 'mix';

        const currentFilters = getUserOnairFilters(targetUserId);
        if (type === 'b') {
          if (currentFilters.bands.includes(val)) {
            currentFilters.bands = currentFilters.bands.filter(b => b !== val);
          } else {
            currentFilters.bands.push(val);
          }
        } else if (type === 'm') {
          if (currentFilters.modes.includes(val)) {
            currentFilters.modes = currentFilters.modes.filter(m => m !== val);
          } else {
            currentFilters.modes.push(val);
          }
        }

        saveUserOnairFilters(targetUserId, currentFilters);
        const { text, reply_markup } = renderFilterMenu(targetUserId, mode);
        await ctx.editMessageText(text, {
          parse_mode: 'HTML',
          reply_markup,
          disable_web_page_preview: true
        });
        return ctx.answerCbQuery(`${val} ${type === 'b' ? 'диапазон' : 'модуляция'}`);
      }

      if (subAction === 'preset') {
        // onair_flt:preset:popular:<mode>:<userId>
        const mode = tokens[2] || 'mix';
        const presetFilters = {
          bands: ['40m', '30m', '20m'],
          modes: ['CW']
        };
        saveUserOnairFilters(targetUserId, presetFilters);
        const { text, reply_markup } = renderFilterMenu(targetUserId, mode);
        await ctx.editMessageText(text, {
          parse_mode: 'HTML',
          reply_markup,
          disable_web_page_preview: true
        });
        return ctx.answerCbQuery('🎯 Выбран пресет: 40m, 30m, 20m CW');
      }

      if (subAction === 'reset') {
        // onair_flt:reset:<mode>:<userId>
        const mode = tokens[1] || 'mix';
        saveUserOnairFilters(targetUserId, { bands: [], modes: [] });
        const { text, reply_markup } = renderFilterMenu(targetUserId, mode);
        await ctx.editMessageText(text, {
          parse_mode: 'HTML',
          reply_markup,
          disable_web_page_preview: true
        });
        return ctx.answerCbQuery('🧹 Фильтры сброшены');
      }

      if (subAction === 'reset_to_list') {
        // onair_flt:reset_to_list:<mode>:<userId>
        const mode = tokens[1] || 'mix';
        saveUserOnairFilters(targetUserId, { bands: [], modes: [] });
        const { text, reply_markup } = await fetchAndFormatOnAir(mode, targetUserId);
        await ctx.editMessageText(text, {
          parse_mode: 'HTML',
          reply_markup,
          disable_web_page_preview: true
        });
        return ctx.answerCbQuery('🧹 Фильтры сброшены');
      }

      if (subAction === 'apply') {
        // onair_flt:apply:<mode>:<userId>
        const mode = tokens[1] || 'mix';
        const { text, reply_markup } = await fetchAndFormatOnAir(mode, targetUserId);
        await ctx.editMessageText(text, {
          parse_mode: 'HTML',
          reply_markup,
          disable_web_page_preview: true
        });
        return ctx.answerCbQuery('✅ Фильтры применены');
      }
    }

    // ----------------------------------------------------
    // 2. View / Refresh Actions (onair_view / onair_refresh)
    // ----------------------------------------------------
    const mode = tokens[0] || 'mix';
    const { text, reply_markup } = await fetchAndFormatOnAir(mode, targetUserId);
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup,
      disable_web_page_preview: true
    });

    if (actionCategory === 'refresh') {
      await ctx.answerCbQuery('🔄 Список обновлен');
    } else {
      await ctx.answerCbQuery(mode === 'ru' ? '🇷🇺 Только RU/СНГ' : '🌐 RU/СНГ + МИР');
    }
  } catch (err) {
    if (err.description?.includes('message is not modified')) {
      await ctx.answerCbQuery('ℹ️ Список уже актуален');
    } else {
      console.error('Error in onairActionHandler:', err.message);
      await ctx.answerCbQuery('⚠️ Не удалось выполнить действие');
    }
  }
};

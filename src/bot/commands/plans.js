import { potaApi } from '../../api/potaApi.js';
import { getBaseCallsign } from '../utils.js';
import { locationService } from '../../services/locationService.js';
import dotenv from 'dotenv';

dotenv.config();

const ALLOWED_PREFIXES = (process.env.ALLOWED_PREFIXES || 'RU-,BY-,KZ-').split(',').map(p => p.trim());
const WEB_APP_URL = process.env.WEB_APP_URL || process.env.BASE_URL ? `${(process.env.WEB_APP_URL || process.env.BASE_URL).replace(/\/$/, '')}/app` : null;

/**
 * Format scheduled activations into a Telegram HTML message with keyboard
 * @param {'ru'|'all'} scope 
 * @returns {Promise<{ text: string, reply_markup: object }>}
 */
export async function formatPlansResponse(scope = 'ru') {
  const isRuScope = scope === 'ru';
  let rawPlans = [];
  try {
    rawPlans = await potaApi.getScheduledActivations();
  } catch (err) {
    return {
      text: `⚠️ <b>Ошибка получения планов POTA</b>\n\nНе удалось связаться с сервером pota.app: <code>${err.message}</code>`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Повторить попытку', callback_data: `plans:refresh:${scope}` }]
        ]
      }
    };
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  // Filter valid upcoming activations
  const upcoming = [];
  for (const item of rawPlans) {
    const end = item.endDate || item.startDate || '';
    if (end && end < todayStr) continue;

    const ref = (item.reference || '').toUpperCase().trim();
    const act = (item.activator || '').toUpperCase().trim();
    const isRuPark = ALLOWED_PREFIXES.some(prefix => ref.startsWith(prefix));
    const isRuCall = /^(R[A-Z0-9]|UA|UB|UC|UD|UE|UF|UG|UH|UI|RA|RN|RK|RU|RV|RW|RX|RY|RZ|EW|EV|UN|UL|UP|UQ)/.test(act);
    const isRu = isRuPark || isRuCall;

    if (isRuScope && !isRu) continue;

    upcoming.push({
      ...item,
      reference: ref,
      activator: act,
      isRu
    });
  }

  // Sort: upcoming date & time ascending
  upcoming.sort((a, b) => {
    if (!isRuScope) {
      if (a.isRu && !b.isRu) return -1;
      if (!a.isRu && b.isRu) return 1;
    }
    const dateA = `${a.startDate || '9999'} ${a.startTime || '00:00'}`;
    const dateB = `${b.startDate || '9999'} ${b.startTime || '00:00'}`;
    return dateA.localeCompare(dateB);
  });

  const headerTitle = isRuScope 
    ? '📅 <b>Запланированные активации POTA (RU / СНГ)</b>' 
    : '📅 <b>Запланированные активации POTA (Весь мир)</b>';

  if (upcoming.length === 0) {
    const emptyText = isRuScope
      ? `${headerTitle}\n\n<i>На ближайшие дни пока нет опубликованных планов для RU / СНГ.\n\nВы можете опубликовать свой план на <a href="https://next.pota.app/activation">pota.app/activation</a> или переключиться на «Весь мир».</i>`
      : `${headerTitle}\n\n<i>В настоящий момент на сервере POTA нет опубликованных планов активаций.</i>`;

    const inlineKeyboard = [
      [
        { text: '🔄 Обновить', callback_data: `plans:refresh:${scope}` },
        { 
          text: isRuScope ? '🌐 Весь мир' : '🇷🇺 Только RU/СНГ', 
          callback_data: `plans:scope:${isRuScope ? 'all' : 'ru'}` 
        }
      ]
    ];

    if (WEB_APP_URL) {
      inlineKeyboard.push([{ text: '📱 Открыть в Mini App', web_app: { url: WEB_APP_URL } }]);
    }

    return {
      text: emptyText,
      reply_markup: { inline_keyboard: inlineKeyboard }
    };
  }

  const lines = [
    headerTitle,
    `<i>Найдено запланированных выездов: ${upcoming.length}</i>\n`
  ];

  // Limit display to 15 items per page in Telegram to stay within limits
  const displayItems = upcoming.slice(0, 15);

  for (const plan of displayItems) {
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
    const locLine = locParts.length > 0 ? `\n📍 ${locParts.join(' • ')}` : '';

    const parkLine = plan.name ? `\n🌲 <i>${plan.name}</i>` : '';
    const freqLine = plan.frequencies ? `\n⚙️ <i>${plan.frequencies}</i>` : '';
    const commLine = plan.comments ? `\n📝 <i>${plan.comments.replace(/<[^>]+>/g, '').trim()}</i>` : '';

    lines.push(
      `🗓 <b>${dateText}</b>${timeText ? ` (${timeText})` : ''}\n` +
      `📻 <b>${actLink}</b> @ 🏞️ <b>${refLink}</b>${parkLine}${locLine}${freqLine}${commLine}\n`
    );
  }

  if (upcoming.length > 15) {
    lines.push(`<i>...и ещё ${upcoming.length - 15} планов. Полный список доступен в Mini App!</i>\n`);
  }

  lines.push('💡 <i>Планы подтягиваются с сайта pota.app (раздел Scheduled Activations). Добавить свой выезд можно в личном кабинете pota.app.</i>');

  const inlineKeyboard = [
    [
      { text: '🔄 Обновить', callback_data: `plans:refresh:${scope}` },
      { 
        text: isRuScope ? '🌐 Весь мир' : '🇷🇺 Только RU/СНГ', 
        callback_data: `plans:scope:${isRuScope ? 'all' : 'ru'}` 
      }
    ]
  ];

  if (WEB_APP_URL) {
    inlineKeyboard.push([{ text: '📱 Открыть в Mini App', web_app: { url: WEB_APP_URL } }]);
  }

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard: inlineKeyboard }
  };
}

/**
 * Handle /plans command
 */
export async function handlePlansCommand(ctx) {
  const args = ctx.message?.text ? ctx.message.text.trim().split(/\s+/) : [];
  let scope = 'ru';
  if (args.length > 1 && ['all', 'world', 'мир', 'все'].includes(args[1].toLowerCase())) {
    scope = 'all';
  }

  const { text, reply_markup } = await formatPlansResponse(scope);
  return ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup,
    disable_web_page_preview: true
  });
}

/**
 * Handle plans inline button callbacks
 */
export async function handlePlansCallback(ctx) {
  const data = ctx.callbackQuery?.data || '';
  const parts = data.split(':');
  const action = parts[1]; // 'refresh' | 'scope'
  const targetScope = parts[2] || 'ru';

  try {
    await ctx.answerCbQuery('Загрузка планов...');
  } catch (_) {}

  const { text, reply_markup } = await formatPlansResponse(targetScope);
  try {
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup,
      disable_web_page_preview: true
    });
  } catch (err) {
    // Message not modified or edit expired
  }
}

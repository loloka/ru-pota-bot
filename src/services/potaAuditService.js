import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import db from '../db/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to fallback parks dataset
const FALLBACK_PATH = path.resolve(__dirname, '../data/parks_fallback.json');

/**
 * Normalizes URL string
 */
function cleanUrl(url) {
  if (!url) return '';
  return String(url).trim();
}

/**
 * Determines link issue category
 */
export function categorizeLink(url) {
  const clean = cleanUrl(url);
  if (!clean) {
    return { category: 'empty', label: 'Ссылка отсутствует', badgeClass: 'bg-danger' };
  }

  const lower = clean.toLowerCase();
  if (lower.includes('wikipedia.org')) {
    return { category: 'wikipedia', label: 'Википедия (требует замены)', badgeClass: 'bg-warning text-dark' };
  }
  if (lower.includes('vk.com') || lower.includes('ok.ru') || lower.includes('t.me') || lower.includes('facebook.com') || lower.includes('instagram.com')) {
    return { category: 'social', label: 'Соцсеть (не принимается)', badgeClass: 'bg-danger' };
  }
  if (lower.startsWith('http://')) {
    return { category: 'insecure_http', label: 'Небезопасный HTTP', badgeClass: 'bg-secondary' };
  }
  if (lower.includes('nextgis.ru') || lower.includes('оцзк.рф')) {
    return { category: 'official_oopt', label: 'Реестр ООПТ', badgeClass: 'bg-success' };
  }
  return { category: 'ok', label: 'Собственный сайт', badgeClass: 'bg-info text-dark' };
}

/**
 * Loads Russian POTA parks from fallback dataset
 */
export function getRussianPotaParks() {
  try {
    if (!fs.existsSync(FALLBACK_PATH)) return [];
    const content = fs.readFileSync(FALLBACK_PATH, 'utf-8');
    const parks = JSON.parse(content);
    return parks.filter(p => p.reference && p.reference.startsWith('RU-'));
  } catch (err) {
    console.error('[POTA Audit] Failed to load parks fallback:', err.message);
    return [];
  }
}

/**
 * Audits all Russian POTA parks links and cross-references with oopt_registry
 */
export function auditPotaLinks() {
  const parks = getRussianPotaParks();

  // Load all mapped OOPT records
  let mappedOopt = [];
  try {
    mappedOopt = db.prepare(`
      SELECT nid, title, category, sig, sig_display, ate, pota_ref, pota_name
      FROM oopt_registry
      WHERE pota_ref IS NOT NULL
    `).all();
  } catch (err) {
    console.warn('[POTA Audit] Database query warning:', err.message);
  }

  const ooptByRef = new Map();
  mappedOopt.forEach(o => {
    if (o.pota_ref) ooptByRef.set(o.pota_ref, o);
  });

  // Pre-fetch all OOPT for fuzzy match fallback (e.g. for Paanajarvi)
  let allOopt = [];
  try {
    allOopt = db.prepare(`
      SELECT nid, title, category, sig, sig_display, ate
      FROM oopt_registry
    `).all();
  } catch (err) {}

  const ooptByTitleNorm = new Map();
  allOopt.forEach(o => {
    const norm = (o.title || '').toLowerCase().replace(/[^a-zа-я0-9]/g, '');
    if (norm && !ooptByTitleNorm.has(norm)) {
      ooptByTitleNorm.set(norm, o);
    }
  });

  const auditResults = [];
  const stats = {
    total: parks.length,
    ok: 0,
    wikipedia: 0,
    insecure_http: 0,
    empty: 0,
    social: 0,
    with_replacement: 0,
  };

  for (const park of parks) {
    const url = cleanUrl(park.website);
    const cat = categorizeLink(url);

    // Update stats
    if (cat.category === 'wikipedia') stats.wikipedia++;
    else if (cat.category === 'empty') stats.empty++;
    else if (cat.category === 'insecure_http') stats.insecure_http++;
    else if (cat.category === 'social') stats.social++;
    else stats.ok++;

    // Look for OOPT match
    let matchedOopt = ooptByRef.get(park.reference) || null;

    // If no direct ref match, try special known name aliases or normalized search
    if (!matchedOopt) {
      const parkClean = (park.name || '')
        .toLowerCase()
        .replace(/national park|nature reserve|nature sanctuary|park|reserve/gi, '')
        .replace(/[^a-zа-я0-9]/gi, '');

      if (parkClean) {
        if (parkClean.includes('paanaj')) {
          matchedOopt = allOopt.find(o => (o.title || '').includes('Паанаярви')) || null;
        } else if (parkClean.includes('ilmensk')) {
          matchedOopt = allOopt.find(o => (o.title || '').includes('Ильменский')) || null;
        } else if (parkClean.includes('chermyank')) {
          matchedOopt = allOopt.find(o => (o.title || '').includes('Чермянки')) || null;
        } else if (parkClean.includes('tosnensk')) {
          matchedOopt = allOopt.find(o => (o.title || '').includes('Саблинский')) || null;
        } else if (ooptByTitleNorm.has(parkClean)) {
          matchedOopt = ooptByTitleNorm.get(parkClean);
        }
      }
    }

    let replacement = null;
    if (matchedOopt) {
      replacement = {
        nid: matchedOopt.nid,
        title: matchedOopt.title,
        category: matchedOopt.category || '',
        sig: matchedOopt.sig_display || matchedOopt.sig || '',
        region: matchedOopt.ate || '',
        url: `https://ooptaari.nextgis.ru/node/${matchedOopt.nid}`,
      };
      if (cat.category !== 'ok') {
        stats.with_replacement++;
      }
    }

    auditResults.push({
      reference: park.reference,
      name: park.name,
      region: park.region || '',
      grid: park.grid || '',
      lat: park.lat !== undefined ? Number(park.lat).toFixed(4) : null,
      lon: park.lon !== undefined ? Number(park.lon).toFixed(4) : null,
      website: url,
      category: cat.category,
      categoryLabel: cat.label,
      badgeClass: cat.badgeClass,
      hasIssue: cat.category !== 'ok' && cat.category !== 'official_oopt',
      replacement,
    });
  }

  // Sort: issues first (Wikipedia -> Social -> Empty -> Insecure HTTP -> OK)
  const priorityMap = { wikipedia: 1, social: 2, empty: 3, insecure_http: 4, ok: 5, official_oopt: 6 };
  auditResults.sort((a, b) => (priorityMap[a.category] || 99) - (priorityMap[b.category] || 99));

  return {
    stats,
    parks: auditResults,
  };
}

/**
 * Online check of URL availability (HTTP HEAD / GET fallback)
 */
export async function checkUrlOnline(url) {
  const clean = cleanUrl(url);
  if (!clean) {
    return { ok: false, status: null, error: 'URL не указан' };
  }

  try {
    const res = await axios.head(clean, {
      timeout: 6000,
      headers: {
        'User-Agent': 'RU-POTA-Bot/1.16.17 (Link Health Checker; Node.js)',
      },
      maxRedirects: 5,
      validateStatus: () => true,
    });
    return { ok: res.status >= 200 && res.status < 400, status: res.status, statusText: res.statusText || '' };
  } catch (err) {
    try {
      const response = await axios.get(clean, {
        timeout: 10000,
        headers: {
          'User-Agent': 'RU-POTA-Bot/1.16.17 (Link Health Checker; Node.js)',
          'Accept': 'text/html,*/*',
        },
        validateStatus: () => true,
        maxRedirects: 3,
        responseType: 'stream',
      });
      return {
        ok: response.status >= 200 && response.status < 400,
        status: response.status,
        statusText: response.statusText || '',
      };
    } catch (getErr) {
      let errorMsg = getErr.message || 'Ошибка подключения';
      if (getErr.code === 'ECONNABORTED' || getErr.message.includes('timeout')) {
        errorMsg = 'Таймаут (10с)';
      } else if (getErr.code === 'ENOTFOUND') {
        errorMsg = 'DNS не найден (домен не существует)';
      } else if (getErr.code === 'ECONNREFUSED') {
        errorMsg = 'Сервер отклонил соединение';
      } else if (getErr.code === 'CERT_HAS_EXPIRED' || getErr.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
        errorMsg = 'Ошибка SSL-сертификата';
      }
      return {
        ok: false,
        status: null,
        error: errorMsg,
      };
    }
  }
}

/**
 * Formats a ready-to-send proposal message for Manu R2BBX for a single park
 */
export function formatSingleReplacement(parkItem) {
  const currentUrl = parkItem.website || '(нет ссылки)';
  const repl = parkItem.replacement;
  const newUrl = repl ? repl.url : 'https://карта.оцзк.рф';
  const ooptDesc = repl ? `${repl.category ? repl.category + ' ' : ''}«${repl.title}» (${repl.sig || 'ООПТ РФ'})` : 'ООПТ РФ';

  return [
    `Замена ссылки для парка POTA:`,
    `Референция: ${parkItem.reference} (${parkItem.name})`,
    `Текущая ссылка: ${currentUrl}${parkItem.category === 'wikipedia' ? ' [Википедия]' : ''}`,
    `Рекомендуемая официальная ссылка: ${newUrl}`,
    `Объект в реестре ООПТ: ${ooptDesc}`,
    repl?.region ? `Регион: ${repl.region}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Formats a batch replacement report for all Wikipedia links for R2BBX
 */
export function formatBatchWikipediaReplacements() {
  const { parks } = auditPotaLinks();
  const wikiParks = parks.filter(p => p.category === 'wikipedia');

  const lines = [
    `📋 Сводный список предложений по замене ссылок Википедии на официальные страницы ООПТ (NextGIS)`,
    `Всего объектов с Википедией: ${wikiParks.length}`,
    `----------------------------------------------------`,
  ];

  wikiParks.forEach((p, idx) => {
    lines.push(`${idx + 1}. [${p.reference}] ${p.name}`);
    lines.push(`   Текущая ссылка (Википедия): ${p.website}`);
    if (p.replacement) {
      lines.push(`   ✅ Официальная ссылка NextGIS: ${p.replacement.url}`);
      lines.push(`   ООПТ: ${p.replacement.category ? p.replacement.category + ' ' : ''}«${p.replacement.title}» (${p.replacement.sig || 'ООПТ'})`);
    } else {
      lines.push(`   ⚠️ Официальная ссылка: требуется ручное сопоставление (городской/нетипичный парк)`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Formats a report specifically for parks with missing links (Requested by Manu R2BBX)
 */
export function formatEmptyLinksReport() {
  const { parks } = auditPotaLinks();
  const emptyParks = parks.filter(p => p.category === 'empty');

  const lines = [
    `🚨 СПИСОК ПАРКОВ POTA БЕЗ ССЫЛОК (АЛЯРМА ДЛЯ MANU R2BBX)`,
    `Всего парков без ссылки: ${emptyParks.length}`,
    `------------------------------------------------------------`,
  ];

  emptyParks.forEach((p, idx) => {
    lines.push(`${idx + 1}. [${p.reference}] ${p.name} (${p.region || 'RU'})`);
    lines.push(`   Статус: ССЫЛКА ОТСУТСТВУЕТ`);
    if (p.replacement) {
      lines.push(`   ✅ Найдена официальная ссылка NextGIS: ${p.replacement.url}`);
      lines.push(`   Объект ООПТ: ${p.replacement.category ? p.replacement.category + ' ' : ''}«${p.replacement.title}» (${p.replacement.sig || 'ООПТ РФ'})`);
    } else {
      lines.push(`   ⚠️ Официальная ссылка: требуется ручное сопоставление (городской парк)`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Formats a full comprehensive audit report for Manu R2BBX (Email / Telegram)
 */
export function formatFullManuReport() {
  const { stats, parks } = auditPotaLinks();
  const emptyParks = parks.filter(p => p.category === 'empty');
  const wikiParks = parks.filter(p => p.category === 'wikipedia');
  const httpParks = parks.filter(p => p.category === 'insecure_http');

  const lines = [
    `🌲 СВОДНЫЙ АУДИТ И РЕКОМЕНДАЦИИ ПО ССЫЛКАМ ПАРКОВ RU-POTA`,
    `Для координатора POTA: Ивана (Manu R2BBX)`,
    `Дата формирования: ${new Date().toLocaleDateString('ru-RU')}`,
    `Всего парков в базе RU: ${stats.total}`,
    `🚨 Без ссылок (АЛЯРМА): ${emptyParks.length}`,
    `⚠️ Ссылки на Википедию: ${wikiParks.length}`,
    `🔓 Небезопасный HTTP: ${httpParks.length}`,
    `============================================================`,
    '',
    `🚨 РАЗДЕЛ 1: ПАРКИ БЕЗ ССЫЛОК (КРИТИЧНО — ${emptyParks.length} ОБЪЕКТОВ)`,
    `------------------------------------------------------------`,
  ];

  emptyParks.forEach((p, idx) => {
    lines.push(`${idx + 1}. [${p.reference}] ${p.name} (${p.region})`);
    lines.push(`   Текущая ссылка: ОТСУТСТВУЕТ`);
    if (p.replacement) {
      lines.push(`   ✅ Рекомендуемая ссылка NextGIS: ${p.replacement.url}`);
      lines.push(`   Объект ООПТ: ${p.replacement.category ? p.replacement.category + ' ' : ''}«${p.replacement.title}» (${p.replacement.sig || 'ООПТ'})`);
    } else {
      lines.push(`   ⚠️ Ссылка в ООПТ: требуется ручной поиск (городской парк)`);
    }
    lines.push('');
  });

  lines.push(`============================================================`);
  lines.push(`⚠️ РАЗДЕЛ 2: ССЫЛКИ НА ВИКИПЕДИЮ (ТРЕБУЮТ ЗАМЕНЫ — ${wikiParks.length} ОБЪЕКТОВ)`);
  lines.push(`------------------------------------------------------------`);

  wikiParks.forEach((p, idx) => {
    lines.push(`${idx + 1}. [${p.reference}] ${p.name} (${p.region})`);
    lines.push(`   Текущая ссылка (Википедия): ${p.website}`);
    if (p.replacement) {
      lines.push(`   ✅ Официальная ссылка NextGIS: ${p.replacement.url}`);
      lines.push(`   Объект в ООПТ РФ: ${p.replacement.category ? p.replacement.category + ' ' : ''}«${p.replacement.title}» (${p.replacement.sig || 'ООПТ'})`);
    } else {
      lines.push(`   ⚠️ Официальная ссылка: требуется ручное сопоставление`);
    }
    lines.push('');
  });

  lines.push(`============================================================`);
  lines.push(`🔓 РАЗДЕЛ 3: ССЫЛКИ НА НЕЗАЩИЩЕННЫЙ HTTP (${httpParks.length} ОБЪЕКТОВ)`);
  lines.push(`(У многих браузер блокирует открытие; рекомендуется замена на https:// или NextGIS)`);
  lines.push(`------------------------------------------------------------`);

  httpParks.forEach((p, idx) => {
    const httpsAlternative = p.website.replace('http://', 'https://');
    lines.push(`${idx + 1}. [${p.reference}] ${p.name} (${p.region})`);
    lines.push(`   Текущая ссылка (HTTP): ${p.website}`);
    if (p.replacement) {
      lines.push(`   ✅ Рекомендуемая ссылка NextGIS: ${p.replacement.url}`);
      lines.push(`   или HTTPS зеркало сайта: ${httpsAlternative}`);
    } else {
      lines.push(`   Рекомендуемое исправление: ${httpsAlternative}`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

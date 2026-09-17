import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OOPT_BASE_URL = 'https://xn--80aa2azak.xn--g1agk6a.xn--p1ai'; // карта.оцзк.рф

// Axios client with 25s timeout per GEMINI.md rule 2.3
const client = axios.create({
  baseURL: OOPT_BASE_URL,
  timeout: 25000,
  headers: {
    'User-Agent': 'RU-POTA-Bot/1.16.0 (Telegram Bot; Node.js)',
    'Accept': 'application/json',
  },
});

/**
 * Normalizes encoding quirks and clean strings
 */
function cleanString(str) {
  if (!str) return '';
  return String(str).trim();
}

function normalizeSig(sig, sigDisplay) {
  const s = (sig || '').toLowerCase();
  if (s.includes('fed') || (sigDisplay && sigDisplay.includes('Фед'))) return { sig: 'federal', display: 'Федеральное' };
  if (s.includes('reg') || (sigDisplay && sigDisplay.includes('Рег'))) return { sig: 'regional', display: 'Региональное' };
  if (s.includes('loc') || (sigDisplay && sigDisplay.includes('Мест'))) return { sig: 'local', display: 'Местное' };
  return { sig: sig || 'regional', display: sigDisplay || 'Региональное' };
}

function normalizeStatus(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('действ')) return 'действующий';
  if (s.includes('реорг')) return 'реорганизованный';
  if (s.includes('ликвид')) return 'ликвидированный';
  if (s.includes('утрат')) return 'утративший силу';
  return status || 'действующий';
}

/**
 * Synchronizes full Russian Protected Areas registry (11 341+ records)
 */
export async function syncOoptRegistry() {
  console.log('[OOPT Service] 🌲 Starting download of Russian Protected Areas registry from карта.оцзк.рф...');
  const startTime = Date.now();

  try {
    const res = await client.get('/api/v1/oopt-selection/');
    const data = res.data;

    if (!data || !Array.isArray(data.rows)) {
      throw new Error('Invalid response structure from oopt-selection API');
    }

    const rows = data.rows;
    console.log(`[OOPT Service] 📥 Downloaded ${rows.length} records in ${((Date.now() - startTime) / 1000).toFixed(1)}s. Writing to SQLite...`);

    // Backup json file for offline guarantee
    try {
      const backupDir = path.resolve('data');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      fs.writeFileSync(path.join(backupDir, 'oopt_registry_backup.json'), JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.warn('[OOPT Service] ⚠️ Backup file write warning:', e.message);
    }

    const insertStmt = db.prepare(`
      INSERT INTO oopt_registry (
        nid, title, sig, sig_display, status, category, agency, ate, start_date, area, area_aquatory, area_protection_zone, updated_at
      ) VALUES (
        @nid, @title, @sig, @sig_display, @status, @category, @agency, @ate, @start_date, @area, @area_aquatory, @area_protection_zone, CURRENT_TIMESTAMP
      )
      ON CONFLICT(nid) DO UPDATE SET
        title = excluded.title,
        sig = excluded.sig,
        sig_display = excluded.sig_display,
        status = excluded.status,
        category = excluded.category,
        agency = excluded.agency,
        ate = excluded.ate,
        start_date = excluded.start_date,
        area = excluded.area,
        area_aquatory = excluded.area_aquatory,
        area_protection_zone = excluded.area_protection_zone,
        updated_at = CURRENT_TIMESTAMP
    `);

    const transaction = db.transaction((items) => {
      for (const item of items) {
        const { sig, display } = normalizeSig(item.sig, item.sig_display);
        insertStmt.run({
          nid: item.nid,
          title: cleanString(item.title),
          sig,
          sig_display: display,
          status: normalizeStatus(item.status),
          category: cleanString(item.category),
          agency: cleanString(item.agency),
          ate: cleanString(item.ate),
          start_date: item.start_date || null,
          area: typeof item.area === 'number' ? item.area : null,
          area_aquatory: typeof item.area_aquatory === 'number' ? item.area_aquatory : null,
          area_protection_zone: typeof item.area_protection_zone === 'number' ? item.area_protection_zone : null,
        });
      }
    });

    transaction(rows);

    const totalInDb = db.prepare("SELECT COUNT(*) as count FROM oopt_registry").get().count;
    console.log(`[OOPT Service] ✅ Synced ${rows.length} records! Total in local DB: ${totalInDb} in ${((Date.now() - startTime) / 1000).toFixed(1)}s.`);
    try {
      syncPotaMatches();
    } catch (e) {
      console.warn('[OOPT Service] ⚠️ Auto POTA match error:', e.message);
    }
    return { success: true, count: rows.length, total: totalInDb };
  } catch (err) {
    console.error('[OOPT Service] ❌ Sync failed:', err.message);

    // Fallback: check if we have offline backup file
    const backupFile = path.resolve('data/oopt_registry_backup.json');
    if (fs.existsSync(backupFile)) {
      console.log('[OOPT Service] 🔄 Restoring from local offline backup...');
      const raw = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
      if (raw.rows && Array.isArray(raw.rows)) {
        const insertStmt = db.prepare(`
          INSERT OR REPLACE INTO oopt_registry (
            nid, title, sig, sig_display, status, category, agency, ate, start_date, area, area_aquatory, area_protection_zone, updated_at
          ) VALUES (@nid, @title, @sig, @sig_display, @status, @category, @agency, @ate, @start_date, @area, @area_aquatory, @area_protection_zone, CURRENT_TIMESTAMP)
        `);
        const transaction = db.transaction((items) => {
          for (const item of items) {
            const { sig, display } = normalizeSig(item.sig, item.sig_display);
            insertStmt.run({
              nid: item.nid,
              title: cleanString(item.title),
              sig,
              sig_display: display,
              status: normalizeStatus(item.status),
              category: cleanString(item.category),
              agency: cleanString(item.agency),
              ate: cleanString(item.ate),
              start_date: item.start_date || null,
              area: typeof item.area === 'number' ? item.area : null,
              area_aquatory: typeof item.area_aquatory === 'number' ? item.area_aquatory : null,
              area_protection_zone: typeof item.area_protection_zone === 'number' ? item.area_protection_zone : null,
            });
          }
        });
        transaction(raw.rows);
        const totalInDb = db.prepare("SELECT COUNT(*) as count FROM oopt_registry").get().count;
        try {
          syncPotaMatches();
        } catch (e) {
          console.warn('[OOPT Service] ⚠️ Auto POTA match error:', e.message);
        }
        return { success: true, count: raw.rows.length, total: totalInDb, fromBackup: true };
      }
    }
    throw err;
  }
}

/**
 * Paginated query for Russian Protected Areas
 */
export function getOoptList({
  page = 1,
  limit = 20,
  search = '',
  sig = '',
  category = '',
  status = '',
  region = '',
  pota = '',
} = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  const params = [];

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(`(title LIKE ? OR ate LIKE ? OR agency LIKE ? OR category LIKE ?)`);
    params.push(term, term, term, term);
  }

  if (sig && sig.trim()) {
    conditions.push(`sig = ?`);
    params.push(sig.trim().toLowerCase());
  }

  if (category && category.trim()) {
    conditions.push(`category = ?`);
    params.push(category.trim());
  }

  if (status && status.trim()) {
    conditions.push(`status = ?`);
    params.push(status.trim().toLowerCase());
  }

  if (region && region.trim()) {
    conditions.push(`ate LIKE ?`);
    params.push(`%${region.trim()}%`);
  }

  if (pota === 'in_pota' || pota === '1' || pota === 'true') {
    conditions.push(`pota_ref IS NOT NULL`);
  } else if (pota === 'not_in_pota' || pota === '0') {
    conditions.push(`pota_ref IS NULL`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 1. Total count matching criteria
  const countSql = `SELECT COUNT(*) as total FROM oopt_registry ${whereClause}`;
  const total = db.prepare(countSql).get(...params).total;

  // 2. Paginated rows
  const selectSql = `
    SELECT 
      nid, title, sig, sig_display, status, category, agency, ate, start_date, area,
      lat, lon, profile, pota_ref, pota_name
    FROM oopt_registry
    ${whereClause}
    ORDER BY 
      CASE sig WHEN 'federal' THEN 1 WHEN 'regional' THEN 2 ELSE 3 END,
      title ASC
    LIMIT ? OFFSET ?
  `;
  const rows = db.prepare(selectSql).all(...params, limitNum, offset);

  // 3. Stats by significance
  const stats = getOoptStats();

  return {
    rows,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1,
    stats,
  };
}

// In-memory cache for statistics to make paginated requests instant (<2ms)
let cachedStats = null;
let lastStatsTime = 0;
const STATS_TTL_MS = 60000; // 1 minute cache

/**
 * Returns overall statistics, regions, and distinct categories
 */
export function getOoptStats() {
  const now = Date.now();
  if (cachedStats && (now - lastStatsTime < STATS_TTL_MS)) {
    return cachedStats;
  }

  const total = db.prepare("SELECT COUNT(*) as count FROM oopt_registry").get()?.count || 0;
  const federal = db.prepare("SELECT COUNT(*) as count FROM oopt_registry WHERE sig = 'federal'").get()?.count || 0;
  const regional = db.prepare("SELECT COUNT(*) as count FROM oopt_registry WHERE sig = 'regional'").get()?.count || 0;
  const local = db.prepare("SELECT COUNT(*) as count FROM oopt_registry WHERE sig = 'local'").get()?.count || 0;
  const inPota = db.prepare("SELECT COUNT(*) as count FROM oopt_registry WHERE pota_ref IS NOT NULL").get()?.count || 0;

  const categories = db.prepare(`
    SELECT category, COUNT(*) as count 
    FROM oopt_registry 
    WHERE category IS NOT NULL AND category != '' 
    GROUP BY category 
    ORDER BY count DESC
    LIMIT 25
  `).all();

  // Extract clean regions list for filter dropdowns
  const rawAte = db.prepare("SELECT DISTINCT ate FROM oopt_registry WHERE ate IS NOT NULL AND ate != ''").all();
  const regionSet = new Set();
  for (const row of rawAte) {
    let s = row.ate;
    if (s.includes('(')) {
      s = s.split('(')[0].trim();
    }
    const parts = s.split(/,\s*/);
    for (const p of parts) {
      const clean = p.trim();
      if (clean.length > 2) {
        regionSet.add(clean);
      }
    }
  }
  const regions = Array.from(regionSet).sort((a, b) => a.localeCompare(b, 'ru'));

  cachedStats = {
    total,
    federal,
    regional,
    local,
    inPota,
    categories,
    regions,
  };
  lastStatsTime = now;
  return cachedStats;
}

const ruToEn = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
};

export function transliterateRuToEn(str) {
  return (str || '').split('').map(c => {
    const lower = c.toLowerCase();
    const mapped = ruToEn[lower];
    if (mapped === undefined) return c;
    return c === c.toUpperCase() ? (mapped.charAt(0).toUpperCase() + mapped.slice(1)) : mapped;
  }).join('');
}

const BUREAUCRATIC_PATTERNS = [
  /федерального государственного бюджетного образовательного учреждения высшего образования/gi,
  /федерального государственного бюджетного образовательного учреждения высшего профессионального образования/gi,
  /федерального государственного бюджетного образовательного учреждения/gi,
  /федерального государственного бюджетного учреждения науки/gi,
  /федерального государственного бюджетного учреждения/gi,
  /государственного бюджетного образовательного учреждения высшего образования/gi,
  /государственного бюджетного образовательного учреждения/gi,
  /государственного образовательного учреждения высшего профессионального образования/gi,
  /государственного образовательного учреждения/gi,
  /высшего профессионального образования/gi,
  /высшего образования/gi,
  /образовательного учреждения/gi,
  /бюджетного учреждения/gi,
  /Сибирского отделения Российской академии наук/gi,
  /Дальневосточного отделения Российской академии наук/gi,
  /Уральского отделения Российской академии наук/gi,
  /Российской академии наук/gi,
  /Российской академии медицинских наук/gi,
  /Российской академии сельскохозяйственных наук/gi,
];

export function deduceCategory(title, existingCategory) {
  if (existingCategory && existingCategory.trim()) return existingCategory.trim();
  const t = (title || '').toLowerCase();
  if (t.includes('ботанический сад') || t.includes('дендрологический')) return 'дендрологический парк и ботанический сад';
  if (t.includes('национальный парк')) return 'национальный парк';
  if (t.includes('биосферный заповедник')) return 'государственный природный биосферный заповедник';
  if (t.includes('заповедник')) return 'государственный природный заповедник';
  if (t.includes('заказник')) return 'государственный природный заказник';
  if (t.includes('памятник природы')) return 'памятник природы';
  if (t.includes('природный парк')) return 'природный парк';
  return 'ООПТ';
}

export function getEnglishCategorySuffix(category) {
  const c = (category || '').toLowerCase();
  if (c.includes('национальный парк')) return 'National Park';
  if (c.includes('биосферный заповедник')) return 'State Biosphere Nature Reserve';
  if (c.includes('заповедник')) return 'Nature Reserve';
  if (c.includes('заказник')) return 'Nature Sanctuary';
  if (c.includes('памятник природы')) return 'Nature Monument';
  if (c.includes('природный парк')) return 'Nature Park';
  if (c.includes('ботанический сад')) return 'Botanical Garden';
  if (c.includes('дендрологический')) return 'Dendrological Park';
  return 'Protected Area';
}

export function cleanOoptName(rawTitle, category) {
  let name = (rawTitle || '').trim();

  // Strip quotes if they enclose the full name or part
  const quoteMatch = name.match(/["«]([^"»]+)["»]/);
  if (quoteMatch && quoteMatch[1].length > 3) {
    const prefix = name.substring(0, quoteMatch.index).trim();
    if (prefix.length < 50) {
      name = quoteMatch[1].trim();
    }
  }

  // Strip bureaucratic junk
  for (const pat of BUREAUCRATIC_PATTERNS) {
    name = name.replace(pat, ' ');
  }

  // Common institutional acronyms & cleanups
  name = name.replace(/["«]/g, '').replace(/["»]/g, '')
    .replace(/Московского государственного университета/gi, 'МГУ')
    .replace(/Московский государственный университет/gi, 'МГУ')
    .replace(/имени М\.?В\.?\s*Ломоносова/gi, 'им. М.В. Ломоносова')
    .replace(/имени\s+/gi, 'им. ')
    .replace(/\s+/g, ' ')
    .trim();

  // Category prefix stripping
  const prefixes = [
    'Государственный природный биосферный заповедник',
    'Государственный природный заповедник',
    'Государственный природный заказник',
    'Государственный ландшафтный заказник',
    'Национальный природный парк',
    'Национальный парк',
    'Природный парк',
    'Памятник природы',
    'Охраняемый природный ландшафт',
    'Дендрологический парк и ботанический сад',
    'Дендрологический парк',
    'Ботанический сад'
  ];

  for (const p of prefixes) {
    if (name.toLowerCase().startsWith(p.toLowerCase())) {
      const rem = name.substring(p.length).trim().replace(/^[-–—,: ]+/, '').trim();
      if (rem.length > 2) {
        name = rem;
        break;
      }
    }
  }

  return name.replace(/^[-–—,: ]+/, '').trim();
}

export function translateNameToEnglish(cleanName, category) {
  let s = cleanName;
  s = s.replace(/Биологического факультета МГУ им\.? М\.?В\.?\s*Ломоносова/gi, 'MSU Faculty of Biology')
       .replace(/МГУ им\.? М\.?В\.?\s*Ломоносова/gi, 'MSU')
       .replace(/МГУ/g, 'MSU')
       .replace(/БИН РАН/g, 'BIN RAS')
       .replace(/РАН/g, 'RAS')
       .replace(/СО РАН/g, 'SB RAS')
       .replace(/Петра Великого/gi, 'Peter the Great');

  let en = transliterateRuToEn(s);
  // Normalize Russian adjective endings
  en = en.replace(/skogo\b/gi, 'sky')
         .replace(/skogo gosudarstvennogo\b/gi, 'State')
         .replace(/gosudarstvennogo\b/gi, 'State')
         .replace(/pedagogicheskogo\b/gi, 'Pedagogical')
         .replace(/universiteta\b/gi, 'University')
         .replace(/instituta\b/gi, 'Institute');

  // Capitalize words
  en = en.split(' ').map(w => w ? (w.charAt(0).toUpperCase() + w.slice(1)) : '').join(' ').trim();

  const suffix = getEnglishCategorySuffix(category);
  if (!en.toLowerCase().includes(suffix.toLowerCase())) {
    en = `${en} ${suffix}`;
  }
  return en.replace(/\s+/g, ' ').trim();
}

/**
 * Smartly parses raw title, category, significance, and regions per Manu R2BBX's rules:
 * - "Лосиный Остров" goes into Name, and "Национальный парк" goes into Status.
 * - Both regions (e.g. Москва и Московская область) must be included when cross-regional.
 * - Generates English name for POTA.
 * - Uses priority NextGIS URL (https://ooptaari.nextgis.ru/oopt/:id).
 */
export function parseSubmitterFields(item) {
  const rawTitle = (item.title || '').trim();
  const rawCat = deduceCategory(rawTitle, item.category);
  const cleanName = cleanOoptName(rawTitle, rawCat);
  const detectedCategory = rawCat.charAt(0).toUpperCase() + rawCat.slice(1);

  // English translation for POTA
  const nameEn = translateNameToEnglish(cleanName, rawCat);

  // Significance
  const sigDisplay = item.sig_display || (item.sig === 'federal' ? 'Федеральное' : item.sig === 'regional' ? 'Региональное' : 'Местное');
  const fullStatus = `${detectedCategory} (${sigDisplay} значение)`;

  // Region(s) - preserve multi-region like "Москва, Московская область"
  let region = item.rf_subjects || item.ate || '';
  if (region.includes('(')) {
    region = region.split('(')[0].trim();
  }

  // Coordinates (first Lat, second Lon in Yandex maps format)
  const lat = item.lat !== null && item.lat !== undefined ? Number(item.lat).toFixed(6) : '';
  const lon = item.lon !== null && item.lon !== undefined ? Number(item.lon).toFixed(6) : '';

  // Official AARI portal link (http://oopt.aari.ru/oopt/:id)
  const siteUrl = item.nid ? `http://oopt.aari.ru/oopt/${item.nid}` : 'http://oopt.aari.ru/';

  // Clarification
  const clarifies = [];
  if (item.profile) clarifies.push(`Профиль: ${item.profile}`);
  if (item.status) clarifies.push(`Статус: ${item.status}`);
  if (item.area) clarifies.push(`Площадь: ${Number(item.area).toLocaleString('ru-RU')} га`);
  if (item.start_date) clarifies.push(`Дата создания: ${item.start_date}`);
  if (item.agency) clarifies.push(`Ведомство: ${item.agency}`);

  return {
    nid: item.nid,
    rawTitle,
    name: cleanName,
    nameEn,
    status: fullStatus,
    lat,
    lon,
    region,
    siteUrl,
    clarification: clarifies.join('. '),
    pota_ref: item.pota_ref || null,
    pota_name: item.pota_name || null,
  };
}

/**
 * Formats standard template for Ivan R2BBX (Russian POTA Coordinator)
 */
export function generateR2bbxTemplate(item) {
  const f = parseSubmitterFields(item);

  return [
    `Название парка/ООПТ: ${f.name}`,
    `Название для POTA (EN): ${f.nameEn}`,
    `Статус (парк/ООПТ и т.п.): ${f.status}`,
    `Координата первая с яндекс-карт: ${f.lat}`,
    `Координата вторая: ${f.lon}`,
    `Регион России: ${f.region}`,
    `Сайт объекта, ссылка: ${f.siteUrl}`,
    `Уточнение (не обязательно): ${f.clarification}`
  ].join('\n');
}

/**
 * Fetches and caches full detail card for a specific ООПТ (coordinates, documents, legal acts)
 */
export async function getOoptDetails(nid) {
  const numNid = parseInt(nid, 10);
  if (!numNid) throw new Error('Invalid NID');

  const row = db.prepare("SELECT * FROM oopt_registry WHERE nid = ?").get(numNid);
  if (!row) throw new Error('ООПТ не найдено в базе');

  let details = { ...row };

  // If coordinates are missing or need documents, fetch live detail from API and cache in DB
  if (row.lat === null || row.lon === null || !row.bbox) {
    try {
      const res = await client.get(`/api/v1/oopt/${numNid}/`);
      const ext = res.data;
      if (ext) {
        let lat = null;
        let lon = null;
        if (Array.isArray(ext.center) && ext.center.length === 2) {
          // In center: [lon, lat]
          lon = Number(ext.center[0]) || null;
          lat = Number(ext.center[1]) || null;
        }

        const bboxStr = ext.bbox ? JSON.stringify(ext.bbox) : null;
        const rfSubjStr = ext.rf_subjects ? ext.rf_subjects.join(', ') : null;
        const profile = ext.profile || null;

        db.prepare(`
          UPDATE oopt_registry 
          SET lat = ?, lon = ?, bbox = ?, profile = ?, rf_subjects = ?, updated_at = CURRENT_TIMESTAMP
          WHERE nid = ?
        `).run(lat, lon, bboxStr, profile, rfSubjStr, numNid);

        details.lat = lat;
        details.lon = lon;
        details.bbox = bboxStr;
        details.profile = profile;
        details.rf_subjects = rfSubjStr;
        details.documents = ext.documents || [];
        details.regime_allowed = ext.regime_allowed || null;
        details.regime_forbidden = ext.regime_forbidden || null;
      }
    } catch (e) {
      console.warn(`[OOPT Service] ⚠️ Could not fetch live details for NID ${numNid}:`, e.message);
    }
  }

  // Parse bbox if present
  let parsedBbox = null;
  if (details.bbox) {
    try {
      parsedBbox = typeof details.bbox === 'string' ? JSON.parse(details.bbox) : details.bbox;
    } catch (_) {}
  }
  details.parsedBbox = parsedBbox;

  // Format R2BBX Coordinator Application Template and Submitter Fields
  details.submitterFields = parseSubmitterFields(details);
  details.applicationTemplate = generateR2bbxTemplate(details);

  return details;
}

/**
 * Matches OOPT records with existing POTA database (RU-0001+)
 */
// Region code map from POTA region (RU-XX) to Russian region names
const POTA_LOCATION_TO_REGION = {
  // 2-letter ISO codes used by POTA
  'RU-NS': 'Новосибирск',
  'RU-MOW': 'Москва', 'RU-MO': 'Москва',
  'RU-MOS': 'Московская', 'RU-MS': 'Московская',
  'RU-SPE': 'Санкт-Петербург', 'RU-SP': 'Санкт-Петербург',
  'RU-LEN': 'Ленинградская', 'RU-LN': 'Ленинградская',
  'RU-KDA': 'Краснодарский', 'RU-KD': 'Краснодарский',
  'RU-KHM': 'Ханты-Мансийск', 'RU-HM': 'Ханты-Мансийск', 'RU-YU': 'Югра',
  'RU-PRI': 'Приморский', 'RU-PR': 'Приморский',
  'RU-KHA': 'Хабаровский', 'RU-HB': 'Хабаровский', 'RU-KH': 'Хабаровский',
  'RU-KYA': 'Красноярский', 'RU-KY': 'Красноярский',
  'RU-ALT': 'Алтайский', 'RU-AL': 'Алтай',
  'RU-IRK': 'Иркутская', 'RU-IR': 'Иркутская',
  'RU-SVE': 'Свердловская', 'RU-SV': 'Свердловская',
  'RU-CHE': 'Челябинская', 'RU-CH': 'Челябинская', 'RU-CL': 'Челябинская',
  'RU-NIZ': 'Нижегородская', 'RU-NN': 'Нижегородская',
  'RU-SAM': 'Самарская', 'RU-SM': 'Самарская', 'RU-SR': 'Саратовская',
  'RU-BA': 'Башкортостан', 'RU-BAS': 'Башкортостан',
  'RU-TA': 'Татарстан', 'RU-TAT': 'Татарстан',
  'RU-KRM': 'Крым', 'RU-CR': 'Крым',
  'RU-SEV': 'Севастополь', 'RU-SE': 'Севастополь',
  'RU-ROS': 'Ростовская', 'RU-RO': 'Ростовская',
  'RU-VOR': 'Воронежская', 'RU-VR': 'Воронежская',
  'RU-VGG': 'Волгоградская', 'RU-VG': 'Волгоградская',
  'RU-STA': 'Ставропольский', 'RU-ST': 'Ставропольский',
  'RU-DAG': 'Дагестан', 'RU-DA': 'Дагестан',
  'RU-KEM': 'Кемеровская', 'RU-KM': 'Кемеровская',
  'RU-TOM': 'Томская', 'RU-TO': 'Томская',
  'RU-OMS': 'Омская', 'RU-OM': 'Омская',
  'RU-TYU': 'Тюменская', 'RU-TM': 'Тюменская', 'RU-TY': 'Тыва',
  'RU-PER': 'Пермский', 'RU-PM': 'Пермский',
  'RU-ORE': 'Оренбургская', 'RU-OB': 'Оренбургская',
  'RU-SAR': 'Саратовская',
  'RU-KIR': 'Кировская', 'RU-KV': 'Кировская',
  'RU-VLG': 'Вологодская', 'RU-VO': 'Вологодская',
  'RU-ARK': 'Архангельская', 'RU-AR': 'Архангельская',
  'RU-MUR': 'Мурманская', 'RU-MU': 'Мурманская',
  'RU-KAREL': 'Карелия', 'RU-KR': 'Карелия', 'RU-KI': 'Карелия', 'RU-KL': 'Калмыкия',
  'RU-KGD': 'Калининградская', 'RU-KN': 'Калининградская',
  'RU-KAM': 'Камчатский', 'RU-KT': 'Камчатский',
  'RU-SAK': 'Сахалинская', 'RU-SL': 'Сахалинская',
  'RU-SA': 'Саха', 'RU-YA': 'Якутия',
  'RU-YAN': 'Ямало-Ненецк', 'RU-YN': 'Ямало-Ненецк',
  'RU-CHU': 'Чукотск', 'RU-CK': 'Чукотск',
  'RU-MAG': 'Магаданск', 'RU-MG': 'Магаданск',
  'RU-AMU': 'Амурск', 'RU-AM': 'Амурск',
  'RU-ZAB': 'Забайкальск', 'RU-ZB': 'Забайкальск',
  'RU-BUR': 'Бурятия', 'RU-BU': 'Бурятия',
  'RU-KK': 'Хакасия', 'RU-HA': 'Хакасия',
  'RU-NO': 'Осетия', 'RU-SE': 'Осетия',
  'RU-KB': 'Кабардино-Балкар',
  'RU-KC': 'Карачаево-Черкес',
  'RU-AD': 'Адыгея',
  'RU-MO': 'Мордовия', 'RU-MR': 'Мордовия',
  'RU-ME': 'Марий Эл',
  'RU-CU': 'Чуваш', 'RU-CV': 'Чуваш',
  'RU-UD': 'Удмурт',
  'RU-KO': 'Коми',
  'RU-TVE': 'Тверская', 'RU-TV': 'Тверская',
  'RU-YAR': 'Ярославская', 'RU-YR': 'Ярославская',
  'RU-KOS': 'Костромская', 'RU-KS': 'Костромская',
  'RU-IVA': 'Ивановская', 'RU-IV': 'Ивановская',
  'RU-VLA': 'Владимирская', 'RU-VL': 'Владимирская',
  'RU-RYA': 'Рязанская', 'RU-RZ': 'Рязанская',
  'RU-TUL': 'Тульская', 'RU-TL': 'Тульская',
  'RU-KLU': 'Калужская', 'RU-KG': 'Калужская',
  'RU-SMO': 'Смоленская',
  'RU-BRY': 'Брянская', 'RU-BR': 'Брянская',
  'RU-ORL': 'Орловская', 'RU-OR': 'Орловская',
  'RU-LIP': 'Липецкая', 'RU-LP': 'Липецкая',
  'RU-TAM': 'Тамбовская', 'RU-TB': 'Тамбовская',
  'RU-BEL': 'Белгородская', 'RU-BL': 'Белгородская',
  'RU-KUR': 'Курская', 'RU-KU': 'Курская',
  'RU-AST': 'Астраханская', 'RU-AS': 'Астраханская',
  'RU-ULY': 'Ульяновская', 'RU-UL': 'Ульяновская',
  'RU-PNZ': 'Пензенская', 'RU-PZ': 'Пензенская',
  'RU-PSK': 'Псковская', 'RU-PS': 'Псковская',
  'RU-NGR': 'Новгородская', 'RU-NV': 'Новгородская',
};

const EN_TO_RU_WORDS = {
  'southern': ['южн'],
  'northern': ['северн'],
  'eastern': ['восточн'],
  'western': ['западн'],
  'central': ['центральн'],
  'siberian': ['сибир'],
  'upper': ['верхн'],
  'lower': ['нижн'],
  'great': ['велик', 'больш'],
  'dendrological': ['дендролог'],
  'botanical': ['ботаническ'],
  'ladoga': ['ладож'],
  'skerries': ['шхер'],
};

const STOP_WORDS = new Set([
  'park', 'parks', 'national', 'natural', 'nature', 'reserve', 'reserves', 'sanctuary', 'sanctuaries', 
  'monument', 'monuments', 'area', 'areas', 'zone', 'zones', 'memorial', 'state', 'federal', 'regional', 
  'local', 'city', 'town', 'district', 'oblast', 'krai', 'republic', 'forest', 'forests', 'gardens', 
  'garden', 'branch', 'pine', 'wood', 'woods', 'complex', 'landscape', 'recreation',
  'парк', 'парки', 'национальный', 'природный', 'заповедник', 'заповедники', 'заказник', 'заказники', 
  'памятник', 'памятники', 'природы', 'государственный', 'федеральный', 'региональный', 'местный', 
  'сад', 'сады', 'бор', 'роща', 'урочище', 'комплекс', 'ландшафт', 'ландшафтный', 'отделение', 
  'филиал', 'институт', 'академия', 'наук', 'район', 'область', 'край', 'республика', 'округ', 'лесопарк'
]);

function normalizeStem(token) {
  return (token || '').replace(/(skiy|sky|y|oe|aya|nyy|ogo|omu|ey|oy)$/, '');
}

function cleanTokens(str) {
  const words = (str || '').toLowerCase().replace(/[-–—"«»()—–,.:;/]/g, ' ').split(/\s+/);
  const result = [];
  for (const w of words) {
    if (w.length < 3) continue;
    if (STOP_WORDS.has(w)) continue;
    const t = transliterateRuToEn(w).toLowerCase().replace(/yy|iy/g, 'y').replace(/i/g, 'y');
    if (!STOP_WORDS.has(t) && t.length >= 3) {
      result.push(t);
    }
  }
  return result;
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Matches OOPT records with existing POTA database (RU-0001+)
 */
export function syncPotaMatches() {
  const fallbackPath = path.resolve(__dirname, '../data/parks_fallback.json');
  if (!fs.existsSync(fallbackPath)) {
    console.warn('[OOPT Service] ⚠️ Fallback file not found at:', fallbackPath);
    return { matched: 0 };
  }

  const fallback = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
  const ruPota = fallback.filter(p => p.reference && p.reference.startsWith('RU-'));
  const ooptRows = db.prepare('SELECT nid, title, category, sig, ate, lat, lon FROM oopt_registry').all();

  const ooptPrepared = ooptRows.map(o => ({
    nid: o.nid,
    title: o.title,
    category: o.category,
    sig: o.sig,
    lat: o.lat ? parseFloat(o.lat) : null,
    lon: o.lon ? parseFloat(o.lon) : null,
    tokens: cleanTokens(o.title),
    titleLower: (o.title || '').toLowerCase(),
    catLower: (o.category || '').toLowerCase(),
    ateLower: (o.ate || '').toLowerCase(),
  }));

  const potentialMatches = [];

  for (const p of ruPota) {
    const pTokens = cleanTokens(p.name);
    const pNameLower = (p.name || '').toLowerCase();
    const pLat = parseFloat(p.lat);
    const pLon = parseFloat(p.lon);

    // Region hint
    let regionHint = null;
    const pRegion = p.region || p.locationDesc;
    if (pRegion) {
      const locs = pRegion.split(',');
      for (const l of locs) {
        const trimmed = l.trim();
        if (POTA_LOCATION_TO_REGION[trimmed]) {
          regionHint = POTA_LOCATION_TO_REGION[trimmed].toLowerCase();
          break;
        }
      }
    }

    // Pre-find English translated roots
    const matchingRuRoots = [];
    for (const [enWord, ruRoots] of Object.entries(EN_TO_RU_WORDS)) {
      if (pNameLower.includes(enWord)) {
        matchingRuRoots.push(...ruRoots);
      }
    }

    const candidates = regionHint 
      ? ooptPrepared.filter(o => o.ateLower.includes(regionHint))
      : ooptPrepared;

    for (const o of candidates) {
      let score = 0;
      let properNameMatch = false;
      let matchedTokenCount = 0;

      // Reject if coordinates exist in both and distance is huge (> 120km)
      if (pLat && pLon && o.lat && o.lon) {
        const dist = getDistanceKm(pLat, pLon, o.lat, o.lon);
        if (dist !== null && dist > 120) {
          continue;
        }
      }

      // Check token overlap (proper nouns only!)
      for (const pt of pTokens) {
        const pStem = normalizeStem(pt);
        for (const ot of o.tokens) {
          const oStem = normalizeStem(ot);
          if (pt === ot) {
            score += 50;
            properNameMatch = true;
            matchedTokenCount++;
            break;
          } else if (pStem.length >= 4 && oStem.length >= 4) {
            if (pStem === oStem) {
              score += 45;
              properNameMatch = true;
              matchedTokenCount++;
              break;
            } else if (pStem.startsWith(oStem) || oStem.startsWith(pStem)) {
              if (pStem !== 'ust' && oStem !== 'ust') {
                score += 30;
                properNameMatch = true;
                matchedTokenCount++;
                break;
              }
            }
          }
        }
      }

      // Check English translation dictionary
      let rootMatchesCount = 0;
      for (const root of matchingRuRoots) {
        if (o.titleLower.includes(root)) {
          rootMatchesCount++;
          score += 35;
          properNameMatch = true;
        }
      }
      matchedTokenCount += rootMatchesCount;

      if (!properNameMatch) continue;

      // Distance bonus/penalty (only if properNameMatch)
      if (pLat && pLon && o.lat && o.lon) {
        const dist = getDistanceKm(pLat, pLon, o.lat, o.lon);
        if (dist !== null) {
          if (dist < 10) score += 30;
          else if (dist < 30) score += 20;
          else if (dist < 60) score += 10;
          else if (dist > 100) score -= 35;
        }
      }

      // Category bonus
      if (pNameLower.includes('national park') && o.catLower.includes('национальный парк')) score += 20;
      if (pNameLower.includes('reserve') && o.catLower.includes('заповедник')) score += 20;
      if ((pNameLower.includes('sanctuary') || pNameLower.includes('natural reserve')) && o.catLower.includes('заказник')) score += 20;
      if (pNameLower.includes('botanical') && (o.catLower.includes('ботанический') || o.titleLower.includes('ботанический'))) score += 25;
      if (pNameLower.includes('dendrological') && (o.catLower.includes('дендрологический') || o.titleLower.includes('дендрологический'))) score += 25;

      // Penalty if POTA is an urban/culture park but OOPT is a bog or steppe without close coordinates
      if ((pNameLower.includes('park') || pNameLower.includes('garden') || pNameLower.includes('grove')) && 
          (o.titleLower.includes('болот') || o.titleLower.includes('степ') || o.titleLower.includes('пещ')) && 
          (!pLat || !o.lat || getDistanceKm(pLat, pLon, o.lat, o.lon) > 20)) {
        score -= 40;
      }

      if (score >= 45) {
        potentialMatches.push({
          pota: p,
          oopt: o,
          score
        });
      }
    }
  }

  // Greedy 1-to-1 bipartite assignment by highest score
  potentialMatches.sort((a, b) => b.score - a.score);

  const assignedOopt = new Set();
  const assignedPota = new Set();
  const finalMatches = [];

  for (const m of potentialMatches) {
    if (!assignedPota.has(m.pota.reference) && !assignedOopt.has(m.oopt.nid)) {
      assignedPota.add(m.pota.reference);
      assignedOopt.add(m.oopt.nid);
      finalMatches.push(m);
    }
  }

  // Update Database: reset old matches then apply high-confidence matches
  const resetStmt = db.prepare('UPDATE oopt_registry SET pota_ref = NULL, pota_name = NULL');
  const updateStmt = db.prepare('UPDATE oopt_registry SET pota_ref = ?, pota_name = ? WHERE nid = ?');

  const transaction = db.transaction((list) => {
    resetStmt.run();
    for (const m of list) {
      updateStmt.run(m.pota.reference, m.pota.name, m.oopt.nid);
    }
  });

  transaction(finalMatches);

  // Invalidate in-memory stats cache so UI counter updates immediately
  cachedStats = null;

  console.log(`[OOPT Service] 🌲 Synced POTA matches: ${finalMatches.length} / ${ruPota.length} Russian parks mapped to OOPT registry!`);
  return { matched: finalMatches.length };
}

export default {
  syncOoptRegistry,
  syncPotaMatches,
  getOoptList,
  getOoptStats,
  getOoptDetails,
  parseSubmitterFields,
  generateR2bbxTemplate,
};

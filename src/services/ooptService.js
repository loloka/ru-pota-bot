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
    'User-Agent': 'RU-POTA-Bot/1.16.6 (Telegram Bot; Node.js)',
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
  /федерального государственного автономного образовательного учреждения высшего образования/gi,
  /федерального государственного автономного образовательного учреждения высшего профессионального образования/gi,
  /федерального государственного автономного образовательного учреждения/gi,
  /федерального государственного автономного научного учреждения/gi,
  /федерального государственного автономного учреждения/gi,
  /федерального государственного бюджетного образовательного учреждения высшего образования/gi,
  /федерального государственного бюджетного образовательного учреждения высшего профессионального образования/gi,
  /федерального государственного бюджетного образовательного учреждения/gi,
  /федерального государственного бюджетного научного учреждения/gi,
  /федерального государственного бюджетного учреждения науки/gi,
  /федерального государственного бюджетного учреждения/gi,
  /федерального государственного казенного учреждения/gi,
  /государственного бюджетного образовательного учреждения высшего образования/gi,
  /государственного бюджетного образовательного учреждения высшего профессионального образования/gi,
  /государственного бюджетного образовательного учреждения/gi,
  /государственного образовательного учреждения высшего профессионального образования/gi,
  /государственного образовательного учреждения/gi,
  /государственного бюджетного учреждения/gi,
  /государственного казенного учреждения/gi,
  /государственного автономного учреждения/gi,
  /федерального бюджетного учреждения/gi,
  /федерального автономного учреждения/gi,
  /федерального казенного учреждения/gi,
  /федерального государственного автономного/gi,
  /федерального государственного бюджетного/gi,
  /федерального государственного казенного/gi,
  /федерального государственного/gi,
  /государственного бюджетного/gi,
  /государственного автономного/gi,
  /государственного казенного/gi,
  /высшего профессионального образования/gi,
  /высшего образования/gi,
  /образовательного учреждения/gi,
  /научного учреждения/gi,
  /бюджетного учреждения/gi,
  /автономного учреждения/gi,
  /казенного учреждения/gi,
  /обособленного подразделения/gi,
  /структурного подразделения/gi,
  /федерального исследовательского центра/gi,
  /исследовательского центра/gi,
  /научного центра/gi,
  /Сибирского отделения Российской академии наук/gi,
  /Дальневосточного отделения Российской академии наук/gi,
  /Уральского отделения Российской академии наук/gi,
  /Российской академии наук/gi,
  /Российской академии медицинских наук/gi,
  /Российской академии сельскохозяйственных наук/gi,
];

const CATEGORY_PREFIXES = [
  'Государственный природный биосферный заповедник',
  'Государственный природный заповедник',
  'Государственный природный заказник',
  'Государственный ландшафтный заказник',
  'Национальный природный парк',
  'Национальный парк',
  'Природный парк',
  'Памятник природы',
  'Охраняемый природный ландшафт',
  'Учебный Ботанический сад',
  'Учебный ботанический сад',
  'Главный ботанический сад',
  'Главного ботанического сада',
  'Ботанический сад-институт',
  'Дендрологический парк и ботанический сад',
  'Дендрологический парк',
  'Дендрологический сад',
  'Ботанический сад',
  'Дендрарий',
  'Чебоксарский филиал'
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

const RAW_GEOGRAPHIC_TERMS = [
  // Multi-word phrases first
  ['русский лес', 'Russian Forest'],
  ['сосновый бор', 'Pine Forest'],
  ['красный бор', 'Krasny Bor'],
  ['зеленый остров', 'Green Island'],
  ['зелёный остров', 'Green Island'],
  ['белое озеро', 'White Lake'],
  ['черное озеро', 'Black Lake'],
  ['чёрное озеро', 'Black Lake'],
  ['святой источник', 'Holy Spring'],

  // Russian / nationality
  ['русск(ий|ая|ое|ие)', 'Russian'],

  // Relative/Location adjectives
  ['приозерн(ый|ая|ое|ые)', 'Lakeside'],
  ['приморск(ий|ая|ое|ие)', 'Seaside'],
  ['приречн(ый|ая|ое|ые)', 'Riverside'],
  ['заозерн(ый|ая|ое|ые)', 'Zaozerny'],
  ['лесной|лесная|лесное|лесные', 'Forest'],
  ['горный|горная|горное|горные', 'Mountain'],
  ['степной|степная|степное|степные', 'Steppe'],

  // Natural features (nouns)
  ['склон(ы)?', 'Slope'],
  ['луг(а)?', 'Meadow'],
  ['пол(е|я)', 'Field'],
  ['руче(й|и)', 'Brook'],
  ['холм(ы)?', 'Hill'],
  ['берег(а)?', 'Shore'],
  ['пески', 'Sands'],
  ['дюн(а|ы)', 'Dune'],
  ['лес(а)?', 'Forest'],
  ['бор', 'Pine Forest'],
  ['остров(а)?', 'Island'],
  ['озер(о|а|ёра)', 'Lake'],
  ['гор(а|ы)', 'Mountain'],
  ['хребет', 'Ridge'],
  ['сопк(а|и)', 'Sopka'],
  ['скал(а|ы)', 'Rock'],
  ['пещер(а|ы)', 'Cave'],
  ['рек(а|и)', 'River'],
  ['долин(а|ы)', 'Valley'],
  ['урочище', 'Tract'],
  ['рощ(а|и)', 'Grove'],
  ['мыс', 'Cape'],
  ['залив', 'Bay'],
  ['бухт(а|ы)', 'Cove'],
  ['болот(о|а)', 'Bog'],
  ['пруд(ы)?', 'Pond'],
  ['ключ(и)?', 'Spring'],
  ['источник(и)?', 'Spring'],
  ['водопад(ы)?', 'Waterfall'],
  ['ущель(е|я)', 'Gorge'],
  ['каньон', 'Canyon'],
  ['кос(а|ы)', 'Spit'],
  ['степ(ь|и)', 'Steppe'],
  ['курган', 'Kurgan'],

  // Adjectives
  ['северн(ый|ая|ое|ые)', 'Northern'],
  ['южн(ый|ая|ое|ые)', 'Southern'],
  ['восточн(ый|ая|ое|ые)', 'Eastern'],
  ['западн(ый|ая|ое|ые)', 'Western'],
  ['центральн(ый|ая|ое|ые)', 'Central'],
  ['верхн(ий|яя|ее|ие)', 'Upper'],
  ['нижн(ий|яя|ее|ие)', 'Lower'],
  ['средн(ий|яя|ее|ие)', 'Middle'],
  ['больш(ой|ая|ое|ие)', 'Great'],
  ['мал(ый|ая|ое|ые)', 'Small'],
  ['бел(ый|ая|ое|ые)', 'White'],
  ['черн(ый|ая|ое|ые)|чёрн(ый|ая|ое|ые)', 'Black'],
  ['красн(ый|ая|ое|ые)', 'Red'],
  ['зелен(ый|ая|ое|ые)|зелён(ый|ая|ое|ые)', 'Green'],
  ['син(ий|яя|ее|ие)', 'Blue'],
  ['голуб(ой|ая|ое|ые)', 'Blue'],
  ['золот(ой|ая|ое|ые)', 'Golden'],
  ['серебрян(ый|ая|ое|ые)', 'Silver'],
  ['свят(ой|ая|ое|ые)', 'Holy'],

  // Academic & Institutional
  ['государственн(ый|ая|ое|ые|ого|ому|ом)', 'State'],
  ['федеральн(ый|ая|ое|ые|ого|ому|ом)', 'Federal'],
  ['университет(а|у|ом|е)?', 'University'],
  ['институт(а|у|ом|е)?', 'Institute'],
  ['академи(я|и|ю|ей)', 'Academy'],
  ['аграрн(ый|ая|ое|ые|ого|ому|ом)', 'Agrarian'],
  ['политехническ(ий|ая|ое|ие|ого|ому|ом)', 'Polytechnic'],
  ['медицинск(ий|ая|ое|ие|ого|ому|ом)', 'Medical'],
  ['педагогическ(ий|ая|ое|ие|ого|ому|ом)', 'Pedagogical'],
  ['технологическ(ий|ая|ое|ие|ого|ому|ом)', 'Technological'],
  ['приволжск(ий|ая|ое|ие|ого|ому|ом)', 'Volga Region']
];

// Compile with Cyrillic-safe lookahead and lookbehind word boundaries
const GEOGRAPHIC_TERMS = RAW_GEOGRAPHIC_TERMS.map(([pat, repl]) => [
  new RegExp('(?<![а-яёa-z0-9])' + pat + '(?![а-яёa-z0-9])', 'gi'),
  repl
]);

export function getEnglishCategorySuffix(category) {
  const c = (category || '').toLowerCase();
  if (c.includes('морск')) return 'State Marine Reserve';
  if (c.includes('национальный парк')) return 'National Park';
  if (c.includes('биосферный заповедник')) return 'State Biosphere Nature Reserve';
  if (c.includes('заповедник')) return 'State Nature Reserve';
  if (c.includes('заказник')) return 'State Nature Reserve';
  if (c.includes('памятник природы')) return 'Nature Monument';
  if (c.includes('природный парк')) return 'Nature Park';
  if (c.includes('ландшафт')) return 'Protected Landscape';
  if (c.includes('ботанический сад')) return 'Botanical Garden';
  if (c.includes('дендрологический')) return 'Botanical Garden';
  if (c.includes('резерват')) return 'Nature Reserve';
  return 'Nature Reserve';
}

export function cleanOoptName(rawTitle, category) {
  let name = (rawTitle || '').trim();

  // 1. Strip bureaucratic junk first
  for (const pat of BUREAUCRATIC_PATTERNS) {
    name = name.replace(pat, ' ');
  }
  name = name.replace(/\s+/g, ' ').trim();

  // 2. Category prefix stripping
  for (const p of CATEGORY_PREFIXES) {
    if (name.toLowerCase().startsWith(p.toLowerCase())) {
      const rem = name.substring(p.length).trim().replace(/^[-–—,: ]+/, '').trim();
      if (rem.length > 2) {
        name = rem;
        break;
      }
    }
  }

  // 3. Extract quotes if present
  const quoteMatch = name.match(/["«]([^"»]+)["»]/);
  if (quoteMatch && quoteMatch[1].length > 3) {
    const beforeQuote = name.substring(0, quoteMatch.index).trim().replace(/^[-–—,: ]+/, '').trim();
    if (!beforeQuote || beforeQuote.length < 5 || /^(при|на|базе|отделения|института|центра)\b/i.test(beforeQuote)) {
      name = quoteMatch[1].trim();
    } else if (beforeQuote.includes('им.') || beforeQuote.toLowerCase().includes('имени')) {
      name = beforeQuote + ' (' + quoteMatch[1].trim() + ')';
    } else {
      name = quoteMatch[1].trim();
    }
  }

  // 4. Common institutional acronyms & cleanups
  name = name.replace(/["«]/g, '').replace(/["»]/g, '')
    .replace(/Московского государственного университета/gi, 'МГУ')
    .replace(/Московский государственный университет/gi, 'МГУ')
    .replace(/имени М\.?В\.?\s*Ломоносова/gi, 'им. М.В. Ломоносова')
    .replace(/имени\s+/gi, 'им. ')
    .replace(/\s+/g, ' ')
    .trim();

  // 5. Repeat category prefix stripping if revealed after quote extraction
  for (const p of CATEGORY_PREFIXES) {
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

  // Institutional replacements
  s = s.replace(/Биологического факультета МГУ им\.? М\.?В\.?\s*Ломоносова/gi, 'MSU Faculty of Biology')
       .replace(/МГУ им\.? М\.?В\.?\s*Ломоносова/gi, 'MSU')
       .replace(/МГУ/g, 'MSU')
       .replace(/БИН РАН/g, 'BIN RAS')
       .replace(/РАН/g, 'RAS')
       .replace(/СО РАН/g, 'SB RAS')
       .replace(/Петра Великого/gi, 'Peter the Great');

  // Apply natural geographic terms translation
  for (const [pattern, repl] of GEOGRAPHIC_TERMS) {
    s = s.replace(pattern, repl);
  }

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
  return en.replace(/\s+/g, ' ').trim();
}

export function transliterateOnly(cleanName) {
  if (!cleanName) return '';
  let s = cleanName.replace(/["«]/g, '').replace(/["»]/g, '').trim();

  s = s.replace(/Биологического факультета МГУ им\.? М\.?В\.?\s*Ломоносова/gi, 'MSU Faculty of Biology')
       .replace(/МГУ им\.? М\.?В\.?\s*Ломоносова/gi, 'MSU')
       .replace(/МГУ/g, 'MSU')
       .replace(/БИН РАН/g, 'BIN RAS')
       .replace(/РАН/g, 'RAS')
       .replace(/СО РАН/g, 'SB RAS');

  let en = transliterateRuToEn(s);
  en = en.replace(/skogo\b/gi, 'sky')
         .replace(/skogo gosudarstvennogo\b/gi, 'State')
         .replace(/gosudarstvennogo\b/gi, 'State')
         .replace(/pedagogicheskogo\b/gi, 'Pedagogical')
         .replace(/universiteta\b/gi, 'University')
         .replace(/instituta\b/gi, 'Institute');

  en = en.split(' ').map(w => w ? (w.charAt(0).toUpperCase() + w.slice(1)) : '').join(' ').trim();
  return en.replace(/\s+/g, ' ').trim();
}

/**
 * Generates combined "Translation (Transliteration)" name for POTA coordinator
 * (per Manu R2BBX spec, e.g. "Lakeside (Priozernyy)", "Russian Forest (Russkiy Les)").
 * If translation equals transliteration (proper nouns like "Mashuk"), returns single name.
 */
export function formatDualParkName(cleanName, category) {
  if (!cleanName) return '';
  const translated = translateNameToEnglish(cleanName, category);
  const transliterated = transliterateOnly(cleanName);

  if (translated && transliterated && translated.toLowerCase() !== transliterated.toLowerCase()) {
    if (!translated.includes('(')) {
      return `${translated} (${transliterated})`;
    }
  }
  return translated || transliterated || '';
}

export function getDxEntity(regionName = '', title = '') {
  const r = (regionName || '').toLowerCase();
  const t = (title || '').toLowerCase();

  if (r.includes('калининград') || t.includes('калининград')) {
    return 'Kaliningrad (RU)';
  }
  if (t.includes('франца-иосифа') || t.includes('франца иосифа') || t.includes('земля франца') || r.includes('франца-иосифа')) {
    return 'Franz Josef Land (RU)';
  }

  // Asiatic Russia regions (requires word boundary to prevent 'костромская' matching 'омск'!)
  const asiaticPatterns = [
    /(?<![а-яёa-z0-9])свердловск/i,
    /(?<![а-яёa-z0-9])челябинск/i,
    /(?<![а-яёa-z0-9])курганск/i,
    /(?<![а-яёa-z0-9])тюмен/i,
    /(?<![а-яёa-z0-9])ханты-мансий/i,
    /(?<![а-яёa-z0-9])югр/i,
    /(?<![а-яёa-z0-9])ямало-ненец/i,
    /(?<![а-яёa-z0-9])томск/i,
    /(?<![а-яёa-z0-9])омск/i,
    /(?<![а-яёa-z0-9])новосибирск/i,
    /(?<![а-яёa-z0-9])кемеров/i,
    /(?<![а-яёa-z0-9])алтай/i,
    /(?<![а-яёa-z0-9])красноярск/i,
    /(?<![а-яёa-z0-9])хакас/i,
    /(?<![а-яёa-z0-9])тыв/i,
    /(?<![а-яёa-z0-9])тув/i,
    /(?<![а-яёa-z0-9])иркутск/i,
    /(?<![а-яёa-z0-9])бурят/i,
    /(?<![а-яёa-z0-9])забайкал/i,
    /(?<![а-яёa-z0-9])якут/i,
    /(?<![а-яёa-z0-9])саха(?![а-яёa-z0-9]*лин)/i,
    /(?<![а-яёa-z0-9])амурск/i,
    /(?<![а-яёa-z0-9])хабаровск/i,
    /(?<![а-яёa-z0-9])приморск/i,
    /(?<![а-яёa-z0-9])еврейск/i,
    /(?<![а-яёa-z0-9])магадан/i,
    /(?<![а-яёa-z0-9])чукот/i,
    /(?<![а-яёa-z0-9])камчат/i,
    /(?<![а-яёa-z0-9])сахалин/i,
  ];

  for (const pat of asiaticPatterns) {
    if (pat.test(r)) {
      return 'Asiatic Russia (RU)';
    }
  }

  return 'European Russia (RU)';
}

export const REGION_TO_POTA_LOCATION = {
  'ставрополь': 'RU-ST',
  'москва': 'RU-MOW',
  'московская': 'RU-MOS',
  'санкт-петербург': 'RU-SPE',
  'ленинградская': 'RU-LEN',
  'краснодарский': 'RU-KDA',
  'калининградская': 'RU-KGD',
  'ростовская': 'RU-ROS',
  'волгоградская': 'RU-VGG',
  'воронежская': 'RU-VOR',
  'самарская': 'RU-SAM',
  'саратовская': 'RU-SAR',
  'нижегородская': 'RU-NIZ',
  'татарстан': 'RU-TA',
  'башкортостан': 'RU-BA',
  'крым': 'RU-KRM',
  'севастополь': 'RU-SEV',
  'дагестан': 'RU-DAG',
  'чечен': 'RU-CN',
  'ингушет': 'RU-IN',
  'кабардино-балкар': 'RU-KB',
  'карачаево-черкес': 'RU-KC',
  'северная осетия': 'RU-NO',
  'адыгея': 'RU-AD',
  'калмыкия': 'RU-KL',
  'астраханская': 'RU-AST',
  'архангельская': 'RU-ARK',
  'мурманская': 'RU-MUR',
  'вологодская': 'RU-VLG',
  'карелия': 'RU-KR',
  'коми': 'RU-KO',
  'новгородская': 'RU-NGR',
  'псковская': 'RU-PSK',
  'тверская': 'RU-TVE',
  'ярославская': 'RU-YAR',
  'костромская': 'RU-KOS',
  'ивановская': 'RU-IVA',
  'владимирская': 'RU-VLA',
  'рязанская': 'RU-RYA',
  'тульская': 'RU-TUL',
  'калужская': 'RU-KLU',
  'смоленская': 'RU-SMO',
  'брянская': 'RU-BRY',
  'орловская': 'RU-ORL',
  'липецкая': 'RU-LIP',
  'тамбовская': 'RU-TAM',
  'белгородская': 'RU-BEL',
  'курская': 'RU-KUR',
  'пензенская': 'RU-PNZ',
  'ульяновская': 'RU-ULY',
  'кировская': 'RU-KIR',
  'чуваш': 'RU-CU',
  'марий эл': 'RU-ME',
  'мордовия': 'RU-MO',
  'удмурт': 'RU-UD',
  'пермский': 'RU-PER',
  'оренбургская': 'RU-ORE',
  'свердловская': 'RU-SVE',
  'челябинская': 'RU-CHE',
  'курганская': 'RU-KGN',
  'тюменская': 'RU-TYU',
  'ханты-мансийский': 'RU-KHM',
  'ямало-ненецкий': 'RU-YAN',
  'новосибирская': 'RU-NS',
  'омская': 'RU-OMS',
  'томская': 'RU-TOM',
  'кемеровская': 'RU-KEM',
  'алтайский': 'RU-ALT',
  'алтай': 'RU-AL',
  'красноярский': 'RU-KYA',
  'хакасия': 'RU-KK',
  'тыва': 'RU-TY',
  'иркутская': 'RU-IRK',
  'бурятия': 'RU-BUR',
  'забайкальский': 'RU-ZAB',
  'саха': 'RU-SA',
  'якутия': 'RU-SA',
  'еврейская': 'RU-YEV',
  'амурская': 'RU-AMU',
  'хабаровский': 'RU-KHA',
  'приморский': 'RU-PRI',
  'магаданская': 'RU-MAG',
  'чукотский': 'RU-CHU',
  'камчатский': 'RU-KAM',
  'сахалинская': 'RU-SAK',
};

export function getPotaLocationCode(regionStr = '') {
  if (!regionStr) return '';
  const parts = regionStr.split(/[,;\/]+/).map(s => s.trim().toLowerCase());
  const foundCodes = [];

  for (const part of parts) {
    for (const [kw, code] of Object.entries(REGION_TO_POTA_LOCATION)) {
      if (part.includes(kw)) {
        if (!foundCodes.includes(code)) foundCodes.push(code);
        break;
      }
    }
  }

  return foundCodes.join(', ');
}

export function formatClarification(item) {
  if (!item) return '';
  const parts = [];

  // Non-standard status
  if (item.status && item.status !== 'действующий') parts.push(`Статус: ${item.status}`);

  // 1. Nested OOPTs (Priority per Manu R2BBX: "Вместо площади")
  let nestedList = [];
  if (Array.isArray(item.nested_oopt)) {
    nestedList = item.nested_oopt;
  } else if (Array.isArray(item.parsedNestedOopt)) {
    nestedList = item.parsedNestedOopt;
  } else if (typeof item.nested_oopt === 'string' && item.nested_oopt.trim()) {
    try {
      nestedList = JSON.parse(item.nested_oopt);
    } catch (_) {
      nestedList = item.nested_oopt.split(/[,;\n]+/).map(s => ({ name: s.trim() })).filter(x => x.name);
    }
  }

  const selfTitle = (item.title || item.rawTitle || item.name || '').toLowerCase().trim();
  const selfClean = cleanOoptName(selfTitle).toLowerCase().trim();
  const selfNid = item.nid ? Number(item.nid) : null;

  // Filter out self-reference (e.g. NextGIS listing parent OOPT under its own nested items)
  const formattedNested = (nestedList || []).map(n => {
    const name = typeof n === 'string' ? n : (n.name || n.title || '');
    const cleanN = name.toLowerCase().trim();
    const nNid = typeof n === 'object' && n.nid ? Number(n.nid) : null;
    if (selfNid && nNid && selfNid === nNid) return '';
    if (cleanN && (cleanN === selfTitle || cleanN === selfClean)) return '';
    const ref = typeof n === 'object' && n.pota_ref ? ` (${n.pota_ref})` : '';
    return name ? `${name}${ref}` : '';
  }).filter(Boolean);

  if (formattedNested.length > 0) {
    parts.push(`В границах ООПТ: ${formattedNested.join(', ')}`);
  } else {
    // If no nested OOPTs (or only self-reference), include Profile and Area
    if (item.profile) parts.push(`Профиль: ${item.profile}`);
    if (item.area) parts.push(`Площадь: ${Number(item.area).toLocaleString('ru-RU')} га`);
  }

  let text = parts.join('. ');
  if (text.length > 255) {
    text = text.substring(0, 252).trim() + '...';
  }
  return text;
}

/**
 * Smartly parses raw title, category, significance, and regions per Manu R2BBX's rules:
 * - "Лосиный Остров" goes into Name, and "Национальный парк" goes into Status.
 * - Both regions (e.g. Москва и Московская область) must be included when cross-regional.
 * - Generates English name for POTA.
 * - Uses priority NextGIS URL (https://ooptaari.nextgis.ru/node/:id).
 */
export function parseSubmitterFields(item) {
  const rawTitle = (item.title || '').trim();
  const rawCat = deduceCategory(rawTitle, item.category);
  const cleanName = cleanOoptName(rawTitle, rawCat);
  const detectedCategory = rawCat.charAt(0).toUpperCase() + rawCat.slice(1);

  // English translation for POTA (dual Translation (Transliteration) per R2BBX request)
  const nameEn = formatDualParkName(cleanName, rawCat);
  const statusEn = getEnglishCategorySuffix(rawCat);

  // Significance
  const sigDisplay = item.sig_display || (item.sig === 'federal' ? 'Федеральное' : item.sig === 'regional' ? 'Региональное' : 'Местное');
  const fullStatus = `${detectedCategory} (${sigDisplay} значение)`;

  // Region(s) - preserve multi-region like "Москва, Московская область"
  let region = item.rf_subjects || item.ate || '';
  if (region.includes('(')) {
    region = region.split('(')[0].trim();
  }

  // DX Entity and Location Code
  const dxEntity = getDxEntity(region, rawTitle);
  const locationCode = getPotaLocationCode(region);

  // Coordinates (4 decimal places as requested by Manu R2BBX)
  const lat = item.lat !== null && item.lat !== undefined && item.lat !== '' ? Number(item.lat).toFixed(4) : '';
  const lon = item.lon !== null && item.lon !== undefined && item.lon !== '' ? Number(item.lon).toFixed(4) : '';

  // Priority NextGIS link requested by Manu (R2BBX): node/:id
  const siteUrl = item.nid ? `https://ooptaari.nextgis.ru/node/${item.nid}` : 'https://карта.оцзк.рф/';

  // Clarification strictly formatted <= 255 chars
  const clarification = formatClarification(item);

  return {
    nid: item.nid,
    rawTitle,
    name: cleanName,
    nameEn,
    statusEn,
    status: fullStatus,
    dxEntity,
    locationCode,
    lat,
    lon,
    region,
    siteUrl,
    clarification,
    pota_ref: item.pota_ref || null,
    pota_name: item.pota_name || null,
    nested_oopt: item.nested_oopt || null
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
    `Статус ООПТ для POTA (EN): ${f.statusEn}`,
    `Статус (парк/ООПТ и т.п.): ${f.status}`,
    `DX Entity: ${f.dxEntity}`,
    `Локация POTA: ${f.locationCode}`,
    `Регион России: ${f.region}`,
    `Координата первая с яндекс-карт: ${f.lat}`,
    `Координата вторая: ${f.lon}`,
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

  // If nested OOPTs not yet checked/cached, fetch from NextGIS node page
  if (row.nested_oopt === null) {
    try {
      const nextgisRes = await axios.get(`https://ooptaari.nextgis.ru/node/${numNid}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 6000
      });
      const html = nextgisRes.data;
      const match = typeof html === 'string' ? html.match(/Наличие в границах ООПТ иных ООПТ:[\s\S]*?<\/div>\s*<\/div>/i) : null;
      const extracted = [];
      if (match) {
        const items = [];
        const linkRegex = /<a[^>]*>([^<]+)<\/a>/g;
        let m;
        while ((m = linkRegex.exec(match[0])) !== null) {
          const cleanItem = m[1].trim();
          if (cleanItem && !items.includes(cleanItem)) items.push(cleanItem);
        }
        if (items.length === 0) {
          const textContent = match[0].replace(/<[^>]+>/g, ' ').replace('Наличие в границах ООПТ иных ООПТ:', '').trim();
          const rawParts = textContent.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
          items.push(...rawParts);
        }

        const selfTitle = (row.title || '').toLowerCase().trim();
        const selfClean = cleanOoptName(selfTitle).toLowerCase().trim();

        for (const itemTitle of items) {
          const cleanItem = itemTitle.trim();
          const itemClean = cleanOoptName(cleanItem).toLowerCase().trim();
          if (cleanItem.toLowerCase() === selfTitle || itemClean === selfClean) continue;

          const found = db.prepare('SELECT nid, title, pota_ref, pota_name FROM oopt_registry WHERE title = ? OR title LIKE ? LIMIT 1').get(cleanItem, `%${cleanItem}%`);
          if (found && found.nid === numNid) continue;

          extracted.push({
            name: cleanItem,
            pota_ref: found?.pota_ref || null,
            pota_name: found?.pota_name || null,
            nid: found?.nid || null
          });
        }
      }
      const jsonStr = JSON.stringify(extracted);
      db.prepare("UPDATE oopt_registry SET nested_oopt = ? WHERE nid = ?").run(jsonStr, numNid);
      details.nested_oopt = jsonStr;
    } catch (e) {
      // Non-critical network warning
    }
  }

  // Parse nested OOPTs if available
  let parsedNestedOopt = [];
  if (details.nested_oopt) {
    try {
      parsedNestedOopt = typeof details.nested_oopt === 'string' ? JSON.parse(details.nested_oopt) : details.nested_oopt;
    } catch (_) {}
  }
  details.parsedNestedOopt = parsedNestedOopt;

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
  formatDualParkName,
  generateR2bbxTemplate,
};

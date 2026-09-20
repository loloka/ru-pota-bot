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
    'User-Agent': 'RU-POTA-Bot/1.16.18 (Telegram Bot; Node.js)',
    'Accept': 'application/json',
  },
});

/**
 * Loads Russian POTA parks from fallback dataset
 */
export function getRussianPotaParks() {
  const fallbackPath = path.resolve(__dirname, '../data/parks_fallback.json');
  try {
    if (!fs.existsSync(fallbackPath)) return [];
    const content = fs.readFileSync(fallbackPath, 'utf8');
    const parks = JSON.parse(content);
    return parks.filter(p => p.reference && p.reference.startsWith('RU-'));
  } catch (err) {
    console.warn('[OOPT Service] ⚠️ Failed to load parks fallback:', err.message);
    return [];
  }
}

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

export function isPotaRestrictedAte(ate = '') {
  if (!ate) return false;
  return /крым|севастопол|донецк|луганск|запорож|херсон/i.test(ate);
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

  const baseConditions = [];
  const baseParams = [];

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    baseConditions.push(`(title LIKE ? OR ate LIKE ? OR agency LIKE ? OR category LIKE ? OR pota_ref LIKE ? OR pota_name LIKE ?)`);
    baseParams.push(term, term, term, term, term, term);
  }

  if (category && category.trim()) {
    baseConditions.push(`category = ?`);
    baseParams.push(category.trim());
  }

  if (status && status.trim()) {
    baseConditions.push(`status = ?`);
    baseParams.push(status.trim().toLowerCase());
  }

  if (region && region.trim()) {
    baseConditions.push(`ate LIKE ?`);
    baseParams.push(`%${region.trim()}%`);
  } else if (!search || !search.trim()) {
    // When browsing the general POTA candidates pool (no specific search/region),
    // exclude conflict regions where POTA submissions are not accepted per coordinator request.
    baseConditions.push(`(ate NOT LIKE '%Крым%' AND ate NOT LIKE '%Севастополь%' AND ate NOT LIKE '%Донецк%' AND ate NOT LIKE '%Луганск%' AND ate NOT LIKE '%Запорож%' AND ate NOT LIKE '%Херсон%')`);
  }

  const conditions = [...baseConditions];
  const params = [...baseParams];

  if (sig && sig.trim()) {
    conditions.push(`sig = ?`);
    params.push(sig.trim().toLowerCase());
  }

  if (pota === 'in_pota' || pota === '1' || pota === 'true') {
    conditions.push(`pota_ref IS NOT NULL`);
  } else if (pota === 'not_in_pota' || pota === '0') {
    conditions.push(`pota_ref IS NULL`);
  }

  const baseWhereClause = baseConditions.length > 0 ? `WHERE ${baseConditions.join(' AND ')}` : '';
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
  const rows = db.prepare(selectSql).all(...params, limitNum, offset).map(r => ({
    ...r,
    pota_restricted: isPotaRestrictedAte(r.ate)
  }));

  // 3. Stats by significance (dynamic based on base filters)
  const globalStats = getOoptStats();
  
  const dynStatsSql = `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN sig = 'federal' THEN 1 ELSE 0 END) as federal,
      SUM(CASE WHEN sig = 'regional' THEN 1 ELSE 0 END) as regional,
      SUM(CASE WHEN sig = 'local' THEN 1 ELSE 0 END) as local,
      SUM(CASE WHEN pota_ref IS NOT NULL THEN 1 ELSE 0 END) as inPota
    FROM oopt_registry
    ${baseWhereClause}
  `;
  const dynStats = db.prepare(dynStatsSql).get(...baseParams);

  const stats = {
    ...globalStats,
    total: dynStats.total || 0,
    federal: dynStats.federal || 0,
    regional: dynStats.regional || 0,
    local: dynStats.local || 0,
    inPota: dynStats.inPota || 0,
  };

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

  const restrictedCondition = "(ate NOT LIKE '%Крым%' AND ate NOT LIKE '%Севастополь%' AND ate NOT LIKE '%Донецк%' AND ate NOT LIKE '%Луганск%' AND ate NOT LIKE '%Запорож%' AND ate NOT LIKE '%Херсон%')";

  const totalAll = db.prepare("SELECT COUNT(*) as count FROM oopt_registry").get()?.count || 0;
  const total = db.prepare(`SELECT COUNT(*) as count FROM oopt_registry WHERE ${restrictedCondition}`).get()?.count || 0;
  const federal = db.prepare(`SELECT COUNT(*) as count FROM oopt_registry WHERE sig = 'federal' AND ${restrictedCondition}`).get()?.count || 0;
  const regional = db.prepare(`SELECT COUNT(*) as count FROM oopt_registry WHERE sig = 'regional' AND ${restrictedCondition}`).get()?.count || 0;
  const local = db.prepare(`SELECT COUNT(*) as count FROM oopt_registry WHERE sig = 'local' AND ${restrictedCondition}`).get()?.count || 0;
  const inPota = db.prepare("SELECT COUNT(*) as count FROM oopt_registry WHERE pota_ref IS NOT NULL").get()?.count || 0;
  const restrictedCount = totalAll - total;

  const categories = db.prepare(`
    SELECT category, COUNT(*) as count 
    FROM oopt_registry 
    WHERE category IS NOT NULL AND category != '' AND ${restrictedCondition}
    GROUP BY category 
    ORDER BY count DESC
    LIMIT 25
  `).all();

  // Extract clean regions list for filter dropdowns
  const rawAte = db.prepare("SELECT DISTINCT ate FROM oopt_registry WHERE ate IS NOT NULL AND ate != ''").all();
  const regionSet = new Set();
  const restrictedSet = new Set();
  for (const row of rawAte) {
    let s = row.ate;
    if (s.includes('(')) {
      s = s.split('(')[0].trim();
    }
    const parts = s.split(/,\s*/);
    for (const p of parts) {
      const clean = p.trim();
      if (clean.length > 2) {
        if (isPotaRestrictedAte(clean)) {
          restrictedSet.add(clean);
        } else {
          regionSet.add(clean);
        }
      }
    }
  }
  const regions = Array.from(regionSet).sort((a, b) => a.localeCompare(b, 'ru'));
  const restrictedRegions = Array.from(restrictedSet).sort((a, b) => a.localeCompare(b, 'ru'));

  // Compute existing POTA park counts for each region
  const potaParks = getRussianPotaParks();
  const regionPotaCounts = {};
  for (const r of regions) {
    const code = getPotaLocationCode(r);
    if (!code) {
      regionPotaCounts[r] = 0;
      continue;
    }
    regionPotaCounts[r] = potaParks.filter(p => {
      const pReg = (p.region || '').split(',').map(s => s.trim());
      return pReg.includes(code);
    }).length;
  }

  cachedStats = {
    total,
    totalAll,
    restrictedCount,
    federal,
    regional,
    local,
    inPota,
    categories,
    regions,
    restrictedRegions,
    regionPotaCounts,
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
  // 1. Specific multi-word landscape combinations
  ['лесная балка', 'Wooded Ravine'],
  ['степная балка', 'Steppe Ravine'],
  ['каменная балка', 'Rocky Ravine'],
  ['черная балка|чёрная балка', 'Black Ravine'],
  ['крутая балка', 'Steep Ravine'],
  ['глубокая балка', 'Deep Ravine'],
  ['сухая балка', 'Dry Ravine'],
  ['широкая балка', 'Broad Ravine'],
  ['долгая балка', 'Long Ravine'],
  ['сосновый бор', 'Pine Forest'],
  ['красный бор', 'Krasny Bor'],
  ['зеленый остров|зелёный остров', 'Green Island'],
  ['белое озеро', 'White Lake'],
  ['черное озеро|чёрное озеро', 'Black Lake'],
  ['святой источник', 'Holy Spring'],
  ['русский лес', 'Russian Forest'],
  ['три брата', 'Three Brothers'],

  // 2. Prepositional phrases with settlements & locations
  ['у села|у с\\.', 'near the Village of'],
  ['у деревни|у д\\.', 'near the Village of'],
  ['у поселка|у посёлка|у пос\\.|у п\\.', 'near the Settlement of'],
  ['у города|у г\\.', 'near'],
  ['в окрестностях', 'in the Vicinity of'],
  ['в районе', 'in the Area of'],
  ['в пойме', 'in the Floodplain of'],
  ['в устье', 'at the Mouth of'],
  ['в истоке', 'at the Headwaters of'],
  ['в бухте', 'in Bay'],
  ['в губе', 'in Bay'],
  ['на реке|на р\\.', 'on the River'],
  ['на озере|на оз\\.', 'on Lake'],
  ['на острове|на о-ве|на о\\.', 'on Island'],
  ['на косе', 'on Spit'],
  ['на мысе', 'at Cape'],

  // 3. Known cities / urban forests / geographic adjectives
  ['химкинск(ом|ий|ого|ому|ая|ое|их)', 'Khimki'],
  ['битцевск(ом|ий|ого|ому|ая|ое|их)', 'Bitsevsky'],
  ['измайловск(ом|ий|ого|ому|ая|ое|их)', 'Izmaylovsky'],
  ['сокольническ(ом|ий|ого|ому|ая|ое|их)', 'Sokolniki'],
  ['авачинск(ой|ая|ую|ом|ий)', 'Avacha'],
  ['семеновск(ой|ая|ую|ом|ий|ое)', 'Semenovskaya'],
  ['ловозерск(ом|ий|ого|ому|ая|ое)', 'Lovozero'],
  ['никельск(ом|ий|ого|ому|ая|ое)', 'Nikel'],

  // 4. Prepositions (strictly Cyrillic-safe)
  ['вокруг', 'around'],
  ['между', 'between'],
  ['вблизи|возле|около|близ', 'near'],
  ['у', 'near'],
  ['в|во', 'in'],
  ['на', 'on'],
  ['под', 'near'],
  ['при', 'at'],
  ['с|со', 'with'],

  // 5. Parks and recreation
  ['лесопарк(а|е|ом|у)?', 'Forest Park'],
  ['парк(а|е|ом|у)?', 'Park'],
  ['сад(а|е|ом|у|ы)?', 'Garden'],
  ['дендрари(й|я|е|ем)', 'Arboretum'],
  ['ботаническ(ий|ая|ое|ого|ом)', 'Botanical'],

  // 6. Ravines, depressions, water bodies
  ['балк(а|и|е|у|ой)', 'Ravine'],
  ['овраг(а|е|ом|у|и)?', 'Ravine'],
  ['ложбин(а|ы|е|у)', 'Hollow'],
  ['пойм(а|ы|е|у)', 'Floodplain'],
  ['стариц(а|ы|е|у)', 'Oxbow Lake'],
  ['исток(а|е|ом|у)?', 'Headwaters'],
  ['усть(е|я|ем)', 'Mouth'],
  ['водопад(а|е|ом|у|ы)?', 'Waterfall'],
  ['родник(а|е|ом|у|и|ов)?', 'Spring'],
  ['источник(а|е|ом|у|и|ов)?', 'Spring'],
  ['ключ(а|е|ом|у|и|ей)?', 'Spring'],
  ['гейзер(а|е|ом|у|ы)?', 'Geyser'],
  ['водохранилищ(е|а|ем)', 'Reservoir'],
  ['пруд(а|е|ом|у|ы)?', 'Pond'],
  ['озер(о|а|е|ом|ёра)', 'Lake'],
  ['речк(а|и|е|у|ой)', 'Stream'],
  ['рек(а|и|е|у|ой)', 'River'],
  ['руче(й|я|е|ем|и)', 'Brook'],
  ['болот(о|а|е|ом)', 'Bog'],
  ['торфяник(а|е|ом|у)?', 'Peat Bog'],
  ['мох|мхи', 'Moss'],
  ['бухт(а|ы|е|у|ой)', 'Bay'],
  ['губ(а|ы|е|у|ой)', 'Bay'],
  ['залив(а|е|ом|у)?', 'Bay'],
  ['пролив(а|е|ом|у)?', 'Strait'],
  ['лиман(а|е|ом|у)?', 'Liman'],
  ['кос(а|ы|е|у|ой)', 'Spit'],
  ['мыс(а|е|ом|у)?', 'Cape'],
  ['остров(а|е|ом|у)?', 'Island'],
  ['полуостров(а|е|ом|у)?', 'Peninsula'],
  ['берег(а|у|е|ом)?', 'Shore'],
  ['побережь(е|я|ем)', 'Coast'],

  // 7. Mountains, rocks, geological
  ['гор(а|ы|е|у|ой)', 'Mountain'],
  ['хребет|хребта', 'Ridge'],
  ['гряд(а|ы|е|у)', 'Ridge'],
  ['увал(а|е|ом|у|ы)?', 'Ridge'],
  ['сопк(а|и|е|у)', 'Sopka'],
  ['скал(а|ы|е|у|ой)', 'Rock'],
  ['камень|камн(и|я|ем)', 'Stone'],
  ['пещер(а|ы|е|у)', 'Cave'],
  ['грот(а|е|ом|у|ы)?', 'Grotto'],
  ['утёс|утес(а|е|ом|у|ы)?', 'Cliff'],
  ['обнажени(е|я|ем)', 'Outcrop'],
  ['разрез(а|е|ом|у)?', 'Exposure'],
  ['каньон(а|е|ом|у)?', 'Canyon'],
  ['ущель(е|я|ем)', 'Gorge'],
  ['теснин(а|ы|е|у)', 'Gorge'],
  ['перевал(а|е|ом|у)?', 'Pass'],
  ['холм(а|е|ом|у|ы)?', 'Hill'],
  ['курган(а|е|ом|у|ы)?', 'Kurgan'],
  ['провал(а|е|ом|у)?', 'Sinkhole'],
  ['воронк(а|и|е|у)', 'Sinkhole'],

  // 8. Forest & Vegetation
  ['дубрав(а|ы|е|у)', 'Oak Grove'],
  ['дуб(а|е|ом|у|ы|ов)?', 'Oak'],
  ['сосн(а|ы|е|у|ой)', 'Pine'],
  ['берёз(а|ы|е|у)|берез(а|ы|е|у)', 'Birch'],
  ['лиственниц(а|ы|е|у)', 'Larch'],
  ['кедр(а|е|ом|у|ы|ов)?', 'Cedar'],
  ['кедровник(а|е|ом|у)?', 'Cedar Forest'],
  ['ель|ели|елью', 'Spruce'],
  ['ельник(а|е|ом|у)?', 'Spruce Forest'],
  ['пихт(а|ы|е|у)', 'Fir'],
  ['пихтарник(а|е|ом|у)?', 'Fir Forest'],
  ['лип(а|ы|е|у)', 'Linden'],
  ['липняк(а|е|ом|у)?', 'Linden Grove'],
  ['ольх(а|ы|е|у)', 'Alder'],
  ['ив(а|ы|е|у)', 'Willow'],
  ['можжевельник(а|е|ом|у)?', 'Juniper'],
  ['тисс?|тиссов(ый|ая|ое|ые|ом)', 'Yew'],
  ['рощ(а|и|е|у|ей)', 'Grove'],
  ['бор(а|е|ом|у)?', 'Pine Forest'],
  ['лес(а|е|ом|у)?', 'Forest'],
  ['массив(а|е|ом|у)?', 'Massif'],
  ['насаждени(я|й|ям)', 'Forest Stand'],
  ['посадк(и|ок|ам)', 'Plantations'],
  ['культур(ы|ах)', 'Plantations'],
  ['дач(а|и|е|у)', 'Forestry Estate'],
  ['лесничеств(о|а|е|ом)', 'Forestry'],
  ['лесхоз(а|е|ом)?', 'Forest Enterprise'],
  ['луг(а|е|ом|у|ов)?', 'Meadow'],
  ['степ(ь|и|ью)', 'Steppe'],
  ['дюн(а|ы|е|у)', 'Dune'],
  ['песк(и|ов|ам)', 'Sands'],
  ['урочищ(е|а|ем)', 'Tract'],
  ['участок|участка', 'Site'],

  // 9. Common adjectives
  ['лесной|лесная|лесное|лесные|лесном', 'Forest'],
  ['горный|горная|горное|горные|горном', 'Mountain'],
  ['степной|степная|степное|степные|степном', 'Steppe'],
  ['приозерн(ый|ая|ое|ые|ом)', 'Lakeside'],
  ['приморск(ий|ая|ое|ие|ом)', 'Seaside'],
  ['приречн(ый|ая|ое|ые|ом)', 'Riverside'],
  ['заозерн(ый|ая|ое|ые|ом)', 'Zaozerny'],
  ['северн(ый|ая|ое|ые|ом)', 'Northern'],
  ['южн(ый|ая|ое|ые|ом)', 'Southern'],
  ['восточн(ый|ая|ое|ые|ом)', 'Eastern'],
  ['западн(ый|ая|ое|ые|ом)', 'Western'],
  ['центральн(ый|ая|ое|ые|ом)', 'Central'],
  ['верхн(ий|яя|ее|ие|ем)', 'Upper'],
  ['нижн(ий|яя|ее|ие|ем)', 'Lower'],
  ['средн(ий|яя|ее|ие|ем)', 'Middle'],
  ['больш(ой|ая|ое|ие|ом)', 'Great'],
  ['мал(ый|ая|ое|ые|ом)', 'Small'],
  ['бел(ый|ая|ое|ые|ом)', 'White'],
  ['черн(ый|ая|ое|ые|ом)|чёрн(ый|ая|ое|ые|ом)', 'Black'],
  ['красн(ый|ая|ое|ые|ом)', 'Red'],
  ['зелен(ый|ая|ое|ые|ом)|зелён(ый|ая|ое|ые|ом)', 'Green'],
  ['син(ий|яя|ее|ие|ем)', 'Blue'],
  ['голуб(ой|ая|ое|ые|ом)', 'Blue'],
  ['золот(ой|ая|ое|ые|ом)', 'Golden'],
  ['серебрян(ый|ая|ое|ые|ом)', 'Silver'],
  ['свят(ой|ая|ое|ые|ом)', 'Holy'],
  ['каменн(ый|ая|ое|ые|ом)', 'Stone'],
  ['песчан(ый|ая|ое|ые|ом)', 'Sandy'],
  ['торфян(ой|ая|ое|ые|ом)', 'Peat'],
  ['глубок(ий|ая|ое|ие|ом)', 'Deep'],
  ['крут(ой|ая|ое|ые|ом)', 'Steep'],
  ['широк(ий|ая|ое|ие|ом)', 'Broad'],
  ['долг(ий|ая|ое|ие|ом)', 'Long'],
  ['сух(ой|ая|ое|ые|ом)', 'Dry'],
  ['чист(ый|ая|ое|ые|ом)', 'Pure'],
  ['ясн(ый|ая|ое|ые|ом)', 'Bright'],
  ['тепл(ый|ая|ое|ые|ом)|тёпл(ый|ая|ое|ые|ом)', 'Warm'],
  ['холодн(ый|ая|ое|ые|ом)', 'Cold'],
  ['минеральн(ый|ая|ое|ые|ом|ых)', 'Mineral'],
  ['целебн(ый|ая|ое|ые|ом)', 'Healing'],
  ['древн(ий|яя|ее|ие|ем)', 'Ancient'],
  ['реликтов(ый|ая|ое|ые|ом)', 'Relict'],

  // 10. Academic & Institutional
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

// Compile with strictly Cyrillic-safe lookahead and lookbehind word boundaries
const GEOGRAPHIC_TERMS = RAW_GEOGRAPHIC_TERMS.map(([pat, repl]) => [
  new RegExp('(?<![а-яёА-ЯЁa-zA-Z0-9])(' + pat + ')(?![а-яёА-ЯЁa-zA-Z0-9])', 'gi'),
  repl
]);

export function getEnglishCategorySuffix(category) {
  const c = (category || '').toLowerCase();
  if (c.includes('морск')) return 'State Marine Reserve';
  if (c.includes('биосферн')) return 'State Biosphere Nature Reserve';
  if (c.includes('памятник природы') || c.includes('памятные природные места')) return 'Natural Monument';
  if (c.includes('ботанический сад') || c.includes('дендрологический') || c.includes('дендрарий')) return 'Botanical Gardens';
  if (c.includes('национальный парк')) {
    if (c.includes('резерват') || c.includes('reserve')) return 'National Park Reserve';
    if (c.includes('абориген') || c.includes('aboriginal')) return 'National Park Aboriginal';
    return 'National Park';
  }
  if (c.includes('природно-исторический') || c.includes('исторический парк') || c.includes('историко-природный')) return 'National Historical Park';
  if (c.includes('ландшафтный заказник') || c.includes('особо охраняемый природный ландшафт')) return 'Landscape Reserve';
  if (c.includes('заповедник')) return 'State Nature Preserve';
  if (c.includes('заказник')) return 'State Nature Reserve';
  if (c.includes('охраняемый природный ландшафт')) return 'Protected Landscape Area';
  if (c.includes('охраняемый ландшафт')) return 'Protected Landscape';
  if (c.includes('ресурсный резерват')) return 'Reserve';
  if (c.includes('природный резерват')) return 'Nature Conservation Reserve';
  if (c.includes('резерват')) return 'Reserve';
  if (c.includes('садово-паркового искусства') || c.includes('ландшафтный парк')) return 'Landscape Park';
  if (c.includes('лесной парк')) return c.includes('государственный') ? 'State Forest Park' : 'Park';
  if (c.includes('природный парк') || c.includes('парковая зона')) return 'Nature Park';
  if (c.includes('рекреационная зона') || c.includes('природная рекреационная') || c.includes('ландшафтно-рекреационный') || c.includes('территория рекреационного')) return 'Nature Recreational Area';
  if (c.includes('туристско-рекреацион')) return 'Recreation Site';
  if (c.includes('уникальное озеро') || c.includes('озеро')) return 'National Lakeshore';
  if (c.includes('природный комплекс')) return 'Nature and Landscape Complex';
  if (c.includes('особо ценная территория')) return 'Area of Outstanding Natural Beauty';
  if (c.includes('экологический коридор')) return 'Ecological Site';
  if (c.includes('охраняемый природный объект')) return 'Protected Area';
  if (c.includes('зона покоя')) return 'Nature Reserve';
  if (c.includes('ландшафт')) return 'Protected Landscape';
  return 'State Nature Reserve';
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
         .replace(/skoy\b/gi, 'skaya')
         .replace(/skom\b/gi, 'sky')
         .replace(/skogo gosudarstvennogo\b/gi, 'State')
         .replace(/gosudarstvennogo\b/gi, 'State')
         .replace(/pedagogicheskogo\b/gi, 'Pedagogical')
         .replace(/universiteta\b/gi, 'University')
         .replace(/instituta\b/gi, 'Institute');

  // Capitalize words into Title Case, keeping mid-phrase prepositions lowercase
  const words = en.split(/\s+/).map((w, idx) => {
    if (!w) return '';
    const lower = w.toLowerCase();
    if (idx > 0 && ['in', 'on', 'near', 'at', 'with', 'between', 'around', 'of', 'the', 'and', 'a', 'an'].includes(lower)) {
      return lower;
    }
    return w.charAt(0).toUpperCase() + w.slice(1);
  });
  return words.join(' ').replace(/\s+/g, ' ').trim();
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
      const words = translated.trim().split(/\s+/).filter(Boolean);
      // Per Manu R2BBX: if translated name is long (> 3 words or > 30 characters), use translation only
      if (words.length > 3 || translated.length > 30) {
        return translated;
      }
      return `${translated} (${transliterated})`;
    }
  }
  return translated || transliterated || '';
}

/**
 * Online neural translation of OOPT name using Google Translate with
 * landscape homonym pre-processing and fallback to smart local translation.
 */
export async function translateOoptNameOnline(cleanName, category) {
  if (!cleanName) return '';
  // Pre-process landscape homonyms (e.g. 'балка' in geography is ravine, not beam)
  let prep = cleanName;
  prep = prep.replace(/(?<![а-яёА-ЯЁa-zA-Z0-9])(лесная балка)(?![а-яёА-ЯЁa-zA-Z0-9])/gi, 'лесной овраг')
             .replace(/(?<![а-яёА-ЯЁa-zA-Z0-9])(степная балка)(?![а-яёА-ЯЁa-zA-Z0-9])/gi, 'степной овраг')
             .replace(/(?<![а-яёА-ЯЁa-zA-Z0-9])(каменная балка)(?![а-яёА-ЯЁa-zA-Z0-9])/gi, 'каменистый овраг')
             .replace(/(?<![а-яёА-ЯЁa-zA-Z0-9])(балк[аиеу])(?![а-яёА-ЯЁa-zA-Z0-9])/gi, 'овраг');

  try {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=ru&tl=en&dt=t&q=' + encodeURIComponent(prep);
    const res = await axios.get(url, { timeout: 4000 });
    if (res.data && Array.isArray(res.data[0])) {
      const rawTrans = res.data[0].map(item => item[0]).join('').trim();
      if (rawTrans) {
        const words = rawTrans.split(/\s+/).map((w, idx) => {
          if (!w) return '';
          const lower = w.toLowerCase();
          if (idx > 0 && ['in', 'on', 'near', 'at', 'with', 'between', 'around', 'of', 'the', 'and', 'a', 'an'].includes(lower)) {
            return lower;
          }
          return w.charAt(0).toUpperCase() + w.slice(1);
        });
        const cleanTranslated = words.join(' ').replace(/\s+/g, ' ').trim();
        const transliterated = transliterateOnly(cleanName);
        if (cleanTranslated && transliterated && cleanTranslated.toLowerCase() !== transliterated.toLowerCase()) {
          const transWords = cleanTranslated.trim().split(/\s+/).filter(Boolean);
          // Per Manu R2BBX: if translated name is long (> 3 words or > 30 characters), use translation only
          if (transWords.length > 3 || cleanTranslated.length > 30) {
            return cleanTranslated;
          }
          return `${cleanTranslated} (${transliterated})`;
        }
        return cleanTranslated;
      }
    }
  } catch (_) {
    // Network / timeout fallback to smart local translation
  }

  return formatDualParkName(cleanName, category);
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
  'москва': 'RU-MC',
  'московская': 'RU-MS',
  'санкт-петербург': 'RU-SP',
  'ленинградская': 'RU-LN',
  'краснодарский': 'RU-KD',
  'калининградская': 'RU-KN',
  'ростовская': 'RU-RO',
  'волгоградская': 'RU-VG',
  'воронежская': 'RU-VR',
  'самарская': 'RU-SA',
  'саратовская': 'RU-SR',
  'нижегородская': 'RU-NZ',
  'татарстан': 'RU-TT',
  'башкортостан': 'RU-BK',
  'крым': 'RU-CR',
  'севастополь': 'RU-SE',
  'дагестан': 'RU-DA',
  'чечен': 'RU-CN',
  'ингушет': 'RU-IN',
  'кабардино-балкар': 'RU-KB',
  'карачаево-черкес': 'RU-KC',
  'северная осетия': 'RU-NO',
  'адыгея': 'RU-AD',
  'калмыкия': 'RU-KL',
  'астраханская': 'RU-AS',
  'архангельская': 'RU-AR',
  'мурманская': 'RU-MM',
  'вологодская': 'RU-VO',
  'карелия': 'RU-KI',
  'коми': 'RU-KO',
  'новгородская': 'RU-NG',
  'псковская': 'RU-PS',
  'тверская': 'RU-TV',
  'ярославская': 'RU-YS',
  'костромская': 'RU-KT',
  'ивановская': 'RU-IV',
  'владимирская': 'RU-VL',
  'рязанская': 'RU-RZ',
  'тульская': 'RU-TL',
  'калужская': 'RU-KG',
  'смоленская': 'RU-SM',
  'брянская': 'RU-BR',
  'орловская': 'RU-OL',
  'липецкая': 'RU-LP',
  'тамбовская': 'RU-TB',
  'белгородская': 'RU-BL',
  'курская': 'RU-KS',
  'пензенская': 'RU-PZ',
  'ульяновская': 'RU-UL',
  'кировская': 'RU-KV',
  'чуваш': 'RU-CV',
  'марий эл': 'RU-ME',
  'мордовия': 'RU-MR',
  'удмурт': 'RU-UD',
  'пермский': 'RU-PE',
  'оренбургская': 'RU-OB',
  'свердловская': 'RU-SV',
  'челябинская': 'RU-CL',
  'курганская': 'RU-KU',
  'тюменская': 'RU-TY',
  'ханты-мансийский': 'RU-KM',
  'ямало-ненецкий': 'RU-YN',
  'ненецкий': 'RU-NN',
  'франца-иосифа': 'RU-FJ',
  'новосибирская': 'RU-NS',
  'омская': 'RU-OM',
  'томская': 'RU-TO',
  'кемеровская': 'RU-KE',
  'алтайский': 'RU-AL',
  'алтай': 'RU-GA',
  'красноярский': 'RU-KX',
  'хакасия': 'RU-KK',
  'тыва': 'RU-TU',
  'иркутская': 'RU-IK',
  'бурятия': 'RU-BU',
  'забайкальский': 'RU-ZB',
  'саха': 'RU-SL',
  'якутия': 'RU-SL',
  'еврейская': 'RU-YV',
  'амурская': 'RU-AM',
  'хабаровский': 'RU-KH',
  'приморский': 'RU-PR',
  'магаданская': 'RU-MG',
  'чукотский': 'RU-CK',
  'камчатский': 'RU-KQ',
  'сахалинская': 'RU-SK',
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

export const POTA_LOCATION_CANONICAL = {
  'RU-AD': 'Республика Адыгея',
  'RU-AL': 'Алтайский край',
  'RU-AM': 'Амурская область',
  'RU-AR': 'Архангельская область',
  'RU-AS': 'Астраханская область',
  'RU-BK': 'Республика Башкортостан',
  'RU-BL': 'Белгородская область',
  'RU-BR': 'Брянская область',
  'RU-BU': 'Республика Бурятия',
  'RU-CN': 'Чеченская Республика',
  'RU-CL': 'Челябинская область',
  'RU-CK': 'Чукотский автономный округ',
  'RU-CV': 'Чувашская Республика',
  'RU-DA': 'Республика Дагестан',
  'RU-FJ': 'Земля Франца-Иосифа',
  'RU-GA': 'Республика Алтай',
  'RU-IN': 'Республика Ингушетия',
  'RU-IK': 'Иркутская область',
  'RU-IV': 'Ивановская область',
  'RU-KB': 'Кабардино-Балкарская Республика',
  'RU-KC': 'Карачаево-Черкесская Республика',
  'RU-KD': 'Краснодарский край',
  'RU-KE': 'Кемеровская область',
  'RU-KG': 'Калужская область',
  'RU-KH': 'Хабаровский край',
  'RU-KI': 'Республика Карелия',
  'RU-KK': 'Республика Хакасия',
  'RU-KL': 'Республика Калмыкия',
  'RU-KM': 'Ханты-Мансийский АО - Югра',
  'RU-KN': 'Калининградская область',
  'RU-KO': 'Республика Коми',
  'RU-KQ': 'Камчатский край',
  'RU-KS': 'Курская область',
  'RU-KT': 'Костромская область',
  'RU-KU': 'Курганская область',
  'RU-KV': 'Кировская область',
  'RU-KX': 'Красноярский край',
  'RU-LN': 'Ленинградская область',
  'RU-LP': 'Липецкая область',
  'RU-MC': 'Москва',
  'RU-ME': 'Республика Марий Эл',
  'RU-MG': 'Магаданская область',
  'RU-MM': 'Мурманская область',
  'RU-MR': 'Республика Мордовия',
  'RU-MS': 'Московская область',
  'RU-NG': 'Новгородская область',
  'RU-NN': 'Ненецкий автономный округ',
  'RU-NO': 'Республика Северная Осетия - Алания',
  'RU-NS': 'Новосибирская область',
  'RU-NZ': 'Нижегородская область',
  'RU-OB': 'Оренбургская область',
  'RU-OL': 'Орловская область',
  'RU-OM': 'Омская область',
  'RU-PE': 'Пермский край',
  'RU-PR': 'Приморский край',
  'RU-PS': 'Псковская область',
  'RU-PZ': 'Пензенская область',
  'RU-RO': 'Ростовская область',
  'RU-RZ': 'Рязанская область',
  'RU-SA': 'Самарская область',
  'RU-SK': 'Сахалинская область',
  'RU-SL': 'Республика Саха (Якутия)',
  'RU-SM': 'Смоленская область',
  'RU-SP': 'Санкт-Петербург',
  'RU-SR': 'Саратовская область',
  'RU-ST': 'Ставропольский край',
  'RU-SV': 'Свердловская область',
  'RU-TB': 'Тамбовская область',
  'RU-TL': 'Тульская область',
  'RU-TO': 'Томская область',
  'RU-TT': 'Республика Татарстан',
  'RU-TU': 'Республика Тыва',
  'RU-TV': 'Тверская область',
  'RU-TY': 'Тюменская область',
  'RU-UD': 'Удмуртская Республика',
  'RU-UL': 'Ульяновская область',
  'RU-VG': 'Волгоградская область',
  'RU-VL': 'Владимирская область',
  'RU-VO': 'Вологодская область',
  'RU-VR': 'Воронежская область',
  'RU-YN': 'Ямало-Ненецкий автономный округ',
  'RU-YS': 'Ярославская область',
  'RU-YV': 'Еврейская автономная область',
  'RU-ZB': 'Забайкальский край',
  // Restricted territories:
  'RU-CR': 'Республика Крым',
  'RU-SE': 'Севастополь',
  'RU-DN': 'Донецкая Народная Республика',
  'RU-LN2': 'Луганская Народная Республика',
  'RU-ZP': 'Запорожская область',
  'RU-HR': 'Херсонская область',
};

/**
 * Calculates detailed statistics for all Russian regions:
 * total POTA parks, parks activated at least once (unique), unactivated,
 * activation percentage ('заинтересованность'), total QSOs and activations,
 * candidate OOPT count from oopt_registry.
 */
export function getRegionalPotaStats() {
  const parks = getRussianPotaParks();
  let ooptRows = [];
  try {
    ooptRows = db.prepare("SELECT ate, COUNT(*) as cnt FROM oopt_registry WHERE ate IS NOT NULL AND ate != '' GROUP BY ate").all();
  } catch (err) {
    console.warn('[OOPT Service] ⚠️ Failed to query oopt_registry counts:', err.message);
  }

  const regionMap = new Map();
  for (const [code, name] of Object.entries(POTA_LOCATION_CANONICAL)) {
    const isRestricted = isPotaRestrictedAte(name) || ['RU-CR', 'RU-SE', 'RU-DN', 'RU-LN2', 'RU-ZP', 'RU-HR'].includes(code);
    regionMap.set(code, {
      code,
      name,
      totalParks: 0,
      activatedParks: 0,
      unactivatedParks: 0,
      activationRate: 0,
      totalActivations: 0,
      totalQsos: 0,
      ooptCandidates: 0,
      isRestricted
    });
  }

  let overallActivated = 0;
  let overallActivations = 0;
  let overallQsos = 0;

  for (const p of parks) {
    const isAct = (p.activations || 0) > 0;
    if (isAct) overallActivated++;
    overallActivations += (p.activations || 0);
    overallQsos += (p.qsos || 0);

    const codes = (p.region || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    for (const c of codes) {
      const canonicalCode = (c === 'RU-BA' ? 'RU-BK' : (c === 'RU-CE' ? 'RU-CN' : (c === 'RU-IR' ? 'RU-IK' : c)));
      if (regionMap.has(canonicalCode)) {
        const item = regionMap.get(canonicalCode);
        item.totalParks += 1;
        if (isAct) item.activatedParks += 1;
        item.totalActivations += (p.activations || 0);
        item.totalQsos += (p.qsos || 0);
      }
    }
  }

  for (const row of ooptRows) {
    const ateLower = (row.ate || '').toLowerCase();
    for (const [code, item] of regionMap.entries()) {
      if (item.isRestricted) continue;
      const kw = item.name.toLowerCase().replace(/(республика|край|область|автономный|округ|город|федерального значения)/g, '').trim();
      if (kw.length >= 3 && ateLower.includes(kw)) {
        item.ooptCandidates += row.cnt;
      }
    }
  }

  const regionsList = [];
  let zeroParkCount = 0;

  for (const item of regionMap.values()) {
    item.unactivatedParks = item.totalParks - item.activatedParks;
    item.activationRate = item.totalParks > 0 ? Math.round((item.activatedParks / item.totalParks) * 100) : 0;
    if (!item.isRestricted && item.totalParks === 0) {
      zeroParkCount++;
    }
    regionsList.push(item);
  }

  regionsList.sort((a, b) => {
    if (a.isRestricted !== b.isRestricted) return a.isRestricted ? 1 : -1;
    if (a.totalParks !== b.totalParks) return a.totalParks - b.totalParks;
    return a.name.localeCompare(b.name, 'ru');
  });

  return {
    summary: {
      totalParks: parks.length,
      activatedParks: overallActivated,
      unactivatedParks: parks.length - overallActivated,
      activationRate: parks.length > 0 ? Number(((overallActivated / parks.length) * 100).toFixed(1)) : 0,
      totalActivations: overallActivations,
      totalQsos: overallQsos,
      zeroParkCount,
      totalRegions: regionsList.filter(r => !r.isRestricted).length
    },
    regions: regionsList
  };
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
// Canonical region lookup derived from POTA_LOCATION_CANONICAL
export const REGION_HINT_MAP = {};
for (const [code, name] of Object.entries(POTA_LOCATION_CANONICAL)) {
  const clean = name.toLowerCase().replace(/(республика|край|область|автономный|округ|город|федерального значения)/g, '').trim();
  REGION_HINT_MAP[code] = clean;
}
REGION_HINT_MAP['RU-MOW'] = 'москва';
REGION_HINT_MAP['RU-MO'] = 'москва';
REGION_HINT_MAP['RU-MC'] = 'москва';
REGION_HINT_MAP['RU-MOS'] = 'московск';
REGION_HINT_MAP['RU-MS'] = 'московск';
REGION_HINT_MAP['RU-SPE'] = 'петербург';
REGION_HINT_MAP['RU-SP'] = 'петербург';
REGION_HINT_MAP['RU-LEN'] = 'ленинградск';
REGION_HINT_MAP['RU-LN'] = 'ленинградск';
REGION_HINT_MAP['RU-KDA'] = 'краснодарск';
REGION_HINT_MAP['RU-KD'] = 'краснодарск';
REGION_HINT_MAP['RU-PRI'] = 'приморск';
REGION_HINT_MAP['RU-PR'] = 'приморск';
REGION_HINT_MAP['RU-KHA'] = 'хабаровск';
REGION_HINT_MAP['RU-KH'] = 'хабаровск';
REGION_HINT_MAP['RU-HB'] = 'хабаровск';
REGION_HINT_MAP['RU-KYA'] = 'красноярск';
REGION_HINT_MAP['RU-KY'] = 'красноярск';
REGION_HINT_MAP['RU-KX'] = 'красноярск';
REGION_HINT_MAP['RU-SVE'] = 'свердловск';
REGION_HINT_MAP['RU-SV'] = 'свердловск';
REGION_HINT_MAP['RU-CHE'] = 'челябинск';
REGION_HINT_MAP['RU-CL'] = 'челябинск';
REGION_HINT_MAP['RU-CH'] = 'челябинск';
REGION_HINT_MAP['RU-NIZ'] = 'нижегородск';
REGION_HINT_MAP['RU-NZ'] = 'нижегородск';
REGION_HINT_MAP['RU-NN'] = 'нижегородск';
REGION_HINT_MAP['RU-SAM'] = 'самарск';
REGION_HINT_MAP['RU-SA'] = 'самарск';
REGION_HINT_MAP['RU-SM'] = 'самарск';
REGION_HINT_MAP['RU-KGD'] = 'калининградск';
REGION_HINT_MAP['RU-KN'] = 'калининградск';
REGION_HINT_MAP['RU-KAREL'] = 'карели';
REGION_HINT_MAP['RU-KR'] = 'карели';
REGION_HINT_MAP['RU-KI'] = 'карели';
REGION_HINT_MAP['RU-BA'] = 'башкортостан';
REGION_HINT_MAP['RU-BAS'] = 'башкортостан';
REGION_HINT_MAP['RU-BK'] = 'башкортостан';
REGION_HINT_MAP['RU-TA'] = 'татарстан';
REGION_HINT_MAP['RU-TAT'] = 'татарстан';
REGION_HINT_MAP['RU-TT'] = 'татарстан';
REGION_HINT_MAP['RU-MUR'] = 'мурманск';
REGION_HINT_MAP['RU-MU'] = 'мурманск';
REGION_HINT_MAP['RU-MM'] = 'мурманск';
REGION_HINT_MAP['RU-ORL'] = 'орловск';
REGION_HINT_MAP['RU-OR'] = 'орловск';
REGION_HINT_MAP['RU-OL'] = 'орловск';
REGION_HINT_MAP['RU-YAR'] = 'ярославск';
REGION_HINT_MAP['RU-YR'] = 'ярославск';
REGION_HINT_MAP['RU-YS'] = 'ярославск';
REGION_HINT_MAP['RU-KEM'] = 'кемеровск';
REGION_HINT_MAP['RU-KM'] = 'кемеровск';
REGION_HINT_MAP['RU-KE'] = 'кемеровск';
REGION_HINT_MAP['RU-NGR'] = 'новгородск';
REGION_HINT_MAP['RU-NV'] = 'новгородск';
REGION_HINT_MAP['RU-NG'] = 'новгородск';
REGION_HINT_MAP['RU-PNZ'] = 'пензенск';
REGION_HINT_MAP['RU-PZ'] = 'пензенск';
REGION_HINT_MAP['RU-PE'] = 'пензенск';
REGION_HINT_MAP['RU-IRK'] = 'иркутск';
REGION_HINT_MAP['RU-IR'] = 'иркутск';
REGION_HINT_MAP['RU-IK'] = 'иркутск';
REGION_HINT_MAP['RU-SAR'] = 'саратовск';
REGION_HINT_MAP['RU-SR'] = 'саратовск';
REGION_HINT_MAP['RU-SK'] = 'саратовск';
REGION_HINT_MAP['RU-ULY'] = 'ульяновск';
REGION_HINT_MAP['RU-UL'] = 'ульяновск';
REGION_HINT_MAP['RU-YV'] = 'ульяновск';
REGION_HINT_MAP['RU-ARK'] = 'архангельск';
REGION_HINT_MAP['RU-AR'] = 'архангельск';
REGION_HINT_MAP['RU-FJ'] = 'архангельск';

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
  'river': ['рек'],
  'lake': ['озер'],
  'pond': ['пруд'],
  'island': ['остров'],
  'shore': ['берег'],
  'coast': ['побережь', 'берег'],
  'valley': ['долин'],
  'bog': ['болот'],
  'marsh': ['болот'],
  'swamp': ['болот'],
  'bay': ['залив', 'губ', 'бухт'],
  'gulf': ['залив', 'губ'],
  'spring': ['родник', 'источник', 'ключ'],
  'forest': ['лес', 'бор', 'лесотехн'],
  'wood': ['лес'],
  'woods': ['лес'],
  'grove': ['рощ', 'дубрав'],
  'mountain': ['гор'],
  'mount': ['гор'],
  'hill': ['холм', 'сопк'],
  'heights': ['высот'],
  'cape': ['мыс'],
  'spit': ['кос'],
  'waterfall': ['водопад'],
  'cave': ['пещер'],
  'tract': ['урочищ'],
  'peter': ['петр'],
  'kirov': ['киров'],
  'university': ['университет'],
  'technical': ['техническ', 'лесотехническ'],
  'academy': ['академи'],
  'forestry': ['лесничеств', 'лесотехн'],
};

const STOP_WORDS = new Set([
  'park', 'parks', 'national', 'natural', 'nature', 'reserve', 'reserves', 'sanctuary', 'sanctuaries', 
  'monument', 'monuments', 'area', 'areas', 'zone', 'zones', 'memorial', 'state', 'federal', 'regional', 
  'local', 'city', 'town', 'district', 'oblast', 'krai', 'republic', 'branch', 'complex', 'landscape', 'recreation',
  'historic', 'site', 'parkway',
  'парк', 'парки', 'национальный', 'природный', 'заповедник', 'заповедники', 'заказник', 'заказники', 
  'памятник', 'памятники', 'природы', 'государственный', 'федеральный', 'региональный', 'местный', 
  'отделение', 'филиал', 'институт', 'академия', 'наук', 'район', 'область', 'край', 'республика', 'округ'
]);

const DESCRIPTOR_WORDS = new Set([
  'dolina', 'reka', 'reki', 'reke', 'reku', 'prud', 'pruda', 'ozero', 'ozera', 'ostrov', 'ostrova',
  'bereg', 'berega', 'gora', 'gory', 'kamen', 'kamni', 'mys', 'kosa', 'balka', 'balki', 'yar', 'log',
  'ruchey', 'ruchi', 'istok', 'ustye', 'vodopad', 'klyuch', 'rodnik', 'rodniki', 'kholm', 'sopka', 'sopki',
  'lesopark', 'dacha', 'lesnichestvo', 'leskhoz', 'les', 'lesa', 'bor', 'bora', 'roshcha', 'dubrava',
  'sad', 'peski', 'boloto', 'bolota', 'urochishche', 'urochishcha',
  'river', 'lake', 'pond', 'island', 'shore', 'coast', 'valley', 'bog', 'marsh', 'swamp',
  'bay', 'gulf', 'spring', 'forest', 'wood', 'woods', 'grove', 'mountain', 'mount', 'hill', 'heights',
  'cape', 'spit', 'waterfall', 'cave', 'tract', 'creek', 'brook'
]);

function normalizeStem(token) {
  if (!token) return '';
  let s = token.toLowerCase();
  s = s.replace(/^y(?=[aeou])/i, '');
  s = s.replace(/yy|iy/g, 'y').replace(/i/g, 'y');
  s = s.replace(/(skiy|sky|skoy|skaya|skoe|nyy|naya|noe|nyn|ov|ev|in|ye|oe|aya|ogo|omu|ey|oy|a|e|o|u|y)$/, '');
  return s;
}

function cleanTokens(str) {
  const words = (str || '').toLowerCase().replace(/[-–—"«»()—–,.:;/]/g, ' ').split(/\s+/);
  const result = [];
  for (const w of words) {
    if (w.length < 3) continue;
    if (STOP_WORDS.has(w)) continue;
    let t = transliterateRuToEn(w).toLowerCase().replace(/yy|iy/g, 'y').replace(/i/g, 'y');
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

    // Region hints
    const regionHints = [];
    const pRegion = p.region || p.locationDesc;
    if (pRegion) {
      const locs = pRegion.split(',');
      for (const l of locs) {
        const trimmed = l.trim().toUpperCase();
        if (REGION_HINT_MAP[trimmed]) {
          regionHints.push(REGION_HINT_MAP[trimmed]);
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

    let candidates = ooptPrepared;
    if (regionHints.length > 0) {
      candidates = ooptPrepared.filter(o => regionHints.some(hint => o.ateLower.includes(hint)));
    }

    for (const o of candidates) {
      let score = 0;
      let properNameMatch = false;

      // Coordinate distance check
      if (pLat && pLon && o.lat && o.lon) {
        const dist = getDistanceKm(pLat, pLon, o.lat, o.lon);
        if (dist !== null) {
          if (dist > 120) continue;
          if (dist < 1.5) score += 50;
          else if (dist < 5) score += 35;
          else if (dist < 15) score += 20;
          else if (dist < 30) score += 10;
          else if (dist > 80) score -= 30;
        }
      }

      // Token matching
      for (const pt of pTokens) {
        const isDesc = DESCRIPTOR_WORDS.has(pt);
        const pStem = normalizeStem(pt);

        for (const ot of o.tokens) {
          const oIsDesc = DESCRIPTOR_WORDS.has(ot);
          const oStem = normalizeStem(ot);

          if (pt === ot) {
            if (isDesc || oIsDesc) {
              score += 15;
            } else {
              score += 50;
              properNameMatch = true;
            }
            break;
          } else if (pStem.length >= 3 && oStem.length >= 3) {
            if (pStem === oStem) {
              if (isDesc || oIsDesc) {
                score += 12;
              } else {
                score += 45;
                properNameMatch = true;
              }
              break;
            } else if (pStem.startsWith(oStem) || oStem.startsWith(pStem)) {
              if (pStem.length >= 4 && oStem.length >= 4) {
                if (isDesc || oIsDesc) {
                  score += 8;
                } else {
                  score += 30;
                  properNameMatch = true;
                }
                break;
              }
            }
          }
        }
      }

      // Check English translation dictionary
      for (const root of matchingRuRoots) {
        if (o.titleLower.includes(root)) {
          score += 20;
        }
      }

      // Strict requirement: must have at least one proper noun match
      if (!properNameMatch) continue;

      // Category bonus
      if (pNameLower.includes('national park') && o.catLower.includes('национальный парк')) score += 20;
      if (pNameLower.includes('reserve') && o.catLower.includes('заповедник')) score += 20;
      if ((pNameLower.includes('sanctuary') || pNameLower.includes('natural reserve')) && o.catLower.includes('заказник')) score += 20;
      if (pNameLower.includes('botanical') && (o.catLower.includes('ботанический') || o.titleLower.includes('ботанический'))) score += 25;
      if (pNameLower.includes('dendrological') && (o.catLower.includes('дендрологический') || o.titleLower.includes('дендрологический'))) score += 25;
      if ((pNameLower.includes('monument') || pNameLower.includes('natural monument')) && o.catLower.includes('памятник')) score += 15;

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

  // Update Database: reset old matches then apply high-confidence matches and backfill missing coordinates
  const resetStmt = db.prepare('UPDATE oopt_registry SET pota_ref = NULL, pota_name = NULL');
  const updateStmt = db.prepare(`
    UPDATE oopt_registry 
    SET pota_ref = ?, 
        pota_name = ?,
        lat = CASE WHEN (lat IS NULL OR lat = 0) AND ? IS NOT NULL THEN ? ELSE lat END,
        lon = CASE WHEN (lon IS NULL OR lon = 0) AND ? IS NOT NULL THEN ? ELSE lon END
    WHERE nid = ?
  `);

  const transaction = db.transaction((list) => {
    resetStmt.run();
    for (const m of list) {
      updateStmt.run(
        m.pota.reference, 
        m.pota.name, 
        m.pota.lat, 
        m.pota.lat, 
        m.pota.lon, 
        m.pota.lon, 
        m.oopt.nid
      );
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
  getRegionalPotaStats,
  getOoptDetails,
  parseSubmitterFields,
  formatDualParkName,
  translateOoptNameOnline,
  generateR2bbxTemplate,
};

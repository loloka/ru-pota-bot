/**
 * OOPT & POTA Submitter Helpers for Telegram Mini App
 * Aligned with Russian POTA Coordinator (Ivan R2BBX / Manu) rules:
 * - Clean park name separated from status (quotes and category prefixes removed)
 * - Full status with significance
 * - Multi-region support (e.g. Москва, Московская область)
 * - Coordinates formatted for Yandex Maps (first Lat, second Lon)
 * - Official site or registry URL
 * - Notes/clarifications for cluster or boundary specifics
 */

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
  /федерального государственного автономного/gi,
  /федерального государственного бюджетного/gi,
  /федерального государственного казенного/gi,
  /федерального государственного/gi,
  /государственного бюджетного/gi,
  /государственного автономного/gi,
  /государственного казенного/gi,
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
  en = en.replace(/skogo\b/gi, 'sky')
         .replace(/skogo gosudarstvennogo\b/gi, 'State')
         .replace(/gosudarstvennogo\b/gi, 'State')
         .replace(/pedagogicheskogo\b/gi, 'Pedagogical')
         .replace(/universiteta\b/gi, 'University')
         .replace(/instituta\b/gi, 'Institute');

  en = en.split(' ').map(w => w ? (w.charAt(0).toUpperCase() + w.slice(1)) : '').join(' ').trim();
  return en.replace(/\s+/g, ' ').trim();
}

export function transliterateOnly(cleanName) {
  if (!cleanName) return '';
  let s = cleanName.replace(/["«]/g, '').replace(/["»]/g, '').trim();

  // Handle common institutional acronyms
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

export function parseOoptForSubmitter(item) {
  if (!item) return { name: '', nameEn: '', statusEn: '', status: '', dxEntity: '', locationCode: '', lat: '', lon: '', region: '', site: '', clarification: '' };

  const rawTitle = (item.title || '').trim();
  const rawCat = deduceCategory(rawTitle, item.category);
  const cleanName = cleanOoptName(rawTitle, rawCat);
  const nameEn = formatDualParkName(cleanName, rawCat);
  const statusEn = getEnglishCategorySuffix(rawCat);
  const detectedCategory = rawCat.charAt(0).toUpperCase() + rawCat.slice(1);

  // Status with significance
  const sigDisplay = item.sig_display || (item.sig === 'federal' ? 'Федеральное' : item.sig === 'regional' ? 'Региональное' : 'Местное');
  const fullStatus = sigDisplay ? `${detectedCategory} (${sigDisplay} значение)` : detectedCategory;

  // Region
  let region = item.rf_subjects || item.ate || '';
  if (region.includes('(')) {
    region = region.split('(')[0].trim();
  }

  // DX Entity and POTA Location
  const dxEntity = getDxEntity(region, rawTitle);
  const locationCode = getPotaLocationCode(region);

  // Coordinates: 4 decimal places as requested by Manu R2BBX
  const lat = (item.lat !== null && item.lat !== undefined && item.lat !== '') ? Number(item.lat).toFixed(4) : '';
  const lon = (item.lon !== null && item.lon !== undefined && item.lon !== '') ? Number(item.lon).toFixed(4) : '';

  // Priority link requested by Manu (R2BBX): https://ooptaari.nextgis.ru/node/:id
  const site = item.nid ? `https://ooptaari.nextgis.ru/node/${item.nid}` : 'https://карта.оцзк.рф/';

  // Clarification strictly formatted <= 255 chars
  const clarification = formatClarification(item);

  return {
    name: cleanName,
    nameEn,
    statusEn,
    status: fullStatus,
    dxEntity,
    locationCode,
    lat,
    lon,
    region,
    site,
    clarification
  };
}

export function formatR2bbxTemplate({ name, nameEn, statusEn, status, dxEntity, locationCode, region, lat, lon, site, clarification }) {
  return [
    `Название парка/ООПТ: ${name || ''}`,
    `Название для POTA (EN): ${nameEn || ''}`,
    `Статус ООПТ для POTA (EN): ${statusEn || ''}`,
    `Статус (парк/ООПТ и т.п.): ${status || ''}`,
    `DX Entity: ${dxEntity || ''}`,
    `Локация POTA: ${locationCode || ''}`,
    `Регион России: ${region || ''}`,
    `Координата первая с яндекс-карт: ${lat || ''}`,
    `Координата вторая: ${lon || ''}`,
    `Сайт объекта, ссылка: ${site || ''}`,
    `Уточнение (не обязательно): ${clarification || ''}`
  ].join('\n');
}

export function getYandexMapsUrl(lat, lon, name = '', region = '') {
  if (lat && lon && !isNaN(Number(lat)) && !isNaN(Number(lon))) {
    return {
      url: `https://yandex.ru/maps/?pt=${String(lon).trim()},${String(lat).trim()}&z=14&l=map`,
      isDirectCoords: true,
      label: 'Проверить в Яндекс.Картах'
    };
  }
  const query = `${name} ${region}`.trim();
  if (query) {
    return {
      url: `https://yandex.ru/maps/?text=${encodeURIComponent(query)}`,
      isDirectCoords: false,
      label: '🔍 Найти в Яндекс.Картах'
    };
  }
  return null;
}


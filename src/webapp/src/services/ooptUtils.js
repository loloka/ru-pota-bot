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
  'Дендрологический парк и ботанический сад',
  'Дендрологический парк',
  'Ботанический сад'
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

const GEOGRAPHIC_TERMS = [
  // Multi-word phrases first
  [/\bрусский лес\b/gi, 'Russian Forest'],
  [/\bсосновый бор\b/gi, 'Pine Forest'],
  [/\bкрасный бор\b/gi, 'Krasny Bor'],
  [/\bзеленый остров\b/gi, 'Green Island'],
  [/\bзелёный остров\b/gi, 'Green Island'],
  [/\bбелое озеро\b/gi, 'White Lake'],
  [/\bчерное озеро\b/gi, 'Black Lake'],
  [/\bчёрное озеро\b/gi, 'Black Lake'],
  [/\bсвятой источник\b/gi, 'Holy Spring'],

  // Russian / nationality
  [/\bрусский\b/gi, 'Russian'],
  [/\bрусская\b/gi, 'Russian'],
  [/\bрусское\b/gi, 'Russian'],

  // Natural geographical features (nouns)
  [/\bлес\b/gi, 'Forest'],
  [/\bлеса\b/gi, 'Forests'],
  [/\bостров\b/gi, 'Island'],
  [/\bострова\b/gi, 'Islands'],
  [/\bозеро\b/gi, 'Lake'],
  [/\bозера\b/gi, 'Lakes'],
  [/\bозёра\b/gi, 'Lakes'],
  [/\bгора\b/gi, 'Mountain'],
  [/\bгоры\b/gi, 'Mountains'],
  [/\bхребет\b/gi, 'Ridge'],
  [/\bсопка\b/gi, 'Sopka'],
  [/\bсопки\b/gi, 'Sopkas'],
  [/\bскалы\b/gi, 'Rocks'],
  [/\bскала\b/gi, 'Rock'],
  [/\bпещера\b/gi, 'Cave'],
  [/\bпещеры\b/gi, 'Caves'],
  [/\bрека\b/gi, 'River'],
  [/\bдолина\b/gi, 'Valley'],
  [/\bурочище\b/gi, 'Tract'],
  [/\bроща\b/gi, 'Grove'],
  [/\bбор\b/gi, 'Pine Forest'],
  [/\bмыс\b/gi, 'Cape'],
  [/\bзалив\b/gi, 'Bay'],
  [/\bбухта\b/gi, 'Cove'],
  [/\bболото\b/gi, 'Bog'],
  [/\bболота\b/gi, 'Bogs'],
  [/\bпруд\b/gi, 'Pond'],
  [/\bпруды\b/gi, 'Ponds'],
  [/\bключ\b/gi, 'Spring'],
  [/\bключи\b/gi, 'Springs'],
  [/\bисточник\b/gi, 'Spring'],
  [/\bисточники\b/gi, 'Springs'],
  [/\bводопад\b/gi, 'Waterfall'],
  [/\bводопады\b/gi, 'Waterfalls'],
  [/\bущелье\b/gi, 'Gorge'],
  [/\bканьон\b/gi, 'Canyon'],
  [/\bкоса\b/gi, 'Spit'],
  [/\bстепь\b/gi, 'Steppe'],
  [/\bкурган\b/gi, 'Kurgan'],

  // Adjectives
  [/\bсеверный\b/gi, 'Northern'],
  [/\bсеверная\b/gi, 'Northern'],
  [/\bсеверное\b/gi, 'Northern'],
  [/\bюжный\b/gi, 'Southern'],
  [/\bюжная\b/gi, 'Southern'],
  [/\bюжное\b/gi, 'Southern'],
  [/\bвосточный\b/gi, 'Eastern'],
  [/\bвосточная\b/gi, 'Eastern'],
  [/\bвосточное\b/gi, 'Eastern'],
  [/\bзападный\b/gi, 'Western'],
  [/\bзападная\b/gi, 'Western'],
  [/\bзападное\b/gi, 'Western'],
  [/\bцентральный\b/gi, 'Central'],
  [/\bцентральная\b/gi, 'Central'],
  [/\bцентральное\b/gi, 'Central'],
  [/\bверхний\b/gi, 'Upper'],
  [/\bверхняя\b/gi, 'Upper'],
  [/\bверхнее\b/gi, 'Upper'],
  [/\bнижний\b/gi, 'Lower'],
  [/\bнижняя\b/gi, 'Lower'],
  [/\bнижнее\b/gi, 'Lower'],
  [/\bсредний\b/gi, 'Middle'],
  [/\bсредняя\b/gi, 'Middle'],
  [/\bсреднее\b/gi, 'Middle'],
  [/\bбольшой\b/gi, 'Great'],
  [/\bбольшая\b/gi, 'Great'],
  [/\bбольшое\b/gi, 'Great'],
  [/\bмалый\b/gi, 'Small'],
  [/\bмалая\b/gi, 'Small'],
  [/\bмалое\b/gi, 'Small'],
  [/\bбелый\b/gi, 'White'],
  [/\bбелая\b/gi, 'White'],
  [/\bбелое\b/gi, 'White'],
  [/\bчерный\b/gi, 'Black'],
  [/\bчёрный\b/gi, 'Black'],
  [/\bчерная\b/gi, 'Black'],
  [/\bчёрная\b/gi, 'Black'],
  [/\bкрасный\b/gi, 'Red'],
  [/\bкрасная\b/gi, 'Red'],
  [/\bкрасное\b/gi, 'Red'],
  [/\bзеленый\b/gi, 'Green'],
  [/\bзелёный\b/gi, 'Green'],
  [/\bзеленая\b/gi, 'Green'],
  [/\bзелёная\b/gi, 'Green'],
  [/\bсиний\b/gi, 'Blue'],
  [/\bсиняя\b/gi, 'Blue'],
  [/\bголубой\b/gi, 'Blue'],
  [/\bголубая\b/gi, 'Blue'],
  [/\bзолотой\b/gi, 'Golden'],
  [/\bзолотая\b/gi, 'Golden'],
  [/\bзолотое\b/gi, 'Golden'],
  [/\bсеребряный\b/gi, 'Silver'],
  [/\bсеребряная\b/gi, 'Silver'],
  [/\bсеребряное\b/gi, 'Silver'],
  [/\bсвятой\b/gi, 'Holy'],
  [/\bсвятая\b/gi, 'Holy'],
  [/\bсвятое\b/gi, 'Holy'],
];

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

export function getDxEntity(regionName = '', title = '') {
  const r = (regionName || '').toLowerCase();
  const t = (title || '').toLowerCase();

  if (r.includes('калининград') || t.includes('калининград')) {
    return 'Kaliningrad (RU)';
  }
  if (t.includes('франца-иосифа') || t.includes('франца иосифа') || t.includes('земля франца') || r.includes('франца-иосифа')) {
    return 'Franz Josef Land (RU)';
  }

  // Asiatic Russia regions
  const asiaticKeywords = [
    'свердловск', 'челябинск', 'курган', 'тюмен', 'ханты-мансий', 'югра', 'ямало-ненец',
    'томск', 'омск', 'новосибирск', 'кемеров', 'алтай', 'красноярск', 'хакас', 'тыва', 'тува',
    'иркутск', 'бурят', 'забайкал', 'якут', 'саха', 'амурск', 'хабаровск', 'приморск',
    'еврейск', 'магадан', 'чукот', 'камчат', 'сахалин'
  ];

  for (const kw of asiaticKeywords) {
    if (r.includes(kw)) {
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
  const parts = [];

  // 1. Profile / Status
  if (item.profile) parts.push(`Профиль: ${item.profile}`);
  if (item.status && item.status !== 'действующий') parts.push(`Статус: ${item.status}`);
  if (item.area) parts.push(`Площадь: ${Number(item.area).toLocaleString('ru-RU')} га`);

  // 2. Nested OOPTs
  let nestedList = [];
  if (Array.isArray(item.nested_oopt)) {
    nestedList = item.nested_oopt;
  } else if (typeof item.nested_oopt === 'string' && item.nested_oopt.trim()) {
    try {
      nestedList = JSON.parse(item.nested_oopt);
    } catch (_) {
      nestedList = item.nested_oopt.split(/[,;\n]+/).map(s => ({ name: s.trim() })).filter(x => x.name);
    }
  }

  if (nestedList && nestedList.length > 0) {
    const formattedNested = nestedList.map(n => {
      const name = typeof n === 'string' ? n : (n.name || n.title || '');
      const ref = typeof n === 'object' && n.pota_ref ? ` (${n.pota_ref})` : '';
      return `${name}${ref}`;
    }).filter(Boolean);

    if (formattedNested.length > 0) {
      parts.push(`В границах: ${formattedNested.join(', ')}`);
    }
  }

  let text = parts.join('. ');
  if (text.length > 250) {
    text = text.substring(0, 247).trim() + '...';
  }
  return text;
}

export function parseOoptForSubmitter(item) {
  if (!item) return { name: '', nameEn: '', statusEn: '', status: '', dxEntity: '', locationCode: '', lat: '', lon: '', region: '', site: '', clarification: '' };

  const rawTitle = (item.title || '').trim();
  const rawCat = deduceCategory(rawTitle, item.category);
  const cleanName = cleanOoptName(rawTitle, rawCat);
  const nameEn = translateNameToEnglish(cleanName);
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


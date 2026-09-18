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
  s = s.replace(/Биологического факультета МГУ им\.? М\.?В\.?\s*Ломоносова/gi, 'MSU Faculty of Biology')
       .replace(/МГУ им\.? М\.?В\.?\s*Ломоносова/gi, 'MSU')
       .replace(/МГУ/g, 'MSU')
       .replace(/БИН РАН/g, 'BIN RAS')
       .replace(/РАН/g, 'RAS')
       .replace(/СО РАН/g, 'SB RAS')
       .replace(/Петра Великого/gi, 'Peter the Great');

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

export function parseOoptForSubmitter(item) {
  if (!item) return { name: '', nameEn: '', statusEn: '', status: '', lat: '', lon: '', region: '', site: '', clarification: '' };

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

  // Coordinates: 4 decimal places as requested by Manu R2BBX
  const lat = (item.lat !== null && item.lat !== undefined && item.lat !== '') ? Number(item.lat).toFixed(4) : '';
  const lon = (item.lon !== null && item.lon !== undefined && item.lon !== '') ? Number(item.lon).toFixed(4) : '';

  // Priority link requested by Manu (R2BBX): https://ooptaari.nextgis.ru/oopt/:id
  const site = item.nid ? `https://ooptaari.nextgis.ru/oopt/${item.nid}` : 'https://карта.оцзк.рф/';

  // Clarification
  const clarifies = [];
  if (item.status && item.status !== 'действующий') clarifies.push(`Статус: ${item.status}`);
  if (item.area) clarifies.push(`Площадь: ${Number(item.area).toLocaleString('ru-RU')} га`);
  if (item.profile) clarifies.push(`Профиль: ${item.profile}`);

  return {
    name: cleanName,
    nameEn,
    statusEn,
    status: fullStatus,
    lat,
    lon,
    region,
    site,
    clarification: clarifies.join('. ')
  };
}

export function formatR2bbxTemplate({ name, nameEn, statusEn, status, lat, lon, region, site, clarification }) {
  return [
    `Название парка/ООПТ: ${name || ''}`,
    `Название для POTA (EN): ${nameEn || ''}`,
    `Статус ООПТ для POTA (EN): ${statusEn || ''}`,
    `Статус (парк/ООПТ и т.п.): ${status || ''}`,
    `Координата первая с яндекс-карт: ${lat || ''}`,
    `Координата вторая: ${lon || ''}`,
    `Регион России: ${region || ''}`,
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


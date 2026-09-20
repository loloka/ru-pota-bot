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

export function isPotaRestrictedAte(ate = '') {
  if (!ate) return false;
  return /крым|севастопол|донецк|луганск|запорож|херсон/i.test(ate);
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

  // Handle common institutional acronyms
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


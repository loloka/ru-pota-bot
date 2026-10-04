import assert from 'assert';
import db from './src/db/database.js';
import { getOoptList, cleanOoptName, translateNameToEnglish, isSameOrOverlappingRegion, getRegionalPotaStats } from './src/services/ooptService.js';

console.log('=== RUNNING OOPT SEARCH & CYRILLIC CASE-INSENSITIVITY TESTS ===\n');

// 1. Test database-level case-insensitive LIKE on Russian letters
const likeUpper = db.prepare("SELECT title FROM oopt_registry WHERE title LIKE '%Тебердинский%' LIMIT 1").get();
const likeLower = db.prepare("SELECT title FROM oopt_registry WHERE title LIKE '%тебердинский%' LIMIT 1").get();
assert(likeUpper, 'LIKE with uppercase Тебердинский must find a record');
assert(likeLower, 'LIKE with lowercase тебердинский must find the exact same record');
assert.strictEqual(likeUpper.title, likeLower.title);
console.log('✅ PASS: SQLite LIKE is fully case-insensitive for Russian letters');

// 2. Test getOoptList with lowercase Teberdinsky
const resLower = getOoptList({ search: 'тебердинский' });
assert(resLower.total >= 1, 'Search for lowercase "тебердинский" must return at least 1 record');
assert(resLower.rows.some(r => r.title.includes('Тебердинский')), 'Rows must include Тебердинский');
console.log('✅ PASS: getOoptList finds Тебердинский when entered in lowercase');

// 3. Test getOoptList with uppercase Teberdinsky
const resUpper = getOoptList({ search: 'Тебердинский' });
assert.strictEqual(resUpper.total, resLower.total, 'Search for "Тебердинский" and "тебердинский" should return same count');
console.log('✅ PASS: getOoptList returns identical results regardless of letter casing');

// 4. Test multi-word and word-stem search: "химкинский лес"
const resKhimkiForest = getOoptList({ search: 'химкинский лес' });
assert(resKhimkiForest.total >= 1, 'Search for "химкинский лес" must find "Лесная балка в Химкинском лесопарке"');
assert(resKhimkiForest.rows.some(r => r.nid === 23496), 'Found nid 23496');
console.log('✅ PASS: getOoptList finds "Лесная балка в Химкинском лесопарке" for query "химкинский лес"');

// 5. Test search with generic category word: "тебердинский заповедник"
const resTeberdaZap = getOoptList({ search: 'тебердинский заповедник' });
assert(resTeberdaZap.total >= 1, 'Search for "тебердинский заповедник" must fallback to distinct name and find Тебердинский');
console.log('✅ PASS: getOoptList handles generic descriptor terms ("тебердинский заповедник") via smart fallback');

// 6. Test search by NID numeric string
const resNid = getOoptList({ search: '23496' });
assert.strictEqual(resNid.total, 1);
assert.strictEqual(resNid.rows[0].nid, 23496);
console.log('✅ PASS: getOoptList finds record by numeric NID');

// 7. Test POTA reference search (case-insensitive)
const resPota = getOoptList({ search: 'ru-0001' });
assert(resPota.total >= 1);
console.log('✅ PASS: getOoptList finds POTA park reference in lowercase ("ru-0001")');

// 8. Test honoree name preservation when title has quotes: "Нижегородское Поволжье" имени В.А.Лебедева
const cleanLebedev = cleanOoptName('"Нижегородское Поволжье" имени В.А.Лебедева');
assert.strictEqual(cleanLebedev, 'Нижегородское Поволжье им. В. А. Лебедева', 'Must keep honoree name after quote and space initials');
const enLebedev = translateNameToEnglish(cleanLebedev);
assert.strictEqual(enLebedev, 'Nizhegorodskoe Povolzhe named after V. A. Lebedev', 'Must translate имени/им. to "named after" with nominative surname');
console.log('✅ PASS: cleanOoptName & translateNameToEnglish preserve honoree names after quotes ("Нижегородское Поволжье" им. В. А. Лебедева)');

// 9. Test initial "С." is NOT translated as preposition "with", and "им. С. А. Есенина" translates to "named after S. A. Esenin"
const cleanEsenin = cleanOoptName('Агробиологическая станция Рязанского государственного университета им. С. А. Есенина');
const enEsenin = translateNameToEnglish(cleanEsenin);
assert(!enEsenin.includes('With.'), 'Initial С. must not be translated as With.');
assert(!enEsenin.includes('with.'), 'Initial С. must not be translated as with.');
assert(enEsenin.includes('named after S. A. Esenin'), 'Must contain "named after S. A. Esenin"');
console.log('✅ PASS: Initial "С." is preserved and "им. С. А. Есенина" translates to "named after S. A. Esenin"');

// 10. Test "Дикое поле" translates to "Wild Field" and dual name "Wild Field (Dikoe Pole)"
const enWildField = translateNameToEnglish('Дикое поле', 'памятник природы');
assert(enWildField.includes('Wild Field'), `Expected "Wild Field", got "${enWildField}"`);
import { formatDualParkName } from './src/services/ooptService.js';
const dualWildField = formatDualParkName('Дикое поле', 'памятник природы');
assert.strictEqual(dualWildField, 'Wild Field (Dikoe Pole)');
console.log('✅ PASS: "Дикое поле" correctly translates to "Wild Field (Dikoe Pole)"');

// 11. Test RU-0261 (Neprec Beam Nature Monument) matches "Балка Непрец" (nid 32793) in Orel oblast
const neprecOopt = db.prepare('SELECT nid, title, ate, pota_ref, pota_name FROM oopt_registry WHERE nid = 32793').get();
assert.ok(neprecOopt, 'OOPT nid 32793 must exist');
assert.strictEqual(neprecOopt.pota_ref, 'RU-0261', 'Балка Непрец must be synced with RU-0261');
assert.strictEqual(neprecOopt.pota_name, 'Neprec Beam Nature Monument');
console.log('✅ PASS: RU-0261 (Neprec Beam) correctly matched and synced to "Балка Непрец" (nid 32793)');

// 12. Test RU-0378 (Bastak) matches "Бастак" (nid 6663) in Jewish Autonomous Oblast (RU-YV)
const bastakOopt = db.prepare('SELECT nid, title, ate, pota_ref, pota_name FROM oopt_registry WHERE nid = 6663').get();
assert.ok(bastakOopt, 'OOPT nid 6663 must exist');
assert.strictEqual(bastakOopt.pota_ref, 'RU-0378', 'Бастак must be synced with RU-0378');
assert.strictEqual(bastakOopt.pota_name, 'Bastak State Natural Reserve');
console.log('✅ PASS: RU-0378 (Bastak) correctly matched and synced to "Бастак" (nid 6663)');

// 13. Test RU-0377 (Shukhi-Poktoy) matches "Шухи-Поктой" (nid 15909) in Jewish Autonomous Oblast (RU-YV)
const shukhiOopt = db.prepare('SELECT nid, title, ate, pota_ref, pota_name FROM oopt_registry WHERE nid = 15909').get();
assert.ok(shukhiOopt, 'OOPT nid 15909 must exist');
assert.strictEqual(shukhiOopt.pota_ref, 'RU-0377', 'Шухи-Поктой must be synced with RU-0377');
assert.strictEqual(shukhiOopt.pota_name, 'Shukhi-Poktoy Nature Reserve');
console.log('✅ PASS: RU-0377 (Shukhi-Poktoy) correctly matched and synced to "Шухи-Поктой" (nid 15909)');

// 13b. Test RU-0756 (Wintering Pits N 3) matches "Зимовальные ямы N 3" (nid 58135) in Astrakhan Oblast (RU-AS)
const zimov3Oopt = db.prepare('SELECT nid, title, ate, pota_ref, pota_name FROM oopt_registry WHERE nid = 58135').get();
assert.ok(zimov3Oopt, 'OOPT nid 58135 must exist');
assert.strictEqual(zimov3Oopt.pota_ref, 'RU-0756', 'Зимовальные ямы N 3 must be synced with RU-0756');
assert.strictEqual(zimov3Oopt.pota_name, 'Wintering Pits N 3 Nature Recreation Area');
console.log('✅ PASS: RU-0756 (Wintering Pits N 3) correctly matched and synced to "Зимовальные ямы N 3" (nid 58135)');

// 14. Test Reorganized OOPT status filtering and parent POTA park linking
const reorgList = getOoptList({ status: 'reorganized', limit: 10 });
assert.ok(reorgList.total > 0, 'Reorganized list must not be empty');
assert.strictEqual(reorgList.rows[0].is_reorganized, true, 'Row must have is_reorganized = true');

import { findParentPotaPark, getOoptDetails } from './src/services/ooptService.js';
const zabelParent = findParentPotaPark('Забеловский');
assert.ok(zabelParent, 'Забеловский must match a parent POTA park');
assert.strictEqual(zabelParent.reference, 'RU-0378', 'Забеловский must map to Bastak RU-0378');

const burkalParent = findParentPotaPark('Буркальский');
assert.ok(burkalParent, 'Буркальский must match a parent POTA park');
assert.strictEqual(burkalParent.reference, 'RU-0008', 'Буркальский must map to Chikoy RU-0008');

const zabelDetails = await getOoptDetails(15915);
assert.strictEqual(zabelDetails.is_reorganized, true);
assert.ok(zabelDetails.parent_pota);
assert.strictEqual(zabelDetails.parent_pota.reference, 'RU-0378');
assert.ok(zabelDetails.submitterFields.clarification.includes('⚠️ Реорганизован'));
assert.ok(zabelDetails.submitterFields.clarification.includes('RU-0378'));
console.log('✅ PASS: Reorganized status filter & parent POTA linking (Забеловский -> RU-0378, Буркальский -> RU-0008) verified');

// 15. Test Nenets Autonomous Okrug isolation from Yamalo-Nenets AO
const nenetsList = getOoptList({ region: 'Ненецкий автономный округ' });
assert.strictEqual(nenetsList.total, 14, `Nenets AO should have 14 OOPTs, got ${nenetsList.total}`);
const hasYamalInNenets = nenetsList.rows.some(r => (r.ate || '').includes('Ямало-Ненецк'));
assert.strictEqual(hasYamalInNenets, false, 'Nenets AO list must not contain any Yamalo-Nenets AO objects');
console.log('✅ PASS: Nenets AO strictly isolated from Yamalo-Nenets AO (14 OOPTs, 0 Yamal objects)');

// 16. Test RU-0035 (Russian North) matches "Русский Север" (nid 6718) in Vologda Oblast
const russkySeverOopt = db.prepare('SELECT nid, title, ate, pota_ref, pota_name, lat, lon, area FROM oopt_registry WHERE nid = 6718').get();
assert.ok(russkySeverOopt, 'OOPT nid 6718 must exist');
assert.strictEqual(russkySeverOopt.pota_ref, 'RU-0035', 'Русский Север must be synced with RU-0035');
assert.strictEqual(russkySeverOopt.pota_name, 'Russian North National Park');
assert.ok(russkySeverOopt.lat > 59 && russkySeverOopt.lat < 61, 'Coordinates must be valid');
console.log('✅ PASS: RU-0035 (Russian North) correctly matched and synced to "Русский Север" (nid 6718)');

// 17. Test OOPT sorting by area (area_desc, area_asc) and min_area filter
const amurDesc = getOoptList({ region: 'Амурская область', sort: 'area_desc', limit: 5 });
assert.ok(amurDesc.rows.length >= 2, 'Must have rows');
assert.ok(amurDesc.rows[0].area >= amurDesc.rows[1].area, 'Row 0 area must be >= Row 1 area in area_desc');
assert.strictEqual(amurDesc.rows[0].title, 'Олекминский', 'Largest OOPT in Amur oblast should be Олекминский (369 000 ha)');

const amurAsc = getOoptList({ region: 'Амурская область', sort: 'area_asc', limit: 5 });
assert.ok(amurAsc.rows[0].area > 0 && amurAsc.rows[0].area <= amurAsc.rows[1].area, 'Row 0 area must be <= Row 1 area in area_asc');

const minAreaList = getOoptList({ region: 'Амурская область', min_area: 100000 });
assert.ok(minAreaList.rows.every(r => r.area >= 100000), 'All rows must have area >= 100,000 ha');
// 18. Test cluster extraction and clarification formatting
const zimov3Details = await getOoptDetails(58135);
assert.ok(zimov3Details, 'Details for 58135 must exist');
assert.strictEqual(zimov3Details.cluster_count, 10, 'Wintering Pits N 3 must have 10 clusters');
assert.ok(Array.isArray(zimov3Details.parsedClusters), 'Must have parsedClusters array');
assert.strictEqual(zimov3Details.parsedClusters.length, 10, 'Must have 10 parsed cluster items');
assert.ok(zimov3Details.submitterFields.clarification.includes('Кластерность: 10 участков (Узкая Ахтуба'), 'Named clusters must include names and areas');
assert.ok(zimov3Details.submitterFields.clarification.length <= 255, 'Clarification must not exceed 255 characters');

// 18b. Test generic cluster counting omission per Manu R2BBX (NID 6435: Центрально-Черноземный)
const tchernozemDetails = await getOoptDetails(6435);
assert.ok(tchernozemDetails, 'Details for 6435 must exist');
assert.strictEqual(tchernozemDetails.cluster_count, 10, 'Must have 10 clusters');
assert.ok(tchernozemDetails.submitterFields.clarification.includes('Кластерность: 10 участков'), 'Must have cluster prefix');
assert.strictEqual(tchernozemDetails.submitterFields.clarification.includes('('), false, 'Generic clusters (Участок 1..10) must NOT be enumerated in parentheses');
assert.ok(tchernozemDetails.submitterFields.clarification.length <= 255, 'Clarification must not exceed 255 characters');
console.log('✅ PASS: Cluster extraction, generic enumeration suppression & clarification formatting verified (NID 58135, NID 6435)');

// 19. Test multi-region extraction and UNESCO Biosphere Reserve status (NID 6453: Caucasian Reserve)
const kavkazDetails = await getOoptDetails(6453);
assert.ok(kavkazDetails, 'Details for 6453 must exist');
assert.ok(kavkazDetails.rf_subjects.includes('Карачаево-Черкесская'), 'Must include Karachay-Cherkessia');
assert.ok(kavkazDetails.rf_subjects.includes('Краснодарский'), 'Must include Krasnodar Krai');
assert.ok(kavkazDetails.rf_subjects.includes('Адыгея'), 'Must include Adygea');
assert.strictEqual(kavkazDetails.submitterFields.locationCode, 'RU-KC, RU-KD, RU-AD', 'Location code must include all 3 regions: RU-KC, RU-KD, RU-AD');
assert.strictEqual(kavkazDetails.is_biosphere, true, 'is_biosphere must be true');
assert.strictEqual(kavkazDetails.submitterFields.statusEn, 'UNESCO Biosphere Reserve', 'StatusEn must be UNESCO Biosphere Reserve');
assert.ok(kavkazDetails.international_status.includes('Биосферный резерват'), 'International status must be captured from NextGIS');
console.log('✅ PASS: Multi-region extraction & UNESCO Biosphere Reserve status verified (NID 6453: 3 regions, UNESCO Biosphere Reserve)');

// 20. Test nested OOPT counting & area prioritization per Manu R2BBX (NID 34145: Lipetsky Reserve)
const lipetskDetails = await getOoptDetails(34145);
assert.ok(lipetskDetails, 'Details for 34145 must exist');
const lipetskClarify = lipetskDetails.submitterFields.clarification;
assert.ok(lipetskClarify.includes('Площадь: 18 327,11 га') || lipetskClarify.includes('Площадь: 18\u00a0327,11 га'), 'Must include area of submitted OOPT');
assert.ok(lipetskClarify.indexOf('Площадь:') < lipetskClarify.indexOf('В границах ООПТ:'), 'Area must come before nested OOPTs (Priority 1)');
assert.ok(lipetskClarify.includes('В границах ООПТ: 3 иных ООПТ'), 'Must format nested OOPTs as "В границах ООПТ: 3 иных ООПТ"');
assert.strictEqual(lipetskClarify.includes('Сосновый бор'), false, 'Names of nested OOPTs must NOT be listed per Manu R2BBX');
assert.ok(lipetskClarify.length <= 255, 'Clarification must not exceed 255 characters');

// Test 1 and 2 nested OOPT inflections
import { formatClarification } from './src/services/ooptService.js';
const singleNested = formatClarification({ area: 100, nested_oopt: JSON.stringify([{ name: 'Заказник 1' }]) });
assert.ok(singleNested.includes('В границах ООПТ: 1 иная ООПТ'), 'Must decline as "1 иная ООПТ"');
const doubleNested = formatClarification({ area: 100, nested_oopt: JSON.stringify([{ name: 'Заказник 1' }, { name: 'Заказник 2' }]) });
assert.ok(doubleNested.includes('В границах ООПТ: 2 иных ООПТ'), 'Must decline as "2 иных ООПТ"');
console.log('✅ PASS: Nested OOPT count formatting verified (NID 34145: "3 иных ООПТ", 1 and 2 inflections, Area first)');

// 21. Test redundant dual name suppression per Manu R2BBX ("Stanovlyansky (Stanovlyanskiy)" -> single name)
import { areNamesSubstantiallyIdentical, translateOoptNameOnline } from './src/services/ooptService.js';
assert.strictEqual(areNamesSubstantiallyIdentical('Stanovlyansky', 'Stanovlyanskiy'), true);
assert.strictEqual(areNamesSubstantiallyIdentical('Prisursky', 'Prisurskiy'), true);
assert.strictEqual(areNamesSubstantiallyIdentical('Wild Field', 'Dikoe Pole'), false);

const dualStanovlyansky = formatDualParkName('Становлянский');
assert.strictEqual(dualStanovlyansky.includes('('), false, 'Must NOT contain parentheses when translation and transliteration are practically identical');

const onlineStanovlyansky = await translateOoptNameOnline('Становлянский');
assert.strictEqual(onlineStanovlyansky.includes('('), false, 'Online AI translation must NOT contain parentheses for identical transliterations');
assert.ok(onlineStanovlyansky.startsWith('Stanovlyan'), 'Should translate to Stanovlyansky or Stanovlyanskiy');

const dualWild = formatDualParkName('Дикое поле', 'памятник природы');
assert.strictEqual(dualWild, 'Wild Field (Dikoe Pole)', 'Must preserve dual format when translation is semantically distinct');
console.log('✅ PASS: Redundant dual name suppression verified per Manu R2BBX ("Stanovlyansky" single, "Wild Field (Dikoe Pole)" dual)');

// 22. Test cluster HTML entity decoding & prefix cleaning per Manu R2BBX ("Галичья гора", nid 6427)
import { cleanClusterName } from './src/services/ooptService.js';
assert.strictEqual(cleanClusterName('Участок &quot;Плющань&quot;'), 'Плющань');
assert.strictEqual(cleanClusterName('Участок&quot;Галичья Гора&quot;'), 'Галичья Гора');
assert.strictEqual(cleanClusterName('Участок 1'), 'Участок 1');

const galichyaDetails = await getOoptDetails(6427);
const galichyaClarify = galichyaDetails.submitterFields.clarification;
assert.ok(!galichyaClarify.includes('&quot;'), 'Clarification must decode HTML entities (&quot;)');
assert.ok(!galichyaClarify.includes('Участок "'), 'Clarification must strip redundant "Участок" prefix');
assert.ok(galichyaClarify.includes('Плющань 39,5 га'), 'Must include clean cluster name and area');
assert.ok(galichyaClarify.includes('Галичья Гора 19,0 га'), 'Must include clean cluster name and area');
assert.ok(galichyaClarify.length <= 255, 'Clarification must not exceed 255 chars');
console.log('✅ PASS: Cluster HTML entity decoding & prefix cleaning verified for NID 6427 ("Галичья гора")');

// 23. Test UNESCO Biosphere Reserve detection per Manu R2BBX ("Лапландский", nid 5456)
const laplandDetails = await getOoptDetails(5456);
assert.strictEqual(laplandDetails.international_status, 'Биосферный резерват', 'Must extract international status');
assert.strictEqual(laplandDetails.is_biosphere, true, 'Must identify as biosphere reserve');
assert.strictEqual(laplandDetails.submitterFields.statusEn, 'UNESCO Biosphere Reserve', 'Status EN must be UNESCO Biosphere Reserve');
console.log('✅ PASS: UNESCO Biosphere Reserve status detection verified for NID 5456 ("Лапландский")');

// 24. Test cluster large number parsing & trailing descriptor stripping per Manu R2BBX ("Ямальский", nid 32)
assert.strictEqual(cleanClusterName('Южно-Ямальский участок'), 'Южно-Ямальский');
assert.strictEqual(cleanClusterName('Северо-Ямальский участок'), 'Северо-Ямальский');

const yamalClarify = formatClarification({
  area: 4183000,
  cluster_count: 2,
  clusters: JSON.stringify([
    { name: 'Южно-Ямальский участок', area: '3 374 485,0 га' },
    { name: 'Северо-Ямальский участок', area: '411 270,4 га' }
  ])
});
assert.ok(yamalClarify.includes('Кластерность: 2 участка'), 'Must correctly inflect "2 участка" (not 2 участков)');
assert.ok(yamalClarify.includes('Южно-Ямальский 3 374 485,0 га'), 'Must preserve thousands space in cluster area and strip trailing "участок"');
assert.ok(yamalClarify.includes('Северо-Ямальский 411 270,4 га'), 'Must preserve full area for second cluster');
assert.ok(!yamalClarify.includes('Южно-Ямальский 3 га'), 'Must NOT truncate thousands at space to 3 га');
assert.ok(yamalClarify.length <= 255, 'Clarification must not exceed 255 chars');
console.log('✅ PASS: Cluster large number parsing & trailing descriptor stripping verified ("Ямальский": 3 374 485,0 га, 2 участка)');

// 25. Test strict Omsk region isolation from Tomsk and Kostroma per Manu R2BBX
const omskList = getOoptList({ region: 'Омская область', limit: 100 });
assert.strictEqual(omskList.total, 24, 'Omsk region must contain exactly 24 nature reserves (not 212)');
for (const item of omskList.rows) {
  assert.ok(item.ate.includes('Омская'), `Item ${item.nid} (${item.title}) must be in Omsk oblast`);
  assert.ok(!item.ate.includes('Томск'), `Item ${item.nid} (${item.title}) must NOT be in Tomsk oblast`);
  assert.ok(!item.ate.includes('Костром'), `Item ${item.nid} (${item.title}) must NOT be in Kostroma oblast`);
}

assert.strictEqual(isSameOrOverlappingRegion('Омская область', 'Томская область'), false, 'Omsk and Tomsk must NOT match');
assert.strictEqual(isSameOrOverlappingRegion('Омская область', 'Костромская область'), false, 'Omsk and Kostroma must NOT match');
assert.strictEqual(isSameOrOverlappingRegion('Омская область', 'г. Омск'), true, 'Omsk and Omsk city must match');

const regStats = getRegionalPotaStats();
const omskStat = regStats.regions.find(r => r.code === 'RU-OM');
assert.ok(omskStat, 'RU-OM stat must exist');
assert.strictEqual(omskStat.ooptCandidates, 24, 'RU-OM candidate count must be 24 (excluding Tomsk and Kostroma)');
console.log('✅ PASS: Omsk region strictly isolated from Tomsk and Kostroma in search and stats (24 OOPTs, 0 Tomsk/Kostroma)');

// 26. Test RU-0024 (Meshchyora) and RU-0025 (Meschyorsky) matching per Manu R2BBX
const m24 = db.prepare('SELECT nid, title, ate, pota_ref, pota_name FROM oopt_registry WHERE nid = 6708').get();
const m25 = db.prepare('SELECT nid, title, ate, pota_ref, pota_name FROM oopt_registry WHERE nid = 6709').get();

assert.ok(m24, 'NID 6708 (Мещера) must exist');
assert.strictEqual(m24.pota_ref, 'RU-0024', 'NID 6708 must be linked to RU-0024');
assert.strictEqual(m24.pota_name, 'Meshchyora National Park', 'NID 6708 must have pota_name Meshchyora National Park');

assert.ok(m25, 'NID 6709 (Мещерский) must exist');
assert.strictEqual(m25.pota_ref, 'RU-0025', 'NID 6709 must be linked to RU-0025');
assert.strictEqual(m25.pota_name, 'Meschyorsky National Park', 'NID 6709 must have pota_name Meschyorsky National Park');
console.log('✅ PASS: RU-0024 (Мещера) and RU-0025 (Мещерский) successfully mapped and verified in oopt_registry');

// 27. Test RU-0031 (Плещеево озеро) and RU-0324 (Птичья гавань) matching per Manu R2BBX
const m31 = db.prepare('SELECT nid, title, ate, pota_ref, pota_name FROM oopt_registry WHERE nid = 6714').get();
const m324 = db.prepare('SELECT nid, title, ate, pota_ref, pota_name FROM oopt_registry WHERE nid = 7091').get();

assert.ok(m31, 'NID 6714 (Плещеево озеро) must exist');
assert.strictEqual(m31.pota_ref, 'RU-0031', 'NID 6714 must be linked to RU-0031');
assert.strictEqual(m31.pota_name, 'Pleshcheyevo Ozero National Park', 'NID 6714 must have pota_name Pleshcheyevo Ozero National Park');

assert.ok(m324, 'NID 7091 (Птичья гавань) must exist');
assert.strictEqual(m324.pota_ref, 'RU-0324', 'NID 7091 must be linked to RU-0324');
assert.strictEqual(m324.pota_name, 'Bird Harbor Nature Park', 'NID 7091 must have pota_name Bird Harbor Nature Park');
console.log('✅ PASS: RU-0031 (Плещеево озеро) and RU-0324 (Птичья гавань) successfully mapped and verified in oopt_registry');

console.log('\n--- ALL OOPT SEARCH & NAME TESTS PASSED! ---');




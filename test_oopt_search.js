import assert from 'assert';
import db from './src/db/database.js';
import { getOoptList, cleanOoptName, translateNameToEnglish } from './src/services/ooptService.js';

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

console.log('\n--- ALL OOPT SEARCH & NAME TESTS PASSED! ---');

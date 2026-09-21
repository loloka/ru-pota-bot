import assert from 'assert';
import db from './src/db/database.js';
import { getOoptList } from './src/services/ooptService.js';

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

console.log('\n--- ALL OOPT SEARCH TESTS PASSED! ---');

import assert from 'assert';
import {
  categorizeLink,
  getRussianPotaParks,
  auditPotaLinks,
  formatSingleReplacement,
  formatBatchWikipediaReplacements,
  formatEmptyLinksReport,
  formatFullManuReport,
  checkUrlOnline,
} from './src/services/potaAuditService.js';

console.log('=== RUNNING POTA LINKS AUDIT TESTS ===\n');

// 1. Test categorizeLink
console.log('[1] Testing categorizeLink...');
assert.strictEqual(categorizeLink('').category, 'empty');
assert.strictEqual(categorizeLink(null).category, 'empty');
assert.strictEqual(categorizeLink('   ').category, 'empty');
assert.strictEqual(categorizeLink('https://en.wikipedia.org/wiki/Anyuysky_National_Park').category, 'wikipedia');
assert.strictEqual(categorizeLink('https://ru.wikipedia.org/wiki/Park').category, 'wikipedia');
assert.strictEqual(categorizeLink('http://npalania.ru/').category, 'insecure_http');
assert.strictEqual(categorizeLink('https://vk.com/club12345').category, 'social');
assert.strictEqual(categorizeLink('https://ooptaari.nextgis.ru/node/6699').category, 'official_oopt');
assert.strictEqual(categorizeLink('https://карта.оцзк.рф/oopt/123').category, 'official_oopt');
assert.strictEqual(categorizeLink('https://npalania.ru/').category, 'ok');
console.log('✅ PASS: categorizeLink correctly categorizes all URL types\n');

// 2. Test getRussianPotaParks
console.log('[2] Testing getRussianPotaParks...');
const parks = getRussianPotaParks();
assert.ok(parks.length >= 500, `Expected at least 500 RU parks, got ${parks.length}`);
assert.ok(parks.every(p => p.reference.startsWith('RU-')), 'All loaded parks must start with RU-');
console.log(`✅ PASS: Loaded ${parks.length} Russian POTA parks\n`);

// 3. Test auditPotaLinks
console.log('[3] Testing auditPotaLinks...');
const audit = auditPotaLinks();
assert.ok(audit.stats, 'Audit must have stats');
assert.strictEqual(audit.stats.total, parks.length);
assert.ok(typeof audit.stats.wikipedia === 'number', 'Wikipedia stat must be number');
assert.ok(audit.stats.insecure_http >= 30, 'Expected at least 30 HTTP links');
assert.ok(audit.stats.with_replacement >= 100, 'Expected at least 100 replacement matches');
assert.strictEqual(audit.parks.length, parks.length);

// Check Anyuysky National Park (RU-0003) - now updated to official NextGIS in POTA!
const anyuysky = audit.parks.find(p => p.reference === 'RU-0003');
assert.ok(anyuysky, 'RU-0003 must be in audit');
assert.strictEqual(anyuysky.category, 'official_oopt');
assert.strictEqual(anyuysky.website, 'https://ooptaari.nextgis.ru/node/6699');
console.log('✅ PASS: auditPotaLinks verified RU-0003 has official NextGIS link in POTA\n');

// 4. Test formatSingleReplacement
console.log('[4] Testing formatSingleReplacement...');
const sampleProposal = {
  reference: 'RU-0003',
  name: 'Anyuysky National Park',
  category: 'wikipedia',
  website: 'https://en.wikipedia.org/wiki/Anyuysky_National_Park',
  replacement: {
    nid: 6699,
    title: 'Анюйский',
    category: 'национальный парк',
    sig: 'федерального значения',
    url: 'https://ooptaari.nextgis.ru/node/6699',
    region: 'Хабаровский край'
  }
};
const singleText = formatSingleReplacement(sampleProposal);
assert.ok(singleText.includes('RU-0003'));
assert.ok(singleText.includes('https://en.wikipedia.org/wiki/Anyuysky_National_Park'));
assert.ok(singleText.includes('https://ooptaari.nextgis.ru/node/6699'));
assert.ok(singleText.includes('Анюйский'));
console.log('✅ PASS: formatSingleReplacement generates valid R2BBX proposal text\n');

// 5. Test formatBatchWikipediaReplacements
console.log('[5] Testing formatBatchWikipediaReplacements...');
const batchText = formatBatchWikipediaReplacements();
assert.ok(batchText.includes('Сводный список предложений'));
console.log('✅ PASS: formatBatchWikipediaReplacements generates valid batch document\n');

// 5b. Test formatEmptyLinksReport (Manu R2BBX)
console.log('[5b] Testing formatEmptyLinksReport...');
const emptyReport = formatEmptyLinksReport();
assert.ok(emptyReport.includes('🚨 СПИСОК ПАРКОВ POTA БЕЗ ССЫЛОК'));
assert.ok(emptyReport.includes(`Всего парков без ссылки: ${audit.stats.empty}`));
console.log('✅ PASS: formatEmptyLinksReport formats empty parks correctly\n');

// 5c. Test formatFullManuReport (Manu R2BBX)
console.log('[5c] Testing formatFullManuReport...');
const fullReport = formatFullManuReport();
assert.ok(fullReport.includes('СВОДНЫЙ АУДИТ И РЕКОМЕНДАЦИИ'));
assert.ok(fullReport.includes('РАЗДЕЛ 1: ПАРКИ БЕЗ ССЫЛОК'));
assert.ok(fullReport.includes('РАЗДЕЛ 2: ССЫЛКИ НА ВИКИПЕДИЮ'));
assert.ok(fullReport.includes('РАЗДЕЛ 3: ССЫЛКИ НА НЕЗАЩИЩЕННЫЙ HTTP'));
console.log('✅ PASS: formatFullManuReport generates full 3-section report\n');

// 6. Test checkUrlOnline error handling
console.log('[6] Testing checkUrlOnline...');
const emptyRes = await checkUrlOnline('');
assert.strictEqual(emptyRes.ok, false);
assert.strictEqual(emptyRes.error, 'URL не указан');

const invalidRes = await checkUrlOnline('http://non-existent-domain-xyz-404.local');
assert.strictEqual(invalidRes.ok, false);
assert.ok(invalidRes.error, 'Must return error string');
console.log('✅ PASS: checkUrlOnline handles invalid URLs gracefully\n');

console.log('--- ALL POTA LINKS AUDIT TESTS PASSED! ---');
process.exit(0);

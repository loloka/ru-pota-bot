import assert from 'assert';
import { getRegionalPotaStats } from './src/services/ooptService.js';

console.log('=== RUNNING REGIONAL POTA COVERAGE & DIPLOMA MATURITY TESTS ===\n');

const stats = getRegionalPotaStats();

// 1. Check summary structure
assert(stats.summary, 'Summary object must exist');
assert(stats.summary.totalPotentialParks > 10000, `Potential parks must be > 10000, got ${stats.summary.totalPotentialParks}`);
const under10Codes = stats.regions.filter(r => r.isUnder10).map(r => r.code);
assert.strictEqual(stats.summary.under10ParksCount, under10Codes.length, `Under 10 parks count must match filtered regions count, got ${stats.summary.under10ParksCount}`);
assert.strictEqual(under10Codes.includes('RU-FJ'), false, 'RU-FJ (ZFI) must be excluded from under10 list');
assert.strictEqual(under10Codes.includes('RU-IN'), false, 'RU-IN (Ingushetia) must be excluded from under10 list');
assert(stats.summary.overallCoverageRate > 4 && stats.summary.overallCoverageRate < 10, `Overall coverage rate should be around 4.9%, got ${stats.summary.overallCoverageRate}`);
console.log(`✅ PASS: Summary stats verified (Total potential: ${stats.summary.totalPotentialParks}, Mature regions: ${stats.summary.matureRegionsCount}, Under 10 parks: ${stats.summary.under10ParksCount}, Overall coverage: ${stats.summary.overallCoverageRate}%)`);
console.log('Mature regions list:', stats.regions.filter(r => r.coverageRate >= 70).map(r => ({ code: r.code, name: r.name, coverageRate: r.coverageRate, pota: r.totalParks, oopt: r.ooptCandidates })));

// 2. Check region list
assert(Array.isArray(stats.regions), 'Regions must be an array');
assert(stats.regions.length >= 85, `Should have at least 85 regions, got ${stats.regions.length}`);

// 3. Test Nizhny Novgorod (fixed "город" bug)
const nizhny = stats.regions.find(r => r.code === 'RU-NZ');
assert(nizhny, 'RU-NZ must exist');
assert.strictEqual(nizhny.ooptCandidates, 415, `RU-NZ must have 415 OOPT candidates, got ${nizhny.ooptCandidates}`);
assert(nizhny.coverageRate < 5, `RU-NZ coverage rate must be < 5%, got ${nizhny.coverageRate}`);
assert.strictEqual(nizhny.diplomaStatus, 'initial', `RU-NZ diploma status must be 'initial'`);
console.log(`✅ PASS: Nizhny Novgorod (RU-NZ) correctly mapped to 415 OOPT (Coverage: ${nizhny.coverageRate}%, Status: ${nizhny.diplomaStatus})`);

// 4. Test Belgorod (fixed "город" bug)
const belgorod = stats.regions.find(r => r.code === 'RU-BL');
assert(belgorod, 'RU-BL must exist');
assert.strictEqual(belgorod.ooptCandidates, 327, `RU-BL must have 327 OOPT candidates, got ${belgorod.ooptCandidates}`);
console.log(`✅ PASS: Belgorod (RU-BL) correctly mapped to 327 OOPT candidates`);

// 5. Test Mature Regions (100% / near 100% diploma coverage)
const khakassia = stats.regions.find(r => r.code === 'RU-KK');
assert(khakassia, 'RU-KK must exist');
assert.strictEqual(khakassia.coverageRate, 100);
assert.strictEqual(khakassia.diplomaStatus, 'mature');

const spb = stats.regions.find(r => r.code === 'RU-SP');
assert(spb, 'RU-SP must exist');
assert.strictEqual(spb.coverageRate, 100);
assert.strictEqual(spb.diplomaStatus, 'mature');

const kaliningrad = stats.regions.find(r => r.code === 'RU-KN');
assert(kaliningrad, 'RU-KN must exist');
assert(kaliningrad.coverageRate >= 90, `Kaliningrad coverage should be >= 90%, got ${kaliningrad.coverageRate}%`);
assert.strictEqual(kaliningrad.diplomaStatus, 'mature');

const fj = stats.regions.find(r => r.code === 'RU-FJ');
assert(fj, 'RU-FJ must exist');
assert.strictEqual(fj.coverageRate, 100);
assert.strictEqual(fj.diplomaStatus, 'mature');

console.log('✅ PASS: Mature regions confirmed (Хакасия 100%, СПб 100%, Калининград 95%, Земля Франца-Иосифа 100%)');

// 6. Test Leningrad Oblast vs SPb separation
const lenOblast = stats.regions.find(r => r.code === 'RU-LN');
assert(lenOblast, 'RU-LN must exist');
assert(lenOblast.ooptCandidates > 40 && lenOblast.ooptCandidates < 70, `RU-LN OOPT candidates should be around 52, got ${lenOblast.ooptCandidates}`);
assert(lenOblast.coverageRate >= 40, `RU-LN coverage should be >= 40%, got ${lenOblast.coverageRate}`);
console.log(`✅ PASS: Leningrad Oblast (RU-LN) separated from SPb: ${lenOblast.ooptCandidates} OOPT (${lenOblast.coverageRate}% coverage)`);

// 7. Test getPotaLocationCode accuracy and substring collision protection (Tomsk vs Omsk, Sakhalin vs Sakha)
import { getPotaLocationCode } from './src/services/ooptService.js';
assert.strictEqual(getPotaLocationCode('Томская область'), 'RU-TO', 'Томская область must resolve to RU-TO, not RU-OM');
assert.strictEqual(getPotaLocationCode('Омская область'), 'RU-OM', 'Омская область must resolve to RU-OM');
assert.strictEqual(getPotaLocationCode('Сахалинская область'), 'RU-SK', 'Сахалинская область must resolve to RU-SK, not RU-SL');
assert.strictEqual(getPotaLocationCode('Республика Саха (Якутия)'), 'RU-SL', 'Саха (Якутия) must resolve to RU-SL');
assert.strictEqual(getPotaLocationCode('Костромская область'), 'RU-KT', 'Костромская область must resolve to RU-KT, not RU-OM');
assert.strictEqual(getPotaLocationCode('Новосибирская область, Томская область'), 'RU-NS, RU-TO', 'Multi-region cross-border must resolve both RU-NS and RU-TO');
console.log('✅ PASS: getPotaLocationCode accurately resolves Tomsk (RU-TO), Omsk (RU-OM), Sakhalin (RU-SK), and cross-border regions');

console.log('\n--- ALL REGIONAL POTA COVERAGE TESTS PASSED! ---');

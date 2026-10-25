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
assert(stats.summary.overallCoverageRate > 4 && stats.summary.overallCoverageRate < 25, `Overall coverage rate should be between 4% and 25%, got ${stats.summary.overallCoverageRate}`);
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
assert(fj.coverageRate >= 50, `ZFI coverage rate should be >= 50%, got ${fj.coverageRate}`);
assert.strictEqual(fj.diplomaStatus, 'medium');

console.log('✅ PASS: Mature & developing regions confirmed (Хакасия 100%, СПб 100%, Калининград 95%, Земля Франца-Иосифа 50%)');

// 6. Test Leningrad Oblast vs SPb separation
const lenOblast = stats.regions.find(r => r.code === 'RU-LN');
assert(lenOblast, 'RU-LN must exist');
assert(lenOblast.ooptCandidates > 40 && lenOblast.ooptCandidates < 70, `RU-LN OOPT candidates should be around 52, got ${lenOblast.ooptCandidates}`);
assert(lenOblast.coverageRate >= 40, `RU-LN coverage should be >= 40%, got ${lenOblast.coverageRate}`);
console.log(`✅ PASS: Leningrad Oblast (RU-LN) separated from SPb: ${lenOblast.ooptCandidates} OOPT (${lenOblast.coverageRate}% coverage)`);

// 7. Test getPotaLocationCode accuracy and substring collision protection (Tomsk vs Omsk, Sakhalin vs Sakha)
import { getPotaLocationCode, getRegionSqlCondition } from './src/services/ooptService.js';
import db from './src/db/database.js';

assert.strictEqual(getPotaLocationCode('Томская область'), 'RU-TO', 'Томская область must resolve to RU-TO, not RU-OM');
assert.strictEqual(getPotaLocationCode('Омская область'), 'RU-OM', 'Омская область must resolve to RU-OM');
assert.strictEqual(getPotaLocationCode('Сахалинская область'), 'RU-SL', 'Сахалинская область must resolve to RU-SL (Sakhalin)');
assert.strictEqual(getPotaLocationCode('Республика Саха (Якутия)'), 'RU-SK', 'Саха (Якутия) must resolve to RU-SK (Sakha)');
assert.strictEqual(getPotaLocationCode('Костромская область'), 'RU-KT', 'Костромская область must resolve to RU-KT, not RU-OM');
assert.strictEqual(getPotaLocationCode('Новосибирская область, Томская область'), 'RU-NS, RU-TO', 'Multi-region cross-border must resolve both RU-NS and RU-TO');
console.log('✅ PASS: getPotaLocationCode accurately resolves Tomsk (RU-TO), Omsk (RU-OM), Sakhalin (RU-SL), Sakha (RU-SK), and cross-border regions');

// 8. Test getRegionSqlCondition precision (Belgorod, Nizhny Novgorod, Novgorod, Altai, Yakutia, ZFI)
const belCond = getRegionSqlCondition('Белгородская область');
const belCnt = db.prepare(`SELECT COUNT(nid) as c FROM oopt_registry WHERE ${belCond.sql}`).get(...belCond.params).c;
assert(belCnt > 300, `Belgorod candidates should be > 300, got ${belCnt}`);

const nizhCond = getRegionSqlCondition('Нижегородская область');
const nizhCnt = db.prepare(`SELECT COUNT(nid) as c FROM oopt_registry WHERE ${nizhCond.sql}`).get(...nizhCond.params).c;
assert(nizhCnt > 400, `Nizhny Novgorod candidates should be > 400, got ${nizhCnt}`);

const novgCond = getRegionSqlCondition('Новгородская область');
const novgCnt = db.prepare(`SELECT COUNT(nid) as c FROM oopt_registry WHERE ${novgCond.sql}`).get(...novgCond.params).c;
assert(novgCnt > 100 && novgCnt < 200, `Novgorod candidates should be around 121, got ${novgCnt}`);

const altKraiCond = getRegionSqlCondition('Алтайский край');
const altKraiCnt = db.prepare(`SELECT COUNT(nid) as c FROM oopt_registry WHERE ${altKraiCond.sql}`).get(...altKraiCond.params).c;
assert(altKraiCnt > 100, `Altai Krai candidates should be > 100, got ${altKraiCnt}`);

const altRespCond = getRegionSqlCondition('Республика Алтай');
const altRespCnt = db.prepare(`SELECT COUNT(nid) as c FROM oopt_registry WHERE ${altRespCond.sql}`).get(...altRespCond.params).c;
assert(altRespCnt > 40 && altRespCnt < 80, `Altai Republic candidates should be around 55, got ${altRespCnt}`);

const zfiCond = getRegionSqlCondition('RU-FJ');
const zfiCnt = db.prepare(`SELECT COUNT(nid) as c FROM oopt_registry WHERE ${zfiCond.sql}`).get(...zfiCond.params).c;
assert(zfiCnt >= 2, `ZFI objects should be >= 2, got ${zfiCnt}`);

console.log('✅ PASS: getRegionSqlCondition accurately isolates Belgorod, Nizhny, Novgorod, Altai, and ZFI');

console.log('\n--- ALL REGIONAL POTA COVERAGE TESTS PASSED! ---');

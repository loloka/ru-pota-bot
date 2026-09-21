import assert from 'assert';
import fs from 'fs';
import { locationService } from './src/services/locationService.js';

console.log('=== RUNNING LOCATION SERVICE & GEOGRAPHY TESTS ===\n');

// 1. Single location resolution
const fr = locationService.resolveLocation('FR-PAC', 'FR-7040');
assert.strictEqual(fr.flag, '🇫🇷', 'Flag should be France');
assert.strictEqual(fr.countryName, 'Франция', 'Russian country name should be Франция');
assert.strictEqual(fr.countryNameEn, 'France', 'English country name should be France');
assert.strictEqual(fr.regionName, "Provence-Alpes-Côte d'Azur", 'Region should be Provence-Alpes-Côte d\'Azur');
console.log('✅ PASS: Resolved French park FR-7040 with PAC region');

// 2. US location resolution
const us = locationService.resolveLocation('US-MI', 'US-13184');
assert.strictEqual(us.flag, '🇺🇸', 'Flag should be USA');
assert.strictEqual(us.countryName, 'США', 'Russian country name should be США');
assert.strictEqual(us.regionName, 'Michigan', 'Region should be Michigan');
console.log('✅ PASS: Resolved US park US-13184 with Michigan state');

// 3. Russian canonical region resolution
const ru = locationService.resolveLocation('RU-NS', 'RU-0073');
assert.strictEqual(ru.flag, '🇷🇺', 'Flag should be Russia');
assert.strictEqual(ru.countryName, 'Россия', 'Country should be Россия');
assert.strictEqual(ru.regionName, 'Новосибирская область', 'Region should be canonical Russian title');
console.log('✅ PASS: Resolved Russian park with canonical Russian region name');

// 4. Multi-region handling
const multi = locationService.resolveLocation('US-CT,US-DC,US-DE,US-MA', 'US-4582');
assert.strictEqual(multi.flag, '🇺🇸', 'Flag should be USA');
assert.strictEqual(multi.countryName, 'США', 'Country should be США');
assert(multi.regionName.includes('Connecticut'), 'Should list primary states');
assert(multi.regionName.includes('(+2)'), 'Should indicate count of remaining regions');
console.log('✅ PASS: Resolved multi-region locationDesc with count badge');

// 5. Fallback from reference prefix when locationDesc is empty
const fbFr = locationService.resolveLocation('', 'FR-1234');
assert.strictEqual(fbFr.flag, '🇫🇷', 'Flag derived from FR- prefix');
assert.strictEqual(fbFr.countryName, 'Франция', 'Country name derived from FR- prefix');
console.log('✅ PASS: Graceful fallback to country from park reference prefix');

// 6. Special POTA prefixes
assert.strictEqual(locationService.getFlag('K'), '🇺🇸', 'K- maps to US flag');
assert.strictEqual(locationService.getFlag('VE'), '🇨🇦', 'VE- maps to Canadian flag');
assert.strictEqual(locationService.getFlag('VK'), '🇦🇺', 'VK- maps to Australian flag');
assert.strictEqual(locationService.getFlag('JA'), '🇯🇵', 'JA- maps to Japan flag');
console.log('✅ PASS: Correct flags for amateur radio / POTA prefixes');

// 7. Verify ProfileTab community link is https://t.me/POTA_RU
const profileTabContent = fs.readFileSync('./src/webapp/src/components/tabs/ProfileTab.jsx', 'utf8');
assert(profileTabContent.includes('href="https://t.me/POTA_RU"'), 'ProfileTab community link must be https://t.me/POTA_RU');
assert(!profileTabContent.includes('href="https://t.me/ru_pota"'), 'Old incorrect community link must be removed');
console.log('✅ PASS: ProfileTab community link verified as https://t.me/POTA_RU');

console.log('\n--- ALL LOCATION SERVICE TESTS PASSED! ---');

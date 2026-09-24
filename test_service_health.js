import assert from 'assert';
import { SERVICES, checkAllServices, checkServiceById, getCachedServicesStatus } from './src/services/serviceHealth.js';

console.log('=== RUNNING EXTERNAL SERVICES HEALTH MONITORING TESTS ===\n');

// 1. Verify SERVICES definitions
assert(Array.isArray(SERVICES), 'SERVICES should be an array');
assert.strictEqual(SERVICES.length, 7, 'Should define exactly 7 services');

const requiredIds = ['bot_core', 'telegram_api', 'pota_api', 'pota_next', 'oopt_registry', 'oopt_nextgis', 'osm_tiles'];
for (const id of requiredIds) {
  const found = SERVICES.find(s => s.id === id);
  assert(found, `Service ${id} must be defined`);
  assert(found.name, `Service ${id} must have a name`);
  assert(found.domain, `Service ${id} must have a domain`);
  assert(found.url, `Service ${id} must have a url`);
}
console.log('✅ PASS: SERVICES array and definitions are valid (7 services)');

// 2. Test invalid service ID lookup
const nullResult = await checkServiceById('invalid_unknown_service');
assert.strictEqual(nullResult, null, 'Unknown service id should return null');
console.log('✅ PASS: checkServiceById handles non-existent ID gracefully');

// 3. Test single fast check (bot_core)
const botResult = await checkServiceById('bot_core');
assert(botResult, 'bot_core check result should exist');
assert.strictEqual(botResult.id, 'bot_core');
assert.strictEqual(botResult.status, 'up');
assert(botResult.details, 'bot_core must include details');
console.log(`✅ PASS: checkServiceById('bot_core') responded with status=${botResult.status}, details="${botResult.details}"`);

// 4. Test checkAllServices and caching
const all1 = await checkAllServices(true);
assert(Array.isArray(all1), 'checkAllServices should return array');
assert.strictEqual(all1.length, 7, 'checkAllServices should return 7 results');

const cached = getCachedServicesStatus();
assert.strictEqual(cached, all1, 'getCachedServicesStatus matches checkAllServices result');

const all2 = await checkAllServices(false);
assert.strictEqual(all2, all1, 'Subsequent call within TTL should return cached reference');
console.log('✅ PASS: checkAllServices and in-memory TTL caching working properly');

console.log('\n--- ALL SERVICE HEALTH TESTS PASSED! ---');

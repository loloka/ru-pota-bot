import assert from 'assert';
import { fetchCoordsFromRusoir, getOoptDetails } from './src/services/ooptService.js';
import db from './src/db/database.js';

console.log('🧪 Running RusOIR integration tests...');

async function runTests() {
  // Test 1: Fetch coords from RusOIR for Гора Гомель
  console.log('  Test 1: fetchCoordsFromRusoir("Гора Гомель", "Еврейская автономная область")');
  const gomel = await fetchCoordsFromRusoir('Гора Гомель', 'Еврейская автономная область', 'памятник природы');
  assert.ok(gomel, 'Should find Гора Гомель on RusOIR');
  assert.strictEqual(gomel.lat, 48.0459, 'Latitude should match 48.0459');
  assert.strictEqual(gomel.lon, 132.8352, 'Longitude should match 132.8352');
  assert.ok(gomel.rusoirUrl.includes('gora-gomel'), 'RusOIR URL should point to gora-gomel');
  console.log('  ✔ Test 1 passed!');

  // Test 2: Fetch coords from RusOIR for Выборгский заказник
  console.log('  Test 2: fetchCoordsFromRusoir("Выборгский", "Ленинградская область")');
  const vyborg = await fetchCoordsFromRusoir('Выборгский', 'Ленинградская область', 'государственный природный заказник');
  assert.ok(vyborg, 'Should find Выборгский on RusOIR');
  assert.ok(Math.abs(vyborg.lat - 60.49) < 0.05, `Latitude ${vyborg.lat} should be close to 60.49`);
  assert.ok(Math.abs(vyborg.lon - 28.58) < 0.05, `Longitude ${vyborg.lon} should be close to 28.58`);
  console.log('  ✔ Test 2 passed!');

  // Test 3: Non-existent or dummy object returns null without crashing
  console.log('  Test 3: fetchCoordsFromRusoir with non-existent query');
  const dummy = await fetchCoordsFromRusoir('НесуществующийОбъект1234567890XYZ', 'Регион');
  assert.strictEqual(dummy, null, 'Dummy query should resolve to null');
  console.log('  ✔ Test 3 passed!');

  console.log('🎉 All RusOIR integration tests passed successfully!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

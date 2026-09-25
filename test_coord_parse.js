import { parseCoordinatePair } from './src/webapp/src/services/ooptUtils.js';

const tests = [
  '55.8821, 37.7812',
  '55.8821,37.7812',
  '55.8821 37.7812',
  '55.8821; 37.7812',
  '55.8821345, 37.7812789',
  '55,8821 37,7812',
  '55,8821; 37,7812',
  '[55.8821, 37.7812]',
  'https://yandex.ru/maps/?pt=37.7812,55.8821',
  '55°52\'30"N 37°46\'10"E'
];

for (const t of tests) {
  const res = parseCoordinatePair(t);
  console.log(t, '=>', res);
  if (!res || !res.lat || !res.lon) {
    console.error('FAILED TEST:', t);
    process.exit(1);
  }
}

console.log('✅ ALL COORDINATE PARSE TESTS PASSED!');

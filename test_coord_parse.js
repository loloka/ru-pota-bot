import { parseCoordinatePair } from './src/webapp/src/services/ooptUtils.js';

// Exact zero-backslash function used in admin.js template literal
function adminParseCoordString(text) {
  if (!text || typeof text !== 'string') return null;
  var s = text.trim();
  var ptMatch = s.match(/[?&]pt=([0-9.]+),([0-9.]+)/);
  if (ptMatch) {
    var lat = Number(parseFloat(ptMatch[2]).toFixed(4));
    var lon = Number(parseFloat(ptMatch[1]).toFixed(4));
    if (!isNaN(lat) && !isNaN(lon)) return { lat: lat, lon: lon };
  }
  var dmsMatch = s.match(/([0-9]+)[^0-9]+([0-9]+)[^0-9]+([0-9.]+)[ "]*([NSns])[^0-9]+([0-9]+)[^0-9]+([0-9]+)[^0-9]+([0-9.]+)[ "]*([EWew])/);
  if (dmsMatch) {
    var latDms = parseInt(dmsMatch[1], 10) + parseInt(dmsMatch[2], 10)/60 + parseFloat(dmsMatch[3])/3600;
    if (dmsMatch[4].toUpperCase() === 'S') latDms = -latDms;
    var lonDms = parseInt(dmsMatch[5], 10) + parseInt(dmsMatch[6], 10)/60 + parseFloat(dmsMatch[7])/3600;
    if (dmsMatch[8].toUpperCase() === 'W') lonDms = -lonDms;
    return { lat: Number(latDms.toFixed(4)), lon: Number(lonDms.toFixed(4)) };
  }
  if (/^[0-9]+,[0-9]+[ \t;]+[0-9]+,[0-9]+$/.test(s)) {
    var commaParts = s.split(/[ \t;]+/);
    var cLat = parseFloat(commaParts[0].replace(',', '.'));
    var cLon = parseFloat(commaParts[1].replace(',', '.'));
    if (!isNaN(cLat) && !isNaN(cLon)) return { lat: Number(cLat.toFixed(4)), lon: Number(cLon.toFixed(4)) };
  }
  var clean = s.replace(/,/g, ' ');
  var nums = clean.match(/[-+]?[0-9]+(?:[.][0-9]+)?/g);
  if (nums && nums.length >= 2) {
    var n1 = parseFloat(nums[0]);
    var n2 = parseFloat(nums[1]);
    if (!isNaN(n1) && !isNaN(n2)) {
      return { lat: Number(n1.toFixed(4)), lon: Number(n2.toFixed(4)) };
    }
  }
  return null;
}

const tests = [
  '55.8821, 37.7812',
  '56.452771, 45.3898',
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
  const res1 = parseCoordinatePair(t);
  const res2 = adminParseCoordString(t);
  console.log(t, '=> ooptUtils:', res1, '| admin.js:', res2);
  if (!res1 || !res1.lat || !res1.lon || !res2 || !res2.lat || !res2.lon) {
    console.error('FAILED TEST:', t);
    process.exit(1);
  }
}

console.log('✅ ALL COORDINATE PARSE TESTS PASSED!');

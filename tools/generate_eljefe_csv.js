import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../src/db/database.js';
import { parseOoptForSubmitter } from '../src/webapp/src/services/ooptUtils.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Query 10 verified, high-quality, active regional reserves in European Russia (Yaroslavl & Vologda)
const restricted = "ate NOT LIKE '%Крым%' AND ate NOT LIKE '%Севастополь%' AND ate NOT LIKE '%Донецк%' AND ate NOT LIKE '%Луганск%' AND ate NOT LIKE '%Запорож%' AND ate NOT LIKE '%Херсон%'";

const rows = db.prepare(`
  SELECT nid, title, category, sig, sig_display, status, ate, rf_subjects, lat, lon, area, rusoir_url
  FROM oopt_registry
  WHERE pota_ref IS NULL 
    AND lat IS NOT NULL AND lat != 0 
    AND lon IS NOT NULL AND lon != 0
    AND LOWER(status) = 'действующий' 
    AND category LIKE '%заказник%'
    AND ${restricted}
    AND (ate LIKE '%Яросл%' OR ate LIKE '%Волог%')
  ORDER BY nid ASC
  LIMIT 10
`).all();

function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const str = String(val).replace(/[\r\n]+/g, ' ').trim();
  if (str.includes(',') || str.includes('"') || str.includes(';') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const headers = [
  'reference',
  'name',
  'parktype',
  'program',
  'locations',
  'latitude',
  'longitude',
  'website',
  'comments',
  'accessMethods',
  'activationMethods',
  'active'
];

const lines = [headers.join(',')];

for (const r of rows) {
  const p = parseOoptForSubmitter(r);

  // In El Jefe, program name must NOT have "(RU)" suffix
  let program = p.dxEntity || 'European Russia';
  program = program.replace(/\s*\(RU\)\s*$/, '').trim();

  const record = [
    '', // reference is empty for new parks!
    escapeCsv(p.name), // Russian name per official request!
    escapeCsv(p.statusEn || 'State Natural Reserve'),
    escapeCsv(program),
    escapeCsv(p.locationCode),
    p.lat,
    p.lon,
    escapeCsv(p.site),
    escapeCsv(p.clarification || (r.area ? `Площадь: ${Number(r.area).toLocaleString('ru-RU')} га` : '')),
    'Automobile;Foot;Other',
    'Automobile;Campground;Other;Pedestrian',
    '1'
  ];

  lines.push(record.join(','));
}

const csvContent = lines.join('\n');

// Write to docs, dist/webapp, and root
fs.writeFileSync(path.join(rootDir, 'docs', 'pota_bulk_test_WD4DAN.csv'), csvContent, 'utf8');
fs.writeFileSync(path.join(rootDir, 'dist', 'webapp', 'pota_bulk_test_WD4DAN.csv'), csvContent, 'utf8');
fs.writeFileSync(path.join(rootDir, 'pota_bulk_test_WD4DAN.csv'), csvContent, 'utf8');

console.log('✅ Generated pota_bulk_test_WD4DAN.csv successfully:');
console.log(csvContent);

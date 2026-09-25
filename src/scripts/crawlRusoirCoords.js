#!/usr/bin/env node
/**
 * RusOIR Coordinate Crawler
 * Background tool to populate missing coordinates for Russian Protected Areas
 * using rusoir.com API and grounds catalog.
 *
 * Usage:
 *   node src/scripts/crawlRusoirCoords.js [--limit 50] [--region "Карелия"] [--delay 400]
 */

import db from '../db/database.js';
import { fetchCoordsFromRusoir } from '../services/ooptService.js';

const args = process.argv.slice(2);

function getArgValue(name, defaultValue) {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return defaultValue;
}

const limitArg = getArgValue('--limit', '50');
const limit = limitArg === 'all' ? 999999 : (parseInt(limitArg, 10) || 50);
const regionFilter = getArgValue('--region', '');
const delayMs = parseInt(getArgValue('--delay', '400'), 10) || 400;
const dryRun = args.includes('--dry-run');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('🌲 [RusOIR Crawler] Initializing Protected Areas Coordinate Crawler...');
  console.log(`⚙️  Configuration: Limit=${limit}, Delay=${delayMs}ms, Region="${regionFilter || 'All'}", DryRun=${dryRun}`);

  const whereConditions = ['(lat IS NULL OR lat = 0)'];
  const params = [];

  if (regionFilter) {
    whereConditions.push('ate LIKE ?');
    params.push(`%${regionFilter}%`);
  }

  const query = `
    SELECT nid, title, category, ate, sig
    FROM oopt_registry
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY (CASE sig WHEN 'federal' THEN 1 WHEN 'regional' THEN 2 ELSE 3 END), nid ASC
    LIMIT ?
  `;
  params.push(limit);

  const candidates = db.prepare(query).all(...params);
  console.log(`📋 Found ${candidates.length} records needing coordinates.`);

  if (candidates.length === 0) {
    console.log('✅ No records need coordinate enrichment. All done!');
    return;
  }

  let resolvedCount = 0;
  let skippedCount = 0;
  const updateStmt = db.prepare(`
    UPDATE oopt_registry 
    SET lat = ?, lon = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE nid = ?
  `);

  const startTime = Date.now();

  for (let i = 0; i < candidates.length; i++) {
    const item = candidates[i];
    const prefix = `[${i + 1}/${candidates.length}] NID ${item.nid}: "${item.title}"`;

    try {
      const res = await fetchCoordsFromRusoir(item.title, item.ate, item.category);

      if (res && res.lat && res.lon) {
        resolvedCount++;
        if (!dryRun) {
          updateStmt.run(res.lat, res.lon, item.nid);
        }
        console.log(`  \x1b[32m✔\x1b[0m ${prefix} -> \x1b[1m${res.lat}, ${res.lon}\x1b[0m (${res.groundName})`);
      } else {
        skippedCount++;
        console.log(`  \x1b[90m✖ ${prefix} -> not found on RusOIR\x1b[0m`);
      }
    } catch (err) {
      skippedCount++;
      console.warn(`  \x1b[33m⚠ ${prefix} -> error: ${err.message}\x1b[0m`);
    }

    if (i < candidates.length - 1) {
      await sleep(delayMs);
    }
  }

  const totalInDbWithCoords = db.prepare('SELECT COUNT(*) as count FROM oopt_registry WHERE lat IS NOT NULL AND lat != 0').get()?.count || 0;
  const totalInDb = db.prepare('SELECT COUNT(*) as count FROM oopt_registry').get()?.count || 0;
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n======================================================');
  console.log(`🏁 [RusOIR Crawler] Finished in ${durationSec}s!`);
  console.log(`   Checked: ${candidates.length} records`);
  console.log(`   Resolved: \x1b[32m${resolvedCount}\x1b[0m`);
  console.log(`   Not found: \x1b[90m${skippedCount}\x1b[0m`);
  console.log(`   Coverage in DB: ${totalInDbWithCoords} / ${totalInDb} (${((totalInDbWithCoords / totalInDb) * 100).toFixed(1)}%)`);
  console.log('======================================================\n');
}

run().catch((err) => {
  console.error('Fatal crawler error:', err);
  process.exit(1);
});

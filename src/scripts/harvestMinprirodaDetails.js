#!/usr/bin/env node
/**
 * RU-POTA Minpriroda Protected Areas Details Harvester
 *
 * Background gentle scraper to enrich local SQLite database (oopt_registry)
 * with coordinates (lat/lon), bounding boxes (bbox), profiles and rf_subjects
 * from official Minpriroda portal (карта.оцзк.рф / api.oopt).
 *
 * Usage:
 *   node src/scripts/harvestMinprirodaDetails.js [--delay 35000] [--limit 50] [--region "Московская"]
 *   node src/scripts/harvestMinprirodaDetails.js --status
 *   node src/scripts/harvestMinprirodaDetails.js --delay 20000 --pota-only
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import db from '../db/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OOPT_BASE_URL = 'https://xn--80aa2azak.xn--g1agk6a.xn--p1ai'; // карта.оцзк.рф
const FALLBACK_OOPT_GZ_PATH = path.resolve(__dirname, '../data/oopt_fallback.json.gz');
const BACKUP_JSON_PATH = path.resolve('data/oopt_registry_backup.json');

const args = process.argv.slice(2);

function getArgValue(name, defaultValue) {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
    return args[idx + 1];
  }
  return defaultValue;
}

const statusOnly = args.includes('--status');
const potaOnly = args.includes('--pota-only');
const dryRun = args.includes('--dry-run');
const limitArg = getArgValue('--limit', 'all');
const limit = limitArg === 'all' ? 999999 : (parseInt(limitArg, 10) || 50);
const regionFilter = getArgValue('--region', '');
const isSlow = args.includes('--slow');
const delayMs = parseInt(getArgValue('--delay', isSlow ? '35000' : '400'), 10);

import https from 'https';

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  timeout: 25000,
});

const client = axios.create({
  baseURL: OOPT_BASE_URL,
  timeout: 25000,
  proxy: false,
  httpsAgent,
  headers: {
    'User-Agent': 'RU-POTA-Bot/1.16.95 (Telegram Bot; Node.js)',
    'Accept': 'application/json',
  },
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCardWithRetry(nid, maxRetries = 2) {
  let lastErr = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await client.get(`/api/v1/oopt/${nid}/`);
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      if (status === 404 || status === 429 || status === 503) {
        throw err; // Handled specially in outer loop
      }
      if (attempt < maxRetries) {
        await sleep(2500);
      }
    }
  }
  throw lastErr;
}

function getDatabaseStats() {
  const total = db.prepare('SELECT COUNT(*) c FROM oopt_registry').get()?.c || 0;
  const fetched = db.prepare('SELECT COUNT(*) c FROM oopt_registry WHERE details_fetched_at IS NOT NULL').get()?.c || 0;
  const withCoords = db.prepare('SELECT COUNT(*) c FROM oopt_registry WHERE lat IS NOT NULL AND lon IS NOT NULL').get()?.c || 0;
  const withBbox = db.prepare('SELECT COUNT(*) c FROM oopt_registry WHERE bbox IS NOT NULL').get()?.c || 0;
  const remaining = total - fetched;
  return { total, fetched, withCoords, withBbox, remaining };
}

function printStatsSummary(stats) {
  const percentFetched = stats.total > 0 ? ((stats.fetched / stats.total) * 100).toFixed(1) : '0';
  const percentCoords = stats.total > 0 ? ((stats.withCoords / stats.total) * 100).toFixed(1) : '0';
  console.log('\n======================================================');
  console.log('📊 \x1b[1mТекущее состояние базы ООПТ РФ (SQLite):\x1b[0m');
  console.log(`   Всего объектов в реестре: \x1b[36m${stats.total.toLocaleString('ru-RU')}\x1b[0m`);
  console.log(`   Деталей выгружено:        \x1b[32m${stats.fetched.toLocaleString('ru-RU')}\x1b[0m (${percentFetched}%)`);
  console.log(`   С координатами центроида: \x1b[32m${stats.withCoords.toLocaleString('ru-RU')}\x1b[0m (${percentCoords}%)`);
  console.log(`   С полигонами/bbox границ: \x1b[32m${stats.withBbox.toLocaleString('ru-RU')}\x1b[0m`);
  console.log(`   Осталось выгрузить:       \x1b[33m${stats.remaining.toLocaleString('ru-RU')}\x1b[0m`);
  console.log('======================================================\n');
}

function dumpBackupFiles() {
  try {
    const allRows = db.prepare(`
      SELECT nid, title, sig, sig_display, status, category, agency, ate, start_date,
             area, area_aquatory, area_protection_zone, lat, lon, bbox, profile, rf_subjects,
             pota_ref, pota_name, nested_oopt, rusoir_url, rusoir_name, cluster_count, clusters,
             details_fetched_at, updated_at
      FROM oopt_registry
    `).all();

    const dataObj = { rows: allRows, exported_at: new Date().toISOString() };
    const jsonStr = JSON.stringify(dataObj, null, 2);

    const backupDir = path.resolve('data');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    fs.writeFileSync(BACKUP_JSON_PATH, jsonStr, 'utf8');
    fs.writeFileSync(FALLBACK_OOPT_GZ_PATH, zlib.gzipSync(Buffer.from(jsonStr)), 'utf8');
    console.log(`  💾 \x1b[90mОфлайн-бэкап синхронизирован (${allRows.length} записей -> ${BACKUP_JSON_PATH})\x1b[0m`);
  } catch (err) {
    console.warn(`  ⚠️ Не удалось сохранить файл бэкапа: ${err.message}`);
  }
}

let isShuttingDown = false;

async function run() {
  console.log('\x1b[32m======================================================\x1b[0m');
  console.log('\x1b[32m🌲 RU-POTA Minpriroda Details Harvester\x1b[0m');
  console.log('\x1b[32m======================================================\x1b[0m');

  const initialStats = getDatabaseStats();
  printStatsSummary(initialStats);

  if (statusOnly) {
    process.exit(0);
  }

  // Graceful shutdown on Ctrl+C or kill
  process.on('SIGINT', () => {
    if (isShuttingDown) {
      console.log('\nПринудительный выход...');
      process.exit(1);
    }
    console.log('\n\x1b[33mПолучен сигнал остановки (SIGINT). Аккуратно завершаем текущий шаг...\x1b[0m');
    isShuttingDown = true;
  });

  const whereConditions = ['details_fetched_at IS NULL'];
  const params = [];

  if (potaOnly) {
    whereConditions.push('pota_ref IS NOT NULL');
  }

  if (regionFilter) {
    whereConditions.push('ate LIKE ?');
    params.push(`%${regionFilter}%`);
  }

  const query = `
    SELECT nid, title, category, ate, sig, pota_ref
    FROM oopt_registry
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY 
      (CASE 
        WHEN pota_ref IS NOT NULL THEN 1 
        WHEN sig = 'federal' THEN 2 
        WHEN sig = 'regional' THEN 3 
        ELSE 4 
      END),
      nid ASC
    LIMIT ?
  `;
  params.push(limit);

  const candidates = db.prepare(query).all(...params);
  console.log(`🎯 Отобрано кандидатов в очередь: \x1b[1m${candidates.length}\x1b[0m записей.`);
  console.log(`⚙️  Параметры: интервал = \x1b[36m${(delayMs / 1000).toFixed(1)} сек\x1b[0m (~${(60000 / delayMs).toFixed(1)} зап/мин), dryRun = ${dryRun}\n`);

  if (candidates.length === 0) {
    console.log('✅ Нет объектов, требующих выгрузки деталей. Все записи уже синхронизированы!');
    return;
  }

  let enrichedCount = 0;
  let noCoordsCount = 0;
  let errorsCount = 0;

  const updateSuccessStmt = db.prepare(`
    UPDATE oopt_registry 
    SET lat = ?, lon = ?, bbox = ?, profile = ?, rf_subjects = ?, details_fetched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE nid = ?
  `);

  const updateMarkEmptyStmt = db.prepare(`
    UPDATE oopt_registry 
    SET details_fetched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE nid = ?
  `);

  const startTime = Date.now();

  for (let i = 0; i < candidates.length; i++) {
    if (isShuttingDown) break;

    const item = candidates[i];
    const processed = i + 1;
    const percent = ((processed / candidates.length) * 100).toFixed(1);
    const elapsedMs = Date.now() - startTime;
    const avgMs = elapsedMs / processed;
    const remSec = Math.round(((candidates.length - processed) * avgMs) / 1000);
    const remH = Math.floor(remSec / 3600);
    const remM = Math.floor((remSec % 3600) / 60);
    const etaStr = remH > 0 ? `${remH}ч ${remM}м` : `${remM}м`;
    const prefix = `[${processed}/${candidates.length} | ${percent}% | ETA ~${etaStr}] NID ${item.nid} (${item.pota_ref || item.sig || 'oopt'}): "${item.title}"`;
    const t0 = Date.now();

    try {
      const res = await fetchCardWithRetry(item.nid);
      const ext = res.data;
      const duration = Date.now() - t0;

      if (ext) {
        let lat = null;
        let lon = null;
        if (Array.isArray(ext.center) && ext.center.length === 2) {
          lon = Number(ext.center[0]) || null;
          lat = Number(ext.center[1]) || null;
        }

        const bboxStr = ext.bbox ? JSON.stringify(ext.bbox) : null;
        const rfSubjStr = ext.rf_subjects ? ext.rf_subjects.join(', ') : null;
        const profile = ext.profile || null;

        if (!dryRun) {
          updateSuccessStmt.run(lat, lon, bboxStr, profile, rfSubjStr, item.nid);
        }

        if (lat !== null && lon !== null) {
          enrichedCount++;
          console.log(`  \x1b[32m✔\x1b[0m ${prefix} -> \x1b[1m${lat.toFixed(5)}, ${lon.toFixed(5)}\x1b[0m ${bboxStr ? '[bbox]' : ''} (${duration}ms)`);
        } else {
          noCoordsCount++;
          console.log(`  \x1b[33m○\x1b[0m ${prefix} -> карточка есть, но координат нет (${duration}ms)`);
        }
      } else {
        if (!dryRun) updateMarkEmptyStmt.run(item.nid);
        noCoordsCount++;
        console.log(`  \x1b[90m✖ ${prefix} -> пустой ответ\x1b[0m`);
      }
    } catch (err) {
      errorsCount++;
      const status = err.response?.status;
      if (status === 404) {
        console.log(`  \x1b[90m✖ ${prefix} -> 404 Not Found на Минприроды (помечен обработанным)\x1b[0m`);
        if (!dryRun) updateMarkEmptyStmt.run(item.nid);
      } else if (status === 429 || status === 503) {
        console.warn(`  \x1b[31m⛔ ${prefix} -> HTTP ${status} (сервер перегружен / rate limit). Пауза 180 сек...\x1b[0m`);
        if (!isShuttingDown) await sleep(180000);
      } else {
        console.warn(`  \x1b[33m⚠ ${prefix} -> сетевая ошибка: ${err.message}\x1b[0m`);
      }
    }

    // Dump periodic backup every 150 enriched items
    if (!dryRun && (enrichedCount + noCoordsCount) > 0 && (enrichedCount + noCoordsCount) % 150 === 0) {
      dumpBackupFiles();
    }

    // Sleep before next request
    if (i < candidates.length - 1 && !isShuttingDown) {
      await sleep(delayMs);
    }
  }

  if (!dryRun && (enrichedCount + noCoordsCount) > 0) {
    dumpBackupFiles();
  }

  const finalStats = getDatabaseStats();
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n======================================================');
  console.log(`🏁 \x1b[1mHarvester завершил работу за ${elapsedSec}s\x1b[0m`);
  console.log(`   Успешно выгружено с координатами: \x1b[32m${enrichedCount}\x1b[0m`);
  console.log(`   Без координат в карточке:          \x1b[33m${noCoordsCount}\x1b[0m`);
  console.log(`   Ошибок сети / таймаутов:          \x1b[31m${errorsCount}\x1b[0m`);
  printStatsSummary(finalStats);
}

run().catch((err) => {
  console.error('Fatal Harvester Error:', err);
  process.exit(1);
});

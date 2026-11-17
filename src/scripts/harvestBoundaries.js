#!/usr/bin/env node
/**
 * RU-POTA Boundaries Harvester
 *
 * Background gentle scraper to enrich local SQLite database (oopt_boundaries)
 * with official GeoJSON polygons from Minpriroda GeoServer proxy.
 *
 * Usage:
 *   node src/scripts/harvestBoundaries.js --status
 *   node src/scripts/harvestBoundaries.js [--delay 2500] [--limit 100]
 */

import db from '../db/database.js';
import { getOoptBoundary } from '../services/ooptService.js';

const args = process.argv.slice(2);

function getArgValue(name, defaultValue) {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
    return args[idx + 1];
  }
  return defaultValue;
}

const statusOnly = args.includes('--status');
const allOopt = args.includes('--all-oopt') || args.includes('--all');
const limitArg = getArgValue('--limit', 'all');
const limit = limitArg === 'all' ? 999999 : (parseInt(limitArg, 10) || 100);
const delayMs = parseInt(getArgValue('--delay', '1200'), 10);
const maxConsecutiveErrors = parseInt(getArgValue('--max-errors', '10'), 10);

let isShuttingDown = false;
process.on('SIGINT', () => {
  console.log('\n[Harvester] 🛑 Получен сигнал остановки, завершаем текущий запрос...');
  isShuttingDown = true;
});
process.on('SIGTERM', () => {
  isShuttingDown = true;
});

async function main() {
  console.log('====================================================');
  console.log('🌲 RU-POTA ООПТ Векторные Границы Harvester');
  console.log('====================================================');

  const totalOopt = db.prepare('SELECT count(*) as c FROM oopt_registry').get().c;
  const potaParks = db.prepare('SELECT count(*) as c FROM oopt_registry WHERE pota_ref IS NOT NULL').get().c;
  const cachedBoundaries = db.prepare('SELECT count(*) as c FROM oopt_boundaries WHERE geometry IS NOT NULL').get().c;

  console.log(`📊 Статус базы:`);
  console.log(`  • Всего ООПТ в реестре: ${totalOopt}`);
  console.log(`  • Привязано к POTA:     ${potaParks}`);
  console.log(`  • Скачано полигонов:    ${cachedBoundaries} (${((cachedBoundaries / potaParks) * 100).toFixed(1)}% от POTA)`);

  if (statusOnly) {
    process.exit(0);
  }

  // Find candidate parks that have not been checked yet
  const whereClause = allOopt ? 'WHERE b.nid IS NULL' : 'WHERE r.pota_ref IS NOT NULL AND b.nid IS NULL';
  const candidates = db.prepare(`
    SELECT r.nid, r.title, r.pota_ref
    FROM oopt_registry r
    LEFT JOIN oopt_boundaries b ON b.nid = r.nid
    ${whereClause}
    ORDER BY r.pota_ref ASC, r.nid ASC
    LIMIT ?
  `).all(limit);

  console.log(`\n🎯 Найдено кандидатов для выкачки: ${candidates.length} (лимит: ${limit}, задержка: ${delayMs}мс, режим: ${allOopt ? 'ВСЕ ООПТ РФ' : 'Парки POTA'})`);

  if (candidates.length === 0) {
    console.log('✨ Все доступные полигоны POTA уже выкачаны в локальную базу!');
    process.exit(0);
  }

  let successCount = 0;
  let emptyCount = 0;
  let consecutiveErrors = 0;

  for (let i = 0; i < candidates.length; i++) {
    if (isShuttingDown) break;

    const item = candidates[i];
    const prefix = `[${i + 1}/${candidates.length}] ${item.pota_ref || 'OOPT'} (NID ${item.nid}) "${item.title}"`;

    try {
      const res = await getOoptBoundary(item.nid);

      if (res && res.hasBoundary && res.geometry) {
        successCount++;
        consecutiveErrors = 0;
        console.log(`  ✅ ${prefix} -> Сохранён официальный полигон (${res.geometry.type})`);
      } else if (res && res.isServiceUnavailable) {
        consecutiveErrors++;
        console.log(`  ⚠️ ${prefix} -> Сервер Минприроды временно недоступен (ошибка ${consecutiveErrors}/${maxConsecutiveErrors})`);
        await new Promise(r => setTimeout(r, 4000));
      } else {
        emptyCount++;
        consecutiveErrors = 0;
        console.log(`  ℹ️ ${prefix} -> Точечный объект (полигон отсутствует)`);
      }

      if (consecutiveErrors >= maxConsecutiveErrors) {
        console.log(`\n🛑 Обнаружено ${consecutiveErrors} последовательных сбоев соединения с Минприродой.`);
        console.log(`   Сервер Минприроды карта.оцзк.рф временно отключен или блокирует запросы.`);
        console.log(`   Приостанавливаем сборщик.`);
        break;
      }

      if ((i + 1) % 50 === 0) {
        const currentSaved = db.prepare('SELECT count(*) as c FROM oopt_boundaries WHERE geometry IS NOT NULL').get().c;
        console.log(`\n--- [Прогресс: ${i + 1}/${candidates.length}] Скачано в сессии: ${successCount}, Всего полигонов в БД: ${currentSaved} ---\n`);
      }

      if (i < candidates.length - 1 && !isShuttingDown) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    } catch (err) {
      consecutiveErrors++;
      console.warn(`  ❌ ${prefix} -> Ошибка: ${err.message} (${consecutiveErrors}/${maxConsecutiveErrors})`);
      if (consecutiveErrors >= maxConsecutiveErrors) {
        console.log(`\n🛑 Сервер Минприроды недоступен (${consecutiveErrors} ошибок подряд). Завершаем сессию.`);
        break;
      }
      await new Promise(r => setTimeout(r, 4000));
    }
  }

  console.log('\n====================================================');
  console.log(`🏁 Результаты сессии:`);
  console.log(`  • Успешно скачано: ${successCount}`);
  console.log(`  • Точечных объектов: ${emptyCount}`);
  console.log('====================================================');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

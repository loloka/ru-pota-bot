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
const limitArg = getArgValue('--limit', 'all');
const limit = limitArg === 'all' ? 999999 : (parseInt(limitArg, 10) || 100);
const delayMs = parseInt(getArgValue('--delay', '2500'), 10);

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

  // Find candidate parks that do not have detailed vector geometry yet
  const candidates = db.prepare(`
    SELECT r.nid, r.title, r.pota_ref
    FROM oopt_registry r
    LEFT JOIN oopt_boundaries b ON b.nid = r.nid
    WHERE r.pota_ref IS NOT NULL 
      AND (b.geometry IS NULL OR b.has_boundary IS NULL)
    ORDER BY r.pota_ref ASC
    LIMIT ?
  `).all(limit);

  console.log(`\n🎯 Найдено кандидатов для выкачки: ${candidates.length} (лимит: ${limit}, задержка: ${delayMs}мс)`);

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
    const prefix = `[${i + 1}/${candidates.length}] ${item.pota_ref} (NID ${item.nid}) "${item.title}"`;

    try {
      const res = await getOoptBoundary(item.nid);

      if (res && res.hasBoundary && !res.isBboxFallback && res.geometry) {
        successCount++;
        consecutiveErrors = 0;
        console.log(`  ✅ ${prefix} -> Сохранён официальный полигон (${res.geometry.type})`);
      } else if (res && res.isBboxFallback) {
        consecutiveErrors++;
        console.log(`  ⚠️ ${prefix} -> Сервер Минприроды недоступен, сработал резервный BBox`);
      } else {
        emptyCount++;
        consecutiveErrors = 0;
        console.log(`  ℹ️ ${prefix} -> Точечный объект (полигон отсутствует)`);
      }

      if (consecutiveErrors >= 3) {
        console.log(`\n🛑 Обнаружено 3 последовательных сбоя соединения с Минприродой.`);
        console.log(`   Сервер Минприроды карта.оцзк.рф временно отключен или блокирует запросы.`);
        console.log(`   Приостанавливаем сборщик. На карте будет работать резервный контур BBox.`);
        break;
      }

      if (i < candidates.length - 1 && !isShuttingDown) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    } catch (err) {
      consecutiveErrors++;
      console.warn(`  ❌ ${prefix} -> Ошибка: ${err.message}`);
      if (consecutiveErrors >= 3) {
        console.log(`\n🛑 Сервер Минприроды недоступен (${consecutiveErrors} ошибок подряд). Завершаем сессию.`);
        break;
      }
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

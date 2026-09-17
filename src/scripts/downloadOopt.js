import { syncOoptRegistry, getOoptStats } from '../services/ooptService.js';
import db from '../db/database.js';

async function main() {
  console.log('========================================');
  console.log('🌲 RU-POTA ООПТ РФ Data Ingestion CLI');
  console.log('========================================');

  try {
    const result = await syncOoptRegistry();
    console.log(`\n🎉 Success! Synced ${result.count} records. Total in DB: ${result.total}`);

    const stats = getOoptStats();
    console.log('\n📊 Статистика реестра ООПТ:');
    console.log(`Всего объектов: ${stats.total.toLocaleString('ru-RU')}`);
    console.log(`- Федерального значения: ${stats.federal.toLocaleString('ru-RU')}`);
    console.log(`- Регионального значения: ${stats.regional.toLocaleString('ru-RU')}`);
    console.log(`- Местного значения: ${stats.local.toLocaleString('ru-RU')}`);

    console.log('\nТоп категорий:');
    for (const cat of stats.categories.slice(0, 10)) {
      console.log(`  • ${cat.category}: ${cat.count.toLocaleString('ru-RU')}`);
    }

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Fatal error during OOPT sync:', err);
    process.exit(1);
  }
}

main();

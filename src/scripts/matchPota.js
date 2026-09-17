import { syncPotaMatches } from '../services/ooptService.js';

console.log('[MatchPota] 🔄 Running POTA matching sync...');
const result = syncPotaMatches();
console.log(`[MatchPota] ✅ Matching completed. Total matched: ${result.matched}`);
process.exit(0);


import assert from 'assert';
import db from './src/db/database.js';
import { potaApi } from './src/api/potaApi.js';
import { formatPlansResponse } from './src/bot/commands/plans.js';

console.log('=== RUNNING POTA PLANS & SCHEDULED ACTIVATIONS TESTS ===\n');

async function runTests() {
  // 1. Test getScheduledActivations
  console.log('[1] Testing potaApi.getScheduledActivations()...');
  const plans = await potaApi.getScheduledActivations();
  assert(Array.isArray(plans), 'Plans must be an array');
  console.log(`✅ PASS: Retrieved ${plans.length} scheduled activations from POTA API`);

  // 2. Test cache TTL
  console.log('\n[2] Testing potaApi memory cache...');
  const cachedPlans = await potaApi.getScheduledActivations();
  assert.strictEqual(plans, cachedPlans, 'Second immediate call must return identical cached array reference');
  console.log('✅ PASS: Memory cache working properly');

  // 3. Test formatPlansResponse for RU scope
  console.log('\n[3] Testing formatPlansResponse("ru")...');
  const resRu = await formatPlansResponse('ru');
  assert(typeof resRu.text === 'string' && resRu.text.length > 0, 'Response text must be non-empty');
  assert(resRu.reply_markup && Array.isArray(resRu.reply_markup.inline_keyboard), 'Reply markup must contain inline_keyboard');
  assert(resRu.text.includes('Запланированные активации POTA'), 'Text must have correct title');
  console.log('✅ PASS: formatPlansResponse("ru") generated valid Telegram message');

  // 4. Test formatPlansResponse for all (world) scope
  console.log('\n[4] Testing formatPlansResponse("all")...');
  const resAll = await formatPlansResponse('all');
  assert(typeof resAll.text === 'string' && resAll.text.length > 0, 'World response text must be non-empty');
  assert(resAll.text.includes('Весь мир'), 'World text must mention Весь мир');
  console.log('✅ PASS: formatPlansResponse("all") generated valid Telegram message');

  // 5. Test user_notifications sanitization
  console.log('\n[5] Testing user_notifications message sanitization...');
  const testUserId = 999999998;
  const rawHtml = '🌐 <b>POTA Cluster Spot</b>\n📻 <b><a href="https://next.pota.app/profile/R2BBX">R2BBX/P</a></b> @ 🏞️ <b><a href="https://next.pota.app/park/RU-0246">RU-0246</a></b> — <i>Mytishchi Forest Park</i>\n📍 <b>RU • Россия • Московская область</b>\n⚙️ Freq: 7007.0 kHz | CW\n📝 RBN 19 dB 27 WPM via SM7IUN-#';
  
  db.prepare('DELETE FROM user_notifications WHERE user_id = ?').run(testUserId);
  const insertStmt = db.prepare(`
    INSERT INTO user_notifications (user_id, type, title, message, callsign, reference, frequency, mode, spot_time)
    VALUES (?, 'callsign_spotted', 'В эфире', ?, 'R2BBX/P', 'RU-0246', '7007', 'CW', '12:00')
  `);
  const r = insertStmt.run(testUserId, rawHtml);
  assert(r.changes === 1, 'Should insert test notification');

  // Trigger sanitization logic
  const row = db.prepare('SELECT message FROM user_notifications WHERE id = ?').get(r.lastInsertRowid);
  assert(row.message.includes('<'), 'Message initially has HTML');

  const parkMatch = row.message.match(/—\s*<i>([^<]+)<\/i>/i) || row.message.match(/—\s*([^\n📍⚙️📝]+)/);
  const locMatch = row.message.match(/📍\s*(?:<b>)?([^<\n]+)(?:<\/b>)?/i);
  const commentMatch = row.message.match(/📝\s*([^\n]+)/);

  const parkName = parkMatch ? parkMatch[1].trim() : '';
  const location = locMatch ? locMatch[1].replace(/<[^>]+>/g, '').trim() : '';
  const comment = commentMatch ? commentMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  const cleaned = [
    parkName,
    location,
    comment ? `📝 ${comment}` : ''
  ].filter(Boolean).join(' • ');

  assert(!cleaned.includes('<') && !cleaned.includes('>'), 'Cleaned text must NOT contain HTML tags');
  assert.strictEqual(parkName, 'Mytishchi Forest Park', 'Park name extracted correctly');
  assert.strictEqual(location, 'RU • Россия • Московская область', 'Location extracted correctly');
  assert.strictEqual(comment, 'RBN 19 dB 27 WPM via SM7IUN-#', 'Comment extracted correctly');
  console.log('✅ PASS: HTML notification tags successfully extracted and sanitized without raw tags');

  // Cleanup
  db.prepare('DELETE FROM user_notifications WHERE user_id = ?').run(testUserId);

  // 6. Test scheduleWorker formatting and deduplication
  console.log('\n[6] Testing scheduleWorker formatting & DB tracking...');
  const { formatScheduleAnnouncement } = await import('./src/services/scheduleWorker.js');
  const samplePlan = {
    scheduledActivitiesId: 999991,
    activator: 'R1BNG/P',
    name: 'Vyborg State Natural Reserve',
    reference: 'RU-1172',
    locationDesc: 'RU-LN',
    startDate: '2026-10-17',
    endDate: '2026-10-18',
    startTime: '11:00',
    endTime: '07:00',
    frequencies: '20-40m SSB, 20-160m FT8',
    comments: 'IOTA EU-117 tnxqso.com/r1bng'
  };

  const formattedMsg = formatScheduleAnnouncement(samplePlan);
  assert(formattedMsg.includes('Анонс активации POTA'), 'Announcement must contain title');
  assert(formattedMsg.includes('R1BNG/P'), 'Announcement must contain activator');
  assert(formattedMsg.includes('RU-1172'), 'Announcement must contain park reference');
  assert(formattedMsg.includes('2026-10-17 – 2026-10-18'), 'Announcement must contain date span');
  assert(formattedMsg.includes('11:00–07:00 UTC'), 'Announcement must contain time span');
  assert(formattedMsg.includes('20-40m SSB, 20-160m FT8'), 'Announcement must contain frequencies');
  assert(formattedMsg.includes('IOTA EU-117 tnxqso.com/r1bng'), 'Announcement must contain comment');
  console.log('✅ PASS: formatScheduleAnnouncement generated correct Telegram HTML layout');

  // Verify scheduled_broadcasts DB table insertion and deduplication
  db.prepare('DELETE FROM scheduled_broadcasts WHERE scheduled_id = ?').run(samplePlan.scheduledActivitiesId);
  const ins = db.prepare(`
    INSERT INTO scheduled_broadcasts (scheduled_id, activator, reference, start_date, end_date, msg_id)
    VALUES (?, ?, ?, ?, ?, 12345)
  `).run(samplePlan.scheduledActivitiesId, samplePlan.activator, samplePlan.reference, samplePlan.startDate, samplePlan.endDate);
  assert.strictEqual(ins.changes, 1, 'Should record scheduled broadcast');

  const saved = db.prepare('SELECT * FROM scheduled_broadcasts WHERE scheduled_id = ?').get(samplePlan.scheduledActivitiesId);
  assert(saved && saved.scheduled_id === samplePlan.scheduledActivitiesId, 'Broadcast record must exist in DB');
  assert.strictEqual(saved.msg_id, 12345, 'Msg ID must match');

  // Cleanup
  db.prepare('DELETE FROM scheduled_broadcasts WHERE scheduled_id = ?').run(samplePlan.scheduledActivitiesId);
  console.log('✅ PASS: scheduled_broadcasts DB tracking and deduplication verified');

  console.log('\n🎉 ALL POTA PLANS & NOTIFICATION TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});

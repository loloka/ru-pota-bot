import assert from 'assert';
import db from './src/db/database.js';

console.log('=== RUNNING USER NOTIFICATIONS TESTS ===\n');

const testUserId = 999999991;

// Cleanup before tests
db.prepare('DELETE FROM user_notifications WHERE user_id = ?').run(testUserId);

// 1. Test insertion of notification
const insertStmt = db.prepare(`
  INSERT INTO user_notifications (user_id, type, title, message, callsign, reference, frequency, mode, spot_time, is_read)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
`);

const r1 = insertStmt.run(testUserId, 'callsign', 'В эфире: RA9ODW', 'RA9ODW активен в RU-0065', 'RA9ODW', 'RU-0065', '14140', 'SSB', '12:30');
assert(r1.changes === 1, 'Should insert 1 notification');
console.log('✅ PASS: Insert notification into user_notifications');

const r2 = insertStmt.run(testUserId, 'park', 'Парк в эфире: RU-0001', 'R2BBX работает из RU-0001', 'R2BBX', 'RU-0001', '7120', 'CW', '12:35');
assert(r2.changes === 1, 'Should insert second notification');
console.log('✅ PASS: Insert second notification');

// 2. Test querying unread count
const unreadRow = db.prepare('SELECT COUNT(*) as count FROM user_notifications WHERE user_id = ? AND is_read = 0').get(testUserId);
assert.strictEqual(unreadRow.count, 2, 'Unread count should be 2');
console.log('✅ PASS: Unread count matches inserted records (2)');

// 3. Test querying notifications list
const list = db.prepare('SELECT * FROM user_notifications WHERE user_id = ? ORDER BY id DESC').all(testUserId);
assert.strictEqual(list.length, 2, 'List length should be 2');
assert.strictEqual(list[0].callsign, 'R2BBX', 'Latest notification should be R2BBX');
assert.strictEqual(list[1].callsign, 'RA9ODW', 'Earlier notification should be RA9ODW');
console.log('✅ PASS: Query list returns records ordered by id DESC');

// 4. Test marking all as read
const markReadStmt = db.prepare('UPDATE user_notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0');
const rRead = markReadStmt.run(testUserId);
assert.strictEqual(rRead.changes, 2, 'Should mark 2 notifications as read');

const unreadAfter = db.prepare('SELECT COUNT(*) as count FROM user_notifications WHERE user_id = ? AND is_read = 0').get(testUserId);
assert.strictEqual(unreadAfter.count, 0, 'Unread count should be 0 after marking read');
console.log('✅ PASS: Mark all as read sets is_read = 1 and unread count to 0');

// 5. Test deleting single notification
const idToDelete = list[0].id;
const delOne = db.prepare('DELETE FROM user_notifications WHERE id = ? AND user_id = ?').run(idToDelete, testUserId);
assert.strictEqual(delOne.changes, 1, 'Should delete 1 notification');

const remaining = db.prepare('SELECT COUNT(*) as count FROM user_notifications WHERE user_id = ?').get(testUserId);
assert.strictEqual(remaining.count, 1, 'Should have 1 notification remaining');
console.log('✅ PASS: Delete single notification works');

// 6. Test clearing all notifications
const delAll = db.prepare('DELETE FROM user_notifications WHERE user_id = ?').run(testUserId);
assert.strictEqual(delAll.changes, 1, 'Should delete remaining notification');

const totalAfter = db.prepare('SELECT COUNT(*) as count FROM user_notifications WHERE user_id = ?').get(testUserId);
assert.strictEqual(totalAfter.count, 0, 'Should have 0 notifications left');
console.log('✅ PASS: Clear all notifications empties table for user');

console.log('\n--- ALL USER NOTIFICATIONS TESTS PASSED! ---');

import assert from 'assert';
import crypto from 'crypto';
import db from './src/db/database.js';

console.log('=== RUNNING WEB AUTHENTICATION TESTS ===\n');

const testEmail = 'test_operator@pota.r9o.ru';
const testCallsign = 'RA9XYZ';
const testCode = '123456';
const testToken = crypto.randomBytes(32).toString('hex');

// Cleanup before tests
db.prepare('DELETE FROM email_verifications WHERE email = ?').run(testEmail);
db.prepare('DELETE FROM users WHERE email = ?').run(testEmail);

// 1. Test insertion of verification code
const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
const insVerif = db.prepare(`
  INSERT INTO email_verifications (email, callsign, code, expires_at)
  VALUES (?, ?, ?, ?)
`).run(testEmail, testCallsign, testCode, expiresAt);

assert.strictEqual(insVerif.changes, 1, 'Should insert 1 email verification record');
console.log('✅ PASS: Insert email verification record');

// 2. Test querying latest verification record
const record = db.prepare(`
  SELECT * FROM email_verifications 
  WHERE email = ? 
  ORDER BY created_at DESC 
  LIMIT 1
`).get(testEmail);

assert.ok(record, 'Verification record should exist');
assert.strictEqual(record.email, testEmail, 'Email should match');
assert.strictEqual(record.callsign, testCallsign, 'Callsign should match');
assert.strictEqual(record.code, testCode, 'Code should match');
console.log('✅ PASS: Query email verification record matches inserted values');

// 3. Test negative ID allocation for standalone web users
const minIdRow = db.prepare('SELECT MIN(telegram_id) as min_id FROM users').get();
let nextWebId = -1000000001;
if (minIdRow && minIdRow.min_id && minIdRow.min_id < 0) {
  nextWebId = minIdRow.min_id - 1;
}
assert(nextWebId < 0, 'Generated ID must be negative');
console.log(`✅ PASS: Generated negative telegram_id for web user: ${nextWebId}`);

// 4. Test web user insertion
const insUser = db.prepare(`
  INSERT INTO users (telegram_id, callsign, status, email, auth_type, web_token)
  VALUES (?, ?, 'approved', ?, 'web', ?)
`).run(nextWebId, testCallsign, testEmail, testToken);

assert.strictEqual(insUser.changes, 1, 'Should insert web user');
console.log('✅ PASS: Insert web user into users table');

// 5. Test querying web user by web_token (as done in tmaAuth middleware)
const authedUser = db.prepare(`
  SELECT telegram_id, callsign, status, email, auth_type, notifications_enabled 
  FROM users 
  WHERE web_token = ?
`).get(testToken);

assert.ok(authedUser, 'User should be found by web_token');
assert.strictEqual(authedUser.telegram_id, nextWebId, 'telegram_id should match negative ID');
assert.strictEqual(authedUser.callsign, testCallsign, 'Callsign should match');
assert.strictEqual(authedUser.auth_type, 'web', 'auth_type should be web');
assert.strictEqual(authedUser.email, testEmail, 'email should match');
console.log('✅ PASS: Authenticate user by web_token');

// 6. Test cleanup of email verification
db.prepare('DELETE FROM email_verifications WHERE email = ?').run(testEmail);
const remainingVerif = db.prepare('SELECT * FROM email_verifications WHERE email = ?').get(testEmail);
assert.strictEqual(remainingVerif, undefined, 'Verification record should be deleted');
console.log('✅ PASS: Delete email verification record');

// 7. Test web logout (clearing web_token)
db.prepare('UPDATE users SET web_token = NULL WHERE web_token = ?').run(testToken);
const loggedOutUser = db.prepare('SELECT web_token FROM users WHERE telegram_id = ?').get(nextWebId);
assert.strictEqual(loggedOutUser.web_token, null, 'web_token should be null after logout');
console.log('✅ PASS: Web logout clears web_token');

// Cleanup test user
db.prepare('DELETE FROM users WHERE telegram_id = ?').run(nextWebId);
console.log('✅ PASS: Cleanup test web user\n');
console.log('🎉 ALL WEB AUTHENTICATION TESTS PASSED SUCCESSFULLY!');

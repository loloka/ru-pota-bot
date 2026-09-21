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

// 8. Test pure callsign validation (base callsign only, no slashes)
const pureCallsignRegex = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,5}$/;
const hasLetterRegex = /[A-Z]/;

function validateBaseCallsign(call) {
  if (!call) return false;
  const clean = String(call).trim().toUpperCase();
  if (clean.includes('/') || clean.includes('\\')) return false;
  return pureCallsignRegex.test(clean) && hasLetterRegex.test(clean);
}

// Valid base callsigns
assert.strictEqual(validateBaseCallsign('R9OGL'), true, 'R9OGL must be valid');
assert.strictEqual(validateBaseCallsign('RA9ODW'), true, 'RA9ODW must be valid');
assert.strictEqual(validateBaseCallsign('UB3AAA'), true, 'UB3AAA must be valid');
assert.strictEqual(validateBaseCallsign('W1AW'), true, 'W1AW must be valid');
assert.strictEqual(validateBaseCallsign('DL1ABC'), true, 'DL1ABC must be valid');

// Invalid: slashes must be rejected
assert.strictEqual(validateBaseCallsign('RA9ODW/P'), false, 'RA9ODW/P must be rejected (no slashes)');
assert.strictEqual(validateBaseCallsign('R1/RA9ODW'), false, 'R1/RA9ODW must be rejected (no slashes)');
assert.strictEqual(validateBaseCallsign('R9OGL/M'), false, 'R9OGL/M must be rejected (no slashes)');
assert.strictEqual(validateBaseCallsign('UB3AAA/1'), false, 'UB3AAA/1 must be rejected (no slashes)');
assert.strictEqual(validateBaseCallsign('R9OGL\\P'), false, 'Backslash must be rejected');

// Invalid: bad format
assert.strictEqual(validateBaseCallsign('12345'), false, 'No letters must be rejected');
assert.strictEqual(validateBaseCallsign('ABCDEF'), false, 'No digits must be rejected');
assert.strictEqual(validateBaseCallsign(''), false, 'Empty callsign must be rejected');
console.log('✅ PASS: Base callsign validation strictly rejects slashes and accepts pure callsigns');

// 9. Test Telegram account detection and linking (merge)
const testTgId = 999888777;
const testTgCallsign = 'R9OTEST';
const testTgEmail = 'tg_operator@pota.r9o.ru';
const testTgToken = crypto.randomBytes(32).toString('hex');

// Cleanup any old test records
db.prepare('DELETE FROM users WHERE telegram_id = ?').run(testTgId);
db.prepare('DELETE FROM subscriptions WHERE telegram_id = ?').run(testTgId);

// Insert existing Telegram user
db.prepare(`
  INSERT INTO users (telegram_id, callsign, status, auth_type)
  VALUES (?, ?, 'approved', 'telegram')
`).run(testTgId, testTgCallsign);

// Add a Telegram subscription
db.prepare(`
  INSERT INTO subscriptions (telegram_id, type, target, target_name)
  VALUES (?, 'park', 'RU-0065', 'Национальный парк Таганай')
`).run(testTgId);

// Check if existing Telegram user is detected by callsign
const detectedTgUser = db.prepare(`
  SELECT telegram_id, callsign, status 
  FROM users 
  WHERE callsign = ? AND telegram_id > 0
`).get(testTgCallsign);

assert.ok(detectedTgUser, 'Existing Telegram user must be detected');
assert.strictEqual(detectedTgUser.telegram_id, testTgId, 'Detected ID must match testTgId');
console.log('✅ PASS: Detected existing Telegram account by callsign');

// Simulate account linking upon web verification
db.prepare(`
  UPDATE users 
  SET email = ?, web_token = ? 
  WHERE telegram_id = ?
`).run(testTgEmail, testTgToken, testTgId);

// Check that web token resolves to the Telegram user ID
const resolvedUser = db.prepare(`
  SELECT telegram_id, callsign, status, email, web_token 
  FROM users 
  WHERE web_token = ?
`).get(testTgToken);

assert.ok(resolvedUser, 'User must be resolvable by web_token');
assert.strictEqual(resolvedUser.telegram_id, testTgId, 'telegram_id must be the positive Telegram ID');
assert.strictEqual(resolvedUser.callsign, testTgCallsign, 'callsign must match');
assert.strictEqual(resolvedUser.email, testTgEmail, 'email must match');

// Check that original subscriptions are retained under the same positive telegram_id
const subs = db.prepare('SELECT target FROM subscriptions WHERE telegram_id = ?').all(testTgId);
assert.strictEqual(subs.length, 1, 'Must have 1 subscription');
assert.strictEqual(subs[0].target, 'RU-0065', 'Target must be RU-0065');
console.log('✅ PASS: Telegram account merged with web login, preserving subscriptions and ID');

// Cleanup
db.prepare('DELETE FROM users WHERE telegram_id = ?').run(testTgId);
db.prepare('DELETE FROM subscriptions WHERE telegram_id = ?').run(testTgId);
db.prepare('DELETE FROM users WHERE telegram_id = ?').run(nextWebId);
console.log('✅ PASS: Cleanup test users\n');
console.log('🎉 ALL WEB AUTHENTICATION TESTS PASSED SUCCESSFULLY!');

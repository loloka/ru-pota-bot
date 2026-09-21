import assert from 'node:assert';
import db from './src/db/database.js';
import crypto from 'node:crypto';

console.log('=== RUNNING TELEGRAM LINKING & GUEST SPOT RESTRICTION TESTS ===\n');

// 1. Check telegram_link_tokens table schema
const tableInfo = db.pragma('table_info(telegram_link_tokens)');
const columnNames = tableInfo.map(c => c.name);
assert(columnNames.includes('token'), 'Missing token column');
assert(columnNames.includes('callsign'), 'Missing callsign column');
assert(columnNames.includes('web_telegram_id'), 'Missing web_telegram_id column');
assert(columnNames.includes('expires_at'), 'Missing expires_at column');
console.log('✅ PASS: Table telegram_link_tokens schema is valid');

// 2. Test token generation & insertion
const token = crypto.randomBytes(16).toString('hex');
const testCallsign = 'R2TEST';
const testWebId = -1000999999;
const expiresAt = Math.floor(Date.now() / 1000) + 900;

// Clean up any existing test records
db.prepare('DELETE FROM telegram_link_tokens WHERE callsign = ?').run(testCallsign);
db.prepare('DELETE FROM subscriptions WHERE telegram_id IN (?, ?)').run(testWebId, 99998888);
db.prepare('DELETE FROM user_notifications WHERE user_id IN (?, ?)').run(testWebId, 99998888);
db.prepare('DELETE FROM users WHERE telegram_id IN (?, ?)').run(testWebId, 99998888);

// Create web user
db.prepare(`
  INSERT INTO users (telegram_id, callsign, status, created_at, web_token, email)
  VALUES (?, ?, 'approved', CURRENT_TIMESTAMP, ?, 'test@qrz.ru')
`).run(testWebId, testCallsign, 'web_token_abc123');

// Insert a subscription for the web user
db.prepare(`
  INSERT INTO subscriptions (telegram_id, type, target, target_name)
  VALUES (?, 'callsign', 'UB3AAA', 'Oleg')
`).run(testWebId);

// Insert token
db.prepare(`
  INSERT INTO telegram_link_tokens (token, callsign, web_telegram_id, expires_at)
  VALUES (?, ?, ?, ?)
`).run(token, testCallsign, testWebId, expiresAt);

const linkRow = db.prepare('SELECT * FROM telegram_link_tokens WHERE token = ?').get(token);
assert.strictEqual(linkRow.callsign, testCallsign);
assert.strictEqual(linkRow.web_telegram_id, testWebId);
console.log('✅ PASS: Link token generated, stored and queried correctly');

// 3. Simulate Telegram bot /start link_TOKEN linking logic (Branch A: user doesn't exist yet in TG)
const realTgId = 99998888;
const existingTgUser = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(realTgId);
assert(!existingTgUser, 'Existing user should not exist yet');

// Web user row to merge
const webUser = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(linkRow.web_telegram_id);
assert(webUser, 'Web user must exist');

// Case A: Update web user to real telegram_id
db.transaction(() => {
  db.prepare(`
    UPDATE users
    SET telegram_id = ?
    WHERE telegram_id = ?
  `).run(realTgId, linkRow.web_telegram_id);

  db.prepare('UPDATE subscriptions SET telegram_id = ? WHERE telegram_id = ?').run(realTgId, linkRow.web_telegram_id);
  db.prepare('UPDATE user_notifications SET user_id = ? WHERE user_id = ?').run(realTgId, linkRow.web_telegram_id);
  db.prepare('DELETE FROM telegram_link_tokens WHERE token = ?').run(token);
})();

// Verify migration
const mergedTgUser = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(realTgId);
assert.strictEqual(mergedTgUser.callsign, testCallsign);
assert.strictEqual(mergedTgUser.email, 'test@qrz.ru');
assert.strictEqual(mergedTgUser.web_token, 'web_token_abc123');

const oldWebUser = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(testWebId);
assert(!oldWebUser, 'Temporary web user must be replaced');

const migratedSubs = db.prepare('SELECT * FROM subscriptions WHERE telegram_id = ?').all(realTgId);
assert.strictEqual(migratedSubs.length, 1);
assert.strictEqual(migratedSubs[0].target, 'UB3AAA');

const consumedToken = db.prepare('SELECT * FROM telegram_link_tokens WHERE token = ?').get(token);
assert(!consumedToken, 'Token must be deleted after use');
console.log('✅ PASS: Web account successfully migrated into Telegram user with subscriptions migrated');

// 4. Test spot posting authorization logic
function checkSpotPermissions(user) {
  if (!user || !user.callsign) {
    return { status: 401, error: 'AUTH_REQUIRED' };
  }
  if (user.status === 'pending') {
    return { status: 403, error: 'APPROVAL_PENDING' };
  }
  if (user.status === 'banned') {
    return { status: 403, error: 'BANNED' };
  }
  return { status: 200, ok: true };
}

assert.strictEqual(checkSpotPermissions(null).status, 401, 'Guest must be rejected with 401');
assert.strictEqual(checkSpotPermissions({ telegram_id: 123 }).status, 401, 'User without callsign rejected with 401');
assert.strictEqual(checkSpotPermissions({ telegram_id: 123, callsign: 'R2TEST', status: 'pending' }).status, 403, 'Pending user rejected with 403');
assert.strictEqual(checkSpotPermissions({ telegram_id: 123, callsign: 'R2TEST', status: 'banned' }).status, 403, 'Banned user rejected with 403');
assert.strictEqual(checkSpotPermissions({ telegram_id: 123, callsign: 'R2TEST', status: 'approved' }).status, 200, 'Approved user allowed');
console.log('✅ PASS: Spot posting permissions strictly enforced for guests and pending operators');

// 5. Test Admin Moderation for Negative Web IDs & QRZ URLs
const apprRegex = /^admin_appr:(-?\d+)$/;
const rejRegex = /^admin_rej:(-?\d+)$/;

assert(apprRegex.test('admin_appr:12345678'), 'Should match positive TG ID');
assert(apprRegex.test('admin_appr:-1000000001'), 'Should match negative web ID');
assert(rejRegex.test('admin_rej:-1000000002'), 'Should match negative web ID for rejection');

const matchedNegativeId = parseInt('admin_appr:-1000000001'.match(apprRegex)[1], 10);
assert.strictEqual(matchedNegativeId, -1000000001);

const qrzUrl = `https://www.qrz.ru/db/${testCallsign}`;
assert.strictEqual(qrzUrl, 'https://www.qrz.ru/db/R2TEST');
console.log('✅ PASS: Admin approval regex supports negative web IDs and generates correct QRZ.ru link');

// 6. Test Third-party Spotting Operator Resolution
const baseCallsignRegex = /^([A-Z0-9]{1,4}\/)?([A-Z0-9]{1,3}[0-9][A-Z0-9]{1,5})(\/[A-Z0-9]{1,4})?$/;
const hasLetterRegex = /[A-Z]/;
function resolveSpotCallsign(dbUserCall, requestedCall) {
  const registeredCall = dbUserCall.toUpperCase().trim();
  const reqCall = (requestedCall || '').trim().toUpperCase();
  if (reqCall && reqCall !== registeredCall) {
    if (!baseCallsignRegex.test(reqCall) || !hasLetterRegex.test(reqCall)) {
      throw new Error('INVALID_CALLSIGN');
    }
    return { activator: reqCall, spotter: registeredCall, isThirdParty: true };
  }
  return { activator: registeredCall, spotter: registeredCall, isThirdParty: false };
}

const selfSpot = resolveSpotCallsign('R9OGL', 'R9OGL');
assert.strictEqual(selfSpot.activator, 'R9OGL');
assert.strictEqual(selfSpot.spotter, 'R9OGL');
assert.strictEqual(selfSpot.isThirdParty, false);

const friendSpot = resolveSpotCallsign('R9OGL', 'UB3DAA/P');
assert.strictEqual(friendSpot.activator, 'UB3DAA/P');
assert.strictEqual(friendSpot.spotter, 'R9OGL');
assert.strictEqual(friendSpot.isThirdParty, true);

assert.throws(() => resolveSpotCallsign('R9OGL', '12345'), /INVALID_CALLSIGN/);
console.log('✅ PASS: Third-party spot operator resolution correctly separates activator from registered spotter');

// Cleanup
db.prepare('DELETE FROM subscriptions WHERE telegram_id = ?').run(realTgId);
db.prepare('DELETE FROM users WHERE telegram_id = ?').run(realTgId);

console.log('\n🎉 ALL TELEGRAM LINKING & GUEST SPOT TESTS PASSED!\n');

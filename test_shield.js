import { 
  checkProfile, 
  SCAM_PATTERNS, 
  isUserApproved, 
  logBlockedUser, 
  isUserBlockedInDb,
  pendingCaptchas,
  escapeHtml
} from './src/bot/middlewares/antiSpam.js';
import db from './src/db/database.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

console.log('--- 🛡️ RUNNING RU-POTA SHIELD TESTS ---');

// 1. Echelon 1: Profile Face-Control Tests
console.log('\n[1] Testing Profile Face-Control (checkProfile)...');

// Arabic / Farsi / Urdu
const arabicUser = { first_name: 'محمد', last_name: 'علي' };
assert(checkProfile(arabicUser).isSpam === true, 'Blocks Arabic name');

// Asian glyphs (Chinese / Japanese / Korean)
const asianUser = { first_name: '币安', last_name: '客服' };
assert(checkProfile(asianUser).isSpam === true, 'Blocks Chinese/Asian glyphs');

// Links in name
const linkUser = { first_name: 'Join', last_name: 't.me/cryptopumps' };
assert(checkProfile(linkUser).isSpam === true, 'Blocks links in name');

const httpUser = { first_name: 'Earn https://free-money.xyz', last_name: '' };
assert(checkProfile(httpUser).isSpam === true, 'Blocks http links in name');

// Standalone @ handle in name
const atUser = { first_name: 'Subscribe @scamchannel', last_name: 'Now' };
assert(checkProfile(atUser).isSpam === true, 'Blocks @ handle in name');

// Commercial / spam stop-words in name
const cryptoUser = { first_name: 'Crypto King', last_name: 'Signals' };
assert(checkProfile(cryptoUser).isSpam === true, 'Blocks "crypto" in name');

const casinoUser = { first_name: 'Казино Вулкан', last_name: 'Бонус' };
assert(checkProfile(casinoUser).isSpam === true, 'Blocks "casino/казино" in name');

const earnUser = { first_name: 'Заработок Онлайн', last_name: '' };
assert(checkProfile(earnUser).isSpam === true, 'Blocks "заработок" in name');

// Legitimate radio amateur profiles
const hamUser1 = { first_name: 'Иван', last_name: 'Иванов', username: 'r9ogl' };
assert(checkProfile(hamUser1).isSpam === false, 'Allows regular Russian name');

const hamUser2 = { first_name: 'Michael', last_name: 'RA3AAA/P', username: 'mikhail_ham' };
assert(checkProfile(hamUser2).isSpam === false, 'Allows regular English/Callsign name');

// 2. Echelon 2: Interactive Smart Captcha logic
console.log('\n[2] Testing Smart Captcha & pendingCaptchas Map...');
const mockUserId = 12345678;
const mockTimer = setTimeout(() => {}, 100000);
pendingCaptchas.set(mockUserId, {
  timer: mockTimer,
  messageId: 42,
  chatId: -100123,
  member: { id: mockUserId, first_name: 'Newbie' }
});

assert(pendingCaptchas.has(mockUserId), 'Captcha timer registered in Map');
clearTimeout(mockTimer);
pendingCaptchas.delete(mockUserId);
assert(!pendingCaptchas.has(mockUserId), 'Captcha timer cleared from Map');

// 3. Echelon 3: Sandbox Links Guard Tests
console.log('\n[3] Testing Sandbox Links Quarantine Logic...');
function checkNewbieLinks(text, entities = [], isForward = false) {
  const hasUrlEntity = entities.some(e => e.type === 'url' || e.type === 'text_link');
  const hasRawLink = /(?:https?:\/\/|t\.me\/|telegram\.me\/)/i.test(text);
  const hasChannelMention = entities.some(e => {
    if (e.type === 'mention') {
      const mentionText = text.substring(e.offset, e.offset + e.length).toLowerCase().replace('@', '');
      return mentionText !== 'ru_pota_bot';
    }
    return false;
  });
  return hasUrlEntity || hasRawLink || isForward || hasChannelMention;
}

assert(checkNewbieLinks('Подписывайтесь на https://t.me/channel') === true, 'Catches raw t.me link');
assert(checkNewbieLinks('Посетите наш сайт', [{ type: 'text_link', offset: 0, length: 17 }]) === true, 'Catches entity text_link');
assert(checkNewbieLinks('Привет всем!', [], true) === true, 'Catches forwarded post');
assert(checkNewbieLinks('Вопрос к @scambot', [{ type: 'mention', offset: 9, length: 8 }]) === true, 'Catches external @mention');
assert(checkNewbieLinks('Бот доступен тут: @ru_pota_bot', [{ type: 'mention', offset: 18, length: 12 }]) === false, 'Allows official @ru_pota_bot mention');
assert(checkNewbieLinks('Всем привет, я начинающий радиолюбитель!') === false, 'Allows clean newcomer message');

// 4. Echelon 4: Scam Stop-Phrases Regex Tests
console.log('\n[4] Testing Scam Text Patterns...');

const scamText1 = 'Срочно требуются сотрудники на удаленную работу';
assert(SCAM_PATTERNS.some(p => p.test(scamText1)), 'Matches "требуются сотрудники"');

const scamText2 = 'Ежедневный пассивный доход и криптовалюта для всех';
assert(SCAM_PATTERNS.some(p => p.test(scamText2)), 'Matches "пассивный доход"');

const scamText3 = 'Выплата от 50000 руб в день, пиши в лс';
assert(SCAM_PATTERNS.some(p => p.test(scamText3)), 'Matches "выплата от \\d" and "пиши в лс"');

const cleanRadioText = 'Всем 73! Сегодня активировал RU-0001 на 7120 SSB, спасибо за споты!';
assert(!SCAM_PATTERNS.some(p => p.test(cleanRadioText)), 'Clean radio ham message is not flagged');

// 5. Database & Blocked Users Logging Tests
console.log('\n[5] Testing Database Blocked Users Table & Whitelist...');

const testTgId = 999888777;
// Clean test record if exists
db.prepare('DELETE FROM blocked_users WHERE telegram_id = ?').run(testTgId);

logBlockedUser({
  telegramId: testTgId,
  firstName: 'Spam',
  lastName: 'Bot',
  username: 'spambot999',
  reason: 'profile_face_control',
  details: 'Арабская вязь в профиле',
  action: 'banned'
});

const isBlocked = isUserBlockedInDb(testTgId);
assert(isBlocked === true, 'User is recognized as blocked in DB');

const blockedRow = db.prepare('SELECT * FROM blocked_users WHERE telegram_id = ?').get(testTgId);
assert(blockedRow !== undefined && blockedRow.reason === 'profile_face_control', 'Record correctly stored in blocked_users');

// Clean up test record
db.prepare('DELETE FROM blocked_users WHERE telegram_id = ?').run(testTgId);
assert(isUserBlockedInDb(testTgId) === false, 'User cleaned up from blocked_users');

// Test escapeHtml
assert(escapeHtml('<script>alert("xss")</script>') === '&lt;script&gt;alert("xss")&lt;/script&gt;', 'HTML properly escaped');

console.log(`\n--- TEST RESULTS: ${passed} PASSED, ${failed} FAILED ---`);
process.exit(failed > 0 ? 1 : 0);

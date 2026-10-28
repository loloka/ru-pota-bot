import assert from 'assert';
import vm from 'vm';
import { startAdminServer } from './src/web/admin.js';

console.log('=== RUNNING WEB ADMIN DASHBOARD HTML & JS SYNTAX TEST ===\n');

process.env.ADMIN_PASSWORD = 'test_password_123';
process.env.SESSION_SECRET = 'test_secret_123';
process.env.PORT = '9995';

const mockTelegram = { getChat: async () => ({}) };
startAdminServer(mockTelegram);

// Wait for server to start
await new Promise(r => setTimeout(r, 600));

try {
  // 1. Authenticate to get session cookie
  const loginRes = await fetch('http://127.0.0.1:9995/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'password=test_password_123',
    redirect: 'manual'
  });
  assert.strictEqual(loginRes.status, 302, 'Login must redirect (302)');
  const setCookies = loginRes.headers.getSetCookie();
  assert.ok(setCookies.length > 0, 'Must receive session cookies');
  const cookieHeader = setCookies.map(c => c.split(';')[0]).join('; ');

  // 2. Fetch Public Map (Root /)
  const publicRes = await fetch('http://127.0.0.1:9995/');
  assert.strictEqual(publicRes.status, 200, 'Public map must return 200 OK');
  const publicHtml = await publicRes.text();
  assert.ok(publicHtml.includes('RU-POTA'), 'Public map must contain RU-POTA brand');

  // 2b. Fetch Donate & Contacts pages
  const donateRes = await fetch('http://127.0.0.1:9995/donate');
  assert.strictEqual(donateRes.status, 200, 'Donate page must return 200 OK');
  const contactsRes = await fetch('http://127.0.0.1:9995/contacts');
  assert.strictEqual(contactsRes.status, 200, 'Contacts page must return 200 OK');

  // 2c. Fetch Dashboard HTML (/admin)
  const dashRes = await fetch('http://127.0.0.1:9995/admin', {
    headers: { 'Cookie': cookieHeader }
  });
  assert.strictEqual(dashRes.status, 200, 'Dashboard must return 200 OK');
  const html = await dashRes.text();
  assert.ok(html.includes('RU-POTA Web Admin 2.0'), 'HTML must contain title');

  // 3. Extract and syntax-check all <script> blocks
  const scriptRegex = /<script>([\s\S]*?)<\/script>/g;
  let match;
  let scriptCount = 0;
  while ((match = scriptRegex.exec(html)) !== null) {
    const code = match[1];
    scriptCount++;
    try {
      new vm.Script(code, { filename: `dashboard_script_${scriptCount}.js` });
      console.log(`✅ PASS: Script block #${scriptCount} (${code.length} chars) parsed cleanly without SyntaxError`);
    } catch (syntaxErr) {
      console.error(`❌ SYNTAX ERROR in script #${scriptCount}:`, syntaxErr.message);
      throw syntaxErr;
    }
  }

  assert.ok(scriptCount > 0, 'Must have found at least 1 inline <script> block');

  // 4. Test Donation & Wall of Appreciation workflow
  console.log('\n--- TESTING DONATION SUBMISSION & ADMIN MODERATION ---');
  const postRes = await fetch('http://127.0.0.1:9995/api/donate/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'R9OGL / Александр',
      role: 'activator',
      tier_title: 'Месяц жизни VPS-сервера',
      amount: 450,
      message: 'Тестовое пожелание чистого эфира и 73!',
      is_anonymous: 0
    })
  });
  assert.strictEqual(postRes.status, 200, 'POST /api/donate/submit must return 200 OK');
  const postData = await postRes.json();
  assert.strictEqual(postData.ok, true, 'Submission ok flag must be true');
  console.log('✅ PASS: Donation submitted successfully');

  // Admin query donations
  const adminDonationsRes = await fetch('http://127.0.0.1:9995/api/admin/donations', {
    headers: { 'Cookie': cookieHeader }
  });
  assert.strictEqual(adminDonationsRes.status, 200, 'Admin donations list must return 200 OK');
  const donationsList = await adminDonationsRes.json();
  const testItem = donationsList.find(d => d.message === 'Тестовое пожелание чистого эфира и 73!');
  assert.ok(testItem, 'Test donation must be in admin list');
  assert.strictEqual(testItem.status, 'pending', 'Status must be pending');
  console.log(`✅ PASS: Found pending donation in admin list (id=${testItem.id})`);

  // Admin approve donation
  const approveRes = await fetch(`http://127.0.0.1:9995/api/admin/donations/${testItem.id}/approve`, {
    method: 'POST',
    headers: { 'Cookie': cookieHeader }
  });
  assert.strictEqual(approveRes.status, 200, 'Admin approve must return 200 OK');
  console.log('✅ PASS: Donation approved by admin');

  // Check /donate page contains approved donor info
  const updatedDonateRes = await fetch('http://127.0.0.1:9995/donate');
  const updatedDonateHtml = await updatedDonateRes.text();
  assert.ok(updatedDonateHtml.includes('Тестовое пожелание чистого эфира и 73!'), 'Approved donation must appear on /donate wall');
  assert.ok(updatedDonateHtml.includes('R9OGL / Александр'), 'Donor name must appear on /donate');
  assert.ok(updatedDonateHtml.includes('450 ₽'), 'Amount must appear on /donate');
  console.log('✅ PASS: Approved donation successfully rendered on Wall of Appreciation');

  // Admin delete test donation
  const deleteRes = await fetch(`http://127.0.0.1:9995/api/admin/donations/${testItem.id}/delete`, {
    method: 'POST',
    headers: { 'Cookie': cookieHeader }
  });
  assert.strictEqual(deleteRes.status, 200, 'Admin delete must return 200 OK');
  console.log('✅ PASS: Test donation cleaned up from database');

  console.log('\n--- ALL WEB ADMIN & DONATION TESTS PASSED! ---');
  process.exit(0);
} catch (err) {
  console.error('Test failed:', err);
  process.exit(1);
}

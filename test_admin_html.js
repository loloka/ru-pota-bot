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

  // 2. Fetch Dashboard HTML
  const dashRes = await fetch('http://127.0.0.1:9995/', {
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
  console.log('\n--- ALL WEB ADMIN HTML & JS SYNTAX TESTS PASSED! ---');
  process.exit(0);
} catch (err) {
  console.error('Test failed:', err);
  process.exit(1);
}

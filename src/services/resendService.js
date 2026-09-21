import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Service for sending transactional emails via Resend REST API
 */
export const resendService = {
  /**
   * Check if Resend is properly configured in environment
   * @returns {boolean}
   */
  isConfigured() {
    return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.startsWith('re_'));
  },

  /**
   * Send 6-digit verification code email to radio amateur
   * @param {{ email: string, callsign: string, code: string }} param0 
   * @returns {Promise<{ success: boolean, id?: string, error?: string }>}
   */
  async sendVerificationCode({ email, callsign, code }) {
    const apiKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.EMAIL_FROM || 'RU-POTA <noreply@pota.r9o.ru>';

    if (!apiKey) {
      console.warn('[Resend] RESEND_API_KEY is not defined in environment.');
      return { success: false, error: 'Email service is not configured on server' };
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanCallsign = callsign.trim().toUpperCase();

    const subject = `Код подтверждения входа ${code} — RU-POTA Hub (${cleanCallsign})`;

    const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0b0f19;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e2e8f0;
    }
    .wrapper {
      width: 100%;
      background-color: #0b0f19;
      padding: 40px 10px;
    }
    .card {
      max-width: 520px;
      margin: 0 auto;
      background-color: #111827;
      border: 1px solid #1f2937;
      border-radius: 20px;
      padding: 32px 28px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
    }
    .header {
      text-align: center;
      margin-bottom: 24px;
    }
    .badge {
      display: inline-block;
      background-color: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #10b981;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 12px;
    }
    .title {
      font-size: 20px;
      font-weight: 800;
      color: #ffffff;
      margin: 0 0 8px 0;
    }
    .subtitle {
      font-size: 14px;
      color: #94a3b8;
      margin: 0;
      line-height: 1.5;
    }
    .callsign-box {
      margin-top: 6px;
      font-family: 'Courier New', Courier, monospace;
      font-weight: 800;
      color: #38bdf8;
      font-size: 16px;
    }
    .code-container {
      margin: 28px 0;
      text-align: center;
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(14, 165, 233, 0.08) 100%);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 16px;
      padding: 24px 16px;
    }
    .code-label {
      font-size: 12px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 8px;
      font-weight: 600;
    }
    .code-number {
      font-family: 'Courier New', Courier, monospace;
      font-size: 38px;
      font-weight: 900;
      letter-spacing: 8px;
      color: #10b981;
      text-shadow: 0 0 20px rgba(16, 185, 129, 0.4);
      margin: 0;
    }
    .expiry {
      font-size: 12px;
      color: #64748b;
      margin-top: 10px;
    }
    .footer-text {
      font-size: 12px;
      color: #64748b;
      line-height: 1.6;
      border-top: 1px solid #1f2937;
      padding-top: 20px;
      margin-top: 24px;
      text-align: center;
    }
    .footer-link {
      color: #10b981;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="badge">🌲 RU-POTA Hub • Авторизация</div>
        <h1 class="title">Вход в Личный кабинет</h1>
        <p class="subtitle">
          Запрос на вход для оператора:
          <div class="callsign-box">${cleanCallsign}</div>
        </p>
      </div>

      <div class="code-container">
        <div class="code-label">Ваш одноразовый код:</div>
        <div class="code-number">${code}</div>
        <div class="expiry">⏱ Действует 10 минут</div>
      </div>

      <div class="footer-text">
        Если вы не запрашивали этот код на сайте <a href="https://pota.r9o.ru/" class="footer-link">pota.r9o.ru</a>, просто проигнорируйте это письмо.<br><br>
        73! Команда сообщества <b>Parks on the Air (RU-POTA)</b> 🌲📡
      </div>
    </div>
  </div>
</body>
</html>
`;

    try {
      const response = await axios.post(
        RESEND_API_URL,
        {
          from: fromAddress,
          to: [cleanEmail],
          subject,
          html,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );

      console.log(`\x1b[32m[Resend Email]\x1b[0m Код подтверждения успешно отправлен на ${cleanEmail} (id: ${response.data?.id})`);
      return { success: true, id: response.data?.id };
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message;
      console.error(`\x1b[31m[Resend Email Error]\x1b[0m Ошибка отправки на ${cleanEmail}: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  },
};

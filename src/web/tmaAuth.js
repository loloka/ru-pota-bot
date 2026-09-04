import crypto from 'crypto';
import db from '../db/database.js';
import dotenv from 'dotenv';
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;

/**
 * Validates Telegram WebApp initData string using HMAC-SHA256
 * @param {string} initDataString 
 * @param {string} botToken 
 * @returns {{ valid: boolean, user?: Object, authDate?: number, error?: string }}
 */
export function verifyTelegramInitData(initDataString, botToken = BOT_TOKEN) {
  if (!initDataString || !botToken) {
    return { valid: false, error: 'Missing initData or botToken' };
  }

  try {
    const params = new URLSearchParams(initDataString);
    const hash = params.get('hash');
    if (!hash) {
      return { valid: false, error: 'Missing hash parameter' };
    }

    params.delete('hash');

    // Sort parameters alphabetically
    const keys = Array.from(params.keys()).sort();
    const dataCheckString = keys.map(key => `${key}=${params.get(key)}`).join('\n');

    // secret_key = HMAC_SHA256("WebAppData", botToken)
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();

    // calculated_hash = HMAC_SHA256(secretKey, dataCheckString)
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const hashBuffer = Buffer.from(hash, 'hex');
    const calculatedBuffer = Buffer.from(calculatedHash, 'hex');

    if (hashBuffer.length !== calculatedBuffer.length || !crypto.timingSafeEqual(hashBuffer, calculatedBuffer)) {
      return { valid: false, error: 'Invalid HMAC signature' };
    }

    const authDate = parseInt(params.get('auth_date') || '0', 10);
    let user = null;
    const userJson = params.get('user');
    if (userJson) {
      try {
        user = JSON.parse(userJson);
      } catch (e) {
        // user string parse error
      }
    }

    return { valid: true, user, authDate };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// Default Dev Mock User for local testing without active Telegram session
const DEV_MOCK_USER = {
  id: parseInt(process.env.ADMIN_ID || '890862502', 10),
  first_name: 'Сан Саныч',
  last_name: '',
  username: 'r9ogl',
  language_code: 'ru',
  callsign: 'R9OGL',
  isMock: true,
};

/**
 * Express Middleware for authenticating Telegram Mini App requests
 */
export function tmaAuthMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const initDataHeader = req.headers['x-telegram-init-data'] || '';
  const isDevMock = req.headers['x-dev-mock'] === 'true' || req.query.dev_mock === 'true';

  let rawInitData = '';
  if (authHeader.startsWith('tma ')) {
    rawInitData = authHeader.substring(4).trim();
  } else if (initDataHeader) {
    rawInitData = initDataHeader.trim();
  }

  // 1. Check Dev Mock (allowed in non-production or localhost)
  const isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  if ((!rawInitData || isDevMock) && (process.env.NODE_ENV !== 'production' || isLocal)) {
    req.telegramUser = DEV_MOCK_USER;
    
    // Look up or seed DB user
    let dbUser = db.prepare('SELECT telegram_id, callsign, status, last_spot_data, last_spot_msg_id FROM users WHERE telegram_id = ?').get(DEV_MOCK_USER.id);
    if (!dbUser) {
      dbUser = {
        telegram_id: DEV_MOCK_USER.id,
        callsign: 'R9OGL',
        status: 'approved',
        last_spot_data: null,
        last_spot_msg_id: null,
      };
      try {
        db.prepare('INSERT OR IGNORE INTO users (telegram_id, callsign, status) VALUES (?, ?, ?)').run(DEV_MOCK_USER.id, 'R9OGL', 'approved');
      } catch (e) {}
    }
    req.dbUser = dbUser;
    return next();
  }

  // 2. Validate Real Telegram initData
  if (!rawInitData) {
    return res.status(401).json({
      error: 'Unauthorized: Missing Telegram WebApp initData',
      code: 'AUTH_REQUIRED'
    });
  }

  const verification = verifyTelegramInitData(rawInitData, BOT_TOKEN);
  if (!verification.valid || !verification.user) {
    return res.status(401).json({
      error: `Unauthorized: ${verification.error || 'Invalid session'}`,
      code: 'INVALID_SIGNATURE'
    });
  }

  req.telegramUser = verification.user;

  // 3. Resolve user in SQLite
  let dbUser = db.prepare('SELECT telegram_id, callsign, status, last_spot_data, last_spot_msg_id FROM users WHERE telegram_id = ?').get(verification.user.id);
  
  if (!dbUser) {
    // Registered in Telegram, but not yet applied for callsign in RU-POTA bot
    dbUser = {
      telegram_id: verification.user.id,
      callsign: null,
      status: 'guest',
      last_spot_data: null,
      last_spot_msg_id: null,
    };
  }

  req.dbUser = dbUser;
  next();
}

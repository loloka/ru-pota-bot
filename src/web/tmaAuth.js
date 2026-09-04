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

// Optional Dev Mock User ONLY when explicitly requested on localhost in development mode
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
 * Express Middleware for resolving Telegram Mini App user identity.
 * Does NOT block requests if unauthenticated — sets req.telegramUser = null for guests.
 */
export function tmaUserMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const initDataHeader = req.headers['x-telegram-init-data'] || '';
  const isDevMock = (req.headers['x-dev-mock'] === 'true' || req.query.dev_mock === 'true') && 
                    (req.hostname === 'localhost' || req.hostname === '127.0.0.1') && 
                    process.env.NODE_ENV === 'development';

  let rawInitData = '';
  if (authHeader.startsWith('tma ')) {
    rawInitData = authHeader.substring(4).trim();
  } else if (initDataHeader) {
    rawInitData = initDataHeader.trim();
  }

  // 1. Explicit Local Dev Mock (strictly localhost in dev mode)
  if (isDevMock) {
    req.telegramUser = DEV_MOCK_USER;
    let dbUser = db.prepare('SELECT telegram_id, callsign, status, notifications_enabled, last_spot_data, last_spot_msg_id FROM users WHERE telegram_id = ?').get(DEV_MOCK_USER.id);
    if (!dbUser) {
      dbUser = {
        telegram_id: DEV_MOCK_USER.id,
        callsign: 'R9OGL',
        status: 'approved',
        notifications_enabled: 1,
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

  // 2. Guest request without Telegram session
  if (!rawInitData) {
    req.telegramUser = null;
    req.dbUser = null;
    return next();
  }

  // 3. Validate Real Telegram initData via HMAC-SHA256
  const verification = verifyTelegramInitData(rawInitData, BOT_TOKEN);
  if (!verification.valid || !verification.user) {
    req.telegramUser = null;
    req.dbUser = null;
    return next();
  }

  req.telegramUser = verification.user;

  // 4. Resolve user profile in SQLite
  let dbUser = db.prepare('SELECT telegram_id, callsign, status, notifications_enabled, reject_reason, last_spot_data, last_spot_msg_id FROM users WHERE telegram_id = ?').get(verification.user.id);
  
  if (!dbUser) {
    // Registered in Telegram, but not yet applied for callsign in RU-POTA bot
    dbUser = {
      telegram_id: verification.user.id,
      callsign: null,
      status: 'guest',
      reject_reason: null,
      notifications_enabled: 1,
      last_spot_data: null,
      last_spot_msg_id: null,
    };
  }

  req.dbUser = dbUser;
  next();
}

/**
 * Guard middleware for endpoints that require active Telegram Mini App authentication
 */
export function requireTmaAuth(req, res, next) {
  if (!req.telegramUser) {
    return res.status(401).json({
      error: 'Для этого действия необходимо открыть приложение через Telegram-бота',
      code: 'AUTH_REQUIRED',
      botUrl: 'https://t.me/ru_pota_bot'
    });
  }
  next();
}

/**
 * Backward compatibility alias
 */
export const tmaAuthMiddleware = tmaUserMiddleware;


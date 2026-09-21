import { Router } from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db/database.js';
import { potaApi } from '../api/potaApi.js';
import { tmaUserMiddleware, requireTmaAuth } from './tmaAuth.js';
import { pinManager } from '../services/pinManager.js';
import { getBaseCallsign, isBroadcastMutedCallsign } from '../bot/utils.js';
import { getOoptList, getOoptStats, getOoptDetails, syncOoptRegistry, translateOoptNameOnline, cleanOoptName, transliterateRuToEn } from '../services/ooptService.js';
import crypto from 'crypto';
import { renderPotaTile, parseWmsBbox, tileToBbox, generatePotaGpx, getEmptyPng } from '../services/potaTileService.js';
import { resendService } from '../services/resendService.js';
import { locationService } from '../services/locationService.js';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ACTIVITY_CHANNEL_ID = process.env.ACTIVITY_CHANNEL_ID;
const ALLOWED_PREFIXES = (process.env.ALLOWED_PREFIXES || 'RU-,BY-,KZ-').split(',').map(p => p.trim());

// Regex validation per rule 2.4 in GEMINI.md
const baseCallsignRegex = /^([A-Z0-9]{1,4}\/)?([A-Z0-9]{1,3}[0-9][A-Z0-9]{1,5})(\/[A-Z0-9]{1,4})?$/;
const hasLetterRegex = /[A-Z]/;
const parkRegex = /^[A-Z0-9]{1,4}-\d{4,5}$/;
const VALID_MODES = ['SSB', 'CW', 'FT8', 'FT4', 'FM', 'AM', 'DIGI'];

// Cache buffers
let cachedSpots = [];
let lastSpotsFetchTime = 0;
const SPOTS_CACHE_TTL_MS = 15000; // 15 seconds cache to be respectful to api.pota.app

let cachedParks = [];
let lastParksFetchTime = 0;
const PARKS_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Program dictionary so failure in one country never wipes out others
const parksByProgram = {
  RU: [],
  BY: [],
  KZ: [],
};

// 1. Initial load from local fallback dataset so map NEVER starts empty or missing countries
try {
  const fallbackPath = path.resolve(__dirname, '../data/parks_fallback.json');
  if (fs.existsSync(fallbackPath)) {
    const rawFallback = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
    if (Array.isArray(rawFallback) && rawFallback.length > 0) {
      cachedParks = rawFallback;
      for (const p of rawFallback) {
        const prefix = (p.reference || '').substring(0, 3).toUpperCase();
        if (prefix === 'RU-') parksByProgram.RU.push(p);
        else if (prefix === 'BY-') parksByProgram.BY.push(p);
        else if (prefix === 'KZ-') parksByProgram.KZ.push(p);
      }
      console.log(`[TMA API] 🗺️ Initialized ${cachedParks.length} POTA parks from fallback (RU: ${parksByProgram.RU.length}, BY: ${parksByProgram.BY.length}, KZ: ${parksByProgram.KZ.length})`);
    }
  }
} catch (err) {
  console.warn('[TMA API] ⚠️ Could not load fallback parks:', err.message);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let isRefreshingParks = false;

/**
 * Periodically refresh POTA parks list for RU, BY, KZ from official API.
 * Uses sequential requests with polite 2s pause to prevent Cloudflare stream aborts.
 * Keeps existing cached parks if any single country request fails or times out.
 */
async function refreshParksFromApi() {
  if (isRefreshingParks) return;
  isRefreshingParks = true;

  try {
    const programs = ['RU', 'BY', 'KZ'];
    let anyUpdated = false;

    for (let i = 0; i < programs.length; i++) {
      const prog = programs[i];
      if (i > 0) await sleep(2000); // Polite 2s delay between requests to prevent Cloudflare throttling

      try {
        const parksData = await potaApi.getProgramParks(prog);
        if (Array.isArray(parksData) && parksData.length > 0) {
          const mapped = parksData.map(p => ({
            reference: p.reference,
            name: p.name,
            lat: parseFloat(p.latitude) || 0,
            lon: parseFloat(p.longitude) || 0,
            grid: p.grid || '',
            region: p.locationDesc || '',
            website: p.website || '',
            activations: p.activations || 0,
            qsos: p.qsos || 0,
          })).filter(p => p.lat !== 0 && p.lon !== 0);

          if (mapped.length > 0) {
            parksByProgram[prog] = mapped;
            anyUpdated = true;
            console.log(`[TMA API] 🗺️ Refreshed ${prog} parks from API: ${mapped.length}`);
          }
        }
      } catch (err) {
        const reason = err.code || err.message || 'unknown error';
        console.warn(`[TMA API] ⚠️ Failed to refresh ${prog} parks (${reason}), preserving ${parksByProgram[prog]?.length || 0} existing parks`);
      }
    }

    if (anyUpdated) {
      cachedParks = [
        ...parksByProgram.RU,
        ...parksByProgram.BY,
        ...parksByProgram.KZ,
      ];
      lastParksFetchTime = Date.now();
      console.log(`[TMA API] 🗺️ Total cached POTA parks: ${cachedParks.length}`);

      // Try updating fallback file on disk asynchronously
      try {
        const fallbackPath = path.resolve(__dirname, '../data/parks_fallback.json');
        fs.writeFileSync(fallbackPath, JSON.stringify(cachedParks, null, 2), 'utf8');
      } catch (saveErr) {
        // Non-critical if filesystem is read-only
      }
    }
  } catch (err) {
    console.warn('[TMA API] ⚠️ Error during refreshParksFromApi:', err.message);
  } finally {
    isRefreshingParks = false;
  }
}

let cachedRaza = null;
let lastRazaFetchTime = 0;



const statsCache = new Map();
const STATS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache for stats

const parkDetailsCache = new Map();
const PARK_DETAILS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache for full park info, leaderboards, activations

/**
 * Determine amateur radio band by frequency in kHz
 */
function getBandFromKHz(kHz) {
  const f = parseFloat(kHz);
  if (isNaN(f)) return 'Другой';
  if (f >= 1800 && f <= 2000) return '160m';
  if (f >= 3500 && f <= 3800) return '80m';
  if (f >= 7000 && f <= 7300) return '40m';
  if (f >= 10100 && f <= 10150) return '30m';
  if (f >= 14000 && f <= 14350) return '20m';
  if (f >= 18068 && f <= 18168) return '17m';
  if (f >= 21000 && f <= 21450) return '15m';
  if (f >= 24890 && f <= 24990) return '12m';
  if (f >= 28000 && f <= 29700) return '10m';
  if (f >= 144000 && f <= 148000) return '2m';
  if (f >= 430000 && f <= 440000) return '70cm';
  return 'Другой';
}

function parseSpotTimestamp(dateString) {
  if (!dateString) return 0;
  const str = (dateString.endsWith('Z') || dateString.includes('+') || (dateString.length > 10 && dateString.substring(10).includes('-')))
    ? dateString
    : `${dateString}Z`;
  const t = new Date(str).getTime();
  return isNaN(t) ? 0 : t;
}

function getDiffMinutes(dateString) {
  if (!dateString) return 99999;
  const t = parseSpotTimestamp(dateString);
  if (!t) return 99999;
  const now = Date.now();
  return Math.max(0, Math.floor((now - t) / (60 * 1000)));
}

/**
 * Format relative time (e.g. "3 мин назад")
 */
function formatTimeAgo(dateString) {
  if (!dateString) return '';
  const diffMinutes = getDiffMinutes(dateString);

  if (diffMinutes <= 1) return 'только что';
  if (diffMinutes < 60) return `${diffMinutes} мин назад`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} ч назад`;
  return `${Math.floor(diffHours / 24)} д назад`;
}


/**
 * Create Telegram Mini App Express Router
 * @param {Object} telegramClient 
 * @returns {Router}
 */
export function createTmaRouter(telegramClient) {
  const router = Router();

  // Background refresh of POTA parks list (delayed by 10 minutes to allow clean bot startup)
  setTimeout(() => {
    refreshParksFromApi().catch(() => {});
  }, 10 * 60 * 1000);

  // Extract TMA user identity (sets req.telegramUser or null for guests)
  router.use(tmaUserMiddleware);

  // ==========================================
  // 0. WEB AUTHENTICATION (Callsign + Email via Resend)
  // ==========================================

  // POST /api/tma/auth/send-code - Request 6-digit verification code
  router.post('/auth/send-code', async (req, res) => {
    try {
      const { callsign, email } = req.body || {};

      if (!callsign || !email) {
        return res.status(400).json({ error: 'Позывной и email обязательны для заполнения' });
      }

      const cleanCallsign = String(callsign).trim().toUpperCase();
      const cleanEmail = String(email).trim().toLowerCase();

      // Reject slashes - base callsign only
      if (cleanCallsign.includes('/') || cleanCallsign.includes('\\')) {
        return res.status(400).json({ 
          error: 'Пожалуйста, укажите только основной позывной без дробей (например, R9OGL или RA9ODW, без /P, /M, /1)' 
        });
      }

      // Validate base callsign format (pure callsign with letters and digits, no slashes)
      const pureCallsignRegex = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,5}$/;
      if (!pureCallsignRegex.test(cleanCallsign) || !hasLetterRegex.test(cleanCallsign)) {
        return res.status(400).json({ error: 'Некорректный формат позывного (например: R9OGL, RA9ODW, UB3AAA)' });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ error: 'Некорректный формат адреса электронной почты' });
      }

      // Check 60-second cooldown rate limit per email
      const lastRequest = db.prepare(`
        SELECT created_at FROM email_verifications 
        WHERE email = ? 
        ORDER BY id DESC LIMIT 1
      `).get(cleanEmail);

      if (lastRequest && lastRequest.created_at) {
        const elapsedSec = (Date.now() - new Date(lastRequest.created_at).getTime()) / 1000;
        if (elapsedSec < 60) {
          const waitSec = Math.ceil(60 - elapsedSec);
          return res.status(429).json({ 
            error: `Пожалуйста, подождите ${waitSec} сек. перед повторной отправкой кода`,
            retryAfter: waitSec 
          });
        }
      }

      // Generate 6-digit cryptographically secure code
      const code = String(crypto.randomInt(100000, 999999));
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

      db.prepare(`
        INSERT INTO email_verifications (email, callsign, code, expires_at)
        VALUES (?, ?, ?, ?)
      `).run(cleanEmail, cleanCallsign, code, expiresAt);

      // Send email via Resend
      const sendResult = await resendService.sendVerificationCode({
        email: cleanEmail,
        callsign: cleanCallsign,
        code,
      });

      if (!sendResult.success) {
        return res.status(500).json({ 
          error: sendResult.error || 'Не удалось отправить письмо с кодом. Проверьте адрес или повторите позже.' 
        });
      }

      res.json({
        success: true,
        message: 'Проверочный код отправлен на вашу почту',
        email: cleanEmail,
        callsign: cleanCallsign,
        expiresInSeconds: 600,
      });
    } catch (err) {
      console.error('[TMA API] Error in /auth/send-code:', err.message);
      res.status(500).json({ error: 'Внутренняя ошибка сервера при отправке кода' });
    }
  });

  // POST /api/tma/auth/verify-code - Verify code and log in
  router.post('/auth/verify-code', async (req, res) => {
    try {
      const { email, code, callsign } = req.body || {};

      if (!email || !code) {
        return res.status(400).json({ error: 'Email и проверочный код обязательны' });
      }

      const cleanEmail = String(email).trim().toLowerCase();
      const cleanCode = String(code).trim();
      const cleanCallsign = callsign ? String(callsign).trim().toUpperCase() : null;
      if (cleanCallsign && (cleanCallsign.includes('/') || cleanCallsign.includes('\\'))) {
        return res.status(400).json({ error: 'Пожалуйста, укажите только основной позывной без дробей' });
      }

      const now = Date.now();
      const verification = db.prepare(`
        SELECT * FROM email_verifications 
        WHERE email = ? AND code = ? AND expires_at > ?
        ORDER BY id DESC LIMIT 1
      `).get(cleanEmail, cleanCode, now);

      if (!verification) {
        return res.status(400).json({ error: 'Неверный или истекший проверочный код' });
      }

      // Invalidate used verification code
      db.prepare('DELETE FROM email_verifications WHERE email = ?').run(cleanEmail);

      const targetCallsign = (cleanCallsign || verification.callsign || '').toUpperCase();
      const webToken = crypto.randomBytes(32).toString('hex');

      // 1. Check if an account already exists with THIS verified email
      let user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);

      if (user) {
        // User is logging in with their verified email
        db.prepare(`
          UPDATE users 
          SET web_token = ?
          WHERE telegram_id = ?
        `).run(webToken, user.telegram_id);

        user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(user.telegram_id);
        console.log(`\x1b[32m[Web Auth]\x1b[0m 🌐 Успешный вход пользователя по Email: ${user.callsign} (${cleanEmail}), ID: ${user.telegram_id}`);

        // If this user has Telegram connected, notify them in Telegram DM (non-blocking)
        if (telegramClient && user.telegram_id > 0) {
          telegramClient.sendMessage(
            user.telegram_id,
            `🌐 <b>Вход в личный кабинет RU-POTA Hub (pota.r9o.ru/app)</b>\n\n` +
            `Пользователь с позывным <b>${user.callsign}</b> успешно вошёл по привязанной почте <code>${cleanEmail}</code>.\n` +
            `Если это были не вы, обратитесь к администратору сообщества. 73! 🌲📡`,
            { parse_mode: 'HTML' }
          ).catch((tgNotifyErr) => {
            console.warn('[Web Auth] Failed to send Telegram DM alert:', tgNotifyErr.message);
          });
        }
      } else {
        // 2. New Web registration (isolated standalone web user)
        // Allocate persistent negative ID for web user
        const minIdRow = db.prepare('SELECT MIN(telegram_id) as min_id FROM users').get();
        let nextId = -1000000001;
        if (minIdRow && minIdRow.min_id && minIdRow.min_id < 0) {
          nextId = minIdRow.min_id - 1;
        }

        db.prepare(`
          INSERT INTO users (telegram_id, callsign, status, email, auth_type, web_token)
          VALUES (?, ?, 'pending', ?, 'web', ?)
        `).run(nextId, targetCallsign, cleanEmail, webToken);

        user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(nextId);
        console.log(`\x1b[32m[Web Auth]\x1b[0m 🌐 Зарегистрирован новый веб-пользователь: ${targetCallsign} (${cleanEmail}), ID: ${nextId}`);

        // Notify Admin via Telegram with approve/reject buttons and QRZ.ru link (non-blocking)
        const adminId = process.env.ADMIN_ID;
        if (telegramClient && adminId) {
          telegramClient.sendMessage(
            adminId,
            `🌐 <b>Новая регистрация через RU-POTA Hub (pota.r9o.ru/app)!</b>\n\n` +
            `📡 Позывной: <b>${targetCallsign}</b>\n` +
            `✉️ Email: <code>${cleanEmail}</code>\n` +
            `🆔 Web ID: <code>${nextId}</code>\n` +
            `⏳ Статус: <b>Ожидает модерации</b>\n\n` +
            `👉 Проверьте позывной оператора:`,
            {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✅ Одобрить', callback_data: `admin_appr:${nextId}` },
                    { text: '❌ Отклонить', callback_data: `admin_rej:${nextId}` }
                  ],
                  [
                    { text: '🔍 Проверить на QRZ.ru', url: `https://www.qrz.ru/db/${targetCallsign}` }
                  ]
                ]
              }
            }
          ).catch((adminErr) => {
            console.warn('[Web Auth] Failed to notify admin about new web user:', adminErr.message);
          });
        }
      }

      res.json({
        success: true,
        token: webToken,
        user: {
          id: user.telegram_id,
          telegram_id: user.telegram_id,
          callsign: user.callsign,
          email: user.email,
          status: user.status,
          auth_type: user.auth_type,
          isWeb: user.telegram_id < 0,
          hasWebSession: true,
          notifications_enabled: user.notifications_enabled,
        },
      });
    } catch (err) {
      console.error('[TMA API] Error in /auth/verify-code:', err.message);
      res.status(500).json({ error: 'Ошибка верификации кода' });
    }
  });

  // POST /api/tma/auth/logout - Logout web session
  router.post('/auth/logout', (req, res) => {
    try {
      const authHeader = req.headers['authorization'] || '';
      const webToken = req.headers['x-web-token'] || 
        (authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '');

      if (webToken) {
        db.prepare('UPDATE users SET web_token = NULL WHERE web_token = ?').run(webToken);
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Logout error' });
    }
  });

  // POST /api/tma/link/telegram-token - Generate deep-link token to connect Telegram account
  router.post('/link/telegram-token', (req, res) => {
    try {
      const user = req.dbUser;
      if (!user || !user.callsign) {
        return res.status(401).json({ error: 'Требуется авторизация для привязки Telegram' });
      }

      const token = `link_${crypto.randomBytes(6).toString('hex')}`;
      const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

      db.prepare(`
        INSERT INTO telegram_link_tokens (token, callsign, web_telegram_id, expires_at)
        VALUES (?, ?, ?, ?)
      `).run(token, user.callsign, user.telegram_id, expiresAt);

      const botUsername = process.env.BOT_USERNAME || 'ru_pota_bot';
      const botUrl = `https://t.me/${botUsername}?start=${token}`;

      res.json({
        success: true,
        token,
        botUrl,
        expiresInSeconds: 900
      });
    } catch (err) {
      console.error('[TMA API] Error in /link/telegram-token:', err.message);
      res.status(500).json({ error: 'Ошибка генерации ссылки привязки' });
    }
  });

  // POST /api/tma/auth/telegram-init - Start 1-click web login via Telegram bot deep-link
  router.post('/auth/telegram-init', (req, res) => {
    try {
      const token = `auth_${crypto.randomBytes(12).toString('hex')}`;
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

      db.prepare(`
        INSERT INTO telegram_login_sessions (token, status, expires_at)
        VALUES (?, 'pending', ?)
      `).run(token, expiresAt);

      const botUsername = process.env.BOT_USERNAME || 'ru_pota_bot';
      const botUrl = `https://t.me/${botUsername}?start=${token}`;

      res.json({
        success: true,
        token,
        botUrl,
        expiresInSeconds: 600
      });
    } catch (err) {
      console.error('[TMA API] Error in /auth/telegram-init:', err.message);
      res.status(500).json({ error: 'Ошибка инициализации входа через Telegram' });
    }
  });

  // GET /api/tma/auth/telegram-poll - Poll for Telegram 1-click confirmation
  router.get('/auth/telegram-poll', (req, res) => {
    try {
      const token = req.query.token;
      if (!token) {
        return res.status(400).json({ error: 'Токен сессии обязателен' });
      }

      const session = db.prepare('SELECT * FROM telegram_login_sessions WHERE token = ?').get(token);
      if (!session) {
        return res.status(404).json({ error: 'Сессия не найдена' });
      }

      if (Date.now() > session.expires_at) {
        return res.json({ status: 'expired', error: 'Срок действия сессии истёк' });
      }

      if ((session.status === 'confirmed' || session.status === 'used') && session.telegram_id) {
        const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(session.telegram_id);
        if (!user) {
          return res.status(404).json({ error: 'Пользователь не найден в базе' });
        }

        // Generate persistent web token if not present, or use existing user.web_token
        let webToken = user.web_token;
        if (!webToken) {
          webToken = crypto.randomBytes(32).toString('hex');
          db.prepare('UPDATE users SET web_token = ? WHERE telegram_id = ?').run(webToken, user.telegram_id);
        }
        if (session.status !== 'used') {
          db.prepare(`UPDATE telegram_login_sessions SET status = 'used' WHERE id = ?`).run(session.id);
          console.log(`\x1b[32m[Telegram Auth]\x1b[0m 🌐 Авторизован через deep-link: ${user.callsign} (TG: ${user.telegram_id})`);
        }

        return res.json({
          success: true,
          status: 'confirmed',
          token: webToken,
          user: {
            id: user.telegram_id,
            telegram_id: user.telegram_id,
            callsign: user.callsign,
            status: user.status || 'approved',
            first_name: user.first_name || '',
            last_name: user.last_name || '',
            username: user.username || '',
            avatar_url: user.avatar_url || null,
            email: user.email || null,
            auth_type: 'telegram'
          }
        });
      }

      res.json({
        success: true,
        status: session.status || 'pending'
      });
    } catch (err) {
      console.error('[TMA API] Error in /auth/telegram-poll:', err.message);
      res.status(500).json({ error: 'Ошибка проверки сессии входа' });
    }
  });

  // POST /api/tma/auth/telegram-code - Verify 6-digit code obtained via /login in Telegram bot
  router.post('/auth/telegram-code', (req, res) => {
    try {
      const { code } = req.body || {};
      if (!code) {
        return res.status(400).json({ error: 'Укажите 6-значный проверочный код' });
      }

      const cleanCode = String(code).trim();
      const now = Date.now();

      const session = db.prepare(`
        SELECT * FROM telegram_login_sessions 
        WHERE code = ? AND (status = 'confirmed' OR status = 'used') AND expires_at > ?
        ORDER BY id DESC LIMIT 1
      `).get(cleanCode, now);

      if (!session || !session.telegram_id) {
        return res.status(400).json({ 
          error: 'Неверный или истекший код. Запросите свежий код командой /login в боте @ru_pota_bot.' 
        });
      }

      const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(session.telegram_id);
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }

      // Generate persistent web token if not present, or use existing user.web_token
      let webToken = user.web_token;
      if (!webToken) {
        webToken = crypto.randomBytes(32).toString('hex');
        db.prepare('UPDATE users SET web_token = ? WHERE telegram_id = ?').run(webToken, user.telegram_id);
      }
      if (session.status !== 'used') {
        db.prepare(`UPDATE telegram_login_sessions SET status = 'used' WHERE id = ?`).run(session.id);
        console.log(`\x1b[32m[Telegram Auth]\x1b[0m 🌐 Авторизован по 6-значному коду ${cleanCode}: ${user.callsign} (TG: ${user.telegram_id})`);
      }

      res.json({
        success: true,
        token: webToken,
        user: {
          id: user.telegram_id,
          telegram_id: user.telegram_id,
          callsign: user.callsign,
          status: user.status || 'approved',
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          username: user.username || '',
          avatar_url: user.avatar_url || null,
          email: user.email || null,
          auth_type: 'telegram'
        }
      });
    } catch (err) {
      console.error('[TMA API] Error in /auth/telegram-code:', err.message);
      res.status(500).json({ error: 'Внутренняя ошибка проверки кода' });
    }
  });

  // ==========================================
  // 1. GET /api/tma/me - Operator Profile
  // ==========================================
  router.get('/me', async (req, res) => {
    try {
      const tgUser = req.telegramUser;
      const dbUser = req.dbUser;

      // Guest / unauthenticated visitor outside Telegram
      if (!tgUser || !dbUser) {
        return res.json({
          user: null,
          activeSpot: null,
          stats: null,
          subscriptionsCount: 0,
          unreadNotificationsCount: 0,
          isGuest: true,
        });
      }

      let activeSpot = null;
      if (dbUser.last_spot_data) {
        try {
          activeSpot = JSON.parse(dbUser.last_spot_data);
          if (activeSpot) {
            const rawFreq = activeSpot.frequency || activeSpot.freq || '';
            let freqVal = parseFloat(String(rawFreq).replace(',', '.'));
            if (!isNaN(freqVal) && freqVal > 0) {
              if (freqVal < 1000) {
                activeSpot.freqMHz = freqVal.toFixed(3);
                activeSpot.frequency = String(Math.round(freqVal * 1000));
                activeSpot.freq = activeSpot.frequency;
              } else {
                activeSpot.freqMHz = (freqVal / 1000).toFixed(3);
                activeSpot.frequency = String(Math.round(freqVal));
                activeSpot.freq = activeSpot.frequency;
              }
            }
          }
        } catch (e) {
          activeSpot = null;
        }
      }

      // Count user published spots from local DB
      let userSpotsCount = 0;
      if (dbUser.callsign) {
        const cleanCall = getBaseCallsign(dbUser.callsign);
        try {
          userSpotsCount = db.prepare('SELECT COUNT(*) as count FROM spots WHERE UPPER(callsign) = ? OR UPPER(callsign) LIKE ?').get(cleanCall, `${cleanCall}/%`)?.count || 0;
        } catch (_) {}
      }

      // Fetch or retrieve cached POTA stats
      let stats = {
        activations: 0,
        uniqueParks: 0,
        qsos: 0,
        workedParks: 0,
        dxcc: 0,
        confirmed: 0,
        name: '',
        qth: '',
        grid: '',
        gravatar: null,
        otherCallsigns: [],
        attempts: null,
        awardsCount: 0,
        endorsementsCount: 0,
        awards: [],
        recentActivations: [],
        recentHunts: [],
      };

      if (dbUser.callsign && dbUser.status === 'approved') {
        const cleanCall = getBaseCallsign(dbUser.callsign);
        const cached = statsCache.get(cleanCall);
        const now = Date.now();

        if (cached && (now - cached.timestamp) < STATS_CACHE_TTL_MS && cached.data?.recentActivations !== undefined) {
          stats = cached.data;
        } else {
          try {
            const remoteStats = await potaApi.getStats(cleanCall);
            stats = {
              // Core metrics
              activations: remoteStats.stats?.activator?.activations || remoteStats.total_activations || 0,
              uniqueParks: remoteStats.stats?.activator?.parks || remoteStats.unique_parks_activated || 0,
              qsos: remoteStats.stats?.activator?.qsos || remoteStats.total_qsos || 0,
              workedParks: remoteStats.stats?.hunter?.parks || remoteStats.unique_parks_hunted || 0,
              dxcc: remoteStats.stats?.hunter?.qsos || remoteStats.dxcc_count || 0,
              confirmed: remoteStats.stats?.awards || remoteStats.confirmed_qsos || 0,

              // Rich operator bio and locations
              name: remoteStats.name || '',
              qth: remoteStats.qth || '',
              grid: remoteStats.grid || '',
              gravatar: remoteStats.gravatar || null,
              otherCallsigns: Array.isArray(remoteStats.other_callsigns) ? remoteStats.other_callsigns : [],
              attempts: remoteStats.stats?.attempts || null,
              awardsCount: remoteStats.stats?.awards || (Array.isArray(remoteStats.awards) ? remoteStats.awards.length : 0),
              endorsementsCount: remoteStats.stats?.endorsements || 0,

              // Full awards array
              awards: Array.isArray(remoteStats.awards) ? remoteStats.awards : [],

              // Recent activations & hunter activity
              recentActivations: Array.isArray(remoteStats.recent_activity?.activations)
                ? remoteStats.recent_activity.activations.map(act => ({
                    date: act.date || '',
                    reference: act.reference || '',
                    park: act.park || '',
                    location: act.location || '',
                    cw: act.cw || 0,
                    data: act.data || 0,
                    phone: act.phone || 0,
                    total: act.total || 0,
                  }))
                : [],
              recentHunts: Array.isArray(remoteStats.recent_activity?.hunter_qsos)
                ? remoteStats.recent_activity.hunter_qsos.map(h => ({
                    date: h.date ? h.date.split('T')[0] : '',
                    callsign: h.callsign || '',
                    band: h.band || '',
                    mode: h.mode || '',
                    reference: h.reference || '',
                    park: h.park || '',
                    location: h.location || '',
                  }))
                : [],
            };
            statsCache.set(cleanCall, { data: stats, timestamp: now });
          } catch (e) {
            // Stats fetch warning - fallback to default
          }
        }
      }

      // Count subscriptions and unread notifications
      const subsCount = db.prepare('SELECT COUNT(*) as count FROM subscriptions WHERE telegram_id = ?').get(tgUser.id)?.count || 0;
      const unreadNotifCount = db.prepare('SELECT COUNT(*) as count FROM user_notifications WHERE user_id = ? AND is_read = 0').get(tgUser.id)?.count || 0;

      res.json({
        user: {
          id: tgUser.id,
          telegram_id: dbUser.telegram_id,
          first_name: tgUser.first_name,
          last_name: tgUser.last_name || '',
          username: tgUser.username || '',
          photo_url: tgUser.photo_url || null,
          callsign: dbUser.callsign,
          email: dbUser.email || tgUser.email || null,
          auth_type: dbUser.auth_type || (dbUser.telegram_id < 0 ? 'web' : 'telegram'),
          isWeb: dbUser.telegram_id < 0,
          hasWebSession: Boolean(req.headers['x-web-token'] || (req.headers['authorization']?.startsWith('Bearer ')) || tgUser?.hasWebSession),
          status: dbUser.status,
          reject_reason: dbUser.reject_reason || null,
          notifications_enabled: dbUser.notifications_enabled !== 0,
          isMock: Boolean(tgUser.isMock),
          registered_at: dbUser.created_at || null,
          spots_count: userSpotsCount,
        },
        activeSpot,
        stats,
        subscriptionsCount: subsCount,
        unreadNotificationsCount: unreadNotifCount,
      });
    } catch (err) {
      console.error('[TMA API] Error in /me:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ==========================================
  // 2. GET /api/tma/spots - Live Cluster Spots
  // ==========================================
  router.get('/spots', async (req, res) => {
    try {
      const scope = (req.query.scope || 'ru').toLowerCase(); // 'ru' | 'world'
      const rawBand = (req.query.band || 'Все').trim();
      const isAllBands = !rawBand || rawBand.toLowerCase() === 'все' || rawBand.toLowerCase() === 'all';

      const rawMode = (req.query.mode || 'Все').trim();
      const isAllModes = !rawMode || rawMode.toLowerCase() === 'все' || rawMode.toLowerCase() === 'all';
      const mode = rawMode.toUpperCase();

      const search = (req.query.search || '').toUpperCase().trim();


      const now = Date.now();
      if (!cachedSpots.length || (now - lastSpotsFetchTime) > SPOTS_CACHE_TTL_MS) {
        try {
          const rawSpots = await potaApi.getSpots();
          if (Array.isArray(rawSpots)) {
            cachedSpots = rawSpots;
            lastSpotsFetchTime = now;
          }
        } catch (e) {
          console.warn('[TMA API] Could not refresh POTA spots, using existing cache:', e.message);
        }
      }
      // console.log(`[TMA API /spots] scope=${scope}, cachedSpots=${cachedSpots.length}`);


      // Also get recent local spots from SQLite (past 45 minutes)
      const localSpots = db.prepare(`
        SELECT id, callsign, reference, frequency, mode, comment, source, created_at, msg_id 
        FROM spots 
        WHERE source = 'local' AND created_at >= datetime('now', '-45 minutes') 
        ORDER BY created_at DESC LIMIT 50
      `).all();

      // Transform raw POTA spots
      const formattedPotaSpots = cachedSpots.map((s, idx) => {
        const ref = s.reference || '';
        const isRu = ALLOWED_PREFIXES.some(prefix => ref.startsWith(prefix));
        const freqKHz = parseFloat(s.frequency || 0);
        const freqMHz = (freqKHz / 1000).toFixed(3);
        const calculatedBand = getBandFromKHz(freqKHz);

        const locResolved = locationService.resolveLocation(s.locationDesc || '', ref);
        const grid = s.grid6 || s.grid4 || '';
        const lat = s.latitude || null;
        const lon = s.longitude || null;

        return {
          id: s.spotId || `pota-${idx}`,
          spotId: s.spotId,
          callsign: s.activator || '',
          country: locResolved.flag || '🌐',
          countryName: locResolved.countryName || '',
          countryNameEn: locResolved.countryNameEn || '',
          entityName: locResolved.entityName || '',
          regionName: locResolved.regionName || '',
          park: ref,
          parkName: s.name || '',
          location: s.locationDesc || locResolved.location || '',
          grid,
          lat,
          lon,
          freq: freqMHz,
          freqKHz,
          mode: s.mode || 'SSB',
          band: calculatedBand,
          spotter: s.spotter || '',
          comment: s.comments || '',
          timeAgo: formatTimeAgo(s.spotTime),
          diffMinutes: getDiffMinutes(s.spotTime),
          timestamp: parseSpotTimestamp(s.spotTime),
          rawTime: s.spotTime,
          isRu,
        };
      });

      // Transform local spots
      const formattedLocalSpots = localSpots.map(s => {
        const freqKHz = parseFloat(s.frequency || 0);
        const freqMHz = (freqKHz > 1000 ? freqKHz / 1000 : freqKHz).toFixed(3);
        const calculatedBand = getBandFromKHz(freqKHz > 1000 ? freqKHz : freqKHz * 1000);
        const isRu = ALLOWED_PREFIXES.some(prefix => s.reference.startsWith(prefix));

        const locResolved = locationService.resolveLocation('', s.reference);
        let parkName = 'Локальный спот';
        let grid = '';
        let lat = null;
        let lon = null;
        try {
          const fallback = cachedParks.find(p => p.reference && p.reference.toUpperCase() === s.reference.toUpperCase());
          if (fallback) {
            parkName = fallback.name || parkName;
            grid = fallback.grid || '';
            lat = fallback.lat || null;
            lon = fallback.lon || null;
            if (fallback.region && !locResolved.regionName) {
              const resLoc = locationService.resolveLocation(fallback.region, s.reference);
              if (resLoc.regionName) locResolved.regionName = resLoc.regionName;
            }
          }
        } catch (e) {}

        return {
          id: `local-${s.id}`,
          spotId: null,
          callsign: s.callsign,
          country: locResolved.flag || '🇷🇺',
          countryName: locResolved.countryName || 'Россия',
          countryNameEn: locResolved.countryNameEn || 'Russia',
          entityName: locResolved.entityName || 'Russia',
          regionName: locResolved.regionName || '',
          park: s.reference,
          parkName,
          location: locResolved.location || s.reference.split('-')[0],
          grid,
          lat,
          lon,
          freq: freqMHz,
          freqKHz: freqKHz > 1000 ? freqKHz : freqKHz * 1000,
          mode: s.mode || 'SSB',
          band: calculatedBand,
          spotter: 'RU-POTA TMA',
          comment: s.comment || '',
          timeAgo: formatTimeAgo(s.created_at),
          diffMinutes: getDiffMinutes(s.created_at),
          timestamp: parseSpotTimestamp(s.created_at),
          rawTime: s.created_at,
          isRu,
        };
      });

      // Combine, sort NEWEST FIRST (descending timestamp), and deduplicate by callsign + park
      const combined = [...formattedLocalSpots, ...formattedPotaSpots];
      combined.sort((a, b) => b.timestamp - a.timestamp);

      const seen = new Set();
      const allSpots = [];

      for (const s of combined) {
        const key = `${s.callsign}-${s.park}`;
        if (!seen.has(key)) {
          seen.add(key);
          allSpots.push(s);
        }
      }

      // Filter
      const filtered = allSpots.filter(s => {
        if (scope === 'ru' && !s.isRu) return false;
        if (!isAllBands && s.band !== rawBand) return false;
        if (!isAllModes && s.mode !== mode) return false;
        if (search) {
          return (
            s.callsign.toUpperCase().includes(search) ||
            s.park.toUpperCase().includes(search) ||
            (s.parkName && s.parkName.toUpperCase().includes(search)) ||
            (s.countryName && s.countryName.toUpperCase().includes(search)) ||
            (s.countryNameEn && s.countryNameEn.toUpperCase().includes(search)) ||
            (s.regionName && s.regionName.toUpperCase().includes(search)) ||
            (s.location && s.location.toUpperCase().includes(search)) ||
            (s.grid && s.grid.toUpperCase().includes(search)) ||
            (s.spotter && s.spotter.toUpperCase().includes(search))
          );
        }
        return true;
      });

      res.json({
        total: filtered.length,
        spots: filtered,
      });
    } catch (err) {
      console.error('[TMA API] Error in /spots:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ==========================================
  // 2.1. GET /api/tma/parks - POTA Parks for Map
  // ==========================================
  router.get('/parks', async (req, res) => {
    try {
      const now = Date.now();
      if (!cachedParks.length || now - lastParksFetchTime > PARKS_REFRESH_INTERVAL_MS) {
        if (cachedParks.length > 0) {
          // Asynchronous refresh in background - do not block user response
          refreshParksFromApi().catch(() => {});
        } else {
          await refreshParksFromApi();
        }
      }

      const allParks = cachedParks || [];

      // Ensure cachedSpots is refreshed
      if (!cachedSpots.length || (now - lastSpotsFetchTime) > SPOTS_CACHE_TTL_MS) {
        try {
          const rawSpots = await potaApi.getSpots();
          if (Array.isArray(rawSpots)) {
            cachedSpots = rawSpots;
            lastSpotsFetchTime = now;
          }
        } catch (e) {}
      }

      // Cross reference active spots from memory and SQLite (only active within 45 minutes)
      const activeSpotsMap = new Map();
      if (Array.isArray(cachedSpots)) {
        for (const s of cachedSpots) {
          if (s.reference && getDiffMinutes(s.spotTime) <= 45) {
            activeSpotsMap.set(s.reference.toUpperCase(), s);
          }
        }
      }

      // Also check local SQLite active spots within last 45 minutes
      const localActive = db.prepare(`
        SELECT reference, callsign, frequency, mode, comment, created_at 
        FROM spots 
        WHERE source != 'cluster_throttled' AND created_at >= datetime('now', '-45 minutes')
        ORDER BY created_at ASC
      `).all();

      for (const ls of localActive) {
        if (ls.reference && getDiffMinutes(ls.created_at) <= 45) {
          activeSpotsMap.set(ls.reference.toUpperCase(), {
            activator: ls.callsign,
            frequency: ls.frequency,
            mode: ls.mode,
            comments: ls.comment,
            spotTime: ls.created_at,
          });
        }
      }

      // Map OOPT Russian titles from SQLite
      const ooptTitlesMap = new Map();
      try {
        const ooptRows = db.prepare('SELECT pota_ref, title FROM oopt_registry WHERE pota_ref IS NOT NULL').all();
        for (const r of ooptRows) {
          if (r.pota_ref) {
            ooptTitlesMap.set(r.pota_ref.toUpperCase(), r.title);
          }
        }
      } catch (e) {}

      const search = (req.query.search || '').trim().toUpperCase();
      const searchEn = search ? transliterateRuToEn(search).toUpperCase() : '';
      const activeOnly = req.query.activeOnly === 'true';

      const mapped = allParks.map(p => {
        const pRef = (p.reference || '').toUpperCase();
        const spot = activeSpotsMap.get(pRef);
        const isActive = Boolean(spot);
        const freqKHz = spot ? parseFloat(spot.frequency || 0) : 0;
        const freqMHz = freqKHz > 1000 ? (freqKHz / 1000).toFixed(3) : (freqKHz || 0);
        const titleRu = ooptTitlesMap.get(pRef) || null;

        return {
          ...p,
          titleRu,
          isActive,
          activeStation: isActive ? `${spot.activator} (${freqMHz} MHz ${spot.mode})` : null,
          activeCallsign: isActive ? spot.activator : null,
          activeFreq: isActive ? freqMHz : null,
          activeMode: isActive ? spot.mode : null,
        };
      });

      const filtered = mapped.filter(p => {
        if (activeOnly && !p.isActive) return false;
        if (search) {
          const pRef = (p.reference || '').toUpperCase();
          const pName = (p.name || '').toUpperCase();
          const pRegion = (p.region || '').toUpperCase();
          const pTitleRu = (p.titleRu || '').toUpperCase();
          return (
            pRef.includes(search) ||
            pName.includes(search) ||
            (searchEn && pName.includes(searchEn)) ||
            (pTitleRu && pTitleRu.includes(search)) ||
            pRegion.includes(search) ||
            (searchEn && pRegion.includes(searchEn))
          );
        }
        return true;
      });

      res.json({
        total: filtered.length,
        activeCount: filtered.filter(p => p.isActive).length,
        parks: filtered,
      });
    } catch (err) {
      console.error('[TMA API] Error in /parks:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ==========================================
  // 2.2. GET /api/tma/raza - RAZA Zones from R1CF
  // ==========================================
  router.get('/raza', async (req, res) => {
    try {
      const now = Date.now();
      if (!cachedRaza || now - lastRazaFetchTime > 24 * 60 * 60 * 1000) {
        try {
          const wfsUrl = 'https://map.r1cf.ru/geoserver/cite/wfs?SERVICE=WFS&REQUEST=GetFeature&TypeName=RAZAX&VERSION=1.1.0&outputFormat=application/json';
          const r = await axios.get(wfsUrl, { timeout: 20000 });
          if (r.data && Array.isArray(r.data.features)) {
            cachedRaza = r.data.features.map(f => {
              const p = f.properties || {};
              return {
                reference: p.desc3 || '',
                name: p.name || '',
                lat: parseFloat(p.lat) || 0,
                lon: parseFloat(p.lon) || 0,
                link: p.link || '',
                type: 'raza',
              };
            }).filter(z => z.lat !== 0 && z.lon !== 0 && z.reference);
            lastRazaFetchTime = now;
            console.log(`[TMA API] Cached ${cachedRaza.length} RAZA zones from R1CF`);
          }
        } catch (e) {
          console.warn('[TMA API] Failed to fetch RAZA from R1CF WFS:', e.message);
        }
      }

      const search = (req.query.search || '').trim().toUpperCase();
      let list = cachedRaza || [];
      if (search) {
        list = list.filter(z => 
          z.reference.toUpperCase().includes(search) || 
          z.name.toUpperCase().includes(search)
        );
      }

      res.json({
        total: list.length,
        zones: list,
      });
    } catch (err) {
      console.error('[TMA API] Error in /raza:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ==========================================
  // 2.3. GET /api/tma/airfields - Search Airfields (RAFA)
  // ==========================================
  router.get('/airfields', async (req, res) => {
    try {
      const query = (req.query.q || '').trim().toUpperCase();
      if (!query || query.length < 2) {
        return res.json({ airfields: [] });
      }

      const clean = query.replace(/'/g, "''");
      const cql = `ICAO LIKE '%${clean}%' OR NAME LIKE '%${clean}%'`;
      const wfsUrl = `https://map.r1cf.ru/geoserver/cite/wfs?SERVICE=WFS&REQUEST=GetFeature&TypeName=aopax&VERSION=1.1.0&outputFormat=application/json&maxFeatures=10&CQL_FILTER=${encodeURIComponent(cql)}`;

      const r = await axios.get(wfsUrl, { timeout: 15000 });
      let list = [];
      if (r.data && Array.isArray(r.data.features)) {
        list = r.data.features.map(f => {
          const p = f.properties || {};
          return {
            icao: p.ICAO || '',
            name: p.NAME || '',
            type: p.TYPE || 'Аэродром',
            city: p.CITY || '',
            lat: parseFloat(p.Latitude) || 0,
            lon: parseFloat(p.Longitude) || 0,
          };
        }).filter(a => a.lat !== 0 && a.lon !== 0 && a.icao);
      }

      res.json({ airfields: list });
    } catch (err) {
      console.error('[TMA API] Error in /airfields:', err.message);
      res.status(500).json({ airfields: [] });
    }
  });

  // ==========================================
  // 2.4. GET /api/tma/lookup/callsign/:callsign
  // ==========================================
  router.get('/lookup/callsign/:callsign', async (req, res) => {
    try {
      const callsign = (req.params.callsign || '').trim().toUpperCase();
      if (!callsign) {
        return res.status(400).json({ error: 'Callsign is required' });
      }

      const tgUser = req.telegramUser;
      const cleanCall = callsign.split('/')[0];

      // Auto-route: if the requested callsign is actually a park reference (e.g. RU-0192, JP-1169), redirect to park lookup
      if (parkRegex.test(callsign) || parkRegex.test(cleanCall)) {
        const parkRef = parkRegex.test(callsign) ? callsign : cleanCall;
        return res.redirect(307, `/api/tma/lookup/park/${encodeURIComponent(parkRef)}`);
      }

      // Check cache first
      let profileData = null;
      const cached = statsCache.get(cleanCall);
      const now = Date.now();

      if (cached && (now - cached.timestamp) < STATS_CACHE_TTL_MS && cached.fullProfile) {
        profileData = cached.fullProfile;
      } else {
        try {
          const raw = await potaApi.getStats(cleanCall);
          profileData = {
            callsign: raw.callsign || cleanCall,
            name: raw.name || '',
            qth: raw.qth || '',
            grid: raw.grid || '',
            activator: {
              activations: raw.stats?.activator?.activations || 0,
              parks: raw.stats?.activator?.parks || 0,
              qsos: raw.stats?.activator?.qsos || 0,
            },
            hunter: {
              parks: raw.stats?.hunter?.parks || 0,
              qsos: raw.stats?.hunter?.qsos || 0,
            },
            awards: raw.stats?.awards || 0,
            recentActivations: Array.isArray(raw.recent_activity?.activations) 
              ? raw.recent_activity.activations.map(act => ({
                  date: act.date || '',
                  reference: act.reference || '',
                  park: act.park || '',
                  location: act.location || '',
                  cw: act.cw || 0,
                  data: act.data || 0,
                  phone: act.phone || 0,
                  total: act.total || 0,
                }))
              : [],
            recentHunts: Array.isArray(raw.recent_activity?.hunter_qsos)
              ? raw.recent_activity.hunter_qsos.map(h => ({
                  date: h.date ? h.date.split('T')[0] : '',
                  callsign: h.callsign || '',
                  band: h.band || '',
                  mode: h.mode || '',
                  reference: h.reference || '',
                  park: h.park || '',
                  location: h.location || '',
                }))
              : [],
          };
          statsCache.set(cleanCall, { 
            data: {
              activations: profileData.activator.activations,
              uniqueParks: profileData.activator.parks,
              qsos: profileData.activator.qsos,
              workedParks: profileData.hunter.parks,
              dxcc: profileData.hunter.qsos,
              confirmed: profileData.awards,
            }, 
            fullProfile: profileData,
            timestamp: now 
          });
        } catch (e) {
          return res.status(404).json({ error: `Позывной ${cleanCall} не найден в базе POTA.` });
        }
      }

      // Check subscription
      const isSubscribed = Boolean(tgUser && db.prepare(
        'SELECT 1 FROM subscriptions WHERE telegram_id = ? AND type = ? AND target = ?'
      ).get(tgUser.id, 'callsign', cleanCall));

      res.json({
        ...profileData,
        isSubscribed,
      });
    } catch (err) {
      console.error('[TMA API] Error in /lookup/callsign:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ==========================================
  // 2.5. GET /api/tma/lookup/park/:ref
  // ==========================================
  router.get('/lookup/park/:ref', async (req, res) => {
    try {
      const ref = (req.params.ref || '').trim().toUpperCase();
      if (!ref) {
        return res.status(400).json({ error: 'Park reference is required' });
      }

      // Auto-route: if the requested ref is actually a callsign (e.g. R9OGL, UA9OTW), redirect to callsign lookup
      if (!parkRegex.test(ref) && baseCallsignRegex.test(ref)) {
        return res.redirect(307, `/api/tma/lookup/callsign/${encodeURIComponent(ref)}`);
      }

      const tgUser = req.telegramUser;
      const dbUser = req.dbUser;

      // Operator callsign for personalized matching:
      // Can be supplied via query param ?callsign=... or obtained from authenticated telegram session
      const rawUserCallsign = (req.query.callsign || dbUser?.callsign || '').trim().toUpperCase();
      const userCallsign = baseCallsignRegex.test(rawUserCallsign) ? rawUserCallsign : (dbUser?.callsign || '');
      const cleanUserCall = userCallsign ? getBaseCallsign(userCallsign) : null;

      // Check in-memory cache for full park details
      let parkDetails = null;
      const now = Date.now();
      const cached = parkDetailsCache.get(ref);

      if (cached && (now - cached.timestamp) < PARK_DETAILS_CACHE_TTL_MS) {
        parkDetails = cached.data;
      } else {
        // Fetch park info, leaderboards and activations from POTA in parallel
        try {
          const [parkRes, leaderboardRes, activationsRes] = await Promise.allSettled([
            potaApi.getPark(ref),
            potaApi.getParkLeaderboard(ref),
            potaApi.getParkActivations(ref)
          ]);

          if (parkRes.status === 'fulfilled' && parkRes.value && (parkRes.value.name || parkRes.value.reference)) {
            const p = parkRes.value;
            const lb = leaderboardRes.status === 'fulfilled' && leaderboardRes.value ? leaderboardRes.value : {};
            const actList = activationsRes.status === 'fulfilled' && Array.isArray(activationsRes.value) ? activationsRes.value : [];

            // Rank leaderboards
            const activationsLb = Array.isArray(lb.activations) ? lb.activations.map((item, idx) => ({
              rank: idx + 1,
              callsign: (item.callsign || '').toUpperCase(),
              count: parseInt(item.count, 10) || 0,
            })) : [];

            const activatorQsosLb = Array.isArray(lb.activator_qsos) ? lb.activator_qsos.map((item, idx) => ({
              rank: idx + 1,
              callsign: (item.callsign || '').toUpperCase(),
              count: parseInt(item.count, 10) || 0,
            })) : [];

            const hunterQsosLb = Array.isArray(lb.hunter_qsos) ? lb.hunter_qsos.map((item, idx) => ({
              rank: idx + 1,
              callsign: (item.callsign || '').toUpperCase(),
              count: parseInt(item.count, 10) || 0,
            })) : [];

            const recentActs = actList.slice(0, 30).map(a => ({
              callsign: (a.activeCallsign || '').toUpperCase(),
              date: a.qso_date ? `${a.qso_date.substring(0,4)}-${a.qso_date.substring(4,6)}-${a.qso_date.substring(6,8)}` : '',
              totalQSOs: a.totalQSOs || 0,
              cw: a.qsosCW || 0,
              data: a.qsosDATA || 0,
              phone: a.qsosPHONE || 0,
              location: a.locationDesc || ''
            }));

            parkDetails = {
              reference: p.reference || ref,
              name: p.name || 'Парк POTA',
              lat: parseFloat(p.latitude) || 0,
              lon: parseFloat(p.longitude) || 0,
              grid: p.grid6 || p.grid4 || p.grid || '',
              grid4: p.grid4 || '',
              grid6: p.grid6 || '',
              region: p.locationDesc || '',
              locationName: p.locationName || '',
              entityName: p.entityName || '',
              parktypeDesc: p.parktypeDesc || 'Park',
              activations: p.activations || 0,
              qsos: p.qsos || 0,
              attempts: p.attempts || 0,
              firstActivator: p.firstActivator ? p.firstActivator.toUpperCase() : null,
              firstActivationDate: p.firstActivationDate || null,
              accessMethods: p.accessMethods || null,
              activationMethods: p.activationMethods || null,
              website: p.website || null,
              parkComments: p.parkComments || null,
              leaderboard: {
                activations: activationsLb,
                activator_qsos: activatorQsosLb,
                hunter_qsos: hunterQsosLb,
              },
              recentActivations: recentActs,
            };

            // Save in cache
            parkDetailsCache.set(ref, { data: parkDetails, timestamp: now });
          }
        } catch (e) {
          console.warn(`[TMA API] Warning fetching park details for ${ref}:`, e.message);
        }
      }

      // Fallback to cachedParks if direct POTA endpoint fails
      if (!parkDetails && cachedParks) {
        const found = cachedParks.find(p => p.reference.toUpperCase() === ref);
        if (found) {
          parkDetails = {
            ...found,
            grid4: found.grid ? found.grid.substring(0, 4) : '',
            grid6: found.grid || '',
            leaderboard: { activations: [], activator_qsos: [], hunter_qsos: [] },
            recentActivations: [],
          };
        }
      }

      if (!parkDetails) {
        return res.status(404).json({ error: `Парк с кодом ${ref} не найден.` });
      }

      // Personalized operator matching
      let myStats = null;
      if (cleanUserCall) {
        const actEntry = parkDetails.leaderboard?.activations?.find(i => getBaseCallsign(i.callsign) === cleanUserCall);
        const qsoEntry = parkDetails.leaderboard?.activator_qsos?.find(i => getBaseCallsign(i.callsign) === cleanUserCall);
        const huntEntry = parkDetails.leaderboard?.hunter_qsos?.find(i => getBaseCallsign(i.callsign) === cleanUserCall);
        const isFirst = Boolean(parkDetails.firstActivator && getBaseCallsign(parkDetails.firstActivator) === cleanUserCall);
        const myActivations = (parkDetails.recentActivations || []).filter(a => getBaseCallsign(a.callsign) === cleanUserCall);

        myStats = {
          callsign: userCallsign,
          cleanCallsign: cleanUserCall,
          hasActivity: Boolean(actEntry || qsoEntry || huntEntry || isFirst || myActivations.length > 0),
          isFirstActivator: isFirst,
          activations: actEntry ? { count: actEntry.count, rank: actEntry.rank } : { count: 0, rank: null },
          activatorQsos: qsoEntry ? { count: qsoEntry.count, rank: qsoEntry.rank } : { count: 0, rank: null },
          hunterQsos: huntEntry ? { count: huntEntry.count, rank: huntEntry.rank } : { count: 0, rank: null },
          myActivationsCount: myActivations.length,
        };
      }

      // Top activator summary for backward compatibility
      const topAct = parkDetails.leaderboard?.activations?.[0];
      const topActivator = topAct ? `${topAct.callsign} (${topAct.count})` : null;

      // Check if currently active in spots (within last 45 minutes)
      let activeSpot = null;
      if (Array.isArray(cachedSpots)) {
        activeSpot = cachedSpots.find(s => s.reference?.toUpperCase() === ref && getDiffMinutes(s.spotTime) <= 45);
      }
      if (!activeSpot) {
        const local = db.prepare(`
          SELECT callsign, frequency, mode, comment, created_at 
          FROM spots 
          WHERE reference = ? AND source != 'cluster_throttled' AND created_at >= datetime('now', '-45 minutes')
          ORDER BY created_at DESC LIMIT 1
        `).get(ref);
        if (local && getDiffMinutes(local.created_at) <= 45) {
          activeSpot = {
            activator: local.callsign,
            frequency: local.frequency,
            mode: local.mode,
            comments: local.comment,
          };
        }
      }

      // Check subscription
      const isSubscribed = Boolean(tgUser && db.prepare(
        'SELECT 1 FROM subscriptions WHERE telegram_id = ? AND type = ? AND target = ?'
      ).get(tgUser.id, 'park', ref));

      res.json({
        ...parkDetails,
        topActivator,
        myStats,
        isActive: Boolean(activeSpot),
        activeSpot: activeSpot ? {
          callsign: activeSpot.activator,
          freq: (parseFloat(activeSpot.frequency) > 1000 ? (parseFloat(activeSpot.frequency)/1000).toFixed(3) : activeSpot.frequency),
          mode: activeSpot.mode,
          comments: activeSpot.comments || '',
        } : null,
        isSubscribed,
      });
    } catch (err) {
      console.error('[TMA API] Error in /lookup/park:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });




  // ==========================================
  // 3. POST /api/tma/spots - Publish / Respot (Registered & Approved Operators Only)
  // ==========================================
  router.post('/spots', async (req, res) => {
    try {
      const tgUser = req.telegramUser;
      let dbUser = req.dbUser;
      if (!dbUser && tgUser && tgUser.id) {
        dbUser = db.prepare('SELECT telegram_id, callsign, status FROM users WHERE telegram_id = ?').get(tgUser.id);
      }

      if (!dbUser || !dbUser.callsign) {
        return res.status(401).json({
          error: 'Публикация спотов в эфире доступна только зарегистрированным операторам. Пожалуйста, войдите в аккаунт.',
          code: 'AUTH_REQUIRED'
        });
      }

      if (dbUser.status === 'pending') {
        return res.status(403).json({
          error: 'Ваш позывной находится на проверке администратором. Публикация спотов станет доступна сразу после одобрения заявки.',
          code: 'APPROVAL_PENDING'
        });
      }

      if (dbUser.status !== 'approved') {
        return res.status(403).json({
          error: 'У вашего аккаунта нет прав для отправки спотов.',
          code: 'FORBIDDEN'
        });
      }

      const registeredCallsign = dbUser.callsign.toUpperCase().trim();
      let reqCall = (req.body?.callsign || '').trim().toUpperCase();
      let activatorCall = registeredCallsign;
      let isThirdPartySpot = false;

      if (reqCall && reqCall !== registeredCallsign) {
        if (!baseCallsignRegex.test(reqCall) || !hasLetterRegex.test(reqCall)) {
          return res.status(400).json({ error: 'Неверный формат позывного оператора. Пример: R9OGL, RA3ABC, R9OGL/P' });
        }
        activatorCall = reqCall;
        isThirdPartySpot = true;
      }

      const spotSource = tgUser?.isWeb ? 'webapp' : (tgUser?.username ? `tma (@${tgUser.username})` : 'tma');

      const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '').toString().split(',')[0].trim();

      let { reference, frequency, mode, comment, rda, pwr, timeStr } = req.body || {};

      if (!reference || !frequency || !mode) {
        return res.status(400).json({ error: 'Укажите парк, частоту и модуляцию.' });
      }

      reference = reference.trim().toUpperCase();
      if (!parkRegex.test(reference)) {
        return res.status(400).json({ error: 'Неверный формат парка. Пример: RU-0073' });
      }

      mode = mode.trim().toUpperCase();
      if (!VALID_MODES.includes(mode)) {
        return res.status(400).json({ error: `Недопустимая модуляция. Допустимы: ${VALID_MODES.join(', ')}` });
      }

      // Frequency normalization: convert to kHz string (e.g. "14144" or "14.144" -> 14144)
      let freqNum = parseFloat(String(frequency).replace(',', '.'));
      if (isNaN(freqNum) || freqNum <= 0) {
        return res.status(400).json({ error: 'Некорректная частота.' });
      }
      if (freqNum < 1000) {
        freqNum = Math.round(freqNum * 1000); // 14.144 MHz -> 14144 kHz
      }

      const freqMHz = (freqNum / 1000).toFixed(3);
      comment = (comment || '').trim();
      rda = (rda || '').trim().toUpperCase();
      pwr = (pwr || '').trim();
      timeStr = (timeStr || '').trim();

      // Resolve Park Name
      let parkName = reference;
      try {
        const parkInfo = await potaApi.getPark(reference);
        if (parkInfo && parkInfo.name) {
          parkName = parkInfo.name;
        }
      } catch (e) {
        // Safe fallback
      }

      // Assemble full comment with RDA & Power (identical to bot formatting)
      let commentParts = [];
      if (timeStr) commentParts.push(`QRT ~${timeStr.replace(/^до\s*/i, '')}`);
      if (comment) commentParts.push(comment);
      if (pwr && pwr !== '-') commentParts.push(pwr);
      if (rda && rda !== '-') commentParts.push(`RDA: ${rda}`);
      let fullComment = commentParts.length > 0 ? commentParts.join(' | ') : comment;

      const spotData = {
        callsign: activatorCall,
        reference,
        parkName,
        freq: String(freqNum),
        frequency: String(freqNum),
        freqMHz,
        mode,
        pwr: pwr || '',
        rda: rda || '',
        comment: fullComment,
        baseComment: comment || '',
        timeStr: timeStr || '',
        status: 'СЕЙЧАС НА СВЯЗИ',
        source: spotSource,
        ip_address: clientIp,
        startedAt: new Date().toISOString(),
      };

      console.log(`\x1b[36m[TMA API Spot]\x1b[0m 📻 \x1b[1m${activatorCall}\x1b[0m -> ${reference} (${freqMHz} MHz, ${mode}) | Споттер: \x1b[32m${registeredCallsign}\x1b[0m | Источник: \x1b[33m${spotSource}\x1b[0m | IP: \x1b[90m${clientIp || 'unknown'}\x1b[0m`);

      // 1. Save in SQLite
      const insertResult = db.prepare(`
        INSERT INTO spots (callsign, reference, frequency, mode, comment, source, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(activatorCall, reference, String(freqNum), mode, fullComment, spotSource, clientIp);

      // 2. Broadcast to Telegram Activity Channel if available
      let channelMsgId = null;
      if (telegramClient && ACTIVITY_CHANNEL_ID && !isBroadcastMutedCallsign(activatorCall)) {
        try {
          let channelId = ACTIVITY_CHANNEL_ID;
          if (channelId.includes('t.me/')) {
            channelId = '@' + channelId.split('t.me/')[1].replace('/', '');
          }

          // If user had a previous spot and is self-spotting, unpin it in channel and delete from discussion group
          if (tgUser && tgUser.id && !isThirdPartySpot) {
            const prevUser = db.prepare('SELECT last_spot_msg_id FROM users WHERE telegram_id = ?').get(tgUser.id);
            if (prevUser && prevUser.last_spot_msg_id) {
              try {
                await pinManager.unpinSpotNow(telegramClient, channelId, prevUser.last_spot_msg_id);
              } catch (unpinErr) {}
            }
          }

          const rdaStr = rda && rda !== '-' ? ` (RDA: ${rda})` : '';
          const pwrStr = pwr && pwr !== '-' ? ` | ${pwr}` : '';
          const timeQrtStr = timeStr ? ` (до ${timeStr.replace(/^до\s*/i, '')})` : '';
          const dateStr = new Date().toLocaleDateString('ru-RU');

          const baseCall = getBaseCallsign(activatorCall);
          const actLink = `<a href="https://next.pota.app/profile/${encodeURIComponent(baseCall)}">${activatorCall}</a>`;
          const refLink = `<a href="https://next.pota.app/park/${reference}">${reference}</a>`;
          const sourceFooter = isThirdPartySpot
            ? `🌐 <i>Заспотил: <b>${registeredCallsign}</b> через RU-POTA Hub</i>`
            : (spotSource.includes('guest') 
                ? '🌐 <i>Отправлено через RU-POTA Web</i>' 
                : '📱 <i>Отправлено через RU-POTA Hub</i>');

          const msg = `📅 <b>${dateStr} [СЕЙЧАС НА СВЯЗИ]${timeQrtStr}</b>\n` +
                      `📻 <b>${actLink}</b>\n` +
                      `🏞️ <b>${refLink}</b> ${parkName}${rdaStr}\n` +
                      `⚙️ Freq: <b>${freqMHz} MHz</b> | <b>${mode}</b>${pwrStr}\n` +
                      (fullComment ? `📝 <i>${fullComment}</i>\n` : '') +
                      `\n${sourceFooter}`;

          const sent = await telegramClient.sendMessage(channelId, msg, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
          });
          channelMsgId = sent.message_id;

          // Pin spot silently in channel, schedule auto-unpin, and clean up Telegram's pin service message
          await pinManager.pinSpotInChannel(telegramClient, channelId, channelMsgId);

          // Update msg_id in spots table
          db.prepare('UPDATE spots SET msg_id = ? WHERE id = ?').run(channelMsgId, insertResult.lastInsertRowid);
        } catch (e) {
          console.warn('[TMA API] Channel broadcast error:', e.message);
        }
      }

      // 3. Update user's active spot in users table (if self-spotting)
      if (dbUser && tgUser && !isThirdPartySpot) {
        db.prepare(`
          UPDATE users 
          SET last_spot_data = ?, last_spot_msg_id = ? 
          WHERE telegram_id = ?
        `).run(JSON.stringify(spotData), channelMsgId, tgUser.id);
      }

      // 4. Send to official POTA cluster (if not mocked)
      try {
        const postedSpotId = await potaApi.postSpot({
          activator: activatorCall,
          spotter: registeredCallsign,
          reference,
          frequency: String(freqNum),
          mode,
          comments: isThirdPartySpot
            ? (comment ? `${comment} (spot via ${registeredCallsign})` : `Spot via ${registeredCallsign}`)
            : comment,
        });
        if (postedSpotId && postedSpotId > 0) {
          db.prepare('UPDATE spots SET spot_id = ? WHERE id = ?').run(postedSpotId, insertResult.lastInsertRowid);
        }
      } catch (e) {
        console.warn('[TMA API] Post to POTA API cluster warning:', e.message);
      }

      // 5. Notify Subscribers of this operator and park
      if (telegramClient) {
        try {
          const cleanCall = activatorCall.split('/')[0].toUpperCase();
          const subscribers = db.prepare(`
            SELECT DISTINCT telegram_id FROM subscriptions 
            WHERE (type = 'callsign' AND UPPER(target) = ?)
               OR (type = 'park' AND UPPER(target) = ?)
          `).all(cleanCall, reference);

          for (const sub of subscribers) {
            if (tgUser && sub.telegram_id === tgUser.id) continue;
            const spotterNote = isThirdPartySpot ? `\n👤 Споттер: <b>${registeredCallsign}</b>` : '';
            const alertMsg = `🚨 <b>Спот по вашей подписке!</b>\n\n` +
                             `📻 Оператор: <b>${activatorCall}</b>\n` +
                             `🏞️ Парк: <b>${reference}</b> (${parkName})\n` +
                             `⚙️ Частота: <b>${freqMHz} MHz</b> (${mode})\n` +
                             (comment ? `📝 ${comment}\n` : '') +
                             spotterNote;
            telegramClient.sendMessage(sub.telegram_id, alertMsg, { parse_mode: 'HTML' }).catch(() => {});
          }
        } catch (e) {
          console.warn('[TMA API] Subscriber notification warning:', e.message);
        }
      }

      res.json({
        success: true,
        message: isThirdPartySpot
          ? `Спот на оператора ${activatorCall} успешно опубликован!`
          : 'Спот успешно опубликован!',
        activeSpot: isThirdPartySpot ? null : spotData,
        isThirdPartySpot
      });
    } catch (err) {
      console.error('[TMA API] Error publishing spot:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // 4. POST /api/tma/spots/qrt - Finish Session
  // ==========================================
  router.post('/spots/qrt', async (req, res) => {
    try {
      const tgUser = req.telegramUser;
      let existingUser = null;
      if (tgUser && tgUser.id) {
        existingUser = db.prepare('SELECT last_spot_msg_id, last_spot_data, status, callsign FROM users WHERE telegram_id = ?').get(tgUser.id);
      }

      let channelId = ACTIVITY_CHANNEL_ID;
      if (channelId) {
        if (!channelId.startsWith('-100') && !channelId.startsWith('@') && /^[0-9-]+$/.test(channelId)) {
          channelId = channelId.startsWith('-') ? `-100${channelId.substring(1)}` : `-100${channelId}`;
        } else if (channelId.includes('t.me/')) {
          channelId = '@' + channelId.split('t.me/')[1].replace('/', '');
        }
      }

      let spotData = null;
      if (existingUser && existingUser.last_spot_data) {
        try {
          spotData = JSON.parse(existingUser.last_spot_data);
        } catch (e) {}
      } else if (req.body?.reference && req.body?.callsign) {
        spotData = {
          callsign: req.body.callsign,
          reference: req.body.reference,
          frequency: req.body.frequency || '14000',
          mode: req.body.mode || 'SSB',
          parkName: req.body.parkName || ''
        };
      }

      const actCall = (existingUser?.callsign || spotData?.callsign || req.body?.callsign || '').toUpperCase().trim();
      const parkRef = (spotData?.reference || req.body?.reference || '').toUpperCase().trim();

      if (!actCall || !parkRef) {
        return res.status(400).json({ error: 'Не указан позывной или парк для завершения сессии (QRT).' });
      }

      // 1. Unpin active spot in channel and delete from discussion group
      let spotMsgId = existingUser?.last_spot_msg_id;
      if (!spotMsgId && channelId) {
        try {
          const row = db.prepare(`
            SELECT msg_id FROM spots 
            WHERE (UPPER(callsign) = ? OR UPPER(callsign) LIKE ?) 
              AND UPPER(reference) = ? 
              AND msg_id IS NOT NULL 
            ORDER BY id DESC LIMIT 1
          `).get(actCall, `${actCall}/%`, parkRef);
          if (row?.msg_id) {
            spotMsgId = row.msg_id;
          }
        } catch (dbErr) {}
      }

      if (spotMsgId && channelId) {
        try {
          await pinManager.unpinSpotNow(telegramClient, channelId, spotMsgId);
        } catch (unpinErr) {
          console.warn('[TMA API QRT] Unpin error:', unpinErr.message);
        }
      }

      // 2. Send official QRT spot to POTA API cluster
      try {
        await potaApi.postSpot({
          activator: actCall,
          spotter: actCall,
          reference: parkRef,
          frequency: String(spotData?.frequency || spotData?.freq || '14000'),
          mode: spotData?.mode || 'SSB',
          comments: 'QRT 73!',
        });
        console.log(`[TMA API QRT] Posted QRT spot to POTA cluster for ${parkRef} (${actCall})`);
      } catch (e) {
        console.warn('[TMA API QRT] Post to POTA cluster warning:', e.message);
      }

      // 3. Broadcast unpinned QRT completion notice in channel
      if (telegramClient && channelId) {
        try {
          const parkInfo = spotData?.parkName ? ` (${spotData.parkName})` : '';
          const sourceTag = existingUser ? 'RU-POTA Hub' : 'RU-POTA Web';
          const qrtMsg = `🛑 <b>СЕССИЯ В ЭФИРЕ ЗАВЕРШЕНА (QRT)</b>\n\n` +
                         `📻 Оператор: <b>${actCall}</b>\n` +
                         `🏞️ Парк: <b>${parkRef}</b>${parkInfo}\n` +
                         `🌲 <i>Спасибо за активацию! Всем 73 & 44!</i>\n\n` +
                         `📱 <i>Отправлено через ${sourceTag}</i>`;
          await telegramClient.sendMessage(channelId, qrtMsg, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
          });
        } catch (e) {
          console.warn('[TMA API QRT] Channel broadcast error:', e.message);
        }
      }

      if (tgUser && existingUser) {
        db.prepare(`
          UPDATE users 
          SET last_spot_data = NULL, last_spot_msg_id = NULL 
          WHERE telegram_id = ?
        `).run(tgUser.id);
        console.log(`[TMA API] Operator ${tgUser.id} (${existingUser.callsign}) went QRT`);
      }

      res.json({
        success: true,
        message: 'Сессия в эфире завершена (QRT). Спот отправлен на POTA, закрепы сняты. Спасибо за активацию! 73 & 44',
      });
    } catch (err) {
      console.error('[TMA API] Error in QRT:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ==========================================
  // 5. GET /api/tma/subscriptions - Get Subs
  // ==========================================
  router.get('/subscriptions', requireTmaAuth, (req, res) => {
    try {
      const tgUser = req.telegramUser;
      const userRecord = db.prepare('SELECT notifications_enabled FROM users WHERE telegram_id = ?').get(tgUser.id);
      const notificationsEnabled = userRecord ? Boolean(userRecord.notifications_enabled ?? 1) : true;

      const rows = db.prepare(`
        SELECT id, type, target, target_name, created_at 
        FROM subscriptions 
        WHERE telegram_id = ? 
        ORDER BY created_at DESC
      `).all(tgUser.id);

      const callsigns = rows.filter(r => r.type === 'callsign');
      const parks = rows.filter(r => r.type === 'park');

      res.json({
        callsigns,
        parks,
        total: rows.length,
        notifications_enabled: notificationsEnabled,
      });
    } catch (err) {
      console.error('[TMA API] Error fetching subscriptions:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ==========================================
  // 6. POST /api/tma/subscriptions/toggle-alerts
  // ==========================================
  router.post('/subscriptions/toggle-alerts', requireTmaAuth, async (req, res) => {
    try {
      const tgUser = req.telegramUser;
      const { enabled } = req.body;
      const val = enabled ? 1 : 0;
      db.prepare('UPDATE users SET notifications_enabled = ? WHERE telegram_id = ?').run(val, tgUser.id);
      console.log(`[TMA API] Operator ${tgUser.id} toggled DM alerts to: ${val === 1 ? 'ON' : 'OFF'}`);

      // Interactive Telegram notification right in user's DM
      if (telegramClient) {
        try {
          const alertMsg = val === 1
            ? '🔔 <b>Оповещения в ЛС включены!</b>\n\nБот снова будет присылать вам мгновенные сообщения о спотах ваших избранных позывных и парков POTA.\n\n<i>Настроить подписки можно в приложении или командой /sub.</i>'
            : '🔕 <b>Оповещения в ЛС отключены</b>\n\nБот не будет беспокоить вас сообщениями в ЛС. Ваши подписки сохранены.\n\n<i>Оповещения отключены до тех пор, пока вы снова не включите их в приложении или в меню /sub.</i>';

          await telegramClient.sendMessage(tgUser.id, alertMsg, { parse_mode: 'HTML' });
        } catch (tgErr) {
          console.warn('[TMA API] Could not send DM alert notification to user:', tgErr.message);
        }
      }

      res.json({ success: true, notifications_enabled: val === 1 });
    } catch (err) {
      console.error('[TMA API] Error toggling alerts:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });


  // ==========================================
  // 7. POST /api/tma/subscriptions - Add Sub
  // ==========================================
  router.post('/subscriptions', requireTmaAuth, async (req, res) => {
    try {
      const tgUser = req.telegramUser;
      let { type, target } = req.body;

      if (!type || !target) {
        return res.status(400).json({ error: 'Укажите тип подписки (callsign / park) и цель.' });
      }

      type = type.toLowerCase();
      target = target.trim().toUpperCase();

      let targetName = null;

      if (type === 'callsign') {
        if (!baseCallsignRegex.test(target) || !hasLetterRegex.test(target)) {
          return res.status(400).json({ error: 'Некорректный радиолюбительский позывной. Пример: R9OGL' });
        }
        
        // Try resolve operator's real name from POTA API (same as bot's subWizard)
        try {
          const cleanCall = target.split('/')[0].toUpperCase();
          const stats = await potaApi.getStats(cleanCall);
          if (stats && stats.name) {
            targetName = stats.name;
          } else {
            targetName = 'Оператор POTA';
          }
        } catch (e) {
          targetName = 'Оператор POTA';
        }
      } else if (type === 'park') {
        if (!target.startsWith('RU-') && !target.includes('-')) {
          target = `RU-${target}`;
        }
        if (!parkRegex.test(target)) {
          return res.status(400).json({ error: 'Некорректный номер парка. Пример: RU-0073' });
        }
        // Try resolve park name from POTA API
        try {
          const park = await potaApi.getPark(target);
          if (park && park.name) {
            targetName = park.name;
          }
        } catch (e) {
          targetName = 'Заповедник POTA';
        }
      } else {
        return res.status(400).json({ error: 'Недопустимый тип подписки. Допустимо: callsign или park.' });
      }


      // Check for limit (e.g. max 50 subscriptions)
      const count = db.prepare('SELECT COUNT(*) as c FROM subscriptions WHERE telegram_id = ?').get(tgUser.id)?.c || 0;
      if (count >= 50) {
        return res.status(400).json({ error: 'Достигнут лимит подписок (максимум 50).' });
      }

      const stmt = db.prepare(`
        INSERT INTO subscriptions (telegram_id, type, target, target_name)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(telegram_id, type, target) DO UPDATE SET target_name = excluded.target_name
      `);

      const result = stmt.run(tgUser.id, type, target, targetName);

      res.json({
        success: true,
        subscription: {
          id: result.lastInsertRowid,
          type,
          target,
          target_name: targetName,
        }
      });
    } catch (err) {
      console.error('[TMA API] Error creating subscription:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // 7. DELETE /api/tma/subscriptions/:id
  // ==========================================
  router.delete('/subscriptions/:id', requireTmaAuth, (req, res) => {
    try {
      const tgUser = req.telegramUser;
      const subId = parseInt(req.params.id, 10);

      const result = db.prepare('DELETE FROM subscriptions WHERE id = ? AND telegram_id = ?').run(subId, tgUser.id);
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Подписка не найдена' });
      }

      res.json({ success: true, message: 'Подписка удалена' });
    } catch (err) {
      console.error('[TMA API] Error deleting subscription:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ==========================================
  // 7.1. DELETE /api/tma/subscriptions/target/:type/:target
  // ==========================================
  router.delete('/subscriptions/target/:type/:target', requireTmaAuth, (req, res) => {
    try {
      const tgUser = req.telegramUser;
      const type = (req.params.type || '').toLowerCase();
      const target = (req.params.target || '').trim().toUpperCase();
      const cleanTarget = target.split('/')[0];

      const result = db.prepare(`
        DELETE FROM subscriptions 
        WHERE telegram_id = ? AND type = ? AND (target = ? OR target = ?)
      `).run(tgUser.id, type, target, cleanTarget);

      res.json({ success: true, changes: result.changes });
    } catch (err) {
      console.error('[TMA API] Error deleting subscription by target:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ==========================================
  // 7.2. GET /api/tma/notifications - Live Alerts Feed
  // ==========================================
  router.get('/notifications', requireTmaAuth, (req, res) => {
    try {
      const tgUser = req.telegramUser;
      const notifications = db.prepare(`
        SELECT id, type, title, message, callsign, reference, frequency, mode, spot_time, is_read, created_at 
        FROM user_notifications 
        WHERE user_id = ? 
        ORDER BY id DESC 
        LIMIT 50
      `).all(tgUser.id);

      const unreadCount = db.prepare(`
        SELECT COUNT(*) as count 
        FROM user_notifications 
        WHERE user_id = ? AND is_read = 0
      `).get(tgUser.id)?.count || 0;

      res.json({
        notifications,
        unreadCount,
        total: notifications.length,
      });
    } catch (err) {
      console.error('[TMA API] Error fetching notifications:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ==========================================
  // 7.3. POST /api/tma/notifications/read-all - Mark all as read
  // ==========================================
  router.post('/notifications/read-all', requireTmaAuth, (req, res) => {
    try {
      const tgUser = req.telegramUser;
      db.prepare('UPDATE user_notifications SET is_read = 1 WHERE user_id = ?').run(tgUser.id);
      res.json({ success: true });
    } catch (err) {
      console.error('[TMA API] Error marking notifications read:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ==========================================
  // 7.4. DELETE /api/tma/notifications/:id - Delete single notification
  // ==========================================
  router.delete('/notifications/:id', requireTmaAuth, (req, res) => {
    try {
      const tgUser = req.telegramUser;
      const id = parseInt(req.params.id, 10);
      db.prepare('DELETE FROM user_notifications WHERE id = ? AND user_id = ?').run(id, tgUser.id);
      res.json({ success: true });
    } catch (err) {
      console.error('[TMA API] Error deleting notification:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ==========================================
  // 7.5. DELETE /api/tma/notifications - Clear all notifications
  // ==========================================
  router.delete('/notifications', requireTmaAuth, (req, res) => {
    try {
      const tgUser = req.telegramUser;
      db.prepare('DELETE FROM user_notifications WHERE user_id = ?').run(tgUser.id);
      res.json({ success: true });
    } catch (err) {
      console.error('[TMA API] Error clearing notifications:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ==========================================
  // 8. POST /api/tma/callsign/request
  // ==========================================
  router.post('/callsign/request', requireTmaAuth, async (req, res) => {
    try {
      const tgUser = req.telegramUser;
      let { newCallsign } = req.body;

      if (!newCallsign) {
        return res.status(400).json({ error: 'Укажите позывной' });
      }

      newCallsign = newCallsign.trim().toUpperCase();
      if (!baseCallsignRegex.test(newCallsign) || !hasLetterRegex.test(newCallsign)) {
        return res.status(400).json({ error: 'Некорректный формат позывного. Пример: R9OGL' });
      }

      // Upsert into users table with pending status and reset reject_reason
      db.prepare(`
        INSERT INTO users (telegram_id, callsign, status, reject_reason)
        VALUES (?, ?, 'pending', NULL)
        ON CONFLICT(telegram_id) DO UPDATE SET callsign = excluded.callsign, status = 'pending', reject_reason = NULL
      `).run(tgUser.id, newCallsign);

      console.log(`[TMA API] Callsign change request from user ${tgUser.id}: ${newCallsign}`);

      // Notify Admin via Telegram with interactive approve/reject buttons
      const adminId = process.env.ADMIN_ID;
      if (adminId && telegramClient) {
        try {
          const userLink = tgUser.username ? `@${tgUser.username}` : `<a href="tg://user?id=${tgUser.id}">${tgUser.first_name || 'пользователь'}</a>`;
          await telegramClient.sendMessage(
            adminId,
            `🔔 <b>Новая заявка на модерацию (из Mini App)!</b>\nПозывной: <b>${newCallsign}</b>\nОт: ${userLink}\nID: <code>${tgUser.id}</code>\n\n👉 Выберите действие ниже или зайдите в <a href="https://pota.r9o.ru/">админ-панель</a>.`,
            {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✅ Одобрить', callback_data: `admin_appr:${tgUser.id}` },
                    { text: '❌ Отклонить', callback_data: `admin_rej:${tgUser.id}` }
                  ]
                ]
              }
            }
          );
        } catch (adminErr) {
          console.error('[TMA API] Failed to notify admin about callsign request:', adminErr.message);
        }
      }

      res.json({
        success: true,
        message: `Заявка на позывной ${newCallsign} отправлена администраторам. Ожидайте подтверждения.`
      });
    } catch (err) {
      console.error('[TMA API] Error in callsign request:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // ООПТ (Russian Protected Areas) Directory
  // ==========================================
  router.get('/oopt', (req, res) => {
    try {
      const { page, limit, search, sig, category, status, region, pota } = req.query;
      const result = getOoptList({ page, limit, search, sig, category, status, region, pota });
      res.json(result);
    } catch (err) {
      console.error('[TMA API] Error fetching OOPT list:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/oopt/stats', (req, res) => {
    try {
      const stats = getOoptStats();
      res.json(stats);
    } catch (err) {
      console.error('[TMA API] Error fetching OOPT stats:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/oopt/translate', async (req, res) => {
    try {
      const text = req.query.text || '';
      const category = req.query.category || '';
      if (!text.trim()) {
        return res.status(400).json({ error: 'Параметр text обязателен' });
      }
      const clean = cleanOoptName(text, category);
      const translated = await translateOoptNameOnline(clean, category);
      res.json({ original: text, clean, translated });
    } catch (err) {
      console.error('[TMA API] Error translating OOPT name:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/oopt/:nid', async (req, res) => {
    try {
      const details = await getOoptDetails(req.params.nid);
      res.json(details);
    } catch (err) {
      console.error('[TMA API] Error fetching OOPT details:', err.message);
      res.status(err.message.includes('не найдено') ? 404 : 500).json({ error: err.message });
    }
  });

  // ==========================================
  // POTA GPX, WMS & Tiles for OsmAnd / GIS
  // ==========================================

  // 1. Full GPX 1.1 with tree icons for OsmAnd offline navigation
  router.get('/pota/gpx', (req, res) => {
    try {
      const gpx = generatePotaGpx(cachedParks);
      res.setHeader('Content-Type', 'application/gpx+xml; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="ru-pota-parks.gpx"');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(gpx);
    } catch (err) {
      console.error('[TMA API] Error generating GPX:', err);
      res.status(500).send('Error generating GPX');
    }
  });

  router.get('/pota.gpx', (req, res) => {
    res.redirect('/api/tma/pota/gpx');
  });

  // 2. WMS GetMap endpoint for OsmAnd WMS overlay
  router.get('/wms/pota', (req, res) => {
    try {
      const bboxStr = req.query.BBOX || req.query.bbox;
      if (!bboxStr) {
        res.setHeader('Content-Type', 'image/png');
        return res.send(getEmptyPng());
      }

      const bbox = parseWmsBbox(bboxStr);
      if (!bbox) {
        res.setHeader('Content-Type', 'image/png');
        return res.send(getEmptyPng());
      }

      const png = renderPotaTile(bbox, cachedParks);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(png);
    } catch (err) {
      console.error('[TMA API] WMS render error:', err);
      res.setHeader('Content-Type', 'image/png');
      res.send(getEmptyPng());
    }
  });

  // 3. XYZ / TMS Tile endpoint for OsmAnd Online Maps ({z}/{x}/{y}.png)
  router.get('/tiles/pota/:z/:x/:y.png', (req, res) => {
    try {
      const z = parseInt(req.params.z, 10);
      const x = parseInt(req.params.x, 10);
      const y = parseInt(req.params.y, 10);

      if (isNaN(z) || isNaN(x) || isNaN(y)) {
        res.setHeader('Content-Type', 'image/png');
        return res.send(getEmptyPng());
      }

      const bbox = tileToBbox(z, x, y);
      const png = renderPotaTile(bbox, cachedParks);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(png);
    } catch (err) {
      console.error('[TMA API] Tile render error:', err);
      res.setHeader('Content-Type', 'image/png');
      res.send(getEmptyPng());
    }
  });

  return router;
}

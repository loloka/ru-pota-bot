import express from 'express';
import cookieSession from 'cookie-session';
import db from '../db/database.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTmaRouter } from './tmaApi.js';
import { WELCOME_PINNED_POST } from '../bot/texts/welcomePost.js';
import { pinManager } from '../services/pinManager.js';
import { getOoptList, getOoptStats, getRegionalPotaStats, syncOoptRegistry } from '../services/ooptService.js';
import {
  auditPotaLinks,
  checkUrlOnline,
  formatSingleReplacement,
  formatBatchWikipediaReplacements,
  formatEmptyLinksReport,
  formatFullManuReport
} from '../services/potaAuditService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Console log ring buffer for Live Console
const MAX_LOGS = 200;
export const logBuffer = [];
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

function captureLog(type, args) {
  try {
    const msg = args.map(a => {
      if (typeof a === 'object') {
        try { return JSON.stringify(a); }
        catch (e) { return '[Object]'; }
      }
      return String(a);
    }).join(' ');
    const cleanMsg = msg.replace(/\x1b\[[0-9;]*m/g, '');
    logBuffer.push({ timestamp: new Date().toISOString(), type, message: cleanMsg });
    if (logBuffer.length > MAX_LOGS) logBuffer.shift();
  } catch (err) {
    // ignore
  }
}

console.log = (...args) => { captureLog('log', args); originalLog.apply(console, args); };
console.warn = (...args) => { captureLog('warn', args); originalWarn.apply(console, args); };
console.error = (...args) => { captureLog('error', args); originalError.apply(console, args); };

export const startAdminServer = (telegramClient) => {
  const app = express();
  app.set('trust proxy', 1);
  const PORT = process.env.PORT || 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Session configuration using cookie-session (survives server restarts)
  app.use(cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'rupota_admin_secret_key'],
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }));

  // Telegram Mini App static distribution (SPA)
  const webappDist = path.resolve(__dirname, '../../dist/webapp');
  app.use('/app', express.static(webappDist, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));
  app.get(/^\/app(\/.*)?$/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(webappDist, 'index.html'));
  });

  // Telegram Mini App REST API
  app.use('/api/tma', createTmaRouter(telegramClient));


  const failedAttempts = new Map();

  // Authentication Middleware
  const requireAuth = (req, res, next) => {
    if (req.session && req.session.authed) {
      return next();
    }
    if (req.xhr || req.path.startsWith('/api') || req.method === 'POST') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.redirect('/login');
  };

  // Login Page
  app.get('/login', (req, res) => {
    if (req.session && req.session.authed) {
      return res.redirect('/');
    }
    const html = `
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>RU-POTA Login</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
      </head>
      <body class="bg-light d-flex align-items-center justify-content-center" style="height: 100vh;">
        <div class="card shadow-sm" style="width: 100%; max-width: 400px;">
          <div class="card-body p-4">
            <h3 class="card-title text-center mb-4">RU-POTA Admin</h3>
            ${req.query.error ? '<div class="alert alert-danger">Неверный пароль или слишком много попыток.</div>' : ''}
            <form action="/login" method="POST">
              <div class="mb-3">
                <label class="form-label">Пароль администратора</label>
                <input type="password" name="password" class="form-control" required autofocus>
              </div>
              <button type="submit" class="btn btn-primary w-100">Войти</button>
            </form>
          </div>
        </div>
      </body>
      </html>
    `;
    res.send(html);
  });

  app.post('/login', (req, res) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const attempt = failedAttempts.get(ip) || { count: 0, lastTry: 0 };
    
    if (attempt.count >= 5 && (now - attempt.lastTry) < 15 * 60 * 1000) {
      return res.redirect('/login?error=ratelimit');
    }
    if (attempt.count >= 5 && (now - attempt.lastTry) >= 15 * 60 * 1000) {
      attempt.count = 0;
    }

    const adminPassword = process.env.ADMIN_PASSWORD || 'qwerty12345';
    const submittedPassword = (req.body && req.body.password) ? String(req.body.password) : '';
    if (submittedPassword && submittedPassword === adminPassword) {
      failedAttempts.delete(ip);
      req.session.authed = true;
      return res.redirect('/');
    }
    
    attempt.count += 1;
    attempt.lastTry = now;
    failedAttempts.set(ip, attempt);
    console.warn(`[Security] Failed admin login from ${ip} (Attempt ${attempt.count}/5)`);
    res.redirect('/login?error=1');
  });

  app.get('/logout', (req, res) => {
    req.session = null;
    res.redirect('/login');
  });

  // API for logs (SSE or polling)
  app.get('/api/logs', requireAuth, (req, res) => {
    res.json(logBuffer);
  });

  const userCache = new Map();

  app.get('/api/user-info/:id', requireAuth, async (req, res) => {
    const id = req.params.id;
    const numId = Number(id);
    if (numId < 0) {
      try {
        const dbUser = db.prepare('SELECT email, auth_type, callsign FROM users WHERE telegram_id = ?').get(numId);
        return res.json({
          first_name: dbUser?.callsign || 'Web User',
          last_name: '',
          username: dbUser?.email || '',
          avatar: null,
          isWeb: true
        });
      } catch (e) {
        return res.json({ first_name: 'Web User', last_name: '', username: '', avatar: null, isWeb: true });
      }
    }
    console.log('[Web Admin] Fetching user info for ID:', id);
    if (userCache.has(id)) {
      console.log('[Web Admin] Returning cached info for', id);
      return res.json(userCache.get(id));
    }
    try {
      // Create a timeout promise
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000));
      
      const chat = await Promise.race([
        telegramClient.getChat(id),
        timeout
      ]);
      
      let avatarUrl = null;
      try {
        const photos = await Promise.race([
          telegramClient.getUserProfilePhotos(id, 0, 1),
          timeout
        ]);
        if (photos && photos.total_count > 0) {
          const fileId = photos.photos[0][0].file_id;
          const link = await telegramClient.getFileLink(fileId);
          avatarUrl = link.toString();
        }
      } catch (e) {
        console.log('[Web Admin] Failed to fetch avatar for', id, e.message);
      }
      const info = {
        first_name: chat.first_name || '',
        last_name: chat.last_name || '',
        username: chat.username || '',
        avatar: avatarUrl
      };
      userCache.set(id, info);
      console.log('[Web Admin] Fetched info successfully for', id);
      res.json(info);
    } catch (e) {
      console.error('[Web Admin] Failed to fetch user info for', id, e.message);
      const fallbackInfo = {
        first_name: '',
        last_name: '',
        username: '',
        avatar: null
      };
      userCache.set(id, fallbackInfo);
      res.json(fallbackInfo);
    }
  });

  // HTML Dashboard
  app.get('/', requireAuth, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // 1. Users
    const usersStmt = db.prepare("SELECT telegram_id, callsign, status, email, auth_type, created_at FROM users ORDER BY created_at DESC");
    const allUsers = usersStmt.all();
    const pending = allUsers.filter(u => u.status === 'pending');
    const approved = allUsers.filter(u => u.status === 'approved');
    const rejected = allUsers.filter(u => u.status === 'rejected');

    // 2. Spots & Muted Broadcast Callsigns
    const spotsStmt = db.prepare("SELECT id, callsign, reference, frequency, mode, comment, source, ip_address, created_at, msg_id FROM spots WHERE source != 'cluster_throttled' ORDER BY created_at DESC LIMIT 100");
    const latestSpots = spotsStmt.all();

    let dbMuted = [];
    try {
      dbMuted = db.prepare('SELECT id, callsign, reason, created_at FROM muted_broadcast_callsigns ORDER BY id DESC').all();
    } catch (e) {}
    const envMuted = (process.env.IGNORED_BROADCAST_CALLSIGNS !== undefined ? process.env.IGNORED_BROADCAST_CALLSIGNS : 'RI1FJZ')
      .split(',').map(c => c.trim().toUpperCase()).filter(Boolean);

    // 3. RU-POTA Shield Blocked Users & Incidents (Active vs Archive)
    const blockedStmt = db.prepare("SELECT id, telegram_id, first_name, last_name, username, reason, details, action, is_read, is_archived, created_at FROM blocked_users WHERE is_archived = 0 ORDER BY created_at DESC LIMIT 100");
    const latestBlocked = blockedStmt.all();

    const archivedStmt = db.prepare("SELECT id, telegram_id, first_name, last_name, username, reason, details, action, is_read, is_archived, created_at FROM blocked_users WHERE is_archived = 1 ORDER BY created_at DESC LIMIT 20");
    const archivedBlocked = archivedStmt.all();

    const totalBlocked = db.prepare("SELECT count(*) as count FROM blocked_users").get().count;
    const unreadBlockedCount = db.prepare("SELECT count(*) as count FROM blocked_users WHERE is_read = 0 AND is_archived = 0").get().count;
    const bannedCount = db.prepare("SELECT count(*) as count FROM blocked_users WHERE action = 'banned' AND is_archived = 0").get().count;
    const kickedCount = db.prepare("SELECT count(*) as count FROM blocked_users WHERE action = 'kicked' AND is_archived = 0").get().count;
    const warnedCount = db.prepare("SELECT count(*) as count FROM blocked_users WHERE action = 'warned' AND is_archived = 0").get().count;

    // 4. POTA Links Audit stats for sidebar badge
    let auditStats = { wikipedia: 10, empty: 16, insecure_http: 36 };
    try {
      const audit = auditPotaLinks();
      if (audit && audit.stats) {
        auditStats = audit.stats;
      }
    } catch (e) {}

    const escapeHtmlServer = (str) => {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };

    const generateUserRow = (u) => {
      const isWeb = u.telegram_id < 0 || u.auth_type === 'web';
      const authBadge = isWeb 
        ? '<span class="badge bg-info text-dark ms-1" style="font-size: 0.75rem;"><i class="bi bi-globe"></i> Web</span>'
        : '<span class="badge bg-primary ms-1" style="font-size: 0.75rem;"><i class="bi bi-telegram"></i> TG</span>';
      const qrzLink = u.callsign 
        ? `<a href="https://www.qrz.ru/db/${encodeURIComponent(u.callsign)}" target="_blank" rel="noopener noreferrer" class="badge bg-light text-secondary border text-decoration-none ms-1" title="Проверить позывной в базе QRZ.ru" style="font-size: 0.7rem;"><i class="bi bi-box-arrow-up-right"></i> qrz.ru</a>`
        : '';
      const emailDisplay = u.email ? `<div class="small text-muted"><i class="bi bi-envelope"></i> ${escapeHtmlServer(u.email)}</div>` : '';

      return `
      <tr id="user-row-${u.telegram_id}">
        <td>
          <div class="d-flex align-items-center">
            <img src="https://ui-avatars.com/api/?name=${escapeHtmlServer(u.callsign)}&background=random" id="avatar-${u.telegram_id}" class="rounded-circle me-3" width="45" height="45" alt="Avatar">
            <div>
              <div class="d-flex align-items-center">
                <strong>${escapeHtmlServer(u.callsign)}</strong>
                ${authBadge}
                ${qrzLink}
              </div>
              ${emailDisplay}
              <div class="small text-muted" id="user-info-${u.telegram_id}">
                ${isWeb ? '<span class="text-muted">Веб-пользователь (Email)</span>' : '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="width: 10px; height: 10px;"></span> Загрузка...'}
              </div>
            </div>
          </div>
        </td>
        <td><code>${u.telegram_id}</code></td>
        <td><span class="badge ${u.status === 'approved' ? 'bg-success' : u.status === 'pending' ? 'bg-warning text-dark' : 'bg-danger'}">${u.status.toUpperCase()}</span></td>
        <td>${new Date(u.created_at).toLocaleString('ru-RU')}</td>
        <td>
          ${u.status !== 'approved' ? `<button type="button" class="btn btn-sm btn-success approve-user-btn" data-id="${u.telegram_id}">Одобрить</button>` : ''}
          ${u.status !== 'rejected' ? `<button type="button" class="btn btn-sm btn-danger reject-user-btn" data-id="${u.telegram_id}">Отклонить</button>` : ''}
          <button type="button" class="btn btn-sm btn-secondary delete-user-btn" data-id="${u.telegram_id}">Удалить</button>
        </td>
      </tr>
      `;
    };

    const generateSpotRow = (s) => {
      const deleteBtn = `<button type="button" class="btn btn-sm btn-outline-danger delete-spot-btn" data-id="${s.id}" data-source="${escapeHtmlServer(s.source || '')}" data-msg="${s.msg_id || ''}" title="Удалить спот из БД (и канала)">Удалить</button>`;
      const muteBtn = `<button type="button" class="btn btn-sm btn-outline-warning mute-spot-call-btn me-1" data-callsign="${escapeHtmlServer(s.callsign)}" title="Внести позывной в исключения вещания (бан)">В бан</button>`;
      
      let sourceBadge = escapeHtmlServer(s.source || '');
      if (s.source?.includes('tma') && !s.source?.includes('guest')) {
        sourceBadge = `<span class="badge bg-primary">📱 ${escapeHtmlServer(s.source)}</span>`;
      } else if (s.source?.includes('guest')) {
        sourceBadge = `<span class="badge bg-info text-dark">🌐 ${escapeHtmlServer(s.source)}</span>`;
      } else if (s.source === 'bot') {
        sourceBadge = '<span class="badge bg-secondary">🤖 Бот</span>';
      } else if (s.source === 'cluster') {
        sourceBadge = '<span class="badge bg-dark">📡 Кластер</span>';
      } else if (s.source === 'cluster_muted') {
        sourceBadge = '<span class="badge bg-secondary text-light">🔇 cluster (muted)</span>';
      } else if (s.source === 'local') {
        sourceBadge = '<span class="badge bg-primary">📱 TMA</span>';
      }

      const ipDisplay = s.ip_address 
        ? `<span class="badge bg-light text-secondary font-monospace border">${escapeHtmlServer(s.ip_address)}</span>` 
        : '<span class="text-muted small">—</span>';

      return `
      <tr id="spot-row-${s.id}">
        <td><strong>${escapeHtmlServer(s.callsign)}</strong></td>
        <td><a href="https://next.pota.app/park/${escapeHtmlServer(s.reference)}" target="_blank">${escapeHtmlServer(s.reference)}</a></td>
        <td>${escapeHtmlServer(s.frequency || '')} ${escapeHtmlServer(s.mode || '')}</td>
        <td>${sourceBadge}</td>
        <td>${ipDisplay}</td>
        <td>${new Date(s.created_at).toLocaleString('ru-RU')}</td>
        <td class="text-nowrap">${muteBtn}${deleteBtn}</td>
      </tr>
      `;
    };

    const generateBlockedRow = (b) => {
      const name = [b.first_name, b.last_name].filter(Boolean).join(' ') || 'Без имени';
      const userDisplay = b.username ? `@${b.username}` : name;
      const actionBadge = b.action === 'banned' 
        ? '<span class="badge bg-danger">Забанен</span>' 
        : b.action === 'kicked' 
        ? '<span class="badge bg-warning text-dark">Кикнут</span>' 
        : b.action === 'unbanned'
        ? '<span class="badge bg-success">Разблокирован</span>'
        : '<span class="badge bg-info text-dark">Предупрежден</span>';
      
      const reasonLabels = {
        'profile_face_control': 'Face-контроль (Профиль)',
        'captcha_timeout': 'Таймаут капчи (120с)',
        'newbie_link': 'Карантин ссылок новичка',
        'scam_words': 'Фильтр скам-текста'
      };
      const reasonText = reasonLabels[b.reason] || b.reason;

      const actionBtn = b.action === 'banned'
        ? `<button type="button" class="btn btn-sm btn-outline-success unban-user-btn" data-id="${b.id}" data-tgid="${b.telegram_id}" data-user="${escapeHtmlServer(userDisplay)}" title="Разблокировать в Telegram"><i class="bi bi-unlock"></i> Разблокировать</button>`
        : `<button type="button" class="btn btn-sm btn-outline-danger ban-user-btn" data-id="${b.id}" data-tgid="${b.telegram_id}" data-user="${escapeHtmlServer(userDisplay)}" title="Забанить в Telegram"><i class="bi bi-slash-circle"></i> Забанить</button>`;

      const isReadChecked = b.is_read ? 'checked' : '';
      const rowClass = b.is_read ? 'table-light text-muted opacity-75' : '';

      return `
        <tr id="blocked-row-${b.id}" class="${rowClass}">
          <td class="text-center">
            <input type="checkbox" class="form-check-input toggle-read-cb" data-id="${b.id}" ${isReadChecked} title="${b.is_read ? 'Прочитано' : 'Отметить как прочитанное'}">
          </td>
          <td>
            <strong>${escapeHtmlServer(userDisplay)}</strong>
            <div class="small text-muted">${escapeHtmlServer(name)}</div>
          </td>
          <td><code>${b.telegram_id}</code></td>
          <td><span class="badge bg-secondary">${reasonText}</span></td>
          <td><small class="text-break">${escapeHtmlServer(b.details || '')}</small></td>
          <td id="action-badge-${b.id}">${actionBadge}</td>
          <td>${new Date(b.created_at).toLocaleString('ru-RU')}</td>
          <td class="text-center" id="action-cell-${b.id}">${actionBtn}</td>
        </tr>
      `;
    };

    const generateArchivedRow = (b) => {
      const name = [b.first_name, b.last_name].filter(Boolean).join(' ') || 'Без имени';
      const userDisplay = b.username ? `@${b.username}` : name;
      const actionBadge = b.action === 'banned' 
        ? '<span class="badge bg-danger">Забанен</span>' 
        : b.action === 'kicked' 
        ? '<span class="badge bg-warning text-dark">Кикнут</span>' 
        : b.action === 'unbanned'
        ? '<span class="badge bg-success">Разблокирован</span>'
        : '<span class="badge bg-info text-dark">Предупрежден</span>';
      
      const reasonLabels = {
        'profile_face_control': 'Face-контроль (Профиль)',
        'captcha_timeout': 'Таймаут капчи (120с)',
        'newbie_link': 'Карантин ссылок новичка',
        'scam_words': 'Фильтр скам-текста'
      };
      const reasonText = reasonLabels[b.reason] || b.reason;

      return `
        <tr class="text-muted">
          <td>
            <strong>${escapeHtmlServer(userDisplay)}</strong>
            <div class="small text-muted">${escapeHtmlServer(name)}</div>
          </td>
          <td><code>${b.telegram_id}</code></td>
          <td><span class="badge bg-secondary">${reasonText}</span></td>
          <td><small class="text-break">${escapeHtmlServer(b.details || '')}</small></td>
          <td>${actionBadge}</td>
          <td class="small">${new Date(b.created_at).toLocaleString('ru-RU')}</td>
        </tr>
      `;
    };

    const html = `
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>RU-POTA Web Admin 2.0</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
        <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
        <style>
          #log-container { height: 400px; overflow-y: scroll; background: #212529; color: #f8f9fa; font-family: monospace; padding: 10px; border-radius: 5px; }
          .log-warn { color: #ffc107; }
          .log-error { color: #dc3545; font-weight: bold; }
          .spot-row-leave {
            transition: all 0.5s ease-out;
            opacity: 0;
            transform: translateX(100px);
            background-color: #f8d7da !important;
          }
          .reg-kpi-card, .audit-kpi-card {
            user-select: none;
            cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.15s ease;
          }
          .reg-kpi-card:hover, .audit-kpi-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(0,0,0,0.2) !important;
          }
          .reg-kpi-card.active-kpi {
            box-shadow: 0 0 0 3px #212529, 0 6px 16px rgba(0,0,0,0.25) !important;
            transform: translateY(-2px);
          }
        </style>
      </head>
      <body>
        <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
          <div class="container-fluid">
            <a class="navbar-brand" href="#">🌲 RU-POTA Admin</a>
            <div class="d-flex">
              <a href="/logout" class="btn btn-outline-light btn-sm">Выйти</a>
            </div>
          </div>
        </nav>
        
        <div class="container-fluid mt-4">
          <div class="row">
            <div class="col-md-3 col-lg-2">
              <div class="list-group" id="list-tab" role="tablist">
                <a class="list-group-item list-group-item-action active" id="list-users-list" data-bs-toggle="list" href="#list-users" role="tab" aria-controls="list-users"><i class="bi bi-people"></i> Пользователи</a>
                <a class="list-group-item list-group-item-action" id="list-spots-list" data-bs-toggle="list" href="#list-spots" role="tab" aria-controls="list-spots"><i class="bi bi-broadcast"></i> Споты</a>
                <a class="list-group-item list-group-item-action" id="list-shield-list" data-bs-toggle="list" href="#list-shield" role="tab" aria-controls="list-shield"><i class="bi bi-shield-lock"></i> RU-POTA Shield <span class="badge bg-danger rounded-pill ms-1 ${unreadBlockedCount > 0 ? '' : 'd-none'}" id="shield-unread-badge">${unreadBlockedCount}</span></a>
                <a class="list-group-item list-group-item-action" id="list-broadcast-list" data-bs-toggle="list" href="#list-broadcast" role="tab" aria-controls="list-broadcast"><i class="bi bi-megaphone"></i> Рассылка</a>
                <a class="list-group-item list-group-item-action" id="list-welcome-list" data-bs-toggle="list" href="#list-welcome" role="tab" aria-controls="list-welcome"><i class="bi bi-pin-angle"></i> Закрепленный пост</a>
                <a class="list-group-item list-group-item-action" id="list-oopt-list" data-bs-toggle="list" href="#list-oopt" role="tab" aria-controls="list-oopt"><i class="bi bi-tree"></i> Реестр ООПТ РФ</a>
                <a class="list-group-item list-group-item-action" id="list-regions-list" data-bs-toggle="list" href="#list-regions" role="tab" aria-controls="list-regions"><i class="bi bi-geo-alt"></i> Регионы POTA</a>
                <a class="list-group-item list-group-item-action" id="list-links-list" data-bs-toggle="list" href="#list-links" role="tab" aria-controls="list-links"><i class="bi bi-link-45deg"></i> Аудит ссылок POTA <span class="badge bg-warning text-dark rounded-pill ms-1" id="links-wiki-badge" title="Википедия: ${auditStats.wikipedia}">${auditStats.wikipedia}</span> <span class="badge bg-danger rounded-pill ms-1" id="links-empty-badge" title="Без ссылок (Алярма): ${auditStats.empty}">${auditStats.empty}</span></a>
                <a class="list-group-item list-group-item-action" id="list-console-list" data-bs-toggle="list" href="#list-console" role="tab" aria-controls="list-console"><i class="bi bi-terminal"></i> Live Консоль</a>
              </div>
            </div>
            
            <div class="col-md-9 col-lg-10">
              <div class="tab-content" id="nav-tabContent">
                
                <!-- Tab: Users -->
                <div class="tab-pane fade show active" id="list-users" role="tabpanel" aria-labelledby="list-users-list">
                  <div class="d-flex justify-content-between align-items-center mb-3">
                    <h3>Управление пользователями</h3>
                  </div>
                  
                  <h4>Заявки на модерацию (${pending.length})</h4>
                  <div class="table-responsive mb-4">
                    <table class="table table-bordered table-hover align-middle">
                      <thead class="table-light"><tr><th>Позывной</th><th>TG ID</th><th>Статус</th><th>Дата</th><th>Действия</th></tr></thead>
                      <tbody>${pending.length > 0 ? pending.map(generateUserRow).join('') : '<tr><td colspan="5" class="text-center text-muted">Нет новых заявок</td></tr>'}</tbody>
                    </table>
                  </div>

                  <h4>Активные пользователи (${approved.length})</h4>
                  <div class="table-responsive mb-4">
                    <table class="table table-bordered table-hover align-middle">
                      <thead class="table-light"><tr><th>Позывной</th><th>TG ID</th><th>Статус</th><th>Дата</th><th>Действия</th></tr></thead>
                      <tbody>${approved.length > 0 ? approved.map(generateUserRow).join('') : '<tr><td colspan="5" class="text-center text-muted">Пусто</td></tr>'}</tbody>
                    </table>
                  </div>

                  <h4>Отклоненные (${rejected.length})</h4>
                  <div class="table-responsive">
                    <table class="table table-bordered table-hover align-middle text-muted">
                      <thead class="table-light"><tr><th>Позывной</th><th>TG ID</th><th>Статус</th><th>Дата</th><th>Действия</th></tr></thead>
                      <tbody>${rejected.map(generateUserRow).join('')}</tbody>
                    </table>
                  </div>
                </div>

                <!-- Tab: Spots -->
                <div class="tab-pane fade" id="list-spots" role="tabpanel" aria-labelledby="list-spots-list">
                  <div class="card shadow-sm border-0 mb-4 bg-light">
                    <div class="card-body">
                      <div class="d-flex justify-content-between align-items-center mb-2">
                        <h4 class="card-title mb-0">🔇 Исключения из трансляции (подавление спама экспедиций)</h4>
                        <span class="badge bg-secondary">Канал & Группа</span>
                      </div>
                      <p class="text-muted small mb-3">
                        Споты указанных позывных <b>не публикуются</b> в Telegram-канал и группу обсуждения (защита от спама экспедиций, работающих одновременно на множестве диапазонов). При этом споты остаются доступны в <b>Mini App</b>, в команде <b>«Кто в эфире» (/onair)</b> и отправляются персональным подписчикам через <b>/sub</b>.
                      </p>

                      <!-- Форма добавления позывного в базу данных -->
                      <form method="POST" action="/admin/muted-callsigns/add" class="row g-2 align-items-center mb-3">
                        <div class="col-sm-4">
                          <input type="text" name="callsign" class="form-control form-control-sm text-uppercase fw-bold font-monospace" placeholder="Позывной (напр. RI1FJZ)" required>
                        </div>
                        <div class="col-sm-5">
                          <input type="text" name="reason" class="form-control form-control-sm" placeholder="Примечание (напр. Экспедиция ЗФИ, FT8 спам)">
                        </div>
                        <div class="col-sm-3">
                          <button type="submit" class="btn btn-sm btn-dark w-100"><i class="bi bi-plus-circle"></i> Добавить позывной</button>
                        </div>
                      </form>

                      <!-- Таблица активных исключений -->
                      <div class="table-responsive">
                        <table class="table table-sm table-bordered bg-white mb-0 align-middle">
                          <thead class="table-light"><tr><th>Позывной</th><th>Источник</th><th>Примечание</th><th>Дата добавления</th><th style="width: 100px;">Действие</th></tr></thead>
                          <tbody>
                            ${envMuted.map(call => `
                              <tr>
                                <td><strong class="font-monospace text-primary">${escapeHtmlServer(call)}</strong></td>
                                <td><span class="badge bg-info text-dark">⚙️ Конфиг .env</span></td>
                                <td class="text-muted small">Указано в переменной IGNORED_BROADCAST_CALLSIGNS</td>
                                <td class="text-muted small">—</td>
                                <td><span class="text-muted small fst-italic">Через .env</span></td>
                              </tr>
                            `).join('')}
                            ${dbMuted.map(m => `
                              <tr>
                                <td><strong class="font-monospace text-danger">${escapeHtmlServer(m.callsign)}</strong></td>
                                <td><span class="badge bg-success">💾 База данных</span></td>
                                <td class="small">${escapeHtmlServer(m.reason || 'Без описания')}</td>
                                <td class="text-muted small">${new Date(m.created_at).toLocaleString('ru-RU')}</td>
                                <td>
                                  <form method="POST" action="/admin/muted-callsigns/delete" onsubmit="return confirm('Удалить ${escapeHtmlServer(m.callsign)} из списка исключений?');" style="margin: 0;">
                                    <input type="hidden" name="id" value="${m.id}">
                                    <button type="submit" class="btn btn-sm btn-outline-danger py-0 px-2">Удалить</button>
                                  </form>
                                </td>
                              </tr>
                            `).join('')}
                            ${(envMuted.length === 0 && dbMuted.length === 0) ? '<tr><td colspan="5" class="text-center text-muted">Список пуст (все станции транслируются в канал)</td></tr>' : ''}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div class="d-flex justify-content-between align-items-center mb-3">
                    <h3 class="mb-0">Последние 100 спотов в БД</h3>
                    <button type="button" class="btn btn-sm btn-outline-danger" id="btn-clear-all-spots">
                      <i class="bi bi-trash3"></i> Очистить все споты из БД
                    </button>
                  </div>
                  <div class="table-responsive">
                    <table class="table table-striped table-hover align-middle" style="overflow: hidden;">
                      <thead class="table-light"><tr><th>Позывной</th><th>Парк</th><th>Частота/Модуляция</th><th>Источник</th><th>IP адрес</th><th>Дата</th><th>Действия</th></tr></thead>
                      <tbody id="spots-tbody">
                        ${latestSpots.length > 0 ? latestSpots.map(generateSpotRow).join('') : '<tr><td colspan="7" class="text-center">Спотов пока нет</td></tr>'}
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- Tab: RU-POTA Shield -->
                <div class="tab-pane fade" id="list-shield" role="tabpanel" aria-labelledby="list-shield-list">
                  <div class="d-flex justify-content-between align-items-center mb-3">
                    <h3>🛡️ RU-POTA Shield (Антиспам-мониторинг)</h3>
                  </div>

                  <div class="row g-3 mb-4">
                    <div class="col-sm-6 col-xl-3">
                      <div class="card shadow-sm border-0 bg-primary bg-opacity-10 text-primary p-3">
                        <div class="d-flex align-items-center">
                          <i class="bi bi-shield-shaded fs-1 me-3"></i>
                          <div>
                            <div class="fs-4 fw-bold">${totalBlocked}</div>
                            <div class="small text-muted">Всего инцидентов</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="col-sm-6 col-xl-3">
                      <div class="card shadow-sm border-0 bg-danger bg-opacity-10 text-danger p-3">
                        <div class="d-flex align-items-center">
                          <i class="bi bi-slash-circle fs-1 me-3"></i>
                          <div>
                            <div class="fs-4 fw-bold">${bannedCount}</div>
                            <div class="small text-muted">Заблокировано (Бан)</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="col-sm-6 col-xl-3">
                      <div class="card shadow-sm border-0 bg-warning bg-opacity-10 text-warning p-3">
                        <div class="d-flex align-items-center">
                          <i class="bi bi-clock-history fs-1 me-3"></i>
                          <div>
                            <div class="fs-4 fw-bold">${kickedCount}</div>
                            <div class="small text-muted">Кик по капче (Таймаут)</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="col-sm-6 col-xl-3">
                      <div class="card shadow-sm border-0 bg-info bg-opacity-10 text-info p-3">
                        <div class="d-flex align-items-center">
                          <i class="bi bi-link-45deg fs-1 me-3"></i>
                          <div>
                            <div class="fs-4 fw-bold">${warnedCount}</div>
                            <div class="small text-muted">Карантин ссылок</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                    <h4 class="mb-0">Журнал активных инцидентов (${latestBlocked.length})</h4>
                    <div class="d-flex gap-2">
                      <button type="button" class="btn btn-sm btn-outline-primary" id="mark-all-read-btn">
                        <i class="bi bi-check2-all"></i> Прочитать все
                      </button>
                      <button type="button" class="btn btn-sm btn-outline-warning" id="btn-archive-all-shield">
                        <i class="bi bi-archive"></i> В архив всё
                      </button>
                      <button type="button" class="btn btn-sm btn-outline-danger" id="btn-clear-all-shield">
                        <i class="bi bi-trash3"></i> Очистить журнал
                      </button>
                    </div>
                  </div>
                  <div class="table-responsive">
                    <table class="table table-bordered table-hover align-middle">
                      <thead class="table-light">
                        <tr>
                          <th style="width: 40px;" class="text-center" title="Прочитано / Не прочитано"><i class="bi bi-check2-square"></i></th>
                          <th>Пользователь</th>
                          <th>Telegram ID</th>
                          <th>Причина</th>
                          <th>Детали / Текст</th>
                          <th>Действие</th>
                          <th>Дата</th>
                          <th class="text-center" style="width: 150px;">Управление</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${latestBlocked.length > 0 ? latestBlocked.map(generateBlockedRow).join('') : '<tr><td colspan="8" class="text-center text-muted">Активных инцидентов нет. Все чисто! 🌲</td></tr>'}
                      </tbody>
                    </table>
                  </div>

                  <!-- Shield Archive Section (max 20 records) -->
                  <div class="card mt-4 border-0 shadow-sm bg-light">
                    <div class="card-header bg-secondary bg-opacity-10 d-flex justify-content-between align-items-center">
                      <h5 class="mb-0 fs-6 text-muted">
                        <i class="bi bi-archive-fill me-1"></i> Архив инцидентов (${archivedBlocked.length} из макс. 20)
                      </h5>
                      <span class="badge bg-secondary">Хранение до 20 записей</span>
                    </div>
                    <div class="card-body p-0">
                      <div class="table-responsive">
                        <table class="table table-sm table-hover align-middle mb-0">
                          <thead class="table-light text-muted small">
                            <tr>
                              <th>Пользователь</th>
                              <th>Telegram ID</th>
                              <th>Причина</th>
                              <th>Детали</th>
                              <th>Действие</th>
                              <th>Дата</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${archivedBlocked.length > 0 ? archivedBlocked.map(generateArchivedRow).join('') : '<tr><td colspan="6" class="text-center text-muted py-3">Архив пуст</td></tr>'}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Tab: Broadcast -->
                <div class="tab-pane fade" id="list-broadcast" role="tabpanel" aria-labelledby="list-broadcast-list">
                  <div class="card border-primary shadow-sm">
                    <div class="card-header bg-primary text-white">📢 Рассылка сообщения</div>
                    <div class="card-body">
                      <form method="POST" action="/broadcast">
                        <div class="mb-3">
                          <label class="form-label">Куда отправить:</label>
                          <select name="target" class="form-select">
                            <option value="group">Основная группа (MAIN_CHAT_ID)</option>
                            <option value="channel">Канал активности (ACTIVITY_CHANNEL_ID)</option>
                          </select>
                        </div>
                        <div class="mb-3">
                          <label class="form-label">Текст сообщения:</label>
                          <textarea name="message" class="form-control" rows="4" required></textarea>
                        </div>
                        <div class="form-check mb-3">
                          <input class="form-check-input" type="checkbox" name="pin" value="true" id="pinCheck">
                          <label class="form-check-label" for="pinCheck">📌 Закрепить сообщение</label>
                        </div>
                        <button type="submit" class="btn btn-primary"><i class="bi bi-send"></i> Отправить</button>
                      </form>
                    </div>
                  </div>
                </div>

                <!-- Tab: Welcome / Pinned Post -->
                <div class="tab-pane fade" id="list-welcome" role="tabpanel" aria-labelledby="list-welcome-list">
                  <div class="card border-info shadow-sm mb-4">
                    <div class="card-header bg-info text-dark d-flex justify-content-between align-items-center">
                      <span class="fw-bold"><i class="bi bi-pin-angle-fill"></i> Редактор закрепленного сообщения</span>
                      <span class="badge bg-dark text-white">Основная группа</span>
                    </div>
                    <div class="card-body">
                      <p class="text-muted small">
                        Здесь вы можете изменить текст главного приветственного или информационного сообщения, закрепленного ботом в основной группе.
                      </p>
                      <form id="edit-pinned-form">
                        <div class="row g-3 mb-3">
                          <div class="col-md-7">
                            <label class="form-label fw-semibold">ID чата (или ссылка вида https://t.me/c/...):</label>
                            <input type="text" class="form-control font-monospace" id="pinned-chat-id" value="${process.env.MAIN_CHAT_ID ? ('-100' + process.env.MAIN_CHAT_ID.toString().replace(/^-100/, '').replace(/^-/, '')) : '-1004485477242'}">
                          </div>
                          <div class="col-md-5">
                            <label class="form-label fw-semibold">ID сообщения (Message ID):</label>
                            <input type="number" class="form-control font-monospace" id="pinned-msg-id" value="474">
                          </div>
                        </div>
                        <div class="mb-3">
                          <div class="d-flex justify-content-between align-items-center mb-1">
                            <label class="form-label fw-semibold mb-0">Текст сообщения (поддерживается HTML):</label>
                            <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-reset-template">
                              <i class="bi bi-arrow-counterclockwise"></i> Сбросить к шаблону
                            </button>
                          </div>
                          <textarea class="form-control font-monospace" id="pinned-text" rows="16" style="font-size: 13px;"></textarea>
                        </div>
                        <button type="submit" class="btn btn-primary" id="btn-save-pinned">
                          <i class="bi bi-cloud-check"></i> Сохранить и обновить в Telegram
                        </button>
                      </form>
                    </div>
                  </div>
                </div>

                <!-- Tab: OOPT Registry -->
                <div class="tab-pane fade" id="list-oopt" role="tabpanel" aria-labelledby="list-oopt-list">
                  <div class="d-flex justify-content-between align-items-center mb-3">
                    <div>
                      <h3 class="mb-1"><i class="bi bi-tree text-success"></i> Реестр ООПТ России</h3>
                      <p class="text-muted small mb-0">Официальная база данных охраняемых природных территорий (11 341 объект) с генерацией заявок для координатора POTA (R2BBX)</p>
                    </div>
                    <div class="d-flex gap-2">
                      <a href="/app" target="_blank" class="btn btn-sm btn-outline-success"><i class="bi bi-phone"></i> Открыть в Mini App</a>
                      <button type="button" class="btn btn-sm btn-primary" id="btn-sync-oopt"><i class="bi bi-arrow-repeat"></i> Синхронизировать с карта.оцзк.рф</button>
                    </div>
                  </div>

                  <!-- OOPT Statistics Summary Cards -->
                  <div class="row g-2 mb-3">
                    <div class="col-md-2 col-6">
                      <div class="card bg-light border-0 shadow-sm h-100 p-2 text-center">
                        <div class="text-muted small">Всего в реестре</div>
                        <div class="fs-5 fw-bold text-dark" id="stat-oopt-total">11 342</div>
                      </div>
                    </div>
                    <div class="col-md-3 col-6">
                      <div class="card border-0 shadow-sm h-100 p-2 text-center" style="background:#f3e8ff;">
                        <div class="small fw-semibold" style="color:#6f42c1;">🏛️ Федерального значения</div>
                        <div class="fs-5 fw-bold" style="color:#5a2d9c;" id="stat-oopt-fed">361</div>
                      </div>
                    </div>
                    <div class="col-md-3 col-6">
                      <div class="card bg-success-subtle border-0 shadow-sm h-100 p-2 text-center">
                        <div class="small fw-semibold text-success">🌲 Регионального значения</div>
                        <div class="fs-5 fw-bold text-success" id="stat-oopt-reg">10 432</div>
                      </div>
                    </div>
                    <div class="col-md-2 col-6">
                      <div class="card bg-warning-subtle border-0 shadow-sm h-100 p-2 text-center">
                        <div class="small fw-semibold text-warning-emphasis">🏡 Местного значения</div>
                        <div class="fs-5 fw-bold text-dark" id="stat-oopt-loc">549</div>
                      </div>
                    </div>
                    <div class="col-md-2 col-12">
                      <div class="card bg-success border-0 shadow-sm h-100 p-2 text-center text-white" id="card-filter-pota" style="cursor: pointer;" title="Нажмите для фильтрации: только объекты в базе POTA">
                        <div class="small fw-semibold text-white-50"><i class="bi bi-funnel"></i> В базе POTA</div>
                        <div class="fs-5 fw-bold text-white"><span id="stat-oopt-pota">304</span> <small class="fw-normal fs-6" id="pota-filter-label">(все)</small></div>
                      </div>
                    </div>
                  </div>

                  <!-- OOPT Search and Filters -->
                  <div class="row g-2 mb-3">
                    <div class="col-md-4">
                      <input type="text" class="form-control" id="oopt-search-input" placeholder="🔍 Поиск по названию или ключевым словам...">
                    </div>
                    <div class="col-md-3">
                      <select class="form-select" id="oopt-region-select">
                        <option value="">Все регионы России (89)</option>
                      </select>
                    </div>
                    <div class="col-md-2">
                      <select class="form-select" id="oopt-sig-select">
                        <option value="">Все уровни</option>
                        <option value="federal">🏛️ Федеральные</option>
                        <option value="regional">🌲 Региональные</option>
                        <option value="local">🏡 Местные</option>
                      </select>
                    </div>
                    <div class="col-md-3 d-flex justify-content-end align-items-center gap-2">
                      <span class="small text-muted" id="oopt-pagination-info">Загрузка...</span>
                      <button type="button" class="btn btn-sm btn-outline-secondary" id="oopt-prev-page" disabled>&laquo; Назад</button>
                      <button type="button" class="btn btn-sm btn-outline-secondary" id="oopt-next-page" disabled>Вперед &raquo;</button>
                    </div>
                  </div>

                  <div class="table-responsive">
                    <table class="table table-bordered table-hover align-middle">
                      <thead class="table-light">
                        <tr>
                          <th>ID</th>
                          <th>Название</th>
                          <th>Уровень</th>
                          <th>Категория</th>
                          <th>Регион</th>
                          <th>Площадь</th>
                          <th>Действия</th>
                        </tr>
                      </thead>
                      <tbody id="oopt-table-body">
                        <tr><td colspan="7" class="text-center text-muted">Загрузка реестра ООПТ...</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- Tab: POTA Regions Statistics -->
                <div class="tab-pane fade" id="list-regions" role="tabpanel" aria-labelledby="list-regions-list">
                  <div class="d-flex justify-content-between align-items-center mb-3">
                    <div>
                      <h3 class="mb-1"><i class="bi bi-geo-alt"></i> Статистика регионов POTA в РФ</h3>
                      <div class="text-muted small">
                        Анализ покрытия программы POTA по субъектам Российской Федерации: количество парков, уникальные активированные парки («заинтересованность»), активность радиосвязей и потенциальные кандидаты из реестра ООПТ.
                      </div>
                    </div>
                    <div class="d-flex gap-2">
                      <button type="button" class="btn btn-sm btn-outline-primary" id="btn-regions-refresh">
                        <i class="bi bi-arrow-clockwise"></i> Обновить
                      </button>
                    </div>
                  </div>

                  <!-- Regional KPI Cards -->
                  <div class="row g-2 mb-3">
                    <div class="col-6 col-md-2">
                      <div class="card bg-primary border-0 shadow-sm h-100 p-2 text-center text-white reg-kpi-card" data-filter="all" title="Показать все регионы РФ">
                        <div class="small opacity-75"><i class="bi bi-geo-alt"></i> Всего парков POTA</div>
                        <div class="fs-4 fw-bold text-white" id="reg-stat-total">...</div>
                        <div class="small opacity-75" style="font-size:11px;">в реестре РФ</div>
                      </div>
                    </div>
                    <div class="col-6 col-md-2">
                      <div class="card bg-success border-0 shadow-sm h-100 p-2 text-center text-white reg-kpi-card" data-filter="mature" title="Фильтр: регионы с высоким покрытием (≥70% ООПТ — зрелый регион)">
                        <div class="small opacity-75"><i class="bi bi-award-fill"></i> Покрытие ООПТ (РФ)</div>
                        <div class="fs-4 fw-bold text-white" id="reg-stat-coverage">...</div>
                        <div class="small opacity-75" style="font-size:11px;" id="reg-stat-mature-count">...</div>
                      </div>
                    </div>
                    <div class="col-6 col-md-2">
                      <div class="card bg-info border-0 shadow-sm h-100 p-2 text-center text-dark reg-kpi-card" data-filter="active" title="Фильтр: активные регионы (&ge;1 активации)">
                        <div class="small opacity-75"><i class="bi bi-broadcast-pin"></i> Активировано &ge;1 раз</div>
                        <div class="fs-4 fw-bold text-dark" id="reg-stat-activated">...</div>
                        <div class="small opacity-75" style="font-size:11px;" id="reg-stat-rate">...</div>
                      </div>
                    </div>
                    <div class="col-6 col-md-2">
                      <div class="card bg-secondary border-0 shadow-sm h-100 p-2 text-center text-white reg-kpi-card" data-filter="unactivated" title="Фильтр: регионы с парками без активаций">
                        <div class="small opacity-75"><i class="bi bi-clock-history"></i> Не активировано</div>
                        <div class="fs-4 fw-bold text-white" id="reg-stat-unactivated">...</div>
                        <div class="small opacity-75" style="font-size:11px;">ждут первой связи</div>
                      </div>
                    </div>
                    <div class="col-6 col-md-2">
                      <div class="card bg-danger border-0 shadow-sm h-100 p-2 text-center text-white reg-kpi-card" data-filter="zero" title="Фильтр: регионы без единого парка POTA (высший приоритет)">
                        <div class="small opacity-75"><i class="bi bi-exclamation-triangle-fill"></i> Без парков (0 POTA)</div>
                        <div class="fs-4 fw-bold text-white" id="reg-stat-zero">...</div>
                        <div class="small opacity-75" style="font-size:11px;">высший приоритет</div>
                      </div>
                    </div>
                    <div class="col-6 col-md-2">
                      <div class="card bg-warning border-0 shadow-sm h-100 p-2 text-center text-dark reg-kpi-card" data-filter="all" data-sort="qsos_desc" title="Сортировка: регионы по общему числу QSO в эфире">
                        <div class="small opacity-75"><i class="bi bi-activity"></i> Всего связей (QSO)</div>
                        <div class="fs-4 fw-bold text-dark" id="reg-stat-qsos">...</div>
                        <div class="small opacity-75" style="font-size:11px;" id="reg-stat-activations-subtitle">...</div>
                      </div>
                    </div>
                  </div>

                  <!-- Filters & Search -->
                  <div class="card shadow-sm border-0 mb-3">
                    <div class="card-body p-2">
                      <div class="row g-2 align-items-center">
                        <div class="col-md-4">
                          <input type="text" class="form-control form-control-sm" id="reg-search-input" placeholder="🔍 Поиск региона или кода (RU-XX)...">
                        </div>
                        <div class="col-md-4">
                          <select class="form-select form-select-sm" id="reg-filter-select">
                            <option value="all">Все регионы РФ</option>
                            <option value="mature">🏆 Зрелый регион (≥70% покрытия ООПТ)</option>
                            <option value="low_coverage">⚠️ Низкое покрытие (&lt;20% ООПТ — молодой регион)</option>
                            <option value="zero">🔴 Без парков (0 POTA — срочно добавить)</option>
                            <option value="low">🟡 Мало парков (1–3 POTA)</option>
                            <option value="unactivated">⚪ Без активаций (0% связей)</option>
                            <option value="active">🟢 Активные регионы (&ge;1 активации)</option>
                          </select>
                        </div>
                        <div class="col-md-4">
                          <select class="form-select form-select-sm" id="reg-sort-select">
                            <option value="coverage_desc">Сортировка: Покрытие POTA (высокое &rarr; низкое, зрелые регионы)</option>
                            <option value="coverage_asc">Сортировка: Покрытие POTA (низкое &rarr; высокое, потенциал)</option>
                            <option value="parks_desc">Сортировка: Больше парков POTA</option>
                            <option value="parks_asc">Сортировка: Меньше парков POTA</option>
                            <option value="oopt_desc">Сортировка: Больше ООПТ в регионе</option>
                            <option value="rate_desc">Сортировка: По % активности (высокий &rarr; низкий)</option>
                            <option value="activations_desc">Сортировка: По числу активаций</option>
                            <option value="qsos_desc">Сортировка: По числу связей QSO</option>
                            <option value="name_asc">Сортировка: По названию (А &rarr; Я)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Regions Table -->
                  <div class="table-responsive bg-white rounded shadow-sm">
                    <table class="table table-hover table-striped mb-0 align-middle">
                      <thead class="table-light">
                        <tr>
                          <th style="width: 85px;">Код POTA</th>
                          <th>Регион РФ</th>
                          <th class="text-center" style="width: 95px;">В POTA</th>
                          <th class="text-center" style="width: 95px;">В ООПТ</th>
                          <th style="width: 175px;">Покрытие POTA (Зрелость)</th>
                          <th class="text-center" style="width: 90px;">Активировано</th>
                          <th style="width: 140px;">Активность парков</th>
                          <th class="text-center" style="width: 85px;">Выездов</th>
                          <th class="text-center" style="width: 95px;">QSO</th>
                          <th class="text-end" style="width: 105px;">Действие</th>
                        </tr>
                      </thead>
                      <tbody id="regions-table-body">
                        <tr><td colspan="10" class="text-center text-muted py-4">Загрузка данных по регионам...</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- Tab: POTA Links Audit -->
                <div class="tab-pane fade" id="list-links" role="tabpanel" aria-labelledby="list-links-list">
                  <div class="d-flex justify-content-between align-items-center mb-3">
                    <div>
                      <h3 class="mb-1"><i class="bi bi-link-45deg"></i> Аудит ссылок парков POTA</h3>
                      <div class="text-muted small">
                        Анализ релевантности и проверка доступности сайтов российских парков (<a href="https://next.pota.app" target="_blank">POTA.app</a>). Приоритет координатора (Manu R2BBX): замена статей Википедии и временных ссылок на официальные реестры ООПТ (зеркало NextGIS).
                      </div>
                    </div>
                    <div class="d-flex gap-2 flex-wrap">
                      <button type="button" class="btn btn-sm btn-outline-danger ${auditStats.empty > 0 ? '' : 'd-none'}" id="btn-audit-copy-empty" title="Скопировать список парков без ссылок (Алярма для Manu R2BBX)">
                        <i class="bi bi-exclamation-octagon-fill"></i> <span id="btn-audit-copy-empty-text">Алярма: Без ссылок (${auditStats.empty})</span>
                      </button>
                      <button type="button" class="btn btn-sm btn-outline-warning ${auditStats.wikipedia > 0 ? '' : 'd-none'}" id="btn-audit-copy-all-wiki" title="Скопировать предложения по замене ссылок Википедии на ООПТ">
                        <i class="bi bi-wikipedia"></i> <span id="btn-audit-copy-all-wiki-text">Замены Википедии (${auditStats.wikipedia})</span>
                      </button>
                      <button type="button" class="btn btn-sm btn-success ${(auditStats.empty > 0 || auditStats.wikipedia > 0 || auditStats.insecure_http > 0) ? '' : 'd-none'}" id="btn-audit-copy-full" title="Сформировать отчет проблемных ссылок для Manu R2BBX (Email / Telegram)">
                        <i class="bi bi-envelope-paper-fill"></i> <span id="btn-audit-copy-full-text">Полный отчет для Manu</span>
                      </button>
                      <button type="button" class="btn btn-sm btn-outline-primary" id="btn-audit-refresh">
                        <i class="bi bi-arrow-clockwise"></i> Обновить
                      </button>
                    </div>
                  </div>

                  <!-- Audit KPI Cards -->
                  <div class="row g-2 mb-3">
                    <div class="col-md-2 col-6">
                      <div class="card bg-primary border-0 shadow-sm h-100 p-2 text-center text-white audit-kpi-card" data-filter="all" style="cursor: pointer;" title="Показать все парки РФ">
                        <div class="small fw-semibold text-white-50"><i class="bi bi-tree"></i> Всего парков РФ</div>
                        <div class="fs-4 fw-bold text-white" id="audit-stat-total">551</div>
                      </div>
                    </div>
                    <div class="col-md-3 col-6">
                      <div class="card bg-warning border-0 shadow-sm h-100 p-2 text-center text-dark audit-kpi-card" data-filter="wikipedia" style="cursor: pointer;" title="Фильтр: парки со ссылками на Википедию (требуют замены)">
                        <div class="small fw-semibold text-dark-50"><i class="bi bi-exclamation-triangle-fill"></i> Википедия (на замену)</div>
                        <div class="fs-4 fw-bold" id="audit-stat-wiki">10</div>
                      </div>
                    </div>
                    <div class="col-md-2 col-4">
                      <div class="card bg-secondary border-0 shadow-sm h-100 p-2 text-center text-white audit-kpi-card" data-filter="insecure_http" style="cursor: pointer;" title="Фильтр: ссылки на незащищенный HTTP">
                        <div class="small fw-semibold text-white-50"><i class="bi bi-unlock"></i> HTTP (не HTTPS)</div>
                        <div class="fs-4 fw-bold text-white" id="audit-stat-http">36</div>
                      </div>
                    </div>
                    <div class="col-md-2 col-4">
                      <div class="card bg-danger border-0 shadow-sm h-100 p-2 text-center text-white audit-kpi-card" data-filter="empty" style="cursor: pointer;" title="Фильтр: парки без ссылок">
                        <div class="small fw-semibold text-white-50"><i class="bi bi-link-45deg"></i> Без ссылок</div>
                        <div class="fs-4 fw-bold text-white" id="audit-stat-empty">16</div>
                      </div>
                    </div>
                    <div class="col-md-3 col-4">
                      <div class="card bg-success border-0 shadow-sm h-100 p-2 text-center text-white audit-kpi-card" data-filter="replacement" style="cursor: pointer;" title="Фильтр: проблемные объекты с готовой официальной заменой из ООПТ РФ">
                        <div class="small fw-semibold text-white-50"><i class="bi bi-check2-all"></i> Готово замен в ООПТ</div>
                        <div class="fs-4 fw-bold text-white" id="audit-stat-replacements">106</div>
                      </div>
                    </div>
                  </div>

                  <!-- Search and Filter Bar -->
                  <div class="row g-2 mb-3 align-items-center">
                    <div class="col-md-5">
                      <input type="text" class="form-control form-control-sm" id="audit-search-input" placeholder="🔍 Поиск по референции (RU-0003), названию или домену...">
                    </div>
                    <div class="col-md-4">
                      <select class="form-select form-select-sm" id="audit-filter-select">
                        <option value="all">Все объекты (551)</option>
                        <option value="issues">Только с замечаниями (Википедия / HTTP / Пустые)</option>
                        <option value="wikipedia" selected>⚠️ Только Википедия (приоритет R2BBX)</option>
                        <option value="replacement">🌲 Только с готовой официальной заменой в ООПТ</option>
                        <option value="insecure_http">🔓 Только HTTP (незащищенные)</option>
                        <option value="empty">❌ Только без ссылки</option>
                      </select>
                    </div>
                    <div class="col-md-3 text-end">
                      <span class="small text-muted" id="audit-count-info">Загрузка данных...</span>
                    </div>
                  </div>

                  <!-- Audit Table -->
                  <div class="table-responsive">
                    <table class="table table-bordered table-hover align-middle">
                      <thead class="table-light">
                        <tr>
                          <th style="width: 110px;">Референция</th>
                          <th style="width: 220px;">Название POTA</th>
                          <th>Текущая ссылка в POTA</th>
                          <th>Рекомендуемая официальная ссылка (ООПТ РФ)</th>
                          <th style="width: 140px;">Категория</th>
                          <th style="width: 140px;" class="text-center">Действия</th>
                        </tr>
                      </thead>
                      <tbody id="audit-table-body">
                        <tr><td colspan="6" class="text-center text-muted py-4"><span class="spinner-border spinner-border-sm text-primary"></span> Загрузка аудита ссылок...</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- Tab: Console -->
                <div class="tab-pane fade" id="list-console" role="tabpanel" aria-labelledby="list-console-list">
                  <div class="d-flex justify-content-between align-items-center mb-2">
                    <h3>Live Консоль активности</h3>
                    <button class="btn btn-sm btn-outline-secondary" onclick="fetchLogs()">🔄 Обновить вручную</button>
                  </div>
                  <div id="log-container">Ожидание логов...</div>
                </div>

              </div>
        </div>

        <!-- Modal: POTA Park Submitter -->
        <div class="modal fade" id="modal-pota-submitter" tabindex="-1" aria-labelledby="modalSubmitterLabel" aria-hidden="true">
          <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content shadow-lg border-0">
              <div class="modal-header bg-success text-white">
                <h5 class="modal-title" id="modalSubmitterLabel"><i class="bi bi-tree-fill"></i> 🌲 POTA Park Submitter — Подготовка заявки на новый парк</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body p-3">
                <div class="alert alert-info py-2 px-3 small mb-3">
                  <i class="bi bi-info-circle-fill"></i> <strong>Правила подачи координатору POTA (Manu R2BBX):</strong> Название парка указывается чистым (без слов «Заказник», «Памятник природы»), а статус — в поле статуса. Если территория расположена на границе нескольких регионов — указываются все регионы через запятую.
                </div>
                <div id="subm-pota-badge-container"></div>
                <form id="form-pota-submitter">
                  <input type="hidden" id="subm-nid">
                  <div class="row g-2 mb-2">
                    <div class="col-md-7">
                      <label class="form-label small fw-bold mb-1">1. Название парка/ООПТ (RU):</label>
                      <input type="text" class="form-control form-control-sm font-monospace fw-bold" id="subm-name" required>
                      <div class="form-text small text-muted">Собственное имя без бюрократических приставок и кавычек</div>
                    </div>
                    <div class="col-md-5">
                      <div class="d-flex justify-content-between align-items-center mb-1">
                        <label class="form-label small fw-bold mb-0">2. Название для POTA (EN):</label>
                        <button type="button" class="btn btn-xs btn-outline-success py-0 px-1" style="font-size:10px;" id="btn-ai-translate" onclick="runAiTranslateAdmin()"><i class="bi bi-stars"></i> AI перевод</button>
                      </div>
                      <input type="text" class="form-control form-control-sm font-monospace text-success fw-bold" id="subm-name-en" placeholder="Lakeside (Priozernyy)" required>
                      <div class="form-text small text-muted">Формат координатора POTA: Перевод (Транслитерация)</div>
                    </div>
                  </div>

                  <div class="row g-2 mb-2">
                    <div class="col-md-5">
                      <label class="form-label small fw-bold mb-1">3. Статус ООПТ для POTA (EN):</label>
                      <input type="text" class="form-control form-control-sm font-monospace text-success fw-bold" id="subm-status-en" required>
                      <div class="d-flex flex-wrap gap-1 mt-1">
                        <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-1 quick-pota-type-btn" style="font-size:10px;" data-type="Natural Monument">Natural Monument</button>
                        <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-1 quick-pota-type-btn" style="font-size:10px;" data-type="State Nature Reserve">State Nature Reserve</button>
                        <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-1 quick-pota-type-btn" style="font-size:10px;" data-type="State Nature Preserve">State Nature Preserve</button>
                        <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-1 quick-pota-type-btn" style="font-size:10px;" data-type="National Park">National Park</button>
                        <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-1 quick-pota-type-btn" style="font-size:10px;" data-type="Nature Park">Nature Park</button>
                        <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-1 quick-pota-type-btn" style="font-size:10px;" data-type="Botanical Gardens">Botanical Gardens</button>
                        <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-1 quick-pota-type-btn" style="font-size:10px;" data-type="Reserve">Reserve</button>
                      </div>
                    </div>
                    <div class="col-md-7">
                      <label class="form-label small fw-bold mb-1">4. Статус (парк/ООПТ и т.п.) (RU):</label>
                      <input type="text" class="form-control form-control-sm" id="subm-status" required>
                      <div class="form-text small text-muted">Официальная категория в РФ со значением</div>
                    </div>
                  </div>

                  <div class="row g-2 mb-2">
                    <div class="col-md-6">
                      <label class="form-label small fw-bold mb-1">5. DX Entity (POTA):</label>
                      <select class="form-select form-select-sm" id="subm-dx-entity">
                        <option value="European Russia (RU)">🇪🇺 European Russia (RU)</option>
                        <option value="Asiatic Russia (RU)">🌏 Asiatic Russia (RU)</option>
                        <option value="Kaliningrad (RU)">🏰 Kaliningrad (RU)</option>
                        <option value="Franz Josef Land (RU)">❄️ Franz Josef Land (RU)</option>
                      </select>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small fw-bold mb-1">6. Локация POTA (ISO): <span id="subm-location-badge"></span></label>
                      <input type="text" class="form-control form-control-sm font-monospace fw-bold" id="subm-location-code" placeholder="RU-ST или RU-MOS, RU-MOW">
                    </div>
                  </div>

                  <div class="row g-2 mb-2">
                    <div class="col-md-3">
                      <label class="form-label small fw-bold mb-1">7. Широта (Lat):</label>
                      <input type="text" class="form-control form-control-sm font-monospace" id="subm-lat" placeholder="55.8821">
                    </div>
                    <div class="col-md-3">
                      <label class="form-label small fw-bold mb-1">8. Долгота (Lon):</label>
                      <input type="text" class="form-control form-control-sm font-monospace" id="subm-lon" placeholder="37.7812">
                    </div>
                    <div class="col-md-3 d-flex align-items-end">
                      <button type="button" id="btn-subm-open-map" class="btn btn-sm btn-outline-primary w-100" title="Интерактивный выбор и уточнение координат на карте">
                        <i class="bi bi-pin-map-fill"></i> На карте
                      </button>
                    </div>
                    <div class="col-md-3 d-flex align-items-end">
                      <a href="#" id="subm-yandex-link" target="_blank" class="btn btn-sm btn-outline-warning w-100">
                        <i class="bi bi-geo-alt"></i> <span id="subm-yandex-text">Яндекс.Карты</span>
                      </a>
                    </div>
                  </div>

                  <div class="mb-2">
                    <label class="form-label small fw-bold mb-1">9. Регион России:</label>
                    <input type="text" class="form-control form-control-sm" id="subm-region" required>
                    <div class="form-text small text-muted">Для межрегиональных объектов указываются все субъекты через запятую (например: <i>Москва, Московская область</i>)</div>
                  </div>

                  <div class="mb-2">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                      <label class="form-label small fw-bold mb-0">10. Сайт объекта, ссылка:</label>
                      <div class="d-flex gap-1">
                        <button type="button" class="btn btn-xs btn-outline-success py-0 px-1.5" style="font-size:11px;" id="btn-set-link-nextgis" title="Установить ссылку NextGIS зеркала (приоритет R2BBX)">NextGIS (R2BBX)</button>
                        <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-1.5" style="font-size:11px;" id="btn-set-link-custom" title="Ввести собственный сайт парка или заповедника">Свой сайт</button>
                      </div>
                    </div>
                    <input type="text" class="form-control form-control-sm" id="subm-site" placeholder="https://ooptaari.nextgis.ru/node/... или сайт парка" required>
                    <div class="form-text small text-muted">Приоритет: собственный сайт парка или NextGIS по требованию R2BBX. Википедия, VK и коммерческие ресурсы не принимаются.</div>
                  </div>

                  <div class="mb-3">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                      <label class="form-label small fw-bold mb-0">11. Уточнение / Comments (не обязательно):</label>
                      <span id="subm-clarify-counter" class="badge bg-light text-secondary border font-monospace" style="font-size: 11px;">0 / 255</span>
                    </div>
                    <textarea class="form-control form-control-sm" id="subm-clarify" rows="2" placeholder="Границы, кластерные участки, вложенные ООПТ (строгий лимит 255 символов)"></textarea>
                    <div class="form-text small text-muted">Строгий лимит админки координатора POTA: не более 255 символов на всё поле.</div>
                  </div>

                  <div class="card bg-light border-success">
                    <div class="card-header bg-success-subtle py-1.5 px-3 small fw-bold d-flex justify-content-between align-items-center">
                      <span>📋 Готовый текст заявки для отправки R2BBX:</span>
                      <button type="button" class="btn btn-sm btn-success" id="btn-copy-submitter">
                        <i class="bi bi-clipboard-check"></i> Скопировать в буфер
                      </button>
                    </div>
                    <div class="card-body p-2">
                      <pre class="mb-0 font-monospace small bg-white p-2.5 border rounded" id="subm-preview" style="white-space: pre-wrap; user-select: all; font-size: 12px;"></pre>
                    </div>
                  </div>
                </form>
              </div>
              <div class="modal-footer py-2 px-3 bg-light d-flex justify-content-between">
                <span class="text-muted small" id="subm-coords-status"></span>
                <div class="d-flex gap-2">
                  <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Закрыть</button>
                  <button type="button" class="btn btn-outline-primary btn-sm" id="btn-email-submitter" title="Открыть почтовую программу с готовой заявкой для Manu R2BBX"><i class="bi bi-envelope-fill"></i> Отправить на Email</button>
                  <button type="button" class="btn btn-success btn-sm" id="btn-copy-submitter-bottom"><i class="bi bi-clipboard-check"></i> Скопировать готовую заявку</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Modal: Leaflet Interactive Coordinate Picker -->
        <div class="modal fade" id="modal-coord-picker" tabindex="-1" aria-labelledby="modalCoordPickerLabel" aria-hidden="true" style="z-index: 1060;">
          <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content shadow-lg border-0">
              <div class="modal-header bg-primary text-white py-2 px-3">
                <h6 class="modal-title mb-0" id="modalCoordPickerLabel"><i class="bi bi-pin-map-fill"></i> Интерактивный выбор координат для заявки</h6>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body p-2">
                <div class="d-flex justify-content-between align-items-center mb-2 px-1">
                  <small class="text-muted"><i class="bi bi-info-circle"></i> Перетащите маркер 📍 или кликните по карте в нужную точку парка (въезд, парковка, поляна для антенны).</small>
                  <div class="badge bg-dark font-monospace fs-6" id="picker-coords-display">Широта: 0.0000 | Долгота: 0.0000</div>
                </div>
                  <style>
                    #coord-picker-map .leaflet-control-attribution,
                    .leaflet-control-attribution {
                      display: none !important;
                    }
                  </style>
                  <div id="coord-picker-map" style="height: 440px; border-radius: 6px; border: 1px solid #ced4da;"></div>
              </div>
              <div class="modal-footer py-2 px-3 bg-light d-flex justify-content-between">
                <span class="text-muted small" id="picker-status-info">Кликните по карте для перемещения маркера</span>
                <div class="d-flex gap-2">
                  <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Отмена</button>
                  <button type="button" class="btn btn-success btn-sm" id="btn-apply-coords"><i class="bi bi-check2-circle"></i> Применить координаты</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <script>
          let Toast;
          if (typeof Swal !== 'undefined') {
            Toast = Swal.mixin({
              toast: true,
              position: 'top-end',
              showConfirmButton: false,
              timer: 5000,
              timerProgressBar: true,
              didOpen: (toast) => {
                toast.onmouseenter = Swal.stopTimer;
                toast.onmouseleave = Swal.resumeTimer;
              }
            });
          }

          // Open tab from URL hash if present
          if (window.location.hash) {
            const triggerEl = document.querySelector('a[href="' + window.location.hash + '"]');
            if (triggerEl) {
              const tab = new bootstrap.Tab(triggerEl);
              tab.show();
            }
          }

          // Update hash when a tab is clicked
          const tabEls = document.querySelectorAll('a[data-bs-toggle="list"]');
          tabEls.forEach(el => {
            el.addEventListener('shown.bs.tab', event => {
              window.history.replaceState(null, null, event.target.hash);
            });
          });

          async function approveUserBtn(btn) {
            const id = btn.getAttribute('data-id');
            try {
              const res = await fetch('/approve/' + id, { method: 'POST' });
              if (res.ok) {
                if (Toast) Toast.fire({ icon: 'success', title: 'Заявка одобрена!' });
                setTimeout(() => window.location.reload(), 500);
              }
            } catch (e) {
              if (Toast) Toast.fire({ icon: 'error', title: 'Ошибка' });
            }
          }

          async function rejectUserBtn(btn) {
            const id = btn.getAttribute('data-id');
            let isConfirmed = false;
            let reason = 'Причина не указана';
            
            if (typeof Swal === 'undefined') {
              const r = prompt('Причина отклонения:');
              if (r === null) return;
              isConfirmed = true;
              reason = r;
            } else {
              const result = await Swal.fire({
                title: 'Отклонить заявку',
                input: 'text',
                inputLabel: 'Причина отклонения:',
                inputPlaceholder: 'Введите причину...',
                showCancelButton: true,
                confirmButtonColor: '#d33'
              });
              isConfirmed = result.isConfirmed;
              reason = result.value || 'Причина не указана';
            }

            if (isConfirmed) {
              try {
                const res = await fetch('/reject/' + id, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ reason })
                });
                if (res.ok) {
                  const row = document.getElementById('user-row-' + id);
                  if (row) { row.classList.add('spot-row-leave'); setTimeout(() => row.remove(), 500); }
                  if (Toast) Toast.fire({ icon: 'success', title: 'Заявка отклонена' });
                }
              } catch (e) {
                if (Toast) Toast.fire({ icon: 'error', title: 'Ошибка сервера' });
              }
            }
          }

          async function deleteUserBtn(btn) {
            const id = btn.getAttribute('data-id');
            let isConfirmed = false;
            if (typeof Swal === 'undefined') {
              isConfirmed = confirm('Удалить пользователя из БД навсегда?');
            } else {
              const result = await Swal.fire({
                title: 'Удалить пользователя?',
                text: 'Пользователь будет навсегда удален из БД!',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                confirmButtonText: 'Да, удалить!'
              });
              isConfirmed = result.isConfirmed;
            }

            if (isConfirmed) {
              try {
                const res = await fetch('/delete-user/' + id, { method: 'POST' });
                if (res.ok) {
                  const row = document.getElementById('user-row-' + id);
                  if (row) { row.classList.add('spot-row-leave'); setTimeout(() => row.remove(), 500); }
                  if (Toast) Toast.fire({ icon: 'success', title: 'Пользователь удален' });
                }
              } catch(e) {
                if (Toast) Toast.fire({ icon: 'error', title: 'Ошибка удаления' });
              }
            }
          }

          async function deleteSpotBtn(btn) {
            try {
              const id = btn.getAttribute('data-id');
              const source = btn.getAttribute('data-source');
              const hasMsgId = !!btn.getAttribute('data-msg');
              
              console.log('Delete button clicked for spot:', id, source, hasMsgId);

              let warningHtml = 'Спот будет удален из <b>нашей локальной базы данных SQLite</b>.<br>';
              if (hasMsgId) {
                warningHtml += 'Сообщение также будет <b>удалено и откреплено из Telegram-канала</b>.<br>';
              } else {
                warningHtml += '<span class="text-muted small">(В Telegram-канале сообщение отсутствует либо уже удалено)</span><br>';
              }
              if (source === 'cluster' || source === 'cluster_muted') {
                warningHtml += '<br><span style="color: #d33;"><b>Внимание:</b> Это глобальный спот из кластера POTA. Мы не можем удалить его с сайта <i>pota.app</i> (API не позволяет). Он удалится только у нас.</span>';
              }

              let isConfirmed = false;
              if (typeof Swal === 'undefined') {
                const plainText = warningHtml.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
                isConfirmed = confirm("Удалить спот?\\n\\n" + plainText);
              } else {
                const result = await Swal.fire({
                  title: 'Удалить спот?',
                  html: warningHtml,
                  icon: 'warning',
                  showCancelButton: true,
                  confirmButtonColor: '#d33',
                  cancelButtonColor: '#6c757d',
                  confirmButtonText: 'Да, удалить!',
                  cancelButtonText: 'Отмена'
                });
                isConfirmed = result.isConfirmed;
              }

              if (isConfirmed) {
                const row = document.getElementById('spot-row-' + id);
                if (row) row.classList.add('spot-row-leave');
                
                const res = await fetch('/spots/delete/' + id, { method: 'POST' });
                if (res.ok) {
                  if (row) setTimeout(() => row.remove(), 500);
                  if (Toast) Toast.fire({ icon: 'success', title: 'Спот успешно удален!' });
                  else alert('Спот успешно удален!');
                } else {
                  throw new Error('Server error: ' + res.status);
                }
              }
            } catch (err) {
              console.error('Delete spot error:', err);
              const id = btn.getAttribute('data-id');
              const row = document.getElementById('spot-row-' + id);
              if (row) row.classList.remove('spot-row-leave');
              if (Toast) Toast.fire({ icon: 'error', title: 'Ошибка при удалении спота' });
              else alert('Ошибка при удалении спота');
            }
          }

          async function clearAllSpots() {
            let isConfirmed = false;
            if (typeof Swal === 'undefined') {
              isConfirmed = confirm('Очистить все споты из локальной БД SQLite?');
            } else {
              const result = await Swal.fire({
                title: 'Очистить все споты из БД?',
                html: 'Все записи о спотах будут <b>безвозвратно удалены из локальной базы данных SQLite</b>.<br><small class="text-muted">(Сообщения в Telegram-канале при этом не затрагиваются)</small>',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#6c757d',
                confirmButtonText: 'Да, очистить всё!',
                cancelButtonText: 'Отмена'
              });
              isConfirmed = result.isConfirmed;
            }

            if (isConfirmed) {
              try {
                const res = await fetch('/api/spots/clear-all', { method: 'POST' });
                if (res.ok) {
                  if (Toast) Toast.fire({ icon: 'success', title: 'База спотов очищена!' });
                  else alert('База спотов очищена!');
                  loadSpots();
                } else {
                  throw new Error('Server error: ' + res.status);
                }
              } catch (err) {
                console.error('Clear all spots error:', err);
                if (Toast) Toast.fire({ icon: 'error', title: 'Ошибка при очистке спотов' });
                else alert('Ошибка при очистке спотов');
              }
            }
          }

          async function muteSpotCallsign(btn) {
            const callsign = (btn.getAttribute('data-callsign') || '').trim().toUpperCase();
            if (!callsign) return;

            let reason = 'Спам из ленты спотов';
            let isConfirmed = false;

            if (typeof Swal === 'undefined') {
              const inputReason = prompt('Внести позывной ' + callsign + ' в список исключений вещания (бан)? Укажите причину:', reason);
              if (inputReason !== null) {
                reason = inputReason.trim() || reason;
                isConfirmed = true;
              }
            } else {
              const result = await Swal.fire({
                title: 'Внести ' + callsign + ' в бан?',
                text: 'Позывной ' + callsign + ' будет добавлен в список исключений вещания. Его споты перестанут транслироваться в Telegram-канал и группу.',
                input: 'text',
                inputValue: reason,
                inputLabel: 'Причина внесения в исключения:',
                showCancelButton: true,
                confirmButtonColor: '#ffc107',
                confirmButtonText: 'Внести в исключения',
                cancelButtonText: 'Отмена'
              });
              if (result.isConfirmed) {
                reason = (result.value || '').trim() || reason;
                isConfirmed = true;
              }
            }

            if (isConfirmed) {
              try {
                const res = await fetch('/admin/muted-callsigns/add-ajax', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ callsign, reason })
                });
                if (res.ok) {
                  btn.className = 'btn btn-sm btn-secondary disabled me-1';
                  btn.innerHTML = '🔇 В бане';
                  btn.disabled = true;
                  if (Toast) Toast.fire({ icon: 'success', title: 'Позывной ' + callsign + ' добавлен в бан вещания!' });
                  else alert('Позывной ' + callsign + ' добавлен в бан вещания!');
                } else {
                  throw new Error('Server error: ' + res.status);
                }
              } catch (err) {
                console.error('Mute callsign error:', err);
                if (Toast) Toast.fire({ icon: 'error', title: 'Ошибка добавления в бан' });
                else alert('Ошибка добавления в бан');
              }
            }
          }

          async function loadSpots() {
            // Prevent refreshing table while user is confirming a deletion to avoid UI glitches
            if (typeof Swal !== 'undefined' && Swal.isVisible()) return;
            try {
              const res = await fetch('/api/spots');
              if (res.ok) {
                const spots = await res.json();
                let html = '';
                spots.forEach(s => {
                  const dateStr = new Date(s.created_at).toLocaleString('ru-RU');
                  const msgAttr = s.msg_id ? 'true' : '';
                  const sourceAttr = s.source || '';

                  let sourceBadge = escapeHtmlClient(sourceAttr);
                  if (sourceAttr.includes('tma') && !sourceAttr.includes('guest')) {
                    sourceBadge = '<span class="badge bg-primary">📱 ' + escapeHtmlClient(sourceAttr) + '</span>';
                  } else if (sourceAttr.includes('guest')) {
                    sourceBadge = '<span class="badge bg-info text-dark">🌐 ' + escapeHtmlClient(sourceAttr) + '</span>';
                  } else if (sourceAttr === 'bot') {
                    sourceBadge = '<span class="badge bg-secondary">🤖 Бот</span>';
                  } else if (sourceAttr === 'cluster') {
                    sourceBadge = '<span class="badge bg-dark">📡 Кластер</span>';
                  } else if (sourceAttr === 'cluster_muted') {
                    sourceBadge = '<span class="badge bg-secondary text-light">🔇 cluster (muted)</span>';
                  } else if (sourceAttr === 'local') {
                    sourceBadge = '<span class="badge bg-primary">📱 TMA</span>';
                  }

                  const ipDisplay = s.ip_address 
                    ? '<span class="badge bg-light text-secondary font-monospace border">' + escapeHtmlClient(s.ip_address) + '</span>'
                    : '<span class="text-muted small">—</span>';

                  const muteBtn = '<button type="button" class="btn btn-sm btn-outline-warning mute-spot-call-btn me-1" data-callsign="' + escapeHtmlClient(s.callsign) + '" title="Внести позывной в исключения вещания (бан)">В бан</button>';
                  const delBtn = '<button type="button" class="btn btn-sm btn-outline-danger delete-spot-btn" data-id="' + s.id + '" data-source="' + escapeHtmlClient(sourceAttr) + '" data-msg="' + msgAttr + '" title="Удалить спот из БД (и канала)">Удалить</button>';

                  html += '<tr id="spot-row-' + s.id + '">';
                  html += '<td><strong>' + escapeHtmlClient(s.callsign) + '</strong></td>';
                  html += '<td><a href="https://next.pota.app/park/' + escapeHtmlClient(s.reference) + '" target="_blank">' + escapeHtmlClient(s.reference) + '</a></td>';
                  html += '<td>' + escapeHtmlClient(s.frequency || '') + ' ' + escapeHtmlClient(s.mode || '') + '</td>';
                  html += '<td>' + sourceBadge + '</td>';
                  html += '<td>' + ipDisplay + '</td>';
                  html += '<td>' + dateStr + '</td>';
                  html += '<td class="text-nowrap">' + muteBtn + delBtn + '</td>';
                  html += '</tr>';
                });
                const tbody = document.getElementById('spots-tbody');
                if (tbody) tbody.innerHTML = html || '<tr><td colspan="7" class="text-center">Спотов пока нет</td></tr>';
              }
            } catch (e) {
              console.error(e);
            }
          }

          async function archiveAllShield() {
            let isConfirmed = false;
            if (typeof Swal === 'undefined') {
              isConfirmed = confirm('Перенести все активные инциденты в архив (хранятся до 20 последних)?');
            } else {
              const result = await Swal.fire({
                title: 'Архивировать все записи?',
                html: 'Все активные инциденты будут помечены как прочитанные и перенесены в архив.<br><small class="text-muted">В архиве будут сохранены до 20 последних инцидентов, более старые очистятся.</small>',
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#ffc107',
                confirmButtonText: 'Да, в архив!',
                cancelButtonText: 'Отмена'
              });
              isConfirmed = result.isConfirmed;
            }

            if (isConfirmed) {
              try {
                const res = await fetch('/api/shield/archive-all', { method: 'POST' });
                if (res.ok) {
                  if (Toast) Toast.fire({ icon: 'success', title: 'Инциденты перенесены в архив' });
                  setTimeout(() => location.reload(), 600);
                } else {
                  throw new Error('Server error: ' + res.status);
                }
              } catch (err) {
                console.error('Archive shield error:', err);
                if (Toast) Toast.fire({ icon: 'error', title: 'Ошибка архивации' });
              }
            }
          }

          async function clearAllShield() {
            let isConfirmed = false;
            if (typeof Swal === 'undefined') {
              isConfirmed = confirm('Полностью очистить весь журнал инцидентов RU-POTA Shield?');
            } else {
              const result = await Swal.fire({
                title: 'Очистить весь журнал?',
                html: 'Все записи инцидентов антиспам-щита (включая архив) будут <b>безвозвратно удалены</b>.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#dc3545',
                confirmButtonText: 'Да, удалить всё!',
                cancelButtonText: 'Отмена'
              });
              isConfirmed = result.isConfirmed;
            }

            if (isConfirmed) {
              try {
                const res = await fetch('/api/shield/clear-all', { method: 'POST' });
                if (res.ok) {
                  if (Toast) Toast.fire({ icon: 'success', title: 'Журнал полностью очищен' });
                  setTimeout(() => location.reload(), 600);
                } else {
                  throw new Error('Server error: ' + res.status);
                }
              } catch (err) {
                console.error('Clear shield error:', err);
                if (Toast) Toast.fire({ icon: 'error', title: 'Ошибка очистки' });
              }
            }
          }

          // Global event listener for spots and users deletion
          document.addEventListener('click', function(e) {
            const clearSpotsBtn = e.target.closest('#btn-clear-all-spots');
            if (clearSpotsBtn) {
              e.preventDefault();
              clearAllSpots();
              return;
            }
            const muteSpotBtn = e.target.closest('.mute-spot-call-btn');
            if (muteSpotBtn) {
              e.preventDefault();
              muteSpotCallsign(muteSpotBtn);
              return;
            }
            const spotBtn = e.target.closest('.delete-spot-btn');
            if (spotBtn) {
              e.preventDefault();
              deleteSpotBtn(spotBtn);
              return;
            }
            const deleteUsrBtn = e.target.closest('.delete-user-btn');
            if (deleteUsrBtn) {
              e.preventDefault();
              deleteUserBtn(deleteUsrBtn);
              return;
            }
            const rejectBtn = e.target.closest('.reject-user-btn');
            if (rejectBtn) {
              e.preventDefault();
              rejectUserBtn(rejectBtn);
              return;
            }
            const approveBtn = e.target.closest('.approve-user-btn');
            if (approveBtn) {
              e.preventDefault();
              approveUserBtn(approveBtn);
              return;
            }
            const banBtn = e.target.closest('.ban-user-btn');
            if (banBtn) {
              e.preventDefault();
              banUserBtn(banBtn);
              return;
            }
            const unbanBtn = e.target.closest('.unban-user-btn');
            if (unbanBtn) {
              e.preventDefault();
              unbanUserBtn(unbanBtn);
              return;
            }
            const markAllBtn = e.target.closest('#mark-all-read-btn');
            if (markAllBtn) {
              e.preventDefault();
              markAllRead();
              return;
            }
            const archiveShieldBtn = e.target.closest('#btn-archive-all-shield');
            if (archiveShieldBtn) {
              e.preventDefault();
              archiveAllShield();
              return;
            }
            const clearShieldBtn = e.target.closest('#btn-clear-all-shield');
            if (clearShieldBtn) {
              e.preventDefault();
              clearAllShield();
              return;
            }
          });

          // Checkbox toggle read listener
          document.addEventListener('change', function(e) {
            const readCb = e.target.closest('.toggle-read-cb');
            if (readCb) {
              toggleReadCb(readCb);
            }
          });

          async function banUserBtn(btn) {
            const id = btn.getAttribute('data-id');
            const tgid = btn.getAttribute('data-tgid');
            const user = btn.getAttribute('data-user') || tgid;
            let isConfirmed = false;
            if (typeof Swal === 'undefined') {
              isConfirmed = confirm('Забанить пользователя ' + user + ' (TG ID: ' + tgid + ') в Telegram-группе?');
            } else {
              const result = await Swal.fire({
                title: 'Забанить пользователя?',
                text: 'Пользователь ' + user + ' (TG ID: ' + tgid + ') будет заблокирован в Telegram-группе сообщества.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#dc3545',
                confirmButtonText: 'Да, забанить',
                cancelButtonText: 'Отмена'
              });
              isConfirmed = result.isConfirmed;
            }

            if (isConfirmed) {
              try {
                const res = await fetch('/api/shield/ban/' + id, { method: 'POST' });
                if (res.ok) {
                  if (Toast) Toast.fire({ icon: 'success', title: 'Пользователь забанен!' });
                  const actionBadge = document.getElementById('action-badge-' + id);
                  if (actionBadge) actionBadge.innerHTML = '<span class="badge bg-danger">Забанен</span>';
                  const actionCell = document.getElementById('action-cell-' + id);
                  if (actionCell) {
                    actionCell.innerHTML = '<button type="button" class="btn btn-sm btn-outline-success unban-user-btn" data-id="' + id + '" data-tgid="' + tgid + '" data-user="' + user + '" title="Разблокировать в Telegram"><i class="bi bi-unlock"></i> Разблокировать</button>';
                  }
                } else {
                  throw new Error('Server error');
                }
              } catch (e) {
                if (Toast) Toast.fire({ icon: 'error', title: 'Ошибка блокировки' });
              }
            }
          }

          async function unbanUserBtn(btn) {
            const id = btn.getAttribute('data-id');
            const tgid = btn.getAttribute('data-tgid');
            const user = btn.getAttribute('data-user') || tgid;
            let isConfirmed = false;
            if (typeof Swal === 'undefined') {
              isConfirmed = confirm('Разблокировать пользователя ' + user + ' (TG ID: ' + tgid + ')?');
            } else {
              const result = await Swal.fire({
                title: 'Разблокировать?',
                text: 'Пользователь ' + user + ' (TG ID: ' + tgid + ') будет разблокирован в Telegram-чате сообщества.',
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#198754',
                confirmButtonText: 'Да, разблокировать',
                cancelButtonText: 'Отмена'
              });
              isConfirmed = result.isConfirmed;
            }

            if (isConfirmed) {
              try {
                const res = await fetch('/api/shield/unban/' + id, { method: 'POST' });
                if (res.ok) {
                  if (Toast) Toast.fire({ icon: 'success', title: 'Пользователь разблокирован!' });
                  const actionBadge = document.getElementById('action-badge-' + id);
                  if (actionBadge) actionBadge.innerHTML = '<span class="badge bg-success">Разблокирован</span>';
                  const actionCell = document.getElementById('action-cell-' + id);
                  if (actionCell) {
                    actionCell.innerHTML = '<button type="button" class="btn btn-sm btn-outline-danger ban-user-btn" data-id="' + id + '" data-tgid="' + tgid + '" data-user="' + user + '" title="Забанить в Telegram"><i class="bi bi-slash-circle"></i> Забанить</button>';
                  }
                } else {
                  throw new Error('Server error');
                }
              } catch (e) {
                if (Toast) Toast.fire({ icon: 'error', title: 'Ошибка разблокировки' });
              }
            }
          }

          async function toggleReadCb(cb) {
            const id = cb.getAttribute('data-id');
            try {
              const res = await fetch('/api/shield/toggle-read/' + id, { method: 'POST' });
              if (res.ok) {
                const data = await res.json();
                const row = document.getElementById('blocked-row-' + id);
                if (row) {
                  if (data.is_read) {
                    row.classList.add('table-light', 'text-muted', 'opacity-75');
                    cb.title = 'Отмечено как прочитанное';
                  } else {
                    row.classList.remove('table-light', 'text-muted', 'opacity-75');
                    cb.title = 'Отметить как прочитанное';
                  }
                }
                updateShieldBadge(data.unreadCount);
              }
            } catch (e) {
              console.error('Failed to toggle read status:', e);
            }
          }

          async function markAllRead() {
            try {
              const res = await fetch('/api/shield/read-all', { method: 'POST' });
              if (res.ok) {
                document.querySelectorAll('.toggle-read-cb').forEach(cb => {
                  cb.checked = true;
                  cb.title = 'Отмечено как прочитанное';
                });
                document.querySelectorAll('tr[id^="blocked-row-"]').forEach(row => {
                  row.classList.add('table-light', 'text-muted', 'opacity-75');
                });
                updateShieldBadge(0);
                if (Toast) Toast.fire({ icon: 'success', title: 'Все уведомления прочитаны' });
              }
            } catch (e) {
              console.error('Failed to mark all read:', e);
            }
          }

          function updateShieldBadge(count) {
            const badge = document.getElementById('shield-unread-badge');
            if (badge) {
              badge.textContent = count;
              if (count > 0) {
                badge.classList.remove('d-none');
              } else {
                badge.classList.add('d-none');
              }
            }
          }

          // Load user infos
          async function loadUserInfos() {
            const rows = document.querySelectorAll('tr[id^="user-row-"]');
            for (const row of rows) {
              const id = row.id.replace('user-row-', '');
              if (parseInt(id, 10) < 0) continue; // Skip web users
              try {
                const res = await fetch('/api/user-info/' + id);
                if (res.ok) {
                  const data = await res.json();
                  const infoDiv = document.getElementById('user-info-' + id);
                  const avatarImg = document.getElementById('avatar-' + id);
                  if (infoDiv) {
                     let text = [];
                     if (data.first_name || data.last_name) {
                       text.push((data.first_name + ' ' + (data.last_name || '')).trim());
                     }
                     if (data.username) text.push('@' + data.username);
                     infoDiv.innerHTML = text.length > 0 ? text.join(' • ') : 'Нет данных Telegram';
                  }
                  if (avatarImg && data.avatar) {
                     avatarImg.src = data.avatar;
                  }
                } else {
                  throw new Error('Bad response');
                }
              } catch(e) {
                const infoDiv = document.getElementById('user-info-' + id);
                if (infoDiv) infoDiv.innerHTML = '<span class="text-danger">Ошибка загрузки</span>';
              }
            }
          }

          loadUserInfos();

          // Auto-refresh spots every 5 seconds if Spots tab is active
          setInterval(() => {
            const tab = document.getElementById('list-spots');
            if (tab && tab.classList.contains('active')) {
              loadSpots();
            }
          }, 5000);

          // Live console fetch
          const logContainer = document.getElementById('log-container');
          function escapeHtml(text) {
            return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          }

          async function fetchLogs() {
            try {
              const res = await fetch('/api/logs');
              if (res.ok) {
                const logs = await res.json();
                let logHtml = '';
                logs.forEach(l => {
                  let cssClass = '';
                  if (l.type === 'warn') cssClass = 'log-warn';
                  if (l.type === 'error') cssClass = 'log-error';
                  const time = new Date(l.timestamp).toLocaleTimeString('ru-RU');
                  logHtml += '<div class="' + cssClass + '">[' + time + '] ' + escapeHtml(l.message) + '</div>';
                });
                logContainer.innerHTML = logHtml || '<div>Нет событий</div>';
                logContainer.scrollTop = logContainer.scrollHeight;
              } else {
                logContainer.innerHTML = '<div class="text-danger">Ошибка сети: ' + res.status + '</div>';
              }
            } catch(e) {
              logContainer.innerHTML = '<div class="text-danger">Ошибка загрузки логов</div>';
            }
          }
          
          // Poll logs every 3 seconds if the tab is visible
          setInterval(() => {
            const tab = document.getElementById('list-console');
            if (tab && tab.classList.contains('active')) {
              fetchLogs();
            }
          }, 3000);
          
          // Initial fetch
          fetchLogs();

          // Pinned Message Editor Logic
          const defaultPinnedTemplate = ${JSON.stringify(WELCOME_PINNED_POST)};
          const pinnedTextArea = document.getElementById('pinned-text');
          if (pinnedTextArea) {
            pinnedTextArea.value = defaultPinnedTemplate;
          }

          document.getElementById('btn-reset-template')?.addEventListener('click', () => {
            if (pinnedTextArea) {
              pinnedTextArea.value = defaultPinnedTemplate;
              Toast.fire({ icon: 'info', title: 'Шаблон восстановлен' });
            }
          });

          document.getElementById('edit-pinned-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-save-pinned');
            const originalHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Обновление в Telegram...';

            try {
              const res = await fetch('/api/edit-pinned', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chatId: document.getElementById('pinned-chat-id').value,
                  messageId: document.getElementById('pinned-msg-id').value,
                  text: document.getElementById('pinned-text').value,
                })
              });
              const data = await res.json();
              if (res.ok && data.success) {
                Swal.fire({
                  icon: 'success',
                  title: 'Успешно!',
                  text: data.message || 'Закрепленное сообщение обновлено в Telegram!'
                });
              } else {
                Swal.fire({
                  icon: 'error',
                  title: 'Ошибка',
                  text: data.error || 'Не удалось обновить сообщение в Telegram'
                });
              }
            } catch (err) {
              Swal.fire({
                icon: 'error',
                title: 'Сетевая ошибка',
                text: err.message
              });
            } finally {
              btn.disabled = false;
              btn.innerHTML = originalHtml;
            }
          });

          // OOPT Registry Admin Client
          let ooptCurrentPage = 1;
          const ooptLimit = 20;
          let ooptPotaOnly = false;
          let ooptStatsLoaded = false;

          function escapeHtmlClient(str) {
            if (!str) return '';
            return String(str)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
          }

          async function loadAdminOoptStats() {
            try {
              const res = await fetch('/api/admin/oopt/stats');
              const stats = await res.json();
              if (stats) {
                const totalEl = document.getElementById('stat-oopt-total');
                const fedEl = document.getElementById('stat-oopt-fed');
                const regEl = document.getElementById('stat-oopt-reg');
                const locEl = document.getElementById('stat-oopt-loc');
                const potaEl = document.getElementById('stat-oopt-pota');

                if (totalEl && stats.total) totalEl.textContent = Number(stats.total).toLocaleString('ru-RU');
                if (fedEl && stats.federal) fedEl.textContent = Number(stats.federal).toLocaleString('ru-RU');
                if (regEl && stats.regional) regEl.textContent = Number(stats.regional).toLocaleString('ru-RU');
                if (locEl && stats.local) locEl.textContent = Number(stats.local).toLocaleString('ru-RU');
                if (potaEl && stats.inPota) potaEl.textContent = Number(stats.inPota).toLocaleString('ru-RU');

                const regionEl = document.getElementById('oopt-region-select');
                if (regionEl && regionEl.options.length <= 1 && stats.regions) {
                  window.__adminRegionPotaCounts = stats.regionPotaCounts || {};
                  stats.regions.forEach(function(r) {
                    const opt = document.createElement('option');
                    opt.value = r;
                    const pCount = (stats.regionPotaCounts && stats.regionPotaCounts[r] !== undefined) ? stats.regionPotaCounts[r] : null;
                    const suffix = pCount !== null ? (pCount === 0 ? ' (0 POTA ⚠️)' : (' (' + pCount + ' POTA)')) : '';
                    opt.textContent = r + suffix;
                    regionEl.appendChild(opt);
                  });
                  if (stats.restrictedRegions && stats.restrictedRegions.length > 0) {
                    const optgroup = document.createElement('optgroup');
                    optgroup.label = '⛔ Временно недоступно для POTA';
                    stats.restrictedRegions.forEach(function(r) {
                      const opt = document.createElement('option');
                      opt.value = r;
                      opt.textContent = r + ' (временно недоступно)';
                      optgroup.appendChild(opt);
                    });
                    regionEl.appendChild(optgroup);
                  }
                }
                ooptStatsLoaded = true;
              }
            } catch (e) {
              console.warn('[Admin] Failed to load OOPT stats:', e.message);
            }
          }

          async function loadAdminOopt(page) {
            if (!page) page = 1;
            ooptCurrentPage = page;
            if (!ooptStatsLoaded) loadAdminOoptStats();

            const searchEl = document.getElementById('oopt-search-input');
            const sigEl = document.getElementById('oopt-sig-select');
            const regionEl = document.getElementById('oopt-region-select');

            const search = searchEl ? searchEl.value : '';
            const sig = sigEl ? sigEl.value : '';
            const region = regionEl ? regionEl.value : '';

            const tbody = document.getElementById('oopt-table-body');
            const info = document.getElementById('oopt-pagination-info');
            const prevBtn = document.getElementById('oopt-prev-page');
            const nextBtn = document.getElementById('oopt-next-page');

            if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted"><span class="spinner-border spinner-border-sm"></span> Загрузка...</td></tr>';

            try {
              const query = new URLSearchParams({ 
                page: String(page), 
                limit: String(ooptLimit), 
                search: search, 
                sig: sig,
                region: region 
              });
              if (ooptPotaOnly) {
                query.set('pota', 'in_pota');
              }
              const res = await fetch('/api/admin/oopt?' + query.toString());
              const data = await res.json();

              if (!data.rows || data.rows.length === 0) {
                if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Ничего не найдено</td></tr>';
                if (info) info.textContent = '0 записей';
                if (prevBtn) prevBtn.disabled = true;
                if (nextBtn) nextBtn.disabled = true;
                return;
              }

              if (info) info.textContent = 'Стр. ' + data.page + ' из ' + data.totalPages + ' (всего ' + Number(data.total).toLocaleString('ru-RU') + ')';
              if (prevBtn) prevBtn.disabled = data.page <= 1;
              if (nextBtn) nextBtn.disabled = data.page >= data.totalPages;

              const rowsHtml = data.rows.map(function(r) {
                var sigBadge = r.sig === 'federal'
                  ? '<span class="badge text-white" style="background:#6f42c1 !important">🏛️ Федеральное</span>'
                  : r.sig === 'regional'
                  ? '<span class="badge bg-success">🌲 Региональное</span>'
                  : '<span class="badge bg-warning text-dark">🏡 Местное</span>';

                var potaBadge = r.pota_ref
                  ? ' <a href="https://next.pota.app/park/' + r.pota_ref + '" target="_blank" class="badge bg-success text-decoration-none ms-1" title="' + escapeHtmlClient(r.pota_name || '') + '"><i class="bi bi-check-circle-fill"></i> В POTA: ' + r.pota_ref + '</a>'
                  : '';

                var submitterBtn;
                if (r.pota_restricted) {
                  submitterBtn = '<button type="button" class="btn btn-sm btn-outline-secondary disabled" title="Приём заявок для данного региона временно приостановлен комитетом POTA"><i class="bi bi-slash-circle"></i> Недоступно для POTA</button>';
                } else if (r.pota_ref) {
                  submitterBtn = '<button type="button" class="btn btn-sm btn-outline-success open-submitter-btn" data-nid="' + r.nid + '" data-title="' + escapeHtmlClient(r.title) + '" data-category="' + escapeHtmlClient(r.category || '') + '" data-sig="' + escapeHtmlClient(r.sig_display || '') + '" data-ate="' + escapeHtmlClient(r.ate || '') + '" data-lat="' + (r.lat || '') + '" data-lon="' + (r.lon || '') + '" data-area="' + (r.area || '') + '" data-status="' + escapeHtmlClient(r.status || '') + '" data-profile="' + escapeHtmlClient(r.profile || '') + '" data-pota-ref="' + r.pota_ref + '" data-pota-name="' + escapeHtmlClient(r.pota_name || '') + '"><i class="bi bi-check2-circle"></i> Уже в POTA (' + r.pota_ref + ')</button>';
                } else {
                  submitterBtn = '<button type="button" class="btn btn-sm btn-outline-success open-submitter-btn" data-nid="' + r.nid + '" data-title="' + escapeHtmlClient(r.title) + '" data-category="' + escapeHtmlClient(r.category || '') + '" data-sig="' + escapeHtmlClient(r.sig_display || '') + '" data-ate="' + escapeHtmlClient(r.ate || '') + '" data-lat="' + (r.lat || '') + '" data-lon="' + (r.lon || '') + '" data-area="' + (r.area || '') + '" data-status="' + escapeHtmlClient(r.status || '') + '" data-profile="' + escapeHtmlClient(r.profile || '') + '" data-pota-ref="" data-pota-name=""><i class="bi bi-pencil-square"></i> 📋 Подготовить заявку POTA</button>';
                }

                return '<tr>' +
                  '<td><code>' + r.nid + '</code></td>' +
                  '<td><strong>' + escapeHtmlClient(r.title) + '</strong>' + potaBadge + '</td>' +
                  '<td>' + sigBadge + '</td>' +
                  '<td><small>' + escapeHtmlClient(r.category || '') + '</small></td>' +
                  '<td><small class="text-muted">' + escapeHtmlClient(r.ate || '') + '</small></td>' +
                  '<td>' + (r.area ? Number(r.area).toLocaleString('ru-RU') + ' га' : '—') + '</td>' +
                  '<td>' + submitterBtn + '</td>' +
                '</tr>';
              }).join('');

              if (tbody) tbody.innerHTML = rowsHtml;
            } catch (err) {
              if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Ошибка: ' + err.message + '</td></tr>';
            }
          }

          var ooptTabEl = document.getElementById('list-oopt-list');
          if (ooptTabEl) {
            ooptTabEl.addEventListener('shown.bs.tab', function() {
              loadAdminOopt(1);
            });
          }

          // Tab persistence across page reloads (F5) via URL hash
          var initialHash = window.location.hash;
          if (initialHash) {
            var targetNav = document.querySelector('#list-tab a[href="' + initialHash + '"]');
            if (targetNav) {
              var bsTabInstance = bootstrap.Tab.getOrCreateInstance(targetNav);
              bsTabInstance.show();
            }
          }

          document.querySelectorAll('#list-tab a').forEach(function(navLink) {
            navLink.addEventListener('shown.bs.tab', function(evt) {
              var href = evt.target.getAttribute('href');
              if (href) history.replaceState(null, null, href);
            });
          });

          // If OOPT tab is active on initial load, fetch immediately
          if (window.location.hash === '#list-oopt' || (document.getElementById('list-oopt') && document.getElementById('list-oopt').classList.contains('active'))) {
            loadAdminOopt(1);
          }

          var ooptSearchTimer;
          var ooptSearchEl = document.getElementById('oopt-search-input');
          if (ooptSearchEl) {
            ooptSearchEl.addEventListener('input', function() {
              clearTimeout(ooptSearchTimer);
              ooptSearchTimer = setTimeout(function() { loadAdminOopt(1); }, 350);
            });
          }

          var ooptSigEl = document.getElementById('oopt-sig-select');
          if (ooptSigEl) {
            ooptSigEl.addEventListener('change', function() {
              loadAdminOopt(1);
            });
          }

          var ooptRegionEl = document.getElementById('oopt-region-select');
          if (ooptRegionEl) {
            ooptRegionEl.addEventListener('change', function() {
              loadAdminOopt(1);
            });
          }

          var cardFilterPota = document.getElementById('card-filter-pota');
          if (cardFilterPota) {
            cardFilterPota.addEventListener('click', function() {
              ooptPotaOnly = !ooptPotaOnly;
              var label = document.getElementById('pota-filter-label');
              if (ooptPotaOnly) {
                cardFilterPota.classList.add('border', 'border-3', 'border-warning', 'shadow');
                if (label) label.textContent = '(вкл)';
              } else {
                cardFilterPota.classList.remove('border', 'border-3', 'border-warning', 'shadow');
                if (label) label.textContent = '(все)';
              }
              loadAdminOopt(1);
            });
          }

          var ooptPrevEl = document.getElementById('oopt-prev-page');
          if (ooptPrevEl) {
            ooptPrevEl.addEventListener('click', function() {
              if (ooptCurrentPage > 1) loadAdminOopt(ooptCurrentPage - 1);
            });
          }

          var ooptNextEl = document.getElementById('oopt-next-page');
          if (ooptNextEl) {
            ooptNextEl.addEventListener('click', function() {
              loadAdminOopt(ooptCurrentPage + 1);
            });
          }

          var btnSyncOopt = document.getElementById('btn-sync-oopt');
          if (btnSyncOopt) {
            btnSyncOopt.addEventListener('click', async function() {
              btnSyncOopt.disabled = true;
              btnSyncOopt.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Синхронизация...';
              try {
                var res = await fetch('/api/admin/oopt/sync', { method: 'POST' });
                var data = await res.json();
                if (res.ok && data.success) {
                  Swal.fire({ icon: 'success', title: 'Успешно!', text: 'Синхронизировано ' + data.count + ' объектов ООПТ РФ!' });
                  loadAdminOoptStats();
                  loadAdminOopt(1);
                } else {
                  Swal.fire({ icon: 'error', title: 'Ошибка', text: data.error || 'Ошибка синхронизации' });
                }
              } catch (e) {
                Swal.fire({ icon: 'error', title: 'Ошибка', text: e.message });
              } finally {
                btnSyncOopt.disabled = false;
                btnSyncOopt.innerHTML = '<i class="bi bi-arrow-repeat"></i> Синхронизировать с карта.оцзк.рф';
              }
            });
          }

          // Smart Parser per Manu R2BBX's instruction
          var ruToEnMap = {
            'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
            'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
            'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
            'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
            'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
          };

          function transliterateClient(str) {
            return (str || '').split('').map(function(c) {
              var lower = c.toLowerCase();
              var mapped = ruToEnMap[lower];
              if (mapped === undefined) return c;
              return c === c.toUpperCase() ? (mapped.charAt(0).toUpperCase() + mapped.slice(1)) : mapped;
            }).join('');
          }

          var BUREAUCRATIC_PATTERNS = [
            /федерального государственного автономного образовательного учреждения высшего образования/gi,
            /федерального государственного автономного образовательного учреждения высшего профессионального образования/gi,
            /федерального государственного автономного образовательного учреждения/gi,
            /федерального государственного автономного научного учреждения/gi,
            /федерального государственного автономного учреждения/gi,
            /федерального государственного бюджетного образовательного учреждения высшего образования/gi,
            /федерального государственного бюджетного образовательного учреждения высшего профессионального образования/gi,
            /федерального государственного бюджетного образовательного учреждения/gi,
            /федерального государственного бюджетного научного учреждения/gi,
            /федерального государственного бюджетного учреждения науки/gi,
            /федерального государственного бюджетного учреждения/gi,
            /федерального государственного казенного учреждения/gi,
            /государственного бюджетного образовательного учреждения высшего образования/gi,
            /государственного бюджетного образовательного учреждения высшего профессионального образования/gi,
            /государственного бюджетного образовательного учреждения/gi,
            /государственного образовательного учреждения высшего профессионального образования/gi,
            /государственного образовательного учреждения/gi,
            /государственного бюджетного учреждения/gi,
            /государственного казенного учреждения/gi,
            /государственного автономного учреждения/gi,
            /федерального бюджетного учреждения/gi,
            /федерального автономного учреждения/gi,
            /федерального казенного учреждения/gi,
            /федерального государственного автономного/gi,
            /федерального государственного бюджетного/gi,
            /федерального государственного казенного/gi,
            /федерального государственного/gi,
            /государственного бюджетного/gi,
            /государственного автономного/gi,
            /государственного казенного/gi,
            /высшего профессионального образования/gi,
            /высшего образования/gi,
            /образовательного учреждения/gi,
            /научного учреждения/gi,
            /бюджетного учреждения/gi,
            /автономного учреждения/gi,
            /казенного учреждения/gi,
            /обособленного подразделения/gi,
            /структурного подразделения/gi,
            /федерального исследовательского центра/gi,
            /исследовательского центра/gi,
            /научного центра/gi,
            /Сибирского отделения Российской академии наук/gi,
            /Дальневосточного отделения Российской академии наук/gi,
            /Уральского отделения Российской академии наук/gi,
            /Российской академии наук/gi,
            /Российской академии медицинских наук/gi,
            /Российской академии сельскохозяйственных наук/gi
          ];

          var CATEGORY_PREFIXES_CLIENT = [
            'Государственный природный биосферный заповедник',
            'Государственный природный заповедник',
            'Государственный природный заказник',
            'Государственный ландшафтный заказник',
            'Национальный природный парк',
            'Национальный парк',
            'Природный парк',
            'Памятник природы',
            'Охраняемый природный ландшафт',
            'Учебный Ботанический сад',
            'Учебный ботанический сад',
            'Главный ботанический сад',
            'Главного ботанического сада',
            'Ботанический сад-институт',
            'Дендрологический парк и ботанический сад',
            'Дендрологический парк',
            'Дендрологический сад',
            'Ботанический сад',
            'Дендрарий',
            'Чебоксарский филиал'
          ];

          function deduceOoptCategoryClient(rawTitle, category) {
            if (category && category.trim()) return category.trim();
            var t = (rawTitle || '').toLowerCase();
            if (t.indexOf('ботанический сад') !== -1 || t.indexOf('дендрологический') !== -1) return 'дендрологический парк и ботанический сад';
            if (t.indexOf('национальный парк') !== -1) return 'национальный парк';
            if (t.indexOf('биосферный заповедник') !== -1) return 'государственный природный биосферный заповедник';
            if (t.indexOf('заповедник') !== -1) return 'государственный природный заповедник';
            if (t.indexOf('заказник') !== -1) return 'государственный природный заказник';
            if (t.indexOf('памятник природы') !== -1) return 'памятник природы';
            if (t.indexOf('природный парк') !== -1) return 'природный парк';
            return 'ООПТ';
          }

          var RAW_GEOGRAPHIC_TERMS_CLIENT = [
            // 1. Specific multi-word landscape combinations
            ['лесная балка', 'Wooded Ravine'],
            ['степная балка', 'Steppe Ravine'],
            ['каменная балка', 'Rocky Ravine'],
            ['черная балка|чёрная балка', 'Black Ravine'],
            ['крутая балка', 'Steep Ravine'],
            ['глубокая балка', 'Deep Ravine'],
            ['сухая балка', 'Dry Ravine'],
            ['широкая балка', 'Broad Ravine'],
            ['долгая балка', 'Long Ravine'],
            ['сосновый бор', 'Pine Forest'],
            ['красный бор', 'Krasny Bor'],
            ['зеленый остров|зелёный остров', 'Green Island'],
            ['белое озеро', 'White Lake'],
            ['черное озеро|чёрное озеро', 'Black Lake'],
            ['святой источник', 'Holy Spring'],
            ['русский лес', 'Russian Forest'],
            ['три брата', 'Three Brothers'],

            // 2. Prepositional phrases with settlements & locations
            ['у села|у с\\.', 'near the Village of'],
            ['у деревни|у д\\.', 'near the Village of'],
            ['у поселка|у посёлка|у пос\\.|у п\\.', 'near the Settlement of'],
            ['у города|у г\\.', 'near'],
            ['в окрестностях', 'in the Vicinity of'],
            ['в районе', 'in the Area of'],
            ['в пойме', 'in the Floodplain of'],
            ['в устье', 'at the Mouth of'],
            ['в истоке', 'at the Headwaters of'],
            ['в бухте', 'in Bay'],
            ['в губе', 'in Bay'],
            ['на реке|на р\\.', 'on the River'],
            ['на озере|на оз\\.', 'on Lake'],
            ['на острове|на о-ве|на о\\.', 'on Island'],
            ['на косе', 'on Spit'],
            ['на мысе', 'at Cape'],

            // 3. Known cities / urban forests / geographic adjectives
            ['химкинск(ом|ий|ого|ому|ая|ое|их)', 'Khimki'],
            ['битцевск(ом|ий|ого|ому|ая|ое|их)', 'Bitsevsky'],
            ['измайловск(ом|ий|ого|ому|ая|ое|их)', 'Izmaylovsky'],
            ['сокольническ(ом|ий|ого|ому|ая|ое|их)', 'Sokolniki'],
            ['авачинск(ой|ая|ую|ом|ий)', 'Avacha'],
            ['семеновск(ой|ая|ую|ом|ий|ое)', 'Semenovskaya'],
            ['ловозерск(ом|ий|ого|ому|ая|ое)', 'Lovozero'],
            ['никельск(ом|ий|ого|ому|ая|ое)', 'Nikel'],

            // 4. Prepositions (strictly Cyrillic-safe)
            ['вокруг', 'around'],
            ['между', 'between'],
            ['вблизи|возле|около|близ', 'near'],
            ['у', 'near'],
            ['в|во', 'in'],
            ['на', 'on'],
            ['под', 'near'],
            ['при', 'at'],
            ['с|со', 'with'],

            // 5. Parks and recreation
            ['лесопарк(а|е|ом|у)?', 'Forest Park'],
            ['парк(а|е|ом|у)?', 'Park'],
            ['сад(а|е|ом|у|ы)?', 'Garden'],
            ['дендрари(й|я|е|ем)', 'Arboretum'],
            ['ботаническ(ий|ая|ое|ого|ом)', 'Botanical'],

            // 6. Ravines, depressions, water bodies
            ['балк(а|и|е|у|ой)', 'Ravine'],
            ['овраг(а|е|ом|у|и)?', 'Ravine'],
            ['ложбин(а|ы|е|у)', 'Hollow'],
            ['пойм(а|ы|е|у)', 'Floodplain'],
            ['стариц(а|ы|е|у)', 'Oxbow Lake'],
            ['исток(а|е|ом|у)?', 'Headwaters'],
            ['усть(е|я|ем)', 'Mouth'],
            ['водопад(а|е|ом|у|ы)?', 'Waterfall'],
            ['родник(а|е|ом|у|и|ов)?', 'Spring'],
            ['источник(а|е|ом|у|и|ов)?', 'Spring'],
            ['ключ(а|е|ом|у|и|ей)?', 'Spring'],
            ['гейзер(а|е|ом|у|ы)?', 'Geyser'],
            ['водохранилищ(е|а|ем)', 'Reservoir'],
            ['пруд(а|е|ом|у|ы)?', 'Pond'],
            ['озер(о|а|е|ом|ёра)', 'Lake'],
            ['речк(а|и|е|у|ой)', 'Stream'],
            ['рек(а|и|е|у|ой)', 'River'],
            ['руче(й|я|е|ем|и)', 'Brook'],
            ['болот(о|а|е|ом)', 'Bog'],
            ['торфяник(а|е|ом|у)?', 'Peat Bog'],
            ['мох|мхи', 'Moss'],
            ['бухт(а|ы|е|у|ой)', 'Bay'],
            ['губ(а|ы|е|у|ой)', 'Bay'],
            ['залив(а|е|ом|у)?', 'Bay'],
            ['пролив(а|е|ом|у)?', 'Strait'],
            ['лиман(а|е|ом|у)?', 'Liman'],
            ['кос(а|ы|е|у|ой)', 'Spit'],
            ['мыс(а|е|ом|у)?', 'Cape'],
            ['остров(а|е|ом|у)?', 'Island'],
            ['полуостров(а|е|ом|у)?', 'Peninsula'],
            ['берег(а|у|е|ом)?', 'Shore'],
            ['побережь(е|я|ем)', 'Coast'],

            // 7. Mountains, rocks, geological
            ['гор(а|ы|е|у|ой)', 'Mountain'],
            ['хребет|хребта', 'Ridge'],
            ['гряд(а|ы|е|у)', 'Ridge'],
            ['увал(а|е|ом|у|ы)?', 'Ridge'],
            ['сопк(а|и|е|у)', 'Sopka'],
            ['скал(а|ы|е|у|ой)', 'Rock'],
            ['камень|камн(и|я|ем)', 'Stone'],
            ['пещер(а|ы|е|у)', 'Cave'],
            ['грот(а|е|ом|у|ы)?', 'Grotto'],
            ['утёс|утес(а|е|ом|у|ы)?', 'Cliff'],
            ['обнажени(е|я|ем)', 'Outcrop'],
            ['разрез(а|е|ом|у)?', 'Exposure'],
            ['каньон(а|е|ом|у)?', 'Canyon'],
            ['ущель(е|я|ем)', 'Gorge'],
            ['теснин(а|ы|е|у)', 'Gorge'],
            ['перевал(а|е|ом|у)?', 'Pass'],
            ['холм(а|е|ом|у|ы)?', 'Hill'],
            ['курган(а|е|ом|у|ы)?', 'Kurgan'],
            ['провал(а|е|ом|у)?', 'Sinkhole'],
            ['воронк(а|и|е|у)', 'Sinkhole'],

            // 8. Forest & Vegetation
            ['дубрав(а|ы|е|у)', 'Oak Grove'],
            ['дуб(а|е|ом|у|ы|ов)?', 'Oak'],
            ['сосн(а|ы|е|у|ой)', 'Pine'],
            ['берёз(а|ы|е|у)|берез(а|ы|е|у)', 'Birch'],
            ['лиственниц(а|ы|е|у)', 'Larch'],
            ['кедр(а|е|ом|у|ы|ов)?', 'Cedar'],
            ['кедровник(а|е|ом|у)?', 'Cedar Forest'],
            ['ель|ели|елью', 'Spruce'],
            ['ельник(а|е|ом|у)?', 'Spruce Forest'],
            ['пихт(а|ы|е|у)', 'Fir'],
            ['пихтарник(а|е|ом|у)?', 'Fir Forest'],
            ['лип(а|ы|е|у)', 'Linden'],
            ['липняк(а|е|ом|у)?', 'Linden Grove'],
            ['ольх(а|ы|е|у)', 'Alder'],
            ['ив(а|ы|е|у)', 'Willow'],
            ['можжевельник(а|е|ом|у)?', 'Juniper'],
            ['тисс?|тиссов(ый|ая|ое|ые|ом)', 'Yew'],
            ['рощ(а|и|е|у|ей)', 'Grove'],
            ['бор(а|е|ом|у)?', 'Pine Forest'],
            ['лес(а|е|ом|у)?', 'Forest'],
            ['массив(а|е|ом|у)?', 'Massif'],
            ['насаждени(я|й|ям)', 'Forest Stand'],
            ['посадк(и|ок|ам)', 'Plantations'],
            ['культур(ы|ах)', 'Plantations'],
            ['дач(а|и|е|у)', 'Forestry Estate'],
            ['лесничеств(о|а|е|ом)', 'Forestry'],
            ['лесхоз(а|е|ом)?', 'Forest Enterprise'],
            ['луг(а|е|ом|у|ов)?', 'Meadow'],
            ['степ(ь|и|ью)', 'Steppe'],
            ['дюн(а|ы|е|у)', 'Dune'],
            ['песк(и|ов|ам)', 'Sands'],
            ['урочищ(е|а|ем)', 'Tract'],
            ['участок|участка', 'Site'],

            // 9. Common adjectives
            ['лесной|лесная|лесное|лесные|лесном', 'Forest'],
            ['горный|горная|горное|горные|горном', 'Mountain'],
            ['степной|степная|степное|степные|степном', 'Steppe'],
            ['приозерн(ый|ая|ое|ые|ом)', 'Lakeside'],
            ['приморск(ий|ая|ое|ие|ом)', 'Seaside'],
            ['приречн(ый|ая|ое|ые|ом)', 'Riverside'],
            ['заозерн(ый|ая|ое|ые|ом)', 'Zaozerny'],
            ['северн(ый|ая|ое|ые|ом)', 'Northern'],
            ['южн(ый|ая|ое|ые|ом)', 'Southern'],
            ['восточн(ый|ая|ое|ые|ом)', 'Eastern'],
            ['западн(ый|ая|ое|ые|ом)', 'Western'],
            ['центральн(ый|ая|ое|ые|ом)', 'Central'],
            ['верхн(ий|яя|ее|ие|ем)', 'Upper'],
            ['нижн(ий|яя|ее|ие|ем)', 'Lower'],
            ['средн(ий|яя|ее|ие|ем)', 'Middle'],
            ['больш(ой|ая|ое|ие|ом)', 'Great'],
            ['мал(ый|ая|ое|ые|ом)', 'Small'],
            ['бел(ый|ая|ое|ые|ом)', 'White'],
            ['черн(ый|ая|ое|ые|ом)|чёрн(ый|ая|ое|ые|ом)', 'Black'],
            ['красн(ый|ая|ое|ые|ом)', 'Red'],
            ['зелен(ый|ая|ое|ые|ом)|зелён(ый|ая|ое|ые|ом)', 'Green'],
            ['син(ий|яя|ее|ие|ем)', 'Blue'],
            ['голуб(ой|ая|ое|ые|ом)', 'Blue'],
            ['золот(ой|ая|ое|ые|ом)', 'Golden'],
            ['серебрян(ый|ая|ое|ые|ом)', 'Silver'],
            ['свят(ой|ая|ое|ые|ом)', 'Holy'],
            ['каменн(ый|ая|ое|ые|ом)', 'Stone'],
            ['песчан(ый|ая|ое|ые|ом)', 'Sandy'],
            ['торфян(ой|ая|ое|ые|ом)', 'Peat'],
            ['глубок(ий|ая|ое|ие|ом)', 'Deep'],
            ['крут(ой|ая|ое|ые|ом)', 'Steep'],
            ['широк(ий|ая|ое|ие|ом)', 'Broad'],
            ['долг(ий|ая|ое|ие|ом)', 'Long'],
            ['сух(ой|ая|ое|ые|ом)', 'Dry'],
            ['чист(ый|ая|ое|ые|ом)', 'Pure'],
            ['ясн(ый|ая|ое|ые|ом)', 'Bright'],
            ['тепл(ый|ая|ое|ые|ом)|тёпл(ый|ая|ое|ые|ом)', 'Warm'],
            ['холодн(ый|ая|ое|ые|ом)', 'Cold'],
            ['минеральн(ый|ая|ое|ые|ом|ых)', 'Mineral'],
            ['целебн(ый|ая|ое|ые|ом)', 'Healing'],
            ['древн(ий|яя|ее|ие|ем)', 'Ancient'],
            ['реликтов(ый|ая|ое|ые|ом)', 'Relict'],

            // 10. Academic & Institutional
            ['государственн(ый|ая|ое|ые|ого|ому|ом)', 'State'],
            ['федеральн(ый|ая|ое|ые|ого|ому|ом)', 'Federal'],
            ['университет(а|у|ом|е)?', 'University'],
            ['институт(а|у|ом|е)?', 'Institute'],
            ['академи(я|и|ю|ей)', 'Academy'],
            ['аграрн(ый|ая|ое|ые|ого|ому|ом)', 'Agrarian'],
            ['политехническ(ий|ая|ое|ие|ого|ому|ом)', 'Polytechnic'],
            ['медицинск(ий|ая|ое|ие|ого|ому|ом)', 'Medical'],
            ['педагогическ(ий|ая|ое|ие|ого|ому|ом)', 'Pedagogical'],
            ['технологическ(ий|ая|ое|ие|ого|ому|ом)', 'Technological'],
            ['приволжск(ий|ая|ое|ие|ого|ому|ом)', 'Volga Region']
          ];

          var GEOGRAPHIC_TERMS_CLIENT = RAW_GEOGRAPHIC_TERMS_CLIENT.map(function(item) {
            return [new RegExp('(?<![а-яёА-ЯЁa-zA-Z0-9])(' + item[0] + ')(?![а-яёА-ЯЁa-zA-Z0-9])', 'gi'), item[1]];
          });

          function getEnglishSuffixClient(category) {
            var c = (category || '').toLowerCase();
            if (c.indexOf('морск') !== -1) return 'State Marine Reserve';
            if (c.indexOf('биосферн') !== -1) return 'State Biosphere Nature Reserve';
            if (c.indexOf('памятник природы') !== -1 || c.indexOf('памятные природные места') !== -1) return 'Natural Monument';
            if (c.indexOf('ботанический сад') !== -1 || c.indexOf('дендрологический') !== -1 || c.indexOf('дендрарий') !== -1) return 'Botanical Gardens';
            if (c.indexOf('национальный парк') !== -1) {
              if (c.indexOf('резерват') !== -1 || c.indexOf('reserve') !== -1) return 'National Park Reserve';
              if (c.indexOf('абориген') !== -1 || c.indexOf('aboriginal') !== -1) return 'National Park Aboriginal';
              return 'National Park';
            }
            if (c.indexOf('природно-исторический') !== -1 || c.indexOf('исторический парк') !== -1 || c.indexOf('историко-природный') !== -1) return 'National Historical Park';
            if (c.indexOf('ландшафтный заказник') !== -1 || c.indexOf('особо охраняемый природный ландшафт') !== -1) return 'Landscape Reserve';
            if (c.indexOf('заповедник') !== -1) return 'State Nature Preserve';
            if (c.indexOf('заказник') !== -1) return 'State Nature Reserve';
            if (c.indexOf('охраняемый природный ландшафт') !== -1) return 'Protected Landscape Area';
            if (c.indexOf('охраняемый ландшафт') !== -1) return 'Protected Landscape';
            if (c.indexOf('ресурсный резерват') !== -1) return 'Reserve';
            if (c.indexOf('природный резерват') !== -1) return 'Nature Conservation Reserve';
            if (c.indexOf('резерват') !== -1) return 'Reserve';
            if (c.indexOf('садово-паркового искусства') !== -1 || c.indexOf('ландшафтный парк') !== -1) return 'Landscape Park';
            if (c.indexOf('лесной парк') !== -1) return c.indexOf('государственный') !== -1 ? 'State Forest Park' : 'Park';
            if (c.indexOf('природный парк') !== -1 || c.indexOf('парковая зона') !== -1) return 'Nature Park';
            if (c.indexOf('рекреационная зона') !== -1 || c.indexOf('природная рекреационная') !== -1 || c.indexOf('ландшафтно-рекреационный') !== -1 || c.indexOf('территория рекреационного') !== -1) return 'Nature Recreational Area';
            if (c.indexOf('туристско-рекреацион') !== -1) return 'Recreation Site';
            if (c.indexOf('уникальное озеро') !== -1 || c.indexOf('озеро') !== -1) return 'National Lakeshore';
            if (c.indexOf('природный комплекс') !== -1) return 'Nature and Landscape Complex';
            if (c.indexOf('особо ценная территория') !== -1) return 'Area of Outstanding Natural Beauty';
            if (c.indexOf('экологический коридор') !== -1) return 'Ecological Site';
            if (c.indexOf('охраняемый природный объект') !== -1) return 'Protected Area';
            if (c.indexOf('зона покоя') !== -1) return 'Nature Reserve';
            if (c.indexOf('ландшафт') !== -1) return 'Protected Landscape';
            return 'State Nature Reserve';
          }

          function getDxEntityClient(regionName, title) {
            var r = (regionName || '').toLowerCase();
            var t = (title || '').toLowerCase();

            if (r.indexOf('калининград') !== -1 || t.indexOf('калининград') !== -1) return 'Kaliningrad (RU)';
            if (t.indexOf('франца-иосифа') !== -1 || t.indexOf('франца иосифа') !== -1 || t.indexOf('земля франца') !== -1 || r.indexOf('франца-иосифа') !== -1) {
              return 'Franz Josef Land (RU)';
            }

            var asiaticPatterns = [
              /(?<![а-яёa-z0-9])свердловск/i,
              /(?<![а-яёa-z0-9])челябинск/i,
              /(?<![а-яёa-z0-9])курганск/i,
              /(?<![а-яёa-z0-9])тюмен/i,
              /(?<![а-яёa-z0-9])ханты-мансий/i,
              /(?<![а-яёa-z0-9])югр/i,
              /(?<![а-яёa-z0-9])ямало-ненец/i,
              /(?<![а-яёa-z0-9])томск/i,
              /(?<![а-яёa-z0-9])омск/i,
              /(?<![а-яёa-z0-9])новосибирск/i,
              /(?<![а-яёa-z0-9])кемеров/i,
              /(?<![а-яёa-z0-9])алтай/i,
              /(?<![а-яёa-z0-9])красноярск/i,
              /(?<![а-яёa-z0-9])хакас/i,
              /(?<![а-яёa-z0-9])тыв/i,
              /(?<![а-яёa-z0-9])тув/i,
              /(?<![а-яёa-z0-9])иркутск/i,
              /(?<![а-яёa-z0-9])бурят/i,
              /(?<![а-яёa-z0-9])забайкал/i,
              /(?<![а-яёa-z0-9])якут/i,
              /(?<![а-яёa-z0-9])саха(?![а-яёa-z0-9]*лин)/i,
              /(?<![а-яёa-z0-9])амурск/i,
              /(?<![а-яёa-z0-9])хабаровск/i,
              /(?<![а-яёa-z0-9])приморск/i,
              /(?<![а-яёa-z0-9])еврейск/i,
              /(?<![а-яёa-z0-9])магадан/i,
              /(?<![а-яёa-z0-9])чукот/i,
              /(?<![а-яёa-z0-9])камчат/i,
              /(?<![а-яёa-z0-9])сахалин/i
            ];

            for (var i = 0; i < asiaticPatterns.length; i++) {
              if (asiaticPatterns[i].test(r)) return 'Asiatic Russia (RU)';
            }
            return 'European Russia (RU)';
          }

          var REGION_TO_POTA_LOCATION_CLIENT = {
            'ставрополь': 'RU-ST',
            'москва': 'RU-MC',
            'московская': 'RU-MS',
            'санкт-петербург': 'RU-SP',
            'ленинградская': 'RU-LN',
            'краснодарский': 'RU-KD',
            'калининградская': 'RU-KN',
            'ростовская': 'RU-RO',
            'волгоградская': 'RU-VG',
            'воронежская': 'RU-VR',
            'самарская': 'RU-SA',
            'саратовская': 'RU-SR',
            'нижегородская': 'RU-NZ',
            'татарстан': 'RU-TT',
            'башкортостан': 'RU-BK',
            'крым': 'RU-CR',
            'севастополь': 'RU-SE',
            'дагестан': 'RU-DA',
            'чечен': 'RU-CN',
            'ингушет': 'RU-IN',
            'кабардино-балкар': 'RU-KB',
            'карачаево-черкес': 'RU-KC',
            'северная осетия': 'RU-NO',
            'адыгея': 'RU-AD',
            'калмыкия': 'RU-KL',
            'астраханская': 'RU-AS',
            'архангельская': 'RU-AR',
            'мурманская': 'RU-MM',
            'вологодская': 'RU-VO',
            'карелия': 'RU-KI',
            'коми': 'RU-KO',
            'новгородская': 'RU-NG',
            'псковская': 'RU-PS',
            'тверская': 'RU-TV',
            'ярославская': 'RU-YS',
            'костромская': 'RU-KT',
            'ивановская': 'RU-IV',
            'владимирская': 'RU-VL',
            'рязанская': 'RU-RZ',
            'тульская': 'RU-TL',
            'калужская': 'RU-KG',
            'смоленская': 'RU-SM',
            'брянская': 'RU-BR',
            'орловская': 'RU-OL',
            'липецкая': 'RU-LP',
            'тамбовская': 'RU-TB',
            'белгородская': 'RU-BL',
            'курская': 'RU-KS',
            'пензенская': 'RU-PZ',
            'ульяновская': 'RU-UL',
            'кировская': 'RU-KV',
            'чуваш': 'RU-CV',
            'марий эл': 'RU-ME',
            'мордовия': 'RU-MR',
            'удмурт': 'RU-UD',
            'пермский': 'RU-PE',
            'оренбургская': 'RU-OB',
            'свердловская': 'RU-SV',
            'челябинская': 'RU-CL',
            'курганская': 'RU-KU',
            'тюменская': 'RU-TY',
            'ханты-мансийский': 'RU-KM',
            'ямало-ненецкий': 'RU-YN',
            'ненецкий': 'RU-NN',
            'франца-иосифа': 'RU-FJ',
            'новосибирская': 'RU-NS',
            'омская': 'RU-OM',
            'томская': 'RU-TO',
            'кемеровская': 'RU-KE',
            'алтайский': 'RU-AL',
            'алтай': 'RU-GA',
            'красноярский': 'RU-KX',
            'хакасия': 'RU-KK',
            'тыва': 'RU-TU',
            'иркутская': 'RU-IK',
            'бурятия': 'RU-BU',
            'забайкальский': 'RU-ZB',
            'саха': 'RU-SL',
            'якутия': 'RU-SL',
            'еврейская': 'RU-YV',
            'амурская': 'RU-AM',
            'хабаровский': 'RU-KH',
            'приморский': 'RU-PR',
            'магаданская': 'RU-MG',
            'чукотский': 'RU-CK',
            'камчатский': 'RU-KQ',
            'сахалинская': 'RU-SK'
          };

          function getPotaLocationCodeClient(regionStr) {
            if (!regionStr) return '';
            var parts = regionStr.split(/[,;\/]+/).map(function(s) { return s.trim().toLowerCase(); });
            var found = [];
            for (var i = 0; i < parts.length; i++) {
              for (var kw in REGION_TO_POTA_LOCATION_CLIENT) {
                if (parts[i].indexOf(kw) !== -1) {
                  var code = REGION_TO_POTA_LOCATION_CLIENT[kw];
                  if (found.indexOf(code) === -1) found.push(code);
                  break;
                }
              }
            }
            return found.join(', ');
          }

          function cleanOoptNameClient(rawTitle, category) {
            var name = (rawTitle || '').trim();

            for (var i = 0; i < BUREAUCRATIC_PATTERNS.length; i++) {
              name = name.replace(BUREAUCRATIC_PATTERNS[i], ' ');
            }
            name = name.replace(/\\s+/g, ' ').trim();

            for (var j = 0; j < CATEGORY_PREFIXES_CLIENT.length; j++) {
              var p = CATEGORY_PREFIXES_CLIENT[j];
              if (name.toLowerCase().indexOf(p.toLowerCase()) === 0) {
                var rem = name.substring(p.length).trim().replace(/^[-–—,: ]+/, '').trim();
                if (rem.length > 2) {
                  name = rem;
                  break;
                }
              }
            }

            var quoteMatch = name.match(/["«]([^"»]+)["»]/);
            if (quoteMatch && quoteMatch[1].length > 3) {
              var beforeQuote = name.substring(0, quoteMatch.index).trim().replace(/^[-–—,: ]+/, '').trim();
              if (!beforeQuote || beforeQuote.length < 5 || /^(при|на|базе|отделения|института|центра)\\b/i.test(beforeQuote)) {
                name = quoteMatch[1].trim();
              } else if (beforeQuote.indexOf('им.') !== -1 || beforeQuote.toLowerCase().indexOf('имени') !== -1) {
                name = beforeQuote + ' (' + quoteMatch[1].trim() + ')';
              } else {
                name = quoteMatch[1].trim();
              }
            }

            name = name.replace(/["«]/g, '').replace(/["»]/g, '')
              .replace(/Московского государственного университета/gi, 'МГУ')
              .replace(/Московский государственный университет/gi, 'МГУ')
              .replace(/имени М\\.?В\\.?\\s*Ломоносова/gi, 'им. М.В. Ломоносова')
              .replace(/имени\\s+/gi, 'им. ')
              .replace(/\\s+/g, ' ')
              .trim();

            for (var k = 0; k < CATEGORY_PREFIXES_CLIENT.length; k++) {
              var p2 = CATEGORY_PREFIXES_CLIENT[k];
              if (name.toLowerCase().indexOf(p2.toLowerCase()) === 0) {
                var rem2 = name.substring(p2.length).trim().replace(/^[-–—,: ]+/, '').trim();
                if (rem2.length > 2) {
                  name = rem2;
                  break;
                }
              }
            }

            return name.replace(/^[-–—,: ]+/, '').trim();
          }

          function translateOoptNameToEnglishClient(cleanName, category) {
            var s = cleanName;
            s = s.replace(/Биологического факультета МГУ им\\.? М\\.?В\\.?\\s*Ломоносова/gi, 'MSU Faculty of Biology')
                 .replace(/МГУ им\\.? М\\.?В\\.?\\s*Ломоносова/gi, 'MSU')
                 .replace(/МГУ/g, 'MSU')
                 .replace(/БИН РАН/g, 'BIN RAS')
                 .replace(/РАН/g, 'RAS')
                 .replace(/СО РАН/g, 'SB RAS')
                 .replace(/Петра Великого/gi, 'Peter the Great');

            for (var k = 0; k < GEOGRAPHIC_TERMS_CLIENT.length; k++) {
              s = s.replace(GEOGRAPHIC_TERMS_CLIENT[k][0], GEOGRAPHIC_TERMS_CLIENT[k][1]);
            }

            var en = transliterateClient(s);
            en = en.replace(/skogo\\b/gi, 'sky')
                   .replace(/skoy\\b/gi, 'skaya')
                   .replace(/skom\\b/gi, 'sky')
                   .replace(/skogo gosudarstvennogo\\b/gi, 'State')
                   .replace(/gosudarstvennogo\\b/gi, 'State')
                   .replace(/pedagogicheskogo\\b/gi, 'Pedagogical')
                   .replace(/universiteta\\b/gi, 'University')
                   .replace(/instituta\\b/gi, 'Institute');

            var words = en.split(/\\s+/).map(function(w, idx) {
              if (!w) return '';
              var lower = w.toLowerCase();
              if (idx > 0 && ['in', 'on', 'near', 'at', 'with', 'between', 'around', 'of', 'the', 'and', 'a', 'an'].indexOf(lower) !== -1) {
                return lower;
              }
              return w.charAt(0).toUpperCase() + w.slice(1);
            });

            return words.join(' ').replace(/\\s+/g, ' ').trim();
          }

          function transliterateOnlyClient(cleanName) {
            if (!cleanName) return '';
            var s = cleanName.replace(/["«]/g, '').replace(/["»]/g, '').trim();

            s = s.replace(/Биологического факультета МГУ им\\.? М\\.?В\\.?\\s*Ломоносова/gi, 'MSU Faculty of Biology')
                 .replace(/МГУ им\\.? М\\.?В\\.?\\s*Ломоносова/gi, 'MSU')
                 .replace(/МГУ/g, 'MSU')
                 .replace(/БИН РАН/g, 'BIN RAS')
                 .replace(/РАН/g, 'RAS')
                 .replace(/СО РАН/g, 'SB RAS');

            var en = transliterateClient(s);

            en = en.split(' ').map(function(w) {
              return w ? (w.charAt(0).toUpperCase() + w.slice(1)) : '';
            }).join(' ').trim();

            return en.replace(/\\s+/g, ' ').trim();
          }

          function formatDualParkNameClient(cleanName, category) {
            if (!cleanName) return '';
            var translated = translateOoptNameToEnglishClient(cleanName, category);
            var transliterated = transliterateOnlyClient(cleanName);

            if (translated && transliterated && translated.toLowerCase() !== transliterated.toLowerCase()) {
              if (translated.indexOf('(') === -1) {
                var words = translated.trim().split(/\s+/).filter(Boolean);
                // Per Manu R2BBX: if translated name is long (> 3 words or > 30 characters), use translation only
                if (words.length > 3 || translated.length > 30) {
                  return translated;
                }
                return translated + ' (' + transliterated + ')';
              }
            }
            return translated || transliterated || '';
          }

          function formatClarificationClient(profile, status, area, nestedOopt, rawTitle, cleanName, nid) {
            var parts = [];
            if (status && status !== 'действующий') parts.push('Статус: ' + status);

            var nestedList = [];
            if (Array.isArray(nestedOopt)) {
              nestedList = nestedOopt;
            } else if (typeof nestedOopt === 'string' && nestedOopt.trim()) {
              try {
                nestedList = JSON.parse(nestedOopt);
              } catch (_) {
                nestedList = nestedOopt.split(/[,;\\n]+/).map(function(s) { return { name: s.trim() }; }).filter(function(x) { return x.name; });
              }
            }

            var selfTitle = (rawTitle || '').toLowerCase().trim();
            var selfClean = (cleanName || '').toLowerCase().trim();
            var selfNid = nid ? Number(nid) : null;

            var formatted = (nestedList || []).map(function(n) {
              var name = typeof n === 'string' ? n : (n.name || n.title || '');
              var cleanN = name.toLowerCase().trim();
              var nNid = (typeof n === 'object' && n.nid) ? Number(n.nid) : null;
              if (selfNid && nNid && selfNid === nNid) return '';
              if (cleanN && (cleanN === selfTitle || cleanN === selfClean)) return '';
              var ref = (typeof n === 'object' && n.pota_ref) ? (' (' + n.pota_ref + ')') : '';
              return name ? (name + ref) : '';
            }).filter(Boolean);

            if (formatted.length > 0) {
              parts.push('В границах ООПТ: ' + formatted.join(', '));
            } else {
              if (profile) parts.push('Профиль: ' + profile);
              if (area) parts.push('Площадь: ' + Number(area).toLocaleString('ru-RU') + ' га');
            }

            var text = parts.join('. ');
            if (text.length > 255) {
              text = text.substring(0, 252).trim() + '...';
            }
            return text;
          }

          function parseOoptForSubmitter(rawTitle, category, sigDisplay, ate, lat, lon, nid, area, status, profile, nestedOopt) {
            var detectedCategory = deduceOoptCategoryClient(rawTitle, category);
            var cleanName = cleanOoptNameClient(rawTitle, detectedCategory);
            var nameEn = formatDualParkNameClient(cleanName, detectedCategory);
            var statusEn = getEnglishSuffixClient(detectedCategory);
            var catDisplay = detectedCategory.charAt(0).toUpperCase() + detectedCategory.slice(1);

            var fullStatus = sigDisplay ? (catDisplay + ' (' + sigDisplay + ' значение)') : catDisplay;
            var region = ate || '';
            if (region.indexOf('(') !== -1) region = region.split('(')[0].trim();

            var dxEntity = getDxEntityClient(region, rawTitle);
            var locationCode = getPotaLocationCodeClient(region);

            var siteUrl = nid ? ('https://ooptaari.nextgis.ru/node/' + nid) : 'https://карта.оцзк.рф/';

            var latVal = (lat !== null && lat !== undefined && lat !== '' && !isNaN(Number(lat))) ? Number(lat).toFixed(4) : '';
            var lonVal = (lon !== null && lon !== undefined && lon !== '' && !isNaN(Number(lon))) ? Number(lon).toFixed(4) : '';

            var clarifyText = formatClarificationClient(profile, status, area, nestedOopt, rawTitle, cleanName, nid);

            return {
              name: cleanName,
              nameEn: nameEn,
              statusEn: statusEn,
              status: fullStatus,
              dxEntity: dxEntity,
              locationCode: locationCode,
              region: region,
              lat: latVal,
              lon: lonVal,
              site: siteUrl,
              clarification: clarifyText
            };
          }

          function updateSubmitterPreview() {
            var name = document.getElementById('subm-name').value;
            var nameEn = document.getElementById('subm-name-en').value;
            var statusEn = document.getElementById('subm-status-en').value;
            var status = document.getElementById('subm-status').value;
            var dxEntity = document.getElementById('subm-dx-entity')?.value || '';
            var locationCode = document.getElementById('subm-location-code')?.value || '';
            var region = document.getElementById('subm-region').value;
            var lat = document.getElementById('subm-lat').value;
            var lon = document.getElementById('subm-lon').value;
            var site = document.getElementById('subm-site').value;
            var clarify = document.getElementById('subm-clarify').value;

            // Update character counter
            var counterEl = document.getElementById('subm-clarify-counter');
            if (counterEl) {
              var len = clarify.length;
              counterEl.textContent = len + ' / 255';
              if (len > 255) {
                counterEl.className = 'badge bg-danger font-monospace';
              } else if (len > 220) {
                counterEl.className = 'badge bg-warning text-dark font-monospace';
              } else {
                counterEl.className = 'badge bg-light text-secondary border font-monospace';
              }
            }

            var lines = [
              'Название парка/ООПТ: ' + name,
              'Название для POTA (EN): ' + nameEn,
              'Статус ООПТ для POTA (EN): ' + statusEn,
              'Статус (парк/ООПТ и т.п.): ' + status,
              'DX Entity: ' + dxEntity,
              'Локация POTA: ' + locationCode,
              'Регион России: ' + region,
              'Координата первая с яндекс-карт: ' + lat,
              'Координата вторая: ' + lon,
              'Сайт объекта, ссылка: ' + site,
              'Уточнение (не обязательно): ' + clarify
            ];
            var text = lines.join(String.fromCharCode(10));
            document.getElementById('subm-preview').textContent = text;

            var yandexLink = document.getElementById('subm-yandex-link');
            var yandexText = document.getElementById('subm-yandex-text');
            if (lat && lon && !isNaN(Number(lat)) && !isNaN(Number(lon))) {
              yandexLink.href = 'https://yandex.ru/maps/?pt=' + lon.trim() + ',' + lat.trim() + '&z=14&l=map';
              if (yandexText) yandexText.textContent = 'Проверить в Яндекс.Картах';
            } else {
              var q = (name + ' ' + region).trim();
              yandexLink.href = 'https://yandex.ru/maps/?text=' + encodeURIComponent(q);
              if (yandexText) yandexText.textContent = '🔍 Найти в Яндекс.Картах';
            }
            return text;
          }

          // Bind preview updates on input changes
          ['subm-name', 'subm-name-en', 'subm-status-en', 'subm-status', 'subm-dx-entity', 'subm-location-code', 'subm-lat', 'subm-lon', 'subm-region', 'subm-site', 'subm-clarify'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('input', updateSubmitterPreview);
            if (el && el.tagName === 'SELECT') el.addEventListener('change', updateSubmitterPreview);
          });

          // Quick POTA Type chip buttons
          document.addEventListener('click', function(e) {
            var quickBtn = e.target.closest('.quick-pota-type-btn');
            if (quickBtn) {
              var t = quickBtn.getAttribute('data-type');
              if (t) {
                var input = document.getElementById('subm-status-en');
                if (input) {
                  input.value = t;
                  updateSubmitterPreview();
                }
              }
            }
          });

          // Quick switch buttons for site links
          document.getElementById('btn-set-link-nextgis')?.addEventListener('click', function() {
            var nid = document.getElementById('subm-nid').value;
            if (nid) {
              document.getElementById('subm-site').value = 'https://ooptaari.nextgis.ru/node/' + nid;
              updateSubmitterPreview();
            }
          });

          document.getElementById('btn-set-link-custom')?.addEventListener('click', function() {
            var input = document.getElementById('subm-site');
            if (input) {
              input.value = 'https://';
              input.focus();
              input.setSelectionRange(input.value.length, input.value.length);
              updateSubmitterPreview();
            }
          });

          // Open Submitter Modal
          document.addEventListener('click', async function(e) {
            var btn = e.target.closest('.open-submitter-btn');
            if (btn) {
              var title = btn.getAttribute('data-title') || '';
              var category = btn.getAttribute('data-category') || '';
              var sig = btn.getAttribute('data-sig') || '';
              var ate = btn.getAttribute('data-ate') || '';
              var lat = btn.getAttribute('data-lat') || '';
              var lon = btn.getAttribute('data-lon') || '';
              var nid = btn.getAttribute('data-nid') || '';
              var area = btn.getAttribute('data-area') || '';
              var status = btn.getAttribute('data-status') || '';
              var profile = btn.getAttribute('data-profile') || '';

              var parsed = parseOoptForSubmitter(title, category, sig, ate, lat, lon, nid, area, status, profile);

              document.getElementById('subm-nid').value = nid;
              document.getElementById('subm-name').value = parsed.name;
              document.getElementById('subm-name-en').value = parsed.nameEn;
              document.getElementById('subm-status-en').value = parsed.statusEn;
              document.getElementById('subm-status').value = parsed.status;
              if (document.getElementById('subm-dx-entity')) document.getElementById('subm-dx-entity').value = parsed.dxEntity;
              if (document.getElementById('subm-location-code')) document.getElementById('subm-location-code').value = parsed.locationCode;
              var locBadge = document.getElementById('subm-location-badge');
              if (locBadge) {
                var pReg = parsed.region || '';
                var pCnt = (window.__adminRegionPotaCounts && window.__adminRegionPotaCounts[pReg] !== undefined) ? window.__adminRegionPotaCounts[pReg] : null;
                if (pCnt !== null) {
                  locBadge.innerHTML = '<span class="badge ' + (pCnt === 0 ? 'bg-danger' : 'bg-info text-dark') + ' ms-1" style="font-size:11px;">' + (pCnt === 0 ? '0 POTA в регионе ⚠️' : (pCnt + ' POTA в регионе')) + '</span>';
                } else {
                  locBadge.innerHTML = '';
                }
              }
              document.getElementById('subm-lat').value = parsed.lat;
              document.getElementById('subm-lon').value = parsed.lon;
              document.getElementById('subm-region').value = parsed.region;
              document.getElementById('subm-site').value = parsed.site;
              document.getElementById('subm-clarify').value = parsed.clarification || '';
              var potaRef = btn.getAttribute('data-pota-ref') || '';
              var potaName = btn.getAttribute('data-pota-name') || '';
              var potaBox = document.getElementById('subm-pota-badge-container');
              if (potaBox) {
                if (potaRef) {
                  potaBox.innerHTML = '<div class="alert alert-success d-flex align-items-center justify-content-between p-2 mb-3 shadow-sm">' +
                    '<div><i class="bi bi-check-circle-fill text-success fs-5 me-2"></i><strong>Объект уже в базе POTA!</strong> Референс: <span class="badge bg-success">' + potaRef + '</span> <small class="text-muted">(' + escapeHtmlClient(potaName) + ')</small><div class="small text-success mt-1">Повторная подача заявки координатору не требуется. Можно сразу выезжать и активировать!</div></div>' +
                    '<a href="https://next.pota.app/park/' + potaRef + '" target="_blank" class="btn btn-sm btn-success text-nowrap ms-2"><i class="bi bi-box-arrow-up-right"></i> pota.app</a>' +
                    '</div>';
                } else {
                  potaBox.innerHTML = '';
                }
              }

              updateSubmitterPreview();

              var modalEl = document.getElementById('modal-pota-submitter');
              var modal = new bootstrap.Modal(modalEl);
              modal.show();

              // Always fetch live details from NextGIS (nested OOPTs, coordinates, subjects)
              if (nid) {
                var needsCoords = !parsed.lat || !parsed.lon;
                if (needsCoords) {
                  document.getElementById('subm-coords-status').innerHTML = '<span class="spinner-border spinner-border-sm text-success"></span> Запрос данных...';
                }
                try {
                  var res = await fetch('/api/tma/oopt/' + nid);
                  var details = await res.json();
                  if (details) {
                    if (details.lat && details.lon) {
                      document.getElementById('subm-lat').value = Number(details.lat).toFixed(4);
                      document.getElementById('subm-lon').value = Number(details.lon).toFixed(4);
                      if (details.rf_subjects) {
                        document.getElementById('subm-region').value = details.rf_subjects;
                        if (document.getElementById('subm-location-code')) {
                          document.getElementById('subm-location-code').value = getPotaLocationCodeClient(details.rf_subjects);
                        }
                      }
                      if (needsCoords) {
                        document.getElementById('subm-coords-status').textContent = '✅ Данные загружены';
                      }
                    } else if (needsCoords) {
                      document.getElementById('subm-coords-status').textContent = 'Координаты отсутствуют';
                    }

                    // Dynamically update clarification if details contain nested OOPTs!
                    var updatedClarify = formatClarificationClient(
                      details.profile || profile,
                      details.status || status,
                      details.area || area,
                      details.parsedNestedOopt || details.nested_oopt,
                      title,
                      parsed.name,
                      nid
                    );
                    if (updatedClarify) {
                      document.getElementById('subm-clarify').value = updatedClarify;
                    }
                    updateSubmitterPreview();
                  }
                } catch(e) {
                  if (needsCoords) {
                    document.getElementById('subm-coords-status').textContent = 'Ошибка загрузки данных';
                  }
                }
              } else {
                document.getElementById('subm-coords-status').textContent = '';
              }
            }
          });

          // Copy Submitter Template Buttons
          function copySubmitterAction() {
            var text = updateSubmitterPreview();
            navigator.clipboard.writeText(text).then(function() {
              if (Toast) {
                Toast.fire({ icon: 'success', title: '✅ Заявка для R2BBX скопирована в буфер обмена!' });
              } else {
                alert('Скопировано в буфер обмена!');
              }
            });
          }

          document.getElementById('btn-copy-submitter')?.addEventListener('click', copySubmitterAction);
          document.getElementById('btn-copy-submitter-bottom')?.addEventListener('click', copySubmitterAction);

          document.getElementById('btn-email-submitter')?.addEventListener('click', function() {
            var text = document.getElementById('subm-preview')?.textContent || '';
            var nameEn = document.getElementById('subm-name-en')?.value || document.getElementById('subm-name')?.value || '';
            var subject = encodeURIComponent('Заявка POTA: ' + nameEn);
            var body = encodeURIComponent(text);
            window.location.href = 'mailto:r2bbx.mua@gmail.com?subject=' + subject + '&body=' + body;
          });

          window.runAiTranslateAdmin = function() {
            var nameVal = document.getElementById('subm-name').value;
            var statusVal = document.getElementById('subm-status').value;
            if (!nameVal) return;
            var btn = document.getElementById('btn-ai-translate');
            if (btn) btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="width:10px;height:10px;"></span> Перевод...';
            fetch('/api/tma/oopt/translate?text=' + encodeURIComponent(nameVal) + '&category=' + encodeURIComponent(statusVal))
              .then(function(res) { return res.json(); })
              .then(function(data) {
                if (data && data.translated) {
                  document.getElementById('subm-name-en').value = data.translated;
                  updateSubmitterPreview();
                }
              })
              .catch(function(err) {
                console.warn('AI translation failed in admin:', err);
              })
              .finally(function() {
                if (btn) btn.innerHTML = '<i class="bi bi-stars"></i> AI перевод';
              });
          };

          // ==========================================
          // Leaflet Interactive Coordinate Picker
          // ==========================================
          var coordPickerMap = null;
          var coordPickerMarker = null;
          var currentPickerLat = 55.7512;
          var currentPickerLon = 37.6184;

          function updatePickerDisplay(lat, lon) {
            currentPickerLat = Number(lat);
            currentPickerLon = Number(lon);
            var displayEl = document.getElementById('picker-coords-display');
            if (displayEl) {
              displayEl.textContent = 'Широта: ' + currentPickerLat.toFixed(4) + ' | Долгота: ' + currentPickerLon.toFixed(4);
            }
            var statusEl = document.getElementById('picker-status-info');
            if (statusEl) {
              statusEl.innerHTML = '<span class="text-success"><i class="bi bi-check-circle"></i> Координаты: <code>' + currentPickerLat.toFixed(4) + ', ' + currentPickerLon.toFixed(4) + '</code></span>';
            }
          }

          document.getElementById('btn-subm-open-map')?.addEventListener('click', function() {
            var latVal = parseFloat(document.getElementById('subm-lat').value);
            var lonVal = parseFloat(document.getElementById('subm-lon').value);
            var hasCoords = !isNaN(latVal) && !isNaN(lonVal) && latVal !== 0 && lonVal !== 0;

            var initialLat = hasCoords ? latVal : 55.7512;
            var initialLon = hasCoords ? lonVal : 37.6184;
            var initialZoom = hasCoords ? 13 : 5;

            var modalEl = document.getElementById('modal-coord-picker');
            var modal = new bootstrap.Modal(modalEl);
            modal.show();

            setTimeout(function() {
              if (!coordPickerMap) {
                coordPickerMap = L.map('coord-picker-map', { attributionControl: false }).setView([initialLat, initialLon], initialZoom);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                  attribution: '',
                  maxZoom: 19
                }).addTo(coordPickerMap);

                coordPickerMarker = L.marker([initialLat, initialLon], {
                  draggable: true
                }).addTo(coordPickerMap);

                coordPickerMarker.on('dragend', function(e) {
                  var pos = e.target.getLatLng();
                  updatePickerDisplay(pos.lat, pos.lng);
                });

                coordPickerMap.on('click', function(e) {
                  var pos = e.latlng;
                  coordPickerMarker.setLatLng(pos);
                  updatePickerDisplay(pos.lat, pos.lng);
                });
              } else {
                coordPickerMap.invalidateSize();
                coordPickerMap.setView([initialLat, initialLon], initialZoom);
                coordPickerMarker.setLatLng([initialLat, initialLon]);
              }
              updatePickerDisplay(initialLat, initialLon);
            }, 300);
          });

          document.getElementById('btn-apply-coords')?.addEventListener('click', function() {
            document.getElementById('subm-lat').value = currentPickerLat.toFixed(4);
            document.getElementById('subm-lon').value = currentPickerLon.toFixed(4);
            updateSubmitterPreview();
            var modalEl = document.getElementById('modal-coord-picker');
            var modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            if (Toast) {
              Toast.fire({ icon: 'success', title: '✅ Координаты (' + currentPickerLat.toFixed(4) + ', ' + currentPickerLon.toFixed(4) + ') применены к заявке!' });
            }
          });

          // ==========================================
          // POTA Regions Statistics JS
          // ==========================================
          var allRegionsData = [];
          var isRegionsLoaded = false;

          async function loadRegionsData() {
            var tbody = document.getElementById('regions-table-body');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4"><span class="spinner-border spinner-border-sm text-primary me-2"></span> Загрузка статистики регионов...</td></tr>';
            try {
              var res = await fetch('/api/admin/regions/stats');
              var data = await res.json();
              if (data && data.summary && data.regions) {
                var s = data.summary;
                if (document.getElementById('reg-stat-total')) document.getElementById('reg-stat-total').textContent = s.totalParks;
                if (document.getElementById('reg-stat-coverage')) document.getElementById('reg-stat-coverage').textContent = (s.overallCoverageRate || 0) + '%';
                if (document.getElementById('reg-stat-mature-count')) document.getElementById('reg-stat-mature-count').textContent = (s.matureRegionsCount || 0) + ' зрелых регионов (≥70%)';
                if (document.getElementById('reg-stat-activated')) document.getElementById('reg-stat-activated').textContent = s.activatedParks;
                if (document.getElementById('reg-stat-rate')) document.getElementById('reg-stat-rate').textContent = s.activationRate + '% от всех парков';
                if (document.getElementById('reg-stat-unactivated')) document.getElementById('reg-stat-unactivated').textContent = s.unactivatedParks;
                if (document.getElementById('reg-stat-zero')) document.getElementById('reg-stat-zero').textContent = s.zeroParkCount;
                if (document.getElementById('reg-stat-activations-subtitle')) document.getElementById('reg-stat-activations-subtitle').textContent = Number(s.totalActivations).toLocaleString('ru-RU') + ' выездов';
                if (document.getElementById('reg-stat-qsos')) document.getElementById('reg-stat-qsos').textContent = Number(s.totalQsos).toLocaleString('ru-RU');

                allRegionsData = data.regions || [];
                isRegionsLoaded = true;
                renderRegionsTable();
                updateActiveRegCard();
              }
            } catch (err) {
              tbody.innerHTML = '<tr><td colspan="10" class="text-center text-danger py-4">Ошибка загрузки данных по регионам: ' + err.message + '</td></tr>';
            }
          }

          function renderRegionsTable() {
            var tbody = document.getElementById('regions-table-body');
            if (!tbody) return;

            var search = (document.getElementById('reg-search-input')?.value || '').toLowerCase().trim();
            var filter = document.getElementById('reg-filter-select')?.value || 'all';
            var sort = document.getElementById('reg-sort-select')?.value || 'parks_asc';

            var list = allRegionsData.filter(function(r) {
              if (search) {
                var matchName = (r.name || '').toLowerCase().includes(search);
                var matchCode = (r.code || '').toLowerCase().includes(search);
                if (!matchName && !matchCode) return false;
              }

              if (filter === 'mature') return !r.isRestricted && r.coverageRate >= 70;
              if (filter === 'low_coverage') return !r.isRestricted && r.totalParks > 0 && r.coverageRate < 20;
              if (filter === 'zero') return !r.isRestricted && r.totalParks === 0;
              if (filter === 'low') return !r.isRestricted && r.totalParks > 0 && r.totalParks <= 3;
              if (filter === 'unactivated') return !r.isRestricted && r.totalParks > 0 && r.activatedParks === 0;
              if (filter === 'active') return r.activatedParks > 0;
              return true;
            });

            // Sorting
            list.sort(function(a, b) {
              if (a.isRestricted !== b.isRestricted) return a.isRestricted ? 1 : -1;
              if (sort === 'coverage_desc') return b.coverageRate - a.coverageRate || b.totalParks - a.totalParks;
              if (sort === 'coverage_asc') return a.coverageRate - b.coverageRate || a.totalParks - b.totalParks;
              if (sort === 'parks_asc') return a.totalParks - b.totalParks || a.name.localeCompare(b.name, 'ru');
              if (sort === 'parks_desc') return b.totalParks - a.totalParks || a.name.localeCompare(b.name, 'ru');
              if (sort === 'oopt_desc') return b.ooptCandidates - a.ooptCandidates || b.totalParks - a.totalParks;
              if (sort === 'rate_desc') return b.activationRate - a.activationRate || b.totalParks - a.totalParks;
              if (sort === 'rate_asc') return a.activationRate - b.activationRate || a.totalParks - b.totalParks;
              if (sort === 'activations_desc') return b.totalActivations - a.totalActivations || b.totalQsos - a.totalQsos;
              if (sort === 'qsos_desc') return b.totalQsos - a.totalQsos;
              if (sort === 'name_asc') return a.name.localeCompare(b.name, 'ru');
              return 0;
            });

            if (list.length === 0) {
              tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">Регионы по заданным критериям не найдены.</td></tr>';
              return;
            }

            var html = '';
            list.forEach(function(r) {
              var badgeClass = 'bg-primary';
              if (r.activationRate >= 50) badgeClass = 'bg-success';
              else if (r.activationRate >= 20) badgeClass = 'bg-info';
              else if (r.activationRate > 0) badgeClass = 'bg-warning text-dark';
              else badgeClass = 'bg-secondary';

              var covBadgeClass = 'bg-danger';
              if (r.coverageRate >= 70) covBadgeClass = 'bg-success';
              else if (r.coverageRate >= 40) covBadgeClass = 'bg-primary';
              else if (r.coverageRate >= 20) covBadgeClass = 'bg-info';
              else if (r.coverageRate >= 5) covBadgeClass = 'bg-warning text-dark';

              var parksBadge = r.totalParks === 0
                ? '<span class="badge bg-danger">0 POTA</span>'
                : '<strong>' + r.totalParks + '</strong>';

              var restrictedBadge = r.isRestricted ? '<span class="badge bg-danger ms-1" style="font-size:10px;">недоступно</span>' : '';

              var ooptBadge = r.ooptCandidates > 0
                ? '<span class="badge bg-light text-dark border">' + Number(r.ooptCandidates).toLocaleString('ru-RU') + '</span>'
                : '<span class="text-muted">—</span>';

              var actionBtn = (!r.isRestricted && r.ooptCandidates > 0)
                ? '<button type="button" class="btn btn-xs btn-outline-success py-1 px-2 btn-goto-oopt" data-region="' + escapeHtmlClient(r.name) + '" title="Открыть кандидаты в реестре ООПТ"><i class="bi bi-tree"></i> Кандидаты</button>'
                : '<span class="text-muted small">—</span>';

              var coverageCell = '<td>' +
                '<div class="d-flex align-items-center gap-2">' +
                  '<div class="progress flex-grow-1" style="height: 6px;" title="Покрытие ООПТ: ' + r.coverageRate + '%">' +
                    '<div class="progress-bar ' + covBadgeClass + '" role="progressbar" style="width: ' + Math.min(100, r.coverageRate) + '%"></div>' +
                  '</div>' +
                  '<span class="small fw-bold" style="min-width: 38px;">' + r.coverageRate + '%</span>' +
                '</div>' +
                '<div class="text-muted" style="font-size: 10px; line-height: 1.1;">' + escapeHtmlClient(r.diplomaStatusText || '') + '</div>' +
              '</td>';

              var actCell = '<td>' +
                '<div class="d-flex align-items-center gap-2">' +
                  '<div class="progress flex-grow-1" style="height: 6px;">' +
                    '<div class="progress-bar ' + badgeClass + '" role="progressbar" style="width: ' + r.activationRate + '%" aria-valuenow="' + r.activationRate + '" aria-valuemin="0" aria-valuemax="100"></div>' +
                  '</div>' +
                  '<span class="small fw-bold" style="min-width: 38px;">' + r.activationRate + '%</span>' +
                '</div>' +
              '</td>';

              html += '<tr>' +
                '<td><span class="badge bg-secondary font-monospace">' + r.code + '</span></td>' +
                '<td><strong>' + escapeHtmlClient(r.name) + '</strong>' + restrictedBadge + '</td>' +
                '<td class="text-center">' + parksBadge + '</td>' +
                '<td class="text-center">' + ooptBadge + '</td>' +
                coverageCell +
                '<td class="text-center"><span class="text-success fw-bold">' + r.activatedParks + '</span></td>' +
                actCell +
                '<td class="text-center">' + Number(r.totalActivations).toLocaleString('ru-RU') + '</td>' +
                '<td class="text-center fw-bold">' + Number(r.totalQsos).toLocaleString('ru-RU') + '</td>' +
                '<td class="text-end">' + actionBtn + '</td>' +
              '</tr>';
            });

            tbody.innerHTML = html;
          }

          function updateActiveRegCard() {
            var currentFilter = document.getElementById('reg-filter-select')?.value || 'all';
            var currentSort = document.getElementById('reg-sort-select')?.value;

            document.querySelectorAll('.reg-kpi-card').forEach(function(card) {
              var f = card.getAttribute('data-filter');
              var s = card.getAttribute('data-sort');

              var isActive = false;
              if (s) {
                isActive = (currentSort === s);
              } else if (f) {
                isActive = (currentFilter === f && currentSort !== 'activations_desc' && currentSort !== 'qsos_desc');
              }

              if (isActive) {
                card.classList.add('active-kpi');
              } else {
                card.classList.remove('active-kpi');
              }
            });
          }

          // KPI card click filters
          document.querySelectorAll('.reg-kpi-card').forEach(function(card) {
            card.addEventListener('click', function() {
              var f = this.getAttribute('data-filter');
              var s = this.getAttribute('data-sort');
              var filterSelect = document.getElementById('reg-filter-select');
              var sortSelect = document.getElementById('reg-sort-select');

              var isAlreadyActive = this.classList.contains('active-kpi');
              if (isAlreadyActive && f !== 'all') {
                if (filterSelect) filterSelect.value = 'all';
                if (sortSelect) sortSelect.value = 'parks_asc';
              } else {
                if (f && filterSelect) filterSelect.value = f;
                if (s && sortSelect) {
                  sortSelect.value = s;
                } else if (sortSelect && (sortSelect.value === 'activations_desc' || sortSelect.value === 'qsos_desc')) {
                  sortSelect.value = 'parks_asc';
                }
              }

              updateActiveRegCard();
              renderRegionsTable();
            });
          });

          document.getElementById('btn-regions-refresh')?.addEventListener('click', loadRegionsData);
          document.getElementById('reg-search-input')?.addEventListener('input', renderRegionsTable);
          document.getElementById('reg-filter-select')?.addEventListener('change', function() {
            updateActiveRegCard();
            renderRegionsTable();
          });
          document.getElementById('reg-sort-select')?.addEventListener('change', function() {
            updateActiveRegCard();
            renderRegionsTable();
          });

          document.addEventListener('click', function(e) {
            var btn = e.target.closest('.btn-goto-oopt');
            if (!btn) return;
            var regionName = btn.getAttribute('data-region');
            if (!regionName) return;
            var ooptTabTrigger = document.querySelector('#list-tab a[href="#list-oopt"]');
            if (ooptTabTrigger) {
              bootstrap.Tab.getOrCreateInstance(ooptTabTrigger).show();
              var regSelect = document.getElementById('oopt-region-select');
              if (regSelect) {
                regSelect.value = regionName;
                loadAdminOopt(1);
              }
            }
          });

          // ==========================================
          // POTA Park Links Audit JS
          // ==========================================
          var allAuditParks = [];
          var currentAuditFilter = 'wikipedia';

          async function loadAuditData() {
            var tbody = document.getElementById('audit-table-body');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4"><span class="spinner-border spinner-border-sm text-primary"></span> Загрузка аудита ссылок...</td></tr>';
            try {
              var res = await fetch('/api/admin/pota-links/audit');
              var data = await res.json();
              if (data && data.stats) {
                document.getElementById('audit-stat-total').textContent = data.stats.total;
                document.getElementById('audit-stat-wiki').textContent = data.stats.wikipedia;
                document.getElementById('audit-stat-http').textContent = data.stats.insecure_http;
                document.getElementById('audit-stat-empty').textContent = data.stats.empty;
                document.getElementById('audit-stat-replacements').textContent = data.stats.with_replacement;
                var badgeWiki = document.getElementById('links-wiki-badge');
                if (badgeWiki) {
                  badgeWiki.textContent = data.stats.wikipedia;
                  if (data.stats.wikipedia === 0) badgeWiki.classList.add('d-none');
                  else badgeWiki.classList.remove('d-none');
                }
                var badgeEmpty = document.getElementById('links-empty-badge');
                if (badgeEmpty) {
                  badgeEmpty.textContent = data.stats.empty;
                  if (data.stats.empty === 0) badgeEmpty.classList.add('d-none');
                  else badgeEmpty.classList.remove('d-none');
                }
                var badgeHttp = document.getElementById('links-http-badge');
                if (badgeHttp) {
                  badgeHttp.textContent = data.stats.insecure_http;
                  if (data.stats.insecure_http === 0) badgeHttp.classList.add('d-none');
                  else badgeHttp.classList.remove('d-none');
                }

                // Update header action buttons dynamically (hide alarm buttons if 0 issues!)
                var btnEmpty = document.getElementById('btn-audit-copy-empty');
                var btnEmptyText = document.getElementById('btn-audit-copy-empty-text');
                if (btnEmpty) {
                  if (data.stats.empty > 0) {
                    btnEmpty.classList.remove('d-none');
                    if (btnEmptyText) btnEmptyText.textContent = 'Алярма: Без ссылок (' + data.stats.empty + ')';
                  } else {
                    btnEmpty.classList.add('d-none');
                  }
                }

                var btnWiki = document.getElementById('btn-audit-copy-all-wiki');
                var btnWikiText = document.getElementById('btn-audit-copy-all-wiki-text');
                if (btnWiki) {
                  if (data.stats.wikipedia > 0) {
                    btnWiki.classList.remove('d-none');
                    if (btnWikiText) btnWikiText.textContent = 'Замены Википедии (' + data.stats.wikipedia + ')';
                  } else {
                    btnWiki.classList.add('d-none');
                  }
                }

                var btnFull = document.getElementById('btn-audit-copy-full');
                var btnFullText = document.getElementById('btn-audit-copy-full-text');
                if (btnFull) {
                  var totalIssues = (data.stats.empty || 0) + (data.stats.wikipedia || 0) + (data.stats.insecure_http || 0);
                  if (totalIssues > 0) {
                    btnFull.classList.remove('d-none');
                    if (data.stats.wikipedia === 0 && data.stats.empty === 0) {
                      if (btnFullText) btnFullText.textContent = 'Отчет по HTTP для Manu (' + data.stats.insecure_http + ')';
                    } else {
                      if (btnFullText) btnFullText.textContent = 'Полный отчет для Manu';
                    }
                  } else {
                    btnFull.classList.add('d-none');
                  }
                }

                // Smart initial filter: if current filter is 'wikipedia' and there are 0 wikipedia links, pick next relevant filter
                if (currentAuditFilter === 'wikipedia' && data.stats.wikipedia === 0) {
                  if (data.stats.empty > 0) currentAuditFilter = 'empty';
                  else if (data.stats.insecure_http > 0) currentAuditFilter = 'insecure_http';
                  else currentAuditFilter = 'all';

                  var filterSelect = document.getElementById('audit-filter-select');
                  if (filterSelect) filterSelect.value = currentAuditFilter;
                }

                allAuditParks = data.parks || [];
                renderAuditTable();
                updateActiveAuditCard();
              }
            } catch(err) {
              tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-4">Ошибка загрузки данных аудита: ' + err.message + '</td></tr>';
            }
          }

          function updateActiveAuditCard() {
            var currentFilter = currentAuditFilter;
            document.querySelectorAll('.audit-kpi-card').forEach(function(card) {
              var f = card.getAttribute('data-filter');
              if (f === currentFilter) {
                card.classList.add('active-kpi');
              } else {
                card.classList.remove('active-kpi');
              }
            });
          }

          function renderAuditTable() {
            var tbody = document.getElementById('audit-table-body');
            var search = (document.getElementById('audit-search-input')?.value || '').toLowerCase().trim();
            var filter = currentAuditFilter;

            var filtered = allAuditParks.filter(function(p) {
              if (filter === 'wikipedia' && p.category !== 'wikipedia') return false;
              if (filter === 'insecure_http' && p.category !== 'insecure_http') return false;
              if (filter === 'empty' && p.category !== 'empty') return false;
              if (filter === 'replacement' && (!p.replacement || p.category === 'ok')) return false;
              if (filter === 'issues' && !p.hasIssue) return false;

              if (search) {
                var matchRef = p.reference.toLowerCase().includes(search);
                var matchName = (p.name || '').toLowerCase().includes(search);
                var matchUrl = (p.website || '').toLowerCase().includes(search);
                var matchOopt = p.replacement && p.replacement.title.toLowerCase().includes(search);
                if (!matchRef && !matchName && !matchUrl && !matchOopt) return false;
              }
              return true;
            });

            var countEl = document.getElementById('audit-count-info');
            if (countEl) {
              countEl.textContent = 'Показано: ' + filtered.length + ' из ' + allAuditParks.length;
            }

            if (filtered.length === 0) {
              tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted p-4">Объекты не найдены по текущему фильтру</td></tr>';
              return;
            }

            tbody.innerHTML = filtered.map(function(p) {
              var currentLinkHtml = p.website
                ? '<a href="' + escapeHtmlClient(p.website) + '" target="_blank" class="text-break font-monospace small"><i class="bi bi-box-arrow-up-right"></i> ' + escapeHtmlClient(p.website.length > 45 ? p.website.slice(0, 45) + '...' : p.website) + '</a>'
                : '<span class="text-danger small"><i class="bi bi-x-circle"></i> Ссылка отсутствует</span>';

              var replHtml = p.replacement
                ? '<div class="small"><a href="' + escapeHtmlClient(p.replacement.url) + '" target="_blank" class="text-success fw-bold text-decoration-none"><i class="bi bi-box-arrow-up-right"></i> NextGIS #' + p.replacement.nid + '</a>' +
                  '<div class="text-muted small">' + escapeHtmlClient(p.replacement.category ? p.replacement.category + ' ' : '') + '«' + escapeHtmlClient(p.replacement.title) + '»' + (p.replacement.sig ? ' <span class="badge bg-light text-secondary border">' + escapeHtmlClient(p.replacement.sig) + '</span>' : '') + '</div></div>'
                : '<span class="text-muted small">—</span>';

              var checkStatusId = 'audit-status-' + p.reference;

              return '<tr>' +
                '<td><span class="badge bg-dark font-monospace fs-6">' + escapeHtmlClient(p.reference) + '</span>' +
                (p.region ? '<div class="small text-muted font-monospace">' + escapeHtmlClient(p.region) + '</div>' : '') + '</td>' +
                '<td><strong>' + escapeHtmlClient(p.name) + '</strong></td>' +
                '<td>' + currentLinkHtml + '</td>' +
                '<td>' + replHtml + '</td>' +
                '<td><span class="badge ' + p.badgeClass + '">' + escapeHtmlClient(p.categoryLabel) + '</span><div id="' + checkStatusId + '" class="mt-1"></div></td>' +
                '<td>' +
                  '<div class="d-flex gap-1 justify-content-center">' +
                    '<button type="button" class="btn btn-xs btn-outline-success copy-single-audit-btn py-0 px-1.5" style="font-size:12px;" data-ref="' + p.reference + '" title="Скопировать готовый текст заявки на замену для R2BBX"><i class="bi bi-clipboard"></i> Заявка</button>' +
                    (p.website ? '<button type="button" class="btn btn-xs btn-outline-secondary check-url-btn py-0 px-1.5" style="font-size:12px;" data-url="' + escapeHtmlClient(p.website) + '" data-target="' + checkStatusId + '" title="Проверить ответ веб-сервера онлайн"><i class="bi bi-activity"></i></button>' : '') +
                  '</div>' +
                '</td>' +
              '</tr>';
            }).join('');
          }

          // Search and filter listeners for Audit
          document.getElementById('audit-search-input')?.addEventListener('input', renderAuditTable);
          document.getElementById('audit-filter-select')?.addEventListener('change', function(e) {
            currentAuditFilter = e.target.value;
            updateActiveAuditCard();
            renderAuditTable();
          });

          // KPI card click filters
          document.querySelectorAll('.audit-kpi-card').forEach(function(card) {
            card.addEventListener('click', function() {
              var f = this.getAttribute('data-filter');
              if (f) {
                currentAuditFilter = f;
                var selectEl = document.getElementById('audit-filter-select');
                if (selectEl) selectEl.value = f;
                updateActiveAuditCard();
                renderAuditTable();
              }
            });
          });

          document.getElementById('btn-audit-refresh')?.addEventListener('click', loadAuditData);

          // Copy empty links report (Manu R2BBX)
          document.getElementById('btn-audit-copy-empty')?.addEventListener('click', async function() {
            try {
              var res = await fetch('/api/admin/pota-links/report-empty');
              var data = await res.json();
              if (data && data.text) {
                navigator.clipboard.writeText(data.text).then(function() {
                  if (Toast) {
                    Toast.fire({ icon: 'warning', title: '🚨 Список парков без ссылок (Алярма) скопирован!' });
                  } else {
                    alert('Список парков без ссылок скопирован в буфер!');
                  }
                });
              }
            } catch(e) {
              alert('Ошибка получения отчета: ' + e.message);
            }
          });

          // Copy batch Wikipedia replacements
          document.getElementById('btn-audit-copy-all-wiki')?.addEventListener('click', async function() {
            try {
              var res = await fetch('/api/admin/pota-links/batch-wiki');
              var data = await res.json();
              if (data && data.text) {
                navigator.clipboard.writeText(data.text).then(function() {
                  if (Toast) {
                    Toast.fire({ icon: 'success', title: '📋 Сводный список замен Википедии скопирован в буфер!' });
                  } else {
                    alert('Скопировано в буфер!');
                  }
                });
              }
            } catch(e) {
              alert('Ошибка получения сводки замен: ' + e.message);
            }
          });

          // Copy full Manu audit report
          document.getElementById('btn-audit-copy-full')?.addEventListener('click', async function() {
            try {
              var res = await fetch('/api/admin/pota-links/report-full');
              var data = await res.json();
              if (data && data.text) {
                navigator.clipboard.writeText(data.text).then(function() {
                  if (Toast) {
                    Toast.fire({ icon: 'success', title: '📧 Полный отчет по ссылкам для Manu R2BBX скопирован!' });
                  } else {
                    alert('Полный отчет скопирован в буфер!');
                  }
                });
              }
            } catch(e) {
              alert('Ошибка получения полного отчета: ' + e.message);
            }
          });

          // Copy single park replacement
          document.addEventListener('click', function(e) {
            var btn = e.target.closest('.copy-single-audit-btn');
            if (btn) {
              var ref = btn.getAttribute('data-ref');
              var park = allAuditParks.find(function(p) { return p.reference === ref; });
              if (park) {
                var currentUrl = park.website || '(нет ссылки)';
                var repl = park.replacement;
                var newUrl = repl ? repl.url : 'https://карта.оцзк.рф';
                var ooptDesc = repl ? (repl.category ? repl.category + ' ' : '') + '«' + repl.title + '» (' + (repl.sig || 'ООПТ РФ') + ')' : 'ООПТ РФ';

                var text = [
                  'Замена ссылки для парка POTA:',
                  'Референция: ' + park.reference + ' (' + park.name + ')',
                  'Текущая ссылка: ' + currentUrl + (park.category === 'wikipedia' ? ' [Википедия]' : ''),
                  'Рекомендуемая официальная ссылка: ' + newUrl,
                  'Объект в реестре ООПТ: ' + ooptDesc,
                  repl && repl.region ? 'Регион: ' + repl.region : ''
                ].filter(Boolean).join(String.fromCharCode(10));

                navigator.clipboard.writeText(text).then(function() {
                  if (Toast) {
                    Toast.fire({ icon: 'success', title: '📋 Заявка на замену для ' + ref + ' скопирована!' });
                  } else {
                    alert('Скопировано: ' + ref);
                  }
                });
              }
            }
          });

          // Online URL checker click
          document.addEventListener('click', async function(e) {
            var btn = e.target.closest('.check-url-btn');
            if (btn) {
              var url = btn.getAttribute('data-url');
              var targetId = btn.getAttribute('data-target');
              var targetEl = document.getElementById(targetId);
              if (!targetEl || !url) return;

              btn.disabled = true;
              targetEl.innerHTML = '<span class="spinner-border spinner-border-sm text-primary" style="width: 10px; height: 10px;"></span> <small class="text-muted">Проверка...</small>';
              try {
                var res = await fetch('/api/admin/pota-links/check-url', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url: url })
                });
                var result = await res.json();
                if (result.ok) {
                  targetEl.innerHTML = '<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="bi bi-check-circle"></i> ' + (result.status || 200) + ' OK</span>';
                } else {
                  targetEl.innerHTML = '<span class="badge bg-danger-subtle text-danger border border-danger-subtle" title="' + escapeHtmlClient(result.error || '') + '"><i class="bi bi-x-circle"></i> ' + escapeHtmlClient(result.error || 'Ошибка') + '</span>';
                }
              } catch (err) {
                targetEl.innerHTML = '<span class="badge bg-danger-subtle text-danger">Ошибка запроса</span>';
              } finally {
                btn.disabled = false;
              }
            }
          });

          // Open and load audit on tab click or hash
          document.getElementById('list-links-list')?.addEventListener('shown.bs.tab', function() {
            if (allAuditParks.length === 0) {
              loadAuditData();
            }
          });

          if (window.location.hash === '#list-links') {
            loadAuditData();
          } else {
            // Load audit in background to initialize badge count
            loadAuditData();
          }

          // Open and load regions on tab click or hash
          document.getElementById('list-regions-list')?.addEventListener('shown.bs.tab', function() {
            if (!isRegionsLoaded) {
              loadRegionsData();
            }
          });

          if (window.location.hash === '#list-regions') {
            loadRegionsData();
          }

          // Instant load on page reload (F5) if tab is oopt
          if (window.location.hash === '#list-oopt') {
            loadAdminOopt(1);
          }
        </script>
      </body>
      </html>
    `;
    res.send(html);
  });

  // Action routes
  app.post('/approve/:id', requireAuth, async (req, res) => {
    const telegramId = Number(req.params.id);
    try {
      db.prepare("UPDATE users SET status = 'approved' WHERE telegram_id = ?").run(telegramId);
      if (telegramId > 0 && telegramClient) {
        try {
          await telegramClient.sendMessage(telegramId, '✅ Ваша заявка одобрена! Теперь вам доступны все функции бота.');
        } catch (e) {}
      }
      res.json({ success: true });
    } catch (err) {
      console.error('Error approving user:', err);
      res.status(500).json({ error: 'Error approving user' });
    }
  });

  app.post('/reject/:id', requireAuth, async (req, res) => {
    const telegramId = Number(req.params.id);
    const reason = (req.body && req.body.reason) || 'Причина не указана';
    try {
      db.prepare("UPDATE users SET status = 'rejected', reject_reason = ? WHERE telegram_id = ?").run(reason, telegramId);
      if (telegramId > 0 && telegramClient) {
        try {
          await telegramClient.sendMessage(telegramId, `❌ Ваша заявка на регистрацию была отклонена.\n\nПричина: ${reason}\n\nВы можете подать заявку повторно, используя команду /callsign`);
        } catch (e) {}
      }
      res.json({ success: true });
    } catch (err) {
      console.error('Error rejecting user:', err);
      res.status(500).json({ error: 'Error rejecting user' });
    }
  });

  app.post('/delete-user/:id', requireAuth, async (req, res) => {
    const telegramId = Number(req.params.id);
    try {
      const userRow = db.prepare('SELECT last_spot_msg_id FROM users WHERE telegram_id = ?').get(telegramId);
      if (userRow && userRow.last_spot_msg_id && ACTIVITY_CHANNEL_ID) {
        let channelId = ACTIVITY_CHANNEL_ID;
        if (channelId.includes('t.me/')) {
          channelId = '@' + channelId.split('t.me/')[1].replace('/', '');
        }
        try {
          await pinManager.unpinSpotNow(telegramClient, channelId, userRow.last_spot_msg_id);
          await telegramClient.deleteMessage(channelId, userRow.last_spot_msg_id);
        } catch (e) {}
      }
      db.prepare("DELETE FROM users WHERE telegram_id = ?").run(telegramId);
      db.prepare("DELETE FROM subscriptions WHERE telegram_id = ?").run(telegramId);
      if (telegramId > 0 && telegramClient) {
        try {
          await telegramClient.sendMessage(telegramId, '⚠️ Ваш аккаунт был удален администратором. Вы можете зарегистрироваться заново с помощью команды /callsign');
        } catch (e) {}
      }
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting user:', err);
      res.status(500).json({ error: 'Error deleting user' });
    }
  });

  // API for spots
  app.get('/api/spots', requireAuth, (req, res) => {
    const spotsStmt = db.prepare("SELECT id, callsign, reference, frequency, mode, comment, source, ip_address, created_at, msg_id FROM spots WHERE source != 'cluster_throttled' ORDER BY created_at DESC LIMIT 100");
    res.json(spotsStmt.all());
  });

  // Clear all spots from SQLite DB
  app.post('/api/spots/clear-all', requireAuth, async (req, res) => {
    try {
      db.prepare('DELETE FROM spots').run();
      console.log('[Web Admin] 🗑️ База спотов полностью очищена администратором');
      res.json({ success: true });
    } catch (err) {
      console.error('[Web Admin] Ошибка очистки спотов:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Spot deletion route
  app.post('/spots/delete/:id', requireAuth, async (req, res) => {
    const spotId = req.params.id;
    try {
      const spot = db.prepare('SELECT msg_id FROM spots WHERE id = ?').get(spotId);
      if (spot) {
        db.prepare('DELETE FROM spots WHERE id = ?').run(spotId);
        if (spot.msg_id) {
          let channelId = process.env.ACTIVITY_CHANNEL_ID;
          if (channelId && !channelId.startsWith('-100') && !channelId.startsWith('@') && /^[0-9-]+$/.test(channelId)) {
            channelId = channelId.startsWith('-') ? `-100${channelId.substring(1)}` : `-100${channelId}`;
          } else if (channelId && channelId.includes('t.me/')) {
            channelId = `@${channelId.split('t.me/')[1].replace('/', '')}`;
          }
          try {
            // Unpin first before deleting so Telegram doesn't leave "pinned a deleted message"
            try {
              await pinManager.unpinSpotNow(telegramClient, channelId, spot.msg_id);
            } catch (unpinErr) {}

            await telegramClient.deleteMessage(channelId, spot.msg_id);
            // Also delete Telegram's pin service message if lingering
            try {
              await telegramClient.deleteMessage(channelId, spot.msg_id + 1);
            } catch (delServErr) {}

            console.log(`[Admin] Удалено сообщение ${spot.msg_id} из канала ${channelId}`);
          } catch (e) {
            console.warn(`[Admin] Не удалось удалить сообщение ${spot.msg_id} из канала: ${e.message}`);
          }
        }
      }
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting spot:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Add muted broadcast callsign (Expedition spam suppression)
  app.post('/admin/muted-callsigns/add', requireAuth, (req, res) => {
    const callsign = (req.body?.callsign || '').trim().toUpperCase();
    const reason = (req.body?.reason || '').trim();
    if (callsign) {
      try {
        db.prepare(`
          INSERT INTO muted_broadcast_callsigns (callsign, reason) 
          VALUES (?, ?) 
          ON CONFLICT(callsign) DO UPDATE SET reason = excluded.reason
        `).run(callsign, reason);
        console.log(`[Web Admin] 🔇 Добавлен позывной в список исключений вещания: ${callsign} (${reason || 'без описания'})`);
      } catch (e) {
        console.error('[Web Admin] Ошибка добавления исключения:', e.message);
      }
    }
    res.redirect('/#list-spots');
  });

  // Add muted broadcast callsign via AJAX (1-click from spots table)
  app.post('/admin/muted-callsigns/add-ajax', requireAuth, (req, res) => {
    const callsign = (req.body?.callsign || '').trim().toUpperCase();
    const reason = (req.body?.reason || 'Добавлен из ленты спотов').trim();
    if (!callsign) {
      return res.status(400).json({ error: 'Позывной не указан' });
    }
    try {
      db.prepare(`
        INSERT INTO muted_broadcast_callsigns (callsign, reason) 
        VALUES (?, ?) 
        ON CONFLICT(callsign) DO UPDATE SET reason = excluded.reason
      `).run(callsign, reason);
      console.log(`[Web Admin] 🔇 Добавлен позывной в список исключений вещания (из спотов): ${callsign} (${reason})`);
      res.json({ success: true, callsign, reason });
    } catch (e) {
      console.error('[Web Admin] Ошибка добавления исключения:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Delete muted broadcast callsign
  app.post('/admin/muted-callsigns/delete', requireAuth, (req, res) => {
    const id = parseInt(req.body?.id, 10);
    if (id) {
      try {
        const row = db.prepare('SELECT callsign FROM muted_broadcast_callsigns WHERE id = ?').get(id);
        db.prepare('DELETE FROM muted_broadcast_callsigns WHERE id = ?').run(id);
        if (row) {
          console.log(`[Web Admin] 🔊 Удален позывной из списка исключений вещания: ${row.callsign}`);
        }
      } catch (e) {
        console.error('[Web Admin] Ошибка удаления исключения:', e.message);
      }
    }
    res.redirect('/#list-spots');
  });

  app.post('/broadcast', requireAuth, async (req, res) => {
    const { target, message, pin } = req.body || {};
    
    let targetId = target === 'group' ? process.env.MAIN_CHAT_ID : process.env.ACTIVITY_CHANNEL_ID;

    if (!targetId) {
      return res.status(400).send('Ошибка: ID целевого чата не задан в конфигурации (.env)');
    }

    if (!targetId.toString().startsWith('-100') && !targetId.toString().startsWith('@') && /^[0-9-]+$/.test(targetId)) {
      targetId = targetId.toString().startsWith('-') ? '-100' + targetId.toString().substring(1) : '-100' + targetId;
    } else if (targetId.toString().includes('t.me/')) {
      targetId = '@' + targetId.toString().split('t.me/')[1].replace('/', '');
    }

    try {
      const sentMsg = await telegramClient.sendMessage(targetId, message, { parse_mode: 'HTML', disable_web_page_preview: true });
      console.log(`[Broadcast] Admin sent message to ${target} (${targetId})`);
      
      if (pin === 'true') {
        await telegramClient.pinChatMessage(targetId, sentMsg.message_id);
        console.log(`[Broadcast] Message pinned successfully.`);
      }
      res.redirect('/#list-broadcast');
    } catch (err) {
      console.error('[Broadcast] Error sending message:', err);
      res.status(500).send(`Ошибка отправки сообщения: ${err.message}`);
    }
  });

  // Edit pinned / welcome message in group or channel
  app.post('/api/edit-pinned', requireAuth, async (req, res) => {
    try {
      let { chatId, messageId, text } = req.body || {};
      if (!text || !text.trim()) {
        return res.status(400).json({ error: 'Текст сообщения не может быть пустым' });
      }

      if (!chatId) {
        chatId = process.env.MAIN_CHAT_ID;
      }

      let targetId = String(chatId).trim();
      if (targetId.includes('t.me/c/')) {
        const parts = targetId.split('t.me/c/')[1].split('/');
        targetId = '-100' + parts[0];
        if (parts[1] && !messageId) messageId = parseInt(parts[1], 10);
      } else if (!targetId.startsWith('-100') && !targetId.startsWith('@') && /^[0-9-]+$/.test(targetId)) {
        targetId = targetId.startsWith('-') ? '-100' + targetId.substring(1) : '-100' + targetId;
      } else if (targetId.includes('t.me/')) {
        targetId = '@' + targetId.split('t.me/')[1].replace('/', '');
      }

      const msgId = parseInt(messageId, 10) || 474;

      await telegramClient.editMessageText(targetId, msgId, undefined, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });

      console.log(`[Admin] Successfully edited pinned message #${msgId} in ${targetId}`);
      res.json({ success: true, message: `Сообщение #${msgId} успешно обновлено в чате!` });
    } catch (err) {
      console.error('[Admin] Error editing pinned message:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // RU-POTA Shield Ban Route
  app.post('/api/shield/ban/:id', requireAuth, async (req, res) => {
    const recordId = Number(req.params.id);
    try {
      const record = db.prepare('SELECT telegram_id, first_name, username FROM blocked_users WHERE id = ?').get(recordId);
      if (!record) {
        return res.status(404).json({ error: 'Запись не найдена' });
      }

      let mainChatId = process.env.MAIN_CHAT_ID;
      if (mainChatId) {
        if (!mainChatId.toString().startsWith('-100') && !mainChatId.toString().startsWith('@') && /^[0-9-]+$/.test(mainChatId)) {
          mainChatId = mainChatId.toString().startsWith('-') ? '-100' + mainChatId.toString().substring(1) : '-100' + mainChatId;
        }
        try {
          await telegramClient.banChatMember(mainChatId, record.telegram_id);
          console.log(`[Shield Admin] Заблокирован (бан) пользователь ${record.telegram_id} в чате ${mainChatId}`);
        } catch (tgErr) {
          console.warn(`[Shield Admin] Ошибка banChatMember в Telegram: ${tgErr.message}`);
        }
      }

      db.prepare("UPDATE blocked_users SET action = 'banned' WHERE id = ?").run(recordId);
      res.json({ success: true });
    } catch (err) {
      console.error('[Shield Admin] Ошибка при бане пользователя:', err);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // RU-POTA Shield Unban Route
  app.post('/api/shield/unban/:id', requireAuth, async (req, res) => {
    const recordId = Number(req.params.id);
    try {
      const record = db.prepare('SELECT telegram_id FROM blocked_users WHERE id = ?').get(recordId);
      if (!record) {
        return res.status(404).json({ error: 'Запись не найдена' });
      }

      let mainChatId = process.env.MAIN_CHAT_ID;
      if (mainChatId) {
        if (!mainChatId.toString().startsWith('-100') && !mainChatId.toString().startsWith('@') && /^[0-9-]+$/.test(mainChatId)) {
          mainChatId = mainChatId.toString().startsWith('-') ? '-100' + mainChatId.toString().substring(1) : '-100' + mainChatId;
        }
        try {
          await telegramClient.unbanChatMember(mainChatId, record.telegram_id, { only_if_banned: true });
          console.log(`[Shield Admin] Разблокирован пользователь ${record.telegram_id} в чате ${mainChatId}`);
        } catch (tgErr) {
          console.warn(`[Shield Admin] Ошибка unbanChatMember в Telegram: ${tgErr.message}`);
        }
      }

      db.prepare("UPDATE blocked_users SET action = 'unbanned' WHERE id = ?").run(recordId);
      res.json({ success: true });
    } catch (err) {
      console.error('[Shield Admin] Ошибка при разблокировке пользователя:', err);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // RU-POTA Shield Toggle Read Status
  app.post('/api/shield/toggle-read/:id', requireAuth, (req, res) => {
    const recordId = Number(req.params.id);
    try {
      const record = db.prepare('SELECT is_read FROM blocked_users WHERE id = ?').get(recordId);
      if (!record) {
        return res.status(404).json({ error: 'Запись не найдена' });
      }
      const newStatus = record.is_read ? 0 : 1;
      db.prepare('UPDATE blocked_users SET is_read = ? WHERE id = ?').run(newStatus, recordId);
      const unreadCount = db.prepare('SELECT count(*) as count FROM blocked_users WHERE is_read = 0').get().count;
      res.json({ success: true, is_read: newStatus, unreadCount });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // RU-POTA Shield Mark All as Read
  app.post('/api/shield/read-all', requireAuth, (req, res) => {
    try {
      db.prepare('UPDATE blocked_users SET is_read = 1 WHERE is_read = 0 AND is_archived = 0').run();
      res.json({ success: true, unreadCount: 0 });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // RU-POTA Shield Archive All Incidents
  app.post('/api/shield/archive-all', requireAuth, (req, res) => {
    try {
      db.prepare('UPDATE blocked_users SET is_archived = 1, is_read = 1 WHERE is_archived = 0').run();
      // Keep only top 20 latest archived incidents, delete older ones
      db.prepare(`
        DELETE FROM blocked_users 
        WHERE is_archived = 1 
          AND id NOT IN (
            SELECT id FROM blocked_users 
            WHERE is_archived = 1 
            ORDER BY created_at DESC 
            LIMIT 20
          )
      `).run();
      console.log('[RU-POTA Shield] 📦 Все активные инциденты перенесены в архив (макс. 20 записей)');
      res.json({ success: true });
    } catch (err) {
      console.error('[Shield Archive Error]:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // RU-POTA Shield Clear All Incidents
  app.post('/api/shield/clear-all', requireAuth, (req, res) => {
    try {
      db.prepare('DELETE FROM blocked_users').run();
      console.log('[RU-POTA Shield] 🗑️ Журнал инцидентов полностью очищен');
      res.json({ success: true });
    } catch (err) {
      console.error('[Shield Clear Error]:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // RU-POTA Shield API for incidents (active only)
  app.get('/api/shield/blocked', requireAuth, (req, res) => {
    try {
      const rows = db.prepare("SELECT id, telegram_id, first_name, last_name, username, reason, details, action, is_read, is_archived, created_at FROM blocked_users WHERE is_archived = 0 ORDER BY created_at DESC LIMIT 100").all();
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // OOPT Direct Route and Admin API
  app.get('/oopt', (req, res) => {
    res.redirect('/app');
  });

  app.post('/api/admin/oopt/sync', requireAuth, async (req, res) => {
    try {
      const result = await syncOoptRegistry();
      res.json(result);
    } catch (err) {
      console.error('[Admin] OOPT sync error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/oopt', requireAuth, (req, res) => {
    try {
      const { page, limit, search, sig, category, region, pota } = req.query;
      const data = getOoptList({ page, limit, search, sig, category, region, pota });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/oopt/stats', requireAuth, (req, res) => {
    try {
      const stats = getOoptStats();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Regional POTA Statistics API Endpoint
  app.get('/api/admin/regions/stats', requireAuth, (req, res) => {
    try {
      const stats = getRegionalPotaStats();
      res.json(stats);
    } catch (err) {
      console.error('[Admin] Regional stats error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POTA Links Audit API Endpoints
  app.get('/api/admin/pota-links/audit', requireAuth, (req, res) => {
    try {
      const data = auditPotaLinks();
      res.json(data);
    } catch (err) {
      console.error('[Admin] Links audit error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/pota-links/check-url', requireAuth, async (req, res) => {
    try {
      const { url } = req.body || {};
      const result = await checkUrlOnline(url);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/pota-links/batch-wiki', requireAuth, (req, res) => {
    try {
      const text = formatBatchWikipediaReplacements();
      res.json({ text });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/pota-links/report-empty', requireAuth, (req, res) => {
    try {
      const text = formatEmptyLinksReport();
      res.json({ text });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/pota-links/report-full', requireAuth, (req, res) => {
    try {
      const text = formatFullManuReport();
      res.json({ text });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(PORT, () => {
    console.log(`🌐 Admin panel listening on http://localhost:${PORT}`);
    console.log(`📱 Telegram Mini App available at http://localhost:${PORT}/app`);
  });
};


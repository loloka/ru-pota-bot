import express from 'express';
import cookieSession from 'cookie-session';
import db from '../db/database.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTmaRouter } from './tmaApi.js';
import { WELCOME_PINNED_POST } from '../bot/texts/welcomePost.js';

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
  app.use('/app', express.static(webappDist));
  app.get(/^\/app(\/.*)?$/, (req, res) => {
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
    if (req.body.password === adminPassword) {
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
    const usersStmt = db.prepare("SELECT telegram_id, callsign, status, created_at FROM users ORDER BY created_at DESC");
    const allUsers = usersStmt.all();
    const pending = allUsers.filter(u => u.status === 'pending');
    const approved = allUsers.filter(u => u.status === 'approved');
    const rejected = allUsers.filter(u => u.status === 'rejected');

    // 2. Spots
    const spotsStmt = db.prepare("SELECT id, callsign, reference, frequency, mode, comment, source, created_at, msg_id FROM spots WHERE source != 'cluster_throttled' ORDER BY created_at DESC LIMIT 100");
    const latestSpots = spotsStmt.all();

    // 3. RU-POTA Shield Blocked Users & Incidents
    const blockedStmt = db.prepare("SELECT id, telegram_id, first_name, last_name, username, reason, details, action, created_at FROM blocked_users ORDER BY created_at DESC LIMIT 100");
    const latestBlocked = blockedStmt.all();
    const totalBlocked = db.prepare("SELECT count(*) as count FROM blocked_users").get().count;
    const bannedCount = db.prepare("SELECT count(*) as count FROM blocked_users WHERE action = 'banned'").get().count;
    const kickedCount = db.prepare("SELECT count(*) as count FROM blocked_users WHERE action = 'kicked'").get().count;
    const warnedCount = db.prepare("SELECT count(*) as count FROM blocked_users WHERE action = 'warned'").get().count;

    const escapeHtmlServer = (str) => {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };

    const generateUserRow = (u) => `
      <tr id="user-row-${u.telegram_id}">
        <td>
          <div class="d-flex align-items-center">
            <img src="https://ui-avatars.com/api/?name=${u.callsign}&background=random" id="avatar-${u.telegram_id}" class="rounded-circle me-3" width="45" height="45" alt="Avatar">
            <div>
              <strong>${u.callsign}</strong>
              <div class="small text-muted" id="user-info-${u.telegram_id}">
                <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="width: 10px; height: 10px;"></span> Загрузка...
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

    const generateSpotRow = (s) => {
      const deleteBtn = `<button type="button" class="btn btn-sm btn-outline-danger delete-spot-btn" data-id="${s.id}" data-source="${s.source || ''}" data-msg="${s.msg_id || ''}">Удалить</button>`;
      return `
      <tr id="spot-row-${s.id}">
        <td><strong>${s.callsign}</strong></td>
        <td><a href="https://next.pota.app/park/${s.reference}" target="_blank">${s.reference}</a></td>
        <td>${s.frequency || ''} ${s.mode || ''}</td>
        <td>${s.source}</td>
        <td>${new Date(s.created_at).toLocaleString('ru-RU')}</td>
        <td>${deleteBtn}</td>
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

      const unbanBtn = b.action === 'banned'
        ? `<button type="button" class="btn btn-sm btn-outline-success unban-user-btn" data-id="${b.id}" data-tgid="${b.telegram_id}">Разблокировать</button>`
        : '';

      return `
        <tr id="blocked-row-${b.id}">
          <td>
            <strong>${escapeHtmlServer(userDisplay)}</strong>
            <div class="small text-muted">${escapeHtmlServer(name)}</div>
          </td>
          <td><code>${b.telegram_id}</code></td>
          <td><span class="badge bg-secondary">${reasonText}</span></td>
          <td><small class="text-break">${escapeHtmlServer(b.details || '')}</small></td>
          <td>${actionBadge}</td>
          <td>${new Date(b.created_at).toLocaleString('ru-RU')}</td>
          <td>${unbanBtn}</td>
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
                <a class="list-group-item list-group-item-action" id="list-shield-list" data-bs-toggle="list" href="#list-shield" role="tab" aria-controls="list-shield"><i class="bi bi-shield-lock"></i> RU-POTA Shield ${totalBlocked > 0 ? `<span class="badge bg-danger rounded-pill ms-1">${totalBlocked}</span>` : ''}</a>
                <a class="list-group-item list-group-item-action" id="list-broadcast-list" data-bs-toggle="list" href="#list-broadcast" role="tab" aria-controls="list-broadcast"><i class="bi bi-megaphone"></i> Рассылка</a>
                <a class="list-group-item list-group-item-action" id="list-welcome-list" data-bs-toggle="list" href="#list-welcome" role="tab" aria-controls="list-welcome"><i class="bi bi-pin-angle"></i> Закрепленный пост</a>
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
                  <h3>Последние 100 спотов в БД</h3>
                  <div class="table-responsive">
                    <table class="table table-striped table-hover align-middle" style="overflow: hidden;">
                      <thead class="table-light"><tr><th>Позывной</th><th>Парк</th><th>Частота/Модуляция</th><th>Источник</th><th>Дата</th><th>Действия</th></tr></thead>
                      <tbody id="spots-tbody">
                        ${latestSpots.length > 0 ? latestSpots.map(generateSpotRow).join('') : '<tr><td colspan="6" class="text-center">Спотов пока нет</td></tr>'}
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

                  <h4>Журнал инцидентов безопасности (${latestBlocked.length})</h4>
                  <div class="table-responsive">
                    <table class="table table-bordered table-hover align-middle">
                      <thead class="table-light">
                        <tr>
                          <th>Пользователь</th>
                          <th>Telegram ID</th>
                          <th>Причина</th>
                          <th>Детали / Текст</th>
                          <th>Действие</th>
                          <th>Дата</th>
                          <th>Управление</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${latestBlocked.length > 0 ? latestBlocked.map(generateBlockedRow).join('') : '<tr><td colspan="7" class="text-center text-muted">Спам-активности не зафиксировано. Все чисто! 🌲</td></tr>'}
                      </tbody>
                    </table>
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
          </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
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

              let warningHtml = 'Спот будет удален из <b>нашей локальной базы данных</b>.<br>';
              if (hasMsgId) warningHtml += 'Сообщение также будет стерто из нашего Telegram-канала.<br>';
              if (source === 'cluster') warningHtml += '<br><span style="color: #d33;"><b>Внимание:</b> Это глобальный спот из кластера POTA. Мы не можем удалить его с сайта <i>pota.app</i> (API не позволяет). Он удалится только у нас.</span>';

              let isConfirmed = false;
              if (typeof Swal === 'undefined') {
                // Fallback if CDN is blocked
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
                  html += '<tr id="spot-row-' + s.id + '">';
                  html += '<td><strong>' + s.callsign + '</strong></td>';
                  html += '<td><a href="https://next.pota.app/park/' + s.reference + '" target="_blank">' + s.reference + '</a></td>';
                  html += '<td>' + (s.frequency || '') + ' ' + (s.mode || '') + '</td>';
                  html += '<td>' + sourceAttr + '</td>';
                  html += '<td>' + dateStr + '</td>';
                  html += '<td><button type="button" class="btn btn-sm btn-outline-danger delete-spot-btn" data-id="' + s.id + '" data-source="' + sourceAttr + '" data-msg="' + msgAttr + '">Удалить</button></td>';
                  html += '</tr>';
                });
                const tbody = document.getElementById('spots-tbody');
                if (tbody) tbody.innerHTML = html || '<tr><td colspan="6" class="text-center">Спотов пока нет</td></tr>';
              }
            } catch (e) {
              console.error(e);
            }
          }

          // Global event listener for spots and users deletion
          document.addEventListener('click', function(e) {
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
            const unbanBtn = e.target.closest('.unban-user-btn');
            if (unbanBtn) {
              e.preventDefault();
              unbanUserBtn(unbanBtn);
              return;
            }
          });

          async function unbanUserBtn(btn) {
            const id = btn.getAttribute('data-id');
            const tgid = btn.getAttribute('data-tgid');
            let isConfirmed = false;
            if (typeof Swal === 'undefined') {
              isConfirmed = confirm('Разблокировать пользователя (TG ID: ' + tgid + ')?');
            } else {
              const result = await Swal.fire({
                title: 'Разблокировать?',
                text: 'Пользователь (TG ID: ' + tgid + ') будет разблокирован в Telegram-чате сообщества.',
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
                  setTimeout(() => window.location.reload(), 500);
                } else {
                  throw new Error('Server error');
                }
              } catch (e) {
                if (Toast) Toast.fire({ icon: 'error', title: 'Ошибка разблокировки' });
              }
            }
          }

          // Load user infos
          async function loadUserInfos() {
            const rows = document.querySelectorAll('tr[id^="user-row-"]');
            for (const row of rows) {
              const id = row.id.replace('user-row-', '');
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
            if (tab.classList.contains('active')) {
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
      try {
        await telegramClient.sendMessage(telegramId, '✅ Ваша заявка одобрена! Теперь вам доступны все функции бота.');
      } catch (e) {}
      res.json({ success: true });
    } catch (err) {
      console.error('Error approving user:', err);
      res.status(500).json({ error: 'Error approving user' });
    }
  });

  app.post('/reject/:id', requireAuth, async (req, res) => {
    const telegramId = Number(req.params.id);
    const reason = req.body.reason || 'Причина не указана';
    try {
      db.prepare("UPDATE users SET status = 'rejected', reject_reason = ? WHERE telegram_id = ?").run(reason, telegramId);
      try {
        await telegramClient.sendMessage(telegramId, `❌ Ваша заявка на регистрацию была отклонена.\n\nПричина: ${reason}\n\nВы можете подать заявку повторно, используя команду /callsign`);
      } catch (e) {}
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
      try {
        await telegramClient.sendMessage(telegramId, '⚠️ Ваш аккаунт был удален администратором. Вы можете зарегистрироваться заново с помощью команды /callsign');
      } catch (e) {}
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting user:', err);
      res.status(500).json({ error: 'Error deleting user' });
    }
  });

  // API for spots
  app.get('/api/spots', requireAuth, (req, res) => {
    const spotsStmt = db.prepare("SELECT id, callsign, reference, frequency, mode, comment, source, created_at, msg_id FROM spots WHERE source != 'cluster_throttled' ORDER BY created_at DESC LIMIT 100");
    res.json(spotsStmt.all());
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
            await telegramClient.deleteMessage(channelId, spot.msg_id);
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

  app.post('/broadcast', requireAuth, async (req, res) => {
    const { target, message, pin } = req.body;
    
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
      let { chatId, messageId, text } = req.body;
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

  // RU-POTA Shield API for incidents
  app.get('/api/shield/blocked', requireAuth, (req, res) => {
    try {
      const rows = db.prepare("SELECT id, telegram_id, first_name, last_name, username, reason, details, action, created_at FROM blocked_users ORDER BY created_at DESC LIMIT 100").all();
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(PORT, () => {
    console.log(`🌐 Admin panel listening on http://localhost:${PORT}`);
    console.log(`📱 Telegram Mini App available at http://localhost:${PORT}/app`);
  });
};


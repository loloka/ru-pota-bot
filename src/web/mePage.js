/**
 * RU-POTA User Profile & Auth Page (/me)
 * Displays authorized radio ham profile, field activation tools,
 * or fast Telegram Login options for guests.
 */

export function renderMeHtml(options = {}) {
  const {
    user = null,
    isAuthed = false,
    isAdmin = false,
    botUsername = process.env.BOT_USERNAME || 'ru_pota_bot',
    errorMessage = '',
    successMessage = ''
  } = options;

  const userCallsign = user?.callsign || '';
  const userAvatar = user?.avatar_url || '';
  const displayName = userCallsign || user?.first_name || 'Оператор';
  const status = user?.status || 'guest';
  const tgId = user?.telegram_id || user?.id || '';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
  <title>Личный кабинет | RU-POTA Хаб</title>
  <meta name="description" content="Личный кабинет участника программы RU-POTA (Parks on the Air Russia).">
  <link rel="icon" type="image/svg+xml" href="/app/favicon.svg">

  <!-- Bootstrap 5 & Icons -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">

  <style>
    :root {
      --bg-dark: #0b0f19;
      --card-bg: rgba(19, 27, 46, 0.85);
      --card-border: rgba(255, 255, 255, 0.1);
      --pota-green: #10b981;
      --pota-green-hover: #059669;
      --pota-gold: #f59e0b;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
    }

    body {
      background-color: var(--bg-dark);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      margin: 0;
    }

    .ambient-glow {
      position: fixed;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 650px;
      height: 380px;
      background: radial-gradient(ellipse, rgba(16, 185, 129, 0.12) 0%, rgba(11, 15, 25, 0) 70%);
      pointer-events: none;
      z-index: 0;
    }

    .header-nav {
      background: rgba(11, 15, 25, 0.95);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--card-border);
      z-index: 1000;
    }
    .brand-link {
      color: #fff;
      font-weight: 800;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 1.15rem;
    }
    .brand-link:hover {
      color: var(--pota-green);
    }
    .brand-badge {
      font-size: 0.65rem;
      background: rgba(16, 185, 129, 0.2);
      color: var(--pota-green);
      border: 1px solid rgba(16, 185, 129, 0.4);
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
    }

    .glass-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      backdrop-filter: blur(16px);
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5);
    }

    .avatar-wrapper {
      width: 88px;
      height: 88px;
      border-radius: 50%;
      border: 3px solid var(--pota-green);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: rgba(16, 185, 129, 0.1);
      font-size: 40px;
      color: var(--pota-green);
      overflow: hidden;
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
    }
    .avatar-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .callsign-badge {
      font-family: "JetBrains Mono", Consolas, monospace;
      font-size: 2rem;
      font-weight: 800;
      letter-spacing: 1px;
      color: #fff;
    }

    .nav-tabs .nav-link {
      color: var(--text-muted);
      border: none;
      border-bottom: 2px solid transparent;
      padding: 12px 20px;
      font-weight: 600;
    }
    .nav-tabs .nav-link.active {
      color: var(--pota-green);
      background: transparent;
      border-bottom: 2px solid var(--pota-green);
    }

    .btn-touch {
      min-height: 48px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      border-radius: 12px;
      padding: 0 20px;
      gap: 8px;
    }

    .info-tile {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 14px;
      padding: 16px;
    }
  </style>
</head>
<body>
  <div class="ambient-glow"></div>

  <!-- Header -->
  <header class="header-nav py-2 px-3 sticky-top">
    <div class="container d-flex align-items-center justify-content-between">
      <div class="d-flex align-items-center gap-2">
        <a href="/" class="brand-link text-decoration-none" title="RU-POTA Главная">
          <div class="d-inline-flex align-items-center bg-white px-2 py-1 rounded-3 shadow-sm" style="line-height: 1;">
            <img src="/assets/pota-logo.png" alt="POTA" style="width: 20px; height: 20px; object-fit: contain; margin-right: 5px;" />
            <span style="color: #059669; font-weight: 900; font-size: 14px; letter-spacing: -0.3px;">RU POTA</span>
          </div>
        </a>
      </div>

      <div class="d-flex align-items-center gap-2">
        <a href="/" class="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1">
          <i class="bi bi-house"></i> Главная
        </a>
        <a href="/map" class="btn btn-sm btn-outline-secondary d-none d-sm-inline-flex align-items-center gap-1">
          <i class="bi bi-map"></i> Карта
        </a>
        <a href="https://pota.r9o.ru/app/" target="_blank" class="btn btn-sm btn-outline-success d-none d-md-inline-flex align-items-center gap-1.5" title="Запустить Telegram Mini App">
          <i class="bi bi-phone"></i> Mini App
        </a>
        <a href="/guide" class="btn btn-sm btn-outline-info d-none d-md-inline-flex align-items-center gap-1">
          <i class="bi bi-journal-text"></i> Гайд
        </a>
        <a href="/contacts" class="btn btn-sm btn-outline-secondary d-none d-md-inline-flex align-items-center gap-1" title="Контакты и координаторы">
          <i class="bi bi-info-circle"></i> Контакты
        </a>
        <a href="/donate" class="btn btn-sm btn-warning fw-semibold d-none d-md-inline-flex align-items-center gap-1.5 shadow-sm text-dark" title="Поддержать проект">
          <i class="bi bi-heart-fill text-danger"></i> Поддержать
        </a>
        ${isAdmin ? `<a href="/admin" class="btn btn-sm btn-primary d-inline-flex align-items-center gap-1" title="Панель координатора"><i class="bi bi-gear-fill"></i></a>` : ''}
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="container my-auto py-5 position-relative" style="z-index: 1; max-width: 820px;">
    
    ${errorMessage ? `
      <div class="alert alert-danger alert-dismissible fade show rounded-3 mb-4" role="alert">
        <i class="bi bi-exclamation-triangle-fill me-2"></i> ${errorMessage}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
    ` : ''}

    ${successMessage ? `
      <div class="alert alert-success alert-dismissible fade show rounded-3 mb-4" role="alert">
        <i class="bi bi-check-circle-fill me-2"></i> ${successMessage}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
    ` : ''}

    ${isAuthed ? `
      <!-- Authorized User Profile Card -->
      <div class="glass-card p-4 p-md-5 mb-4">
        <div class="d-flex flex-column flex-sm-row align-items-center gap-4 text-center text-sm-start pb-4 border-bottom border-secondary border-opacity-25">
          <div class="avatar-wrapper flex-shrink-0">
            ${userAvatar ? `<img src="${userAvatar}" class="avatar-img" alt="Avatar">` : `<i class="bi bi-person-fill"></i>`}
          </div>
          <div class="flex-grow-1">
            <div class="d-flex flex-wrap align-items-center justify-content-center justify-content-sm-start gap-2 mb-1">
              <span class="callsign-badge">${userCallsign || displayName}</span>
              ${status === 'approved' ? `
                <span class="badge bg-success bg-opacity-75 text-white px-2 py-1 rounded-pill small">
                  <i class="bi bi-check2-circle me-1"></i> Одобрен
                </span>
              ` : status === 'pending' ? `
                <span class="badge bg-warning text-dark px-2 py-1 rounded-pill small">
                  <i class="bi bi-hourglass-split me-1"></i> На модерации
                </span>
              ` : `
                <span class="badge bg-secondary px-2 py-1 rounded-pill small">
                  Гость
                </span>
              `}
            </div>

            <div class="text-secondary small">
              ${user?.first_name ? `<span>${user.first_name} ${user.last_name || ''}</span> • ` : ''}
              ${user?.username ? `<span class="text-info">@${user.username}</span> • ` : ''}
              <span>Telegram ID: <code>${tgId}</code></span>
            </div>
          </div>

          <div class="flex-shrink-0">
            <a href="/logout" class="btn btn-outline-danger btn-sm rounded-pill px-3 py-1.5" title="Завершить сеанс">
              <i class="bi bi-box-arrow-right me-1"></i> Выйти
            </a>
          </div>
        </div>

        <!-- Quick actions grid -->
        <div class="row g-3 my-3">
          <div class="col-12 col-md-4">
            <div class="info-tile text-center h-100 d-flex flex-column justify-content-between">
              <div>
                <div class="text-success fs-3 mb-1"><i class="bi bi-broadcast-pin"></i></div>
                <div class="fw-bold mb-1">Управление спотами</div>
                <div class="small text-muted mb-3">Отправка и редактирование своих спотов в кластер</div>
              </div>
              <a href="/app" class="btn btn-sm btn-outline-success rounded-pill w-100">Mini App</a>
            </div>
          </div>

          <div class="col-12 col-md-4">
            <div class="info-tile text-center h-100 d-flex flex-column justify-content-between">
              <div>
                <div class="text-info fs-3 mb-1"><i class="bi bi-map"></i></div>
                <div class="fw-bold mb-1">Карта и геолокация</div>
                <div class="small text-muted mb-3">Поиск ближайших ООПТ и определение района RDA</div>
              </div>
              <a href="/map" class="btn btn-sm btn-outline-info rounded-pill w-100">Открыть карту</a>
            </div>
          </div>

          <div class="col-12 col-md-4">
            <div class="info-tile text-center h-100 d-flex flex-column justify-content-between">
              <div>
                <div class="text-warning fs-3 mb-1"><i class="bi bi-chat-dots"></i></div>
                <div class="fw-bold mb-1">Telegram Бот</div>
                <div class="small text-muted mb-3">Алерты подписчиков, команды /onair и /plans</div>
              </div>
              <a href="https://t.me/${botUsername}" target="_blank" class="btn btn-sm btn-outline-warning rounded-pill w-100">В бот @${botUsername}</a>
            </div>
          </div>
        </div>

        <!-- Народная база отзывов (Community Notes) Preview -->
        <div class="mt-4 p-3 rounded-3 bg-dark border border-secondary border-opacity-25">
          <div class="d-flex align-items-center gap-2 mb-2">
            <span class="fs-4">🌲</span>
            <h5 class="mb-0 fw-bold text-white">«Народная база» парков RU-POTA</h5>
            <span class="badge bg-info text-dark rounded-pill ms-auto small">Этап 2</span>
          </div>
          <p class="text-secondary small mb-3">
            Как авторизованный радиолюбитель, вы можете оставлять практические путевые заметки для коллег по любой референции: качество подъездных дорог, места стоянки, уровень сотовой связи, наличие клещей и удобные деревья для диполей.
          </p>
          <div class="text-center py-2">
            <a href="/parks" class="btn btn-outline-light btn-sm rounded-pill px-4">
              <i class="bi bi-pencil-square me-1"></i> Перейти к реестру референций
            </a>
          </div>
        </div>

      </div>
    ` : `
      <!-- Guest Login Container -->
      <div class="glass-card p-4 p-md-5">
        <div class="text-center mb-4">
          <div class="fs-1 text-success mb-2">👤</div>
          <h2 class="h3 fw-bold text-white">Вход в Личный кабинет RU-POTA</h2>
          <p class="text-secondary small" style="max-width: 520px; margin: 0 auto;">
            Авторизуйтесь через Telegram для доступа к личному профилю радиолюбителя, отправке спотов, добавлению заметок в «Народную базу» и персонализированным алертам.
          </p>
        </div>

        <ul class="nav nav-tabs justify-content-center mb-4" id="loginTabs" role="tablist">
          <li class="nav-item" role="presentation">
            <button class="nav-link active" id="widget-tab" data-bs-toggle="tab" data-bs-target="#tab-widget" type="button" role="tab">
              <i class="bi bi-telegram me-1"></i> Telegram Login
            </button>
          </li>
          <li class="nav-item" role="presentation">
            <button class="nav-link" id="code-tab" data-bs-toggle="tab" data-bs-target="#tab-code" type="button" role="tab">
              <i class="bi bi-key me-1"></i> Вход по коду из бота
            </button>
          </li>
        </ul>

        <div class="tab-content" id="loginTabsContent">
          <!-- Tab 1: Official Telegram Widget -->
          <div class="tab-pane fade show active text-center py-3" id="tab-widget" role="tabpanel">
            <p class="text-muted small mb-4">
              Нажмите кнопку ниже для безопасной авторизации в один клик:
            </p>
            <div class="d-flex justify-content-center py-2">
              <script async src="https://telegram.org/js/telegram-widget.js?22" 
                data-telegram-login="${botUsername}" 
                data-size="large" 
                data-radius="12" 
                data-auth-url="/auth/telegram/callback" 
                data-request-access="write"></script>
            </div>
            <div class="small text-secondary mt-3">
              <i class="bi bi-shield-check text-success me-1"></i> Безопасный официальный протокол Telegram Web Login. Пароли не передаются.
            </div>
          </div>

          <!-- Tab 2: Fast 6-digit Code from Bot -->
          <div class="tab-pane fade text-start py-3" id="tab-code" role="tabpanel" style="max-width: 440px; margin: 0 auto;">
            <p class="text-secondary small mb-3">
              1. Откройте диалог с ботом <a href="https://t.me/${botUsername}" target="_blank" class="text-info fw-semibold">@${botUsername}</a>.<br>
              2. Отправьте команду <code>/login</code> для получения 6-значного кода.<br>
              3. Введите код в поле ниже:
            </p>

            <form action="/auth/code-login" method="POST">
              <div class="mb-3">
                <label class="form-label text-muted small fw-semibold">6-значный код авторизации</label>
                <input type="text" name="code" class="form-control form-control-lg text-center fw-bold" 
                  placeholder="123456" maxlength="6" pattern="[0-9]{6}" required autocomplete="off"
                  style="letter-spacing: 4px; font-size: 1.5rem; background: rgba(0,0,0,0.3); color: #fff; border-color: rgba(255,255,255,0.2);">
              </div>
              <button type="submit" class="btn btn-success btn-touch w-100">
                <i class="bi bi-box-arrow-in-right"></i> Войти в профиль
              </button>
            </form>
          </div>
        </div>

      </div>
    `}

  </main>

  <!-- Footer -->
  <footer class="py-3 text-center border-top border-secondary border-opacity-25" style="background: rgba(11, 15, 25, 0.8); z-index: 1;">
    <div class="container text-muted small">
      <div>RU-POTA Team • Parks on the Air Russia 🌲 73 & 44</div>
    </div>
  </footer>

  <!-- Bootstrap JS Bundle -->
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`;
}

/**
 * RU-POTA Web Hub Homepage (rupota.ru/)
 * Central modular portal for Russian Parks on the Air amateur radio community.
 */

export function renderHubHtml(options = {}) {
  const {
    user = null,
    isAuthed = false,
    isAdmin = false,
    stats = {
      potaParksCount: 1490,
      ooptCount: 11348,
      activeSpotsCount: 0,
      regionsCount: 89
    },
    botUsername = process.env.BOT_USERNAME || 'ru_pota_bot'
  } = options;

  const userCallsign = user?.callsign || '';
  const userAvatar = user?.avatar_url || '';
  const displayName = userCallsign || user?.first_name || 'Оператор';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
  <title>RU-POTA Хаб | Сообщество Parks on the Air Россия</title>
  <meta name="description" content="Официальный веб-портал программы Parks on the Air (RU-POTA) в России: интерактивная карта ООПТ, онлайн-споты, анонсы выездов, реестр парков и база радиолюбителей.">
  <link rel="icon" type="image/svg+xml" href="/app/favicon.svg">

  <!-- Bootstrap 5 & Icons -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">

  <style>
    :root {
      --bg-dark: #0b0f19;
      --bg-surface: rgba(19, 27, 46, 0.85);
      --border-color: rgba(255, 255, 255, 0.1);
      --pota-green: #10b981;
      --pota-green-hover: #059669;
      --pota-gold: #f59e0b;
      --pota-blue: #3b82f6;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
    }

    /* Outdoor Sunlight High-Contrast Mode */
    body.outdoor-mode {
      --bg-dark: #f8fafc;
      --bg-surface: #ffffff;
      --border-color: #cbd5e1;
      --text-main: #0f172a;
      --text-muted: #475569;
      background-color: var(--bg-dark) !important;
      color: var(--text-main) !important;
    }
    body.outdoor-mode .header-nav {
      background: rgba(255, 255, 255, 0.98) !important;
      border-bottom-color: #cbd5e1 !important;
    }
    body.outdoor-mode .brand-link {
      color: #0f172a !important;
    }
    body.outdoor-mode .brand-link:hover {
      color: var(--pota-green-hover) !important;
    }
    body.outdoor-mode .hub-card {
      background: #ffffff !important;
      border: 2px solid #cbd5e1 !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08) !important;
    }
    body.outdoor-mode .hub-card:hover {
      border-color: var(--pota-green-hover) !important;
      box-shadow: 0 10px 20px rgba(16, 185, 129, 0.2) !important;
    }
    body.outdoor-mode .hub-card-title {
      color: #0f172a !important;
    }
    body.outdoor-mode .hub-card-desc {
      color: #334155 !important;
    }
    body.outdoor-mode .stats-strip {
      background: #e2e8f0 !important;
      border-color: #cbd5e1 !important;
    }
    body.outdoor-mode .stat-item:not(:last-child)::after {
      background: #cbd5e1 !important;
    }
    body.outdoor-mode .stat-value {
      color: #0f172a !important;
    }
    body.outdoor-mode .glass-card {
      background: #ffffff !important;
      border-color: #cbd5e1 !important;
    }

    body {
      background-color: var(--bg-dark);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      margin: 0;
      transition: background-color 0.25s ease, color 0.25s ease;
    }

    /* Ambient background glowing accents */
    .ambient-glow {
      position: fixed;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 750px;
      height: 450px;
      background: radial-gradient(ellipse, rgba(16, 185, 129, 0.15) 0%, rgba(11, 15, 25, 0) 70%);
      pointer-events: none;
      z-index: 0;
    }

    /* Header Nav */
    .header-nav {
      background: rgba(11, 15, 25, 0.95);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-color);
      z-index: 1000;
    }
    .brand-link {
      color: #fff;
      font-weight: 800;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 1.25rem;
      letter-spacing: -0.3px;
    }
    .brand-link:hover {
      color: var(--pota-green);
    }
    .brand-badge {
      font-size: 0.65rem;
      background: rgba(16, 185, 129, 0.2);
      color: var(--pota-green);
      border: 1px solid rgba(16, 185, 129, 0.4);
      padding: 2px 7px;
      border-radius: 5px;
      font-weight: 800;
      letter-spacing: 0.8px;
    }

    /* Hero section */
    .hero-banner {
      position: relative;
      padding: 2.5rem 0 1.5rem 0;
      text-align: center;
    }
    .hero-title {
      font-size: clamp(1.8rem, 4vw, 2.75rem);
      font-weight: 900;
      letter-spacing: -0.5px;
      margin-bottom: 0.75rem;
      background: linear-gradient(135deg, #ffffff 40%, #10b981 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    body.outdoor-mode .hero-title {
      background: linear-gradient(135deg, #0f172a 40%, #059669 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .hero-subtitle {
      font-size: clamp(0.95rem, 1.8vw, 1.15rem);
      color: var(--text-muted);
      max-width: 680px;
      margin: 0 auto 1.5rem auto;
      line-height: 1.5;
    }

    /* Metrics Strip */
    .stats-strip {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border-color);
      border-radius: 18px;
      padding: 14px 24px;
      backdrop-filter: blur(10px);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
      max-width: 760px;
      margin: 0 auto 2.5rem auto;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    .stat-item {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      position: relative;
    }
    .stat-item:not(:last-child)::after {
      content: '';
      position: absolute;
      right: -6px;
      top: 15%;
      height: 70%;
      width: 1px;
      background: var(--border-color);
    }
    .stat-icon {
      font-size: 1.45rem;
      color: var(--pota-green);
      flex-shrink: 0;
    }
    .stat-value {
      font-weight: 800;
      font-size: 1.25rem;
      color: #fff;
      line-height: 1.1;
    }
    .stat-label {
      font-size: 0.72rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.4px;
      font-weight: 600;
      white-space: nowrap;
    }

    @media (max-width: 639px) {
      .stats-strip {
        padding: 12px 6px;
        gap: 6px;
        border-radius: 14px;
        margin-bottom: 2rem;
      }
      .stat-item {
        flex-direction: column;
        text-align: center;
        gap: 4px;
      }
      .stat-item:not(:last-child)::after {
        right: -3px;
        top: 20%;
        height: 60%;
      }
      .stat-icon {
        font-size: 1.25rem;
      }
      .stat-value {
        font-size: 1.05rem;
      }
      .stat-label {
        font-size: 0.65rem;
        letter-spacing: 0;
        white-space: normal;
        line-height: 1.2;
      }
    }

    /* Dashboard Grid */
    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(1, minmax(0, 1fr));
      gap: 18px;
      margin-bottom: 3.5rem;
    }
    @media (min-width: 640px) {
      .dashboard-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (min-width: 1024px) {
      .dashboard-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
    @media (min-width: 1280px) {
      .dashboard-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
    }

    /* Hub Card */
    .hub-card {
      background: var(--bg-surface);
      border: 1.5px solid var(--border-color);
      border-radius: 20px;
      padding: 22px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      text-decoration: none;
      color: inherit;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
      overflow: hidden;
      min-height: 190px;
    }
    .hub-card:hover {
      transform: translateY(-4px);
      border-color: var(--pota-green);
      box-shadow: 0 16px 32px -8px rgba(16, 185, 129, 0.25);
      color: inherit;
    }
    .hub-card:active {
      transform: scale(0.98);
    }

    /* Primary highlight card (Map) */
    .hub-card.primary-card {
      background: linear-gradient(145deg, rgba(16, 185, 129, 0.12) 0%, rgba(19, 27, 46, 0.9) 100%);
      border-color: rgba(16, 185, 129, 0.4);
    }
    .hub-card.primary-card:hover {
      border-color: var(--pota-green);
      box-shadow: 0 16px 36px -6px rgba(16, 185, 129, 0.35);
    }

    /* Muted card for sections in development */
    .hub-card.hub-card-muted {
      opacity: 0.6;
      border-color: rgba(255, 255, 255, 0.08);
      background: rgba(19, 27, 46, 0.4);
      cursor: default !important;
      pointer-events: none !important;
      user-select: none;
    }
    .hub-card.hub-card-muted:hover {
      transform: none !important;
      border-color: rgba(255, 255, 255, 0.08) !important;
      box-shadow: none !important;
      opacity: 0.6 !important;
    }

    /* Card Icon Bubble */
    .card-icon-box {
      width: 52px;
      height: 52px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      flex-shrink: 0;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .hub-card.primary-card .card-icon-box {
      background: rgba(16, 185, 129, 0.2);
      border-color: rgba(16, 185, 129, 0.4);
      color: var(--pota-green);
    }

    .hub-card-title {
      font-size: 1.15rem;
      font-weight: 800;
      margin-bottom: 6px;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .hub-card-desc {
      font-size: 0.88rem;
      color: var(--text-muted);
      line-height: 1.45;
      margin-bottom: 14px;
      flex-grow: 1;
    }

    .hub-card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      padding-top: 12px;
      margin-top: auto;
    }
    body.outdoor-mode .hub-card-footer {
      border-top-color: #e2e8f0;
    }
    .hub-card-action {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--pota-green);
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: gap 0.2s ease;
    }
    .hub-card:hover .hub-card-action {
      gap: 8px;
    }

    /* Badges */
    .badge-status {
      font-size: 0.7rem;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 6px;
      letter-spacing: 0.3px;
    }
    .badge-ready {
      background: rgba(16, 185, 129, 0.18);
      color: #10b981;
      border: 1px solid rgba(16, 185, 129, 0.35);
    }
    .badge-wip {
      background: rgba(245, 158, 11, 0.18);
      color: #f59e0b;
      border: 1px solid rgba(245, 158, 11, 0.35);
    }
    .badge-auth {
      background: rgba(59, 130, 246, 0.18);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.35);
    }

    /* Modal Styling */
    .modal-content {
      background: #0f172a;
      border: 1px solid var(--border-color);
      border-radius: 20px;
      color: #fff;
    }
    .modal-header {
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .modal-footer {
      border-top: 1px solid rgba(255,255,255,0.1);
    }

    /* Touch buttons */
    .btn-touch {
      min-height: 48px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      border-radius: 12px;
      padding: 0 18px;
      gap: 8px;
    }
  </style>
</head>
<body>
  <div class="ambient-glow"></div>

  <!-- Header -->
  <header class="header-nav py-2 px-3 sticky-top">
    <div class="container d-flex align-items-center justify-content-between">
      
      <!-- Brand Logo Left -->
      <div class="d-flex align-items-center gap-2">
        <a href="/" class="brand-link text-decoration-none" title="RU-POTA Главная">
          <div class="d-inline-flex align-items-center bg-white px-2 py-1 rounded-3 shadow-sm" style="line-height: 1;">
            <img src="/assets/pota-logo.png" alt="POTA" style="width: 20px; height: 20px; object-fit: contain; margin-right: 5px;" />
            <span style="color: #059669; font-weight: 900; font-size: 14px; letter-spacing: -0.3px;">RU POTA</span>
          </div>
        </a>
      </div>

      <!-- Actions Right -->
      <div class="d-flex align-items-center gap-2">
        
        <!-- Light / Dark Theme Toggle (Sun Icon Only) -->
        <button id="outdoorToggle" class="btn btn-sm btn-outline-secondary d-flex align-items-center justify-content-center px-2 py-1" title="Светлая / тёмная тема">
          <i class="bi bi-sun-fill text-warning"></i>
        </button>

        <!-- Quick Links (Desktop) -->
        <a href="/map" class="btn btn-sm btn-outline-success d-none d-md-inline-flex align-items-center gap-1">
          <i class="bi bi-map"></i> Карта
        </a>
        <a href="https://pota.r9o.ru/app/" target="_blank" class="btn btn-sm btn-outline-success d-none d-md-inline-flex align-items-center gap-1.5" title="Запустить Telegram Mini App">
          <i class="bi bi-phone"></i> Mini App
        </a>
        <a href="/guide" class="btn btn-sm btn-outline-info d-none d-lg-inline-flex align-items-center gap-1">
          <i class="bi bi-journal-text"></i> Гайд
        </a>
        <a href="/contacts" class="btn btn-sm btn-outline-secondary d-none d-md-inline-flex align-items-center gap-1" title="Контакты и координаторы">
          <i class="bi bi-info-circle"></i> Контакты
        </a>
        <a href="/donate" class="btn btn-sm btn-warning fw-semibold d-none d-md-inline-flex align-items-center gap-1.5 shadow-sm text-dark" title="Поддержать проект">
          <i class="bi bi-heart-fill text-danger"></i> Поддержать
        </a>

        <!-- Mobile Support Button -->
        <a href="/donate" class="btn btn-sm btn-warning fw-semibold d-inline-flex d-md-none align-items-center gap-1 shadow-sm text-dark py-1 px-2" style="font-size: 12px;" title="Поддержать проект">
          <i class="bi bi-heart-fill text-danger"></i>
          <span>Поддержать</span>
        </a>

        <!-- User Profile / Telegram Login -->
        ${isAuthed ? `
          <div class="dropdown">
            <button class="btn btn-sm btn-outline-success dropdown-toggle d-inline-flex align-items-center gap-2" type="button" data-bs-toggle="dropdown" aria-expanded="false">
              ${userAvatar ? `<img src="${userAvatar}" class="rounded-circle" width="22" height="22" alt="avatar">` : '<i class="bi bi-person-circle"></i>'}
              <span class="fw-bold">${displayName}</span>
            </button>
            <ul class="dropdown-menu dropdown-menu-end dropdown-menu-dark shadow">
              <li><h6 class="dropdown-header text-muted">Оператор RU-POTA</h6></li>
              <li><a class="dropdown-item" href="/me"><i class="bi bi-person-badge me-2"></i>Личный кабинет</a></li>
              <li><a class="dropdown-item" href="https://pota.r9o.ru/app/" target="_blank"><i class="bi bi-phone me-2"></i>Mini App</a></li>
              <li><a class="dropdown-item" href="/contacts"><i class="bi bi-info-circle me-2"></i>Контакты</a></li>
              ${isAdmin ? `
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item text-primary" href="/admin"><i class="bi bi-gear-fill me-2"></i>Панель координатора</a></li>
              ` : ''}
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item text-danger" href="/logout"><i class="bi bi-box-arrow-right me-2"></i>Выйти</a></li>
            </ul>
          </div>

          ${isAdmin ? `
            <a href="/admin" class="btn btn-sm btn-primary d-none d-sm-inline-flex align-items-center gap-1" title="Панель управления координатора">
              <i class="bi bi-gear-fill"></i>
            </a>
          ` : ''}
        ` : `
          <button type="button" class="btn btn-sm btn-success d-inline-flex align-items-center gap-1.5 fw-semibold shadow-sm" data-bs-toggle="modal" data-bs-target="#loginModal">
            <i class="bi bi-box-arrow-in-right"></i>
            <span>Войти</span>
          </button>
        `}

      </div>

    </div>
  </header>

  <!-- Hero Section -->
  <section class="hero-banner container position-relative" style="z-index: 1;">
    <h1 class="hero-title">Портал-хаб RU-POTA</h1>
    <p class="hero-subtitle">
      Единый информационный центр радиолюбительской программы <b>Parks on the Air</b> в России: интерактивная карта заповедников, мониторинг спотов, анонсы экспедиций и база знаний.
    </p>

    <!-- Metrics Strip -->
    <div class="stats-strip">
      <div class="stat-item">
        <i class="bi bi-tree stat-icon"></i>
        <div>
          <div class="stat-value">${stats.potaParksCount.toLocaleString('ru-RU')}</div>
          <div class="stat-label">Парков RU-POTA</div>
        </div>
      </div>

      <div class="stat-item">
        <i class="bi bi-shield-shaded stat-icon"></i>
        <div>
          <div class="stat-value">${stats.ooptCount.toLocaleString('ru-RU')}</div>
          <div class="stat-label">ООПТ в реестре</div>
        </div>
      </div>

      <div class="stat-item">
        <i class="bi bi-geo-alt stat-icon"></i>
        <div>
          <div class="stat-value">${stats.regionsCount}</div>
          <div class="stat-label">Субъектов РФ</div>
        </div>
      </div>
    </div>
  </section>

  <!-- Dashboard Grid (8 Sections, Mobile-First) -->
  <main class="container position-relative" style="z-index: 1;">
    <div class="dashboard-grid">

      <!-- 1. Карта ООПТ (100% Ready) -->
      <a href="/map" class="hub-card primary-card">
        <div>
          <div class="d-flex align-items-center justify-content-between mb-3">
            <div class="card-icon-box text-success">
              <i class="bi bi-map-fill"></i>
            </div>
            <span class="badge-status badge-ready">
              <i class="bi bi-check-circle-fill me-1"></i> ГОТОВО
            </span>
          </div>
          <div class="hub-card-title">
            <span>🗺️ Карта ООПТ</span>
          </div>
          <div class="hub-card-desc">
            Интерактивная карта с официальными границами заповедников, районами RDA, слоями 2ГИС/OSM/Спутник и полевой геолокацией.
          </div>
        </div>
        <div class="hub-card-footer">
          <span class="small text-muted">11 348 территорий</span>
          <span class="hub-card-action">Открыть карту <i class="bi bi-arrow-right"></i></span>
        </div>
      </a>

      <!-- 2. Споты онлайн (100% Ready in Mini App) -->
      <a href="https://pota.r9o.ru/app/?tab=cluster" target="_blank" class="hub-card" title="Открыть кластер спотов в Telegram Mini App">
        <div>
          <div class="d-flex align-items-center justify-content-between mb-3">
            <div class="card-icon-box text-success">
              <i class="bi bi-broadcast-pin"></i>
            </div>
            <span class="badge-status badge-ready">
              <i class="bi bi-broadcast me-1"></i> MINI APP
            </span>
          </div>
          <div class="hub-card-title">
            <span>📻 Споты онлайн</span>
          </div>
          <div class="hub-card-desc">
            Кто прямо сейчас в эфире: живой кластер RU/KZ/BY и мира с фильтрами по диапазонам, привязкой к районам RDA и WebSDR.
          </div>
        </div>
        <div class="hub-card-footer">
          <span class="small text-muted">Кластер POTA</span>
          <span class="hub-card-action">Смотреть споты <i class="bi bi-box-arrow-up-right"></i></span>
        </div>
      </a>

      <!-- 3. Анонсы активаций (В разработке) -->
      <div class="hub-card hub-card-muted">
        <div>
          <div class="d-flex align-items-center justify-content-between mb-3">
            <div class="card-icon-box text-secondary">
              <i class="bi bi-calendar-event"></i>
            </div>
            <span class="badge-status badge-secondary text-secondary" style="background: rgba(148, 163, 184, 0.12); border: 1px solid rgba(148, 163, 184, 0.25);">
              <i class="bi bi-lock-fill me-1"></i> СКОРО
            </span>
          </div>
          <div class="hub-card-title text-secondary">
            <span>📅 Анонсы выездов</span>
          </div>
          <div class="hub-card-desc text-muted">
            Календарь запланированных полевых выходов операторов RU-POTA с возможностью заявить свой выезд.
          </div>
        </div>
        <div class="hub-card-footer text-muted">
          <span class="small text-secondary">В разработке</span>
          <span class="small text-muted"><i class="bi bi-hourglass-split me-1"></i>Раздел закрыт</span>
        </div>
      </div>

      <!-- 4. Список парков (В разработке) -->
      <div class="hub-card hub-card-muted">
        <div>
          <div class="d-flex align-items-center justify-content-between mb-3">
            <div class="card-icon-box text-secondary">
              <i class="bi bi-card-list"></i>
            </div>
            <span class="badge-status badge-secondary text-secondary" style="background: rgba(148, 163, 184, 0.12); border: 1px solid rgba(148, 163, 184, 0.25);">
              <i class="bi bi-lock-fill me-1"></i> СКОРО
            </span>
          </div>
          <div class="hub-card-title text-secondary">
            <span>📋 Список парков</span>
          </div>
          <div class="hub-card-desc text-muted">
            Полный каталог всех 8 766 парков RU-POTA с фильтрами по регионам, статусам активаций и заметкам о дорогах.
          </div>
        </div>
        <div class="hub-card-footer text-muted">
          <span class="small text-secondary">В разработке</span>
          <span class="small text-muted"><i class="bi bi-hourglass-split me-1"></i>Раздел закрыт</span>
        </div>
      </div>

      <!-- 5. Инструкции и регламент (100% Ready) -->
      <a href="/guide" class="hub-card">
        <div>
          <div class="d-flex align-items-center justify-content-between mb-3">
            <div class="card-icon-box text-info">
              <i class="bi bi-journal-bookmark-fill"></i>
            </div>
            <span class="badge-status badge-ready">
              <i class="bi bi-check-circle-fill me-1"></i> ГОТОВО
            </span>
          </div>
          <div class="hub-card-title">
            <span>📖 Гайд и регламент</span>
          </div>
          <div class="hub-card-desc">
            Официальные правила дипломной программы POTA, памятка участника, советы по полевым антеннам, питанию и работе в эфире.
          </div>
        </div>
        <div class="hub-card-footer">
          <span class="small text-muted">PDF и HTML памятка</span>
          <span class="hub-card-action">Читать гайд <i class="bi bi-arrow-right"></i></span>
        </div>
      </a>

      <!-- 6. Чат сообщества (100% Ready) -->
      <a href="/chat" target="_blank" class="hub-card">
        <div>
          <div class="d-flex align-items-center justify-content-between mb-3">
            <div class="card-icon-box text-primary">
              <i class="bi bi-chat-dots-fill"></i>
            </div>
            <span class="badge-status badge-ready">
              <i class="bi bi-telegram me-1"></i> TELEGRAM
            </span>
          </div>
          <div class="hub-card-title">
            <span>💬 Чат сообщества</span>
          </div>
          <div class="hub-card-desc">
            Живое общение активаторов и охотников в Telegram: оперативная координация выездов, взаимопомощь, обмен опытом и фото из полей.
          </div>
        </div>
        <div class="hub-card-footer">
          <span class="small text-muted">@POTA_RU</span>
          <span class="hub-card-action">Перейти в чат <i class="bi bi-box-arrow-up-right"></i></span>
        </div>
      </a>

      <!-- 7. Личный кабинет (В разработке) -->
      <a href="#" class="hub-card hub-card-muted" data-bs-toggle="modal" data-bs-target="#loginModal" style="cursor: pointer; pointer-events: auto !important;" title="Личный кабинет в разработке">
        <div>
          <div class="d-flex align-items-center justify-content-between mb-3">
            <div class="card-icon-box text-secondary">
              <i class="bi bi-person-badge"></i>
            </div>
            <span class="badge-status badge-secondary text-secondary" style="background: rgba(148, 163, 184, 0.12); border: 1px solid rgba(148, 163, 184, 0.25);">
              <i class="bi bi-hourglass me-1"></i> В РАЗРАБОТКЕ
            </span>
          </div>
          <div class="hub-card-title text-secondary">
            <span>👤 Личный кабинет</span>
          </div>
          <div class="hub-card-desc text-muted">
            Профиль оператора, привязка позывного к Telegram и QRZ.ru, личная статистика активаций и охоты за парками RU-POTA.
          </div>
        </div>
        <div class="hub-card-footer text-muted">
          <span class="small text-secondary">Скоро</span>
          <span class="hub-card-action text-secondary">Подробнее <i class="bi bi-arrow-right"></i></span>
        </div>
      </a>

    </div>
  </main>

  <!-- Login Modal (Личный кабинет в разработке) -->
  <div class="modal fade" id="loginModal" tabindex="-1" aria-labelledby="loginModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" style="max-width: 440px;">
      <div class="modal-content shadow-lg text-center" style="background: #111827; border: 1.5px solid rgba(255, 255, 255, 0.12); color: #fff; border-radius: 20px;">
        <div class="modal-header border-secondary border-opacity-25 justify-content-end pb-0">
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Закрыть"></button>
        </div>
        <div class="modal-body p-4 pt-2">
          <div class="d-inline-flex align-items-center justify-content-center rounded-circle bg-success bg-opacity-10 text-success mb-3" style="width: 64px; height: 64px; font-size: 30px; border: 1px solid rgba(16, 185, 129, 0.25);">
            <i class="bi bi-person-gear"></i>
          </div>
          <h5 class="modal-title fw-bold mb-2">Личный кабинет в разработке</h5>
          <p class="text-secondary small mb-3 leading-relaxed">
            Раздел авторизации и личный кабинет оператора RU-POTA сейчас активно дорабатываются. Скоро здесь появится привязка позывного, статистика связей и управление спотами.
          </p>
          <div class="alert alert-dark text-start border-secondary border-opacity-25 small mb-4 py-2 px-3" style="background: rgba(255, 255, 255, 0.04);">
            <i class="bi bi-info-circle text-info me-1.5"></i>
            Все основные сервисы — <b>Интерактивная карта</b>, <b>Кластер спотов в Mini App</b> и <b>Гайд</b> — работают и доступны без входа!
          </div>
          <div class="d-grid gap-2">
            <a href="https://pota.r9o.ru/app/" target="_blank" class="btn btn-success btn-touch fw-semibold">
              <i class="bi bi-phone me-1.5"></i> Открыть Telegram Mini App
            </a>
            <button type="button" class="btn btn-outline-secondary btn-touch" data-bs-dismiss="modal">
              Понятно
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <footer class="py-4 text-center border-top border-secondary border-opacity-25 mt-auto" style="background: rgba(11, 15, 25, 0.95); z-index: 1;">
    <div class="container text-muted small">
      <div class="d-flex flex-wrap justify-content-center gap-3 mb-2">
        <a href="/map" class="text-muted text-decoration-none hover-white">Карта ООПТ</a>
        <span>•</span>
        <a href="/guide" class="text-muted text-decoration-none hover-white">Гайд POTA</a>
        <span>•</span>
        <a href="https://pota.app" target="_blank" class="text-muted text-decoration-none hover-white">pota.app ↗</a>
        <span>•</span>
        <a href="https://r9o.ru/library" target="_blank" class="text-muted text-decoration-none hover-white" title="Радиолюбительские статьи, схемы и книги">Библиотека R9O ↗</a>
        <span>•</span>
        <a href="/contacts" class="text-muted text-decoration-none hover-white">Контакты</a>
      </div>
      <div>
        RU-POTA Team • Parks on the Air Russia 🌲 73 & 44
      </div>
    </div>
  </footer>

  <!-- Bootstrap JS Bundle -->
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>

  <!-- Outdoor Mode Script -->
  <script>
    (function() {
      const toggleBtn = document.getElementById('outdoorToggle');
      if (!toggleBtn) return;

      const isOutdoor = localStorage.getItem('rupota_outdoor_mode') === 'true';
      if (isOutdoor) {
        document.body.classList.add('outdoor-mode');
        updateBtn(true);
      }

      toggleBtn.addEventListener('click', function() {
        const active = document.body.classList.toggle('outdoor-mode');
        localStorage.setItem('rupota_outdoor_mode', active);
        updateBtn(active);
      });

      function updateBtn(active) {
        if (active) {
          toggleBtn.classList.remove('btn-outline-secondary');
          toggleBtn.classList.add('btn-warning');
          toggleBtn.title = 'Включить тёмную тему';
        } else {
          toggleBtn.classList.remove('btn-warning');
          toggleBtn.classList.add('btn-outline-secondary');
          toggleBtn.title = 'Включить светлую тему';
        }
      }
    })();

    // Email Login Modal Handler
    (function() {
      const emailInput = document.getElementById('modalEmailInput');
      const callsignInput = document.getElementById('modalCallsignInput');
      const sendBtn = document.getElementById('modalSendCodeBtn');
      const errBox = document.getElementById('modalEmailError');
      const step1 = document.getElementById('emailStep1');
      const step2 = document.getElementById('emailStep2');
      const sentEmailLabel = document.getElementById('modalSentEmailLabel');
      const verifyInput = document.getElementById('modalVerifyCodeInput');
      const verifyBtn = document.getElementById('modalVerifyCodeBtn');
      const verifyErrBox = document.getElementById('modalVerifyError');
      const backBtn = document.getElementById('modalBackToStep1');

      if (!sendBtn || !verifyBtn) return;

      let currentEmail = '';
      let currentCallsign = '';

      sendBtn.addEventListener('click', async function() {
        const email = (emailInput.value || '').trim();
        const callsign = (callsignInput.value || '').trim().toUpperCase();

        errBox.classList.add('d-none');
        errBox.textContent = '';

        if (!email || !callsign) {
          errBox.textContent = 'Пожалуйста, заполните email и позывной';
          errBox.classList.remove('d-none');
          return;
        }

        sendBtn.disabled = true;
        sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Отправка кода...';

        try {
          const res = await fetch('/auth/email/send-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, callsign })
          });
          const data = await res.json();

          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Ошибка отправки проверочного кода');
          }

          currentEmail = email;
          currentCallsign = callsign;
          sentEmailLabel.textContent = email;
          step1.classList.add('d-none');
          step2.classList.remove('d-none');
          verifyInput.focus();
        } catch (err) {
          errBox.textContent = err.message;
          errBox.classList.remove('d-none');
        } finally {
          sendBtn.disabled = false;
          sendBtn.innerHTML = '<i class="bi bi-send me-1"></i> Получить код на почту';
        }
      });

      verifyBtn.addEventListener('click', async function() {
        const code = (verifyInput.value || '').trim();
        verifyErrBox.classList.add('d-none');
        verifyErrBox.textContent = '';

        if (!code || code.length !== 6) {
          verifyErrBox.textContent = 'Введите 6-значный проверочный код из письма';
          verifyErrBox.classList.remove('d-none');
          return;
        }

        verifyBtn.disabled = true;
        verifyBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Проверка...';

        try {
          const res = await fetch('/auth/email/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: currentEmail, code, callsign: currentCallsign })
          });
          const data = await res.json();

          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Неверный или истекший проверочный код');
          }

          if (data.token) {
            try { localStorage.setItem('rupota_web_token', data.token); } catch(e){}
          }
          window.location.href = data.redirect || '/me';
        } catch (err) {
          verifyErrBox.textContent = err.message;
          verifyErrBox.classList.remove('d-none');
        } finally {
          verifyBtn.disabled = false;
          verifyBtn.innerHTML = '<i class="bi bi-box-arrow-in-right me-1"></i> Войти в личный кабинет';
        }
      });

      backBtn.addEventListener('click', function() {
        step2.classList.add('d-none');
        step1.classList.remove('d-none');
      });
    })();
  </script>
</body>
</html>`;
}

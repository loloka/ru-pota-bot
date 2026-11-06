/**
 * RU-POTA Donate & Project Support Page
 * URL: /donate
 */

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatRoleBadge(role) {
  switch (role) {
    case 'hunter':
      return '<span class="badge bg-info bg-opacity-10 text-info border border-info border-opacity-25 px-2 py-1"><i class="bi bi-headphones"></i> Охотник</span>';
    case 'friend':
      return '<span class="badge bg-purple bg-opacity-10 text-purple border border-purple border-opacity-25 px-2 py-1" style="color: #c084fc; border-color: rgba(192, 132, 252, 0.3);"><i class="bi bi-heart"></i> Друг сообщества</span>';
    case 'activator':
    default:
      return '<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2 py-1"><i class="bi bi-broadcast-pin"></i> Активатор</span>';
  }
}

export function renderDonateHtml(options = {}) {
  const isAuthed = Boolean(options.isAuthed);
  const approvedDonations = Array.isArray(options.approvedDonations) ? options.approvedDonations : [];

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Поддержать проект RU-POTA ☕📡 | Parks on the Air Russia</title>
  <meta name="description" content="Добровольная поддержка сервера, картографического кластера и развития экосистемы RU-POTA.">
  <link rel="icon" type="image/svg+xml" href="/app/favicon.svg">

  <!-- Bootstrap 5 & Icons -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
  <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"></script>

  <style>
    :root {
      --bg-dark: #090d16;
      --card-bg: rgba(17, 24, 39, 0.75);
      --card-border: rgba(255, 255, 255, 0.1);
      --accent-emerald: #10b981;
      --accent-amber: #f59e0b;
      --accent-cyan: #06b6d4;
    }

    body {
      background-color: var(--bg-dark);
      background-image: 
        radial-gradient(at 0% 0%, rgba(16, 185, 129, 0.08) 0px, transparent 50%),
        radial-gradient(at 100% 0%, rgba(245, 158, 11, 0.06) 0px, transparent 50%),
        radial-gradient(at 50% 100%, rgba(6, 182, 212, 0.05) 0px, transparent 50%);
      background-attachment: fixed;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* High contrast text helpers for dark mode */
    .text-secondary, .text-muted {
      color: #94a3b8 !important;
    }
    .text-secondary-light {
      color: #cbd5e1 !important;
    }

    .header-nav {
      background: rgba(9, 13, 22, 0.88);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--card-border);
    }
    .brand-link {
      color: #fff;
      font-weight: 800;
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .brand-link:hover {
      color: var(--accent-emerald);
    }

    .glass-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      backdrop-filter: blur(14px);
      box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
    }

    /* Goal Cards */
    .goal-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1.5px solid var(--card-border);
      border-radius: 14px;
      padding: 18px;
      cursor: pointer;
      transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      user-select: none;
      position: relative;
    }
    .goal-card:hover {
      border-color: rgba(245, 158, 11, 0.6);
      transform: translateY(-3px);
      background: rgba(245, 158, 11, 0.04);
      box-shadow: 0 12px 24px -6px rgba(245, 158, 11, 0.18);
    }
    .goal-card.active {
      border-color: var(--accent-emerald);
      background: rgba(16, 185, 129, 0.09);
      box-shadow: 0 0 0 2px var(--accent-emerald), 0 12px 28px -6px rgba(16, 185, 129, 0.35);
    }
    .goal-card .selected-check {
      display: none;
      position: absolute;
      top: 14px;
      right: 14px;
      color: var(--accent-emerald);
      font-size: 1.2rem;
    }
    .goal-card.active .selected-check {
      display: block;
    }

    /* Distinct Goal Badges with Guaranteed Contrast */
    .goal-badge {
      font-size: 11.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 4px 10px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      margin-bottom: 10px;
    }
    .badge-storage {
      color: #f59e0b;
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.4);
    }
    .badge-domain {
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.4);
    }
    .badge-channel {
      color: #34d399;
      background: rgba(52, 211, 153, 0.15);
      border: 1px solid rgba(52, 211, 153, 0.4);
    }
    .badge-dev {
      color: #fb923c;
      background: rgba(251, 146, 60, 0.15);
      border: 1px solid rgba(251, 146, 60, 0.4);
    }
    .badge-coffee {
      color: #c084fc;
      background: rgba(192, 132, 252, 0.15);
      border: 1px solid rgba(192, 132, 252, 0.4);
    }
    .badge-custom {
      color: #818cf8;
      background: rgba(129, 140, 248, 0.15);
      border: 1px solid rgba(129, 140, 248, 0.4);
    }

    /* SBP Payment Box */
    .sbp-container {
      background: linear-gradient(145deg, rgba(30, 41, 59, 0.75), rgba(15, 23, 42, 0.9));
      border: 1.5px solid rgba(245, 158, 11, 0.35);
      border-radius: 20px;
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.7);
      overflow: hidden;
    }
    .sbp-tabs .nav-link {
      color: #cbd5e1;
      border: none;
      font-weight: 600;
      padding: 10px 18px;
      border-radius: 10px;
      transition: all 0.2s ease;
      cursor: pointer;
    }
    .sbp-tabs .nav-link:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.08);
    }
    .sbp-tabs .nav-link.active {
      color: #0b0f19 !important;
      background: #f59e0b !important;
      font-weight: 700;
      box-shadow: 0 4px 14px rgba(245, 158, 11, 0.4);
    }

    .phone-spoiler-box {
      background: rgba(11, 15, 25, 0.7);
      border: 1.5px dashed rgba(245, 158, 11, 0.5);
      border-radius: 14px;
      padding: 16px 20px;
      display: inline-flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .tip-callout {
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.35);
      border-radius: 12px;
      padding: 12px 16px;
    }

    .qr-frame {
      background: #fff;
      padding: 12px;
      border-radius: 14px;
      display: inline-block;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    }
    .qr-img {
      width: 190px;
      height: 190px;
      display: block;
      object-fit: contain;
    }

    .value-pill {
      background: rgba(255, 255, 255, 0.035);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 12px 14px;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 13.5px;
      height: 100%;
      color: #cbd5e1;
    }
    .value-pill strong {
      color: #ffffff;
    }
    .value-pill i {
      font-size: 1.15rem;
      margin-top: 1px;
    }

    /* Wall of Supporters */
    .wall-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 14px 16px;
      transition: all 0.2s ease;
    }
    .wall-card:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.15);
      transform: translateY(-2px);
    }
    .wall-badge {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
      font-size: 11px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 8px;
    }
    .donor-amount-badge {
      background: rgba(245, 158, 11, 0.15) !important;
      color: #fbbf24 !important;
      border: 1.5px solid rgba(245, 158, 11, 0.45) !important;
      font-size: 13px;
      font-weight: 800;
      padding: 3px 10px;
      border-radius: 8px;
      letter-spacing: 0.3px;
      white-space: nowrap;
    }

    .form-label {
      color: #f1f5f9 !important;
      font-weight: 600;
      margin-bottom: 6px;
    }
    .form-control, .form-select {
      background-color: rgba(15, 23, 42, 0.9) !important;
      border: 1.5px solid rgba(255, 255, 255, 0.18) !important;
      color: #ffffff !important;
      border-radius: 10px;
    }
    .form-control:focus, .form-select:focus {
      background-color: rgba(15, 23, 42, 0.98) !important;
      border-color: var(--accent-emerald) !important;
      color: #fff !important;
      box-shadow: 0 0 0 0.25rem rgba(16, 185, 129, 0.25) !important;
    }
    .form-control::placeholder, textarea::placeholder {
      color: #64748b !important;
      opacity: 1 !important;
    }
    .form-text {
      color: #cbd5e1 !important;
    }
    .role-btn-group .btn-check:checked + .btn {
      background-color: var(--accent-emerald);
      border-color: var(--accent-emerald);
      color: #0b0f19;
      font-weight: 700;
    }

    /* Pulse animation */
    @keyframes subtle-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.85; transform: scale(0.99); }
    }
    .pulse-target {
      animation: subtle-pulse 3s infinite ease-in-out;
    }
  </style>
</head>
<body>

  <!-- Header -->
  <header class="header-nav py-2 px-3 sticky-top">
    <div class="container d-flex align-items-center justify-content-between">
      <div class="d-flex align-items-center gap-3">
        <a href="/" class="brand-link fs-5">
          <span>🌲</span>
          <span>RU-POTA</span>
        </a>
        <a href="/" class="btn btn-sm btn-outline-secondary d-none d-md-inline-flex align-items-center gap-1">
          <i class="bi bi-map"></i> Карта RU-POTA
        </a>
        <a href="/guide" class="btn btn-sm btn-outline-info d-none d-md-inline-flex align-items-center gap-1">
          <i class="bi bi-journal-text"></i> Гайд
        </a>
        <a href="https://pota.r9o.ru/app/" class="btn btn-sm btn-outline-success d-none d-md-inline-flex align-items-center gap-1">
          <i class="bi bi-phone"></i> Mini App
        </a>
        <a href="/contacts" class="btn btn-sm btn-outline-secondary d-none d-md-inline-flex align-items-center gap-1">
          <i class="bi bi-info-circle"></i> Контакты
        </a>
      </div>

      <div class="d-flex align-items-center gap-2">
        ${isAuthed ? `
          <a href="/admin" class="btn btn-sm btn-primary">
            <i class="bi bi-speedometer2"></i> Админ-панель
          </a>
        ` : `
          <a href="/login" class="btn btn-sm btn-outline-light" title="Вход для региональных координаторов">
            <i class="bi bi-lock"></i> Координаторам
          </a>
        `}
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="container my-4 my-md-5 flex-grow-1" style="max-width: 960px;">
    
    <!-- Title Section -->
    <div class="text-center mb-4 mb-md-5">
      <div class="d-inline-flex align-items-center gap-2 px-3 py-1 rounded-pill bg-warning bg-opacity-10 border border-warning border-opacity-25 text-warning small fw-bold mb-2">
        <i class="bi bi-heart-fill"></i> СООБЩЕСТВО ДЛЯ СООБЩЕСТВА
      </div>
      <h1 class="fw-bold tracking-tight mb-3">Поддержка проекта RU-POTA</h1>
      <p class="text-secondary-light fs-6 mx-auto lh-base" style="max-width: 740px;">
        RU-POTA Hub развивается как открытый независимый проект радиолюбителей. Серверная инфраструктура поддерживается и оплачивается нами самостоятельно из своего кармана. Но проекту нужны ресурсы для расширения: выделенный диск под векторные границы, отдельный домен и канал связи с кластером POTA.
      </p>
    </div>

    <!-- Value Highlights Grid -->
    <div class="row g-2 g-md-3 mb-5">
      <div class="col-6 col-md-3">
        <div class="value-pill">
          <i class="bi bi-lightning-charge-fill text-warning"></i>
          <div><strong>Мгновенный споттинг:</strong> пуши в Telegram за 3 сек в эфире</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="value-pill">
          <i class="bi bi-geo-alt-fill text-success"></i>
          <div><strong>Большая карта:</strong> 7 900+ парков POTA и все районы RDA</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="value-pill">
          <i class="bi bi-phone-fill text-info"></i>
          <div><strong>Telegram Mini App:</strong> споты и QRT прямо с телефона в поле</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="value-pill">
          <i class="bi bi-shield-check text-purple" style="color: #c084fc;"></i>
          <div><strong>Антиспам-щит:</strong> защита наших чатов от ботов и спамеров</div>
        </div>
      </div>
    </div>

    <!-- SBP Interactive Box -->
    <div class="sbp-container p-4 p-md-5 mb-5 shadow-lg">
      <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-4">
        <div>
          <span class="badge bg-warning text-dark fw-bold mb-1">СБП · БЫСТРЫЙ ПЕРЕВОД БЕЗ КОМИССИИ</span>
          <h3 class="fw-bold text-light mb-0">Выберите удобный способ перевода</h3>
        </div>
        
        <!-- Tabs Switcher -->
        <div class="d-flex bg-dark bg-opacity-60 p-1 rounded-3 sbp-tabs border border-secondary border-opacity-25" role="tablist">
          <button class="nav-link active" id="tab-phone-btn" type="button" role="tab" onclick="switchSbpTab('phone')">
            <i class="bi bi-phone me-1"></i> По номеру СБП
          </button>
          <button class="nav-link" id="tab-qr-btn" type="button" role="tab" onclick="switchSbpTab('qr')">
            <i class="bi bi-qr-code me-1"></i> По QR-коду
          </button>
        </div>
      </div>

      <div class="tab-content">
        <!-- Tab 1: By Phone Number (Under anti-crawler spoiler) -->
        <div class="tab-pane fade show active" id="tab-phone" role="tabpanel">
          <div class="row align-items-center g-4">
            <div class="col-lg-8">
              <p class="text-secondary-light mb-3">
                Перевод по номеру телефона через Систему Быстрых Платежей (СБП) без комиссии из любого банка РФ:
              </p>
              
              <div class="phone-spoiler-box mb-3">
                <div>
                  <div class="text-secondary small mb-1">Номер телефона получателя (СБП):</div>
                  <div id="phoneDisplay" class="font-monospace fw-bold fs-4 text-warning tracking-wider">
                    +7 903 •••-••-••
                  </div>
                </div>

                <button type="button" class="btn btn-warning fw-bold px-3 py-2 shadow-sm d-flex align-items-center gap-2" id="revealPhoneBtn" onclick="revealAndCopyPhone()">
                  <i class="bi bi-eye-fill"></i>
                  <span>Показать и скопировать</span>
                </button>
              </div>

              <div class="text-secondary-light mb-2 small">
                🏦 <strong>Банки получателя:</strong> <strong>Сбербанк</strong> или <strong>Ozon Банк</strong><br>
                👤 <strong>Получатель:</strong> Александр С. (позывной: <strong>R9OGL</strong>)
              </div>

              <!-- High Contrast Tip Callout -->
              <div class="tip-callout mt-3">
                <div class="d-flex align-items-start gap-2">
                  <span class="fs-5 text-warning lh-1">💡</span>
                  <div style="color: #f1f5f9; font-size: 13.5px; line-height: 1.5;">
                    При переводе в графе <strong>«Сообщение получателю»</strong> вы можете указать свой <strong>позывной</strong> — мы внесём вас на Стену спонсоров!
                  </div>
                </div>
              </div>
            </div>

            <div class="col-lg-4 text-center d-none d-lg-block">
              <div class="p-4 rounded-4 bg-dark bg-opacity-50 border border-secondary border-opacity-25 text-center">
                <i class="bi bi-phone-vibrate text-warning fs-1 d-block mb-2"></i>
                <div class="fw-bold text-light mb-1">Любой мобильный банк</div>
                <div class="text-secondary-light small">Сбербанк Онлайн, Ozon Банк, ВТБ, Альфа и др.</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Tab 2: By QR Code / Link -->
        <div class="tab-pane fade" id="tab-qr" role="tabpanel">
          <div class="row align-items-center g-4">
            <div class="col-md-5 text-center">
              <div class="qr-frame">
                <img src="/assets/ozon_sbp_qr.png" alt="СБП QR Ozon Банк" class="qr-img">
              </div>
              <div class="text-secondary-light small mt-2">
                Отсканируйте камерой смартфона
              </div>
            </div>

            <div class="col-md-7">
              <h5 class="fw-bold text-light mb-2">Прямой платёж на Ozon Банк</h5>
              <p class="text-secondary-light small mb-3">
                Платёж зачисляется моментально через шлюз Ozon Банка на имя Александра С. (R9OGL).
              </p>
              <div class="d-flex flex-column gap-2 mb-3">
                <a href="https://finance.ozon.ru/apps/sbp/ozonbankpay/01a0c427-d792-7435-8819-ce9c84f7b78e" target="_blank" rel="noopener" class="btn btn-warning fw-bold py-2.5 d-flex align-items-center justify-content-center gap-2 shadow">
                  <i class="bi bi-qr-code-scan"></i> Открыть в приложении банка
                </a>
                <button type="button" class="btn btn-outline-light btn-sm" onclick="copySbpLink()">
                  <i class="bi bi-clipboard"></i> Скопировать ссылку на оплату
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Concrete Community Goals & Targets Section -->
    <div class="mb-5">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h4 class="fw-bold mb-0 d-flex align-items-center gap-2">
            <span>🎯</span> Текущие цели и ориентиры сообщества
          </h4>
          <span class="text-secondary-light small">Выберите карточку — сумма и назначение автоматически подставятся в форму</span>
        </div>
      </div>

      <div class="row g-3">
        <!-- Target 1: Memory & Boundaries Storage -->
        <div class="col-md-6 col-lg-4">
          <div class="goal-card active pulse-target" onclick="selectTier('+10 ГБ SSD под векторные границы ООПТ', 800, this)">
            <i class="bi bi-check-circle-fill selected-check"></i>
            <div>
              <span class="goal-badge badge-storage">
                <i class="bi bi-hdd-network"></i> Хранилище
              </span>
              <div class="fw-bold text-light mb-1 fs-6">+10 ГБ SSD под границы ООПТ</div>
              <div class="text-secondary-light small lh-sm">
                Дополнительный диск на год для локального хранения 11 000+ полигонов и кэша карты без зависимости от Минприроды.
              </div>
            </div>
            <div class="fw-bold text-warning fs-5 mt-3">800 ₽ <span class="small text-secondary-light fw-normal">/ год</span></div>
          </div>
        </div>

        <!-- Target 2: Dedicated RU-POTA Domain -->
        <div class="col-md-6 col-lg-4">
          <div class="goal-card" onclick="selectTier('Свой домен для проекта RU-POTA (1-й год + продление)', 120, this)">
            <i class="bi bi-check-circle-fill selected-check"></i>
            <div>
              <span class="goal-badge badge-domain">
                <i class="bi bi-globe2"></i> Домен
              </span>
              <div class="fw-bold text-light mb-1 fs-6">Свой домен для проекта</div>
              <div class="text-secondary-light small lh-sm">
                Регистрация отдельного имени для сайта, карты и Mini App. <strong>120 ₽</strong> на 1-й год (+1 200 ₽ продление на следующий год).
              </div>
            </div>
            <div class="fw-bold text-info fs-5 mt-3">120 ₽ <span class="small text-secondary-light fw-normal">(+1 200 ₽ след. год)</span></div>
          </div>
        </div>

        <!-- Target 3: Fast POTA & TG Proxy Line -->
        <div class="col-md-6 col-lg-4">
          <div class="goal-card" onclick="selectTier('Выделенный канал связи с кластером POTA и TG', 400, this)">
            <i class="bi bi-check-circle-fill selected-check"></i>
            <div>
              <span class="goal-badge badge-channel">
                <i class="bi bi-broadcast"></i> Канал связи
              </span>
              <div class="fw-bold text-light mb-1 fs-6">Канал с кластером POTA</div>
              <div class="text-secondary-light small lh-sm">
                Выделенный прокси-сервер для мгновенного обмена спотами с серверами POTA и надёжной доставки в Telegram.
              </div>
            </div>
            <div class="fw-bold text-success fs-5 mt-3">400 ₽ <span class="small text-secondary-light fw-normal">/ мес</span></div>
          </div>
        </div>

        <!-- Target 4: Development of New Features (Restored!) -->
        <div class="col-md-6 col-lg-4">
          <div class="goal-card" onclick="selectTier('Разработка новых функций для нашего сообщества', 1500, this)">
            <i class="bi bi-check-circle-fill selected-check"></i>
            <div>
              <span class="goal-badge badge-dev">
                <i class="bi bi-tools"></i> Разработка
              </span>
              <div class="fw-bold text-light mb-1 fs-6">Разработка новых функций</div>
              <div class="text-secondary-light small lh-sm">
                Разработка новых функций для нашего сообщества, улучшение Telegram Mini App и мобильных инструментов для активаторов.
              </div>
            </div>
            <div class="fw-bold fs-5 mt-3" style="color: #fb923c;">1 500 ₽ <span class="small text-secondary-light fw-normal">/ вклад</span></div>
          </div>
        </div>

        <!-- Target 5: Coffee / Dev Appreciation -->
        <div class="col-md-6 col-lg-4">
          <div class="goal-card" onclick="selectTier('Чашка кофе разработчику за ночной код', 150, this)">
            <i class="bi bi-check-circle-fill selected-check"></i>
            <div>
              <span class="goal-badge badge-coffee">
                <i class="bi bi-cup-hot"></i> Вдохновение
              </span>
              <div class="fw-bold text-light mb-1 fs-6">Чашка кофе разработчику</div>
              <div class="text-secondary-light small lh-sm">
                Бодрит программиста, ускоряет написание классных фишек и помогает дежурить днём и ночью, чтобы сервер никогда не падал!
              </div>
            </div>
            <div class="fw-bold text-warning fs-5 mt-3">150 ₽ <span class="small text-secondary-light fw-normal">/ респект</span></div>
          </div>
        </div>

        <!-- Target 6: Custom Amount / Warm Greeting -->
        <div class="col-md-6 col-lg-4">
          <div class="goal-card" onclick="selectTier('Своя сумма / Тёплый привет', 0, this)">
            <i class="bi bi-check-circle-fill selected-check"></i>
            <div>
              <span class="goal-badge badge-custom">
                <i class="bi bi-heart"></i> Поддержка
              </span>
              <div class="fw-bold text-light mb-1 fs-6">Своя сумма / Привет</div>
              <div class="text-secondary-light small lh-sm">
                Любая комфортная сумма или просто тёплые слова поддержки для всей команды и участников RU-POTA.
              </div>
            </div>
            <div class="fw-bold fs-5 mt-3" style="color: #a5b4fc;">Любая сумма</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Message & Recognition Form -->
    <div class="glass-card p-4 p-md-5 mb-5 shadow-sm" id="donate-form-section">
      <div class="d-flex align-items-center gap-2 mb-2">
        <span class="fs-4">✍️</span>
        <h4 class="fw-bold mb-0 text-light">Оставить след на Стене признания</h4>
      </div>
      <p class="text-secondary-light small mb-4">
        Сделали перевод или хотите передать привет сообществу? Заполните карточку ниже. После быстрой модерации ваше пожелание и позывной появятся на Стене спонсоров сообщества!
      </p>

      <form id="donationForm" onsubmit="submitDonation(event)">
        <input type="hidden" id="tierTitleInput" value="+10 ГБ SSD под векторные границы ООПТ">

        <div class="row g-3 mb-3">
          <!-- Callsign / Name -->
          <div class="col-md-6">
            <label for="donorName" class="form-label small fw-semibold">Позывной или имя <span class="text-danger">*</span></label>
            <input type="text" class="form-control" id="donorName" placeholder="Например: R9OGL или Александр" required maxlength="50">
          </div>

          <!-- Role in community -->
          <div class="col-md-6">
            <label class="form-label small fw-semibold">Ваша роль в POTA <span class="text-danger">*</span></label>
            <div class="btn-group w-100 role-btn-group" role="group">
              <input type="radio" class="btn-check" name="donorRole" id="roleActivator" value="activator" checked>
              <label class="btn btn-outline-secondary btn-sm d-flex align-items-center justify-content-center gap-1" for="roleActivator">
                <i class="bi bi-broadcast-pin"></i> Активатор
              </label>

              <input type="radio" class="btn-check" name="donorRole" id="roleHunter" value="hunter">
              <label class="btn btn-outline-secondary btn-sm d-flex align-items-center justify-content-center gap-1" for="roleHunter">
                <i class="bi bi-headphones"></i> Охотник
              </label>

              <input type="radio" class="btn-check" name="donorRole" id="roleFriend" value="friend">
              <label class="btn btn-outline-secondary btn-sm d-flex align-items-center justify-content-center gap-1" for="roleFriend">
                <i class="bi bi-heart"></i> Друг
              </label>
            </div>
          </div>
        </div>

        <div class="row g-3 mb-3">
          <!-- Tier Display & Custom Amount -->
          <div class="col-md-6">
            <label for="donorAmount" class="form-label small fw-semibold">Сумма поддержки (₽)</label>
            <div class="input-group">
              <input type="number" class="form-control" id="donorAmount" value="800" min="0" step="50" placeholder="Сумма в рублях">
              <span class="input-group-text bg-dark text-secondary-light border-secondary">₽</span>
            </div>
            <div class="form-text" id="selectedTierLabel">
              Выбран вариант: <strong>+10 ГБ SSD под векторные границы ООПТ</strong>
            </div>
          </div>

          <!-- Message -->
          <div class="col-md-6">
            <label for="donorMessage" class="form-label small fw-semibold">Пожелание или доброе слово</label>
            <textarea class="form-control" id="donorMessage" rows="2" maxlength="300" placeholder="73 & 44! Удачи в полях и чистого эфира!"></textarea>
          </div>
        </div>

        <!-- Anonymous Checkbox -->
        <div class="form-check mb-4">
          <input class="form-check-input" type="checkbox" id="donorAnonymous">
          <label class="form-check-label text-secondary-light small" for="donorAnonymous">
            Опубликовать анонимно (на стене будет указано <em class="text-light">«Анонимный радиолюбитель»</em>)
          </label>
        </div>

        <!-- Submit Button -->
        <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <button type="submit" class="btn btn-success fw-bold px-4 py-2.5 d-inline-flex align-items-center gap-2 shadow" id="submitBtn">
            <i class="bi bi-send-fill"></i> Отправить на стену признания
          </button>
          <span class="text-secondary-light small">
            Модерация обычно занимает не более пары часов
          </span>
        </div>
      </form>
    </div>

    <!-- Wall of Appreciation -->
    <div class="glass-card p-4 p-md-5 mb-5">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <h4 class="fw-bold mb-0 d-flex align-items-center gap-2">
          <span>🏆</span> Стена признания и благодарности
        </h4>
        <span class="wall-badge">RU-POTA SUPPORTERS</span>
      </div>
      <p class="text-secondary-light small mb-4">
        Огромная благодарность всем радиолюбителям, активаторам и охотникам, благодаря которым бот, карта и кластер продолжают жить и развиваться!
      </p>

      <!-- Fixed Core Team & Community Recognition -->
      <div class="row g-3 mb-4">
        <div class="col-md-4">
          <div class="wall-card h-100">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <strong class="text-light">R2BBX (Ману)</strong>
              <span class="text-warning small font-monospace">Координатор</span>
            </div>
            <div class="small text-secondary-light">«За неоценимый вклад в развитие программы Parks on the Air в России и координацию активаторов»</div>
          </div>
        </div>

        <div class="col-md-4">
          <div class="wall-card h-100">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <strong class="text-light">R9OGL (Сан Саныч)</strong>
              <span class="text-warning small font-monospace">Разработчик</span>
            </div>
            <div class="small text-secondary-light">«Архитектура бота, Mini App, интерактивная карта ООПТ и серверная инфраструктура»</div>
          </div>
        </div>

        <div class="col-md-4">
          <div class="wall-card h-100">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <strong class="text-light">Сообщество RU-POTA</strong>
              <span class="text-success small font-monospace">73 & 44!</span>
            </div>
            <div class="small text-secondary-light">«Всем, кто оставляет идеи, слова благодарности, спотит и выходит в эфир с полей!»</div>
          </div>
        </div>
      </div>

      <!-- Approved Dynamic Donor Cards -->
      ${approvedDonations.length > 0 ? `
        <h6 class="text-secondary-light fw-bold text-uppercase small tracking-wide mb-3">
          <i class="bi bi-stars text-warning"></i> Поддержали проект:
        </h6>
        <div class="row g-3">
          ${approvedDonations.map(d => {
            const displayName = d.is_anonymous ? 'Анонимный радиолюбитель' : escapeHtml(d.name || d.callsign || 'Друг POTA');
            const roleBadge = formatRoleBadge(d.role);
            const amountText = d.amount > 0 ? `${d.amount.toLocaleString('ru-RU')} ₽` : '';
            const tierText = d.tier_title ? escapeHtml(d.tier_title) : '';
            const message = d.message ? escapeHtml(d.message) : '';

            return `
              <div class="col-md-6">
                <div class="wall-card h-100 d-flex flex-column justify-content-between">
                  <div>
                    <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-1">
                      <div class="d-flex align-items-center gap-2">
                        <strong class="text-light fs-6">${displayName}</strong>
                        ${roleBadge}
                      </div>
                      ${amountText ? `<span class="donor-amount-badge">${amountText}</span>` : ''}
                    </div>
                    ${tierText ? `<div class="small text-info mb-1"><i class="bi bi-tag-fill me-1"></i>${tierText}</div>` : ''}
                    ${message ? `<div class="small text-secondary-light fst-italic mt-2">«${message}»</div>` : ''}
                  </div>
                  <div class="small text-secondary-light mt-2 pt-2 border-top border-secondary border-opacity-10 d-flex justify-content-between">
                    <span>${new Date(d.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <span class="text-success">Подтверждено ✓</span>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div class="p-4 rounded-3 text-center border border-dashed border-secondary border-opacity-25 text-secondary-light small">
          <i class="bi bi-chat-heart fs-3 d-block mb-1 text-warning"></i>
          Вы можете быть первым, кто оставит пожелание на Стене признания! Заполните форму выше 🤝
        </div>
      `}
    </div>

    <!-- Contact & Feedback -->
    <div class="text-center text-secondary-light small py-2">
      По любым вопросам, сотрудничеству или реквизитам:  
      <a href="https://t.me/r9ogl" target="_blank" class="text-warning text-decoration-none fw-semibold">@r9ogl в Telegram</a> или в наш чат <a href="https://t.me/POTA_RU" target="_blank" class="text-success text-decoration-none fw-semibold">t.me/POTA_RU</a>
    </div>
  </main>

  <!-- Footer -->
  <footer class="py-3 text-center text-secondary small border-top border-secondary border-opacity-25 mt-auto">
    <div class="container">
      RU-POTA Hub · Parks on the Air Russia · 2026
    </div>
  </footer>

  <script>
    // Tab switcher between Phone and QR (pure JS, 100% reliable)
    function switchSbpTab(tab) {
      const phoneTab = document.getElementById('tab-phone');
      const qrTab = document.getElementById('tab-qr');
      const phoneBtn = document.getElementById('tab-phone-btn');
      const qrBtn = document.getElementById('tab-qr-btn');

      if (tab === 'phone') {
        phoneTab.classList.add('show', 'active');
        qrTab.classList.remove('show', 'active');
        phoneBtn.classList.add('active');
        qrBtn.classList.remove('active');
      } else {
        qrTab.classList.add('show', 'active');
        phoneTab.classList.remove('show', 'active');
        qrBtn.classList.add('active');
        phoneBtn.classList.remove('active');
      }
    }

    // Obfuscated SBP Phone (safe from search scrapers)
    const _pData = ["+", "7", "9", "0", "3", "9", "0", "3", "6", "2", "3", "1"];
    let isPhoneRevealed = false;

    function getDecodedPhone() {
      return _pData.join('');
    }

    function copyToClipboard(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).catch(() => {
          fallbackCopyText(text);
        });
      }
      fallbackCopyText(text);
      return Promise.resolve();
    }

    function fallbackCopyText(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand('copy');
      } catch (_) {}
      document.body.removeChild(ta);
    }

    function revealAndCopyPhone() {
      const rawPhone = getDecodedPhone();
      const formattedPhone = '+7 (903) 903-62-31';

      const phoneEl = document.getElementById('phoneDisplay');
      const btn = document.getElementById('revealPhoneBtn');

      phoneEl.innerHTML = formattedPhone;
      phoneEl.classList.remove('tracking-wider');
      btn.innerHTML = '<i class="bi bi-check2-all text-dark"></i> <span>Скопировано!</span>';
      btn.classList.remove('btn-warning');
      btn.classList.add('btn-success');

      fallbackCopyText(rawPhone);
      copyToClipboard(rawPhone).then(() => {
        try {
          confetti({
            particleCount: 35,
            spread: 60,
            origin: { y: 0.75 },
            colors: ['#10b981', '#f59e0b', '#3b82f6']
          });
        } catch (_) {}

        Swal.fire({
          icon: 'success',
          title: 'Номер скопирован в буфер!',
          html: '<b>' + formattedPhone + '</b><br><span class="small text-secondary-light">СБП: Сбербанк или Ozon Банк (Александр С.)</span>',
          background: '#1e293b',
          color: '#f8f9fa',
          confirmButtonColor: '#10b981',
          timer: 3500
        });
      }).catch(() => {
        Swal.fire({
          icon: 'info',
          title: 'Номер для СБП:',
          text: formattedPhone,
          background: '#1e293b',
          color: '#f8f9fa',
          confirmButtonColor: '#10b981'
        });
      });

      isPhoneRevealed = true;
    }

    function copySbpLink() {
      const link = 'https://finance.ozon.ru/apps/sbp/ozonbankpay/01a0c427-d792-7435-8819-ce9c84f7b78e';
      fallbackCopyText(link);
      copyToClipboard(link).then(() => {
        Swal.fire({
          icon: 'success',
          title: 'Ссылка СБП скопирована!',
          text: 'Вставьте её в браузере или отправьте на телефон для мгновенной оплаты.',
          background: '#1e293b',
          color: '#f8f9fa',
          confirmButtonColor: '#10b981',
          timer: 2500
        });
      });
    }

    function selectTier(title, amount, element) {
      document.querySelectorAll('.goal-card').forEach(card => card.classList.remove('active'));
      if (element) {
        element.classList.add('active');
      }

      document.getElementById('tierTitleInput').value = title;
      const amountInput = document.getElementById('donorAmount');
      if (amount > 0) {
        amountInput.value = amount;
      }
      document.getElementById('selectedTierLabel').innerHTML = 'Выбран вариант: <strong>' + title + '</strong>';

      // Scroll smoothly to form
      const formEl = document.getElementById('donate-form-section');
      if (formEl) {
        formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    async function submitDonation(e) {
      e.preventDefault();
      const submitBtn = document.getElementById('submitBtn');
      const originalText = submitBtn.innerHTML;

      const name = document.getElementById('donorName').value.trim();
      const role = document.querySelector('input[name="donorRole"]:checked')?.value || 'activator';
      const tier_title = document.getElementById('tierTitleInput').value.trim();
      const amount = parseInt(document.getElementById('donorAmount').value, 10) || 0;
      const message = document.getElementById('donorMessage').value.trim();
      const is_anonymous = document.getElementById('donorAnonymous').checked ? 1 : 0;

      if (!name) {
        Swal.fire({
          icon: 'warning',
          title: 'Укажите позывной или имя',
          background: '#1e293b',
          color: '#f8f9fa',
          confirmButtonColor: '#10b981'
        });
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Отправка...';

      try {
        const res = await fetch('/api/donate/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, role, tier_title, amount, message, is_anonymous })
        });
        const data = await res.json();

        if (data.ok) {
          try {
            confetti({
              particleCount: 50,
              spread: 70,
              origin: { y: 0.6 }
            });
          } catch (_) {}

          Swal.fire({
            icon: 'success',
            title: 'Спасибо за поддержку! 🤝',
            text: data.message || 'Ваше сообщение отправлено на быструю модерацию и появится на стене признания!',
            background: '#1e293b',
            color: '#f8f9fa',
            confirmButtonColor: '#10b981'
          });
          document.getElementById('donationForm').reset();
          document.getElementById('tierTitleInput').value = '+10 ГБ SSD под векторные границы ООПТ';
          document.getElementById('donorAmount').value = '800';
          document.getElementById('selectedTierLabel').innerHTML = 'Выбран вариант: <strong>+10 ГБ SSD под векторные границы ООПТ</strong>';
        } else {
          Swal.fire({
            icon: 'error',
            title: 'Ошибка отправки',
            text: data.error || 'Не удалось сохранить сообщение. Попробуйте позже.',
            background: '#1e293b',
            color: '#f8f9fa',
            confirmButtonColor: '#ef4444'
          });
        }
      } catch (err) {
        Swal.fire({
          icon: 'error',
          title: 'Сетевая ошибка',
          text: err.message || 'Проверьте соединение с сервером.',
          background: '#1e293b',
          color: '#f8f9fa',
          confirmButtonColor: '#ef4444'
        });
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    }
  </script>
</body>
</html>`;
}

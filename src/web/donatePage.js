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
  <meta name="description" content="Добровольная поддержка сервера, картографического кластера и разработки бота сообщества RU-POTA.">
  <link rel="icon" type="image/svg+xml" href="/app/favicon.svg">

  <!-- Bootstrap 5 & Icons -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>

  <style>
    body {
      background-color: #0b0f19;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header-nav {
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
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
      color: #10b981;
    }
    .glass-card {
      background: rgba(19, 27, 46, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      backdrop-filter: blur(12px);
    }
    .tier-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1.5px solid rgba(255, 255, 255, 0.12);
      border-radius: 14px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      user-select: none;
      position: relative;
    }
    .tier-card:hover {
      border-color: #10b981;
      transform: translateY(-2px);
      background: rgba(16, 185, 129, 0.05);
      box-shadow: 0 8px 20px -4px rgba(16, 185, 129, 0.2);
    }
    .tier-card.active {
      border-color: #10b981;
      background: rgba(16, 185, 129, 0.09);
      box-shadow: 0 0 0 2px #10b981, 0 10px 25px -5px rgba(16, 185, 129, 0.35);
    }
    .tier-card .selected-check {
      display: none;
      position: absolute;
      top: 12px;
      right: 12px;
      color: #10b981;
      font-size: 1.1rem;
    }
    .tier-card.active .selected-check {
      display: block;
    }
    .sbp-box {
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(217, 119, 6, 0.03));
      border: 1.5px solid rgba(245, 158, 11, 0.35);
      border-radius: 16px;
    }
    .qr-frame {
      background: #fff;
      padding: 12px;
      border-radius: 14px;
      display: inline-block;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    }
    .qr-img {
      width: 210px;
      height: 210px;
      display: block;
      object-fit: contain;
    }
    .wall-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 14px 16px;
      transition: all 0.2s ease;
    }
    .wall-card:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.15);
    }
    .wall-badge {
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.4);
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 6px;
    }
    .form-control, .form-select {
      background-color: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #fff;
      border-radius: 10px;
    }
    .form-control:focus, .form-select:focus {
      background-color: rgba(15, 23, 42, 0.95);
      border-color: #10b981;
      color: #fff;
      box-shadow: 0 0 0 0.25rem rgba(16, 185, 129, 0.25);
    }
    .form-control::placeholder {
      color: rgba(255, 255, 255, 0.4);
    }
    .role-btn-group .btn-check:checked + .btn {
      background-color: #10b981;
      border-color: #10b981;
      color: #000;
      font-weight: 700;
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
          <i class="bi bi-map"></i> Карта ООПТ
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
          <a href="/login" class="btn btn-sm btn-outline-light" title="Вход в закрытую панель для региональных представителей">
            <i class="bi bi-lock"></i> Координаторам
          </a>
        `}
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="container my-4 my-md-5 flex-grow-1" style="max-width: 920px;">
    <!-- Title Section -->
    <div class="text-center mb-4 mb-md-5">
      <div class="d-inline-flex align-items-center gap-2 px-3 py-1 rounded-pill bg-warning bg-opacity-10 border border-warning border-opacity-25 text-warning small fw-bold mb-2">
        <i class="bi bi-heart-fill"></i> ДОБРОВОЛЬНАЯ ПОДДЕРЖКА
      </div>
      <h1 class="fw-bold tracking-tight mb-3">Поддержка проекта RU-POTA</h1>
      <p class="text-secondary fs-6 mx-auto lh-base" style="max-width: 720px;">
        Проект развивается силами радиолюбителей. Мы держим быстрый кластер, карту всех заповедников РФ, трансляцию спотов, мобильное приложение и бота. Всё это делается и поддерживается абсолютно бесплатно (Free).<br class="d-none d-md-inline">
        Если вы желаете поддержать проект добрым словом или делом — вы можете сделать это ниже 🤝
      </p>
    </div>

    <!-- SBP Payment Box -->
    <div class="sbp-box p-4 p-md-5 mb-5 shadow-lg">
      <div class="row align-items-center g-4">
        <!-- QR Code -->
        <div class="col-md-5 text-center">
          <div class="qr-frame">
            <img src="/assets/ozon_sbp_qr.png" alt="СБП QR Ozon Банк" class="qr-img">
          </div>
          <div class="small text-secondary mt-2">
            Отсканируйте камерой смартфона или приложением любого банка РФ
          </div>
        </div>

        <!-- Details & Direct Link -->
        <div class="col-md-7">
          <div class="d-inline-block px-2 py-0.5 rounded bg-warning text-dark fw-bold small mb-2">
            СБП · БЫСТРЫЙ ПЛАТЁЖ БЕЗ КОМИССИИ
          </div>
          <h3 class="fw-bold text-light mb-2">Перевод через Систему Быстрых Платежей</h3>
          <p class="text-secondary small mb-3">
            Платёж зачисляется на Ozon Банк (получатель: <strong>Александр С. / R9OGL</strong>). Поддерживается любой российский банк (Сбер, Т-Банк, ВТБ, Альфа и др.).
          </p>

          <div class="d-flex flex-column gap-2 mb-3">
            <a href="https://finance.ozon.ru/apps/sbp/ozonbankpay/01a0c427-d792-7435-8819-ce9c84f7b78e" target="_blank" rel="noopener" class="btn btn-warning fw-bold py-2.5 d-flex align-items-center justify-content-center gap-2 shadow">
              <i class="bi bi-qr-code-scan"></i> Открыть платёж в приложении банка
            </a>
            <button type="button" class="btn btn-outline-light btn-sm" onclick="copySbpLink()">
              <i class="bi bi-clipboard"></i> Скопировать ссылку на оплату СБП
            </button>
          </div>

          <div class="small text-secondary">
            💡 После перевода вы можете заполнить форму ниже, указав ваше пожелание — оно появится на <strong>Стене признания</strong> после одобрения!
          </div>
        </div>
      </div>
    </div>

    <!-- Tiers Section -->
    <div class="mb-5">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <h4 class="fw-bold mb-0 d-flex align-items-center gap-2">
          <span>📻</span> Варианты участия и ориентиры
        </h4>
        <span class="text-secondary small">Кликните вариант для предзаполнения</span>
      </div>
      <div class="row g-3">
        <!-- Tier 1 -->
        <div class="col-md-4 col-sm-6">
          <div class="tier-card" onclick="selectTier('Чашка кофе для админа сайта R9OGL', 150, this)">
            <i class="bi bi-check-circle-fill selected-check"></i>
            <div>
              <div class="fs-4 mb-1">☕</div>
              <div class="fw-bold text-light">Чашка кофе для админа сайта R9OGL</div>
              <div class="text-secondary small mt-1">Бодрит нашего программиста, ускоряет написание классных фишек для проекта и помогает дежурить днём и ночью, чтобы сервер никогда не упал!</div>
            </div>
            <div class="fw-bold text-warning fs-5 mt-3">150 ₽</div>
          </div>
        </div>

        <!-- Tier 2 -->
        <div class="col-md-4 col-sm-6">
          <div class="tier-card active" onclick="selectTier('Месяц жизни VPS-сервера', 450, this)">
            <i class="bi bi-check-circle-fill selected-check"></i>
            <div>
              <div class="fs-4 mb-1">🖥️</div>
              <div class="fw-bold text-light">Месяц жизни VPS-сервера</div>
              <div class="text-secondary small mt-1">Аренда скоростного VPS под бот, веб-карту и кластер.</div>
            </div>
            <div class="fw-bold text-success fs-5 mt-3">450 ₽</div>
          </div>
        </div>

        <!-- Tier 3 -->
        <div class="col-md-4 col-sm-6">
          <div class="tier-card" onclick="selectTier('Канал до Европейского сервера POTA', 850, this)">
            <i class="bi bi-check-circle-fill selected-check"></i>
            <div>
              <div class="fs-4 mb-1">📡</div>
              <div class="fw-bold text-light">Канал до серверов POTA</div>
              <div class="text-secondary small mt-1">Чтобы сигнал нашего кластера POTA уверенно долетал до Европейского сервера POTA.</div>
            </div>
            <div class="fw-bold text-warning fs-5 mt-3">850 ₽</div>
          </div>
        </div>

        <!-- Tier 4 -->
        <div class="col-md-6 col-sm-6">
          <div class="tier-card" onclick="selectTier('Разработка новых функций для нашего сообщества', 1500, this)">
            <i class="bi bi-check-circle-fill selected-check"></i>
            <div>
              <div class="fs-4 mb-1">🛠️</div>
              <div class="fw-bold text-light">Разработка новых функций</div>
              <div class="text-secondary small mt-1">Разработка новых функций для нашего сообщества.</div>
            </div>
            <div class="fw-bold text-warning fs-5 mt-3">1 500 ₽</div>
          </div>
        </div>

        <!-- Tier 5 -->
        <div class="col-md-6 col-sm-12">
          <div class="tier-card" onclick="selectTier('Своя сумма / Тёплый привет', 0, this)">
            <i class="bi bi-check-circle-fill selected-check"></i>
            <div>
              <div class="fs-4 mb-1">💌</div>
              <div class="fw-bold text-light">Своя сумма / Тёплый привет</div>
              <div class="text-secondary small mt-1">Любая сумма или просто тёплые слова для всей радиолюбительской команды.</div>
            </div>
            <div class="fw-bold text-info fs-5 mt-3">Любая сумма</div>
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
      <p class="text-secondary small mb-4">
        Сделали перевод или просто хотите поддержать команду? Заполните карточку ниже. После быстрой модерации ваше пожелание и позывной появятся на Стене почёта сообщества!
      </p>

      <form id="donationForm" onsubmit="submitDonation(event)">
        <input type="hidden" id="tierTitleInput" value="Месяц жизни VPS-сервера">

        <div class="row g-3 mb-3">
          <!-- Callsign / Name -->
          <div class="col-md-6">
            <label for="donorName" class="form-label small text-secondary fw-semibold">Позывной или имя <span class="text-danger">*</span></label>
            <input type="text" class="form-control" id="donorName" placeholder="Например: R9OGL или Александр" required maxlength="50">
          </div>

          <!-- Role in community -->
          <div class="col-md-6">
            <label class="form-label small text-secondary fw-semibold">Ваша роль в POTA <span class="text-danger">*</span></label>
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
            <label for="donorAmount" class="form-label small text-secondary fw-semibold">Сумма поддержки (₽)</label>
            <div class="input-group">
              <input type="number" class="form-control" id="donorAmount" value="450" min="0" step="50" placeholder="Сумма в рублях">
              <span class="input-group-text bg-dark text-secondary border-secondary">₽</span>
            </div>
            <div class="form-text text-secondary" id="selectedTierLabel">
              Выбран вариант: <strong>Месяц жизни VPS-сервера</strong>
            </div>
          </div>

          <!-- Message -->
          <div class="col-md-6">
            <label for="donorMessage" class="form-label small text-secondary fw-semibold">Пожелание или доброе слово</label>
            <textarea class="form-control" id="donorMessage" rows="2" maxlength="300" placeholder="73 & 44! Удачи в полях и чистого эфира!"></textarea>
          </div>
        </div>

        <!-- Anonymous Checkbox -->
        <div class="form-check mb-4">
          <input class="form-check-input" type="checkbox" id="donorAnonymous">
          <label class="form-check-label small text-secondary" for="donorAnonymous">
            Опубликовать анонимно (на стене будет указано <em>«Анонимный радиолюбитель»</em>)
          </label>
        </div>

        <!-- Submit Button -->
        <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <button type="submit" class="btn btn-success fw-bold px-4 py-2 d-inline-flex align-items-center gap-2 shadow" id="submitBtn">
            <i class="bi bi-send-fill"></i> Отправить на стену признания
          </button>
          <span class="text-secondary small">
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
      <p class="text-secondary small mb-4">
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
            <div class="small text-secondary">«За неоценимый вклад в развитие программы Parks on the Air в России и координацию активаторов»</div>
          </div>
        </div>

        <div class="col-md-4">
          <div class="wall-card h-100">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <strong class="text-light">R9OGL (Сан Саныч)</strong>
              <span class="text-warning small font-monospace">Разработчик</span>
            </div>
            <div class="small text-secondary">«Архитектура бота, Mini App, интерактивная карта ООПТ и серверная инфраструктура»</div>
          </div>
        </div>

        <div class="col-md-4">
          <div class="wall-card h-100">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <strong class="text-light">Сообщество RU-POTA</strong>
              <span class="text-success small font-monospace">73 & 44!</span>
            </div>
            <div class="small text-secondary">«Всем, кто оставляет идеи, слова благодарности, спотит и выходит в эфир с полей!»</div>
          </div>
        </div>
      </div>

      <!-- Approved Dynamic Donor Cards -->
      ${approvedDonations.length > 0 ? `
        <h6 class="text-secondary fw-bold text-uppercase small tracking-wide mb-3">
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
                      ${amountText ? `<span class="badge bg-warning bg-opacity-20 text-warning border border-warning border-opacity-25">${amountText}</span>` : ''}
                    </div>
                    ${tierText ? `<div class="small text-info mb-1"><i class="bi bi-tag-fill me-1"></i>${tierText}</div>` : ''}
                    ${message ? `<div class="small text-secondary fst-italic mt-2">«${message}»</div>` : ''}
                  </div>
                  <div class="small text-muted mt-2 pt-2 border-top border-secondary border-opacity-10 d-flex justify-content-between">
                    <span>${new Date(d.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <span class="text-success">Подтверждено ✓</span>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div class="p-4 rounded-3 text-center border border-dashed border-secondary border-opacity-25 text-secondary small">
          <i class="bi bi-chat-heart fs-3 d-block mb-1 text-warning"></i>
          Вы можете быть первым, кто оставит пожелание на Стене признания! Заполните форму выше 🤝
        </div>
      `}
    </div>

    <!-- Contact & Feedback -->
    <div class="text-center text-secondary small py-2">
      По любым вопросам, сотрудничеству или альтернативным способам перевода:  
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
    function copySbpLink() {
      const link = 'https://finance.ozon.ru/apps/sbp/ozonbankpay/01a0c427-d792-7435-8819-ce9c84f7b78e';
      navigator.clipboard.writeText(link).then(() => {
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
      document.querySelectorAll('.tier-card').forEach(card => card.classList.remove('active'));
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
          Swal.fire({
            icon: 'success',
            title: 'Спасибо за поддержку! 🤝',
            text: data.message || 'Ваше сообщение отправлено на быструю модерацию и появится на стене признания!',
            background: '#1e293b',
            color: '#f8f9fa',
            confirmButtonColor: '#10b981'
          });
          document.getElementById('donationForm').reset();
          document.getElementById('tierTitleInput').value = 'Месяц жизни VPS-сервера';
          document.getElementById('donorAmount').value = '450';
          document.getElementById('selectedTierLabel').innerHTML = 'Выбран вариант: <strong>Месяц жизни VPS-сервера</strong>';
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

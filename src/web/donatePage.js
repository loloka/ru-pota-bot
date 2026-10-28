/**
 * RU-POTA Donate & Project Support Page
 * URL: /donate
 */

export function renderDonateHtml(options = {}) {
  const isAuthed = Boolean(options.isAuthed);

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
      transition: all 0.2s ease;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .tier-card:hover {
      border-color: #10b981;
      transform: translateY(-2px);
      box-shadow: 0 8px 20px -4px rgba(16, 185, 129, 0.2);
    }
    .tier-card.active {
      border-color: #10b981;
      background: rgba(16, 185, 129, 0.08);
      box-shadow: 0 0 0 2px #10b981, 0 10px 25px -5px rgba(16, 185, 129, 0.3);
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
      padding: 12px 16px;
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
  <main class="container my-4 my-md-5 flex-grow-1" style="max-width: 900px;">
    <!-- Title Section -->
    <div class="text-center mb-4 mb-md-5">
      <div class="d-inline-flex align-items-center gap-2 px-3 py-1 rounded-pill bg-warning bg-opacity-10 border border-warning border-opacity-25 text-warning small fw-bold mb-2">
        <i class="bi bi-heart-fill"></i> ДОБРОВОЛЬНАЯ ПОДДЕРЖКА
      </div>
      <h1 class="fw-bold tracking-tight mb-2">Поддержка проекта RU-POTA</h1>
      <p class="text-secondary fs-6 mx-auto" style="max-width: 650px;">
        Проект развивается силами радиолюбителей-энтузиастов. Мы держим быстрый кластер, карту всех 11&nbsp;000+ заповедников РФ, прямую трансляцию спотов в RDA-INFORMER и мобильное приложение абсолютно бесплатно.
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
            💡 После перевода вы можете заполнить форму ниже, чтобы ваше имя или позывной появились на <strong>Стене признания</strong> сообщества!
          </div>
        </div>
      </div>
    </div>

    <!-- Tiers Section -->
    <div class="mb-5">
      <h4 class="fw-bold mb-3 d-flex align-items-center gap-2">
        <span>📻</span> Варианты участия и ориентиры
      </h4>
      <div class="row g-3">
        <div class="col-md-4 col-sm-6">
          <div class="tier-card">
            <div>
              <div class="fs-4 mb-1">☕</div>
              <div class="fw-bold text-light">Чашка кофе автору</div>
              <div class="text-secondary small mt-1">Приятный заряд бодрости для ночного кодинга и обновления баз.</div>
            </div>
            <div class="fw-bold text-warning fs-5 mt-3">150 ₽</div>
          </div>
        </div>
        <div class="col-md-4 col-sm-6">
          <div class="tier-card">
            <div>
              <div class="fs-4 mb-1">⚡</div>
              <div class="fw-bold text-light">Горсть кварцев и диодов</div>
              <div class="text-secondary small mt-1">На поддержание бодрого духа и сетевых скриптов кластера.</div>
            </div>
            <div class="fw-bold text-warning fs-5 mt-3">350 ₽</div>
          </div>
        </div>
        <div class="col-md-4 col-sm-6">
          <div class="tier-card">
            <div>
              <div class="fs-4 mb-1">📻</div>
              <div class="fw-bold text-light">Транзистор в каскад</div>
              <div class="text-secondary small mt-1">Чтобы сигнал кластера POTA уверенно пробивал любые QRM.</div>
            </div>
            <div class="fw-bold text-warning fs-5 mt-3">750 ₽</div>
          </div>
        </div>
        <div class="col-md-6 col-sm-6">
          <div class="tier-card active">
            <div>
              <div class="fs-4 mb-1">📡</div>
              <div class="fw-bold text-light">Месяц жизни сервера и кластера</div>
              <div class="text-secondary small mt-1">Полная оплата скоростного VPS, базы SQLite в WAL-режиме и безлимитного канала.</div>
            </div>
            <div class="fw-bold text-success fs-5 mt-3">1 500 ₽</div>
          </div>
        </div>
        <div class="col-md-6 col-sm-12">
          <div class="tier-card">
            <div>
              <div class="fs-4 mb-1">🛠️</div>
              <div class="fw-bold text-light">Разработка новых фич и геобаз</div>
              <div class="text-secondary small mt-1">Парсинг новых регионов, полигонов ООПТ, интеграция со спец-дипломами и RDA.</div>
            </div>
            <div class="fw-bold text-warning fs-5 mt-3">3 000 ₽</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Wall of Appreciation -->
    <div class="glass-card p-4 p-md-5 mb-5">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <h4 class="fw-bold mb-0 d-flex align-items-center gap-2">
          <span>🏆</span> Стена признания и благодарности
        </h4>
        <span class="wall-badge">RU-POTA SPONSORS</span>
      </div>
      <p class="text-secondary small mb-4">
        Огромная благодарность радиолюбителям, активаторам и охотникам, благодаря которым бот и карта продолжают развиваться!
      </p>

      <div class="row g-3">
        <div class="col-md-6">
          <div class="wall-card">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <strong class="text-light">R2BBX (Мануэль)</strong>
              <span class="text-warning small font-monospace">Координатор POTA RU</span>
            </div>
            <div class="small text-secondary">«За неоценимый вклад в развитие программы Parks on the Air в России и координацию активаторов»</div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="wall-card">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <strong class="text-light">RM1O (Александр)</strong>
              <span class="text-warning small font-monospace">RDA-INFORMER</span>
            </div>
            <div class="small text-secondary">«За содействие в интеграции спотов POTA с программой RDA и поддержку сообщества»</div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="wall-card">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <strong class="text-light">R9OGL (Сан Саныч)</strong>
              <span class="text-warning small font-monospace">Разработчик</span>
            </div>
            <div class="small text-secondary">«Архитектура бота, Mini App, полигоны ООПТ и серверная инфраструктура»</div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="wall-card">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <strong class="text-light">Друзья и активаторы RU-POTA</strong>
              <span class="text-success small font-monospace">73 & 44!</span>
            </div>
            <div class="small text-secondary">«Всем, кто выходит в эфир с полей и делится своими спотами!»</div>
          </div>
        </div>
      </div>
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
  </script>
</body>
</html>`;
}

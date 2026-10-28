/**
 * RU-POTA Contacts & Community Page
 * URL: /contacts
 */

export function renderContactsHtml(options = {}) {
  const isAuthed = Boolean(options.isAuthed);

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Контакты и сообщество RU-POTA 🌲 | Parks on the Air Russia</title>
  <meta name="description" content="Официальные контакты сообщества радиолюбителей дипломной программы Parks on the Air (RU-POTA).">
  <link rel="icon" type="image/svg+xml" href="/app/favicon.svg">

  <!-- Bootstrap 5 & Icons -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">

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
    .contact-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1.5px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      padding: 20px;
      transition: all 0.2s ease;
      text-decoration: none;
      color: inherit;
      display: block;
    }
    .contact-card:hover {
      border-color: #10b981;
      transform: translateY(-3px);
      box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.25);
      color: inherit;
    }
    .icon-box {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      flex-shrink: 0;
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
        <a href="/donate" class="btn btn-sm btn-outline-warning d-none d-md-inline-flex align-items-center gap-1">
          <i class="bi bi-heart-fill text-danger"></i> Поддержать
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
  <main class="container my-4 my-md-5 flex-grow-1" style="max-width: 860px;">
    <!-- Title -->
    <div class="text-center mb-4 mb-md-5">
      <div class="d-inline-flex align-items-center gap-2 px-3 py-1 rounded-pill bg-success bg-opacity-10 border border-success border-opacity-25 text-success small fw-bold mb-2">
        <i class="bi bi-broadcast-pin"></i> СООБЩЕСТВО И СВЯЗЬ
      </div>
      <h1 class="fw-bold tracking-tight mb-2">Контакты RU-POTA</h1>
      <p class="text-secondary fs-6 mx-auto" style="max-width: 600px;">
        Официальные ресурсы программы Parks on the Air в России, каналы оповещений, бот для активаторов и контакты команды.
      </p>
    </div>

    <!-- Official Channels Grid -->
    <div class="row g-3 mb-4">
      <div class="col-md-6">
        <a href="https://t.me/POTA_RU" target="_blank" class="contact-card h-100">
          <div class="d-flex align-items-start gap-3">
            <div class="icon-box bg-primary bg-opacity-20 text-primary border border-primary border-opacity-30">
              <i class="bi bi-telegram"></i>
            </div>
            <div>
              <div class="fw-bold text-light fs-5 mb-1">Telegram-канал @POTA_RU</div>
              <div class="text-secondary small mb-2">Главный новостной канал сообщества: анонсы экспедиций, дипломы, новости программы в РФ.</div>
              <span class="text-primary small fw-semibold">Перейти в канал →</span>
            </div>
          </div>
        </a>
      </div>

      <div class="col-md-6">
        <a href="https://t.me/ru_pota_bot" target="_blank" class="contact-card h-100">
          <div class="d-flex align-items-start gap-3">
            <div class="icon-box bg-success bg-opacity-20 text-success border border-success border-opacity-30">
              <i class="bi bi-robot"></i>
            </div>
            <div>
              <div class="fw-bold text-light fs-5 mb-1">Telegram-бот @ru_pota_bot</div>
              <div class="text-secondary small mb-2">Оперативные споты, фильтры подписок на любимые позывные и парки, карта и статистика.</div>
              <span class="text-success small fw-semibold">Открыть бота →</span>
            </div>
          </div>
        </a>
      </div>

      <div class="col-md-6">
        <a href="https://pota.r9o.ru/app/" target="_blank" class="contact-card h-100">
          <div class="d-flex align-items-start gap-3">
            <div class="icon-box bg-info bg-opacity-20 text-info border border-info border-opacity-30">
              <i class="bi bi-compass"></i>
            </div>
            <div>
              <div class="fw-bold text-light fs-5 mb-1">Web Mini App POTA Hub</div>
              <div class="text-secondary small mb-2">Мобильное веб-приложение: оффлайн-карта парков, живой кластер, каталог ООПТ и навигация.</div>
              <span class="text-info small fw-semibold">Запустить Mini App →</span>
            </div>
          </div>
        </a>
      </div>

      <div class="col-md-6">
        <a href="https://pota.app/" target="_blank" class="contact-card h-100">
          <div class="d-flex align-items-start gap-3">
            <div class="icon-box bg-warning bg-opacity-20 text-warning border border-warning border-opacity-30">
              <i class="bi bi-globe2"></i>
            </div>
            <div>
              <div class="fw-bold text-light fs-5 mb-1">Международный сайт POTA.app</div>
              <div class="text-secondary small mb-2">Официальный мировой портал программы Parks on the Air: загрузка логов, дипломы и рейтинг.</div>
              <span class="text-warning small fw-semibold">Открыть pota.app →</span>
            </div>
          </div>
        </a>
      </div>
    </div>

    <!-- Team & Coordinators Card -->
    <div class="glass-card p-4 mb-4">
      <h4 class="fw-bold text-light mb-3 d-flex align-items-center gap-2">
        <span>👥</span> Команда проекта
      </h4>
      <div class="row g-3">
        <div class="col-md-6">
          <div class="p-3 rounded bg-black bg-opacity-30 border border-secondary border-opacity-25 h-100">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div>
                <strong class="text-light fs-6">Мануэль R2BBX</strong>
                <div class="text-warning small font-monospace">Координатор программы POTA в России</div>
              </div>
            </div>
            <p class="text-secondary small mb-2">
              Включение новых заповедников в мировой каталог POTA, проверка заявок активаторов, координация региональных представителей.
            </p>
            <a href="https://t.me/r2bbx" target="_blank" class="text-info small text-decoration-none">
              <i class="bi bi-telegram"></i> @r2bbx
            </a>
          </div>
        </div>

        <div class="col-md-6">
          <div class="p-3 rounded bg-black bg-opacity-30 border border-secondary border-opacity-25 h-100">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div>
                <strong class="text-light fs-6">Сан Саныч R9OGL</strong>
                <div class="text-warning small font-monospace">Разработчик и администратор сервиса</div>
              </div>
            </div>
            <p class="text-secondary small mb-2">
              Разработка Telegram-бота, интерактивной карты полигонов ООПТ, серверной инфраструктуры и интеграции с RDA.
            </p>
            <a href="https://t.me/r9ogl" target="_blank" class="text-info small text-decoration-none">
              <i class="bi bi-telegram"></i> @r9ogl
            </a>
          </div>
        </div>
      </div>
    </div>
  </main>

  <!-- Footer -->
  <footer class="py-3 text-center text-secondary small border-top border-secondary border-opacity-25 mt-auto">
    <div class="container">
      RU-POTA Hub · Parks on the Air Russia · 2026
    </div>
  </footer>

</body>
</html>`;
}

/**
 * RU-POTA Under Construction Placeholder Page (Rule 2/3)
 * Renders high-quality placeholder for sections currently in development (< 65% readiness).
 */

export function renderPlaceholderHtml(options = {}) {
  const {
    title = 'Раздел в разработке',
    icon = 'bi-cone-striped',
    badge = 'В разработке',
    percent = 45,
    description = 'Команда RU-POTA активно работает над этим разделом портала.',
    features = [],
    backUrl = '/',
    user = null,
    isAuthed = false,
    isAdmin = false
  } = options;

  const userCallsign = user?.callsign || '';
  const userAvatar = user?.avatar_url || '';
  const displayName = userCallsign || user?.first_name || 'Оператор';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
  <title>${title} | RU-POTA Хаб</title>
  <meta name="description" content="${description}">
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

    /* Ambient background glowing accents */
    .ambient-glow {
      position: fixed;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 600px;
      height: 350px;
      background: radial-gradient(ellipse, rgba(16, 185, 129, 0.15) 0%, rgba(11, 15, 25, 0) 70%);
      pointer-events: none;
      z-index: 0;
    }

    /* Header Nav */
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
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }

    /* Glass Cards */
    .glass-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      backdrop-filter: blur(16px);
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5);
    }

    /* Icon Bubble */
    .icon-bubble {
      width: 76px;
      height: 76px;
      border-radius: 22px;
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%);
      border: 1.5px solid rgba(245, 158, 11, 0.35);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 36px;
      color: var(--pota-gold);
      box-shadow: 0 10px 25px -5px rgba(245, 158, 11, 0.25);
    }

    /* Progress bar */
    .progress-custom {
      height: 10px;
      background-color: rgba(255, 255, 255, 0.08);
      border-radius: 6px;
      overflow: hidden;
    }
    .progress-bar-custom {
      background: linear-gradient(90deg, #f59e0b, #10b981);
      border-radius: 6px;
      transition: width 1s ease-in-out;
    }

    /* Feature Item */
    .feature-item {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 12px;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 0.95rem;
    }
    .feature-icon {
      color: var(--pota-green);
      font-size: 1.2rem;
    }

    /* Touch buttons */
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
  </style>
</head>
<body>
  <div class="ambient-glow"></div>

  <!-- Header -->
  <header class="header-nav py-2 px-3 sticky-top">
    <div class="container d-flex align-items-center justify-content-between">
      <div class="d-flex align-items-center gap-2">
        <a href="/" class="brand-link text-decoration-none">
          <div class="d-inline-flex align-items-center bg-white px-2 py-1 rounded-3 shadow-sm" style="line-height: 1;">
            <img src="/assets/pota-logo.png" alt="POTA" style="width: 20px; height: 20px; object-fit: contain; margin-right: 5px;" />
            <span style="color: #059669; font-weight: 900; font-size: 14px; letter-spacing: -0.3px;">RU POTA</span>
          </div>
        </a>
      </div>

      <div class="d-flex align-items-center gap-2">
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

        ${isAuthed ? `
          <a href="/me" class="btn btn-sm btn-outline-success d-inline-flex align-items-center gap-2">
            ${userAvatar ? `<img src="${userAvatar}" class="rounded-circle" width="20" height="20" alt="avatar">` : '<i class="bi bi-person-fill"></i>'}
            <span class="fw-bold">${displayName}</span>
          </a>
          ${isAdmin ? `<a href="/admin" class="btn btn-sm btn-primary d-inline-flex align-items-center gap-1" title="Панель координатора"><i class="bi bi-gear-fill"></i></a>` : ''}
        ` : isAdmin ? `
          <a href="/admin" class="btn btn-sm btn-primary d-inline-flex align-items-center gap-1"><i class="bi bi-gear-fill"></i> Админка</a>
        ` : ''}
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="container my-auto py-5 position-relative" style="z-index: 1; max-width: 760px;">
    <div class="glass-card p-4 p-md-5 text-center">
      
      <div class="icon-bubble mb-4">
        <i class="bi ${icon}"></i>
      </div>

      <div class="mb-3">
        <span class="badge ${percent > 0 ? 'bg-warning text-dark' : 'bg-secondary text-white'} px-3 py-2 rounded-pill fw-bold text-uppercase" style="letter-spacing: 0.5px;">
          <i class="bi ${percent > 0 ? 'bi-cone-striped' : 'bi-hourglass-split'} me-1"></i> ${badge}${percent > 0 ? ` • ${percent}%` : ''}
        </span>
      </div>

      <h1 class="h2 fw-bold text-white mb-3">${title}</h1>
      <p class="text-secondary lead fs-6 mb-4" style="max-width: 580px; margin: 0 auto;">
        ${description}
      </p>

      ${percent > 0 ? `
        <!-- Readiness bar -->
        <div class="mb-4 text-start bg-dark p-3 rounded-3 border border-secondary border-opacity-25">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="small text-muted fw-semibold">Статус готовности по Правилу 2/3:</span>
            <span class="small text-warning fw-bold">${percent}% из 100%</span>
          </div>
          <div class="progress progress-custom">
            <div class="progress-bar progress-bar-custom" style="width: ${percent}%;"></div>
          </div>
          <div class="small text-muted mt-2" style="font-size: 0.8rem;">
            <i class="bi bi-info-circle me-1"></i> Разделы становятся общедоступными при достижении порога готовности 65%+.
          </div>
        </div>
      ` : ''}

      ${features && features.length > 0 ? `
        <div class="text-start mb-4">
          <h6 class="text-white-50 text-uppercase fw-bold mb-3" style="font-size: 0.75rem; letter-spacing: 1px;">
            Что реализуется в этом модуле:
          </h6>
          <div class="d-flex flex-column gap-2">
            ${features.map(f => `
              <div class="feature-item">
                <i class="bi bi-check2-circle feature-icon"></i>
                <span class="text-light">${f}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Action buttons -->
      <div class="d-flex flex-column flex-sm-row gap-3 justify-content-center pt-2">
        <a href="${backUrl}" class="btn btn-secondary btn-touch">
          <i class="bi bi-arrow-left"></i> На главную (Хаб)
        </a>
        <a href="/map" class="btn btn-outline-light btn-touch">
          <i class="bi bi-map"></i> Открыть карту ООПТ
        </a>
        <a href="https://t.me/ru_pota_bot" target="_blank" class="btn btn-success btn-touch">
          <i class="bi bi-telegram"></i> Открыть в боте
        </a>
      </div>

    </div>
  </main>

  <!-- Footer -->
  <footer class="py-3 text-center border-top border-secondary border-opacity-25" style="background: rgba(11, 15, 25, 0.8); z-index: 1;">
    <div class="container text-muted small">
      <div>RU-POTA Team • Parks on the Air Russia 🌲 73 & 44</div>
    </div>
  </footer>

</body>
</html>`;
}

import sys
import os
import base64
import shutil
from PySide6.QtWidgets import QApplication
from PySide6.QtWebEngineCore import QWebEnginePage
from PySide6.QtGui import QPageLayout, QPageSize
from PySide6.QtCore import QEventLoop, QMarginsF, QSize
from PySide6.QtPdf import QPdfDocument

def generate_pdf():
    app = QApplication.instance()
    if not app:
        app = QApplication(sys.argv)

    logo_path = r"E:\dev\potabot\assets\pota-logo.png"
    logo_base64 = ""
    if os.path.exists(logo_path):
        with open(logo_path, "rb") as f:
            logo_base64 = base64.b64encode(f.read()).decode("utf-8")

    html_content = f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RU-POTA • Памятка участника и регламент программы</title>
<link rel="icon" type="image/png" href="/app/pota-logo.png">
<style>
  * {{
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }}

  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #1e293b;
    font-size: 8pt;
    line-height: 1.37;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }}

  /* Top Navigation Bar (Screen only) */
  .top-nav {{
    display: none;
  }}

  @media screen {{
    body {{
      background: #0f172a;
      background-image: radial-gradient(at 0% 0%, #064e3b 0px, transparent 50%), radial-gradient(at 100% 100%, #0f172a 0px, transparent 50%);
      background-attachment: fixed;
      padding: 0 0 40px 0;
      min-height: 100vh;
      font-size: 13.5px;
      line-height: 1.5;
    }}

    .top-nav {{
      display: flex;
      position: sticky;
      top: 0;
      z-index: 1000;
      background: rgba(15, 23, 42, 0.88);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding: 10px 20px;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
    }}

    .top-nav-brand {{
      display: flex;
      align-items: center;
      gap: 12px;
      color: #ffffff;
      text-decoration: none;
    }}

    .top-nav-logo {{
      height: 34px;
      width: auto;
    }}

    .top-nav-title {{
      font-weight: 800;
      font-size: 15px;
      letter-spacing: -0.01em;
      color: #34d399;
    }}

    .top-nav-subtitle {{
      font-size: 11px;
      color: #94a3b8;
    }}

    .top-nav-actions {{
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }}

    .btn {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      font-size: 12.5px;
      font-weight: 600;
      border-radius: 6px;
      text-decoration: none;
      transition: all 0.18s ease;
      cursor: pointer;
      border: none;
    }}

    .btn-pdf {{
      background: #10b981;
      color: #064e3b;
      font-weight: 700;
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
    }}
    .btn-pdf:hover {{
      background: #34d399;
      transform: translateY(-1px);
    }}

    .btn-app {{
      background: #0284c7;
      color: #ffffff;
    }}
    .btn-app:hover {{
      background: #38bdf8;
      transform: translateY(-1px);
    }}

    .btn-bot {{
      background: rgba(255, 255, 255, 0.1);
      color: #e2e8f0;
      border: 1px solid rgba(255, 255, 255, 0.15);
    }}
    .btn-bot:hover {{
      background: rgba(255, 255, 255, 0.18);
      color: #ffffff;
    }}

    .doc-container {{
      max-width: 920px;
      margin: 24px auto 0 auto;
      padding: 0 16px;
      display: flex;
      flex-direction: column;
      gap: 28px;
    }}

    .page {{
      background: #ffffff;
      border-radius: 12px;
      padding: 26px 30px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.12);
      width: 100% !important;
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
    }}

    .section-card {{
      padding: 12px 14px;
      margin-bottom: 2px;
    }}

    .section-title {{
      font-size: 15px;
      margin-bottom: 8px;
    }}

    .sub-card {{
      padding: 10px 12px;
    }}

    .sub-card-title {{
      font-size: 13.5px;
      margin-bottom: 4px;
    }}

    .sub-card p, .step-body p, .criteria-card p, .wf-step p {{
      font-size: 12.5px;
      line-height: 1.5;
    }}

    .step-box {{
      padding: 10px 12px;
    }}

    .step-body h4 {{
      font-size: 13.5px;
    }}

    .cmd-table {{
      font-size: 12.5px;
    }}
    .cmd-table th {{
      font-size: 11.5px;
      padding: 5px 8px;
    }}
    .cmd-table td {{
      padding: 5px 8px;
    }}

    .code {{
      font-size: 12px;
      padding: 2px 5px;
    }}

    .callout {{
      padding: 10px 12px;
      font-size: 12.5px;
      margin-top: 8px;
    }}

    .compare-col {{
      padding: 9px 12px;
      font-size: 12px;
      line-height: 1.45;
    }}

    .compare-col-title {{
      font-size: 12.5px;
    }}

    .footer {{
      font-size: 11.5px;
      padding-top: 10px;
      margin-top: 14px;
    }}
  }}

  /* Mobile Responsive (Screen < 768px) */
  @media screen and (max-width: 768px) {{
    .top-nav {{
      flex-direction: column;
      gap: 10px;
      align-items: flex-start;
      padding: 12px 16px;
    }}
    .top-nav-actions {{
      width: 100%;
      justify-content: stretch;
    }}
    .btn {{
      flex: 1;
      justify-content: center;
      font-size: 11.5px;
      padding: 6px 10px;
    }}
    .page {{
      padding: 18px 14px;
    }}
    .header {{
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
    }}
    .header-meta {{
      align-items: flex-start;
      text-align: left;
    }}
    .grid-2, .grid-3, .workflow-grid, .compare-box {{
      grid-template-columns: 1fr !important;
      gap: 10px !important;
    }}
    .header-title-box h1 {{
      font-size: 18px !important;
    }}
  }}

  /* Print Media (A4 exact vector output) */
  @media print {{
    @page {{
      size: A4 portrait;
      margin: 9mm 11mm 9mm 11mm;
    }}

    .no-print {{
      display: none !important;
    }}

    body {{
      background: #ffffff;
      padding: 0;
      margin: 0;
      font-size: 8pt;
      line-height: 1.37;
    }}

    .page {{
      width: 100%;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 279mm;
      max-height: 279mm;
      overflow: hidden;
      background: #ffffff;
      padding: 0;
    }}

    .page:last-child {{
      page-break-after: avoid;
    }}
  }}

  /* Shared Styling Elements */
  .header {{
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 6px;
    padding-right: 2px;
    border-bottom: 2.5px solid #0f5132;
    margin-bottom: 6px;
  }}

  .header-left {{
    display: flex;
    align-items: center;
    gap: 11px;
  }}

  .header-logo {{
    height: 42px;
    width: auto;
    object-fit: contain;
  }}

  .header-title-box h1 {{
    font-size: 14.5pt;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #0b3d26;
    line-height: 1.15;
  }}

  .header-title-box .subtitle {{
    font-size: 7.6pt;
    font-weight: 500;
    color: #475569;
    margin-top: 1px;
  }}

  .header-meta {{
    text-align: right;
    display: flex;
    flex-direction: column;
    gap: 2.5px;
    align-items: flex-end;
  }}

  .badge-row {{
    display: flex;
    gap: 4px;
  }}

  .badge {{
    font-size: 6.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 6px;
    border-radius: 3px;
  }}

  .badge-dark {{
    background-color: #0f5132;
    color: #ffffff;
  }}

  .badge-subtle {{
    background-color: #f1f5f9;
    color: #334155;
    border: 1px solid #cbd5e1;
  }}

  .badge-accent {{
    background-color: #fef3c7;
    color: #92400e;
    border: 1px solid #fde68a;
  }}

  .header-meta-text {{
    font-size: 6.8pt;
    color: #64748b;
  }}

  .content-stack {{
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
  }}

  .section-card {{
    background-color: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 5px;
    padding: 6px 8px;
  }}

  .section-title {{
    font-size: 9pt;
    font-weight: 700;
    color: #0b3d26;
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 4px;
    letter-spacing: -0.01em;
  }}

  .section-title::before {{
    content: "";
    display: inline-block;
    width: 3.5px;
    height: 10px;
    background-color: #0f5132;
    border-radius: 2px;
  }}

  .grid-2 {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }}

  .grid-3 {{
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 5px;
  }}

  .sub-card {{
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 5px 7px;
  }}

  .sub-card-title {{
    font-size: 8.1pt;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 2px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }}

  .sub-card p {{
    font-size: 7.5pt;
    color: #334155;
    line-height: 1.34;
  }}

  .step-box {{
    display: flex;
    gap: 7px;
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 5px 7px;
  }}

  .step-num {{
    background-color: #0f5132;
    color: #ffffff;
    font-weight: 800;
    font-size: 8pt;
    width: 19px;
    height: 19px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 1px;
  }}

  .step-body h4 {{
    font-size: 8.1pt;
    font-weight: 700;
    color: #0b3d26;
    margin-bottom: 1.5px;
  }}

  .step-body p {{
    font-size: 7.4pt;
    color: #334155;
    line-height: 1.33;
  }}

  .cmd-table {{
    width: 100%;
    border-collapse: collapse;
    font-size: 7.4pt;
  }}

  .cmd-table th {{
    text-align: left;
    background-color: #f1f5f9;
    padding: 2.5px 5px;
    font-weight: 700;
    color: #475569;
    border-bottom: 1px solid #cbd5e1;
    font-size: 6.8pt;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }}

  .cmd-table td {{
    padding: 2.5px 5px;
    border-bottom: 1px solid #f1f5f9;
    color: #334155;
    vertical-align: top;
    line-height: 1.3;
  }}

  .cmd-table tr:last-child td {{
    border-bottom: none;
  }}

  .code {{
    font-family: Consolas, "Liberation Mono", "JetBrains Mono", monospace;
    font-weight: 700;
    color: #0369a1;
    background-color: #f0f9ff;
    padding: 1px 3.5px;
    border-radius: 3px;
    border: 1px solid #bae6fd;
    font-size: 7.3pt;
  }}

  .url {{
    font-family: Consolas, "Liberation Mono", monospace;
    font-weight: 600;
    color: #0f766e;
    text-decoration: none;
  }}
  .url:hover {{
    text-decoration: underline;
  }}

  .criteria-card {{
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 5px 7px;
  }}

  .criteria-header {{
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 2px;
  }}

  .criteria-num {{
    width: 15px;
    height: 15px;
    background-color: #0f5132;
    color: #ffffff;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 7.2pt;
    font-weight: 800;
    flex-shrink: 0;
  }}

  .criteria-header h5 {{
    font-size: 8pt;
    font-weight: 700;
    color: #0f172a;
  }}

  .criteria-card p {{
    font-size: 7.4pt;
    color: #334155;
    line-height: 1.32;
  }}

  .callout {{
    background-color: #fefce8;
    border-left: 3px solid #d97706;
    padding: 5px 7px;
    border-radius: 0 4px 4px 0;
    font-size: 7.4pt;
    color: #78350f;
    line-height: 1.33;
  }}

  .callout-title {{
    font-weight: 700;
    color: #92400e;
    margin-bottom: 1px;
  }}

  .callout-success {{
    background-color: #f0fdf4;
    border-left: 3px solid #16a34a;
    color: #14532d;
  }}

  .callout-success .callout-title {{
    color: #15803d;
  }}

  .compare-box {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5px;
    margin-top: 4px;
  }}

  .compare-col {{
    padding: 5px 7px;
    border-radius: 4px;
    font-size: 7.2pt;
    line-height: 1.32;
  }}

  .compare-col-good {{
    background-color: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #166534;
  }}

  .compare-col-bad {{
    background-color: #fef2f2;
    border: 1px solid #fecaca;
    color: #991b1b;
  }}

  .compare-col-title {{
    font-weight: 800;
    font-size: 7.4pt;
    margin-bottom: 2px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }}

  .workflow-grid {{
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 5px;
  }}

  .wf-step {{
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 5px 6px;
  }}

  .wf-step-title {{
    font-weight: 700;
    font-size: 7.6pt;
    color: #0b3d26;
    margin-bottom: 1.5px;
    display: flex;
    align-items: center;
    gap: 4px;
  }}

  .wf-badge {{
    background: #0f5132;
    color: #fff;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 6.5pt;
    font-weight: 800;
  }}

  .wf-step p {{
    font-size: 7.2pt;
    color: #475569;
    line-height: 1.28;
  }}

  .footer {{
    border-top: 1px solid #cbd5e1;
    padding-top: 4px;
    padding-right: 2px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 6.8pt;
    color: #64748b;
    margin-top: 4px;
  }}

  .footer-spirit {{
    font-weight: 700;
    color: #0f5132;
    letter-spacing: 0.02em;
  }}

  .highlight {{
    font-weight: 700;
    color: #0b3d26;
  }}

  .pill {{
    display: inline-block;
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 6.6pt;
    font-weight: 700;
  }}
  .pill-green {{ background: #dcfce7; color: #166534; }}
  .pill-blue {{ background: #e0f2fe; color: #075985; }}
  .pill-amber {{ background: #fef3c7; color: #92400e; }}
</style>
</head>
<body>

  <!-- Top Sticky Bar (Browser only) -->
  <header class="top-nav no-print">
    <a href="/guide" class="top-nav-brand">
      {f'<img src="data:image/png;base64,{logo_base64}" class="top-nav-logo" alt="POTA Logo">' if logo_base64 else ''}
      <div>
        <div class="top-nav-title">RU-POTA &bull; Памятка участника</div>
        <div class="top-nav-subtitle">Официальное справочное руководство Parks on the Air&reg;</div>
      </div>
    </a>
    <div class="top-nav-actions">
      <a href="/guide.pdf" download class="btn btn-pdf">
        <span>📥</span> Скачать PDF (A4)
      </a>
      <a href="https://t.me/ru_pota_bot/app" target="_blank" class="btn btn-app">
        <span>📱</span> Хаб в Telegram
      </a>
      <a href="/app" class="btn btn-bot">
        <span>🌐</span> Веб-версия
      </a>
      <a href="https://t.me/ru_pota_bot" target="_blank" class="btn btn-bot">
        <span>🤖</span> Бот @ru_pota_bot
      </a>
    </div>
  </header>

  <div class="doc-container">

    <!-- ==================== СТРАНИЦА 1 ==================== -->
    <div class="page">
      <div>
        <!-- Header -->
        <div class="header">
          <div class="header-left">
            {f'<img src="data:image/png;base64,{logo_base64}" class="header-logo" alt="POTA Logo">' if logo_base64 else ''}
            <div class="header-title-box">
              <h1>RU-POTA &bull; Памятка участника программы</h1>
              <div class="subtitle">Правила Parks on the Air&reg;, цифровая экосистема сообщества и быстрый старт</div>
            </div>
          </div>
          <div class="header-meta">
            <div class="badge-row">
              <span class="badge badge-dark">Редакция 2026</span>
              <span class="badge badge-subtle">RU / BY / KZ</span>
            </div>
            <div class="header-meta-text">Координаторы: R2BBX (парки) &bull; R9OGL (сервисы)</div>
          </div>
        </div>

        <!-- Content Stack Page 1 -->
        <div class="content-stack">

          <!-- 1. Что такое POTA и принципы зачёта -->
          <div class="section-card">
            <div class="section-title">1. Принципы зачёта: Охотники и Активаторы</div>
            <div class="grid-2">
              <div class="sub-card">
                <div class="sub-card-title">
                  <span>Охотникам (Hunters)</span>
                  <span class="pill pill-green">Без загрузки логов</span>
                </div>
                <p>
                  <strong>Задача:</strong> проводить радиосвязи со станциями в зарегистрированных парках POTA на любых диапазонах и модах.<br>
                  <strong>Зачёт:</strong> <span class="highlight">Охотникам логи загружать не требуется.</span> Зачёт связей и начисление дипломов происходят автоматически из логов активаторов. Достаточно один раз указать позывной на сайте pota.app.
                </p>
              </div>
              <div class="sub-card">
                <div class="sub-card-title">
                  <span>Активаторам (Activators)</span>
                  <span class="pill pill-blue">&ge; 10 QSO за сутки UTC</span>
                </div>
                <p>
                  <strong>Задача:</strong> развернуть походную станцию в границах парка и провести <strong>не менее 10 связей</strong> за сутки UTC (00:00&ndash;23:59).<br>
                  <strong>Зачёт:</strong> активатор экспортирует ADIF-файл и загружает его в личный кабинет на <span class="code">pota.app</span>. В зачёт идут любые диапазоны и виды излучения.
                </p>
              </div>
            </div>
          </div>

          <!-- 2. Регистрация и «Зелёный коридор» -->
          <div class="section-card">
            <div class="section-title">2. Быстрый старт: Регистрация и «Зелёный коридор» в чате</div>
            <div class="grid-2">
              <div class="step-box">
                <div class="step-num">1</div>
                <div class="step-body">
                  <h4>Международный портал (pota.app / next.pota.app)</h4>
                  <p>
                    <strong>Зачем:</strong> официальный международный зачёт связей и дипломы.<br>
                    &bull; Перейдите на <a href="https://pota.app" target="_blank" class="url">https://pota.app</a> (или бета-версию <a href="https://next.pota.app" target="_blank" class="url">https://next.pota.app</a>).<br>
                    &bull; Нажмите <em>Log In / Register</em> и в профиле (<em>Profile</em>) укажите свой <strong>официальный позывной</strong>.<br>
                    <em>Без позывного в профиле система не сможет привязать связи к вашей карточке.</em>
                  </p>
                </div>
              </div>

              <div class="step-box">
                <div class="step-num">2</div>
                <div class="step-body">
                  <h4>Telegram-бот сообщества (@ru_pota_bot)</h4>
                  <p>
                    <strong>Зачем:</strong> алерты в ЛС, споттинг из поля и «зелёный коридор» в чате.<br>
                    &bull; Откройте бота <a href="https://t.me/ru_pota_bot" target="_blank" class="code">@ru_pota_bot</a> в Telegram, нажмите <span class="code">/start</span> и укажите позывной через <span class="code">/callsign</span>.<br>
                    &bull; <strong>Важно для группы:</strong> в чате работает антиспам (RU-POTA Shield). Без привязки позывного бот удаляет ссылки и теги новичков. Регистрация снимает все ограничения!
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- 3. Экосистема RU-POTA -->
          <div class="section-card">
            <div class="section-title">3. Цифровая инфраструктура RU-POTA: Веб-хаб, Карта и Бот</div>
            <div class="grid-2">
              <div style="display: flex; flex-direction: column; gap: 5px;">
                <div class="sub-card">
                  <div class="sub-card-title">
                    <span>Интерактивная карта и Веб-хаб</span>
                    <span class="pill pill-amber">1428 парков (RU, BY, KZ)</span>
                  </div>
                  <p style="margin-bottom: 2.5px;">
                    &bull; <strong>Внутри Telegram:</strong> <a href="https://t.me/ru_pota_bot/app" target="_blank" class="url">t.me/ru_pota_bot/app</a> (полноэкранный Mini App)<br>
                    &bull; <strong>В браузере (ПК / смартфон):</strong> <a href="https://pota.r9o.ru/app/" target="_blank" class="url">https://pota.r9o.ru/app/</a>
                  </p>
                  <p>
                    <strong>Карта (1428 парков):</strong> радиолюбительские слои RDA, RAZA, RAFA, SOTA, пульсирующие маркеры станций в эфире.<br>
                    <strong>Живой кластер:</strong> фильтры по диапазонам (160m&ndash;70cm) и видам модуляции (SSB, CW, FT8), споттинг и QRT в один тап. Быстрый вход на ПК по коду <span class="code">/login</span>.
                  </p>
                </div>

                <div class="callout callout-success">
                  <div class="callout-title">Круглосуточный канал спотов @pota_activity</div>
                  Все споты оперативно транслируются в канал <a href="https://t.me/pota_activity" target="_blank" class="code">@pota_activity</a>. Каждое оповещение закрепляется на 30 минут и автоматически снимается по истечении актуальности, не засоряя историю чата.
                </div>
              </div>

              <div>
                <div class="sub-card" style="height: 100%;">
                  <div class="sub-card-title">Справочник команд бота @ru_pota_bot</div>
                  <table class="cmd-table">
                    <thead>
                      <tr>
                        <th style="width: 28%;">Команда</th>
                        <th>Назначение и возможности</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><span class="code">/onair</span></td>
                        <td>Кто в эфире прямо сейчас: RU/BY/KZ за 40 мин + мировой топ-10 с фильтрами по модам и диапазонам.</td>
                      </tr>
                      <tr>
                        <td><span class="code">/spot</span></td>
                        <td>Интерактивный мастер Wizard: отправка спота в кластер и канал, смена QRG/моды, кнопка QRT.</td>
                      </tr>
                      <tr>
                        <td><span class="code">/sub</span></td>
                        <td>Персональные подписки на позывные друзей и избранные парки (мгновенные алерты в ЛС, тумблер паузы).</td>
                      </tr>
                      <tr>
                        <td><span class="code">/park [код]</span></td>
                        <td>Справка по парку (напр. <span class="code">/park RU-0073</span>): RDA, координаты, карта, история связей.</td>
                      </tr>
                      <tr>
                        <td><span class="code">/stats [поз]</span></td>
                        <td>Карточка статистики радиолюбителя: активации, QSO, зачтённые парки и дипломы со ссылками.</td>
                      </tr>
                      <tr>
                        <td><span class="code">/plans</span></td>
                        <td>Календарь официальных запланированных выездов POTA (RU/СНГ и весь мир) с показом на карте.</td>
                      </tr>
                      <tr>
                        <td><span class="code">/login</span></td>
                        <td>Одноразовый 6-значный код для мгновенного входа в веб-хаб pota.r9o.ru на ПК без пароля.</td>
                      </tr>
                      <tr>
                        <td><span class="code">/callsign</span></td>
                        <td>Регистрация или смена вашего радиолюбительского позывного в системе.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <!-- 4. Технический регламент радиосвязей в POTA -->
          <div class="section-card">
            <div class="section-title">4. Технический регламент радиосвязей и правила зачёта</div>
            <div class="grid-3">
              <div class="sub-card">
                <div class="sub-card-title">Диапазоны и модуляции</div>
                <p>
                  Разрешены любые радиолюбительские диапазоны (160&nbsp;м &ndash; 70&nbsp;см и выше) и любые моды: <strong>CW, SSB, FT8, FT4, RTTY, FM</strong>. Разрешена работа через радиолюбительские спутники (Satellite).
                </p>
              </div>
              <div class="sub-card">
                <div class="sub-card-title">Повторные связи (Dups)</div>
                <p>
                  Повторы с одним корреспондентом за одни календарные сутки UTC засчитываются, если они проведены <strong>на разных диапазонах</strong> либо <strong>разными модами</strong> (например, 40м CW и 40м SSB &mdash; 2 разных QSO).
                </p>
              </div>
              <div class="sub-card">
                <div class="sub-card-title">Ограничения и Park-to-Park</div>
                <p>
                  <strong>Запрещены:</strong> связи через наземные репитеры, эхолинки и интернет-шлюзы. Связи «Park-to-Park» (P2P) между двумя активаторами засчитываются одновременно и как активация, и как охота.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- Footer Page 1 -->
      <div class="footer">
        <div>Parks on the Air&reg; &bull; Русскоязычное радиолюбительское сообщество RU-POTA</div>
        <div class="footer-spirit">73 &amp; 44! &bull; Чистого эфира и надежного прохождения</div>
        <div>Страница 1 из 2</div>
      </div>
    </div>

    <!-- ==================== СТРАНИЦА 2 ==================== -->
    <div class="page">
      <div>
        <!-- Header Page 2 -->
        <div class="header">
          <div class="header-left">
            {f'<img src="data:image/png;base64,{logo_base64}" class="header-logo" alt="POTA Logo">' if logo_base64 else ''}
            <div class="header-title-box">
              <h1>RU-POTA &bull; Регламент парков и этика активаций</h1>
              <div class="subtitle">Критерии добавления ООПТ, официальные базы данных, ретро-логи и кодекс Ham Spirit</div>
            </div>
          </div>
          <div class="header-meta">
            <div class="badge-row">
              <span class="badge badge-dark">Регламент ООПТ</span>
              <span class="badge badge-accent">Spirit of HAM</span>
            </div>
            <div class="header-meta-text">Координатор программы: Manu (R2BBX)</div>
          </div>
        </div>

        <!-- Content Stack Page 2 -->
        <div class="content-stack">

          <!-- 5. Критерии добавления новых территорий -->
          <div class="section-card">
            <div class="section-title">5. Критерии включения территорий в каталог POTA (ООПТ)</div>
            <p style="font-size: 7.7pt; color: #334155; margin-bottom: 4px;">
              В программе POTA («Парки в эфире») объектами являются исключительно <strong>официальные охраняемые природные территории (ООПТ)</strong>. Обычные городские парки культуры и скверы не подлежат добавлению. Объект обязан отвечать 4 критериям:
            </p>

            <div class="grid-2">
              <div class="criteria-card">
                <div class="criteria-header">
                  <div class="criteria-num">1</div>
                  <h5>Официальный статус ООПТ</h5>
                </div>
                <p>Объект обязан иметь признанный статус: <strong>международный, федеральный или региональный</strong> (заповедники, нацпарки, природные парки, заказники, памятники природы). Местные парки без статуса ООПТ не принимаются.</p>
              </div>

              <div class="criteria-card">
                <div class="criteria-header">
                  <div class="criteria-num">2</div>
                  <h5>Государственная охрана (не коммерция)</h5>
                </div>
                <p>Территория находится под управлением государственных природоохранных органов. <strong>Частные владения, турбазы, коммерческие сафари-парки и охотхозяйства категорически запрещены.</strong></p>
              </div>

              <div class="criteria-card">
                <div class="criteria-header">
                  <div class="criteria-num">3</div>
                  <h5>Открытый легальный доступ граждан</h5>
                </div>
                <p>На территорию должен быть открыт доступ радиолюбителям (допускаются платный вход, билеты, пропуска дирекции или КПП). <strong>Закрытые режимные зоны, военные объекты и полигоны не принимаются.</strong></p>
              </div>

              <div class="criteria-card">
                <div class="criteria-header">
                  <div class="criteria-num">4</div>
                  <h5>Официальный реестр и верифицируемые границы</h5>
                </div>
                <p>На объект должен иметься нормативный акт с картографическим описанием границ. Если статус ООПТ снят (утрата ценности, пожар, застройка), парк подлежит исключению из реестра POTA.</p>
              </div>
            </div>

            <!-- Примеры: Подходит / Не подходит -->
            <div class="compare-box">
              <div class="compare-col compare-col-good">
                <div class="compare-col-title">&check; Подходит для включения в POTA:</div>
                &bull; Заповедник, национальный парк или заказник регионального/федерального значения.<br>
                &bull; Памятник природы субъекта РФ (реликтовая роща, памятное озеро, вековой дуб) с утверждённой охранной зоной.<br>
                &bull; ООПТ с платным посещением или доступом по предварительным пропускам дирекции.
              </div>

              <div class="compare-col compare-col-bad">
                <div class="compare-col-title">&cross; Не допускается к добавлению:</div>
                &bull; Городской парк культуры и отдыха без статуса ООПТ и нормативных актов.<br>
                &bull; Территория под управлением частной коммерческой фирмы или турбазы.<br>
                &bull; Сгоревший массив или территория, официально исключённая из реестра ООПТ.<br>
                &bull; Объект без публичных картографических границ и кадастровой привязки.
              </div>
            </div>
          </div>

          <!-- 6. Официальные базы и карты ООПТ -->
          <div class="section-card">
            <div class="section-title">6. Официальные базы данных и карты ООПТ России (проверка перед заявкой)</div>
            <div class="grid-2">
              <div class="sub-card">
                <div class="sub-card-title">
                  <span>База данных ООПТ РФ (карта.оцзк.рф)</span>
                  <span class="pill pill-green">Реестр и паспорта</span>
                </div>
                <p>
                  <strong>Ссылка:</strong> <a href="https://карта.оцзк.рф/" target="_blank" class="url">https://карта.оцзк.рф/</a> (<span class="code">xn--80aa2azak.xn--g1agk6a.xn--p1ai</span>)<br>
                  Официальная база данных охраняемых природных территорий России: центроиды, точные площади, категории защиты, нормативные документы и паспорта объектов.
                </p>
              </div>

              <div class="sub-card">
                <div class="sub-card-title">
                  <span>Интерактивная карта NextGIS (ooptaari)</span>
                  <span class="pill pill-blue">Слои и границы</span>
                </div>
                <p>
                  <strong>Ссылка:</strong> <a href="https://ooptaari.nextgis.ru/" target="_blank" class="url">https://ooptaari.nextgis.ru/</a><br>
                  Интерактивная кадастровая веб-карта ООПТ РФ: визуализация границ, зеркало паспортов объектов (<span class="code">/node/:id</span>), детализация зонирования и вложенных территорий.
                </p>
              </div>
            </div>
          </div>

          <!-- 7. Алгоритм подачи заявки на новый парк -->
          <div class="section-card">
            <div class="section-title">7. Порядок подачи заявки на регистрацию нового парка</div>
            <div class="workflow-grid">
              <div class="wf-step">
                <div class="wf-step-title"><span class="wf-badge">1</span> Проверка баз</div>
                <p>Найдите объект на <a href="https://карта.оцзк.рф/" target="_blank" class="url">карта.оцзк.рф</a> или <a href="https://ooptaari.nextgis.ru/" target="_blank" class="url">ooptaari.nextgis.ru</a>, убедитесь в наличии действующего статуса и границ.</p>
              </div>
              <div class="wf-step">
                <div class="wf-step-title"><span class="wf-badge">2</span> Сбор реквизитов</div>
                <p>Подготовьте: точное наименование ООПТ, категорию, субъект РФ, район RDA, координаты центра и ссылку на нормативный акт.</p>
              </div>
              <div class="wf-step">
                <div class="wf-step-title"><span class="wf-badge">3</span> Отправка заявки</div>
                <p>Передайте сформированные данные региональному координатору Manu (<strong>@R2BBX</strong>) для верификации и включения в базу POTA.</p>
              </div>
            </div>
          </div>

          <!-- 8. Порядок активации и Ham Spirit -->
          <div class="section-card">
            <div class="section-title">8. Правила работы в эфире, ретро-логи и этика (Ham Spirit)</div>
            <div class="grid-3">
              <div class="sub-card">
                <div class="sub-card-title">Ретро-логи (с 2017 г.)</div>
                <p>
                  Если вы посещали ООПТ до присвоения ему номера в POTA &mdash; <strong>связи полностью засчитываются</strong>! Дата в логе считается от момента реальной связи. Система принимает логи за любые выезды начиная с <strong>2017 года</strong>.
                </p>
              </div>

              <div class="sub-card">
                <div class="sub-card-title">Границы и парковки</div>
                <p>
                  Станция считается находящейся в ООПТ, если рабочее место развернуто внутри границ парка, либо <strong>непосредственно у его периметра</strong> (у забора или на входной парковке). Координатор всегда стремится трактовать спорные точки в пользу активатора.
                </p>
              </div>

              <div class="sub-card">
                <div class="sub-card-title">«Активатор всегда прав»</div>
                <p>
                  В POTA отсутствует бюрократическая слежка и требования видеодоказательств. Если лог загружен и принят системой &mdash; активация состоялась. Доверие к радиолюбителю и дух Ham Spirit стоят на первом месте: обманывая правила, человек обманывает только собственную совесть.
                </p>
              </div>
            </div>
          </div>

          <!-- 9. Справочник ссылок и контакты -->
          <div class="section-card">
            <div class="section-title">9. Полезные ресурсы и контакты координаторов сообщества</div>
            <div class="grid-2">
              <div>
                <table class="cmd-table">
                  <tbody>
                    <tr>
                      <td style="font-weight: 700; width: 36%;">Международный портал:</td>
                      <td><a href="https://pota.app" target="_blank" class="url">https://pota.app</a> (официальный сайт POTA)</td>
                    </tr>
                    <tr>
                      <td style="font-weight: 700;">Новая версия сайта:</td>
                      <td><a href="https://next.pota.app" target="_blank" class="url">https://next.pota.app</a> (русский интерфейс)</td>
                    </tr>
                    <tr>
                      <td style="font-weight: 700;">Реестр ООПТ России:</td>
                      <td><a href="https://карта.оцзк.рф/" target="_blank" class="url">https://карта.оцзк.рф/</a> (паспорта и кадастр)</td>
                    </tr>
                    <tr>
                      <td style="font-weight: 700;">Карта ООПТ NextGIS:</td>
                      <td><a href="https://ooptaari.nextgis.ru/" target="_blank" class="url">https://ooptaari.nextgis.ru/</a> (слои и границы)</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div>
                <table class="cmd-table">
                  <tbody>
                    <tr>
                      <td style="font-weight: 700; width: 36%;">Веб-хаб RU-POTA:</td>
                      <td><a href="https://pota.r9o.ru/app/" target="_blank" class="url">https://pota.r9o.ru/app/</a> (карта, кластер, споты)</td>
                    </tr>
                    <tr>
                      <td style="font-weight: 700;">Telegram-бот и канал:</td>
                      <td><a href="https://t.me/ru_pota_bot" target="_blank" class="code">@ru_pota_bot</a> &bull; канал: <a href="https://t.me/pota_activity" target="_blank" class="code">@pota_activity</a></td>
                    </tr>
                    <tr>
                      <td style="font-weight: 700;">Координатор POTA RU:</td>
                      <td>Manu (<strong>@R2BBX</strong>) &mdash; добавление и проверка парков</td>
                    </tr>
                    <tr>
                      <td style="font-weight: 700;">Разработчик бота и хаба:</td>
                      <td>Сан Саныч (<strong>@r9ogl</strong>) &mdash; техподдержка и предложения</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- Footer Page 2 -->
      <div class="footer">
        <div>Parks on the Air&reg; Community &bull; Некоммерческая программа радиосвязи из охраняемых природных территорий</div>
        <div class="footer-spirit">Spirit of HAM &bull; До встречи в эфире из парков! 73 &amp; 44!</div>
        <div>Страница 2 из 2</div>
      </div>
    </div>

  </div>

</body>
</html>
"""

    output_dir = r"E:\dev\potabot\docs"
    dist_dir = r"E:\dev\potabot\dist\webapp"
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(dist_dir, exist_ok=True)

    pdf_path = os.path.join(output_dir, "RU-POTA_Quick_Guide.pdf")
    html_path = os.path.join(output_dir, "RU-POTA_Quick_Guide.html")

    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    page = QWebEnginePage()
    loop = QEventLoop()

    def on_load_finished(ok):
        if not ok:
            loop.quit()
            return
        layout = QPageLayout(QPageSize(QPageSize.A4), QPageLayout.Portrait, QMarginsF(0, 0, 0, 0))
        page.printToPdf(pdf_path, layout)

    def on_pdf_finished(filepath, success):
        loop.quit()

    page.loadFinished.connect(on_load_finished)
    page.pdfPrintingFinished.connect(on_pdf_finished)
    page.setHtml(html_content)
    loop.exec()

    root_pdf = r"E:\dev\potabot\RU-POTA_Quick_Guide.pdf"
    if os.path.exists(pdf_path):
        shutil.copy2(pdf_path, root_pdf)
        # Also copy to dist/webapp for static web serving
        shutil.copy2(pdf_path, os.path.join(dist_dir, "RU-POTA_Quick_Guide.pdf"))
        shutil.copy2(pdf_path, os.path.join(dist_dir, "guide.pdf"))
        shutil.copy2(pdf_path, os.path.join(dist_dir, "memo.pdf"))
        shutil.copy2(html_path, os.path.join(dist_dir, "guide.html"))
        shutil.copy2(html_path, os.path.join(dist_dir, "memo.html"))
        shutil.copy2(html_path, os.path.join(dist_dir, "index_guide.html"))
        print(f"Generated PDF ({os.path.getsize(pdf_path)} bytes) & HTML assets copied to dist/webapp and root.")

        doc = QPdfDocument()
        doc.load(pdf_path)
        print(f"Total pages in PDF: {doc.pageCount()}")
        for i in range(doc.pageCount()):
            img = doc.render(i, QSize(1240, 1754))
            preview_path = os.path.join(output_dir, f"preview_page_{i+1}.png")
            img.save(preview_path)
            print(f"Saved preview page {i+1} to {preview_path} ({os.path.getsize(preview_path)} bytes)")

if __name__ == "__main__":
    generate_pdf()

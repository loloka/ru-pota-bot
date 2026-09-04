# RU-POTA Telegram Bot — Инструкция и контекст для нейросетей (AI Guidelines)

Этот файл содержит ключевые архитектурные правила, стек, ограничения и контекст для любых AI-ассистентов (Gemini, Claude, GPT), работающих с кодовой базой **RU-POTA Bot**.

---

## 🎯 1. О проекте и назначение
Многофункциональный Telegram-бот для радиолюбительского сообщества дипломной программы **Parks on the Air (RU-POTA)**.
- **Основной стек:** Node.js (ES Modules), Telegraf 4.x (Scenes, Wizards), better-sqlite3 (WAL mode), Axios.
- **Среда выполнения:** Node.js 18+ на Windows (Dev) / Ubuntu (Production VPS под PM2).

---

## ⚠️ 2. Критически важные правила разработки для AI

### 2.1. Синхронизация версий и документации
- При изменении функционала или добавлении фич **всегда синхронизировать версию** во всех местах:
  1. `package.json` (`version`)
  2. Стартовый баннер в `src/bot/index.js` (например, `RU-POTA Telegram Bot vX.Y.Z`)
  3. `User-Agent` в `src/api/potaApi.js` (`RU-POTA-Bot/X.Y.Z (Telegram Bot; Node.js)`)
  4. `CHANGELOG.md`, `README.md`, `ROADMAP.md` и `COMMANDS.md`.

### 2.2. Работа с базой данных (SQLite / better-sqlite3)
- Используется синхронный драйвер `better-sqlite3`.
- Все новые колонки или таблицы должны сопровождаться **безопасной автомиграцией** в `src/db/database.js` (через проверку `db.pragma('table_info(...)')`).
- Режим базы: WAL (`db.pragma('journal_mode = WAL')`).
- База данных хранится в папке `data/pota.db` (обязательно в `.gitignore`).

### 2.3. Взаимодействие с внешним API POTA (`api.pota.app`)
- **Бережное отношение к API:** не спамить лишними запросами.
- Данные, которые можно сохранить в локальную БД (например, имя радиолюбителя или название парка при подписке), сохраняются в SQLite при создании подписки (`target_name`), чтобы не запрашивать API повторно при каждом открытии меню `/sub`.
- **Сетевые таймауты:** таймаут Axios установлен на 25 000 мс из-за возможных сетевых задержек/блокировок на Cloudflare/AWS. Ошибки сети в воркерах должны логироваться как аккуратные предупреждения без краша процесса.

### 2.4. Форматирование радиолюбительских данных
- **Позывные:** всегда приводятся к `toUpperCase().trim()`.
  - Валидация по регулярным выражениям: `baseCallsignRegex = /^([A-Z0-9]{1,4}\/)?([A-Z0-9]{1,3}[0-9][A-Z0-9]{1,5})(\/[A-Z0-9]{1,4})?$/` и `hasLetterRegex = /[A-Z]/`.
- **Парки POTA:** формат `^[A-Z0-9]{1,4}-\d{4,5}$` (например, `RU-0001`, `RU-0073`, `BY-0010`).
- **Модуляции:** `SSB`, `CW`, `FT8`, `FT4`, `FM`, `AM`, `DIGI`.

### 2.5. Консоль и логирование
- Консоль бота должна быть информативной, читаемой и цветной (ANSI-коды).
- События разделяются по префиксам:
  - `[User Msg]` — входящие текстовые сообщения
  - `[Inline Action]` — нажатия на inline-кнопки
  - `[Cluster Spot]` — новые споты из кластера
  - `[Broadcast]` — отправка спота в канал
  - `[Notification]` — отправка персональных алертов подписчикам
  - `[POTA API]` — статус внешнего API

---

## 📁 3. Структура проекта
```text
potabot/
├── assets/                   # Брендовые ассеты (splash-icon.svg, pota_hub_banner.jpg для BotFather)
├── src/
│   ├── api/
│   │   └── potaApi.js        # REST клиент к api.pota.app (getSpots, getStats, getPark, postSpot)
│   ├── bot/
│   │   ├── commands/         # Обработчики команд (/start, /spot, /stats, /park, /sub, /mod, /callsign, /onair)
│   │   ├── middlewares/      # Проверки чатов, rate limit, автоудаление системных сообщений
│   │   ├── scenes/           # Telegraf Wizard-сцены (spotWizard, parkWizard, callsignWizard, subWizard, editSpotWizard)
│   │   ├── utils.js          # Хелперы (deleteUserMessage, replyWithAutoDelete)
│   │   └── index.js          # Инициализация Telegraf, регистрация сцен/кнопок, запуск воркеров
│   ├── data/
│   │   └── parks_fallback.json # Офлайн-датасет 668 парков POTA (RU, BY, KZ) для мгновенного старта карты
│   ├── db/
│   │   └── database.js       # SQLite инициализация, схема таблиц (users, spots, subscriptions) и миграции
│   ├── services/
│   │   └── clusterWorker.js  # Фоновый опрос кластера POTA, дедупликация, рассылка в канал и подписчикам
│   ├── web/
│   │   ├── admin.js          # HTTP-сервер Express, модерация, Web Admin 2.0
│   │   ├── tmaApi.js         # REST API для Telegram Mini App (/me, /spots, /parks, /lookup, /subscriptions)
│   │   └── tmaAuth.js        # HMAC-SHA256 криптографическая проверка initData + гостевой режим
│   └── webapp/               # React 18 + Vite + Tailwind CSS + Leaflet SPA-приложение
│       ├── src/              # Компоненты, табы (Dashboard, Cluster, Map, Subs, Profile)
│       └── index.html        # HTML-шаблон TMA
├── data/                     # Файлы локальной БД (pota.db — обязательно в .gitignore)
├── dist/webapp/              # Скомпилированный продакшен-бандл Mini App (раздается по /app)
├── .env.example              # Переменные окружения
├── CHANGELOG.md              # История изменений
├── COMMANDS.md               # Документация команд для пользователей
├── DEPLOY.md                 # Инструкции по деплою (PM2 / Ubuntu / update-bot.sh)
├── ROADMAP.md                # Планы развития проекта
├── spec.md                   # Исходная техническая спецификация
└── GEMINI.md                 # Этот файл правил для AI-ассистентов
```

---

## 🔒 4. Безопасность и Git
- **Никогда не коммитить:** `.env`, файлы базы данных (`data/`, `*.sqlite`, `*.db`), логи (`*.log`), временные файлы.
- Команды модерации (`/ban`, `/kick`, `/mute`) и действия одобрения заявок (`admin_appr:*`) всегда должны проверять `ADMIN_ID` либо права администратора Telegram-чата.
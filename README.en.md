# RU-POTA Telegram Bot 🌲📡

[![Version](https://img.shields.io/badge/version-1.13.4-blue.svg)](package.json)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![Telegraf](https://img.shields.io/badge/telegraf-4.x-orange.svg)](https://telegraf.js.org/)
[![Database](https://img.shields.io/badge/SQLite-better--sqlite3%20(WAL)-lightgrey.svg)](https://github.com/WiseLibs/better-sqlite3)
[![License](https://img.shields.io/badge/license-MIT-purple.svg)](LICENSE)

**English Version** | [**Русская версия (README.md)**](README.md)

A feature-rich Telegram bot and platform built for the amateur radio community of the **Parks on the Air (POTA)** award program. Designed specifically for activators and park hunters across the RU/CIS region and worldwide.

The bot connects the Telegram community, the official POTA cluster API, personalized callsign/park notification subscriptions, and a modern web administration dashboard.

---

## 🔗 Community Links

| Resource | Link | Description |
|---|---|---|
| 🤖 **Telegram Bot** | [@ru_pota_bot](https://t.me/ru_pota_bot) | Main bot for spotting, subscriptions, and profile statistics |
| 📱 **Telegram Mini App** | [t.me/ru_pota_bot/app](https://t.me/ru_pota_bot/app) | Fullscreen mobile hub: map, live cluster, directory & spotting |
| 🌐 **Web Version** | [pota.r9o.ru/app/](https://pota.r9o.ru/app/) | Public guest access from any PC or mobile browser |
| 📢 **Activity Channel** | [@pota_activity](https://t.me/pota_activity) | Live broadcast of cluster spots and activator field announcements |
| 💬 **Community Chat** | [RU-POTA Chat](https://t.me/pota_activity) | Open discussion group (tap "Discuss" in the channel) |
| 🌐 **Official POTA** | [pota.app](https://pota.app) / [next.pota.app](https://next.pota.app) | International award program portal |

---

## ✨ Key Features

### 📡 1. Interactive Spotting (/spot)
- **Step-by-Step Wizard:** Submit field spots with status (*ON AIR NOW* or *PLANNED*), automated park data lookup from the official POTA API, Russian District Award (RDA) input, modulation selection (`SSB`, `CW`, `FT8`, `FT4`, `FM`, etc.), and TX power.
- **Dual Broadcast:** Spots are instantly published to [@pota_activity](https://t.me/pota_activity) and optionally forwarded to the official international POTA cluster.
- **Auto-Respot (Keep-Alive):** Automatically re-submits active spots 3 times every 10 minutes to maintain cluster visibility during field operations.
- **Spot Management:** One-click frequency adjustments, comment updates, mode switching, or instant deletion (which also removes the post from the Telegram channel).

### 🔔 2. Personal Subscriptions & Alerts (/sub)
- **Callsign Alerts:** Receive instant direct messages whenever a tracked friend or rare activator appears on the cluster:  
  `🚨 Your tracked operator R9OGL is on the air!`
- **Park Alerts:** Subscribe to specific park references (e.g., `RU-0001`, `RU-0073`) to be notified of new activations.
- **Smart Deduplication:** No spam — filters out duplicate spots and notifies subscribers only on fresh activations.
- **Inline Keyboard UI:** Easy one-tap subscription management directly within the bot chat.

### 🌐 3. Background Cluster Polling Worker
- Polls `api.pota.app` periodically every minute.
- Geo-prefix filtering (defaults to `RU-`, `BY-`, `KZ-`).
- **Intelligent RBN Anti-Spam Throttling:** Suppresses repetitive spots from automated skimmers (20-minute cooldown on same band & mode), while instantly passing broadcasts upon band change, mode change, park movement, or QRT announcements.
- Timed spot pinning and auto-unpinning after 30 minutes via `Pin Manager`.
- Automatically broadcasts new spots to the community channel and delivers alerts to active subscribers (with base callsign matching).

### 📊 4. Statistics & Park Directory
- **`/stats [callsign]`:** Comprehensive profile cards for activators and hunters (activations, unique parks, QSOs by mode, awards, recent expeditions).
  - **Interactive Links:** Park codes (e.g., [RU-0065](https://next.pota.app/park/RU-0065)) and operator callsigns are formatted as direct clickable links to the `next.pota.app` portal.
- **`/park [reference]`:** Park information cards with coordinates, RDA districts, hunter stats, and dynamic Yandex Maps integration.

### 📻 5. Who's On Air Right Now (/onair)
- **Instant Feed:** Live summary of activators currently operating, complete with spot comments, spotters, and clickable POTA links.
- **Unified Smart Mode (RU/CIS + World):** Displays domestic stations proudly at the top (`RU-, BY-, KZ-`), accompanied by top worldwide spots below.
- **Interactive Switching:** Inline toggle buttons between `🇷🇺 Только RU/СНГ` and `🌐 RU/СНГ + МИР`, with instant refresh and safe group permissions.

### 🖥 6. Web Admin Dashboard 2.0
Built-in authenticated web interface powered by Express 5 and Bootstrap 5 (`http://localhost:3000`):
- 🔐 **Session Authentication:** Password protected with persistent `cookie-session` storage and anti-bruteforce rate limiting.
- 👤 **Telegram Profile Integration:** Automatically fetches and displays user avatars, full names, and @usernames via the Telegram Bot API.
- ⚡ **AJAX Moderation in 1-Click:** Approve, reject (with custom reason prompt), or delete users without page reloads (SweetAlert2 modals & Toast notifications).
- 📻 **Spot Feed Management:** Real-time spot list with 5-second auto-refresh and instant spot removal synchronized with the Telegram channel.
- 💻 **Live Activity Console:** In-memory 200-event ring buffer capturing bot events in real time with circular JSON protection and ANSI color filtering.
- 📢 **Broadcaster:** Send formatted announcements to the channel or group with optional automatic pin.

### 📱 7. Telegram Mini App (RU-POTA Hub)
Modern embedded web interface in dark theme aesthetic (`https://pota.r9o.ru/app/` or `t.me/ru_pota_bot/app`):
- 🌐 **Guest Mode:** Open access for visitors outside Telegram to browse spots, interactive map, and callsign/park directory without login.
- 🏠 **Dashboard:** Field operation status, auto-respot timer, **POTA directory search** (`/stats` & `/park`), on-air station slider, and quick statistics.
- 📻 **Live Cluster:** Real-time spot feed with instant filters by band (40m, 20m...), mode (CW, SSB, FT8...), and region.
- 🗺 **Interactive Map (Leaflet):** 668 parks (RU/BY/KZ) with offline dataset fallback, R1CF WMS overlays (RDA, RAZA, RAFA, QTH, SOTA, RLHA), and multi-app routing (Yandex, 2GIS, OsmAnd).
- 🔔 **Subscription Management:** Segmented alerts (Callsigns / Parks) with direct DM notification toggle.
- 👤 **Profile:** Operator scorecard, callsign modification request, and Haptic Feedback toggle.

### 🛡 8. Chat Cleanliness & Moderation
- **Gatekeeper:** Automatically purges Telegram service messages ("User joined/left the group") and sends a temporary welcome greeting that auto-deletes after 2 minutes.
- **Command Auto-Deletion:** User command messages in public groups are automatically removed to keep chat history clean.
- **Moderator Commands:** `/ban`, `/kick`, `/mute` executed via Reply to offending messages.

---

## 📋 Bot Commands

| Command | Chat Scope | Description |
|---|---|---|
| `/start` | DM / Group | Bot launch, greeting, main menu, and callsign registration |
| `/spot` | DM | Create a new spot or manage your current active spot |
| `/onair` | DM / Group | Summary of stations currently on air (RU/CIS and Worldwide) |
| `/sub` | DM | Manage personal alerts for callsigns and park references |
| `/sub [callsign]` | DM | Quick subscribe/unsubscribe for an operator (e.g. `/sub R9OGL`) |
| `/sub [park]` | DM | Quick subscribe/unsubscribe for a park code (e.g. `/sub RU-0065`) |
| `/stats` | DM / Group | View your personal POTA stats |
| `/stats [callsign]` | DM / Group | View POTA statistics for any amateur radio callsign |
| `/park [code]` | DM / Group | POTA park directory card (e.g. `/park RU-0073`) |
| `/callsign` | DM | Register or update your amateur callsign |
| `/help` | DM / Group | Quick help manual and developer contact |
| `/ban` | Group (Reply) | *(Admin)* Permanently ban a user from the group |
| `/kick` | Group (Reply) | *(Admin)* Remove a user from the group |
| `/mute` | Group (Reply) | *(Admin)* Restrict a user from sending messages |

---

## 🛠 Tech Stack

- **Runtime:** Node.js 18+ (ES Modules).
- **Telegram Framework:** [Telegraf](https://github.com/telegraf/telegraf) 4.16+ (Scenes, Wizards, Middleware).
- **Database:** [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (synchronous SQLite in WAL mode with auto-migrations).
- **HTTP Client:** Axios with 25,000ms timeouts and graceful retry handling.
- **Proxy Support:** SOCKS5 proxy (`TG_PROXY`) and Cloudflare Workers reverse proxy (`TG_API_ROOT`) for restrictive network environments.

---

## 🚀 Quick Start (Local Development)

### 1. Clone the repository
```bash
git clone https://github.com/loloka/ru-pota-bot.git
cd ru-pota-bot
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
Copy the sample `.env.example` file to `.env`:
```bash
cp .env.example .env
```
Fill in your credentials:
```env
BOT_TOKEN=1234567890:ABCDefGhIJklMNopQRstUVwxYZ
MAIN_CHAT_ID=-1001234567890
ACTIVITY_CHANNEL_ID=-1000987654321
ADMIN_ID=123456789
ADMIN_PASSWORD=your_secure_password
```

### 4. Start the bot
```bash
npm run dev
```
The administration panel will be available at `http://localhost:3000` (username: `admin`, password from `.env`).

---

## 📦 Production Deployment (Ubuntu + PM2)

For complete instructions on VPS deployment, PM2 process management, log rotation, and Nginx reverse proxy configuration, refer to **[DEPLOY.md](DEPLOY.md)**.

Quick deployment commands:
```bash
git clone https://github.com/loloka/ru-pota-bot.git /opt/potabot
cd /opt/potabot
npm install --production
cp .env.example .env && nano .env
pm2 start src/bot/index.js --name potabot
pm2 save
pm2 startup
```

---

## 📄 Documentation

- 📖 [COMMANDS.md](COMMANDS.md) — Comprehensive user manual for bot commands.
- 🚀 [DEPLOY.md](DEPLOY.md) — Production VPS installation and deployment guide.
- 🗺 [ROADMAP.md](ROADMAP.md) — Feature development roadmap.
- 📝 [CHANGELOG.md](CHANGELOG.md) — Complete release version history.
- 🤖 [GEMINI.md](GEMINI.md) — AI assistant rules and architectural guidelines.

---

## 🤝 Feedback & Contributions
Issues, pull requests, and feature requests are welcome!
- Telegram Bot: [@ru_pota_bot](https://t.me/ru_pota_bot)
- Activity Channel: [@pota_activity](https://t.me/pota_activity)

73 & 44! 🌲📻

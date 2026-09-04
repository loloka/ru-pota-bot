#!/usr/bin/env bash
set -e

echo "🌲 [RU-POTA] Обновление бота и Telegram Mini App..."

# 1. Сброс локальных авто-изменений package-lock
git checkout package-lock.json 2>/dev/null || true

# 2. Получение последних изменений из репозитория
git pull

# 3. Установка зависимостей (включая сборщик)
npm install --include=dev

# 4. Сборка фронтенда Telegram Mini App
npm run build

# 4. Перезапуск процесса в PM2
pm2 restart ru-pota-bot --update-env || pm2 start src/bot/index.js --name ru-pota-bot

echo "✅ [RU-POTA] Бот и Mini App успешно собраны и перезапущены!"

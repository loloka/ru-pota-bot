#!/usr/bin/env bash
set -e

echo "🌲 [RU-POTA] Обновление бота и Telegram Mini App..."

# 1. Получение последних изменений из репозитория
git pull

# 2. Установка зависимостей
npm install

# 3. Сборка фронтенда Telegram Mini App
npm run build

# 4. Перезапуск процесса в PM2
pm2 restart ru-pota-bot --update-env || pm2 start src/bot/index.js --name ru-pota-bot

echo "✅ [RU-POTA] Бот и Mini App успешно собраны и перезапущены!"

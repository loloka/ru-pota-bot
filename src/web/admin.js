import express from 'express';
import db from '../db/database.js';

export const startAdminServer = (telegramClient) => {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Use JSON middleware (if we add API later) and urlencoded for forms
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Basic HTTP Authentication
  app.use((req, res, next) => {
    const adminPassword = process.env.ADMIN_PASSWORD || 'qwerty12345';
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    
    if (login === 'admin' && password === adminPassword) {
      return next();
    }
    
    res.set('WWW-Authenticate', 'Basic realm="Admin Panel"');
    res.status(401).send('Требуется авторизация.');
  });

  // Basic HTML template function
  const renderHTML = (content) => `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>RU-POTA Admin</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f4f4f9; }
        h1, h2 { color: #333; }
        .card { background: white; padding: 15px; margin-bottom: 15px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); border-left: 5px solid #ccc; }
        .card.pending { border-left-color: #ff9800; }
        .card.approved { border-left-color: #4caf50; }
        .card.rejected { border-left-color: #f44336; }
        .btn { padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; color: white; text-decoration: none; display: inline-block; font-size: 13px; margin-right: 5px; }
        .btn-approve { background: #4caf50; }
        .btn-reject { background: #f44336; }
        .btn-delete { background: #9e9e9e; }
        .actions { margin-top: 10px; }
        .broadcast-form { background: white; padding: 15px; margin-bottom: 20px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); border-left: 5px solid #2196F3; }
        .broadcast-form textarea { width: 100%; height: 80px; margin-top: 10px; margin-bottom: 10px; font-family: inherit; padding: 8px; box-sizing: border-box; resize: vertical; }
        .broadcast-form select { padding: 8px; margin-top: 10px; margin-bottom: 10px; width: 100%; box-sizing: border-box; }
      </style>
    </head>
    <body>
      <h1>RU-POTA Модерация</h1>
      ${content}
    </body>
    </html>
  `;

  // Helper to generate user card
  const generateUserCard = (u) => `
    <div class="card ${u.status}">
      <strong>Позывной:</strong> ${u.callsign} <br>
      <strong>Telegram ID:</strong> ${u.telegram_id} <br>
      <strong>Статус:</strong> ${u.status.toUpperCase()} <br>
      <strong>Дата регистрации:</strong> ${new Date(u.created_at).toLocaleString('ru-RU')}
      <div class="actions">
        ${u.status !== 'approved' ? `<form method="POST" action="/approve/${u.telegram_id}" style="display:inline;"><button type="submit" class="btn btn-approve">Одобрить</button></form>` : ''}
        ${u.status !== 'rejected' ? `
          <form method="POST" action="/reject/${u.telegram_id}" style="display:inline;" onsubmit="const r = prompt('Укажите причину отклонения (опционально):'); if(r===null) return false; this.reason.value = r;">
            <input type="hidden" name="reason" value="">
            <button type="submit" class="btn btn-reject">Отклонить</button>
          </form>
        ` : ''}
        <form method="POST" action="/delete/${u.telegram_id}" style="display:inline;" onsubmit="return confirm('Точно удалить пользователя? Он исчезнет из базы навсегда.');">
          <button type="submit" class="btn btn-delete">Удалить</button>
        </form>
      </div>
    </div>
  `;

  // Dashboard route
  app.get('/', (req, res) => {
    const stmt = db.prepare("SELECT telegram_id, callsign, status, created_at FROM users ORDER BY created_at DESC");
    const allUsers = stmt.all();

    const pending = allUsers.filter(u => u.status === 'pending');
    const approved = allUsers.filter(u => u.status === 'approved');
    const rejected = allUsers.filter(u => u.status === 'rejected');

    let html = '';
    
    html += `
      <div class="broadcast-form">
        <h2>📢 Рассылка от имени бота</h2>
        <form method="POST" action="/broadcast">
          <label for="target">Куда отправить:</label>
          <select name="target" id="target">
            <option value="group">Основная группа (MAIN_CHAT_ID)</option>
            <option value="channel">Канал активности (ACTIVITY_CHANNEL_ID)</option>
          </select>
          <textarea name="message" placeholder="Введите текст сообщения..." required></textarea>
          <button type="submit" class="btn btn-approve">Отправить сообщение</button>
        </form>
      </div>
    `;

    html += `<h2>Заявки на модерацию (${pending.length})</h2>`;
    if (pending.length === 0) html += '<p>Нет новых заявок.</p>';
    else html += pending.map(generateUserCard).join('');

    html += `<h2>Активные пользователи (${approved.length})</h2>`;
    if (approved.length === 0) html += '<p>Пока никого нет.</p>';
    else html += approved.map(generateUserCard).join('');

    html += `<h2>Отклоненные (${rejected.length})</h2>`;
    if (rejected.length > 0) html += rejected.map(generateUserCard).join('');

    res.send(renderHTML(html));
  });

  // Broadcast route
  app.post('/broadcast', async (req, res) => {
    const { target, message } = req.body;
    
    let targetId;
    if (target === 'group') {
      targetId = process.env.MAIN_CHAT_ID;
    } else if (target === 'channel') {
      targetId = process.env.ACTIVITY_CHANNEL_ID;
    }

    if (!targetId) {
      return res.status(400).send('Ошибка: ID целевого чата не задан в конфигурации (.env)');
    }

    try {
      await telegramClient.sendMessage(targetId, message, { parse_mode: 'HTML' });
      console.log(`[Broadcast] Admin sent message to ${target} (${targetId})`);
      res.redirect('/');
    } catch (err) {
      console.error('[Broadcast] Error sending message:', err);
      res.status(500).send(`Ошибка отправки сообщения: ${err.message}`);
    }
  });

  // Approve route
  app.post('/approve/:id', async (req, res) => {
    const telegramId = req.params.id;
    try {
      db.prepare("UPDATE users SET status = 'approved' WHERE telegram_id = ?").run(telegramId);
      await telegramClient.sendMessage(telegramId, '🎉 Ваш аккаунт подтвержден. Спасибо что вы с нами :)\nТеперь у вас есть возможность отправлять споты в наш канал и кластер POTA!\n\nИспользуйте меню ниже, либо нажмите /start');
      res.redirect('/');
    } catch (err) {
      console.error('Error approving user:', err);
      res.status(500).send('Error approving user');
    }
  });

  // Reject route
  app.post('/reject/:id', async (req, res) => {
    const telegramId = req.params.id;
    const reason = req.body.reason || 'Причина не указана';
    try {
      db.prepare("UPDATE users SET status = 'rejected', reject_reason = ? WHERE telegram_id = ?").run(reason, telegramId);
      await telegramClient.sendMessage(telegramId, `❌ Ваша заявка на регистрацию позывного была отклонена модератором.\n\nПричина: ${reason}\n\nВы можете подать заявку повторно, используя команду /callsign`);
      res.redirect('/');
    } catch (err) {
      console.error('Error rejecting user:', err);
      res.status(500).send('Error rejecting user');
    }
  });

  // Delete route
  app.post('/delete/:id', async (req, res) => {
    const telegramId = req.params.id;
    try {
      db.prepare("DELETE FROM users WHERE telegram_id = ?").run(telegramId);
      // We can also let the user know they were deleted
      try {
        await telegramClient.sendMessage(telegramId, '⚠️ Ваш аккаунт был удален администратором. Вы можете зарегистрироваться заново с помощью команды /callsign');
      } catch (e) {
        // Ignore if bot blocked etc.
      }
      res.redirect('/');
    } catch (err) {
      console.error('Error deleting user:', err);
      res.status(500).send('Error deleting user');
    }
  });

  app.listen(PORT, () => {
    console.log(`🌐 Admin panel listening on http://localhost:${PORT}`);
  });
};

import db from '../../db/database.js';
import { potaApi } from '../../api/potaApi.js';
import { deleteUserMessage, replyWithAutoDelete } from '../utils.js';

const baseCallsignRegex = /^([A-Z0-9]{1,4}\/)?([A-Z0-9]{1,3}[0-9][A-Z0-9]{1,5})(\/[A-Z0-9]{1,4})?$/;
const hasLetterRegex = /[A-Z]/;
const parkRefRegex = /^[A-Z0-9]{1,4}-\d{4,5}$/;

export const getSubsKeyboard = (userId) => {
  const stmt = db.prepare('SELECT type, target, target_name FROM subscriptions WHERE telegram_id = ? ORDER BY type, target');
  const subs = stmt.all(userId);
  
  const userRecord = db.prepare('SELECT notifications_enabled FROM users WHERE telegram_id = ?').get(userId);
  const notificationsEnabled = userRecord ? Boolean(userRecord.notifications_enabled ?? 1) : true;

  const callsignSubs = subs.filter(s => s.type === 'callsign');
  const parkSubs = subs.filter(s => s.type === 'park');

  let text = '🔔 <b>Управление подписками</b>\n\n';

  if (subs.length === 0) {
    text += 'ℹ️ <i>У вас пока нет активных подписок.</i>\n\n' +
            'Вы можете подписаться на споты интересующего вас радиолюбителя (позывной) или отслеживать активность в нужном парке POTA (референция).\n\n' +
            'Как только спот появится в кластере, бот сразу пришлет вам уведомление в ЛС!';
  } else {
    text += '<b>Ваши активные подписки:</b>\n\n';
    if (callsignSubs.length > 0) {
      text += '📻 <b>Позывные:</b>\n' + callsignSubs.map(s => {
        const nameStr = s.target_name ? ` — <i>${s.target_name}</i>` : '';
        return `• <code>${s.target}</code>${nameStr}`;
      }).join('\n') + '\n\n';
    }
    if (parkSubs.length > 0) {
      text += '🏞 <b>Парки POTA:</b>\n' + parkSubs.map(s => {
        const nameStr = s.target_name ? ` — <i>${s.target_name}</i>` : '';
        return `• <code>${s.target}</code>${nameStr}`;
      }).join('\n') + '\n\n';
    }
  }

  text += '\n' + (notificationsEnabled 
    ? '🔔 <b>Оповещения в ЛС:</b> Включены ✅' 
    : '🔕 <b>Оповещения в ЛС:</b> Отключены ⏸') +
    '\n\nНажмите кнопку ниже, чтобы настроить оповещения или подписки:';

  const notifyBtn = notificationsEnabled
    ? { text: '🔕 Отключить уведомления в ЛС', callback_data: 'sub_toggle_alerts' }
    : { text: '🔔 Включить уведомления в ЛС', callback_data: 'sub_toggle_alerts' };

  const inline_keyboard = [
    [
      { text: '➕ Позывной', callback_data: 'sub_add_callsign' },
      { text: '➕ Парк', callback_data: 'sub_add_park' }
    ],
    [notifyBtn]
  ];

  if (subs.length > 0) {
    inline_keyboard.push([{ text: '❌ Удалить подписку', callback_data: 'sub_delete_menu' }]);
  }

  return {
    text,
    reply_markup: { inline_keyboard }
  };
};


export const getDeleteSubsKeyboard = (userId) => {
  const stmt = db.prepare('SELECT id, type, target, target_name FROM subscriptions WHERE telegram_id = ? ORDER BY type, target');
  const subs = stmt.all(userId);

  if (subs.length === 0) {
    return getSubsKeyboard(userId);
  }

  const inline_keyboard = subs.map(s => {
    const icon = s.type === 'callsign' ? '📻' : '🏞';
    const label = s.target_name ? `❌ ${icon} ${s.target} (${s.target_name})` : `❌ ${icon} ${s.target}`;
    // Telegram inline button text limit is 64 chars, keep it concise
    const trimmedLabel = label.length > 40 ? label.substring(0, 37) + '...' : label;
    return [{ text: trimmedLabel, callback_data: `delsub:${s.type}:${s.target}` }];
  });

  inline_keyboard.push([{ text: '🔙 Назад к списку', callback_data: 'sub_action_back' }]);

  return {
    text: '🗑 <b>Удаление подписок</b>\n\nНажмите на подписку, которую хотите удалить:',
    reply_markup: { inline_keyboard }
  };
};

export const subHandler = async (ctx) => {
  if (ctx.chat?.type !== 'private') {
    await deleteUserMessage(ctx);
    return replyWithAutoDelete(ctx, 
      `ℹ️ Управление подписками доступно только в личных сообщениях 👇`, 
      {
        reply_markup: {
          inline_keyboard: [[{ text: '👉 Перейти к боту 👈', url: `https://t.me/${ctx.botInfo.username}` }]]
        }
      }
    );
  }

  const userId = ctx.from.id;
  const args = ctx.message.text.split(' ').filter(Boolean);

  if (args.length < 2) {
    const { text, reply_markup } = getSubsKeyboard(userId);
    return ctx.reply(text, { parse_mode: 'HTML', reply_markup });
  }

  const target = args[1].toUpperCase().trim();

  // 1. Check if it's a park reference (e.g. RU-0001, BY-0010)
  if (parkRefRegex.test(target)) {
    try {
      const park = await potaApi.getPark(target);
      if (!park || !park.name) {
        return ctx.reply(`❌ Парк <b>${target}</b> не найден в реестре POTA. Проверьте правильность номера.`, { parse_mode: 'HTML' });
      }

      // Toggle subscription
      const existing = db.prepare('SELECT id FROM subscriptions WHERE telegram_id = ? AND type = ? AND target = ?').get(userId, 'park', target);
      if (existing) {
        db.prepare('DELETE FROM subscriptions WHERE id = ?').run(existing.id);
        return ctx.reply(`❌ Вы отписались от парка <b>${target}</b> (<i>${park.name}</i>).`, { parse_mode: 'HTML' });
      } else {
        db.prepare('INSERT INTO subscriptions (telegram_id, type, target, target_name) VALUES (?, ?, ?, ?)').run(userId, 'park', target, park.name);
        return ctx.reply(`✅ Вы успешно подписались на парк <b>${target}</b> (<i>${park.name}</i>)!`, { parse_mode: 'HTML' });
      }
    } catch (e) {
      if (e.response?.status === 404 || e.message?.includes('404')) {
        return ctx.reply(`❌ Парк <b>${target}</b> не существует в официальной базе POTA.`, { parse_mode: 'HTML' });
      }
      console.error('Error toggling park sub:', e);
      return ctx.reply('❌ Ошибка при проверке парка в POTA API.');
    }
  }

  // 2. Otherwise treat as callsign
  if (!baseCallsignRegex.test(target) || !hasLetterRegex.test(target)) {
    return ctx.reply(
      '❌ <b>Недопустимый формат.</b>\n\n' +
      'Введите позывной (например: <code>/sub R9OGL</code>) или номер парка (например: <code>/sub RU-0073</code>).',
      { parse_mode: 'HTML' }
    );
  }

  let callsignName = null;
  try {
    const stats = await potaApi.getStats(target);
    if (stats && stats.name) {
      callsignName = stats.name;
    }
  } catch (e) {}

  try {
    const existing = db.prepare('SELECT id FROM subscriptions WHERE telegram_id = ? AND type = ? AND target = ?').get(userId, 'callsign', target);
    if (existing) {
      db.prepare('DELETE FROM subscriptions WHERE id = ?').run(existing.id);
      const nameSuffix = callsignName ? ` (<i>${callsignName}</i>)` : '';
      return ctx.reply(`❌ Вы отписались от уведомлений о спотах от <b>${target}</b>${nameSuffix}.`, { parse_mode: 'HTML' });
    } else {
      db.prepare('INSERT INTO subscriptions (telegram_id, type, target, target_name) VALUES (?, ?, ?, ?)').run(userId, 'callsign', target, callsignName);
      const nameSuffix = callsignName ? ` (<i>${callsignName}</i>)` : '';
      return ctx.reply(`✅ Вы успешно подписались на уведомления о спотах от <b>${target}</b>${nameSuffix}!`, { parse_mode: 'HTML' });
    }
  } catch (error) {
    console.error('Error toggling callsign sub:', error);
    return ctx.reply('❌ Произошла ошибка базы данных.');
  }
};

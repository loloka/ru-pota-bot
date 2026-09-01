import { potaApi } from '../../api/potaApi.js';
import { deleteUserMessage } from '../utils.js';

export const statsHandler = async (ctx) => {
  await deleteUserMessage(ctx); // Убираем сообщение пользователя

  const args = ctx.message.text.split(' ');
  const callsign = args[1]?.toUpperCase() || ctx.state.user?.callsign;
  const userId = ctx.from?.id;

  const deleteBtn = {
    inline_keyboard: [[{ text: '❌ Удалить сообщение', callback_data: `delete_msg:${userId}` }]]
  };

  if (!callsign) {
    const isPrivate = ctx.chat?.type === 'private';
    
    let msgText = `ℹ️ <b>Укажите позывной для поиска</b>\n\n` +
                  `Чтобы я мог мгновенно показывать вашу личную статистику без ввода позывного, пожалуйста, зарегистрируйтесь.\n\n` +
                  `Для просмотра статистики любого радиолюбителя используйте команду:\n` +
                  `👉 <code>/stats [ПОЗЫВНОЙ]</code>`;
                  
    const opts = { parse_mode: 'HTML' };
    
    if (isPrivate) {
      opts.reply_markup = {
        inline_keyboard: [
          [{ text: '📝 Зарегистрироваться', callback_data: 'start_callsign' }],
          deleteBtn.inline_keyboard[0]
        ]
      };
    } else {
      opts.reply_markup = {
        inline_keyboard: [
          [{ text: '👉 В личные сообщения 👈', url: `https://t.me/${ctx.botInfo.username}` }],
          deleteBtn.inline_keyboard[0]
        ]
      };
    }
    
    return ctx.reply(msgText, opts);
  }

  try {
    const profile = await potaApi.getStats(callsign);
    
    const name = profile.name ? `👤 <b>Имя:</b> ${profile.name}\n` : '';
    const qth = profile.qth ? `📍 <b>QTH:</b> ${profile.qth} ${profile.grid ? `(${profile.grid})` : ''}\n` : '';
    
    let msg = `📊 <b>Профиль POTA: ${profile.callsign}</b>\n${name}${qth}\n`;
    
    // Активатор
    if (profile.stats?.activator) {
      msg += `🚀 <b>АКТИВАТОР:</b>\n` +
             `Активаций: ${profile.stats.activator.activations || 0}\n` +
             `Уникальных парков: ${profile.stats.activator.parks || 0}\n` +
             `QSO: ${profile.stats.activator.qsos || 0}\n\n`;
    }
    
    // Охотник
    if (profile.stats?.hunter) {
      msg += `🎯 <b>ОХОТНИК:</b>\n` +
             `Парков: ${profile.stats.hunter.parks || 0}\n` +
             `QSO: ${profile.stats.hunter.qsos || 0}\n\n`;
    }
    
    // Награды
    if (profile.stats?.awards) {
      msg += `🏆 <b>Награды:</b> ${profile.stats.awards}\n`;
    }
    
    // Последняя поездка
    if (profile.recent_activity?.activations && profile.recent_activity.activations.length > 0) {
      const last = profile.recent_activity.activations[0];
      msg += `\n🚗 <b>Последняя поездка:</b>\n` +
             `${last.date} | ${last.reference}\n` +
             `Всего QSO: ${last.total || 0} ` +
             `(CW: ${last.cw || 0}, DIGI: ${last.data || 0}, SSB: ${last.phone || 0})\n`;
    }
    
    // Последние схантченные (до 3 штук)
    if (profile.recent_activity?.hunter_qsos && profile.recent_activity.hunter_qsos.length > 0) {
      msg += `\n📡 <b>Последние связи (Охотник):</b>\n`;
      const recentHunts = profile.recent_activity.hunter_qsos.slice(0, 3);
      recentHunts.forEach(hunt => {
        const dateStr = hunt.date.split('T')[0];
        msg += `- <b>${hunt.callsign}</b> в ${hunt.reference} (${dateStr})\n`;
      });
    }
                
    const successMarkup = {
      inline_keyboard: [
        [{ text: '🌐 Профиль на сайте POTA', url: `https://next.pota.app/profile/${profile.callsign}` }],
        [{ text: '❌ Удалить сообщение', callback_data: `delete_msg:${userId}` }]
      ]
    };
                
    await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: successMarkup });
  } catch (error) {
    await ctx.reply(`❌ Не удалось получить статистику для ${callsign}. Возможно, позывной не найден.`, { reply_markup: deleteBtn });
  }
};

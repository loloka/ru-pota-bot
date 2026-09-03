import { Scenes } from 'telegraf';
import { potaApi } from '../../api/potaApi.js';
import { deleteUserMessage, replyWithAutoDelete } from '../utils.js';

export const parkWizard = new Scenes.WizardScene(
  'PARK_WIZARD',
  async (ctx) => {
    // If park reference was passed directly via command (e.g. /park RU-0073)
    if (ctx.scene.state.parkRef) {
      ctx.message.text = ctx.scene.state.parkRef;
      return parkWizard.steps[1](ctx);
    }
    
    if (ctx.chat?.type !== 'private') {
      await deleteUserMessage(ctx);
      await replyWithAutoDelete(ctx, `ℹ️ В группе используйте команду сразу с референцией парка. Например: /park RU-0065`);
      return ctx.scene.leave();
    }
    
    await ctx.reply('🏞️ Введите референцию парка POTA (например, RU-0073) для получения информации:\n\n<i>или введите /cancel для отмены</i>', { parse_mode: 'HTML' });
    return ctx.wizard.next();
  },
  async (ctx) => {
    await deleteUserMessage(ctx);
    if (!ctx.message?.text) return;
    const ref = ctx.message.text.toUpperCase().trim();
    
    const userId = ctx.from?.id;
    const deleteBtn = {
      inline_keyboard: [[{ text: '❌ Удалить сообщение', callback_data: `delete_msg:${userId}` }]]
    };

    if (ref === '/CANCEL') {
      await ctx.reply('🚫 Действие отменено.');
      return ctx.scene.leave();
    }
    
    if (ref.startsWith('/') || ctx.message.text.includes('Регистрация') || ctx.message.text.includes('Подписки') || ctx.message.text.includes('Инфо')) {
      await ctx.scene.leave();
      // We don't reply, just leave the scene so they can use the menu normally or we let the global handlers pick it up.
      // To ensure the global handler processes this command, we can re-emit it, but for simplicity, 
      // we'll just ask them to click again.
      await ctx.reply('🚫 Ввод отменен. Пожалуйста, повторите вашу команду.');
      return;
    }

    if (!/^[A-Z0-9]{1,4}-\d{4}$/.test(ref)) {
      await ctx.reply('❌ Неверный формат. Пожалуйста, введите референцию в формате RU-1234:');
      return;
    }

    try {
      // Fetch all data concurrently
      const [park, leaderboard, recent] = await Promise.all([
        potaApi.getPark(ref),
        potaApi.getParkLeaderboard(ref).catch(() => ({ activations: [], activator_qsos: [], hunter_qsos: [] })),
        potaApi.getParkActivations(ref).catch(() => [])
      ]);
      
      const name = park.name || 'Неизвестно';
      const type = park.parktypeDesc ? `(${park.parktypeDesc})` : '';
      const location = park.locationDesc || park.locationName || 'Не указано';
      const territory = park.entityName || 'Не указано';
      
      const firstActivator = park.firstActivator 
        ? `<a href="https://next.pota.app/profile/${park.firstActivator}">${park.firstActivator}</a> (${park.firstActivationDate})` 
        : 'Ещё не активирован';
        
      // Calculate stats
      const totalActivations = leaderboard.activations?.reduce((acc, curr) => acc + curr.count, 0) || 0;
      const totalQSOs = leaderboard.activator_qsos?.reduce((acc, curr) => acc + curr.count, 0) || 0;
      
      // Leader
      let leader = 'Нет данных';
      if (leaderboard.activator_qsos && leaderboard.activator_qsos.length > 0) {
        const leadCall = leaderboard.activator_qsos[0].callsign;
        leader = `<a href="https://next.pota.app/profile/${leadCall}">${leadCall}</a> (${leaderboard.activator_qsos[0].count} QSO)`;
      }
      
      // Last activator
      let lastActivator = 'Нет данных';
      if (recent && recent.length > 0) {
        const lastCall = recent[0].activeCallsign;
        const lastDate = recent[0].qso_date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
        lastActivator = `<a href="https://next.pota.app/profile/${lastCall}">${lastCall}</a> (${lastDate})`;
      }
      
      // User's own activity
      const myCall = ctx.state.user?.callsign;
      let myAct = 0;
      let myHunt = 0;
      if (myCall) {
        myAct = leaderboard.activations?.find(a => a.callsign === myCall)?.count || 0;
        myHunt = leaderboard.hunter_qsos?.find(a => a.callsign === myCall)?.count || 0;
      }
      
      // Top Hunters
      let topHuntersStr = '';
      if (leaderboard.hunter_qsos && leaderboard.hunter_qsos.length > 0) {
        const topHunters = leaderboard.hunter_qsos.slice(0, 3);
        topHuntersStr = `Топ Охотники: ` + topHunters.map(h => `<a href="https://next.pota.app/profile/${h.callsign}">${h.callsign}</a> (${h.count})`).join(', ') + `\n`;
      }
      
      let msg = `🏞️ <b>Парк <a href="https://next.pota.app/park/${ref}">${ref}</a></b>\n\n` +
                `<b>Название:</b> ${name} ${type}\n` +
                `<b>Локация:</b> ${location}\n` +
                `<b>Территория:</b> ${territory}\n\n` +
                `📊 <b>Статистика парка:</b>\n` +
                `Всего активаций: ${totalActivations} (QSO: ${totalQSOs})\n` +
                `Первый активатор: ${firstActivator}\n` +
                `Лидер по QSO: ${leader}\n` +
                `Последний активатор: ${lastActivator}\n` +
                topHuntersStr;
                
      if (myCall) {
        msg += `\n🎯 <b>Ваша активность (<a href="https://next.pota.app/profile/${myCall}">${myCall}</a>):</b>\n` +
               `Активатор: ${myAct > 0 ? myAct : '-'}, Охотник: ${myHunt > 0 ? myHunt : '-'}\n`;
      }

      const successMarkup = {
        inline_keyboard: [
          [{ text: '🌐 Подробная статистика парка', url: `https://next.pota.app/park/${ref}` }],
          [{ text: '❌ Удалить сообщение', callback_data: `delete_msg:${userId}` }]
        ]
      };

      if (park.latitude && park.longitude) {
        // Use fast Yandex static map API
        const mapUrl = `https://static-maps.yandex.ru/1.x/?ll=${park.longitude},${park.latitude}&z=10&size=600,450&l=map&pt=${park.longitude},${park.latitude},pm2rdm`;
        try {
          await ctx.replyWithPhoto({ url: mapUrl }, { caption: msg, parse_mode: 'HTML', reply_markup: successMarkup });
        } catch (e) {
          // If map fails, fallback to text
          await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: successMarkup });
        }
      } else {
        await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: successMarkup });
      }

    } catch (error) {
      await ctx.reply(`❌ Не удалось найти информацию по парку ${ref} в базе POTA.`, { reply_markup: deleteBtn });
    }
    
    return ctx.scene.leave();
  }
);

parkWizard.command('cancel', async (ctx) => {
  await ctx.reply('🚫 Поиск парка отменен.');
  return ctx.scene.leave();
});

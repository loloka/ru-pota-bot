import { getRegionalPotaStats } from '../../services/ooptService.js';
import { deleteUserMessage } from '../utils.js';

export const regionsHandler = async (ctx) => {
  await deleteUserMessage(ctx);

  const rawText = ctx.message?.text || '';
  const parts = rawText.split(/\s+/);
  const query = parts.slice(1).join(' ').trim();
  const userId = ctx.from?.id;

  const deleteBtn = {
    inline_keyboard: [[{ text: '❌ Удалить сообщение', callback_data: `delete_msg:${userId}` }]]
  };

  try {
    const statsData = getRegionalPotaStats();
    const summary = statsData.summary;
    const nonRestricted = statsData.regions.filter(r => !r.isRestricted);

    // 1. Specific Region Query (e.g. /regions RU-NZ or /regions Нижегородская)
    if (query) {
      const qLower = query.toLowerCase();
      const region = nonRestricted.find(r => 
        r.code.toLowerCase() === qLower || 
        r.name.toLowerCase().includes(qLower)
      );

      if (!region) {
        return ctx.reply(
          `🔍 <b>Регион «${escapeHtml(query)}» не найден.</b>\n\n` +
          `Попробуйте ввести код POTA (например, <code>/regions RU-NZ</code>) или точное название (например, <code>/regions Нижегородская</code>, <code>/regions Хакасия</code>).`,
          { parse_mode: 'HTML', reply_markup: deleteBtn }
        );
      }

      let statusEmoji = '🟢';
      if (region.coverageRate < 10) statusEmoji = '🔴';
      else if (region.coverageRate < 40) statusEmoji = '🟠';
      else if (region.coverageRate < 80) statusEmoji = '🟡';

      let comment = '';
      if (region.coverageRate >= 80) {
        comment = '🏆 <i>Регион максимально заполнен! Диплом «Вся область» здесь имеет наивысшую коллекционную ценность и честно отражает карту ООПТ.</i>';
      } else if (region.coverageRate >= 40) {
        comment = '🌲 <i>Хорошее покрытие. Основные заповедники и парки нанесены, список постепенно дорабатывается.</i>';
      } else if (region.coverageRate >= 10) {
        comment = '⏳ <i>Начальная стадия наполнения. Рекомендуется подавать заявки на новые ООПТ перед закрытием диплома.</i>';
      } else if (region.totalParks === 0) {
        comment = '⚠️ <i>В этом регионе пока нет ни одного созданного парка POTA. Вы можете стать первооткрывателем и подать первый объект!</i>';
      } else {
        comment = `💡 <i>Позиция координатора (Manu R2BBX): в регионе огромный фонд ООПТ (${region.ooptCandidates} объектов). Текущие ${region.totalParks} парков — лишь верхушка айсберга, диплом пока «авансовый», список будет расширяться!</i>`;
      }

      const msg = 
        `🗺️ <b>Статистика покрытия: ${escapeHtml(region.name)} (${region.code})</b>\n\n` +
        `🌲 <b>Парков в POTA:</b> ${region.totalParks}\n` +
        `   • Активировано (≥1 раз): ${region.activatedParks} (${region.activationRate}%)\n` +
        `   • Ждут первой связи: ${region.unactivatedParks}\n` +
        `🏞️ <b>В реестре ООПТ РФ:</b> ${Number(region.ooptCandidates).toLocaleString('ru-RU')} кандидатов\n\n` +
        `${statusEmoji} <b>Покрытие POTA:</b> <code>${region.coverageRate}%</code>\n` +
        `🎖️ <b>Статус диплома «Вся область»:</b> <b>${escapeHtml(region.diplomaStatusText)}</b>\n\n` +
        `📻 <b>Активность в эфире:</b>\n` +
        `   • Выездов активаторов: ${Number(region.totalActivations).toLocaleString('ru-RU')}\n` +
        `   • Проведено QSO: ${Number(region.totalQsos).toLocaleString('ru-RU')}\n\n` +
        `${comment}`;

      return ctx.reply(msg, { parse_mode: 'HTML', reply_markup: deleteBtn });
    }

    // 2. Overall Summary & Top Leaders / Potential Regions
    const sortedByCoverageDesc = [...nonRestricted].sort((a, b) => b.coverageRate - a.coverageRate || b.totalParks - a.totalParks);
    const topLeaders = sortedByCoverageDesc.slice(0, 5);

    const sortedByPotential = [...nonRestricted]
      .filter(r => r.totalParks > 0 && r.ooptCandidates >= 100)
      .sort((a, b) => a.coverageRate - b.coverageRate || b.ooptCandidates - a.ooptCandidates);
    const topPotential = sortedByPotential.slice(0, 5);

    let msg = 
      `🗺️ <b>Анализ покрытия программы POTA по регионам РФ</b>\n` +
      `<i>Отношение созданных парков POTA к официальному реестру ООПТ РФ:</i>\n\n` +
      `📊 <b>Общие цифры по России:</b>\n` +
      `• Всего парков POTA: <b>${summary.totalParks}</b> (активировано: ${summary.activatedParks})\n` +
      `• Кандидатов в реестре ООПТ: <b>${Number(summary.totalPotentialParks).toLocaleString('ru-RU')}</b>\n` +
      `• Среднее покрытие POTA: <b>${summary.overallCoverageRate}%</b>\n` +
      `• Зрелых регионов (диплом ≥70%): <b>${summary.matureRegionsCount}</b> из ${summary.totalRegions}\n\n` +
      `🏆 <b>Лидеры по зрелости диплома («Вся область»):</b>\n`;

    topLeaders.forEach((r, idx) => {
      msg += `${idx + 1}. <b>${r.name}</b> (<code>${r.code}</code>): <b>${r.coverageRate}%</b> (${r.totalParks} POTA / ${r.ooptCandidates} ООПТ)\n`;
    });

    msg += `\n⚠️ <b>Регионы с огромным фондом ООПТ («авансовый» диплом):</b>\n`;
    topPotential.forEach(r => {
      msg += `• <b>${r.name}</b> (<code>${r.code}</code>): <b>${r.coverageRate}%</b> (${r.totalParks} POTA из ${r.ooptCandidates} ООПТ)\n`;
    });

    msg += 
      `\n🔎 <b>Узнать детали по своей области:</b>\n` +
      `👉 <code>/regions [КОД / НАЗВАНИЕ]</code>\n` +
      `<i>Пример: <code>/regions Нижегородская</code> или <code>/regions RU-NZ</code></i>`;

    return ctx.reply(msg, { parse_mode: 'HTML', reply_markup: deleteBtn });

  } catch (err) {
    console.error('[Regions Command] Error:', err);
    return ctx.reply('❌ Ошибка при формировании статистики регионов: ' + err.message, { reply_markup: deleteBtn });
  }
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

import { Scenes } from 'telegraf';
import { statsHandler } from '../commands/stats.js';
import { deleteUserMessage, replyWithAutoDelete, getMainMenu } from '../utils.js';

export const statsWizard = new Scenes.WizardScene(
  'STATS_WIZARD',
  async (ctx) => {
    if (ctx.chat?.type !== 'private') {
      await deleteUserMessage(ctx);
      await replyWithAutoDelete(ctx, `ℹ️ В группе используйте команду: /stats ПОЗЫВНОЙ`);
      return ctx.scene.leave();
    }
    
    await ctx.reply('🔍 Введите радиолюбительский позывной для поиска (например, R9OGL):\n\n<i>или введите /cancel для отмены</i>', { parse_mode: 'HTML' });
    return ctx.wizard.next();
  },
  async (ctx) => {
    await deleteUserMessage(ctx);
    if (!ctx.message?.text) return;
    const callsign = ctx.message.text.toUpperCase().trim();

    if (callsign === '/CANCEL') {
      await ctx.scene.leave();
      return ctx.reply('🚫 Поиск статистики отменен.', { reply_markup: getMainMenu(ctx) });
    }
    
    if (callsign.startsWith('/') || ctx.message.text.includes('Регистрация') || ctx.message.text.includes('Подписки') || ctx.message.text.includes('Инфо') || ctx.message.text.includes('статистика')) {
      await ctx.scene.leave();
      await ctx.reply('🚫 Ввод отменен. Пожалуйста, повторите вашу команду.', { reply_markup: getMainMenu(ctx) });
      return;
    }

    // Pass control to the regular stats handler by mocking the command text
    ctx.message.text = `/stats ${callsign}`;
    await statsHandler(ctx);
    
    return ctx.scene.leave();
  }
);

statsWizard.command('cancel', async (ctx) => {
  await ctx.scene.leave();
  return ctx.reply('🚫 Поиск позывного отменен.', { reply_markup: getMainMenu(ctx) });
});

statsWizard.hears(/^(отмена|отменить|cancel|\/cancel)$/i, async (ctx) => {
  await ctx.scene.leave();
  return ctx.reply('🚫 Поиск позывного отменен.', { reply_markup: getMainMenu(ctx) });
});

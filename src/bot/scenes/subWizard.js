import { Scenes } from 'telegraf';
import db from '../../db/database.js';
import { potaApi } from '../../api/potaApi.js';
import { getSubsKeyboard } from '../commands/sub.js';

const baseCallsignRegex = /^([A-Z0-9]{1,4}\/)?([A-Z0-9]{1,3}[0-9][A-Z0-9]{1,5})(\/[A-Z0-9]{1,4})?$/;
const hasLetterRegex = /[A-Z]/;
const parkRefRegex = /^[A-Z0-9]{1,4}-\d{4,5}$/;

export const subWizard = new Scenes.WizardScene(
  'SUB_WIZARD',
  async (ctx) => {
    const subType = ctx.scene.state.subType || 'callsign'; // 'callsign' | 'park'
    
    if (subType === 'callsign') {
      await ctx.reply(
        '📻 <b>Добавление подписки на позывной</b>\n\n' +
        'Введите радиолюбительский позывной (например, <code>R9OGL</code> или <code>RA9AAA/P</code>):\n\n' +
        '<i>Для отмены нажмите кнопку ниже или введите /cancel</i>',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Отмена', callback_data: 'sub_action_back' }]]
          }
        }
      );
    } else {
      await ctx.reply(
        '🏞 <b>Добавление подписки на парк POTA</b>\n\n' +
        'Введите референцию парка (например, <code>RU-0001</code> или <code>RU-0073</code>):\n\n' +
        '<i>Для отмены нажмите кнопку ниже или введите /cancel</i>',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Отмена', callback_data: 'sub_action_back' }]]
          }
        }
      );
    }
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.callbackQuery) {
      return;
    }

    const input = ctx.message?.text?.toUpperCase()?.trim();
    if (!input) return;

    if (input === '/CANCEL') {
      await ctx.reply('🚫 Добавление подписки отменено.');
      const { text, reply_markup } = getSubsKeyboard(ctx.from.id);
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
      return ctx.scene.leave();
    }

    const subType = ctx.scene.state.subType || 'callsign';
    const userId = ctx.from.id;

    if (subType === 'callsign') {
      if (!baseCallsignRegex.test(input) || !hasLetterRegex.test(input)) {
        await ctx.reply(
          '❌ <b>Недопустимый формат позывного.</b>\n\n' +
          'Пожалуйста, введите корректный позывной (например: <code>R9OGL</code>) или /cancel для отмены:',
          { parse_mode: 'HTML' }
        );
        return;
      }

      let callsignName = null;
      try {
        const stats = await potaApi.getStats(input);
        if (stats && stats.name) {
          callsignName = stats.name;
        }
      } catch (e) {}

      try {
        const stmt = db.prepare('INSERT INTO subscriptions (telegram_id, type, target, target_name) VALUES (?, ?, ?, ?)');
        stmt.run(userId, 'callsign', input, callsignName);
        const nameSuffix = callsignName ? ` (<i>${callsignName}</i>)` : '';
        await ctx.reply(`✅ Вы успешно подписались на позывной <b>${input}</b>${nameSuffix}!`, { parse_mode: 'HTML' });
      } catch (e) {
        if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || e.message?.includes('UNIQUE')) {
          await ctx.reply(`ℹ️ Вы уже подписаны на позывной <b>${input}</b>.`, { parse_mode: 'HTML' });
        } else {
          console.error('Error saving callsign subscription:', e);
          await ctx.reply('❌ Ошибка при сохранении подписки.');
        }
      }
    } else {
      if (!parkRefRegex.test(input)) {
        await ctx.reply(
          '❌ <b>Недопустимый формат референции парка.</b>\n\n' +
          'Формат должен быть вида <code>RU-0001</code> или <code>BY-0010</code>. Попробуйте еще раз или /cancel для отмены:',
          { parse_mode: 'HTML' }
        );
        return;
      }

      try {
        const park = await potaApi.getPark(input);
        if (!park || !park.name) {
          await ctx.reply(`❌ Парк <b>${input}</b> не найден в реестре POTA. Проверьте правильность номера:`, { parse_mode: 'HTML' });
          return;
        }

        const stmt = db.prepare('INSERT INTO subscriptions (telegram_id, type, target, target_name) VALUES (?, ?, ?, ?)');
        stmt.run(userId, 'park', input, park.name);
        await ctx.reply(`✅ Вы успешно подписались на парк <b>${input}</b> (<i>${park.name}</i>)!`, { parse_mode: 'HTML' });
      } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.message?.includes('UNIQUE')) {
          await ctx.reply(`ℹ️ Вы уже подписаны на парк <b>${input}</b>.`, { parse_mode: 'HTML' });
        } else if (err.response?.status === 404 || err.message?.includes('404')) {
          await ctx.reply(`❌ Парк <b>${input}</b> не существует в официальной базе POTA. Попробуйте другой номер:`, { parse_mode: 'HTML' });
          return;
        } else {
          console.error('Error verifying/saving park subscription:', err);
          await ctx.reply('❌ Не удалось проверить парк в POTA API или сохранить подписку. Попробуйте позже.');
        }
      }
    }

    const { text, reply_markup } = getSubsKeyboard(userId);
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
    return ctx.scene.leave();
  }
);

subWizard.command('cancel', async (ctx) => {
  await ctx.reply('🚫 Добавление подписки отменено.');
  const { text, reply_markup } = getSubsKeyboard(ctx.from.id);
  await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
  return ctx.scene.leave();
});

subWizard.action('sub_action_back', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    await ctx.deleteMessage();
  } catch (e) {}
  const { text, reply_markup } = getSubsKeyboard(ctx.from.id);
  await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
  return ctx.scene.leave();
});

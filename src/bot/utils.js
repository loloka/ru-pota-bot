export const deleteUserMessage = async (ctx) => {
  if (ctx.chat?.type !== 'private' && ctx.message?.message_id) {
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id);
    } catch (e) {
      console.error('Failed to delete user message:', e.description || e.message);
    }
  }
};

export const replyWithAutoDelete = async (ctx, text, options = {}, delayMs = 7000) => {
  try {
    const msg = await ctx.reply(text, options);
    if (ctx.chat?.type !== 'private') {
      setTimeout(async () => {
        try {
          await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id);
        } catch (e) {} // Ignore errors
      }, delayMs);
    }
    return msg;
  } catch (e) {
    console.error('Failed to reply:', e);
  }
};

export const getMainMenu = (ctx) => {
  if (ctx.state.user && ctx.state.user.status === 'approved') {
    return {
      keyboard: [
        [{ text: '📡 Управление спотами' }, { text: '📊 Моя статистика' }],
        [{ text: '🏞 Инфо по парку' }, { text: '🔍 Поиск позывного' }],
        [{ text: '🔔 Мои подписки' }, { text: '📻 Кто в эфире' }],
        [{ text: '❓ Справка' }]
      ],
      resize_keyboard: true
    };
  }
  return {
    keyboard: [
      [{ text: '📝 Регистрация' }, { text: '📊 Моя статистика' }],
      [{ text: '🏞 Инфо по парку' }, { text: '🔍 Поиск позывного' }],
      [{ text: '🔔 Мои подписки' }, { text: '📻 Кто в эфире' }],
      [{ text: '❓ Справка' }]
    ],
    resize_keyboard: true
  };
};

export const banHandler = async (ctx) => {
  if (!ctx.state.isMainChat) return;

  try {
    const member = await ctx.getChatMember(ctx.from.id);
    if (!['creator', 'administrator'].includes(member.status)) {
      return ctx.reply('❌ Эта команда доступна только администраторам.');
    }

    const replyTo = ctx.message.reply_to_message;
    if (!replyTo) {
      return ctx.reply('ℹ️ Ответьте на сообщение пользователя, которого нужно забанить.');
    }

    const targetId = replyTo.from.id;
    await ctx.banChatMember(targetId);
    await ctx.reply(`🔨 Пользователь ${replyTo.from.first_name} заблокирован.`);
  } catch (error) {
    console.error('Error in /ban:', error);
    await ctx.reply('❌ Не удалось заблокировать пользователя (проверьте права бота).');
  }
};

export const muteHandler = async (ctx) => {
  if (!ctx.state.isMainChat) return;

  try {
    const member = await ctx.getChatMember(ctx.from.id);
    if (!['creator', 'administrator'].includes(member.status)) {
      return ctx.reply('❌ Эта команда доступна только администраторам.');
    }

    const replyTo = ctx.message.reply_to_message;
    if (!replyTo) {
      return ctx.reply('ℹ️ Ответьте на сообщение пользователя, которого нужно замьютить.');
    }

    const targetId = replyTo.from.id;
    await ctx.restrictChatMember(targetId, {
      permissions: { can_send_messages: false }
    });
    await ctx.reply(`🔇 Пользователь ${replyTo.from.first_name} заглушен.`);
  } catch (error) {
    console.error('Error in /mute:', error);
    await ctx.reply('❌ Не удалось заглушить пользователя (проверьте права бота).');
  }
};

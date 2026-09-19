import { getAllowedBridgeBots } from './antiSpam.js';

const userLimits = new Map();

export const rateLimit = (options = { window: 3000, limit: 3 }) => {
  return (ctx, next) => {
    if (!ctx.from) return next();
    
    // Exempt bridge bots/messages from rate limits so relayed bursts are not dropped
    const fromUser = (ctx.from.username || '').toLowerCase();
    const viaBot = (ctx.message?.via_bot?.username || '').toLowerCase();
    const bridges = getAllowedBridgeBots();
    if (bridges.includes(fromUser) || (viaBot && bridges.includes(viaBot))) {
      return next();
    }
    
    const now = Date.now();
    const userId = ctx.from.id;
    
    if (!userLimits.has(userId)) {
      userLimits.set(userId, { count: 1, firstTime: now });
      return next();
    }
    
    const record = userLimits.get(userId);
    if (now - record.firstTime > options.window) {
      // Reset window
      record.count = 1;
      record.firstTime = now;
      return next();
    }
    
    record.count++;
    if (record.count > options.limit) {
      // Rate limited: drop the message silently
      if (record.count === options.limit + 1 && ctx.chat?.type === 'private') {
         // Notify them once
         ctx.reply('⚠️ Пожалуйста, не отправляйте команды так часто.').catch(()=>{});
      }
      return;
    }
    
    return next();
  };
};

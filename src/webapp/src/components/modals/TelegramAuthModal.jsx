import React from 'react';
import { Send, X, Radio, Bell, Award, ExternalLink } from 'lucide-react';
import { telegram } from '../../services/telegram.js';

export default function TelegramAuthModal({ onClose, language = 'RU', title, reason }) {
  const isRu = language === 'RU';

  const handleOpenBot = () => {
    telegram.haptic.impact('medium');
    telegram.openTelegramBot('hub');
    if (onClose) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-sm rounded-3xl glass-card border border-sky-500/30 p-5 shadow-2xl space-y-4 animate-scale-up text-left">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Telegram Header Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/20">
            <Send className="w-6 h-6 -translate-x-0.5 translate-y-0.5" />
          </div>
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20">
              {isRu ? 'Telegram Mini App' : 'Telegram Mini App'}
            </span>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white leading-tight mt-0.5">
              {title || (isRu ? 'Авторизация оператора' : 'Operator Login')}
            </h3>
          </div>
        </div>

        {/* Reason / Explanation */}
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          {reason || (isRu 
            ? 'Вы просматриваете RU-POTA Hub в режиме гостя. Чтобы отправлять споты от своего позывного и настроить персональные подписки, откройте приложение через нашего Telegram-бота:'
            : 'You are viewing RU-POTA Hub in guest mode. To post spots and manage subscriptions, please launch the app inside our Telegram bot:'
          )}
        </p>

        {/* Features for authenticated radio amateurs */}
        <div className="p-3 rounded-2xl bg-slate-100/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <Radio className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>{isRu ? 'Отправка спотов в эфир в один клик' : 'One-tap spotting directly from parks'}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <Bell className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>{isRu ? 'Мгновенные push-алерты в ЛС от бота' : 'Instant Telegram DM alerts on new spots'}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <Award className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            <span>{isRu ? 'Персональная статистика и дипломы' : 'Personal stats and POTA awards tracking'}</span>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={handleOpenBot}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-lg shadow-sky-500/25 transition active:scale-95"
          >
            <Send className="w-4 h-4 -translate-x-0.5 translate-y-0.5" />
            <span>{isRu ? 'Открыть в Telegram (@ru_pota_bot)' : 'Open in Telegram (@ru_pota_bot)'}</span>
            <ExternalLink className="w-3.5 h-3.5 ml-0.5 opacity-80" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-3 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 bg-transparent hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition"
          >
            {isRu ? 'Продолжить просмотр как гость' : 'Continue browsing as guest'}
          </button>
        </div>
      </div>
    </div>
  );
}

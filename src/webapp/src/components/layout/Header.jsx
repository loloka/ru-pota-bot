import React, { useState } from 'react';
import { 
  Moon, 
  Sun, 
  Bell, 
  Languages, 
  Menu, 
  X, 
  Radio, 
  ExternalLink,
  BookOpen,
  MessageCircle,
  HelpCircle
} from 'lucide-react';
import { telegram } from '../../services/telegram.js';

export default function Header({ 
  theme, 
  onToggleTheme, 
  language, 
  onToggleLanguage, 
  notificationCount = 0,
  onOpenOsmAnd,
  t = (k) => k
}) {

  const [menuOpen, setMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const handleAction = (cb) => {
    telegram.haptic.impact('light');
    if (cb) cb();
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full glass-header pt-safe">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Logo & Brand */}
          <div className="flex items-center gap-2.5">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-emerald-500/30 shadow-glow-emerald">
              <span className="text-xl select-none">🌲</span>
              <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-900 border border-emerald-500/50">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base tracking-tight text-slate-900 dark:text-white">
                  {t('header_title')}
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  HUB
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-none mt-0.5">
                {t('header_subtitle')}
              </p>
            </div>
          </div>

          {/* Quick Toolbar Buttons */}
          <div className="flex items-center gap-1.5">
            {/* Theme Toggle */}
            <button
              type="button"
              onClick={() => handleAction(onToggleTheme)}
              className="relative p-2 rounded-xl text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-200/70 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/60 transition-colors active:scale-95"
              title="Переключить тему"
              aria-label="Переключить тему"
            >
              {theme === 'dark' ? (
                <Moon className="w-4 h-4 text-emerald-400" />
              ) : (
                <Sun className="w-4 h-4 text-amber-500" />
              )}
            </button>

            {/* Notification Bell */}
            <button
              type="button"
              onClick={() => {
                handleAction();
                setShowNotifications(!showNotifications);
              }}
              className="relative p-2 rounded-xl text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-200/70 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/60 transition-colors active:scale-95"
              title="Уведомления"
              aria-label="Уведомления"
            >
              <Bell className="w-4 h-4" />
              {notificationCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-slate-950">
                  {notificationCount}
                </span>
              )}
            </button>

            {/* Language Switch */}
            <button
              type="button"
              onClick={() => handleAction(onToggleLanguage)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-200/70 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/60 transition-colors active:scale-95"
              title="Сменить язык"
              aria-label="Сменить язык"
            >
              <Languages className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
              <span className="font-bold">{language}</span>
            </button>

            {/* Side Menu Drawer Button */}
            <button
              type="button"
              onClick={() => {
                handleAction();
                setMenuOpen(true);
              }}
              className="p-2 rounded-xl text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-200/70 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/60 transition-colors active:scale-95 ml-0.5"
              title="Меню"
              aria-label="Меню"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Notifications Popover Dropdown */}
      {showNotifications && (
        <div className="fixed inset-0 z-50 flex items-start justify-end px-4 pt-16" onClick={() => setShowNotifications(false)}>
          <div 
            className="w-80 rounded-2xl glass-card p-4 shadow-2xl animate-fade-in text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                <Bell className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                <span>{t('header_notifications_title')}</span>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                {notificationCount} {language === 'RU' ? 'активно' : 'active'}
              </span>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800/60 mt-2 max-h-60 overflow-y-auto">
              {notificationCount === 0 ? (
                <div className="py-4 text-center text-xs text-slate-500">
                  {t('header_no_notifications')}
                </div>
              ) : (
                <>
                  <div className="py-2.5">
                    <p className="font-medium text-slate-800 dark:text-slate-200 text-xs">
                      🔔 {language === 'RU' ? 'Подписка на парк' : 'Park alert'}: <span className="text-emerald-500 dark:text-emerald-400 font-mono font-bold">RU-0065</span>
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {language === 'RU' ? 'Заельцовский бор • Алерты в ЛС активны' : 'Zaeltsovsky Park • Alerts active'}
                    </p>
                  </div>
                  <div className="py-2.5">
                    <p className="font-medium text-slate-800 dark:text-slate-200 text-xs">
                      🌲 {language === 'RU' ? 'Подписка на парк' : 'Park alert'}: <span className="text-emerald-500 dark:text-emerald-400 font-mono font-bold">RU-0100</span>
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {language === 'RU' ? 'Новосибирский дендропарк' : 'Novosibirsk Dendropark'}
                    </p>
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowNotifications(false)}
              className="mt-3 w-full py-1.5 text-xs text-center font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white bg-slate-200/70 dark:bg-slate-800/60 rounded-xl transition"
            >
              {language === 'RU' ? 'Закрыть' : 'Close'}
            </button>
          </div>
        </div>
      )}

      {/* Slide-out Drawer Side Menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity" 
            onClick={() => setMenuOpen(false)} 
          />
          {/* Drawer Content */}
          <div className="relative ml-auto w-4/5 max-w-sm h-full bg-white dark:bg-[#0d1424] border-l border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between shadow-2xl animate-slide-up">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                    <Radio className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                  </div>
                  <span className="font-bold text-slate-900 dark:text-white text-base">RU-POTA Hub</span>
                </div>
                <button 
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Navigation links inside drawer */}
              <div className="mt-4 space-y-3 overflow-y-auto max-h-[calc(100vh-160px)] pr-1">
                
                {/* Карты */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase px-1">
                    Картография
                  </span>
                  <button 
                    type="button"
                    onClick={() => {
                      telegram.haptic.impact('light');
                      setMenuOpen(false);
                      if (onOpenOsmAnd) onOpenOsmAnd();
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-slate-800 dark:text-slate-200 text-xs transition active:scale-98"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base select-none">🗺️</span>
                      <span className="font-bold text-amber-700 dark:text-amber-400">
                        Карты OsmAnd (Офлайн)
                      </span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-amber-500" />
                  </button>
                </div>

                {/* Сообщество и активность */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase px-1">
                    Сообщество и Эфир
                  </span>
                  <div className="space-y-1">
                    <a 
                      href="https://t.me/+Pek5olQhfPdiZDIy" 
                      target="_blank" 
                      rel="noreferrer"
                      onClick={() => telegram.haptic.impact('light')}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/40 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs transition active:scale-98"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base select-none">💬</span>
                        <span className="font-semibold">Чат сообщества RU-POTA</span>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                    </a>

                    <a 
                      href="https://t.me/pota_activity" 
                      target="_blank" 
                      rel="noreferrer"
                      onClick={() => telegram.haptic.impact('light')}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/40 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs transition active:scale-98"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base select-none">📡</span>
                        <span className="font-semibold">Канал спотов активности</span>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                    </a>
                  </div>
                </div>

                {/* Официальные ресурсы POTA */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase px-1">
                    Порталы POTA
                  </span>
                  <div className="space-y-1">
                    <a 
                      href="https://next.pota.app/" 
                      target="_blank" 
                      rel="noreferrer"
                      onClick={() => telegram.haptic.impact('light')}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/40 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs transition active:scale-98"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base select-none">✨</span>
                        <span className="font-semibold">Портал POTA Next (Beta)</span>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                    </a>

                    <a 
                      href="https://parksontheair.com/" 
                      target="_blank" 
                      rel="noreferrer"
                      onClick={() => telegram.haptic.impact('light')}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/40 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs transition active:scale-98"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base select-none">🌐</span>
                        <span className="font-semibold">Официальный сайт POTA</span>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                    </a>

                    <a 
                      href="https://docs.pota.app" 
                      target="_blank" 
                      rel="noreferrer"
                      onClick={() => telegram.haptic.impact('light')}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/40 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs transition active:scale-98"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base select-none">📖</span>
                        <span className="font-semibold">Правила и справка</span>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                    </a>
                  </div>
                </div>

                {/* Тренажеры азбуки Морзе */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase px-1">
                    Тренажеры CW (Азбука Морзе)
                  </span>
                  <div className="space-y-1">
                    <a 
                      href="http://morse.r9old.ru" 
                      target="_blank" 
                      rel="noreferrer"
                      onClick={() => telegram.haptic.impact('light')}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-slate-800 dark:text-slate-200 text-xs transition active:scale-98"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base select-none">📻</span>
                        <div>
                          <span className="font-bold text-emerald-700 dark:text-emerald-400 block leading-tight">
                            MorseWave (Тренажер Морзе)
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            morse.r9old.ru • Обучение приёму с нуля
                          </span>
                        </div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-emerald-500" />
                    </a>

                    <a 
                      href="http://morse.r9o.ru" 
                      target="_blank" 
                      rel="noreferrer"
                      onClick={() => telegram.haptic.impact('light')}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-slate-800 dark:text-slate-200 text-xs transition active:scale-98"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base select-none">⚡</span>
                        <div>
                          <span className="font-bold text-blue-700 dark:text-blue-400 block leading-tight">
                            MorseWalker (CW Pro: Пайлапы и POTA)
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            morse.r9o.ru • Режим передачи парков
                          </span>
                        </div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
                    </a>
                  </div>
                </div>

              </div>
            </div>


            {/* Footer inside drawer */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-center space-y-1.5">
              <p className="text-xs font-mono font-semibold text-slate-400 dark:text-slate-500">
                RU-POTA Bot &amp; TMA v1.13.2
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                Автор: <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">R9OGL</span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                По предложениям, багам и вопросам:{" "}
                <a 
                  href="https://t.me/r9ogl" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="font-medium text-blue-500 hover:text-blue-400 underline underline-offset-2 transition"
                >
                  @r9ogl
                </a>
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-600 pt-1">
                73 &amp; 44 to all radio amateurs!
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  User, 
  Award, 
  Settings, 
  Vibrate, 
  Edit, 
  HelpCircle,
  ExternalLink,
  AlertCircle,
  Send,
  Radio,
  Bell,
  Clock,
  RefreshCw,
  Mail,
  LogOut,
  Globe,
  Shield,
  TreePine
} from 'lucide-react';
import { telegram } from '../../services/telegram.js';
import { api } from '../../services/api.js';

export default function ProfileTab({ 
  user, 
  stats, 
  onRefreshProfile, 
  onRequireAuth, 
  onOpenWebAuth, 
  onWebLogout, 
  language = 'RU', 
  t = (k) => k 
}) {
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [changeCallsignModal, setChangeCallsignModal] = useState(false);
  const [requestedCallsign, setRequestedCallsign] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [linkingTelegram, setLinkingTelegram] = useState(false);
  const [telegramLinkModal, setTelegramLinkModal] = useState(null);

  const handleLinkTelegram = async () => {
    telegram.haptic.impact('medium');
    setLinkingTelegram(true);
    try {
      const res = await api.getTelegramLinkToken();
      if (res?.botUrl) {
        setTelegramLinkModal(res);
        if (typeof window !== 'undefined' && window.Telegram?.WebApp?.openTelegramLink) {
          window.Telegram.WebApp.openTelegramLink(res.botUrl);
        } else {
          window.open(res.botUrl, '_blank');
        }
      }
    } catch (err) {
      telegram.haptic.notification('error');
      alert(err.message || 'Ошибка генерации ссылки');
    } finally {
      setLinkingTelegram(false);
    }
  };

  const handleToggleHaptics = () => {
    if (!hapticsEnabled) {
      telegram.haptic.notification('success');
    }
    setHapticsEnabled(!hapticsEnabled);
  };

  const handleCallsignRequest = async (e) => {
    e.preventDefault();
    if (!requestedCallsign.trim()) return;

    setSubmitting(true);
    setModalError('');
    telegram.haptic.impact('medium');

    try {
      const res = await api.requestCallsign(requestedCallsign.trim());
      telegram.haptic.notification('success');
      alert(res.message || (language === 'RU' ? 'Заявка на позывной отправлена!' : 'Callsign request submitted!'));
      setChangeCallsignModal(false);
      setRequestedCallsign('');
      if (onRefreshProfile) await onRefreshProfile();
    } catch (err) {
      telegram.haptic.notification('error');
      setModalError(err.message || 'Error submitting request');
    } finally {
      setSubmitting(false);
    }
  };

  // Guest view outside Telegram
  if (!user) {
    return (
      <div className="space-y-4 pb-tab-bottom animate-fade-in">
        {/* Guest Profile Banner */}
        <div className="p-6 rounded-3xl glass-card border border-emerald-500/25 text-center space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 text-white shadow-xl shadow-emerald-500/20">
            <TreePine className="w-8 h-8" />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-center">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {t('guest_badge')}
              </span>
            </div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
              {t('guest_profile_title')}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 max-w-sm mx-auto leading-relaxed">
              {t('guest_profile_desc')}
            </p>
          </div>

          <div className="pt-2 space-y-2">
            <button
              type="button"
              onClick={() => {
                telegram.haptic.impact('medium');
                telegram.openTelegramBot('hub');
              }}
              className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-lg shadow-sky-500/25 transition active:scale-95 cursor-pointer"
            >
              <Send className="w-4 h-4 -translate-x-0.5 translate-y-0.5" />
              <span>{language === 'RU' ? 'Войти через Telegram-бота' : 'Sign in via Telegram Bot'}</span>
              <ExternalLink className="w-3.5 h-3.5 ml-0.5 opacity-80" />
            </button>

            {onOpenWebAuth && (
              <button
                type="button"
                onClick={() => {
                  telegram.haptic.impact('light');
                  onOpenWebAuth();
                }}
                className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-2xl font-bold text-sm text-slate-900 dark:text-white bg-slate-200/90 dark:bg-slate-800/90 hover:bg-slate-300 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 shadow-sm transition active:scale-95 cursor-pointer"
              >
                <Mail className="w-4 h-4 text-emerald-500" />
                <span>{language === 'RU' ? 'Войти напрямую через сайт' : 'Sign In via Website'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Benefits List */}
        <div className="p-4 rounded-2xl glass-card space-y-3">
          <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            {language === 'RU' ? 'Что доступно после авторизации?' : 'What Unlocks After Authorization'}
          </h3>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
              <Radio className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <b className="text-slate-900 dark:text-white font-semibold">
                  {language === 'RU' ? 'Публикация спотов из парка' : 'One-tap Spotting'}
                </b>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {language === 'RU' ? 'Мгновенно оповещайте охотников о вашей частоте и модуляции прямо с телефона или компьютера.' : 'Instantly inform hunters of your frequency and mode right from your device.'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
              <Bell className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <b className="text-slate-900 dark:text-white font-semibold">
                  {language === 'RU' ? 'Личные уведомления и подписки' : 'Personal Alerts & Subscriptions'}
                </b>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {language === 'RU' ? 'Алерты в Telegram и веб-лента со звуковым сигналом при выходе любимых активаторов и парков в эфир.' : 'Instant alerts in Telegram and live web feed with audio notifications when favorite stations go on air.'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
              <Award className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
              <div>
                <b className="text-slate-900 dark:text-white font-semibold">
                  {language === 'RU' ? 'Учёт дипломов и статистика' : 'Awards & Stats Tracking'}
                </b>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {language === 'RU' ? 'Синхронизация статистики POTA активатора и охотника в реальном времени, история спотов и поиск парков.' : 'Real-time sync of your POTA activator and hunter stats, spot history and park search.'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
              <Shield className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
              <div>
                <b className="text-slate-900 dark:text-white font-semibold">
                  {language === 'RU' ? 'Связка аккаунтов и безопасность' : 'Account Linking & Security'}
                </b>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {language === 'RU' ? 'Вход с любых устройств: объединяйте Telegram и Email в единый профиль без потери подписок и истории.' : 'Multi-device access: link Telegram and Email seamlessly without losing subscriptions or history.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-tab-bottom animate-fade-in">
      {/* 1. Profile Identity Header */}
      <div className="p-4 rounded-2xl glass-card relative overflow-hidden">
        {/* Ambient glow decoration */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center gap-4 relative">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-700 border border-slate-300 dark:border-slate-600 flex items-center justify-center font-bold text-xl text-emerald-700 dark:text-emerald-400 font-mono shadow-md">
              {user.callsign ? user.callsign.substring(0, 2) : 'RU'}
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-900 border border-emerald-500">
              <span className={`h-2 w-2 rounded-full ${user.status === 'approved' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
                {user.first_name} {user.last_name || ''}
              </h2>
              {(user.isWeb || user.auth_type === 'web') && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0 flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  <span>WEB</span>
                </span>
              )}
            </div>
            {user.email ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">{user.email}</p>
            ) : user.username ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">@{user.username}</p>
            ) : null}

            <div className="flex items-center gap-2 mt-2">
              <span className={`font-mono text-xs font-extrabold px-2.5 py-0.5 rounded-lg border ${
                user.status === 'approved'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
              }`}>
                {user.callsign || t('dash_no_callsign')}
              </span>
              {!user.isWeb && user.auth_type !== 'web' && (
                <button
                  type="button"
                  onClick={() => {
                    telegram.haptic.impact('light');
                    setChangeCallsignModal(true);
                  }}
                  className="text-[11px] text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white flex items-center gap-1 underline underline-offset-2"
                >
                  <Edit className="w-3 h-3" />
                  <span>{user.callsign ? t('profile_change_callsign') : t('profile_set_callsign')}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Pending Approval Notice Banner with live refresh */}
        {user.status === 'pending' && (
          <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start justify-between gap-3 animate-fade-in">
            <div className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5 animate-spin" style={{ animationDuration: '6s' }} />
              <div>
                <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                  {language === 'RU' ? 'Заявка на проверке администратором' : 'Callsign Pending Review'}
                </p>
                <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-0.5 leading-relaxed">
                  {language === 'RU' 
                    ? 'Ваш позывной проверяется модератором. Страница обновится автоматически сразу после одобрения.' 
                    : 'Your callsign is being verified by a moderator. The page will update automatically once approved.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                telegram.haptic.impact('light');
                if (onRefreshProfile) await onRefreshProfile();
              }}
              className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-800 dark:text-amber-200 text-[11px] font-semibold transition shrink-0 flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>{language === 'RU' ? 'Обновить' : 'Refresh'}</span>
            </button>
          </div>
        )}

        {/* Rejected Notice Banner */}
        {user.status === 'rejected' && (
          <div className="mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start justify-between gap-3 animate-fade-in">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-rose-800 dark:text-rose-300">
                  {language === 'RU' ? 'Заявка отклонена' : 'Application Rejected'}
                </p>
                {user.reject_reason && (
                  <p className="text-[11px] text-rose-700 dark:text-rose-300 mt-0.5 italic font-medium">
                    «{user.reject_reason}»
                  </p>
                )}
                <p className="text-[11px] text-rose-700/80 dark:text-rose-400/80 mt-0.5 leading-relaxed">
                  {language === 'RU'
                    ? 'Вы можете подать заявку повторно, указав корректный позывной.'
                    : 'You can re-apply with a valid callsign.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                telegram.haptic.impact('light');
                setChangeCallsignModal(true);
              }}
              className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-800 dark:text-rose-200 text-[11px] font-semibold transition shrink-0"
            >
              {language === 'RU' ? 'Подать снова' : 'Re-apply'}
            </button>
          </div>
        )}
      </div>

      {/* 2. Account Linking & Security (Telegram & Email) */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 px-1">
          <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
            {language === 'RU' ? 'Связка аккаунтов и безопасность' : 'Account Linking & Security'}
          </span>
        </div>

        {/* Telegram Linking Card */}
        {(() => {
          const tgId = user.telegram_id !== undefined ? user.telegram_id : (user.id > 0 ? user.id : 0);
          const isTelegramLinked = tgId > 0;

          if (isTelegramLinked) {
            return (
              <div className="p-3.5 rounded-2xl glass-card border border-sky-500/20 bg-sky-500/5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-xl bg-sky-500/15 text-sky-500 shrink-0">
                    <Send className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">Telegram-аккаунт</h4>
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
                        {language === 'RU' ? 'Привязан ✅' : 'Connected ✅'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      ID: <span className="font-mono">{tgId}</span>
                      {user.username ? ` (@${user.username})` : ''} • {language === 'RU' ? 'Оповещения приходят в ЛС бота' : 'Alerts delivered via DM'}
                    </p>
                  </div>
                </div>
              </div>
            );
          }

          return (
          <div className="p-3.5 rounded-2xl glass-card border border-sky-500/30 bg-gradient-to-r from-sky-500/10 via-slate-800/30 to-emerald-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-2xl bg-sky-500/20 text-sky-500 shrink-0">
                <Send className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  {language === 'RU' ? 'Привязать Telegram-аккаунт' : 'Connect Telegram Account'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  {language === 'RU' 
                    ? 'Свяжите профиль с ботом @ru_pota_bot, чтобы получать уведомления по подпискам прямо в Telegram!' 
                    : 'Connect with @ru_pota_bot to receive personal alerts on activators in Telegram!'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLinkTelegram}
              disabled={linkingTelegram}
              className="shrink-0 flex items-center justify-center gap-1.5 py-2 px-3.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-md shadow-sky-500/20 transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{linkingTelegram ? (language === 'RU' ? 'Связка...' : 'Linking...') : (language === 'RU' ? 'Привязать Telegram' : 'Link Telegram')}</span>
              <ExternalLink className="w-3 h-3 opacity-80" />
            </button>
          </div>
        );
      })()}

        {/* Email Linking Card */}
        {user.email ? (
          <div className="p-3.5 rounded-2xl glass-card border border-emerald-500/20 bg-emerald-500/5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                <Mail className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-900 dark:text-white font-mono truncate">{user.email}</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
                    {language === 'RU' ? 'Подтверждён ✅' : 'Verified ✅'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  {language === 'RU'
                    ? 'Используется для прямого входа на сайт, восстановления доступа и защиты подписок.'
                    : 'Used for direct website login, account recovery and subscription backup.'}
                </p>
              </div>
            </div>
            {onOpenWebAuth && (
              <button
                type="button"
                onClick={() => {
                  telegram.haptic.impact('light');
                  onOpenWebAuth();
                }}
                className="shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 transition"
              >
                {language === 'RU' ? 'Изменить' : 'Change'}
              </button>
            )}
          </div>
        ) : (
          <div className="p-3.5 rounded-2xl glass-card border border-emerald-500/25 bg-gradient-to-r from-emerald-500/10 via-slate-800/20 to-sky-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  {language === 'RU' ? 'Привязать Email для сайта' : 'Link Email for Website'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  {language === 'RU'
                    ? 'Укажите Email, чтобы входить на сайт pota.r9o.ru напрямую без Telegram, восстановить доступ и не потерять подписки.'
                    : 'Link an Email to sign in directly on pota.r9o.ru without Telegram and protect your subscriptions.'}
                </p>
              </div>
            </div>
            {onOpenWebAuth && (
              <button
                type="button"
                onClick={() => {
                  telegram.haptic.impact('light');
                  onOpenWebAuth();
                }}
                className="shrink-0 flex items-center justify-center gap-1.5 py-2 px-3.5 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-md shadow-emerald-500/20 transition active:scale-95 cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>{language === 'RU' ? 'Привязать Email' : 'Link Email'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 3. POTA Statistics Overview */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 px-1">
          <Award className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
            {t('profile_stat_title')}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {/* Activator Stats */}
          <div className="p-3.5 rounded-2xl glass-card space-y-2">
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
              {t('profile_activator_title')}
            </span>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>{t('dash_activations')}</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{stats?.activations || 0}</span>
              </div>
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>{t('dash_unique_parks')}</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{stats?.uniqueParks || 0}</span>
              </div>
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>{t('dash_qsos')}</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{stats?.qsos || 0}</span>
              </div>
            </div>
          </div>

          {/* Hunter Stats */}
          <div className="p-3.5 rounded-2xl glass-card space-y-2">
            <span className="text-[11px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">
              {t('profile_hunter_title')}
            </span>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>{t('profile_hunted_parks')}</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{stats?.workedParks || 0}</span>
              </div>
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>{t('profile_dxcc_count')}</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{stats?.dxcc || 0}</span>
              </div>
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>{t('profile_confirmed_qsos')}</span>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{stats?.confirmed || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Application Preferences */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 px-1">
          <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          <span className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
            {t('profile_settings_title')}
          </span>
        </div>

        <div className="rounded-2xl glass-card divide-y divide-slate-200 dark:divide-slate-800/80">
          {/* Haptic Feedback Switch */}
          <div className="flex items-center justify-between p-3.5">
            <div className="flex items-center gap-3">
              <Vibrate className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <div>
                <h4 className="text-xs font-semibold text-slate-900 dark:text-white">{t('profile_haptics_title')}</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('profile_haptics_desc')}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggleHaptics}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                hapticsEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  hapticsEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Telegram Community Link */}
          <a
            href="https://t.me/ru_pota"
            target="_blank"
            rel="noreferrer"
            onClick={() => telegram.haptic.impact('light')}
            className="flex items-center justify-between p-3.5 hover:bg-slate-100 dark:hover:bg-slate-800/30 transition"
          >
            <div className="flex items-center gap-3">
              <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <div>
                <h4 className="text-xs font-semibold text-slate-900 dark:text-white">{t('profile_community_title')}</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('profile_community_desc')}</p>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          </a>
        </div>
      </div>

      {/* Logout button for Web users */}
      {(user.isWeb || user.auth_type === 'web') && onWebLogout && (
        <div className="pt-1">
          <button
            type="button"
            onClick={onWebLogout}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition active:scale-95 cursor-pointer shadow-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>{language === 'RU' ? 'Выйти из веб-аккаунта' : 'Sign Out of Web Account'}</span>
          </button>
        </div>
      )}

      {/* Callsign Change Modal */}
      {changeCallsignModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => !submitting && setChangeCallsignModal(false)} />
          <div className="relative w-full max-w-sm glass-card rounded-2xl p-5 shadow-2xl space-y-4 animate-slide-up">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                {language === 'RU' ? 'Заявка на позывной' : 'Callsign Registration'}
              </h3>
              <button 
                type="button" 
                onClick={() => !submitting && setChangeCallsignModal(false)} 
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              {language === 'RU' 
                ? 'Позывной проверяется администратором бота. После одобрения статус изменится на «Активатор».'
                : 'The callsign is reviewed by the bot admin. Once approved, your status will change to "Activator".'}
            </p>

            {modalError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCallsignRequest} className="space-y-3">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 text-xs font-medium">
                  {language === 'RU' ? 'Ваш позывной' : 'Your Callsign'}
                </label>
                <input 
                  type="text" 
                  value={requestedCallsign}
                  onChange={(e) => setRequestedCallsign(e.target.value.toUpperCase())}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono uppercase focus:border-emerald-500 outline-none text-sm"
                  placeholder="R9OGL"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-xl font-bold text-xs text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 shadow-glow-emerald transition active:scale-95"
              >
                {submitting ? (language === 'RU' ? 'Отправка...' : 'Sending...') : (language === 'RU' ? 'Отправить заявку' : 'Submit Request')}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Telegram Link Modal */}
      {telegramLinkModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setTelegramLinkModal(null)} />
          <div className="relative w-full max-w-sm glass-card rounded-2xl p-5 shadow-2xl space-y-4 animate-slide-up">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-sky-500" />
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  {language === 'RU' ? 'Привязка Telegram' : 'Connect Telegram'}
                </h3>
              </div>
              <button 
                type="button" 
                onClick={() => setTelegramLinkModal(null)} 
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs text-slate-700 dark:text-slate-300 space-y-2">
              <p>
                {language === 'RU' 
                  ? `Ссылка для привязки позывного ${user.callsign} к боту готова!`
                  : `Link for connecting callsign ${user.callsign} to the bot is ready!`}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {language === 'RU'
                  ? 'Перейдите в бота по кнопке ниже и нажмите кнопку Start внизу диалога. Аккаунты объединятся автоматически.'
                  : 'Open the bot using the button below and tap Start. The accounts will merge automatically.'}
              </p>
            </div>

            <div className="space-y-2 pt-1">
              <a
                href={telegramLinkModal.botUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => telegram.haptic.impact('medium')}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-md shadow-sky-500/25 transition active:scale-95 text-center"
              >
                <Send className="w-4 h-4" />
                <span>{language === 'RU' ? 'Открыть @ru_pota_bot' : 'Open @ru_pota_bot'}</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </a>

              <button
                type="button"
                onClick={async () => {
                  telegram.haptic.impact('light');
                  if (onRefreshProfile) await onRefreshProfile();
                  setTelegramLinkModal(null);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{language === 'RU' ? 'Я привязал, обновить профиль' : 'Done, refresh profile'}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

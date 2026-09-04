import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  Send, 
  Flame, 
  TrendingUp, 
  Bell, 
  Edit3, 
  Square, 
  ArrowRight,
  MapPin,
  AlertCircle
} from 'lucide-react';
import { telegram } from '../../services/telegram.js';
import { api } from '../../services/api.js';
import { formatTimeAgoLocale } from '../../services/i18n.js';
import PotaLookupWidget from '../widgets/PotaLookupWidget.jsx';


export default function DashboardTab({ 
  user, 
  activeSpot, 
  stats, 
  subscriptionsCount = 0,
  onRefreshProfile,
  onNavigate,
  onRequireAuth,
  language = 'RU',
  t = (k) => k
}) {
  const [spotModalOpen, setSpotModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Live stations preview
  const [liveStations, setLiveStations] = useState([]);
  const [isWorldFallback, setIsWorldFallback] = useState(false);

  // Modal form fields
  const [parkRef, setParkRef] = useState('RU-0073');
  const [freq, setFreq] = useState('14144');
  const [mode, setMode] = useState('SSB');
  const [comment, setComment] = useState('');

  // Load preview of active stations (with smart fallback to world stations if RU is quiet)
  useEffect(() => {
    let isMounted = true;
    api.getSpots({ scope: 'ru' })
      .then(res => {
        if (!isMounted) return;
        if (res?.spots && res.spots.length > 0) {
          setLiveStations(res.spots.slice(0, 6));
          setIsWorldFallback(false);
        } else {
          // Smart Fallback to active world stations
          api.getSpots({ scope: 'world' })
            .then(worldRes => {
              if (isMounted && worldRes?.spots && worldRes.spots.length > 0) {
                setLiveStations(worldRes.spots.slice(0, 6));
                setIsWorldFallback(true);
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  const handleSpotSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSubmitting(true);
    telegram.haptic.impact('medium');

    try {
      await api.postSpot({
        reference: parkRef,
        frequency: freq,
        mode,
        comment,
      });

      telegram.haptic.notification('success');
      setSpotModalOpen(false);
      if (onRefreshProfile) await onRefreshProfile();
    } catch (err) {
      telegram.haptic.notification('error');
      setErrorMessage(err.message || 'Ошибка публикации спота');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQRT = async () => {
    telegram.haptic.impact('heavy');
    const qrtPrompt = language === 'RU' ? 'Завершить работу в эфире (QRT)?' : 'Finish on-air session (QRT)?';
    if (!confirm(qrtPrompt)) return;

    try {
      await api.stopSpot();
      telegram.haptic.notification('success');
      alert(language === 'RU' ? 'Сессия в эфире завершена (QRT)!' : 'Session finished (QRT)!');
      if (onRefreshProfile) await onRefreshProfile();
    } catch (err) {
      telegram.haptic.notification('error');
      alert(`Error: ${err.message}`);
    }
  };

  const handleRespot = async () => {
    telegram.haptic.impact('medium');
    if (!activeSpot) return;

    try {
      await api.postSpot({
        reference: activeSpot.reference,
        frequency: activeSpot.frequency,
        mode: activeSpot.mode,
        comment: activeSpot.comment || '',
      });

      telegram.haptic.notification('success');
      alert(language === 'RU' ? 'Спот успешно обновлен в эфире!' : 'Spot successfully renewed on air!');
      if (onRefreshProfile) await onRefreshProfile();
    } catch (err) {
      telegram.haptic.notification('error');
      alert(`Error: ${err.message}`);
    }
  };

  const isOnAir = Boolean(activeSpot);

  return (
    <div className="space-y-4 pb-20 animate-fade-in">
      {/* 1. Welcome & Callsign Badge OR Guest Banner */}
      {user ? (
        <div className="flex items-center justify-between p-4 rounded-2xl glass-card">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono font-bold text-lg text-emerald-600 dark:text-emerald-400 shadow-inner">
              {user.callsign ? user.callsign.substring(0, 2) : 'RU'}
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                {t('dash_hello')}, {user.first_name || t('dash_operator')}! 👋
              </h1>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded-md border ${
                  user.status === 'approved' 
                    ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                    : 'text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/30'
                }`}>
                  {user.callsign || t('dash_no_callsign')}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  • {user.status === 'approved' ? t('dash_approved') : user.status === 'pending' ? t('dash_pending') : t('dash_guest')}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              telegram.haptic.impact('light');
              onNavigate('profile');
            }}
            className="text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white px-2.5 py-1.5 rounded-xl bg-slate-200/80 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700/70 transition"
          >
            {t('dash_cabinet')}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between p-4 rounded-2xl glass-card border border-sky-500/30 bg-gradient-to-r from-sky-500/10 via-slate-800/30 to-emerald-500/10">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/20 shrink-0">
              <Send className="w-5 h-5 -translate-x-0.5 translate-y-0.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight">
                  {t('guest_welcome')}
                </h1>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30">
                  {t('guest_badge')}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {t('guest_subtitle')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              telegram.haptic.impact('light');
              if (onRequireAuth) {
                onRequireAuth(
                  language === 'RU' ? 'Вход через Telegram' : 'Login via Telegram',
                  language === 'RU' 
                    ? 'Откройте RU-POTA Hub внутри Telegram-бота @ru_pota_bot для автоматической авторизации вашего позывного.' 
                    : 'Open RU-POTA Hub inside @ru_pota_bot to automatically authorize your callsign.'
                );
              } else {
                telegram.openTelegramBot('hub');
              }
            }}
            className="flex items-center gap-1 text-xs font-bold text-white px-2.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 shadow-md shadow-sky-500/20 transition active:scale-95 shrink-0"
          >
            <Send className="w-3 h-3" />
            <span>{t('guest_login_btn')}</span>
          </button>
        </div>
      )}

      {/* 2. On-Air Status Widget */}
      <div className="p-4 rounded-2xl glass-card relative overflow-hidden">
        {isOnAir ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <span className="font-bold text-xs tracking-wider text-emerald-600 dark:text-emerald-400 uppercase">
                  {t('dash_on_air')}
                </span>
              </div>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                {t('dash_session_active')}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-lg text-slate-900 dark:text-white">{activeSpot.reference}</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {activeSpot.freqMHz || (parseFloat(activeSpot.frequency) / 1000).toFixed(3)} MHz {activeSpot.mode}
                </span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 truncate">
                {activeSpot.parkName || (language === 'RU' ? 'Национальный парк' : 'National Park')}
              </p>
              {activeSpot.comment && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 italic truncate">
                  "{activeSpot.comment}"
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={handleRespot}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-glow-emerald transition active:scale-95"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>{t('dash_respot')}</span>
              </button>

              <button
                type="button"
                onClick={handleQRT}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition active:scale-95"
              >
                <Square className="w-3.5 h-3.5" />
                <span>{t('dash_qrt')}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-2 space-y-3">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shadow-glow-emerald">
              <Radio className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">{t('dash_not_on_air_title')}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-xs mx-auto">
                {t('dash_not_on_air_desc')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                telegram.haptic.impact('medium');
                if (!user) {
                  if (onRequireAuth) {
                    onRequireAuth(
                      language === 'RU' ? 'Отправка спота в эфир' : 'Post Spot to Cluster',
                      language === 'RU'
                        ? 'Для отправки спотов от своего позывного запустите RU-POTA Hub внутри Telegram-бота @ru_pota_bot.'
                        : 'To post spots with your callsign, please launch RU-POTA Hub inside our Telegram bot @ru_pota_bot.'
                    );
                  } else {
                    telegram.openTelegramBot('hub');
                  }
                  return;
                }
                setSpotModalOpen(true);
              }}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm text-slate-950 bg-gradient-to-r from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 shadow-glow-emerald transition-all active:scale-95"
            >
              <Send className="w-4 h-4" />
              <span>{t('dash_send_spot_btn')}</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. POTA Directory & Lookup Widget (/stats & /park) */}
      <PotaLookupWidget
        user={user}
        onNavigate={onNavigate}
        onRequireAuth={onRequireAuth}
        language={language}
        t={t}
      />

      {/* 4. Horizontal Live Stations Slider */}
      <div className="space-y-2">

        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            <span className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
              {isWorldFallback ? t('dash_live_world') : t('dash_live_ru')}
            </span>
            {isWorldFallback && (
              <span className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700/60">
                {t('dash_ru_quiet')}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              telegram.haptic.impact('light');
              onNavigate('cluster', { scope: isWorldFallback ? 'world' : 'ru', search: '', highlightCallsign: null });
            }}
            className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            <span>{t('dash_see_all')}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex gap-2.5 overflow-x-auto pb-1 no-scrollbar">
          {liveStations.length === 0 ? (
            <div className="w-full p-4 rounded-xl glass-card text-center text-xs text-slate-500 dark:text-slate-400">
              {t('dash_quiet_notice')}
            </div>
          ) : (
            liveStations.map((st) => (
              <div 
                key={st.id}
                onClick={() => {
                  telegram.haptic.impact('light');
                  onNavigate('cluster', { 
                    scope: st.isRu ? 'ru' : 'world', 
                    search: '', 
                    highlightCallsign: st.callsign 
                  });
                }}
                className="min-w-[185px] p-3 rounded-xl glass-card hover:border-emerald-500/50 cursor-pointer transition active:scale-95"
              >


                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm select-none">{st.country}</span>
                    <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">{st.callsign}</span>
                  </div>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    {st.mode}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-mono font-medium truncate">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span className="truncate">{st.park}</span>
                  {st.parkName && (
                    <span className="text-slate-500 dark:text-slate-400 font-sans font-normal text-[11px] truncate">
                      • {st.parkName}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  <span>{st.freq} MHz</span>
                  <span className="text-[10px]">{formatTimeAgoLocale(st.diffMinutes, st.timeAgo, language)}</span>
                </div>

              </div>
            ))
          )}
        </div>
      </div>

      {/* 4. Quick Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Metric 1: My Stats */}
        <div 
          onClick={() => {
            telegram.haptic.impact('light');
            if (!user && onRequireAuth) {
              onRequireAuth(
                language === 'RU' ? 'Статистика оператора' : 'Operator Statistics',
                language === 'RU'
                  ? 'Чтобы просматривать личную статистику активаций и дипломов, откройте RU-POTA Hub в Telegram-боте @ru_pota_bot.'
                  : 'To track personal activations and awards, please launch RU-POTA Hub inside @ru_pota_bot.'
              );
              return;
            }
            onNavigate('profile');
          }}
          className="p-3.5 rounded-2xl glass-card hover:border-emerald-500/40 cursor-pointer transition active:scale-95"
        >
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <h4 className="font-bold text-xs text-slate-800 dark:text-slate-300 mt-2">{t('dash_my_stats')}</h4>
          {user ? (
            <div className="mt-2 space-y-1 text-[11px]">
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
          ) : (
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 italic">
              {t('guest_stats_hint')}
            </p>
          )}
        </div>

        {/* Metric 2: Subscriptions */}
        <div 
          onClick={() => {
            telegram.haptic.impact('light');
            if (!user && onRequireAuth) {
              onRequireAuth(
                language === 'RU' ? 'Персональные подписки' : 'Personal Subscriptions',
                language === 'RU'
                  ? 'Чтобы получать push-уведомления в Telegram о выходе парков и друзей в эфир, откройте приложение через бота @ru_pota_bot.'
                  : 'To receive instant Telegram alerts when your favourite parks or friends go on air, open the app inside @ru_pota_bot.'
              );
              return;
            }
            onNavigate('subscriptions');
          }}
          className="p-3.5 rounded-2xl glass-card hover:border-blue-500/40 cursor-pointer transition active:scale-95"
        >
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Bell className="w-4 h-4" />
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <h4 className="font-bold text-xs text-slate-800 dark:text-slate-300 mt-2">{t('dash_my_subs')}</h4>
          {user ? (
            <div className="mt-2 space-y-1 text-[11px]">
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>{t('dash_total_subs')}</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{subscriptionsCount}</span>
              </div>
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>{t('dash_dm_alerts')}</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{t('dash_enabled')}</span>
              </div>
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>{t('dash_status')}</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">{t('dash_active')}</span>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 italic">
              {t('guest_subs_hint')}
            </p>
          )}
        </div>
      </div>

      {/* Spot Modal */}
      {spotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => !submitting && setSpotModalOpen(false)} />
          <div className="relative w-full max-w-sm glass-card rounded-2xl p-5 shadow-2xl space-y-4 animate-slide-up">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">{t('modal_spot_title')}</h3>
              <button 
                type="button" 
                onClick={() => !submitting && setSpotModalOpen(false)} 
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            {errorMessage && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSpotSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">{t('modal_park_label')}</label>
                <input 
                  type="text" 
                  value={parkRef}
                  onChange={(e) => setParkRef(e.target.value.toUpperCase())}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono uppercase focus:border-emerald-500 outline-none"
                  placeholder="RU-0073"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">{t('modal_freq_label')}</label>
                  <input 
                    type="text" 
                    value={freq}
                    onChange={(e) => setFreq(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono focus:border-emerald-500 outline-none"
                    placeholder="14144 / 14.144"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">{t('modal_mode_label')}</label>
                  <select 
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-medium focus:border-emerald-500 outline-none"
                  >
                    <option value="SSB">SSB</option>
                    <option value="CW">CW</option>
                    <option value="FT8">FT8</option>
                    <option value="FT4">FT4</option>
                    <option value="FM">FM</option>
                    <option value="AM">AM</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">{t('modal_comment_label')}</label>
                <input 
                  type="text" 
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:border-emerald-500 outline-none"
                  placeholder={t('modal_comment_ph')}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-xl font-bold text-sm text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 shadow-glow-emerald transition active:scale-95"
              >
                {submitting ? t('modal_publishing') : t('modal_publish_btn')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

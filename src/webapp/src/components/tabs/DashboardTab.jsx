import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Radio, 
  Send, 
  Flame, 
  TrendingUp, 
  Bell, 
  Edit3, 
  Square, 
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  MapPin,
  AlertCircle,
  Lock,
  Clock,
  Globe,
  TreePine
} from 'lucide-react';
import { telegram } from '../../services/telegram.js';
import { api } from '../../services/api.js';
import { formatTimeAgoLocale } from '../../services/i18n.js';
import PotaLookupWidget from '../widgets/PotaLookupWidget.jsx';

export function getDisplayFreq(spot) {
  if (!spot) return '—';
  if (spot.freqMHz && !isNaN(parseFloat(spot.freqMHz))) return spot.freqMHz;
  const raw = spot.frequency || spot.freq;
  if (!raw) return '—';
  let num = parseFloat(String(raw).replace(',', '.'));
  if (isNaN(num) || num <= 0) return '—';
  if (num > 1000) num = num / 1000;
  return num.toFixed(3);
}

export default function DashboardTab({ 
  user, 
  activeSpot, 
  stats, 
  subscriptionsCount = 0,
  onRefreshProfile,
  onNavigate,
  onRequireAuth,
  onOpenWebAuth,
  language = 'RU',
  t = (k) => k
}) {
  const [spotModalOpen, setSpotModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Live stations preview
  const [liveStations, setLiveStations] = useState([]);
  const [isWorldFallback, setIsWorldFallback] = useState(false);

  // Horizontal stations slider: mouse drag & wheel scrolling
  const sliderRef = useRef(null);
  const isDown = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const hasMoved = useRef(false);
  const [isGrabbing, setIsGrabbing] = useState(false);

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    const slider = sliderRef.current;
    if (!slider) return;

    isDown.current = true;
    hasMoved.current = false;
    startX.current = e.pageX - slider.offsetLeft;
    scrollLeft.current = slider.scrollLeft;
    setIsGrabbing(true);
  };

  const handleMouseMove = (e) => {
    if (!isDown.current) return;
    const slider = sliderRef.current;
    if (!slider) return;

    const x = e.pageX - slider.offsetLeft;
    const walk = (x - startX.current) * 1.25;

    if (Math.abs(walk) > 4) {
      hasMoved.current = true;
    }

    if (hasMoved.current) {
      e.preventDefault();
      slider.scrollLeft = scrollLeft.current - walk;
    }
  };

  const handleMouseUpOrLeave = () => {
    isDown.current = false;
    setIsGrabbing(false);
    setTimeout(() => {
      hasMoved.current = false;
    }, 60);
  };

  const handleWheel = (e) => {
    const slider = sliderRef.current;
    if (!slider) return;
    if (slider.scrollWidth <= slider.clientWidth) return;

    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      slider.scrollLeft += e.deltaY * 0.9;
    }
  };

  // Modal form fields
  const [parkRef, setParkRef] = useState('RU-0073');
  const [freq, setFreq] = useState('14144');
  const [mode, setMode] = useState('SSB');
  const [comment, setComment] = useState('');
  const [rda, setRda] = useState('');
  const [pwr, setPwr] = useState('');
  const [isEditingActiveSpot, setIsEditingActiveSpot] = useState(false);

  // Guest callsign & active spot state (persisted in localStorage for web visitors)
  const [guestCallsign, setGuestCallsign] = useState(() => {
    try { return localStorage.getItem('pota_guest_callsign') || ''; } catch (e) { return ''; }
  });
  const [guestActiveSpot, setGuestActiveSpot] = useState(() => {
    try {
      const saved = localStorage.getItem('pota_guest_active_spot');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const effectiveActiveSpot = activeSpot || guestActiveSpot;
  const isOnAir = Boolean(effectiveActiveSpot);

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

  const handleOpenEditSpot = () => {
    telegram.haptic.impact('light');
    if (effectiveActiveSpot) {
      setParkRef(effectiveActiveSpot.reference || 'RU-0073');
      const curFreq = effectiveActiveSpot.freqMHz || (effectiveActiveSpot.frequency ? (parseFloat(effectiveActiveSpot.frequency) > 1000 ? (parseFloat(effectiveActiveSpot.frequency) / 1000).toFixed(3) : effectiveActiveSpot.frequency) : effectiveActiveSpot.freq) || '14144';
      setFreq(curFreq);
      setMode(effectiveActiveSpot.mode || 'SSB');
      setComment(effectiveActiveSpot.baseComment || '');
      setRda(effectiveActiveSpot.rda || '');
      setPwr(effectiveActiveSpot.pwr || '');
      setIsEditingActiveSpot(true);
    }
    setErrorMessage('');
    setSpotModalOpen(true);
  };

  const handleOpenNewSpot = () => {
    telegram.haptic.impact('medium');
    setIsEditingActiveSpot(false);
    setErrorMessage('');
    setSpotModalOpen(true);
  };

  const handleSpotSubmit = async (e) => {
    e.preventDefault();
    let finalCallsign = user?.callsign;
    if (!finalCallsign) {
      telegram.haptic.notification('error');
      setErrorMessage(
        language === 'RU'
          ? 'Для отправки спотов необходимо войти в аккаунт.'
          : 'Please sign in to post spots.'
      );
      return;
    }

    setErrorMessage('');
    setSubmitting(true);
    telegram.haptic.impact('medium');

    try {
      const res = await api.postSpot({
        callsign: finalCallsign,
        reference: parkRef,
        frequency: freq,
        mode,
        comment,
        rda,
        pwr
      });

      if (!user?.callsign && res?.activeSpot) {
        setGuestActiveSpot(res.activeSpot);
        try {
          localStorage.setItem('pota_guest_active_spot', JSON.stringify(res.activeSpot));
        } catch (err) {}
      }

      telegram.haptic.notification('success');
      setSpotModalOpen(false);
      alert(
        isEditingActiveSpot
          ? (language === 'RU' ? 'Спот успешно обновлен и опубликован!' : 'Spot successfully updated!')
          : (language === 'RU' ? 'Спот успешно опубликован в эфире!' : 'Spot successfully posted!')
      );
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
      const actCall = user?.callsign || guestActiveSpot?.callsign || guestCallsign;
      const parkRefToStop = effectiveActiveSpot?.reference || 'RU-0073';
      await api.stopSpot({
        callsign: actCall,
        reference: parkRefToStop,
        frequency: effectiveActiveSpot?.frequency || effectiveActiveSpot?.freq || '14000',
        mode: effectiveActiveSpot?.mode || 'SSB',
        parkName: effectiveActiveSpot?.parkName || ''
      });

      if (!user?.callsign) {
        setGuestActiveSpot(null);
        try {
          localStorage.removeItem('pota_guest_active_spot');
        } catch (err) {}
      }

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
    if (!effectiveActiveSpot) return;

    const actCall = user?.callsign || guestActiveSpot?.callsign || guestCallsign;
    if (!actCall) {
      telegram.haptic.notification('error');
      alert(language === 'RU' ? 'Позывной не указан' : 'Callsign not provided');
      return;
    }

    const freqToSend = effectiveActiveSpot.freqMHz || effectiveActiveSpot.frequency || effectiveActiveSpot.freq || '14144';

    try {
      await api.postSpot({
        callsign: actCall,
        reference: effectiveActiveSpot.reference,
        frequency: freqToSend,
        mode: effectiveActiveSpot.mode,
        comment: effectiveActiveSpot.baseComment || '',
        rda: effectiveActiveSpot.rda || '',
        pwr: effectiveActiveSpot.pwr || '',
      });

      telegram.haptic.notification('success');
      alert(language === 'RU' ? 'Спот успешно обновлен в эфире!' : 'Spot successfully renewed on air!');
      if (onRefreshProfile) await onRefreshProfile();
    } catch (err) {
      telegram.haptic.notification('error');
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-4 pb-tab-bottom animate-fade-in">
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
        <div className="p-4 rounded-2xl glass-card border border-emerald-500/25 dark:border-emerald-500/35 bg-gradient-to-r from-emerald-500/10 via-slate-800/30 to-sky-500/10 space-y-3.5">
          {/* Top Row: Brand, Pill Badge & Subtitle */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25 shrink-0">
              <TreePine className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-extrabold text-slate-900 dark:text-white leading-tight whitespace-nowrap">
                  {t('guest_welcome')}
                </h1>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 whitespace-nowrap shrink-0 shadow-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 shrink-0" />
                  {t('guest_badge')}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {t('guest_subtitle')}
              </p>
            </div>
          </div>

          {/* Action Row: Two Clear Full-Width Login Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
            {/* Кнопка 1: Войти через Telegram-бота */}
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
              className="w-full flex items-center justify-center gap-2 text-xs font-bold text-white py-2.5 px-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-md shadow-sky-500/20 transition active:scale-95 cursor-pointer"
              title={language === 'RU' ? 'Войти через Telegram-бота' : 'Login via Telegram Bot'}
            >
              <Send className="w-3.5 h-3.5 shrink-0" />
              <span>{language === 'RU' ? 'Войти через бота' : 'Sign in via Bot'}</span>
            </button>

            {/* Кнопка 2: Войти напрямую через сайт */}
            <button
              type="button"
              onClick={() => {
                telegram.haptic.impact('light');
                if (onOpenWebAuth) {
                  onOpenWebAuth();
                }
              }}
              className="w-full flex items-center justify-center gap-2 text-xs font-bold text-slate-900 dark:text-white py-2.5 px-3 rounded-xl bg-slate-200/90 dark:bg-slate-800/90 hover:bg-slate-300 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 shadow-sm transition active:scale-95 cursor-pointer"
              title={language === 'RU' ? 'Войти напрямую по позывному и Email' : 'Sign in directly with Callsign & Email'}
            >
              <Globe className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>{language === 'RU' ? 'Войти через сайт' : 'Sign in via Website'}</span>
            </button>
          </div>
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
                <span className="font-mono font-bold text-lg text-slate-900 dark:text-white">{effectiveActiveSpot.reference}</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {getDisplayFreq(effectiveActiveSpot)} MHz {effectiveActiveSpot.mode}
                </span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 truncate">
                {effectiveActiveSpot.parkName || (language === 'RU' ? 'Национальный парк' : 'National Park')}
                {effectiveActiveSpot.rda ? ` (RDA: ${effectiveActiveSpot.rda})` : ''}
              </p>
              {effectiveActiveSpot.comment && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 italic truncate">
                  "{effectiveActiveSpot.comment}"
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={handleRespot}
                className="flex items-center justify-center gap-1 py-2.5 px-2 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-glow-emerald transition active:scale-95"
                title={t('dash_respot')}
              >
                <Radio className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{t('dash_respot')}</span>
              </button>

              <button
                type="button"
                onClick={handleOpenEditSpot}
                className="flex items-center justify-center gap-1 py-2.5 px-2 rounded-xl text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 transition active:scale-95"
                title={t('modal_edit_spot_title')}
              >
                <Edit3 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{t('dash_edit_spot')}</span>
              </button>

              <button
                type="button"
                onClick={handleQRT}
                className="flex items-center justify-center gap-1 py-2.5 px-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition active:scale-95"
                title={t('dash_qrt')}
              >
                <Square className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{t('dash_qrt')}</span>
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
            {/* Spot Action Button: strictly for registered & approved operators */}
            {!user || !user.callsign || user.status === 'guest' ? (
              <button
                type="button"
                onClick={() => {
                  telegram.haptic.impact('light');
                  if (onOpenWebAuth) {
                    onOpenWebAuth();
                  } else if (onRequireAuth) {
                    onRequireAuth(
                      language === 'RU' ? 'Вход для отправки спотов' : 'Sign in to Post Spots',
                      language === 'RU'
                        ? 'Публикация спотов в эфире доступна только зарегистрированным операторам. Войдите через Telegram-бота или по позывному на сайте.'
                        : 'Posting spots is only available to registered operators. Log in via Telegram bot or with your callsign on the site.'
                    );
                  }
                }}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm text-slate-900 dark:text-white bg-slate-200/90 dark:bg-slate-800/90 hover:bg-slate-300 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 shadow-sm transition-all active:scale-95 cursor-pointer"
              >
                <Lock className="w-4 h-4 text-emerald-500" />
                <span>{language === 'RU' ? 'Отправить спот в эфир (нужен вход)' : 'Post Spot (Sign in required)'}</span>
              </button>
            ) : user.status === 'pending' ? (
              <button
                type="button"
                onClick={async () => {
                  telegram.haptic.notification('warning');
                  if (onRefreshProfile) await onRefreshProfile();
                  alert(
                    language === 'RU'
                      ? `⏳ Ваш позывной ${user.callsign} находится на проверке администратором. Публикация спотов станет доступна сразу после одобрения заявки!`
                      : `⏳ Your callsign ${user.callsign} is pending administrator review. Spotting will be enabled once approved!`
                  );
                }}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm text-amber-800 dark:text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 transition-all active:scale-95"
              >
                <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>{t('dash_spot_locked_pending')}</span>
              </button>
            ) : user.status === 'rejected' ? (
              <button
                type="button"
                onClick={() => {
                  telegram.haptic.notification('error');
                  if (onNavigate) onNavigate('profile');
                }}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm text-rose-800 dark:text-rose-200 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 transition-all active:scale-95"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                <span>{t('dash_spot_locked_rejected')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenNewSpot}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm text-slate-950 bg-gradient-to-r from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 shadow-glow-emerald transition-all active:scale-95"
              >
                <Send className="w-4 h-4" />
                <span>{t('dash_send_spot_btn')}</span>
              </button>
            )}
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
          <div className="flex items-center gap-2">
            {/* Desktop scroll navigation arrows */}
            {liveStations.length > 2 && (
              <div className="hidden sm:flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    sliderRef.current?.scrollBy({ left: -220, behavior: 'smooth' });
                  }}
                  className="p-1 rounded-lg bg-slate-200/80 dark:bg-slate-800/80 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition active:scale-95"
                  title="Назад"
                  aria-label="Назад"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sliderRef.current?.scrollBy({ left: 220, behavior: 'smooth' });
                  }}
                  className="p-1 rounded-lg bg-slate-200/80 dark:bg-slate-800/80 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition active:scale-95"
                  title="Вперёд"
                  aria-label="Вперёд"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
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
        </div>

        <div 
          ref={sliderRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
          onWheel={handleWheel}
          className={`flex gap-2.5 overflow-x-auto pb-3.5 pt-1 px-1 slider-scrollbar ${
            isGrabbing ? 'cursor-grabbing select-none' : 'cursor-grab'
          }`}
        >
          {liveStations.length === 0 ? (
            <div className="w-full p-4 rounded-xl glass-card text-center text-xs text-slate-500 dark:text-slate-400">
              {t('dash_quiet_notice')}
            </div>
          ) : (
            liveStations.map((st) => (
              <div 
                key={st.id}
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                onClick={() => {
                  if (hasMoved.current) return;
                  telegram.haptic.impact('light');
                  onNavigate('cluster', { 
                    scope: st.isRu ? 'ru' : 'world', 
                    search: '', 
                    highlightCallsign: st.callsign 
                  });
                }}
                className="min-w-[185px] p-3 rounded-xl glass-card hover:border-emerald-500/50 cursor-pointer transition active:scale-95 select-none shrink-0"
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
                  ? 'Чтобы просматривать личную статистику активаций и дипломов, войдите через Telegram-бота или напрямую через сайт по Email.'
                  : 'To track personal activations and awards, please sign in via Telegram bot or directly on the website with Email.'
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
                  ? 'Чтобы настроить персональные подписки и получать мгновенные алерты, войдите через Telegram-бота или напрямую через сайт.'
                  : 'To manage subscriptions and receive instant alerts, please sign in via Telegram bot or directly on the website.'
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
                <span className={`font-bold ${user.notifications_enabled !== false ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {user.notifications_enabled !== false ? t('dash_enabled') : t('dash_disabled')}
                </span>
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
      {spotModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => !submitting && setSpotModalOpen(false)} />
          <div className="relative w-full max-w-sm glass-card rounded-2xl p-5 shadow-2xl space-y-4 animate-slide-up">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                {isEditingActiveSpot ? t('modal_edit_spot_title') : t('modal_spot_title')}
              </h3>
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
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 font-medium">{language === 'RU' ? 'Оператор' : 'Operator'}:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">{user?.callsign}</span>
              </div>
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

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">{t('modal_rda_label')}</label>
                  <input 
                    type="text" 
                    value={rda}
                    onChange={(e) => setRda(e.target.value.toUpperCase())}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono uppercase focus:border-emerald-500 outline-none"
                    placeholder="NS-03 / MA-01"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">{t('modal_pwr_label')}</label>
                  <input 
                    type="text" 
                    value={pwr}
                    onChange={(e) => setPwr(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:border-emerald-500 outline-none"
                    placeholder={t('modal_pwr_ph')}
                  />
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
                {submitting ? t('modal_publishing') : (isEditingActiveSpot ? t('modal_update_btn') : t('modal_publish_btn'))}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Radio, 
  Search, 
  MapPin, 
  Bell, 
  BellOff,
  Clock, 
  RefreshCw,
  Compass,
  MessageSquare,
  AlertCircle,
  Check,
  Calendar
} from 'lucide-react';
import { telegram } from '../../services/telegram.js';
import { api } from '../../services/api.js';
import { formatTimeAgoLocale } from '../../services/i18n.js';

const BANDS = ['Все', '40m', '20m', '15m', '10m', '2m'];
const MODES = ['Все', 'SSB', 'CW', 'FT8', 'FM'];

export default function ClusterTab({ user, onNavigate, onRequireAuth, clusterFilter, language = 'RU', t = (k) => k }) {
  const [scope, setScope] = useState(() => clusterFilter?.scope || 'ru');
  const [selectedBand, setSelectedBand] = useState('Все');
  const [selectedMode, setSelectedMode] = useState('Все');
  const [searchQuery, setSearchQuery] = useState(() => clusterFilter?.search || '');
  const [highlightCallsign, setHighlightCallsign] = useState(() => clusterFilter?.highlightCallsign || null);
  
  const [spots, setSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Sync with incoming clusterFilter from navigation
  useEffect(() => {
    if (clusterFilter) {
      if (clusterFilter.scope) setScope(clusterFilter.scope);
      if (clusterFilter.search !== undefined) setSearchQuery(clusterFilter.search);
      if (clusterFilter.highlightCallsign !== undefined) {
        setHighlightCallsign(clusterFilter.highlightCallsign);
      }
    }
  }, [clusterFilter]);

  // Smooth scroll to highlighted station card once spots are loaded
  useEffect(() => {
    if (highlightCallsign && spots.length > 0) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`spot-card-${highlightCallsign}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [highlightCallsign, spots]);

  const fetchSpots = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    else setIsRefreshing(true);
    setError(null);

    try {
      const data = await api.getSpots({
        scope,
        band: selectedBand,
        mode: selectedMode,
        search: searchQuery,
      });
      setSpots(data.spots || []);
    } catch (err) {
      console.warn('[ClusterTab] Fetch error:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [scope, selectedBand, selectedMode, searchQuery]);

  useEffect(() => {
    fetchSpots();
    // Auto-refresh every 20 seconds
    const timer = setInterval(() => {
      fetchSpots(true);
    }, 20000);
    return () => clearInterval(timer);
  }, [fetchSpots]);

  // Scheduled Activations (Plans) State
  const [viewMode, setViewMode] = useState('live'); // 'live' | 'plans'
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [isRefreshingPlans, setIsRefreshingPlans] = useState(false);

  const fetchPlans = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoadingPlans(true);
    else setIsRefreshingPlans(true);
    try {
      const data = await api.getPlans({ scope, search: searchQuery });
      setPlans(data.plans || []);
    } catch (err) {
      console.warn('[ClusterTab] Plans fetch error:', err.message);
    } finally {
      setLoadingPlans(false);
      setIsRefreshingPlans(false);
    }
  }, [scope, searchQuery]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const [subscribedCallsigns, setSubscribedCallsigns] = useState(new Set());

  // Load user subscriptions to display active follow state on cards
  const loadSubscriptions = useCallback(async () => {
    if (!user) {
      setSubscribedCallsigns(new Set());
      return;
    }
    try {
      const res = await api.getSubscriptions();
      const set = new Set();
      (res.callsigns || []).forEach(sub => {
        if (sub.target) {
          const t = sub.target.toUpperCase();
          set.add(t);
          set.add(t.split('/')[0]);
        }
      });
      setSubscribedCallsigns(set);
    } catch (e) {}
  }, [user]);

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  const handleSubscribe = async (callsign) => {
    telegram.haptic.impact('medium');
    if (!user) {
      if (onRequireAuth) {
        onRequireAuth(
          language === 'RU' ? 'Подписка на позывной' : 'Follow Callsign',
          language === 'RU'
            ? `Чтобы получать в ЛС уведомления о спотах оператора ${callsign}, авторизуйтесь через Telegram-бота @ru_pota_bot.`
            : `To get DM alerts whenever ${callsign} spots from a park, please sign in via @ru_pota_bot.`
        );
      } else {
        telegram.openTelegramBot('hub');
      }
      return;
    }

    try {
      await api.addSubscription({ type: 'callsign', target: callsign });
      telegram.haptic.notification('success');
      setSubscribedCallsigns(prev => {
        const next = new Set(prev);
        const up = callsign.toUpperCase();
        next.add(up);
        next.add(up.split('/')[0]);
        return next;
      });
      // Focus on station upon following
      setHighlightCallsign(callsign);
    } catch (err) {
      telegram.haptic.notification('error');
      alert(`Error: ${err.message}`);
    }
  };

  const handleUnsubscribe = async (callsign) => {
    telegram.haptic.impact('light');
    try {
      await api.deleteSubscriptionByTarget('callsign', callsign);
      telegram.haptic.notification('success');
      setSubscribedCallsigns(prev => {
        const next = new Set(prev);
        const up = callsign.toUpperCase();
        next.delete(up);
        next.delete(up.split('/')[0]);
        return next;
      });
      // Remove focus upon unfollowing
      setHighlightCallsign(prev => {
        if (!prev) return null;
        const cleanPrev = prev.toUpperCase().split('/')[0];
        const cleanCall = callsign.toUpperCase().split('/')[0];
        return (cleanPrev === cleanCall) ? null : prev;
      });
    } catch (err) {
      telegram.haptic.notification('error');
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-3 pb-tab-bottom animate-fade-in">
      {/* 0. Main Mode: Live Spots (В эфире) vs Scheduled Plans (Планы) */}
      <div className="flex p-1 rounded-2xl bg-slate-200/90 dark:bg-slate-900/90 border border-slate-300/80 dark:border-slate-800 shadow-inner">
        <button
          type="button"
          onClick={() => {
            telegram.haptic.selection();
            setViewMode('live');
          }}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
            viewMode === 'live'
              ? 'bg-gradient-to-r from-emerald-500/25 to-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 shadow-glow-pill font-extrabold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>{language === 'RU' ? 'В эфире' : 'Live Spots'}</span>
          {spots.length > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold rounded-full flex items-center justify-center">
              {spots.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            telegram.haptic.selection();
            setViewMode('plans');
          }}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
            viewMode === 'plans'
              ? 'bg-gradient-to-r from-blue-500/25 to-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/40 shadow-glow-pill font-extrabold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>{language === 'RU' ? 'Планы активаций' : 'Scheduled Plans'}</span>
          {plans.length > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 bg-blue-500/20 text-blue-700 dark:text-blue-300 text-[10px] font-bold rounded-full flex items-center justify-center">
              {plans.length}
            </span>
          )}
        </button>
      </div>

      {/* 1. Scope Switch (RU/CIS vs World) & Refresh */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex p-1 rounded-xl bg-slate-200/80 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-800 flex-1">
          <button
            type="button"
            onClick={() => {
              telegram.haptic.selection();
              setScope('ru');
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition ${
              scope === 'ru'
                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shadow-glow-pill'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t('cluster_ru_only')}
          </button>
          <button
            type="button"
            onClick={() => {
              telegram.haptic.selection();
              setScope('world');
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition ${
              scope === 'world'
                ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t('cluster_world')}
          </button>
        </div>

        <button
          type="button"
          onClick={() => (viewMode === 'plans' ? fetchPlans(true) : fetchSpots(true))}
          disabled={viewMode === 'plans' ? isRefreshingPlans : isRefreshing}
          className="p-2.5 rounded-xl bg-slate-200/80 dark:bg-slate-800/80 hover:bg-slate-300 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/70 text-slate-700 dark:text-slate-300 transition active:scale-95 disabled:opacity-50"
          title="Обновить"
        >
          <RefreshCw className={`w-4 h-4 ${viewMode === 'plans' ? 'text-blue-500' : 'text-emerald-600 dark:text-emerald-400'} ${(viewMode === 'plans' ? isRefreshingPlans : isRefreshing) ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 2. Instant Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('cluster_search_ph')}
          className="w-full bg-slate-200/60 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:border-emerald-500/60 outline-none"
        />
      </div>

      {viewMode === 'plans' ? (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
            <span>
              {loadingPlans 
                ? (language === 'RU' ? 'Загрузка планов...' : 'Loading plans...') 
                : (language === 'RU' ? `Запланировано активаций: ${plans.length}` : `Scheduled: ${plans.length}`)}
            </span>
            <span className="flex items-center gap-1 font-mono text-[11px] text-blue-500">
              <Calendar className="w-3 h-3" />
              <span>pota.app</span>
            </span>
          </div>

          {loadingPlans && plans.length === 0 ? (
            <div className="space-y-2.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-3.5 rounded-2xl glass-card space-y-2 animate-pulse border border-slate-200/50 dark:border-slate-800/80">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-4 bg-slate-200 dark:bg-slate-700/60 rounded" />
                      <div className="w-14 h-4 bg-blue-500/10 dark:bg-blue-500/20 rounded" />
                    </div>
                    <div className="w-16 h-4 bg-slate-200 dark:bg-slate-700/60 rounded" />
                  </div>
                  <div className="w-4/5 h-3.5 bg-slate-200 dark:bg-slate-700/40 rounded" />
                </div>
              ))}
            </div>
          ) : plans.length === 0 ? (
            <div className="p-8 text-center glass-card rounded-2xl space-y-3">
              <Calendar className="w-8 h-8 mx-auto text-blue-400/60" />
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-200">
                  {language === 'RU' ? 'Нет запланированных активаций' : 'No upcoming activations'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
                  {language === 'RU'
                    ? (scope === 'ru' ? 'В эфире RU/СНГ пока нет анонсированных выездов. Переключите на «Весь мир» или загляните позже!' : 'По выбранному фильтру планов не найдено.')
                    : 'No scheduled activations found for this scope.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {plans.map((p) => {
                const dateText = p.startDate === p.endDate || !p.endDate
                  ? p.startDate
                  : `${p.startDate} — ${p.endDate}`;
                const timeText = p.startTime
                  ? (p.endTime ? `${p.startTime}–${p.endTime} UTC` : `${p.startTime} UTC`)
                  : '';

                return (
                  <div key={p.id} className="p-3.5 rounded-2xl glass-card border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1 font-mono font-bold text-blue-700 dark:text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{dateText}</span>
                        {timeText && <span className="opacity-75 ml-1 font-normal">({timeText})</span>}
                      </span>
                      {p.country && (
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                          {p.country} {p.regionName || p.countryName}
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono font-extrabold text-base text-slate-900 dark:text-white tracking-wide">
                          {p.activator}
                        </span>
                        <span className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                          {p.reference}
                        </span>
                      </div>
                      {p.frequencies && (
                        <span className="font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          {p.frequencies}
                        </span>
                      )}
                    </div>

                    {p.parkName && (
                      <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-snug">
                        🌲 {p.parkName}
                      </p>
                    )}

                    {p.comments && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 font-mono bg-slate-200/50 dark:bg-slate-800/60 p-2 rounded-xl leading-relaxed">
                        📝 {p.comments}
                      </p>
                    )}

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/80">
                      {p.reference && onNavigate && (
                        <button
                          type="button"
                          onClick={() => onNavigate('map', { focusParkRef: p.reference })}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 transition active:scale-95 cursor-pointer"
                        >
                          <Compass className="w-3.5 h-3.5" />
                          <span>{language === 'RU' ? 'На карте' : 'On Map'}</span>
                        </button>
                      )}
                      <a
                        href={`https://next.pota.app/park/${p.reference}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/80 dark:border-slate-700 transition active:scale-95 ml-auto"
                      >
                        <span>pota.app ↗</span>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* 3. Filter Chips: Bands */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
        {BANDS.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => {
              telegram.haptic.selection();
              setSelectedBand(b);
            }}
            className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition ${
              selectedBand === b
                ? 'bg-slate-300 dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 font-bold'
                : 'bg-slate-200/50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 border border-slate-300/80 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {b === 'Все' ? (language === 'RU' ? 'Все' : 'All') : b}
          </button>
        ))}
      </div>

      {/* 4. Filter Chips: Modes */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              telegram.haptic.selection();
              setSelectedMode(m);
            }}
            className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition ${
              selectedMode === m
                ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/40 font-bold'
                : 'bg-slate-200/50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 border border-slate-300/80 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {m === 'Все' ? (language === 'RU' ? 'Все' : 'All') : m}
          </button>
        ))}
      </div>

      {/* 5. Spots Feed */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
          <span>
            {loading ? t('cluster_connecting') : `${t('cluster_found')} ${spots.length}`}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
            <span>{t('cluster_autorefresh')}</span>
          </span>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && spots.length === 0 ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => (
              <div 
                key={i} 
                className="p-3.5 rounded-2xl glass-card space-y-2.5 animate-pulse border border-slate-200/50 dark:border-slate-800/80"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-4 bg-slate-200 dark:bg-slate-700/60 rounded" />
                    <div className="w-24 h-5 bg-slate-200 dark:bg-slate-700/60 rounded" />
                    <div className="w-10 h-4 bg-blue-500/10 dark:bg-blue-500/20 rounded" />
                  </div>
                  <div className="w-16 h-5 bg-emerald-500/10 dark:bg-emerald-500/20 rounded" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-4 bg-slate-200 dark:bg-slate-700/60 rounded" />
                  <div className="w-3/5 h-4 bg-slate-200 dark:bg-slate-700/40 rounded" />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div className="w-20 h-3 bg-slate-200 dark:bg-slate-700/30 rounded" />
                  <div className="w-24 h-3 bg-slate-200 dark:bg-slate-700/30 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : spots.length === 0 ? (
          <div className="p-8 text-center glass-card rounded-2xl space-y-3">
            <Radio className="w-8 h-8 mx-auto text-emerald-500 dark:text-emerald-400" />
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-200">
                {scope === 'ru' ? t('cluster_ru_quiet_title') : t('cluster_not_found')}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
                {scope === 'ru' 
                  ? t('cluster_ru_quiet_desc')
                  : t('cluster_reset_filters')}
              </p>
            </div>
            {scope === 'ru' && (
              <button
                type="button"
                onClick={() => {
                  telegram.haptic.selection();
                  setScope('world');
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-glow-emerald transition active:scale-95"
              >
                {t('cluster_show_world_btn')}
              </button>
            )}
          </div>
        ) : (
          spots.map((spot) => {
            const isFocused = Boolean(
              highlightCallsign && 
              (spot.callsign.toUpperCase() === highlightCallsign.toUpperCase() ||
               spot.callsign.toUpperCase().startsWith(highlightCallsign.toUpperCase()))
            );

            return (
              <div 
                key={spot.id} 
                id={isFocused ? `spot-card-${highlightCallsign}` : undefined}
                onClick={() => {
                  telegram.haptic.selection();
                  setHighlightCallsign(prev => (prev === spot.callsign ? null : spot.callsign));
                }}
                className={`p-3.5 rounded-2xl glass-card transition-all duration-300 space-y-2.5 cursor-pointer hover:border-emerald-500/40 active:scale-[0.99] select-none ${
                  isFocused 
                    ? 'spot-card-focused' 
                    : ''
                }`}
              >
                {/* Header: Call, Flag, Mode, Freq */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span 
                      className="text-base select-none" 
                      title={language === 'RU' ? (spot.countryName || spot.entityName) : (spot.countryNameEn || spot.countryName || spot.entityName)}
                    >
                      {spot.country}
                    </span>
                    <span className="font-mono font-extrabold text-base text-slate-900 dark:text-white tracking-wide">
                      {spot.callsign}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/20">
                      {spot.mode}
                    </span>
                    {isFocused && (
                      <span className="flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-600 text-white dark:bg-emerald-400 dark:text-slate-950 shadow-sm animate-pulse select-none">
                        <Check className="w-3 h-3 stroke-[3]" />
                        <span>{language === 'RU' ? 'ВЫБРАН' : 'SELECTED'}</span>
                      </span>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <span className={`font-mono font-extrabold text-sm tracking-tight tnum ${
                      isFocused ? 'text-emerald-700 dark:text-emerald-300' : 'text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {spot.freq}&nbsp;<span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">MHz</span>
                    </span>
                    <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-mono tnum">
                      {formatTimeAgoLocale(spot.diffMinutes, spot.timeAgo, language)}
                    </span>
                  </div>
                </div>

                {/* Park Info */}
                <div className={`p-2.5 rounded-xl border transition ${
                  isFocused 
                    ? 'bg-emerald-100/70 dark:bg-slate-900/80 border-emerald-300 dark:border-emerald-500/40 shadow-sm' 
                    : 'bg-slate-100 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800/80'
                }`}>
                  <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-800 dark:text-emerald-300">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 tnum">
                      {spot.park}
                    </span>
                    {spot.parkName && (
                      <span className="font-sans font-medium text-slate-800 dark:text-slate-100 truncate">
                        {spot.parkName}
                      </span>
                    )}
                  </div>
                  
                  {/* Geographical Location (Country, Region/City, Grid) */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400 pl-5 mt-1.5">
                    {(spot.countryName || spot.country) && (
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200 shrink-0">
                        <span>{spot.country}</span>
                        <span>{language === 'RU' ? (spot.countryName || spot.entityName) : (spot.countryNameEn || spot.countryName || spot.entityName)}</span>
                      </span>
                    )}

                    {(spot.regionName || spot.location) && (
                      <>
                        <span className="text-slate-300 dark:text-slate-600 select-none">•</span>
                        <span className="text-slate-700 dark:text-slate-300 truncate max-w-[220px]">
                          {spot.regionName 
                            ? `${spot.regionName}${spot.location && spot.location !== spot.regionName ? ` (${spot.location})` : ''}` 
                            : spot.location}
                        </span>
                      </>
                    )}

                    {spot.grid && (
                      <>
                        <span className="text-slate-300 dark:text-slate-600 select-none">•</span>
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/80 dark:border-slate-700 shrink-0 tnum">
                          🧭 {spot.grid}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Comment & Spotter */}
                {spot.comment && (
                  <div className="flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                    <MessageSquare className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0 mt-0.5" />
                    <span className="italic truncate">{language === 'RU' ? `«${spot.comment}»` : `“${spot.comment}”`}</span>
                    {spot.spotter && (
                      <span className="text-slate-400 dark:text-slate-500 text-[11px] font-mono shrink-0 ml-auto tnum">
                        {t('cluster_by')} {spot.spotter}
                      </span>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className={`flex items-center justify-between gap-2 pt-1.5 border-t ${
                  isFocused ? 'border-emerald-200 dark:border-emerald-500/30' : 'border-slate-200 dark:border-slate-800/60'
                }`}>
                  {isFocused ? (
                    <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400 italic">
                      {language === 'RU' ? 'Нажмите, чтобы снять' : 'Tap to deselect'}
                    </span>
                  ) : <span />}

                  <div className="flex items-center gap-2">
                    {(() => {
                      const cleanCall = spot.callsign.split('/')[0].toUpperCase();
                      const isSubscribed = subscribedCallsigns.has(spot.callsign.toUpperCase()) || subscribedCallsigns.has(cleanCall);

                      return isSubscribed ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnsubscribe(spot.callsign);
                          }}
                          className="flex items-center gap-1.5 min-h-[32px] px-3 py-1 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 transition-all duration-150 active:scale-96 shadow-sm cursor-pointer"
                          title={language === 'RU' ? 'Отписаться от позывного' : 'Unfollow callsign'}
                        >
                          <BellOff className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span>{t('cluster_unfollow_btn')}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSubscribe(spot.callsign);
                          }}
                          className="flex items-center gap-1.5 min-h-[32px] px-3 py-1 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 transition-all duration-150 active:scale-96 cursor-pointer"
                          title={language === 'RU' ? 'Следить за позывным' : 'Follow callsign'}
                        >
                          <Bell className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
                          <span>{t('cluster_follow_btn')}</span>
                        </button>
                      );
                    })()}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        telegram.haptic.impact('light');
                        onNavigate('map', { focusParkRef: spot.park, spotTarget: spot });
                      }}
                      className="flex items-center gap-1.5 min-h-[32px] px-3 py-1 rounded-xl text-xs font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 transition-all duration-150 active:scale-96 cursor-pointer"
                      title={language === 'RU' ? 'Показать парк на карте' : 'Show park on map'}
                    >
                      <Compass className="w-3.5 h-3.5" />
                      <span>{t('cluster_on_map_btn')}</span>
                    </button>
                  </div>
                </div>
              </div>


            );
          })
        )}
      </div>
    </>
  )}
</div>
  );
}

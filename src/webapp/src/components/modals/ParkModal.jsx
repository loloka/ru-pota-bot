import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  MapPin, 
  ExternalLink, 
  Navigation, 
  Smartphone, 
  Radio, 
  Car, 
  Award, 
  Flame, 
  Bell, 
  Check, 
  Calendar, 
  User, 
  ChevronDown, 
  ChevronUp, 
  Copy, 
  Sparkles,
  Info,
  Clock,
  Compass,
  Footprints,
  Globe,
  Loader2,
  TrendingUp,
  Target
} from 'lucide-react';
import { telegram } from '../../services/telegram.js';
import { api } from '../../services/api.js';

export default function ParkModal({ 
  park, 
  user, 
  language = 'RU', 
  t = (k) => k, 
  onClose,
  onOpenRoute,
  onOpenOsmAnd,
  onNavigateToCallsign
}) {
  const parkRef = (park?.reference || (typeof park === 'string' ? park : '')).trim().toUpperCase();

  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('leaders'); // 'leaders' | 'history' | 'info'
  const [leaderTab, setLeaderTab] = useState('activations'); // 'activations' | 'activator_qsos' | 'hunter_qsos'
  const [showAllLeaders, setShowAllLeaders] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(Boolean(park?.isSubscribed));
  const [subscribing, setSubscribing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Native Telegram BackButton & desktop Escape key navigation
  useEffect(() => {
    const handleBack = () => {
      onClose();
    };

    telegram.backButton.show(handleBack);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      telegram.backButton.hide(handleBack);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Load enriched park data from TMA API
  useEffect(() => {
    if (!parkRef) return;
    let isMounted = true;
    setLoading(true);
    setError(null);

    const userCall = user?.callsign || '';
    api.lookupPark(parkRef, userCall)
      .then((data) => {
        if (!isMounted) return;
        setDetails(data);
        if (data.isSubscribed !== undefined) {
          setIsSubscribed(data.isSubscribed);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || 'Ошибка загрузки данных о парке');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [parkRef, user?.callsign]);

  // Toggle Subscription
  const handleToggleSub = async () => {
    if (!user || user.status !== 'approved') {
      telegram.haptic.notification('warning');
      return;
    }

    telegram.haptic.impact('medium');
    setSubscribing(true);

    try {
      if (isSubscribed) {
        // Find subscription id
        const subsData = await api.getSubscriptions();
        const existing = subsData?.subscriptions?.find(
          s => s.type === 'park' && s.target.toUpperCase() === parkRef
        );
        if (existing) {
          await api.deleteSubscription(existing.id);
        }
        setIsSubscribed(false);
        telegram.haptic.notification('success');
      } else {
        await api.addSubscription({
          type: 'park',
          target: parkRef,
        });
        setIsSubscribed(true);
        telegram.haptic.notification('success');
      }
    } catch (err) {
      telegram.haptic.notification('error');
    } finally {
      setSubscribing(false);
    }
  };

  const handleCopyCoords = () => {
    const lat = details?.lat || park?.lat;
    const lon = details?.lon || park?.lon;
    if (lat && lon) {
      navigator.clipboard.writeText(`${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}`);
      setCopied(true);
      telegram.haptic.notification('success');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const current = details || park || {};
  const myStats = details?.myStats || null;
  const userCallsign = (user?.callsign || '').toUpperCase();

  // Selected leader list
  const leadersList = details?.leaderboard?.[leaderTab] || [];
  const displayedLeaders = showAllLeaders ? leadersList : leadersList.slice(0, 5);

  const historyList = details?.recentActivations || [];
  const displayedHistory = showAllHistory ? historyList : historyList.slice(0, 5);

  const accessMethodsList = current.accessMethods ? current.accessMethods.split(',').map(s => s.trim()).filter(Boolean) : [];
  const activationMethodsList = current.activationMethods ? current.activationMethods.split(',').map(s => s.trim()).filter(Boolean) : [];

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pt-10 pb-safe">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md animate-fade-in" 
        onClick={onClose} 
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-3xl glass-card shadow-2xl border border-emerald-500/30 animate-slide-up z-10 overflow-hidden bg-slate-900/95 text-slate-100">
        
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-start justify-between gap-3 bg-slate-950/40">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-extrabold text-sm px-2.5 py-0.5 rounded-lg bg-emerald-500 text-slate-950 shadow-glow-emerald">
                {parkRef}
              </span>

              {current.parktypeDesc && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 truncate">
                  {current.parktypeDesc}
                </span>
              )}

              {current.isActive && (
                <span className="flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 animate-pulse shadow-glow-emerald">
                  <Radio className="w-3 h-3" />
                  <span>{language === 'RU' ? 'В ЭФИРЕ' : 'ON AIR'}</span>
                </span>
              )}
            </div>

            <h3 className="font-bold text-base sm:text-lg text-white leading-tight break-words">
              {current.name || 'Загрузка парка...'}
            </h3>

            <p className="text-xs text-slate-400 flex items-center gap-1.5 flex-wrap">
              <span>{current.region || current.locationDesc || 'POTA'}</span>
              {current.grid ? <span>• QTH: <b className="font-mono text-slate-300">{current.grid}</b></span> : null}
              {current.lat && current.lon ? (
                <span>• {Number(current.lat).toFixed(4)}, {Number(current.lon).toFixed(4)}</span>
              ) : null}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
          
          {/* Active Spot Banner if station is on air right now */}
          {current.isActive && current.activeSpot && (
            <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-between shadow-lg">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-bold">
                  <Radio className="w-4 h-4 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-extrabold text-sm text-white">
                      {current.activeSpot.callsign}
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/30 text-emerald-300 font-mono">
                      {current.activeSpot.mode}
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-300 font-mono">
                    {current.activeSpot.freq} MHz
                    {current.activeSpot.comments ? ` • ${current.activeSpot.comments}` : ''}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60">
              <span className="text-[10px] text-slate-400 block">{language === 'RU' ? 'Активаций' : 'Activations'}</span>
              <span className="font-mono font-bold text-sm text-emerald-400">
                {current.activations || 0}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60">
              <span className="text-[10px] text-slate-400 block">{language === 'RU' ? 'Всего QSO' : 'Total QSOs'}</span>
              <span className="font-mono font-bold text-sm text-cyan-400">
                {current.qsos || 0}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60">
              <span className="text-[10px] text-slate-400 block">{language === 'RU' ? 'Попыток' : 'Attempts'}</span>
              <span className="font-mono font-bold text-sm text-amber-400">
                {current.attempts || current.activations || 0}
              </span>
            </div>
          </div>

          {/* ======================================================== */}
          {/* PERSONAL OPERATOR STATS CARD (MATCHING LOGGED IN CALLSIGN) */}
          {/* ======================================================== */}
          {userCallsign ? (
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-slate-800/90 to-emerald-950/40 border border-emerald-500/40 shadow-md space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-bold text-xs text-white">
                    {language === 'RU' ? 'Ваша активность в парке' : 'Your park activity'}
                  </span>
                  <span className="font-mono font-extrabold text-xs px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {userCallsign}
                  </span>
                </div>

                {myStats?.isFirstActivator && (
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>{language === 'RU' ? 'Первооткрыватель' : 'First Activator'}</span>
                  </span>
                )}
              </div>

              {loading ? (
                <div className="flex items-center gap-2 text-slate-400 text-[11px] py-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                  <span>{language === 'RU' ? 'Сопоставляем ваши QSO с базой POTA...' : 'Matching your QSOs...'}</span>
                </div>
              ) : myStats?.hasActivity ? (
                <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono">
                  <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-700/80">
                    <div className="text-[10px] text-slate-400">{language === 'RU' ? 'Поездки' : 'Activations'}</div>
                    <div className="font-bold text-sm text-emerald-400 mt-0.5">
                      {myStats.activations.count}
                    </div>
                    <div className="text-[9px] text-slate-500">
                      {myStats.activations.rank ? `#${myStats.activations.rank} в топе` : '—'}
                    </div>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-700/80">
                    <div className="text-[10px] text-slate-400">{language === 'RU' ? 'QSO (Акт.)' : 'Act. QSOs'}</div>
                    <div className="font-bold text-sm text-cyan-400 mt-0.5">
                      {myStats.activatorQsos.count}
                    </div>
                    <div className="text-[9px] text-slate-500">
                      {myStats.activatorQsos.rank ? `#${myStats.activatorQsos.rank} в топе` : '—'}
                    </div>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-700/80">
                    <div className="text-[10px] text-slate-400">{language === 'RU' ? 'QSO (Охот.)' : 'Hunt QSOs'}</div>
                    <div className="font-bold text-sm text-blue-400 mt-0.5">
                      {myStats.hunterQsos.count}
                    </div>
                    <div className="text-[9px] text-slate-500">
                      {myStats.hunterQsos.rank ? `#${myStats.hunterQsos.rank} в топе` : '—'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>
                    {language === 'RU'
                      ? 'Вы ещё не активировали этот парк и не охотились за ним в POTA. Отличная цель для выезда или QSO!'
                      : 'You have not activated or hunted this park yet in POTA. Great target for a trip or QSO!'}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
              <User className="w-4 h-4 text-slate-500 flex-shrink-0" />
              <span>
                {language === 'RU' 
                  ? 'Привяжите позывной в профиле, чтобы бот автоматически показывал вашу статистику в этом парке.'
                  : 'Link your callsign in profile to see personalized stats for this park.'}
              </span>
            </div>
          )}

          {/* Navigation Tabs (Leaders / History / Info) */}
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-800/80 border border-slate-700/80 text-xs">
            <button
              type="button"
              onClick={() => {
                telegram.haptic.selection();
                setActiveTab('leaders');
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-bold transition ${
                activeTab === 'leaders'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>{language === 'RU' ? 'Лидеры' : 'Leaders'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                telegram.haptic.selection();
                setActiveTab('history');
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-bold transition ${
                activeTab === 'history'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{language === 'RU' ? 'История' : 'History'}</span>
              {historyList.length > 0 && (
                <span className={`text-[10px] font-mono px-1 rounded ${activeTab === 'history' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-700 text-slate-300'}`}>
                  {historyList.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                telegram.haptic.selection();
                setActiveTab('info');
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-bold transition ${
                activeTab === 'info'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Info className="w-3.5 h-3.5" />
              <span>{language === 'RU' ? 'О парке' : 'About'}</span>
            </button>
          </div>

          {/* ======================================================== */}
          {/* TAB 1: LEADERBOARDS */}
          {/* ======================================================== */}
          {activeTab === 'leaders' && (
            <div className="space-y-3">
              {/* Leaderboard subcategory switch */}
              <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-950/50 border border-slate-800 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    telegram.haptic.selection();
                    setLeaderTab('activations');
                  }}
                  className={`py-1.5 px-1 rounded-lg font-semibold text-center transition ${
                    leaderTab === 'activations'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>🚗 {language === 'RU' ? 'Поездки' : 'Trips'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    telegram.haptic.selection();
                    setLeaderTab('activator_qsos');
                  }}
                  className={`py-1.5 px-1 rounded-lg font-semibold text-center transition ${
                    leaderTab === 'activator_qsos'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>⚡ {language === 'RU' ? 'QSO Акт.' : 'Act. QSO'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    telegram.haptic.selection();
                    setLeaderTab('hunter_qsos');
                  }}
                  className={`py-1.5 px-1 rounded-lg font-semibold text-center transition ${
                    leaderTab === 'hunter_qsos'
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>🎯 {language === 'RU' ? 'QSO Охот.' : 'Hunt QSO'}</span>
                </button>
              </div>

              {/* Leaders List */}
              {loading ? (
                <div className="p-6 text-center text-slate-400 space-y-2">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-emerald-400" />
                  <p>{language === 'RU' ? 'Загрузка лидеров парка...' : 'Loading leaderboard...'}</p>
                </div>
              ) : leadersList.length === 0 ? (
                <div className="p-6 text-center text-slate-500 rounded-2xl bg-slate-800/30 border border-slate-800">
                  <p>{language === 'RU' ? 'В этой категории пока нет записей' : 'No records in this category yet'}</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {displayedLeaders.map((item, index) => {
                    const isCurrentUser = userCallsign && (item.callsign === userCallsign || item.callsign.includes(userCallsign));
                    const medal = item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : `#${item.rank}`;

                    return (
                      <div
                        key={`${item.callsign}_${item.rank}`}
                        className={`p-2.5 rounded-xl border transition flex items-center justify-between ${
                          isCurrentUser
                            ? 'bg-emerald-500/15 border-emerald-500/50 shadow-glow-emerald'
                            : 'bg-slate-800/60 border-slate-700/60 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 text-center text-xs font-mono font-bold text-slate-400">
                            {medal}
                          </span>

                          <div>
                            <button
                              type="button"
                              onClick={() => {
                                if (onNavigateToCallsign) {
                                  onNavigateToCallsign(item.callsign);
                                  onClose();
                                }
                              }}
                              className="font-mono font-bold text-xs text-white hover:text-emerald-400 transition underline-offset-2 hover:underline flex items-center gap-1"
                            >
                              <span>{item.callsign}</span>
                              {isCurrentUser && (
                                <span className="text-[9px] font-sans font-bold px-1.5 py-0.2 rounded bg-emerald-500 text-slate-950">
                                  {language === 'RU' ? 'ВЫ' : 'YOU'}
                                </span>
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="font-mono font-extrabold text-xs text-right">
                          <span className={
                            leaderTab === 'activations' ? 'text-emerald-400' :
                            leaderTab === 'activator_qsos' ? 'text-cyan-400' : 'text-blue-400'
                          }>
                            {item.count}
                          </span>
                          <span className="text-[10px] text-slate-400 ml-1 font-normal">
                            {leaderTab === 'activations' ? (language === 'RU' ? 'поездок' : 'trips') : 'QSO'}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Show more toggle */}
                  {leadersList.length > 5 && (
                    <button
                      type="button"
                      onClick={() => {
                        telegram.haptic.selection();
                        setShowAllLeaders(!showAllLeaders);
                      }}
                      className="w-full flex items-center justify-center gap-1 py-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition"
                    >
                      <span>
                        {showAllLeaders
                          ? (language === 'RU' ? 'Свернуть' : 'Show less')
                          : (language === 'RU' ? `Показать всех (${leadersList.length})` : `Show all (${leadersList.length})`)}
                      </span>
                      {showAllLeaders ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: ACTIVATION HISTORY */}
          {/* ======================================================== */}
          {activeTab === 'history' && (
            <div className="space-y-2">
              {loading ? (
                <div className="p-6 text-center text-slate-400 space-y-2">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-emerald-400" />
                  <p>{language === 'RU' ? 'Загрузка истории активаций...' : 'Loading activations...'}</p>
                </div>
              ) : historyList.length === 0 ? (
                <div className="p-6 text-center text-slate-500 rounded-2xl bg-slate-800/30 border border-slate-800">
                  <p>{language === 'RU' ? 'Нет подтвержденных активаций в базе POTA' : 'No confirmed activations yet'}</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {displayedHistory.map((act, idx) => {
                    const isCurrentUser = userCallsign && (act.callsign === userCallsign || act.callsign.includes(userCallsign));
                    return (
                      <div
                        key={`${act.callsign}_${act.date}_${idx}`}
                        className={`p-2.5 rounded-xl border flex items-center justify-between ${
                          isCurrentUser
                            ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm'
                            : 'bg-slate-800/60 border-slate-700/60'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (onNavigateToCallsign) {
                                  onNavigateToCallsign(act.callsign);
                                  onClose();
                                }
                              }}
                              className="font-mono font-bold text-xs text-white hover:text-emerald-400 transition hover:underline"
                            >
                              {act.callsign}
                            </button>
                            <span className="text-[10px] font-mono text-slate-400">
                              {act.date}
                            </span>
                            {isCurrentUser && (
                              <span className="text-[9px] font-bold px-1 rounded bg-emerald-500 text-slate-950">
                                {language === 'RU' ? 'ВЫ' : 'YOU'}
                              </span>
                            )}
                          </div>

                          {/* Modes breakdown */}
                          <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-400 mt-1">
                            {act.cw > 0 && <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300">CW:{act.cw}</span>}
                            {act.data > 0 && <span className="px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300">FT8:{act.data}</span>}
                            {act.phone > 0 && <span className="px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300">SSB:{act.phone}</span>}
                          </div>
                        </div>

                        <div className="font-mono font-bold text-sm text-white text-right">
                          <span>{act.totalQSOs}</span>
                          <span className="text-[10px] text-slate-400 font-normal ml-1">QSO</span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Show more history */}
                  {historyList.length > 5 && (
                    <button
                      type="button"
                      onClick={() => {
                        telegram.haptic.selection();
                        setShowAllHistory(!showAllHistory);
                      }}
                      className="w-full flex items-center justify-center gap-1 py-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition"
                    >
                      <span>
                        {showAllHistory
                          ? (language === 'RU' ? 'Свернуть' : 'Show less')
                          : (language === 'RU' ? `Показать все (${historyList.length})` : `Show all (${historyList.length})`)}
                      </span>
                      {showAllHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: ABOUT PARK & LOGISTICS */}
          {/* ======================================================== */}
          {activeTab === 'info' && (
            <div className="space-y-3">
              {/* Key metadata grid */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-0.5">
                  <span className="text-[10px] text-slate-400 block">{language === 'RU' ? 'Первый активатор:' : 'First Activator:'}</span>
                  <span className="font-mono font-bold text-xs text-white">
                    {current.firstActivator || '—'}
                  </span>
                  {current.firstActivationDate && (
                    <span className="text-[10px] text-slate-400 block font-mono">
                      {current.firstActivationDate}
                    </span>
                  )}
                </div>

                <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-0.5">
                  <span className="text-[10px] text-slate-400 block">{language === 'RU' ? 'Регион / Entity:' : 'Region / Entity:'}</span>
                  <span className="font-bold text-xs text-white truncate block">
                    {current.locationName || current.region || '—'}
                  </span>
                  {current.entityName && (
                    <span className="text-[10px] text-slate-400 block truncate">
                      {current.entityName}
                    </span>
                  )}
                </div>
              </div>

              {/* Access & Activation Methods */}
              {(accessMethodsList.length > 0 || activationMethodsList.length > 0) && (
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                  <span className="font-bold text-xs text-white flex items-center gap-1.5">
                    <Footprints className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{language === 'RU' ? 'Доступ и методы активации' : 'Access & Activation'}</span>
                  </span>

                  {accessMethodsList.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 block">{language === 'RU' ? 'Способы добраться:' : 'Access Methods:'}</span>
                      <div className="flex flex-wrap gap-1">
                        {accessMethodsList.map((m, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-md bg-slate-700/60 text-slate-200 text-[10px] font-semibold">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {activationMethodsList.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 block">{language === 'RU' ? 'Методы работы в эфире:' : 'Activation Methods:'}</span>
                      <div className="flex flex-wrap gap-1">
                        {activationMethodsList.map((m, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Park Comments */}
              {current.parkComments && (
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1">
                  <span className="font-bold text-xs text-white">{language === 'RU' ? 'Примечания POTA:' : 'POTA Notes:'}</span>
                  <p className="text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {current.parkComments}
                  </p>
                </div>
              )}

              {/* Official Website Link */}
              {current.website && (
                <a
                  href={current.website}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 transition"
                >
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-400" />
                    <span className="font-semibold text-xs text-white">
                      {language === 'RU' ? 'Официальный сайт парка' : 'Official Park Website'}
                    </span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </a>
              )}
            </div>
          )}

        </div>

        {/* Footer Actions Toolbar */}
        <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950/70 flex items-center gap-2">
          
          {/* Subscription Button */}
          <button
            type="button"
            onClick={handleToggleSub}
            disabled={subscribing}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold transition active:scale-95 ${
              isSubscribed
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
            title={isSubscribed ? 'Отписаться от спотов этого парка' : 'Получать алерты о спотах из этого парка'}
          >
            {isSubscribed ? (
              <>
                <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                <span className="hidden sm:inline">{language === 'RU' ? 'В подписках' : 'Subscribed'}</span>
              </>
            ) : (
              <>
                <Bell className="w-4 h-4 text-amber-400" />
                <span>{language === 'RU' ? 'Следить' : 'Follow'}</span>
              </>
            )}
          </button>

          {/* Directions / Route Button */}
          <button
            type="button"
            onClick={() => {
              telegram.haptic.impact('medium');
              if (onOpenRoute) onOpenRoute(current);
            }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-xs text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-glow-emerald transition active:scale-95"
          >
            <Navigation className="w-4 h-4" />
            <span>{language === 'RU' ? 'Маршрут' : 'Directions'}</span>
          </button>

          {/* OsmAnd Modal Button */}
          <button
            type="button"
            onClick={() => {
              telegram.haptic.impact('light');
              if (onOpenOsmAnd) onOpenOsmAnd(current);
            }}
            className="flex items-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition active:scale-95"
            title="Офлайн гид OsmAnd"
          >
            <Smartphone className="w-4 h-4 text-amber-400" />
            <span className="hidden xs:inline">OsmAnd</span>
          </button>

          {/* Quick Copy Coordinates */}
          <button
            type="button"
            onClick={handleCopyCoords}
            className="p-2.5 rounded-xl text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition active:scale-95"
            title={copied ? 'Скопировано!' : 'Скопировать координаты'}
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>

          {/* Official POTA.app Link */}
          <a
            href={`https://next.pota.app/park/${parkRef}`}
            target="_blank"
            rel="noreferrer"
            className="p-2.5 rounded-xl text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition active:scale-95"
            title="Открыть на next.pota.app"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>

      </div>
    </div>,
    document.body
  );
}

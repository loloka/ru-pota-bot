import React, { useState, useEffect } from 'react';
import { 
  Search, 
  User, 
  MapPin, 
  Radio, 
  ExternalLink, 
  Bell, 
  Check, 
  Compass, 
  Navigation, 
  X, 
  Award, 
  Flame, 
  Layers,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Car,
  Calendar
} from 'lucide-react';
import { telegram } from '../../services/telegram.js';
import { api } from '../../services/api.js';
import RouteModal from '../modals/RouteModal.jsx';

export default function PotaLookupWidget({ 
  user, 
  onNavigate, 
  onRequireAuth,
  language = 'RU', 
  t = (k) => k 
}) {
  const [mode, setMode] = useState('callsign'); // 'callsign' | 'park'
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Results
  const [callsignData, setCallsignData] = useState(null);
  const [parkData, setParkData] = useState(null);

  // Detailed view states
  const [callsignDetailTab, setCallsignDetailTab] = useState('activations'); // 'activations' | 'hunts'
  const [activationsFilter, setActivationsFilter] = useState('');
  const [showAllActivations, setShowAllActivations] = useState(false);
  const [showAllHunts, setShowAllHunts] = useState(false);
  const [showAllParkActivations, setShowAllParkActivations] = useState(false);
  
  // Route modal for park
  const [showRouteModal, setShowRouteModal] = useState(false);

  // Subscribing loading state
  const [subscribing, setSubscribing] = useState(false);

  // Auto-suggestions for park search
  const [parkSuggestions, setParkSuggestions] = useState([]);
  const [allParks, setAllParks] = useState([]);

  useEffect(() => {
    if (mode === 'park' && allParks.length === 0) {
      api.getParks().then(res => {
        if (res && res.parks) {
          setAllParks(res.parks);
        }
      }).catch(() => {});
    }
  }, [mode, allParks.length]);

  const handleQueryChange = (val) => {
    setQuery(val);
    setError('');

    if (mode === 'park') {
      const q = val.trim().toUpperCase();
      if (q.length >= 2 && allParks.length > 0) {
        const matches = allParks.filter(p => 
          p.reference.toUpperCase().includes(q) || 
          p.name.toUpperCase().includes(q) ||
          (p.region && p.region.toUpperCase().includes(q))
        ).slice(0, 5);
        setParkSuggestions(matches);
      } else {
        setParkSuggestions([]);
      }
    }
  };

  const handleSearch = async (forcedQuery = null, forcedMode = null) => {
    const target = (forcedQuery || query).trim().toUpperCase();
    if (!target) return;

    // Smart auto-detection: if target matches park format (e.g. RU-0192, JP-1169), automatically route to park
    const isParkRefFormat = /^[A-Z0-9]{1,4}-\d{4,5}$/i.test(target);
    const activeMode = forcedMode || (isParkRefFormat ? 'park' : mode);

    if (activeMode !== mode) {
      setMode(activeMode);
    }

    telegram.haptic.impact('medium');
    setLoading(true);
    setError('');
    setParkSuggestions([]);

    try {
      if (activeMode === 'callsign') {
        const data = await api.lookupCallsign(target);
        setCallsignData(data);
        setParkData(null);
      } else {
        const data = await api.lookupPark(target);
        setParkData(data);
        setCallsignData(null);
      }
    } catch (err) {
      telegram.haptic.notification('error');
      setError(err.message || (activeMode === 'callsign' ? 'Позывной не найден в базе POTA' : 'Парк не найден в базе POTA'));
      if (activeMode === 'callsign') setCallsignData(null);
      else setParkData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  // Toggle subscription
  const handleToggleSub = async (type, target) => {
    telegram.haptic.impact('light');
    setSubscribing(true);
    try {
      if (type === 'callsign' && callsignData) {
        if (callsignData.isSubscribed) {
          await api.removeSubscription(callsignData.callsign);
          setCallsignData(prev => ({ ...prev, isSubscribed: false }));
          telegram.haptic.notification('success');
        } else {
          await api.addSubscription({ type: 'callsign', target: callsignData.callsign });
          setCallsignData(prev => ({ ...prev, isSubscribed: true }));
          telegram.haptic.notification('success');
        }
      } else if (type === 'park' && parkData) {
        if (parkData.isSubscribed) {
          await api.removeSubscription(parkData.reference);
          setParkData(prev => ({ ...prev, isSubscribed: false }));
          telegram.haptic.notification('success');
        } else {
          await api.addSubscription({ type: 'park', target: parkData.reference });
          setParkData(prev => ({ ...prev, isSubscribed: true }));
          telegram.haptic.notification('success');
        }
      }
    } catch (err) {
      telegram.haptic.notification('error');
      alert(err.message);
    } finally {
      setSubscribing(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setError('');
    setCallsignData(null);
    setParkData(null);
    setParkSuggestions([]);
    setActivationsFilter('');
    setShowAllActivations(false);
    setShowAllHunts(false);
    setShowAllParkActivations(false);
  };

  return (
    <div className="p-4 rounded-2xl glass-card space-y-3.5 border border-slate-300 dark:border-slate-800 shadow-xl select-none">
      
      {/* Header & Segmented Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
            <Search className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
              {language === 'RU' ? 'Справочник POTA' : 'POTA Directory'}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {language === 'RU' ? 'Поиск статистики позывных и парков' : 'Lookup callsigns & parks'}
            </p>
          </div>
        </div>

        {/* Mode Switch: Callsign / Park - responsive balanced segmented control */}
        <div className="grid grid-cols-2 sm:flex p-1 rounded-xl bg-slate-200/80 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-800 w-full sm:w-auto shrink-0">
          <button
            type="button"
            onClick={() => {
              telegram.haptic.selection();
              setMode('callsign');
              handleClear();
            }}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition active:scale-95 ${
              mode === 'callsign'
                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shadow-glow-pill font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>{language === 'RU' ? 'Позывной' : 'Callsign'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              telegram.haptic.selection();
              setMode('park');
              handleClear();
            }}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition active:scale-95 ${
              mode === 'park'
                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shadow-glow-pill font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>{language === 'RU' ? 'Парк' : 'Park'}</span>
          </button>
        </div>
      </div>

      {/* Input Field & Search Button */}
      <div className="space-y-1.5 relative">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                mode === 'callsign'
                  ? (language === 'RU' ? 'Введите позывной (R9OGL, R2BBX...)' : 'Enter callsign (R9OGL, R2BBX...)')
                  : (language === 'RU' ? 'Код парка (RU-0065, RU-0073...) или название' : 'Park ref (RU-0065...) or name')
              }
              className="w-full bg-slate-100 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:border-emerald-500/60 outline-none uppercase"
            />
            {query && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleSearch()}
            disabled={loading || !query.trim()}
            className="flex items-center justify-center px-4 py-2 rounded-xl font-bold text-xs text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-glow-emerald transition active:scale-95 disabled:opacity-50 disabled:pointer-events-none shrink-0"
          >
            {loading ? (
              <span className="animate-spin text-sm">⏳</span>
            ) : (
              <span>{language === 'RU' ? 'Найти' : 'Search'}</span>
            )}
          </button>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            {language === 'RU' ? 'Быстро:' : 'Quick:'}
          </span>

          {mode === 'callsign' ? (
            <>
              {user?.callsign && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery(user.callsign);
                    handleSearch(user.callsign);
                  }}
                  className="px-2 py-0.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-mono font-bold transition active:scale-95"
                >
                  👤 {user.callsign} ({language === 'RU' ? 'Я' : 'Me'})
                </button>
              )}
              {(!user?.callsign || user.callsign !== 'R2BBX') && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('R2BBX');
                    handleSearch('R2BBX');
                  }}
                  className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[10px] font-mono font-semibold hover:border-emerald-500/40 transition active:scale-95"
                >
                  R2BBX
                </button>
              )}
              {(!user?.callsign || user.callsign !== 'UA9OTW') && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('UA9OTW');
                    handleSearch('UA9OTW');
                  }}
                  className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[10px] font-mono font-semibold hover:border-emerald-500/40 transition active:scale-95"
                >
                  UA9OTW
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setQuery('RU-0065');
                  handleSearch('RU-0065');
                }}
                className="px-2 py-0.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-mono font-bold transition active:scale-95"
              >
                RU-0065 (Заельцовский)
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuery('RU-0073');
                  handleSearch('RU-0073');
                }}
                className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[10px] font-mono font-semibold hover:border-emerald-500/40 transition active:scale-95"
              >
                RU-0073 (Сокольники)
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuery('RU-0001');
                  handleSearch('RU-0001');
                }}
                className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[10px] font-mono font-semibold hover:border-emerald-500/40 transition active:scale-95"
              >
                RU-0001
              </button>
            </>
          )}
        </div>

        {/* Park Live Suggestions Dropdown */}
        {mode === 'park' && parkSuggestions.length > 0 && (
          <div className="absolute top-11 left-0 right-0 z-30 max-h-48 overflow-y-auto rounded-xl glass-card p-1 shadow-2xl border border-slate-300 dark:border-slate-800 space-y-1 animate-slide-up">
            {parkSuggestions.map(p => (
              <div
                key={p.reference}
                onClick={() => {
                  setQuery(p.reference);
                  handleSearch(p.reference);
                }}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/80 cursor-pointer transition active:scale-[0.99]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded bg-emerald-500 text-slate-950 shrink-0">
                    {p.reference}
                  </span>
                  <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    {p.name}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                  {p.region}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs animate-fade-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* 1. CALLSIGN RESULT CARD */}
      {/* ======================================================== */}
      {callsignData && mode === 'callsign' && (
        <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-900/70 border border-emerald-500/40 space-y-3 animate-slide-up shadow-inner">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-extrabold text-base text-slate-900 dark:text-white tracking-wide">
                  {callsignData.callsign}
                </span>
                {callsignData.awards > 0 && (
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                    <Award className="w-3 h-3 text-amber-500" />
                    <span>{callsignData.awards}</span>
                  </span>
                )}
              </div>

              {callsignData.name && (
                <h4 className="font-semibold text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                  👤 {callsignData.name}
                </h4>
              )}

              {(callsignData.qth || callsignData.grid) && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  📍 QTH: {callsignData.qth || '—'} {callsignData.grid ? `(${callsignData.grid})` : ''}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setCallsignData(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Stats Grid: Activator vs Hunter */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* Activator */}
            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                <Flame className="w-3.5 h-3.5 text-emerald-500" />
                <span>АКТИВАТОР</span>
              </div>
              <div className="text-[11px] text-slate-700 dark:text-slate-300 space-y-0.5">
                <p>Активаций: <b className="font-mono text-slate-900 dark:text-white">{callsignData.activator.activations}</b></p>
                <p>Парков: <b className="font-mono text-slate-900 dark:text-white">{callsignData.activator.parks}</b></p>
                <p>QSO: <b className="font-mono text-slate-900 dark:text-white">{callsignData.activator.qsos}</b></p>
              </div>
            </div>

            {/* Hunter */}
            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 space-y-1">
              <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-bold text-[11px]">
                <Radio className="w-3.5 h-3.5 text-blue-500" />
                <span>ОХОТНИК</span>
              </div>
              <div className="text-[11px] text-slate-700 dark:text-slate-300 space-y-0.5">
                <p>Парков: <b className="font-mono text-slate-900 dark:text-white">{callsignData.hunter.parks}</b></p>
                <p>Связей: <b className="font-mono text-slate-900 dark:text-white">{callsignData.hunter.qsos}</b></p>
                <p>Дипломов: <b className="font-mono text-slate-900 dark:text-white">{callsignData.awards}</b></p>
              </div>
            </div>
          </div>

          {/* Detailed Activity Section (Recent Activations & Hunter QSOs) */}
          {((callsignData.recentActivations && callsignData.recentActivations.length > 0) || 
            (callsignData.recentHunts && callsignData.recentHunts.length > 0)) && (
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              {/* Activity Sub-Tabs */}
              <div className="flex items-center justify-between gap-1 p-0.5 rounded-xl bg-slate-200/70 dark:bg-slate-800/70 text-[11px]">
                {callsignData.recentActivations && callsignData.recentActivations.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      telegram.haptic.selection();
                      setCallsignDetailTab('activations');
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-semibold transition ${
                      callsignDetailTab === 'activations'
                        ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-sm font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Car className="w-3.5 h-3.5" />
                    <span>{language === 'RU' ? 'Поездки' : 'Activations'}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-mono">
                      {callsignData.recentActivations.length}
                    </span>
                  </button>
                )}

                {callsignData.recentHunts && callsignData.recentHunts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      telegram.haptic.selection();
                      setCallsignDetailTab('hunts');
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-semibold transition ${
                      callsignDetailTab === 'hunts'
                        ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-sm font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>{language === 'RU' ? 'Охотник' : 'Hunter'}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-400 font-mono">
                      {callsignData.recentHunts.length}
                    </span>
                  </button>
                )}
              </div>

              {/* TAB 1: Activations list */}
              {callsignDetailTab === 'activations' && callsignData.recentActivations && (
                <div className="space-y-1.5">
                  {/* Quick filter input if > 3 items */}
                  {callsignData.recentActivations.length > 3 && (
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 w-3 h-3 text-slate-400" />
                      <input
                        type="text"
                        value={activationsFilter}
                        onChange={(e) => setActivationsFilter(e.target.value)}
                        placeholder={language === 'RU' ? 'Фильтр по парку (JP-1169, 1169...) или дате' : 'Filter by park or date...'}
                        className="w-full bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg pl-7 pr-6 py-1 text-[11px] text-slate-900 dark:text-white placeholder-slate-400 outline-none uppercase font-mono"
                      />
                      {activationsFilter && (
                        <button
                          type="button"
                          onClick={() => setActivationsFilter('')}
                          className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Render filtered or sliced activations */}
                  {(() => {
                    const q = activationsFilter.trim().toUpperCase();
                    const filtered = callsignData.recentActivations.filter(act => {
                      if (!q) return true;
                      return (
                        act.reference.toUpperCase().includes(q) ||
                        act.park.toUpperCase().includes(q) ||
                        act.date.includes(q) ||
                        act.location.toUpperCase().includes(q)
                      );
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="p-3 text-center text-xs text-slate-500 dark:text-slate-400 rounded-xl bg-white/50 dark:bg-slate-800/50">
                          {language === 'RU' ? 'Ничего не найдено по фильтру' : 'No matching activations'}
                        </div>
                      );
                    }

                    const displayed = showAllActivations || q ? filtered : filtered.slice(0, 3);

                    return (
                      <>
                        <div className="space-y-1 max-h-64 overflow-y-auto pr-0.5">
                          {displayed.map((act, idx) => (
                            <div
                              key={`${act.reference}_${act.date}_${idx}`}
                              className="p-2 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 hover:border-emerald-500/40 transition"
                            >
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                                    {act.date}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      telegram.haptic.impact('light');
                                      setMode('park');
                                      setQuery(act.reference);
                                      handleSearch(act.reference, 'park');
                                    }}
                                    className="font-mono font-extrabold text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition active:scale-95"
                                    title={language === 'RU' ? 'Открыть карточку парка' : 'Open park info'}
                                  >
                                    {act.reference}
                                  </button>
                                  {act.location && (
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      ({act.location})
                                    </span>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                                    {act.total} QSO
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-2 mt-0.5">
                                <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate" title={act.park}>
                                  {act.park}
                                </p>
                                <div className="flex items-center gap-1 text-[9px] font-mono text-slate-500 shrink-0">
                                  {act.cw > 0 && <span className="bg-slate-100 dark:bg-slate-700/60 px-1 py-0.2 rounded">CW:{act.cw}</span>}
                                  {act.data > 0 && <span className="bg-slate-100 dark:bg-slate-700/60 px-1 py-0.2 rounded">FT8:{act.data}</span>}
                                  {act.phone > 0 && <span className="bg-slate-100 dark:bg-slate-700/60 px-1 py-0.2 rounded">SSB:{act.phone}</span>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {!q && filtered.length > 3 && (
                          <button
                            type="button"
                            onClick={() => {
                              telegram.haptic.selection();
                              setShowAllActivations(!showAllActivations);
                            }}
                            className="w-full flex items-center justify-center gap-1 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                          >
                            <span>
                              {showAllActivations
                                ? (language === 'RU' ? 'Свернуть' : 'Show less')
                                : (language === 'RU' ? `Показать все (${filtered.length})` : `Show all (${filtered.length})`)}
                            </span>
                            {showAllActivations ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* TAB 2: Hunter QSOs */}
              {callsignDetailTab === 'hunts' && callsignData.recentHunts && (
                <div className="space-y-1.5">
                  {callsignData.recentHunts.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-500 dark:text-slate-400 rounded-xl bg-white/50 dark:bg-slate-800/50">
                      {language === 'RU' ? 'Нет недавних связей охотника' : 'No recent hunter contacts'}
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1 max-h-64 overflow-y-auto pr-0.5">
                        {(showAllHunts ? callsignData.recentHunts : callsignData.recentHunts.slice(0, 4)).map((hunt, idx) => (
                          <div
                            key={`${hunt.callsign}_${hunt.reference}_${idx}`}
                            className="p-2 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 text-xs"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-slate-900 dark:text-white">
                                  {hunt.callsign}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 font-mono font-bold">
                                  {hunt.band} {hunt.mode}
                                </span>
                              </div>
                              <span className="font-mono text-[10px] text-slate-500">
                                {hunt.date}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5 truncate text-[11px] text-slate-600 dark:text-slate-400">
                              <button
                                type="button"
                                onClick={() => {
                                  telegram.haptic.impact('light');
                                  setMode('park');
                                  setQuery(hunt.reference);
                                  handleSearch(hunt.reference, 'park');
                                }}
                                className="font-mono font-bold text-emerald-600 dark:text-emerald-400 hover:underline shrink-0"
                              >
                                {hunt.reference}
                              </button>
                              <span className="truncate">• {hunt.park}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {callsignData.recentHunts.length > 4 && (
                        <button
                          type="button"
                          onClick={() => {
                            telegram.haptic.selection();
                            setShowAllHunts(!showAllHunts);
                          }}
                          className="w-full flex items-center justify-center gap-1 py-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <span>
                            {showAllHunts
                              ? (language === 'RU' ? 'Свернуть' : 'Show less')
                              : (language === 'RU' ? `Показать все (${callsignData.recentHunts.length})` : `Show all (${callsignData.recentHunts.length})`)}
                          </span>
                          {showAllHunts ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-1 border-t border-slate-200 dark:border-slate-800">
            {/* Toggle Subscribe */}
            <button
              type="button"
              onClick={() => handleToggleSub('callsign', callsignData.callsign)}
              disabled={subscribing}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition active:scale-95 ${
                callsignData.isSubscribed
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40'
                  : 'bg-white dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
              }`}
            >
              {callsignData.isSubscribed ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500 stroke-[3]" />
                  <span>{language === 'RU' ? 'В подписках' : 'Subscribed'}</span>
                </>
              ) : (
                <>
                  <Bell className="w-3.5 h-3.5 text-amber-500" />
                  <span>{language === 'RU' ? 'Следить' : 'Follow'}</span>
                </>
              )}
            </button>

            {/* Official Portal Link */}
            <a
              href={`https://next.pota.app/#/profile/${callsignData.callsign}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 transition active:scale-95"
            >
              <span>next.pota.app</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </a>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. PARK RESULT CARD */}
      {/* ======================================================== */}
      {parkData && mode === 'park' && (
        <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-900/70 border border-emerald-500/40 space-y-3 animate-slide-up shadow-inner">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-extrabold text-sm px-2.5 py-0.5 rounded-lg bg-emerald-500 text-slate-950">
                  {parkData.reference}
                </span>

                {parkData.isActive && (
                  <span className="flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 animate-pulse">
                    <span>📡 {language === 'RU' ? 'В ЭФИРЕ' : 'ON AIR'}</span>
                  </span>
                )}
              </div>

              <h4 className="font-bold text-sm text-slate-900 dark:text-white mt-1 leading-tight">
                {parkData.name}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {parkData.region || 'RU-POTA'} {parkData.grid ? `• QTH: ${parkData.grid}` : ''}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setParkData(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Live broadcast box if active */}
          {parkData.isActive && parkData.activeSpot && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-500 animate-pulse" />
                <div>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {parkData.activeSpot.callsign}
                  </span>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 ml-2">
                    {parkData.activeSpot.freq} MHz • {parkData.activeSpot.mode}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Park Stats Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Активаций в базе:</span>
              <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                {parkData.activations} <span className="text-[10px] font-normal text-slate-400">({parkData.qsos} QSO)</span>
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Координаты GPS:</span>
              <span className="font-mono font-bold text-[11px] text-slate-900 dark:text-white truncate block">
                {parkData.lat ? `${parkData.lat.toFixed(4)}, ${parkData.lon.toFixed(4)}` : '—'}
              </span>
            </div>
          </div>

          {parkData.topActivator && (
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              🏆 Лидер по активациям: <b className="font-mono text-emerald-600 dark:text-emerald-400">{parkData.topActivator}</b>
            </p>
          )}

          {/* Recent Activations of this Park */}
          {parkData.recentActivations && parkData.recentActivations.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                <span className="flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{language === 'RU' ? 'История активаций парка' : 'Park Activations History'}</span>
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {parkData.recentActivations.length} {language === 'RU' ? 'крайних' : 'recent'}
                </span>
              </div>

              <div className="space-y-1 max-h-56 overflow-y-auto pr-0.5">
                {(showAllParkActivations ? parkData.recentActivations : parkData.recentActivations.slice(0, 3)).map((act, idx) => (
                  <div
                    key={`${act.callsign}_${act.date}_${idx}`}
                    className="p-2 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            telegram.haptic.impact('light');
                            setMode('callsign');
                            setQuery(act.callsign);
                            handleSearch(act.callsign, 'callsign');
                          }}
                          className="font-mono font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                          title={language === 'RU' ? 'Смотреть профиль оператора' : 'View operator profile'}
                        >
                          👤 {act.callsign}
                        </button>
                        <span className="font-mono text-[10px] text-slate-500">
                          {act.date}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[9px] font-mono text-slate-400 mt-0.5">
                        {act.cw > 0 && <span>CW:{act.cw}</span>}
                        {act.data > 0 && <span>FT8:{act.data}</span>}
                        {act.phone > 0 && <span>SSB:{act.phone}</span>}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                        {act.totalQSOs} QSO
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {parkData.recentActivations.length > 3 && (
                <button
                  type="button"
                  onClick={() => {
                    telegram.haptic.selection();
                    setShowAllParkActivations(!showAllParkActivations);
                  }}
                  className="w-full flex items-center justify-center gap-1 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  <span>
                    {showAllParkActivations
                      ? (language === 'RU' ? 'Свернуть' : 'Show less')
                      : (language === 'RU' ? `Показать все (${parkData.recentActivations.length})` : `Show all (${parkData.recentActivations.length})`)}
                  </span>
                  {showAllParkActivations ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200 dark:border-slate-800">
            {/* Show on Map Button */}
            {parkData.lat && parkData.lon && (
              <button
                type="button"
                onClick={() => {
                  telegram.haptic.impact('light');
                  if (onNavigate) {
                    onNavigate('map', { focusParkRef: parkData.reference });
                  }
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-glow-emerald transition active:scale-95"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>{language === 'RU' ? 'На карте' : 'On Map'}</span>
              </button>
            )}

            {/* Route Button */}
            {parkData.lat && parkData.lon && (
              <button
                type="button"
                onClick={() => {
                  telegram.haptic.impact('light');
                  setShowRouteModal(true);
                }}
                className="flex items-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 transition active:scale-95"
              >
                <Navigation className="w-3.5 h-3.5 text-blue-500" />
                <span>{language === 'RU' ? 'Маршрут' : 'Route'}</span>
              </button>
            )}

            {/* Toggle Subscribe */}
            <button
              type="button"
              onClick={() => handleToggleSub('park', parkData.reference)}
              disabled={subscribing}
              className={`flex items-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition active:scale-95 ${
                parkData.isSubscribed
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40'
                  : 'bg-white dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
              }`}
            >
              {parkData.isSubscribed ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500 stroke-[3]" />
                  <span>{language === 'RU' ? 'В подписках' : 'Subscribed'}</span>
                </>
              ) : (
                <>
                  <Bell className="w-3.5 h-3.5 text-amber-500" />
                  <span>{language === 'RU' ? 'Следить' : 'Follow'}</span>
                </>
              )}
            </button>

            {/* Official Portal Link */}
            <a
              href={`https://next.pota.app/#/park/${parkData.reference}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 transition active:scale-95"
            >
              <span>next.pota.app</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </a>
          </div>
        </div>
      )}

      {/* Route Modal if open */}
      {showRouteModal && parkData && (
        <RouteModal
          park={parkData}
          language={language}
          onClose={() => setShowRouteModal(false)}
        />
      )}

    </div>
  );
}

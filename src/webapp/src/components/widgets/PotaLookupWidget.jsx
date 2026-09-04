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
  AlertCircle
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

  const handleSearch = async (forcedQuery = null) => {
    const target = (forcedQuery || query).trim().toUpperCase();
    if (!target) return;

    telegram.haptic.impact('medium');
    setLoading(true);
    setError('');
    setParkSuggestions([]);

    try {
      if (mode === 'callsign') {
        const data = await api.lookupCallsign(target);
        setCallsignData(data);
      } else {
        const data = await api.lookupPark(target);
        setParkData(data);
      }
    } catch (err) {
      telegram.haptic.notification('error');
      setError(err.message || 'Объект не найден в базе POTA');
      if (mode === 'callsign') setCallsignData(null);
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
  };

  return (
    <div className="p-4 rounded-2xl glass-card space-y-3.5 border border-slate-300 dark:border-slate-800 shadow-xl select-none">
      
      {/* Header & Segmented Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-200 dark:border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
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

        {/* Mode Switch: Callsign / Park */}
        <div className="flex p-1 rounded-xl bg-slate-200/80 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => {
              telegram.haptic.selection();
              setMode('callsign');
              handleClear();
            }}
            className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition active:scale-95 ${
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
            className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition active:scale-95 ${
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

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Bell, 
  Trash2, 
  Plus, 
  Search, 
  User, 
  MapPin, 
  RefreshCw,
  AlertCircle,
  Send,
  ExternalLink
} from 'lucide-react';
import { telegram } from '../../services/telegram.js';
import { api } from '../../services/api.js';

export default function SubscriptionsTab({ user, onCountChange, onRequireAuth, onRefreshProfile, language = 'RU', t = (k) => k }) {
  const [segment, setSegment] = useState('callsigns'); // 'callsigns' | 'parks'
  const [newTarget, setNewTarget] = useState('');
  const [enableDmAlerts, setEnableDmAlerts] = useState(true);

  const [callsignSubs, setCallsignSubs] = useState([]);
  const [parkSubs, setParkSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadSubscriptions = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const res = await api.getSubscriptions();
      setCallsignSubs(res.callsigns || []);
      setParkSubs(res.parks || []);
      if (typeof res.notifications_enabled === 'boolean') {
        setEnableDmAlerts(res.notifications_enabled);
      }
      if (onCountChange) {
        onCountChange((res.callsigns?.length || 0) + (res.parks?.length || 0));
      }
      setError('');
    } catch (err) {
      console.warn('[Subs] Failed to load subscriptions:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user, onCountChange]);

  const handleToggleDmAlerts = async () => {
    telegram.haptic.selection();
    const nextState = !enableDmAlerts;
    setEnableDmAlerts(nextState);
    try {
      await api.toggleAlerts(nextState);
      telegram.haptic.notification('success');
      if (onRefreshProfile) {
        onRefreshProfile();
      }
    } catch (err) {
      telegram.haptic.notification('error');
      setEnableDmAlerts(!nextState); // revert on error
      alert(`Error toggling notifications: ${err.message}`);
    }
  };

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  // Guest view outside Telegram
  if (!user) {
    return (
      <div className="space-y-4 pb-32 pb-safe animate-fade-in">
        <div className="p-6 rounded-3xl glass-card border border-sky-500/30 text-center space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-500 to-blue-600 text-white shadow-xl shadow-sky-500/20">
            <Bell className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400 bg-sky-500/10 px-2.5 py-0.5 rounded-full border border-sky-500/20">
              {t('guest_badge')}
            </span>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">
              {t('guest_subs_title')}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 max-w-sm mx-auto leading-relaxed">
              {t('guest_subs_desc')}
            </p>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                telegram.haptic.impact('medium');
                telegram.openTelegramBot('hub');
              }}
              className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-lg shadow-sky-500/25 transition active:scale-95"
            >
              <Send className="w-4 h-4 -translate-x-0.5 translate-y-0.5" />
              <span>{language === 'RU' ? 'Подключить подписки в Telegram' : 'Manage Subscriptions in Telegram'}</span>
              <ExternalLink className="w-3.5 h-3.5 ml-0.5 opacity-80" />
            </button>
          </div>
        </div>

        {/* How alerts work */}
        <div className="p-4 rounded-2xl glass-card space-y-3">
          <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            {language === 'RU' ? 'Как работают оповещения в боте?' : 'How bot alerts work'}
          </h3>
          <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
            <p>
              1. 👤 <b>{language === 'RU' ? 'Подписка на позывные:' : 'Callsign alerts:'}</b> {language === 'RU' ? 'Добавьте позывной друга (например, UA9OTW или R2BBX) — бот напишет вам в ЛС, как только он появится в эфире.' : 'Follow a friend callsign to get instant notifications when they go on air.'}
            </p>
            <p>
              2. 🌲 <b>{language === 'RU' ? 'Подписка на парки:' : 'Park alerts:'}</b> {language === 'RU' ? 'Добавьте редкий заповедник (RU-0001, RU-0073) — бот пришлёт спот любого оператора, работающего из этого парка.' : 'Follow rare parks to be alerted as soon as an activator spots from there.'}
            </p>
            <p>
              3. 🔕 <b>{language === 'RU' ? 'Режим сна:' : 'Mute anytime:'}</b> {language === 'RU' ? 'В любой момент можно выключить оповещения одной кнопкой без потери подписок.' : 'Toggle alerts on or off anytime with a single tap without losing your list.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);


  const handleDelete = async (id, target) => {
    telegram.haptic.notification('warning');
    const deletePrompt = language === 'RU' ? `Удалить подписку на ${target}?` : `Delete subscription to ${target}?`;
    if (!confirm(deletePrompt)) return;

    try {
      await api.deleteSubscription(id);
      telegram.haptic.notification('success');
      await loadSubscriptions();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleAddSubscription = async (e) => {
    e.preventDefault();
    if (!newTarget.trim()) return;

    setError('');
    setSubmitting(true);
    telegram.haptic.impact('medium');

    const type = segment === 'callsigns' ? 'callsign' : 'park';

    try {
      await api.addSubscription({
        type,
        target: newTarget.trim(),
      });

      telegram.haptic.notification('success');
      setNewTarget('');
      await loadSubscriptions();
    } catch (err) {
      telegram.haptic.notification('error');
      setError(err.message || 'Ошибка добавления подписки');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 pb-32 pb-safe animate-fade-in">
      {/* 1. Master Toggle for DM notifications */}
      <div className="flex items-center justify-between p-3.5 rounded-2xl glass-card">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 dark:text-white">{t('subs_dm_title')}</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('subs_dm_desc')}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleToggleDmAlerts}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enableDmAlerts ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enableDmAlerts ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* 2. Segment Switcher */}
      <div className="flex p-1 rounded-xl bg-slate-200/80 dark:bg-slate-900 border border-slate-300 dark:border-slate-800">
        <button
          type="button"
          onClick={() => {
            telegram.haptic.selection();
            setSegment('callsigns');
          }}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
            segment === 'callsigns'
              ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shadow-glow-pill'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>{t('subs_callsigns_tab')} ({callsignSubs.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            telegram.haptic.selection();
            setSegment('parks');
          }}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
            segment === 'parks'
              ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>{t('subs_parks_tab')} ({parkSubs.length})</span>
        </button>
      </div>

      {/* Error alert */}
      {error && (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 3. Add Subscription Form */}
      <form onSubmit={handleAddSubscription} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={newTarget}
            onChange={(e) => setNewTarget(e.target.value)}
            placeholder={segment === 'callsigns' ? t('subs_input_callsign_ph') : t('subs_input_park_ph')}
            className="w-full bg-slate-200/60 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 font-mono uppercase focus:border-emerald-500/60 outline-none"
            required
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 shadow-glow-emerald flex items-center gap-1 transition active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{submitting ? '...' : t('subs_follow_btn')}</span>
        </button>
      </form>

      {/* 4. Subscriptions List */}
      <div className="space-y-2">
        {loading ? (
          <div className="p-8 text-center glass-card rounded-2xl space-y-2">
            <RefreshCw className="w-6 h-6 mx-auto text-emerald-500 dark:text-emerald-400 animate-spin" />
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('subs_loading')}</p>
          </div>
        ) : segment === 'callsigns' ? (
          callsignSubs.length === 0 ? (
            <div className="p-8 text-center glass-card rounded-2xl space-y-2">
              <User className="w-8 h-8 mx-auto text-slate-400 dark:text-slate-600" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-300">{t('subs_empty_callsigns')}</p>
              <p className="text-xs text-slate-500 dark:text-slate-500">{t('subs_empty_callsigns_sub')}</p>
            </div>
          ) : (
            callsignSubs.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center justify-between p-3.5 rounded-2xl glass-card"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                    {sub.target.substring(0, 2)}
                  </div>
                  <div>
                    <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">{sub.target}</span>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sub.target_name || t('subs_operator')}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDelete(sub.id, sub.target)}
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition"
                  title="Удалить подписку"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )
        ) : (
          parkSubs.length === 0 ? (
            <div className="p-8 text-center glass-card rounded-2xl space-y-2">
              <MapPin className="w-8 h-8 mx-auto text-slate-400 dark:text-slate-600" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-300">{t('subs_empty_parks')}</p>
              <p className="text-xs text-slate-500 dark:text-slate-500">{t('subs_empty_parks_sub')}</p>
            </div>
          ) : (
            parkSubs.map((park) => (
              <div
                key={park.id}
                className="flex items-center justify-between p-3.5 rounded-2xl glass-card"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/10 font-mono font-bold text-xs text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    POTA
                  </div>
                  <div>
                    <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">{park.target}</span>
                    <p className="text-xs text-slate-700 dark:text-slate-300 font-medium truncate max-w-[200px]">
                      {park.target_name || (language === 'RU' ? 'Заповедник POTA' : 'POTA Reserve')}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDelete(park.id, park.target)}
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition"
                  title="Удалить подписку"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { 
  User, 
  Award, 
  Settings, 
  Vibrate, 
  Edit, 
  HelpCircle,
  ExternalLink,
  AlertCircle
} from 'lucide-react';
import { telegram } from '../../services/telegram.js';
import { api } from '../../services/api.js';

export default function ProfileTab({ user, stats, onRefreshProfile, language = 'RU', t = (k) => k }) {
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [changeCallsignModal, setChangeCallsignModal] = useState(false);
  const [requestedCallsign, setRequestedCallsign] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

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

  return (
    <div className="space-y-4 pb-20 animate-fade-in">
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
            <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
              {user.first_name} {user.last_name || ''}
            </h2>
            {user.username && (
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">@{user.username}</p>
            )}

            <div className="flex items-center gap-2 mt-2">
              <span className={`font-mono text-xs font-extrabold px-2.5 py-0.5 rounded-lg border ${
                user.status === 'approved'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
              }`}>
                {user.callsign || t('dash_no_callsign')}
              </span>
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
            </div>
          </div>
        </div>
      </div>

      {/* 2. POTA Statistics Overview */}
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

      {/* Callsign Change Modal */}
      {changeCallsignModal && (
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
        </div>
      )}
    </div>
  );
}

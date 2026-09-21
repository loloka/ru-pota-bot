import React, { useState, useEffect, useRef } from 'react';
import { Send, X, Radio, Bell, Award, ExternalLink, Mail, KeyRound, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { telegram } from '../../services/telegram.js';
import { api } from '../../services/api.js';

export default function TelegramAuthModal({ 
  onClose, 
  onOpenWebAuth, 
  onSuccess,
  language = 'RU', 
  title, 
  reason 
}) {
  const isRu = language === 'RU';

  const [mode, setMode] = useState('telegram'); // 'telegram' or 'code'
  const [loadingLink, setLoadingLink] = useState(false);
  const [waitingConfirm, setWaitingConfirm] = useState(false);
  const [sessionToken, setSessionToken] = useState(null);
  const [botLink, setBotLink] = useState(null);

  // 6-digit code state
  const [code, setCode] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [codeSuccess, setCodeSuccess] = useState(false);

  const pollIntervalRef = useRef(null);

  // Clean up polling timer on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Poll for Telegram 1-click confirmation when waiting
  useEffect(() => {
    if (!waitingConfirm || !sessionToken) return;

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await api.pollTelegramLogin(sessionToken);
        if (res?.status === 'confirmed' && res?.token) {
          clearInterval(pollIntervalRef.current);
          setWaitingConfirm(false);
          setCodeSuccess(true);
          telegram.haptic.notification('success');
          setTimeout(() => {
            if (onSuccess) onSuccess();
            if (onClose) onClose();
          }, 800);
        } else if (res?.status === 'expired') {
          clearInterval(pollIntervalRef.current);
          setWaitingConfirm(false);
          setCodeError(isRu ? 'Сессия входа истекла. Попробуйте снова.' : 'Login session expired. Please try again.');
        }
      } catch (err) {
        // Polling errors are ignored to allow retries
      }
    }, 2000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [waitingConfirm, sessionToken, isRu, onSuccess, onClose]);

  // Handle 1-click Telegram login button
  const handleOpenBotLogin = async () => {
    telegram.haptic.impact('medium');
    setLoadingLink(true);
    setCodeError('');

    try {
      let currentToken = sessionToken;
      let currentUrl = botLink;

      if (!currentToken || !currentUrl) {
        const res = await api.initTelegramLogin();
        if (res?.token && res?.botUrl) {
          currentToken = res.token;
          currentUrl = res.botUrl;
          setSessionToken(currentToken);
          setBotLink(currentUrl);
        } else {
          throw new Error('Не удалось создать ссылку для входа');
        }
      }

      setWaitingConfirm(true);

      // Open bot link
      if (typeof window !== 'undefined' && window.Telegram?.WebApp?.openTelegramLink) {
        window.Telegram.WebApp.openTelegramLink(currentUrl);
      } else {
        window.open(currentUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      setCodeError(err.message || (isRu ? 'Ошибка генерации ссылки для входа' : 'Error generating login link'));
      telegram.haptic.notification('error');
    } finally {
      setLoadingLink(false);
    }
  };

  // Handle 6-digit code verification
  const handleVerifyCode = async (e) => {
    e.preventDefault();
    const cleanCode = code.trim();
    if (cleanCode.length !== 6) return;

    setVerifyingCode(true);
    setCodeError('');
    telegram.haptic.impact('medium');

    try {
      const res = await api.verifyTelegramCode(cleanCode);
      if (res?.token) {
        setCodeSuccess(true);
        telegram.haptic.notification('success');
        setTimeout(() => {
          if (onSuccess) onSuccess();
          if (onClose) onClose();
        }, 800);
      } else {
        throw new Error(res?.error || 'Неверный код авторизации');
      }
    } catch (err) {
      setCodeError(err.message || (isRu ? 'Неверный или истекший проверочный код' : 'Invalid or expired login code'));
      telegram.haptic.notification('error');
    } finally {
      setVerifyingCode(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-sm rounded-3xl glass-card border border-sky-500/30 p-5 shadow-2xl space-y-4 animate-scale-up text-left">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Telegram Header Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/20">
            <Send className="w-6 h-6 -translate-x-0.5 translate-y-0.5" />
          </div>
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20">
              {isRu ? 'Вход через Telegram' : 'Telegram Auth'}
            </span>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white leading-tight mt-0.5">
              {title || (isRu ? 'Вход в RU-POTA Hub' : 'Operator Login')}
            </h3>
          </div>
        </div>

        {/* Reason / Explanation */}
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          {reason || (isRu 
            ? 'Войдите под своим радиолюбительским позывным в один клик через официального бота сообщества:'
            : 'Sign in with your amateur radio callsign in one click via the official community bot:'
          )}
        </p>

        {/* Error Notification */}
        {codeError && (
          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-[11px] leading-tight">{codeError}</span>
          </div>
        )}

        {/* Success Notification */}
        {codeSuccess && (
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300 text-xs flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="text-[11px] font-bold">{isRu ? 'Вход успешно выполнен!' : 'Login successful!'}</span>
          </div>
        )}

        {/* Action Blocks */}
        <div className="space-y-3 pt-1">
          {/* 1. Primary 1-Click Button */}
          <button
            type="button"
            onClick={handleOpenBotLogin}
            disabled={loadingLink || codeSuccess}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-lg shadow-sky-500/25 transition active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {loadingLink ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4 -translate-x-0.5 translate-y-0.5" />
            )}
            <span>{isRu ? 'Войти в 1 клик через Telegram' : '1-Tap Sign In with Telegram'}</span>
            <ExternalLink className="w-3.5 h-3.5 ml-0.5 opacity-80" />
          </button>

          {/* Waiting status pulse */}
          {waitingConfirm && !codeSuccess && (
            <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-xs text-sky-800 dark:text-sky-300 flex items-center gap-2.5 animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-sky-500 shrink-0" />
              <div className="leading-tight">
                <p className="font-bold">{isRu ? 'Ожидание нажатия Start в боте...' : 'Waiting for Start in Telegram...'}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {isRu ? 'Откройте бота и нажмите "Начать" внизу экрана' : 'Open bot and tap "Start" button'}
                </p>
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
            <span className="flex-shrink mx-3 text-[10px] uppercase font-bold tracking-wider text-slate-400">
              {isRu ? 'Или введите код из бота' : 'Or enter 6-digit code'}
            </span>
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
          </div>

          {/* 2. Code Input Form */}
          <form onSubmit={handleVerifyCode} className="space-y-2">
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="w-full text-center tracking-[0.4em] font-mono text-base font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl py-2 px-3 text-slate-900 dark:text-white placeholder:text-slate-400 placeholder:tracking-normal focus:border-sky-500 outline-none"
              />
              <span className="absolute left-3 top-2.5 text-slate-400 pointer-events-none">
                <KeyRound className="w-4 h-4" />
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
              <span>{isRu ? 'Команда в боте:' : 'Command in bot:'} <code className="text-sky-600 dark:text-sky-400 font-bold">/login</code></span>
              <a
                href="https://t.me/ru_pota_bot?start=login"
                target="_blank"
                rel="noreferrer"
                className="text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-0.5"
              >
                <span>{isRu ? 'Получить код' : 'Get code'}</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>

            <button
              type="submit"
              disabled={code.length !== 6 || verifyingCode || codeSuccess}
              className="w-full py-2 px-4 rounded-xl font-bold text-xs text-white bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 border border-slate-600 transition active:scale-95 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5"
            >
              {verifyingCode ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <KeyRound className="w-3.5 h-3.5 text-sky-400" />
              )}
              <span>{verifyingCode ? (isRu ? 'Проверка...' : 'Verifying...') : (isRu ? 'Войти по коду' : 'Sign in with Code')}</span>
            </button>
          </form>

          {/* Email Fallback */}
          {onOpenWebAuth && (
            <button
              type="button"
              onClick={() => {
                if (onClose) onClose();
                onOpenWebAuth();
              }}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-semibold text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 transition active:scale-95 cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5 text-emerald-500" />
              <span>{isRu ? 'Войти по позывному и Email' : 'Sign In with Callsign & Email'}</span>
            </button>
          )}

          {/* Guest Continue */}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-1.5 px-3 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition"
          >
            {isRu ? 'Продолжить просмотр как гость' : 'Continue browsing as guest'}
          </button>
        </div>
      </div>
    </div>
  );
}

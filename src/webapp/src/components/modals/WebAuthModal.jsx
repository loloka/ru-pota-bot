import React, { useState, useEffect, useRef } from 'react';
import { Mail, KeyRound, X, ArrowRight, CheckCircle2, AlertCircle, RefreshCw, Radio, ShieldCheck } from 'lucide-react';
import { telegram } from '../../services/telegram.js';
import { api } from '../../services/api.js';

export default function WebAuthModal({ isOpen, onClose, onSuccess, language = 'RU' }) {
  const isRu = language === 'RU';

  // Steps: 'form' (Callsign + Email) | 'verify' (6-digit code)
  const [step, setStep] = useState('form');
  const [callsign, setCallsign] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const codeInputRef = useRef(null);

  // Cooldown countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Focus code input when stepping to verify
  useEffect(() => {
    if (step === 'verify') {
      setTimeout(() => {
        codeInputRef.current?.focus();
      }, 100);
    }
  }, [step]);

  if (!isOpen) return null;

  // Step 1: Send verification code
  const handleSendCode = async (e) => {
    e?.preventDefault();
    const cleanCall = callsign.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanCall || !cleanEmail) return;

    // Check for slashes (base callsign only)
    if (cleanCall.includes('/') || cleanCall.includes('\\')) {
      setError(isRu 
        ? 'Укажите только основной позывной без дробей (/P, /M, /1 и т.д.)' 
        : 'Please enter base callsign only, without slashes (/P, /M, etc.)');
      return;
    }

    // Validate format (letters + digits, no slashes)
    const pureCallsignRegex = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,5}$/;
    if (!pureCallsignRegex.test(cleanCall) || !/[A-Z]/.test(cleanCall)) {
      setError(isRu 
        ? 'Некорректный формат позывного (например: R9OGL, RA9ODW, UB3AAA)' 
        : 'Invalid callsign format (e.g. R9OGL, RA9ODW, UB3AAA)');
      return;
    }

    setError('');
    setLoading(true);
    telegram.haptic.impact('medium');

    try {
      const res = await api.sendEmailCode({
        callsign: cleanCall,
        email: cleanEmail,
      });

      telegram.haptic.notification('success');
      setStep('verify');
      setCode('');
      setResendCooldown(60); // 60s cooldown
    } catch (err) {
      telegram.haptic.notification('error');
      setError(err.message || (isRu ? 'Ошибка отправки кода' : 'Failed to send code'));
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify 6-digit code
  const handleVerifyCode = async (e) => {
    e?.preventDefault();
    if (!code.trim() || code.trim().length < 6) return;

    setError('');
    setLoading(true);
    telegram.haptic.impact('heavy');

    try {
      const res = await api.verifyEmailCode({
        email: email.trim().toLowerCase(),
        code: code.trim(),
        callsign: callsign.trim().toUpperCase(),
      });

      telegram.haptic.notification('success');
      if (onSuccess) {
        onSuccess(res.user);
      }
      onClose();
    } catch (err) {
      telegram.haptic.notification('error');
      setError(err.message || (isRu ? 'Неверный проверочный код' : 'Invalid code'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div 
        className="relative w-full max-w-sm rounded-3xl glass-card border border-emerald-500/30 p-5 shadow-2xl space-y-4 animate-scale-up text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header Badge & Title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20">
            {step === 'form' ? <Mail className="w-6 h-6" /> : <KeyRound className="w-6 h-6" />}
          </div>
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
              {isRu ? 'Вход по Email' : 'Email Sign In'}
            </span>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white leading-tight mt-0.5">
              {step === 'form' 
                ? (isRu ? 'Авторизация оператора' : 'Operator Sign In') 
                : (isRu ? 'Проверочный код' : 'Enter Verification Code')}
            </h3>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: Callsign & Email Form */}
        {step === 'form' && (
          <form onSubmit={handleSendCode} className="space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {isRu
                ? 'Для операторов без Telegram: введите ваш позывной и email. Мы вышлем 6-значный проверочный код для мгновенного входа в Личный кабинет.'
                : 'Enter your callsign and email address. We will email you a 6-digit one-time code to sign into your personal profile.'}
            </p>

            <div className="space-y-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wide">
                  {isRu ? 'Основной позывной (без дробей)' : 'Base Callsign (no slashes)'}
                </label>
                <div className="relative">
                  <Radio className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={callsign}
                    onChange={(e) => setCallsign(e.target.value.toUpperCase().replace(/[\/\\ ]/g, ''))}
                    placeholder="R9OGL"
                    className="w-full bg-slate-200/60 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 font-mono font-bold uppercase focus:border-emerald-500/60 outline-none"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wide">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value.trim())}
                    placeholder="operator@example.com"
                    className="w-full bg-slate-200/60 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:border-emerald-500/60 outline-none font-sans"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Info callout: Email verification & QRZ.ru tip */}
            <div className="p-3.5 rounded-2xl bg-sky-500/10 dark:bg-slate-900/80 border border-sky-500/30 text-xs space-y-2">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-sky-500 dark:text-sky-400 shrink-0 mt-0.5" />
                <div className="space-y-1.5 leading-relaxed text-slate-700 dark:text-slate-300">
                  <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>{isRu ? 'Верификация позывного' : 'Callsign Verification'}</span>
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    {isRu 
                      ? 'Вход через сайт требует обязательного подтверждения Email. Для защиты от несанкционированного доступа администратор может запросить Свидетельство об образовании позывного (СИС).'
                      : 'Sign-in requires email verification. Community admins may request official proof of callsign ownership.'}
                  </p>
                  <div className="pt-1.5 border-t border-sky-500/20 text-[11px] text-slate-700 dark:text-slate-300 flex items-start gap-1.5">
                    <span className="text-amber-400 text-xs shrink-0">💡</span>
                    <span>
                      {isRu ? (
                        <>
                          <b className="text-slate-900 dark:text-white">Автоматическая проверка:</b> укажите тот же Email, что привязан к вашему позывному на <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">qrz.ru</span> — тогда проверка пройдёт автоматически и без отправки документов!
                        </>
                      ) : (
                        <>
                          <b className="text-slate-900 dark:text-white">Fast-track:</b> use the same Email as in your <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">qrz.ru</span> / QRZ.com profile for automatic verification without paperwork!
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || !callsign.trim() || !email.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 shadow-glow-emerald transition active:scale-95 cursor-pointer"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>{isRu ? 'Получить проверочный код' : 'Send Verification Code'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: Verification Code Input */}
        {step === 'verify' && (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {isRu ? 'Мы отправили 6-значный код на почту ' : 'We sent a 6-digit code to '}
              <b className="text-emerald-500 dark:text-emerald-400">{email}</b>.
              {isRu ? ' Введите его для подтверждения:' : ' Enter it below:'}
            </p>

            <div>
              <input
                ref={codeInputRef}
                type="text"
                maxLength={6}
                inputMode="numeric"
                pattern="[0-9]*"
                value={code}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setCode(val);
                }}
                placeholder="123456"
                className="w-full bg-slate-200/80 dark:bg-slate-900/90 border-2 border-emerald-500/50 rounded-2xl py-3 text-center text-2xl tracking-[12px] font-mono font-black text-emerald-600 dark:text-emerald-400 focus:border-emerald-500 outline-none shadow-glow-pill"
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <button
                type="submit"
                disabled={loading || code.length < 6}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 shadow-glow-emerald transition active:scale-95 cursor-pointer"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isRu ? 'Подтвердить и войти' : 'Verify & Sign In'}</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-between pt-1 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setStep('form');
                  }}
                  className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition"
                >
                  ← {isRu ? 'Сменить данные' : 'Change details'}
                </button>

                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={loading || resendCooldown > 0}
                  className="text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50 disabled:no-underline font-medium"
                >
                  {resendCooldown > 0 
                    ? (isRu ? `Повтор через ${resendCooldown}с` : `Resend in ${resendCooldown}s`)
                    : (isRu ? 'Отправить код снова' : 'Resend code')}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

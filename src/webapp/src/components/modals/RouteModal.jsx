import React, { useState } from 'react';
import { 
  Navigation, 
  MapPin, 
  Copy, 
  Check, 
  ExternalLink, 
  X,
  Compass
} from 'lucide-react';
import { telegram } from '../../services/telegram.js';

export default function RouteModal({ park, onClose, language = 'RU' }) {
  const [copied, setCopied] = useState(false);

  if (!park) return null;

  const lat = Number(park.lat).toFixed(6);
  const lon = Number(park.lon).toFixed(6);
  const coordsStr = `${lat}, ${lon}`;

  const handleCopy = () => {
    telegram.haptic.notification('success');
    navigator.clipboard.writeText(coordsStr).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openApp = (url) => {
    telegram.haptic.impact('medium');
    window.open(url, '_blank');
  };

  // Deep links / Web URLs
  const yandexUrl = `https://yandex.ru/maps/?rtext=~${lat},${lon}&rtt=auto`;
  const dgisUrl = `https://2gis.ru/routeSearch/rsType/car/to/${lon},${lat}`;
  const osmandUrl = `geo:${lat},${lon}?q=${lat},${lon}(${encodeURIComponent(park.reference + ' ' + park.name)})`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm animate-fade-in" 
        onClick={onClose} 
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-sm rounded-t-3xl sm:rounded-3xl glass-card p-5 shadow-2xl border border-slate-300 dark:border-slate-800 space-y-4 animate-slide-up z-10">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                {language === 'RU' ? 'Маршрут к парку' : 'Directions to Park'}
              </h3>
              <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                {park.reference}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Park info banner */}
        <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1">
          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{park.name}</p>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>{park.region || 'RU-POTA'}</span>
            <span className="font-mono">{coordsStr}</span>
          </div>
        </div>

        {/* Navigation Options */}
        <div className="space-y-2">
          {/* Яндекс Карты */}
          <button
            type="button"
            onClick={() => openApp(yandexUrl)}
            className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/70 transition group active:scale-95"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl select-none">🚗</span>
              <div className="text-left">
                <span className="font-bold text-xs text-slate-900 dark:text-white block">
                  {language === 'RU' ? 'Яндекс Карты / Навигатор' : 'Yandex Maps'}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {language === 'RU' ? 'Автомобильный маршрут с учетом дорог' : 'Driving directions'}
                </span>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition" />
          </button>

          {/* 2ГИС */}
          <button
            type="button"
            onClick={() => openApp(dgisUrl)}
            className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/70 transition group active:scale-95"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl select-none">📍</span>
              <div className="text-left">
                <span className="font-bold text-xs text-slate-900 dark:text-white block">
                  2ГИС (2GIS)
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {language === 'RU' ? 'Городская и загородная навигация' : 'Detailed regional navigation'}
                </span>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition" />
          </button>

          {/* OsmAnd / Geo URI */}
          <button
            type="button"
            onClick={() => openApp(osmandUrl)}
            className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/70 transition group active:scale-95"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl select-none">🗺️</span>
              <div className="text-left">
                <span className="font-bold text-xs text-slate-900 dark:text-white block">
                  OsmAnd / Geo App
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {language === 'RU' ? 'Офлайн-карты на Android / iOS' : 'Offline GPS Navigator'}
                </span>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition" />
          </button>
        </div>

        {/* Copy Coordinates Button */}
        <button
          type="button"
          onClick={handleCopy}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-200/70 dark:bg-slate-800/40 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 transition active:scale-95"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-emerald-500" />
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                {language === 'RU' ? 'Координаты скопированы!' : 'Coordinates copied!'}
              </span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>{language === 'RU' ? 'Скопировать координаты' : 'Copy GPS Coordinates'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

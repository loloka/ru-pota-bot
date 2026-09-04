import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  Download, 
  Layers, 
  ExternalLink, 
  Copy, 
  Check, 
  X, 
  Smartphone, 
  HelpCircle,
  Radio,
  BookOpen
} from 'lucide-react';
import { telegram } from '../../services/telegram.js';

const WMS_LAYERS_GUIDE = [
  {
    name: 'Районы RDA (2025)',
    code: 'RDA',
    desc: 'Границы и шифры районов РФ (CB-02, NS-05 и др.)',
    url: 'https://map.r1cf.ru/geoserver/cite/wms?REQUEST=GetMap&SERVICE=WMS&VERSION=1.3.0&LAYERS=RDA_2025X&STYLES=rda_centroid_rx&FORMAT=image/png&BBOX={bbox}&WIDTH=256&HEIGHT=256&TRANSPARENT=TRUE',
  },
  {
    name: 'Аномальные зоны RAZA',
    code: 'RAZA',
    desc: 'Заповедные и аномальные зоны дипломной программы',
    url: 'https://map.r1cf.ru/geoserver/cite/wms?REQUEST=GetMap&SERVICE=WMS&VERSION=1.3.0&LAYERS=RAZAX&STYLES=razax&FORMAT=image/png&BBOX={bbox}&WIDTH=256&HEIGHT=256&TRANSPARENT=TRUE',
  },
  {
    name: 'Аэродромы RAFA',
    code: 'RAFA',
    desc: 'Вертодромы и аэродромы радиолюбительских активаций',
    url: 'https://map.r1cf.ru/geoserver/cite/wms?REQUEST=GetMap&SERVICE=WMS&VERSION=1.3.0&LAYERS=aopax&STYLES=rafax&FORMAT=image/png&BBOX={bbox}&WIDTH=256&HEIGHT=256&TRANSPARENT=TRUE',
  },
  {
    name: 'QTH Локаторы',
    code: 'QTH',
    desc: 'Сетка больших и малых квадратов Maidenhead',
    url: 'https://map.r1cf.ru/geoserver/cite/wms?REQUEST=GetMap&SERVICE=WMS&VERSION=1.3.0&LAYERS=QTH&STYLES=QTH&FORMAT=image/png&BBOX={bbox}&WIDTH=256&HEIGHT=256&TRANSPARENT=TRUE',
  },
  {
    name: 'Реки RRNA-RR',
    code: 'RRNA',
    desc: 'Великие и малые реки Российской Федерации',
    url: 'https://map.r1cf.ru/geoserver/cite/wms?REQUEST=GetMap&SERVICE=WMS&VERSION=1.3.0&LAYERS=RRNA_RRX&STYLES=rrna_rrx&FORMAT=image/png&BBOX={bbox}&WIDTH=256&HEIGHT=256&TRANSPARENT=TRUE',
  },
  {
    name: 'Острова RRA',
    code: 'RRA',
    desc: 'Острова программы «Русский Робинзон»',
    url: 'https://map.r1cf.ru/geoserver/cite/wms?REQUEST=GetMap&SERVICE=WMS&VERSION=1.3.0&LAYERS=RRAX&STYLES=rrax&FORMAT=image/png&BBOX={bbox}&WIDTH=256&HEIGHT=256&TRANSPARENT=TRUE',
  },
];

export default function OsmAndModal({ onClose, language = 'RU' }) {
  const [copiedIndex, setCopiedIndex] = useState(null);

  const copyUrl = (url, index) => {
    telegram.haptic.notification('success');
    navigator.clipboard.writeText(url).catch(() => {});
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pt-14 pb-safe">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm animate-fade-in" 
        onClick={onClose} 
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-lg max-h-[82vh] sm:max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl glass-card p-4 sm:p-5 shadow-2xl border border-slate-300 dark:border-slate-800 space-y-3 animate-slide-up z-10 overflow-hidden">
        
        {/* Mobile Drag Indicator */}
        <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto -mt-1 mb-0.5 sm:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-500 shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                Карты RDA от R1CF офлайн на OsmAnd
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Полное руководство и офлайн-сборки OsmAnd PlusM
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

        {/* Scrollable Body */}
        <div className="overflow-y-auto space-y-4 pr-1 text-xs text-slate-700 dark:text-slate-300">
          
          {/* Intro Card */}
          <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
              <Radio className="w-4 h-4" />
              <span>Офлайн-навигация для активаторов и охотников</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              Карты Андрея <b>R1CF</b> — золотой стандарт радиолюбительской картографии в РФ. 
              Чтобы использовать их в глухих лесах и заповедниках <b>полностью без интернета</b>, 
              используется мобильное приложение <b>OsmAnd PlusM</b>, умеющее кэшировать WMS-слои.
            </p>
          </div>

          {/* Official Sources & Download Section */}
          <div className="space-y-3">
            {/* Official Store Links */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
                Официальные источники OsmAnd:
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                <a 
                  href="https://osmand.net/" 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition text-center group active:scale-95"
                >
                  <span className="text-base mb-0.5 select-none">🌐</span>
                  <span className="font-bold text-[10px] text-slate-800 dark:text-slate-200">Сайт</span>
                </a>

                <a 
                  href="https://play.google.com/store/apps/details?id=net.osmand.plus&hl=ru&gl=US" 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition text-center group active:scale-95"
                >
                  <span className="text-base mb-0.5 select-none">🤖</span>
                  <span className="font-bold text-[10px] text-slate-800 dark:text-slate-200">Google Play</span>
                </a>

                <a 
                  href="https://apps.apple.com/ua/app/osmand-maps-travel-navigate/id934850257?l=ru" 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition text-center group active:scale-95"
                >
                  <span className="text-base mb-0.5 select-none">🍏</span>
                  <span className="font-bold text-[10px] text-slate-800 dark:text-slate-200">App Store</span>
                </a>
              </div>
            </div>

            {/* Server Ready APKs */}
            <div className="space-y-2 pt-1 border-t border-slate-200 dark:border-slate-800">
              <h4 className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-emerald-500" />
                <span>Либо скачайте с нашего сервера (Android):</span>
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Премиум-версии с уже включенной поддержкой WMS и радиолюбительских карт:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <a
                  href="http://r9old.ru/files/OsmAnd-PlusM-v4.6.11-GIP-arm64.apk"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-3 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition group active:scale-95"
                >
                  <div className="flex items-center gap-2">
                    <Download className="w-4 h-4 text-emerald-500 group-hover:scale-110 transition" />
                    <div>
                      <span className="font-bold text-xs text-slate-900 dark:text-white block">
                        Версия ARM64
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        Для всех современных смартфонов
                      </span>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-emerald-500" />
                </a>


              <a
                href="http://r9old.ru/files/OsmAnd-PlusM-v4.6.11-GIP-arm32.apk"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition group active:scale-95"
              >
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-slate-400 group-hover:scale-110 transition" />
                  <div>
                    <span className="font-bold text-xs text-slate-900 dark:text-white block">
                      Версия ARM32
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      Для старых устройств и планшетов
                    </span>
                  </div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>
            </div>
          </div>
        </div>

          {/* Setup Guide */}
          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">

            <h4 className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-blue-500" />
              <span>Инструкция по подключению слоев WMS в OsmAnd</span>
            </h4>

            <ol className="list-decimal list-inside text-[11px] text-slate-600 dark:text-slate-400 space-y-1 bg-slate-100 dark:bg-slate-900/40 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
              <li>Откройте OsmAnd: <b>Меню ➔ Загрузка карт ➔ Локальные</b></li>
              <li>Выберите <b>«Источники карт»</b> и вверху нажмите <b>«Добавить онлайн-источник»</b></li>
              <li>Скопируйте нужный URL ниже и вставьте в поле адреса</li>
              <li>Для отображения поверх карты: <b>Настройка карты ➔ Карта наложения</b></li>
            </ol>
          </div>

          {/* WMS Layers List with Copy Buttons */}
          <div className="space-y-2">
            <h4 className="font-bold text-xs text-slate-900 dark:text-white">
              Ссылки на WMS-слои радиолюбительских карт:
            </h4>

            <div className="space-y-1.5">
              {WMS_LAYERS_GUIDE.map((layer, idx) => (
                <div 
                  key={layer.code}
                  className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                        {layer.name}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        {layer.code}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {layer.desc}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => copyUrl(layer.url, idx)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition shrink-0 active:scale-95"
                  >
                    {copiedIndex === idx ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">Скопирован</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Копировать URL</span>
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="text-[10px] text-center text-slate-400 dark:text-slate-500 pt-1">
            Автор оригинальной статьи: R3DFE (HamTop.ru) • Картографический геосервер: R1CF
          </div>
        </div>

        {/* Footer Button */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl font-bold text-xs text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-glow-emerald transition active:scale-95"
          >
            Понятно, закрыть
          </button>
        </div>

      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
}

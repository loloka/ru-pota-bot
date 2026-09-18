import React, { useState, useEffect } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  MapPin, 
  ExternalLink, 
  FileText, 
  Building2, 
  Calendar, 
  Maximize2, 
  Compass,
  Trees,
  Loader2,
  Sparkles,
  Edit3,
  Info,
  Navigation,
  User,
  MessageCircle,
  Mail
} from 'lucide-react';
import { telegram } from '../../services/telegram.js';
import { api } from '../../services/api.js';
import { 
  parseOoptForSubmitter, 
  formatR2bbxTemplate, 
  getYandexMapsUrl 
} from '../../services/ooptUtils.js';

export default function OoptModal({ oopt, onClose, onShowOnMap }) {
  const [activeTab, setActiveTab] = useState('submitter'); // 'submitter' | 'passport'
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  // Editable Submitter form state
  const [form, setForm] = useState(() => parseOoptForSubmitter(oopt));

  useEffect(() => {
    if (!oopt?.nid) return;
    let isMounted = true;
    setLoading(true);
    setError(null);

    // Initial parse from basic card data
    const initialParsed = parseOoptForSubmitter(oopt);
    setForm(initialParsed);

    api.getOoptDetails(oopt.nid)
      .then((data) => {
        if (!isMounted) return;
        setDetails(data);

        // Merge freshly loaded details (coordinates, rf_subjects, documents) into form
        const detailedParsed = parseOoptForSubmitter(data);
        setForm((prev) => ({
          ...prev,
          name: prev.name || detailedParsed.name,
          nameEn: prev.nameEn || detailedParsed.nameEn,
          statusEn: prev.statusEn || detailedParsed.statusEn,
          status: prev.status || detailedParsed.status,
          lat: detailedParsed.lat || prev.lat,
          lon: detailedParsed.lon || prev.lon,
          region: detailedParsed.region || prev.region,
          site: prev.site || detailedParsed.site,
          clarification: prev.clarification || detailedParsed.clarification,
        }));
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message);
          setDetails(oopt);
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [oopt]);

  if (!oopt) return null;

  const current = details || oopt;
  const previewText = formatR2bbxTemplate(form);
  const yandexInfo = getYandexMapsUrl(form.lat, form.lon, form.name, form.region);

  const handleInputChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  // Copy formatted application to clipboard
  const handleCopySubmitter = () => {
    navigator.clipboard.writeText(previewText).then(() => {
      setCopied(true);
      telegram.haptic.notification('success');
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      telegram.haptic.notification('error');
    });
  };

  const getSigBadge = (sig, display) => {
    if (sig === 'federal') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
          🏛️ {display || 'Федеральное'}
        </span>
      );
    }
    if (sig === 'regional') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          🌲 {display || 'Региональное'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
        🏡 {display || 'Местное'}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div 
        className="relative w-full max-w-lg max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/70">
          <div className="flex-1 pr-3">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              {getSigBadge(current.sig, current.sig_display)}
              {current.category && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {current.category}
                </span>
              )}
              {current.status && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  ● {current.status}
                </span>
              )}
              {current.pota_ref && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  <Sparkles className="w-3 h-3 text-emerald-500" />
                  В POTA: {current.pota_ref}
                </span>
              )}
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
              {current.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/60 p-1 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('submitter')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'submitter'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
            📋 Заявка POTA (R2BBX)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('passport')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'passport'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Trees className="w-3.5 h-3.5 text-slate-400" />
            🌲 Паспорт ООПТ
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          {activeTab === 'submitter' ? (
            /* POTA Park Submitter (spec by Manu R2BBX) */
            <div className="space-y-3.5">
              {current.pota_ref && (
                <div className="p-3 rounded-xl bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between gap-2.5 text-xs shadow-xs">
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-emerald-800 dark:text-emerald-200">
                        Объект уже добавлен в POTA!
                      </div>
                      <div className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                        Референс: <span className="font-mono font-bold text-emerald-800 dark:text-emerald-200">{current.pota_ref}</span> {current.pota_name ? `(${current.pota_name})` : ''}. Повторная заявка не требуется.
                      </div>
                    </div>
                  </div>
                  <a
                    href={`https://next.pota.app/park/${current.pota_ref}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shrink-0 shadow-sm"
                  >
                    <ExternalLink className="w-3 h-3" />
                    pota.app
                  </a>
                </div>
              )}

              {/* Coordinator Guideline Card */}
              <div className="p-3 rounded-xl bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200">
                <div className="font-semibold flex items-center gap-1.5 text-amber-800 dark:text-amber-300 mb-1">
                  <Info className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>Правила координатора POTA (R2BBX):</span>
                </div>
                <ul className="space-y-0.5 text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-300/90 list-disc list-inside">
                  <li><strong>Охранный статус:</strong> только официальные ООПТ РФ (регионального или федерального значения). Городские скверы и парки отдыха без статуса ООПТ не допускаются правилами POTA.</li>
                  <li><strong>Название:</strong> очищенное от кавычек и бюрократических приставок (напр. <em>Лосиный Остров</em>).</li>
                  <li><strong>На английском:</strong> авто-перевод для POTA (напр. <em>Losinyy Ostrov National Park</em>).</li>
                  <li><strong>Статус:</strong> <em>Национальный парк</em>, <em>Природный заказник</em> и т.д.</li>
                  <li><strong>Регионы:</strong> указать все субъекты, если ООПТ на стыке (напр. <em>Москва, Московская область</em>).</li>
                  <li><strong>Сайт:</strong> приоритет — NextGIS (node/:id) или официальный сайт парка. Википедия, VK и коммерческие сайты не принимаются.</li>
                  <li><strong>Куда отправлять:</strong> в Telegram <a href="https://t.me/ManuUmAn" target="_blank" rel="noreferrer" className="font-bold underline">@ManuUmAn</a> или по почте <a href="mailto:r2bbx.mua@gmail.com" className="font-bold underline">r2bbx.mua@gmail.com</a>.</li>
                </ul>
              </div>

              {/* Editable Fields Grid */}
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      1. Название парка/ООПТ (RU) <span className="text-emerald-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      placeholder="напр. Лосиный Остров"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      2. Название для POTA (EN) <span className="text-emerald-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.nameEn || ''}
                      onChange={(e) => handleInputChange('nameEn', e.target.value)}
                      placeholder="напр. Losinyy Ostrov"
                      className="w-full px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300 rounded-xl bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      3. Статус ООПТ для POTA (EN) <span className="text-emerald-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.statusEn || ''}
                      onChange={(e) => handleInputChange('statusEn', e.target.value)}
                      placeholder="напр. National Park / Nature Sanctuary"
                      className="w-full px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300 rounded-xl bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      4. Статус (парк/ООПТ и т.п.) (RU) <span className="text-emerald-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.status}
                      onChange={(e) => handleInputChange('status', e.target.value)}
                      placeholder="напр. Национальный природный заповедник"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    />
                  </div>
                </div>

                {/* Coordinates Row (4 decimal precision per R2BBX) */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      5. Координата 1 (Широта, Lat) <span className="text-emerald-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.lat}
                      onChange={(e) => handleInputChange('lat', e.target.value)}
                      placeholder="55.8772"
                      className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      6. Координата 2 (Долгота, Lon) <span className="text-emerald-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.lon}
                      onChange={(e) => handleInputChange('lon', e.target.value)}
                      placeholder="37.7818"
                      className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    />
                  </div>
                </div>

                {/* Yandex Map Verification Helper */}
                <div className="flex items-center justify-between text-xs pt-0.5">
                  {loading ? (
                    <span className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                      Запрос координат из реестра...
                    </span>
                  ) : form.lat && form.lon ? (
                    <span className="text-emerald-600 dark:text-emerald-400 text-[11px] font-medium flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      Координаты указаны (4 знака)
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 text-[11px] font-medium">
                      Координаты отсутствуют в базе
                    </span>
                  )}

                  {yandexInfo && (
                    <a
                      href={yandexInfo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
                    >
                      <Navigation className="w-3 h-3" />
                      {yandexInfo.label}
                    </a>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    7. Регион России (субъекты РФ) <span className="text-emerald-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.region}
                    onChange={(e) => handleInputChange('region', e.target.value)}
                    placeholder="напр. Москва, Московская область"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      8. Сайт объекта, ссылка <span className="text-emerald-500">*</span>
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => current.nid && handleInputChange('site', `https://ooptaari.nextgis.ru/node/${current.nid}`)}
                        className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 font-medium transition-colors"
                        title="Установить ссылку NextGIS (приоритет R2BBX)"
                      >
                        NextGIS (R2BBX)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleInputChange('site', 'https://');
                          setTimeout(() => {
                            const inputEl = document.getElementById('oopt-modal-site-input');
                            if (inputEl) {
                              inputEl.focus();
                              inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
                            }
                          }, 50);
                        }}
                        className="px-1.5 py-0.5 text-[10px] rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 font-medium transition-colors"
                        title="Ввести собственный сайт парка или заповедника"
                      >
                        Свой сайт
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    id="oopt-modal-site-input"
                    value={form.site}
                    onChange={(e) => handleInputChange('site', e.target.value)}
                    placeholder="https://ooptaari.nextgis.ru/node/... или сайт заповедника"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                  <div className="text-[11px] text-slate-400 mt-1">
                    Приоритет: собственный сайт парка или NextGIS по требованию R2BBX. Без Википедии и соцсетей.
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    9. Уточнение (не обязательно)
                  </label>
                  <textarea
                    rows={2}
                    value={form.clarification}
                    onChange={(e) => handleInputChange('clarification', e.target.value)}
                    placeholder="Границы, кластерные участки, статус или примечания для координатора"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none"
                  />
                </div>
              </div>

              {/* Live Preview Box */}
              <div className="pt-1">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Готовый текст для отправки R2BBX:
                  </span>
                  <button
                    type="button"
                    onClick={handleCopySubmitter}
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      copied
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95'
                    }`}
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Скопировано!' : 'Скопировать заявку'}
                  </button>
                </div>
                <pre className="p-3 rounded-xl bg-slate-900 text-emerald-400 font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-all border border-slate-800 overflow-x-auto shadow-inner">
                  {previewText}
                </pre>

                {/* Quick send actions */}
                <div className="mt-2.5 flex flex-col gap-2">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!copied) handleCopySubmitter();
                        telegram.openTelegramLink('https://t.me/ManuUmAn');
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 text-xs font-semibold transition-all active:scale-98 shadow-sm"
                    >
                      <User className="w-3.5 h-3.5 shrink-0" />
                      <span>Отправить в TG (@ManuUmAn)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!copied) handleCopySubmitter();
                        const subject = encodeURIComponent(`Заявка POTA: ${form.nameEn || form.name}`);
                        const body = encodeURIComponent(previewText);
                        window.location.href = `mailto:r2bbx.mua@gmail.com?subject=${subject}&body=${body}`;
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/25 text-xs font-semibold transition-all active:scale-98 shadow-sm"
                      title="Открыть почтовую программу с готовым текстом заявки"
                    >
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span>Отправить на Email</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!copied) handleCopySubmitter();
                      telegram.openTelegramLink('https://t.me/+Pek5olQhfPdiZDIy');
                    }}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/25 text-xs font-semibold transition-all active:scale-98 shadow-sm"
                  >
                    <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>В чат RU-POTA (Telegram)</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Passport Tab: Comprehensive Registry Data */
            <div className="space-y-4">
              {/* Location & Coordinates */}
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                  <MapPin className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white">Регион: </span>
                    <span>{current.rf_subjects || current.ate || 'Не указан'}</span>
                  </div>
                </div>

                {current.lat && current.lon ? (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-400">Координаты центра</div>
                      <div className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {Number(current.lat).toFixed(4)}, {Number(current.lon).toFixed(4)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {yandexInfo?.url && (
                        <a
                          href={yandexInfo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors shadow-sm"
                          title="Открыть границы и координаты в Яндекс.Картах"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Яндекс Карты</span>
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic">
                    Координаты для данного объекта уточняются
                  </div>
                )}
              </div>

              {/* Characteristics Grid */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-1">
                    <Maximize2 className="w-3.5 h-3.5 text-emerald-500" />
                    Площадь
                  </div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {current.area ? `${Number(current.area).toLocaleString('ru-RU')} га` : 'Не указана'}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-1">
                    <Calendar className="w-3.5 h-3.5 text-teal-500" />
                    Дата создания
                  </div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {current.start_date || 'Не указана'}
                  </div>
                </div>
              </div>

              {/* Profile & Agency */}
              {current.profile && (
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Профиль: </span>
                  <span className="text-slate-600 dark:text-slate-400">{current.profile}</span>
                </div>
              )}

              {current.agency && (
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    Ведомство
                  </div>
                  <div className="text-slate-600 dark:text-slate-400 leading-snug">{current.agency}</div>
                </div>
              )}

              {/* Official Documents with direct PDF links */}
              {Array.isArray(current.documents) && current.documents.length > 0 && (
                <div className="pt-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                    <FileText className="w-3.5 h-3.5 text-emerald-500" />
                    Правоустанавливающие документы ({current.documents.length})
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {current.documents.map((doc, idx) => (
                      <div 
                        key={doc.id || idx}
                        className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs flex items-start justify-between gap-2"
                      >
                        <div className="flex-1">
                          <div className="font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                            {doc.title || doc.category || 'Документ'}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {[doc.number ? `№ ${doc.number}` : null, doc.date_accepted].filter(Boolean).join(' от ')}
                          </div>
                        </div>
                        {doc.file_url && (
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 rounded hover:bg-emerald-500/10 shrink-0"
                            title="Скачать PDF"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/70 flex items-center justify-between text-xs text-slate-500">
          <span>ID в реестре: <code>{current.nid}</code></span>
          <a
            href="https://xn--80aa2azak.xn--g1agk6a.xn--p1ai/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            карта.оцзк.рф
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

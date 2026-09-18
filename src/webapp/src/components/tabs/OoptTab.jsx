import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Search, 
  X, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  MapPin, 
  Maximize2, 
  FileText, 
  Calendar, 
  Trees, 
  Copy, 
  Check, 
  Sparkles, 
  ExternalLink,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { api } from '../../services/api.js';
import { telegram } from '../../services/telegram.js';
import { parseOoptForSubmitter, formatR2bbxTemplate } from '../../services/ooptUtils.js';
import OoptModal from '../modals/OoptModal.jsx';

export default function OoptTab({ onNavigateToMap }) {
  // State
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sigFilter, setSigFilter] = useState(''); // '' | 'federal' | 'regional' | 'local'
  const [categoryFilter, setCategoryFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [potaFilter, setPotaFilter] = useState(''); // '' | 'in_pota' | 'not_in_pota'
  
  // Selected modal
  const [selectedOopt, setSelectedOopt] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [copyLoadingId, setCopyLoadingId] = useState(null);

  // Page input jump
  const [jumpPage, setJumpPage] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // reset to page 1 on search change
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getOoptList({
        page,
        limit,
        search: debouncedSearch,
        sig: sigFilter,
        category: categoryFilter,
        region: regionFilter,
        pota: potaFilter,
      });

      setItems(res.rows || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
      if (res.stats) setStats(res.stats);
    } catch (err) {
      console.error('[OoptTab] Error loading list:', err.message);
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, sigFilter, categoryFilter, regionFilter, potaFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle pagination
  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages || newPage === page) return;
    telegram.haptic.selection();
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleJumpSubmit = (e) => {
    e.preventDefault();
    const p = parseInt(jumpPage, 10);
    if (p >= 1 && p <= totalPages) {
      handlePageChange(p);
      setJumpPage('');
    }
  };

  // Fast copy coordinator template directly from card (auto-fetches coordinates if not yet in cache)
  const handleQuickCopy = async (e, item) => {
    e.stopPropagation();
    try {
      let target = item;
      if (!target.lat || !target.lon) {
        setCopyLoadingId(item.nid);
        const details = await api.getOoptDetails(item.nid);
        if (details && (details.lat || details.lon)) {
          target = { ...item, ...details };
          // Cache in row object so subsequent operations have coordinates immediately
          item.lat = details.lat;
          item.lon = details.lon;
          if (details.rf_subjects) item.rf_subjects = details.rf_subjects;
        }
      }
      const parsed = parseOoptForSubmitter(target);
      const template = formatR2bbxTemplate(parsed);

      await navigator.clipboard.writeText(template);
      setCopyLoadingId(null);
      setCopiedId(item.nid);
      telegram.haptic.notification('success');
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.warn('Quick copy failed:', err);
      setCopyLoadingId(null);
      const parsed = parseOoptForSubmitter(item);
      const template = formatR2bbxTemplate(parsed);
      navigator.clipboard.writeText(template);
      setCopiedId(item.nid);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];
    let l;

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
        range.push(i);
      }
    }

    for (const i of range) {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l !== 1) {
          rangeWithDots.push('...');
        }
      }
      rangeWithDots.push(i);
      l = i;
    }

    return rangeWithDots;
  };

  const getSigBadge = (sig, display) => {
    if (sig === 'federal') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
          🏛️ {display || 'Федеральное'}
        </span>
      );
    }
    if (sig === 'regional') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          🌲 {display || 'Региональное'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
        🏡 {display || 'Местное'}
      </span>
    );
  };

  const startIndex = total === 0 ? 0 : (page - 1) * limit + 1;
  const endIndex = Math.min(page * limit, total);

  return (
    <div className="min-h-screen pb-24 pt-2 px-3 max-w-2xl mx-auto animate-fade-in">
      {/* Top Banner */}
      <div className="mb-2.5 p-3 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🌲</span>
              <h1 className="text-base font-extrabold tracking-tight">Реестр ООПТ России</h1>
            </div>
            <span className="text-xs bg-white/20 backdrop-blur-md px-2.5 py-0.5 rounded-full font-semibold">
              {stats?.total ? `${stats.total.toLocaleString('ru-RU')} объектов` : '11 342'}
            </span>
          </div>
          <p className="text-xs text-emerald-100 mt-1 leading-snug">
            Официальная база охраняемых природных территорий РФ. Быстрый поиск, сверка с базой POTA и генерация заявок для координатора (R2BBX).
          </p>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 mb-2.5 text-center">
        <div 
          onClick={() => { setSigFilter(''); setPotaFilter(''); setPage(1); }}
          className={`p-2 rounded-xl border transition-all cursor-pointer ${
            sigFilter === '' && potaFilter === ''
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-900 dark:text-emerald-200 shadow-xs'
              : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 hover:border-slate-300'
          }`}
          title="Все объекты реестра ООПТ"
        >
          <div className="text-[10px] text-slate-400 font-medium">Всего в реестре</div>
          <div className="text-sm font-extrabold text-slate-900 dark:text-white">
            {stats?.total ? stats.total.toLocaleString('ru-RU') : '11 342'}
          </div>
        </div>

        <div 
          onClick={() => { setSigFilter(sigFilter === 'federal' ? '' : 'federal'); setPage(1); }}
          className={`p-2 rounded-xl border transition-all cursor-pointer ${
            sigFilter === 'federal'
              ? 'bg-purple-500/15 border-purple-500/50 text-purple-900 dark:text-purple-200 shadow-xs'
              : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 hover:border-purple-300'
          }`}
          title="Объекты федерального значения"
        >
          <div className="text-[10px] text-purple-500 dark:text-purple-400 font-medium">🏛️ Федеральные</div>
          <div className="text-sm font-extrabold text-purple-700 dark:text-purple-300">
            {stats?.federal ? stats.federal.toLocaleString('ru-RU') : '361'}
          </div>
        </div>

        <div 
          onClick={() => { setSigFilter(sigFilter === 'regional' ? '' : 'regional'); setPage(1); }}
          className={`p-2 rounded-xl border transition-all cursor-pointer ${
            sigFilter === 'regional'
              ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-900 dark:text-emerald-200 shadow-xs'
              : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 hover:border-emerald-300'
          }`}
          title="Объекты регионального значения"
        >
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">🌲 Региональные</div>
          <div className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300">
            {stats?.regional ? stats.regional.toLocaleString('ru-RU') : '10 432'}
          </div>
        </div>

        <div 
          onClick={() => { setSigFilter(sigFilter === 'local' ? '' : 'local'); setPage(1); }}
          className={`p-2 rounded-xl border transition-all cursor-pointer ${
            sigFilter === 'local'
              ? 'bg-amber-500/15 border-amber-500/50 text-amber-900 dark:text-amber-200 shadow-xs'
              : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 hover:border-amber-300'
          }`}
          title="Объекты местного значения"
        >
          <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">🏡 Местные</div>
          <div className="text-sm font-extrabold text-amber-700 dark:text-amber-300">
            {stats?.local ? stats.local.toLocaleString('ru-RU') : '549'}
          </div>
        </div>

        <div 
          onClick={() => { setPotaFilter(potaFilter === 'in_pota' ? '' : 'in_pota'); setPage(1); }}
          className={`col-span-2 sm:col-span-1 p-2 rounded-xl border transition-all cursor-pointer ${
            potaFilter === 'in_pota'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
              : 'bg-emerald-500/10 dark:bg-emerald-950/40 border-emerald-500/30 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/20'
          }`}
          title="Нажмите, чтобы показать объекты уже добавленные в базу POTA"
        >
          <div className={`text-[10px] font-bold ${potaFilter === 'in_pota' ? 'text-emerald-100' : 'text-emerald-600 dark:text-emerald-400'}`}>
            ✅ В базе POTA
          </div>
          <div className={`text-sm font-extrabold ${potaFilter === 'in_pota' ? 'text-white' : 'text-emerald-700 dark:text-emerald-300'}`}>
            {stats?.inPota ? stats.inPota.toLocaleString('ru-RU') : '304'}
          </div>
        </div>
      </div>

      {/* Help Banner: Submitting new park to POTA & POTA OOPT Rules */}
      <div className="mb-2.5 p-3 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 text-xs shadow-sm">
        <div className="flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1.5">
            <div className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center justify-between flex-wrap gap-1">
              <span className="flex items-center gap-1.5">
                <span>Вашего парка ещё нет в POTA?</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold">Подать заявку</span>
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Координатор: <a href="mailto:r2bbx.mua@gmail.com" className="font-medium text-emerald-600 dark:text-emerald-400 hover:underline">r2bbx.mua@gmail.com</a>
              </span>
            </div>

            <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
              Выберите территорию из реестра, нажмите <span className="font-semibold text-emerald-600 dark:text-emerald-400">«📋 Заявка для R2BBX»</span> и отправьте готовый текст координатору <a href="https://t.me/ManuUmAn" target="_blank" rel="noreferrer" className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline">@ManuUmAn</a> или на почту <a href="mailto:r2bbx.mua@gmail.com" className="font-bold text-slate-700 dark:text-slate-300 underline">r2bbx.mua@gmail.com</a> (либо в <a href="https://t.me/+Pek5olQhfPdiZDIy" target="_blank" rel="noreferrer" className="font-bold text-blue-600 dark:text-blue-400 hover:underline">чат RU-POTA</a>).
            </div>

            <div className="pt-1.5 border-t border-emerald-500/10 text-[10.5px] text-slate-500 dark:text-slate-400 leading-normal">
              🌲 <strong className="text-slate-700 dark:text-slate-300">Почему только ООПТ?</strong> По международным правилам POTA допускаются <u>исключительно</u> природные территории с официальным охранным статусом регионального или федерального значения (заповедники, нацпарки, заказники, памятники природы). Обычные городские скверы и парки развлечений международная программа POTA строго отклоняет.
            </div>
          </div>
        </div>
      </div>

      {/* Search & Region Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 mb-2">
        <div className="relative sm:col-span-7">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию, заказнику..."
            className="w-full pl-10 pr-10 py-2 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 shadow-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="sm:col-span-5">
          <select
            value={regionFilter}
            onChange={(e) => { setRegionFilter(e.target.value); setPage(1); }}
            className="w-full py-2 px-2.5 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 shadow-sm truncate"
          >
            <option value="">Все регионы России (89)</option>
            {stats?.regions?.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Filter Chips: Significance & POTA */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none text-xs">
        <button
          type="button"
          onClick={() => { setSigFilter(''); setPotaFilter(''); setPage(1); }}
          className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all ${
            sigFilter === '' && potaFilter === ''
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm' 
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700/60'
          }`}
        >
          Все {stats?.total ? `(${stats.total.toLocaleString('ru-RU')})` : ''}
        </button>

        <button
          type="button"
          onClick={() => { setSigFilter('federal'); setPage(1); }}
          className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all ${
            sigFilter === 'federal'
              ? 'bg-purple-600 text-white shadow-sm' 
              : 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 border border-slate-200 dark:border-slate-700/60'
          }`}
        >
          🏛️ Федеральные {stats?.federal ? `(${stats.federal})` : ''}
        </button>

        <button
          type="button"
          onClick={() => { setSigFilter('regional'); setPage(1); }}
          className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all ${
            sigFilter === 'regional'
              ? 'bg-emerald-600 text-white shadow-sm' 
              : 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 border border-slate-200 dark:border-slate-700/60'
          }`}
        >
          🌲 Региональные {stats?.regional ? `(${stats.regional.toLocaleString('ru-RU')})` : ''}
        </button>

        <button
          type="button"
          onClick={() => { setSigFilter('local'); setPage(1); }}
          className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all ${
            sigFilter === 'local'
              ? 'bg-amber-600 text-white shadow-sm' 
              : 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 border border-slate-200 dark:border-slate-700/60'
          }`}
        >
          🏡 Местные {stats?.local ? `(${stats.local})` : ''}
        </button>

        <button
          type="button"
          onClick={() => { setPotaFilter(potaFilter === 'in_pota' ? '' : 'in_pota'); setPage(1); }}
          className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all ${
            potaFilter === 'in_pota'
              ? 'bg-emerald-600 text-white shadow-sm' 
              : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
          }`}
        >
          ✨ В POTA {stats?.inPota ? `(${stats.inPota})` : ''}
        </button>
      </div>

      {/* Category Dropdown & Items per page bar */}
      <div className="flex items-center justify-between gap-2 my-2 text-xs">
        {/* Category select */}
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          className="flex-1 max-w-[65%] py-1.5 px-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="">Все категории объектов</option>
          {stats?.categories?.map((cat) => (
            <option key={cat.category} value={cat.category}>
              {cat.category} ({cat.count})
            </option>
          ))}
        </select>

        {/* Limit select */}
        <div className="flex items-center gap-1.5 shrink-0 text-slate-500 dark:text-slate-400">
          <span>По:</span>
          <select
            value={limit}
            onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
            className="py-1 px-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
      </div>

      {/* Pagination Bar Top (info & quick buttons) */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 py-1.5 px-1">
        <span>
          Показано: <strong className="text-slate-800 dark:text-slate-200">{startIndex}–{endIndex}</strong> из {total.toLocaleString('ru-RU')}
        </span>
        <span className="font-semibold">
          Стр. {page} из {totalPages}
        </span>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          <span className="text-xs">Загрузка каталога ООПТ...</span>
        </div>
      ) : items.length === 0 ? (
        /* Empty State */
        <div className="text-center py-14 p-4 rounded-2xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
          <Trees className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Ничего не найдено</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
            Попробуйте изменить поисковый запрос или сбросить фильтры.
          </p>
          {(search || sigFilter || categoryFilter || regionFilter || potaFilter) && (
            <button
              type="button"
              onClick={() => { setSearch(''); setSigFilter(''); setCategoryFilter(''); setRegionFilter(''); setPotaFilter(''); setPage(1); }}
              className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : (
        /* Items List */
        <div className="space-y-2.5">
          {items.map((item) => (
            <div
              key={item.nid}
              onClick={() => setSelectedOopt(item)}
              className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/60 shadow-sm hover:shadow-md hover:border-emerald-500/40 transition-all duration-150 cursor-pointer group"
            >
              {/* Header Badges */}
              <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {getSigBadge(item.sig, item.sig_display)}
                  {item.category && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300">
                      {item.category}
                    </span>
                  )}
                  {item.pota_ref && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                      <Sparkles className="w-3 h-3 text-emerald-500" />
                      В POTA: {item.pota_ref}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  ID: {item.nid}
                </span>
              </div>

              {/* Title */}
              <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors leading-snug">
                {item.title}
              </h3>

              {/* Region */}
              <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500 dark:text-slate-400">
                <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="truncate">{item.ate || 'Регион не указан'}</span>
              </div>

              {/* Meta information & Quick Buttons */}
              <div className="flex items-center justify-between gap-2 mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700/50 text-[11px] text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-3">
                  {item.area ? (
                    <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                      <Maximize2 className="w-3 h-3 text-emerald-500" />
                      {Number(item.area).toLocaleString('ru-RU')} га
                    </span>
                  ) : null}
                  {item.start_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-teal-500" />
                      {item.start_date.substring(0, 4)} г.
                    </span>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => handleQuickCopy(e, item)}
                    title={item.pota_ref ? `Парк уже в POTA (${item.pota_ref})` : "Скопировать готовую заявку для R2BBX"}
                    disabled={copyLoadingId === item.nid}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      copiedId === item.nid
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : copyLoadingId === item.nid
                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                        : item.pota_ref
                        ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/30'
                        : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 active:scale-95'
                    }`}
                  >
                    {copiedId === item.nid ? (
                      <Check className="w-3 h-3" />
                    ) : copyLoadingId === item.nid ? (
                      <Loader2 className="w-3 h-3 animate-spin text-emerald-500" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    {copiedId === item.nid
                      ? 'Скопировано'
                      : copyLoadingId === item.nid
                      ? 'Координаты...'
                      : item.pota_ref
                      ? `POTA: ${item.pota_ref}`
                      : 'Заявка POTA'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedOopt(item)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                  >
                    Подробнее
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Bottom Controls ("Странички") */}
      {totalPages > 1 && (
        <div className="mt-5 p-3 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 shadow-sm space-y-3">
          {/* Main buttons: First, Prev, Page numbers, Next, Last */}
          <div className="flex items-center justify-center gap-1 flex-wrap">
            {/* First Page */}
            <button
              type="button"
              disabled={page === 1}
              onClick={() => handlePageChange(1)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-100 dark:hover:bg-slate-700"
              title="Первая страница"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>

            {/* Prev Page */}
            <button
              type="button"
              disabled={page === 1}
              onClick={() => handlePageChange(page - 1)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-100 dark:hover:bg-slate-700"
              title="Предыдущая"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Page number buttons */}
            {getPageNumbers().map((p, idx) => {
              if (p === '...') {
                return (
                  <span key={`dots-${idx}`} className="px-1.5 text-slate-400 select-none">
                    ...
                  </span>
                );
              }

              const isCurrent = p === page;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePageChange(p)}
                  className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-semibold transition-all ${
                    isCurrent
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {p}
                </button>
              );
            })}

            {/* Next Page */}
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => handlePageChange(page + 1)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-100 dark:hover:bg-slate-700"
              title="Следующая"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Last Page */}
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => handlePageChange(totalPages)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-100 dark:hover:bg-slate-700"
              title="Последняя страница"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>

          {/* Jump to page form */}
          <form onSubmit={handleJumpSubmit} className="flex items-center justify-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/60 text-xs text-slate-500">
            <span>Перейти к стр:</span>
            <input
              type="number"
              min="1"
              max={totalPages}
              value={jumpPage}
              onChange={(e) => setJumpPage(e.target.value)}
              placeholder={String(page)}
              className="w-16 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <span>из {totalPages}</span>
            <button
              type="submit"
              className="px-2.5 py-1 rounded-lg bg-emerald-500 text-white font-medium hover:bg-emerald-600 active:scale-95 transition-all"
            >
              ОК
            </button>
          </form>
        </div>
      )}

      {/* Detail Modal */}
      {selectedOopt && (
        <OoptModal
          oopt={selectedOopt}
          onClose={() => setSelectedOopt(null)}
          onShowOnMap={(item) => {
            setSelectedOopt(null);
            if (onNavigateToMap) {
              onNavigateToMap(item);
            }
          }}
        />
      )}
    </div>
  );
}

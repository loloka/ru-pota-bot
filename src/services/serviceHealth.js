import axios from 'axios';
import https from 'https';
import { potaApi } from '../api/potaApi.js';

let cachedResults = null;
let lastCheckTime = 0;
const CACHE_TTL_MS = 30000; // 30 seconds cache
let tgClient = null;

export function setTelegramClient(client) {
  tgClient = client;
}

const SERVICES = [
  {
    id: 'bot_core',
    name: 'RU-POTA Bot & Mini App Сервер',
    domain: 'Локальная система (Node.js)',
    url: '/app',
    description: 'Внутренний процесс бота, база данных SQLite (WAL), REST API и веб-сервер Telegram Mini App',
    type: 'bot_core'
  },
  {
    id: 'telegram_api',
    name: 'Telegram Bot API',
    domain: 'api.telegram.org',
    url: 'https://api.telegram.org/',
    checkUrl: 'https://api.telegram.org/',
    description: 'Шлюз Telegram Bot API: доставка спотов в канал, оповещения подписчикам в ЛС, команды бота',
    type: 'telegram_api'
  },
  {
    id: 'pota_api',
    name: 'Официальный кластер POTA API',
    domain: 'api.pota.app',
    url: 'https://api.pota.app/',
    description: 'Официальный боевой API кластера POTA, список спотов, выгрузка зарегистрированных парков (RU, BY, KZ)',
    type: 'pota_api'
  },
  {
    id: 'pota_next',
    name: 'Портал POTA Next (портал программы)',
    domain: 'next.pota.app',
    url: 'https://next.pota.app/',
    checkUrl: 'https://next.pota.app/',
    description: 'Официальный веб-портал программы Parks on the Air: карточки парков, профили радиолюбителей, дипломы',
    type: 'http'
  },
  {
    id: 'oopt_registry',
    name: 'Реестр ООПТ РФ (Минприроды)',
    domain: 'карта.оцзк.рф',
    url: 'https://xn--80aa2azak.xn--g1agk6a.xn--p1ai/',
    checkUrl: 'https://xn--80aa2azak.xn--g1agk6a.xn--p1ai/api/v1/dictionaries/',
    description: 'Официальная база данных охраняемых природных территорий (центроиды, площади, категории, паспорта)',
    type: 'http'
  },
  {
    id: 'oopt_nextgis',
    name: 'Геопортал ООПТ NextGIS',
    domain: 'ooptaari.nextgis.ru',
    url: 'https://ooptaari.nextgis.ru/',
    checkUrl: 'https://ooptaari.nextgis.ru/',
    description: 'Интерактивная карта ООПТ РФ, зеркало паспортов объектов (/node/:id), вложенные территории',
    type: 'http'
  },
  {
    id: 'osm_tiles',
    name: 'Тайлы карт OpenStreetMap',
    domain: 'tile.openstreetmap.org',
    url: 'https://tile.openstreetmap.org/',
    checkUrl: 'https://tile.openstreetmap.org/',
    description: 'Картографическая основа и тайловый сервер для интерактивного выбора и перемещения координат на карте',
    type: 'http'
  },
  {
    id: 'rusoir_grounds',
    name: 'Каталог природных территорий RusOIR',
    domain: 'rusoir.com',
    url: 'https://rusoir.com/',
    checkUrl: 'https://rusoir.com/api/search?q=%D0%93%D0%BE%D0%BC%D0%B5%D0%BB%D1%8C',
    description: 'Интеллектуальный поиск и резервный источник GPS-координат ООПТ России (резерв при блокировке Минприроды)',
    type: 'http'
  }
];

export async function checkSingleService(serviceDef) {
  const t0 = Date.now();
  const result = {
    id: serviceDef.id,
    name: serviceDef.name,
    domain: serviceDef.domain,
    url: serviceDef.url,
    description: serviceDef.description,
    status: 'down',
    code: null,
    latency: null,
    details: null,
    error: null,
    lastCheck: new Date().toISOString()
  };

  try {
    if (serviceDef.type === 'bot_core') {
      const uptimeSec = Math.floor(process.uptime());
      const hours = Math.floor(uptimeSec / 3600);
      const minutes = Math.floor((uptimeSec % 3600) / 60);
      const seconds = uptimeSec % 60;
      const mem = process.memoryUsage();
      const rssMb = Math.round(mem.rss / 1024 / 1024);
      result.status = 'up';
      result.code = 200;
      result.latency = Date.now() - t0;
      result.details = `Аптайм: ${hours}ч ${minutes}м ${seconds}с | RAM: ${rssMb} МБ | Node.js ${process.version}`;
    } else if (serviceDef.type === 'telegram_api') {
      if (tgClient && typeof tgClient.getMe === 'function') {
        const me = await tgClient.getMe();
        result.status = 'up';
        result.code = 200;
        result.latency = Date.now() - t0;
        result.details = `@${me.username || 'bot'} (ID: ${me.id})`;
      } else {
        const res = await axios.get('https://api.telegram.org/', {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        result.status = res.status >= 200 && res.status < 500 ? 'up' : 'down';
        result.code = res.status;
        result.latency = Date.now() - t0;
        result.details = 'Шлюз api.telegram.org доступен';
      }
    } else if (serviceDef.type === 'pota_api') {
      await potaApi.getSpots();
      result.status = 'up';
      result.code = 200;
      result.latency = Date.now() - t0;
    } else {
      const res = await axios.get(serviceDef.checkUrl || serviceDef.url, {
        timeout: 10000,
        proxy: false,
        httpsAgent: new https.Agent({ family: 4, autoSelectFamily: false, keepAlive: false }),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*'
        }
      });
      result.status = res.status >= 200 && res.status < 400 ? 'up' : 'down';
      result.code = res.status;
      result.latency = Date.now() - t0;
    }

    if (result.status === 'up' && result.latency > 3500) {
      result.status = 'degraded';
    }
  } catch (err) {
    result.latency = Date.now() - t0;
    result.status = 'down';
    result.code = err.response?.status || null;

    if (serviceDef.id === 'oopt_registry' && (err.code === 'ECONNABORTED' || err.message?.includes('timeout') || err.message?.includes('ECONNREFUSED'))) {
      result.error = 'Блокировка дата-центров (Ростелеком): доступ с хостингов ограничен (работает только с домашних/мобильных провайдеров РФ). Локальная база ООПТ (11 342 объекта) в боте работает автономно.';
    } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      result.error = 'Таймаут соединения (>10 сек): сервер перегружен или не отвечает';
    } else if (err.code === 'ECONNREFUSED') {
      result.error = 'Отказ в соединении (ECONNREFUSED): порт закрыт или сервис выключен';
    } else if (err.code === 'ENOTFOUND') {
      result.error = 'Ошибка DNS (ENOTFOUND): доменное имя не разрешается';
    } else if (err.response?.status === 403) {
      result.error = 'Доступ ограничен (HTTP 403 Forbidden / Cloudflare защита)';
    } else if (err.response?.status === 502 || err.response?.status === 503 || err.response?.status === 504) {
      result.error = `Сервер временно недоступен (HTTP ${err.response.status})`;
    } else {
      result.error = err.message || 'Ошибка подключения к внешнему серверу';
    }
  }

  return result;
}

export async function checkAllServices(force = false) {
  const now = Date.now();
  if (!force && cachedResults && (now - lastCheckTime < CACHE_TTL_MS)) {
    return cachedResults;
  }

  const results = await Promise.all(SERVICES.map(s => checkSingleService(s)));
  cachedResults = results;
  lastCheckTime = now;
  return results;
}

export async function checkServiceById(id) {
  const serviceDef = SERVICES.find(s => s.id === id);
  if (!serviceDef) return null;
  const res = await checkSingleService(serviceDef);
  if (cachedResults) {
    const idx = cachedResults.findIndex(s => s.id === id);
    if (idx !== -1) {
      cachedResults[idx] = res;
    }
  }
  return res;
}

export function getCachedServicesStatus() {
  return cachedResults;
}

export { SERVICES };

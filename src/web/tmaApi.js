import { Router } from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db/database.js';
import { potaApi } from '../api/potaApi.js';
import { tmaUserMiddleware, requireTmaAuth } from './tmaAuth.js';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ACTIVITY_CHANNEL_ID = process.env.ACTIVITY_CHANNEL_ID;
const ALLOWED_PREFIXES = (process.env.ALLOWED_PREFIXES || 'RU-,BY-,KZ-').split(',').map(p => p.trim());

// Regex validation per rule 2.4 in GEMINI.md
const baseCallsignRegex = /^([A-Z0-9]{1,4}\/)?([A-Z0-9]{1,3}[0-9][A-Z0-9]{1,5})(\/[A-Z0-9]{1,4})?$/;
const hasLetterRegex = /[A-Z]/;
const parkRegex = /^[A-Z0-9]{1,4}-\d{4,5}$/;
const VALID_MODES = ['SSB', 'CW', 'FT8', 'FT4', 'FM', 'AM', 'DIGI'];

// Cache buffers
let cachedSpots = [];
let lastSpotsFetchTime = 0;
const SPOTS_CACHE_TTL_MS = 15000; // 15 seconds cache to be respectful to api.pota.app

let cachedParks = [];
let lastParksFetchTime = 0;
const PARKS_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Program dictionary so failure in one country never wipes out others
const parksByProgram = {
  RU: [],
  BY: [],
  KZ: [],
};

// 1. Initial load from local fallback dataset so map NEVER starts empty or missing countries
try {
  const fallbackPath = path.resolve(__dirname, '../data/parks_fallback.json');
  if (fs.existsSync(fallbackPath)) {
    const rawFallback = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
    if (Array.isArray(rawFallback) && rawFallback.length > 0) {
      cachedParks = rawFallback;
      for (const p of rawFallback) {
        const prefix = (p.reference || '').substring(0, 3).toUpperCase();
        if (prefix === 'RU-') parksByProgram.RU.push(p);
        else if (prefix === 'BY-') parksByProgram.BY.push(p);
        else if (prefix === 'KZ-') parksByProgram.KZ.push(p);
      }
      console.log(`[TMA API] 🗺️ Initialized ${cachedParks.length} POTA parks from fallback (RU: ${parksByProgram.RU.length}, BY: ${parksByProgram.BY.length}, KZ: ${parksByProgram.KZ.length})`);
    }
  }
} catch (err) {
  console.warn('[TMA API] ⚠️ Could not load fallback parks:', err.message);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let isRefreshingParks = false;

/**
 * Periodically refresh POTA parks list for RU, BY, KZ from official API.
 * Uses sequential requests with polite 2s pause to prevent Cloudflare stream aborts.
 * Keeps existing cached parks if any single country request fails or times out.
 */
async function refreshParksFromApi() {
  if (isRefreshingParks) return;
  isRefreshingParks = true;

  try {
    const headers = {
      'User-Agent': 'RU-POTA-Bot/1.11.4 (Telegram Bot; Node.js)',
    };
    const programs = ['RU', 'BY', 'KZ'];
    let anyUpdated = false;

    for (let i = 0; i < programs.length; i++) {
      const prog = programs[i];
      if (i > 0) await sleep(2000); // Polite 2s delay between requests to prevent Cloudflare throttling

      try {
        const res = await axios.get(`https://api.pota.app/program/parks/${prog}`, { headers, timeout: 30000 });
        if (Array.isArray(res.data) && res.data.length > 0) {
          const mapped = res.data.map(p => ({
            reference: p.reference,
            name: p.name,
            lat: parseFloat(p.latitude) || 0,
            lon: parseFloat(p.longitude) || 0,
            grid: p.grid || '',
            region: p.locationDesc || '',
            website: p.website || '',
            activations: p.activations || 0,
            qsos: p.qsos || 0,
          })).filter(p => p.lat !== 0 && p.lon !== 0);

          if (mapped.length > 0) {
            parksByProgram[prog] = mapped;
            anyUpdated = true;
            console.log(`[TMA API] 🗺️ Refreshed ${prog} parks from API: ${mapped.length}`);
          }
        }
      } catch (err) {
        const reason = err.message || 'unknown error';
        console.warn(`[TMA API] ⚠️ Failed to refresh ${prog} parks (${reason}), preserving ${parksByProgram[prog]?.length || 0} existing parks`);
      }
    }

    if (anyUpdated) {
      cachedParks = [
        ...parksByProgram.RU,
        ...parksByProgram.BY,
        ...parksByProgram.KZ,
      ];
      lastParksFetchTime = Date.now();
      console.log(`[TMA API] 🗺️ Total cached POTA parks: ${cachedParks.length}`);

      // Try updating fallback file on disk asynchronously
      try {
        const fallbackPath = path.resolve(__dirname, '../data/parks_fallback.json');
        fs.writeFileSync(fallbackPath, JSON.stringify(cachedParks, null, 2), 'utf8');
      } catch (saveErr) {
        // Non-critical if filesystem is read-only
      }
    }
  } catch (err) {
    console.warn('[TMA API] ⚠️ Error during refreshParksFromApi:', err.message);
  } finally {
    isRefreshingParks = false;
  }
}

let cachedRaza = null;
let lastRazaFetchTime = 0;



const statsCache = new Map();
const STATS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache for stats

/**
 * Determine amateur radio band by frequency in kHz
 */
function getBandFromKHz(kHz) {
  const f = parseFloat(kHz);
  if (isNaN(f)) return 'Другой';
  if (f >= 1800 && f <= 2000) return '160m';
  if (f >= 3500 && f <= 3800) return '80m';
  if (f >= 7000 && f <= 7300) return '40m';
  if (f >= 10100 && f <= 10150) return '30m';
  if (f >= 14000 && f <= 14350) return '20m';
  if (f >= 18068 && f <= 18168) return '17m';
  if (f >= 21000 && f <= 21450) return '15m';
  if (f >= 24890 && f <= 24990) return '12m';
  if (f >= 28000 && f <= 29700) return '10m';
  if (f >= 144000 && f <= 148000) return '2m';
  if (f >= 430000 && f <= 440000) return '70cm';
  return 'Другой';
}

function parseSpotTimestamp(dateString) {
  if (!dateString) return 0;
  const str = (dateString.endsWith('Z') || dateString.includes('+') || (dateString.length > 10 && dateString.substring(10).includes('-')))
    ? dateString
    : `${dateString}Z`;
  const t = new Date(str).getTime();
  return isNaN(t) ? 0 : t;
}

function getDiffMinutes(dateString) {
  if (!dateString) return 99999;
  const t = parseSpotTimestamp(dateString);
  if (!t) return 99999;
  const now = Date.now();
  return Math.max(0, Math.floor((now - t) / (60 * 1000)));
}

/**
 * Format relative time (e.g. "3 мин назад")
 */
function formatTimeAgo(dateString) {
  if (!dateString) return '';
  const diffMinutes = getDiffMinutes(dateString);

  if (diffMinutes <= 1) return 'только что';
  if (diffMinutes < 60) return `${diffMinutes} мин назад`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} ч назад`;
  return `${Math.floor(diffHours / 24)} д назад`;
}


/**
 * Create Telegram Mini App Express Router
 * @param {Object} telegramClient 
 * @returns {Router}
 */
export function createTmaRouter(telegramClient) {
  const router = Router();

  // Background refresh of POTA parks list (delayed by 10 minutes to allow clean bot startup)
  setTimeout(() => {
    refreshParksFromApi().catch(() => {});
  }, 10 * 60 * 1000);

  // Extract TMA user identity (sets req.telegramUser or null for guests)
  router.use(tmaUserMiddleware);

  // ==========================================
  // 1. GET /api/tma/me - Operator Profile
  // ==========================================
  router.get('/me', async (req, res) => {
    try {
      const tgUser = req.telegramUser;
      const dbUser = req.dbUser;

      // Guest / unauthenticated visitor outside Telegram
      if (!tgUser || !dbUser) {
        return res.json({
          user: null,
          activeSpot: null,
          stats: null,
          subscriptionsCount: 0,
          isGuest: true,
        });
      }

      let activeSpot = null;
      if (dbUser.last_spot_data) {
        try {
          activeSpot = JSON.parse(dbUser.last_spot_data);
        } catch (e) {
          activeSpot = null;
        }
      }

      // Fetch or retrieve cached POTA stats
      let stats = {
        activations: 0,
        uniqueParks: 0,
        qsos: 0,
        workedParks: 0,
        dxcc: 0,
        confirmed: 0,
      };

      if (dbUser.callsign && dbUser.status === 'approved') {
        const cleanCall = dbUser.callsign.split('/')[0].toUpperCase();
        const cached = statsCache.get(cleanCall);
        const now = Date.now();

        if (cached && (now - cached.timestamp) < STATS_CACHE_TTL_MS) {
          stats = cached.data;
        } else {
          try {
            const remoteStats = await potaApi.getStats(cleanCall);
              stats = {
                activations: remoteStats.stats?.activator?.activations || remoteStats.total_activations || 0,
                uniqueParks: remoteStats.stats?.activator?.parks || remoteStats.unique_parks_activated || 0,
                qsos: remoteStats.stats?.activator?.qsos || remoteStats.total_qsos || 0,
                workedParks: remoteStats.stats?.hunter?.parks || remoteStats.unique_parks_hunted || 0,
                dxcc: remoteStats.stats?.hunter?.qsos || remoteStats.dxcc_count || 0,
                confirmed: remoteStats.stats?.awards || remoteStats.confirmed_qsos || 0,
              };
              statsCache.set(cleanCall, { data: stats, timestamp: now });
          } catch (e) {
            // Stats fetch warning - fallback to default
          }
        }
      }

      // Count subscriptions
      const subsCount = db.prepare('SELECT COUNT(*) as count FROM subscriptions WHERE telegram_id = ?').get(tgUser.id)?.count || 0;

      res.json({
        user: {
          id: tgUser.id,
          first_name: tgUser.first_name,
          last_name: tgUser.last_name || '',
          username: tgUser.username || '',
          photo_url: tgUser.photo_url || null,
          callsign: dbUser.callsign,
          status: dbUser.status,
          isMock: Boolean(tgUser.isMock),
        },
        activeSpot,
        stats,
        subscriptionsCount: subsCount,
      });
    } catch (err) {
      console.error('[TMA API] Error in /me:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ==========================================
  // 2. GET /api/tma/spots - Live Cluster Spots
  // ==========================================
  router.get('/spots', async (req, res) => {
    try {
      const scope = (req.query.scope || 'ru').toLowerCase(); // 'ru' | 'world'
      const rawBand = (req.query.band || 'Все').trim();
      const isAllBands = !rawBand || rawBand.toLowerCase() === 'все' || rawBand.toLowerCase() === 'all';

      const rawMode = (req.query.mode || 'Все').trim();
      const isAllModes = !rawMode || rawMode.toLowerCase() === 'все' || rawMode.toLowerCase() === 'all';
      const mode = rawMode.toUpperCase();

      const search = (req.query.search || '').toUpperCase().trim();


      const now = Date.now();
      if (!cachedSpots.length || (now - lastSpotsFetchTime) > SPOTS_CACHE_TTL_MS) {
        try {
          const rawSpots = await potaApi.getSpots();
          if (Array.isArray(rawSpots)) {
            cachedSpots = rawSpots;
            lastSpotsFetchTime = now;
          }
        } catch (e) {
          console.warn('[TMA API] Could not refresh POTA spots, using existing cache:', e.message);
        }
      }
      // console.log(`[TMA API /spots] scope=${scope}, cachedSpots=${cachedSpots.length}`);


      // Also get recent local spots from SQLite (past 45 minutes)
      const localSpots = db.prepare(`
        SELECT id, callsign, reference, frequency, mode, comment, source, created_at, msg_id 
        FROM spots 
        WHERE created_at >= datetime('now', '-45 minutes') 
        ORDER BY created_at DESC LIMIT 50
      `).all();

      // Transform raw POTA spots
      const formattedPotaSpots = cachedSpots.map((s, idx) => {
        const ref = s.reference || '';
        const isRu = ALLOWED_PREFIXES.some(prefix => ref.startsWith(prefix));
        const freqKHz = parseFloat(s.frequency || 0);
        const freqMHz = (freqKHz / 1000).toFixed(3);
        const calculatedBand = getBandFromKHz(freqKHz);

        let flag = '🌐';
        if (ref.startsWith('RU-')) flag = '🇷🇺';
        else if (ref.startsWith('BY-')) flag = '🇧🇾';
        else if (ref.startsWith('KZ-')) flag = '🇰🇿';
        else if (ref.startsWith('UA-')) flag = '🇺🇦';
        else if (ref.startsWith('DE-')) flag = '🇩🇪';
        else if (ref.startsWith('US-') || ref.startsWith('K-')) flag = '🇺🇸';

        return {
          id: s.spotId || `pota-${idx}`,
          spotId: s.spotId,
          callsign: s.activator || '',
          country: flag,
          park: ref,
          parkName: s.name || '',
          location: s.locationDesc || '',
          freq: freqMHz,
          freqKHz,
          mode: s.mode || 'SSB',
          band: calculatedBand,
          spotter: s.spotter || '',
          comment: s.comments || '',
          timeAgo: formatTimeAgo(s.spotTime),
          diffMinutes: getDiffMinutes(s.spotTime),
          timestamp: parseSpotTimestamp(s.spotTime),
          rawTime: s.spotTime,
          isRu,
        };
      });

      // Transform local spots
      const formattedLocalSpots = localSpots.map(s => {
        const freqKHz = parseFloat(s.frequency || 0);
        const freqMHz = (freqKHz > 1000 ? freqKHz / 1000 : freqKHz).toFixed(3);
        const calculatedBand = getBandFromKHz(freqKHz > 1000 ? freqKHz : freqKHz * 1000);
        const isRu = ALLOWED_PREFIXES.some(prefix => s.reference.startsWith(prefix));

        return {
          id: `local-${s.id}`,
          spotId: null,
          callsign: s.callsign,
          country: '🇷🇺',
          park: s.reference,
          parkName: 'Локальный спот',
          location: 'RU-POTA Bot',
          freq: freqMHz,
          freqKHz: freqKHz > 1000 ? freqKHz : freqKHz * 1000,
          mode: s.mode || 'SSB',
          band: calculatedBand,
          spotter: 'RU-POTA TMA',
          comment: s.comment || '',
          timeAgo: formatTimeAgo(s.created_at),
          diffMinutes: getDiffMinutes(s.created_at),
          timestamp: parseSpotTimestamp(s.created_at),
          rawTime: s.created_at,
          isRu,
        };
      });

      // Combine, sort NEWEST FIRST (descending timestamp), and deduplicate by callsign + park
      const combined = [...formattedLocalSpots, ...formattedPotaSpots];
      combined.sort((a, b) => b.timestamp - a.timestamp);

      const seen = new Set();
      const allSpots = [];

      for (const s of combined) {
        const key = `${s.callsign}-${s.park}`;
        if (!seen.has(key)) {
          seen.add(key);
          allSpots.push(s);
        }
      }


      // Filter
      const filtered = allSpots.filter(s => {
        if (scope === 'ru' && !s.isRu) return false;
        if (!isAllBands && s.band !== rawBand) return false;
        if (!isAllModes && s.mode !== mode) return false;
        if (search) {
          return (
            s.callsign.toUpperCase().includes(search) ||
            s.park.toUpperCase().includes(search) ||
            s.spotter.toUpperCase().includes(search) ||
            s.parkName.toUpperCase().includes(search)
          );
        }
        return true;
      });

      res.json({
        total: filtered.length,
        spots: filtered,
      });
    } catch (err) {
      console.error('[TMA API] Error in /spots:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ==========================================
  // 2.1. GET /api/tma/parks - POTA Parks for Map
  // ==========================================
  router.get('/parks', async (req, res) => {
    try {
      const now = Date.now();
      if (!cachedParks.length || now - lastParksFetchTime > PARKS_REFRESH_INTERVAL_MS) {
        if (cachedParks.length > 0) {
          // Asynchronous refresh in background - do not block user response
          refreshParksFromApi().catch(() => {});
        } else {
          await refreshParksFromApi();
        }
      }

      const allParks = cachedParks || [];

      // Ensure cachedSpots is refreshed
      if (!cachedSpots.length || (now - lastSpotsFetchTime) > SPOTS_CACHE_TTL_MS) {
        try {
          const rawSpots = await potaApi.getSpots();
          if (Array.isArray(rawSpots)) {
            cachedSpots = rawSpots;
            lastSpotsFetchTime = now;
          }
        } catch (e) {}
      }

      // Cross reference active spots from memory and SQLite (only active within 45 minutes)
      const activeSpotsMap = new Map();
      if (Array.isArray(cachedSpots)) {
        for (const s of cachedSpots) {
          if (s.reference && getDiffMinutes(s.spotTime) <= 45) {
            activeSpotsMap.set(s.reference.toUpperCase(), s);
          }
        }
      }

      // Also check local SQLite active spots within last 45 minutes
      const localActive = db.prepare(`
        SELECT reference, callsign, frequency, mode, comment, created_at 
        FROM spots 
        WHERE created_at >= datetime('now', '-45 minutes')
        ORDER BY created_at ASC
      `).all();

      for (const ls of localActive) {
        if (ls.reference && getDiffMinutes(ls.created_at) <= 45) {
          activeSpotsMap.set(ls.reference.toUpperCase(), {
            activator: ls.callsign,
            frequency: ls.frequency,
            mode: ls.mode,
            comments: ls.comment,
            spotTime: ls.created_at,
          });
        }
      }

      const search = (req.query.search || '').trim().toUpperCase();
      const activeOnly = req.query.activeOnly === 'true';

      const mapped = allParks.map(p => {
        const spot = activeSpotsMap.get(p.reference.toUpperCase());
        const isActive = Boolean(spot);
        const freqKHz = spot ? parseFloat(spot.frequency || 0) : 0;
        const freqMHz = freqKHz > 1000 ? (freqKHz / 1000).toFixed(3) : (freqKHz || 0);

        return {
          ...p,
          isActive,
          activeStation: isActive ? `${spot.activator} (${freqMHz} MHz ${spot.mode})` : null,
          activeCallsign: isActive ? spot.activator : null,
          activeFreq: isActive ? freqMHz : null,
          activeMode: isActive ? spot.mode : null,
        };
      });

      const filtered = mapped.filter(p => {
        if (activeOnly && !p.isActive) return false;
        if (search) {
          return (
            p.reference.toUpperCase().includes(search) ||
            p.name.toUpperCase().includes(search) ||
            p.region.toUpperCase().includes(search)
          );
        }
        return true;
      });

      res.json({
        total: filtered.length,
        activeCount: filtered.filter(p => p.isActive).length,
        parks: filtered,
      });
    } catch (err) {
      console.error('[TMA API] Error in /parks:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ==========================================
  // 2.2. GET /api/tma/raza - RAZA Zones from R1CF
  // ==========================================
  router.get('/raza', async (req, res) => {
    try {
      const now = Date.now();
      if (!cachedRaza || now - lastRazaFetchTime > 24 * 60 * 60 * 1000) {
        try {
          const wfsUrl = 'https://map.r1cf.ru/geoserver/cite/wfs?SERVICE=WFS&REQUEST=GetFeature&TypeName=RAZAX&VERSION=1.1.0&outputFormat=application/json';
          const r = await axios.get(wfsUrl, { timeout: 20000 });
          if (r.data && Array.isArray(r.data.features)) {
            cachedRaza = r.data.features.map(f => {
              const p = f.properties || {};
              return {
                reference: p.desc3 || '',
                name: p.name || '',
                lat: parseFloat(p.lat) || 0,
                lon: parseFloat(p.lon) || 0,
                link: p.link || '',
                type: 'raza',
              };
            }).filter(z => z.lat !== 0 && z.lon !== 0 && z.reference);
            lastRazaFetchTime = now;
            console.log(`[TMA API] Cached ${cachedRaza.length} RAZA zones from R1CF`);
          }
        } catch (e) {
          console.warn('[TMA API] Failed to fetch RAZA from R1CF WFS:', e.message);
        }
      }

      const search = (req.query.search || '').trim().toUpperCase();
      let list = cachedRaza || [];
      if (search) {
        list = list.filter(z => 
          z.reference.toUpperCase().includes(search) || 
          z.name.toUpperCase().includes(search)
        );
      }

      res.json({
        total: list.length,
        zones: list,
      });
    } catch (err) {
      console.error('[TMA API] Error in /raza:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ==========================================
  // 2.3. GET /api/tma/airfields - Search Airfields (RAFA)
  // ==========================================
  router.get('/airfields', async (req, res) => {
    try {
      const query = (req.query.q || '').trim().toUpperCase();
      if (!query || query.length < 2) {
        return res.json({ airfields: [] });
      }

      const clean = query.replace(/'/g, "''");
      const cql = `ICAO LIKE '%${clean}%' OR NAME LIKE '%${clean}%'`;
      const wfsUrl = `https://map.r1cf.ru/geoserver/cite/wfs?SERVICE=WFS&REQUEST=GetFeature&TypeName=aopax&VERSION=1.1.0&outputFormat=application/json&maxFeatures=10&CQL_FILTER=${encodeURIComponent(cql)}`;

      const r = await axios.get(wfsUrl, { timeout: 15000 });
      let list = [];
      if (r.data && Array.isArray(r.data.features)) {
        list = r.data.features.map(f => {
          const p = f.properties || {};
          return {
            icao: p.ICAO || '',
            name: p.NAME || '',
            type: p.TYPE || 'Аэродром',
            city: p.CITY || '',
            lat: parseFloat(p.Latitude) || 0,
            lon: parseFloat(p.Longitude) || 0,
          };
        }).filter(a => a.lat !== 0 && a.lon !== 0 && a.icao);
      }

      res.json({ airfields: list });
    } catch (err) {
      console.error('[TMA API] Error in /airfields:', err.message);
      res.status(500).json({ airfields: [] });
    }
  });

  // ==========================================
  // 2.4. GET /api/tma/lookup/callsign/:callsign
  // ==========================================
  router.get('/lookup/callsign/:callsign', async (req, res) => {
    try {
      const callsign = (req.params.callsign || '').trim().toUpperCase();
      if (!callsign) {
        return res.status(400).json({ error: 'Callsign is required' });
      }

      const tgUser = req.telegramUser;
      const cleanCall = callsign.split('/')[0];

      // Check cache first
      let profileData = null;
      const cached = statsCache.get(cleanCall);
      const now = Date.now();

      if (cached && (now - cached.timestamp) < STATS_CACHE_TTL_MS && cached.fullProfile) {
        profileData = cached.fullProfile;
      } else {
        try {
          const raw = await potaApi.getStats(cleanCall);
          profileData = {
            callsign: raw.callsign || cleanCall,
            name: raw.name || '',
            qth: raw.qth || '',
            grid: raw.grid || '',
            activator: {
              activations: raw.stats?.activator?.activations || 0,
              parks: raw.stats?.activator?.parks || 0,
              qsos: raw.stats?.activator?.qsos || 0,
            },
            hunter: {
              parks: raw.stats?.hunter?.parks || 0,
              qsos: raw.stats?.hunter?.qsos || 0,
            },
            awards: raw.stats?.awards || 0,
          };
          statsCache.set(cleanCall, { 
            data: {
              activations: profileData.activator.activations,
              uniqueParks: profileData.activator.parks,
              qsos: profileData.activator.qsos,
              workedParks: profileData.hunter.parks,
              dxcc: profileData.hunter.qsos,
              confirmed: profileData.awards,
            }, 
            fullProfile: profileData,
            timestamp: now 
          });
        } catch (e) {
          return res.status(404).json({ error: `Позывной ${cleanCall} не найден в базе POTA.` });
        }
      }

      // Check subscription
      const isSubscribed = Boolean(tgUser && db.prepare(
        'SELECT 1 FROM subscriptions WHERE telegram_id = ? AND type = ? AND target = ?'
      ).get(tgUser.id, 'callsign', cleanCall));

      res.json({
        ...profileData,
        isSubscribed,
      });
    } catch (err) {
      console.error('[TMA API] Error in /lookup/callsign:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ==========================================
  // 2.5. GET /api/tma/lookup/park/:ref
  // ==========================================
  router.get('/lookup/park/:ref', async (req, res) => {
    try {
      const ref = (req.params.ref || '').trim().toUpperCase();
      if (!ref) {
        return res.status(400).json({ error: 'Park reference is required' });
      }

      const tgUser = req.telegramUser;

      // Fetch park info from POTA
      let parkData = null;
      try {
        const [park, leaderboard] = await Promise.allSettled([
          potaApi.getPark(ref),
          potaApi.getParkLeaderboard(ref)
        ]);

        if (park.status === 'fulfilled' && park.value && (park.value.name || park.value.reference)) {
          const p = park.value;
          const lb = leaderboard.status === 'fulfilled' ? leaderboard.value : {};
          const topAct = lb?.activations?.[0];

          parkData = {
            reference: p.reference || ref,
            name: p.name || 'Национальный парк',
            lat: parseFloat(p.latitude) || 0,
            lon: parseFloat(p.longitude) || 0,
            grid: p.grid || '',
            region: p.locationDesc || '',
            activations: p.activations || 0,
            qsos: p.qsos || 0,
            attempts: p.attempts || 0,
            topActivator: topAct ? `${topAct.callsign} (${topAct.count})` : null,
          };
        }
      } catch (e) {}

      // Fallback to cachedParks if direct POTA endpoint fails
      if (!parkData && cachedParks) {
        const found = cachedParks.find(p => p.reference.toUpperCase() === ref);
        if (found) {
          parkData = { ...found };
        }
      }

      if (!parkData) {
        return res.status(404).json({ error: `Парк с кодом ${ref} не найден.` });
      }

      // Check if currently active in spots (within last 45 minutes)
      let activeSpot = null;
      if (Array.isArray(cachedSpots)) {
        activeSpot = cachedSpots.find(s => s.reference?.toUpperCase() === ref && getDiffMinutes(s.spotTime) <= 45);
      }
      if (!activeSpot) {
        const local = db.prepare(`
          SELECT callsign, frequency, mode, comment, created_at 
          FROM spots 
          WHERE reference = ? AND created_at >= datetime('now', '-45 minutes')
          ORDER BY created_at DESC LIMIT 1
        `).get(ref);
        if (local && getDiffMinutes(local.created_at) <= 45) {
          activeSpot = {
            activator: local.callsign,
            frequency: local.frequency,
            mode: local.mode,
            comments: local.comment,
          };
        }
      }

      // Check subscription
      const isSubscribed = Boolean(tgUser && db.prepare(
        'SELECT 1 FROM subscriptions WHERE telegram_id = ? AND type = ? AND target = ?'
      ).get(tgUser.id, 'park', ref));

      res.json({
        ...parkData,
        isActive: Boolean(activeSpot),
        activeSpot: activeSpot ? {
          callsign: activeSpot.activator,
          freq: (parseFloat(activeSpot.frequency) > 1000 ? (parseFloat(activeSpot.frequency)/1000).toFixed(3) : activeSpot.frequency),
          mode: activeSpot.mode,
        } : null,
        isSubscribed,
      });
    } catch (err) {
      console.error('[TMA API] Error in /lookup/park:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });




  // ==========================================
  // 3. POST /api/tma/spots - Publish / Respot
  // ==========================================
  router.post('/spots', requireTmaAuth, async (req, res) => {
    try {
      const dbUser = req.dbUser;
      const tgUser = req.telegramUser;

      if (!dbUser || dbUser.status !== 'approved' || !dbUser.callsign) {
        return res.status(403).json({
          error: 'Только подтвержденные радиолюбители с позывным могут публиковать споты.',
          code: 'FORBIDDEN_CALLSIGN_REQUIRED'
        });
      }

      let { reference, frequency, mode, comment } = req.body;

      if (!reference || !frequency || !mode) {
        return res.status(400).json({ error: 'Укажите парк, частоту и модуляцию.' });
      }

      reference = reference.trim().toUpperCase();
      if (!parkRegex.test(reference)) {
        return res.status(400).json({ error: 'Неверный формат парка. Пример: RU-0073' });
      }

      mode = mode.trim().toUpperCase();
      if (!VALID_MODES.includes(mode)) {
        return res.status(400).json({ error: `Недопустимая модуляция. Допустимы: ${VALID_MODES.join(', ')}` });
      }

      // Frequency normalization: convert to kHz string (e.g. "14144" or "14.144" -> 14144)
      let freqNum = parseFloat(String(frequency).replace(',', '.'));
      if (isNaN(freqNum) || freqNum <= 0) {
        return res.status(400).json({ error: 'Некорректная частота.' });
      }
      if (freqNum < 1000) {
        freqNum = Math.round(freqNum * 1000); // 14.144 MHz -> 14144 kHz
      }

      const freqMHz = (freqNum / 1000).toFixed(3);
      comment = (comment || '').trim();

      // Resolve Park Name
      let parkName = reference;
      try {
        const parkInfo = await potaApi.getPark(reference);
        if (parkInfo && parkInfo.name) {
          parkName = parkInfo.name;
        }
      } catch (e) {
        // Safe fallback
      }

      const spotData = {
        callsign: dbUser.callsign,
        reference,
        parkName,
        frequency: String(freqNum),
        freqMHz,
        mode,
        comment,
        source: 'local',
        startedAt: new Date().toISOString(),
      };

      // 1. Save in SQLite
      const insertResult = db.prepare(`
        INSERT INTO spots (callsign, reference, frequency, mode, comment, source)
        VALUES (?, ?, ?, ?, ?, 'local')
      `).run(dbUser.callsign, reference, String(freqNum), mode, comment);

      // 2. Broadcast to Telegram Activity Channel if available
      let channelMsgId = null;
      if (telegramClient && ACTIVITY_CHANNEL_ID) {
        try {
          const actLink = `<a href="https://next.pota.app/profile/${dbUser.callsign.split('/')[0]}">${dbUser.callsign}</a>`;
          const refLink = `<a href="https://next.pota.app/park/${reference}">${reference} (${parkName})</a>`;
          const msg = `🌲 <b>НОВЫЙ СПОТ ИЗ MINI APP</b>\n` +
                      `📻 <b>${actLink}</b> @ 🏞️ <b>${refLink}</b>\n` +
                      `⚙️ Частота: <b>${freqMHz} MHz</b> | <b>${mode}</b>\n` +
                      (comment ? `📝 <i>${comment}</i>\n` : '') +
                      `\n📱 <i>Отправлено через RU-POTA Hub</i>`;

          let channelId = ACTIVITY_CHANNEL_ID;
          if (channelId.includes('t.me/')) {
            channelId = '@' + channelId.split('t.me/')[1].replace('/', '');
          }

          const sent = await telegramClient.sendMessage(channelId, msg, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
          });
          channelMsgId = sent.message_id;

          // Update msg_id in spots table
          db.prepare('UPDATE spots SET msg_id = ? WHERE id = ?').run(channelMsgId, insertResult.lastInsertRowid);
        } catch (e) {
          console.warn('[TMA API] Channel broadcast error:', e.message);
        }
      }

      // 3. Update user's active spot in users table
      db.prepare(`
        UPDATE users 
        SET last_spot_data = ?, last_spot_msg_id = ? 
        WHERE telegram_id = ?
      `).run(JSON.stringify(spotData), channelMsgId, tgUser.id);

      // 4. Send to official POTA cluster (if not mocked)
      try {
        await potaApi.postSpot({
          activator: dbUser.callsign,
          spotter: dbUser.callsign,
          reference,
          frequency: String(freqNum),
          mode,
          comments: comment,
        });
      } catch (e) {
        console.warn('[TMA API] Post to POTA API cluster warning:', e.message);
      }

      // 5. Notify Subscribers of this operator and park
      if (telegramClient) {
        try {
          const cleanCall = dbUser.callsign.split('/')[0].toUpperCase();
          const subscribers = db.prepare(`
            SELECT DISTINCT telegram_id FROM subscriptions 
            WHERE (type = 'callsign' AND UPPER(target) = ?)
               OR (type = 'park' AND UPPER(target) = ?)
          `).all(cleanCall, reference);

          for (const sub of subscribers) {
            if (sub.telegram_id === tgUser.id) continue;
            const alertMsg = `🚨 <b>Спот по вашей подписке!</b>\n\n` +
                             `📻 Оператор: <b>${dbUser.callsign}</b>\n` +
                             `🏞️ Парк: <b>${reference}</b> (${parkName})\n` +
                             `⚙️ Частота: <b>${freqMHz} MHz</b> (${mode})\n` +
                             (comment ? `📝 ${comment}\n` : '');
            telegramClient.sendMessage(sub.telegram_id, alertMsg, { parse_mode: 'HTML' }).catch(() => {});
          }
        } catch (e) {
          console.warn('[TMA API] Subscriber notification warning:', e.message);
        }
      }

      res.json({
        success: true,
        message: 'Спот успешно опубликован!',
        activeSpot: spotData,
      });
    } catch (err) {
      console.error('[TMA API] Error publishing spot:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // 4. POST /api/tma/spots/qrt - Finish Session
  // ==========================================
  router.post('/spots/qrt', requireTmaAuth, async (req, res) => {
    try {
      const tgUser = req.telegramUser;

      db.prepare(`
        UPDATE users 
        SET last_spot_data = NULL, last_spot_msg_id = NULL 
        WHERE telegram_id = ?
      `).run(tgUser.id);

      console.log(`[TMA API] Operator ${tgUser.id} went QRT`);

      res.json({
        success: true,
        message: 'Сессия в эфире завершена (QRT). Спасибо за активацию! 73 & 44',
      });
    } catch (err) {
      console.error('[TMA API] Error in QRT:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ==========================================
  // 5. GET /api/tma/subscriptions - Get Subs
  // ==========================================
  router.get('/subscriptions', requireTmaAuth, (req, res) => {
    try {
      const tgUser = req.telegramUser;
      const userRecord = db.prepare('SELECT notifications_enabled FROM users WHERE telegram_id = ?').get(tgUser.id);
      const notificationsEnabled = userRecord ? Boolean(userRecord.notifications_enabled ?? 1) : true;

      const rows = db.prepare(`
        SELECT id, type, target, target_name, created_at 
        FROM subscriptions 
        WHERE telegram_id = ? 
        ORDER BY created_at DESC
      `).all(tgUser.id);

      const callsigns = rows.filter(r => r.type === 'callsign');
      const parks = rows.filter(r => r.type === 'park');

      res.json({
        callsigns,
        parks,
        total: rows.length,
        notifications_enabled: notificationsEnabled,
      });
    } catch (err) {
      console.error('[TMA API] Error fetching subscriptions:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ==========================================
  // 6. POST /api/tma/subscriptions/toggle-alerts
  // ==========================================
  router.post('/subscriptions/toggle-alerts', requireTmaAuth, async (req, res) => {
    try {
      const tgUser = req.telegramUser;
      const { enabled } = req.body;
      const val = enabled ? 1 : 0;
      db.prepare('UPDATE users SET notifications_enabled = ? WHERE telegram_id = ?').run(val, tgUser.id);
      console.log(`[TMA API] Operator ${tgUser.id} toggled DM alerts to: ${val === 1 ? 'ON' : 'OFF'}`);

      // Interactive Telegram notification right in user's DM
      if (telegramClient) {
        try {
          const alertMsg = val === 1
            ? '🔔 <b>Оповещения в ЛС включены!</b>\n\nБот снова будет присылать вам мгновенные сообщения о спотах ваших избранных позывных и парков POTA.\n\n<i>Настроить подписки можно в приложении или командой /sub.</i>'
            : '🔕 <b>Оповещения в ЛС временно отключены</b>\n\nБот не будет беспокоить вас сообщениями в ЛС. Все ваши подписки сохранены.\n\n<i>Включить обратно можно в приложении или в меню /sub.</i>';

          await telegramClient.sendMessage(tgUser.id, alertMsg, { parse_mode: 'HTML' });
        } catch (tgErr) {
          console.warn('[TMA API] Could not send DM alert notification to user:', tgErr.message);
        }
      }

      res.json({ success: true, notifications_enabled: val === 1 });
    } catch (err) {
      console.error('[TMA API] Error toggling alerts:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });


  // ==========================================
  // 7. POST /api/tma/subscriptions - Add Sub
  // ==========================================
  router.post('/subscriptions', requireTmaAuth, async (req, res) => {
    try {
      const tgUser = req.telegramUser;
      let { type, target } = req.body;

      if (!type || !target) {
        return res.status(400).json({ error: 'Укажите тип подписки (callsign / park) и цель.' });
      }

      type = type.toLowerCase();
      target = target.trim().toUpperCase();

      let targetName = null;

      if (type === 'callsign') {
        if (!baseCallsignRegex.test(target) || !hasLetterRegex.test(target)) {
          return res.status(400).json({ error: 'Некорректный радиолюбительский позывной. Пример: R9OGL' });
        }
        
        // Try resolve operator's real name from POTA API (same as bot's subWizard)
        try {
          const cleanCall = target.split('/')[0].toUpperCase();
          const stats = await potaApi.getStats(cleanCall);
          if (stats && stats.name) {
            targetName = stats.name;
          } else {
            targetName = 'Оператор POTA';
          }
        } catch (e) {
          targetName = 'Оператор POTA';
        }
      } else if (type === 'park') {
        if (!target.startsWith('RU-') && !target.includes('-')) {
          target = `RU-${target}`;
        }
        if (!parkRegex.test(target)) {
          return res.status(400).json({ error: 'Некорректный номер парка. Пример: RU-0073' });
        }
        // Try resolve park name from POTA API
        try {
          const park = await potaApi.getPark(target);
          if (park && park.name) {
            targetName = park.name;
          }
        } catch (e) {
          targetName = 'Заповедник POTA';
        }
      } else {
        return res.status(400).json({ error: 'Недопустимый тип подписки. Допустимо: callsign или park.' });
      }


      // Check for limit (e.g. max 50 subscriptions)
      const count = db.prepare('SELECT COUNT(*) as c FROM subscriptions WHERE telegram_id = ?').get(tgUser.id)?.c || 0;
      if (count >= 50) {
        return res.status(400).json({ error: 'Достигнут лимит подписок (максимум 50).' });
      }

      const stmt = db.prepare(`
        INSERT INTO subscriptions (telegram_id, type, target, target_name)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(telegram_id, type, target) DO UPDATE SET target_name = excluded.target_name
      `);

      const result = stmt.run(tgUser.id, type, target, targetName);

      res.json({
        success: true,
        subscription: {
          id: result.lastInsertRowid,
          type,
          target,
          target_name: targetName,
        }
      });
    } catch (err) {
      console.error('[TMA API] Error creating subscription:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // 7. DELETE /api/tma/subscriptions/:id
  // ==========================================
  router.delete('/subscriptions/:id', requireTmaAuth, (req, res) => {
    try {
      const tgUser = req.telegramUser;
      const subId = parseInt(req.params.id, 10);

      const result = db.prepare('DELETE FROM subscriptions WHERE id = ? AND telegram_id = ?').run(subId, tgUser.id);
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Подписка не найдена' });
      }

      res.json({ success: true, message: 'Подписка удалена' });
    } catch (err) {
      console.error('[TMA API] Error deleting subscription:', err.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ==========================================
  // 8. POST /api/tma/callsign/request
  // ==========================================
  router.post('/callsign/request', requireTmaAuth, async (req, res) => {
    try {
      const tgUser = req.telegramUser;
      let { newCallsign } = req.body;

      if (!newCallsign) {
        return res.status(400).json({ error: 'Укажите позывной' });
      }

      newCallsign = newCallsign.trim().toUpperCase();
      if (!baseCallsignRegex.test(newCallsign) || !hasLetterRegex.test(newCallsign)) {
        return res.status(400).json({ error: 'Некорректный формат позывного. Пример: R9OGL' });
      }

      // Upsert into users table with pending status and reset reject_reason
      db.prepare(`
        INSERT INTO users (telegram_id, callsign, status, reject_reason)
        VALUES (?, ?, 'pending', NULL)
        ON CONFLICT(telegram_id) DO UPDATE SET callsign = excluded.callsign, status = 'pending', reject_reason = NULL
      `).run(tgUser.id, newCallsign);

      console.log(`[TMA API] Callsign change request from user ${tgUser.id}: ${newCallsign}`);

      // Notify Admin via Telegram with interactive approve/reject buttons
      const adminId = process.env.ADMIN_ID;
      if (adminId && telegramClient) {
        try {
          const userLink = tgUser.username ? `@${tgUser.username}` : `<a href="tg://user?id=${tgUser.id}">${tgUser.first_name || 'пользователь'}</a>`;
          await telegramClient.sendMessage(
            adminId,
            `🔔 <b>Новая заявка на модерацию (из Mini App)!</b>\nПозывной: <b>${newCallsign}</b>\nОт: ${userLink}\nID: <code>${tgUser.id}</code>\n\n👉 Выберите действие ниже или зайдите в <a href="https://pota.r9o.ru/">админ-панель</a>.`,
            {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✅ Одобрить', callback_data: `admin_appr:${tgUser.id}` },
                    { text: '❌ Отклонить', callback_data: `admin_rej:${tgUser.id}` }
                  ]
                ]
              }
            }
          );
        } catch (adminErr) {
          console.error('[TMA API] Failed to notify admin about callsign request:', adminErr.message);
        }
      }

      res.json({
        success: true,
        message: `Заявка на позывной ${newCallsign} отправлена администраторам. Ожидайте подтверждения.`
      });
    } catch (err) {
      console.error('[TMA API] Error in callsign request:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

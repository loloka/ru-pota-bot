import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');
const dbDir = path.join(projectRoot, 'data');

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(path.join(dbDir, 'pota.db'));
db.pragma('journal_mode = WAL');

// Register Unicode-aware lowercase, uppercase, and LIKE functions for SQLite.
// Default SQLite LIKE / lower / upper only support ASCII, which breaks Cyrillic / case-insensitive search.
db.function('lower', { deterministic: true }, (str) => {
  return typeof str === 'string' ? str.toLowerCase() : str;
});

db.function('upper', { deterministic: true }, (str) => {
  return typeof str === 'string' ? str.toUpperCase() : str;
});

db.function('like', { deterministic: true, varargs: true }, (pattern, str, escapeChar) => {
  if (typeof pattern !== 'string' || typeof str !== 'string') return 0;
  const p = pattern.toLowerCase();
  const s = str.toLowerCase();

  // Fast paths for standard wildcards without escape character
  if (!escapeChar) {
    // 1. %substr% (most common)
    if (p.startsWith('%') && p.endsWith('%') && !p.slice(1, -1).includes('%') && !p.includes('_')) {
      return s.includes(p.slice(1, -1)) ? 1 : 0;
    }
    // 2. prefix%
    if (p.endsWith('%') && !p.startsWith('%') && !p.slice(0, -1).includes('%') && !p.includes('_')) {
      return s.startsWith(p.slice(0, -1)) ? 1 : 0;
    }
    // 3. %suffix
    if (p.startsWith('%') && !p.endsWith('%') && !p.slice(1).includes('%') && !p.includes('_')) {
      return s.endsWith(p.slice(1)) ? 1 : 0;
    }
    // 4. exact match
    if (!p.includes('%') && !p.includes('_')) {
      return s === p ? 1 : 0;
    }
  }

  // Regex fallback for complex patterns (% and _) and ESCAPE clause
  try {
    const esc = escapeChar ? escapeChar.toLowerCase() : null;
    let rx = '^';
    for (let i = 0; i < p.length; i++) {
      const ch = p[i];
      if (esc && ch === esc && i + 1 < p.length) {
        i++;
        rx += p[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      } else if (ch === '%') {
        rx += '.*';
      } else if (ch === '_') {
        rx += '.';
      } else {
        rx += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
    }
    rx += '$';
    return new RegExp(rx, 's').test(s) ? 1 : 0;
  } catch {
    return 0;
  }
});

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    callsign TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_spot_msg_id INTEGER,
    last_spot_data TEXT
  );

  CREATE TABLE IF NOT EXISTS spots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spot_id INTEGER UNIQUE, -- ID from POTA API (for cluster spots)
    callsign TEXT NOT NULL,
    reference TEXT NOT NULL,
    frequency TEXT,
    mode TEXT,
    comment TEXT,
    source TEXT NOT NULL, -- 'cluster' or 'local'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    type TEXT NOT NULL DEFAULT 'callsign',
    target TEXT NOT NULL,
    target_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(telegram_id, type, target)
  );

  CREATE TABLE IF NOT EXISTS pinned_spots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    message_id INTEGER NOT NULL,
    pinned_at INTEGER NOT NULL,
    unpin_at INTEGER NOT NULL,
    status TEXT DEFAULT 'pinned',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_id, message_id)
  );
  CREATE INDEX IF NOT EXISTS idx_pinned_spots_status_unpin ON pinned_spots (status, unpin_at);

  CREATE TABLE IF NOT EXISTS blocked_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    first_name TEXT,
    last_name TEXT,
    username TEXT,
    reason TEXT NOT NULL,
    details TEXT,
    action TEXT NOT NULL, -- 'banned', 'kicked', 'warned'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_blocked_users_tgid ON blocked_users (telegram_id);
  CREATE INDEX IF NOT EXISTS idx_blocked_users_created ON blocked_users (created_at DESC);

  CREATE TABLE IF NOT EXISTS muted_broadcast_callsigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    callsign TEXT UNIQUE NOT NULL,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_muted_broadcast_callsigns_call ON muted_broadcast_callsigns (callsign);

  CREATE TABLE IF NOT EXISTS user_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL DEFAULT 'callsign_spotted', -- 'callsign_spotted' | 'park_spotted' | 'system'
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    callsign TEXT,
    reference TEXT,
    frequency TEXT,
    mode TEXT,
    spot_time TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_user_notif_user ON user_notifications (user_id, is_read, created_at DESC);

  CREATE TABLE IF NOT EXISTS email_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    callsign TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_email_verif_lookup ON email_verifications (email, code);
  CREATE INDEX IF NOT EXISTS idx_email_verif_email ON email_verifications (email);

  CREATE TABLE IF NOT EXISTS telegram_link_tokens (
    token TEXT PRIMARY KEY,
    callsign TEXT NOT NULL,
    web_telegram_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_tg_link_tokens_token ON telegram_link_tokens (token);

  CREATE TABLE IF NOT EXISTS telegram_login_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE,
    code TEXT,
    telegram_id INTEGER,
    callsign TEXT,
    status TEXT DEFAULT 'pending',
    expires_at INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_tg_login_token ON telegram_login_sessions (token);
  CREATE INDEX IF NOT EXISTS idx_tg_login_code ON telegram_login_sessions (code);

  CREATE TABLE IF NOT EXISTS scheduled_broadcasts (
    scheduled_id INTEGER PRIMARY KEY,
    activator TEXT NOT NULL,
    reference TEXT NOT NULL,
    start_date TEXT,
    end_date TEXT,
    msg_id INTEGER,
    broadcasted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_scheduled_broadcasts_ref ON scheduled_broadcasts (reference);
  CREATE INDEX IF NOT EXISTS idx_scheduled_broadcasts_act ON scheduled_broadcasts (activator);

  CREATE TABLE IF NOT EXISTS donations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    callsign TEXT,
    role TEXT DEFAULT 'activator',
    amount INTEGER DEFAULT 0,
    tier_title TEXT,
    message TEXT,
    is_anonymous INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_donations_status ON donations (status);
`);

// Migration for existing tables
try {
  const userColumns = db.pragma('table_info(users)');
  
  const hasStatus = userColumns.some(col => col.name === 'status');
  if (!hasStatus) {
    db.exec(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'approved'`);
    console.log('[DB] Migrated users table: added status column');
  }

  const hasRejectReason = userColumns.some(col => col.name === 'reject_reason');
  if (!hasRejectReason) {
    db.exec(`ALTER TABLE users ADD COLUMN reject_reason TEXT`);
    console.log('[DB] Migrated users table: added reject_reason column');
  }

  const hasNotificationsEnabled = userColumns.some(col => col.name === 'notifications_enabled');
  if (!hasNotificationsEnabled) {
    db.exec(`ALTER TABLE users ADD COLUMN notifications_enabled INTEGER DEFAULT 1`);
    console.log('[DB] Migrated users table: added notifications_enabled column');
  }

  const hasOnairFilters = userColumns.some(col => col.name === 'onair_filters');
  if (!hasOnairFilters) {
    db.exec(`ALTER TABLE users ADD COLUMN onair_filters TEXT`);
    console.log('[DB] Migrated users table: added onair_filters column');
  }

  const hasEmail = userColumns.some(col => col.name === 'email');
  if (!hasEmail) {
    db.exec(`ALTER TABLE users ADD COLUMN email TEXT`);
    console.log('[DB] Migrated users table: added email column');
  }

  const hasAuthType = userColumns.some(col => col.name === 'auth_type');
  if (!hasAuthType) {
    db.exec(`ALTER TABLE users ADD COLUMN auth_type TEXT DEFAULT 'telegram'`);
    console.log('[DB] Migrated users table: added auth_type column');
  }

  const hasWebToken = userColumns.some(col => col.name === 'web_token');
  if (!hasWebToken) {
    db.exec(`ALTER TABLE users ADD COLUMN web_token TEXT`);
    console.log('[DB] Migrated users table: added web_token column');
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_web_token ON users (web_token)`);

  const hasFirstName = userColumns.some(col => col.name === 'first_name');
  if (!hasFirstName) {
    db.exec(`ALTER TABLE users ADD COLUMN first_name TEXT`);
    console.log('[DB] Migrated users table: added first_name column');
  }

  const hasLastName = userColumns.some(col => col.name === 'last_name');
  if (!hasLastName) {
    db.exec(`ALTER TABLE users ADD COLUMN last_name TEXT`);
    console.log('[DB] Migrated users table: added last_name column');
  }

  const hasUsername = userColumns.some(col => col.name === 'username');
  if (!hasUsername) {
    db.exec(`ALTER TABLE users ADD COLUMN username TEXT`);
    console.log('[DB] Migrated users table: added username column');
  }

  const hasAvatarUrl = userColumns.some(col => col.name === 'avatar_url');
  if (!hasAvatarUrl) {
    db.exec(`ALTER TABLE users ADD COLUMN avatar_url TEXT`);
    console.log('[DB] Migrated users table: added avatar_url column');
  }


  const subColumns = db.pragma('table_info(subscriptions)');
  const hasTargetCallsign = subColumns.some(col => col.name === 'target_callsign');
  const hasType = subColumns.some(col => col.name === 'type');
  const hasTargetName = subColumns.some(col => col.name === 'target_name');

  if (hasTargetCallsign && !hasType) {
    db.exec(`
      CREATE TABLE subscriptions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER NOT NULL,
        type TEXT NOT NULL DEFAULT 'callsign',
        target TEXT NOT NULL,
        target_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(telegram_id, type, target)
      );
      INSERT INTO subscriptions_new (id, telegram_id, type, target, created_at)
      SELECT id, telegram_id, 'callsign', target_callsign, created_at FROM subscriptions;
      DROP TABLE subscriptions;
      ALTER TABLE subscriptions_new RENAME TO subscriptions;
    `);
    console.log('[DB] Migrated subscriptions table: added type and target columns');
  } else if (!hasTargetName) {
    db.exec(`ALTER TABLE subscriptions ADD COLUMN target_name TEXT`);
    console.log('[DB] Migrated subscriptions table: added target_name column');
  }

  const spotColumns = db.pragma('table_info(spots)');
  const hasMsgId = spotColumns.some(col => col.name === 'msg_id');
  if (!hasMsgId) {
    db.exec(`ALTER TABLE spots ADD COLUMN msg_id INTEGER`);
    console.log('[DB] Migrated spots table: added msg_id column');
  }

  const hasIpAddress = spotColumns.some(col => col.name === 'ip_address');
  if (!hasIpAddress) {
    db.exec(`ALTER TABLE spots ADD COLUMN ip_address TEXT`);
    console.log('[DB] Migrated spots table: added ip_address column');
  }

  // Ensure pinned_spots table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS pinned_spots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      message_id INTEGER NOT NULL,
      pinned_at INTEGER NOT NULL,
      unpin_at INTEGER NOT NULL,
      status TEXT DEFAULT 'pinned',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(chat_id, message_id)
    );
    CREATE INDEX IF NOT EXISTS idx_pinned_spots_status_unpin ON pinned_spots (status, unpin_at);
  `);

  const pinnedColumns = db.pragma('table_info(pinned_spots)');
  const hasChannelMsgId = pinnedColumns.some(col => col.name === 'channel_msg_id');
  if (!hasChannelMsgId) {
    db.exec(`ALTER TABLE pinned_spots ADD COLUMN channel_msg_id INTEGER`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_pinned_spots_channel_msg ON pinned_spots (channel_msg_id)`);
    console.log('[DB] Migrated pinned_spots table: added channel_msg_id column');
  }

  // Ensure blocked_users table exists for RU-POTA Shield
  db.exec(`
    CREATE TABLE IF NOT EXISTS blocked_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      first_name TEXT,
      last_name TEXT,
      username TEXT,
      reason TEXT NOT NULL,
      details TEXT,
      action TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_blocked_users_tgid ON blocked_users (telegram_id);
    CREATE INDEX IF NOT EXISTS idx_blocked_users_created ON blocked_users (created_at DESC);
  `);

  const blockedColumns = db.pragma('table_info(blocked_users)');
  const hasIsRead = blockedColumns.some(col => col.name === 'is_read');
  if (!hasIsRead) {
    db.exec(`ALTER TABLE blocked_users ADD COLUMN is_read INTEGER DEFAULT 0`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_blocked_users_is_read ON blocked_users (is_read)`);
    console.log('[DB] Migrated blocked_users table: added is_read column');
  }

  const hasIsArchived = blockedColumns.some(col => col.name === 'is_archived');
  if (!hasIsArchived) {
    db.exec(`ALTER TABLE blocked_users ADD COLUMN is_archived INTEGER DEFAULT 0`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_blocked_users_is_archived ON blocked_users (is_archived)`);
    console.log('[DB] Migrated blocked_users table: added is_archived column');
  }

  // Ensure scheduled_broadcasts table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_broadcasts (
      scheduled_id INTEGER PRIMARY KEY,
      activator TEXT NOT NULL,
      reference TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      msg_id INTEGER,
      broadcasted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_scheduled_broadcasts_ref ON scheduled_broadcasts (reference);
    CREATE INDEX IF NOT EXISTS idx_scheduled_broadcasts_act ON scheduled_broadcasts (activator);
  `);

  // Ensure oopt_registry table exists for Russian Protected Areas
  db.exec(`
    CREATE TABLE IF NOT EXISTS oopt_registry (
      nid INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      sig TEXT,
      sig_display TEXT,
      status TEXT,
      category TEXT,
      agency TEXT,
      ate TEXT,
      start_date TEXT,
      area REAL,
      area_aquatory REAL,
      area_protection_zone REAL,
      lat REAL,
      lon REAL,
      bbox TEXT,
      profile TEXT,
      rf_subjects TEXT,
      international_status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_oopt_title ON oopt_registry (title);
    CREATE INDEX IF NOT EXISTS idx_oopt_category ON oopt_registry (category);
    CREATE INDEX IF NOT EXISTS idx_oopt_sig ON oopt_registry (sig);
    CREATE INDEX IF NOT EXISTS idx_oopt_ate ON oopt_registry (ate);
  `);

  const ooptColumns = db.pragma('table_info(oopt_registry)');
  const hasPotaRef = ooptColumns.some(col => col.name === 'pota_ref');
  if (!hasPotaRef) {
    db.exec(`ALTER TABLE oopt_registry ADD COLUMN pota_ref TEXT`);
    db.exec(`ALTER TABLE oopt_registry ADD COLUMN pota_name TEXT`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_oopt_pota_ref ON oopt_registry (pota_ref)`);
    console.log('[DB] Migrated oopt_registry table: added pota_ref and pota_name columns');
  }

  const hasNestedOopt = ooptColumns.some(col => col.name === 'nested_oopt');
  if (!hasNestedOopt) {
    db.exec(`ALTER TABLE oopt_registry ADD COLUMN nested_oopt TEXT`);
    console.log('[DB] Migrated oopt_registry table: added nested_oopt column');
  }

  const hasRusoirUrl = ooptColumns.some(col => col.name === 'rusoir_url');
  if (!hasRusoirUrl) {
    db.exec(`ALTER TABLE oopt_registry ADD COLUMN rusoir_url TEXT`);
    db.exec(`ALTER TABLE oopt_registry ADD COLUMN rusoir_name TEXT`);
    console.log('[DB] Migrated oopt_registry table: added rusoir_url and rusoir_name columns');
  }

  const hasClusters = ooptColumns.some(col => col.name === 'clusters');
  if (!hasClusters) {
    db.exec(`ALTER TABLE oopt_registry ADD COLUMN cluster_count INTEGER DEFAULT NULL`);
    db.exec(`ALTER TABLE oopt_registry ADD COLUMN clusters TEXT DEFAULT NULL`);
    console.log('[DB] Migrated oopt_registry table: added cluster_count and clusters columns');
  }

  const hasInternationalStatus = ooptColumns.some(col => col.name === 'international_status');
  if (!hasInternationalStatus) {
    db.exec(`ALTER TABLE oopt_registry ADD COLUMN international_status TEXT DEFAULT NULL`);
    console.log('[DB] Migrated oopt_registry table: added international_status column');
  }

  const hasDetailsFetched = ooptColumns.some(col => col.name === 'details_fetched_at');
  if (!hasDetailsFetched) {
    db.exec(`ALTER TABLE oopt_registry ADD COLUMN details_fetched_at DATETIME DEFAULT NULL`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_oopt_details_fetched ON oopt_registry (details_fetched_at)`);
    // Backfill already enriched rows
    db.exec(`UPDATE oopt_registry SET details_fetched_at = updated_at WHERE (lat IS NOT NULL AND lon IS NOT NULL) OR bbox IS NOT NULL`);
    console.log('[DB] Migrated oopt_registry table: added details_fetched_at column and backfilled existing entries');
  }

  const hasPotaStatus = ooptColumns.some(col => col.name === 'pota_status');
  if (!hasPotaStatus) {
    db.exec(`ALTER TABLE oopt_registry ADD COLUMN pota_status TEXT DEFAULT NULL`);
    db.exec(`ALTER TABLE oopt_registry ADD COLUMN pota_submitted_at DATETIME DEFAULT NULL`);
    db.exec(`ALTER TABLE oopt_registry ADD COLUMN pota_submitted_by TEXT DEFAULT NULL`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_oopt_pota_status ON oopt_registry (pota_status)`);
    console.log('[DB] Migrated oopt_registry table: added pota_status, pota_submitted_at, pota_submitted_by columns');
  }

  const hasPotaManual = ooptColumns.some(col => col.name === 'pota_manual');
  if (!hasPotaManual) {
    db.exec(`ALTER TABLE oopt_registry ADD COLUMN pota_manual INTEGER DEFAULT 0`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_oopt_pota_manual ON oopt_registry (pota_manual)`);
    console.log('[DB] Migrated oopt_registry table: added pota_manual column');
  }

  const hasIsDuplicate = ooptColumns.some(col => col.name === 'is_duplicate');
  if (!hasIsDuplicate) {
    db.exec(`ALTER TABLE oopt_registry ADD COLUMN is_duplicate INTEGER DEFAULT 0`);
    db.exec(`ALTER TABLE oopt_registry ADD COLUMN duplicate_of INTEGER DEFAULT NULL`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_oopt_duplicate ON oopt_registry (is_duplicate)`);
    console.log('[DB] Migrated oopt_registry table: added is_duplicate, duplicate_of columns');
  }

  // Table for on-demand cached OOPT boundary polygons and geometries from Minpriroda
  db.exec(`
    CREATE TABLE IF NOT EXISTS oopt_boundaries (
      nid INTEGER PRIMARY KEY,
      has_boundary INTEGER NOT NULL,
      geometry TEXT,
      minpriroda_lat REAL,
      minpriroda_lon REAL,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Auto-backfill missing coordinates from offline dataset (oopt_fallback.json.gz) if database has < 5,000 geocoded OOPT
  try {
    const coordsCount = db.prepare("SELECT COUNT(*) as count FROM oopt_registry WHERE lat IS NOT NULL AND lat != 0").get()?.count || 0;
    if (coordsCount < 5000) {
      const gzPath = path.resolve(__dirname, '../data/oopt_fallback.json.gz');
      if (fs.existsSync(gzPath)) {
        console.log(`[DB] 🔄 Auto-backfilling missing OOPT coordinates from fallback dataset (${coordsCount} / 11,244 geocoded)...`);
        const decompressed = zlib.gunzipSync(fs.readFileSync(gzPath));
        const gzRaw = JSON.parse(decompressed.toString('utf8'));
        if (gzRaw && Array.isArray(gzRaw.rows)) {
          const updateStmt = db.prepare(`
            UPDATE oopt_registry
            SET lat = CASE WHEN lat IS NULL OR lat = 0 THEN @lat ELSE lat END,
                lon = CASE WHEN lon IS NULL OR lon = 0 THEN @lon ELSE lon END,
                bbox = CASE WHEN bbox IS NULL THEN @bbox ELSE bbox END,
                profile = CASE WHEN profile IS NULL THEN @profile ELSE profile END,
                rf_subjects = CASE WHEN rf_subjects IS NULL THEN @rf_subjects ELSE rf_subjects END,
                rusoir_url = CASE WHEN rusoir_url IS NULL THEN @rusoir_url ELSE rusoir_url END,
                rusoir_name = CASE WHEN rusoir_name IS NULL THEN @rusoir_name ELSE rusoir_name END,
                cluster_count = CASE WHEN cluster_count IS NULL THEN @cluster_count ELSE cluster_count END,
                clusters = CASE WHEN clusters IS NULL THEN @clusters ELSE clusters END,
                details_fetched_at = CASE WHEN details_fetched_at IS NULL THEN @details_fetched_at ELSE details_fetched_at END
            WHERE nid = @nid
          `);
          const tx = db.transaction((rows) => {
            for (const r of rows) {
              updateStmt.run({
                nid: r.nid,
                lat: r.lat || null,
                lon: r.lon || null,
                bbox: r.bbox ? (typeof r.bbox === 'string' ? r.bbox : JSON.stringify(r.bbox)) : null,
                profile: r.profile || null,
                rf_subjects: r.rf_subjects || null,
                rusoir_url: r.rusoir_url || null,
                rusoir_name: r.rusoir_name || null,
                cluster_count: r.cluster_count || 0,
                clusters: r.clusters ? (typeof r.clusters === 'string' ? r.clusters : JSON.stringify(r.clusters)) : null,
                details_fetched_at: r.details_fetched_at || null
              });
            }
          });
          tx(gzRaw.rows);
          const newCoordsCount = db.prepare("SELECT COUNT(*) as count FROM oopt_registry WHERE lat IS NOT NULL AND lat != 0").get()?.count || 0;
          console.log(`[DB] ✅ OOPT coordinates successfully auto-migrated! Now ${newCoordsCount} records have valid coordinates.`);
        }
      }
    }
  } catch (err) {
    console.warn('[DB] ⚠️ OOPT coordinates auto-backfill warning:', err.message);
  }

  // Auto-convert any EPSG:3857 (Spherical Mercator meters) coordinates to WGS84 degrees (Minpriroda API anomalies)
  try {
    const mercatorRows = db.prepare('SELECT nid, lat, lon, bbox FROM oopt_registry WHERE lat > 90 OR lon > 180 OR lat < -90 OR lon < -180').all();
    if (mercatorRows.length > 0) {
      const updateCoordStmt = db.prepare('UPDATE oopt_registry SET lat = ?, lon = ?, bbox = ? WHERE nid = ?');
      for (const row of mercatorRows) {
        // In EPSG:3857 center, lat was stored as Y (northing) and lon as X (easting)
        const numX = Number(row.lon);
        const numY = Number(row.lat);
        const lon = Number(((numX / 20037508.34) * 180).toFixed(4));
        let lat = (numY / 20037508.34) * 180;
        lat = Number(((180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2)).toFixed(4));
        let newBbox = row.bbox;
        if (row.bbox) {
          try {
            const b = JSON.parse(row.bbox);
            if (Array.isArray(b) && b.length === 4 && (Math.abs(b[0]) > 180 || Math.abs(b[1]) > 90)) {
              const minLon = Number(((b[0] / 20037508.34) * 180).toFixed(4));
              let minLat = (b[1] / 20037508.34) * 180;
              minLat = Number(((180 / Math.PI) * (2 * Math.atan(Math.exp((minLat * Math.PI) / 180)) - Math.PI / 2)).toFixed(4));
              const maxLon = Number(((b[2] / 20037508.34) * 180).toFixed(4));
              let maxLat = (b[3] / 20037508.34) * 180;
              maxLat = Number(((180 / Math.PI) * (2 * Math.atan(Math.exp((maxLat * Math.PI) / 180)) - Math.PI / 2)).toFixed(4));
              newBbox = JSON.stringify([minLon, minLat, maxLon, maxLat]);
            }
          } catch (_) {}
        }
        updateCoordStmt.run(lat, lon, newBbox, row.nid);
        console.log(`[DB] 🌐 Converted NID ${row.nid} EPSG:3857 coords to WGS84: ${lat}, ${lon}`);
      }
    }
  } catch (e) {
    console.warn('[DB] EPSG:3857 migration warning:', e.message);
  }

  // Sanitize nested_oopt pota_ref against parent region
  try {
    const nestedRows = db.prepare("SELECT nid, ate, rf_subjects, nested_oopt FROM oopt_registry WHERE nested_oopt LIKE '%pota_ref%'").all();
    if (nestedRows.length > 0) {
      const updateNestedStmt = db.prepare('UPDATE oopt_registry SET nested_oopt = ? WHERE nid = ?');
      for (const row of nestedRows) {
        try {
          const items = JSON.parse(row.nested_oopt);
          let changed = false;
          const parentRegion = `${row.ate || ''} ${row.rf_subjects || ''}`.toLowerCase();
          const getStems = (str) => str.split(/[,;\n()]+/).map(s => s.replace(/(республика|край|область|автономный|округ|город|федеральный|значения)/g, '').trim()).filter(s => s.length >= 3);
          const pStems = getStems(parentRegion);
          for (const it of items) {
            if (it.pota_ref) {
              const potaRow = db.prepare('SELECT ate, rf_subjects FROM oopt_registry WHERE pota_ref = ?').get(it.pota_ref);
              if (potaRow) {
                const potaRegion = `${potaRow.ate || ''} ${potaRow.rf_subjects || ''}`.toLowerCase();
                const kStems = getStems(potaRegion);
                const match = pStems.some(a => kStems.some(b => a.includes(b) || b.includes(a)));
                if (!match) {
                  it.pota_ref = null;
                  it.pota_name = null;
                  changed = true;
                }
              }
            }
          }
          if (changed) {
            updateNestedStmt.run(JSON.stringify(items), row.nid);
            console.log(`[DB] 🧹 Sanitized cross-region nested OOPT pota_refs in NID ${row.nid}`);
          }
        } catch (_) {}
      }
    }
  } catch (e) {
    console.warn('[DB] nested_oopt region sanitization warning:', e.message);
  }

  // Sanitize clusters JSON: decode HTML entities (&quot;, &amp;) and clean cluster names
  try {
    const clusterRows = db.prepare("SELECT nid, clusters FROM oopt_registry WHERE clusters LIKE '%&quot;%' OR clusters LIKE '%&amp;%' OR clusters LIKE '%Участок%'").all();
    if (clusterRows.length > 0) {
      const cleanNameHelper = (name) => {
        if (!name || typeof name !== 'string') return '';
        let s = name
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#39;|&apos;/g, "'")
          .replace(/&laquo;|&raquo;/g, '"')
          .replace(/&nbsp;/g, ' ')
          .trim();
        const quoteMatch = s.match(/^(?:участок|кластер|сектор|зона|часть|территория|отделение)?[ \t]*["«]([^"»]+)["»]$/i);
        if (quoteMatch && quoteMatch[1].trim()) {
          s = quoteMatch[1].trim();
        } else {
          const stripped = s.replace(/^(?:участок|кластер|сектор|зона|часть|территория|отделение)[ \t]*(?:№|n|#|no\.?)?[ \t]*[-–—:]?[ \t]*/i, '').trim();
          if (stripped && !/^(?:\d+|[ivx]+|[a-zа-я](?:-\d+)?)$/i.test(stripped)) {
            s = stripped;
          }
        }
        const trailingStripped = s.replace(/[ \t]+(?:участок|кластер|сектор|зона|часть|территория|отделение)$/i, '').trim();
        if (trailingStripped && !/^(?:№|n|#|no\.?)?[ \t]*[-–—]?$/i.test(trailingStripped)) {
          s = trailingStripped;
        }
        s = s.replace(/^["'«]+|["'»]+$/g, '').trim();
        return s;
      };

      const updateClusterStmt = db.prepare('UPDATE oopt_registry SET clusters = ? WHERE nid = ?');
      for (const row of clusterRows) {
        try {
          const items = JSON.parse(row.clusters);
          if (Array.isArray(items)) {
            let changed = false;
            for (const it of items) {
              if (it && it.name) {
                const cleaned = cleanNameHelper(it.name);
                if (cleaned !== it.name) {
                  it.name = cleaned;
                  changed = true;
                }
              }
            }
            if (changed) {
              updateClusterStmt.run(JSON.stringify(items), row.nid);
              console.log(`[DB] 🧹 Sanitized cluster names and HTML entities in NID ${row.nid}`);
            }
          }
        } catch (_) {}
      }
    }
  } catch (e) {
    console.warn('[DB] clusters sanitization warning:', e.message);
  }

  // Ensure missing categories are populated and sync verified POTA references
  try {
    db.exec(`
      UPDATE oopt_registry SET category = 'дендрологический парк и ботанический сад' WHERE nid = 66245 AND (category IS NULL OR category = '');
      UPDATE oopt_registry SET category = 'государственный природный заказник' WHERE nid = 58456 AND (category IS NULL OR category = '');
      UPDATE oopt_registry SET category = 'памятник природы' WHERE nid = 56585 AND (category IS NULL OR category = '');
      UPDATE oopt_registry SET clusters = NULL WHERE nid IN (32, 235, 6453);
      UPDATE oopt_registry SET pota_ref = 'RU-0024', pota_name = 'Meshchyora National Park', pota_manual = 1 WHERE nid = 6708;
      UPDATE oopt_registry SET pota_ref = 'RU-0025', pota_name = 'Meschyorsky National Park', pota_manual = 1 WHERE nid = 6709;
      UPDATE oopt_registry SET pota_ref = 'RU-0031', pota_name = 'Pleshcheyevo Ozero National Park', pota_manual = 1 WHERE nid = 6714;
      UPDATE oopt_registry SET pota_ref = 'RU-0324', pota_name = 'Bird Harbor Nature Park', pota_manual = 1 WHERE nid = 7091;
      
      -- Fix NID 38306 (Вязовская ковыльная степь) coordinates in Samara and link to RU-1722
      UPDATE oopt_registry SET lat = 52.67581, lon = 50.57111, pota_ref = 'RU-1722', pota_name = 'Вязовская ковыльная степь Natural Monument', pota_manual = 1 WHERE nid = 38306;
      UPDATE oopt_boundaries SET minpriroda_lat = 52.67581, minpriroda_lon = 50.57111 WHERE nid = 38306;
      
      -- Fix NID 81 (Русская Арктика) linking to RU-0061 (ZFI) instead of RU-0034
      UPDATE oopt_registry SET pota_ref = 'RU-0061', pota_name = 'Russian Arctic National Park', pota_manual = 1 WHERE nid = 81;
      
      -- Fix NID 64976 (Пёзский заказник) linking to RU-0034
      UPDATE oopt_registry SET pota_ref = 'RU-0034', pota_name = 'Pyozsky State Natural Reserve', pota_manual = 1 WHERE nid = 64976;

      -- Link NID 34504 (Костромская слобода) to RU-1723
      UPDATE oopt_registry SET pota_ref = 'RU-1723', pota_name = 'Костромская слобода Recreation Site', pota_manual = 1 WHERE nid = 34504;

      -- Coordinator (Manu R2BBX) verified manual links (protected from auto-reset)
      UPDATE oopt_registry SET pota_ref = 'RU-0927', pota_name = 'Большой Арктический State Nature Preserve', pota_manual = 1 WHERE nid = 70;
      UPDATE oopt_registry SET pota_ref = 'RU-0933', pota_name = 'Североземельский State Natural Reserve', pota_manual = 1 WHERE nid = 33;
      UPDATE oopt_registry SET pota_ref = 'RU-0043', pota_name = 'Shorsky National Park', pota_manual = 1 WHERE nid = 6728;
      UPDATE oopt_registry SET pota_ref = 'RU-0344', pota_name = 'Ozyorsky Spruce Forest Natural Monument', pota_manual = 1 WHERE nid = 163;
      UPDATE oopt_registry SET pota_ref = 'RU-0962', pota_name = 'Магаданский State Nature Preserve', pota_manual = 1 WHERE nid = 276;
      UPDATE oopt_registry SET pota_ref = 'RU-5122', pota_name = 'Пойма State Natural Reserve', pota_manual = 1 WHERE nid = 10992;
      UPDATE oopt_registry SET pota_ref = 'RU-4721', pota_name = 'Болото Большое-I Natural Monument', pota_manual = 1 WHERE nid = 20293;
      UPDATE oopt_registry SET pota_ref = 'RU-6139', pota_name = 'Урочище Большой лес Natural Monument', pota_manual = 1 WHERE nid = 66279;
    `);
  } catch (_) {}

  // Clean up any historical HTML tags in user_notifications table for TMA display
  try {
    const rawNotifs = db.prepare("SELECT id, message FROM user_notifications WHERE message LIKE '%<%'").all();
    if (rawNotifs.length > 0) {
      const updateNotifStmt = db.prepare('UPDATE user_notifications SET message = ? WHERE id = ?');
      for (const row of rawNotifs) {
        try {
          const parkMatch = row.message.match(/—\s*<i>([^<]+)<\/i>/i) || row.message.match(/—\s*([^\n📍⚙️📝]+)/);
          const locMatch = row.message.match(/📍\s*(?:<b>)?([^<\n]+)(?:<\/b>)?/i);
          const commentMatch = row.message.match(/📝\s*([^\n]+)/);

          const parkName = parkMatch ? parkMatch[1].trim() : '';
          const location = locMatch ? locMatch[1].replace(/<[^>]+>/g, '').trim() : '';
          const comment = commentMatch ? commentMatch[1].replace(/<[^>]+>/g, '').trim() : '';

          let cleaned = [
            parkName,
            location,
            comment ? `📝 ${comment}` : ''
          ].filter(Boolean).join(' • ');

          if (!cleaned) {
            cleaned = row.message.replace(/<[^>]+>/g, '').replace(/🌐\s*POTA Cluster Spot\s*/i, '').trim();
          }

          updateNotifStmt.run(cleaned, row.id);
        } catch (_) {}
      }
      console.log(`[DB] 🧹 Sanitized ${rawNotifs.length} HTML notification messages in user_notifications`);
    }
  } catch (e) {
    console.warn('[DB] user_notifications sanitization warning:', e.message);
  }
} catch (e) {
  console.error('[DB] Migration error:', e.message);
}

export default db;

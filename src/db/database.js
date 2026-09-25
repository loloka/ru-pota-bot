import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
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

  // Ensure missing categories are populated
  try {
    db.exec(`
      UPDATE oopt_registry SET category = 'дендрологический парк и ботанический сад' WHERE nid = 66245 AND (category IS NULL OR category = '');
      UPDATE oopt_registry SET category = 'государственный природный заказник' WHERE nid = 58456 AND (category IS NULL OR category = '');
      UPDATE oopt_registry SET category = 'памятник природы' WHERE nid = 56585 AND (category IS NULL OR category = '');
    `);
  } catch (_) {}
} catch (e) {
  console.error('[DB] Migration error:', e.message);
}

export default db;

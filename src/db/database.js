import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Ensure data directory exists
const dbDir = path.resolve('data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(path.join(dbDir, 'pota.db'));
db.pragma('journal_mode = WAL');

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
} catch (e) {
  console.error('[DB] Migration error:', e.message);
}

export default db;

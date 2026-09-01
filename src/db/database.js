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
    target_callsign TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(telegram_id, target_callsign)
  );
`);

// Migration for existing tables
try {
  const columns = db.pragma('table_info(users)');
  
  const hasStatus = columns.some(col => col.name === 'status');
  if (!hasStatus) {
    db.exec(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'approved'`);
    console.log('[DB] Migrated users table: added status column');
  }

  const hasRejectReason = columns.some(col => col.name === 'reject_reason');
  if (!hasRejectReason) {
    db.exec(`ALTER TABLE users ADD COLUMN reject_reason TEXT`);
    console.log('[DB] Migrated users table: added reject_reason column');
  }
} catch (e) {
  console.error('[DB] Migration error:', e.message);
}

export default db;

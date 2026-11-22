import { DatabaseSync } from 'node:sqlite';

export function openDb(file = process.env.DB_FILE || 'navidapp.db') {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      admin_token TEXT NOT NULL UNIQUE,
      drawn INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      token TEXT NOT NULL UNIQUE,
      wishes TEXT NOT NULL DEFAULT '',
      giftee_id INTEGER REFERENCES participants(id),
      UNIQUE (event_id, email)
    );
  `);
  return db;
}

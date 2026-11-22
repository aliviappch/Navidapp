import { createClient } from '@libsql/client';

// En Vercel: TURSO_DATABASE_URL (libsql://...) y TURSO_AUTH_TOKEN.
// En local: archivo SQLite. En tests: ':memory:'.
export async function openDb(url = process.env.TURSO_DATABASE_URL || 'file:navidapp.db') {
  const db = createClient({ url: url === ':memory:' ? 'file::memory:' : url, authToken: process.env.TURSO_AUTH_TOKEN });
  await db.batch([
    `CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      admin_token TEXT NOT NULL UNIQUE,
      drawn INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      token TEXT NOT NULL UNIQUE,
      wishes TEXT NOT NULL DEFAULT '',
      giftee_id INTEGER REFERENCES participants(id),
      UNIQUE (event_id, email))`,
  ]);
  return db;
}

// Mismo contenido que supabase/schema.sql (copia para pegar en el SQL Editor si se quiere).
// Va como código para que Vercel lo incluya siempre en la función.
export const schema = `
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  admin_token TEXT NOT NULL UNIQUE,
  drawn INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS participants (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  token TEXT NOT NULL UNIQUE,
  wishes TEXT NOT NULL DEFAULT '',
  giftee_id INTEGER REFERENCES participants(id),
  UNIQUE (event_id, email)
);
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
`;

// Mismo contenido que supabase/schema.sql (un test lo comprueba).
// Va como código para que Vercel lo incluya siempre en la función.
export const schema = `
CREATE TABLE IF NOT EXISTS secret_groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  drawn INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES secret_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  wishes TEXT NOT NULL DEFAULT '',
  is_admin INTEGER NOT NULL DEFAULT 0,
  giftee_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  UNIQUE (group_id, name_key)
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE secret_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
`;

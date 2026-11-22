-- Esquema de Amigo Secreto. La app lo aplica sola al iniciar (es idempotente),
-- pero también puedes pegarlo en Supabase → SQL Editor.
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
-- Seguridad: Supabase expone las tablas públicas por su API REST con la clave "anon".
-- Con RLS activado y SIN políticas, esa API no puede leer nada. La app se conecta
-- directo a Postgres con el rol de servidor, que no se ve afectado por RLS.
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

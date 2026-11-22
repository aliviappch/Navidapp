# 🎄 Amigo Secreto

1. Quien organiza crea el grupo (nombre + contraseña) y comparte el **link del grupo** con la familia.
2. Cada persona entra al link y se crea su cuenta con su **nombre y contraseña**. Un nombre solo se puede registrar una vez (sin importar mayúsculas ni tildes).
3. Cada uno escribe sus ideas de regalo.
4. Quien organiza ve cuántos ya escribieron y hace el sorteo.
5. Al entrar, cada persona ve **solo** a quién le tocó y las ideas de esa persona. Nadie más (ni quien organiza) ve las asignaciones.

Si alguien olvida su contraseña, quien organiza le genera una temporal ("olvidó su clave").
No usa correos.

## Local
    npm install
    npm start        # http://localhost:3000
    npm test

Sin `DATABASE_URL` usa un Postgres embebido (carpeta `.pgdata`).

## Publicar: Vercel + Supabase
Solo hace falta una variable de entorno:

- `DATABASE_URL`: Supabase → **Connect → Transaction pooler → URI** (puerto 6543), cambiando `[YOUR-PASSWORD]` por la contraseña de la base (mejor solo letras y números).

Las tablas se crean solas al iniciar (también están en `supabase/schema.sql`). Tienen RLS activado sin políticas, así la API pública de Supabase no puede leer nada.

# 🎄 Amigo Secreto

1. El organizador crea el evento con los correos (3–20). Cada persona recibe un enlace personal.
2. Cada uno escribe sus ideas de regalo en su enlace.
3. El organizador sortea. Cada persona ve **solo** a quién le tocó y sus ideas. Nadie más (ni el organizador) ve las asignaciones.

## Local
    npm install
    npm start        # http://localhost:3000
    npm test

Sin `DATABASE_URL` usa un Postgres embebido (carpeta `.pgdata`), y sin `SMTP_URL` los correos se imprimen en consola.

## Publicar: Vercel + Supabase

### 1. Supabase (base de datos)
1. En supabase.com crea un proyecto y guarda la contraseña de la base de datos.
2. Botón **Connect** → *Transaction pooler* → copia la cadena (puerto **6543**) y reemplaza `[YOUR-PASSWORD]`. Esa es tu `DATABASE_URL`.
   Usa el pooler (no la conexión directa): Vercel abre muchas conexiones cortas.
3. No hace falta crear tablas: la app las crea al iniciar. (Alternativa: pega `supabase/schema.sql` en *SQL Editor*.)
   El esquema activa RLS sin políticas, así la API pública de Supabase (clave `anon`) no puede leer los datos.

### 2. Correo
Gmail → activa verificación en dos pasos → crea una "contraseña de aplicación" y arma `SMTP_URL` (ver `.env.example`).

### 3. Vercel
1. vercel.com → *Add New → Project* → importa este repo (elige la rama con el código).
2. En *Environment Variables* define `DATABASE_URL`, `SMTP_URL` y `MAIL_FROM`.
3. *Deploy*. Prueba con 3 correos tuyos antes de invitar a la familia.

Variables: `DATABASE_URL`, `SMTP_URL`, `MAIL_FROM`, `BASE_URL` (opcional), `PORT`, `PG_POOL_MAX` (por defecto 3).

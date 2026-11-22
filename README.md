# 🎄 Amigo Secreto

1. El organizador crea el evento con los correos (3–20). Cada persona recibe un enlace personal.
2. Cada uno escribe sus ideas de regalo en su enlace.
3. El organizador sortea. Cada persona ve **solo** a quién le tocó y sus ideas. Nadie más (ni el organizador) ve las asignaciones.

## Uso
    npm install
    npm start            # http://localhost:3000
    npm test

Variables: `SMTP_URL` (ej. `smtps://user:pass@smtp.gmail.com`), `MAIL_FROM`, `BASE_URL` (URL pública), `PORT`, `DB_FILE`.
Sin `SMTP_URL`, los correos se imprimen en consola (modo desarrollo).

## Publicar en Vercel
1. Base de datos: crea una en [Turso](https://turso.tech) (gratis) y obtén `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`.
2. Correo: una cuenta Gmail con "contraseña de aplicación" → `SMTP_URL=smtps://tucorreo%40gmail.com:CLAVE@smtp.gmail.com:465`, `MAIL_FROM`.
3. Importa este repo en vercel.com (o `npx vercel`), y define esas variables en Settings → Environment Variables.
   `BASE_URL` es opcional (por defecto usa el dominio de producción de Vercel).

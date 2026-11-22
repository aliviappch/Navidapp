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

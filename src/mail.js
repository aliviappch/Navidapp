import nodemailer from 'nodemailer';

const { SMTP_URL, MAIL_FROM = 'Amigo Secreto <no-reply@localhost>' } = process.env;
const transport = SMTP_URL ? nodemailer.createTransport(SMTP_URL) : null;

export async function sendMail(to, subject, text) {
  if (!transport) {
    // Modo desarrollo: sin SMTP_URL los correos se imprimen en consola.
    console.log(`\n--- CORREO (simulado) a ${to}\n${subject}\n${text}\n`);
    return;
  }
  await transport.sendMail({ from: MAIL_FROM, to, subject, text });
}

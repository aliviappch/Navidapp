import express from 'express';
import { randomBytes } from 'node:crypto';
import { openDb } from './db.js';
import { draw } from './draw.js';
import { sendMail } from './mail.js';
import { esc, page } from './views.js';

const token = () => randomBytes(18).toString('base64url');
const MAX = 20;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createApp(dbPromise = openDb(), baseUrl = process.env.BASE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  || 'http://localhost:3000') {
  const app = express();
  Promise.resolve(dbPromise).catch(() => {}); // el error se reporta en la primera petición
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));
  let db;
  const get = async (sql, args = []) => (await db.execute({ sql, args })).rows[0];
  const list = async (sql, args = []) => (await db.execute({ sql, args })).rows;
  const run = (sql, args = []) => db.execute({ sql, args });
  app.use(async (_req, _res, next) => { try { db ??= await dbPromise; next(); } catch (e) { next(e); } });

  const q = {
    event: (t) => get('SELECT * FROM events WHERE admin_token = ?', [t]),
    eventById: (id) => get('SELECT * FROM events WHERE id = ?', [id]),
    parts: (id) => list('SELECT * FROM participants WHERE event_id = ? ORDER BY id', [id]),
    partByToken: (t) => get('SELECT * FROM participants WHERE token = ?', [t]),
    partById: (id) => get('SELECT * FROM participants WHERE id = ?', [id]),
  };
  const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
  const label = (p) => p.name || p.email;
  const parseEmails = (raw) =>
    [...new Set(String(raw).split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const notFound = (res) => res.status(404).send(page('No encontrado', '<h1>Enlace no válido</h1>'));

  async function invite(event, p) {
    await sendMail(p.email, `🎁 Amigo secreto: ${event.name}`,
      `Hola! Te invitaron al amigo secreto "${event.name}".\n\n` +
      `Entra a tu enlace personal (no lo compartas) para escribir tus ideas de regalo:\n${baseUrl}/p/${p.token}\n`);
  }

  app.get('/', (_req, res) => res.send(page('Amigo Secreto', `
    <h1>🎄 Amigo Secreto</h1>
    <form class="card" method="post" action="/events">
      <label>Nombre del evento</label><input name="name" required value="Navidad en familia">
      <label>Tu correo (organizador/a)</label><input name="organizer" type="email" required>
      <label>Correos de los participantes (hasta ${MAX}, incluye el tuyo)</label>
      <textarea name="emails" required placeholder="mama@mail.com&#10;papa@mail.com&#10;..."></textarea>
      <p class="muted">Separados por línea o coma. Cada persona recibirá un enlace personal por correo.</p>
      <button>Crear y enviar invitaciones</button>
    </form>`)));

  app.post('/events', wrap(async (req, res) => {
    const name = String(req.body.name || '').trim().slice(0, 100);
    const organizer = String(req.body.organizer || '').trim().toLowerCase();
    const emails = parseEmails(req.body.emails);
    const bad = emails.filter((e) => !EMAIL_RE.test(e));
    if (!name || !EMAIL_RE.test(organizer)) return res.status(400).send(page('Error', '<h1>Faltan datos</h1>'));
    if (bad.length) return res.status(400).send(page('Error', `<h1>Correos inválidos</h1><p>${esc(bad.join(', '))}</p>`));
    if (emails.length < 3 || emails.length > MAX)
      return res.status(400).send(page('Error', `<h1>Deben ser entre 3 y ${MAX} participantes</h1>`));

    const adminToken = token();
    const { lastInsertRowid } = await run('INSERT INTO events (name, admin_token) VALUES (?, ?)', [name, adminToken]);
    const eventId = Number(lastInsertRowid);
    await db.batch(emails.map((e) => ({ sql: 'INSERT INTO participants (event_id, email, token) VALUES (?, ?, ?)', args: [eventId, e, token()] })));
    const event = await q.eventById(eventId);
    await Promise.allSettled((await q.parts(event.id)).map((p) => invite(event, p)));
    await sendMail(organizer, `Administra tu amigo secreto: ${name}`,
      `Panel de administración (guárdalo, no lo compartas):\n${baseUrl}/admin/${adminToken}\n`);
    res.redirect(`/admin/${adminToken}`);
  }));

  // ---- Organizador: ve quién ya respondió, pero NUNCA las asignaciones ----
  const adminView = async (event, flash = '') => {
    const ps = await q.parts(event.id);
    const rows = ps.map((p) => `<li><span>${esc(label(p))}</span>
      <span>${p.wishes.trim() ? '<span class="ok">✔ ya escribió</span>' : '<span class="muted">pendiente</span>'}
      ${event.drawn ? '' : `<form method="post" action="/admin/${event.admin_token}/remove" style="display:inline"><input type="hidden" name="id" value="${p.id}"><button class="link">quitar</button></form>`}</span></li>`).join('');
    const add = event.drawn || ps.length >= MAX ? '' : `
      <form class="card" method="post" action="/admin/${event.admin_token}/add">
        <label>Agregar participante</label><input name="email" type="email" required><button>Agregar e invitar</button></form>`;
    const act = event.drawn
      ? '<p class="msg">✅ El sorteo ya se hizo. Nadie (ni tú) puede ver quién le tocó a quién.</p>'
      : `<form class="card" method="post" action="/admin/${event.admin_token}/draw"
           onsubmit="return confirm('¿Hacer el sorteo? Ya no se podrán agregar ni quitar personas.')">
           <p>Cuando todos hayan puesto sus ideas, haz el sorteo. Se avisará a cada uno por correo.</p>
           <button class="danger" ${ps.length < 3 ? 'disabled' : ''}>🎲 Sortear</button></form>`;
    return page(event.name, `<h1>🎁 ${esc(event.name)}</h1>${flash && `<p class="msg">${esc(flash)}</p>`}
      <div class="card"><ul>${rows}</ul></div>${add}${act}`);
  };

  app.get('/admin/:t', wrap(async (req, res) => {
    const ev = await q.event(req.params.t);
    ev ? res.send(await adminView(ev)) : notFound(res);
  }));

  app.post('/admin/:t/add', wrap(async (req, res) => {
    const ev = await q.event(req.params.t);
    if (!ev) return notFound(res);
    const email = String(req.body.email || '').trim().toLowerCase();
    if (ev.drawn) return res.status(409).send(await adminView(ev, 'El sorteo ya se hizo.'));
    if (!EMAIL_RE.test(email)) return res.status(400).send(await adminView(ev, 'Correo inválido.'));
    if ((await q.parts(ev.id)).length >= MAX) return res.status(400).send(await adminView(ev, `Máximo ${MAX}.`));
    try {
      await run('INSERT INTO participants (event_id, email, token) VALUES (?, ?, ?)', [ev.id, email, token()]);
    } catch { return res.status(400).send(await adminView(ev, 'Ese correo ya está.')); }
    await invite(ev, await get('SELECT * FROM participants WHERE event_id=? AND email=?', [ev.id, email])).catch(() => {});
    res.redirect(`/admin/${ev.admin_token}`);
  }));

  app.post('/admin/:t/remove', wrap(async (req, res) => {
    const ev = await q.event(req.params.t);
    if (!ev) return notFound(res);
    if (ev.drawn) return res.status(409).send(await adminView(ev, 'El sorteo ya se hizo.'));
    await run('DELETE FROM participants WHERE id = ? AND event_id = ?', [Number(req.body.id), ev.id]);
    res.redirect(`/admin/${ev.admin_token}`);
  }));

  app.post('/admin/:t/draw', wrap(async (req, res) => {
    const ev = await q.event(req.params.t);
    if (!ev) return notFound(res);
    const ps = await q.parts(ev.id);
    if (ev.drawn || ps.length < 3) return res.status(409).send(await adminView(ev, 'No se puede sortear.'));
    const pairs = draw(ps.map((p) => p.id));
    // Todo en una transacción; "drawn = 0" evita sortear dos veces si hay doble clic.
    await db.batch([
      ...pairs.map(([giver, giftee]) => ({ sql: 'UPDATE participants SET giftee_id = ? WHERE id = ?', args: [giftee, giver] })),
      { sql: 'UPDATE events SET drawn = 1 WHERE id = ? AND drawn = 0', args: [ev.id] },
    ], 'write');
    await Promise.allSettled(ps.map((p) => sendMail(p.email, `🎁 ¡Ya salió el sorteo! ${ev.name}`,
      `Entra a tu enlace personal para ver a quién le toca regalar y sus ideas:\n${baseUrl}/p/${p.token}\n`)));
    res.redirect(`/admin/${ev.admin_token}`);
  }));

  // ---- Participante ----
  const partView = async (p, flash = '') => {
    const ev = await q.eventById(p.event_id);
    let giftee = '';
    if (ev.drawn && p.giftee_id) {
      const g = await q.partById(p.giftee_id);
      giftee = `<div class="card"><h2>🤫 Te tocó regalarle a: ${esc(label(g))}</h2>
        <p>Sus ideas de regalo:</p>
        <div class="gift">${g.wishes.trim() ? esc(g.wishes) : '<span class="muted">Todavía no escribió nada. Vuelve a entrar más tarde.</span>'}</div></div>`;
    } else if (!ev.drawn) giftee = '<p class="muted">El sorteo aún no se hace. Te avisaremos por correo.</p>';
    return page(ev.name, `<h1>🎄 ${esc(ev.name)}</h1>${flash && `<p class="msg">${esc(flash)}</p>`}
      ${giftee}
      <form class="card" method="post" action="/p/${p.token}">
        <label>Tu nombre</label><input name="name" maxlength="60" value="${esc(p.name)}" placeholder="${esc(p.email)}">
        <label>Tus ideas de regalo</label>
        <textarea name="wishes" maxlength="2000" placeholder="Libros, un buzo talla M, chocolates...">${esc(p.wishes)}</textarea>
        <p class="muted">Solo la persona que te toque podrá leer esto.</p>
        <button>Guardar</button></form>`);
  };

  app.get('/p/:t', wrap(async (req, res) => {
    const p = await q.partByToken(req.params.t);
    p ? res.send(await partView(p)) : notFound(res);
  }));

  app.post('/p/:t', wrap(async (req, res) => {
    const p = await q.partByToken(req.params.t);
    if (!p) return notFound(res);
    await run('UPDATE participants SET name = ?, wishes = ? WHERE id = ?',
      [String(req.body.name || '').trim().slice(0, 60), String(req.body.wishes || '').slice(0, 2000), p.id]);
    res.send(await partView(await q.partByToken(p.token), '¡Guardado! 🎁'));
  }));

  return app;
}

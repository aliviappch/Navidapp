import express from 'express';
import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { openDb } from './db.js';
import { draw } from './draw.js';
import { esc, page } from './views.js';

const scryptAsync = promisify(scrypt);
const MAX = 20;
const MIN_PASS = 4;
const SESSION_DAYS = 90;
const sha = (t) => createHash('sha256').update(t).digest('hex');

async function hashPassword(pw) {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${(await scryptAsync(pw, salt, 32)).toString('hex')}`;
}
async function checkPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  const got = await scryptAsync(pw, Buffer.from(salt, 'hex'), 32);
  return timingSafeEqual(got, Buffer.from(hash, 'hex'));
}
// "Giannina", "giannina " y "GIANNINA" son el mismo nombre; las tildes tampoco cuentan.
const nameKey = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 40);
const newCode = () => randomBytes(6).toString('base64url').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);

export function createApp(dbPromise = openDb(), app = express()) {
  let db;
  Promise.resolve(dbPromise).catch(() => {}); // el error se reporta en la primera petición
  app.set('trust proxy', true);
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));
  app.use(async (_req, _res, next) => { try { db ??= await dbPromise; next(); } catch (e) { next(e); } });

  const get = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const list = async (sql, args = []) => (await db.query(sql, args)).rows;
  const run = (sql, args = []) => db.query(sql, args);
  const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
  const notFound = (res) => res.status(404).send(page('No encontrado', '<h1>Enlace no válido</h1><p><a href="/">Inicio</a></p>'));

  // ---------- sesión ----------
  const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';')
    .map((c) => c.trim().split(/=(.*)/s).slice(0, 2)).filter(([k]) => k));
  async function startSession(req, res, memberId) {
    const token = randomBytes(32).toString('base64url');
    await run('INSERT INTO sessions (token_hash, member_id) VALUES (?, ?)', [sha(token), memberId]);
    res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${req.secure ? '; Secure' : ''}`);
  }
  const currentMember = async (req) => {
    const t = cookies(req).sid;
    if (!t) return null;
    return get(`SELECT m.*, g.name AS group_name, g.code, g.drawn FROM sessions s
      JOIN members m ON m.id = s.member_id JOIN secret_groups g ON g.id = m.group_id
      WHERE s.token_hash = ? AND s.created_at > now() - interval '${SESSION_DAYS} days'`, [sha(t)]);
  };
  const needLogin = (fn) => wrap(async (req, res) => {
    const me = await currentMember(req);
    if (!me) return res.redirect('/');
    return fn(req, res, me);
  });
  const origin = (req) => `${req.protocol}://${req.get('host')}`;

  // ---------- inicio y grupo ----------
  const homeView = (flash = '') => page('Amigo Secreto', `
    <h1>🎄 Amigo Secreto</h1>${flash && `<p class="err">${esc(flash)}</p>`}
    <form class="card" method="post" action="/login">
      <h2>Entrar</h2>
      <label>Tu nombre</label><input name="name" required maxlength="40" autocomplete="username">
      <label>Tu contraseña</label><input name="password" type="password" required autocomplete="current-password">
      <button>Entrar</button></form>
    <form class="card" method="post" action="/groups">
      <h2>Crear un grupo nuevo</h2>
      <label>Nombre del grupo</label><input name="group" required maxlength="60" value="Navidad en familia">
      <label>Tu nombre</label><input name="name" required maxlength="40" autocomplete="username">
      <label>Tu contraseña</label><input name="password" type="password" required minlength="${MIN_PASS}" autocomplete="new-password">
      <p class="muted">Serás quien organiza y hace el sorteo. Luego compartes el link del grupo con tu familia.</p>
      <button>Crear grupo</button></form>
    <form class="card" method="get" action="/go">
      <h2>¿Ya tienes el código de tu grupo?</h2>
      <input name="code" required placeholder="Código o link">
      <button>Ir al grupo</button></form>`);

  app.get('/', wrap(async (req, res) => {
    (await currentMember(req)) ? res.redirect('/me') : res.send(homeView());
  }));

  app.get('/go', (req, res) => {
    const code = String(req.query.code || '').split('/g/').pop().replace(/[^a-z0-9]/gi, '').toLowerCase();
    res.redirect(code ? `/g/${code}` : '/');
  });

  // Entrar desde la página principal: si el nombre existe en varios grupos, se usa el más reciente
  // donde la contraseña coincida.
  app.post('/login', wrap(async (req, res) => {
    const pw = String(req.body.password || '');
    const rows = await list('SELECT * FROM members WHERE name_key = ? ORDER BY group_id DESC', [nameKey(cleanName(req.body.name))]);
    let found = null;
    for (const m of rows) if (await checkPassword(pw, m.pass_hash)) { found = m; break; }
    if (!found) return res.status(401).send(homeView('Nombre o contraseña incorrectos.'));
    await startSession(req, res, found.id);
    res.redirect('/me');
  }));

  app.post('/groups', wrap(async (req, res) => {
    const group = String(req.body.group || '').trim().slice(0, 60);
    const name = cleanName(req.body.name);
    const pw = String(req.body.password || '');
    if (!group || !name) return res.status(400).send(homeView('Faltan datos.'));
    if (pw.length < MIN_PASS) return res.status(400).send(homeView(`La contraseña debe tener al menos ${MIN_PASS} caracteres.`));
    const hash = await hashPassword(pw);
    const memberId = await db.tx(async (t) => {
      const g = (await t.query('INSERT INTO secret_groups (name, code) VALUES (?, ?) RETURNING id', [group, newCode()])).rows[0];
      return (await t.query('INSERT INTO members (group_id, name, name_key, pass_hash, is_admin) VALUES (?, ?, ?, ?, 1) RETURNING id',
        [g.id, name, nameKey(name), hash])).rows[0].id;
    });
    await startSession(req, res, memberId);
    res.redirect('/me');
  }));

  const groupView = (g, flash = '') => page(g.name, `
    <h1>🎄 ${esc(g.name)}</h1>${flash && `<p class="err">${esc(flash)}</p>`}
    <form class="card" method="post" action="/g/${g.code}/login">
      <h2>Entrar</h2>
      <label>Tu nombre</label><input name="name" required maxlength="40" autocomplete="username">
      <label>Tu contraseña</label><input name="password" type="password" required autocomplete="current-password">
      <button>Entrar</button></form>
    ${g.drawn ? '<p class="muted">El sorteo ya se hizo: ya no se pueden crear cuentas nuevas.</p>' : `
    <form class="card" method="post" action="/g/${g.code}/join">
      <h2>Soy nuevo: crear mi cuenta</h2>
      <label>Tu nombre</label><input name="name" required maxlength="40" autocomplete="username">
      <label>Elige una contraseña</label><input name="password" type="password" required minlength="${MIN_PASS}" autocomplete="new-password">
      <p class="muted">Tu nombre queda registrado y nadie más podrá usarlo. Anota tu contraseña.</p>
      <button>Crear mi cuenta</button></form>`}`);

  const groupByCode = (code) => get('SELECT * FROM secret_groups WHERE code = ?', [String(code).toLowerCase()]);

  app.get('/g/:code', wrap(async (req, res) => {
    const g = await groupByCode(req.params.code);
    if (!g) return notFound(res);
    const me = await currentMember(req);
    if (me && me.group_id === g.id) return res.redirect('/me');
    res.send(groupView(g));
  }));

  app.post('/g/:code/join', wrap(async (req, res) => {
    const g = await groupByCode(req.params.code);
    if (!g) return notFound(res);
    const name = cleanName(req.body.name);
    const pw = String(req.body.password || '');
    if (g.drawn) return res.status(409).send(groupView(g, 'El sorteo ya se hizo.'));
    if (!name) return res.status(400).send(groupView(g, 'Escribe tu nombre.'));
    if (pw.length < MIN_PASS) return res.status(400).send(groupView(g, `La contraseña debe tener al menos ${MIN_PASS} caracteres.`));
    if (+(await get('SELECT count(*)::int AS n FROM members WHERE group_id = ?', [g.id])).n >= MAX)
      return res.status(400).send(groupView(g, `El grupo ya tiene el máximo de ${MAX} personas.`));
    let id;
    try {
      id = (await run('INSERT INTO members (group_id, name, name_key, pass_hash) VALUES (?, ?, ?, ?) RETURNING id',
        [g.id, name, nameKey(name), await hashPassword(pw)])).rows[0].id;
    } catch {
      return res.status(400).send(groupView(g, 'Ese nombre ya está registrado. Si eres tú, entra con tu contraseña.'));
    }
    await startSession(req, res, id);
    res.redirect('/me');
  }));

  app.post('/g/:code/login', wrap(async (req, res) => {
    const g = await groupByCode(req.params.code);
    if (!g) return notFound(res);
    const m = await get('SELECT * FROM members WHERE group_id = ? AND name_key = ?', [g.id, nameKey(cleanName(req.body.name))]);
    const ok = m && (await checkPassword(String(req.body.password || ''), m.pass_hash));
    if (!ok) return res.status(401).send(groupView(g, 'Nombre o contraseña incorrectos.'));
    await startSession(req, res, m.id);
    res.redirect('/me');
  }));

  app.post('/me/logout', wrap(async (req, res) => {
    const t = cookies(req).sid;
    if (t) await run('DELETE FROM sessions WHERE token_hash = ?', [sha(t)]);
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    res.redirect('/');
  }));

  // ---------- panel de cada persona ----------
  async function dashboard(req, me, flash = '', kind = 'msg') {
    const members = await list('SELECT id, name, wishes, is_admin FROM members WHERE group_id = ? ORDER BY id', [me.group_id]);
    const link = `${origin(req)}/g/${me.code}`;

    let giftee = '';
    if (me.drawn && me.giftee_id) {
      const g = members.find((m) => m.id === me.giftee_id);
      giftee = `<div class="card"><h2>🤫 Te tocó regalarle a: ${esc(g.name)}</h2><p>Sus ideas de regalo:</p>
        <div class="gift">${g.wishes.trim() ? esc(g.wishes) : '<span class="muted">Todavía no escribió nada. Vuelve a entrar más tarde.</span>'}</div></div>`;
    } else if (!me.drawn) giftee = '<div class="card"><p class="muted">El sorteo aún no se hace. Cuando se haga, aquí verás a quién le toca regalarle.</p></div>';

    let admin = '';
    if (me.is_admin) {
      const done = members.filter((m) => m.wishes.trim()).length;
      const pending = members.length - done;
      const rows = members.map((m) => `<li><span>${esc(m.name)}${m.is_admin ? ' <span class="muted">(organiza)</span>' : ''}</span><span>
        ${m.wishes.trim() ? '<span class="ok">✔ ya escribió</span>' : '<span class="muted">pendiente</span>'}
        ${m.id === me.id ? '' : `<form method="post" action="/me/reset" style="display:inline" onsubmit="return confirm('¿Crear una contraseña temporal para esta persona?')"><input type="hidden" name="id" value="${m.id}"><button class="link">olvidó su clave</button></form>
        ${me.drawn ? '' : `<form method="post" action="/me/remove" style="display:inline" onsubmit="return confirm('¿Quitar a esta persona del grupo?')"><input type="hidden" name="id" value="${m.id}"><button class="link">quitar</button></form>`}`}</span></li>`).join('');
      admin = `<h2>Organización</h2>
        <div class="card"><strong>${done} de ${members.length} ya escribieron sus ideas</strong>
          <progress value="${done}" max="${members.length || 1}" style="width:100%"></progress>
          ${me.drawn ? '' : pending ? `<p class="muted">Faltan ${pending}. Puedes esperar a que todos terminen antes de sortear.</p>` : '<p class="ok">✔ Todos completaron. Ya puedes sortear.</p>'}
          <ul>${rows}</ul></div>
        ${me.drawn ? '<p class="msg">✅ El sorteo ya se hizo. Nadie (ni tú) puede ver quién le tocó a quién.</p>' : `
        <form class="card" method="post" action="/me/draw" onsubmit="return confirm('${pending ? `Todavía faltan ${pending} por escribir sus ideas. ` : ''}¿Hacer el sorteo? Ya no se podrán agregar ni quitar personas.')">
          <p>Cuando todos estén listos, haz el sorteo. Cada uno verá su resultado al entrar.</p>
          <button class="danger" ${members.length < 3 ? 'disabled' : ''}>🎲 Sortear</button>${members.length < 3 ? '<p class="muted">Se necesitan al menos 3 personas.</p>' : ''}</form>`}`;
    }

    return page(me.group_name, `<h1>🎄 ${esc(me.group_name)}</h1>
      <p>Hola, <strong>${esc(me.name)}</strong> · ${members.length} persona${members.length === 1 ? '' : 's'} en el grupo</p>
      ${flash && `<p class="${kind}">${flash}</p>`}
      ${giftee}
      <form class="card" method="post" action="/me/wishes">
        <label>Tus ideas de regalo</label>
        <textarea name="wishes" maxlength="2000" placeholder="Libros, un buzo talla M, chocolates...">${esc(me.wishes)}</textarea>
        <p class="muted">Solo la persona que te toque podrá leer esto.</p>
        <button>Guardar</button></form>
      ${admin}
      <div class="card"><p>Link para que se unan tus familiares:</p><input readonly value="${esc(link)}" onclick="this.select()">
        <p class="muted">Código del grupo: <strong>${esc(me.code)}</strong></p></div>
      <details class="card"><summary>Cambiar mi contraseña</summary>
        <form method="post" action="/me/password"><label>Contraseña actual</label><input name="current" type="password" required autocomplete="current-password">
        <label>Contraseña nueva</label><input name="password" type="password" required minlength="${MIN_PASS}" autocomplete="new-password"><button>Cambiar</button></form></details>
      <form method="post" action="/me/logout"><button class="link">Cerrar sesión</button></form>`);
  }

  app.get('/me', needLogin(async (req, res, me) => res.send(await dashboard(req, me))));

  app.post('/me/wishes', needLogin(async (req, res, me) => {
    const wishes = String(req.body.wishes || '').slice(0, 2000);
    await run('UPDATE members SET wishes = ? WHERE id = ?', [wishes, me.id]);
    res.send(await dashboard(req, { ...me, wishes }, '¡Guardado! 🎁'));
  }));

  app.post('/me/password', needLogin(async (req, res, me) => {
    const pw = String(req.body.password || '');
    if (!(await checkPassword(String(req.body.current || ''), me.pass_hash))) return res.status(400).send(await dashboard(req, me, 'La contraseña actual no es correcta.', 'err'));
    if (pw.length < MIN_PASS) return res.status(400).send(await dashboard(req, me, `La nueva debe tener al menos ${MIN_PASS} caracteres.`, 'err'));
    await run('UPDATE members SET pass_hash = ? WHERE id = ?', [await hashPassword(pw), me.id]);
    res.send(await dashboard(req, me, 'Contraseña cambiada ✔'));
  }));

  // ---------- acciones de quien organiza ----------
  const needAdmin = (fn) => needLogin(async (req, res, me) => {
    if (!me.is_admin) return res.status(403).send(await dashboard(req, me, 'Solo quien organiza puede hacer eso.', 'err'));
    return fn(req, res, me);
  });
  const targetMember = (req, me) => get('SELECT * FROM members WHERE id = ? AND group_id = ?', [Number(req.body.id) || 0, me.group_id]);

  app.post('/me/remove', needAdmin(async (req, res, me) => {
    const m = await targetMember(req, me);
    if (me.drawn) return res.status(409).send(await dashboard(req, me, 'El sorteo ya se hizo.', 'err'));
    if (m && m.id !== me.id) await run('DELETE FROM members WHERE id = ?', [m.id]);
    res.redirect('/me');
  }));

  app.post('/me/reset', needAdmin(async (req, res, me) => {
    const m = await targetMember(req, me);
    if (!m || m.id === me.id) return res.redirect('/me');
    const temp = randomBytes(4).toString('hex'); // 8 caracteres
    await run('UPDATE members SET pass_hash = ? WHERE id = ?', [await hashPassword(temp), m.id]);
    await run('DELETE FROM sessions WHERE member_id = ?', [m.id]);
    res.send(await dashboard(req, me, `Contraseña temporal de <strong>${esc(m.name)}</strong>: <strong>${temp}</strong>. Pásasela; podrá cambiarla al entrar.`));
  }));

  app.post('/me/draw', needAdmin(async (req, res, me) => {
    const ms = await list('SELECT id FROM members WHERE group_id = ?', [me.group_id]);
    if (me.drawn || ms.length < 3) return res.status(409).send(await dashboard(req, me, 'No se puede sortear.', 'err'));
    const pairs = draw(ms.map((m) => m.id));
    // Transacción; "drawn = 0" evita sortear dos veces (doble clic o dos pestañas).
    await db.tx(async (t) => {
      const r = await t.query('UPDATE secret_groups SET drawn = 1 WHERE id = ? AND drawn = 0', [me.group_id]);
      if (r.rowCount !== 1) return;
      for (const [giver, giftee] of pairs) await t.query('UPDATE members SET giftee_id = ? WHERE id = ?', [giftee, giver]);
    });
    res.redirect('/me');
  }));

  return app;
}

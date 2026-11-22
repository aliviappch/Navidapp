import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { draw } from './src/draw.js';
import { openDb } from './src/db.js';
import { schema } from './src/schema.js';
import { createApp } from './src/create-app.js';

test('sorteo: sin auto-asignación, todos reciben una vez', () => {
  for (let n = 3; n <= 20; n++) for (let r = 0; r < 200; r++) {
    const ids = Array.from({ length: n }, (_, i) => i);
    const pairs = draw(ids);
    assert.equal(new Set(pairs.map((p) => p[1])).size, n);
    assert.ok(pairs.every(([a, b]) => a !== b));
  }
  assert.throws(() => draw([1, 2]));
});

test('schema.js coincide con supabase/schema.sql', () => {
  const sql = readFileSync(new URL('./supabase/schema.sql', import.meta.url), 'utf8')
    .split('\n').filter((l) => !l.startsWith('--')).join('\n').trim();
  assert.equal(schema.trim(), sql);
});

test('cuentas, sorteo y privacidad', async () => {
  const db = await openDb(':memory:');
  const server = createApp(db).listen(0);
  const base = `http://localhost:${server.address().port}`;
  const req = async (method, path, who, body) => {
    const res = await fetch(base + path, {
      method, redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...(who?.cookie ? { cookie: who.cookie } : {}) },
      body: body ? new URLSearchParams(body) : undefined,
    });
    const sc = res.headers.getSetCookie?.()[0];
    if (sc && who) who.cookie = sc.split(';')[0];
    return { status: res.status, loc: res.headers.get('location'), html: await res.text() };
  };
  const ana = {}, beto = {}, cata = {}, intruso = {};

  // sin sesión no se ve nada
  assert.equal((await req('GET', '/me', intruso)).loc, '/');

  // Ana crea el grupo y queda como organizadora
  let r = await req('POST', '/groups', ana, { group: 'Navidad', name: 'Ana', password: 'clave1' });
  assert.equal(r.loc, '/me');
  const code = (await db.query('SELECT code FROM secret_groups')).rows[0].code;

  // Otros se unen; el nombre no se puede repetir (ni con mayúsculas ni tildes)
  assert.equal((await req('POST', `/g/${code}/join`, beto, { name: 'Beto', password: 'clave2' })).loc, '/me');
  assert.equal((await req('POST', `/g/${code}/join`, cata, { name: 'Cata', password: 'clave3' })).loc, '/me');
  r = await req('POST', `/g/${code}/join`, intruso, { name: ' BETO ', password: 'otra' });
  assert.equal(r.status, 400);
  assert.ok(r.html.includes('ya está registrado'));
  r = await req('POST', `/g/${code}/join`, intruso, { name: 'Ána', password: 'otra' });
  assert.equal(r.status, 400);

  // Entrar: con la clave correcta sí; con otra no
  assert.equal((await req('POST', `/g/${code}/login`, intruso, { name: 'beto', password: 'mala' })).status, 401);
  assert.equal((await req('POST', `/g/${code}/login`, {}, { name: 'beto', password: 'clave2' })).loc, '/me');

  // Entrar desde la página principal (sin el link del grupo)
  assert.equal((await req('POST', '/login', {}, { name: 'Beto', password: 'clave2' })).loc, '/me');
  assert.equal((await req('POST', '/login', {}, { name: 'Beto', password: 'mala' })).status, 401);

  // Contador de quién escribió
  assert.ok((await req('GET', '/me', ana)).html.includes('0 de 3 ya escribieron'));
  const users = { Ana: ana, Beto: beto, Cata: cata };
  for (const [n, u] of Object.entries(users)) await req('POST', '/me/wishes', u, { wishes: `deseo de ${n}` });
  assert.ok((await req('GET', '/me', ana)).html.includes('3 de 3 ya escribieron'));
  // Antes del sorteo nadie lee las ideas de otros (ni la organizadora)
  const betoHtml = (await req('GET', '/me', beto)).html;
  assert.ok(!betoHtml.includes('deseo de Ana') && !betoHtml.includes('deseo de Cata'));
  assert.ok(!(await req('GET', '/me', ana)).html.includes('deseo de Beto'));

  // Solo la organizadora sortea
  assert.equal((await req('POST', '/me/draw', beto)).status, 403);
  await req('POST', '/me/draw', ana);
  const snapshot = async () => JSON.stringify((await db.query('SELECT id, giftee_id FROM members ORDER BY id')).rows);
  const before = await snapshot();
  await Promise.all([req('POST', '/me/draw', ana), req('POST', '/me/draw', ana)]); // doble clic
  assert.equal(await snapshot(), before);

  // Cada uno ve SOLO a quién le tocó (la organizadora también)
  const rows = (await db.query('SELECT id, name, giftee_id FROM members')).rows;
  for (const row of rows) {
    const html = (await req('GET', '/me', users[row.name])).html;
    const g = rows.find((x) => x.id === row.giftee_id);
    assert.notEqual(g.name, row.name);
    assert.ok(html.includes(`Te tocó regalarle a: ${g.name}`));
    assert.ok(html.includes(`deseo de ${g.name}`));
    for (const other of rows.filter((x) => x.id !== g.id && x.id !== row.id))
      assert.ok(!html.includes(`deseo de ${other.name}`)); // solo las ideas de a quien le tocó
    for (const other of rows.filter((x) => x.id !== g.id && x.id !== row.id))
      assert.ok(!html.includes(`Te tocó regalarle a: ${other.name}`));
  }

  // Nadie puede unirse después del sorteo
  assert.equal((await req('POST', `/g/${code}/join`, {}, { name: 'Tarde', password: 'clave9' })).status, 409);

  // Contraseña olvidada: la organizadora da una temporal; la sesión vieja deja de valer
  const m = (await db.query("SELECT id FROM members WHERE name = 'Beto'")).rows[0];
  r = await req('POST', '/me/reset', ana, { id: String(m.id) });
  const temp = r.html.match(/Beto<\/strong>: <strong>([0-9a-f]{8})</)[1];
  assert.equal((await req('GET', '/me', beto)).loc, '/');
  const beto2 = {};
  assert.equal((await req('POST', `/g/${code}/login`, beto2, { name: 'Beto', password: temp })).loc, '/me');
  r = await req('POST', '/me/password', beto2, { current: temp, password: 'nueva1' });
  assert.ok(r.html.includes('Contraseña cambiada'));
  assert.equal((await req('POST', `/g/${code}/login`, {}, { name: 'Beto', password: 'nueva1' })).loc, '/me');

  server.close();
});

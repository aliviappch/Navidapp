import test from 'node:test';
import assert from 'node:assert/strict';
import { draw } from './src/draw.js';
import { openDb } from './src/db.js';
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

test('flujo completo y privacidad', async () => {
  const db = await openDb(':memory:');
  const server = createApp(db, 'http://x').listen(0);
  const base = `http://localhost:${server.address().port}`;
  const post = (u, o) => fetch(base + u, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o) });
  const r = await post('/events', { name: 'T', organizer: 'a@a.com', emails: 'a@a.com b@a.com c@a.com' });
  const admin = r.headers.get('location');
  const ps = (await db.query('SELECT * FROM participants')).rows;
  for (const p of ps) await post(`/p/${p.token}`, { name: p.email[0], wishes: `deseo de ${p.email}` });
  await post(`${admin}/draw`, {});
  const before = JSON.stringify((await db.query('SELECT id, giftee_id FROM participants ORDER BY id')).rows);
  await Promise.all([post(`${admin}/draw`, {}), post(`${admin}/draw`, {})]); // doble clic
  assert.equal(JSON.stringify((await db.query('SELECT id, giftee_id FROM participants ORDER BY id')).rows), before);
  const adminHtml = await (await fetch(base + admin)).text();
  assert.ok(!/Te tocó/.test(adminHtml) && !ps.some((p) => adminHtml.includes('deseo de')));
  for (const p of (await db.query('SELECT * FROM participants')).rows) {
    const html = await (await fetch(`${base}/p/${p.token}`)).text();
    const g = ps.find((x) => x.id === p.giftee_id);
    assert.ok(html.includes(`deseo de ${g.email}`));
    assert.ok(!ps.filter((x) => x.id !== g.id).some((x) => html.includes(`deseo de ${x.email}`) && x.id !== p.id));
  }
  server.close();
});

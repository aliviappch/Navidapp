import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const numbered = (sql) => { let n = 0; return sql.replace(/\?/g, () => `$${++n}`); }; // ? → $1, $2…

// Interfaz común: query(sql, args) → { rows, rowCount }; tx(fn) → fn recibe { query }.
// Producción: DATABASE_URL (Supabase). Local/tests: Postgres embebido (PGlite).
export async function openDb(url = process.env.DATABASE_URL) {
  if (url && url !== ':memory:') {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false }, // Supabase exige SSL
      max: Number(process.env.PG_POOL_MAX || 3),
    });
    const wrap = (c) => ({
      query: async (sql, a = []) => {
        const r = await c.query(numbered(sql), a);
        return { rows: r.rows, rowCount: r.rowCount };
      },
    });
    await pool.query(schema);
    return {
      ...wrap(pool),
      async tx(fn) {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const out = await fn(wrap(c));
          await c.query('COMMIT');
          return out;
        } catch (e) {
          await c.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          c.release();
        }
      },
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const lite = new PGlite(url === ':memory:' ? undefined : process.env.PGLITE_DIR || '.pgdata');
  const wrap = (c) => ({
    query: async (sql, a = []) => {
      const r = await c.query(numbered(sql), a);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  });
  await lite.exec(schema);
  return { ...wrap(lite), tx: (fn) => lite.transaction((t) => fn(wrap(t))) };
}

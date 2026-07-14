'use strict';
/* Aplica las migraciones en orden y deja registro de las ya aplicadas.
 * Cada producto migra su propia base: SBC-NG no toca la de la central. */
const fs = require('fs');
const path = require('path');
const db = require('./db');

const DIR = process.env.MIGRATIONS_DIR || '/app/migrations';

(async () => {
  await db.esperar();
  await db.pool.query(`CREATE TABLE IF NOT EXISTS sbc_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);

  const hechas = new Set((await db.get('SELECT name FROM sbc_migrations')).map(r => r.name));
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();

  for (const f of files) {
    if (hechas.has(f)) { console.log('  ·', f, '(ya estaba)'); continue; }
    const sql = fs.readFileSync(path.join(DIR, f), 'utf8');
    const c = await db.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(sql);
      await c.query('INSERT INTO sbc_migrations (name) VALUES ($1)', [f]);
      await c.query('COMMIT');
      console.log('  ✓', f);
    } catch (e) {
      await c.query('ROLLBACK');
      console.error('  ✗', f, '→', e.message);
      process.exit(1);
    } finally { c.release(); }
  }
  console.log('[SBC-NG] base al día');
  process.exit(0);
})();

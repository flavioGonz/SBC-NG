'use strict';
/* La base del SBC. Es SUYA: no comparte una sola tabla con la central. */
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: +(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'sbcng',
  user: process.env.DB_USER || 'sbcng',
  password: process.env.DB_PASS || '',
  max: 10,
});

// La base tarda unos segundos en aceptar conexiones cuando arranca el stack.
async function esperar(intentos = 30) {
  for (let i = 0; i < intentos; i++) {
    try { await pool.query('SELECT 1'); return true; }
    catch (_) { await new Promise(r => setTimeout(r, 1000)); }
  }
  throw new Error('la base de datos no responde');
}

const get = async (sql, args = []) => (await pool.query(sql, args)).rows;
const one = async (sql, args = []) => (await pool.query(sql, args)).rows[0] || null;

module.exports = { pool, esperar, get, one };

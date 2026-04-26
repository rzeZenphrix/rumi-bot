const { Pool } = require('pg');

let pool = null;

function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    ''
  );
}

function hasDatabaseConfigured() {
  return Boolean(getDatabaseUrl());
}

function getPool() {
  if (pool) return pool;

  const connectionString = getDatabaseUrl();

  if (!connectionString) {
    throw new Error(
      'Missing database URL. Add DATABASE_URL or SUPABASE_DB_URL to your .env.'
    );
  }

  pool = new Pool({
    connectionString,
    ssl:
      process.env.DB_SSL === 'false'
        ? false
        : {
            rejectUnauthorized: false
          },
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000
  });

  return pool;
}

async function query(text, params = []) {
  const pg = getPool();
  return pg.query(text, params);
}

async function one(text, params = []) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

async function many(text, params = []) {
  const result = await query(text, params);
  return result.rows;
}

async function exec(text, params = []) {
  await query(text, params);
  return true;
}

async function close() {
  if (!pool) return;
  await pool.end();
  pool = null;
}

module.exports = {
  getPool,
  hasDatabaseConfigured,
  query,
  one,
  many,
  exec,
  close
};
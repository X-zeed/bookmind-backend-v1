// ─────────────────────────────────────────────
// db.js — Neon PostgreSQL connection pool
// ─────────────────────────────────────────────
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  console.error("Unexpected pool error:", err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};

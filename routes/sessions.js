// ─────────────────────────────────────────────
// routes/sessions.js — Reading session timer
// ─────────────────────────────────────────────
const router = require("express").Router();
const db = require("../db");

// GET /api/sessions?book_id=&date=&limit=
router.get("/", async (req, res, next) => {
  try {
    const { book_id, date, limit } = req.query;
    let sql = `
      SELECT rs.*, b.title AS book_title
      FROM reading_sessions rs
      LEFT JOIN books b ON b.id = rs.book_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (book_id) { sql += ` AND rs.book_id = $${idx++}`; params.push(book_id); }
    if (date) { sql += ` AND rs.session_date = $${idx++}`; params.push(date); }
    sql += " ORDER BY rs.created_at DESC";
    if (limit) { sql += ` LIMIT $${idx++}`; params.push(parseInt(limit)); }

    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/sessions/today
router.get("/today", async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT COALESCE(SUM(duration_minutes), 0) AS total_minutes,
              COUNT(*) AS session_count
       FROM reading_sessions WHERE session_date = CURRENT_DATE`
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/sessions
router.post("/", async (req, res, next) => {
  try {
    const { book_id, duration_minutes, pages_read, session_date } = req.body;
    const { rows } = await db.query(
      `INSERT INTO reading_sessions (book_id, duration_minutes, pages_read, session_date)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [book_id || null, duration_minutes, pages_read || 0, session_date || new Date().toISOString().split("T")[0]]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/sessions/:id
router.delete("/:id", async (req, res, next) => {
  try {
    await db.query("DELETE FROM reading_sessions WHERE id = $1", [req.params.id]);
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

module.exports = router;

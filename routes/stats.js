// ─────────────────────────────────────────────
// routes/stats.js — Reading statistics
// ─────────────────────────────────────────────
const router = require("express").Router();
const db = require("../db");

// GET /api/stats/overview
router.get("/overview", async (_req, res, next) => {
  try {
    const overview = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed') AS books_completed,
        COUNT(*) FILTER (WHERE status = 'reading')   AS books_reading,
        COUNT(*) FILTER (WHERE status = 'wishlist')   AS books_wishlist,
        COUNT(*)                                       AS books_total,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN total_pages WHEN status = 'reading' THEN current_page ELSE 0 END), 0) AS total_pages_read,
        COALESCE(ROUND(AVG(total_pages) FILTER (WHERE status = 'completed')), 0) AS avg_pages_per_book,
        COALESCE(ROUND(AVG(rating) FILTER (WHERE status = 'completed' AND rating > 0), 1), 0) AS avg_rating
      FROM books
    `);

    const totalTime = await db.query(
      "SELECT COALESCE(SUM(duration_minutes), 0) AS total_minutes FROM reading_sessions"
    );

    res.json({
      ...overview.rows[0],
      total_reading_minutes: parseInt(totalTime.rows[0].total_minutes),
    });
  } catch (err) { next(err); }
});

// GET /api/stats/monthly?year=2026
router.get("/monthly", async (req, res, next) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const { rows } = await db.query(`
      SELECT
        EXTRACT(MONTH FROM completed_at)::INT AS month,
        COUNT(*) AS books_completed,
        COALESCE(SUM(total_pages), 0) AS pages_read
      FROM books
      WHERE status = 'completed'
        AND EXTRACT(YEAR FROM completed_at) = $1
      GROUP BY month ORDER BY month
    `, [year]);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/stats/categories
router.get("/categories", async (_req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT COALESCE(category, 'ไม่ระบุ') AS category, COUNT(*) AS count
      FROM books WHERE status = 'completed'
      GROUP BY category ORDER BY count DESC
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/stats/ratings
router.get("/ratings", async (_req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT rating, COUNT(*) AS count
      FROM books WHERE status = 'completed' AND rating > 0
      GROUP BY rating ORDER BY rating DESC
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/stats/reading-time?days=30
router.get("/reading-time", async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const { rows } = await db.query(`
      SELECT session_date, SUM(duration_minutes) AS minutes
      FROM reading_sessions
      WHERE session_date >= CURRENT_DATE - $1::INT
      GROUP BY session_date ORDER BY session_date
    `, [days]);
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;

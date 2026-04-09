// ─────────────────────────────────────────────
// routes/goals.js — Reading goals
// ─────────────────────────────────────────────
const router = require("express").Router();
const db = require("../db");

// GET /api/goals?year=2026
router.get("/", async (req, res, next) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const { rows } = await db.query(
      "SELECT * FROM goals WHERE year = $1 ORDER BY type, month",
      [year]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/goals  — upsert a goal
router.post("/", async (req, res, next) => {
  try {
    const { type, target, year, month } = req.body;
    const { rows } = await db.query(
      `INSERT INTO goals (type, target, year, month)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (type, year, month)
       DO UPDATE SET target = $2
       RETURNING *`,
      [type, target, year || new Date().getFullYear(), month || null]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/goals/:id
router.delete("/:id", async (req, res, next) => {
  try {
    await db.query("DELETE FROM goals WHERE id = $1", [req.params.id]);
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

module.exports = router;

// ─────────────────────────────────────────────
// routes/streaks.js — Reading streaks
// ─────────────────────────────────────────────
const router = require("express").Router();
const db = require("../db");

// GET /api/streaks
router.get("/", async (_req, res, next) => {
  try {
    const { rows } = await db.query("SELECT * FROM streaks LIMIT 1");
    res.json(rows[0] || { current_streak: 0, longest_streak: 0, last_read_date: null });
  } catch (err) { next(err); }
});

// POST /api/streaks/checkin  — mark today as read
router.post("/checkin", async (_req, res, next) => {
  try {
    const { rows } = await db.query("SELECT * FROM streaks LIMIT 1");
    const streak = rows[0];
    const today = new Date().toISOString().split("T")[0];

    if (streak.last_read_date === today) {
      return res.json(streak); // Already checked in today
    }

    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    let newStreak;

    if (streak.last_read_date === yesterday) {
      newStreak = streak.current_streak + 1;
    } else {
      newStreak = 1;
    }

    const longestStreak = Math.max(newStreak, streak.longest_streak);

    const { rows: updated } = await db.query(
      `UPDATE streaks SET current_streak = $1, longest_streak = $2, last_read_date = $3 WHERE id = $4 RETURNING *`,
      [newStreak, longestStreak, today, streak.id]
    );
    res.json(updated[0]);
  } catch (err) { next(err); }
});

// POST /api/streaks/reset
router.post("/reset", async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      "UPDATE streaks SET current_streak = 0, last_read_date = NULL RETURNING *"
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;

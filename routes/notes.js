// ─────────────────────────────────────────────
// routes/notes.js — Notes, highlights, quotes
// ─────────────────────────────────────────────
const router = require("express").Router();
const db = require("../db");

// GET /api/notes?book_id=&tag=&search=
router.get("/", async (req, res, next) => {
  try {
    const { book_id, tag, search } = req.query;
    let sql = `
      SELECT n.*, b.title AS book_title, b.author AS book_author,
        COALESCE(
          (SELECT json_agg(t.name) FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = n.id),
          '[]'
        ) AS tags
      FROM notes n
      LEFT JOIN books b ON b.id = n.book_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (book_id) {
      sql += ` AND n.book_id = $${idx++}`;
      params.push(book_id);
    }
    if (search) {
      sql += ` AND LOWER(n.text) LIKE $${idx++}`;
      params.push(`%${search.toLowerCase()}%`);
    }
    if (tag) {
      sql += ` AND n.id IN (SELECT nt.note_id FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE t.name = $${idx++})`;
      params.push(tag);
    }
    sql += " ORDER BY n.created_at DESC";

    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/notes/random — Spaced repetition: get random notes
router.get("/random", async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const { rows } = await db.query(
      `SELECT n.*, b.title AS book_title, b.author AS book_author,
        COALESCE(
          (SELECT json_agg(t.name) FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = n.id),
          '[]'
        ) AS tags
       FROM notes n
       LEFT JOIN books b ON b.id = n.book_id
       ORDER BY RANDOM() LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/notes/tags — All tags with counts
router.get("/tags", async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT t.name, COUNT(nt.note_id) AS count
       FROM tags t
       LEFT JOIN note_tags nt ON nt.tag_id = t.id
       GROUP BY t.id, t.name
       ORDER BY count DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/notes
router.post("/", async (req, res, next) => {
  try {
    const { book_id, text, page_number, tags } = req.body;

    const { rows } = await db.query(
      `INSERT INTO notes (book_id, text, page_number)
       VALUES ($1, $2, $3) RETURNING *`,
      [book_id || null, text, page_number || null]
    );
    const note = rows[0];

    // Handle tags
    if (tags && tags.length > 0) {
      for (const tagName of tags) {
        // Upsert tag
        const tagResult = await db.query(
          `INSERT INTO tags (name) VALUES ($1)
           ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [tagName.trim()]
        );
        // Link
        await db.query(
          `INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [note.id, tagResult.rows[0].id]
        );
      }
    }

    // Return with tags
    const full = await db.query(
      `SELECT n.*, b.title AS book_title,
        COALESCE(
          (SELECT json_agg(t.name) FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = n.id),
          '[]'
        ) AS tags
       FROM notes n LEFT JOIN books b ON b.id = n.book_id WHERE n.id = $1`,
      [note.id]
    );
    res.status(201).json(full.rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/notes/:id
router.put("/:id", async (req, res, next) => {
  try {
    const { text, page_number, tags } = req.body;

    await db.query(
      `UPDATE notes SET text = COALESCE($1, text), page_number = COALESCE($2, page_number) WHERE id = $3`,
      [text, page_number, req.params.id]
    );

    // Replace tags
    if (tags !== undefined) {
      await db.query("DELETE FROM note_tags WHERE note_id = $1", [req.params.id]);
      for (const tagName of (tags || [])) {
        const tagResult = await db.query(
          `INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          [tagName.trim()]
        );
        await db.query(
          `INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [req.params.id, tagResult.rows[0].id]
        );
      }
    }

    const { rows } = await db.query(
      `SELECT n.*, b.title AS book_title,
        COALESCE(
          (SELECT json_agg(t.name) FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = n.id),
          '[]'
        ) AS tags
       FROM notes n LEFT JOIN books b ON b.id = n.book_id WHERE n.id = $1`,
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/notes/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const { rowCount } = await db.query("DELETE FROM notes WHERE id = $1", [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: "Note not found" });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

module.exports = router;

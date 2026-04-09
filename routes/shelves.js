// ─────────────────────────────────────────────
// routes/shelves.js — Bookshelves / collections
// ─────────────────────────────────────────────
const router = require("express").Router();
const db = require("../db");

// GET /api/shelves
router.get("/", async (_req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT s.*,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'id', b.id, 'title', b.title, 'author', b.author,
            'cover_color', b.cover_color, 'cover_image', b.cover_image, 'status', b.status
          ) ORDER BY sb.added_at)
          FROM shelf_books sb JOIN books b ON b.id = sb.book_id
          WHERE sb.shelf_id = s.id),
          '[]'
        ) AS books
      FROM shelves s ORDER BY s.created_at DESC
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/shelves/:id
router.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT s.*,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'id', b.id, 'title', b.title, 'author', b.author,
            'cover_color', b.cover_color, 'cover_image', b.cover_image, 'status', b.status, 'rating', b.rating
          ) ORDER BY sb.added_at)
          FROM shelf_books sb JOIN books b ON b.id = sb.book_id
          WHERE sb.shelf_id = s.id),
          '[]'
        ) AS books
      FROM shelves s WHERE s.id = $1
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Shelf not found" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/shelves
router.post("/", async (req, res, next) => {
  try {
    const { name, description, book_ids } = req.body;
    const { rows } = await db.query(
      "INSERT INTO shelves (name, description) VALUES ($1, $2) RETURNING *",
      [name, description]
    );
    const shelf = rows[0];

    if (book_ids && book_ids.length > 0) {
      const values = book_ids.map((bid, i) => `($1, $${i + 2})`).join(",");
      await db.query(
        `INSERT INTO shelf_books (shelf_id, book_id) VALUES ${values} ON CONFLICT DO NOTHING`,
        [shelf.id, ...book_ids]
      );
    }
    res.status(201).json(shelf);
  } catch (err) { next(err); }
});

// PUT /api/shelves/:id
router.put("/:id", async (req, res, next) => {
  try {
    const { name, description, book_ids } = req.body;
    await db.query(
      "UPDATE shelves SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3",
      [name, description, req.params.id]
    );

    if (book_ids !== undefined) {
      await db.query("DELETE FROM shelf_books WHERE shelf_id = $1", [req.params.id]);
      if (book_ids.length > 0) {
        const values = book_ids.map((_, i) => `($1, $${i + 2})`).join(",");
        await db.query(
          `INSERT INTO shelf_books (shelf_id, book_id) VALUES ${values} ON CONFLICT DO NOTHING`,
          [req.params.id, ...book_ids]
        );
      }
    }
    res.json({ updated: true });
  } catch (err) { next(err); }
});

// POST /api/shelves/:id/books — add a book
router.post("/:id/books", async (req, res, next) => {
  try {
    const { book_id } = req.body;
    await db.query(
      "INSERT INTO shelf_books (shelf_id, book_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [req.params.id, book_id]
    );
    res.json({ added: true });
  } catch (err) { next(err); }
});

// DELETE /api/shelves/:id/books/:bookId
router.delete("/:id/books/:bookId", async (req, res, next) => {
  try {
    await db.query(
      "DELETE FROM shelf_books WHERE shelf_id = $1 AND book_id = $2",
      [req.params.id, req.params.bookId]
    );
    res.json({ removed: true });
  } catch (err) { next(err); }
});

// DELETE /api/shelves/:id
router.delete("/:id", async (req, res, next) => {
  try {
    await db.query("DELETE FROM shelves WHERE id = $1", [req.params.id]);
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

module.exports = router;

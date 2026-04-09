// ─────────────────────────────────────────────
// routes/books.js — Book management CRUD + Cover Image Upload
// ─────────────────────────────────────────────
const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");

// ── Multer config for cover images ──
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, "..", "uploads", "covers");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|webp|gif)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error("Only image files (jpg, png, webp, gif) are allowed"));
    }
  },
});

// ── Helper: delete old cover file from disk ──
function deleteOldCover(coverImage) {
  if (!coverImage) return;
  const fullPath = path.join(__dirname, "..", coverImage);
  fs.unlink(fullPath, () => {}); // silently ignore errors
}

// ──────────────────────────────────────────────
// GET  /api/books?status=&category=&search=
// ──────────────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const { status, category, search } = req.query;
    let sql = "SELECT * FROM books WHERE 1=1";
    const params = [];
    let idx = 1;

    if (status) { sql += ` AND status = $${idx++}`; params.push(status); }
    if (category) { sql += ` AND category = $${idx++}`; params.push(category); }
    if (search) {
      sql += ` AND (LOWER(title) LIKE $${idx} OR LOWER(author) LIKE $${idx})`;
      params.push(`%${search.toLowerCase()}%`);
      idx++;
    }
    sql += " ORDER BY updated_at DESC";

    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────
// GET  /api/books/:id
// ──────────────────────────────────────────────
router.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await db.query("SELECT * FROM books WHERE id = $1", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Book not found" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────
// POST /api/books  (multipart/form-data with optional cover_image file)
// ──────────────────────────────────────────────
router.post("/", upload.single("cover_image"), async (req, res, next) => {
  try {
    const { title, author, category, total_pages, current_page, status, rating, review, cover_color } = req.body;
    const cover_image = req.file ? `uploads/covers/${req.file.filename}` : null;
    const started_at = status === "reading" ? new Date() : null;
    const completed_at = status === "completed" ? new Date() : null;

    const { rows } = await db.query(
      `INSERT INTO books (title, author, category, total_pages, current_page, status, rating, review, cover_color, cover_image, started_at, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        title, author || "", category,
        parseInt(total_pages) || 0, parseInt(current_page) || 0,
        status || "wishlist", parseInt(rating) || 0, review,
        cover_color, cover_image, started_at, completed_at,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────
// PUT /api/books/:id  (multipart/form-data with optional cover_image file)
// ──────────────────────────────────────────────
router.put("/:id", upload.single("cover_image"), async (req, res, next) => {
  try {
    const { title, author, category, total_pages, current_page, status, rating, review, cover_color } = req.body;

    const existing = (await db.query("SELECT status, cover_image FROM books WHERE id = $1", [req.params.id])).rows[0];
    if (!existing) return res.status(404).json({ error: "Book not found" });

    let started_at = undefined;
    let completed_at = undefined;
    if (existing.status !== "reading" && status === "reading") started_at = new Date();
    if (existing.status !== "completed" && status === "completed") completed_at = new Date();

    // If new image uploaded, replace old one
    let cover_image = undefined;
    if (req.file) {
      cover_image = `uploads/covers/${req.file.filename}`;
      deleteOldCover(existing.cover_image);
    }

    const { rows } = await db.query(
      `UPDATE books SET
        title = COALESCE($1, title),
        author = COALESCE($2, author),
        category = COALESCE($3, category),
        total_pages = COALESCE($4, total_pages),
        current_page = COALESCE($5, current_page),
        status = COALESCE($6, status),
        rating = COALESCE($7, rating),
        review = COALESCE($8, review),
        cover_color = COALESCE($9, cover_color),
        cover_image = COALESCE($10, cover_image),
        started_at = COALESCE($11, started_at),
        completed_at = COALESCE($12, completed_at)
       WHERE id = $13 RETURNING *`,
      [
        title, author, category,
        total_pages !== undefined ? parseInt(total_pages) : undefined,
        current_page !== undefined ? parseInt(current_page) : undefined,
        status,
        rating !== undefined ? parseInt(rating) : undefined,
        review, cover_color, cover_image,
        started_at, completed_at, req.params.id,
      ]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────
// POST /api/books/:id/cover  — Upload/replace cover image only
// ──────────────────────────────────────────────
router.post("/:id/cover", upload.single("cover_image"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image file provided" });

    const existing = (await db.query("SELECT cover_image FROM books WHERE id = $1", [req.params.id])).rows[0];
    if (!existing) return res.status(404).json({ error: "Book not found" });

    const cover_image = `uploads/covers/${req.file.filename}`;
    deleteOldCover(existing.cover_image);

    const { rows } = await db.query(
      "UPDATE books SET cover_image = $1 WHERE id = $2 RETURNING *",
      [cover_image, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────
// DELETE /api/books/:id/cover  — Remove cover image
// ──────────────────────────────────────────────
router.delete("/:id/cover", async (req, res, next) => {
  try {
    const existing = (await db.query("SELECT cover_image FROM books WHERE id = $1", [req.params.id])).rows[0];
    if (!existing) return res.status(404).json({ error: "Book not found" });

    deleteOldCover(existing.cover_image);

    const { rows } = await db.query(
      "UPDATE books SET cover_image = NULL WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────
// PATCH /api/books/:id/progress
// ──────────────────────────────────────────────
router.patch("/:id/progress", async (req, res, next) => {
  try {
    const { current_page } = req.body;
    const { rows } = await db.query(
      `UPDATE books SET current_page = $1,
        status = CASE WHEN $1 >= total_pages AND total_pages > 0 THEN 'completed' ELSE status END,
        completed_at = CASE WHEN $1 >= total_pages AND total_pages > 0 AND status != 'completed' THEN NOW() ELSE completed_at END
       WHERE id = $2 RETURNING *`,
      [current_page, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Book not found" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────
// DELETE /api/books/:id
// ──────────────────────────────────────────────
router.delete("/:id", async (req, res, next) => {
  try {
    const existing = (await db.query("SELECT cover_image FROM books WHERE id = $1", [req.params.id])).rows[0];
    if (existing) deleteOldCover(existing.cover_image);

    const { rowCount } = await db.query("DELETE FROM books WHERE id = $1", [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: "Book not found" });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ── Book Links ──
router.get("/:id/links", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT bl.*, 
        b.title AS linked_title, b.author AS linked_author, b.cover_image AS linked_cover_image
       FROM book_links bl
       JOIN books b ON b.id = CASE WHEN bl.book_a_id = $1 THEN bl.book_b_id ELSE bl.book_a_id END
       WHERE bl.book_a_id = $1 OR bl.book_b_id = $1`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/:id/links", async (req, res, next) => {
  try {
    const { linked_book_id, relation } = req.body;
    const { rows } = await db.query(
      `INSERT INTO book_links (book_a_id, book_b_id, relation)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, linked_book_id, relation || "related"]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;

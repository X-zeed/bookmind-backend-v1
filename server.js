// ─────────────────────────────────────────────
// server.js — BookMind API
// ─────────────────────────────────────────────
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Ensure uploads directory exists ──
const uploadsDir = path.join(__dirname, "uploads", "covers");
fs.mkdirSync(uploadsDir, { recursive: true });

// ── Middleware ──
app.use(cors());
app.use(express.json());

// ── Serve uploaded images as static files ──
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── Routes ──
app.use("/api/books", require("./routes/books"));
app.use("/api/notes", require("./routes/notes"));
app.use("/api/goals", require("./routes/goals"));
app.use("/api/shelves", require("./routes/shelves"));
app.use("/api/sessions", require("./routes/sessions"));
app.use("/api/stats", require("./routes/stats"));
app.use("/api/streaks", require("./routes/streaks"));

// ── Health check ──
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Error handler ──
app.use((err, _req, res, _next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`✦ BookMind API running on http://localhost:${PORT}`);
});

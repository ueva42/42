// =======================================================
// Temple of Logic – FINAL SERVER.JS
// =======================================================

import express from "express";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import multer from "multer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import pkg from "pg";
const { Pool } = pkg;

// -------------------------------------------------------
// Pfade
// -------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------------------------------------------
// Express
// -------------------------------------------------------
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// -------------------------------------------------------
// Sessions
// -------------------------------------------------------
app.use(
  session({
    secret: "super-temp-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

// -------------------------------------------------------
// PostgreSQL
// -------------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// -------------------------------------------------------
// Cloudflare R2 – S3-kompatibel
// -------------------------------------------------------
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Upload-Handler
const upload = multer({ storage: multer.memoryStorage() });

// -------------------------------------------------------
// Static Files
// -------------------------------------------------------
app.use(express.static(path.join(__dirname, "public")));

// =======================================================
// MIGRATION
// =======================================================

async function migrate() {
  console.log("🔧 Starte Migration…");

  // USERS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      class_id INTEGER,
      xp INTEGER DEFAULT 0,
      highest_xp INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // CLASSES
  await pool.query(`
    CREATE TABLE IF NOT EXISTS classes (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );
  `);

  // MISSIONS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS missions (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      xp INTEGER NOT NULL,
      image_url TEXT,
      require_upload BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // DEFAULT ADMIN
  await pool.query(`
    INSERT INTO users (name, password, role)
    VALUES ('admin', 'bruhrain', 'admin')
    ON CONFLICT (name) DO NOTHING;
  `);

  console.log("Migration abgeschlossen.");
}

await migrate();

// =======================================================
// LOGIN
// =======================================================

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  const r = await pool.query("SELECT * FROM users WHERE name=$1", [username]);
  if (r.rows.length === 0) return res.json({ success: false });

  const user = r.rows[0];
  if (user.password !== password) return res.json({ success: false });

  req.session.user = { id: user.id, role: user.role };
  res.json({ success: true, role: user.role });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// =======================================================
// AUTH
// =======================================================

function isAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

// =======================================================
// KLASSEN
// =======================================================

app.get("/api/class", isAdmin, async (req, res) => {
  const r = await pool.query("SELECT * FROM classes ORDER BY name ASC");
  res.json(r.rows);
});

app.post("/api/class", isAdmin, async (req, res) => {
  const { name } = req.body;

  await pool.query(
    "INSERT INTO classes (name) VALUES ($1)",
    [name]
  );

  res.json({ success: true });
});

app.delete("/api/class/:id", isAdmin, async (req, res) => {
  await pool.query("DELETE FROM classes WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// =======================================================
// SCHÜLER:INNEN
// =======================================================

app.get("/api/student", isAdmin, async (req, res) => {
  const { classId } = req.query;

  const r = await pool.query(
    "SELECT * FROM users WHERE role='student' AND class_id=$1 ORDER BY name ASC",
    [classId]
  );

  res.json(r.rows);
});

app.post("/api/student", isAdmin, async (req, res) => {
  const { name, password, classId } = req.body;

  await pool.query(
    `INSERT INTO users (name, password, role, class_id)
     VALUES ($1,$2,'student',$3)`,
    [name, password, classId]
  );

  res.json({ success: true });
});

app.delete("/api/student/:id", isAdmin, async (req, res) => {
  await pool.query("DELETE FROM users WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// =======================================================
// MISSIONEN
// =======================================================

// ----------------------
// 1) Bild-Upload
// ----------------------
app.post("/api/missions/upload", isAdmin, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.json({ success: false });

    const key = "missions/" + Date.now() + "_" + req.file.originalname;

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      })
    );

    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

    res.json({ success: true, url: publicUrl });
  } catch (err) {
    console.error("Upload-Fehler:", err);
    res.status(500).json({ success: false });
  }
});

// ----------------------
// 2) Mission anlegen
// ----------------------
app.post("/api/missions", isAdmin, async (req, res) => {
  const { name, xp, imageUrl, requireUpload } = req.body;

  await pool.query(
    `INSERT INTO missions (name, xp, image_url, require_upload)
     VALUES ($1,$2,$3,$4)`,
    [name, xp, imageUrl, requireUpload]
  );

  res.json({ success: true });
});

// ----------------------
// 3) Missionen abrufen
// ----------------------
app.get("/api/missions", isAdmin, async (req, res) => {
  const r = await pool.query("SELECT * FROM missions ORDER BY id DESC");
  res.json(r.rows);
});

// ----------------------
// 4) Mission löschen
// ----------------------
app.delete("/api/missions/:id", isAdmin, async (req, res) => {
  await pool.query("DELETE FROM missions WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// =======================================================
// SERVER START
// =======================================================

app.listen(process.env.PORT || 8080, () => {
  console.log("Server läuft auf Port 8080");
});

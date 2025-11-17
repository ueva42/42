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
    secret: "super-temple-secret",
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
// Cloudflare R2 – S3 kompatibel
// -------------------------------------------------------
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

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

  // UPLOADS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_mission_uploads (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mission_id INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // XP_TRANSACTIONS (für später)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS xp_transactions (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      mission_id INTEGER,
      xp INTEGER NOT NULL,
      reason TEXT,
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

function isStudent(req, res, next) {
  if (!req.session.user || req.session.user.role !== "student") {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

// =======================================================
// STUDENT: ME
// =======================================================

app.get("/api/me", isStudent, async (req, res) => {
  const r = await pool.query(
    "SELECT name, xp, highest_xp FROM users WHERE id=$1",
    [req.session.user.id]
  );

  if (r.rows.length === 0) return res.json({ success: false });

  res.json({
    success: true,
    ...r.rows[0]
  });
});

// =======================================================
// KLASSEN
// =======================================================

app.get("/api/class", isAdmin, async (req, res) => {
  const r = await pool.query("SELECT * FROM classes ORDER BY name ASC");
  res.json(r.rows);
});

app.post("/api/class", isAdmin, async (req, res) => {
  await pool.query(
    "INSERT INTO classes (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
    [req.body.name]
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
  const r = await pool.query(
    "SELECT * FROM users WHERE role='student' AND class_id=$1 ORDER BY name ASC",
    [req.query.classId]
  );
  res.json(r.rows);
});

app.post("/api/student", isAdmin, async (req, res) => {
  const { name, password, classId } = req.body;

  await pool.query(
    `INSERT INTO users (name, password, role, class_id)
     VALUES ($1,$2,'student',$3)
     ON CONFLICT (name) DO NOTHING`,
    [name, password, classId]
  );

  res.json({ success: true });
});

app.delete("/api/student/:id", isAdmin, async (req, res) => {
  await pool.query("DELETE FROM users WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// =======================================================
// MISSIONEN + BILD-UPLOAD
// =======================================================

// Mission-Bild uploaden
app.post("/api/missions/upload", isAdmin, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.json({ success: false });

    const key = "missions/" + Date.now() + "_" + req.file.originalname;

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        ContentType: req.file.mimetype,
        Body: req.file.buffer,
      })
    );

    const url = `${process.env.R2_PUBLIC_URL}/${key}`;

    res.json({ success: true, url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

// Mission anlegen
app.post("/api/missions", isAdmin, async (req, res) => {
  const { name, xp, imageUrl, requireUpload } = req.body;

  await pool.query(
    `INSERT INTO missions (name, xp, image_url, require_upload)
     VALUES ($1,$2,$3,$4)`,
    [name, xp, imageUrl, requireUpload]
  );

  res.json({ success: true });
});

// Missionen laden
app.get("/api/missions", async (req, res) => {
  const r = await pool.query("SELECT * FROM missions ORDER BY id DESC");
  res.json(r.rows);
});

// Mission löschen
app.delete("/api/missions/:id", isAdmin, async (req, res) => {
  await pool.query("DELETE FROM missions WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// =======================================================
// XP VERGABE
// =======================================================

// XP an ausgewählte Schüler
app.post("/api/xp/give", isAdmin, async (req, res) => {
  const { studentIds, xp } = req.body;

  for (const id of studentIds) {
    await pool.query(`
      UPDATE users 
      SET xp = xp + $1, highest_xp = GREATEST(highest_xp, xp + $1)
      WHERE id=$2
    `, [xp, id]);
  }

  res.json({ success: true });
});

// XP an alle
app.post("/api/xp/give/all", isAdmin, async (req, res) => {
  const { classId, xp } = req.body;

  await pool.query(`
    UPDATE users 
    SET xp = xp + $1, highest_xp = GREATEST(highest_xp, xp + $1)
    WHERE class_id=$2 AND role='student'
  `, [xp, classId]);

  res.json({ success: true });
});

// Mission-XP an ausgewählte
app.post("/api/xp/mission/give", isAdmin, async (req, res) => {
  const { studentIds, missionId } = req.body;

  const m = await pool.query("SELECT xp FROM missions WHERE id=$1", [missionId]);
  if (m.rows.length === 0) return res.json({ success: false });

  const xp = m.rows[0].xp;

  for (const id of studentIds) {
    await pool.query(`
      UPDATE users 
      SET xp = xp + $1, highest_xp = GREATEST(highest_xp, xp + $1)
      WHERE id=$2
    `, [xp, id]);
  }

  res.json({ success: true });
});

// Mission-XP an alle
app.post("/api/xp/mission/give/all", isAdmin, async (req, res) => {
  const { classId, missionId } = req.body;

  const m = await pool.query("SELECT xp FROM missions WHERE id=$1", [missionId]);
  if (m.rows.length === 0) return res.json({ success: false });

  const xp = m.rows[0].xp;

  await pool.query(`
    UPDATE users 
    SET xp = xp + $1, highest_xp = GREATEST(highest_xp, xp + $1)
    WHERE class_id=$2 AND role='student'
  `, [xp, classId]);

  res.json({ success: true });
});

// =======================================================
// SCHÜLER-UPLOAD – Schülerseite
// =======================================================

app.post("/api/student/upload", isStudent, upload.single("image"), async (req, res) => {
  try {
    const { missionId } = req.body;

    const key = "student_uploads/" + Date.now() + "_" + req.file.originalname;

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        ContentType: req.file.mimetype,
        Body: req.file.buffer
      })
    );

    const url = `${process.env.R2_PUBLIC_URL}/${key}`;

    await pool.query(`
      INSERT INTO student_mission_uploads (student_id, mission_id, image_url)
      VALUES ($1,$2,$3)
    `, [req.session.user.id, missionId, url]);

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.json({ success: false });
  }
});

// Schüler lädt Uploads
app.get("/api/student/uploads", isStudent, async (req, res) => {
  const r = await pool.query(`
    SELECT u.*, m.name AS mission_name
    FROM student_mission_uploads u
    JOIN missions m ON m.id = u.mission_id
    WHERE student_id=$1
    ORDER BY created_at DESC
  `, [req.session.user.id]);

  res.json(r.rows);
});

// =======================================================
// ADMIN: Uploadsichtung
// =======================================================

app.get("/api/admin/uploads", isAdmin, async (req, res) => {
  const { classId } = req.query;

  const r = await pool.query(`
    SELECT 
      u.id AS upload_id,
      u.image_url,
      u.created_at,
      m.name AS mission_name,
      s.name AS student_name
    FROM student_mission_uploads u
    JOIN missions m ON m.id = u.mission_id
    JOIN users s ON s.id = u.student_id
    WHERE s.class_id=$1
    ORDER BY u.created_at DESC
  `, [classId]);

  res.json(r.rows);
});

app.delete("/api/admin/upload/:id", isAdmin, async (req, res) => {
  await pool.query("DELETE FROM student_mission_uploads WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// =======================================================
// SERVER START
// =======================================================

app.listen(process.env.PORT || 8080, () => {
  console.log("Server läuft auf Port 8080");
});

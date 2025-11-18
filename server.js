// =======================================================
// Temple of Logic – FINAL SERVER.JS (MIT BONUSKARTEN)
// =======================================================

import express from "express";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import multer from "multer";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
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
// Cloudflare R2 Upload
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

  // STUDENT UPLOADS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_uploads (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // BONUSKARTEN
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bonuscards (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      xp_cost INTEGER NOT NULL,
      image_url TEXT,
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

  req.session.user = { id: user.id, role: user.role, class_id: user.class_id };
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
// KLASSEN
// =======================================================

app.get("/api/class", isAdmin, async (_req, res) => {
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
// XP – VERGABE
// =======================================================

app.post("/api/xp/add", isAdmin, async (req, res) => {
  const { studentIds, xp } = req.body;

  for (const id of studentIds) {
    await pool.query(`UPDATE users SET xp = xp + $1 WHERE id=$2`, [xp, id]);
  }

  res.json({ success: true });
});

// Mission XP
app.post("/api/xp/mission", isAdmin, async (req, res) => {
  const { studentIds, missionId } = req.body;

  const mission = await pool.query("SELECT xp FROM missions WHERE id=$1", [
    missionId,
  ]);

  if (mission.rows.length === 0)
    return res.json({ success: false, error: "Mission not found" });

  const xp = mission.rows[0].xp;

  for (const id of studentIds) {
    await pool.query(`UPDATE users SET xp = xp + $1 WHERE id=$2`, [xp, id]);
  }

  res.json({ success: true });
});

// =======================================================
// UPLOAD PRO SCHÜLER
// =======================================================

app.post(
  "/api/student/:id/upload",
  isStudent,
  upload.single("image"),
  async (req, res) => {
    try {
      const studentId = req.session.user.id;

      const fileName = `uploads/${studentId}_${Date.now()}_${req.file.originalname}`;

      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: fileName,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        })
      );

      const url = `${process.env.R2_PUBLIC_URL}/${fileName}`;

      await pool.query(
        `INSERT INTO student_uploads (student_id, image_url)
         VALUES ($1,$2)`,
        [studentId, url]
      );

      res.json({ success: true, url });
    } catch (err) {
      console.error("Uploadfehler:", err);
      res.status(500).json({ success: false });
    }
  }
);

// Admin löscht Upload
app.delete("/api/upload/:id", isAdmin, async (req, res) => {
  const r = await pool.query(
    "SELECT image_url FROM student_uploads WHERE id=$1",
    [req.params.id]
  );
  if (r.rows.length === 0) return res.json({ success: false });

  const url = r.rows[0].image_url;
  const key = url.split("/").slice(3).join("/");

  await r2.send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
    })
  );

  await pool.query("DELETE FROM student_uploads WHERE id=$1", [
    req.params.id,
  ]);

  res.json({ success: true });
});

// =======================================================
// MISSIONEN
// =======================================================

// Bild-Upload
app.post(
  "/api/missions/upload",
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      const fileName = `missions/${Date.now()}_${req.file.originalname}`;

      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: fileName,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        })
      );

      const url = `${process.env.R2_PUBLIC_URL}/${fileName}`;
      res.json({ success: true, url });
    } catch (err) {
      console.error("Mission Uploadfehler:", err);
      res.status(500).json({ success: false });
    }
  }
);

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

// Missionen abrufen
app.get("/api/missions", isAdmin, async (_req, res) => {
  const r = await pool.query("SELECT * FROM missions ORDER BY id DESC");
  res.json(r.rows);
});

// Mission löschen
app.delete("/api/missions/:id", isAdmin, async (req, res) => {
  await pool.query("DELETE FROM missions WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// =======================================================
// BONUSKARTEN
// =======================================================

// Upload
app.post(
  "/api/bonuscards/upload",
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      const fileName = `bonuscards/${Date.now()}_${req.file.originalname}`;

      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: fileName,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        })
      );

      const url = `${process.env.R2_PUBLIC_URL}/${fileName}`;
      res.json({ success: true, url });
    } catch (err) {
      console.error("Bonuskarte Uploadfehler:", err);
      res.status(500).json({ success: false });
    }
  }
);

// Bonuskarte anlegen
app.post("/api/bonuscards", isAdmin, async (req, res) => {
  const { name, xp_cost, imageUrl } = req.body;

  await pool.query(
    `INSERT INTO bonuscards (name, xp_cost, image_url)
     VALUES ($1,$2,$3)`,
    [name, xp_cost, imageUrl]
  );

  res.json({ success: true });
});

// Bonuskarten abrufen
app.get("/api/bonuscards", isAdmin, async (_req, res) => {
  const r = await pool.query("SELECT * FROM bonuscards ORDER BY id DESC");
  res.json(r.rows);
});

// Bonuskarte löschen
app.delete("/api/bonuscards/:id", isAdmin, async (req, res) => {
  await pool.query("DELETE FROM bonuscards WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// =======================================================
// SERVER START
// =======================================================

app.listen(process.env.PORT || 8080, () => {
  console.log("Server läuft auf Port 8080");
});

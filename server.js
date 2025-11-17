// =======================================================
// Temple of Logic – SERVER.JS (R2, Missionen, XP, Uploads)
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
    cookie: { secure: false }, // Prod später auf true + HTTPS
  })
);

// -------------------------------------------------------
// PostgreSQL
// -------------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// -------------------------------------------------------
// Cloudflare R2 (S3-kompatibel)
// -------------------------------------------------------
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS classes (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS missions (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      xp INTEGER NOT NULL,
      image_url TEXT NOT NULL,
      require_upload BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS xp_transactions (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mission_id INTEGER REFERENCES missions(id),
      delta_xp INTEGER NOT NULL,
      awarded_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_mission_uploads (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mission_id INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Default-Admin
  await pool.query(`
    INSERT INTO users (name, password, role)
    VALUES ('admin', 'bruhrain', 'admin')
    ON CONFLICT (name) DO NOTHING;
  `);

  console.log("Migration abgeschlossen.");
}

await migrate();

// =======================================================
// AUTH-Helfer
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

// User-Info für Studentenseite
app.get("/api/me", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false });
  }
  const r = await pool.query(
    "SELECT id, name, role, xp FROM users WHERE id=$1",
    [req.session.user.id]
  );
  if (r.rows.length === 0) {
    return res.status(404).json({ success: false });
  }
  res.json({ success: true, user: r.rows[0] });
});

// =======================================================
// KLASSEN
// =======================================================

app.get("/api/class", isAdmin, async (req, res) => {
  const r = await pool.query("SELECT * FROM classes ORDER BY name ASC");
  res.json(r.rows);
});

app.post("/api/class", isAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: "Name fehlt" });
  }

  await pool.query("INSERT INTO classes (name) VALUES ($1)", [name.trim()]);
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
  if (!classId) return res.json([]);

  const r = await pool.query(
    "SELECT * FROM users WHERE role='student' AND class_id=$1 ORDER BY name ASC",
    [classId]
  );

  res.json(r.rows);
});

app.post("/api/student", isAdmin, async (req, res) => {
  const { name, password, classId } = req.body;

  if (!classId) {
    return res.status(400).json({ success: false, error: "classId fehlt" });
  }
  if (!name || !name.trim() || !password) {
    return res.status(400).json({ success: false, error: "Name/Passwort fehlt" });
  }

  await pool.query(
    `INSERT INTO users (name, password, role, class_id)
     VALUES ($1,$2,'student',$3)`,
    [name.trim(), password, parseInt(classId, 10)]
  );

  res.json({ success: true });
});

app.delete("/api/student/:id", isAdmin, async (req, res) => {
  await pool.query("DELETE FROM users WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// =======================================================
// MISSIONEN (Admin)
// =======================================================

// Bild-Upload für Missionen – Bild ist Pflicht
app.post("/api/missions/upload", isAdmin, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.json({ success: false, error: "Kein Bild hochgeladen" });
    }

    const key =
      "missions/" +
      Date.now() +
      "_" +
      req.file.originalname.replace(/\s+/g, "_");

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
    res.status(500).json({ success: false, error: "Upload Fehler" });
  }
});

// Mission anlegen
app.post("/api/missions", isAdmin, async (req, res) => {
  const { name, xp, imageUrl, requireUpload } = req.body;

  if (!name || !name.trim()) {
    return res
      .status(400)
      .json({ success: false, error: "Missionsname fehlt" });
  }

  let xpValue = parseInt(xp, 10);
  if (isNaN(xpValue)) {
    return res
      .status(400)
      .json({ success: false, error: "XP muss eine Zahl sein" });
  }

  if (!imageUrl || !imageUrl.trim()) {
    return res
      .status(400)
      .json({ success: false, error: "Bild-URL fehlt (Upload vorher nötig)" });
  }

  const requireUploadBool =
    requireUpload === true || requireUpload === "true" ? true : false;

  await pool.query(
    `INSERT INTO missions (name, xp, image_url, require_upload)
     VALUES ($1,$2,$3,$4)`,
    [name.trim(), xpValue, imageUrl.trim(), requireUploadBool]
  );

  res.json({ success: true });
});

// Missionen abrufen (Admin + Student)
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
// XP-VERGABE (Admin)
// =======================================================

app.post("/api/xp/grant", isAdmin, async (req, res) => {
  let { classId, studentIds, applyToAll, xpDelta, missionId } = req.body;

  let targetIds = [];

  if (applyToAll) {
    if (!classId) {
      return res
        .status(400)
        .json({ success: false, error: "classId fehlt für applyToAll" });
    }
    const r = await pool.query(
      "SELECT id FROM users WHERE role='student' AND class_id=$1",
      [classId]
    );
    targetIds = r.rows.map((r) => r.id);
  } else {
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "Keine Schüler:innen ausgewählt" });
    }
    targetIds = studentIds.map((id) => parseInt(id, 10)).filter((n) => !isNaN(n));
  }

  if (targetIds.length === 0) {
    return res
      .status(400)
      .json({ success: false, error: "Leere Zielliste" });
  }

  let delta = null;

  if (missionId) {
    const r = await pool.query(
      "SELECT xp FROM missions WHERE id=$1",
      [missionId]
    );
    if (r.rows.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "Mission nicht gefunden" });
    }
    delta = parseInt(r.rows[0].xp, 10);
  } else {
    delta = parseInt(xpDelta, 10);
    if (isNaN(delta)) {
      return res
        .status(400)
        .json({ success: false, error: "XP-Wert ungültig" });
    }
  }

  const adminId = req.session.user.id;

  for (const sid of targetIds) {
    await pool.query(
      "UPDATE users SET xp = xp + $1, highest_xp = GREATEST(highest_xp, xp + $1) WHERE id=$2",
      [delta, sid]
    );
    await pool.query(
      `INSERT INTO xp_transactions (student_id, mission_id, delta_xp, awarded_by)
       VALUES ($1,$2,$3,$4)`,
      [sid, missionId || null, delta, adminId]
    );
  }

  res.json({ success: true });
});

// =======================================================
// SCHÜLER-UPLOADS (Student)
// =======================================================

app.post(
  "/api/student/upload",
  isStudent,
  upload.single("image"),
  async (req, res) => {
    try {
      const { missionId } = req.body;
      if (!missionId) {
        return res
          .status(400)
          .json({ success: false, error: "missionId fehlt" });
      }
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "Kein Bild hochgeladen" });
      }

      const key =
        "student_uploads/" +
        req.session.user.id +
        "/" +
        Date.now() +
        "_" +
        req.file.originalname.replace(/\s+/g, "_");

      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        })
      );

      const url = `${process.env.R2_PUBLIC_URL}/${key}`;

      await pool.query(
        `INSERT INTO student_mission_uploads (student_id, mission_id, image_url)
         VALUES ($1,$2,$3)`,
        [req.session.user.id, parseInt(missionId, 10), url]
      );

      res.json({ success: true, url });
    } catch (err) {
      console.error("Student-Upload-Fehler:", err);
      res.status(500).json({ success: false, error: "Upload Fehler" });
    }
  }
);

// Eigenen Upload-Verlauf
app.get("/api/student/uploads", isStudent, async (req, res) => {
  const r = await pool.query(
    `
    SELECT su.id, su.image_url, su.created_at, m.name AS mission_name
    FROM student_mission_uploads su
    JOIN missions m ON su.mission_id = m.id
    WHERE su.student_id = $1
    ORDER BY su.created_at DESC
  `,
    [req.session.user.id]
  );
  res.json(r.rows);
});

// =======================================================
// SCHÜLER-UPLOADS (Admin-Ansicht)
// =======================================================

app.get("/api/uploads", isAdmin, async (req, res) => {
  const { classId } = req.query;
  if (!classId) return res.json([]);

  const r = await pool.query(
    `
    SELECT su.id, su.image_url, su.created_at,
           u.id AS student_id, u.name AS student_name,
           m.id AS mission_id, m.name AS mission_name
    FROM student_mission_uploads su
    JOIN users u ON su.student_id = u.id
    JOIN missions m ON su.mission_id = m.id
    WHERE u.class_id = $1
    ORDER BY su.created_at DESC
  `,
    [classId]
  );

  res.json(r.rows);
});

app.delete("/api/uploads/:id", isAdmin, async (req, res) => {
  const id = req.params.id;

  const r = await pool.query(
    "SELECT image_url FROM student_mission_uploads WHERE id=$1",
    [id]
  );
  if (r.rows.length === 0) {
    return res.status(404).json({ success: false });
  }

  const imageUrl = r.rows[0].image_url;
  const prefix = process
    .env
    .R2_PUBLIC_URL.replace(/\/+$/, "") + "/";
  let key = null;

  if (imageUrl.startsWith(prefix)) {
    key = imageUrl.slice(prefix.length);
  }

  if (key) {
    try {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
        })
      );
    } catch (err) {
      console.error("Fehler beim Löschen aus R2:", err);
    }
  }

  await pool.query("DELETE FROM student_mission_uploads WHERE id=$1", [id]);
  res.json({ success: true });
});

// =======================================================
// SERVER START
// =======================================================

app.listen(process.env.PORT || 8080, () => {
  console.log("Server läuft auf Port 8080");
});

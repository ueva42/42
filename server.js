// =======================================================
// Temple of Logic – SERVER (passend zu admin.html Teil 1+2)
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
    cookie: { secure: false }, // hinter Proxy auf true umstellen
  })
);

// -------------------------------------------------------
// Static Files
// -------------------------------------------------------
app.use(express.static(path.join(__dirname, "public")));

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

// Multer – Upload im Speicher
const upload = multer({ storage: multer.memoryStorage() });

// =======================================================
// MIGRATION
// =======================================================

async function migrate() {
  console.log("🔧 Starte Migration…");

  // Klassen
  await pool.query(`
    CREATE TABLE IF NOT EXISTS classes (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );
  `);

  // Nutzer
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      xp INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Missionen
  await pool.query(`
    CREATE TABLE IF NOT EXISTS missions (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      xp INTEGER NOT NULL,
      image_url TEXT,
      require_upload BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Uploads der Schüler:innen
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_uploads (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Bonuskarten
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bonuscards (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      xp INTEGER NOT NULL,
      image_url TEXT,
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
// AUTH / LOGIN
// =======================================================

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  const r = await pool.query("SELECT * FROM users WHERE name = $1", [username]);
  if (r.rows.length === 0) return res.json({ success: false });

  const user = r.rows[0];
  if (user.password !== password) return res.json({ success: false });

  req.session.user = {
    id: user.id,
    role: user.role,
    class_id: user.class_id,
  };

  res.json({ success: true, role: user.role });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

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
  const { name } = req.body;
  if (!name) return res.json({ success: false });

  await pool.query(
    "INSERT INTO classes (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
    [name]
  );

  res.json({ success: true });
});

// (Klasse löschen – optional, hängt an dir)
app.delete("/api/class/:id", isAdmin, async (req, res) => {
  await pool.query("DELETE FROM classes WHERE id = $1", [req.params.id]);
  res.json({ success: true });
});

// =======================================================
// SCHÜLER:INNEN
// =======================================================

// Liste der Schüler:innen einer Klasse
// -> liefert auch upload_url (letzter Upload des Schülers)
app.get("/api/student", isAdmin, async (req, res) => {
  const classId = req.query.classId;
  if (!classId) return res.json([]);

  const r = await pool.query(
    `
    SELECT
      u.id,
      u.name,
      u.password,
      u.xp,
      su.image_url AS upload_url
    FROM users u
    LEFT JOIN LATERAL (
      SELECT image_url
      FROM student_uploads
      WHERE student_id = u.id
      ORDER BY created_at DESC
      LIMIT 1
    ) su ON TRUE
    WHERE u.role = 'student'
      AND u.class_id = $1
    ORDER BY u.name ASC
    `,
    [classId]
  );

  res.json(r.rows);
});

// Schüler:in anlegen
app.post("/api/student", isAdmin, async (req, res) => {
  const { name, password, classId } = req.body;
  if (!name || !password || !classId) return res.json({ success: false });

  await pool.query(
    `
    INSERT INTO users (name, password, role, class_id)
    VALUES ($1, $2, 'student', $3)
    ON CONFLICT (name) DO NOTHING
    `,
    [name, password, classId]
  );

  res.json({ success: true });
});

// Schüler:in löschen
app.delete("/api/student/:id", isAdmin, async (req, res) => {
  await pool.query("DELETE FROM users WHERE id = $1", [req.params.id]);
  res.json({ success: true });
});

// =======================================================
// XP – VERGABE (einzelner Schüler)
// =======================================================

// admin.html ruft /api/xp mit { studentId, xp } mehrfach auf
app.post("/api/xp", isAdmin, async (req, res) => {
  const { studentId, xp } = req.body;
  if (!studentId || !Number.isFinite(Number(xp))) {
    return res.json({ success: false });
  }
  const delta = Number(xp);

  await pool.query(
    "UPDATE users SET xp = xp + $1 WHERE id = $2 AND role = 'student'",
    [delta, studentId]
  );

  res.json({ success: true });
});

// Mission-XP für einen Schüler
// admin.html ruft /api/xpmission mit { studentId, missionId }
app.post("/api/xpmission", isAdmin, async (req, res) => {
  const { studentId, missionId } = req.body;
  if (!studentId || !missionId) return res.json({ success: false });

  const mr = await pool.query("SELECT xp FROM missions WHERE id = $1", [
    missionId,
  ]);
  if (mr.rows.length === 0) return res.json({ success: false });

  const missionXP = mr.rows[0].xp;

  await pool.query(
    "UPDATE users SET xp = xp + $1 WHERE id = $2 AND role = 'student'",
    [missionXP, studentId]
  );

  res.json({ success: true });
});

// =======================================================
// SCHÜLER-UPLOAD (für student.html) + Löschen (Admin)
// =======================================================

// Schüler:in lädt Bild hoch (z.B. als Missions-Nachweis)
app.post(
  "/api/student/upload",
  isStudent,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) return res.json({ success: false });

      const studentId = req.session.user.id;
      const fileName =
        "uploads/" + studentId + "_" + Date.now() + "_" + req.file.originalname;

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
        `
        INSERT INTO student_uploads (student_id, image_url)
        VALUES ($1, $2)
        `,
        [studentId, url]
      );

      res.json({ success: true, url });
    } catch (err) {
      console.error("Schüler-Upload Fehler:", err);
      res.status(500).json({ success: false });
    }
  }
);

// Admin löscht (letzten) Upload eines Schülers
// admin.html ruft: DELETE /api/upload/:studentId
app.delete("/api/upload/:studentId", isAdmin, async (req, res) => {
  const studentId = req.params.studentId;

  // letzten Upload holen
  const ur = await pool.query(
    `
    SELECT id, image_url
    FROM student_uploads
    WHERE student_id = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [studentId]
  );

  if (ur.rows.length === 0) {
    return res.json({ success: false });
  }

  const upload = ur.rows[0];

  // R2-Key aus URL ableiten (alles nach dem Bucket-Host)
  const url = upload.image_url;
  const publicPrefix = process.env.R2_PUBLIC_URL + "/";
  const key = url.startsWith(publicPrefix) ? url.slice(publicPrefix.length) : null;

  if (key) {
    try {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
        })
      );
    } catch (err) {
      console.error("R2 Delete Fehler:", err);
      // selbst wenn R2-Löschen fehlschlägt, entfernen wir den DB-Eintrag
    }
  }

  await pool.query("DELETE FROM student_uploads WHERE id = $1", [upload.id]);

  res.json({ success: true });
});

// =======================================================
// MISSIONEN
// =======================================================

// Bild-Upload für Mission
app.post(
  "/api/missions/upload",
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) return res.json({ success: false });

      const fileName = "missions/" + Date.now() + "_" + req.file.originalname;

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
      console.error("Mission-Upload Fehler:", err);
      res.status(500).json({ success: false });
    }
  }
);

// Mission anlegen
app.post("/api/missions", isAdmin, async (req, res) => {
  const { name, xp, imageUrl, requireUpload } = req.body;
  if (!name || !Number.isFinite(Number(xp))) {
    return res.json({ success: false });
  }

  await pool.query(
    `
    INSERT INTO missions (name, xp, image_url, require_upload)
    VALUES ($1, $2, $3, $4)
    `,
    [name, Number(xp), imageUrl || null, !!requireUpload]
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
  const id = req.params.id;

  // Bild ggf. aus R2 löschen
  const mr = await pool.query("SELECT image_url FROM missions WHERE id = $1", [
    id,
  ]);
  if (mr.rows.length > 0 && mr.rows[0].image_url) {
    const url = mr.rows[0].image_url;
    const publicPrefix = process.env.R2_PUBLIC_URL + "/";
    const key = url.startsWith(publicPrefix) ? url.slice(publicPrefix.length) : null;

    if (key) {
      try {
        await r2.send(
          new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: key,
          })
        );
      } catch (err) {
        console.error("Mission-Bild löschen Fehler:", err);
      }
    }
  }

  await pool.query("DELETE FROM missions WHERE id = $1", [id]);
  res.json({ success: true });
});

// =======================================================
// BONUSKARTEN
// =======================================================

// Bild-Upload für Bonuskarte
app.post(
  "/api/bonus/upload",
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) return res.json({ success: false });

      const fileName = "bonuscards/" + Date.now() + "_" + req.file.originalname;

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
      console.error("Bonus-Upload Fehler:", err);
      res.status(500).json({ success: false });
    }
  }
);

// Bonuskarte anlegen
app.post("/api/bonus", isAdmin, async (req, res) => {
  const { name, xp, imageUrl } = req.body;
  if (!name || !Number.isFinite(Number(xp))) {
    return res.json({ success: false });
  }

  await pool.query(
    `
    INSERT INTO bonuscards (name, xp, image_url)
    VALUES ($1, $2, $3)
    `,
    [name, Number(xp), imageUrl || null]
  );

  res.json({ success: true });
});

// Bonuskarten abrufen
app.get("/api/bonus", isAdmin, async (_req, res) => {
  const r = await pool.query("SELECT * FROM bonuscards ORDER BY id DESC");
  res.json(r.rows);
});

// Bonuskarte löschen
app.delete("/api/bonus/:id", isAdmin, async (req, res) => {
  const id = req.params.id;

  // Bild ggf. aus R2 löschen
  const br = await pool.query("SELECT image_url FROM bonuscards WHERE id = $1", [
    id,
  ]);
  if (br.rows.length > 0 && br.rows[0].image_url) {
    const url = br.rows[0].image_url;
    const publicPrefix = process.env.R2_PUBLIC_URL + "/";
    const key = url.startsWith(publicPrefix) ? url.slice(publicPrefix.length) : null;

    if (key) {
      try {
        await r2.send(
          new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: key,
          })
        );
      } catch (err) {
        console.error("Bonus-Bild löschen Fehler:", err);
      }
    }
  }

  await pool.query("DELETE FROM bonuscards WHERE id = $1", [id]);
  res.json({ success: true });
});

// =======================================================
// SERVER START
// =======================================================

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Server läuft auf Port " + PORT);
});

// =======================================================
// Temple of Logic – FINAL SERVER.JS (vollständig, 2025)
// Mit: Klassen, Schüler:innen, Missionen, XP, Uploads,
// Bonuskarten, Charaktere, R2-Upload
// =======================================================

import express from "express";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import multer from "multer";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
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
// Cloudflare R2
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

// =======================================================
// MIGRATION
// =======================================================

async function migrate() {
  console.log("🔧 Starte Migration…");

  // KLASSEN
  await pool.query(`
    CREATE TABLE IF NOT EXISTS classes (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );
  `);

  // USERS UNIQUE entfernen
  await pool.query(`
    DO $$
    DECLARE
        c_name text;
    BEGIN
        SELECT constraint_name INTO c_name
        FROM information_schema.table_constraints
        WHERE table_name = 'users'
          AND constraint_type = 'UNIQUE'
          AND constraint_name LIKE '%name%';

        IF c_name IS NOT NULL THEN
            EXECUTE 'ALTER TABLE users DROP CONSTRAINT ' || c_name;
        END IF;
    END $$;
  `);

  // USERS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      xp INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE users
    ADD CONSTRAINT users_name_class_unique UNIQUE(name, class_id);
  `);

  // MISSIONEN
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

  // SCHÜLER-UPLOADS
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
      xp INTEGER NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // CHARAKTERE
  await pool.query(`
    CREATE TABLE IF NOT EXISTS characters (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // DEFAULT ADMIN
  await pool.query(`
    INSERT INTO users (name, password, role, class_id)
    VALUES ('admin', 'bruhrain', 'admin', NULL)
    ON CONFLICT (name, class_id) DO NOTHING;
  `);

  console.log("Migration abgeschlossen.");
}

await migrate();

// =======================================================
// LOGIN / AUTH
// =======================================================

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  const r = await pool.query(
    "SELECT * FROM users WHERE name=$1 AND (class_id IS NULL OR role='admin')",
    [username]
  );

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
  if (!req.session.user || req.session.user.role !== "admin")
    return res.status(403).json({ error: "Forbidden" });
  next();
}

function isStudent(req, res, next) {
  if (!req.session.user || req.session.user.role !== "student")
    return res.status(403).json({ error: "Forbidden" });
  next();
}

// =======================================================
// KLASSEN
// =======================================================

app.get("/api/class", isAdmin, async (_, res) => {
  const r = await pool.query("SELECT * FROM classes ORDER BY name ASC");
  res.json(r.rows);
});

app.post("/api/class", isAdmin, async (req, res) => {
  const { name } = req.body;

  await pool.query(
    "INSERT INTO classes (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
    [name]
  );

  res.json({ success: true });
});

// =======================================================
// SCHÜLER
// =======================================================

app.get("/api/student", isAdmin, async (req, res) => {
  const { classId } = req.query;
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
    WHERE u.role='student'
      AND u.class_id=$1
    ORDER BY u.name ASC
    `,
    [classId]
  );

  res.json(r.rows);
});

app.post("/api/student", isAdmin, async (req, res) => {
  const { name, password, classId } = req.body;

  await pool.query(
    `
    INSERT INTO users (name, password, role, class_id)
    VALUES ($1, $2, 'student', $3)
    ON CONFLICT (name, class_id) DO NOTHING
    `,
    [name, password, classId]
  );

  res.json({ success: true });
});

app.delete("/api/student/:id", isAdmin, async (req, res) => {
  await pool.query("DELETE FROM users WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// =======================================================
// XP VERGABE
// =======================================================

app.post("/api/xp", isAdmin, async (req, res) => {
  const { studentId, xp } = req.body;

  await pool.query(
    "UPDATE users SET xp = xp + $1 WHERE id=$2 AND role='student'",
    [Number(xp), studentId]
  );

  res.json({ success: true });
});

// Mission-XP
app.post("/api/xpmission", isAdmin, async (req, res) => {
  const { studentId, missionId } = req.body;

  const r = await pool.query("SELECT xp FROM missions WHERE id=$1", [
    missionId,
  ]);
  if (r.rows.length === 0) return res.json({ success: false });

  const missionXP = r.rows[0].xp;

  await pool.query(
    "UPDATE users SET xp = xp + $1 WHERE id=$2",
    [missionXP, studentId]
  );

  res.json({ success: true });
});

// =======================================================
// SCHÜLER-UPLOAD
// =======================================================

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
        `INSERT INTO student_uploads (student_id, image_url)
         VALUES ($1, $2)`,
        [studentId, url]
      );

      res.json({ success: true, url });
    } catch (err) {
      console.error("Upload Fehler:", err);
      res.status(500).json({ success: false });
    }
  }
);

// Admin löscht Upload
app.delete("/api/upload/:studentId", isAdmin, async (req, res) => {
  const studentId = req.params.studentId;

  const r = await pool.query(
    `
    SELECT id, image_url
    FROM student_uploads
    WHERE student_id=$1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [studentId]
  );

  if (r.rows.length === 0) return res.json({ success: false });

  const entry = r.rows[0];
  const publicPrefix = process.env.R2_PUBLIC_URL + "/";
  const key = entry.image_url.replace(publicPrefix, "");

  try {
    await r2.send(
      new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
      })
    );
  } catch (err) {
    console.error("R2 delete error:", err);
  }

  await pool.query("DELETE FROM student_uploads WHERE id=$1", [entry.id]);

  res.json({ success: true });
});

// =======================================================
// MISSIONEN
// =======================================================

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
      console.error("Mission Upload Fehler:", err);
      res.status(500).json({ success: false });
    }
  }
);

app.post("/api/missions", isAdmin, async (req, res) => {
  const { name, xp, imageUrl, requireUpload } = req.body;

  await pool.query(
    `
    INSERT INTO missions (name, xp, image_url, require_upload)
    VALUES ($1, $2, $3, $4)
    `,
    [name, Number(xp), imageUrl || null, requireUpload === true]
  );

  res.json({ success: true });
});

app.get("/api/missions", isAdmin, async (_, res) => {
  const r = await pool.query("SELECT * FROM missions ORDER BY id DESC");
  res.json(r.rows);
});

app.delete("/api/missions/:id", isAdmin, async (req, res) => {
  const id = req.params.id;

  const r = await pool.query(
    "SELECT image_url FROM missions WHERE id=$1",
    [id]
  );

  if (r.rows.length > 0 && r.rows[0].image_url) {
    const publicPrefix = process.env.R2_PUBLIC_URL + "/";
    const key = r.rows[0].image_url.replace(publicPrefix, "");

    try {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
        })
      );
    } catch (err) {}
  }

  await pool.query("DELETE FROM missions WHERE id=$1", [id]);
  res.json({ success: true });
});

// =======================================================
// BONUSKARTEN
// =======================================================

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
      console.error("Bonus Upload Fehler:", err);
      res.status(500).json({ success: false });
    }
  }
);

app.post("/api/bonus", isAdmin, async (req, res) => {
  const { name, xp, imageUrl } = req.body;

  await pool.query(
    `
    INSERT INTO bonuscards (name, xp, image_url)
    VALUES ($1, $2, $3)
    `,
    [name, Number(xp), imageUrl || null]
  );

  res.json({ success: true });
});

app.get("/api/bonus", isAdmin, async (_, res) => {
  const r = await pool.query("SELECT * FROM bonuscards ORDER BY id DESC");
  res.json(r.rows);
});

app.delete("/api/bonus/:id", isAdmin, async (req, res) => {
  const id = req.params.id;

  const r = await pool.query(
    "SELECT image_url FROM bonuscards WHERE id=$1",
    [id]
  );

  if (r.rows.length > 0 && r.rows[0].image_url) {
    const publicPrefix = process.env.R2_PUBLIC_URL + "/";
    const key = r.rows[0].image_url.replace(publicPrefix, "");

    try {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
        })
      );
    } catch (err) {}
  }

  await pool.query("DELETE FROM bonuscards WHERE id=$1", [id]);

  res.json({ success: true });
});

// =======================================================
// CHARAKTERE
// =======================================================

// Upload
app.post(
  "/api/character/upload",
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) return res.json({ success: false });

      const fileName =
        "characters/" + Date.now() + "_" + req.file.originalname;

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
      console.error("Character Upload Fehler:", err);
      res.status(500).json({ success: false });
    }
  }
);

// Charakter anlegen
app.post("/api/character", isAdmin, async (req, res) => {
  const { name, imageUrl } = req.body;

  await pool.query(
    `INSERT INTO characters (name, image_url) VALUES ($1, $2)`,
    [name, imageUrl || null]
  );

  res.json({ success: true });
});

// Charakterliste
app.get("/api/character", isAdmin, async (_, res) => {
  const r = await pool.query("SELECT * FROM characters ORDER BY id DESC");
  res.json(r.rows);
});

// Charakter löschen
app.delete("/api/character/:id", isAdmin, async (req, res) => {
  const id = req.params.id;

  const r = await pool.query(
    `SELECT image_url FROM characters WHERE id=$1`,
    [id]
  );

  if (r.rows.length > 0 && r.rows[0].image_url) {
    const publicPrefix = process.env.R2_PUBLIC_URL + "/";
    const key = r.rows[0].image_url.replace(publicPrefix, "");

    try {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
        })
      );
    } catch (err) {
      console.error("R2 delete error:", err);
    }
  }

  await pool.query("DELETE FROM characters WHERE id=$1", [id]);
  res.json({ success: true });
});

// =======================================================
// START
// =======================================================

app.listen(process.env.PORT || 8080, () => {
  console.log("🚀 Server läuft auf Port 8080");
});

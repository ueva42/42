// =======================================================
// Temple of Logic – SERVER.JS (stabile Gesamtversion)
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
// Pfade / Basis
// -------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  session({
    secret: "super-temp-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // bei HTTPS später true
  })
);

app.use(express.static(path.join(__dirname, "public")));

// -------------------------------------------------------
// DB & R2
// -------------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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
// Helper – Spalte nur anlegen, wenn sie fehlt
// -------------------------------------------------------
async function ensureColumn(table, col, type) {
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name='${table}'
          AND column_name='${col}'
      ) THEN
        ALTER TABLE ${table} ADD COLUMN ${col} ${type};
      END IF;
    END$$;
  `);
}

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

  // Users (ggf. schon vorhanden – wir ergänzen nur)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      class_id INTEGER,
      xp INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await ensureColumn("users", "role", "TEXT NOT NULL DEFAULT 'student'");
  await ensureColumn("users", "class_id", "INTEGER");
  await ensureColumn("users", "xp", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("users", "character_id", "INTEGER");

  // UNIQUE (name, class_id)
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name='users'
          AND constraint_type='UNIQUE'
          AND constraint_name='users_name_class_unique'
      ) THEN
        ALTER TABLE users
          ADD CONSTRAINT users_name_class_unique UNIQUE(name, class_id);
      END IF;
    END$$;
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

  // Schüler-Uploads
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_uploads (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Bonuskarten (mit xp)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bonuscards (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // falls alte Spalte xp_cost noch existiert → weg
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='bonuscards' AND column_name='xp_cost'
      ) THEN
        ALTER TABLE bonuscards DROP COLUMN xp_cost;
      END IF;
    END$$;
  `);

  // Charaktere
  await pool.query(`
    CREATE TABLE IF NOT EXISTS characters (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Level (mit required_xp!)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS levels (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      required_xp INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // XP-Transaktionen
  await pool.query(`
    CREATE TABLE IF NOT EXISTS xp_transactions (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL DEFAULT 0,
      mission_id INTEGER REFERENCES missions(id),
      source TEXT,
      awarded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await ensureColumn("xp_transactions", "amount", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("xp_transactions", "mission_id", "INTEGER");
  await ensureColumn("xp_transactions", "source", "TEXT");
  await ensureColumn("xp_transactions", "awarded_by", "INTEGER");

  // Default Admin
  await pool.query(
    `
    INSERT INTO users (name, password, role, class_id)
    VALUES ('admin', 'bruhrain', 'admin', NULL)
    ON CONFLICT (name, class_id) DO NOTHING;
  `
  );

  console.log("Migration abgeschlossen.");
}

await migrate();

// =======================================================
// AUTH
// =======================================================
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  const r = await pool.query(
    "SELECT * FROM users WHERE name=$1 ORDER BY id ASC",
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
  const r = await pool.query("SELECT id, name FROM classes ORDER BY name ASC");
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

app.delete("/api/class/:id", isAdmin, async (req, res) => {
  const classId = parseInt(req.params.id, 10);
  if (Number.isNaN(classId)) {
    return res.status(400).json({ success: false, error: "Invalid class id" });
  }

  // Schüler:innen der Klasse löschen
  await pool.query("DELETE FROM users WHERE class_id=$1 AND role='student'", [
    classId,
  ]);

  // Klasse löschen
  await pool.query("DELETE FROM classes WHERE id=$1", [classId]);

  res.json({ success: true });
});

// =======================================================
// SCHÜLER:INNEN
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
  if (!name || !password || !classId)
    return res.json({ success: false });

  await pool.query(
    `
    INSERT INTO users (name, password, role, class_id, xp)
    VALUES ($1, $2, 'student', $3, 0)
    ON CONFLICT (name, class_id) DO NOTHING
  `,
    [name, password, classId]
  );

  res.json({ success: true });
});

app.delete("/api/student/:id", isAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.json({ success: false });

  await pool.query("DELETE FROM users WHERE id=$1", [id]);
  res.json({ success: true });
});

// =======================================================
// XP-LOG / HELPER
// =======================================================
async function logXP(studentId, amount, missionId, source, adminId) {
  await pool.query(
    `
    INSERT INTO xp_transactions (student_id, amount, mission_id, source, awarded_by)
    VALUES ($1, $2, $3, $4, $5)
  `,
    [studentId, amount, missionId, source, adminId]
  );
}

// =======================================================
// XP VERGABE
// =======================================================
app.post("/api/xp", isAdmin, async (req, res) => {
  const { studentId, xp } = req.body;
  const delta = Number(xp);

  if (!studentId || !delta) return res.json({ success: false });

  await pool.query("UPDATE users SET xp = xp + $1 WHERE id=$2", [
    delta,
    studentId,
  ]);

  await logXP(studentId, delta, null, "direct", req.session.user.id);

  res.json({ success: true });
});

app.post("/api/xpmission", isAdmin, async (req, res) => {
  const { studentId, missionId } = req.body;
  if (!studentId || !missionId) return res.json({ success: false });

  const r = await pool.query("SELECT xp FROM missions WHERE id=$1", [
    missionId,
  ]);
  if (r.rows.length === 0) return res.json({ success: false });

  const missionXP = r.rows[0].xp;

  await pool.query("UPDATE users SET xp = xp + $1 WHERE id=$2", [
    missionXP,
    studentId,
  ]);

  await logXP(studentId, missionXP, missionId, "mission", req.session.user.id);

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

// Admin löscht letzten Upload
app.delete("/api/upload/:studentId", isAdmin, async (req, res) => {
  const studentId = parseInt(req.params.studentId, 10);
  if (Number.isNaN(studentId)) return res.json({ success: false });

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
  const prefix = process.env.R2_PUBLIC_URL + "/";
  const key = entry.image_url.replace(prefix, "");

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
  if (!name || !xp) return res.json({ success: false });

  await pool.query(
    `
    INSERT INTO missions (name, xp, image_url, require_upload)
    VALUES ($1, $2, $3, $4)
  `,
    [name, Number(xp), imageUrl || null, requireUpload === true]
  );

  res.json({ success: true });
});

app.get("/api/missions", isAdmin, async (_req, res) => {
  const r = await pool.query("SELECT * FROM missions ORDER BY id DESC");
  res.json(r.rows);
});

app.delete("/api/missions/:id", isAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.json({ success: false });

  const r = await pool.query("SELECT image_url FROM missions WHERE id=$1", [
    id,
  ]);

  if (r.rows.length > 0 && r.rows[0].image_url) {
    const prefix = process.env.R2_PUBLIC_URL + "/";
    const key = r.rows[0].image_url.replace(prefix, "");

    try {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
        })
      );
    } catch (err) {
      console.error("R2 delete mission image:", err);
    }
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

      const fileName =
        "bonuscards/" + Date.now() + "_" + req.file.originalname;

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
  if (!name || !xp) return res.json({ success: false });

  await pool.query(
    `
    INSERT INTO bonuscards (name, xp, image_url)
    VALUES ($1, $2, $3)
  `,
    [name, Number(xp), imageUrl || null]
  );

  res.json({ success: true });
});

app.get("/api/bonus", isAdmin, async (_req, res) => {
  const r = await pool.query("SELECT * FROM bonuscards ORDER BY id DESC");
  res.json(r.rows);
});

app.delete("/api/bonus/:id", isAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.json({ success: false });

  const r = await pool.query("SELECT image_url FROM bonuscards WHERE id=$1", [
    id,
  ]);

  if (r.rows.length > 0 && r.rows[0].image_url) {
    const prefix = process.env.R2_PUBLIC_URL + "/";
    const key = r.rows[0].image_url.replace(prefix, "");

    try {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
        })
      );
    } catch (err) {
      console.error("Bonus delete R2:", err);
    }
  }

  await pool.query("DELETE FROM bonuscards WHERE id=$1", [id]);
  res.json({ success: true });
});

// =======================================================
// CHARACTERS
// =======================================================
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

app.post("/api/character", isAdmin, async (req, res) => {
  const { name, imageUrl } = req.body;
  if (!name) return res.json({ success: false });

  await pool.query(
    `
    INSERT INTO characters (name, image_url)
    VALUES ($1, $2)
  `,
    [name, imageUrl || null]
  );

  res.json({ success: true });
});

app.get("/api/character", isAdmin, async (_req, res) => {
  const r = await pool.query("SELECT * FROM characters ORDER BY id DESC");
  res.json(r.rows);
});

app.delete("/api/character/:id", isAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.json({ success: false });

  const r = await pool.query("SELECT image_url FROM characters WHERE id=$1", [
    id,
  ]);

  if (r.rows.length > 0 && r.rows[0].image_url) {
    const prefix = process.env.R2_PUBLIC_URL + "/";
    const key = r.rows[0].image_url.replace(prefix, "");

    try {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
        })
      );
    } catch (err) {
      console.error("Character delete R2:", err);
    }
  }

  await pool.query("DELETE FROM characters WHERE id=$1", [id]);
  res.json({ success: true });
});

// =======================================================
// LEVELSYSTEM
// =======================================================
app.post("/api/levels", isAdmin, async (req, res) => {
  const { name, min_xp } = req.body;
  const xp = Number(min_xp);

  if (!name || !xp) return res.json({ success: false });

  await pool.query(
    `
    INSERT INTO levels (name, required_xp)
    VALUES ($1, $2)
  `,
    [name, xp]
  );

  res.json({ success: true });
});

app.get("/api/levels", isAdmin, async (_req, res) => {
  const r = await pool.query(
    "SELECT * FROM levels ORDER BY required_xp ASC, id ASC"
  );
  res.json(r.rows);
});

app.delete("/api/levels/:id", isAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.json({ success: false });

  await pool.query("DELETE FROM levels WHERE id=$1", [id]);
  res.json({ success: true });
});

// =======================================================
// STUDENT-API für student.html
// =======================================================

app.get("/api/student/me", isStudent, async (req, res) => {
  const id = req.session.user.id;

  const user = await pool.query(
    "SELECT id, name, xp, character_id FROM users WHERE id=$1",
    [id]
  );

  const uploads = await pool.query(
    `
    SELECT id, image_url, created_at
    FROM student_uploads
    WHERE student_id=$1
    ORDER BY created_at DESC
  `,
    [id]
  );

  const xpLog = await pool.query(
    `
    SELECT 
      t.id,
      t.amount,
      t.source,
      t.created_at,
      m.name AS mission_name
    FROM xp_transactions t
    LEFT JOIN missions m ON t.mission_id = m.id
    WHERE t.student_id=$1
    ORDER BY t.created_at DESC
  `,
    [id]
  );

  const character = await pool.query(
    `
    SELECT c.id, c.name, c.image_url
    FROM users u
    LEFT JOIN characters c ON u.character_id = c.id
    WHERE u.id=$1
  `,
    [id]
  );

  res.json({
    user: user.rows[0],
    uploads: uploads.rows,
    xp_log: xpLog.rows,
    character: character.rows[0] || null,
  });
});

app.post("/api/student/selectCharacter", isStudent, async (req, res) => {
  const { characterId } = req.body;
  const id = req.session.user.id;

  if (!characterId) return res.json({ success: false });

  await pool.query("UPDATE users SET character_id=$1 WHERE id=$2", [
    characterId,
    id,
  ]);

  res.json({ success: true });
});

// =======================================================
// START
// =======================================================
app.listen(process.env.PORT || 8080, () => {
  console.log("🚀 Server läuft auf Port 8080");
});

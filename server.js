// =======================================================
// Temple of Logic – CLEAN SERVER.JS (v3)
// Features:
// - Login (admin/student)
// - Klassen + Schüler:innen (inkl. Löschen einer Klasse mit Schülern)
// - Missionen mit Bild (R2)
// - Schüler-Uploads (R2) + letzter Upload in XP-Ansicht
// - Bonuskarten mit Bild (R2)
// - Charaktere mit Bild (R2)
// - Levelsystem (required_xp) -> /api/levels
// - XP-Vergabe + XP-Vergabe über Missionen
// - XP-Logging in xp_transactions (für spätere Auswertungen)
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
// Express / Middleware
// -------------------------------------------------------
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  session({
    secret: "super-temp-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // später bei HTTPS auf true
  })
);

// Static Files (login.html, admin.html, student.html, etc.)
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

const upload = multer({ storage: multer.memoryStorage() });

// -------------------------------------------------------
// Helper: Spalte erzwingen (für sanfte Migrationen)
// -------------------------------------------------------
async function ensureColumn(table, col, typeDDL) {
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = '${table}'
        AND column_name = '${col}'
      ) THEN
        ALTER TABLE ${table} ADD COLUMN ${col} ${typeDDL};
      END IF;
    END$$;
  `);
}

// =======================================================
// MIGRATION
// =======================================================

async function migrate() {
  console.log("🔧 Starte Migration…");

  // KLASSEN
  await pool.query(`
    CREATE TABLE IF NOT EXISTS classes (
      id   SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );
  `);

  // USERS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      password   TEXT NOT NULL,
      role       TEXT NOT NULL DEFAULT 'student',
      class_id   INTEGER REFERENCES classes(id),
      xp         INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // UNIQUE (name, class_id) – Schüler:innen gleichen Namens in anderer Klasse erlaubt
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

  // XP Transactions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS xp_transactions (
      id          SERIAL PRIMARY KEY,
      student_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount      INTEGER NOT NULL DEFAULT 0,
      mission_id  INTEGER REFERENCES missions(id),
      source      TEXT,
      awarded_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMP DEFAULT NOW()
    );
  `);

  // Reparatur alter Spalten in xp_transactions (falls vorhanden)
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='xp_transactions' AND column_name='delta_xp'
      ) THEN
        ALTER TABLE xp_transactions DROP COLUMN delta_xp CASCADE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='xp_transactions' AND column_name='xp_change'
      ) THEN
        ALTER TABLE xp_transactions DROP COLUMN xp_change CASCADE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='xp_transactions' AND column_name='points'
      ) THEN
        ALTER TABLE xp_transactions DROP COLUMN points CASCADE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='xp_transactions' AND column_name='delta'
      ) THEN
        ALTER TABLE xp_transactions DROP COLUMN delta CASCADE;
      END IF;
    END$$;
  `);

  await ensureColumn(
    "xp_transactions",
    "amount",
    "INTEGER NOT NULL DEFAULT 0"
  );
  await ensureColumn("xp_transactions", "mission_id", "INTEGER");
  await ensureColumn("xp_transactions", "source", "TEXT");
  await ensureColumn("xp_transactions", "awarded_by", "INTEGER");

  // MISSIONEN
  await pool.query(`
    CREATE TABLE IF NOT EXISTS missions (
      id            SERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      xp            INTEGER NOT NULL,
      image_url     TEXT,
      require_upload BOOLEAN NOT NULL DEFAULT false,
      created_at    TIMESTAMP DEFAULT NOW()
    );
  `);

  // SCHÜLER-UPLOADS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_uploads (
      id         SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      image_url  TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // BONUSKARTEN – XP-Kosten in Spalte 'xp'
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bonuscards (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      xp         INTEGER NOT NULL DEFAULT 0,
      image_url  TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await ensureColumn(
    "bonuscards",
    "xp",
    "INTEGER NOT NULL DEFAULT 0"
  );

  // CHARACTERS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS characters (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      image_url  TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // LEVELS – wichtiger Fix: Spalte heißt required_xp
  await pool.query(`
    CREATE TABLE IF NOT EXISTS levels (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      required_xp INTEGER NOT NULL,
      created_at  TIMESTAMP DEFAULT NOW()
    );
  `);
  await ensureColumn(
    "levels",
    "required_xp",
    "INTEGER NOT NULL DEFAULT 0"
  );

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

// Liste aller Klassen
app.get("/api/class", isAdmin, async (_, res) => {
  const r = await pool.query("SELECT * FROM classes ORDER BY name ASC");
  res.json(r.rows);
});

// Klasse anlegen
app.post("/api/class", isAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.json({ success: false });

  await pool.query(
    "INSERT INTO classes (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
    [name]
  );

  res.json({ success: true });
});

// Klasse löschen + zugehörige Schüler:innen
app.delete("/api/class/:id", isAdmin, async (req, res) => {
  const classId = parseInt(req.params.id, 10);
  if (Number.isNaN(classId)) {
    return res
      .status(400)
      .json({ success: false, error: "Invalid class id" });
  }

  try {
    await pool.query("BEGIN");

    // alle Schüler:innen dieser Klasse löschen (Uploads / XP-Logs via FK-Cascade)
    await pool.query(
      "DELETE FROM users WHERE class_id=$1 AND role='student'",
      [classId]
    );

    // Klasse selbst löschen
    await pool.query("DELETE FROM classes WHERE id=$1", [classId]);

    await pool.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    console.error("Class delete error:", err);
    await pool.query("ROLLBACK");
    res.status(500).json({ success: false, error: "Delete failed" });
  }
});

// =======================================================
// SCHÜLER:INNEN
// =======================================================

app.get("/api/student", isAdmin, async (req, res) => {
  const { classId } = req.query;

  // WICHTIG: "undefined" / "null" / leer abfangen → keine DB-Fehler mehr
  if (!classId || classId === "undefined" || classId === "null") {
    return res.json([]);
  }

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
  if (!name || !password || !classId) {
    return res.json({ success: false });
  }

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
// XP TRANSACTIONS – HELPERS
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

  if (!studentId || Number.isNaN(delta)) {
    return res.json({ success: false });
  }

  await pool.query(
    "UPDATE users SET xp = xp + $1 WHERE id=$2",
    [delta, studentId]
  );

  await logXP(studentId, delta, null, "direct", req.session.user.id);

  res.json({ success: true });
});

app.post("/api/xpmission", isAdmin, async (req, res) => {
  const { studentId, missionId } = req.body;

  if (!studentId || !missionId) {
    return res.json({ success: false });
  }

  const r = await pool.query("SELECT xp FROM missions WHERE id=$1", [
    missionId,
  ]);
  if (r.rows.length === 0) return res.json({ success: false });

  const missionXP = r.rows[0].xp;

  await pool.query(
    "UPDATE users SET xp = xp + $1 WHERE id=$2",
    [missionXP, studentId]
  );

  await logXP(studentId, missionXP, missionId, "mission", req.session.user.id);

  res.json({ success: true });
});

// =======================================================
// SCHÜLER-UPLOAD (Studentenseite) + Admin-Delete
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
        "uploads/" +
        studentId +
        "_" +
        Date.now() +
        "_" +
        req.file.originalname;

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
      console.error("Upload Fehler:", err);
      res.status(500).json({ success: false });
    }
  }
);

// Admin löscht den letzten Upload eines Schülers
app.delete("/api/upload/:studentId", isAdmin, async (req, res) => {
  const studentId = parseInt(req.params.studentId, 10);
  if (Number.isNaN(studentId)) {
    return res.json({ success: false });
  }

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
  const fileUrl = entry.image_url;
  const prefix = process.env.R2_PUBLIC_URL + "/";
  const key = fileUrl.replace(prefix, "");

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

      const fileName =
        "missions/" + Date.now() + "_" + req.file.originalname;

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
  const valXP = Number(xp);

  if (!name || Number.isNaN(valXP)) {
    return res.json({ success: false });
  }

  await pool.query(
    `
    INSERT INTO missions (name, xp, image_url, require_upload)
    VALUES ($1, $2, $3, $4)
  `,
    [name, valXP, imageUrl || null, requireUpload === true]
  );

  res.json({ success: true });
});

app.get("/api/missions", isAdmin, async (_, res) => {
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
      console.error("Mission delete R2 error:", err);
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
  const cost = Number(xp);

  if (!name || Number.isNaN(cost)) {
    return res.json({ success: false });
  }

  await pool.query(
    `
    INSERT INTO bonuscards (name, xp, image_url)
    VALUES ($1, $2, $3)
  `,
    [name, cost, imageUrl || null]
  );

  res.json({ success: true });
});

app.get("/api/bonus", isAdmin, async (_, res) => {
  const r = await pool.query("SELECT * FROM bonuscards ORDER BY id DESC");
  res.json(r.rows);
});

app.delete("/api/bonus/:id", isAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.json({ success: false });

  const r = await pool.query(
    "SELECT image_url FROM bonuscards WHERE id=$1",
    [id]
  );

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
      console.error("Bonus delete R2 error:", err);
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

app.get("/api/character", isAdmin, async (_, res) => {
  const r = await pool.query("SELECT * FROM characters ORDER BY id DESC");
  res.json(r.rows);
});

app.delete("/api/character/:id", isAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.json({ success: false });

  const r = await pool.query(
    "SELECT image_url FROM characters WHERE id=$1",
    [id]
  );

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
      console.error("Character delete R2 error:", err);
    }
  }

  await pool.query("DELETE FROM characters WHERE id=$1", [id]);
  res.json({ success: true });
});

// =======================================================
// LEVELSYSTEM
// =======================================================

// Level anlegen – Admin sendet: { name, min_xp }
app.post("/api/levels", isAdmin, async (req, res) => {
  const { name, min_xp } = req.body;
  const xp = Number(min_xp);

  if (!name || Number.isNaN(xp)) {
    return res.json({ success: false });
  }

  await pool.query(
    `
    INSERT INTO levels (name, required_xp)
    VALUES ($1, $2)
  `,
    [name, xp]
  );

  res.json({ success: true });
});

// Liste aller Level
app.get("/api/levels", isAdmin, async (_, res) => {
  const r = await pool.query(
    "SELECT id, name, required_xp FROM levels ORDER BY required_xp ASC"
  );
  res.json(r.rows);
});

// Level löschen
app.delete("/api/levels/:id", isAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.json({ success: false });

  await pool.query("DELETE FROM levels WHERE id=$1", [id]);
  res.json({ success: true });
});

// =======================================================
// START SERVER
// =======================================================

app.listen(process.env.PORT || 8080, () => {
  console.log("🚀 Server läuft auf Port 8080");
});

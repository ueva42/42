// =======================================================
// Temple of Logic – SERVER.JS (final, mit Auto-Repair)
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
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------------------------------------------
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  session({
    secret: "super-temp-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // bei https später secure: true
  })
);

app.use(express.static(path.join(__dirname, "public")));

// -------------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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
// Helper: Spalte erzwingen
// -------------------------------------------------------
async function ensureColumn(table, col, type) {
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name='${table}' AND column_name='${col}'
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

  // Users
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

  // UNIQUE (name, class_id)
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
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

  // Bonuskarten (ggf. ohne xp vorhanden → später Repair)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bonuscards (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
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

  // Level – auf min_xp standardisieren
  await pool.query(`
    CREATE TABLE IF NOT EXISTS levels (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      min_xp INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Falls alte Spalte required_xp existiert → in min_xp umbenennen
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='levels' AND column_name='required_xp'
      ) THEN
        ALTER TABLE levels RENAME COLUMN required_xp TO min_xp;
      END IF;
    END$$;
  `);

  // Sicherstellen, dass min_xp existiert
  await ensureColumn("levels", "min_xp", "INTEGER NOT NULL DEFAULT 0");

  // Student-State (noch kaum genutzt, aber ok)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_state (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      character_id INTEGER REFERENCES characters(id),
      traits JSONB,
      items JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // XP-Transactions (neues Schema)
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

  // 🔥 AUTO-REPAIR ALTE SPALTEN in xp_transactions
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

  // Sicherstellen, dass neue Spalten existieren
  await ensureColumn("xp_transactions", "amount", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("xp_transactions", "mission_id", "INTEGER");
  await ensureColumn("xp_transactions", "source", "TEXT");
  await ensureColumn("xp_transactions", "awarded_by", "INTEGER");

  // 🔥 AUTO-REPAIR bonuscards.xp
  await ensureColumn("bonuscards", "xp", "INTEGER NOT NULL DEFAULT 0");

  // users.character_id für spätere Charakterwahl
  await ensureColumn("users", "character_id", "INTEGER REFERENCES characters(id)");

  // Default-Admin
  await pool.query(`
    INSERT INTO users (name, password, role)
    VALUES ('admin', 'bruhrain', 'admin')
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
      COALESCE(su.image_url, NULL) AS upload_url
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
// XP TRANSACTIONS HELFER
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

  if (!studentId) return res.json({ success: false });

  await pool.query(
    "UPDATE users SET xp = xp + $1 WHERE id=$2",
    [Number(xp), studentId]
  );

  await logXP(studentId, Number(xp), null, "direct", req.session.user.id);

  res.json({ success: true });
});

app.post("/api/xpmission", isAdmin, async (req, res) => {
  const { studentId, missionId } = req.body;

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
// XP – Mission Summary für Admin (für Tabelle in XP-Reiter)
// =======================================================

app.get("/api/xp/mission-summary", isAdmin, async (req, res) => {
  const { classId } = req.query;

  const params = [];
  let where = "u.role='student'";
  if (classId) {
    where += " AND u.class_id = $1";
    params.push(classId);
  }

  const q = `
    SELECT 
      u.id AS student_id,
      u.name AS student_name,
      m.id AS mission_id,
      m.name AS mission_name,
      COALESCE(SUM(t.amount), 0) AS total_xp
    FROM users u
    LEFT JOIN xp_transactions t
      ON t.student_id = u.id AND t.mission_id IS NOT NULL
    LEFT JOIN missions m
      ON t.mission_id = m.id
    WHERE ${where}
    GROUP BY u.id, u.name, m.id, m.name
    ORDER BY u.name ASC, m.name ASC
  `;
  const r = await pool.query(q, params);
  res.json(r.rows);
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
    } catch {}
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
    const prefix = process.env.R2_PUBLIC_URL + "/";
    const key = r.rows[0].image_url.replace(prefix, "");

    try {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
        })
      );
    } catch (e) {
      console.log("R2 delete error bonus:", e.message);
    }
  }

  await pool.query("DELETE FROM bonuscards WHERE id=$1");
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

  await pool.query(
    `
    INSERT INTO characters (name, image_url)
    VALUES ($1, $2)
  `,
    [name, imageUrl]
  );

  res.json({ success: true });
});

app.get("/api/character", isAdmin, async (_, res) => {
  const r = await pool.query("SELECT * FROM characters ORDER BY id DESC");
  res.json(r.rows);
});

app.delete("/api/character/:id", isAdmin, async (req, res) => {
  const id = req.params.id;

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
    } catch (e) {
      console.log("Character delete R2 error:", e.message);
    }
  }

  await pool.query("DELETE FROM characters WHERE id=$1", [id]);
  res.json({ success: true });
});

// =======================================================
// LEVEL SYSTEM
// =======================================================

app.post("/api/levels", isAdmin, async (req, res) => {
  const { name, min_xp } = req.body;

  await pool.query(
    `
    INSERT INTO levels (name, min_xp)
    VALUES ($1, $2)
  `,
    [name, Number(min_xp)]
  );

  res.json({ success: true });
});

app.get("/api/levels", isAdmin, async (_, res) => {
  const r = await pool.query("SELECT * FROM levels ORDER BY min_xp ASC");
  res.json(r.rows);
});

app.delete("/api/levels/:id", isAdmin, async (req, res) => {
  await pool.query("DELETE FROM levels WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// =======================================================
// STUDENT PAGE – Eigene XP, Missionen & Uploads auslesen
// (einfach gehalten; Schülerseite können wir später schön machen)
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

// =======================================================
// STUDENT – Charakter speichern
// =======================================================

app.post("/api/student/selectCharacter", isStudent, async (req, res) => {
  const id = req.session.user.id;
  const { characterId } = req.body;

  await pool.query("UPDATE users SET character_id=$1 WHERE id=$2", [
    characterId,
    id,
  ]);

  res.json({ success: true });
});

// =======================================================
// START SERVER
// =======================================================

app.listen(process.env.PORT || 8080, () => {
  console.log("🚀 Server läuft auf Port 8080");
});

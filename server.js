// =======================================================
// Temple of Logic – FINAL SERVER.JS (COMPLETE FILE)
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
    cookie: { secure: false },
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
// MIGRATION HELPERS
// -------------------------------------------------------

async function ensureColumn(table, col, type) {
  try {
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='${table}' AND column_name='${col}'
        ) THEN
          ALTER TABLE ${table} ADD COLUMN ${col} ${type};
        END IF;
      END$$;
    `);
  } catch (err) {
    console.error("Column check error:", err);
  }
}

// -------------------------------------------------------
// MIGRATION
// -------------------------------------------------------

async function migrate() {
  console.log("🔧 Starte Migration…");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS classes (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );
  `);

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

  // UNIQUE(name, class_id)
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_uploads (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bonuscards (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      xp INTEGER NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS characters (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS levels (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      required_xp INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

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

  // XP Logging
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

  // Railway Fix
  await ensureColumn("xp_transactions", "amount", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("xp_transactions", "mission_id", "INTEGER");
  await ensureColumn("xp_transactions", "source", "TEXT");
  await ensureColumn("xp_transactions", "awarded_by", "INTEGER");

  // Default admin
  await pool.query(`
    INSERT INTO users (name, password, role)
    VALUES ('admin', 'bruhrain', 'admin')
    ON CONFLICT (name, class_id) DO NOTHING;
  `);

  console.log("Migration abgeschlossen.");
}

await migrate();

// -------------------------------------------------------
// AUTH
// -------------------------------------------------------

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
  await pool.query(
    "INSERT INTO classes (name) VALUES ($1) ON CONFLICT DO NOTHING",
    [req.body.name]
  );
  res.json({ success: true });
});

// =======================================================
// SCHÜLER
// =======================================================

app.get("/api/student", isAdmin, async (req, res) => {
  const classId = req.query.classId;
  if (!classId) return res.json([]);

  const r = await pool.query(
    `
      SELECT u.id, u.name, u.password, u.xp,
      (
        SELECT image_url FROM student_uploads
        WHERE student_id = u.id
        ORDER BY created_at DESC LIMIT 1
      ) AS upload_url
      FROM users u
      WHERE u.class_id=$1 AND u.role='student'
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
      ON CONFLICT DO NOTHING
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
// XP VERGABE & LOGGING
// =======================================================

async function logXP(studentId, amount, source, missionId, awardedBy) {
  await pool.query(
    `
      INSERT INTO xp_transactions (student_id, amount, mission_id, source, awarded_by)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [studentId, amount, missionId, source, awardedBy]
  );
}

app.post("/api/xp", async (req, res) => {
  const sessionUser = req.session.user;
  if (!sessionUser) return res.status(403).json({ error: "Not logged in" });

  let studentId = req.body.studentId;
  const xp = Number(req.body.xp);

  // Schüler kann eigene XP verlieren (Bonuskarte)
  if (sessionUser.role === "student") {
    studentId = sessionUser.id;
  }

  await pool.query(
    "UPDATE users SET xp = xp + $1 WHERE id=$2",
    [xp, studentId]
  );

  await logXP(studentId, xp, "direct", null, sessionUser.id);

  res.json({ success: true });
});

app.post("/api/xpmission", isAdmin, async (req, res) => {
  const { studentId, missionId } = req.body;

  const r = await pool.query("SELECT xp FROM missions WHERE id=$1", [missionId]);
  if (r.rows.length === 0) return res.json({ success: false });

  const xp = r.rows[0].xp;

  await pool.query(
    "UPDATE users SET xp = xp + $1 WHERE id=$2",
    [xp, studentId]
  );

  await logXP(studentId, xp, "mission", missionId, req.session.user.id);

  res.json({ success: true });
});

// Mission-Summary für Admin
app.get("/api/xp/mission-summary", isAdmin, async (_, res) => {
  const r = await pool.query(`
    SELECT 
      m.id, 
      m.name,
      COALESCE(SUM(t.amount), 0) AS total_xp,
      COUNT(t.id) AS grants
    FROM missions m
    LEFT JOIN xp_transactions t ON t.mission_id = m.id
    GROUP BY m.id
    ORDER BY m.name ASC
  `);

  res.json(r.rows);
});

// =======================================================
// SCHÜLER-UPLOADS
// =======================================================

app.post(
  "/api/student/upload",
  isStudent,
  upload.single("image"),
  async (req, res) => {
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
      `INSERT INTO student_uploads (student_id, image_url) VALUES ($1, $2)`,
      [studentId, url]
    );

    res.json({ success: true, url });
  }
);

// Admin löscht letzten Upload eines Schülers
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

  const imageUrl = r.rows[0].image_url;
  const key = imageUrl.replace(process.env.R2_PUBLIC_URL + "/", "");

  try {
    await r2.send(
      new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
      })
    );
  } catch (err) {
    console.error("R2 Delete Error:", err);
  }

  await pool.query("DELETE FROM student_uploads WHERE id=$1", [r.rows[0].id]);

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
  }
);

app.post("/api/missions", isAdmin, async (req, res) => {
  const { name, xp, imageUrl, requireUpload } = req.body;

  await pool.query(
    `INSERT INTO missions (name, xp, image_url, require_upload)
     VALUES ($1, $2, $3, $4)`,
    [name, xp, imageUrl, requireUpload]
  );

  res.json({ success: true });
});

app.get("/api/missions", isAdmin, async (_, res) => {
  const r = await pool.query("SELECT * FROM missions ORDER BY id DESC");
  res.json(r.rows);
});

app.get("/api/student/missions", isStudent, async (_, res) => {
  const r = await pool.query("SELECT * FROM missions ORDER BY id ASC");
  res.json(r.rows);
});

app.delete("/api/missions/:id", isAdmin, async (req, res) => {
  const missionId = req.params.id;

  const r = await pool.query(
    "SELECT image_url FROM missions WHERE id=$1",
    [missionId]
  );

  if (r.rows.length > 0 && r.rows[0].image_url) {
    const key = r.rows[0].image_url.replace(process.env.R2_PUBLIC_URL + "/", "");

    try {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
        })
      );
    } catch (err) {}
  }

  await pool.query("DELETE FROM missions WHERE id=$1", [missionId]);

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
  }
);

app.post("/api/bonus", isAdmin, async (req, res) => {
  const { name, xp, imageUrl } = req.body;

  await pool.query(
    `
      INSERT INTO bonuscards (name, xp, image_url)
      VALUES ($1, $2, $3)
    `,
    [name, xp, imageUrl]
  );

  res.json({ success: true });
});

app.get("/api/bonus", isAdmin, async (_, res) => {
  const r = await pool.query("SELECT * FROM bonuscards ORDER BY xp ASC");
  res.json(r.rows);
});

app.get("/api/student/bonus", isStudent, async (_, res) => {
  const r = await pool.query("SELECT * FROM bonuscards ORDER BY xp ASC");
  res.json(r.rows);
});

app.delete("/api/bonus/:id", isAdmin, async (req, res) => {
  const id = req.params.id;

  const r = await pool.query(
    "SELECT image_url FROM bonuscards WHERE id=$1",
    [id]
  );

  if (r.rows.length > 0 && r.rows[0].image_url) {
    const key = r.rows[0].image_url.replace(process.env.R2_PUBLIC_URL + "/", "");
    try {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
        })
      );
    } catch (err) {
      console.error("R2 Delete Bonus Error:", err);
    }
  }

  await pool.query("DELETE FROM bonuscards WHERE id=$1", [id]);
  res.json({ success: true });
});

// =======================================================
// CHARAKTERE
// =======================================================

app.post(
  "/api/character/upload",
  isAdmin,
  upload.single("image"),
  async (req, res) => {
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
  }
);

app.post("/api/character", isAdmin, async (req, res) => {
  const { name, imageUrl } = req.body;

  await pool.query(
    "INSERT INTO characters (name, image_url) VALUES ($1,$2)",
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
    const key = r.rows[0].image_url.replace(process.env.R2_PUBLIC_URL + "/", "");
    try {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
        })
      );
    } catch (err) {
      console.error("R2 Delete Character Error:", err);
    }
  }

  await pool.query("DELETE FROM characters WHERE id=$1", [id]);
  res.json({ success: true });
});

app.get("/api/student/characters", isStudent, async (_, res) => {
  const r = await pool.query("SELECT * FROM characters ORDER BY id ASC");
  res.json(r.rows);
});

// =======================================================
// LEVEL
// =======================================================

app.post("/api/level", isAdmin, async (req, res) => {
  const { name, required_xp } = req.body;

  await pool.query(
    "INSERT INTO levels (name, required_xp) VALUES ($1,$2)",
    [name, required_xp]
  );

  res.json({ success: true });
});

app.get("/api/level", isAdmin, async (_, res) => {
  const r = await pool.query("SELECT * FROM levels ORDER BY required_xp ASC");
  res.json(r.rows);
});

app.delete("/api/level/:id", isAdmin, async (req, res) => {
  await pool.query("DELETE FROM levels WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

app.get("/api/student/levels", isStudent, async (_, res) => {
  const r = await pool.query("SELECT * FROM levels ORDER BY required_xp ASC");
  res.json(r.rows);
});

// =======================================================
// STUDENT STATE (Charakter, Traits, Items)
// =======================================================

app.get("/api/student/state", isStudent, async (req, res) => {
  const userId = req.session.user.id;

  const r = await pool.query(
    `
      SELECT 
        u.id AS user_id,
        u.name,
        u.xp,
        ss.character_id,
        ss.traits,
        ss.items,
        c.name AS character_name,
        c.image_url AS character_image_url
      FROM users u
      LEFT JOIN student_state ss ON ss.user_id = u.id
      LEFT JOIN characters c ON c.id = ss.character_id
      WHERE u.id = $1
    `,
    [userId]
  );

  const row = r.rows[0];

  if (!row) {
    return res.json({
      exists: false,
      user: null,
      state: null,
    });
  }

  res.json({
    exists: !!row.character_id,
    user: {
      id: row.user_id,
      name: row.name,
      xp: row.xp,
    },
    state: row.character_id
      ? {
          character_id: row.character_id,
          traits: row.traits || [],
          items: row.items || [],
          character_name: row.character_name,
          character_image_url: row.character_image_url,
        }
      : null,
  });
});

app.post("/api/student/state/init", isStudent, async (req, res) => {
  const userId = req.session.user.id;
  const { characterId, traits, items } = req.body;

  const r = await pool.query(
    "SELECT id FROM student_state WHERE user_id=$1",
    [userId]
  );
  if (r.rows.length > 0) {
    return res.json({ success: false, alreadyInitialized: true });
  }

  await pool.query(
    `
      INSERT INTO student_state (user_id, character_id, traits, items)
      VALUES ($1, $2, $3::jsonb, $4::jsonb)
    `,
    [userId, characterId, JSON.stringify(traits), JSON.stringify(items)]
  );

  res.json({ success: true });
});

// =======================================================
// SERVER START
// =======================================================

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("🚀 Server läuft auf Port " + PORT);
});

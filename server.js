// =======================================================
// Temple of Logic – SERVER.JS (FINAL GTA VERSION + FIRST LOGIN)
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
  DeleteObjectCommand
} from "@aws-sdk/client-s3";
import pkg from "pg";
const { Pool } = pkg;

// -------------------------------------------------------
// Grundpfade
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
    cookie: { secure: false }
  })
);

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// -------------------------------------------------------
// DB & CLOUD STORAGE
// -------------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

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
// Helper: Spalten anlegen, wenn sie fehlen
// -------------------------------------------------------
async function ensureColumn(table, col, type) {
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
}

// -------------------------------------------------------
// Helper: Temp-Passwort generieren (6-stellig, alphanumerisch)
// -------------------------------------------------------
function generateTempPassword(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let pw = "";
  for (let i = 0; i < length; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)];
  }
  return pw;
}

// -------------------------------------------------------
// LEVEL-FUNKTIONEN
// -------------------------------------------------------
async function updateStudentLevel(studentId) {
  const r = await pool.query("SELECT xp FROM users WHERE id=$1", [studentId]);
  if (!r.rows.length) return;

  const xp = r.rows[0].xp;
  const levels = await pool.query(
    "SELECT id,min_xp FROM levels ORDER BY min_xp ASC"
  );

  let newLevel = null;
  for (const lvl of levels.rows) {
    if (xp >= lvl.min_xp) newLevel = lvl.id;
  }

  await pool.query("UPDATE users SET level_id=$1 WHERE id=$2", [
    newLevel,
    studentId
  ]);
}

async function recalcAllStudentLevels() {
  const levels = (
    await pool.query("SELECT id,min_xp FROM levels ORDER BY min_xp ASC")
  ).rows;
  const users = (
    await pool.query("SELECT id,xp FROM users WHERE role='student'")
  ).rows;

  for (const u of users) {
    let levelId = null;
    for (const l of levels) {
      if (u.xp >= l.min_xp) levelId = l.id;
    }
    await pool.query("UPDATE users SET level_id=$1 WHERE id=$2", [
      levelId,
      u.id
    ]);
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
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      class_id INTEGER,
      xp INTEGER NOT NULL DEFAULT 0,
      character_id INTEGER,
      level_id INTEGER,
      traits JSONB,
      items JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // first_login-Flag ergänzen
  await ensureColumn("users", "first_login", "BOOLEAN NOT NULL DEFAULT FALSE");

  // uniqueness (name + class)
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name='users'
          AND constraint_name='users_name_class_unique'
      ) THEN
        ALTER TABLE users
        ADD CONSTRAINT users_name_class_unique UNIQUE(name,class_id);
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
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_uploads (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mission_id INTEGER REFERENCES missions(id),
      image_url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bonuscards (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      xp INTEGER NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS characters (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS xp_transactions (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      mission_id INTEGER REFERENCES missions(id),
      source TEXT,
      awarded_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS levels (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      min_xp INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // default admin
  await pool.query(`
    INSERT INTO users (name,password,role,first_login)
    VALUES ('admin','bruhrain','admin',FALSE)
    ON CONFLICT DO NOTHING
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
    "SELECT id,name,password,role,class_id,first_login FROM users WHERE name=$1",
    [username]
  );
  if (!r.rows.length) return res.json({ success: false });

  const user = r.rows[0];
  if (user.password !== password) return res.json({ success: false });

  req.session.user = {
    id: user.id,
    role: user.role,
    class_id: user.class_id
  };

  res.json({
    success: true,
    role: user.role,
    firstLogin: !!user.first_login
  });
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

// -------------------------------------------------------
// FIRST LOGIN – Passwort ändern
// -------------------------------------------------------
app.post("/api/first-login", isStudent, async (req, res) => {
  const studentId = req.session.user.id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.json({
      success: false,
      message: "Bitte alle Felder ausfüllen."
    });
  }

  const r = await pool.query(
    "SELECT password,first_login FROM users WHERE id=$1",
    [studentId]
  );
  if (!r.rows.length) {
    return res.json({
      success: false,
      message: "Benutzer nicht gefunden."
    });
  }

  const user = r.rows[0];

  if (!user.first_login) {
    return res.json({
      success: false,
      message: "Erst-Login bereits abgeschlossen."
    });
  }

  if (user.password !== currentPassword) {
    return res.json({
      success: false,
      message: "Aktuelles Einmalpasswort ist falsch."
    });
  }

  await pool.query(
    "UPDATE users SET password=$1, first_login=FALSE WHERE id=$2",
    [newPassword, studentId]
  );

  res.json({ success: true });
});

// -------------------------------------------------------
// STUDENT – Dashboard mit Charakterwahl
// -------------------------------------------------------
app.get("/api/student/me", isStudent, async (req, res) => {
  const id = req.session.user.id;

  const userData = await pool.query(
    `
    SELECT u.id,u.name,u.xp,u.character_id,u.level_id,
           l.name AS level_name,l.min_xp AS level_min_xp
    FROM users u
    LEFT JOIN levels l ON l.id = u.level_id
    WHERE u.id=$1
  `,
    [id]
  );

  const user = userData.rows[0];
  let character = null;

  if (user.character_id) {
    const c = await pool.query(
      "SELECT id,name,image_url FROM characters WHERE id=$1",
      [user.character_id]
    );
    character = c.rows[0] || null;
  }

  const TRAITS = [
    "Neugierig",
    "Ausdauernd",
    "Kreativ",
    "Hilfsbereit",
    "Strukturiert",
    "Ruhig",
    "Zielstrebig",
    "Analytisch",
    "Teamorientiert",
    "Sorgfältig",
    "Mutig",
    "Risikofreudig",
    "Optimistisch",
    "Aufmerksam",
    "Pragmatisch"
  ];
  const ITEMS = [
    "Zirkel der Präzision",
    "Rechenamulett",
    "Logikstein",
    "Zauberstift",
    "Kompass",
    "Rucksack",
    "Lineal",
    "Lampe",
    "Formelbuch"
  ];
  const pick3 = arr =>
    [...arr].sort(() => Math.random() - 0.5).slice(0, 3);

  const traitItem = await pool.query(
    "SELECT traits,items FROM users WHERE id=$1",
    [id]
  );

  let traits = traitItem.rows[0].traits;
  let items = traitItem.rows[0].items;

  if (!traits) {
    traits = pick3(TRAITS);
    await pool.query("UPDATE users SET traits=$1 WHERE id=$2", [
      JSON.stringify(traits),
      id
    ]);
  }

  if (!items) {
    items = pick3(ITEMS);
    await pool.query("UPDATE users SET items=$1 WHERE id=$2", [
      JSON.stringify(items),
      id
    ]);
  }

  const xpLog = await pool.query(
    `
    SELECT t.*, m.name AS mission_name
    FROM xp_transactions t
    LEFT JOIN missions m ON t.mission_id = m.id
    WHERE student_id=$1
    ORDER BY created_at DESC
  `,
    [id]
  );

  const xpPerMission = await pool.query(
    `
    SELECT mission_id, SUM(amount) AS total
    FROM xp_transactions
    WHERE student_id=$1 AND mission_id IS NOT NULL
    GROUP BY mission_id
  `,
    [id]
  );

  const xpByMission = {};
  xpPerMission.rows.forEach(r => {
    xpByMission[r.mission_id] = Number(r.total);
  });

  const uploads = await pool.query(
    `
    SELECT su.*, m.name AS mission_name
    FROM student_uploads su
    LEFT JOIN missions m ON m.id = su.mission_id
    WHERE su.student_id=$1
    ORDER BY su.created_at DESC
  `,
    [id]
  );

  const levels = await pool.query(
    `
    SELECT id,name,min_xp
    FROM levels
    ORDER BY min_xp ASC
  `
  );

  res.json({
    user,
    character,
    traits,
    items,
    xp_log: xpLog.rows,
    uploads: uploads.rows,
    levels: levels.rows,
    xp_per_mission: xpByMission
  });
});

// -------------------------------------------------------
// STUDENT Charakterliste
// -------------------------------------------------------
app.get("/api/student/characterList", isStudent, async (_req, res) => {
  const r = await pool.query(
    "SELECT id,name,image_url FROM characters ORDER BY id ASC"
  );
  res.json(r.rows);
});

app.post("/api/student/selectCharacter", isStudent, async (req, res) => {
  const studentId = req.session.user.id;
  const { characterId } = req.body;

  if (!characterId)
    return res.json({ success: false, message: "Kein characterId" });

  await pool.query("UPDATE users SET character_id=$1 WHERE id=$2", [
    characterId,
    studentId
  ]);

  res.json({ success: true });
});

// -------------------------------------------------------
// STUDENT Upload für Mission
// -------------------------------------------------------
app.post(
  "/api/student/uploadForMission",
  isStudent,
  upload.single("image"),
  async (req, res) => {
    const { missionId } = req.body;
    const studentId = req.session.user.id;

    const fileName = `uploads/${studentId}_${missionId}_${Date.now()}_${
      req.file.originalname
    }`;

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: fileName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
      })
    );

    const url = `${process.env.R2_PUBLIC_URL}/${fileName}`;

    await pool.query(
      `
      INSERT INTO student_uploads (student_id,mission_id,image_url)
      VALUES ($1,$2,$3)
    `,
      [studentId, missionId, url]
    );

    res.json({ success: true, url });
  }
);

// -------------------------------------------------------
// STUDENT Missionsliste
// -------------------------------------------------------
app.get("/api/student/missions", isStudent, async (_req, res) => {
  const r = await pool.query("SELECT * FROM missions ORDER BY id DESC");
  res.json(r.rows);
});

// -------------------------------------------------------
// STUDENT Bonuskarten
// -------------------------------------------------------
app.get("/api/student/rewards", isStudent, async (req, res) => {
  const r = await pool.query(
    "SELECT * FROM bonuscards ORDER BY xp ASC"
  );
  res.json(r.rows);
});

app.post("/api/student/redeemReward", isStudent, async (req, res) => {
  const studentId = req.session.user.id;
  const { rewardId } = req.body;

  const r = await pool.query(
    "SELECT xp FROM bonuscards WHERE id=$1",
    [rewardId]
  );

  if (!r.rows.length)
    return res.json({ success: false, message: "Reward nicht gefunden" });

  const cost = Number(r.rows[0].xp);

  const u = (
    await pool.query("SELECT xp FROM users WHERE id=$1", [studentId])
  ).rows[0];

  if (u.xp < cost)
    return res.json({ success: false, message: "Nicht genug XP" });

  await pool.query("UPDATE users SET xp=xp-$1 WHERE id=$2", [
    cost,
    studentId
  ]);

  res.json({ success: true });
});

// -------------------------------------------------------
// ADMIN Klassen
// -------------------------------------------------------
app.get("/api/class", isAdmin, async (_req, res) => {
  const r = await pool.query(
    "SELECT id,name FROM classes ORDER BY name ASC"
  );
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
  const id = Number(req.params.id);

  await pool.query("DELETE FROM users WHERE class_id=$1 AND role='student'", [
    id
  ]);
  await pool.query("DELETE FROM classes WHERE id=$1", [id]);

  res.json({ success: true });
});

// -------------------------------------------------------
// ADMIN Students – mit Auto-Passwort & first_login = true
// -------------------------------------------------------
app.get("/api/student", isAdmin, async (req, res) => {
  const { classId } = req.query;
  if (!classId) return res.json([]);

  const r = await pool.query(
    `
    SELECT id,name,password,xp
    FROM users
    WHERE role='student' AND class_id=$1
    ORDER BY name ASC
  `,
    [classId]
  );

  res.json(r.rows);
});

app.post("/api/student", isAdmin, async (req, res) => {
  const { name, classId } = req.body;
  if (!name || !classId) return res.json({ success: false });

  const tempPassword = generateTempPassword();

  await pool.query(
    `
    INSERT INTO users (name,password,role,class_id,xp,first_login)
    VALUES ($1,$2,'student',$3,0,TRUE)
    ON CONFLICT (name,class_id) DO NOTHING
  `,
    [name, tempPassword, classId]
  );

  res.json({ success: true });
});

app.delete("/api/student/:id", isAdmin, async (req, res) => {
  await pool.query("DELETE FROM users WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// **NEU**: Passwort-Reset für Schüler:innen
app.post("/api/student/resetPassword", isAdmin, async (req, res) => {
  const { studentId } = req.body;
  if (!studentId) {
    return res.json({ success: false, message: "studentId fehlt" });
  }

  const newPassword = generateTempPassword();

  await pool.query(
    "UPDATE users SET password=$1, first_login=TRUE WHERE id=$2",
    [newPassword, studentId]
  );

  res.json({ success: true, password: newPassword });
});

// -------------------------------------------------------
// XP Vergabe
// -------------------------------------------------------
async function logXP(studentId, amount, missionId, source, adminId) {
  await pool.query(
    `
    INSERT INTO xp_transactions (student_id,amount,mission_id,source,awarded_by)
    VALUES ($1,$2,$3,$4,$5)
  `,
    [studentId, amount, missionId, source, adminId]
  );
}

app.post("/api/xp", isAdmin, async (req, res) => {
  const { studentId, xp } = req.body;
  const delta = Number(xp);

  await pool.query("UPDATE users SET xp=xp+$1 WHERE id=$2", [
    delta,
    studentId
  ]);

  await logXP(studentId, delta, null, "direct", req.session.user.id);
  await updateStudentLevel(studentId);

  res.json({ success: true });
});

app.post("/api/xpmission", isAdmin, async (req, res) => {
  const { studentId, missionId } = req.body;

  const m = await pool.query("SELECT xp FROM missions WHERE id=$1", [
    missionId
  ]);
  if (!m.rows.length) return res.json({ success: false });

  const xp = m.rows[0].xp;

  await pool.query("UPDATE users SET xp=xp+$1 WHERE id=$2", [
    xp,
    studentId
  ]);

  await logXP(studentId, xp, missionId, "mission", req.session.user.id);
  await updateStudentLevel(studentId);

  res.json({ success: true });
});

// -------------------------------------------------------
// ADMIN Uploads
// -------------------------------------------------------
app.get("/api/uploads/:studentId", isAdmin, async (req, res) => {
  const r = await pool.query(
    `
    SELECT su.*, m.name AS mission_name
    FROM student_uploads su
    LEFT JOIN missions m ON m.id = su.mission_id
    WHERE su.student_id=$1
    ORDER BY su.created_at DESC
  `,
    [req.params.studentId]
  );

  res.json(r.rows);
});

app.delete("/api/upload/delete/:uploadId", isAdmin, async (req, res) => {
  const r = await pool.query(
    "SELECT image_url FROM student_uploads WHERE id=$1",
    [req.params.uploadId]
  );
  if (!r.rows.length) return res.json({ success: false });

  const url = r.rows[0].image_url;
  const prefix = process.env.R2_PUBLIC_URL + "/";
  const key = url.replace(prefix, "");

  try {
    await r2.send(
      new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key
      })
    );
  } catch {}

  await pool.query("DELETE FROM student_uploads WHERE id=$1", [
    req.params.uploadId
  ]);

  res.json({ success: true });
});

// -------------------------------------------------------
// ADMIN – Missionen
// -------------------------------------------------------
let uploadedMissionImageUrl = null;

app.post(
  "/api/missions/upload",
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    if (!req.file) return res.json({ success: false });

    const fileName = `missions/${Date.now()}_${req.file.originalname}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: fileName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
      })
    );

    const url = `${process.env.R2_PUBLIC_URL}/${fileName}`;
    uploadedMissionImageUrl = url;

    res.json({ success: true, url });
  }
);

app.post("/api/missions", isAdmin, async (req, res) => {
  const { name, xp, imageUrl, requireUpload } = req.body;

  await pool.query(
    `
    INSERT INTO missions (name,xp,image_url,require_upload)
    VALUES ($1,$2,$3,$4)
  `,
    [name, Number(xp), imageUrl || uploadedMissionImageUrl, !!requireUpload]
  );

  uploadedMissionImageUrl = null;
  res.json({ success: true });
});

app.get("/api/missions", isAdmin, async (_req, res) => {
  const r = await pool.query("SELECT * FROM missions ORDER BY id DESC");
  res.json(r.rows);
});

app.delete("/api/missions/:id", isAdmin, async (req, res) => {
  const r = await pool.query(
    "SELECT image_url FROM missions WHERE id=$1",
    [req.params.id]
  );

  if (r.rows.length && r.rows[0].image_url) {
    const prefix = process.env.R2_PUBLIC_URL + "/";
    const key = r.rows[0].image_url.replace(prefix, "");

    try {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key
        })
      );
    } catch {}
  }

  await pool.query("DELETE FROM missions WHERE id=$1", [
    req.params.id
  ]);

  res.json({ success: true });
});

// -------------------------------------------------------
// ADMIN – Bonuskarten
// -------------------------------------------------------
let uploadedBonusImageUrl = null;

app.post(
  "/api/bonus/upload",
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    if (!req.file) return res.json({ success: false });

    const fileName = `bonuscards/${Date.now()}_${req.file.originalname}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: fileName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
      })
    );

    const url = `${process.env.R2_PUBLIC_URL}/${fileName}`;
    uploadedBonusImageUrl = url;

    res.json({ success: true, url });
  }
);

app.post("/api/bonus", isAdmin, async (req, res) => {
  const { name, xp, imageUrl } = req.body;

  await pool.query(
    `
    INSERT INTO bonuscards (name,xp,image_url)
    VALUES ($1,$2,$3)
  `,
    [name, Number(xp), imageUrl || uploadedBonusImageUrl]
  );

  uploadedBonusImageUrl = null;
  res.json({ success: true });
});

app.get("/api/bonus", isAdmin, async (_req, res) => {
  const r = await pool.query("SELECT * FROM bonuscards ORDER BY id DESC");
  res.json(r.rows);
});

app.delete("/api/bonus/:id", isAdmin, async (req, res) => {
  const r = await pool.query(
    "SELECT image_url FROM bonuscards WHERE id=$1",
    [req.params.id]
  );

  if (r.rows.length && r.rows[0].image_url) {
    const prefix = process.env.R2_PUBLIC_URL + "/";
    const key = r.rows[0].image_url.replace(prefix, "");

    try {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key
        })
      );
    } catch {}
  }

  await pool.query("DELETE FROM bonuscards WHERE id=$1", [
    req.params.id
  ]);

  res.json({ success: true });
});

// -------------------------------------------------------
// ADMIN – Charaktere
// -------------------------------------------------------
let uploadedCharacterImageUrl = null;

app.post(
  "/api/character/upload",
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    if (!req.file) return res.json({ success: false });

    const fileName = `characters/${Date.now()}_${req.file.originalname}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: fileName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
      })
    );

    const url = `${process.env.R2_PUBLIC_URL}/${fileName}`;
    uploadedCharacterImageUrl = url;

    res.json({ success: true, url });
  }
);

app.post("/api/character", isAdmin, async (req, res) => {
  const { name, imageUrl } = req.body;

  await pool.query(
    `
    INSERT INTO characters (name,image_url)
    VALUES ($1,$2)
  `,
    [name, imageUrl || uploadedCharacterImageUrl]
  );

  uploadedCharacterImageUrl = null;
  res.json({ success: true });
});

app.get("/api/character", isAdmin, async (_req, res) => {
  const r = await pool.query("SELECT * FROM characters ORDER BY id DESC");
  res.json(r.rows);
});

app.delete("/api/character/:id", isAdmin, async (req, res) => {
  const r = await pool.query(
    "SELECT image_url FROM characters WHERE id=$1",
    [req.params.id]
  );

  if (r.rows.length && r.rows[0].image_url) {
    const prefix = process.env.R2_PUBLIC_URL + "/";
    const key = r.rows[0].image_url.replace(prefix, "");

    try {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key
        })
      );
    } catch {}
  }

  await pool.query("DELETE FROM characters WHERE id=$1", [
    req.params.id
  ]);

  res.json({ success: true });
});

// -------------------------------------------------------
// LEVEL ADMIN
// -------------------------------------------------------
app.get("/api/levels", isAdmin, async (_req, res) => {
  const r = await pool.query(
    "SELECT id,name,min_xp FROM levels ORDER BY min_xp ASC"
  );
  res.json(r.rows);
});

app.post("/api/levels", isAdmin, async (req, res) => {
  let { name, minXp } = req.body;
  minXp = Number(minXp);

  const existing = await pool.query("SELECT COUNT(*) FROM levels");
  const count = Number(existing.rows[0].count);

  if (count === 0 && minXp !== 0) minXp = 0;

  await pool.query("INSERT INTO levels (name,min_xp) VALUES ($1,$2)", [
    name,
    minXp
  ]);

  await recalcAllStudentLevels();
  res.json({ success: true });
});

app.delete("/api/levels/:id", isAdmin, async (req, res) => {
  await pool.query("DELETE FROM levels WHERE id=$1", [req.params.id]);
  await recalcAllStudentLevels();

  res.json({ success: true });
});

// -------------------------------------------------------
// STATIC FRONTEND ROUTES
// -------------------------------------------------------
app.get("/login", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/first-login", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "first-login.html"));
});

app.get("/admin", isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/student", isStudent, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "student.html"));
});

// Optional – falls du Charakterauswahl als eigene Seite willst
app.get("/character-select", isStudent, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "character-select.html"));
});

// -------------------------------------------------------
// START SERVER
// -------------------------------------------------------
app.listen(process.env.PORT || 8080, () => {
  console.log("🚀 Server läuft auf Port 8080 (FINAL GTA VERSION + FIRST LOGIN)");
});

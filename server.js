// =======================================================
// Temple of Logic – SERVER.JS (MULTI-SCHOOL + SUPERADMIN,
// Klassen-XP + Klassenbelohnungen, ADMIN-PASSWORTWECHSEL + DEFAULT-SEED)
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

// Root auf Login
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
// Helper: Temp-Passwort generieren
// -------------------------------------------------------
function generateTempPassword(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length })
    .map(() => chars[Math.floor(Math.random() * chars.length)])
    .join("");
}

// -------------------------------------------------------
// LEVEL-FUNKTIONEN
// -------------------------------------------------------
async function updateStudentLevel(studentId) {
  const r = await pool.query(
    "SELECT xp,school_id FROM users WHERE id=$1",
    [studentId]
  );
  if (!r.rows.length) return;
  const { xp, school_id } = r.rows[0];

  const levels = await pool.query(
    "SELECT id,min_xp FROM levels WHERE school_id=$1 ORDER BY min_xp ASC",
    [school_id]
  );

  let newLevel = null;
  for (const lvl of levels.rows) {
    if (xp >= lvl.min_xp) newLevel = lvl.id;
  }

  await pool.query(
    "UPDATE users SET level_id=$1 WHERE id=$2",
    [newLevel, studentId]
  );
}

async function recalcAllStudentLevels() {
  const users = (
    await pool.query(
      "SELECT id,xp,school_id FROM users WHERE role='student'"
    )
  ).rows;

  for (const u of users) {
    const lvls = (
      await pool.query(
        "SELECT id,min_xp FROM levels WHERE school_id=$1 ORDER BY min_xp ASC",
        [u.school_id]
      )
    ).rows;

    let levelId = null;
    for (const l of lvls) {
      if (u.xp >= l.min_xp) levelId = l.id;
    }

    await pool.query(
      "UPDATE users SET level_id=$1 WHERE id=$2",
      [levelId, u.id]
    );
  }
}
// -------------------------------------------------------
// Helper: Klassen-Gesamt-XP
// -------------------------------------------------------
async function getClassTotalXP(classId, schoolId) {
  const r = await pool.query(
    `
    SELECT COALESCE(SUM(xp),0) AS total
    FROM users
    WHERE role='student' AND class_id=$1 AND school_id=$2
  `,
    [classId, schoolId]
  );
  return Number(r.rows[0]?.total || 0);
}

// -------------------------------------------------------
// DEFAULT-SEED PRO SCHULE
// -------------------------------------------------------
async function seedSchoolDefaults(schoolId) {
  // LEVELS
  const lvlCount = (
    await pool.query("SELECT COUNT(*) FROM levels WHERE school_id=$1", [schoolId])
  ).rows[0];
  if (Number(lvlCount.count) === 0) {
    await pool.query(`
      INSERT INTO levels (name,min_xp,school_id) VALUES
        ('Rookie', 0, $1),
        ('Street Pro', 100, $1),
        ('Logic Legend', 250, $1)
    `, [schoolId]);
  }

  // MISSIONEN
  const missionCount = (
    await pool.query("SELECT COUNT(*) FROM missions WHERE school_id=$1", [schoolId])
  ).rows[0];
  if (Number(missionCount.count) === 0) {
    await pool.query(`
      INSERT INTO missions (name,xp,image_url,require_upload,school_id) VALUES
        ('Warm-Up: Konzentrations-Drive', 10, NULL, false, $1),
        ('Math Hustle: Gleichungsjagd', 20, NULL, true,  $1),
        ('Logic Run: Rätsel-Checkpoint', 30, NULL, true,  $1)
    `, [schoolId]);
  }

  // BONUSKARTEN
  const bonusCount = (
    await pool.query("SELECT COUNT(*) FROM bonuscards WHERE school_id=$1", [schoolId])
  ).rows[0];
  if (Number(bonusCount.count) === 0) {
    await pool.query(`
      INSERT INTO bonuscards (name,xp,image_url,school_id) VALUES
        ('5-Minuten Chill-Break', 30, NULL, $1),
        ('Hausaufgaben-Joker (1x)', 60, NULL, $1),
        ('Boss-Seat: Wunschplatz', 90, NULL, $1)
    `, [schoolId]);
  }

  // CHARACTERS
  const charCount = (
    await pool.query("SELECT COUNT(*) FROM characters WHERE school_id=$1", [schoolId])
  ).rows[0];
  if (Number(charCount.count) === 0) {
    await pool.query(`
      INSERT INTO characters (name,image_url,school_id) VALUES
        ('Nova Drift', NULL, $1),
        ('Pixel Rydah', NULL, $1),
        ('Logic Lynx', NULL, $1),
        ('Neon Vibes', NULL, $1)
    `, [schoolId]);
  }
}

// -------------------------------------------------------
// MIGRATION
// -------------------------------------------------------
async function migrate() {
  console.log("🔧 Migration läuft…");

  // Schulen
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schools (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Users (Basis)
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

  // Zusatzspalten Users
  await ensureColumn("users", "first_login", "BOOLEAN NOT NULL DEFAULT FALSE");
  await ensureColumn("users", "school_id", "INTEGER");

  // Klassen
  await pool.query(`
    CREATE TABLE IF NOT EXISTS classes (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    )
  `);
  await ensureColumn("classes", "school_id", "INTEGER");

  // Missionen
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
  await ensureColumn("missions", "school_id", "INTEGER");

  // Uploads
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_uploads (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mission_id INTEGER REFERENCES missions(id),
      image_url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ensureColumn("student_uploads", "school_id", "INTEGER");

  // Bonuskarten
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bonuscards (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      xp INTEGER NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ensureColumn("bonuscards", "school_id", "INTEGER");

  // Charaktere
  await pool.query(`
    CREATE TABLE IF NOT EXISTS characters (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ensureColumn("characters", "school_id", "INTEGER");

  // XP-Transaktionen
  await pool.query(`
    CREATE TABLE IF NOT EXISTS xp_transactions (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      mission_id INTEGER REFERENCES missions(id),
      source TEXT,
      awarded_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ensureColumn("xp_transactions", "school_id", "INTEGER");

  // Levels
  await pool.query(`
    CREATE TABLE IF NOT EXISTS levels (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      min_xp INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ensureColumn("levels", "school_id", "INTEGER");
  // ---------------------------
  // NEU: Klassen-Belohnungen
  // ---------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_reward_rounds (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      school_id INTEGER,
      title TEXT,
      target_xp INTEGER NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      fixed_option_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ensureColumn("class_reward_rounds", "school_id", "INTEGER");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_reward_options (
      id SERIAL PRIMARY KEY,
      round_id INTEGER NOT NULL REFERENCES class_reward_rounds(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_reward_votes (
      id SERIAL PRIMARY KEY,
      round_id INTEGER NOT NULL REFERENCES class_reward_rounds(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      option_id INTEGER NOT NULL REFERENCES class_reward_options(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Unique Vote
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name='class_reward_votes'
          AND constraint_name='class_reward_votes_unique_vote'
      ) THEN
        ALTER TABLE class_reward_votes
          ADD CONSTRAINT class_reward_votes_unique_vote
          UNIQUE(round_id, student_id);
      END IF;
    END$$;
  `);

  // -------- LEVEL-CONSTRAINT FIX --------
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name='levels'
          AND constraint_name='levels_min_xp_unique'
      ) THEN
        ALTER TABLE levels DROP CONSTRAINT levels_min_xp_unique;
      END IF;
    END$$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name='levels'
          AND constraint_name='levels_school_min_xp_unique'
      ) THEN
        ALTER TABLE levels
          ADD CONSTRAINT levels_school_min_xp_unique UNIQUE(school_id, min_xp);
      END IF;
    END$$;
  `);

  // ---------------------------
  // DUPLIKATE USERS BEREINIGEN
  // ---------------------------
  await pool.query(`
    DELETE FROM users u
    USING users u2
    WHERE u.name = u2.name
      AND u.school_id = u2.school_id
      AND u.id > u2.id
      AND u.school_id IS NOT NULL
      AND u2.school_id IS NOT NULL;
  `);

  await pool.query(`
    DELETE FROM users u
    USING users u2
    WHERE u.name = u2.name
      AND u.school_id IS NULL
      AND u2.school_id IS NULL
      AND u.id > u2.id;
  `);

  // ---------------------------
  // UNIQUE Constraints Users / Classes
  // ---------------------------
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
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name='users'
          AND constraint_name='users_name_school_unique'
      ) THEN
        ALTER TABLE users
        ADD CONSTRAINT users_name_school_unique UNIQUE(name,school_id);
      END IF;
    END$$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name='classes'
          AND constraint_name='classes_name_key'
      ) THEN
        ALTER TABLE classes DROP CONSTRAINT classes_name_key;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name='classes'
          AND constraint_name='classes_name_school_unique'
      ) THEN
        ALTER TABLE classes
        ADD CONSTRAINT classes_name_school_unique UNIQUE(name,school_id);
      END IF;
    END$$;
  `);

  // ---------------------------
  // FK xp_transactions.awarded_by fixen
  // ---------------------------
  await pool.query(`
    UPDATE xp_transactions t
    SET awarded_by = NULL
    WHERE awarded_by IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = t.awarded_by)
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name='xp_transactions'
          AND constraint_name='xp_transactions_awarded_by_fkey'
      ) THEN
        ALTER TABLE xp_transactions
          DROP CONSTRAINT xp_transactions_awarded_by_fkey;
      END IF;

      ALTER TABLE xp_transactions
        ADD CONSTRAINT xp_transactions_awarded_by_fkey
        FOREIGN KEY (awarded_by)
        REFERENCES users(id)
        ON DELETE SET NULL;
    END$$;
  `);

  // ---------------------------
  // Default-Schule ADSZ
  // ---------------------------
  let defaultSchoolId;
  const sres = await pool.query(
    "SELECT id FROM schools WHERE slug='adsz'"
  );

  if (sres.rows.length) {
    defaultSchoolId = sres.rows[0].id;
  } else {
    const ins = await pool.query(
      "INSERT INTO schools (name,slug) VALUES ('ADSZ','adsz') RETURNING id"
    );
    defaultSchoolId = ins.rows[0].id;
  }

  await pool.query(
    "UPDATE users SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );

  await pool.query(
    "UPDATE classes SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );

  await pool.query(
    "UPDATE missions SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );

  await pool.query(
    "UPDATE bonuscards SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );

  await pool.query(
    "UPDATE characters SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );

  await pool.query(
    "UPDATE levels SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );

  await pool.query(
    "UPDATE student_uploads SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );

  await pool.query(
    "UPDATE xp_transactions SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );

  await pool.query(
    "UPDATE class_reward_rounds SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );

  await pool.query(`
    DELETE FROM users u
    USING users u2
    WHERE u.name = u2.name
      AND u.school_id = u2.school_id
      AND u.id > u2.id;
  `);

  await pool.query(
    `
    INSERT INTO users (name,password,role,school_id,first_login)
    VALUES ('admin','bruhrain','admin',$1,FALSE)
    ON CONFLICT (name,school_id) DO NOTHING
    `,
    [defaultSchoolId]
  );

  await pool.query(
    `
    INSERT INTO users (name,password,role,school_id,first_login)
    VALUES ('ueva42','bruhrain','superadmin',$1,FALSE)
    ON CONFLICT (name,school_id) DO NOTHING
    `,
    [defaultSchoolId]
  );

  const allSchools = await pool.query("SELECT id FROM schools");
  for (const row of allSchools.rows) {
    await seedSchoolDefaults(row.id);
  }

  console.log("✔️ Migration fertig.");
}

await migrate();

// -------------------------------------------------------
// AUTH
// -------------------------------------------------------
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  const r = await pool.query(
    `
    SELECT id,name,password,role,class_id,school_id,first_login
    FROM users
    WHERE name=$1
    ORDER BY id ASC
    LIMIT 1
  `,
    [username]
  );

  if (!r.rows.length) return res.json({ success: false });

  const user = r.rows[0];
  if (user.password !== password) return res.json({ success: false });

  req.session.user = {
    id: user.id,
    role: user.role,
    class_id: user.class_id,
    school_id: user.school_id
  };

  res.json({
    success: true,
    role: user.role,
    firstLogin: user.role === "student" ? !!user.first_login : false
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});
// -------------------------------------------------------
// ROLE GUARDS
// -------------------------------------------------------
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

function isSuperadmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "superadmin")
    return res.status(403).json({ error: "Forbidden" });
  next();
}

// -------------------------------------------------------
// FIRST LOGIN – Passwort ändern (nur Schüler)
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
    return res.json({ success: false, message: "Benutzer nicht gefunden." });
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
// ADMIN – Profil & Passwort ändern
// -------------------------------------------------------
app.get("/api/admin/me", isAdmin, async (req, res) => {
  const id = req.session.user.id;
  const r = await pool.query(
    `
    SELECT u.id,u.name,u.role,u.school_id,s.name AS school_name,s.slug
    FROM users u
    JOIN schools s ON s.id = u.school_id
    WHERE u.id=$1
  `,
    [id]
  );

  if (!r.rows.length) {
    return res.json({ success: false });
  }

  const admin = r.rows[0];

  res.json({
    success: true,
    name: admin.name,
    school: admin.school_name,
    role: admin.role,
    slug: admin.slug
  });
});

app.post("/api/admin/change-password", isAdmin, async (req, res) => {
  const adminId = req.session.user.id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.json({
      success: false,
      message: "Bitte aktuelles und neues Passwort angeben."
    });
  }

  const r = await pool.query(
    "SELECT password FROM users WHERE id=$1 AND role='admin'",
    [adminId]
  );

  if (!r.rows.length) {
    return res.json({
      success: false,
      message: "Admin nicht gefunden."
    });
  }

  const admin = r.rows[0];

  if (admin.password !== currentPassword) {
    return res.json({
      success: false,
      message: "Aktuelles Passwort ist falsch."
    });
  }

  await pool.query(
    "UPDATE users SET password=$1 WHERE id=$2",
    [newPassword, adminId]
  );

  res.json({ success: true });
});

// -------------------------------------------------------
// STUDENT – Dashboard / Profil
// -------------------------------------------------------
app.get("/api/student/me", isStudent, async (req, res) => {
  const id = req.session.user.id;

  const userData = await pool.query(
    `
    SELECT u.id,u.name,u.xp,u.character_id,u.level_id,u.school_id,
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
    "Neugierig","Ausdauernd","Kreativ","Hilfsbereit","Strukturiert",
    "Ruhig","Zielstrebig","Analytisch","Teamorientiert","Sorgfältig",
    "Mutig","Risikofreudig","Optimistisch","Aufmerksam","Pragmatisch"
  ];
  const ITEMS = [
    "Zirkel der Präzision","Rechenamulett","Logikstein",
    "Zauberstift","Kompass","Rucksack","Lineal",
    "Lampe","Formelbuch"
  ];

  const pick3 = arr =>
    [...arr].sort(() => Math.random() - 0.5).slice(0, 3);

  const ti = await pool.query(
    "SELECT traits,items FROM users WHERE id=$1",
    [id]
  );

  let traits = ti.rows[0].traits;
  let items = ti.rows[0].items;

  if (!traits) {
    traits = pick3(TRAITS);
    await pool.query(
      "UPDATE users SET traits=$1 WHERE id=$2",
      [JSON.stringify(traits), id]
    );
  }

  if (!items) {
    items = pick3(ITEMS);
    await pool.query(
      "UPDATE users SET items=$1 WHERE id=$2",
      [JSON.stringify(items), id]
    );
  }

  const xpLog = await pool.query(
    `
    SELECT t.*, m.name AS mission_name
    FROM xp_transactions t
    LEFT JOIN missions m ON m.id = t.id
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
    LEFT JOIN missions m ON m.id = su.id
    WHERE su.student_id=$1
    ORDER BY su.created_at DESC
  `,
    [id]
  );

  const levels = await pool.query(
    `
    SELECT id,name,min_xp
    FROM levels
    WHERE school_id=$1
    ORDER BY min_xp ASC
  `,
    [user.school_id]
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
// STUDENT – Charaktere
// -------------------------------------------------------
app.get("/api/student/characterList", isStudent, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const r = await pool.query(
    "SELECT id,name,image_url FROM characters WHERE school_id=$1 ORDER BY id ASC",
    [schoolId]
  );
  res.json(r.rows);
});

app.post("/api/student/selectCharacter", isStudent, async (req, res) => {
  const studentId = req.session.user.id;
  const { characterId } = req.body;

  if (!characterId) {
    return res.json({
      success: false,
      message: "characterId fehlt"
    });
  }

  await pool.query(
    "UPDATE users SET character_id=$1 WHERE id=$2",
    [characterId, studentId]
  );

  res.json({ success: true });
});

// -------------------------------------------------------
// STUDENT – Upload für Mission
// -------------------------------------------------------
app.post(
  "/api/student/uploadForMission",
  isStudent,
  upload.single("image"),
  async (req, res) => {
    const { missionId } = req.body;
    const studentId = req.session.user.id;
    const schoolId = req.session.user.school_id;

    const fileName = `uploads/${schoolId}_${studentId}_${missionId}_${Date.now()}_${req.file.originalname}`;

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
      INSERT INTO student_uploads (student_id,mission_id,image_url,school_id)
      VALUES ($1,$2,$3,$4)
    `,
      [studentId, missionId, url, schoolId]
    );

    res.json({ success: true, url });
  }
);
// -------------------------------------------------------
// CLASS REWARDS – Frontend-Kompatible API ENDPOINTS
// -------------------------------------------------------

// 1) Bild-Upload für Klassenbelohnung
let uploadedClassRewardImageUrl = null;

app.post(
  "/api/class/rewards/upload",
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    if (!req.file) return res.json({ success: false });

    const schoolId = req.session.user.school_id;
    const fileName = `classrewards/${schoolId}_${Date.now()}_${req.file.originalname}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: fileName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
      })
    );

    const url = `${process.env.R2_PUBLIC_URL}/${fileName}`;
    uploadedClassRewardImageUrl = url;

    res.json({ success: true, url });
  }
);

// 2) Neue Klassenbelohnung anlegen
app.post("/api/class/rewards", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const { name, xpRequired, imageUrl } = req.body;

  if (!name || !xpRequired) {
    return res.json({ success: false, message: "Name und XP nötig" });
  }

  await pool.query(
    `
    INSERT INTO class_rewards (name, xp_required, image_url, school_id)
    VALUES ($1,$2,$3,$4)
  `,
    [
      name,
      Number(xpRequired),
      imageUrl || uploadedClassRewardImageUrl || null,
      schoolId
    ]
  );

  uploadedClassRewardImageUrl = null;
  res.json({ success: true });
});

// 3) Klassenbelohnungen abrufen (Admin + Student)
app.get("/api/class/rewards", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(
    `
    SELECT id, name, xp_required, image_url
    FROM class_rewards
    WHERE school_id=$1
    ORDER BY xp_required ASC
  `,
    [schoolId]
  );

  res.json(r.rows);
});
// -------------------------------------------------------
// ADMIN – Klassen
// -------------------------------------------------------
app.get("/api/class", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const r = await pool.query(
    "SELECT id,name FROM classes WHERE school_id=$1 ORDER BY name ASC",
    [schoolId]
  );
  res.json(r.rows);
});

app.post("/api/class", isAdmin, async (req, res) => {
  const { name } = req.body;
  const schoolId = req.session.user.school_id;
  if (!name) return res.json({ success: false });

  await pool.query(
    "INSERT INTO classes (name,school_id) VALUES ($1,$2) ON CONFLICT (name,school_id) DO NOTHING",
    [name, schoolId]
  );

  res.json({ success: true });
});

app.delete("/api/class/:id", isAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const schoolId = req.session.user.school_id;

  try {
    await pool.query(
      "DELETE FROM users WHERE class_id=$1 AND role='student' AND school_id=$2",
      [id, schoolId]
    );

    await pool.query(
      "DELETE FROM classes WHERE id=$1 AND school_id=$2",
      [id, schoolId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting class", err);
    res
      .status(500)
      .json({ success: false, message: "Fehler beim Löschen der Klasse" });
  }
});
// -------------------------------------------------------
// ADMIN – Schüler:innen
// -------------------------------------------------------
app.get("/api/admin/students", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const classId = Number(req.query.classId);

  const r = await pool.query(
    `
    SELECT id,name,xp,class_id
    FROM users
    WHERE role='student' AND school_id=$1 AND class_id=$2
    ORDER BY name ASC
    `,
    [schoolId, classId]
  );

  res.json(r.rows);
});

app.post("/api/admin/students", isAdmin, async (req, res) => {
  const { name, classId } = req.body;
  const schoolId = req.session.user.school_id;

  if (!name || !classId) return res.json({ success: false });

  await pool.query(
    `
    INSERT INTO users (name,role,class_id,school_id,xp)
    VALUES ($1,'student',$2,$3,0)
    `,
    [name, Number(classId), schoolId]
  );

  res.json({ success: true });
});

app.delete("/api/admin/students/:id", isAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const schoolId = req.session.user.school_id;

  await pool.query(
    "DELETE FROM users WHERE id=$1 AND school_id=$2 AND role='student'",
    [id, schoolId]
  );

  res.json({ success: true });
});

// -------------------------------------------------------
// ADMIN – Missionen
// -------------------------------------------------------
app.get("/api/admin/missions", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const r = await pool.query(
    "SELECT id,name,xp,require_upload,image_url FROM missions WHERE school_id=$1 ORDER BY id DESC",
    [schoolId]
  );
  res.json(r.rows);
});

let uploadedMissionImage = null;

app.post(
  "/api/admin/missions/upload",
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    if (!req.file) return res.json({ success: false });

    const schoolId = req.session.user.school_id;
    const fileName = `missions/${schoolId}_${Date.now()}_${req.file.originalname}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: fileName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
      })
    );

    const url = `${process.env.R2_PUBLIC_URL}/${fileName}`;
    uploadedMissionImage = url;

    res.json({ success: true, url });
  }
);

app.post("/api/admin/missions", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const { name, xp, requireUpload, imageUrl } = req.body;

  if (!name || !xp) {
    return res.json({ success: false, message: "Name und XP fehlen" });
  }

  await pool.query(
    `
    INSERT INTO missions (name,xp,require_upload,image_url,school_id)
    VALUES ($1,$2,$3,$4,$5)
    `,
    [
      name,
      Number(xp),
      !!requireUpload,
      imageUrl || uploadedMissionImage || null,
      schoolId
    ]
  );

  uploadedMissionImage = null;
  res.json({ success: true });
});

// -------------------------------------------------------
// ADMIN – XP vergeben (an alle oder ausgewählte)
// -------------------------------------------------------
app.post("/api/admin/xp/add", isAdmin, async (req, res) => {
  const { studentIds, xpAmount, missionId } = req.body;
  const schoolId = req.session.user.school_id;

  if (!xpAmount || !Array.isArray(studentIds)) {
    return res.json({ success: false });
  }

  for (let id of studentIds) {
    await pool.query(
      `
      UPDATE users
      SET xp = xp + $1
      WHERE id=$2 AND school_id=$3
    `,
      [Number(xpAmount), id, schoolId]
    );

    await pool.query(
      `
      INSERT INTO xp_transactions (user_id,amount,mission_id,school_id,source)
      VALUES ($1,$2,$3,$4,'Admin Vergabe')
    `,
      [id, Number(xpAmount), missionId || null, schoolId]
    );
  }

  res.json({ success: true });
});

// -------------------------------------------------------
// STUDENT – Missionen
// -------------------------------------------------------
app.get("/api/student/missions", isStudent, async (req, res) => {
  const classId = req.session.user.class_id;
  const schoolId = req.session.user.school_id;
  const userId = req.session.user.id;

  const r = await pool.query(
    `
    SELECT id,name,xp,require_upload,image_url
    FROM missions
    WHERE school_id=$1
    ORDER BY id DESC
    `,
    [schoolId]
  );

  const xpLog = await pool.query(
    `
    SELECT mission_id, SUM(amount) AS total
    FROM xp_transactions
    WHERE user_id=$1
    GROUP BY mission_id
    `,
    [userId]
  );

  const xpMap = {};
  xpLog.rows.forEach(x => {
    xpMap[x.mission_id] = Number(x.total);
  });

  res.json(
    r.rows.map(m => ({
      ...m,
      received: xpMap[m.id] || 0
    }))
  );
});

// Upload für Mission
app.post(
  "/api/student/uploadForMission",
  isStudent,
  upload.single("image"),
  async (req, res) => {
    if (!req.file)
      return res.json({ success: false, message: "Keine Datei." });

    const userId = req.session.user.id;
    const schoolId = req.session.user.school_id;
    const missionId = Number(req.body.missionId);

    const fileName = `missionuploads/${userId}_${Date.now()}_${req.file.originalname}`;

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
      INSERT INTO student_mission_uploads (user_id,mission_id,image_url,school_id)
      VALUES ($1,$2,$3,$4)
      `,
      [userId, missionId, url, schoolId]
    );

    res.json({ success: true });
  }
);

// -------------------------------------------------------
// STUDENT – Rewards / Belohnungen
// -------------------------------------------------------
app.get("/api/student/rewards", isStudent, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(
    `
    SELECT id,name,xp,image_url 
    FROM rewards
    WHERE school_id=$1
    ORDER BY xp ASC
  `,
    [schoolId]
  );

  res.json(r.rows);
});

app.post("/api/student/redeemReward", isStudent, async (req, res) => {
  const userId = req.session.user.id;
  const schoolId = req.session.user.school_id;
  const rewardId = Number(req.body.rewardId);

  const r = await pool.query(
    "SELECT xp FROM rewards WHERE id=$1 AND school_id=$2",
    [rewardId, schoolId]
  );

  if (!r.rows.length) return res.json({ success: false });

  const cost = Number(r.rows[0].xp);

  const u = await pool.query(
    "SELECT xp FROM users WHERE id=$1",
    [userId]
  );

  if (u.rows[0].xp < cost) {
    return res.json({ success: false, message: "Nicht genug XP." });
  }

  await pool.query("UPDATE users SET xp = xp - $1 WHERE id=$2", [
    cost,
    userId
  ]);

  await pool.query(
    "INSERT INTO xp_transactions (user_id,amount,source,school_id) VALUES ($1,$2,'Reward',$3)",
    [userId, -cost, schoolId]
  );

  res.json({ success: true });
});

// -------------------------------------------------------
// CHARACTER LIST / Auswahl
// -------------------------------------------------------
app.get("/api/student/characterList", isStudent, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(
    `
    SELECT id,name,image_url
    FROM characters
    WHERE school_id=$1
    ORDER BY id ASC
  `,
    [schoolId]
  );

  res.json(r.rows);
});

app.post("/api/student/selectCharacter", isStudent, async (req, res) => {
  const { characterId } = req.body;
  const userId = req.session.user.id;

  await pool.query(
    "UPDATE users SET character_id=$1 WHERE id=$2",
    [characterId, userId]
  );

  res.json({ success: true });
});

// -------------------------------------------------------
// STATIC ROUTES
// -------------------------------------------------------
app.use(express.static("public"));
app.get("/", (req, res) => res.redirect("/login.html"));

// -------------------------------------------------------
// SERVER-START
// -------------------------------------------------------
app.listen(process.env.PORT || 8080, () => {
  console.log("🚀 Server läuft auf Port 8080 (MULTI-SCHOOL + CLASS-REWARDS)");
});

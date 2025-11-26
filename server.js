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

// Static-Files
app.use(express.static(path.join(__dirname, "public")));

// Login-Root
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// -------------------------------------------------------
// DB + R2 Storage
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
// Helper – fehlende Spalten anlegen
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

// -------------------------------------------------------
// Helper – Temp-Passwort
// -------------------------------------------------------
function generateTempPassword(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length })
    .map(() => chars[Math.floor(Math.random() * chars.length)])
    .join("");
}

// -------------------------------------------------------
// LEVEL-Funktionen
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
// Helper – XP Summe pro Klasse
// -------------------------------------------------------
async function getClassTotalXP(classId, schoolId) {
  const r = await pool.query(
    `
    SELECT COALESCE(SUM(xp),0) AS total
    FROM users
    WHERE role='student'
      AND class_id=$1
      AND school_id=$2
  `,
    [classId, schoolId]
  );

  return Number(r.rows[0]?.total || 0);
}

// -------------------------------------------------------
// Default-Daten pro Schule
//  -> INSERTS OHNE $1, damit kein 42P02-Fehler
// -------------------------------------------------------
async function seedSchoolDefaults(schoolId) {
  // LEVELS
  const lvlCount = (
    await pool.query(
      "SELECT COUNT(*) FROM levels WHERE school_id=$1",
      [schoolId]
    )
  ).rows[0];

  if (Number(lvlCount.count) === 0) {
    await pool.query(`
      INSERT INTO levels (name,min_xp,school_id) VALUES
        ('Rookie', 0, ${schoolId}),
        ('Street Pro', 100, ${schoolId}),
        ('Logic Legend', 250, ${schoolId})
    `);
  }

  // MISSIONEN
  const missionCount = (
    await pool.query(
      "SELECT COUNT(*) FROM missions WHERE school_id=$1",
      [schoolId]
    )
  ).rows[0];

  if (Number(missionCount.count) === 0) {
    await pool.query(`
      INSERT INTO missions (name,xp,image_url,require_upload,school_id)
      VALUES
        ('Warm-Up: Konzentrations-Drive', 10, NULL, FALSE, ${schoolId}),
        ('Math Hustle: Gleichungsjagd', 20, NULL, TRUE, ${schoolId}),
        ('Logic Run: Rätsel-Checkpoint', 30, NULL, TRUE, ${schoolId})
    `);
  }

  // BONUSKARTEN
  const bonusCount = (
    await pool.query(
      "SELECT COUNT(*) FROM bonuscards WHERE school_id=$1",
      [schoolId]
    )
  ).rows[0];

  if (Number(bonusCount.count) === 0) {
    await pool.query(`
      INSERT INTO bonuscards (name,xp,image_url,school_id)
      VALUES
        ('5-Minuten Chill-Break', 30, NULL, ${schoolId}),
        ('Hausaufgaben-Joker (1x)', 60, NULL, ${schoolId}),
        ('Boss-Seat: Wunschplatz', 90, NULL, ${schoolId})
    `);
  }

  // CHARAKTERE
  const charCount = (
    await pool.query(
      "SELECT COUNT(*) FROM characters WHERE school_id=$1",
      [schoolId]
    )
  ).rows[0];

  if (Number(charCount.count) === 0) {
    await pool.query(`
      INSERT INTO characters (name,image_url,school_id)
      VALUES
        ('Nova Drift', NULL, ${schoolId}),
        ('Pixel Rydah', NULL, ${schoolId}),
        ('Logic Lynx', NULL, ${schoolId}),
        ('Neon Vibes', NULL, ${schoolId})
    `);
  }
}

// -------------------------------------------------------
// MIGRATION – Tabellen anlegen + Fixes
// -------------------------------------------------------
async function migrate() {
  console.log("🔧 Migration läuft…");

  // SCHULEN
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schools (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // USERS
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

  await ensureColumn("users", "first_login", "BOOLEAN NOT NULL DEFAULT FALSE");
  await ensureColumn("users", "school_id", "INTEGER");

  // KLASSEN
  await pool.query(`
    CREATE TABLE IF NOT EXISTS classes (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    )
  `);
  await ensureColumn("classes", "school_id", "INTEGER");

  // MISSIONEN
  await pool.query(`
    CREATE TABLE IF NOT EXISTS missions (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      xp INTEGER NOT NULL,
      image_url TEXT,
      require_upload BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ensureColumn("missions", "school_id", "INTEGER");

  // UPLOADS
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

  // BONUSKARTEN
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

  // KLASSENBELOHNUNGEN (Liste)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_rewards (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      xp_required INTEGER NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ensureColumn("class_rewards", "school_id", "INTEGER");

  // CHARAKTERE
  await pool.query(`
    CREATE TABLE IF NOT EXISTS characters (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ensureColumn("characters", "school_id", "INTEGER");

  // XP-LOG
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

  // LEVELS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS levels (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      min_xp INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ensureColumn("levels", "school_id", "INTEGER");

  // ------------------------------------------
  // KLASSE-BELOHNUNGS-RUNDEN (Voting-System)
  // ------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_reward_rounds (
      id SERIAL PRIMARY KEY,
      class_id INTEGER,
      school_id INTEGER,
      title TEXT,
      target_xp INTEGER,
      is_active BOOLEAN DEFAULT TRUE,
      fixed_option_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await ensureColumn("class_reward_rounds", "school_id", "INTEGER");
  await ensureColumn("class_reward_rounds", "is_active", "BOOLEAN DEFAULT TRUE");
  await ensureColumn("class_reward_rounds", "title", "TEXT");

  // ------------------------------------------
  // KLASSE-BELOHNUNGS-OPTIONEN (Voting)
  // ------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_reward_options (
      id SERIAL PRIMARY KEY,
      round_id INTEGER,
      name TEXT,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await ensureColumn("class_reward_options", "round_id", "INTEGER");
  await ensureColumn("class_reward_options", "name", "TEXT");
  await ensureColumn("class_reward_options", "image_url", "TEXT");

  // ------------------------------------------
  // STIMMEN FÜR VOTING
  // ------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_reward_votes (
      id SERIAL PRIMARY KEY,
      round_id INTEGER,
      student_id INTEGER,
      option_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await ensureColumn("class_reward_votes", "round_id", "INTEGER");
  await ensureColumn("class_reward_votes", "student_id", "INTEGER");
  await ensureColumn("class_reward_votes", "option_id", "INTEGER");

  // UNIQUE: eine Stimme pro Schüler pro Runde
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name='class_reward_votes'
          AND constraint_name='class_reward_votes_unique_vote'
      ) THEN
        ALTER TABLE class_reward_votes
        ADD CONSTRAINT class_reward_votes_unique_vote UNIQUE(round_id,student_id);
      END IF;
    END$$;
  `);

  // ------------------------------------------
  // KLASSE-CHALLENGES
  // ------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_challenges (
      id SERIAL PRIMARY KEY,
      class_id INTEGER,
      reward_id INTEGER,
      target_xp INTEGER,
      is_active BOOLEAN DEFAULT TRUE,
      school_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await ensureColumn("class_challenges", "school_id", "INTEGER");

  // -------------------------------------------------------
  // LEVEL-CONSTRAINT FIX
  // -------------------------------------------------------
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
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
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name='levels'
          AND constraint_name='levels_school_min_xp_unique'
      ) THEN
        ALTER TABLE levels
        ADD CONSTRAINT levels_school_min_xp_unique UNIQUE(school_id,min_xp);
      END IF;
    END$$;
  `);

  // -------------------------------------------------------
  // DUPLIKATE USERS FIXEN
  // -------------------------------------------------------
  await pool.query(`
    DELETE FROM users u
    USING users u2
    WHERE u.name = u2.name
      AND u.school_id = u2.school_id
      AND u.id > u2.id
  `);

  // -------------------------------------------------------
  // DEFAULT-SCHULE "ADSZ"
  // -------------------------------------------------------
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

  // Alle Datensätze ohne school_id auf ADSZ setzen
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
    "UPDATE class_rewards SET school_id=$1 WHERE school_id IS NULL",
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
  await pool.query(
    "UPDATE class_challenges SET school_id=$1 WHERE school_id IS NULL",
    [defaultSchoolId]
  );

  // Default Admin
  await pool.query(
    `
    INSERT INTO users (name,password,role,school_id,first_login)
    VALUES ('admin','bruhrain','admin',$1,FALSE)
    ON CONFLICT (name,school_id) DO NOTHING
  `,
    [defaultSchoolId]
  );

  // Superadmin user
  await pool.query(
    `
    INSERT INTO users (name,password,role,school_id,first_login)
    VALUES ('ueva42','bruhrain','superadmin',$1,FALSE)
    ON CONFLICT (name,school_id) DO NOTHING
  `,
    [defaultSchoolId]
  );

  // Defaults für alle Schulen
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
// STUDENT: FIRST LOGIN – Passwort ändern
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
// STUDENT: PROFIL + DASHBOARD
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

  // Traits & Items
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

  const traitItem = await pool.query(
    "SELECT traits,items FROM users WHERE id=$1",
    [id]
  );

  let traits = traitItem.rows[0].traits;
  let items = traitItem.rows[0].items;

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

  // XP-Log
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

  // XP pro Mission
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

  // Uploads
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

  // Level-Liste
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
// STUDENT: Charakter-Liste
// -------------------------------------------------------
app.get("/api/student/characterList", isStudent, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(
    "SELECT id,name,image_url FROM characters WHERE school_id=$1 ORDER BY id ASC",
    [schoolId]
  );

  res.json(r.rows);
});

// Charakter auswählen
app.post("/api/student/selectCharacter", isStudent, async (req, res) => {
  const studentId = req.session.user.id;
  const { characterId } = req.body;

  if (!characterId)
    return res.json({ success: false, message: "Kein characterId" });

  await pool.query(
    "UPDATE users SET character_id=$1 WHERE id=$2",
    [characterId, studentId]
  );

  res.json({ success: true });
});

// -------------------------------------------------------
// STUDENT: Uploads für Mission
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
// STUDENT: Mission-Liste
// -------------------------------------------------------
app.get("/api/student/missions", isStudent, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(
    "SELECT * FROM missions WHERE school_id=$1 ORDER BY id DESC",
    [schoolId]
  );

  res.json(r.rows);
});

// -------------------------------------------------------
// STUDENT: Bonuskarten
// -------------------------------------------------------
app.get("/api/student/rewards", isStudent, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(
    "SELECT * FROM bonuscards WHERE school_id=$1 ORDER BY xp ASC",
    [schoolId]
  );

  res.json(r.rows);
});

app.post("/api/student/redeemReward", isStudent, async (req, res) => {
  const studentId = req.session.user.id;
  const schoolId = req.session.user.school_id;
  const { rewardId } = req.body;

  const r = await pool.query(
    "SELECT xp FROM bonuscards WHERE id=$1 AND school_id=$2",
    [rewardId, schoolId]
  );

  if (!r.rows.length)
    return res.json({ success: false, message: "Reward nicht gefunden" });

  const cost = Number(r.rows[0].xp);

  const u = (
    await pool.query("SELECT xp FROM users WHERE id=$1", [studentId])
  ).rows[0];

  if (u.xp < cost)
    return res.json({ success: false, message: "Nicht genug XP" });

  await pool.query(
    "UPDATE users SET xp=xp-$1 WHERE id=$2",
    [cost, studentId]
  );

  res.json({ success: true });
});

// -------------------------------------------------------
// STUDENT: Klassenfortschritt + Voting (altes System)
// -------------------------------------------------------
app.get("/api/student/class-progress", isStudent, async (req, res) => {
  const studentId = req.session.user.id;
  const schoolId = req.session.user.school_id;

  const u = await pool.query(
    "SELECT class_id FROM users WHERE id=$1",
    [studentId]
  );

  if (!u.rows.length || !u.rows[0].class_id) {
    return res.json({
      success: false,
      message: "Keine Klasse zugeordnet."
    });
  }

  const classId = u.rows[0].class_id;

  const totalXP = await getClassTotalXP(classId, schoolId);

  const roundRes = await pool.query(
    `
    SELECT *
    FROM class_reward_rounds
    WHERE class_id=$1 AND school_id=$2
    ORDER BY created_at DESC
    LIMIT 1
  `,
    [classId, schoolId]
  );

  if (!roundRes.rows.length) {
    return res.json({
      success: true,
      class: { id: classId },
      total_xp: totalXP,
      round: null,
      options: [],
      my_vote_option_id: null
    });
  }

  const round = roundRes.rows[0];

  const optRes = await pool.query(
    `
    SELECT o.id,o.name,o.image_url,
           COUNT(v.id) AS votes
    FROM class_reward_options o
    LEFT JOIN class_reward_votes v ON v.option_id = o.id
    WHERE o.round_id=$1
    GROUP BY o.id,o.name,o.image_url
    ORDER BY o.id ASC
  `,
    [round.id]
  );

  const voteRes = await pool.query(
    `
    SELECT option_id
    FROM class_reward_votes
    WHERE round_id=$1 AND student_id=$2
  `,
    [round.id, studentId]
  );

  const myVote = voteRes.rows[0]?.option_id || null;
  const hasReachedTarget = totalXP >= round.target_xp;

  res.json({
    success: true,
    class: { id: classId },
    total_xp: totalXP,
    round: {
      id: round.id,
      title: round.title,
      target_xp: round.target_xp,
      is_active: round.is_active,
      fixed_option_id: round.fixed_option_id,
      hasReachedTarget
    },
    options: optRes.rows.map(o => ({
      id: o.id,
      name: o.name,
      image_url: o.image_url,
      votes: Number(o.votes),
      is_selected: round.fixed_option_id === o.id
    })),
    my_vote_option_id: myVote
  });
});

// Stimme abgeben
app.post("/api/student/class-reward-vote", isStudent, async (req, res) => {
  const studentId = req.session.user.id;
  const schoolId = req.session.user.school_id;
  const { roundId, optionId } = req.body;

  const rId = Number(roundId);
  const oId = Number(optionId);

  if (!rId || !oId)
    return res.json({ success: false, message: "roundId/optionId fehlt" });

  const roundRes = await pool.query(
    "SELECT id,is_active,school_id FROM class_reward_rounds WHERE id=$1",
    [rId]
  );

  if (!roundRes.rows.length)
    return res.json({ success: false, message: "Runde nicht gefunden" });

  const round = roundRes.rows[0];

  if (round.school_id !== schoolId)
    return res.json({ success: false, message: "Kein Zugriff auf diese Runde" });

  if (!round.is_active)
    return res.json({ success: false, message: "Voting ist geschlossen" });

  // alte Stimme löschen
  await pool.query(
    "DELETE FROM class_reward_votes WHERE round_id=$1 AND student_id=$2",
    [rId, studentId]
  );

  // neue Stimme setzen
  await pool.query(
    "INSERT INTO class_reward_votes (round_id,student_id,option_id) VALUES ($1,$2,$3)",
    [rId, studentId, oId]
  );

  res.json({ success: true });
});
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
// STUDENT: FIRST LOGIN – Passwort ändern
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
// STUDENT: PROFIL + DASHBOARD
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

  // Traits & Items
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

  const traitItem = await pool.query(
    "SELECT traits,items FROM users WHERE id=$1",
    [id]
  );

  let traits = traitItem.rows[0].traits;
  let items = traitItem.rows[0].items;

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

  // XP-Log
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

  // XP pro Mission
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

  // Uploads
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

  // Level-Liste
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
// STUDENT: Charakter-Liste
// -------------------------------------------------------
app.get("/api/student/characterList", isStudent, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(
    "SELECT id,name,image_url FROM characters WHERE school_id=$1 ORDER BY id ASC",
    [schoolId]
  );

  res.json(r.rows);
});

// Charakter auswählen
app.post("/api/student/selectCharacter", isStudent, async (req, res) => {
  const studentId = req.session.user.id;
  const { characterId } = req.body;

  if (!characterId)
    return res.json({ success: false, message: "Kein characterId" });

  await pool.query(
    "UPDATE users SET character_id=$1 WHERE id=$2",
    [characterId, studentId]
  );

  res.json({ success: true });
});

// -------------------------------------------------------
// STUDENT: Uploads für Mission
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
// STUDENT: Mission-Liste
// -------------------------------------------------------
app.get("/api/student/missions", isStudent, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(
    "SELECT * FROM missions WHERE school_id=$1 ORDER BY id DESC",
    [schoolId]
  );

  res.json(r.rows);
});

// -------------------------------------------------------
// STUDENT: Bonuskarten
// -------------------------------------------------------
app.get("/api/student/rewards", isStudent, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(
    "SELECT * FROM bonuscards WHERE school_id=$1 ORDER BY xp ASC",
    [schoolId]
  );

  res.json(r.rows);
});

app.post("/api/student/redeemReward", isStudent, async (req, res) => {
  const studentId = req.session.user.id;
  const schoolId = req.session.user.school_id;
  const { rewardId } = req.body;

  const r = await pool.query(
    "SELECT xp FROM bonuscards WHERE id=$1 AND school_id=$2",
    [rewardId, schoolId]
  );

  if (!r.rows.length)
    return res.json({ success: false, message: "Reward nicht gefunden" });

  const cost = Number(r.rows[0].xp);

  const u = (
    await pool.query("SELECT xp FROM users WHERE id=$1", [studentId])
  ).rows[0];

  if (u.xp < cost)
    return res.json({ success: false, message: "Nicht genug XP" });

  await pool.query(
    "UPDATE users SET xp=xp-$1 WHERE id=$2",
    [cost, studentId]
  );

  res.json({ success: true });
});

// -------------------------------------------------------
// STUDENT: Klassenfortschritt + Voting (altes System)
// -------------------------------------------------------
app.get("/api/student/class-progress", isStudent, async (req, res) => {
  const studentId = req.session.user.id;
  const schoolId = req.session.user.school_id;

  const u = await pool.query(
    "SELECT class_id FROM users WHERE id=$1",
    [studentId]
  );

  if (!u.rows.length || !u.rows[0].class_id) {
    return res.json({
      success: false,
      message: "Keine Klasse zugeordnet."
    });
  }

  const classId = u.rows[0].class_id;

  const totalXP = await getClassTotalXP(classId, schoolId);

  const roundRes = await pool.query(
    `
    SELECT *
    FROM class_reward_rounds
    WHERE class_id=$1 AND school_id=$2
    ORDER BY created_at DESC
    LIMIT 1
  `,
    [classId, schoolId]
  );

  if (!roundRes.rows.length) {
    return res.json({
      success: true,
      class: { id: classId },
      total_xp: totalXP,
      round: null,
      options: [],
      my_vote_option_id: null
    });
  }

  const round = roundRes.rows[0];

  const optRes = await pool.query(
    `
    SELECT o.id,o.name,o.image_url,
           COUNT(v.id) AS votes
    FROM class_reward_options o
    LEFT JOIN class_reward_votes v ON v.option_id = o.id
    WHERE o.round_id=$1
    GROUP BY o.id,o.name,o.image_url
    ORDER BY o.id ASC
  `,
    [round.id]
  );

  const voteRes = await pool.query(
    `
    SELECT option_id
    FROM class_reward_votes
    WHERE round_id=$1 AND student_id=$2
  `,
    [round.id, studentId]
  );

  const myVote = voteRes.rows[0]?.option_id || null;
  const hasReachedTarget = totalXP >= round.target_xp;

  res.json({
    success: true,
    class: { id: classId },
    total_xp: totalXP,
    round: {
      id: round.id,
      title: round.title,
      target_xp: round.target_xp,
      is_active: round.is_active,
      fixed_option_id: round.fixed_option_id,
      hasReachedTarget
    },
    options: optRes.rows.map(o => ({
      id: o.id,
      name: o.name,
      image_url: o.image_url,
      votes: Number(o.votes),
      is_selected: round.fixed_option_id === o.id
    })),
    my_vote_option_id: myVote
  });
});

// Stimme abgeben
app.post("/api/student/class-reward-vote", isStudent, async (req, res) => {
  const studentId = req.session.user.id;
  const schoolId = req.session.user.school_id;
  const { roundId, optionId } = req.body;

  const rId = Number(roundId);
  const oId = Number(optionId);

  if (!rId || !oId)
    return res.json({ success: false, message: "roundId/optionId fehlt" });

  const roundRes = await pool.query(
    "SELECT id,is_active,school_id FROM class_reward_rounds WHERE id=$1",
    [rId]
  );

  if (!roundRes.rows.length)
    return res.json({ success: false, message: "Runde nicht gefunden" });

  const round = roundRes.rows[0];

  if (round.school_id !== schoolId)
    return res.json({ success: false, message: "Kein Zugriff auf diese Runde" });

  if (!round.is_active)
    return res.json({ success: false, message: "Voting ist geschlossen" });

  // alte Stimme löschen
  await pool.query(
    "DELETE FROM class_reward_votes WHERE round_id=$1 AND student_id=$2",
    [rId, studentId]
  );

  // neue Stimme setzen
  await pool.query(
    "INSERT INTO class_reward_votes (round_id,student_id,option_id) VALUES ($1,$2,$3)",
    [rId, studentId, oId]
  );

  res.json({ success: true });
});
// -------------------------------------------------------
// ADMIN – Level-System
// -------------------------------------------------------
app.get("/api/levels", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(`
    SELECT id,name,min_xp
    FROM levels
    WHERE school_id=$1
    ORDER BY min_xp ASC
  `, [schoolId]);

  res.json(r.rows);
});

app.post("/api/levels", isAdmin, async (req, res) => {
  let { name, minXp } = req.body;

  const schoolId = req.session.user.school_id;
  minXp = Number(minXp);

  const existing = await pool.query(`
    SELECT COUNT(*)
    FROM levels
    WHERE school_id=$1
  `, [schoolId]);

  const count = Number(existing.rows[0].count);

  if (count === 0 && minXp !== 0) {
    minXp = 0;
  }

  await pool.query(`
    INSERT INTO levels (name,min_xp,school_id)
    VALUES ($1,$2,$3)
  `, [name, minXp, schoolId]);

  await recalcAllStudentLevels();

  res.json({ success: true });
});

app.delete("/api/levels/:id", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const levelId = Number(req.params.id);

  await pool.query(`
    UPDATE users SET level_id=NULL
    WHERE level_id=$1 AND school_id=$2
  `, [levelId, schoolId]);

  await pool.query(`
    DELETE FROM levels
    WHERE id=$1 AND school_id=$2
  `, [levelId, schoolId]);

  await recalcAllStudentLevels();

  res.json({ success: true });
});

// -------------------------------------------------------
// ADMIN – Klasse-Challenge (neues System)
// -------------------------------------------------------
app.get("/api/class/progress/status", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const classId = Number(req.query.classId);

  if (!classId)
    return res.json({ success: false, message: "classId fehlt" });

  const totalXP = await getClassTotalXP(classId, schoolId);

  const r = await pool.query(`
    SELECT cc.id,cc.target_xp,cc.is_active,
           cr.name AS reward_name
    FROM class_challenges cc
    JOIN class_rewards cr ON cr.id = cc.reward_id
    WHERE cc.class_id=$1 AND cc.school_id=$2
    ORDER BY cc.created_at DESC
    LIMIT 1
  `, [classId, schoolId]);

  if (!r.rows.length) {
    return res.json({
      success: true,
      classId,
      total_xp: totalXP,
      challenge: null
    });
  }

  const ch = r.rows[0];

  res.json({
    success: true,
    classId,
    total_xp: totalXP,
    challenge: {
      id: ch.id,
      reward_name: ch.reward_name,
      target_xp: ch.target_xp,
      current_xp: totalXP,
      is_active: ch.is_active
    }
  });
});

app.post("/api/class/challenge/start", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const { classId, rewardId, targetXp } = req.body;

  const cId = Number(classId);
  const rId = Number(rewardId);
  const tXp = Number(targetXp);

  if (!cId || !rId || !tXp) {
    return res.json({
      success: false,
      message: "classId, rewardId oder targetXp fehlt"
    });
  }

  const rewardRes = await pool.query(`
    SELECT id
    FROM class_rewards
    WHERE id=$1 AND school_id=$2
  `, [rId, schoolId]);

  if (!rewardRes.rows.length) {
    return res.json({ success: false, message: "Belohnung nicht gefunden" });
  }

  await pool.query(`
    UPDATE class_challenges
    SET is_active=FALSE
    WHERE class_id=$1 AND school_id=$2
  `, [cId, schoolId]);

  const ins = await pool.query(`
    INSERT INTO class_challenges (class_id,school_id,reward_id,target_xp,is_active)
    VALUES ($1,$2,$3,$4,TRUE)
    RETURNING id
  `, [cId, schoolId, rId, tXp]);

  res.json({ success: true, challengeId: ins.rows[0].id });
});

app.post("/api/class/challenge/stop", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const { classId } = req.body;
  const cId = Number(classId);

  await pool.query(`
    UPDATE class_challenges
    SET is_active=FALSE
    WHERE class_id=$1 AND school_id=$2
  `, [cId, schoolId]);

  res.json({ success: true });
});

// -------------------------------------------------------
// SUPERADMIN – Schulen, Admins, Status, Reset
// -------------------------------------------------------

// Schulen-Liste
app.get("/api/superadmin/schools", isSuperadmin, async (_req, res) => {
  const r = await pool.query(
    "SELECT id,name,slug FROM schools ORDER BY name ASC"
  );
  res.json(r.rows);
});

// Schule anlegen
app.post("/api/superadmin/schools", isSuperadmin, async (req, res) => {
  const { name, slug } = req.body;
  if (!name || !slug) return res.json({ success: false });

  const ins = await pool.query(
    `
    INSERT INTO schools (name,slug)
    VALUES ($1,$2)
    ON CONFLICT (slug) DO NOTHING
    RETURNING id
  `,
    [name, slug]
  );

  if (ins.rows.length) {
    const newId = ins.rows[0].id;
    await seedSchoolDefaults(newId);
  }

  res.json({ success: true });
});

// Schule löschen (nur Eintrag, keine Kaskade)
app.delete("/api/superadmin/schools/:id", isSuperadmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM schools WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting school", err);
    res
      .status(500)
      .json({ success: false, message: "Fehler beim Löschen der Schule" });
  }
});

// Admin-Liste
app.get("/api/superadmin/admins", isSuperadmin, async (_req, res) => {
  const r = await pool.query(
    `
    SELECT u.id,u.name,u.password,s.slug,s.name AS school_name
    FROM users u
    JOIN schools s ON u.school_id = s.id
    WHERE u.role='admin'
    ORDER BY s.name, u.name
  `
  );
  res.json(r.rows);
});

// Admin anlegen – ohne First-Login-Zwang
app.post("/api/superadmin/admins", isSuperadmin, async (req, res) => {
  const { name, slug } = req.body;
  if (!name || !slug) return res.json({ success: false });

  const s = await pool.query("SELECT id FROM schools WHERE slug=$1", [slug]);
  if (!s.rows.length) {
    return res.json({ success: false, message: "Schule nicht gefunden" });
  }
  const schoolId = s.rows[0].id;

  const tempPassword = generateTempPassword();

  await pool.query(
    `
    INSERT INTO users (name,password,role,school_id,first_login)
    VALUES ($1,$2,'admin',$3,FALSE)
    ON CONFLICT (name,school_id) DO NOTHING
  `,
    [name, tempPassword, schoolId]
  );

  res.json({ success: true });
});

// Admin-Passwort zurücksetzen
app.post(
  "/api/superadmin/admins/reset/:id",
  isSuperadmin,
  async (req, res) => {
    const newPassword = generateTempPassword();

    const r = await pool.query(
      "UPDATE users SET password=$1 WHERE id=$2 AND role='admin' RETURNING id",
      [newPassword, req.params.id]
    );

    if (!r.rows.length) {
      return res.json({ success: false, message: "Admin nicht gefunden" });
    }

    res.json({ success: true, password: newPassword });
  }
);

// Admin löschen
app.delete(
  "/api/superadmin/admins/:id",
  isSuperadmin,
  async (req, res) => {
    try {
      await pool.query("DELETE FROM users WHERE id=$1 AND role='admin'", [
        req.params.id
      ]);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting admin", err);
      res.status(500).json({
        success: false,
        message: "Fehler beim Löschen des Admins"
      });
    }
  }
);

// Systemstatus pro Schule
app.get("/api/superadmin/system-status", isSuperadmin, async (_req, res) => {
  const r = await pool.query(`
    SELECT
      s.id,
      s.name,
      s.slug,
      COUNT(*) FILTER (WHERE u.role='superadmin') AS superadmins,
      COUNT(*) FILTER (WHERE u.role='admin') AS admins,
      COUNT(*) FILTER (WHERE u.role='student') AS students,
      (SELECT COUNT(*) FROM classes c WHERE c.school_id = s.id) AS classes,
      (SELECT COUNT(*) FROM missions m WHERE m.school_id = s.id) AS missions,
      (SELECT COUNT(*) FROM bonuscards b WHERE b.school_id = s.id) AS bonuscards,
      (SELECT COUNT(*) FROM characters ch WHERE ch.school_id = s.id) AS characters,
      (SELECT COUNT(*) FROM levels lv WHERE lv.school_id = s.id) AS levels,
      (SELECT COUNT(*) FROM student_uploads su WHERE su.school_id = s.id) AS uploads,
      (SELECT COUNT(*) FROM xp_transactions xt WHERE xt.school_id = s.id) AS xp_entries
    FROM schools s
    LEFT JOIN users u ON u.school_id = s.id
    GROUP BY s.id,s.name,s.slug
    ORDER BY s.name;
  `);

  res.json(
    r.rows.map(row => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      superadmins: Number(row.superadmins),
      admins: Number(row.admins),
      students: Number(row.students),
      classes: Number(row.classes),
      missions: Number(row.missions),
      bonuscards: Number(row.bonuscards),
      characters: Number(row.characters),
      levels: Number(row.levels),
      uploads: Number(row.uploads),
      xp_entries: Number(row.xp_entries)
    }))
  );
});

// Reset einer Schule (Daten leeren, Admins/Superadmin bleiben)
app.post("/api/superadmin/reset-school", isSuperadmin, async (req, res) => {
  const { schoolId } = req.body;
  const id = Number(schoolId);
  if (!id) return res.json({ success: false, message: "schoolId fehlt" });

  try {
    // Referenzen entfernen
    await pool.query(
      "UPDATE users SET level_id=NULL, character_id=NULL WHERE school_id=$1",
      [id]
    );

    await pool.query("DELETE FROM xp_transactions WHERE school_id=$1", [id]);
    await pool.query("DELETE FROM student_uploads WHERE school_id=$1", [id]);

    await pool.query(
      "DELETE FROM users WHERE school_id=$1 AND role='student'",
      [id]
    );

    await pool.query("DELETE FROM classes WHERE school_id=$1", [id]);
    await pool.query("DELETE FROM missions WHERE school_id=$1", [id]);
    await pool.query("DELETE FROM bonuscards WHERE school_id=$1", [id]);
    await pool.query("DELETE FROM characters WHERE school_id=$1", [id]);
    await pool.query("DELETE FROM levels WHERE school_id=$1", [id]);
    await pool.query("DELETE FROM class_rewards WHERE school_id=$1", [id]);
    await pool.query("DELETE FROM class_challenges WHERE school_id=$1", [id]);
    await pool.query("DELETE FROM class_reward_rounds WHERE school_id=$1", [id]);

    // Default-Daten nach Reset wieder setzen
    await seedSchoolDefaults(id);

    res.json({ success: true });
  } catch (err) {
    console.error("Error resetting school", err);
    res.status(500).json({
      success: false,
      message: "Fehler beim Zurücksetzen der Schule"
    });
  }
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

app.get("/superadmin", isSuperadmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "superadmin.html"));
});

// Optionale Seite für Charakterauswahl
app.get("/character-select", isStudent, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "character-select.html"));
});

// -------------------------------------------------------
// START SERVER
// -------------------------------------------------------
app.listen(process.env.PORT || 8080, () => {
  console.log(
    "🚀 Server läuft auf Port 8080 (MULTI-SCHOOL + SUPERADMIN + Klassenbelohnungen)"
  );
});

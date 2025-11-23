// =======================================================
// Temple of Logic – SERVER.JS (MULTI-SCHOOL + SUPERADMIN, FIXED)
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
      ) THEN ALTER TABLE ${table} ADD COLUMN ${col} ${type};
      END IF;
    END$$;
  `);
}

// -------------------------------------------------------
// Helper: Temp-Passwort generieren
// -------------------------------------------------------
function generateTempPassword(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({length}).map(() =>
    chars[Math.floor(Math.random()*chars.length)]
  ).join("");
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
// MIGRATION – NEU & STABIL
// -------------------------------------------------------
async function migrate() {
  console.log("🔧 Migration läuft…");

  // ————————————————————————————
  // Schulen
  // ————————————————————————————
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schools (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // ————————————————————————————
  // Users (Admin + Schüler + Superadmin)
  // ————————————————————————————
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
      school_id INTEGER,
      first_login BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // WICHTIG: Admin-Duplikate verhindern
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name='users'
          AND constraint_name='users_name_school_unique'
      ) THEN
        ALTER TABLE users
        ADD CONSTRAINT users_name_school_unique UNIQUE(name, school_id);
      END IF;
    END$$;
  `);

  // Schüler-Unique pro Klasse (Name,Class)
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name='users'
          AND constraint_name='users_name_class_unique'
      ) THEN
        ALTER TABLE users
        ADD CONSTRAINT users_name_class_unique UNIQUE(name, class_id);
      END IF;
    END$$;
  `);

  // ----------------------------------------------------
  // Klassen
  // ----------------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS classes (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      school_id INTEGER
    )
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name='classes'
          AND constraint_name='classes_name_school_unique'
      ) THEN
        ALTER TABLE classes
        ADD CONSTRAINT classes_name_school_unique UNIQUE(name, school_id);
      END IF;
    END$$;
  `);

  // ----------------------------------------------------
  // Missionen, Bonuskarten, Charaktere
  // ----------------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS missions (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      xp INTEGER NOT NULL,
      image_url TEXT,
      require_upload BOOLEAN NOT NULL DEFAULT false,
      school_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bonuscards (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      xp INTEGER NOT NULL,
      image_url TEXT,
      school_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS characters (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      image_url TEXT,
      school_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // ----------------------------------------------------
  // Uploads
  // ----------------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_uploads (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mission_id INTEGER REFERENCES missions(id),
      image_url TEXT NOT NULL,
      school_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // ----------------------------------------------------
  // XP-Transaktionen — Fester FK-Fix
  // ----------------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS xp_transactions (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      mission_id INTEGER REFERENCES missions(id),
      source TEXT,
      awarded_by INTEGER,
      school_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // FK bereinigen & ON DELETE SET NULL setzen
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
        SELECT 1 FROM information_schema.table_constraints
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

  // ----------------------------------------------------
  // Levels
  // ----------------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS levels (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      min_xp INTEGER NOT NULL,
      school_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // ----------------------------------------------------
  // Default Schule ADSZ + Superadmin
  // ----------------------------------------------------
  const defaultSchool = await pool.query(
    "SELECT id FROM schools WHERE slug='adsz'"
  );

  let defaultSchoolId;

  if (defaultSchool.rows.length) {
    defaultSchoolId = defaultSchool.rows[0].id;
  } else {
    const ins = await pool.query(
      "INSERT INTO schools (name,slug) VALUES ('ADSZ','adsz') RETURNING id"
    );
    defaultSchoolId = ins.rows[0].id;
  }

  // Admin anlegen (nur einmal)
  await pool.query(`
    INSERT INTO users (name,password,role,school_id,first_login)
    VALUES ('admin','bruhrain','admin',$1,FALSE)
    ON CONFLICT (name, school_id) DO NOTHING
  `, [defaultSchoolId]);

  // Superadmin (nur einmal)
  await pool.query(`
    INSERT INTO users (name,password,role,school_id,first_login)
    VALUES ('ueva42','bruhrain','superadmin',$1,FALSE)
    ON CONFLICT (name, school_id) DO NOTHING
  `, [defaultSchoolId]);

  console.log("✔️ Migration fertig.");
}

await migrate();
// -------------------------------------------------------
// AUTH
// -------------------------------------------------------
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  const r = await pool.query(
    "SELECT id,name,password,role,class_id,school_id,first_login FROM users WHERE name=$1",
    [username]
  );
  if (!r.rows.length) return res.json({ success: false });

  const user = r.rows[0];
  if (user.password !== password) return res.json({ success: false });

  // Session setzen
  req.session.user = {
    id: user.id,
    role: user.role,
    class_id: user.class_id,
    school_id: user.school_id
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
// FIRST LOGIN – Passwort ändern (Schüler)
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
// STUDENT – Dashboard: Profil, XP, Level, Traits, Items
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
    await pool.query("UPDATE users SET traits=$1 WHERE id=$2", [
      JSON.stringify(traits), id
    ]);
  }
  if (!items) {
    items = pick3(ITEMS);
    await pool.query("UPDATE users SET items=$1 WHERE id=$2", [
      JSON.stringify(items), id
    ]);
  }

  // XP Log + Missions XP
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

  // Levels
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
// STUDENT – Charakterliste & Auswahl
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

  if (!characterId)
    return res.json({ success: false, message: "Kein characterId" });

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
// STUDENT – Missionsliste
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
// STUDENT – Bonuskarten einlösen
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

  const u = (await pool.query(
    "SELECT xp FROM users WHERE id=$1",
    [studentId]
  )).rows[0];

  if (u.xp < cost)
    return res.json({ success: false, message: "Nicht genug XP" });

  await pool.query(
    "UPDATE users SET xp=xp-$1 WHERE id=$2",
    [cost, studentId]
  );

  res.json({ success: true });
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
    // Schüler dieser Klasse löschen
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
    res.status(500).json({
      success: false,
      message: "Fehler beim Löschen der Klasse"
    });
  }
});

// -------------------------------------------------------
// ADMIN – Schüler (mit Auto-Passwort & first_login = TRUE)
// -------------------------------------------------------
app.get("/api/student", isAdmin, async (req, res) => {
  const { classId } = req.query;
  const schoolId = req.session.user.school_id;

  if (!classId) return res.json([]);

  const r = await pool.query(
    `
    SELECT id,name,password,xp
    FROM users
    WHERE role='student' AND class_id=$1 AND school_id=$2
    ORDER BY name ASC
  `,
    [classId, schoolId]
  );

  res.json(r.rows);
});

app.post("/api/student", isAdmin, async (req, res) => {
  const { name, classId } = req.body;
  const schoolId = req.session.user.school_id;

  if (!name || !classId) return res.json({ success: false });

  const tempPassword = generateTempPassword();

  await pool.query(
    `
    INSERT INTO users (name,password,role,class_id,school_id,xp,first_login)
    VALUES ($1,$2,'student',$3,$4,0,TRUE)
    ON CONFLICT (name,class_id) DO NOTHING
  `,
    [name, tempPassword, classId, schoolId]
  );

  res.json({ success: true });
});

app.delete("/api/student/:id", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;

  try {
    await pool.query(
      "DELETE FROM users WHERE id=$1 AND school_id=$2",
      [req.params.id, schoolId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting student", err);
    res.status(500).json({
      success: false,
      message: "Fehler beim Löschen der Schülerin / des Schülers"
    });
  }
});

// -------------------------------------------------------
// ADMIN – Passwort-Reset Schüler
// -------------------------------------------------------
app.post("/api/student/resetPassword", isAdmin, async (req, res) => {
  const { studentId } = req.body;
  const schoolId = req.session.user.school_id;

  if (!studentId) {
    return res.json({
      success: false,
      message: "studentId fehlt"
    });
  }

  const newPassword = generateTempPassword();

  const r = await pool.query(
    `
    UPDATE users
    SET password=$1, first_login=TRUE
    WHERE id=$2 AND school_id=$3
    RETURNING id
  `,
    [newPassword, studentId, schoolId]
  );

  if (!r.rows.length) {
    return res.json({
      success: false,
      message: "Schüler:in nicht gefunden"
    });
  }

  res.json({ success: true, password: newPassword });
});

// -------------------------------------------------------
// XP – Vergabe (Direkt & Missions-XP)
// -------------------------------------------------------
async function logXP(studentId, amount, missionId, source, adminId, schoolId) {
  await pool.query(
    `
    INSERT INTO xp_transactions (student_id,amount,mission_id,source,awarded_by,school_id)
    VALUES ($1,$2,$3,$4,$5,$6)
  `,
    [studentId, amount, missionId, source, adminId, schoolId]
  );
}

app.post("/api/xp", isAdmin, async (req, res) => {
  const { studentId, xp } = req.body;
  const delta = Number(xp);

  const adminId = req.session.user.id;
  const schoolId = req.session.user.school_id;

  await pool.query(
    "UPDATE users SET xp=xp+$1 WHERE id=$2",
    [delta, studentId]
  );

  await logXP(studentId, delta, null, "direct", adminId, schoolId);
  await updateStudentLevel(studentId);

  res.json({ success: true });
});

app.post("/api/xpmission", isAdmin, async (req, res) => {
  const { studentId, missionId } = req.body;

  const adminId = req.session.user.id;
  const schoolId = req.session.user.school_id;

  const m = await pool.query(
    "SELECT xp FROM missions WHERE id=$1 AND school_id=$2",
    [missionId, schoolId]
  );

  if (!m.rows.length) {
    return res.json({ success: false });
  }

  const xp = Number(m.rows[0].xp);

  await pool.query("UPDATE users SET xp=xp+$1 WHERE id=$2", [
    xp,
    studentId
  ]);

  await logXP(studentId, xp, missionId, "mission", adminId, schoolId);
  await updateStudentLevel(studentId);

  res.json({ success: true });
});

// -------------------------------------------------------
// ADMIN – Uploads verwalten
// -------------------------------------------------------
app.get("/api/uploads/:studentId", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(
    `
    SELECT su.*, m.name AS mission_name
    FROM student_uploads su
    LEFT JOIN missions m ON m.id = su.mission_id
    WHERE su.student_id=$1 AND su.school_id=$2
    ORDER BY su.created_at DESC
  `,
    [req.params.studentId, schoolId]
  );

  res.json(r.rows);
});

app.delete("/api/upload/delete/:uploadId", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const uploadId = Number(req.params.uploadId);

  try {
    const r = await pool.query(
      "SELECT image_url FROM student_uploads WHERE id=$1 AND school_id=$2",
      [uploadId, schoolId]
    );

    if (!r.rows.length) {
      return res.json({ success: false });
    }

    const url = r.rows[0].image_url;
    const prefix = (process.env.R2_PUBLIC_URL || "") + "/";
    const key = url.replace(prefix, "");

    try {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key
        })
      );
    } catch (err) {
      console.error("R2 delete error (upload)", err);
    }

    await pool.query(
      "DELETE FROM student_uploads WHERE id=$1 AND school_id=$2",
      [uploadId, schoolId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting upload", err);
    res.status(500).json({
      success: false,
      message: "Fehler beim Löschen des Uploads"
    });
  }
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
    uploadedMissionImageUrl = url;

    res.json({ success: true, url });
  }
);

app.post("/api/missions", isAdmin, async (req, res) => {
  const { name, xp, imageUrl, requireUpload } = req.body;
  const schoolId = req.session.user.school_id;

  await pool.query(
    `
    INSERT INTO missions (name,xp,image_url,require_upload,school_id)
    VALUES ($1,$2,$3,$4,$5)
  `,
    [name, Number(xp), imageUrl || uploadedMissionImageUrl, !!requireUpload, schoolId]
  );

  uploadedMissionImageUrl = null;

  res.json({ success: true });
});

app.get("/api/missions", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(
    "SELECT * FROM missions WHERE school_id=$1 ORDER BY id DESC",
    [schoolId]
  );

  res.json(r.rows);
});

app.delete("/api/missions/:id", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const missionId = Number(req.params.id);

  try {
    const r = await pool.query(
      "SELECT image_url FROM missions WHERE id=$1 AND school_id=$2",
      [missionId, schoolId]
    );

    if (r.rows.length && r.rows[0].image_url) {
      const prefix = (process.env.R2_PUBLIC_URL || "") + "/";
      const key = r.rows[0].image_url.replace(prefix, "");

      try {
        await r2.send(
          new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: key
          })
        );
      } catch (err) {
        console.error("R2 delete error (mission)", err);
      }
    }

    // Alle Uploads dieser Mission löschen
    await pool.query(
      "DELETE FROM student_uploads WHERE mission_id=$1 AND school_id=$2",
      [missionId, schoolId]
    );

    // XP-Transaktionen neutralisieren
    await pool.query(
      "UPDATE xp_transactions SET mission_id=NULL WHERE mission_id=$1 AND school_id=$2",
      [missionId, schoolId]
    );

    // Mission löschen
    await pool.query(
      "DELETE FROM missions WHERE id=$1 AND school_id=$2",
      [missionId, schoolId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting mission", err);
    res.status(500).json({
      success: false,
      message: "Fehler beim Löschen der Mission"
    });
  }
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

    const schoolId = req.session.user.school_id;
    const fileName = `bonuscards/${schoolId}_${Date.now()}_${req.file.originalname}`;

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
  const schoolId = req.session.user.school_id;

  await pool.query(
    `
    INSERT INTO bonuscards (name,xp,image_url,school_id)
    VALUES ($1,$2,$3,$4)
  `,
    [name, Number(xp), imageUrl || uploadedBonusImageUrl, schoolId]
  );

  uploadedBonusImageUrl = null;
  res.json({ success: true });
});

app.get("/api/bonus", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(
    "SELECT * FROM bonuscards WHERE school_id=$1 ORDER BY id DESC",
    [schoolId]
  );

  res.json(r.rows);
});

app.delete("/api/bonus/:id", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const bonusId = Number(req.params.id);

  try {
    const r = await pool.query(
      "SELECT image_url FROM bonuscards WHERE id=$1 AND school_id=$2",
      [bonusId, schoolId]
    );

    if (r.rows.length && r.rows[0].image_url) {
      const prefix = (process.env.R2_PUBLIC_URL || "") + "/";
      const key = r.rows[0].image_url.replace(prefix, "");

      try {
        await r2.send(
          new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: key
          })
        );
      } catch (err) {
        console.error("R2 delete error (bonus)", err);
      }
    }

    await pool.query(
      "DELETE FROM bonuscards WHERE id=$1 AND school_id=$2",
      [bonusId, schoolId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting bonuscard", err);
    res.status(500).json({
      success: false,
      message: "Fehler beim Löschen der Bonuskarte"
    });
  }
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

    const schoolId = req.session.user.school_id;
    const fileName = `characters/${schoolId}_${Date.now()}_${req.file.originalname}`;

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
  const schoolId = req.session.user.school_id;

  await pool.query(
    `
    INSERT INTO characters (name,image_url,school_id)
    VALUES ($1,$2,$3)
  `,
    [name, imageUrl || uploadedCharacterImageUrl, schoolId]
  );

  uploadedCharacterImageUrl = null;
  res.json({ success: true });
});

app.get("/api/character", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(
    "SELECT * FROM characters WHERE school_id=$1 ORDER BY id DESC",
    [schoolId]
  );

  res.json(r.rows);
});

app.delete("/api/character/:id", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const charId = Number(req.params.id);

  try {
    const r = await pool.query(
      "SELECT image_url FROM characters WHERE id=$1 AND school_id=$2",
      [charId, schoolId]
    );

    if (r.rows.length && r.rows[0].image_url) {
      const prefix = (process.env.R2_PUBLIC_URL || "") + "/";
      const key = r.rows[0].image_url.replace(prefix, "");

      try {
        await r2.send(
          new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: key
          })
        );
      } catch (err) {
        console.error("R2 delete error (character)", err);
      }
    }

    await pool.query(
      "UPDATE users SET character_id=NULL WHERE character_id=$1 AND school_id=$2",
      [charId, schoolId]
    );

    await pool.query(
      "DELETE FROM characters WHERE id=$1 AND school_id=$2",
      [charId, schoolId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting character", err);
    res.status(500).json({
      success: false,
      message: "Fehler beim Löschen des Charakters"
    });
  }
});
// -------------------------------------------------------
// ADMIN – Levelsystem
// -------------------------------------------------------
app.get("/api/levels", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;

  const r = await pool.query(
    "SELECT id,name,min_xp FROM levels WHERE school_id=$1 ORDER BY min_xp ASC",
    [schoolId]
  );

  res.json(r.rows);
});

app.post("/api/levels", isAdmin, async (req, res) => {
  let { name, minXp } = req.body;
  const schoolId = req.session.user.school_id;

  minXp = Number(minXp);

  const existing = await pool.query(
    "SELECT COUNT(*) FROM levels WHERE school_id=$1",
    [schoolId]
  );

  const count = Number(existing.rows[0].count);

  if (count === 0 && minXp !== 0) minXp = 0;

  await pool.query(
    "INSERT INTO levels (name,min_xp,school_id) VALUES ($1,$2,$3)",
    [name, minXp, schoolId]
  );

  await recalcAllStudentLevels();

  res.json({ success: true });
});

app.delete("/api/levels/:id", isAdmin, async (req, res) => {
  const schoolId = req.session.user.school_id;
  const levelId = Number(req.params.id);

  try {
    await pool.query(
      "UPDATE users SET level_id=NULL WHERE level_id=$1 AND school_id=$2",
      [levelId, schoolId]
    );

    await pool.query(
      "DELETE FROM levels WHERE id=$1 AND school_id=$2",
      [levelId, schoolId]
    );

    await recalcAllStudentLevels();

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting level", err);
    res.status(500).json({
      success: false,
      message: "Fehler beim Löschen des Levels"
    });
  }
});
// -------------------------------------------------------
// SUPERADMIN – Schulen & Admins
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

  await pool.query(
    `
    INSERT INTO schools (name,slug)
    VALUES ($1,$2)
    ON CONFLICT (slug) DO NOTHING
  `,
    [name, slug]
  );

  res.json({ success: true });
});

// Schule löschen
app.delete("/api/superadmin/schools/:id", isSuperadmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM schools WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting school", err);
    res.status(500).json({
      success: false,
      message: "Fehler beim Löschen der Schule"
    });
  }
});

// Admin-Liste (alle Admins aller Schulen)
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

// Admin anlegen
app.post("/api/superadmin/admins", isSuperadmin, async (req, res) => {
  const { name, slug } = req.body;
  if (!name || !slug) return res.json({ success: false });

  const s = await pool.query("SELECT id FROM schools WHERE slug=$1", [slug]);
  if (!s.rows.length) {
    return res.json({ success: false, message: "Schule nicht gefunden" });
  }

  const schoolId = s.rows[0].id;
  const tempPw = generateTempPassword();

  await pool.query(
    `
      INSERT INTO users (name,password,role,school_id,first_login)
      VALUES ($1,$2,'admin',$3,TRUE)
      ON CONFLICT (name,class_id) DO NOTHING
    `,
    [name, tempPw, schoolId]
  );

  res.json({ success: true });
});

// Admin Passwort reset
app.post("/api/superadmin/admins/reset/:id", isSuperadmin, async (req, res) => {
  const newPw = generateTempPassword();

  const r = await pool.query(
    `
      UPDATE users
      SET password=$1, first_login=TRUE
      WHERE id=$2 AND role='admin'
      RETURNING id
    `,
    [newPw, req.params.id]
  );

  if (!r.rows.length) {
    return res.json({ success: false, message: "Admin nicht gefunden" });
  }

  res.json({ success: true, password: newPw });
});

// Admin löschen
app.delete("/api/superadmin/admins/:id", isSuperadmin, async (req, res) => {
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
});
// -------------------------------------------------------
// STATIC FRONTEND ROUTES
// -------------------------------------------------------

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

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

// Charakterauswahl extra Seite
app.get("/character-select", isStudent, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "character-select.html"));
});
// -------------------------------------------------------
// START SERVER
// -------------------------------------------------------
app.listen(process.env.PORT || 8080, () => {
  console.log("🚀 Server läuft auf Port 8080 (MULTI-SCHOOL + SUPERADMIN)");
});

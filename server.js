// =======================================================
// Temple of Logic – SERVER.JS (FINAL, Variante A)
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

// Root = Login
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// -------------------------------------------------------
// DB + R2
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
// Helper – Spalten nur anlegen, wenn sie fehlen
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

// =======================================================
// LEVEL-FUNKTIONEN
// =======================================================

async function updateStudentLevel(studentId) {
  const r = await pool.query(
    "SELECT xp FROM users WHERE id=$1",
    [studentId]
  );
  if (!r.rows.length) return;

  const xp = r.rows[0].xp;

  const levels = await pool.query(
    "SELECT id,min_xp FROM levels ORDER BY min_xp ASC"
  );

  let levelId = null;
  for (const lvl of levels.rows) {
    if (xp >= lvl.min_xp) levelId = lvl.id;
  }

  await pool.query(
    "UPDATE users SET level_id=$1 WHERE id=$2",
    [levelId, studentId]
  );
}

async function recalcAllStudentLevels() {
  const levels = (await pool.query(
    "SELECT id,min_xp FROM levels ORDER BY min_xp ASC"
  )).rows;

  const users = (await pool.query(
    "SELECT id,xp FROM users WHERE role='student'"
  )).rows;

  for (const u of users) {
    let levelId = null;
    for (const l of levels) {
      if (u.xp >= l.min_xp) levelId = l.id;
    }
    await pool.query(
      "UPDATE users SET level_id=$1 WHERE id=$2",
      [levelId, u.id]
    );
  }
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
      class_id INTEGER,
      xp INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await ensureColumn("users", "character_id", "INTEGER");
  await ensureColumn("users", "level_id", "INTEGER");
  await ensureColumn("users", "traits", "JSONB");
  await ensureColumn("users", "items", "JSONB");

  // Unique (name,class_id)
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name='users'
          AND constraint_name='users_name_class_unique'
      ) THEN
        ALTER TABLE users ADD CONSTRAINT users_name_class_unique UNIQUE(name,class_id);
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

  // Uploads (mit mission_id)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_uploads (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mission_id INTEGER REFERENCES missions(id),
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

  // Charaktere
  await pool.query(`
    CREATE TABLE IF NOT EXISTS characters (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // XP-Transaktionen
  await pool.query(`
    CREATE TABLE IF NOT EXISTS xp_transactions (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      mission_id INTEGER REFERENCES missions(id),
      source TEXT,
      awarded_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Level
  await pool.query(`
    CREATE TABLE IF NOT EXISTS levels (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      min_xp INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Admin anlegen
  await pool.query(`
    INSERT INTO users (name,password,role)
    VALUES ('admin','bruhrain','admin')
    ON CONFLICT DO NOTHING;
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

  if (!r.rows.length) return res.json({ success: false });

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
  const r = await pool.query("SELECT id,name FROM classes ORDER BY name ASC");
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
  const classId = Number(req.params.id);
  if (!classId) return res.json({ success: false });

  await pool.query(
    "DELETE FROM users WHERE class_id=$1 AND role='student'",
    [classId]
  );
  await pool.query("DELETE FROM classes WHERE id=$1", [classId]);

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
      u.xp
    FROM users u
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
  if (!name || !password || !classId) return res.json({ success: false });

  await pool.query(
    `
    INSERT INTO users (name,password,role,class_id,xp)
    VALUES ($1,$2,'student',$3,0)
    ON CONFLICT (name,class_id) DO NOTHING
    `,
    [name, password, classId]
  );

  res.json({ success: true });
});

app.delete("/api/student/:id", isAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.json({ success: false });

  await pool.query("DELETE FROM users WHERE id=$1", [id]);
  res.json({ success: true });
});

// =======================================================
// XP-HISTORY HELPER
// =======================================================

async function logXP(studentId, amount, missionId, source, adminId) {
  await pool.query(
    `
    INSERT INTO xp_transactions (student_id,amount,mission_id,source,awarded_by)
    VALUES ($1,$2,$3,$4,$5)
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
  if (!studentId || isNaN(delta)) return res.json({ success: false });

  await pool.query("UPDATE users SET xp=xp+$1 WHERE id=$2", [
    delta,
    studentId,
  ]);

  await logXP(studentId, delta, null, "direct", req.session.user.id);
  await updateStudentLevel(studentId);

  res.json({ success: true });
});

app.post("/api/xpmission", isAdmin, async (req, res) => {
  const { studentId, missionId } = req.body;
  if (!studentId || !missionId) return res.json({ success: false });

  const r = await pool.query("SELECT xp FROM missions WHERE id=$1", [
    missionId,
  ]);
  if (!r.rows.length) return res.json({ success: false });

  const xp = r.rows[0].xp;

  await pool.query("UPDATE users SET xp=xp+$1 WHERE id=$2", [
    xp,
    studentId,
  ]);

  await logXP(studentId, xp, missionId, "mission", req.session.user.id);
  await updateStudentLevel(studentId);

  res.json({ success: true });
});

// =======================================================
// ADMIN: ALLE Uploads eines Schülers abrufen
// =======================================================

app.get("/api/uploads/:studentId", isAdmin, async (req, res) => {
  const studentId = Number(req.params.studentId);
  if (!studentId) return res.json([]);

  const uploads = await pool.query(
    `
    SELECT 
      su.id,
      su.image_url,
      su.mission_id,
      su.created_at,
      m.name AS mission_name
    FROM student_uploads su
    LEFT JOIN missions m ON m.id = su.mission_id
    WHERE su.student_id=$1
    ORDER BY su.created_at DESC
    `,
    [studentId]
  );

  res.json(uploads.rows);
});

// =======================================================
// ADMIN: Einzelnes Upload löschen
// =======================================================

app.delete("/api/upload/delete/:uploadId", isAdmin, async (req, res) => {
  const uploadId = Number(req.params.uploadId);
  if (!uploadId) return res.json({ success: false });

  const r = await pool.query(
    "SELECT image_url FROM student_uploads WHERE id=$1",
    [uploadId]
  );

  if (!r.rows.length) return res.json({ success: false });

  const img = r.rows[0].image_url;
  const prefix = process.env.R2_PUBLIC_URL + "/";
  const key = img.replace(prefix, "");

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

  await pool.query("DELETE FROM student_uploads WHERE id=$1", [uploadId]);

  res.json({ success: true });
});

// =======================================================
// MISSIONEN (Admin)
// =======================================================

let uploadedMissionImageUrl = null;

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
      uploadedMissionImageUrl = url;
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
    INSERT INTO missions (name,xp,image_url,require_upload)
    VALUES ($1,$2,$3,$4)
    `,
    [name, Number(xp), imageUrl || uploadedMissionImageUrl || null, !!requireUpload]
  );

  uploadedMissionImageUrl = null;
  res.json({ success: true });
});

app.get("/api/missions", isAdmin, async (_req, res) => {
  const r = await pool.query("SELECT * FROM missions ORDER BY id DESC");
  res.json(r.rows);
});

app.delete("/api/missions/:id", isAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.json({ success: false });

  const r = await pool.query("SELECT image_url FROM missions WHERE id=$1", [
    id,
  ]);

  if (r.rows.length && r.rows[0].image_url) {
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
      console.error("Mission Delete R2:", err);
    }
  }

  await pool.query("DELETE FROM missions WHERE id=$1", [id]);
  res.json({ success: true });
});

// =======================================================
// BONUSKARTEN (Admin)
// =======================================================

let uploadedBonusImageUrl = null;

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
      uploadedBonusImageUrl = url;
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
    INSERT INTO bonuscards (name,xp,image_url)
    VALUES ($1,$2,$3)
    `,
    [name, Number(xp), imageUrl || uploadedBonusImageUrl || null]
  );

  uploadedBonusImageUrl = null;
  res.json({ success: true });
});

app.get("/api/bonus", isAdmin, async (_req, res) => {
  const r = await pool.query("SELECT * FROM bonuscards ORDER BY id DESC");
  res.json(r.rows);
});

app.delete("/api/bonus/:id", isAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.json({ success: false });

  const r = await pool.query("SELECT image_url FROM bonuscards WHERE id=$1", [
    id,
  ]);

  if (r.rows.length && r.rows[0].image_url) {
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
      console.error("Bonus Delete R2:", err);
    }
  }

  await pool.query("DELETE FROM bonuscards WHERE id=$1", [id]);
  res.json({ success: true });
});

// =======================================================
// CHARACTERS (Admin)
// =======================================================

let uploadedCharacterImageUrl = null;

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
      uploadedCharacterImageUrl = url;
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
    INSERT INTO characters (name,image_url)
    VALUES ($1,$2)
    `,
    [name, imageUrl || uploadedCharacterImageUrl || null]
  );

  uploadedCharacterImageUrl = null;
  res.json({ success: true });
});

app.get("/api/character", isAdmin, async (_req, res) => {
  const r = await pool.query("SELECT * FROM characters ORDER BY id DESC");
  res.json(r.rows);
});

app.delete("/api/character/:id", isAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.json({ success: false });

  const r = await pool.query("SELECT image_url FROM characters WHERE id=$1", [
    id,
  ]);

  if (r.rows.length && r.rows[0].image_url) {
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
      console.error("Character Delete R2:", err);
    }
  }

  await pool.query("DELETE FROM characters WHERE id=$1", [id]);
  res.json({ success: true });
});

// =======================================================
// LEVEL-API (Admin)
// =======================================================

app.get("/api/levels", isAdmin, async (_req, res) => {
  const r = await pool.query(
    "SELECT id,name,min_xp FROM levels ORDER BY min_xp ASC"
  );
  res.json(r.rows);
});

app.post("/api/levels", isAdmin, async (req, res) => {
  let { name, minXp } = req.body;
  minXp = Number(minXp);

  if (!name || isNaN(minXp) || minXp < 0) {
    return res.json({ success: false });
  }

  const levelCount = await pool.query("SELECT COUNT(*) FROM levels");
  const count = Number(levelCount.rows[0].count);

  // erstes Level MUSS bei 0 starten
  if (count === 0 && minXp !== 0) minXp = 0;

  await pool.query(
    "INSERT INTO levels (name,min_xp) VALUES ($1,$2)",
    [name, minXp]
  );

  await recalcAllStudentLevels();
  res.json({ success: true });
});

app.delete("/api/levels/:id", isAdmin, async (req, res) => {
  await pool.query("DELETE FROM levels WHERE id=$1", [req.params.id]);
  await recalcAllStudentLevels();
  res.json({ success: true });
});
// =======================================================
// STUDENT: Dashboard – vollständige Daten
// =======================================================

app.get("/api/student/me", isStudent, async (req, res) => {
  const id = req.session.user.id;

  // USER BASISDATEN
  const user = await pool.query(
    `
    SELECT 
      u.id,
      u.name,
      u.xp,
      u.character_id,
      u.level_id,
      l.name AS level_name,
      l.min_xp AS level_min_xp
    FROM users u
    LEFT JOIN levels l ON l.id = u.level_id
    WHERE u.id=$1
    `,
    [id]
  );

  // CHARACTER
  const character = await pool.query(
    `
    SELECT c.id, c.name, c.image_url
    FROM users u
    LEFT JOIN characters c ON c.id = u.character_id
    WHERE u.id=$1
    `,
    [id]
  );

  // TRAITS / ITEMS – sicherstellen, dass Spalten existieren
  await ensureColumn("users", "traits", "JSONB");
  await ensureColumn("users", "items", "JSONB");

  const traitItem = await pool.query(
    "SELECT traits, items FROM users WHERE id=$1",
    [id]
  );

  let traits = traitItem.rows[0].traits;
  let items = traitItem.rows[0].items;

  // Listen für zufällige Auswahl
  const TRAITS = [
    "Neugierig – Stellt viele Fragen und bleibt dran",
    "Ausdauernd – Gibt nicht auf, bis die Lösung steht",
    "Kreativ – Findet ungewöhnliche Wege zum Ziel",
    "Hilfsbereit – Unterstützt andere aktiv",
    "Strukturiert – Plant Aufgaben klar durch",
    "Risikofreudig – Probiert neue Strategien aus",
    "Ruhig – Bleibt gelassen bei Fehlern",
    "Zielstrebig – Arbeitet konsequent",
    "Analytisch – Zerlegt Probleme in kleine Teile",
    "Teamorientiert – Kooperiert gerne",
    "Selbstkritisch – Reflektiert ehrlich",
    "Optimistisch – Sieht Chancen statt Probleme",
    "Aufmerksam – Erkennt wichtige Details",
    "Pragmatisch – Wählt funktionierende Wege",
    "Mutig – Stellt sich Herausforderungen",
    "Sorgfältig – Achtet auf Genauigkeit",
    "Logisch denkend – Schritt-für-Schritt",
    "Erfinderisch – Entwickelt neue Strategien",
    "Geduldig – Arbeitet ruhig und konzentriert",
    "Inspirierend – Motiviert durch Vorbild"
  ];

  const ITEMS = [
    "Zirkel der Präzision",
    "Rechenamulett",
    "Logikstein",
    "Notizrolle der Klarheit",
    "Schutzbrille der Konzentration",
    "Zauberstift des Beweises",
    "Kompass der Richtung",
    "Rucksack der Ideen",
    "Lineal des Gleichgewichts",
    "Lampe des Einfalls",
    "Formelbuch des Wissens",
    "Tasche der Zufälle",
    "Würfel der Wahrscheinlichkeit",
    "Chronometer der Geduld",
    "Mantel der Logik",
    "Rechenbrett des Ausgleichs",
    "Trank der Übersicht",
    "Kristall des Beweises",
    "Talisman der Motivation",
    "Zauberstab des Verständnisses"
  ];

  function pickThree(arr) {
    return [...arr].sort(() => Math.random() - 0.5).slice(0, 3);
  }

  // Zufällig vergeben falls noch leer
  if (!traits || traits.length === 0) {
    traits = pickThree(TRAITS);
    await pool.query("UPDATE users SET traits=$1 WHERE id=$2", [
      JSON.stringify(traits),
      id,
    ]);
  }

  if (!items || items.length === 0) {
    items = pickThree(ITEMS);
    await pool.query("UPDATE users SET items=$1 WHERE id=$2", [
      JSON.stringify(items),
      id,
    ]);
  }

  // XP HISTORY (inkl. Missionen)
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
    WHERE student_id=$1
    ORDER BY created_at DESC
    `,
    [id]
  );

  // STUDENT-UPLOADS (mission-bezogen)
  const uploads = await pool.query(
    `
    SELECT 
      su.id,
      su.image_url,
      su.mission_id,
      su.created_at,
      m.name AS mission_name
    FROM student_uploads su
    LEFT JOIN missions m ON su.mission_id = m.id
    WHERE su.student_id=$1
    ORDER BY su.created_at DESC
    `,
    [id]
  );

  res.json({
    user: user.rows[0],
    character: character.rows[0] || null,
    traits,
    items,
    xp_log: xpLog.rows,
    uploads: uploads.rows
  });
});

// =======================================================
// STUDENT: Charakter auswählen
// =======================================================

app.post("/api/student/selectCharacter", isStudent, async (req, res) => {
  const { characterId } = req.body;
  const id = req.session.user.id;

  if (!characterId) return res.json({ success: false });

  await pool.query(
    "UPDATE users SET character_id=$1 WHERE id=$2",
    [characterId, id]
  );

  res.json({ success: true });
});

// =======================================================
// STUDENT: Liste aller Missionen (für Karussell)
// =======================================================

app.get("/api/student/missions", isStudent, async (req, res) => {
  const r = await pool.query(`
    SELECT id,name,xp,image_url,require_upload
    FROM missions
    ORDER BY id DESC
  `);

  res.json(r.rows);
});

// =======================================================
// STUDENT: Upload für Mission
// =======================================================

app.post(
  "/api/student/uploadForMission",
  isStudent,
  upload.single("image"),
  async (req, res) => {
    try {
      const { missionId } = req.body;
      const studentId = req.session.user.id;

      if (!missionId || !req.file)
        return res.json({ success: false });

      const fileName =
        "uploads/" +
        studentId + "_" +
        missionId + "_" +
        Date.now() + "_" +
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
        INSERT INTO student_uploads (student_id,mission_id,image_url)
        VALUES ($1,$2,$3)
        `,
        [studentId, missionId, url]
      );

      res.json({ success: true, url });
    } catch (err) {
      console.error("Student Upload Fehler:", err);
      res.status(500).json({ success: false });
    }
  }
);

// =======================================================
// START
// =======================================================

app.listen(process.env.PORT || 8080, () => {
  console.log("🚀 Server läuft auf Port 8080 (FINAL – Full System aktiv)");
});

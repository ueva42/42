// =======================================================
// Temple of Logic – SERVER.JS (komplett + Level + Traits + Items)
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

// Root immer auf Login
app.get("/", (req, res) => {
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
// Helper
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
// LEVEL-Funktionen
// -------------------------------------------------------
async function updateStudentLevel(studentId) {
  const userRes = await pool.query("SELECT xp FROM users WHERE id=$1", [
    studentId,
  ]);
  if (!userRes.rows.length) return;
  const xp = userRes.rows[0].xp;

  const lvlRes = await pool.query(
    "SELECT id,min_xp FROM levels ORDER BY min_xp ASC"
  );

  let levelId = null;
  for (const lvl of lvlRes.rows) {
    if (xp >= lvl.min_xp) levelId = lvl.id;
  }

  await pool.query("UPDATE users SET level_id=$1 WHERE id=$2", [
    levelId,
    studentId,
  ]);
}

async function recalcAllStudentLevels() {
  const lvlRes = await pool.query(
    "SELECT id,min_xp FROM levels ORDER BY min_xp ASC"
  );
  const levels = lvlRes.rows;

  const users = await pool.query(
    "SELECT id,xp FROM users WHERE role='student'"
  );

  for (const u of users.rows) {
    let levelId = null;

    for (const l of levels) {
      if (u.xp >= l.min_xp) levelId = l.id;
    }

    await pool.query("UPDATE users SET level_id=$1 WHERE id=$2", [
      levelId,
      u.id,
    ]);
  }
}

// =======================================================
// MIGRATION
// =======================================================
async function migrate() {
  console.log("🔧 Migration startet...");

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
      class_id INTEGER,
      xp INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await ensureColumn("users", "role", "TEXT NOT NULL DEFAULT 'student'");
  await ensureColumn("users", "class_id", "INTEGER");
  await ensureColumn("users", "xp", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("users", "character_id", "INTEGER");
  await ensureColumn("users", "level_id", "INTEGER");
  await ensureColumn("users", "traits", "jsonb");
  await ensureColumn("users", "items", "jsonb");

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
      xp INTEGER NOT NULL DEFAULT 0,
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
    CREATE TABLE IF NOT EXISTS xp_transactions (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL DEFAULT 0,
      mission_id INTEGER,
      source TEXT,
      awarded_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS levels (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      min_xp INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    INSERT INTO users (name,password,role,class_id)
    VALUES ('admin','bruhrain','admin',NULL)
    ON CONFLICT (name,class_id) DO NOTHING;
  `);

  console.log("Migration OK.");
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
  const id = Number(req.params.id);

  await pool.query("DELETE FROM users WHERE class_id=$1 AND role='student'", [
    id,
  ]);
  await pool.query("DELETE FROM classes WHERE id=$1", [id]);

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
    SELECT u.id,u.name,u.password,u.xp,
      su.image_url AS upload_url
    FROM users u
    LEFT JOIN LATERAL (
      SELECT image_url
      FROM student_uploads
      WHERE student_id=u.id
      ORDER BY created_at DESC
      LIMIT 1
    ) su ON TRUE
    WHERE u.role='student' AND u.class_id=$1
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
  await pool.query("DELETE FROM users WHERE id=$1", [id]);
  res.json({ success: true });
});
// =======================================================
// XP-HISTORY (Helper)
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

  await pool.query(`UPDATE users SET xp=xp+$1 WHERE id=$2`, [
    delta,
    studentId,
  ]);

  await logXP(studentId, delta, null, "direct", req.session.user.id);
  await updateStudentLevel(studentId);

  res.json({ success: true });
});

app.post("/api/xpmission", isAdmin, async (req, res) => {
  const { studentId, missionId } = req.body;

  const r = await pool.query(`SELECT xp FROM missions WHERE id=$1`, [
    missionId,
  ]);
  if (!r.rows.length) return res.json({ success: false });

  const xp = r.rows[0].xp;

  await pool.query(`UPDATE users SET xp=xp+$1 WHERE id=$2`, [
    xp,
    studentId,
  ]);

  await logXP(studentId, xp, missionId, "mission", req.session.user.id);
  await updateStudentLevel(studentId);

  res.json({ success: true });
});

// =======================================================
// STUDENT UPLOADS
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
        `INSERT INTO student_uploads (student_id,image_url) VALUES ($1,$2)`,
        [studentId, url]
      );

      res.json({ success: true, url });
    } catch (err) {
      console.error("Upload Fehler:", err);
      res.json({ success: false });
    }
  }
);

app.delete("/api/upload/:studentId", isAdmin, async (req, res) => {
  const id = Number(req.params.studentId);

  const r = await pool.query(
    `
      SELECT id,image_url 
      FROM student_uploads 
      WHERE student_id=$1
      ORDER BY created_at DESC 
      LIMIT 1
    `,
    [id]
  );

  if (!r.rows.length) return res.json({ success: false });

  const entry = r.rows[0];
  const key = entry.image_url.replace(process.env.R2_PUBLIC_URL + "/", "");

  try {
    await r2.send(
      new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
      })
    );
  } catch (e) {
    console.error("R2 delete error", e);
  }

  await pool.query(`DELETE FROM student_uploads WHERE id=$1`, [entry.id]);
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

      res.json({
        success: true,
        url: `${process.env.R2_PUBLIC_URL}/${fileName}`,
      });
    } catch (err) {
      console.error("Mission Upload Fehler:", err);
      res.json({ success: false });
    }
  }
);

app.post("/api/missions", isAdmin, async (req, res) => {
  const { name, xp, imageUrl, requireUpload } = req.body;

  await pool.query(
    `
      INSERT INTO missions (name,xp,image_url,require_upload)
      VALUES ($1,$2,$3,$4)
    `,
    [name, xp, imageUrl || null, requireUpload]
  );

  res.json({ success: true });
});

app.get("/api/missions", isAdmin, async (_req, res) => {
  const r = await pool.query(`SELECT * FROM missions ORDER BY id DESC`);
  res.json(r.rows);
});

app.delete("/api/missions/:id", isAdmin, async (req, res) => {
  const id = Number(req.params.id);

  const r = await pool.query(`SELECT image_url FROM missions WHERE id=$1`, [
    id,
  ]);

  if (r.rows.length && r.rows[0].image_url) {
    const key = r.rows[0].image_url.replace(process.env.R2_PUBLIC_URL + "/", "");
    try {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
        })
      );
    } catch (err) {
      console.error("Mission delete R2:", err);
    }
  }

  await pool.query(`DELETE FROM missions WHERE id=$1`, [id]);
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

      res.json({
        success: true,
        url: `${process.env.R2_PUBLIC_URL}/${fileName}`,
      });
    } catch (err) {
      console.error("Bonus Upload Fehler:", err);
      res.json({ success: false });
    }
  }
);

app.post("/api/bonus", isAdmin, async (req, res) => {
  const { name, xp, imageUrl } = req.body;

  await pool.query(
    `
      INSERT INTO bonuscards (name,xp,image_url)
      VALUES ($1,$2,$3)
    `,
    [name, xp, imageUrl || null]
  );

  res.json({ success: true });
});

app.get("/api/bonus", isAdmin, async (_req, res) => {
  const r = await pool.query(`SELECT * FROM bonuscards ORDER BY id DESC`);
  res.json(r.rows);
});

app.delete("/api/bonus/:id", isAdmin, async (req, res) => {
  const id = Number(req.params.id);

  const r = await pool.query(`SELECT image_url FROM bonuscards WHERE id=$1`, [
    id,
  ]);

  if (r.rows.length && r.rows[0].image_url) {
    const key = r.rows[0].image_url.replace(process.env.R2_PUBLIC_URL + "/", "");

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

  await pool.query(`DELETE FROM bonuscards WHERE id=$1`, [id]);
  res.json({ success: true });
});

// =======================================================
// CHARACTER
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

      res.json({
        success: true,
        url: `${process.env.R2_PUBLIC_URL}/${fileName}`,
      });
    } catch (err) {
      console.error("Character Upload Fehler:", err);
      res.json({ success: false });
    }
  }
);

app.post("/api/character", isAdmin, async (req, res) => {
  const { name, imageUrl } = req.body;

  await pool.query(
    `
      INSERT INTO characters (name,image_url)
      VALUES ($1,$2)
    `,
    [name, imageUrl || null]
  );

  res.json({ success: true });
});

app.get("/api/character", isAdmin, async (_req, res) => {
  const r = await pool.query(`SELECT * FROM characters ORDER BY id DESC`);
  res.json(r.rows);
});

app.delete("/api/character/:id", isAdmin, async (req, res) => {
  const id = Number(req.params.id);

  const r = await pool.query(`SELECT image_url FROM characters WHERE id=$1`, [
    id,
  ]);

  if (r.rows.length && r.rows[0].image_url) {
    const key = r.rows[0].image_url.replace(process.env.R2_PUBLIC_URL + "/", "");

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

  await pool.query(`DELETE FROM characters WHERE id=$1`, [id]);
  res.json({ success: true });
});

// =======================================================
// LEVEL-API
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

  const count = Number(
    (await pool.query("SELECT COUNT(*) FROM levels")).rows[0].count
  );

  if (count === 0 && minXp !== 0) minXp = 0;

  await pool.query(
    `INSERT INTO levels (name,min_xp) VALUES ($1,$2)`,
    [name, minXp]
  );

  await recalcAllStudentLevels();
  res.json({ success: true });
});

app.delete("/api/levels/:id", isAdmin, async (req, res) => {
  const id = Number(req.params.id);

  await pool.query(`DELETE FROM levels WHERE id=$1`, [id]);

  await recalcAllStudentLevels();
  res.json({ success: true });
});

// =======================================================
// FIRST LOGIN – Character + Traits + Items
// =======================================================
app.post("/api/student/firstLogin", isStudent, async (req, res) => {
  const id = req.session.user.id;

  const userRes = await pool.query(
    `
      SELECT id,xp,character_id,traits,items,level_id
      FROM users
      WHERE id=$1
    `,
    [id]
  );
  const user = userRes.rows[0];

  // Charakter-Pool
  const charRes = await pool.query(`
    SELECT id,name,image_url FROM characters
    ORDER BY RANDOM()
    LIMIT 1
  `);
  const randomCharacter = charRes.rows[0];

  // Trait-Pool
  const TRAITS = [
    "Neugierig – stellt viele Fragen",
    "Ausdauernd – gibt nicht auf",
    "Kreativ – findet ungewöhnliche Wege",
    "Hilfsbereit – unterstützt andere",
    "Strukturiert – plant klar",
    "Risikofreudig – probiert Neues",
    "Ruhig – bleibt gelassen",
    "Zielstrebig – arbeitet konsequent",
    "Analytisch – zerlegt Probleme",
    "Teamorientiert – kooperiert gerne",
    "Selbstkritisch – reflektiert ehrlich",
    "Optimistisch – sieht Chancen",
    "Aufmerksam – erkennt Details",
    "Pragmatisch – wählt einfachen Weg",
    "Mutig – stellt sich Herausforderungen",
    "Sorgfältig – achtet auf Genauigkeit",
    "Logisch denkend – Schritt für Schritt",
    "Erfinderisch – entwickelt Lösungen",
    "Geduldig – bleibt konzentriert",
    "Inspirierend – motiviert andere"
  ];

  // Item-Pool
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

  let traits = user.traits;
  let items = user.items;
  let character_id = user.character_id;

  // Erstlogin → generieren
  if (!traits || !items || !character_id) {
    traits = pickThree(TRAITS);
    items = pickThree(ITEMS);
    character_id = randomCharacter.id;

    await pool.query(
      `
        UPDATE users
        SET traits=$1, items=$2, character_id=$3
        WHERE id=$4
      `,
      [traits, items, character_id, id]
    );
  }

  // Level laden
  const lvl = await pool.query(
    `
      SELECT 
        id,name,min_xp,
        LEAD(min_xp) OVER (ORDER BY min_xp ASC) AS next_min_xp
      FROM levels
      WHERE id=$1
    `,
    [user.level_id]
  );

  // Charakter final laden (falls nicht random)
  const charFinal = (
    await pool.query(`SELECT * FROM characters WHERE id=$1`, [character_id])
  ).rows[0];

  res.json({
    xp: user.xp,
    traits,
    items,
    character: charFinal,
    level: lvl.rows[0] || { name: "Kein Level", min_xp: 0, next_min_xp: 999999 },
  });
});
// =======================================================
// STUDENT DASHBOARD (allgemeine Infos)
// =======================================================
app.get("/api/student/me", isStudent, async (req, res) => {
  const id = req.session.user.id;

  const userRes = await pool.query(
    `
      SELECT 
        u.id,
        u.name,
        u.xp,
        u.character_id,
        u.level_id,
        u.traits,
        u.items,
        l.name    AS level_name,
        l.min_xp  AS level_min_xp
      FROM users u
      LEFT JOIN levels l ON u.level_id = l.id
      WHERE u.id=$1
    `,
    [id]
  );

  const uploadsRes = await pool.query(
    `
      SELECT id,image_url,created_at
      FROM student_uploads
      WHERE student_id=$1
      ORDER BY created_at DESC
    `,
    [id]
  );

  const xpLogRes = await pool.query(
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

  const charRes = await pool.query(
    `
      SELECT c.id,c.name,c.image_url
      FROM users u
      LEFT JOIN characters c ON u.character_id = c.id
      WHERE u.id=$1
    `,
    [id]
  );

  res.json({
    user: userRes.rows[0],
    uploads: uploadsRes.rows,
    xp_log: xpLogRes.rows,
    character: charRes.rows[0] || null,
  });
});

// =======================================================
// STUDENT: Charakter manuell setzen (optional nutzbar)
// =======================================================
app.post("/api/student/selectCharacter", isStudent, async (req, res) => {
  const { characterId } = req.body;
  const id = req.session.user.id;

  if (!characterId) return res.json({ success: false });

  await pool.query(
    `
      UPDATE users
      SET character_id=$1
      WHERE id=$2
    `,
    [characterId, id]
  );

  res.json({ success: true });
});

// =======================================================
// START
// =======================================================
app.listen(process.env.PORT || 8080, () => {
  console.log("🚀 Server läuft auf Port 8080 (mit Levelsystem + Traits + Items)");
});

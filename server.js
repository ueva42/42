import express from "express";
import session from "express-session";
import pg from "pg";
import multer from "multer";
import AWS from "aws-sdk";

const app = express();

// --------------------------------------------------
// TRUST PROXY (Railway)
// --------------------------------------------------
app.set("trust proxy", 1);

// --------------------------------------------------
// BODY PARSER & STATIC FILES
// --------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// --------------------------------------------------
// POSTGRES CONNECTION
// --------------------------------------------------
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// --------------------------------------------------
// SESSION — RAILWAY READY
// --------------------------------------------------
app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret123",
    proxy: true,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      httpOnly: true,
      sameSite: "none",
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

// --------------------------------------------------
// R2 UPLOAD CONFIG
// --------------------------------------------------
const upload = multer({ storage: multer.memoryStorage() });

const s3 = new AWS.S3({
  endpoint: process.env.R2_ENDPOINT,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  region: "auto",
  signatureVersion: "v4",
});

// --------------------------------------------------
// MIGRATION
// --------------------------------------------------
async function migrate() {
  console.log("Starte automatische Datenbank-Reparatur…");

  // USERS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      xp INTEGER DEFAULT 0,
      class_id INTEGER
    );
  `);

  // Remove UNIQUE from name
  await pool.query(`
    DO $$
    DECLARE
      c TEXT;
    BEGIN
      SELECT constraint_name INTO c
      FROM information_schema.constraint_column_usage
      WHERE table_name='users' AND column_name='name';

      IF c IS NOT NULL THEN
        EXECUTE 'ALTER TABLE users DROP CONSTRAINT ' || c;
      END IF;

    END $$;
  `);

  // CLASSES
  await pool.query(`
    CREATE TABLE IF NOT EXISTS classes (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    );
  `);

  // MISSIONS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS missions (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      xp INTEGER NOT NULL,
      image_url TEXT,
      require_upload BOOLEAN DEFAULT false
    );
  `);

  // DEFAULT ADMIN
  const adminCheck = await pool.query(
    "SELECT id FROM users WHERE name='admin' LIMIT 1"
  );

  if (adminCheck.rows.length === 0) {
    await pool.query(
      "INSERT INTO users (name, password, role) VALUES ('admin','bruhrain','admin')"
    );
    console.log("Default Admin erstellt");
  }

  console.log("Migration abgeschlossen.");
}

// --------------------------------------------------
// LOGIN
// --------------------------------------------------
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  const r = await pool.query(
    "SELECT * FROM users WHERE name=$1 AND password=$2",
    [username, password]
  );

  if (r.rows.length === 0)
    return res.status(400).json({ error: "Login fehlgeschlagen" });

  req.session.user = {
    id: r.rows[0].id,
    name: r.rows[0].name,
    role: r.rows[0].role,
  };

  res.json({ success: true, role: r.rows[0].role });
});

// --------------------------------------------------
// LOGOUT
// --------------------------------------------------
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// --------------------------------------------------
// ADMIN CHECK MIDDLEWARE
// --------------------------------------------------
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({ error: "Nicht erlaubt" });
  }
  next();
}

// --------------------------------------------------
// KLASSEN
// --------------------------------------------------
app.post("/api/class", requireAdmin, async (req, res) => {
  const { name } = req.body;

  const r = await pool.query(
    "INSERT INTO classes (name) VALUES ($1) RETURNING *",
    [name]
  );

  res.json(r.rows[0]);
});

app.get("/api/class", requireAdmin, async (req, res) => {
  const r = await pool.query("SELECT * FROM classes ORDER BY id");
  res.json(r.rows);
});

app.delete("/api/class/:id", requireAdmin, async (req, res) => {
  const id = req.params.id;

  // Schüler dieser Klasse löschen
  await pool.query("DELETE FROM users WHERE class_id=$1 AND role='student'", [
    id,
  ]);

  await pool.query("DELETE FROM classes WHERE id=$1", [id]);

  res.json({ success: true });
});

// --------------------------------------------------
// SCHÜLER
// --------------------------------------------------
app.post("/api/student", requireAdmin, async (req, res) => {
  const { name, password, classId } = req.body;

  if (!name || !password || !classId) {
    return res.status(400).json({ error: "Name, Passwort, Klasse nötig" });
  }

  const r = await pool.query(
    "INSERT INTO users (name, password, role, class_id, xp) VALUES ($1,$2,'student',$3,0) RETURNING *",
    [name, password, classId]
  );

  res.json(r.rows[0]);
});

app.get("/api/student", requireAdmin, async (req, res) => {
  const { classId } = req.query;

  if (!classId) return res.json([]);

  const r = await pool.query(
    "SELECT id, name, xp FROM users WHERE role='student' AND class_id=$1 ORDER BY name",
    [classId]
  );

  res.json(r.rows);
});

app.delete("/api/student/:id", requireAdmin, async (req, res) => {
  await pool.query("DELETE FROM users WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// --------------------------------------------------
// MISSIONEN
// --------------------------------------------------
app.post("/api/missions", requireAdmin, async (req, res) => {
  const { name, xp, imageUrl, requireUpload } = req.body;

  const r = await pool.query(
    "INSERT INTO missions (name, xp, image_url, require_upload) VALUES ($1,$2,$3,$4) RETURNING *",
    [name, xp, imageUrl || null, requireUpload === "true"]
  );

  res.json(r.rows[0]);
});

app.get("/api/missions", requireAdmin, async (req, res) => {
  const r = await pool.query("SELECT * FROM missions ORDER BY id");
  res.json(r.rows);
});

app.delete("/api/missions/:id", requireAdmin, async (req, res) => {
  await pool.query("DELETE FROM missions WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// --------------------------------------------------
// MISSION IMAGE UPLOAD
// --------------------------------------------------
app.post("/api/missions/upload", requireAdmin, upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Kein Bild erhalten" });

  const fileName = `missions/${Date.now()}-${req.file.originalname}`;

  const params = {
    Bucket: process.env.R2_BUCKET,
    Key: fileName,
    Body: req.file.buffer,
    ContentType: req.file.mimetype,
    ACL: "public-read",
  };

  try {
    await s3.putObject(params).promise();

    const fileUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;

    res.json({ success: true, url: fileUrl });
  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ error: "Bild konnte nicht gespeichert werden." });
  }
});

// --------------------------------------------------
// ROOT → LOGIN
// --------------------------------------------------
app.get("/", (req, res) => res.redirect("/login.html"));

// --------------------------------------------------
// START SERVER
// --------------------------------------------------
const PORT = process.env.PORT || 8080;

app.listen(PORT, async () => {
  await migrate();
  console.log("Server läuft auf Port " + PORT);
});

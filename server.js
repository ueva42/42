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
  const { classId } = req.query;
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
      ORDER BY name ASC
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
// XP VERGABE + LOGGING
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
  let studentId = req.body.studentId;
  const xp = Number(req.body.xp);

  if (!req.session.user) return res.status(403).json({ error: "Not logged in" });

  // Wenn Schüler XP verliert (Bonuskarte)
  if (req.session.user.role === "student") {
    studentId = req.session.user.id;
  }

  // XP updaten
  await pool.query(`UPDATE users SET xp = xp + $1 WHERE id=$2`, [xp, studentId]);

  // Logging
  await logXP(studentId, xp, "direct", null, req.session.user.id);

  res.json({ success: true });
});

app.post("/api/xpmission", isAdmin, async (req, res) => {
  const { studentId, missionId } = req.body;

  const r = await pool.query("SELECT xp FROM missions WHERE id=$1", [missionId]);
  if (r.rows.length === 0) return res.json({ success: false });

  const xp = r.rows[0].xp;

  await pool.query("UPDATE users SET xp = xp + $1 WHERE id=$2", [xp, studentId]);

  await logXP(studentId, xp, "mission", missionId, req.session.user.id);

  res.json({ success: true });
});

// XP SUMMARY
app.get("/api/xp/mission-summary", isAdmin, async (_, res) => {
  const r = await pool.query(`
    SELECT m.id, m.name,
    COALESCE(SUM(t.amount),0) AS total_xp,
    COUNT(t.id) AS grants
    FROM missions m
    LEFT JOIN xp_transactions t ON t.mission_id = m.id
    GROUP BY m.id
    ORDER BY m.name ASC
  `);
  res.json(r.rows);
});

// =======================================================
// SCHÜLER UPLOAD
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

app.delete("/api/upload/:id", isAdmin, async (req, res) => {
  const id = req.params.id;

  const r = await pool.query(
    `
      SELECT id, image_url FROM student_uploads
      WHERE student_id=$1
      ORDER BY created_at DESC LIMIT 1
    `,
    [id]
  );

  if (r.rows.length === 0) return res.json({ success: false });

  const entry = r.rows[0];
  const key = entry.image_url.replace(process.env.R2_PUBLIC_URL + "/", "");

  try {
    await r2.send(
      new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
      })
    );
  } catch {}

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
  }
);

app.post("/api/missions", isAdmin, async (req, res) => {
  const { name, xp, imageUrl, requireUpload } = req.body;

  await pool.query(
    `
      INSERT INTO missions (name, xp, image_url, require_upload)
      VALUES ($1, $2, $3, $4)
    `,
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
  const id = req.params.id;

  const r = await pool.query(
    "SELECT image_url FROM missions WHERE id=$1",
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
    if (!req.file) return res.json({ success: false });

    const fileName = "bonuscards/" + Date.now() + "_" + req.file.originalname;

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

  const r = await pool.query("SELECT image_url FROM bonuscards WHERE id=$1", [
    id,
  ]);

  if (r.rows.length > 0 && r.rows[0].image_url) {
    const key = r.rows[0].image_url.replace(process.env.R2_PUBLIC_URL + "/", "");

    try {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
        })
      );
    } catch {}
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

    const fileName = "characters/" + Date.now() + "_" + req.file.originalname;

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
  await pool.query(
    "INSERT INTO characters (name, image_url) VALUES ($1,$2)",
    [req.body.name, req.body.imageUrl]
  );
  res.json({ success: true });
});

app.get("/api/character", isAdmin, async (_, res) => {
  const r = await pool.query("SELECT * FROM characters ORDER BY id DESC");
  res.json(r.rows);
});

app.delete("/api/character/:id", isAdmin, async (req, res) => {
  const id = req.params.id;

  const r = await pool.query("SELECT image_url FROM characters WHERE id=$1", [
    id,
  ]);

  if (r.rows.length > 0 && r.rows[0].image_url) {
    const key = r.rows[0].image_url.replace(process.env.R2_PUBLIC_URL + "/", "");

    try {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
        })
      );
    } catch {}
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
  await pool.query(
    "INSERT INTO levels (name, required_xp) VALUES ($1,$2)",
    [req.body.name, req.body.required_xp]
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
// STUDENT STATE
// =======================================================

app.get("/api/student/state", isStudent, async (req, res) => {
  const userId = req.session.user.id;

  const r = await pool.query(
    `
      SELECT u.id AS user_id, u.name, u.xp,
      ss.character_id, ss.traits, ss.items,
      c.name AS character_name, c.image_url AS character_image_url
      FROM users u
      LEFT JOIN student_state ss ON ss.user_id=u.id
      LEFT JOIN characters c ON c.id = ss.character_id
      WHERE u.id=$1
    `,
    [userId]
  );

  const row = r.rows[0];

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
          traits: row.traits,
          items: row.items,
          character_name: row.character_name,
          character_image_url: row.character_image_url,
        }
      : null,
  });
});

app.post("/api/student/state/init", isStudent, async (req, res) => {
  const userId = req.session.user.id;

  const r = await pool.query("SELECT id FROM student_state WHERE user_id=$1", [
    userId,
  ]);
  if (r.rows.length > 0)
    return res.json({ success: false, alreadyInitialized: true });

  await pool.query(
    `
      INSERT INTO student_state (user_id, character_id, traits, items)
      VALUES ($1, $2, $3::jsonb, $4::jsonb)
    `,
    [
      userId,
      req.body.characterId,
      JSON.stringify(req.body.traits),
      JSON.stringify(req.body.items),
    ]
  );

  res.json({ success: true });
});

// =======================================================
// START SERVER
// =======================================================

app.listen(process.env.PORT || 8080, () => {
  console.log("🚀 Server läuft auf Port " + (process.env.PORT || 8080));
});

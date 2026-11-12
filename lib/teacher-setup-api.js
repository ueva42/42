/**
 * Geführte Lehrer-Ersteinrichtung: Status, Abschluss, erste Klasse anlegen.
 */
import {
  listAccessibleClasses,
  teacherCanAccessClass,
  userCanAccessTeacherArea
} from "./teacher-auth.js";

export async function migrateTeacherSetupColumns(pool) {
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'teacher_setup_done'
      ) THEN
        ALTER TABLE users ADD COLUMN teacher_setup_done BOOLEAN NOT NULL DEFAULT FALSE;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'teacher_setup_dismissed_at'
      ) THEN
        ALTER TABLE users ADD COLUMN teacher_setup_dismissed_at TIMESTAMP;
      END IF;
    END$$;
  `);
}

async function countTimetableSlots(pool, classId) {
  const r = await pool.query(
    `
    SELECT COUNT(*)::int AS n
    FROM timetables
    WHERE class_id = $1
      AND subject IS NOT NULL
      AND TRIM(subject) <> ''
      AND LOWER(TRIM(subject)) NOT IN ('frei', '-', '— nicht genutzt —')
  `,
    [classId]
  );
  return Number(r.rows[0]?.n || 0);
}

async function countLevelGoals(pool, classId, schoolId) {
  const r = await pool.query(
    `
    SELECT COUNT(g.id)::int AS n
    FROM level_check_goals g
    JOIN level_checks lc ON lc.id = g.level_check_id
    WHERE lc.class_id = $1
      AND (lc.school_id IS NULL OR lc.school_id = $2)
  `,
    [classId, schoolId]
  );
  return Number(r.rows[0]?.n || 0);
}

async function countLevelChecks(pool, classId, schoolId) {
  const r = await pool.query(
    `
    SELECT COUNT(*)::int AS n
    FROM level_checks
    WHERE class_id = $1
      AND (school_id IS NULL OR school_id = $2)
  `,
    [classId, schoolId]
  );
  return Number(r.rows[0]?.n || 0);
}

async function countWieGoals(pool, schoolId) {
  const r = await pool.query(
    `
    SELECT COUNT(*)::int AS n
    FROM subject_lesson_goals
    WHERE school_id = $1
  `,
    [schoolId]
  );
  return Number(r.rows[0]?.n || 0);
}

async function countMaterial(pool, classId, schoolId) {
  const r = await pool.query(
    `
    SELECT COUNT(*)::int AS n
    FROM school_material_tiles
    WHERE school_id = $1
      AND class_id = $2
  `,
    [schoolId, classId]
  );
  return Number(r.rows[0]?.n || 0);
}

async function countTermine(pool, classId, schoolId) {
  const r = await pool.query(
    `
    SELECT COUNT(cp.id)::int AS n
    FROM level_check_checkpoints cp
    JOIN level_checks lc ON lc.id = cp.level_check_id
    WHERE lc.class_id = $1
      AND (lc.school_id IS NULL OR lc.school_id = $2)
  `,
    [classId, schoolId]
  );
  return Number(r.rows[0]?.n || 0);
}

async function countStudents(pool, classId, schoolId) {
  const r = await pool.query(
    `
    SELECT COUNT(*)::int AS n
    FROM users
    WHERE role = 'student'
      AND class_id = $1
      AND school_id = $2
  `,
    [classId, schoolId]
  );
  return Number(r.rows[0]?.n || 0);
}

export async function buildTeacherSetupStatus(pool, user, classIdHint) {
  const classes = await listAccessibleClasses(pool, user);
  const schoolId = user.school_id;
  let classId = classIdHint != null && classIdHint !== "" ? Number(classIdHint) : null;
  if (!Number.isFinite(classId) || classId <= 0) {
    classId = classes[0]?.id || null;
  } else if (!(await teacherCanAccessClass(pool, user, classId))) {
    classId = classes[0]?.id || null;
  }

  const hasClass = classes.length > 0;
  let hasStudents = false;
  let hasTimetable = false;
  let hasLevelplan = false;
  let hasWasGoals = false;
  let hasWieGoals = false;
  let hasMaterial = false;
  let hasTermin = false;

  if (classId) {
    const [students, slots, checks, goals, wie, mat, termine] = await Promise.all([
      countStudents(pool, classId, schoolId),
      countTimetableSlots(pool, classId),
      countLevelChecks(pool, classId, schoolId),
      countLevelGoals(pool, classId, schoolId),
      countWieGoals(pool, schoolId),
      countMaterial(pool, classId, schoolId),
      countTermine(pool, classId, schoolId)
    ]);
    hasStudents = students > 0;
    hasTimetable = slots > 0;
    hasLevelplan = checks > 0;
    hasWasGoals = goals > 0;
    hasWieGoals = wie > 0;
    hasMaterial = mat > 0;
    hasTermin = termine > 0;
  }

  const flags = {
    hasClass,
    hasStudents,
    hasTimetable,
    hasLevelplan,
    hasWasGoals,
    hasWieGoals,
    hasMaterial,
    hasTermin
  };
  const incomplete = !Object.values(flags).every(Boolean);

  return {
    classId,
    classes: classes.map((c) => ({ id: c.id, name: c.name })),
    ...flags,
    incomplete,
    allDone: !incomplete
  };
}

export function registerTeacherSetupRoutes(app, deps) {
  const { pool, isTeacher } = deps;

  app.get("/api/teacher/setup-status", isTeacher, async (req, res) => {
    try {
      const user = req.session.user;
      if (!userCanAccessTeacherArea(user)) {
        return res.status(403).json({ success: false, message: "Keine Berechtigung." });
      }
      const status = await buildTeacherSetupStatus(pool, user, req.query.classId);
      const me = await pool.query(
        `
        SELECT COALESCE(teacher_setup_done, FALSE) AS teacher_setup_done,
               teacher_setup_dismissed_at
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
        [user.id]
      );
      const row = me.rows[0] || {};
      res.json({
        success: true,
        setupDone: row.teacher_setup_done === true,
        setupDismissedAt: row.teacher_setup_dismissed_at || null,
        ...status
      });
    } catch (err) {
      console.error("❌ GET /api/teacher/setup-status:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  app.post("/api/teacher/setup/complete", isTeacher, async (req, res) => {
    try {
      const user = req.session.user;
      await pool.query(
        `
        UPDATE users
        SET teacher_setup_done = TRUE,
            teacher_setup_dismissed_at = NULL
        WHERE id = $1 AND role IN ('teacher', 'admin')
      `,
        [user.id]
      );
      res.json({ success: true, setupDone: true, message: "Einrichtung abgeschlossen." });
    } catch (err) {
      console.error("❌ POST /api/teacher/setup/complete:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  app.post("/api/teacher/setup/dismiss", isTeacher, async (req, res) => {
    try {
      const user = req.session.user;
      await pool.query(
        `
        UPDATE users
        SET teacher_setup_dismissed_at = NOW()
        WHERE id = $1 AND role IN ('teacher', 'admin')
      `,
        [user.id]
      );
      res.json({ success: true, message: "Einrichtung später fortsetzen." });
    } catch (err) {
      console.error("❌ POST /api/teacher/setup/dismiss:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  app.post("/api/teacher/setup/resume", isTeacher, async (req, res) => {
    try {
      const user = req.session.user;
      await pool.query(
        `
        UPDATE users
        SET teacher_setup_dismissed_at = NULL
        WHERE id = $1 AND role IN ('teacher', 'admin')
      `,
        [user.id]
      );
      res.json({ success: true });
    } catch (err) {
      console.error("❌ POST /api/teacher/setup/resume:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });

  /** Erste Klasse anlegen und der Lehrkraft zuweisen. */
  app.post("/api/teacher/setup/class", isTeacher, async (req, res) => {
    try {
      const user = req.session.user;
      if (user.role !== "teacher" && user.role !== "admin") {
        return res.status(403).json({ success: false, message: "Keine Berechtigung." });
      }
      const schoolId = user.school_id;
      const name = String(req.body?.name || "").trim();
      if (!name) {
        return res.json({ success: false, message: "Bitte einen Klassennamen eingeben." });
      }
      if (name.length > 80) {
        return res.json({ success: false, message: "Klassenname ist zu lang." });
      }

      const existing = await listAccessibleClasses(pool, user);
      // Lehrkräfte: nur die erste eigene Klasse über Setup; Admin darf immer.
      if (user.role === "teacher" && existing.length > 0) {
        return res.json({
          success: false,
          message: "Du hast schon eine Klasse. Weitere Klassen legt die Verwaltung an.",
          classId: existing[0].id
        });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const ins = await client.query(
          `
          INSERT INTO classes (name, school_id)
          VALUES ($1, $2)
          RETURNING id, name
        `,
          [name, schoolId]
        );
        const cls = ins.rows[0];
        if (user.role === "teacher") {
          await client.query(
            `
            INSERT INTO teacher_class_assignments (teacher_id, class_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
          `,
            [user.id, cls.id]
          );
        }
        await client.query("COMMIT");
        res.json({
          success: true,
          class: { id: cls.id, name: cls.name },
          message: `Klasse „${cls.name}“ angelegt.`
        });
      } catch (err) {
        await client.query("ROLLBACK");
        if (err.code === "23505") {
          return res.json({
            success: false,
            message: "Eine Klasse mit diesem Namen existiert bereits."
          });
        }
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("❌ POST /api/teacher/setup/class:", err);
      res.status(500).json({ success: false, message: "Serverfehler" });
    }
  });
}

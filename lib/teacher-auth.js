/**
 * Lehrer-Bereich: Rollen- und Klassenzugriffs-Helfer (server-side).
 *
 * Modell:
 * - role: student | teacher | admin | superadmin
 * - Admin darf Lehrerbereich; Teacher ohne Admin nicht Adminbereich
 * - Teacher sieht nur zugewiesene Klassen; Admin alle Klassen der Schule
 */

export function isActiveStaff(userRow = {}) {
  if (!userRow || userRow.is_active === false) return false;
  return true;
}

export function userCanAccessTeacherArea(user) {
  if (!user?.id) return false;
  if (user.is_active === false) return false;
  return user.role === "teacher" || user.role === "admin";
}

export function userCanAccessAdminArea(user) {
  if (!user?.id) return false;
  if (user.is_active === false) return false;
  return user.role === "admin";
}

export function userIsPureTeacher(user) {
  return user?.role === "teacher";
}

export function defaultPostLoginPath(user) {
  if (!user?.role) return "/login";
  if (user.role === "superadmin") return "/superadmin";
  if (user.role === "student") return "/student/hub";
  if (user.role === "teacher") return "/teacher";
  if (user.role === "admin") return "/teacher";
  return "/login";
}

/**
 * @returns {Promise<number[]>} class ids the user may see
 */
export async function getAccessibleClassIds(pool, user) {
  if (!user?.id || !user.school_id) return [];
  if (!userCanAccessTeacherArea(user)) return [];

  if (user.role === "admin") {
    const r = await pool.query(
      `SELECT id FROM classes WHERE school_id = $1 ORDER BY name ASC`,
      [user.school_id]
    );
    return r.rows.map((row) => Number(row.id));
  }

  const r = await pool.query(
    `
    SELECT tca.class_id AS id
    FROM teacher_class_assignments tca
    JOIN classes c ON c.id = tca.class_id
    WHERE tca.teacher_id = $1
      AND c.school_id = $2
    ORDER BY c.name ASC
  `,
    [user.id, user.school_id]
  );
  return r.rows.map((row) => Number(row.id));
}

export async function teacherCanAccessClass(pool, user, classId) {
  const id = Number(classId);
  if (!Number.isInteger(id) || id <= 0) return false;
  if (!userCanAccessTeacherArea(user)) return false;

  if (user.role === "admin") {
    const r = await pool.query(
      `SELECT 1 FROM classes WHERE id = $1 AND school_id = $2 LIMIT 1`,
      [id, user.school_id]
    );
    return r.rows.length > 0;
  }

  const r = await pool.query(
    `
    SELECT 1
    FROM teacher_class_assignments tca
    JOIN classes c ON c.id = tca.class_id
    WHERE tca.teacher_id = $1
      AND tca.class_id = $2
      AND c.school_id = $3
    LIMIT 1
  `,
    [user.id, id, user.school_id]
  );
  return r.rows.length > 0;
}

export async function teacherCanAccessStudent(pool, user, studentId) {
  const id = Number(studentId);
  if (!Number.isInteger(id) || id <= 0) return false;
  if (!userCanAccessTeacherArea(user)) return false;

  const r = await pool.query(
    `
    SELECT u.id, u.class_id
    FROM users u
    WHERE u.id = $1
      AND u.role = 'student'
      AND u.school_id = $2
    LIMIT 1
  `,
    [id, user.school_id]
  );
  if (!r.rows.length) return false;
  const classId = r.rows[0].class_id;
  if (!classId) return false;
  return teacherCanAccessClass(pool, user, classId);
}

export async function listAccessibleClasses(pool, user) {
  const ids = await getAccessibleClassIds(pool, user);
  if (!ids.length) return [];
  const r = await pool.query(
    `
    SELECT id, name
    FROM classes
    WHERE school_id = $1
      AND id = ANY($2::int[])
    ORDER BY name ASC
  `,
    [user.school_id, ids]
  );
  return r.rows;
}

export async function migrateTeacherAreaTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS teacher_class_assignments (
      teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (teacher_id, class_id)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_teacher_class_assignments_class
    ON teacher_class_assignments (class_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS teacher_feedback (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id INTEGER NOT NULL,
      teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      feedback_date DATE NOT NULL DEFAULT CURRENT_DATE,
      chips JSONB NOT NULL DEFAULT '[]'::jsonb,
      note TEXT,
      conversation_held BOOLEAN NOT NULL DEFAULT FALSE,
      teacher_private_note TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_teacher_feedback_student
    ON teacher_feedback (student_id, feedback_date DESC, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_teacher_feedback_school_date
    ON teacher_feedback (school_id, feedback_date DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS teacher_coaching_state (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      coaching_date DATE NOT NULL,
      log_entry_id UUID,
      goal_id UUID,
      help_status TEXT NOT NULL DEFAULT 'none',
      help_concern TEXT,
      help_requested_at TIMESTAMP,
      taken_over_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      taken_over_at TIMESTAMP,
      closed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      closed_at TIMESTAMP,
      note TEXT,
      next_step TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(student_id, coaching_date)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_teacher_coaching_state_class_date
    ON teacher_coaching_state (class_id, coaching_date)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_teacher_coaching_state_school_date
    ON teacher_coaching_state (school_id, coaching_date)
  `);

  // Bestehende Admins bleiben Lehrkräfte (Coaching-Zugang).
  await pool.query(`
    UPDATE users
    SET role = role
    WHERE role = 'admin'
  `);
}

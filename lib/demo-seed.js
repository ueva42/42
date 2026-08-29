/**
 * Demo-Schule für Streets of Logic — Seed & Reset.
 * Schul-Slug: demo · Passwort für alle Demo-Accounts: demo2026
 */

export const DEMO_SLUG = "demo";
export const DEMO_SCHOOL_NAME = "Streets of Logic Demo";
export const DEMO_PASSWORD = "demo2026";
export const DEMO_ADMIN = "demo.lehrer";
export const DEMO_STUDENT = "lina.demo";
export const DEMO_CLASS_NAME = "9a Demo";

const DEMO_CHARACTER_SOURCE_SLUG = process.env.DEMO_CHARACTER_SOURCE || "adsz";

const DEMO_CHARACTERS_FALLBACK = [
  { name: "Logic Lynx", imageUrl: "/characters/logic-lynx.svg" },
  { name: "Neon Vibes", imageUrl: "/characters/neon-vibes.svg" },
  { name: "Pixel Rydah", imageUrl: "/characters/pixel-rydah.svg" },
  { name: "Nova Drift", imageUrl: "/characters/nova-drift.svg" }
];

const DEMO_STUDENTS = [
  { name: "lina.demo", xp: 85 },
  { name: "noah.demo", xp: 142 },
  { name: "mia.demo", xp: 56 },
  { name: "leo.demo", xp: 203 },
  { name: "zoe.demo", xp: 38 },
  { name: "finn.demo", xp: 97 },
  { name: "jana.demo", xp: 64 },
  { name: "ben.demo", xp: 118 }
];

const TIMETABLE_SLOTS = [
  { timeslot: "7.50-8.35", subject: "Mathe", room: "204" },
  { timeslot: "8.40-9.25", subject: "Deutsch", room: "112" },
  { timeslot: "9.30-10.15", subject: "Englisch", room: "205" }
];

const CATALOG_PYTHAGORAS = {
  name: "Satz des Pythagoras",
  gradeLevel: "9",
  rows: [
    {
      fach: "Mathe",
      thema: "Satz des Pythagoras",
      unterthema: "Katheten und Hypotenuse erkennen",
      rookie: "Ich kann im rechtwinkligen Dreieck Katheten und Hypotenuse benennen.",
      operator: "Ich kann die Seiten in einfachen Skizzen korrekt zuordnen.",
      streetLegend: "Ich erkläre anderen, warum die Hypotenuse immer der längsten Seite gegenüberliegt."
    },
    {
      fach: "Mathe",
      thema: "Satz des Pythagoras",
      unterthema: "Formel a² + b² = c² anwenden",
      rookie: "Ich kann die Formel in bekannten Aufgaben einsetzen.",
      operator: "Ich berechne fehlende Seitenlängen selbstständig.",
      streetLegend: "Ich prüfe Ergebnisse und erkenne unrealistische Längen."
    },
    {
      fach: "Mathe",
      thema: "Satz des Pythagoras",
      unterthema: "Anwendungsaufgaben lösen",
      rookie: "Ich löse einfache Sachaufgaben mit Hilfe einer Skizze.",
      operator: "Ich wähle eine passende Strategie und rechne sauber.",
      streetLegend: "Ich formuliere die Lösung verständlich in ganzen Sätzen."
    }
  ]
};

const CATALOG_WAHRSCHEINLICHKEIT = {
  name: "Wahrscheinlichkeit",
  gradeLevel: "9",
  rows: [
    {
      fach: "Mathe",
      thema: "Wahrscheinlichkeit",
      unterthema: "Laplace-Experimente",
      rookie: "Ich kann günstige und mögliche Fälle unterscheiden.",
      operator: "Ich berechne einfache Wahrscheinlichkeiten mit P = günstig/möglich.",
      streetLegend: "Ich erkläre, warum alle Fälle gleich wahrscheinlich sein müssen."
    },
    {
      fach: "Mathe",
      thema: "Wahrscheinlichkeit",
      unterthema: "Baumdiagramme erstellen",
      rookie: "Ich kann ein einfaches Baumdiagramm ablesen.",
      operator: "Ich zeichne ein Baumdiagramm für zweistufige Experimente.",
      streetLegend: "Ich kombiniere Pfade korrekt und rechne Gesamtwahrscheinlichkeiten."
    }
  ]
};

function berlinDateString(offsetDays = 0) {
  const d = new Date();
  if (offsetDays) d.setDate(d.getDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d);
}

function berlinWeekday(dateStr) {
  const [y, m, day] = dateStr.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    weekday: "short"
  }).format(utc);
  const map = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[wd] || 1;
}

async function ensureSystemCatalog(pool, schoolId) {
  const levels = [
    { name: "Rookie", minXp: 0 },
    { name: "Street Pro", minXp: 100 },
    { name: "Street Legend", minXp: 250 },
    { name: "Logic Legend", minXp: 500 }
  ];
  for (const lvl of levels) {
    await pool.query(
      `
      INSERT INTO levels (name, min_xp, school_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (school_id, min_xp) DO UPDATE SET name = EXCLUDED.name
    `,
      [lvl.name, lvl.minXp, schoolId]
    );
  }
}

async function seedSchoolDefaults(pool, schoolId) {
  await ensureSystemCatalog(pool, schoolId);

  const missionCount = (
    await pool.query("SELECT COUNT(*) FROM missions WHERE school_id=$1", [schoolId])
  ).rows[0];
  if (Number(missionCount.count) === 0) {
    await pool.query(
      `
      INSERT INTO missions (name, xp, image_url, require_upload, school_id)
      VALUES
        ('Warm-Up: Konzentrations-Drive', 10, NULL, FALSE, $1),
        ('Math Hustle: Gleichungsjagd', 20, NULL, TRUE, $1),
        ('Logic Run: Rätsel-Checkpoint', 30, NULL, TRUE, $1)
    `,
      [schoolId]
    );
  }

  const bonusCount = (
    await pool.query("SELECT COUNT(*) FROM bonuscards WHERE school_id=$1", [schoolId])
  ).rows[0];
  if (Number(bonusCount.count) === 0) {
    await pool.query(
      `
      INSERT INTO bonuscards (name, xp, image_url, school_id)
      VALUES
        ('5-Minuten Chill-Break', 30, NULL, $1),
        ('Hausaufgaben-Joker (1x)', 60, NULL, $1),
        ('Boss-Seat: Wunschplatz', 90, NULL, $1)
    `,
      [schoolId]
    );
  }

  await syncDemoCharacters(pool, schoolId);
}

function isPlaceholderCharacterImage(imageUrl) {
  const url = String(imageUrl || "");
  return url.startsWith("/characters/") && url.endsWith(".svg");
}

async function fetchSourceCharacters(pool, sourceSlug) {
  const sourceRes = await pool.query("SELECT id FROM schools WHERE slug = $1 LIMIT 1", [
    sourceSlug
  ]);
  if (!sourceRes.rows.length) return [];

  const r = await pool.query(
    `
    SELECT name, image_url
    FROM characters
    WHERE school_id = $1
      AND image_url IS NOT NULL
      AND trim(image_url) <> ''
    ORDER BY id ASC
    LIMIT 4
  `,
    [sourceRes.rows[0].id]
  );

  return r.rows.filter((row) => !isPlaceholderCharacterImage(row.image_url));
}

async function fetchBestSourceCharacters(pool) {
  const preferred = await fetchSourceCharacters(pool, DEMO_CHARACTER_SOURCE_SLUG);
  if (preferred.length >= 4) return preferred;

  const r = await pool.query(
    `
    SELECT c.name, c.image_url
    FROM characters c
    JOIN schools s ON s.id = c.school_id
    WHERE s.slug <> $1
      AND c.image_url IS NOT NULL
      AND trim(c.image_url) <> ''
    ORDER BY c.school_id ASC, c.id ASC
  `,
    [DEMO_SLUG]
  );

  const fromAnySchool = r.rows.filter((row) => !isPlaceholderCharacterImage(row.image_url));
  if (fromAnySchool.length >= 4) return fromAnySchool.slice(0, 4);
  if (preferred.length > 0) return preferred;
  return fromAnySchool;
}

async function insertDemoCharacters(pool, schoolId, characters) {
  await pool.query(
    "UPDATE users SET character_id = NULL WHERE school_id = $1 AND role = 'student'",
    [schoolId]
  );
  await pool.query("DELETE FROM characters WHERE school_id = $1", [schoolId]);

  for (const ch of characters) {
    await pool.query(
      `
      INSERT INTO characters (name, image_url, school_id)
      VALUES ($1, $2, $3)
    `,
      [ch.name, ch.image_url || ch.imageUrl, schoolId]
    );
  }
}

async function demoUsesPlaceholderCharacters(pool, schoolId) {
  const r = await pool.query(
    `
    SELECT image_url
    FROM characters
    WHERE school_id = $1
    ORDER BY id ASC
  `,
    [schoolId]
  );
  if (!r.rows.length) return true;
  return r.rows.every((row) => isPlaceholderCharacterImage(row.image_url));
}

export async function syncDemoCharacters(pool, schoolId) {
  const sourceChars = await fetchBestSourceCharacters(pool);
  const usesPlaceholders = await demoUsesPlaceholderCharacters(pool, schoolId);

  if (sourceChars.length >= 4) {
    await insertDemoCharacters(pool, schoolId, sourceChars.slice(0, 4));
    return { synced: true, source: DEMO_CHARACTER_SOURCE_SLUG, count: 4 };
  }
  if (sourceChars.length > 0 && usesPlaceholders) {
    await insertDemoCharacters(pool, schoolId, sourceChars);
    return { synced: true, source: DEMO_CHARACTER_SOURCE_SLUG, count: sourceChars.length };
  }

  if (!usesPlaceholders) {
    return { synced: false, keptExisting: true };
  }

  if (sourceChars.length > 0) {
    await insertDemoCharacters(pool, schoolId, sourceChars);
    return { synced: true, source: DEMO_CHARACTER_SOURCE_SLUG, count: sourceChars.length };
  }

  await insertDemoCharacters(
    pool,
    schoolId,
    DEMO_CHARACTERS_FALLBACK.map((ch) => ({ name: ch.name, image_url: ch.imageUrl }))
  );
  return { synced: false, fallback: true };
}

/** @deprecated alias */
async function seedDemoCharacters(pool, schoolId) {
  return syncDemoCharacters(pool, schoolId);
}

async function findOrCreateCatalogTopic(pool, catalogId, schoolId, fach, thema) {
  const existing = await pool.query(
    `
    SELECT id FROM level_checks
    WHERE catalog_id = $1 AND school_id = $2
      AND lower(trim(subject)) = lower(trim($3))
      AND lower(trim(name)) = lower(trim($4))
    LIMIT 1
  `,
    [catalogId, schoolId, fach, thema]
  );
  if (existing.rows.length) return existing.rows[0].id;

  const orderRes = await pool.query(
    `
    SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order
    FROM level_checks WHERE catalog_id = $1 AND subject = $2
  `,
    [catalogId, fach]
  );

  const ins = await pool.query(
    `
    INSERT INTO level_checks (school_id, catalog_id, class_id, subject, name, sort_order)
    VALUES ($1, $2, NULL, $3, $4, $5)
    RETURNING id
  `,
    [schoolId, catalogId, fach, thema.slice(0, 120), orderRes.rows[0].next_order]
  );
  return ins.rows[0].id;
}

async function importCatalogRows(pool, catalogId, schoolId, rows) {
  const goalIds = [];
  for (const row of rows) {
    const levelCheckId = await findOrCreateCatalogTopic(
      pool,
      catalogId,
      schoolId,
      row.fach,
      row.thema
    );
    const orderRes = await pool.query(
      `
      SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order
      FROM level_check_goals WHERE level_check_id = $1
    `,
      [levelCheckId]
    );
    const ins = await pool.query(
      `
      INSERT INTO level_check_goals (
        school_id, level_check_id, goal_text, sort_order,
        rookie_goal_text, operator_goal_text, street_legend_goal_text,
        material_type, practice_url, active, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NOW())
      RETURNING id
    `,
      [
        schoolId,
        levelCheckId,
        row.unterthema.slice(0, 300),
        orderRes.rows[0].next_order,
        row.rookie.slice(0, 500),
        row.operator.slice(0, 500),
        row.streetLegend.slice(0, 500),
        row.materialType || "none",
        row.practiceUrl || null
      ]
    );
    goalIds.push(ins.rows[0].id);
  }
  return goalIds;
}

async function createCatalog(pool, schoolId, catalogDef) {
  const ins = await pool.query(
    `
    INSERT INTO level_plan_catalogs (school_id, grade_level, name)
    VALUES ($1, $2, $3)
    RETURNING id
  `,
    [schoolId, catalogDef.gradeLevel, catalogDef.name.slice(0, 120)]
  );
  const catalogId = ins.rows[0].id;
  const goalIds = await importCatalogRows(pool, catalogId, schoolId, catalogDef.rows);
  const topics = await pool.query(
    `
    SELECT id, name, subject
    FROM level_checks
    WHERE catalog_id = $1 AND school_id = $2
    ORDER BY sort_order ASC, created_at ASC
  `,
    [catalogId, schoolId]
  );
  return { catalogId, goalIds, topics: topics.rows };
}

async function seedDemoTimetable(pool, schoolId, classId) {
  await pool.query("DELETE FROM timetables WHERE class_id = $1", [classId]);
  for (let weekday = 1; weekday <= 5; weekday++) {
    for (const slot of TIMETABLE_SLOTS) {
      await pool.query(
        `
        INSERT INTO timetables (class_id, school_id, weekday, timeslot, subject, room)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
        [classId, schoolId, weekday, slot.timeslot, slot.subject, slot.room || ""]
      );
    }
  }
}

async function seedDemoCheckpoints(pool, schoolId, classId, topicId, goalIds) {
  if (!topicId) return;

  await pool.query(
    `
    DELETE FROM level_check_checkpoints
    WHERE class_id = $1
       OR level_check_id = $2
  `,
    [classId, topicId]
  );

  const linked = (goalIds || []).slice(0, 2);
  const near = berlinDateString(5);
  const later = berlinDateString(12);

  await pool.query(
    `
    INSERT INTO level_check_checkpoints (
      school_id, level_check_id, class_id, checkpoint_date, checkpoint_type,
      checkpoint_type_label, linked_subtopic_ids
    )
    VALUES
      ($1, $2, $3, $4, 'levelcheck', NULL, $5::jsonb),
      ($1, $2, $3, $6, 'klassenarbeit', NULL, $7::jsonb)
  `,
    [
      schoolId,
      topicId,
      classId,
      near,
      JSON.stringify(linked),
      later,
      JSON.stringify(linked.length ? linked : [])
    ]
  );
}

async function resetDemoBriefingFlags(pool, schoolId) {
  await pool.query(
    `
    UPDATE users
    SET has_seen_start_briefing = FALSE
    WHERE school_id = $1 AND role = 'student'
  `,
    [schoolId]
  );
}

export async function prepareDemoStudentSession(pool, userId) {
  if (!userId) return;
  await pool.query(
    `
    UPDATE users
    SET has_seen_start_briefing = FALSE
    WHERE id = $1 AND role = 'student'
  `,
    [userId]
  );
}

async function getDemoClassId(pool, schoolId) {
  const r = await pool.query(
    `
    SELECT id FROM classes
    WHERE school_id = $1 AND name = $2
    LIMIT 1
  `,
    [schoolId, DEMO_CLASS_NAME]
  );
  return r.rows[0]?.id ?? null;
}

/** Aktualisiert Stundenplan + Lernnachweise für bestehende Demo-Schulen */
export async function refreshDemoLearningSetup(pool, schoolId) {
  const classId = await getDemoClassId(pool, schoolId);
  if (!classId) return { refreshed: false };

  await seedDemoTimetable(pool, schoolId, classId);
  await resetDemoBriefingFlags(pool, schoolId);

  const topicRes = await pool.query(
    `
    SELECT lc.id
    FROM level_checks lc
    JOIN class_level_plan_assignments a ON a.catalog_id = lc.catalog_id
    WHERE a.class_id = $1
      AND lower(trim(lc.subject)) = 'mathe'
    ORDER BY lc.sort_order ASC, lc.created_at ASC
    LIMIT 1
  `,
    [classId]
  );
  const topicId = topicRes.rows[0]?.id;
  if (topicId) {
    const goals = await pool.query(
      `
      SELECT id FROM level_check_goals
      WHERE level_check_id = $1 AND COALESCE(active, true) = true
      ORDER BY sort_order ASC
      LIMIT 3
    `,
      [topicId]
    );
    await seedDemoCheckpoints(
      pool,
      schoolId,
      classId,
      topicId,
      goals.rows.map((g) => g.id)
    );
  }

  return { refreshed: true, classId };
}

export async function getDemoSchoolId(pool) {
  const r = await pool.query("SELECT id FROM schools WHERE slug = $1 LIMIT 1", [DEMO_SLUG]);
  return r.rows[0]?.id ?? null;
}

export async function isDemoSchoolId(pool, schoolId) {
  if (!schoolId) return false;
  const r = await pool.query("SELECT 1 FROM schools WHERE id = $1 AND slug = $2 LIMIT 1", [
    schoolId,
    DEMO_SLUG
  ]);
  return r.rows.length > 0;
}

export async function resetDemoSchool(pool) {
  const schoolId = await getDemoSchoolId(pool);
  if (!schoolId) return { success: false, message: "Demo-Schule nicht gefunden." };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `
      DELETE FROM log_checks
      WHERE log_entry_id IN (
        SELECT id FROM log_entries WHERE school_id = $1
          OR user_id IN (SELECT id FROM users WHERE school_id = $1)
      )
    `,
      [schoolId]
    );
    await client.query(
      `
      DELETE FROM log_reflections
      WHERE log_entry_id IN (
        SELECT id FROM log_entries WHERE school_id = $1
          OR user_id IN (SELECT id FROM users WHERE school_id = $1)
      )
    `,
      [schoolId]
    );
    await client.query(
      `
      DELETE FROM log_entries
      WHERE school_id = $1
        OR user_id IN (SELECT id FROM users WHERE school_id = $1)
    `,
      [schoolId]
    );
    await client.query("DELETE FROM log_week_reflections WHERE school_id = $1", [schoolId]);
    await client.query(
      `
      DELETE FROM level_check_marks
      WHERE user_id IN (SELECT id FROM users WHERE school_id = $1 AND role = 'student')
    `,
      [schoolId]
    );
    await client.query(
      `
      DELETE FROM level_check_proofs
      WHERE user_id IN (SELECT id FROM users WHERE school_id = $1 AND role = 'student')
    `,
      [schoolId]
    );
    await client.query(
      `
      DELETE FROM level_check_checkpoints
      WHERE level_check_id IN (
        SELECT id FROM level_checks WHERE school_id = $1
          OR class_id IN (SELECT id FROM classes WHERE school_id = $1)
      )
    `,
      [schoolId]
    );
    await client.query(
      `
      DELETE FROM level_check_goals
      WHERE school_id = $1
        OR level_check_id IN (
          SELECT id FROM level_checks WHERE school_id = $1
            OR class_id IN (SELECT id FROM classes WHERE school_id = $1)
        )
    `,
      [schoolId]
    );
    await client.query(
      `
      DELETE FROM level_checks
      WHERE school_id = $1
        OR class_id IN (SELECT id FROM classes WHERE school_id = $1)
    `,
      [schoolId]
    );
    await client.query(
      `
      DELETE FROM class_level_plan_assignments
      WHERE class_id IN (SELECT id FROM classes WHERE school_id = $1)
    `,
      [schoolId]
    );
    await client.query("DELETE FROM level_plan_catalogs WHERE school_id = $1", [schoolId]);
    await client.query(
      `
      DELETE FROM timetables
      WHERE school_id = $1
        OR class_id IN (SELECT id FROM classes WHERE school_id = $1)
    `,
      [schoolId]
    );
    await client.query("DELETE FROM subject_lesson_goals WHERE school_id = $1", [schoolId]);
    await client.query("DELETE FROM xp_transactions WHERE school_id = $1", [schoolId]);
    await client.query("DELETE FROM student_uploads WHERE school_id = $1", [schoolId]);
    await client.query(
      `
      DELETE FROM class_reward_votes
      WHERE round_id IN (SELECT id FROM class_reward_rounds WHERE school_id = $1)
    `,
      [schoolId]
    );
    await client.query(
      `
      DELETE FROM class_reward_options
      WHERE round_id IN (SELECT id FROM class_reward_rounds WHERE school_id = $1)
    `,
      [schoolId]
    );
    await client.query("DELETE FROM class_reward_rounds WHERE school_id = $1", [schoolId]);
    await client.query("DELETE FROM class_challenges WHERE school_id = $1", [schoolId]);
    await client.query("DELETE FROM users WHERE school_id = $1 AND role = 'student'", [schoolId]);
    await client.query("DELETE FROM classes WHERE school_id = $1", [schoolId]);
    await client.query("DELETE FROM missions WHERE school_id = $1", [schoolId]);
    await client.query("DELETE FROM bonuscards WHERE school_id = $1", [schoolId]);
    await client.query("DELETE FROM characters WHERE school_id = $1", [schoolId]);
    await client.query("DELETE FROM class_rewards WHERE school_id = $1", [schoolId]);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  await seedDemoSchool(pool, { force: true });
  return { success: true, message: "Demo-Schule zurückgesetzt." };
}

export async function seedDemoSchool(pool, options = {}) {
  let schoolId = await getDemoSchoolId(pool);

  if (!schoolId) {
    const ins = await pool.query(
      `
      INSERT INTO schools (name, slug)
      VALUES ($1, $2)
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `,
      [DEMO_SCHOOL_NAME, DEMO_SLUG]
    );
    schoolId = ins.rows[0].id;
  }

  const classCount = (
    await pool.query("SELECT COUNT(*) FROM classes WHERE school_id = $1", [schoolId])
  ).rows[0];
  if (!options.force && Number(classCount.count) > 0) {
    return { success: true, schoolId, skipped: true };
  }

  await pool.query(
    `
    INSERT INTO users (name, password, role, school_id, first_login)
    VALUES ($1, $2, 'admin', $3, FALSE)
    ON CONFLICT (name, school_id) DO UPDATE SET password = EXCLUDED.password, first_login = FALSE
  `,
    [DEMO_ADMIN, DEMO_PASSWORD, schoolId]
  );

  await seedSchoolDefaults(pool, schoolId);

  const classIns = await pool.query(
    `
    INSERT INTO classes (name, school_id)
    VALUES ($1, $2)
    ON CONFLICT (name, school_id) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `,
    [DEMO_CLASS_NAME, schoolId]
  );
  const classId = classIns.rows[0].id;

  const studentIds = {};
  for (const student of DEMO_STUDENTS) {
    const ins = await pool.query(
      `
      INSERT INTO users (name, password, role, class_id, school_id, xp, first_login, has_seen_start_briefing)
      VALUES ($1, $2, 'student', $3, $4, $5, FALSE, FALSE)
      ON CONFLICT (name, school_id) DO UPDATE
        SET class_id = EXCLUDED.class_id, xp = EXCLUDED.xp, first_login = FALSE, has_seen_start_briefing = FALSE
      RETURNING id
    `,
      [student.name, DEMO_PASSWORD, classId, schoolId, student.xp]
    );
    studentIds[student.name] = ins.rows[0].id;
  }

  await seedDemoTimetable(pool, schoolId, classId);

  const pythagorasCatalog = { ...CATALOG_PYTHAGORAS };
  pythagorasCatalog.rows = [
    { ...CATALOG_PYTHAGORAS.rows[0], materialType: "url", practiceUrl: "https://www.geogebra.org/m/pythagoras" },
    ...CATALOG_PYTHAGORAS.rows.slice(1)
  ];

  const { catalogId: catalogPyth, goalIds: pythGoalIds, topics: pythTopics } = await createCatalog(
    pool,
    schoolId,
    pythagorasCatalog
  );
  const { catalogId: catalogWahr } = await createCatalog(pool, schoolId, CATALOG_WAHRSCHEINLICHKEIT);

  for (const catalogId of [catalogPyth, catalogWahr]) {
    await pool.query(
      `
      INSERT INTO class_level_plan_assignments (class_id, subject, catalog_id)
      VALUES ($1, 'Mathe', $2)
      ON CONFLICT (class_id, subject, catalog_id) DO NOTHING
    `,
      [classId, catalogId]
    );
  }

  const pythTopicId = pythTopics?.[0]?.id;
  await seedDemoCheckpoints(pool, schoolId, classId, pythTopicId, pythGoalIds);

  const linaId = studentIds[DEMO_STUDENT];
  if (linaId && pythGoalIds.length) {
    await pool.query(
      `
      INSERT INTO level_check_marks (school_id, goal_id, user_id, tier, updated_at)
      VALUES ($1, $2, $3, 'rookie', NOW())
      ON CONFLICT (goal_id, user_id, tier) DO NOTHING
    `,
      [schoolId, pythGoalIds[0], linaId]
    );
    if (pythGoalIds[1]) {
      await pool.query(
        `
        INSERT INTO level_check_marks (school_id, goal_id, user_id, tier, updated_at)
        VALUES ($1, $2, $3, 'operator', NOW())
        ON CONFLICT (goal_id, user_id, tier) DO NOTHING
      `,
        [schoolId, pythGoalIds[1], linaId]
      );
    }
  }

  const today = berlinDateString(0);
  const yesterday = berlinDateString(-1);
  const sampleLogs = [
    {
      studentName: DEMO_STUDENT,
      date: today,
      timeslot: "7.50-8.35",
      subject: "Mathe",
      goal: "Pythagoras-Aufgaben im Heft fertigstellen",
      confidence: 4,
      check: { on_track: "ja", understands: "ja", progress: "teilweise" },
      reflect: {
        goal_achieved: "ja",
        how_worked: "Gruppenarbeit",
        next_step: "Operator-Stufe üben",
        confidence_after: 4,
        learned_today: "Skizzen helfen beim Pythagoras."
      }
    },
    {
      studentName: "noah.demo",
      date: today,
      timeslot: "8.40-9.25",
      subject: "Deutsch",
      goal: "Erörterung: Einleitung formulieren",
      confidence: 3
    },
    {
      studentName: DEMO_STUDENT,
      date: yesterday,
      timeslot: "7.50-8.35",
      subject: "Mathe",
      goal: "Wiederholung: Katheten und Hypotenuse",
      confidence: 3,
      check: { on_track: "ja", understands: "nein", progress: "nein" }
    },
    {
      studentName: DEMO_STUDENT,
      date: yesterday,
      timeslot: "9.30-10.15",
      subject: "Englisch",
      goal: "Vokabeln Unit 3 wiederholen",
      confidence: 4
    }
  ];

  for (const log of sampleLogs) {
    const userId = studentIds[log.studentName];
    if (!userId) continue;

    const entryRes = await pool.query(
      `
      INSERT INTO log_entries (
        user_id, school_id, date, timeslot, subject, goal,
        work_goals, confidence_before, how_goal_text
      )
      VALUES ($1, $2, $3, $4, $5, $6, '[]'::jsonb, $7, $6)
      RETURNING id
    `,
      [userId, schoolId, log.date, log.timeslot, log.subject, log.goal, log.confidence ?? 3]
    );
    const entryId = entryRes.rows[0].id;

    if (log.check) {
      await pool.query(
        `
        INSERT INTO log_checks (log_entry_id, on_track, understands, progress)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (log_entry_id) DO NOTHING
      `,
        [entryId, log.check.on_track, log.check.understands, log.check.progress]
      );
    }

    if (log.reflect) {
      await pool.query(
        `
        INSERT INTO log_reflections (
          log_entry_id, goal_achieved, how_worked, next_step,
          confidence_after, learned_today
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (log_entry_id) DO NOTHING
      `,
        [
          entryId,
          log.reflect.goal_achieved,
          log.reflect.how_worked,
          log.reflect.next_step,
          log.reflect.confidence_after,
          log.reflect.learned_today || null
        ]
      );
    }
  }

  return {
    success: true,
    schoolId,
    classId,
    skipped: false,
    weekday: berlinWeekday(today)
  };
}

export async function ensureDemoSchool(pool) {
  const schoolId = await getDemoSchoolId(pool);
  if (!schoolId) {
    return seedDemoSchool(pool);
  }
  const classCount = (
    await pool.query("SELECT COUNT(*) FROM classes WHERE school_id = $1", [schoolId])
  ).rows[0];
  if (Number(classCount.count) === 0) {
    return seedDemoSchool(pool);
  }
  await syncDemoCharacters(pool, schoolId);
  await refreshDemoLearningSetup(pool, schoolId);
  return { success: true, schoolId, skipped: true };
}

export async function findDemoUser(pool, role) {
  const schoolId = await getDemoSchoolId(pool);
  if (!schoolId) return null;

  if (role === "admin") {
    const r = await pool.query(
      `
      SELECT id, name, password, role, class_id, school_id, first_login
      FROM users
      WHERE school_id = $1 AND role = 'admin' AND name = $2
      LIMIT 1
    `,
      [schoolId, DEMO_ADMIN]
    );
    return r.rows[0] || null;
  }

  const r = await pool.query(
    `
    SELECT id, name, password, role, class_id, school_id, first_login
    FROM users
    WHERE school_id = $1 AND role = 'student' AND name = $2
    LIMIT 1
  `,
    [schoolId, DEMO_STUDENT]
  );
  return r.rows[0] || null;
}

export function isDemoEnabled() {
  return process.env.DEMO_MODE === "true" || process.env.DEMO_ENABLED !== "false";
}

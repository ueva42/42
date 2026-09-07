/**
 * Gruppenmodus (Laborarbeit) – Defaults, Schema-Migration und Hilfslogik.
 * Kompetenzziele kommen aus bestehenden level_checks / level_check_goals.
 */

export const GROUP_SESSION_STATUSES = [
  "setup",
  "active",
  "midcheck",
  "reflecting",
  "closed"
];

export const DEFAULT_PHYSICS_ROLES = [
  {
    name: "Versuch",
    description: "Du bereitest Versuche vor und führst sie sicher durch.",
    wasGoals: [
      "Ich plane einen passenden Versuch.",
      "Ich bereite den Versuchsaufbau vor.",
      "Ich baue den Versuch sicher und richtig auf.",
      "Ich führe den Versuch kontrolliert durch.",
      "Ich untersuche eine mögliche Fehlerquelle."
    ],
    howGoals: [
      "Ich beachte die Sicherheitsregeln.",
      "Ich spreche den Aufbau vorher mit meiner Gruppe ab.",
      "Ich verändere immer nur eine Bedingung.",
      "Ich beobachte während des Versuchs genau.",
      "Ich wiederhole den Versuch, um das Ergebnis zu überprüfen."
    ]
  },
  {
    name: "Protokoll",
    description: "Du hältst Aufbau, Beobachtungen, Bilder und Ergebnisse fest.",
    wasGoals: [
      "Ich halte den Versuchsaufbau und die Beobachtungen fest.",
      "Ich dokumentiere Messwerte und Einheiten.",
      "Ich fertige eine Skizze oder ein Foto vom Aufbau an.",
      "Ich notiere Auffälligkeiten und Fehlerquellen."
    ],
    howGoals: [
      "Ich notiere Messwerte übersichtlich und mit den passenden Einheiten.",
      "Ich schreibe so klar, dass die Gruppe meine Notizen versteht.",
      "Ich ordne Beobachtungen und Messwerte dem Versuchsschritt zu.",
      "Ich prüfe mit der Gruppe, ob etwas fehlt."
    ]
  },
  {
    name: "Ergebnis",
    description: "Du erklärst die physikalischen Zusammenhänge.",
    wasGoals: [
      "Ich erkläre den Zusammenhang mit eigenen Worten.",
      "Ich vergleiche unsere Ergebnisse mit der Erwartung.",
      "Ich formuliere eine begründete Schlussfolgerung.",
      "Ich beantworte die Forschungsfrage der Gruppe."
    ],
    howGoals: [
      "Ich nutze Fachbegriffe richtig.",
      "Ich erkläre mein Ergebnis der Gruppe.",
      "Ich lasse mir etwas von der Gruppe erklären.",
      "Ich prüfe, ob unsere Begründung zu den Messwerten passt."
    ]
  },
  {
    name: "Produkt",
    description: "Du planst, baust, prüfst und verbesserst das Produkt.",
    wasGoals: [
      "Ich plane ein passendes Produkt oder Modell.",
      "Ich baue oder gestalte unser Produkt.",
      "Ich teste und verbessere das Produkt.",
      "Ich stelle das Produkt der Gruppe vor."
    ],
    howGoals: [
      "Ich entwickle und überprüfe ein Produkt.",
      "Ich vergleiche verschiedene Lösungen.",
      "Ich hole Feedback von der Gruppe ein.",
      "Ich verbessere nach dem Test gezielt einen Punkt."
    ]
  }
];

/** Globale Fallback-Wie-Ziele (wenn eine Rolle noch keine eigenen hat). */
export const DEFAULT_GROUP_HOW_GOALS = [
  "Ich arbeite sorgfältig und halte mich an Absprachen.",
  "Ich spreche wichtige Schritte mit meiner Gruppe ab.",
  "Ich dokumentiere meine Arbeit klar und nachvollziehbar.",
  "Ich prüfe mein Ergebnis und hole Feedback ein.",
  "Ich erkläre mein Vorgehen mit eigenen Worten."
];

export const DEFAULT_GROUP_SETTINGS = {
  enabled: false,
  minMembers: 2,
  maxMembers: 4,
  allowMultiRoles: true,
  allowRoleSwitch: true,
  enableSharedGoal: true,
  enableWhatGoals: true,
  maxWhatGoals: 1,
  enableHowGoals: true,
  enableMidCheck: true,
  enableReflection: true,
  allowFreeWhatGoal: false,
  allowFreeHowGoal: true,
  howGoalOptions: DEFAULT_GROUP_HOW_GOALS
};

export function toIsoDateOnly(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const str = String(value).trim();
  const iso = str.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    const m = String(parsed.getUTCMonth() + 1).padStart(2, "0");
    const d = String(parsed.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return null;
}

export function clampGroupSize(minMembers, maxMembers) {
  let min = Number(minMembers);
  let max = Number(maxMembers);
  if (!Number.isFinite(min) || min < 2) min = 2;
  if (!Number.isFinite(max) || max < min) max = Math.max(min, 4);
  if (max > 8) max = 8;
  return { minMembers: min, maxMembers: max };
}

export function validateMemberCount(count, settings) {
  const { minMembers, maxMembers } = clampGroupSize(
    settings?.minMembers ?? settings?.min_members,
    settings?.maxMembers ?? settings?.max_members
  );
  const n = Number(count) || 0;
  if (n < minMembers) {
    return {
      ok: false,
      message: `Bitte wählt mindestens ${minMembers} Personen aus.`
    };
  }
  if (n > maxMembers) {
    return {
      ok: false,
      message: `Maximal ${maxMembers} Personen pro Gruppe.`
    };
  }
  return { ok: true, minMembers, maxMembers };
}

/**
 * Schlägt eine Rollenverteilung für 2–4 Personen vor.
 * Bei weniger Personen als Rollen bekommen frühere Mitglieder mehrere Rollen.
 */
export function suggestRoleAssignment(memberIds, roles) {
  const members = (memberIds || []).map(String);
  const activeRoles = (roles || []).filter((r) => r && r.active !== false);
  if (!members.length || !activeRoles.length) return [];

  const assignments = [];
  activeRoles.forEach((role, idx) => {
    const memberId = members[idx % members.length];
    assignments.push({
      userId: memberId,
      roleId: role.id,
      roleName: role.name
    });
  });
  return assignments;
}

export function allRolesCovered(assignments, roles, allowMultiRoles = true) {
  const activeRoles = (roles || []).filter((r) => r && r.active !== false);
  if (!activeRoles.length) return { ok: true };
  const assignedRoleIds = new Set(
    (assignments || []).map((a) => String(a.roleId || a.role_id))
  );
  const missing = activeRoles.filter((r) => !assignedRoleIds.has(String(r.id)));
  if (missing.length) {
    return {
      ok: false,
      message: `Noch nicht vergeben: ${missing.map((r) => r.name).join(", ")}.`
    };
  }

  const byUser = {};
  for (const a of assignments || []) {
    const uid = String(a.userId || a.user_id);
    byUser[uid] = (byUser[uid] || 0) + 1;
  }
  if (!allowMultiRoles) {
    const overloaded = Object.entries(byUser).find(([, n]) => n > 1);
    if (overloaded) {
      return {
        ok: false,
        message: "Mehrere Aufgaben pro Person sind in diesem Fach nicht erlaubt."
      };
    }
  }

  const memberIds = Object.keys(byUser);
  if (!memberIds.length) {
    return { ok: false, message: "Bitte vergibt die Aufgaben." };
  }
  return { ok: true };
}

export function memberGoalsComplete(member, settings = {}) {
  const enableWhat = settings.enableWhatGoals !== false;
  const enableHow = settings.enableHowGoals !== false;
  const allowFreeWhat = !!settings.allowFreeWhatGoal;

  if (enableWhat) {
    const hasGoal =
      !!member?.what_goal_id ||
      !!member?.whatGoalId ||
      (allowFreeWhat &&
        String(member?.what_goal_text_snapshot || member?.whatGoalText || "").trim());
    if (!hasGoal) return false;
  }
  if (enableHow) {
    const how = String(member?.how_goal_text || member?.howGoalText || "").trim();
    if (!how) return false;
  }
  return !!(member?.goals_confirmed_at || member?.goalsConfirmedAt);
}

export function sessionProgress(members, settings = {}) {
  const list = members || [];
  const total = list.length;
  const goalsDone = list.filter((m) => memberGoalsComplete(m, settings)).length;
  const midDone = list.filter((m) => m.mid_check_at || m.midCheckAt).length;
  const reflectDone = list.filter((m) => m.reflection_at || m.reflectionAt).length;
  return {
    total,
    goalsDone,
    midDone,
    reflectDone,
    goalsComplete: total > 0 && goalsDone === total,
    midComplete: total > 0 && midDone === total,
    reflectComplete: total > 0 && reflectDone === total
  };
}

export function serializeSettingsRow(row, roles = []) {
  if (!row) return null;
  const howOpts = Array.isArray(row.how_goal_options)
    ? row.how_goal_options
    : DEFAULT_GROUP_HOW_GOALS;
  return {
    id: row.id,
    schoolId: row.school_id,
    classId: row.class_id,
    subject: row.subject,
    enabled: !!row.enabled,
    minMembers: row.min_members,
    maxMembers: row.max_members,
    allowMultiRoles: row.allow_multi_roles !== false,
    allowRoleSwitch: row.allow_role_switch !== false,
    enableSharedGoal: row.enable_shared_goal !== false,
    enableWhatGoals: row.enable_what_goals !== false,
    maxWhatGoals: row.max_what_goals ?? 1,
    enableHowGoals: row.enable_how_goals !== false,
    enableMidCheck: row.enable_mid_check !== false,
    enableReflection: row.enable_reflection !== false,
    allowFreeWhatGoal: !!row.allow_free_what_goal,
    allowFreeHowGoal: row.allow_free_how_goal !== false,
    howGoalOptions: howOpts,
    roles: (roles || []).map((r) => serializeRoleRow(r, r.goals || r._goals)).filter(Boolean)
  };
}

export function serializeRoleGoalRow(row) {
  if (!row) return null;
  const type = String(row.goal_type || row.type || "").toUpperCase() === "WIE" ? "WIE" : "WAS";
  return {
    id: row.id,
    roleId: row.role_id,
    type,
    text: row.text || "",
    sortOrder: row.sort_order ?? 0,
    active: row.active !== false,
    level: row.level || null,
    explanation: row.explanation || "",
    externalImportId: row.external_import_id || null
  };
}

export function serializeRoleRow(row, goals = null) {
  if (!row) return null;
  const allGoals = Array.isArray(goals)
    ? goals
    : Array.isArray(row.goals)
      ? row.goals
      : [];
  const serialized = allGoals.map(serializeRoleGoalRow).filter(Boolean);
  return {
    id: row.id,
    settingsId: row.settings_id,
    name: row.name,
    description: row.description || "",
    iconKey: row.icon_key || row.iconKey || null,
    sortOrder: row.sort_order ?? 0,
    active: row.active !== false,
    wasGoals: serialized.filter((g) => g.type === "WAS"),
    howGoals: serialized.filter((g) => g.type === "WIE"),
    goals: serialized
  };
}

export async function migrateGroupModeTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_mode_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      min_members INTEGER NOT NULL DEFAULT 2,
      max_members INTEGER NOT NULL DEFAULT 4,
      allow_multi_roles BOOLEAN NOT NULL DEFAULT TRUE,
      allow_role_switch BOOLEAN NOT NULL DEFAULT TRUE,
      enable_shared_goal BOOLEAN NOT NULL DEFAULT TRUE,
      enable_what_goals BOOLEAN NOT NULL DEFAULT TRUE,
      max_what_goals INTEGER NOT NULL DEFAULT 1,
      enable_how_goals BOOLEAN NOT NULL DEFAULT TRUE,
      enable_mid_check BOOLEAN NOT NULL DEFAULT TRUE,
      enable_reflection BOOLEAN NOT NULL DEFAULT TRUE,
      allow_free_what_goal BOOLEAN NOT NULL DEFAULT FALSE,
      allow_free_how_goal BOOLEAN NOT NULL DEFAULT TRUE,
      how_goal_options JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (class_id, subject)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_mode_roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id INTEGER NOT NULL,
      settings_id UUID NOT NULL REFERENCES group_mode_settings(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      icon_key TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_group_mode_roles_settings
    ON group_mode_roles (settings_id, sort_order)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_mode_role_goals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id INTEGER NOT NULL,
      role_id UUID NOT NULL REFERENCES group_mode_roles(id) ON DELETE CASCADE,
      goal_type TEXT NOT NULL CHECK (goal_type IN ('WAS', 'WIE')),
      text TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      level TEXT,
      explanation TEXT,
      external_import_id TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_group_mode_role_goals_role
    ON group_mode_role_goals (role_id, goal_type, sort_order)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      session_date DATE NOT NULL,
      timeslot TEXT,
      topic_id UUID,
      topic_name_snapshot TEXT,
      shared_goal TEXT,
      group_name TEXT,
      status TEXT NOT NULL DEFAULT 'setup',
      setup_step TEXT NOT NULL DEFAULT 'members',
      host_user_id INTEGER,
      created_by INTEGER,
      started_at TIMESTAMP,
      closed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_group_sessions_class_date
    ON group_sessions (class_id, session_date, status)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_group_sessions_class_subject_status
    ON group_sessions (class_id, subject, status)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_session_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES group_sessions(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL,
      display_name_snapshot TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      what_goal_id UUID,
      what_goal_text_snapshot TEXT,
      what_goal_area_snapshot TEXT,
      selected_level TEXT,
      level_goal_text_snapshot TEXT,
      how_goal_text TEXT,
      goals_confirmed_at TIMESTAMP,
      mid_check JSONB,
      mid_check_at TIMESTAMP,
      reflection JSONB,
      reflection_at TIMESTAMP,
      continue_next_session TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (session_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_session_member_roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id UUID NOT NULL REFERENCES group_session_members(id) ON DELETE CASCADE,
      role_id UUID,
      role_name_snapshot TEXT NOT NULL,
      role_description_snapshot TEXT
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_group_session_member_roles_member
    ON group_session_member_roles (member_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_session_docs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES group_sessions(id) ON DELETE CASCADE,
      school_id INTEGER NOT NULL,
      doc_type TEXT NOT NULL DEFAULT 'note',
      content TEXT NOT NULL,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_competency_activity (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      session_id UUID NOT NULL,
      class_id INTEGER,
      subject TEXT,
      goal_id UUID,
      goal_text_snapshot TEXT,
      area_snapshot TEXT,
      selected_level TEXT,
      how_goal_text TEXT,
      roles_snapshot JSONB,
      self_assessment TEXT,
      continue_next_session TEXT,
      teacher_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
      recorded_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_group_competency_activity_user
    ON group_competency_activity (user_id, recorded_at DESC)
  `);

  // Ältere DBs: CREATE TABLE IF NOT EXISTS ergänzt fehlende Spalten nicht
  const ensureCol = async (table, column, sqlType) => {
    await pool.query(
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${sqlType}`
    );
  };
  await ensureCol("group_session_members", "created_at", "TIMESTAMP DEFAULT NOW()");
  await ensureCol("group_session_members", "updated_at", "TIMESTAMP DEFAULT NOW()");
  await ensureCol("group_session_member_roles", "created_at", "TIMESTAMP DEFAULT NOW()");
  await ensureCol("group_session_docs", "created_at", "TIMESTAMP DEFAULT NOW()");
  await ensureCol("group_sessions", "created_at", "TIMESTAMP DEFAULT NOW()");
  await ensureCol("group_sessions", "updated_at", "TIMESTAMP DEFAULT NOW()");
  await ensureCol("group_mode_roles", "created_at", "TIMESTAMP DEFAULT NOW()");
  await ensureCol("group_mode_roles", "icon_key", "TEXT");
  await ensureCol("group_session_members", "how_goal_id", "UUID");
  await ensureCol("group_mode_role_goals", "created_at", "TIMESTAMP DEFAULT NOW()");
  await ensureCol("group_mode_role_goals", "updated_at", "TIMESTAMP DEFAULT NOW()");
  await ensureCol("group_mode_role_goals", "level", "TEXT");
  await ensureCol("group_mode_role_goals", "explanation", "TEXT");
  await ensureCol("group_mode_role_goals", "external_import_id", "TEXT");

  await repairGroupModeIntegrity(pool);
}

/** Verwaiste Mitglieder/Rollen entfernen; optional alte leere Setup-Hülsen. */
export async function repairGroupModeIntegrity(pool, opts = {}) {
  const classId = opts.classId ?? null;
  const protectSessionId = opts.protectSessionId ?? null;
  const pruneEmptySetups = opts.pruneEmptySetups !== false;

  await pool.query(`
    DELETE FROM group_session_member_roles r
    WHERE NOT EXISTS (
      SELECT 1 FROM group_session_members m WHERE m.id = r.member_id
    )
  `);
  await pool.query(`
    DELETE FROM group_session_members m
    WHERE NOT EXISTS (
      SELECT 1 FROM group_sessions gs WHERE gs.id = m.session_id
    )
  `);
  await pool.query(`
    DELETE FROM group_session_docs d
    WHERE NOT EXISTS (
      SELECT 1 FROM group_sessions gs WHERE gs.id = d.session_id
    )
  `);
  await pool.query(`
    DELETE FROM group_competency_activity a
    WHERE NOT EXISTS (
      SELECT 1 FROM group_sessions gs WHERE gs.id = a.session_id
    )
  `);

  if (!pruneEmptySetups) return;

  // Leere Setup-Hülsen (ohne Mitglieder), aber nie die aktuelle Session
  const params = [];
  let classFilter = "";
  let protectFilter = "";
  if (classId != null) {
    params.push(classId);
    classFilter = ` AND gs.class_id = $${params.length}`;
  }
  if (protectSessionId) {
    params.push(protectSessionId);
    protectFilter = ` AND gs.id <> $${params.length}`;
  }
  await pool.query(
    `
    DELETE FROM group_sessions gs
    WHERE gs.status = 'setup'
      AND NOT EXISTS (
        SELECT 1 FROM group_session_members gsm WHERE gsm.session_id = gs.id
      )
      AND COALESCE(gs.created_at, gs.updated_at, NOW()) < NOW() - INTERVAL '10 minutes'
      ${classFilter}
      ${protectFilter}
  `,
    params
  );
}

export async function insertRoleGoals(pool, schoolId, roleId, goals = [], goalType = "WAS") {
  const type = String(goalType).toUpperCase() === "WIE" ? "WIE" : "WAS";
  const list = Array.isArray(goals) ? goals : [];
  for (let i = 0; i < list.length; i++) {
    const raw = list[i];
    const text = typeof raw === "string" ? raw : raw?.text;
    const trimmed = String(text || "").trim().slice(0, 500);
    if (!trimmed) continue;
    const sortOrder =
      typeof raw === "object" && raw?.sortOrder != null ? Number(raw.sortOrder) : i + 1;
    const active = typeof raw === "object" && raw?.active === false ? false : true;
    await pool.query(
      `
      INSERT INTO group_mode_role_goals
        (school_id, role_id, goal_type, text, sort_order, active)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
      [schoolId, roleId, type, trimmed, sortOrder || i + 1, active]
    );
  }
}

export async function ensureDefaultRolesForSettings(pool, schoolId, settingsId, roles = DEFAULT_PHYSICS_ROLES) {
  const existing = await pool.query(
    "SELECT COUNT(*)::int AS n FROM group_mode_roles WHERE settings_id = $1",
    [settingsId]
  );
  if (existing.rows[0].n > 0) {
    await backfillMissingRoleGoals(pool, schoolId, settingsId, roles);
    return;
  }

  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    const ins = await pool.query(
      `
      INSERT INTO group_mode_roles (school_id, settings_id, name, description, sort_order, active)
      VALUES ($1, $2, $3, $4, $5, TRUE)
      RETURNING id
    `,
      [schoolId, settingsId, role.name, role.description || "", i + 1]
    );
    const roleId = ins.rows[0].id;
    await insertRoleGoals(pool, schoolId, roleId, role.wasGoals || [], "WAS");
    await insertRoleGoals(pool, schoolId, roleId, role.howGoals || [], "WIE");
  }
}

/** Bestehende Rollen ohne Ziele: Defaults nach Namen nachziehen (nur wenn leer). */
export async function backfillMissingRoleGoals(pool, schoolId, settingsId, defaults = DEFAULT_PHYSICS_ROLES) {
  const rolesRes = await pool.query(
    `SELECT id, name FROM group_mode_roles WHERE settings_id = $1`,
    [settingsId]
  );
  const byName = new Map(
    (defaults || []).map((r) => [String(r.name || "").trim().toLowerCase(), r])
  );
  for (const row of rolesRes.rows) {
    const count = await pool.query(
      `SELECT COUNT(*)::int AS n FROM group_mode_role_goals WHERE role_id = $1`,
      [row.id]
    );
    if (count.rows[0].n > 0) continue;
    const def = byName.get(String(row.name || "").trim().toLowerCase());
    if (!def) continue;
    await insertRoleGoals(pool, schoolId, row.id, def.wasGoals || [], "WAS");
    await insertRoleGoals(pool, schoolId, row.id, def.howGoals || [], "WIE");
  }
}

export function normalizeImportText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function roleGoalDedupeKey({ subject, roleName, type, text }) {
  return [
    normalizeImportText(subject),
    normalizeImportText(roleName),
    String(type || "").toUpperCase() === "WIE" ? "WIE" : "WAS",
    normalizeImportText(text)
  ].join("|");
}

export function parseActiveFlag(value, fallback = true) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return fallback;
  if (["1", "ja", "yes", "true", "aktiv", "x"].includes(raw)) return true;
  if (["0", "nein", "no", "false", "inaktiv"].includes(raw)) return false;
  return null;
}

/**
 * CSV für Rollen/Rollenziele.
 * Mit Fach: Fach;Rolle;Rollenbeschreibung;Zielart;Zieltext;Reihenfolge;Aktiv
 * Ohne Fach (defaultSubject): Rolle;Rollenbeschreibung;Zielart;Zieltext;Reihenfolge;Aktiv
 */
export function parseRoleGoalsCsv(text, { defaultSubject = null } = {}) {
  const errors = [];
  const rows = [];
  const raw = String(text || "").replace(/^\uFEFF/, "");
  if (!raw.trim()) {
    return { ok: false, errors: [{ line: 0, message: "Datei ist leer." }], rows: [] };
  }
  if (raw.length > 800_000) {
    return {
      ok: false,
      errors: [{ line: 0, message: "Datei ist zu groß (max. ca. 800 KB)." }],
      rows: []
    };
  }

  const lines = raw.split(/\r?\n/);
  let start = 0;
  const firstCells = splitCsvLine(lines[0] || "");
  const headerJoined = firstCells.map((c) => normalizeImportText(c)).join(";");
  const hasHeader =
    headerJoined.includes("rolle") &&
    (headerJoined.includes("zielart") || headerJoined.includes("zieltext"));
  if (hasHeader) start = 1;

  const headerHasSubject = hasHeader && firstCells.some((c) => normalizeImportText(c) === "fach");

  for (let i = start; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i];
    if (!String(line || "").trim()) continue;
    const cells = splitCsvLine(line);
    if (cells.every((c) => !String(c || "").trim())) continue;

    let subject;
    let roleName;
    let roleDescription;
    let goalType;
    let goalText;
    let sortOrder;
    let activeRaw;

    if (headerHasSubject || (!defaultSubject && cells.length >= 5)) {
      [subject, roleName, roleDescription, goalType, goalText, sortOrder, activeRaw] = cells;
    } else {
      subject = defaultSubject;
      [roleName, roleDescription, goalType, goalText, sortOrder, activeRaw] = cells;
    }

    subject = String(subject || "").trim();
    roleName = String(roleName || "").trim().slice(0, 80);
    roleDescription = String(roleDescription || "").trim().slice(0, 300);
    goalText = String(goalText || "").trim().slice(0, 500);
    const typeNorm = String(goalType || "")
      .trim()
      .toUpperCase();
    const type = typeNorm === "WIE" || typeNorm === "WAS" ? typeNorm : null;
    let order = sortOrder == null || String(sortOrder).trim() === "" ? null : Number(sortOrder);
    if (order != null && (!Number.isFinite(order) || order < 0)) {
      errors.push({ line: lineNo, message: "Reihenfolge muss eine Zahl sein.", raw: line });
      order = null;
    }
    const active = parseActiveFlag(activeRaw, true);
    if (active == null) {
      errors.push({
        line: lineNo,
        message: "Aktiv-Wert unverständlich (ja/nein).",
        raw: line
      });
    }

    if (!subject) {
      errors.push({ line: lineNo, message: "Fach fehlt.", raw: line });
      continue;
    }
    if (!roleName) {
      errors.push({ line: lineNo, message: "Rollenname fehlt.", raw: line });
      continue;
    }
    if (!type) {
      errors.push({ line: lineNo, message: "Zielart muss WAS oder WIE sein.", raw: line });
      continue;
    }
    if (!goalText) {
      errors.push({ line: lineNo, message: "Zieltext fehlt.", raw: line });
      continue;
    }

    rows.push({
      line: lineNo,
      subject,
      roleName,
      roleDescription,
      type,
      text: goalText,
      sortOrder: order,
      active: active !== false,
      key: roleGoalDedupeKey({ subject, roleName, type, text: goalText })
    });
  }

  return { ok: errors.length === 0 || rows.length > 0, errors, rows };
}

function splitCsvLine(line) {
  const sep = String(line).includes(";") && !String(line).includes("\t") ? ";" : ",";
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === sep && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export const ROLE_GOALS_CSV_EXAMPLE = `Fach;Rolle;Rollenbeschreibung;Zielart;Zieltext;Reihenfolge;Aktiv
Physik;Versuch;Plant und führt Versuche sicher durch;WAS;Ich plane einen passenden Versuch.;1;ja
Physik;Versuch;Plant und führt Versuche sicher durch;WAS;Ich baue den Versuch sicher und richtig auf.;2;ja
Physik;Versuch;Plant und führt Versuche sicher durch;WIE;Ich beachte die Sicherheitsregeln.;1;ja
Physik;Versuch;Plant und führt Versuche sicher durch;WIE;Ich verändere immer nur eine Bedingung.;2;ja
Physik;Protokoll;Dokumentiert Aufbau und Beobachtungen;WAS;Ich halte den Versuchsaufbau und die Beobachtungen fest.;1;ja
Physik;Protokoll;Dokumentiert Aufbau und Beobachtungen;WIE;Ich notiere Messwerte mit den passenden Einheiten.;1;ja
Sport;Coaching;Unterstützt andere beim Verbessern;WAS;Ich beobachte die Bewegung eines Gruppenmitglieds.;1;ja
Sport;Coaching;Unterstützt andere beim Verbessern;WIE;Ich gebe eine konkrete und freundliche Rückmeldung.;1;ja
`;

/** Beispiel ohne Fach-Spalte (Fach ist in der UI schon gewählt). */
export function roleGoalsTextExampleForSubject(subject = "Physik") {
  const s = String(subject || "Physik").trim() || "Physik";
  if (normalizeImportText(s) === "sport") {
    return `Rolle;Rollenbeschreibung;Zielart;Zieltext;Reihenfolge;Aktiv
Aufbau;Bereitet Stationen vor;WAS;Ich baue die Übungsstation sicher auf.;1;ja
Aufbau;Bereitet Stationen vor;WIE;Ich prüfe den Aufbau vor dem Start.;1;ja
Coaching;Unterstützt andere beim Verbessern;WAS;Ich beobachte die Bewegung eines Gruppenmitglieds.;1;ja
Coaching;Unterstützt andere beim Verbessern;WIE;Ich gebe eine konkrete und freundliche Rückmeldung.;2;ja
`;
  }
  return `Rolle;Rollenbeschreibung;Zielart;Zieltext;Reihenfolge;Aktiv
Versuch;Plant und führt Versuche sicher durch;WAS;Ich plane einen passenden Versuch.;1;ja
Versuch;Plant und führt Versuche sicher durch;WAS;Ich bereite Material und Aufbau vor.;2;ja
Versuch;Plant und führt Versuche sicher durch;WAS;Ich baue den Versuch sicher und richtig auf.;3;ja
Versuch;Plant und führt Versuche sicher durch;WIE;Ich beachte die Sicherheitsregeln.;1;ja
Versuch;Plant und führt Versuche sicher durch;WIE;Ich verändere immer nur eine Bedingung.;2;ja
Protokoll;Dokumentiert Aufbau und Beobachtungen;WAS;Ich halte den Versuchsaufbau und die Beobachtungen fest.;1;ja
Protokoll;Dokumentiert Aufbau und Beobachtungen;WIE;Ich notiere Messwerte mit den passenden Einheiten.;1;ja
`;
}

export function displayNameFromUser(name) {
  const raw = String(name || "").trim();
  if (!raw) return "Schüler:in";
  const first = raw.split(".")[0] || raw;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

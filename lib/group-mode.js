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
    description: "Du bereitest Versuche vor und führst sie sicher durch."
  },
  {
    name: "Protokoll",
    description: "Du hältst Aufbau, Beobachtungen, Bilder und Ergebnisse fest."
  },
  {
    name: "Ergebnis",
    description: "Du erklärst die physikalischen Zusammenhänge."
  },
  {
    name: "Produkt",
    description: "Du planst, baust, prüfst und verbesserst das Produkt."
  }
];

export const DEFAULT_GROUP_HOW_GOALS = [
  "Ich führe einen Versuch durch.",
  "Ich beobachte genau.",
  "Ich halte meine Ergebnisse fest.",
  "Ich fertige eine Skizze an.",
  "Ich werte Messwerte aus.",
  "Ich recherchiere eine offene Frage.",
  "Ich erkläre den Zusammenhang mit eigenen Worten.",
  "Ich vergleiche verschiedene Lösungen.",
  "Ich entwickle und überprüfe ein Produkt.",
  "Ich erkläre mein Ergebnis der Gruppe.",
  "Ich lasse mir etwas von der Gruppe erklären."
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
    roles: roles.map(serializeRoleRow)
  };
}

export function serializeRoleRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    settingsId: row.settings_id,
    name: row.name,
    description: row.description || "",
    sortOrder: row.sort_order ?? 0,
    active: row.active !== false
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
}

export async function ensureDefaultRolesForSettings(pool, schoolId, settingsId, roles = DEFAULT_PHYSICS_ROLES) {
  const existing = await pool.query(
    "SELECT COUNT(*)::int AS n FROM group_mode_roles WHERE settings_id = $1",
    [settingsId]
  );
  if (existing.rows[0].n > 0) return;

  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    await pool.query(
      `
      INSERT INTO group_mode_roles (school_id, settings_id, name, description, sort_order, active)
      VALUES ($1, $2, $3, $4, $5, TRUE)
    `,
      [schoolId, settingsId, role.name, role.description || "", i + 1]
    );
  }
}

export function displayNameFromUser(name) {
  const raw = String(name || "").trim();
  if (!raw) return "Schüler:in";
  const first = raw.split(".")[0] || raw;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

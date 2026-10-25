/**
 * Coach-Kontext kommt aus der Datenbank, nicht aus dem Browser.
 * competenceId ist die UUID von level_check_goals.id und muss zur Klasse
 * und Schule des eingeloggten Schülers gehören.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LEVELS = {
  rookie: { key: "rookie", label: "Rookie", column: "rookie_goal_text" },
  operator: { key: "operator", label: "Operator", column: "operator_goal_text" },
  street_legend: {
    key: "street_legend",
    label: "Street Legend",
    column: "street_legend_goal_text"
  }
};

export function normalizeMarkStatus(found, raw) {
  if (!found) return "offen";
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (value === "offen" || value === "in_arbeit" || value === "sicher") return value;
  return "sicher";
}

export function normalizeLevel(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (value === "rookie") return LEVELS.rookie;
  if (value === "operator") return LEVELS.operator;
  if (value === "street_legend" || value === "streetlegend") return LEVELS.street_legend;
  return null;
}

function pick(body, keys) {
  const kontext = body?.kontext && typeof body.kontext === "object" ? body.kontext : {};
  for (const key of keys) {
    if (kontext[key] != null && String(kontext[key]).trim() !== "") return kontext[key];
    if (body?.[key] != null && String(body[key]).trim() !== "") return body[key];
  }
  return "";
}

export function readCoachBody(body) {
  const kontext = body?.kontext && typeof body.kontext === "object" ? body.kontext : {};
  return {
    sessionId: String(body?.sessionId || "").trim(),
    competenceId: String(pick(body, ["competenceId"]) || "").trim(),
    levelRaw: pick(body, ["level"]),
    tageszielId: String(
      pick(body, ["tagesziel-ID", "tageszielId", "tagesziel_id"]) || ""
    ).trim(),
    aufgabe: String(kontext.aufgabe ?? body?.aufgabe ?? ""),
    schuelerantwort: String(kontext.schuelerantwort ?? body?.schuelerantwort ?? ""),
    nachricht: String(body?.nachricht || "")
  };
}

async function loadOwnedGoal(pool, student, competenceId) {
  const res = await pool.query(
    `
    SELECT
      g.id,
      g.goal_text,
      g.rookie_goal_text,
      g.operator_goal_text,
      g.street_legend_goal_text,
      lc.subject,
      lc.name AS thema
    FROM level_check_goals g
    JOIN level_checks lc ON lc.id = g.level_check_id
    WHERE g.id = $1
      AND COALESCE(g.active, true) = true
      AND (
        (
          lc.catalog_id IS NULL
          AND lc.class_id = $2
          AND NOT EXISTS (
            SELECT 1 FROM class_level_plan_assignments a
            WHERE a.class_id = $2 AND a.subject = lc.subject
          )
        )
        OR (
          lc.catalog_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM class_level_plan_assignments a
            WHERE a.class_id = $2
              AND a.subject = lc.subject
              AND a.catalog_id = lc.catalog_id
          )
        )
      )
      AND (
        lc.school_id = $3
        OR EXISTS (
          SELECT 1 FROM classes c
          WHERE c.id = lc.class_id AND c.school_id = $3
        )
        OR EXISTS (
          SELECT 1 FROM level_plan_catalogs cat
          WHERE cat.id = lc.catalog_id AND cat.school_id = $3
        )
      )
  `,
    [competenceId, student.classId, student.schoolId]
  );
  return res.rows[0] || null;
}

async function loadOwnedDayGoal(pool, student, tageszielId) {
  if (!tageszielId) return { row: null };
  if (!UUID_RE.test(tageszielId)) {
    return { error: "Dieses Tagesziel gehört nicht zu dir." };
  }
  const res = await pool.query(
    `
    SELECT
      id, subject, goal, what_goal_id, what_goal_text, how_goal_text,
      selected_level, level_goal_text, school_id
    FROM log_entries
    WHERE id = $1 AND user_id = $2
  `,
    [tageszielId, student.id]
  );
  const row = res.rows[0];
  if (!row) return { error: "Dieses Tagesziel gehört nicht zu dir." };
  if (row.school_id != null && student.schoolId != null && Number(row.school_id) !== Number(student.schoolId)) {
    return { error: "Dieses Tagesziel gehört nicht zu dir." };
  }
  return { row };
}

function dayGoalText(row) {
  if (!row) return "";
  const parts = [row.what_goal_text, row.level_goal_text, row.how_goal_text, row.goal]
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  return [...new Set(parts)].join(" · ");
}

export async function loadCoachContext(pool, student, body) {
  const input = readCoachBody(body);
  if (!student?.classId || student.schoolId == null) {
    return { error: "Diese Kompetenzzeile wurde nicht gefunden.", status: 404 };
  }

  const day = await loadOwnedDayGoal(pool, student, input.tageszielId);
  if (day.error) return { error: day.error, status: 404 };
  if (day.row?.what_goal_id) {
    input.competenceId = String(day.row.what_goal_id);
  }
  if (day.row?.selected_level) {
    input.levelRaw = day.row.selected_level;
  }

  if (!UUID_RE.test(input.competenceId)) {
    return { error: "Diese Kompetenzzeile wurde nicht gefunden.", status: 404 };
  }
  const level = normalizeLevel(input.levelRaw);
  if (!level) {
    return {
      error: "Bitte ein Level wählen: Rookie, Operator oder Street Legend.",
      status: 400
    };
  }

  const goal = await loadOwnedGoal(pool, student, input.competenceId);
  if (!goal) {
    return { error: "Diese Kompetenzzeile wurde nicht gefunden.", status: 404 };
  }

  const mark = await pool.query(
    `
    SELECT status
    FROM level_check_marks
    WHERE goal_id = $1 AND user_id = $2 AND tier = $3
  `,
    [goal.id, student.id, level.key]
  );
  const markStatus = normalizeMarkStatus(mark.rows.length > 0, mark.rows[0]?.status);
  const levelText = String(goal[level.column] || goal.goal_text || "").trim();
  const levelbeschreibung = String(goal[level.column] || "").trim();
  return {
    input,
    level,
    goal,
    levelText,
    levelbeschreibung,
    markStatus,
    tageszielText: dayGoalText(day.row)
  };
}

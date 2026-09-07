/**
 * Gruppenmodus – API-Routen (Lehrer + Schüler, Ein-Gerät-Assistent).
 */
import {
  DEFAULT_GROUP_HOW_GOALS,
  DEFAULT_GROUP_SETTINGS,
  DEFAULT_PHYSICS_ROLES,
  allRolesCovered,
  clampGroupSize,
  displayNameFromUser,
  ensureDefaultRolesForSettings,
  memberGoalsComplete,
  repairGroupModeIntegrity,
  serializeRoleRow,
  serializeSettingsRow,
  sessionProgress,
  suggestRoleAssignment,
  toIsoDateOnly,
  validateMemberCount
} from "./group-mode.js";

function parseJsonBody(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeSubjectKey(subject) {
  return String(subject || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function subjectsMatch(a, b) {
  return normalizeSubjectKey(a) === normalizeSubjectKey(b);
}

export function registerGroupModeRoutes(app, deps) {
  const {
    pool,
    isAdmin,
    isStudent,
    getStudentClassContext,
    getLevelChecksForClass,
    LOG_SUBJECTS,
    todayIsoDate,
    LEVEL_CHECK_TIERS = ["rookie", "operator", "street_legend"],
    LEVEL_CHECK_TIER_LABELS = {
      rookie: "Rookie",
      operator: "Operator",
      street_legend: "Street Legend"
    }
  } = deps;

  function resolveSubject(raw) {
    const key = normalizeSubjectKey(raw);
    if (!key) return null;
    return LOG_SUBJECTS.find((s) => normalizeSubjectKey(s) === key) || null;
  }

  async function loadRoles(settingsId) {
    const r = await pool.query(
      `
      SELECT * FROM group_mode_roles
      WHERE settings_id = $1
      ORDER BY sort_order ASC, id ASC
    `,
      [settingsId]
    );
    return r.rows;
  }

  /** Einstellungen primär über Klasse+Fach (school_id nur zur Absicherung) */
  async function getSettingsRow(schoolId, classId, subject) {
    const resolved = resolveSubject(subject) || String(subject || "").trim();
    if (!classId || !resolved) return null;

    if (schoolId != null) {
      const r = await pool.query(
        `
        SELECT * FROM group_mode_settings
        WHERE class_id = $1
          AND school_id = $2
          AND lower(trim(subject)) = lower(trim($3))
        LIMIT 1
      `,
        [classId, schoolId, resolved]
      );
      if (r.rows[0]) return r.rows[0];
    }

    const fallback = await pool.query(
      `
      SELECT * FROM group_mode_settings
      WHERE class_id = $1
        AND lower(trim(subject)) = lower(trim($2))
      LIMIT 1
    `,
      [classId, resolved]
    );
    return fallback.rows[0] || null;
  }

  async function listEnabledSettings(schoolId, classId) {
    const r = await pool.query(
      `
      SELECT *
      FROM group_mode_settings
      WHERE class_id = $1
        AND enabled = TRUE
        AND ($2::int IS NULL OR school_id = $2 OR school_id IS NULL)
      ORDER BY subject ASC
    `,
      [classId, schoolId]
    );
    return r.rows;
  }

  async function getOrCreateSettings(schoolId, classId, subject) {
    const resolved = resolveSubject(subject) || String(subject || "").trim();
    let row = await getSettingsRow(schoolId, classId, resolved);
    if (row) {
      await ensureDefaultRolesForSettings(pool, schoolId || row.school_id, row.id);
      return row;
    }

    const ins = await pool.query(
      `
      INSERT INTO group_mode_settings (
        school_id, class_id, subject, enabled,
        min_members, max_members, allow_multi_roles, allow_role_switch,
        enable_shared_goal, enable_what_goals, max_what_goals,
        enable_how_goals, enable_mid_check, enable_reflection,
        allow_free_what_goal, allow_free_how_goal, how_goal_options
      )
      VALUES (
        $1, $2, $3, FALSE,
        $4, $5, TRUE, TRUE,
        TRUE, TRUE, 1,
        TRUE, TRUE, TRUE,
        FALSE, TRUE, $6::jsonb
      )
      ON CONFLICT (class_id, subject) DO UPDATE
        SET school_id = COALESCE(group_mode_settings.school_id, EXCLUDED.school_id),
            updated_at = NOW()
      RETURNING *
    `,
      [
        schoolId,
        classId,
        resolved,
        DEFAULT_GROUP_SETTINGS.minMembers,
        DEFAULT_GROUP_SETTINGS.maxMembers,
        JSON.stringify(DEFAULT_GROUP_HOW_GOALS)
      ]
    );
    row = ins.rows[0];
    const seedRoles =
      normalizeSubjectKey(resolved) === "physik"
        ? DEFAULT_PHYSICS_ROLES
        : DEFAULT_PHYSICS_ROLES;
    await ensureDefaultRolesForSettings(pool, schoolId || row.school_id, row.id, seedRoles);
    return row;
  }

  async function assertClassInSchool(classId, schoolId) {
    const r = await pool.query(
      "SELECT id, name FROM classes WHERE id = $1 AND school_id = $2",
      [classId, schoolId]
    );
    return r.rows[0] || null;
  }

  async function loadSessionBundle(sessionId, schoolId) {
    let sRes = await pool.query(
      `
      SELECT gs.*, c.name AS class_name
      FROM group_sessions gs
      JOIN classes c ON c.id = gs.class_id
      WHERE gs.id = $1 AND ($2::int IS NULL OR gs.school_id = $2)
      LIMIT 1
    `,
      [sessionId, schoolId]
    );
    if (!sRes.rows.length && schoolId != null) {
      sRes = await pool.query(
        `
        SELECT gs.*, c.name AS class_name
        FROM group_sessions gs
        JOIN classes c ON c.id = gs.class_id
        WHERE gs.id = $1
        LIMIT 1
      `,
        [sessionId]
      );
    }
    const session = sRes.rows[0];
    if (!session) return null;

    const membersRes = await pool.query(
      `
      SELECT * FROM group_session_members
      WHERE session_id = $1
      ORDER BY sort_order ASC, id ASC
    `,
      [sessionId]
    );

    const memberIds = membersRes.rows.map((m) => m.id);
    let rolesByMember = {};
    if (memberIds.length) {
      const rolesRes = await pool.query(
        `
        SELECT * FROM group_session_member_roles
        WHERE member_id = ANY($1::uuid[])
        ORDER BY id ASC
      `,
        [memberIds]
      );
      for (const row of rolesRes.rows) {
        const mid = String(row.member_id);
        if (!rolesByMember[mid]) rolesByMember[mid] = [];
        rolesByMember[mid].push({
          id: row.id,
          roleId: row.role_id,
          name: row.role_name_snapshot,
          description: row.role_description_snapshot || ""
        });
      }
    }

    const docsRes = await pool.query(
      `
      SELECT id, doc_type, content, created_by
      FROM group_session_docs
      WHERE session_id = $1
      ORDER BY id ASC
    `,
      [sessionId]
    );

    const settingsRow = await getSettingsRow(
      schoolId ?? session.school_id,
      session.class_id,
      session.subject
    );
    const roleDefs = settingsRow ? await loadRoles(settingsRow.id) : [];
    const settings = settingsRow
      ? serializeSettingsRow(settingsRow, roleDefs)
      : serializeSettingsRow(
          {
            ...DEFAULT_GROUP_SETTINGS,
            id: null,
            school_id: schoolId ?? session.school_id,
            class_id: session.class_id,
            subject: session.subject,
            enabled: true,
            min_members: 2,
            max_members: 4,
            allow_multi_roles: true,
            how_goal_options: DEFAULT_GROUP_HOW_GOALS
          },
          []
        );

    const members = membersRes.rows.map((m) => ({
      id: m.id,
      userId: m.user_id,
      displayName: m.display_name_snapshot,
      sortOrder: m.sort_order,
      whatGoalId: m.what_goal_id,
      whatGoalText: m.what_goal_text_snapshot,
      whatGoalArea: m.what_goal_area_snapshot,
      selectedLevel: m.selected_level,
      levelGoalText: m.level_goal_text_snapshot,
      howGoalText: m.how_goal_text,
      goalsConfirmedAt: m.goals_confirmed_at,
      midCheck: m.mid_check,
      midCheckAt: m.mid_check_at,
      reflection: m.reflection,
      reflectionAt: m.reflection_at,
      continueNextSession: m.continue_next_session,
      roles: rolesByMember[String(m.id)] || [],
      goalsComplete: memberGoalsComplete(m, settings)
    }));

    return {
      session: {
        id: session.id,
        schoolId: session.school_id,
        classId: session.class_id,
        className: session.class_name,
        subject: session.subject,
        sessionDate: toIsoDateOnly(session.session_date) || todayIsoDate(),
        timeslot: session.timeslot,
        topicId: session.topic_id,
        topicName: session.topic_name_snapshot,
        sharedGoal: session.shared_goal,
        groupName: session.group_name,
        status: session.status,
        setupStep: session.setup_step,
        hostUserId: session.host_user_id,
        startedAt: session.started_at,
        closedAt: session.closed_at,
        createdAt: session.created_at,
        updatedAt: session.updated_at
      },
      members,
      docs: docsRes.rows.map((d) => ({
        id: d.id,
        type: d.doc_type,
        content: d.content,
        createdBy: d.created_by,
        createdAt: d.created_at
      })),
      settings,
      progress: sessionProgress(membersRes.rows, settings)
    };
  }

  async function assertStudentCanAccessSession(studentId, sessionId) {
    const { classId, schoolId } = await getStudentClassContext(studentId);
    if (!classId || !schoolId) {
      return { ok: false, status: 403, error: "Keine Klasse zugeordnet." };
    }
    const bundle = await loadSessionBundle(sessionId, schoolId);
    if (!bundle || Number(bundle.session.classId) !== Number(classId)) {
      return { ok: false, status: 404, error: "Gruppe nicht gefunden." };
    }
    const uid = Number(studentId);
    const isMember = bundle.members.some((m) => Number(m.userId) === uid);
    const isHost = Number(bundle.session.hostUserId) === uid;
    // Setup: ganze Klasse darf sehen/löschen (Geistergruppen aufräumen)
    if (!isMember && !isHost && bundle.session.status !== "setup") {
      return { ok: false, status: 403, error: "Du gehörst nicht zu dieser Gruppe." };
    }
    return { ok: true, bundle, classId, schoolId, isHost, isMember };
  }

  /** Offene Sessions, die nicht geladen werden können, inkl. Mitglieder entfernen. */
  async function purgeUnlistableOpenSessions(classId, schoolId, protectSessionId = null) {
    if (!classId) return;
    const list = await pool.query(
      `
      SELECT id
      FROM group_sessions
      WHERE class_id = $1
        AND status <> 'closed'
        AND ($2::uuid IS NULL OR id <> $2::uuid)
    `,
      [classId, protectSessionId]
    );
    for (const row of list.rows) {
      let bundle = null;
      try {
        bundle = await loadSessionBundle(row.id, schoolId);
      } catch (err) {
        console.error("⚠️ unlistable session:", row.id, err);
        bundle = null;
      }
      if (!bundle) {
        try {
          await deleteSessionCascade(row.id);
        } catch (delErr) {
          console.error("⚠️ purge unlistable session:", row.id, delErr);
        }
      }
    }
  }

  /**
   * Alle Mitglieder einer Klasse aus offenen Gruppen freigeben,
   * deren Session nicht (mehr) als Gruppe gelistet werden kann –
   * und harte Freigabe: Mitglieder ohne gültige offene Session.
   */
  async function releaseOrphanMemberships(classId) {
    if (!classId) return;
    await pool.query(
      `
      DELETE FROM group_session_member_roles
      WHERE member_id IN (
        SELECT m.id
        FROM group_session_members m
        LEFT JOIN group_sessions gs ON gs.id = m.session_id
        WHERE gs.id IS NULL
           OR (gs.class_id = $1 AND gs.status = 'closed')
      )
    `,
      [classId]
    );
    await pool.query(
      `
      DELETE FROM group_session_members m
      USING group_sessions gs
      WHERE m.session_id = gs.id
        AND gs.class_id = $1
        AND gs.status = 'closed'
    `,
      [classId]
    );
    await pool.query(
      `
      DELETE FROM group_session_members m
      WHERE NOT EXISTS (
        SELECT 1 FROM group_sessions gs WHERE gs.id = m.session_id
      )
    `
    );
  }

  async function busyStudentIds(classId, schoolId, excludeSessionId = null, subject = null) {
    try {
      await repairGroupModeIntegrity(pool, {
        classId,
        protectSessionId: excludeSessionId,
        pruneEmptySetups: false
      });
      await releaseOrphanMemberships(classId);
      await purgeUnlistableOpenSessions(classId, schoolId, excludeSessionId);
    } catch (repairErr) {
      console.error("⚠️ group-mode repair:", repairErr);
    }

    const params = [classId];
    let subjectFilter = "";
    if (subject) {
      params.push(subject);
      subjectFilter = ` AND lower(trim(gs.subject)) = lower(trim($${params.length}))`;
    }
    let exclude = "";
    if (excludeSessionId) {
      params.push(excludeSessionId);
      exclude = ` AND gs.id <> $${params.length}`;
    }
    // Nur Mitglieder in wirklich offenen, existierenden Sessions
    const r = await pool.query(
      `
      SELECT gsm.user_id
      FROM group_session_members gsm
      JOIN group_sessions gs ON gs.id = gsm.session_id
      WHERE gs.class_id = $1
        AND gs.status <> 'closed'
        ${subjectFilter}
        ${exclude}
    `,
      params
    );
    return new Set(r.rows.map((row) => Number(row.user_id)));
  }

  /** Mitglieder, Docs und Session sicher entfernen (auch ohne DB-CASCADE). */
  async function deleteSessionCascade(sessionId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
        DELETE FROM group_session_member_roles
        WHERE member_id IN (
          SELECT id FROM group_session_members WHERE session_id = $1::uuid
        )
      `,
        [sessionId]
      );
      await client.query(
        "DELETE FROM group_session_members WHERE session_id = $1::uuid",
        [sessionId]
      );
      await client.query("DELETE FROM group_session_docs WHERE session_id = $1::uuid", [
        sessionId
      ]);
      await client.query(
        "DELETE FROM group_competency_activity WHERE session_id = $1::uuid",
        [sessionId]
      );
      const del = await client.query(
        "DELETE FROM group_sessions WHERE id = $1::uuid RETURNING id",
        [sessionId]
      );
      await client.query("COMMIT");
      // Absicherung falls etwas hängen blieb
      await pool.query(
        "DELETE FROM group_session_members WHERE session_id = $1::uuid",
        [sessionId]
      );
      return del.rowCount > 0;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {}
      throw err;
    } finally {
      client.release();
    }
  }

  async function findOpenSessionForStudent({
    classId,
    schoolId,
    studentId,
    subject,
    topicId = null
  }) {
    const params = [classId, studentId, subject];
    let schoolFilter = "";
    if (schoolId != null) {
      params.push(schoolId);
      schoolFilter = ` AND (gs.school_id = $${params.length} OR gs.school_id IS NULL)`;
    }
    let topicFilter = "";
    if (topicId) {
      params.push(topicId);
      topicFilter = ` AND gs.topic_id = $${params.length}`;
    }
    const r = await pool.query(
      `
      SELECT gs.id
      FROM group_sessions gs
      LEFT JOIN group_session_members gsm
        ON gsm.session_id = gs.id AND gsm.user_id = $2
      WHERE gs.class_id = $1
        AND gs.status <> 'closed'
        AND lower(trim(gs.subject)) = lower(trim($3))
        AND (gs.host_user_id = $2 OR gsm.user_id IS NOT NULL)
        ${schoolFilter}
        ${topicFilter}
      ORDER BY
        CASE WHEN gs.topic_id IS NOT NULL THEN 0 ELSE 1 END,
        gs.updated_at DESC NULLS LAST,
        gs.created_at DESC
      LIMIT 1
    `,
      params
    );
    return r.rows[0]?.id || null;
  }

  // -------------------------------------------------------
  // TEACHER: Settings
  // -------------------------------------------------------
  app.get("/api/teacher/group-mode/settings", isAdmin, async (req, res) => {
    try {
      const schoolId = req.session.user.school_id;
      const classId = Number(req.query.classId);
      const subject = resolveSubject(req.query.subject);
      if (!classId || !subject) {
        return res.status(400).json({ error: "Klasse und Fach angeben." });
      }
      const cls = await assertClassInSchool(classId, schoolId);
      if (!cls) return res.status(404).json({ error: "Klasse nicht gefunden." });

      const row = await getOrCreateSettings(schoolId, classId, subject);
      const roles = await loadRoles(row.id);
      res.json({
        settings: serializeSettingsRow(row, roles),
        subjects: LOG_SUBJECTS,
        className: cls.name
      });
    } catch (err) {
      console.error("❌ GET group-mode/settings:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.put("/api/teacher/group-mode/settings", isAdmin, async (req, res) => {
    try {
      const schoolId = req.session.user.school_id;
      const classId = Number(req.body.classId);
      const subject = resolveSubject(req.body.subject);
      if (!classId || !subject) {
        return res.status(400).json({ error: "Klasse und Fach angeben." });
      }
      const cls = await assertClassInSchool(classId, schoolId);
      if (!cls) return res.status(404).json({ error: "Klasse nicht gefunden." });

      const size = clampGroupSize(req.body.minMembers, req.body.maxMembers);
      let howOpts = Array.isArray(req.body.howGoalOptions)
        ? req.body.howGoalOptions.map((s) => String(s).trim()).filter(Boolean)
        : DEFAULT_GROUP_HOW_GOALS;
      if (!howOpts.length) howOpts = DEFAULT_GROUP_HOW_GOALS;

      const existing = await getOrCreateSettings(schoolId, classId, subject);
      const upd = await pool.query(
        `
        UPDATE group_mode_settings SET
          enabled = $1,
          min_members = $2,
          max_members = $3,
          allow_multi_roles = $4,
          allow_role_switch = $5,
          enable_shared_goal = $6,
          enable_what_goals = $7,
          max_what_goals = $8,
          enable_how_goals = $9,
          enable_mid_check = $10,
          enable_reflection = $11,
          allow_free_what_goal = $12,
          allow_free_how_goal = $13,
          how_goal_options = $14::jsonb,
          updated_at = NOW()
        WHERE id = $15
        RETURNING *
      `,
        [
          !!req.body.enabled,
          size.minMembers,
          size.maxMembers,
          req.body.allowMultiRoles !== false,
          req.body.allowRoleSwitch !== false,
          req.body.enableSharedGoal !== false,
          req.body.enableWhatGoals !== false,
          Math.max(1, Math.min(3, Number(req.body.maxWhatGoals) || 1)),
          req.body.enableHowGoals !== false,
          req.body.enableMidCheck !== false,
          req.body.enableReflection !== false,
          !!req.body.allowFreeWhatGoal,
          req.body.allowFreeHowGoal !== false,
          JSON.stringify(howOpts),
          existing.id
        ]
      );

      if (Array.isArray(req.body.roles)) {
        for (const role of req.body.roles) {
          if (role.id) {
            await pool.query(
              `
              UPDATE group_mode_roles
              SET name = COALESCE($1, name),
                  description = COALESCE($2, description),
                  sort_order = COALESCE($3, sort_order),
                  active = COALESCE($4, active)
              WHERE id = $5 AND settings_id = $6 AND school_id = $7
            `,
              [
                role.name != null ? String(role.name).trim().slice(0, 80) : null,
                role.description != null
                  ? String(role.description).trim().slice(0, 300)
                  : null,
                role.sortOrder != null ? Number(role.sortOrder) : null,
                role.active != null ? !!role.active : null,
                role.id,
                existing.id,
                schoolId
              ]
            );
          } else if (role.name) {
            await pool.query(
              `
              INSERT INTO group_mode_roles (school_id, settings_id, name, description, sort_order, active)
              VALUES ($1, $2, $3, $4, $5, $6)
            `,
              [
                schoolId,
                existing.id,
                String(role.name).trim().slice(0, 80),
                String(role.description || "").trim().slice(0, 300),
                Number(role.sortOrder) || 99,
                role.active !== false
              ]
            );
          }
        }
      }

      const roles = await loadRoles(existing.id);
      res.json({ success: true, settings: serializeSettingsRow(upd.rows[0], roles) });
    } catch (err) {
      console.error("❌ PUT group-mode/settings:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.post("/api/teacher/group-mode/roles", isAdmin, async (req, res) => {
    try {
      const schoolId = req.session.user.school_id;
      const settingsId = req.body.settingsId;
      const name = String(req.body.name || "").trim().slice(0, 80);
      if (!settingsId || !name) {
        return res.status(400).json({ error: "Name fehlt." });
      }
      const s = await pool.query(
        "SELECT id FROM group_mode_settings WHERE id = $1 AND school_id = $2",
        [settingsId, schoolId]
      );
      if (!s.rows.length) return res.status(404).json({ error: "Einstellungen nicht gefunden." });

      const orderRes = await pool.query(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM group_mode_roles WHERE settings_id = $1",
        [settingsId]
      );
      const ins = await pool.query(
        `
        INSERT INTO group_mode_roles (school_id, settings_id, name, description, sort_order, active)
        VALUES ($1, $2, $3, $4, $5, TRUE)
        RETURNING *
      `,
        [
          schoolId,
          settingsId,
          name,
          String(req.body.description || "").trim().slice(0, 300),
          orderRes.rows[0].n
        ]
      );
      res.json({ success: true, role: serializeRoleRow(ins.rows[0]) });
    } catch (err) {
      console.error("❌ POST group-mode/roles:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  // -------------------------------------------------------
  // TEACHER: Sessions overview
  // -------------------------------------------------------
  app.get("/api/teacher/group-sessions", isAdmin, async (req, res) => {
    try {
      const schoolId = req.session.user.school_id;
      const classId = Number(req.query.classId);
      const subject = String(req.query.subject || "").trim();
      const includeClosed = String(req.query.includeClosed || "") === "1";
      if (!classId) return res.status(400).json({ error: "classId fehlt" });

      const cls = await assertClassInSchool(classId, schoolId);
      if (!cls) return res.status(404).json({ error: "Klasse nicht gefunden." });

      const params = [schoolId, classId];
      let subjectFilter = "";
      if (subject) {
        params.push(subject);
        subjectFilter = ` AND lower(trim(gs.subject)) = lower(trim($${params.length}))`;
      }
      const statusFilter = includeClosed ? "" : ` AND gs.status <> 'closed'`;

      const list = await pool.query(
        `
        SELECT gs.id
        FROM group_sessions gs
        WHERE gs.class_id = $2
          AND (gs.school_id = $1 OR $1::int IS NULL)
          ${subjectFilter}
          ${statusFilter}
        ORDER BY
          CASE WHEN gs.status = 'closed' THEN 1 ELSE 0 END,
          gs.updated_at DESC NULLS LAST,
          gs.created_at DESC
      `,
        params
      );

      const sessions = [];
      for (const row of list.rows) {
        const bundle = await loadSessionBundle(row.id, schoolId);
        if (bundle) sessions.push(bundle);
      }

      res.json({
        classId,
        className: cls.name,
        subjects: LOG_SUBJECTS,
        sessions
      });
    } catch (err) {
      console.error("❌ GET group-sessions:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.get("/api/teacher/group-sessions/:id", isAdmin, async (req, res) => {
    try {
      const schoolId = req.session.user.school_id;
      const bundle = await loadSessionBundle(req.params.id, schoolId);
      if (!bundle) return res.status(404).json({ error: "Gruppe nicht gefunden." });
      res.json(bundle);
    } catch (err) {
      console.error("❌ GET group-sessions/:id:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.post("/api/teacher/group-sessions/:id/close", isAdmin, async (req, res) => {
    try {
      const schoolId = req.session.user.school_id;
      const force = !!req.body.force;
      const bundle = await loadSessionBundle(req.params.id, schoolId);
      if (!bundle) return res.status(404).json({ error: "Gruppe nicht gefunden." });

      if (!force && bundle.settings.enableReflection !== false && !bundle.progress.reflectComplete) {
        return res.json({
          success: false,
          message: "Noch nicht alle haben reflektiert. Du kannst die Stunde trotzdem beenden."
        });
      }

      await pool.query(
        `
        UPDATE group_sessions
        SET status = 'closed', closed_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND school_id = $2
      `,
        [req.params.id, schoolId]
      );

      await recordCompetencyActivity(bundle);

      const next = await loadSessionBundle(req.params.id, schoolId);
      res.json({ success: true, ...next });
    } catch (err) {
      console.error("❌ POST group-sessions close:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.post("/api/teacher/group-sessions/:id/reopen", isAdmin, async (req, res) => {
    try {
      const schoolId = req.session.user.school_id;
      const upd = await pool.query(
        `
        UPDATE group_sessions
        SET status = 'active', closed_at = NULL, updated_at = NOW()
        WHERE id = $1 AND school_id = $2
        RETURNING id
      `,
        [req.params.id, schoolId]
      );
      if (!upd.rows.length) return res.status(404).json({ error: "Gruppe nicht gefunden." });
      const bundle = await loadSessionBundle(req.params.id, schoolId);
      res.json({ success: true, ...bundle });
    } catch (err) {
      console.error("❌ POST group-sessions reopen:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.post("/api/teacher/group-sessions/:id/delete", isAdmin, async (req, res) => {
    try {
      const schoolId = req.session.user.school_id;
      const bundle = await loadSessionBundle(req.params.id, schoolId);
      if (!bundle) return res.status(404).json({ error: "Gruppe nicht gefunden." });

      await deleteSessionCascade(req.params.id);
      try {
        await releaseOrphanMemberships(bundle.session.classId);
      } catch (_) {}
      res.json({ success: true });
    } catch (err) {
      console.error("❌ POST teacher group-sessions delete:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  async function recordCompetencyActivity(bundle) {
    for (const m of bundle.members || []) {
      if (!m.whatGoalId && !m.whatGoalText) continue;
      const existing = await pool.query(
        `
        SELECT id FROM group_competency_activity
        WHERE session_id = $1 AND user_id = $2
        LIMIT 1
      `,
        [bundle.session.id, m.userId]
      );
      const selfAssessment = m.reflection?.goalReached || null;
      const rolesSnap = (m.roles || []).map((r) => r.name);
      if (existing.rows.length) {
        await pool.query(
          `
          UPDATE group_competency_activity SET
            goal_id = $1,
            goal_text_snapshot = $2,
            area_snapshot = $3,
            selected_level = $4,
            how_goal_text = $5,
            roles_snapshot = $6::jsonb,
            self_assessment = $7,
            continue_next_session = $8,
            recorded_at = NOW()
          WHERE id = $9
        `,
          [
            m.whatGoalId,
            m.whatGoalText,
            m.whatGoalArea,
            m.selectedLevel,
            m.howGoalText,
            JSON.stringify(rolesSnap),
            selfAssessment,
            m.continueNextSession,
            existing.rows[0].id
          ]
        );
      } else {
        await pool.query(
          `
          INSERT INTO group_competency_activity (
            school_id, user_id, session_id, class_id, subject,
            goal_id, goal_text_snapshot, area_snapshot, selected_level,
            how_goal_text, roles_snapshot, self_assessment, continue_next_session,
            teacher_confirmed
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13, FALSE)
        `,
          [
            bundle.session.schoolId,
            m.userId,
            bundle.session.id,
            bundle.session.classId,
            bundle.session.subject,
            m.whatGoalId,
            m.whatGoalText,
            m.whatGoalArea,
            m.selectedLevel,
            m.howGoalText,
            JSON.stringify(rolesSnap),
            selfAssessment,
            m.continueNextSession
          ]
        );
      }
    }
  }

  // -------------------------------------------------------
  // STUDENT: bootstrap / create / load
  // -------------------------------------------------------
  app.get("/api/student/group-mode/bootstrap", isStudent, async (req, res) => {
    try {
      const studentId = req.session.user.id;
      const { classId, schoolId, className } = await getStudentClassContext(studentId);
      if (!classId) {
        return res.json({ hasClass: false, enabledSubjects: [], activeSessions: [] });
      }

      const settingsRes = await listEnabledSettings(schoolId, classId);

      const enabledSubjects = [];
      for (const row of settingsRes) {
        const roles = await loadRoles(row.id);
        enabledSubjects.push(serializeSettingsRow(row, roles));
      }

      const date = toIsoDateOnly(req.query.date) || todayIsoDate();
      try {
        await repairGroupModeIntegrity(pool, { classId });
        await purgeUnlistableOpenSessions(classId, schoolId);
        await releaseOrphanMemberships(classId);
      } catch (repairErr) {
        console.error("⚠️ bootstrap repair:", repairErr);
      }

      // Alle offenen Gruppen der Klasse (nicht nur eigene) – sonst bleiben Geister unsichtbar
      const activeRes = await pool.query(
        `
        SELECT gs.id
        FROM group_sessions gs
        WHERE gs.class_id = $1
          AND gs.status <> 'closed'
        ORDER BY
          CASE WHEN gs.topic_id IS NOT NULL THEN 0 ELSE 1 END,
          gs.updated_at DESC NULLS LAST,
          gs.created_at DESC
      `,
        [classId]
      );

      const activeSessions = [];
      const listedIds = [];
      for (const row of activeRes.rows) {
        try {
          const bundle = await loadSessionBundle(row.id, schoolId);
          if (bundle) {
            listedIds.push(bundle.session.id);
            activeSessions.push({
              id: bundle.session.id,
              subject: bundle.session.subject,
              status: bundle.session.status,
              setupStep: bundle.session.setupStep,
              groupName: bundle.session.groupName,
              topicName: bundle.session.topicName,
              sharedGoal: bundle.session.sharedGoal,
              progress: bundle.progress,
              memberNames: (bundle.members || []).map((m) => m.displayName).filter(Boolean)
            });
          } else {
            await deleteSessionCascade(row.id);
          }
        } catch (sessionErr) {
          console.error("⚠️ bootstrap session skip/delete:", row.id, sessionErr);
          try {
            await deleteSessionCascade(row.id);
          } catch (_) {}
        }
      }

      // Mitglieder nur in listbaren offenen Gruppen behalten – Rest freigeben
      try {
        if (listedIds.length) {
          await pool.query(
            `
            DELETE FROM group_session_member_roles
            WHERE member_id IN (
              SELECT m.id
              FROM group_session_members m
              JOIN group_sessions gs ON gs.id = m.session_id
              WHERE gs.class_id = $1
                AND gs.status <> 'closed'
                AND NOT (gs.id = ANY($2::uuid[]))
            )
          `,
            [classId, listedIds]
          );
          await pool.query(
            `
            DELETE FROM group_session_members m
            USING group_sessions gs
            WHERE m.session_id = gs.id
              AND gs.class_id = $1
              AND gs.status <> 'closed'
              AND NOT (gs.id = ANY($2::uuid[]))
          `,
            [classId, listedIds]
          );
        } else {
          // Keine sichtbare Gruppe → alle offenen Zuordnungen der Klasse freigeben
          await pool.query(
            `
            DELETE FROM group_session_member_roles
            WHERE member_id IN (
              SELECT m.id
              FROM group_session_members m
              JOIN group_sessions gs ON gs.id = m.session_id
              WHERE gs.class_id = $1 AND gs.status <> 'closed'
            )
          `,
            [classId]
          );
          await pool.query(
            `
            DELETE FROM group_session_members m
            USING group_sessions gs
            WHERE m.session_id = gs.id
              AND gs.class_id = $1
              AND gs.status <> 'closed'
          `,
            [classId]
          );
          await pool.query(
            `
            DELETE FROM group_sessions
            WHERE class_id = $1 AND status <> 'closed'
          `,
            [classId]
          );
        }
      } catch (freeErr) {
        console.error("⚠️ bootstrap free members:", freeErr);
      }

      const studentsRes = await pool.query(
        `
        SELECT id, name
        FROM users
        WHERE role = 'student' AND class_id = $1
        ORDER BY name ASC
      `,
        [classId]
      );

      res.json({
        hasClass: true,
        classId,
        className,
        date,
        enabledSubjects,
        activeSessions,
        classmates: studentsRes.rows.map((u) => ({
          id: Number(u.id),
          name: u.name,
          displayName: displayNameFromUser(u.name),
          characterId: null
        })),
        subjects: LOG_SUBJECTS,
        levelOptions: LEVEL_CHECK_TIERS.map((tier) => ({
          value: tier,
          label: LEVEL_CHECK_TIER_LABELS[tier] || tier
        }))
      });
    } catch (err) {
      console.error("❌ group-mode bootstrap:", err);
      res.status(500).json({
        error: "Serverfehler",
        message: "Gruppenarbeit konnte nicht geladen werden."
      });
    }
  });

  app.get("/api/student/group-mode/topics", isStudent, async (req, res) => {
    try {
      const studentId = req.session.user.id;
      const subject = String(req.query.subject || "").trim();
      const { classId, schoolId } = await getStudentClassContext(studentId);
      if (!classId || !subject) {
        return res.status(400).json({ error: "Fach fehlt." });
      }
      const checks = await getLevelChecksForClass(classId, schoolId, studentId);
      const topics = checks
        .filter((c) => c.subject === subject)
        .map((c) => ({
          id: c.id,
          name: c.name,
          catalogName: c.catalogName || null,
          goals: (c.goals || []).map((g) => ({
            id: g.id,
            text: g.text,
            rookieGoalText: g.rookieGoalText,
            operatorGoalText: g.operatorGoalText,
            streetLegendGoalText: g.streetLegendGoalText
          }))
        }));
      res.json({ subject, topics });
    } catch (err) {
      console.error("❌ group-mode topics:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.post("/api/student/group-sessions", isStudent, async (req, res) => {
    try {
      const studentId = req.session.user.id;
      const { classId, schoolId } = await getStudentClassContext(studentId);
      const subject = resolveSubject(req.body.subject);
      const topicId = req.body.topicId || null;
      const date = toIsoDateOnly(req.body.date) || todayIsoDate();

      if (!classId) {
        return res.json({ success: false, message: "Du bist keiner Klasse zugeordnet." });
      }
      if (!schoolId) {
        return res.json({
          success: false,
          message: "Schulzuordnung fehlt. Bitte melde dich neu an oder frag deine Lehrkraft."
        });
      }
      if (!subject) {
        return res.json({ success: false, message: "Bitte ein Fach wählen." });
      }

      const settingsRow = await getSettingsRow(schoolId, classId, subject);
      if (!settingsRow?.enabled) {
        return res.json({
          success: false,
          message: "Der Gruppenmodus ist für dieses Fach noch nicht freigeschaltet."
        });
      }

      // Themengebunden: offene Gruppe fortsetzen statt neue Session
      let existingId = null;
      try {
        existingId = await findOpenSessionForStudent({
          classId,
          schoolId,
          studentId,
          subject,
          topicId
        });
      } catch (findErr) {
        console.error("⚠️ findOpenSessionForStudent:", findErr);
      }
      if (existingId) {
        try {
          const existing = await loadSessionBundle(existingId, schoolId);
          if (existing) {
            return res.json({ success: true, resumed: true, ...existing });
          }
        } catch (resumeErr) {
          console.error("⚠️ resume open session failed, recreating:", existingId, resumeErr);
        }
        try {
          await deleteSessionCascade(existingId);
        } catch (delErr) {
          console.error("⚠️ cleanup broken session:", existingId, delErr);
        }
      }

      let topicName = null;
      if (topicId) {
        const checks = await getLevelChecksForClass(classId, schoolId, studentId);
        const topic = checks.find((c) => String(c.id) === String(topicId));
        if (!topic || !subjectsMatch(topic.subject, subject)) {
          return res.json({ success: false, message: "Thema nicht gefunden." });
        }
        if (!(topic.goals || []).length && settingsRow.enable_what_goals && !settingsRow.allow_free_what_goal) {
          return res.json({
            success: false,
            message:
              "Für dieses Thema gibt es noch kein Kompetenzraster. Bitte wählt ein anderes Thema oder fragt eure Lehrkraft."
          });
        }
        topicName = topic.name;
      }

      const ins = await pool.query(
        `
        INSERT INTO group_sessions (
          school_id, class_id, subject, session_date, timeslot,
          topic_id, topic_name_snapshot, group_name, status, setup_step,
          host_user_id, created_by
        )
        VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,'setup','members',$9,$9)
        RETURNING id
      `,
        [
          schoolId,
          classId,
          subject,
          date,
          req.body.timeslot || null,
          topicId || null,
          topicName,
          req.body.groupName || null,
          studentId
        ]
      );

      let bundle;
      try {
        bundle = await loadSessionBundle(ins.rows[0].id, schoolId);
      } catch (loadErr) {
        console.error("⚠️ load new session:", loadErr);
        bundle = null;
      }
      if (!bundle) {
        return res.status(500).json({
          error: "Serverfehler",
          message: "Gruppe wurde angelegt, konnte aber nicht geladen werden."
        });
      }
      res.json({ success: true, ...bundle });
    } catch (err) {
      console.error("❌ POST group-sessions:", err);
      res.status(500).json({
        error: "Serverfehler",
        message: err?.message
          ? `Die Gruppenarbeit konnte nicht gestartet werden (${err.message}).`
          : "Die Gruppenarbeit konnte nicht gestartet werden. Bitte versuche es noch einmal."
      });
    }
  });

  app.get("/api/student/group-sessions/:id", isStudent, async (req, res) => {
    try {
      const access = await assertStudentCanAccessSession(req.session.user.id, req.params.id);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      let busy = new Set();
      try {
        busy = await busyStudentIds(
          access.classId,
          access.schoolId,
          access.bundle.session.id,
          access.bundle.session.subject
        );
      } catch (busyErr) {
        console.error("⚠️ busyStudentIds:", busyErr);
      }

      const studentsRes = await pool.query(
        `
        SELECT id, name
        FROM users
        WHERE role = 'student' AND class_id = $1
        ORDER BY name ASC
      `,
        [access.classId]
      );

      let topics = [];
      try {
        if (access.bundle.session.subject) {
          const checks = await getLevelChecksForClass(
            access.classId,
            access.schoolId,
            req.session.user.id
          );
          topics = checks
            .filter((c) => subjectsMatch(c.subject, access.bundle.session.subject))
            .map((c) => ({
              id: c.id,
              name: c.name,
              goals: (c.goals || []).map((g) => ({
                id: g.id,
                text: g.text,
                rookieGoalText: g.rookieGoalText,
                operatorGoalText: g.operatorGoalText,
                streetLegendGoalText: g.streetLegendGoalText
              }))
            }));
        }
      } catch (topicErr) {
        console.error("⚠️ group-session topics:", topicErr);
        topics = [];
      }

      const roleDefs = (access.bundle.settings?.roles || []).filter(
        (r) => r && r.active !== false
      );
      res.json({
        ...access.bundle,
        classmates: studentsRes.rows.map((u) => ({
          id: Number(u.id),
          name: u.name,
          displayName: displayNameFromUser(u.name),
          characterId: null,
          busyInOtherGroup: busy.has(Number(u.id))
        })),
        topics,
        suggestedAssignments: suggestRoleAssignment(
          access.bundle.members.map((m) => m.userId),
          roleDefs
        ),
        levelOptions: LEVEL_CHECK_TIERS.map((tier) => ({
          value: tier,
          label: LEVEL_CHECK_TIER_LABELS[tier] || tier
        }))
      });
    } catch (err) {
      console.error("❌ GET student group-sessions:", err);
      res.status(500).json({
        error: "Serverfehler",
        message: "Die Gruppe konnte nicht geladen werden."
      });
    }
  });

  async function requireEditableSession(studentId, sessionId) {
    const access = await assertStudentCanAccessSession(studentId, sessionId);
    if (!access.ok) return access;
    if (access.bundle.session.status === "closed") {
      return {
        ok: false,
        status: 403,
        error: "Diese Laborarbeit ist bereits abgeschlossen."
      };
    }
    return access;
  }

  app.patch("/api/student/group-sessions/:id/members", isStudent, async (req, res) => {
    try {
      const access = await requireEditableSession(req.session.user.id, req.params.id);
      if (!access.ok) return res.status(access.status).json({ error: access.error });
      if (access.bundle.session.status !== "setup") {
        return res.json({ success: false, message: "Mitglieder können jetzt nicht mehr geändert werden." });
      }

      const memberIds = Array.isArray(req.body.memberIds)
        ? [...new Set(req.body.memberIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))]
        : [];
      const check = validateMemberCount(memberIds.length, access.bundle.settings);
      if (!check.ok) return res.json({ success: false, message: check.message });

      const busy = await busyStudentIds(
        access.classId,
        access.schoolId,
        access.bundle.session.id,
        access.bundle.session.subject
      );

      const roster = await pool.query(
        `
        SELECT id, name FROM users
        WHERE role = 'student'
          AND class_id = $1
          AND id = ANY($2::int[])
      `,
        [access.classId, memberIds]
      );
      if (roster.rows.length !== memberIds.length) {
        return res.json({
          success: false,
          message: "Einige Personen gehören nicht zu eurer Klasse."
        });
      }

      const rosterById = new Map(roster.rows.map((r) => [Number(r.id), r]));
      for (const id of memberIds) {
        const row = rosterById.get(Number(id));
        if (!row) {
          return res.json({
            success: false,
            message: "Einige Personen gehören nicht zu eurer Klasse."
          });
        }
        if (busy.has(Number(row.id))) {
          return res.json({
            success: false,
            message: `${displayNameFromUser(row.name)} ist schon in einer anderen Gruppe. Bitte die alte Gruppe unter „Weiterarbeiten“ löschen.`
          });
        }
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `
          DELETE FROM group_session_member_roles
          WHERE member_id IN (
            SELECT id FROM group_session_members WHERE session_id = $1
          )
        `,
          [access.bundle.session.id]
        );
        await client.query("DELETE FROM group_session_members WHERE session_id = $1", [
          access.bundle.session.id
        ]);

        let order = 1;
        for (const id of memberIds) {
          const user = rosterById.get(Number(id));
          await client.query(
            `
            INSERT INTO group_session_members (session_id, user_id, display_name_snapshot, sort_order)
            VALUES ($1, $2, $3, $4)
          `,
            [access.bundle.session.id, Number(id), displayNameFromUser(user.name), order++]
          );
        }

        await client.query(
          `
          UPDATE group_sessions
          SET setup_step = 'roles', host_user_id = $2, updated_at = NOW()
          WHERE id = $1
        `,
          [access.bundle.session.id, req.session.user.id]
        );
        await client.query("COMMIT");
      } catch (txErr) {
        try {
          await client.query("ROLLBACK");
        } catch (_) {}
        throw txErr;
      } finally {
        client.release();
      }

      const bundle = await loadSessionBundle(access.bundle.session.id, access.schoolId);
      if (!bundle) {
        return res.status(500).json({
          error: "Serverfehler",
          message: "Mitglieder gespeichert, Gruppe konnte aber nicht neu geladen werden."
        });
      }
      const roles = (bundle.settings?.roles || []).filter((r) => r && r.active !== false);
      res.json({
        success: true,
        ...bundle,
        suggestedAssignments: suggestRoleAssignment(memberIds, roles)
      });
    } catch (err) {
      console.error("❌ PATCH members:", err);
      res.status(500).json({
        error: "Serverfehler",
        message: err?.message
          ? `Die Gruppenmitglieder konnten nicht gespeichert werden (${err.message}).`
          : "Die Gruppenmitglieder konnten nicht gespeichert werden."
      });
    }
  });

  async function deleteGroupSessionForStudent(req, res) {
    try {
      const studentId = req.session.user.id;
      const { classId } = await getStudentClassContext(studentId);
      const access = await assertStudentCanAccessSession(studentId, req.params.id);

      // Setup-Geister: jede:r aus der Klasse darf löschen
      if (!access.ok) {
        const orphan = await pool.query(
          `
          SELECT id, class_id, status FROM group_sessions WHERE id = $1 LIMIT 1
        `,
          [req.params.id]
        );
        const row = orphan.rows[0];
        if (
          row &&
          Number(row.class_id) === Number(classId) &&
          row.status === "setup"
        ) {
          await deleteSessionCascade(req.params.id);
          try {
            await releaseOrphanMemberships(classId);
          } catch (_) {}
          return res.json({ success: true });
        }
        return res.status(access.status).json({ error: access.error });
      }

      const isHost = Number(access.bundle.session.hostUserId) === Number(studentId);
      const isMember = access.bundle.members.some(
        (m) => Number(m.userId) === Number(studentId)
      );
      const isSetup = access.bundle.session.status === "setup";
      if (!isHost && !isMember && !isSetup) {
        return res.status(403).json({ error: "Nur die Gruppe kann diese Arbeit löschen." });
      }

      await deleteSessionCascade(req.params.id);
      try {
        await releaseOrphanMemberships(access.classId || classId);
        await repairGroupModeIntegrity(pool, {
          classId: access.classId || classId,
          pruneEmptySetups: true
        });
      } catch (_) {}
      res.json({ success: true });
    } catch (err) {
      console.error("❌ DELETE group-sessions:", err);
      res.status(500).json({
        error: "Serverfehler",
        message: "Die Gruppe konnte nicht gelöscht werden."
      });
    }
  }

  app.delete("/api/student/group-sessions/:id", isStudent, deleteGroupSessionForStudent);
  app.post("/api/student/group-sessions/:id/delete", isStudent, deleteGroupSessionForStudent);

  app.patch("/api/student/group-sessions/:id/roles", isStudent, async (req, res) => {
    try {
      const access = await requireEditableSession(req.session.user.id, req.params.id);
      if (!access.ok) return res.status(access.status).json({ error: access.error });
      if (access.bundle.session.status !== "setup") {
        return res.json({ success: false, message: "Rollen sind schon festgelegt." });
      }

      const assignments = Array.isArray(req.body.assignments) ? req.body.assignments : [];
      const roles = (access.bundle.settings?.roles || []).filter((r) => r && r.active !== false);
      const cover = allRolesCovered(assignments, roles, access.bundle.settings.allowMultiRoles);
      if (!cover.ok) return res.json({ success: false, message: cover.message });

      const memberByUser = new Map(access.bundle.members.map((m) => [String(m.userId), m]));
      for (const a of assignments) {
        if (!memberByUser.has(String(a.userId))) {
          return res.json({ success: false, message: "Rollen nur an Gruppenmitglieder vergeben." });
        }
      }

      for (const m of access.bundle.members) {
        await pool.query("DELETE FROM group_session_member_roles WHERE member_id = $1", [m.id]);
      }

      for (const a of assignments) {
        const member = memberByUser.get(String(a.userId));
        const role = roles.find((r) => String(r.id) === String(a.roleId));
        if (!member || !role) continue;
        await pool.query(
          `
          INSERT INTO group_session_member_roles (
            member_id, role_id, role_name_snapshot, role_description_snapshot
          ) VALUES ($1, $2, $3, $4)
        `,
          [member.id, role.id, role.name, role.description || ""]
        );
      }

      const nextStep = access.bundle.settings.enableSharedGoal ? "shared_goal" : "personal_goals";
      await pool.query(
        `UPDATE group_sessions SET setup_step = $2, updated_at = NOW() WHERE id = $1`,
        [access.bundle.session.id, nextStep]
      );

      const bundle = await loadSessionBundle(access.bundle.session.id, access.schoolId);
      res.json({ success: true, ...bundle });
    } catch (err) {
      console.error("❌ PATCH roles:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.patch("/api/student/group-sessions/:id/shared-goal", isStudent, async (req, res) => {
    try {
      const access = await requireEditableSession(req.session.user.id, req.params.id);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const sharedGoal = String(req.body.sharedGoal || "").trim().slice(0, 400);
      if (access.bundle.settings.enableSharedGoal && !sharedGoal) {
        return res.json({ success: false, message: "Schreibt kurz, woran ihr gemeinsam arbeitet." });
      }

      await pool.query(
        `
        UPDATE group_sessions
        SET shared_goal = $2, setup_step = 'personal_goals', updated_at = NOW()
        WHERE id = $1
      `,
        [access.bundle.session.id, sharedGoal || null]
      );

      const bundle = await loadSessionBundle(access.bundle.session.id, access.schoolId);
      res.json({ success: true, ...bundle });
    } catch (err) {
      console.error("❌ PATCH shared-goal:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.patch("/api/student/group-sessions/:id/topic", isStudent, async (req, res) => {
    try {
      const access = await requireEditableSession(req.session.user.id, req.params.id);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const topicId = req.body.topicId;
      const checks = await getLevelChecksForClass(
        access.classId,
        access.schoolId,
        req.session.user.id
      );
      const topic = checks.find((c) => String(c.id) === String(topicId));
      if (!topic || topic.subject !== access.bundle.session.subject) {
        return res.json({ success: false, message: "Thema nicht gefunden." });
      }
      if (
        !(topic.goals || []).length &&
        access.bundle.settings.enableWhatGoals &&
        !access.bundle.settings.allowFreeWhatGoal
      ) {
        return res.json({
          success: false,
          message:
            "Für dieses Thema gibt es kein Kompetenzraster. Bitte wählt ein anderes Thema."
        });
      }

      await pool.query(
        `
        UPDATE group_sessions
        SET topic_id = $2, topic_name_snapshot = $3, updated_at = NOW()
        WHERE id = $1
      `,
        [access.bundle.session.id, topic.id, topic.name]
      );

      const bundle = await loadSessionBundle(access.bundle.session.id, access.schoolId);
      res.json({ success: true, ...bundle });
    } catch (err) {
      console.error("❌ PATCH topic:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.put("/api/student/group-sessions/:id/member-goals", isStudent, async (req, res) => {
    try {
      const access = await requireEditableSession(req.session.user.id, req.params.id);
      if (!access.ok) return res.status(access.status).json({ error: access.error });
      if (!["setup", "active"].includes(access.bundle.session.status)) {
        return res.json({ success: false, message: "Ziele können jetzt nicht geändert werden." });
      }

      const userId = Number(req.body.userId);
      const member = access.bundle.members.find((m) => m.userId === userId);
      if (!member) {
        return res.json({ success: false, message: "Person nicht in der Gruppe." });
      }

      const settings = access.bundle.settings;
      let whatGoalId = req.body.whatGoalId || null;
      let whatGoalText = String(req.body.whatGoalText || "").trim().slice(0, 500);
      let whatGoalArea = access.bundle.session.topicName || null;
      let selectedLevel = req.body.selectedLevel || null;
      let levelGoalText = null;
      let howGoalText = String(req.body.howGoalText || "").trim().slice(0, 500);

      if (settings.enableWhatGoals) {
        if (whatGoalId) {
          const checks = await getLevelChecksForClass(
            access.classId,
            access.schoolId,
            req.session.user.id
          );
          let found = null;
          for (const topic of checks) {
            if (
              access.bundle.session.topicId &&
              String(topic.id) !== String(access.bundle.session.topicId)
            ) {
              continue;
            }
            const goal = (topic.goals || []).find((g) => String(g.id) === String(whatGoalId));
            if (goal) {
              found = { goal, topic };
              break;
            }
          }
          if (!found) {
            return res.json({
              success: false,
              message: "Bitte wähle ein Ziel aus dem Kompetenzraster."
            });
          }
          whatGoalText = found.goal.text;
          whatGoalArea = found.topic.name;
          if (selectedLevel && LEVEL_CHECK_TIERS.includes(selectedLevel)) {
            if (selectedLevel === "rookie") levelGoalText = found.goal.rookieGoalText;
            else if (selectedLevel === "operator") levelGoalText = found.goal.operatorGoalText;
            else levelGoalText = found.goal.streetLegendGoalText;
          } else {
            selectedLevel = null;
          }
        } else if (settings.allowFreeWhatGoal && whatGoalText) {
          whatGoalId = null;
        } else {
          return res.json({
            success: false,
            message: "Bitte wähle, was du heute können möchtest."
          });
        }
      }

      if (settings.enableHowGoals && !howGoalText) {
        return res.json({
          success: false,
          message: "Bitte wähle, wie du daran arbeiten möchtest."
        });
      }

      if (
        settings.enableHowGoals &&
        !settings.allowFreeHowGoal &&
        !(settings.howGoalOptions || []).includes(howGoalText)
      ) {
        return res.json({
          success: false,
          message: "Bitte wähle eines der vorbereiteten Wie-Ziele."
        });
      }

      await pool.query(
        `
        UPDATE group_session_members SET
          what_goal_id = $2,
          what_goal_text_snapshot = $3,
          what_goal_area_snapshot = $4,
          selected_level = $5,
          level_goal_text_snapshot = $6,
          how_goal_text = $7,
          goals_confirmed_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `,
        [
          member.id,
          whatGoalId,
          whatGoalText || null,
          whatGoalArea,
          selectedLevel,
          levelGoalText,
          howGoalText || null
        ]
      );

      const bundle = await loadSessionBundle(access.bundle.session.id, access.schoolId);
      if (bundle.progress.goalsComplete) {
        await pool.query(
          `UPDATE group_sessions SET setup_step = 'overview', updated_at = NOW() WHERE id = $1`,
          [access.bundle.session.id]
        );
      }
      const next = await loadSessionBundle(access.bundle.session.id, access.schoolId);
      res.json({ success: true, ...next });
    } catch (err) {
      console.error("❌ PUT member-goals:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.post("/api/student/group-sessions/:id/start", isStudent, async (req, res) => {
    try {
      const access = await requireEditableSession(req.session.user.id, req.params.id);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      if (
        access.bundle.settings.enableWhatGoals &&
        !access.bundle.settings.allowFreeWhatGoal &&
        !access.bundle.session.topicId
      ) {
        return res.json({
          success: false,
          message: "Bitte wählt zuerst ein Thema mit Kompetenzraster."
        });
      }

      if (!access.bundle.progress.goalsComplete && access.bundle.settings.enableWhatGoals) {
        return res.json({
          success: false,
          message: "Noch nicht alle haben ihre Ziele festgelegt."
        });
      }

      await pool.query(
        `
        UPDATE group_sessions
        SET status = 'active', setup_step = 'done', started_at = COALESCE(started_at, NOW()),
            updated_at = NOW()
        WHERE id = $1
      `,
        [access.bundle.session.id]
      );

      const bundle = await loadSessionBundle(access.bundle.session.id, access.schoolId);
      res.json({ success: true, ...bundle });
    } catch (err) {
      console.error("❌ POST start:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.put("/api/student/group-sessions/:id/mid-check", isStudent, async (req, res) => {
    try {
      const access = await requireEditableSession(req.session.user.id, req.params.id);
      if (!access.ok) return res.status(access.status).json({ error: access.error });
      if (!access.bundle.settings.enableMidCheck) {
        return res.json({ success: false, message: "Zwischencheck ist ausgeschaltet." });
      }

      const userId = Number(req.body.userId);
      const member = access.bundle.members.find((m) => m.userId === userId);
      if (!member) return res.json({ success: false, message: "Person nicht in der Gruppe." });

      const payload = {
        onTrack: String(req.body.onTrack || "").trim(),
        progress: String(req.body.progress || "").trim(),
        changeNeeded: String(req.body.changeNeeded || "").trim(),
        changeFocus: String(req.body.changeFocus || "").trim() || null,
        note: String(req.body.note || "").trim().slice(0, 400) || null
      };

      if (!payload.onTrack || !payload.progress || !payload.changeNeeded) {
        return res.json({ success: false, message: "Bitte beantworte die kurzen Fragen." });
      }

      await pool.query(
        `
        UPDATE group_session_members
        SET mid_check = $2::jsonb, mid_check_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `,
        [member.id, JSON.stringify(payload)]
      );

      await pool.query(
        `UPDATE group_sessions SET status = 'midcheck', updated_at = NOW() WHERE id = $1 AND status = 'active'`,
        [access.bundle.session.id]
      );

      const bundle = await loadSessionBundle(access.bundle.session.id, access.schoolId);
      if (bundle.progress.midComplete) {
        await pool.query(
          `UPDATE group_sessions SET status = 'active', updated_at = NOW() WHERE id = $1`,
          [access.bundle.session.id]
        );
      }
      const next = await loadSessionBundle(access.bundle.session.id, access.schoolId);
      res.json({ success: true, ...next });
    } catch (err) {
      console.error("❌ PUT mid-check:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.put("/api/student/group-sessions/:id/reflection", isStudent, async (req, res) => {
    try {
      const access = await requireEditableSession(req.session.user.id, req.params.id);
      if (!access.ok) return res.status(access.status).json({ error: access.error });
      if (!access.bundle.settings.enableReflection) {
        return res.json({ success: false, message: "Abschlussreflexion ist ausgeschaltet." });
      }

      const userId = Number(req.body.userId);
      const member = access.bundle.members.find((m) => m.userId === userId);
      if (!member) return res.json({ success: false, message: "Person nicht in der Gruppe." });

      const payload = {
        goalReached: String(req.body.goalReached || "").trim(),
        evidence: String(req.body.evidence || "").trim().slice(0, 400),
        helped: String(req.body.helped || "").trim().slice(0, 200),
        nextImprove: String(req.body.nextImprove || "").trim().slice(0, 400),
        explainedToGroup: String(req.body.explainedToGroup || "").trim().slice(0, 400) || null,
        learnedFromGroup: String(req.body.learnedFromGroup || "").trim().slice(0, 400) || null
      };
      const continueNext = String(req.body.continueNextSession || "").trim();

      if (!payload.goalReached || !payload.evidence || !payload.helped) {
        return res.json({ success: false, message: "Bitte beantworte die wichtigsten Fragen." });
      }

      await pool.query(
        `
        UPDATE group_session_members
        SET reflection = $2::jsonb,
            reflection_at = NOW(),
            continue_next_session = $3,
            updated_at = NOW()
        WHERE id = $1
      `,
        [member.id, JSON.stringify(payload), continueNext || null]
      );

      await pool.query(
        `UPDATE group_sessions SET status = 'reflecting', updated_at = NOW() WHERE id = $1 AND status IN ('active','midcheck')`,
        [access.bundle.session.id]
      );

      let bundle = await loadSessionBundle(access.bundle.session.id, access.schoolId);
      if (bundle.progress.reflectComplete) {
        await pool.query(
          `
          UPDATE group_sessions
          SET status = 'closed', closed_at = NOW(), updated_at = NOW()
          WHERE id = $1
        `,
          [access.bundle.session.id]
        );
        bundle = await loadSessionBundle(access.bundle.session.id, access.schoolId);
        await recordCompetencyActivity(bundle);
        bundle = await loadSessionBundle(access.bundle.session.id, access.schoolId);
      }

      res.json({ success: true, ...bundle });
    } catch (err) {
      console.error("❌ PUT reflection:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.post("/api/student/group-sessions/:id/docs", isStudent, async (req, res) => {
    try {
      const access = await requireEditableSession(req.session.user.id, req.params.id);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const content = String(req.body.content || "").trim().slice(0, 2000);
      if (!content) {
        return res.json({ success: false, message: "Schreib kurz euer Ergebnis." });
      }

      await pool.query(
        `
        INSERT INTO group_session_docs (session_id, school_id, doc_type, content, created_by)
        VALUES ($1, $2, $3, $4, $5)
      `,
        [
          access.bundle.session.id,
          access.schoolId,
          String(req.body.docType || "note").slice(0, 40),
          content,
          req.session.user.id
        ]
      );

      const bundle = await loadSessionBundle(access.bundle.session.id, access.schoolId);
      res.json({ success: true, ...bundle });
    } catch (err) {
      console.error("❌ POST docs:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.get("/api/student/group-competency-activity", isStudent, async (req, res) => {
    try {
      const studentId = req.session.user.id;
      const r = await pool.query(
        `
        SELECT *
        FROM group_competency_activity
        WHERE user_id = $1
        ORDER BY recorded_at DESC
        LIMIT 30
      `,
        [studentId]
      );
      res.json({
        items: r.rows.map((row) => ({
          id: row.id,
          sessionId: row.session_id,
          subject: row.subject,
          goalId: row.goal_id,
          goalText: row.goal_text_snapshot,
          area: row.area_snapshot,
          selectedLevel: row.selected_level,
          howGoalText: row.how_goal_text,
          roles: parseJsonBody(row.roles_snapshot, []),
          selfAssessment: row.self_assessment,
          continueNextSession: row.continue_next_session,
          teacherConfirmed: !!row.teacher_confirmed,
          recordedAt: row.recorded_at
        }))
      });
    } catch (err) {
      console.error("❌ group competency activity:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });
}

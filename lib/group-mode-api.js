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
  joinGoalTexts,
  memberGoalsComplete,
  normalizeGoalList,
  normalizeImportText,
  parseRoleGoalsCsv,
  repairGroupModeIntegrity,
  roleGoalDedupeKey,
  roleGoalsTextExampleForSubject,
  serializeRoleGoalRow,
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
    if (!r.rows.length) return [];
    const ids = r.rows.map((row) => row.id);
    const goalsRes = await pool.query(
      `
      SELECT * FROM group_mode_role_goals
      WHERE role_id = ANY($1::uuid[])
      ORDER BY sort_order ASC, id ASC
    `,
      [ids]
    );
    const byRole = {};
    for (const g of goalsRes.rows) {
      const key = String(g.role_id);
      if (!byRole[key]) byRole[key] = [];
      byRole[key].push(g);
    }
    return r.rows.map((row) => ({
      ...row,
      goals: byRole[String(row.id)] || []
    }));
  }

  async function findRoleGoalForMember(member, goalId, goalType, settingsRoles) {
    if (!goalId) return null;
    const type = String(goalType).toUpperCase() === "WIE" ? "WIE" : "WAS";
    const assignedIds = new Set(
      (member.roles || []).map((r) => String(r.roleId)).filter(Boolean)
    );
    for (const role of settingsRoles || []) {
      if (!assignedIds.has(String(role.id))) continue;
      const list = type === "WIE" ? role.howGoals || [] : role.wasGoals || [];
      const found = list.find((g) => String(g.id) === String(goalId));
      if (found && found.active !== false) {
        return { goal: found, role };
      }
    }
    return null;
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
      const seedRoles =
        normalizeSubjectKey(row.subject) === "physik" ? DEFAULT_PHYSICS_ROLES : [];
      await ensureDefaultRolesForSettings(pool, schoolId || row.school_id, row.id, seedRoles);
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
      normalizeSubjectKey(resolved) === "physik" ? DEFAULT_PHYSICS_ROLES : [];
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

  async function loadTopicsForSubject(classId, schoolId, subject, studentId = null) {
    if (!classId || !subject) return [];
    try {
      const checks = await getLevelChecksForClass(classId, schoolId, studentId);
      return checks
        .filter((c) => subjectsMatch(c.subject, subject))
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
    } catch (err) {
      console.error("⚠️ loadTopicsForSubject:", err);
      return [];
    }
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

    const members = membersRes.rows.map((m) => {
      let whatGoals = normalizeGoalList(m.what_goals_json);
      let howGoals = normalizeGoalList(m.how_goals_json);
      if (!whatGoals.length && m.what_goal_text_snapshot) {
        whatGoals = [
          {
            id: m.what_goal_id || null,
            text: m.what_goal_text_snapshot,
            roleName: m.what_goal_area_snapshot || null
          }
        ];
      }
      if (!howGoals.length && m.how_goal_text) {
        howGoals = [{ id: m.how_goal_id || null, text: m.how_goal_text }];
      }
      const whatGoalText = joinGoalTexts(whatGoals) || m.what_goal_text_snapshot || "";
      const howGoalText = joinGoalTexts(howGoals) || m.how_goal_text || "";
      return {
        id: m.id,
        userId: m.user_id,
        displayName: m.display_name_snapshot,
        sortOrder: m.sort_order,
        whatGoalId: whatGoals[0]?.id || m.what_goal_id,
        whatGoalText,
        whatGoalArea: m.what_goal_area_snapshot,
        whatGoals,
        selectedLevel: m.selected_level,
        levelGoalText: m.level_goal_text_snapshot,
        howGoalId: howGoals[0]?.id || m.how_goal_id || null,
        howGoalText,
        howGoals,
        goalsConfirmedAt: m.goals_confirmed_at,
        midCheck: m.mid_check,
        midCheckAt: m.mid_check_at,
        reflection: m.reflection,
        reflectionAt: m.reflection_at,
        continueNextSession: m.continue_next_session,
        roles: rolesByMember[String(m.id)] || [],
        goalsComplete: memberGoalsComplete(
          { ...m, whatGoals, howGoals, what_goals_json: whatGoals, how_goals_json: howGoals },
          settings
        )
      };
    });

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
      progress: sessionProgress(membersRes.rows, settings),
      topics: await loadTopicsForSubject(
        session.class_id,
        schoolId ?? session.school_id,
        session.subject,
        null
      )
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

      const maxWhat = Math.max(1, Math.min(3, Number(req.body.maxWhatGoals) || 3));
      const maxHow = Math.max(1, Math.min(3, Number(req.body.maxHowGoals) || 3));

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
          max_how_goals = $16,
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
          maxWhat,
          req.body.enableHowGoals !== false,
          req.body.enableMidCheck !== false,
          req.body.enableReflection !== false,
          !!req.body.allowFreeWhatGoal,
          req.body.allowFreeHowGoal !== false,
          JSON.stringify(howOpts),
          existing.id,
          maxHow
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
      res.json({ success: true, role: serializeRoleRow(ins.rows[0], []) });
    } catch (err) {
      console.error("❌ POST group-mode/roles:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.put("/api/teacher/group-mode/roles/:id", isAdmin, async (req, res) => {
    try {
      const schoolId = req.session.user.school_id;
      const roleId = req.params.id;
      const existing = await pool.query(
        "SELECT * FROM group_mode_roles WHERE id = $1 AND school_id = $2",
        [roleId, schoolId]
      );
      if (!existing.rows.length) return res.status(404).json({ error: "Rolle nicht gefunden." });

      const name =
        req.body.name != null
          ? String(req.body.name).trim().slice(0, 80)
          : existing.rows[0].name;
      if (!name) return res.status(400).json({ error: "Name fehlt." });

      const upd = await pool.query(
        `
        UPDATE group_mode_roles SET
          name = $2,
          description = COALESCE($3, description),
          icon_key = COALESCE($4, icon_key),
          sort_order = COALESCE($5, sort_order),
          active = COALESCE($6, active)
        WHERE id = $1 AND school_id = $7
        RETURNING *
      `,
        [
          roleId,
          name,
          req.body.description != null
            ? String(req.body.description).trim().slice(0, 300)
            : null,
          req.body.iconKey != null ? String(req.body.iconKey).trim().slice(0, 40) : null,
          req.body.sortOrder != null ? Number(req.body.sortOrder) : null,
          req.body.active != null ? !!req.body.active : null,
          schoolId
        ]
      );
      const roles = await loadRoles(upd.rows[0].settings_id);
      const role = roles.find((r) => String(r.id) === String(roleId));
      res.json({ success: true, role: serializeRoleRow(role || upd.rows[0], role?.goals) });
    } catch (err) {
      console.error("❌ PUT group-mode/roles:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.post("/api/teacher/group-mode/roles/:id/duplicate", isAdmin, async (req, res) => {
    try {
      const schoolId = req.session.user.school_id;
      const src = await pool.query(
        "SELECT * FROM group_mode_roles WHERE id = $1 AND school_id = $2",
        [req.params.id, schoolId]
      );
      if (!src.rows.length) return res.status(404).json({ error: "Rolle nicht gefunden." });
      const row = src.rows[0];
      const orderRes = await pool.query(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM group_mode_roles WHERE settings_id = $1",
        [row.settings_id]
      );
      const ins = await pool.query(
        `
        INSERT INTO group_mode_roles
          (school_id, settings_id, name, description, icon_key, sort_order, active)
        VALUES ($1, $2, $3, $4, $5, $6, TRUE)
        RETURNING *
      `,
        [
          schoolId,
          row.settings_id,
          `${row.name} (Kopie)`.slice(0, 80),
          row.description || "",
          row.icon_key || null,
          orderRes.rows[0].n
        ]
      );
      const goals = await pool.query(
        `SELECT * FROM group_mode_role_goals WHERE role_id = $1 ORDER BY sort_order, id`,
        [row.id]
      );
      for (const g of goals.rows) {
        await pool.query(
          `
          INSERT INTO group_mode_role_goals
            (school_id, role_id, goal_type, text, sort_order, active, level, explanation)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
          [
            schoolId,
            ins.rows[0].id,
            g.goal_type,
            g.text,
            g.sort_order,
            g.active !== false,
            g.level,
            g.explanation
          ]
        );
      }
      const roles = await loadRoles(row.settings_id);
      const role = roles.find((r) => String(r.id) === String(ins.rows[0].id));
      res.json({ success: true, role: serializeRoleRow(role, role?.goals) });
    } catch (err) {
      console.error("❌ POST duplicate role:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.delete("/api/teacher/group-mode/roles/:id", isAdmin, async (req, res) => {
    try {
      const schoolId = req.session.user.school_id;
      const roleId = req.params.id;
      const existing = await pool.query(
        "SELECT * FROM group_mode_roles WHERE id = $1 AND school_id = $2",
        [roleId, schoolId]
      );
      if (!existing.rows.length) return res.status(404).json({ error: "Rolle nicht gefunden." });

      const used = await pool.query(
        `
        SELECT COUNT(*)::int AS n
        FROM group_session_member_roles
        WHERE role_id = $1
      `,
        [roleId]
      );
      if (used.rows[0].n > 0) {
        await pool.query(
          `UPDATE group_mode_roles SET active = FALSE WHERE id = $1 AND school_id = $2`,
          [roleId, schoolId]
        );
        return res.json({
          success: true,
          deactivated: true,
          message: "Rolle wurde bereits verwendet und daher nur deaktiviert."
        });
      }
      await pool.query(`DELETE FROM group_mode_roles WHERE id = $1 AND school_id = $2`, [
        roleId,
        schoolId
      ]);
      res.json({ success: true, deleted: true });
    } catch (err) {
      console.error("❌ DELETE role:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.post("/api/teacher/group-mode/role-goals", isAdmin, async (req, res) => {
    try {
      const schoolId = req.session.user.school_id;
      const roleId = req.body.roleId;
      const type = String(req.body.type || "").toUpperCase() === "WIE" ? "WIE" : "WAS";
      const text = String(req.body.text || "").trim().slice(0, 500);
      if (!roleId || !text) return res.status(400).json({ error: "Rolle und Zieltext nötig." });

      const role = await pool.query(
        "SELECT id, settings_id FROM group_mode_roles WHERE id = $1 AND school_id = $2",
        [roleId, schoolId]
      );
      if (!role.rows.length) return res.status(404).json({ error: "Rolle nicht gefunden." });

      const orderRes = await pool.query(
        `
        SELECT COALESCE(MAX(sort_order), 0) + 1 AS n
        FROM group_mode_role_goals
        WHERE role_id = $1 AND goal_type = $2
      `,
        [roleId, type]
      );
      const ins = await pool.query(
        `
        INSERT INTO group_mode_role_goals
          (school_id, role_id, goal_type, text, sort_order, active, level, explanation)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `,
        [
          schoolId,
          roleId,
          type,
          text,
          req.body.sortOrder != null ? Number(req.body.sortOrder) : orderRes.rows[0].n,
          req.body.active !== false,
          req.body.level ? String(req.body.level).slice(0, 40) : null,
          req.body.explanation ? String(req.body.explanation).trim().slice(0, 400) : null
        ]
      );
      res.json({ success: true, goal: serializeRoleGoalRow(ins.rows[0]) });
    } catch (err) {
      console.error("❌ POST role-goals:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.put("/api/teacher/group-mode/role-goals/:id", isAdmin, async (req, res) => {
    try {
      const schoolId = req.session.user.school_id;
      const existing = await pool.query(
        "SELECT * FROM group_mode_role_goals WHERE id = $1 AND school_id = $2",
        [req.params.id, schoolId]
      );
      if (!existing.rows.length) return res.status(404).json({ error: "Ziel nicht gefunden." });

      const type =
        req.body.type != null
          ? String(req.body.type).toUpperCase() === "WIE"
            ? "WIE"
            : "WAS"
          : existing.rows[0].goal_type;

      const upd = await pool.query(
        `
        UPDATE group_mode_role_goals SET
          goal_type = $2,
          text = COALESCE($3, text),
          sort_order = COALESCE($4, sort_order),
          active = COALESCE($5, active),
          level = COALESCE($6, level),
          explanation = COALESCE($7, explanation),
          updated_at = NOW()
        WHERE id = $1 AND school_id = $8
        RETURNING *
      `,
        [
          req.params.id,
          type,
          req.body.text != null ? String(req.body.text).trim().slice(0, 500) : null,
          req.body.sortOrder != null ? Number(req.body.sortOrder) : null,
          req.body.active != null ? !!req.body.active : null,
          req.body.level !== undefined
            ? req.body.level
              ? String(req.body.level).slice(0, 40)
              : null
            : existing.rows[0].level,
          req.body.explanation !== undefined
            ? String(req.body.explanation || "").trim().slice(0, 400)
            : existing.rows[0].explanation,
          schoolId
        ]
      );
      res.json({ success: true, goal: serializeRoleGoalRow(upd.rows[0]) });
    } catch (err) {
      console.error("❌ PUT role-goals:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.delete("/api/teacher/group-mode/role-goals/:id", isAdmin, async (req, res) => {
    try {
      const schoolId = req.session.user.school_id;
      const existing = await pool.query(
        "SELECT * FROM group_mode_role_goals WHERE id = $1 AND school_id = $2",
        [req.params.id, schoolId]
      );
      if (!existing.rows.length) return res.status(404).json({ error: "Ziel nicht gefunden." });

      const used = await pool.query(
        `
        SELECT COUNT(*)::int AS n FROM group_session_members
        WHERE what_goal_id = $1 OR how_goal_id = $1
      `,
        [req.params.id]
      );
      if (used.rows[0].n > 0) {
        await pool.query(
          `UPDATE group_mode_role_goals SET active = FALSE, updated_at = NOW() WHERE id = $1`,
          [req.params.id]
        );
        return res.json({
          success: true,
          deactivated: true,
          message: "Ziel wurde bereits verwendet und daher nur deaktiviert."
        });
      }
      await pool.query(`DELETE FROM group_mode_role_goals WHERE id = $1 AND school_id = $2`, [
        req.params.id,
        schoolId
      ]);
      res.json({ success: true, deleted: true });
    } catch (err) {
      console.error("❌ DELETE role-goals:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.post("/api/teacher/group-mode/role-goals/:id/copy", isAdmin, async (req, res) => {
    try {
      const schoolId = req.session.user.school_id;
      const targetRoleId = req.body.targetRoleId;
      const src = await pool.query(
        "SELECT * FROM group_mode_role_goals WHERE id = $1 AND school_id = $2",
        [req.params.id, schoolId]
      );
      if (!src.rows.length) return res.status(404).json({ error: "Ziel nicht gefunden." });
      const target = await pool.query(
        "SELECT id FROM group_mode_roles WHERE id = $1 AND school_id = $2",
        [targetRoleId, schoolId]
      );
      if (!target.rows.length) return res.status(404).json({ error: "Zielrolle nicht gefunden." });

      const g = src.rows[0];
      const orderRes = await pool.query(
        `
        SELECT COALESCE(MAX(sort_order), 0) + 1 AS n
        FROM group_mode_role_goals WHERE role_id = $1 AND goal_type = $2
      `,
        [targetRoleId, g.goal_type]
      );
      const ins = await pool.query(
        `
        INSERT INTO group_mode_role_goals
          (school_id, role_id, goal_type, text, sort_order, active, level, explanation)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `,
        [
          schoolId,
          targetRoleId,
          g.goal_type,
          g.text,
          orderRes.rows[0].n,
          g.active !== false,
          g.level,
          g.explanation
        ]
      );
      res.json({ success: true, goal: serializeRoleGoalRow(ins.rows[0]) });
    } catch (err) {
      console.error("❌ COPY role-goal:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.get("/api/teacher/group-mode/roles-import/example.txt", isAdmin, async (req, res) => {
    const subject =
      resolveSubject(req.query.subject) || String(req.query.subject || "Physik").trim() || "Physik";
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="rollen-rollenziele-${subject.toLowerCase()}.txt"`
    );
    res.send("\uFEFF" + roleGoalsTextExampleForSubject(subject));
  });

  app.post("/api/teacher/group-mode/roles-import/preview", isAdmin, async (req, res) => {
    try {
      const schoolId = req.session.user.school_id;
      const classId = Number(req.body.classId);
      const subject = resolveSubject(req.body.subject) || String(req.body.subject || "").trim();
      const csvText = String(req.body.text || req.body.csvText || "");
      if (!classId || !subject) {
        return res.status(400).json({ error: "Klasse und Fach wählen." });
      }
      const cls = await assertClassInSchool(classId, schoolId);
      if (!cls) return res.status(404).json({ error: "Klasse nicht gefunden." });

      const parsed = parseRoleGoalsCsv(csvText, { defaultSubject: subject });
      const settings = await getOrCreateSettings(schoolId, classId, subject);
      const existingRoles = await loadRoles(settings.id);
      const existingKeys = new Set();
      for (const role of existingRoles) {
        for (const g of role.goals || []) {
          existingKeys.add(
            roleGoalDedupeKey({
              subject,
              roleName: role.name,
              type: g.goal_type || serializeRoleGoalRow(g)?.type,
              text: g.text
            })
          );
        }
      }

      const roleNames = new Map();
      let wasCount = 0;
      let howCount = 0;
      let duplicateCount = 0;
      const previewRows = [];
      const seenInFile = new Set();

      for (const row of parsed.rows) {
        if (!subjectsMatch(row.subject, subject)) {
          parsed.errors.push({
            line: row.line,
            message: `Zeile gehört zu „${row.subject}“, Import-Fach ist „${subject}“.`,
            raw: row.text
          });
          continue;
        }
        if (!roleNames.has(row.roleName)) {
          roleNames.set(row.roleName, {
            name: row.roleName,
            description: row.roleDescription,
            was: 0,
            how: 0,
            exists: existingRoles.some(
              (r) => normalizeImportText(r.name) === normalizeImportText(row.roleName)
            )
          });
        }
        const info = roleNames.get(row.roleName);
        if (row.type === "WAS") {
          info.was += 1;
          wasCount += 1;
        } else {
          info.how += 1;
          howCount += 1;
        }
        const dupExisting = existingKeys.has(row.key);
        const dupFile = seenInFile.has(row.key);
        seenInFile.add(row.key);
        if (dupExisting || dupFile) duplicateCount += 1;
        previewRows.push({
          ...row,
          duplicateExisting: dupExisting,
          duplicateInFile: dupFile
        });
      }

      res.json({
        success: true,
        preview: {
          subject,
          roles: [...roleNames.values()],
          wasCount,
          howCount,
          duplicateCount,
          newGoalCount: previewRows.filter((r) => !r.duplicateExisting && !r.duplicateInFile)
            .length,
          rows: previewRows.slice(0, 200),
          errors: parsed.errors,
          defaultMode: "add_new"
        }
      });
    } catch (err) {
      console.error("❌ import preview:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  app.post("/api/teacher/group-mode/roles-import/confirm", isAdmin, async (req, res) => {
    try {
      const schoolId = req.session.user.school_id;
      const classId = Number(req.body.classId);
      const subject = resolveSubject(req.body.subject) || String(req.body.subject || "").trim();
      const csvText = String(req.body.text || req.body.csvText || "");
      const mode = String(req.body.mode || "add_new");
      // add_new | merge | update
      if (!["add_new", "merge", "update"].includes(mode)) {
        return res.status(400).json({ error: "Ungültige Import-Option." });
      }
      if (!classId || !subject) {
        return res.status(400).json({ error: "Klasse und Fach wählen." });
      }
      const cls = await assertClassInSchool(classId, schoolId);
      if (!cls) return res.status(404).json({ error: "Klasse nicht gefunden." });

      const parsed = parseRoleGoalsCsv(csvText, { defaultSubject: subject });
      const settings = await getOrCreateSettings(schoolId, classId, subject);

      let rolesImported = 0;
      let wasImported = 0;
      let howImported = 0;
      let skippedDuplicates = 0;
      const lineErrors = [...parsed.errors];

      const roleCache = new Map();
      async function getOrCreateRole(name, description) {
        const key = normalizeImportText(name);
        if (roleCache.has(key)) return roleCache.get(key);
        const roles = await loadRoles(settings.id);
        let found = roles.find((r) => normalizeImportText(r.name) === key);
        if (!found) {
          const orderRes = await pool.query(
            "SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM group_mode_roles WHERE settings_id = $1",
            [settings.id]
          );
          const ins = await pool.query(
            `
            INSERT INTO group_mode_roles
              (school_id, settings_id, name, description, sort_order, active)
            VALUES ($1, $2, $3, $4, $5, TRUE)
            RETURNING *
          `,
            [schoolId, settings.id, name, description || "", orderRes.rows[0].n]
          );
          found = { ...ins.rows[0], goals: [] };
          rolesImported += 1;
        } else if (mode === "update" && description) {
          await pool.query(
            `UPDATE group_mode_roles SET description = $2 WHERE id = $1`,
            [found.id, description]
          );
        }
        roleCache.set(key, found);
        return found;
      }

      const seen = new Set();
      for (const row of parsed.rows) {
        if (!subjectsMatch(row.subject, subject)) {
          lineErrors.push({
            line: row.line,
            message: `Falsches Fach „${row.subject}“.`
          });
          continue;
        }
        if (seen.has(row.key)) {
          skippedDuplicates += 1;
          continue;
        }
        seen.add(row.key);

        const role = await getOrCreateRole(row.roleName, row.roleDescription);
        const existingGoal = (role.goals || []).find(
          (g) =>
            roleGoalDedupeKey({
              subject,
              roleName: role.name,
              type: g.goal_type,
              text: g.text
            }) === row.key
        );

        if (existingGoal) {
          if (mode === "add_new" || mode === "merge") {
            skippedDuplicates += 1;
            continue;
          }
          if (mode === "update") {
            await pool.query(
              `
              UPDATE group_mode_role_goals SET
                text = $2,
                sort_order = COALESCE($3, sort_order),
                active = $4,
                updated_at = NOW()
              WHERE id = $1 AND school_id = $5
            `,
              [
                existingGoal.id,
                row.text,
                row.sortOrder,
                row.active !== false,
                schoolId
              ]
            );
            if (row.type === "WAS") wasImported += 1;
            else howImported += 1;
            continue;
          }
        }

        const orderRes = await pool.query(
          `
          SELECT COALESCE(MAX(sort_order), 0) + 1 AS n
          FROM group_mode_role_goals WHERE role_id = $1 AND goal_type = $2
        `,
          [role.id, row.type]
        );
        await pool.query(
          `
          INSERT INTO group_mode_role_goals
            (school_id, role_id, goal_type, text, sort_order, active)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
          [
            schoolId,
            role.id,
            row.type,
            row.text,
            row.sortOrder != null ? row.sortOrder : orderRes.rows[0].n,
            row.active !== false
          ]
        );
        if (!role.goals) role.goals = [];
        role.goals.push({
          id: "new",
          role_id: role.id,
          goal_type: row.type,
          text: row.text
        });
        if (row.type === "WAS") wasImported += 1;
        else howImported += 1;
      }

      const roles = await loadRoles(settings.id);
      res.json({
        success: true,
        summary: {
          rolesImported,
          wasImported,
          howImported,
          skippedDuplicates,
          errorCount: lineErrors.length,
          errors: lineErrors.slice(0, 50)
        },
        settings: serializeSettingsRow(settings, roles)
      });
    } catch (err) {
      console.error("❌ import confirm:", err);
      res.status(500).json({ error: "Serverfehler" });
    }
  });

  // legacy sample link
  app.get("/api/teacher/group-mode/role-goals/sample.csv", isAdmin, (req, res) => {
    const q = req.query.subject ? `?subject=${encodeURIComponent(req.query.subject)}` : "";
    res.redirect(302, `/api/teacher/group-mode/roles-import/example.txt${q}`);
  });

  app.post("/api/teacher/group-mode/roles/copy-from-subject", isAdmin, async (req, res) => {
    try {
      const schoolId = req.session.user.school_id;
      const classId = Number(req.body.classId);
      const sourceSubject =
        resolveSubject(req.body.sourceSubject) || String(req.body.sourceSubject || "").trim();
      const targetSubject =
        resolveSubject(req.body.targetSubject) || String(req.body.targetSubject || "").trim();
      const roleIds = Array.isArray(req.body.roleIds) ? req.body.roleIds.map(String) : null;
      const includeWas = req.body.includeWas !== false;
      const includeHow = req.body.includeHow !== false;

      if (!classId || !sourceSubject || !targetSubject) {
        return res.status(400).json({ error: "Klasse, Quell- und Zielfach nötig." });
      }
      if (subjectsMatch(sourceSubject, targetSubject)) {
        return res.status(400).json({ error: "Quell- und Zielfach müssen unterschiedlich sein." });
      }
      const cls = await assertClassInSchool(classId, schoolId);
      if (!cls) return res.status(404).json({ error: "Klasse nicht gefunden." });

      const source = await getOrCreateSettings(schoolId, classId, sourceSubject);
      const target = await getOrCreateSettings(schoolId, classId, targetSubject);
      const sourceRoles = await loadRoles(source.id);
      const targetRoles = await loadRoles(target.id);
      const targetByName = new Map(
        targetRoles.map((r) => [normalizeImportText(r.name), r])
      );

      let rolesCopied = 0;
      let goalsCopied = 0;
      const warnings = [];

      for (const role of sourceRoles) {
        if (roleIds && !roleIds.includes(String(role.id))) continue;
        if (role.active === false) continue;

        let targetRole = targetByName.get(normalizeImportText(role.name));
        if (targetRole) {
          warnings.push(`Rolle „${role.name}“ existiert bereits im Zielfach – Ziele werden ergänzt.`);
        } else {
          const orderRes = await pool.query(
            "SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM group_mode_roles WHERE settings_id = $1",
            [target.id]
          );
          const ins = await pool.query(
            `
            INSERT INTO group_mode_roles
              (school_id, settings_id, name, description, icon_key, sort_order, active)
            VALUES ($1, $2, $3, $4, $5, $6, TRUE)
            RETURNING *
          `,
            [
              schoolId,
              target.id,
              role.name,
              role.description || "",
              role.icon_key || null,
              orderRes.rows[0].n
            ]
          );
          targetRole = { ...ins.rows[0], goals: [] };
          targetByName.set(normalizeImportText(role.name), targetRole);
          rolesCopied += 1;
        }

        const existingKeys = new Set(
          (targetRole.goals || []).map((g) =>
            roleGoalDedupeKey({
              subject: targetSubject,
              roleName: targetRole.name,
              type: g.goal_type,
              text: g.text
            })
          )
        );

        for (const g of role.goals || []) {
          const type = g.goal_type || g.type;
          if (type === "WAS" && !includeWas) continue;
          if (type === "WIE" && !includeHow) continue;
          if (g.active === false) continue;
          const key = roleGoalDedupeKey({
            subject: targetSubject,
            roleName: targetRole.name,
            type,
            text: g.text
          });
          if (existingKeys.has(key)) {
            warnings.push(`Duplikat übersprungen: ${targetRole.name} / ${type}`);
            continue;
          }
          await pool.query(
            `
            INSERT INTO group_mode_role_goals
              (school_id, role_id, goal_type, text, sort_order, active, level, explanation)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
            [
              schoolId,
              targetRole.id,
              type,
              g.text,
              g.sort_order ?? g.sortOrder ?? 0,
              true,
              g.level || null,
              g.explanation || null
            ]
          );
          existingKeys.add(key);
          goalsCopied += 1;
        }
      }

      const roles = await loadRoles(target.id);
      res.json({
        success: true,
        summary: { rolesCopied, goalsCopied, warnings: warnings.slice(0, 30) },
        settings: serializeSettingsRow(target, roles)
      });
    } catch (err) {
      console.error("❌ copy-from-subject:", err);
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
        .filter((c) => subjectsMatch(c.subject, subject))
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
              "Für dieses Thema gibt es noch keinen Levelplan. Bitte wählt ein anderes Thema oder fragt eure Lehrkraft."
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
      if (!topic || !subjectsMatch(topic.subject, access.bundle.session.subject)) {
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
            "Für dieses Thema gibt es keinen Levelplan. Bitte wählt ein anderes Thema."
        });
      }

      // Bestehende Gruppe zu diesem Thema fortsetzen (nächste Stunde)
      const existingId = await findOpenSessionForStudent({
        classId: access.classId,
        schoolId: access.schoolId,
        studentId: req.session.user.id,
        subject: access.bundle.session.subject,
        topicId: topic.id
      });
      if (existingId && String(existingId) !== String(access.bundle.session.id)) {
        const existing = await loadSessionBundle(existingId, access.schoolId);
        if (existing && (existing.members || []).length > 0) {
          const currentMembers = access.bundle.members || [];
          if (!currentMembers.length && access.bundle.session.status === "setup") {
            try {
              await deleteSessionCascade(access.bundle.session.id);
            } catch (delErr) {
              console.error("⚠️ cleanup empty session after topic resume:", delErr);
            }
          }
          return res.json({
            success: true,
            resumed: true,
            continueGroup: true,
            ...existing
          });
        }
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
      const hasMembers = (bundle.members || []).length > 0;
      res.json({
        success: true,
        continueGroup: hasMembers,
        ...bundle
      });
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
      // Pro Rolle bis zu 3 Ziele – mehrere Rollen = entsprechend mehr
      const roleCount = Math.max(1, (member.roles || []).length);
      const perRoleWhat = Math.min(3, Math.max(1, Number(settings.maxWhatGoals) || 3));
      const perRoleHow = Math.min(3, Math.max(1, Number(settings.maxHowGoals) || 3));
      const maxWhat = perRoleWhat * roleCount;
      const maxHow = perRoleHow * roleCount;

      function tooManyPerRole(list, perRole, kindLabel) {
        const counts = new Map();
        for (const g of list || []) {
          const key = String(g.roleName || "").trim().toLowerCase() || "_";
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        for (const [key, n] of counts) {
          if (n > perRole) {
            const name = key === "_" ? "diese Rolle" : key;
            return `Für „${name}“ höchstens ${perRole} ${kindLabel}.`;
          }
        }
        return null;
      }

      const roleNames =
        (member.roles || []).map((r) => r.name).filter(Boolean).join(", ") ||
        access.bundle.session.topicName ||
        null;

      async function resolveGoalList(rawList, singleId, singleText, type, max) {
        const incoming = Array.isArray(rawList) ? rawList : null;
        const resolved = [];
        const seenTexts = new Set();
        const pushUnique = (goal) => {
          const key = String(goal.text || "")
            .trim()
            .toLowerCase();
          if (!key || seenTexts.has(key)) return;
          if (resolved.length >= max) return;
          seenTexts.add(key);
          resolved.push(goal);
        };
        if (incoming && incoming.length) {
          for (const item of incoming) {
            if (resolved.length >= max) break;
            const id = item?.id || item;
            if (id && typeof id !== "object") {
              const found = await findRoleGoalForMember(
                member,
                id,
                type,
                settings.roles || []
              );
              if (!found) {
                return {
                  error: `Bitte wähle gültige Rollen-${type === "WIE" ? "Wie" : "Was"}-Ziele.`
                };
              }
              pushUnique({
                id: found.goal.id,
                text: found.goal.text,
                roleName: found.role.name
              });
            } else if (item?.text) {
              pushUnique({
                id: item.id || null,
                text: String(item.text).trim().slice(0, 500),
                roleName: item.roleName || null
              });
            }
          }
        } else if (singleId) {
          const found = await findRoleGoalForMember(
            member,
            singleId,
            type,
            settings.roles || []
          );
          if (!found) {
            return {
              error: `Bitte wähle ein Rollen-${type === "WIE" ? "Wie" : "Was"}-Ziel.`
            };
          }
          resolved.push({
            id: found.goal.id,
            text: found.goal.text,
            roleName: found.role.name
          });
        } else if (singleText) {
          resolved.push({ id: null, text: String(singleText).trim().slice(0, 500) });
        }
        return { resolved };
      }

      let whatGoals = [];
      let howGoals = [];

      if (settings.enableWhatGoals) {
        const whatResult = await resolveGoalList(
          req.body.whatGoals,
          req.body.whatGoalId,
          req.body.whatGoalText,
          "WAS",
          maxWhat
        );
        if (whatResult.error) {
          return res.json({ success: false, message: whatResult.error });
        }
        whatGoals = whatResult.resolved;
        if (
          !whatGoals.length &&
          !(settings.allowFreeWhatGoal && String(req.body.whatGoalText || "").trim())
        ) {
          return res.json({
            success: false,
            message: "Bitte wähle mindestens ein Was-Ziel für deine Rolle."
          });
        }
        if (!whatGoals.length && settings.allowFreeWhatGoal) {
          whatGoals = [
            { id: null, text: String(req.body.whatGoalText || "").trim().slice(0, 500) }
          ];
        }
        const whatRoleErr = tooManyPerRole(whatGoals, perRoleWhat, "Was-Ziele");
        if (whatRoleErr) {
          return res.json({ success: false, message: whatRoleErr });
        }
      }

      if (settings.enableHowGoals) {
        const howResult = await resolveGoalList(
          req.body.howGoals,
          req.body.howGoalId,
          req.body.howGoalText,
          "WIE",
          maxHow
        );
        if (howResult.error) {
          return res.json({ success: false, message: howResult.error });
        }
        howGoals = howResult.resolved;
        if (!howGoals.length) {
          return res.json({
            success: false,
            message: "Bitte wähle mindestens ein Wie-Ziel."
          });
        }
        const howRoleErr = tooManyPerRole(howGoals, perRoleHow, "Wie-Ziele");
        if (howRoleErr) {
          return res.json({ success: false, message: howRoleErr });
        }
        if (!settings.allowFreeHowGoal) {
          for (const g of howGoals) {
            if (g.id) continue;
            const roleHowTexts = new Set();
            const assignedIds = new Set(
              (member.roles || []).map((r) => String(r.roleId)).filter(Boolean)
            );
            for (const role of settings.roles || []) {
              if (!assignedIds.has(String(role.id))) continue;
              for (const rg of role.howGoals || []) {
                if (rg.active !== false) roleHowTexts.add(rg.text);
              }
            }
            const allowed =
              roleHowTexts.has(g.text) || (settings.howGoalOptions || []).includes(g.text);
            if (!allowed) {
              return res.json({
                success: false,
                message: "Bitte wähle vorbereitete Wie-Ziele."
              });
            }
          }
        }
      }

      const whatGoalText = joinGoalTexts(whatGoals) || null;
      const howGoalText = joinGoalTexts(howGoals) || null;
      const whatGoalId = whatGoals[0]?.id || null;
      const howGoalId = howGoals[0]?.id || null;
      const whatGoalArea = whatGoals[0]?.roleName || roleNames;

      await pool.query(
        `
        UPDATE group_session_members SET
          what_goal_id = $2,
          what_goal_text_snapshot = $3,
          what_goal_area_snapshot = $4,
          selected_level = $5,
          level_goal_text_snapshot = $6,
          how_goal_id = $7,
          how_goal_text = $8,
          what_goals_json = $9::jsonb,
          how_goals_json = $10::jsonb,
          goals_confirmed_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `,
        [
          member.id,
          whatGoalId,
          whatGoalText,
          whatGoalArea,
          null,
          null,
          howGoalId,
          howGoalText,
          JSON.stringify(whatGoals),
          JSON.stringify(howGoals)
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
          message: "Bitte wählt zuerst ein Thema mit Levelplan."
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
        changeStrategies: Array.isArray(req.body.changeStrategies)
          ? req.body.changeStrategies.map((s) => String(s || "").trim()).filter(Boolean).slice(0, 3)
          : [],
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

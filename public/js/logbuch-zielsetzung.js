/**
 * SRL-Logbuch – Zielsetzung (Zielnote, Reflexion Grow/Glow/Ziel, XP).
 */
(function () {
  const CUSTOM_OPTION = "__custom__";
  const LEVEL_CHECK_TIER_ORDER = ["rookie", "operator", "street_legend"];

  const state = {
    data: null,
    selectedSubject: "",
    loading: false,
    saving: null,
    message: "",
    error: ""
  };

  let initPromise = null;
  let initGeneration = 0;
  let loadRequestId = 0;

  async function fetchJson(url, options = {}, retries = 2) {
    let lastErr = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, options);
        if (!res.ok) {
          const err = new Error(`HTTP ${res.status}`);
          if (attempt < retries && (res.status === 403 || res.status >= 500)) {
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
            continue;
          }
          throw err;
        }
        return await res.json();
      } catch (err) {
        lastErr = err;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
      }
    }

    throw lastErr || new Error("Anfrage fehlgeschlagen");
  }

  function isZielsetzungPayload(data) {
    return data && typeof data.hasClass === "boolean" && Array.isArray(data.grouped);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatGradeLabel(value) {
    return String(value ?? "").replace(".", ",");
  }

  function gradeOptions() {
    const fromApi = state.data?.gradeOptions;
    if (Array.isArray(fromApi) && fromApi.length) {
      return fromApi.map((g) =>
        typeof g === "object" ? g : { value: String(g), label: formatGradeLabel(g) }
      );
    }
    return ["1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5", "5.5", "6"].map((g) => ({
      value: g,
      label: formatGradeLabel(g)
    }));
  }

  function feedbackOptions(field) {
    const fromApi = state.data?.feedbackOptions?.[field];
    if (Array.isArray(fromApi) && fromApi.length) {
      return fromApi.map((item) =>
        typeof item === "object"
          ? item
          : { value: String(item), label: String(item) }
      );
    }
    return [];
  }

  function xpValue(field) {
    return state.data?.xpValues?.[field] ?? null;
  }

  function availableSubjects() {
    return state.data?.subjects?.length
      ? state.data.subjects
      : (state.data?.grouped || []).map((g) => g.subject);
  }

  function upcomingTopicMeta() {
    if (!state.selectedSubject) return null;
    return state.data?.upcomingBySubject?.[state.selectedSubject] || null;
  }

  function parseGradeValue(key) {
    if (key == null || key === "") return null;
    const n = Number(String(key).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function isTargetGradeMet(topic) {
    const target = parseGradeValue(topic?.targetGrade);
    const achieved = parseGradeValue(topic?.achievedGrade);
    if (target == null || achieved == null) return null;
    return achieved <= target;
  }

  function splitTopicsForSubject(group) {
    const topics = group?.topics || [];
    const upcomingId = upcomingTopicMeta()?.id;
    const upcoming = upcomingId
      ? topics.find((t) => t.id === upcomingId) || null
      : null;
    const past = topics
      .filter((t) => !upcoming || t.id !== upcoming.id)
      .sort((a, b) => {
        const da = a.checkpointDate || "";
        const db = b.checkpointDate || "";
        if (da !== db) return db.localeCompare(da);
        return (b.sortOrder ?? 0) - (a.sortOrder ?? 0);
      });
    return { upcoming, past };
  }

  function visibleGroups() {
    if (!state.selectedSubject) return [];
    const group = (state.data?.grouped || []).find((g) => g.subject === state.selectedSubject);
    if (!group) return [];
    return [group];
  }

  function findTopic(topicId) {
    for (const group of state.data?.grouped || []) {
      const topic = (group.topics || []).find((t) => t.id === topicId);
      if (topic) return topic;
    }
    return null;
  }

  function resolveFeedbackSelectValue(value, options) {
    const text = String(value ?? "").trim();
    if (!text) return "";
    const preset = options.find((o) => o.value === text);
    return preset ? text : CUSTOM_OPTION;
  }

  function renderXpHint(fieldKey, topic) {
    const awarded = topic?.xpAwarded?.[fieldKey];
    const amount = xpValue(fieldKey);
    if (awarded) {
      return `<span class="zs-xp-badge zs-xp-done">+${amount ?? "?"} XP ✓</span>`;
    }
    if (amount) {
      return `<span class="zs-xp-badge">+${amount} XP</span>`;
    }
    return "";
  }

  function renderGradeSelect(topicId, field, selected, saving) {
    const cls = field === "target" ? "zs-grade-select" : "zs-achieved-select";
    const label = field === "target" ? "Zielnote" : "Erreichte Note";
    const dataField = field === "target" ? "targetGradeKey" : "achievedGradeKey";
    const xpField = field === "target" ? "targetGrade" : "achievedGrade";
    const topic = findTopic(topicId);

    return `
      <label class="zs-grade-wrap">
        <span class="zs-grade-label">${label} ${renderXpHint(xpField, topic)}</span>
        <select
          class="${cls}"
          data-topic-id="${escapeHtml(topicId)}"
          data-field="${dataField}"
          ${saving ? "disabled" : ""}
        >
          <option value="">– wählen –</option>
          ${gradeOptions()
            .map(
              (g) =>
                `<option value="${escapeHtml(g.value)}" ${selected === String(g.value) ? "selected" : ""}>${escapeHtml(g.label)}</option>`
            )
            .join("")}
        </select>
      </label>`;
  }

  function renderFeedbackField(topic, fieldKey, label, hint) {
    const options = feedbackOptions(fieldKey);
    const value = topic[fieldKey] || "";
    const selectValue = resolveFeedbackSelectValue(value, options);
    const isCustom = selectValue === CUSTOM_OPTION;
    const saving = state.saving === `${topic.id}_${fieldKey}`;
    const xpField =
      fieldKey === "nextGoal" ? "nextGoal" : fieldKey;

    return `
      <div class="zs-feedback-field" data-feedback-field="${escapeHtml(fieldKey)}">
        <label class="zs-feedback-label">
          <span>${escapeHtml(label)} ${renderXpHint(xpField, topic)}</span>
          ${hint ? `<span class="zs-feedback-hint">${escapeHtml(hint)}</span>` : ""}
        </label>
        <select
          class="zs-feedback-select"
          data-topic-id="${escapeHtml(topic.id)}"
          data-field="${escapeHtml(fieldKey)}"
          ${saving ? "disabled" : ""}
        >
          <option value="">– wählen –</option>
          ${options
            .map(
              (o) =>
                `<option value="${escapeHtml(o.value)}" ${selectValue === o.value ? "selected" : ""}>${escapeHtml(o.label)}</option>`
            )
            .join("")}
          <option value="${CUSTOM_OPTION}" ${isCustom ? "selected" : ""}>Eigene Antwort…</option>
        </select>
        <input
          type="text"
          class="zs-feedback-custom ${isCustom ? "" : "zs-feedback-custom-hidden"}"
          data-topic-id="${escapeHtml(topic.id)}"
          data-field="${escapeHtml(fieldKey)}"
          maxlength="500"
          placeholder="Eigene Antwort eingeben…"
          value="${isCustom ? escapeHtml(value) : ""}"
          ${saving || !isCustom ? "disabled" : ""}
        />
      </div>`;
  }

  function renderFeedbackSection(topic) {
    if (!topic.achievedGrade) return "";

    return `
      <div class="zs-feedback">
        <h5 class="zs-feedback-title">Reflexion nach der Klassenarbeit</h5>
        ${renderFeedbackField(
          topic,
          "grow",
          "Grow",
          "Worin willst du besser werden?"
        )}
        ${renderFeedbackField(
          topic,
          "glow",
          "Glow",
          "Was hast du gut gemacht und willst beibehalten?"
        )}
        ${renderFeedbackField(
          topic,
          "nextGoal",
          "Mein Ziel für die nächste Klassenarbeit",
          "Worauf konzentrierst du dich als Nächstes?"
        )}
      </div>`;
  }

  function topicTaskProgress(topic) {
    const tiers = (topic.tiers || []).filter((t) => t.recommended != null);
    if (!tiers.length) {
      return { completed: 0, total: topic.totalGoals || 0 };
    }
    const total = tiers.reduce((a, t) => a + t.recommended, 0);
    const completed = tiers.reduce((a, t) => a + Math.min(t.current ?? 0, t.recommended), 0);
    return { completed, total };
  }

  function reflectionProgress(topic) {
    if (!topic.achievedGrade) return { completed: 0, total: 3 };
    const fields = [topic.grow, topic.glow, topic.nextGoal].filter((v) => String(v ?? "").trim());
    return { completed: fields.length, total: 3 };
  }

  function markingProgress(topic) {
    const total = topic.totalGoals || 0;
    const completed = Math.max(0, total - (topic.unmarked || 0));
    return { completed, total };
  }

  function renderTierCircle(tier, totalGoals) {
    const V = window.LogbuchVisuals;
    if (!V) return "";
    const current = tier.current ?? 0;
    const recommended = tier.recommended;
    const hasTarget = recommended != null && totalGoals > 0;
    const total = hasTarget ? recommended : totalGoals;
    const accents = { Rookie: "#22d3ee", Operator: "#a855f7", "Street Legend": "#f59e0b" };

    return V.circularProgress({
      completed: current,
      total,
      label: tier.label,
      size: 96,
      accent: accents[tier.label] || (tier.onTrack ? "#22c55e" : "#f97316"),
      sublabel: hasTarget
        ? tier.remaining > 0
          ? `noch ${tier.remaining} offen`
          : "Ziel erreicht"
        : `${current} markiert`
    });
  }

  function renderSubProgressCircles(topic) {
    const V = window.LogbuchVisuals;
    if (!V || !topic.targetGrade) return "";

    const tasks = topicTaskProgress(topic);
    const marks = markingProgress(topic);
    const refl = reflectionProgress(topic);

    const circles = [
      { ...tasks, label: "Aufgaben", accent: "#22d3ee" },
      { ...marks, label: "Markierungen", accent: "#a855f7" }
    ];

    if (topic.achievedGrade) {
      circles.push({ ...refl, label: "Reflexion", accent: "#f59e0b" });
    }

    return `
      <div class="zs-sub-progress">
        ${circles
          .map((c) =>
            V.circularProgress({
              completed: c.completed,
              total: c.total,
              label: c.label,
              size: 92,
              accent: c.accent,
              emptyHint: "Noch keine Daten."
            })
          )
          .join("")}
      </div>`;
  }

  function renderWhatsMissing(topic) {
    if (!topic.targetGrade) return "";

    const openItems = (topic.workItems || []).filter((i) => i.status !== "sicher");
    const openTasks = openItems.length;
    const prog = topicTaskProgress(topic);
    const openSteps = Math.max(0, prog.total - prog.completed);

    const lines = [];
    if (openTasks > 0) {
      lines.push(`${openTasks} Aufgabe${openTasks === 1 ? "" : "n"} noch offen`);
    } else if (openSteps > 0) {
      lines.push(`Noch ${openSteps} Lernschritt${openSteps === 1 ? "" : "e"} bis zur Zielnote`);
    }
    if (topic.unmarked > 0) {
      lines.push(`${topic.unmarked} Unterthema${topic.unmarked === 1 ? "" : "n"} ohne Markierung im Lernstand`);
    }
    if (topic.summary && !topic.onTrack) {
      lines.push(topic.summary);
    }

    if (!lines.length) {
      return `<div class="zs-missing zs-missing-ok"><h5 class="zs-feedback-title">Was fehlt noch?</h5><p class="goal-card__what">Du bist on track – weiter so!</p></div>`;
    }

    const nextItem = openItems[0];
    const nextHint = nextItem
      ? `Nächster Schritt: ${nextItem.tierLabel} – ${nextItem.taskText}`
      : "Markiere deinen Fortschritt im Mein Lernstand.";

    return `
      <div class="zs-missing">
        <h5 class="zs-feedback-title">Was fehlt noch?</h5>
        <ul class="zs-missing-list">
          ${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}
        </ul>
        <p class="goal-card__what zs-missing-next">${escapeHtml(nextHint)}</p>
        <div class="lesson-card__actions">
          <button type="button" class="btn-primary" data-zs-goto-levelplan>Mein Lernstand öffnen →</button>
        </div>
      </div>`;
  }

  function renderMainGoalCard(topic) {
    const V = window.LogbuchVisuals;
    if (!topic.targetGrade || !V) return "";

    const prog = topicTaskProgress(topic);
    const openCount = Math.max(0, prog.total - prog.completed);
    const datePart = topic.checkpointDateLabel
      ? `Nächster Check: ${topic.checkpointDateLabel}`
      : "";
    const typePart = topic.checkpointTypeLabel ? `${topic.checkpointTypeLabel} · ` : "";

    return `
      <div class="student-card zs-main-goal-card">
        <div class="card-content zs-main-goal-grid">
          <div class="zs-main-goal-copy">
            <p class="goal-card__subject">${escapeHtml(topic.name)}</p>
            <p class="goal-card__what">${typePart}${escapeHtml(topic.targetGradeLabel || topic.targetGrade)} als Zielnote</p>
            ${datePart ? `<p class="goal-card__what">${escapeHtml(datePart)}</p>` : ""}
            <p class="zs-goal-statement"><strong>Mein Ziel:</strong> Sicher ${escapeHtml(topic.targetGradeLabel || topic.targetGrade)} in ${escapeHtml(topic.name)}.</p>
            ${openCount > 0 ? `<p class="goal-card__what zs-open-count">Noch offen: ${openCount} Aufgabe${openCount === 1 ? "" : "n"}</p>` : `<p class="goal-card__what zs-open-count">Alles geschafft!</p>`}
          </div>
          ${V.circularProgress({
            completed: prog.completed,
            total: prog.total,
            label: "Gesamtfortschritt",
            size: 128,
            accent: topic.onTrack ? "#22c55e" : "#f97316"
          })}
        </div>
      </div>`;
  }

  function renderTierBar(tier, totalGoals) {
    return renderTierCircle(tier, totalGoals);
  }

  function renderTargetSummary(topic) {
    if (!topic.summary) return "";
    const cls = topic.onTrack ? "zs-analysis zs-analysis-ok" : "zs-analysis";
    return `<div class="${cls}">${escapeHtml(topic.summary)}</div>`;
  }

  function statusBadgeForGoal(status) {
    if (status === "sicher") return "status-badge--ok";
    if (status === "in_arbeit") return "status-badge--part";
    return "status-badge--open";
  }

  function statusLabelForGoal(status) {
    if (status === "sicher") return "sicher";
    if (status === "in_arbeit") return "in Arbeit";
    return "offen";
  }

  function renderWorkItems(topic) {
    const items = topic.workItems || [];
    if (!topic.targetGrade) return "";

    if (!items.length) {
      if (topic.onTrack) {
        return `<p class="goal-card__what zs-topic-hint-ok">Du bist on track für Zielnote ${escapeHtml(topic.targetGradeLabel || topic.targetGrade)}.</p>`;
      }
      return `<p class="goal-card__what">Markiere deine Fortschritte im Mein Lernstand – dann siehst du hier die passenden Aufgaben.</p>`;
    }

    const byTier = {};
    for (const item of items) {
      if (!byTier[item.tier]) {
        byTier[item.tier] = { label: item.tierLabel, items: [] };
      }
      byTier[item.tier].items.push(item);
    }

    return `
      <div class="zs-work-list">
        <h5 class="zs-feedback-title">Aufgaben zum Ziel</h5>
        ${LEVEL_CHECK_TIER_ORDER.filter((tier) => byTier[tier])
          .map((tier) => {
            const group = byTier[tier];
            return `
              <div class="zs-work-tier">
                <h5 class="zs-work-tier-title">${escapeHtml(group.label)}</h5>
                <div class="goal-card-grid zs-work-grid">
                  ${group.items
                    .map(
                      (item) => `
                    <article class="student-card goal-card goal-card--${item.status === "sicher" ? "ok" : item.status === "in_arbeit" ? "part" : "open"}">
                      <div class="card-content">
                        <p class="goal-card__subject">${escapeHtml(item.goalText)}</p>
                        <p class="goal-card__what">${escapeHtml(item.taskText)}</p>
                        <div class="goal-card__meta">
                          <span class="status-badge ${statusBadgeForGoal(item.status)}">${escapeHtml(statusLabelForGoal(item.status))}</span>
                          <span class="status-badge status-badge--open">${escapeHtml(item.tierLabel)}</span>
                        </div>
                        <div class="lesson-card__actions">
                          <button type="button" class="btn-primary" data-zs-goto-levelplan>Aufgabe öffnen →</button>
                        </div>
                      </div>
                    </article>`
                    )
                    .join("")}
                </div>
              </div>`;
          })
          .join("")}
      </div>`;
  }

  function renderArchivedFeedback(topic) {
    const rows = [
      ["Grow", topic.grow, "Worin wolltest du besser werden?"],
      ["Glow", topic.glow, "Was hast du gut gemacht?"],
      ["Ziel für nächste Klassenarbeit", topic.nextGoal, "Dein Fokus für das nächste Mal"]
    ].filter(([, value]) => String(value ?? "").trim());

    if (!rows.length) return "";

    return `
      <div class="zs-feedback zs-feedback-archived">
        <h5 class="zs-feedback-title">Reflexion</h5>
        ${rows
          .map(
            ([label, value, hint]) => `
          <div class="zs-archived-reflection">
            <div class="zs-archived-reflection-label">${escapeHtml(label)}</div>
            ${hint ? `<div class="zs-archived-reflection-hint">${escapeHtml(hint)}</div>` : ""}
            <div class="zs-archived-reflection-text">${escapeHtml(value)}</div>
          </div>`
          )
          .join("")}
      </div>`;
  }

  function renderGoalResultBadge(topic) {
    const met = isTargetGradeMet(topic);
    if (met === null) return "";
    return met
      ? `<span class="zs-goal-badge zs-goal-badge-met">Ziel erreicht ✓</span>`
      : `<span class="zs-goal-badge zs-goal-badge-missed">Ziel verfehlt</span>`;
  }

  function renderArchivedTopicCard(topic) {
    const datePart = topic.checkpointDateLabel
      ? escapeHtml(topic.checkpointDateLabel)
      : "ohne Termin";
    const typePart = topic.checkpointTypeLabel
      ? `${escapeHtml(topic.checkpointTypeLabel)} · `
      : "";

    return `
      <article class="student-card goal-card goal-card--ok" data-topic-id="${escapeHtml(topic.id)}">
        <div class="card-content">
          <p class="goal-card__subject">${escapeHtml(topic.name)}</p>
          <p class="goal-card__what">${typePart}${datePart} · ${topic.totalGoals} Unterthemen</p>
          <div class="goal-card__meta">
            <span class="status-badge status-badge--part">Vergangen</span>
            <span>Ziel: ${escapeHtml(topic.targetGradeLabel || "–")} · Erreicht: ${escapeHtml(topic.achievedGradeLabel || "–")}</span>
          </div>
          ${renderGoalResultBadge(topic)}
          ${renderArchivedFeedback(topic)}
        </div>
      </article>`;
  }

  function renderTopicCard(topic) {
    const saving = state.saving === topic.id;
    const targetSelected = topic.targetGrade != null ? String(topic.targetGrade) : "";
    const achievedSelected =
      topic.achievedGrade != null ? String(topic.achievedGrade) : "";

    return `
      <article class="student-card goal-card ${topic.targetGrade ? "goal-card--open" : ""}" data-topic-id="${escapeHtml(topic.id)}">
        <div class="card-content">
          ${
            topic.targetGrade
              ? `${renderMainGoalCard(topic)}
                 <div class="zs-tier-circles">${(topic.tiers || []).map((tier) => renderTierBar(tier, topic.totalGoals)).join("")}</div>
                 ${renderSubProgressCircles(topic)}
                 ${renderTargetSummary(topic)}
                 ${renderWorkItems(topic)}
                 ${renderWhatsMissing(topic)}`
              : `<p class="goal-card__subject">${escapeHtml(topic.name)}</p>
                 <p class="goal-card__what">${topic.totalGoals} Unterthemen</p>
                 <div class="zs-grade-row">
                   ${renderGradeSelect(topic.id, "target", targetSelected, saving)}
                   ${renderGradeSelect(topic.id, "achieved", achievedSelected, saving)}
                 </div>
                 <p class="goal-card__what">Wähle deine Zielnote – dann siehst du, welche Aufgaben du auf Rookie-, Operator- und Street-Legend-Level bearbeiten solltest.</p>`
          }

          ${
            topic.targetGrade
              ? `<div class="zs-grade-row zs-grade-row-compact">
                   ${renderGradeSelect(topic.id, "target", targetSelected, saving)}
                   ${renderGradeSelect(topic.id, "achieved", achievedSelected, saving)}
                 </div>`
              : ""
          }

          ${renderFeedbackSection(topic)}
        </div>
      </article>`;
  }

  function renderUpcomingBanner() {
    if (!state.selectedSubject) return "";
    const upcoming = upcomingTopicMeta();
    if (!upcoming) {
      return `<div class="student-card"><div class="card-content"><p class="goal-card__what">Für ${escapeHtml(state.selectedSubject)} ist noch keine anstehende Klassenarbeit hinterlegt.</p></div></div>`;
    }
    const datePart = upcoming.checkpointDateLabel
      ? ` · ${escapeHtml(upcoming.checkpointDateLabel)}`
      : " · Termin folgt";
    const typePart = upcoming.checkpointTypeLabel
      ? `${escapeHtml(upcoming.checkpointTypeLabel)} · `
      : "";
    return `
      <div class="student-card day-nav-card">
        <div class="day-nav-card__center">
          <h3 class="day-nav-card__title">${typePart}${escapeHtml(upcoming.name)}</h3>
          <p class="day-nav-card__sub">Anstehende Klassenarbeit${datePart}</p>
        </div>
      </div>`;
  }

  function renderSummaryPanel() {
    const V = window.LogbuchVisuals;
    if (!V || !state.data?.grouped?.length) return "";

    let topics = 0;
    let withTarget = 0;
    let onTrack = 0;

    for (const group of state.data.grouped) {
      for (const topic of group.topics || []) {
        topics++;
        if (topic.targetGrade) withTarget++;
        if ((topic.tiers || []).some((t) => t.onTrack)) onTrack++;
      }
    }


    return V.pageKpi(
      [
        { value: topics, label: "Themen", accent: true },
        { value: withTarget, label: "Mit Zielnote" },
        { value: onTrack, label: "On Track" },
        { value: state.selectedSubject || "–", label: "Fach" }
      ],
      { completed: withTarget, total: topics, label: "Ziele gesetzt", accent: "#22d3ee" }
    );
  }

  function renderSubjectToolbar() {
    const subjects = availableSubjects();
    const V = window.LogbuchVisuals;
    if (!subjects.length || !V) return "";

    return V.chipBar(
      subjects.map((s) => ({ value: s, label: s })),
      state.selectedSubject,
      "data-zs-subject"
    );
  }

  function renderLoadError() {
    const V = window.LogbuchVisuals;
    return (
      V?.pageShell(
        V.emptyState({
          title: "Zielsetzung konnte nicht geladen werden.",
          text: "Bitte erneut versuchen – manchmal hilft ein kurzer Moment oder Tab-Wechsel.",
          hint: "Erneut laden"
        })
      ) || ""
    );
  }

  function renderGrouped() {
    const V = window.LogbuchVisuals;
    if (!state.data?.hasClass) {
      return V?.emptyState({
        title: "Dir ist noch keine Klasse zugeordnet.",
        text: "Bitte wende dich an deine Lehrkraft."
      }) || "";
    }

    if (!state.selectedSubject) {
      return V?.emptyState({
        title: "Bitte wähle zuerst ein Fach.",
        text: "Danach siehst du die anstehende Klassenarbeit und darunter vergangene Arbeiten.",
        heroSrc: "/icons/student/hero/zielsetzung-hero.png"
      }) || "";
    }

    const groups = visibleGroups();
    if (!state.data?.grouped?.length) {
      return V?.emptyState({
        title: "Noch keine Themen.",
        text: "Sobald deine Lehrkraft im Levelstatus Themen anlegt, kannst du hier deine Zielnote setzen."
      }) || "";
    }

    const group = groups[0];
    if (!group) {
      return V?.emptyState({
        title: `Für ${state.selectedSubject} gibt es noch kein Klassenarbeit-Thema.`,
        text: "Deine Lehrkraft legt Themen im Levelstatus an – Termine im Checkpoint-Plan."
      }) || "";
    }

    const { upcoming, past } = splitTopicsForSubject(group);
    if (!upcoming && !past.length) {
      return V?.emptyState({
        title: `Für ${state.selectedSubject} gibt es noch kein Klassenarbeit-Thema.`,
        text: "Deine Lehrkraft legt Themen im Levelstatus an – Termine im Checkpoint-Plan."
      }) || "";
    }

    const upcomingHtml = upcoming
      ? V.sectionBlock("Anstehende Klassenarbeit", renderTopicCard(upcoming))
      : "";

    const pastHtml = past.length
      ? V.sectionBlock("Vergangene Arbeiten", `<div class="goal-card-grid">${past.map(renderArchivedTopicCard).join("")}</div>`)
      : "";

    return `${upcomingHtml}${pastHtml}`;
  }

  function render() {
    const root = document.getElementById("zielsetzung-screen-root");
    if (!root) return;
    const V = window.LogbuchVisuals;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="logbuch-loading">Lade Zielsetzung…</div>`;
      return;
    }

    if (!state.data) {
      root.innerHTML = renderLoadError();
      root.querySelector(".empty-state-card")?.addEventListener("click", () => {
        state.error = "";
        loadData(initGeneration);
      });
      return;
    }

    root.innerHTML = V?.pageShell(`
        ${renderSummaryPanel()}
        ${renderSubjectToolbar()}
        ${renderUpcomingBanner()}
        ${state.message ? `<div class="logbuch-msg logbuch-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="logbuch-msg logbuch-msg-error">${escapeHtml(state.error)}</div>` : ""}
        ${renderGrouped()}
      `) || "";

    bindHandlers(root);
  }

  function bindHandlers(root) {
    root.querySelectorAll("[data-zs-subject]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedSubject = btn.dataset.zsSubject;
        state.message = "";
        render();
      });
    });

    root.querySelectorAll(".zs-grade-select, .zs-achieved-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        saveField(sel.dataset.topicId, sel.dataset.field, sel.value);
      });
    });

    root.querySelectorAll(".zs-feedback-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const fieldWrap = sel.closest(".zs-feedback-field");
        const customInput = fieldWrap?.querySelector(".zs-feedback-custom");
        const isCustom = sel.value === CUSTOM_OPTION;

        if (customInput) {
          customInput.classList.toggle("zs-feedback-custom-hidden", !isCustom);
          customInput.disabled = !isCustom;
          if (!isCustom) customInput.value = "";
        }

        if (isCustom) {
          customInput?.focus();
          return;
        }

        saveField(sel.dataset.topicId, mapFeedbackField(sel.dataset.field), sel.value);
      });
    });

    root.querySelectorAll(".zs-feedback-custom").forEach((input) => {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          input.blur();
        }
      });
      input.addEventListener("blur", () => {
        if (input.disabled || input.classList.contains("zs-feedback-custom-hidden")) return;
        saveField(input.dataset.topicId, mapFeedbackField(input.dataset.field), input.value.trim());
      });
    });

    root.querySelectorAll("[data-zs-goto-levelplan]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.StudentRouter?.navigateToSection("levelplan");
      });
    });
  }

  function mapFeedbackField(field) {
    if (field === "grow") return "growText";
    if (field === "glow") return "glowText";
    if (field === "nextGoal") return "nextGoalText";
    return field;
  }

  function feedbackFieldLabel(apiField) {
    if (apiField === "targetGradeKey") return "Zielnote";
    if (apiField === "achievedGradeKey") return "Erreichte Note";
    if (apiField === "growText") return "Grow";
    if (apiField === "glowText") return "Glow";
    if (apiField === "nextGoalText") return "Ziel für nächste Klassenarbeit";
    return "Eintrag";
  }

  function buildXpMessage(xpDetails) {
    if (!Array.isArray(xpDetails) || !xpDetails.length) return "";
    const parts = xpDetails.map((item) => {
      const label =
        item.field === "targetGrade"
          ? "Zielnote"
          : item.field === "achievedGrade"
            ? "Erreichte Note"
            : item.field === "grow"
              ? "Grow"
              : item.field === "glow"
                ? "Glow"
                : item.field === "nextGoal"
                  ? "Ziel"
                  : "Feld";
      return `${label} +${item.amount} XP`;
    });
    return ` · ${parts.join(", ")}`;
  }

  async function saveField(topicId, field, value) {
    state.saving = field.startsWith("grow") || field.startsWith("glow") || field.startsWith("nextGoal")
      ? `${topicId}_${field.replace("Text", "")}`
      : topicId;
    state.error = "";
    state.message = "";
    render();

    const body = { levelCheckId: topicId };
    if (field === "targetGradeKey" || field === "achievedGradeKey") {
      body[field] = value;
    } else {
      body[field] = value;
    }

    try {
      const res = await fetch("/api/student/zielsetzung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      state.saving = null;

      if (!data.success) {
        state.error = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }

      const label = feedbackFieldLabel(field);
      const xpMsg = buildXpMessage(data.xpDetails);
      if (value === "" || value == null) {
        state.message = `${label} entfernt.`;
      } else if (field === "targetGradeKey" || field === "achievedGradeKey") {
        state.message = `${label} ${formatGradeLabel(value)} gespeichert${xpMsg}.`;
      } else {
        state.message = `${label} gespeichert${xpMsg}.`;
      }

      if (data.xpAwarded > 0 && typeof window.loadMe === "function") {
        await window.loadMe();
      }

      await loadData(initGeneration);
    } catch (err) {
      console.error(err);
      state.saving = null;
      state.error = "Netzwerkfehler beim Speichern.";
      render();
    }
  }

  async function loadData(generation = initGeneration) {
    const requestId = ++loadRequestId;
    state.loading = true;
    if (!state.data) render();

    try {
      const data = await fetchJson("/api/student/zielsetzung");
      if (requestId !== loadRequestId || generation !== initGeneration) return;
      if (!isZielsetzungPayload(data)) throw new Error("Ungültige Zielsetzung-Antwort");

      state.data = data;
      state.error = "";
      const subjects = availableSubjects();
      if (state.selectedSubject && !subjects.includes(state.selectedSubject)) {
        state.selectedSubject = "";
      }
      if (!state.selectedSubject && subjects.length) {
        state.selectedSubject = subjects[0];
      }
      state.loading = false;
      render();
    } catch (err) {
      console.error(err);
      if (requestId !== loadRequestId || generation !== initGeneration) return;
      state.loading = false;
      if (!state.data) state.data = null;
      state.error = state.data ? "Aktualisieren fehlgeschlagen." : "";
      render();
    }
  }

  async function initInternal() {
    const generation = ++initGeneration;
    state.loading = true;
    state.saving = null;
    state.message = "";
    state.error = "";
    if (!state.data) state.data = null;

    const root = document.getElementById("zielsetzung-screen-root");
    if (root && !state.data) {
      root.innerHTML = `<div class="logbuch-loading">Lade Zielsetzung…</div>`;
    }

    await loadData(generation);
  }

  function init() {
    if (initPromise) return initPromise;
    initPromise = initInternal().finally(() => {
      initPromise = null;
    });
    return initPromise;
  }

  window.LogbuchZielsetzung = { init };
})();

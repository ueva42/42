/**
 * SRL-Logbuch – Zielsetzung / Mein Zielpfad (Zielnote, Aufgabenpfad, Reflexion, XP).
 * Fachliche Fortschritts- und Aufgabenzuordnung kommt aus der API (server.js).
 */
(function () {
  const CUSTOM_OPTION = "__custom__";
  const C = window.LogbuchConstants || {};
  const LEVEL_CHECK_TIER_ORDER = C.LEVEL_CHECK_TIER_ORDER || ["rookie", "operator", "street_legend"];
  const LEVEL_CHECK_TIER_LABELS = C.LEVEL_CHECK_TIER_LABELS || {
    rookie: "Rookie",
    operator: "Operator",
    street_legend: "Street Legend"
  };
  const ZIELPFAD_PRIMARY_GRADES = C.ZIELPFAD_PRIMARY_GRADES || ["3", "2", "1"];
  const GRADE_ACCENTS = { 3: "#22d3ee", 2: "#a855f7", 1: "#f472b6" };
  const PASS_PERCENT_DEFAULT = 70;

  /** Fallback-Matrix – gleiche Werte wie server.js, falls Constants nicht geladen sind */
  const FALLBACK_GRADE_RULES = {
    "1": { rookie: 1, operator: 1, street_legend: 0.8 },
    "1.5": { rookie: 1, operator: 1, street_legend: 0.65 },
    "2": { rookie: 1, operator: 1, street_legend: 0.5 },
    "2.5": { rookie: 1, operator: 1, street_legend: 0.25 },
    "3": { rookie: 1, operator: 0.8, street_legend: 0 },
    "3.5": { rookie: 1, operator: 0.5, street_legend: 0 },
    "4": { rookie: 0.8, operator: 0, street_legend: 0 },
    "4.5": { rookie: 0.6, operator: 0, street_legend: 0 },
    "5": { rookie: 0.4, operator: 0, street_legend: 0 },
    "5.5": { rookie: 0.2, operator: 0, street_legend: 0 },
    "6": { rookie: 0, operator: 0, street_legend: 0 }
  };
  const TARGET_GRADE_RULES = C.TARGET_GRADE_RULES || FALLBACK_GRADE_RULES;

  const state = {
    data: null,
    selectedSubject: "",
    loading: false,
    saving: null,
    modal: null,
    message: "",
    error: "",
    showVoluntary: false,
    reflectionOpenId: null
  };

  let initPromise = null;
  let initGeneration = 0;
  let loadRequestId = 0;

  function normalizeGradeKey(raw) {
    let key = String(raw ?? "")
      .trim()
      .replace(",", ".")
      .replace("−", "-");
    if (!key) return null;
    if (TARGET_GRADE_RULES[key] || FALLBACK_GRADE_RULES[key]) return key;
    const num = Number(key);
    if (!Number.isFinite(num) || num < 1 || num > 6) return null;
    const halfStep = Math.round(num * 2) / 2;
    key = Number.isInteger(halfStep) ? String(halfStep) : halfStep.toFixed(1);
    return TARGET_GRADE_RULES[key] || FALLBACK_GRADE_RULES[key] ? key : null;
  }

  /** Zentrale Notenmatrix – immer mit Fallback, nie „keine Anforderungen“ bei gültiger Note */
  function getGradeRequirements(targetGrade) {
    const key = normalizeGradeKey(targetGrade);
    if (!key) return null;
    if (typeof C.getGradeRequirements === "function") {
      const fromConstants = C.getGradeRequirements(key);
      if (fromConstants) return fromConstants;
    }
    const rules = TARGET_GRADE_RULES[key] || FALLBACK_GRADE_RULES[key];
    if (!rules) return null;
    return {
      rookie: Number(rules.rookie) || 0,
      operator: Number(rules.operator) || 0,
      street_legend: Number(rules.street_legend) || 0
    };
  }

  /** Spiegel von server.js recommendedTierCounts – nur Anzeige */
  function recommendedTierCounts(totalGoals, targetGradeKey) {
    const total = Math.max(0, Number(totalGoals) || 0);
    const rules = getGradeRequirements(targetGradeKey);
    if (!rules || !total) return null;

    const out = {};
    for (const tier of LEVEL_CHECK_TIER_ORDER) {
      out[tier] = Math.ceil(total * rules[tier]);
    }
    return out;
  }

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

  function normalizePracticeUrl(raw) {
    if (raw == null) return "";
    return String(raw).trim();
  }

  function isValidPracticeUrl(url) {
    const value = normalizePracticeUrl(url);
    if (!value) return false;
    try {
      const parsed = new URL(value);
      return (parsed.protocol === "http:" || parsed.protocol === "https:") && Boolean(parsed.hostname);
    } catch {
      return false;
    }
  }

  function resolvePracticeUrl(raw) {
    const value = normalizePracticeUrl(raw);
    return isValidPracticeUrl(value) ? value : null;
  }

  function resolvePracticeAction(practiceUrl) {
    const url = resolvePracticeUrl(practiceUrl);
    if (!url) return { kind: "fallback" };
    try {
      const parsed = url.startsWith("/") ? new URL(url, window.location.origin) : new URL(url);
      if (parsed.origin === window.location.origin) {
        return { kind: "internal", url: parsed.href, path: parsed.pathname + parsed.search + parsed.hash };
      }
      return { kind: "external", url: parsed.href };
    } catch {
      return { kind: "fallback" };
    }
  }

  function followPracticeUrl(practiceUrl) {
    const action = resolvePracticeAction(practiceUrl);
    if (action.kind === "external") {
      window.open(action.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (action.kind === "internal") {
      const match = String(action.path || "").match(/^\/student\/([a-z0-9-]+)/i);
      if (match && window.StudentRouter?.navigateToSection) {
        window.StudentRouter.navigateToSection(match[1]);
        return;
      }
      window.location.assign(action.url);
      return;
    }
    window.StudentRouter?.navigateToSection("levelplan");
  }

  function renderPracticeLink(practiceUrl, label = "Übungsseite öffnen", className = "zielpfad-practice-link") {
    if (!resolvePracticeUrl(practiceUrl)) return "";
    return `<button type="button" class="${className}" data-zs-practice-url="${escapeHtml(resolvePracticeUrl(practiceUrl))}">${escapeHtml(label)}</button>`;
  }

  function groupItemsByGoal(items) {
    const groups = [];
    const seen = new Map();
    for (const item of items || []) {
      const key = String(item.goalId || item.goalText || "");
      if (!seen.has(key)) {
        const group = {
          goalId: item.goalId,
          goalText: item.goalText,
          practiceUrl: resolvePracticeUrl(item.practiceUrl),
          items: []
        };
        seen.set(key, group);
        groups.push(group);
      }
      seen.get(key).items.push(item);
    }
    return groups;
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

  function passPercent() {
    const n = Number(state.data?.levelcheckPassPercent);
    return Number.isFinite(n) ? n : PASS_PERCENT_DEFAULT;
  }

  function hasLevelcheckResult(topic) {
    return topic?.levelcheckPercent != null && Number.isFinite(Number(topic.levelcheckPercent));
  }

  function isTargetGradeMet(topic) {
    // Ohne Note: Ziel gilt als „geschafft“, wenn Levelcheck-Ergebnis ≥ Schwelle
    if (!hasLevelcheckResult(topic)) return null;
    return !!topic.levelcheckPassed;
  }

  function isCheckpointPast(topic) {
    if (!topic?.checkpointDate) return false;
    const today = new Date().toISOString().slice(0, 10);
    return topic.checkpointDate < today;
  }

  function isPastGradedArbeit(topic) {
    if (topic?.isPastArbeit === true && topic?.hasGradedCheckpoint) return true;
    return !!(topic?.hasGradedCheckpoint && isCheckpointPast(topic));
  }

  function splitTopicsForSubject(group) {
    const topics = group?.topics || [];
    const upcomingId = upcomingTopicMeta()?.id;
    let upcoming = upcomingId
      ? topics.find((t) => t.id === upcomingId && t.hasGradedCheckpoint) || null
      : null;
    if (!upcoming) {
      upcoming =
        topics.find((t) => t.hasGradedCheckpoint && !isCheckpointPast(t)) || null;
    }
    const past = topics
      .filter((t) => isPastGradedArbeit(t) && (!upcoming || t.id !== upcoming.id))
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

  /** Fortschritt für die aktuell gewählte Zielnote – aus API-tiers mit recommended */
  function topicTaskProgress(topic) {
    const tiers = (topic.tiers || []).filter((t) => t.recommended != null);
    if (!tiers.length) {
      return { completed: 0, total: topic.totalGoals || 0, hasRecommended: false };
    }
    const total = tiers.reduce((a, t) => a + t.recommended, 0);
    const completed = tiers.reduce((a, t) => a + Math.min(t.current ?? 0, t.recommended), 0);
    return { completed, total, hasRecommended: true };
  }

  function gradeRuleProfile(targetGrade) {
    return getGradeRequirements(targetGrade);
  }

  function levelProgressForTarget(topic, tier) {
    const profile = getGradeRequirements(topic?.targetGrade);
    const pctRequired = profile ? Math.round(profile[tier] * 100) : null;
    const totalGoals = Math.max(0, Number(topic?.totalGoals) || 0);
    const recommended = recommendedTierCounts(totalGoals, topic?.targetGrade || "");
    const requiredTasks = recommended?.[tier] ?? 0;
    const tierInfo = (topic?.tiers || []).find((t) => t.id === tier);
    const actualCurrent = tierInfo?.current ?? 0;
    const actualPct = totalGoals > 0 ? Math.round((actualCurrent / totalGoals) * 100) : 0;
    const minimumCompleted = Math.min(actualCurrent, requiredTasks);
    const minimumOpen = Math.max(0, requiredTasks - minimumCompleted);
    const goesBeyond = requiredTasks > 0 && actualCurrent > requiredTasks;
    return {
      pctRequired,
      requiredTasks,
      actualCurrent,
      actualPct,
      minimumOpen,
      totalGoals,
      hasProfile: !!profile,
      isVoluntaryTier: !requiredTasks,
      goesBeyond
    };
  }

  function tierPathLabel(isRequired) {
    return isRequired ? "Für dein Ziel erforderlich" : "Herausforderung";
  }

  function tierBadgeClassForItem(item) {
    if (item?.isMinimumPath || item?.pathSection === "required") return "zielpfad-badge--minimum";
    return "zielpfad-badge--challenge";
  }

  function taskIsOpen(item) {
    return item && item.status !== "sicher" && item.status !== "geschafft";
  }

  function itemIsRequired(item) {
    return !!(item?.isMinimumPath || item?.pathSection === "required" || item?.pathSection === "minimum");
  }

  function allWorkItemsForTopic(topic) {
    if (Array.isArray(topic?.allWorkItems) && topic.allWorkItems.length) {
      return topic.allWorkItems;
    }
    return topic?.workItems || [];
  }

  function pickChallengeNext(topic) {
    const open = allWorkItemsForTopic(topic)
      .filter((item) => !itemIsRequired(item) && taskIsOpen(item))
      .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
    return (
      open.find((item) => item.tier === "operator") ||
      open.find((item) => item.tier === "street_legend") ||
      open[0] ||
      null
    );
  }

  function pickMinimumNext(topic) {
    return (topic?.workItems || []).find(taskIsOpen) || null;
  }

  function actionButtonForItem(item, labelFallback) {
    if (resolvePracticeUrl(item?.practiceUrl)) {
      return `<button type="button" class="zielpfad-btn" data-zs-practice-url="${escapeHtml(resolvePracticeUrl(item.practiceUrl))}">Jetzt üben</button>`;
    }
    return `<button type="button" class="zielpfad-btn" data-zs-goto-levelplan>${escapeHtml(labelFallback)}</button>`;
  }

  /**
   * Fortschrittsdaten für einen Zielnoten-Kreis.
   * Gewählte Zielnote: API-Werte (topicTaskProgress).
   * Andere Noten: gleiche Server-Regeln + tiers[].current (nur Anzeige-Vorschau).
   */
  function gradeGoalProgress(topic, gradeKey) {
    const grade = String(gradeKey);
    const totalGoals = topic?.totalGoals || 0;

    if (!totalGoals) {
      return {
        grade,
        percentage: null,
        completedTasks: 0,
        totalTasks: 0,
        openTasks: 0,
        unavailable: true
      };
    }

    const isSelected =
      topic.targetGrade != null && String(topic.targetGrade) === grade;

    if (isSelected) {
      const prog = topicTaskProgress(topic);
      if (!prog.hasRecommended || prog.total === 0) {
        return {
          grade,
          percentage: null,
          completedTasks: prog.completed,
          totalTasks: 0,
          openTasks: 0,
          unavailable: true
        };
      }
      const pct = Math.round((prog.completed / prog.total) * 100);
      return {
        grade,
        percentage: pct,
        completedTasks: prog.completed,
        totalTasks: prog.total,
        openTasks: Math.max(0, prog.total - prog.completed),
        unavailable: false
      };
    }

    if (!TARGET_GRADE_RULES[grade]) {
      return {
        grade,
        percentage: null,
        completedTasks: 0,
        totalTasks: 0,
        openTasks: 0,
        unavailable: true
      };
    }

    const recommended = recommendedTierCounts(totalGoals, grade);
    if (!recommended) {
      return {
        grade,
        percentage: null,
        completedTasks: 0,
        totalTasks: 0,
        openTasks: 0,
        unavailable: true
      };
    }

    const tierCurrent = {};
    for (const t of topic.tiers || []) {
      tierCurrent[t.id] = t.current ?? 0;
    }

    let total = 0;
    let completed = 0;
    for (const tier of LEVEL_CHECK_TIER_ORDER) {
      const req = recommended[tier];
      if (req == null) continue;
      total += req;
      completed += Math.min(tierCurrent[tier] ?? 0, req);
    }

    if (total === 0) {
      return {
        grade,
        percentage: null,
        completedTasks: 0,
        totalTasks: 0,
        openTasks: 0,
        unavailable: true
      };
    }

    const pct = Math.round((completed / total) * 100);
    return {
      grade,
      percentage: pct,
      completedTasks: completed,
      totalTasks: total,
      openTasks: Math.max(0, total - completed),
      unavailable: false
    };
  }

  function tierBadgeClass(tier) {
    if (tier === "rookie") return "zielpfad-badge--minimum";
    if (tier === "operator") return "zielpfad-badge--challenge";
    return "zielpfad-badge--bonus";
  }

  function taskOrderLabel(index) {
    if (index === 0) return "Jetzt";
    if (index === 1) return "Als Nächstes";
    if (index === 2) return "Danach";
    return "Später";
  }

  function statusBadgeForGoal(status) {
    if (status === "sicher") return "zielpfad-status--sicher";
    if (status === "geschafft") return "zielpfad-status--geschafft";
    if (status === "in_arbeit") return "zielpfad-status--arbeit";
    return "zielpfad-status--offen";
  }

  function statusLabelForGoal(status) {
    if (status === "sicher") return "Sicher";
    if (status === "geschafft") return "Geschafft";
    if (status === "in_arbeit") return "In Arbeit";
    return "Offen";
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

  function renderAchievedGradeSelect(topicId, selected, saving) {
    return "";
  }

  function renderLevelcheckDial(topic, opts = {}) {
    const threshold = topic.unlockThreshold || passPercent();
    const pct =
      topic.levelcheckPercent != null ? Number(topic.levelcheckPercent) : Number(opts.draft ?? 0);
    const passed = pct >= threshold;
    const accent = passed ? "#22c55e" : "#22d3ee";
    const editable = opts.editable !== false;

    return `
      <div
        class="lc-dial ${passed ? "is-pass" : ""} ${editable ? "is-editable" : ""}"
        data-lc-dial
        data-topic-id="${escapeHtml(topic.id)}"
        data-threshold="${threshold}"
        style="--pct:${pct}; --threshold:${threshold}; --accent:${accent}"
        role="slider"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow="${pct}"
        aria-label="Levelcheck-Ergebnis in Prozent"
        tabindex="${editable ? "0" : "-1"}"
      >
        <div class="lc-dial__ring" aria-hidden="true"></div>
        <div class="lc-dial__threshold" aria-hidden="true" title="Check erreicht ab ${threshold} %"></div>
        <div class="lc-dial__knob" aria-hidden="true"></div>
        <div class="lc-dial__center">
          <strong data-lc-dial-value>${pct} %</strong>
          <span>richtig</span>
        </div>
      </div>
      <p class="lc-dial__hint">
        ${
          passed
            ? `Ab ${threshold} % gilt der Check als erreicht.`
            : `Drehen oder schieben · Markierung bei ${threshold} %.`
        }
      </p>
      ${
        editable
          ? `<div class="lc-dial__controls">
              <input type="range" class="lc-dial__range" min="0" max="100" step="1" value="${pct}" aria-label="Prozent-Schieberegler" />
              <button type="button" class="zielpfad-btn" data-lc-dial-save data-topic-id="${escapeHtml(topic.id)}">Ergebnis speichern</button>
            </div>`
          : ""
      }`;
  }

  function renderFeedbackField(topic, fieldKey, label, hint) {
    const options = feedbackOptions(fieldKey);
    const value = topic[fieldKey] || "";
    const selectValue = resolveFeedbackSelectValue(value, options);
    const isCustom = selectValue === CUSTOM_OPTION;
    const saving = state.saving === `${topic.id}_${fieldKey}`;
    const xpField = fieldKey === "nextGoal" ? "nextGoal" : fieldKey;

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

  function renderReflectionSheet(topic) {
    if (!topic?.targetGrade || topic.requiresTargetGrade === false) return "";
    if (String(state.reflectionOpenId) !== String(topic.id)) return "";
    const V = window.LogbuchVisuals;
    if (!V) return "";

    const glowOptions = feedbackOptions("glow");
    const growOptions = feedbackOptions("grow");
    const nextOptions = feedbackOptions("nextGoal");

    function renderChoiceCard({ fieldKey, title, question, accent, options }) {
      const value = topic[fieldKey] || "";
      const activeValue = resolveFeedbackSelectValue(value, options);
      const isCustom = activeValue === CUSTOM_OPTION;
      const saving = state.saving === `${topic.id}_${fieldKey}`;

      const tiles = [
        ...options.map((o) => ({
          value: o.value,
          icon: "◆",
          title: o.label,
          desc: o.desc || "",
          accent
        })),
        {
          value: CUSTOM_OPTION,
          icon: "✍",
          title: "Eigene Antwort…",
          desc: "Freitext",
          accent
        }
      ];

      return `
        <article class="zielpfad-eval-card" style="--eval-accent:${accent}" data-zs-reflection-field="${escapeHtml(fieldKey)}" data-topic-id="${escapeHtml(topic.id)}">
          <h4 class="zielpfad-eval-card__title">${escapeHtml(title)}</h4>
          <p class="zielpfad-eval-card__question">${escapeHtml(question)}</p>
          ${V.strategyTileGrid(tiles, activeValue, "data-zs-select-reflection")}
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
        </article>`;
    }

    return `
      <section class="zs-reflect-sheet" aria-label="Auswertung">
        <div class="zs-reflect-sheet__head">
          <h3 class="zs-reflect-sheet__title">Nach der Arbeit</h3>
          <button type="button" class="zielpfad-btn zielpfad-btn--ghost zielpfad-btn--sm" data-zs-toggle-reflect="${escapeHtml(topic.id)}">Schließen</button>
        </div>
        <p class="zs-reflect-sheet__sub">Glow, Grow und Next – tippe eine Antwort an.</p>
        <div class="zielpfad-eval-grid zielpfad-eval-grid--sheet">
          ${renderChoiceCard({
            fieldKey: "glow",
            title: "GLOW",
            question: "Was hat schon gut funktioniert?",
            accent: "#22c55e",
            options: glowOptions
          })}
          ${renderChoiceCard({
            fieldKey: "grow",
            title: "GROW",
            question: "Woran kannst du noch wachsen?",
            accent: "#a855f7",
            options: growOptions
          })}
          ${renderChoiceCard({
            fieldKey: "nextGoal",
            title: "NEXT",
            question: "Was machst du bei der nächsten Arbeit anders?",
            accent: "#a855f7",
            options: nextOptions
          })}
        </div>
      </section>`;
  }

  function renderProgressStrip(topic) {
    if (!topic?.targetGrade || topic.requiresTargetGrade === false) return "";
    const prog = topicTaskProgress(topic);
    if (!prog.hasRecommended || !prog.total) {
      return `<p class="zs-work-tile__hint">Markiere deinen Stand im Lernstand – Rookie, Operator, Street Legend.</p>`;
    }
    const pct = Math.round((prog.completed / prog.total) * 100);
    return `
      <div class="zs-progress" aria-label="Fortschritt zum Ziel">
        <div class="zs-progress__meta">
          <span>Weg zur Zielnote ${escapeHtml(formatGradeLabel(topic.targetGradeLabel || topic.targetGrade))}</span>
          <strong>${prog.completed}/${prog.total} · ${pct} %</strong>
        </div>
        <div class="zs-progress__track" role="presentation">
          <div class="zs-progress__fill" style="width:${pct}%"></div>
        </div>
      </div>`;
  }

  function renderCompactNext(topic) {
    if (!topic?.targetGrade) return "";
    const next = pickMinimumNext(topic) || pickChallengeNext(topic);
    if (!next) {
      return `
        <div class="zs-next">
          <p class="zs-next__eyebrow">Nächster Schritt</p>
          <p class="zs-next__text">${topic.onTrack ? "Zielanteil geschafft – stark!" : "Im Lernstand weitermarkieren."}</p>
        </div>`;
    }
    return `
      <div class="zs-next">
        <p class="zs-next__eyebrow">Nächster Schritt</p>
        <p class="zs-next__meta">${escapeHtml(next.tierLabel)} · ${escapeHtml(next.goalText)}</p>
        <p class="zs-next__text">${escapeHtml(next.taskText)}</p>
        <div class="zs-work-tile__actions">
          ${actionButtonForItem(next, "Im Lernstand üben")}
        </div>
      </div>`;
  }

  function renderWorkTile(topic) {
    if (!topic) return "";
    const typePart = topic.checkpointTypeLabel || "Klassenarbeit / Test";
    const datePart = topic.checkpointDateLabel || "Termin folgt";
    const showZielnote = topic.requiresTargetGrade === true;
    const hasTarget = !!topic.targetGrade;
    const reflectionOpen = String(state.reflectionOpenId) === String(topic.id);
    const reflectionDone = [topic.glow, topic.grow, topic.nextGoal].filter((v) =>
      String(v ?? "").trim()
    ).length;

    if (!showZielnote) {
      return `
        <article class="zs-work-tile">
          <p class="zs-work-tile__eyebrow">${escapeHtml(state.selectedSubject || topic.subject || "")}</p>
          <h3 class="zs-work-tile__title">${escapeHtml(topic.name)}</h3>
          <p class="zs-work-tile__sub">${escapeHtml(typePart)} · ${escapeHtml(datePart)}</p>
          <p class="zs-work-tile__hint">Ohne Zielnote – Ergebnis und geprüfte Ziele findest du im Lernstand.</p>
          <div class="zs-work-tile__actions">
            <button type="button" class="zielpfad-btn" data-zs-goto-levelplan>Zum Lernstand</button>
          </div>
        </article>`;
    }

    return `
      <article class="zs-work-tile ${hasTarget ? "has-target" : ""}">
        <p class="zs-work-tile__eyebrow">${escapeHtml(state.selectedSubject || topic.subject || "")} · ${escapeHtml(typePart)}</p>
        <h3 class="zs-work-tile__title">${escapeHtml(topic.name)}</h3>
        <p class="zs-work-tile__sub">${escapeHtml(datePart)}</p>
        <div class="zs-work-tile__grade">
          <span class="zs-work-tile__grade-label">Zielnote</span>
          <strong class="zs-work-tile__grade-value">${hasTarget ? escapeHtml(formatGradeLabel(topic.targetGradeLabel || topic.targetGrade)) : "–"}</strong>
          <button
            type="button"
            class="zielpfad-btn ${hasTarget ? "zielpfad-btn--ghost" : ""}"
            data-zs-open-grade-modal="target"
            data-topic-id="${escapeHtml(topic.id)}"
          >${hasTarget ? "Ändern" : "Festlegen"}</button>
        </div>
        ${hasTarget ? renderProgressStrip(topic) : `<p class="zs-work-tile__hint">Zuerst Zielnote setzen – dann siehst du deinen nächsten Schritt.</p>`}
        ${hasTarget ? renderCompactNext(topic) : ""}
        <div class="zs-work-tile__actions zs-work-tile__actions--row">
          <button type="button" class="zielpfad-btn" data-zs-goto-levelplan>Im Lernstand üben</button>
          ${
            hasTarget
              ? `<button type="button" class="zielpfad-btn zielpfad-btn--ghost" data-zs-toggle-reflect="${escapeHtml(topic.id)}">${
                  reflectionOpen ? "Auswertung schließen" : reflectionDone ? `Auswertung (${reflectionDone}/3)` : "Auswertung"
                }</button>`
              : ""
          }
        </div>
      </article>
      ${renderReflectionSheet(topic)}`;
  }

  function renderTargetGradeModal() {
    if (!state.modal || state.modal.type !== "targetGrade") return "";
    const topic = findTopic(state.modal.topicId);
    if (!topic || topic.requiresTargetGrade === false) return "";

    const options = gradeOptions();
    const selected = topic.targetGrade != null ? String(topic.targetGrade) : "";

    const hasSelectedProfile = selected ? !!gradeRuleProfile(selected) : true;
    const selectedText = selected ? formatGradeLabel(selected) : "";

    return `
      <div class="zielpfad-modal-backdrop" role="dialog" aria-modal="true" aria-label="Zielnote auswählen">
        <div class="zielpfad-modal">
          <div class="zielpfad-modal__head">
            <div class="zielpfad-modal__titles">
              <h3 class="zielpfad-modal__title">Zielnote auswählen</h3>
              <p class="zielpfad-modal__sub">Tippe eine Note an. Die Zielnote wird gespeichert.</p>
            </div>
            <button type="button" class="zielpfad-modal__close" data-zs-close-grade-modal>Schließen</button>
          </div>

          <div class="zielpfad-grade-tile-grid">
            ${options
              .map((g) => {
                const val = String(g.value);
                const profile = gradeRuleProfile(val);
                const isMissing = !profile;
                const isSel = selected && val === selected;
                return `
                  <button
                    type="button"
                    class="zielpfad-grade-tile ${isSel ? "is-selected" : ""} ${isMissing ? "is-missing" : ""}"
                    data-zs-select-grade="target"
                    data-topic-id="${escapeHtml(topic.id)}"
                    data-grade="${escapeHtml(val)}"
                    aria-pressed="${isSel ? "true" : "false"}"
                  >
                    <span class="zielpfad-grade-tile__label">${escapeHtml(g.label)}</span>
                    ${
                      isMissing
                        ? `<span class="zielpfad-grade-tile__missing">Keine Anforderungen</span>`
                        : ""
                    }
                  </button>`;
              })
              .join("")}
          </div>

          ${
            selected && !hasSelectedProfile
              ? `<div class="zielpfad-modal__warn">Für die Zielnote ${escapeHtml(selectedText)} sind noch keine Anforderungen hinterlegt.</div>`
              : ""
          }

          <div class="zielpfad-modal__foot">
            <p class="zielpfad-modal__hint">Hinweis: XP für Zielsetzung wird nur beim ersten Festlegen vergeben.</p>
          </div>
        </div>
      </div>`;
  }

  function renderAchievedGradeModal() {
    return "";
  }

  function renderLevelcheckResultModal() {
    if (!state.modal || state.modal.type !== "levelcheckResult") return "";
    const topic = findTopic(state.modal.topicId);
    if (!topic) return "";
    const draft =
      state.modal.draft != null
        ? Number(state.modal.draft)
        : topic.levelcheckPercent != null
          ? Number(topic.levelcheckPercent)
          : 70;

    return `
      <div class="zielpfad-modal-backdrop" role="dialog" aria-modal="true" aria-label="Levelcheck-Ergebnis">
        <div class="zielpfad-modal zielpfad-modal--dial">
          <div class="zielpfad-modal__head">
            <div class="zielpfad-modal__titles">
              <h3 class="zielpfad-modal__title">Levelcheck-Ergebnis</h3>
              <p class="zielpfad-modal__sub">Wie viel Prozent hast du richtig? Keine Note – nur der Anteil.</p>
            </div>
            <button type="button" class="zielpfad-modal__close" data-zs-close-grade-modal>Schließen</button>
          </div>
          <div class="lc-dial-modal-body">
            ${renderLevelcheckDial({ ...topic, levelcheckPercent: draft }, { editable: true, draft })}
          </div>
        </div>
      </div>`;
  }

  function renderNextStep(topic) {
    if (!topic?.targetGrade) return "";

    const minimumNext = pickMinimumNext(topic);
    const challengeNext = pickChallengeNext(topic);

    if (!minimumNext && !challengeNext) {
      return `
        <section class="zielpfad-block zielpfad-next">
          <div class="zielpfad-next-dual">
            <article class="zielpfad-next-card zielpfad-next-card--done">
              <p class="zielpfad-next-card__eyebrow">Dein nächster Schritt</p>
              <p class="zielpfad-next-card__text">${
                topic.onTrack
                  ? "Ziel erreicht – stark gemacht!"
                  : "Markiere deinen Fortschritt im Mein Lernstand."
              }</p>
              <div class="zielpfad-actions">
                <button type="button" class="zielpfad-btn" data-zs-goto-levelplan>Aufgabenübersicht öffnen</button>
              </div>
            </article>
          </div>
        </section>`;
    }

    return `
      <section class="zielpfad-block zielpfad-next">
        <div class="zielpfad-next-dual">
          <article class="zielpfad-next-card">
            <p class="zielpfad-next-card__eyebrow">Dein nächster Schritt</p>
            ${
              minimumNext
                ? `
              <p class="zielpfad-next-card__meta">${escapeHtml(minimumNext.tierLabel)} · ${escapeHtml(minimumNext.goalText)}</p>
              <p class="zielpfad-next-card__text">${escapeHtml(minimumNext.taskText)}</p>
              <div class="zielpfad-actions">
                ${actionButtonForItem(minimumNext, "Für mein Ziel weiterarbeiten")}
              </div>`
                : `
              <p class="zielpfad-next-card__text">Ziel erreicht – stark gemacht!</p>
              <p class="zielpfad-next-card__hint">Du kannst freiwillig weitergehen.</p>`
            }
          </article>
          <article class="zielpfad-next-card zielpfad-next-card--challenge">
            <p class="zielpfad-next-card__eyebrow">Du möchtest weitergehen?</p>
            ${
              challengeNext
                ? `
              <p class="zielpfad-next-card__meta">${escapeHtml(challengeNext.tierLabel)} · ${escapeHtml(challengeNext.goalText)}</p>
              <p class="zielpfad-next-card__text">${escapeHtml(challengeNext.taskText)}</p>
              <div class="zielpfad-actions">
                ${actionButtonForItem(challengeNext, "Herausforderung ausprobieren")}
              </div>`
                : `
              <p class="zielpfad-next-card__text">Gerade keine offene Herausforderung.</p>
              <div class="zielpfad-actions">
                <button type="button" class="zielpfad-btn zielpfad-btn--ghost" data-zs-goto-levelplan>Aufgabenübersicht öffnen</button>
              </div>`
            }
          </article>
        </div>
      </section>`;
  }

  function renderOpenForGoalCard(topic) {
    if (!topic?.targetGrade) return "";

    const totalGoals = Math.max(0, Number(topic.totalGoals) || 0);
    const recommended = recommendedTierCounts(totalGoals, topic.targetGrade);
    if (!recommended) return "";

    const lines = [];
    for (const tier of LEVEL_CHECK_TIER_ORDER) {
      const required = recommended[tier] || 0;
      if (required <= 0) continue;
      const tierInfo = (topic.tiers || []).find((t) => t.id === tier);
      const current = tierInfo?.current ?? 0;
      const open = Math.max(0, required - current);
      if (open <= 0) continue;
      const label = LEVEL_CHECK_TIER_LABELS[tier] || tier;
      lines.push(`${open} ${label}-Aufgabe${open === 1 ? "" : "n"}`);
    }

    if (!lines.length) {
      return `
        <section class="zielpfad-block">
          <article class="zielpfad-open-card zielpfad-open-card--ok">
            <h3 class="zielpfad-open-card__title">Für dein Ziel noch offen</h3>
            <p class="zielpfad-open-card__text">Nichts mehr – dein Zielanteil ist geschafft. Stark – du kannst freiwillig weitergehen!</p>
          </article>
        </section>`;
    }

    return `
      <section class="zielpfad-block">
        <article class="zielpfad-open-card">
          <h3 class="zielpfad-open-card__title">Für dein Ziel noch offen</h3>
          <ul class="zielpfad-open-card__list">
            ${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
          </ul>
        </article>
      </section>`;
  }

  function renderGoalReachedBanner(topic) {
    if (!topic?.onTrack || !topic?.targetGrade) return "";
    return `
      <article class="zielpfad-goal-reached">
        <h4 class="zielpfad-goal-reached__title">Ziel erreicht – stark gemacht!</h4>
        <p class="zielpfad-goal-reached__text">Du kannst weiterhin Herausforderungen ausprobieren.</p>
      </article>`;
  }

  function taskActionLabel(item) {
    if (item.status === "in_arbeit") return "Weiterarbeiten";
    if (item.status === "sicher" || item.status === "geschafft") return "Aufgabe ansehen";
    return "Aufgabe starten";
  }

  function renderTaskRow(item) {
    const isRequired = itemIsRequired(item);
    return `
      <article class="zielpfad-task-row ${isRequired ? "is-required" : "is-challenge"} zielpfad-task-row--${item.status === "sicher" ? "sicher" : item.status === "in_arbeit" ? "arbeit" : "offen"}">
        <div class="zielpfad-task-row__main">
          <div class="zielpfad-task-row__tags">
            <span class="zielpfad-tier-badge">${escapeHtml(item.tierLabel)}</span>
            <span class="zielpfad-status ${statusBadgeForGoal(item.status)}">${escapeHtml(statusLabelForGoal(item.status))}</span>
            <span class="zielpfad-badge ${tierBadgeClassForItem(item)}">${escapeHtml(item.pathLabel || tierPathLabel(isRequired))}</span>
          </div>
          <p class="zielpfad-task-row__subject">${escapeHtml(item.goalText)}</p>
          <p class="zielpfad-task-row__text">${escapeHtml(item.taskText)}</p>
        </div>
        <div class="zielpfad-task-row__actions">
          ${
            resolvePracticeUrl(item.practiceUrl)
              ? `<button type="button" class="zielpfad-btn zielpfad-btn--sm" data-zs-practice-url="${escapeHtml(resolvePracticeUrl(item.practiceUrl))}">Jetzt üben</button>`
              : `<button type="button" class="zielpfad-btn zielpfad-btn--sm" data-zs-goto-levelplan>${escapeHtml(taskActionLabel(item))}</button>`
          }
        </div>
      </article>`;
  }

  function renderTaskGroup(title, items) {
    if (!items.length) return "";
    return `
      <div class="zielpfad-level-subgroup">
        <h5 class="zielpfad-level-subgroup__title">${escapeHtml(title)}</h5>
        <div class="zielpfad-task-rows">
          ${items
            .slice()
            .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
            .map(renderTaskRow)
            .join("")}
        </div>
      </div>`;
  }

  function renderGoalTasks(topic) {
    if (!topic?.targetGrade) return "";

    const allItems = allWorkItemsForTopic(topic);
    const profile = getGradeRequirements(topic.targetGrade);
    const tierAccents = { rookie: "#22d3ee", operator: "#a855f7", street_legend: "#f472b6" };

    if (!allItems.length) {
      return `
        <section class="zielpfad-block">
          <h3 class="zielpfad-block__title">Aufgaben</h3>
          <article class="zielpfad-task-empty">
            <p>Für dieses Thema sind noch keine Aufgaben hinterlegt.</p>
          </article>
        </section>`;
    }

    const sections = LEVEL_CHECK_TIER_ORDER.map((tier) => {
      const tierItems = allItems.filter((item) => item.tier === tier);
      if (!tierItems.length) return "";
      const pct = profile ? Math.round((profile[tier] || 0) * 100) : 0;
      const required = tierItems.filter(itemIsRequired);
      const challenge = tierItems.filter((item) => !itemIsRequired(item));
      const label = LEVEL_CHECK_TIER_LABELS[tier] || tier;
      const pctLine = pct > 0 ? `${pct} % für dein Ziel vorgesehen` : "Freiwillige Vertiefung";

      return `
        <section class="zielpfad-level-block" style="--grade-accent:${tierAccents[tier]}">
          <div class="zielpfad-level-block__head">
            <h3 class="zielpfad-level-block__title">${escapeHtml(label)}</h3>
            <p class="zielpfad-level-block__sub">${escapeHtml(pctLine)}</p>
          </div>
          ${required.length ? renderTaskGroup("Für dein Ziel erforderlich", required) : ""}
          ${challenge.length ? renderTaskGroup("Herausforderung", challenge) : ""}
        </section>`;
    }).join("");

    return `
      <section class="zielpfad-block">
        ${renderGoalReachedBanner(topic)}
        ${sections}
      </section>`;
  }

  function renderGoalResultBadge(topic) {
    const met = isTargetGradeMet(topic);
    if (met === null) return "";
    const threshold = topic.unlockThreshold || passPercent();
    return met
      ? `<span class="zs-goal-badge zs-goal-badge-met">≥ ${threshold} % – Thema bestanden ✓</span>`
      : `<span class="zs-goal-badge zs-goal-badge-missed">Unter ${threshold} % – noch üben</span>`;
  }

  function renderResultSection(topic) {
    return "";
  }

  function renderArchivedFeedback(topic) {
    const glow = topic.glow || "";
    const grow = topic.grow || "";
    const nextGoal = topic.nextGoal || "";
    const hasAny = [glow, grow, nextGoal].some((v) => String(v ?? "").trim());
    if (!hasAny) return "";

    return `
      <div class="zielpfad-eval-grid zielpfad-eval-grid--archived">
        <article class="zielpfad-eval-card zielpfad-eval-card--glow" style="--eval-accent:#22c55e">
          <h4 class="zielpfad-eval-card__title">GLOW</h4>
          <div class="zielpfad-eval-card__value">${glow ? escapeHtml(glow) : "—"}</div>
        </article>
        <article class="zielpfad-eval-card zielpfad-eval-card--grow" style="--eval-accent:#a855f7">
          <h4 class="zielpfad-eval-card__title">GROW</h4>
          <div class="zielpfad-eval-card__value">${grow ? escapeHtml(grow) : "—"}</div>
        </article>
        <article class="zielpfad-eval-card zielpfad-eval-card--next" style="--eval-accent:#a855f7">
          <h4 class="zielpfad-eval-card__title">NEXT</h4>
          <div class="zielpfad-eval-card__value">${nextGoal ? escapeHtml(nextGoal) : "—"}</div>
        </article>
      </div>`;
  }

  function renderArchivedTopicCard(topic) {
    const datePart = topic.checkpointDateLabel
      ? escapeHtml(topic.checkpointDateLabel)
      : "ohne Termin";
    const typePart = topic.checkpointTypeLabel
      ? `${escapeHtml(topic.checkpointTypeLabel)} · `
      : "";
    const reflectionDone = [topic.grow, topic.glow, topic.nextGoal].filter((v) =>
      String(v ?? "").trim()
    ).length;
    const open = String(state.reflectionOpenId) === `past:${topic.id}`;

    return `
      <article class="zs-past-tile" data-topic-id="${escapeHtml(topic.id)}">
        <div class="zs-past-tile__main">
          <p class="zs-past-tile__title">${escapeHtml(topic.name)}</p>
          <p class="zs-past-tile__meta">${typePart}${datePart}</p>
          <p class="zs-past-tile__grades">Zielnote ${escapeHtml(topic.targetGradeLabel || "–")}${
            reflectionDone ? ` · Auswertung ${reflectionDone}/3` : ""
          }</p>
        </div>
        <button type="button" class="zielpfad-btn zielpfad-btn--ghost zielpfad-btn--sm" data-zs-toggle-archived="${escapeHtml(topic.id)}">
          ${open ? "Schließen" : "Ansehen"}
        </button>
        ${open ? `<div class="zs-past-tile__body">${renderArchivedFeedback(topic) || `<p class="zs-work-tile__hint">Noch keine Auswertung.</p>`}</div>` : ""}
      </article>`;
  }

  function renderTopicZielpfad(topic) {
    return `<div class="zielpfad-topic" data-topic-id="${escapeHtml(topic.id)}">${renderWorkTile(topic)}</div>`;
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
      return (
        V?.emptyState({
          title: "Dir ist noch keine Klasse zugeordnet.",
          text: "Bitte wende dich an deine Lehrkraft."
        }) || ""
      );
    }

    if (!state.selectedSubject) {
      return (
        V?.emptyState({
          title: "Bitte wähle zuerst ein Fach.",
          text: "Danach siehst du deinen Zielpfad für die anstehende Klassenarbeit.",
          heroSrc: "/icons/student/hero/zielsetzung-hero.png?v=6"
        }) || ""
      );
    }

    const groups = visibleGroups();
    if (!state.data?.grouped?.length) {
      return (
        V?.emptyState({
          title: "Noch keine Themen.",
          text: "Sobald deine Lehrkraft im Levelstatus Themen anlegt, kannst du hier deine Zielnote setzen."
        }) || ""
      );
    }

    const group = groups[0];
    if (!group) {
      return (
        V?.emptyState({
          title: `Für ${state.selectedSubject} gibt es noch kein Klassenarbeit-Thema.`,
          text: "Deine Lehrkraft legt Themen im Levelstatus an – Termine im Checkpoint-Plan."
        }) || ""
      );
    }

    const { upcoming, past } = splitTopicsForSubject(group);
    if (!upcoming && !past.length) {
      return (
        V?.emptyState({
          title: `Für ${state.selectedSubject} gibt es noch kein Klassenarbeit-Thema.`,
          text: "Deine Lehrkraft legt Themen im Levelstatus an – Termine im Checkpoint-Plan."
        }) || ""
      );
    }

    const upcomingHtml = upcoming
      ? renderTopicZielpfad(upcoming)
      : `<article class="zs-work-tile zs-work-tile--empty"><p class="zs-work-tile__hint">Für ${escapeHtml(state.selectedSubject)} ist noch keine anstehende Klassenarbeit hinterlegt.</p></article>`;

    const pastHtml = past.length
      ? `<section class="zs-past-block" aria-label="Vergangene Arbeiten">
          <h3 class="zs-past-block__title">Vergangene Arbeiten</h3>
          <div class="zs-past-grid">${past.map(renderArchivedTopicCard).join("")}</div>
        </section>`
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

    root.innerHTML =
      V?.pageShell(`
        <div class="zielpfad-app">
          ${renderSubjectToolbar()}
          ${state.message ? `<div class="logbuch-msg logbuch-msg-ok">${escapeHtml(state.message)}</div>` : ""}
          ${state.error ? `<div class="logbuch-msg logbuch-msg-error">${escapeHtml(state.error)}</div>` : ""}
          ${renderGrouped()}
          ${renderTargetGradeModal()}
        </div>
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

    root.querySelectorAll("[data-zs-open-grade-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const topicId = btn.dataset.topicId;
        if (!topicId) return;
        if (findTopic(topicId)?.requiresTargetGrade === false) return;
        state.modal = { type: "targetGrade", topicId };
        state.message = "";
        render();
      });
    });

    root.querySelectorAll("[data-zs-close-grade-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.modal = null;
        render();
      });
    });

    root.querySelectorAll("[data-zs-select-grade=\"target\"], [data-zs-select-grade]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const topicId = btn.dataset.topicId;
        const grade = btn.dataset.grade;
        if (!topicId || !grade) return;
        if (findTopic(topicId)?.requiresTargetGrade === false) return;
        state.modal = null;
        saveField(topicId, "targetGradeKey", grade);
      });
    });

    root.querySelectorAll("[data-zs-open-levelcheck-result]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.StudentRouter?.navigateToSection("levelplan");
      });
    });

    root.querySelectorAll("[data-zs-open-achieved-grade-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.StudentRouter?.navigateToSection("levelplan");
      });
    });

    root.querySelectorAll("[data-zs-select-achieved-grade]").forEach((btn) => {
      btn.addEventListener("click", () => {});
    });

    root.querySelectorAll("[data-zs-toggle-reflect]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.zsToggleReflect;
        state.reflectionOpenId = String(state.reflectionOpenId) === String(id) ? null : id;
        render();
      });
    });

    // Reflection tiles (GLOW / GROW / NEXT) – wir speichern beim Tippen (Ausnahme: Eigene Antwort => Input anzeigen)
    root
      .querySelectorAll(".strategy-tile[data-zs-select-reflection]")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const card = btn.closest("[data-zs-reflection-field]");
          if (!card) return;
          const topicId = card.dataset.topicId;
          const fieldKey = card.dataset.zsReflectionField;
          const val = btn.dataset.zsSelectReflection;
          if (!topicId || !fieldKey) return;

          if (val === CUSTOM_OPTION) {
            const input = card.querySelector(`.zs-feedback-custom[data-field="${fieldKey}"]`);
            if (input) {
              input.classList.remove("zs-feedback-custom-hidden");
              input.disabled = false;
              input.focus();
            }
            return;
          }

          saveField(topicId, mapFeedbackField(fieldKey), val);
        });
      });

    root.querySelectorAll(".zs-achieved-select").forEach((sel) => {
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

    root.querySelectorAll("[data-zs-toggle-voluntary]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.showVoluntary = !state.showVoluntary;
        render();
        if (state.showVoluntary) {
          root.querySelector(".zielpfad-voluntary")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });

    root.querySelectorAll("[data-zs-practice-url]").forEach((btn) => {
      btn.addEventListener("click", () => {
        followPracticeUrl(btn.dataset.zsPracticeUrl);
      });
    });

    root.querySelectorAll("[data-zs-toggle-archived]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = `past:${btn.dataset.zsToggleArchived}`;
        state.reflectionOpenId = String(state.reflectionOpenId) === id ? null : id;
        render();
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
    if (apiField === "achievedGradeKey") return "Levelcheck-Ergebnis";
    if (apiField === "levelcheckPercent") return "Levelcheck-Ergebnis";
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
          : item.field === "achievedGrade" || item.field === "levelcheckPercent"
            ? "Levelcheck"
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

  function syncDialVisual(dial, pct) {
    const threshold = Number(dial.dataset.threshold) || passPercent();
    const passed = pct >= threshold;
    dial.style.setProperty("--pct", String(pct));
    dial.style.setProperty("--accent", passed ? "#22c55e" : "#22d3ee");
    dial.classList.toggle("is-pass", passed);
    dial.setAttribute("aria-valuenow", String(pct));
    const valueEl = dial.querySelector("[data-lc-dial-value]");
    if (valueEl) valueEl.textContent = `${pct} %`;
    const range = dial.parentElement?.querySelector(".lc-dial__range") ||
      dial.closest(".lc-dial-modal-body, .zielpfad-result-dial")?.querySelector(".lc-dial__range");
    if (range && Number(range.value) !== pct) range.value = String(pct);
    const hint = dial.parentElement?.querySelector(".lc-dial__hint");
    if (hint) {
      hint.textContent = passed
        ? `Ab ${threshold} % gilt der Check als erreicht.`
        : `Drehen oder schieben · Markierung bei ${threshold} %.`;
    }
    if (state.modal?.type === "levelcheckResult" && state.modal.topicId === dial.dataset.topicId) {
      state.modal.draft = pct;
    }
  }

  function percentFromPointer(dial, clientX, clientY) {
    const rect = dial.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = Math.atan2(clientY - cy, clientX - cx); // -PI..PI, 0 = east
    // Map: top (-PI/2) = 0%, clockwise to 100%
    let deg = ((angle + Math.PI / 2) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return Math.max(0, Math.min(100, Math.round(deg / 3.6)));
  }

  function bindLevelcheckDials(root) {
    root.querySelectorAll("[data-lc-dial].is-editable").forEach((dial) => {
      let dragging = false;

      const setFromEvent = (e) => {
        const point = e.touches ? e.touches[0] : e;
        if (!point) return;
        const pct = percentFromPointer(dial, point.clientX, point.clientY);
        syncDialVisual(dial, pct);
      };

      dial.addEventListener("pointerdown", (e) => {
        dragging = true;
        dial.setPointerCapture?.(e.pointerId);
        setFromEvent(e);
        e.preventDefault();
      });
      dial.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        setFromEvent(e);
      });
      dial.addEventListener("pointerup", () => {
        dragging = false;
      });
      dial.addEventListener("pointercancel", () => {
        dragging = false;
      });
      dial.addEventListener("keydown", (e) => {
        const cur = Number(dial.getAttribute("aria-valuenow") || 0);
        let next = cur;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") next = Math.min(100, cur + 1);
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(0, cur - 1);
        if (e.key === "PageUp") next = Math.min(100, cur + 10);
        if (e.key === "PageDown") next = Math.max(0, cur - 10);
        if (e.key === "Home") next = 0;
        if (e.key === "End") next = 100;
        if (next !== cur) {
          e.preventDefault();
          syncDialVisual(dial, next);
        }
      });
    });

    root.querySelectorAll(".lc-dial__range").forEach((range) => {
      range.addEventListener("input", () => {
        const wrap =
          range.closest(".lc-dial-modal-body, .zielpfad-result-dial, .zielpfad-modal") ||
          range.parentElement;
        const dial = wrap?.querySelector("[data-lc-dial]");
        if (!dial) return;
        syncDialVisual(dial, Number(range.value) || 0);
      });
    });

    root.querySelectorAll("[data-lc-dial-save]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const topicId = btn.dataset.topicId;
        const wrap =
          btn.closest(".lc-dial-modal-body, .zielpfad-result-dial, .zielpfad-modal") ||
          btn.parentElement;
        const dial = wrap?.querySelector(`[data-lc-dial][data-topic-id="${topicId}"]`);
        const pct = Number(dial?.getAttribute("aria-valuenow") ?? 0);
        state.modal = null;
        saveField(topicId, "levelcheckPercent", pct);
      });
    });
  }

  async function saveField(topicId, field, value) {
    state.saving =
      field.startsWith("grow") || field.startsWith("glow") || field.startsWith("nextGoal")
        ? `${topicId}_${field.replace("Text", "")}`
        : topicId;
    state.error = "";
    state.message = "";
    render();

    const body = { levelCheckId: topicId };
    body[field] = value;

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

      const topic = findTopic(topicId);
      if (topic) {
        if (field === "targetGradeKey") {
          topic.targetGrade = data.targetGrade;
          topic.targetGradeLabel = data.targetGradeLabel || formatGradeLabel(data.targetGrade);
        }
        if (field === "levelcheckPercent") {
          topic.levelcheckPercent = data.levelcheckPercent;
          topic.levelcheckPassed = !!data.levelcheckPassed;
          if (topic.xpAwarded) topic.xpAwarded.achievedGrade = true;
        }
        if (field === "achievedGradeKey") {
          topic.achievedGrade = data.achievedGrade;
          topic.achievedGradeLabel = data.achievedGradeLabel;
        }
        if (field === "growText") topic.grow = data.grow;
        if (field === "glowText") topic.glow = data.glow;
        if (field === "nextGoalText") topic.nextGoal = data.nextGoal;
        if (data.xpAwardedFlags && topic.xpAwarded) {
          Object.assign(topic.xpAwarded, {
            targetGrade: data.xpAwardedFlags.targetGrade,
            achievedGrade: data.xpAwardedFlags.achievedGrade,
            grow: data.xpAwardedFlags.grow,
            glow: data.xpAwardedFlags.glow,
            nextGoal: data.xpAwardedFlags.nextGoal
          });
        }
      }

      const label = feedbackFieldLabel(field);
      const unlockMsg =
        field === "levelcheckPercent" && data.levelcheckPercent != null
          ? ` · ${data.levelcheckPercent} % gespeichert`
          : "";
      state.message = `${label} gespeichert${unlockMsg}${buildXpMessage(data.xpDetails)}`;
      if (Number(data.xpAwarded) > 0 && typeof window.loadMe === "function") {
        await window.loadMe();
      }
      // Unlock-Status für alle Themen neu laden
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

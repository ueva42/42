/**
 * SRL-Logbuch – Zielsetzung / Mein Zielpfad (Zielnote, Aufgabenpfad, Reflexion, XP).
 * Fachliche Fortschritts- und Aufgabenzuordnung kommt aus der API (server.js).
 */
(function () {
  const CUSTOM_OPTION = "__custom__";
  const C = window.LogbuchConstants || {};
  const TARGET_GRADE_RULES = C.TARGET_GRADE_RULES || {};
  const LEVEL_CHECK_TIER_ORDER = C.LEVEL_CHECK_TIER_ORDER || ["rookie", "operator", "street_legend"];
  const LEVEL_CHECK_TIER_LABELS = C.LEVEL_CHECK_TIER_LABELS || {
    rookie: "Rookie",
    operator: "Operator",
    street_legend: "Street Legend"
  };
  const ZIELPFAD_PRIMARY_GRADES = C.ZIELPFAD_PRIMARY_GRADES || ["3", "2", "1"];
  const GRADE_ACCENTS = { 3: "#22d3ee", 2: "#a855f7", 1: "#f59e0b" };

  const state = {
    data: null,
    selectedSubject: "",
    loading: false,
    saving: null,
    modal: null,
    message: "",
    error: ""
  };

  let initPromise = null;
  let initGeneration = 0;
  let loadRequestId = 0;

  /** Zentrale Notenmatrix – nur über getGradeRequirements, keine eigene Matrix */
  function getGradeRequirements(targetGrade) {
    if (typeof C.getGradeRequirements === "function") {
      return C.getGradeRequirements(targetGrade);
    }
    const key = String(targetGrade ?? "")
      .trim()
      .replace(",", ".");
    const rules = TARGET_GRADE_RULES[key];
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

  function isTargetGradeMet(topic) {
    const target = parseGradeValue(topic?.targetGrade);
    const achieved = parseGradeValue(topic?.achievedGrade);
    if (target == null || achieved == null) return null;
    return achieved <= target;
  }

  function isCheckpointPast(topic) {
    if (!topic?.checkpointDate) return false;
    const today = new Date().toISOString().slice(0, 10);
    return topic.checkpointDate < today;
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

  function tierPathLabel(tier, requiredCount) {
    if (requiredCount > 0) return "Für dein Ziel empfohlen";
    if (tier === "operator") return "Nächste Herausforderung";
    return "Freiwillige Vertiefung";
  }

  function tierBadgeClassForItem(item) {
    const label = item?.pathLabel;
    if (label === "Für dein Ziel empfohlen" || label === "Dein Mindestweg") return "zielpfad-badge--minimum";
    if (label === "Nächste Herausforderung") return "zielpfad-badge--challenge";
    if (label === "Freiwillige Vertiefung" || label === "Bonus-Challenge") return "zielpfad-badge--bonus";
    return "zielpfad-badge--foundation";
  }

  function taskIsOpen(item) {
    return item && item.status !== "sicher" && item.status !== "geschafft";
  }

  function allWorkItemsForTopic(topic) {
    if (Array.isArray(topic?.allWorkItems) && topic.allWorkItems.length) {
      return topic.allWorkItems;
    }
    return topic?.workItems || [];
  }

  function pickChallengeNext(topic) {
    const open = allWorkItemsForTopic(topic).filter(
      (item) => item.pathSection === "voluntary" && taskIsOpen(item)
    );
    return open.find((item) => item.tier === "operator") || open.find((item) => item.tier === "street_legend") || null;
  }

  function pickMinimumNext(topic) {
    return (topic?.workItems || []).find(taskIsOpen) || null;
  }

  function renderMinimumPathHint(topic) {
    const profile = getGradeRequirements(topic?.targetGrade);
    if (!profile) {
      return "Alle Aufgaben sind jederzeit für dich sichtbar und erreichbar.";
    }
    const parts = [];
    for (const tier of LEVEL_CHECK_TIER_ORDER) {
      if (profile[tier] > 0) {
        parts.push(`${Math.round(profile[tier] * 100)} % ${LEVEL_CHECK_TIER_LABELS[tier]}`);
      }
    }
    if (!parts.length) {
      return `Zielnote ${formatGradeLabel(topic.targetGrade)}: Alle Level stehen dir zur freiwilligen Vertiefung offen.`;
    }
    return `Für Zielnote ${formatGradeLabel(topic.targetGrade)} empfohlen: ${parts.join(", ")}. Alle Level bleiben sichtbar und erreichbar.`;
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
    const topic = findTopic(topicId);
    return `
      <label class="zielpfad-result__select-wrap">
        <span class="zielpfad-result__select-label">Erreichte Note ${renderXpHint("achievedGrade", topic)}</span>
        <select
          class="zs-achieved-select zielpfad-result__select"
          data-topic-id="${escapeHtml(topicId)}"
          data-field="achievedGradeKey"
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

  function renderFeedbackSection(topic) {
    if (!topic.achievedGrade) return "";
    const V = window.LogbuchVisuals;
    if (!V) return "";

    const glowOptions = feedbackOptions("glow");
    const growOptions = feedbackOptions("grow");
    const nextOptions = feedbackOptions("nextGoal");

    function labelFor(fieldKey, value) {
      const options = fieldKey === "glow" ? glowOptions : fieldKey === "grow" ? growOptions : nextOptions;
      const raw = String(value ?? "");
      if (!raw) return "—";
      const found = options.find((o) => String(o.value) === raw);
      return found ? found.label : raw;
    }

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

    const targetLabel = formatGradeLabel(topic.targetGradeLabel || topic.targetGrade);
    const achievedLabel = formatGradeLabel(topic.achievedGradeLabel || topic.achievedGrade);

    return `
      <section class="zielpfad-eval">
        <h3 class="zielpfad-block__title">Deine Auswertung</h3>

        <div class="zielpfad-eval-grid">
          ${renderChoiceCard({
            fieldKey: "glow",
            title: "GLOW",
            question: "Was hat schon gut funktioniert und möchtest du beibehalten?",
            accent: "#22c55e",
            options: glowOptions
          })}
          ${renderChoiceCard({
            fieldKey: "grow",
            title: "GROW",
            question: "Woran kannst du noch wachsen?",
            accent: "#f97316",
            options: growOptions
          })}
          ${renderChoiceCard({
            fieldKey: "nextGoal",
            title: "NEXT",
            question: "Was machst du bei der nächsten Arbeit besser oder anders?",
            accent: "#a855f7",
            options: nextOptions
          })}
        </div>

        <article class="zielpfad-take-summary">
          <h4 class="zielpfad-take-summary__title">Das nehme ich mit</h4>
          <div class="zielpfad-take-summary__grid">
            <div class="zielpfad-take-item">
              <span>Zielnote</span>
              <strong>${escapeHtml(targetLabel)}</strong>
            </div>
            <div class="zielpfad-take-item">
              <span>Erreichte Note</span>
              <strong>${escapeHtml(achievedLabel)}</strong>
            </div>
            <div class="zielpfad-take-item">
              <span>Glow</span>
              <strong>${escapeHtml(labelFor("glow", topic.glow))}</strong>
            </div>
            <div class="zielpfad-take-item">
              <span>Grow</span>
              <strong>${escapeHtml(labelFor("grow", topic.grow))}</strong>
            </div>
            <div class="zielpfad-take-item">
              <span>Next</span>
              <strong>${escapeHtml(labelFor("nextGoal", topic.nextGoal))}</strong>
            </div>
          </div>
          <div class="zielpfad-take-summary__actions">
            <button type="button" class="zielpfad-btn" data-zs-noop-save-eval disabled>
              Auswertung speichern
            </button>
          </div>
        </article>
      </section>`;
  }

  function renderZielpfadHero(topic) {
    const subject = escapeHtml(state.selectedSubject || topic?.subject || "");
    const name = topic ? escapeHtml(topic.name) : "–";
    const typePart = topic?.checkpointTypeLabel ? `${escapeHtml(topic.checkpointTypeLabel)}` : "Check";
    const datePart = topic?.checkpointDateLabel
      ? `am ${escapeHtml(topic.checkpointDateLabel)}`
      : "Termin folgt";
    const hasTarget = !!topic?.targetGrade;
    const goalPart = hasTarget ? String(topic.targetGradeLabel || topic.targetGrade) : "Noch keine Zielnote festgelegt";

    return `
      <article class="plan-app-hero zielpfad-hero">
        <div class="plan-app-hero__content">
          <div class="plan-app-hero__icon" aria-hidden="true">
            <img src="/icons/student/png/zielsetzung.png" alt="" loading="lazy">
          </div>
          <div class="plan-app-hero__copy">
            <p class="plan-app-hero__eyebrow">Zielsetzung</p>
            <h2 class="plan-app-hero__title">Mein Zielpfad</h2>
            <p class="plan-app-hero__meta zielpfad-hero__sub">
              Sieh deinen Mindestweg – und alle Aufgaben, die du freiwillig weiter bearbeiten kannst.
            </p>
            ${
              topic
                ? `<p class="zielpfad-hero__exam">
                    <strong>${subject} · ${name}</strong><br>
                    ${typePart} ${datePart}<br>
                    <span class="zielpfad-hero__goal-label">DEINE ZIELNOTE</span>
                    <strong class="zielpfad-hero__goal-value">${escapeHtml(goalPart)}</strong>
                    <button
                      type="button"
                      class="zielpfad-btn zielpfad-btn--ghost zielpfad-btn--sm zielpfad-hero__goal-btn"
                      data-zs-open-grade-modal="target"
                      data-topic-id="${escapeHtml(topic.id)}"
                    >${topic?.targetGrade ? "Zielnote ändern" : "Zielnote festlegen"}</button>
                  </p>`
                : ""
            }
          </div>
        </div>
        <div class="plan-app-hero__visual zielpfad-hero__visual" aria-hidden="true">
          <img src="/icons/student/hero/zielsetzung-hero.png" alt="" loading="lazy">
        </div>
      </article>`;
  }

  function renderLevelCards(topic) {
    if (!topic) return "";
    if (!topic.targetGrade) {
      return `
        <section class="zielpfad-block">
          <h3 class="zielpfad-block__title">Dein Weg zur Zielnote</h3>
          <p class="zielpfad-block__sub">Lege zuerst oben eine Zielnote fest.</p>
        </section>`;
    }
    const profile = getGradeRequirements(topic.targetGrade);
    if (!profile) {
      return `
        <section class="zielpfad-block">
          <h3 class="zielpfad-block__title">Dein Weg zur Zielnote ${escapeHtml(formatGradeLabel(topic.targetGrade))}</h3>
          <p class="zielpfad-block__sub">Für die Zielnote ${escapeHtml(formatGradeLabel(topic.targetGrade))} sind noch keine Anforderungen hinterlegt.</p>
        </section>`;
    }

    const tierAccents = { rookie: "#22d3ee", operator: "#a855f7", street_legend: "#f59e0b" };
    let anyBeyond = false;
    const cards = LEVEL_CHECK_TIER_ORDER.map((tier) => {
      const p = levelProgressForTarget(topic, tier);
      if (p.goesBeyond) anyBeyond = true;
      const label = LEVEL_CHECK_TIER_LABELS[tier] || tier;
      const ringPct = p.isVoluntaryTier ? 0 : p.pctRequired || 0;
      const goalHint = p.isVoluntaryTier || !p.pctRequired
        ? "Freiwillige Vertiefung"
        : `${p.pctRequired} % für dein Ziel empfohlen`;
      return `
        <article class="grade-goal-card" style="--grade-accent:${tierAccents[tier]}">
          <div class="grade-goal-ring" style="--progress:${ringPct}; --accent:${tierAccents[tier]}">
            <div class="grade-goal-ring__inside">
              <span class="grade-goal-ring__grade">${escapeHtml(label)}</span>
              <strong>${p.isVoluntaryTier ? "–" : `${p.pctRequired} %`}</strong>
            </div>
          </div>
          <div class="grade-goal-card__text">
            <strong>${escapeHtml(label)}</strong>
            <span>${escapeHtml(goalHint)}</span>
            <span>Dein Stand: ${p.actualCurrent} von ${p.totalGoals} Aufgaben</span>
            <small>${p.actualPct} % geschafft${
              p.goesBeyond ? " · Stark – du gehst schon weiter!" : ""
            }</small>
          </div>
        </article>`;
    }).join("");

    return `
      <section class="zielpfad-block">
        <h3 class="zielpfad-block__title">Dein Mindestweg für Zielnote ${escapeHtml(formatGradeLabel(topic.targetGrade))}</h3>
        <p class="zielpfad-block__sub">Die Zielnote zeigt die Empfehlung – nicht deine Obergrenze. Alle Level bleiben sichtbar.</p>
        ${anyBeyond ? `<p class="zielpfad-beyond-hint">Stark – du gehst schon weiter!</p>` : ""}
        <div class="grade-goal-grid">${cards}</div>
      </section>`;
  }

  function renderTargetGradeModal() {
    if (!state.modal || state.modal.type !== "targetGrade") return "";
    const topic = findTopic(state.modal.topicId);
    if (!topic) return "";

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
    if (!state.modal || state.modal.type !== "achievedGrade") return "";
    const topic = findTopic(state.modal.topicId);
    if (!topic) return "";

    const options = gradeOptions();
    const selected = topic.achievedGrade != null ? String(topic.achievedGrade) : "";

    return `
      <div class="zielpfad-modal-backdrop" role="dialog" aria-modal="true" aria-label="Erreichte Note auswählen">
        <div class="zielpfad-modal">
          <div class="zielpfad-modal__head">
            <div class="zielpfad-modal__titles">
              <h3 class="zielpfad-modal__title">Erreichte Note auswählen</h3>
              <p class="zielpfad-modal__sub">Setze deine erreichte Note für den Check.</p>
            </div>
            <button type="button" class="zielpfad-modal__close" data-zs-close-grade-modal>Schließen</button>
          </div>

          <div class="zielpfad-grade-tile-grid">
            ${options
              .map((g) => {
                const val = String(g.value);
                const isSel = selected && val === selected;
                return `
                  <button
                    type="button"
                    class="zielpfad-grade-tile ${isSel ? "is-selected" : ""}"
                    data-zs-select-achieved-grade="1"
                    data-topic-id="${escapeHtml(topic.id)}"
                    data-grade="${escapeHtml(val)}"
                    aria-pressed="${isSel ? "true" : "false"}"
                  >
                    <span class="zielpfad-grade-tile__label">${escapeHtml(g.label)}</span>
                  </button>`;
              })
              .join("")}
          </div>

          <div class="zielpfad-modal__foot">
            <p class="zielpfad-modal__hint">Hinweis: XP wird pro Feld nur einmal vergeben.</p>
          </div>
        </div>
      </div>`;
  }

  function renderNextStep(topic) {
    if (!topic?.targetGrade) return "";

    const minimumNext = pickMinimumNext(topic);
    const challengeNext = pickChallengeNext(topic);
    const targetLabel = formatGradeLabel(topic.targetGradeLabel || topic.targetGrade);
    const primary = minimumNext || challengeNext;

    if (!primary) {
      if (topic.onTrack) {
        return `
          <section class="zielpfad-block zielpfad-next">
            <h3 class="zielpfad-block__title">Dein nächster sinnvoller Schritt</h3>
            <article class="zielpfad-next-card zielpfad-next-card--done">
              <p class="zielpfad-next-card__eyebrow">Empfehlung geschafft</p>
              <p class="zielpfad-next-card__text">Stark – du gehst schon weiter!</p>
              <p class="zielpfad-next-card__hint">Für Zielnote ${escapeHtml(targetLabel)} reicht dein Stand. Alle weiteren Aufgaben sind freiwillige Vertiefung.</p>
              <div class="zielpfad-actions">
                <button type="button" class="zielpfad-btn zielpfad-btn--ghost" data-zs-goto-levelplan>Zur Aufgabenübersicht</button>
              </div>
            </article>
          </section>`;
      }
      return `
        <section class="zielpfad-block zielpfad-next">
          <h3 class="zielpfad-block__title">Dein nächster sinnvoller Schritt</h3>
          <article class="zielpfad-next-card zielpfad-next-card--empty">
            <p class="zielpfad-next-card__text">Markiere deinen Fortschritt im Mein Lernstand – dann erscheint hier die nächste Aufgabe.</p>
            <div class="zielpfad-actions">
              <button type="button" class="zielpfad-btn" data-zs-goto-levelplan>Zur Aufgabenübersicht</button>
            </div>
          </article>
        </section>`;
    }

    return `
      <section class="zielpfad-block zielpfad-next">
        <h3 class="zielpfad-block__title">Dein nächster sinnvoller Schritt</h3>
        <article class="zielpfad-next-card">
          <p class="zielpfad-next-card__eyebrow">${escapeHtml(primary.pathLabel || primary.tierLabel)} · ${escapeHtml(primary.goalText)}</p>
          <p class="zielpfad-next-card__text">${escapeHtml(primary.taskText)}</p>
          <div class="zielpfad-actions">
            ${
              resolvePracticeUrl(primary.practiceUrl)
                ? `<button type="button" class="zielpfad-btn" data-zs-practice-url="${escapeHtml(resolvePracticeUrl(primary.practiceUrl))}">Übungsseite öffnen</button>`
                : `<button type="button" class="zielpfad-btn" data-zs-goto-levelplan>Zur Aufgabenübersicht</button>`
            }
            ${
              minimumNext && challengeNext
                ? `<button type="button" class="zielpfad-btn zielpfad-btn--ghost" data-zs-goto-levelplan>Eine Herausforderung ausprobieren</button>`
                : ""
            }
          </div>
        </article>
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
            <p class="zielpfad-open-card__text">Nichts mehr – dein empfohlener Anteil ist geschafft.${
              topic.onTrack ? " Stark – du kannst freiwillig weitergehen!" : ""
            }</p>
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
        <h4 class="zielpfad-goal-reached__title">Ziel erreicht – möchtest du weitergehen?</h4>
        <p class="zielpfad-goal-reached__text">Dein Mindestweg für Zielnote ${escapeHtml(formatGradeLabel(topic.targetGrade))} ist geschafft. Probiere freiwillig anspruchsvollere Aufgaben aus.</p>
      </article>`;
  }

  function sortWorkItemsByTier(items) {
    const order = { rookie: 0, operator: 1, street_legend: 2 };
    return items.slice().sort((a, b) => (order[a.tier] ?? 0) - (order[b.tier] ?? 0));
  }

  function renderTaskCard(item, index, topic) {
    const badge = item.pathLabel || tierPathLabel(item.tier, item.isMinimumPath ? 1 : 0);
    return `
      <article class="zielpfad-task-card zielpfad-task-card--${item.status === "sicher" ? "sicher" : item.status === "in_arbeit" ? "arbeit" : "offen"}">
        <div class="zielpfad-task-card__head">
          <span class="zielpfad-tier-badge">${escapeHtml(item.tierLabel)}</span>
          <span class="zielpfad-status ${statusBadgeForGoal(item.status)}">${escapeHtml(statusLabelForGoal(item.status))}</span>
        </div>
        <p class="zielpfad-task-card__text">${escapeHtml(item.taskText)}</p>
        <div class="zielpfad-task-card__meta">
          <span class="zielpfad-badge ${tierBadgeClassForItem(item)}">${escapeHtml(badge)}</span>
        </div>
        <div class="zielpfad-actions">
          <button type="button" class="zielpfad-btn zielpfad-btn--sm" data-zs-goto-levelplan>Aufgabe ansehen</button>
          ${renderPracticeLink(item.practiceUrl, "Übungsseite", "zielpfad-practice-link")}
        </div>
      </article>`;
  }

  function renderGoalPracticeBar(practiceUrl, goalText) {
    if (!resolvePracticeUrl(practiceUrl)) return "";
    const label = String(goalText || "").trim();
    return `
      <div class="zielpfad-goal-practice">
        ${label ? `<span class="zielpfad-goal-practice__label">${escapeHtml(label)}</span>` : ""}
        ${renderPracticeLink(practiceUrl, "Übungsseite öffnen", "zielpfad-btn zielpfad-btn--ghost zielpfad-btn--sm")}
      </div>`;
  }

  function renderGoalTasks(topic) {
    if (!topic?.targetGrade) return "";

    const allItems = allWorkItemsForTopic(topic);

    if (!allItems.length) {
      return `
        <section class="zielpfad-block">
          <h3 class="zielpfad-block__title">Alle Aufgaben</h3>
          <p class="zielpfad-block__sub">${escapeHtml(renderMinimumPathHint(topic))}</p>
          <article class="zielpfad-task-empty">
            <p>Für dieses Thema sind noch keine Aufgaben hinterlegt.</p>
          </article>
        </section>`;
    }

    const goalGroups = groupItemsByGoal(allItems);

    return `
      <section class="zielpfad-block">
        <h3 class="zielpfad-block__title">Alle Aufgaben</h3>
        <p class="zielpfad-block__sub">${escapeHtml(renderMinimumPathHint(topic))}</p>
        ${renderGoalReachedBanner(topic)}
        ${goalGroups
          .map((goalGroup) => {
            const sorted = sortWorkItemsByTier(goalGroup.items);
            const cards = sorted.map((item) => renderTaskCard(item, 0, topic)).join("");
            return `
              <div class="zielpfad-goal-cluster">
                <h4 class="zielpfad-goal-cluster__title">${escapeHtml(goalGroup.goalText)}</h4>
                ${renderGoalPracticeBar(goalGroup.practiceUrl, "")}
                <div class="zielpfad-task-grid zielpfad-task-grid--tiers">${cards}</div>
              </div>`;
          })
          .join("")}
      </section>`;
  }

  function renderGoalResultBadge(topic) {
    const met = isTargetGradeMet(topic);
    if (met === null) return "";
    return met
      ? `<span class="zs-goal-badge zs-goal-badge-met">Ziel erreicht ✓</span>`
      : `<span class="zs-goal-badge zs-goal-badge-missed">Ziel verfehlt</span>`;
  }

  function renderResultSection(topic) {
    if (!topic?.targetGrade) return "";

    const saving = state.saving === topic.id;
    const past = isCheckpointPast(topic);
    const targetLabel = formatGradeLabel(topic.targetGradeLabel || topic.targetGrade);
    const achievedLabel = topic.achievedGrade
      ? formatGradeLabel(topic.achievedGradeLabel || topic.achievedGrade)
      : null;
    const hasAchieved = !!topic.achievedGrade;

    let body = "";
    if (!past && !hasAchieved) {
      body = `<p class="zielpfad-result__pending">Ergebnis wird nach dem Check eingetragen.</p>`;
    } else {
      const diff =
        topic.achievedGrade && topic.targetGrade
          ? parseGradeValue(topic.achievedGrade) - parseGradeValue(topic.targetGrade)
          : null;
      const diffText =
        diff == null
          ? ""
          : diff === 0
            ? "Genau dein Ziel erreicht."
            : diff < 0
              ? `${Math.abs(diff)} Noten besser als dein Ziel.`
              : `${diff} Noten über deinem Ziel.`;

      body = `
        <div class="zielpfad-result-grid">
          <div class="zielpfad-result-stat">
            <span>Zielnote</span>
            <strong>${escapeHtml(targetLabel)}</strong>
          </div>
          <div class="zielpfad-result-stat">
            <span>Erreichte Note</span>
            <strong>${achievedLabel ? escapeHtml(achievedLabel) : "–"}</strong>
          </div>
        </div>
        ${diffText ? `<p class="zielpfad-result__diff">${escapeHtml(diffText)}</p>` : ""}
        ${renderGoalResultBadge(topic)}
        ${
          past && !hasAchieved
            ? `<div class="zielpfad-result__form">
                <button type="button" class="zielpfad-btn" data-zs-open-achieved-grade-modal data-topic-id="${escapeHtml(
                  topic.id
                )}" ${saving ? "disabled" : ""}>Ergebnis eintragen</button>
              </div>`
            : ""
        }
        ${renderFeedbackSection(topic)}`;
    }

    return `
      <section class="zielpfad-block zielpfad-result">
        <h3 class="zielpfad-block__title">Ergebnis nach dem Check</h3>
        <article class="zielpfad-result-card">${body}</article>
      </section>`;
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
          <p class="zielpfad-eval-card__question">Was hat schon gut funktioniert?</p>
          <div class="zielpfad-eval-card__value">${glow ? escapeHtml(glow) : "—"}</div>
        </article>
        <article class="zielpfad-eval-card zielpfad-eval-card--grow" style="--eval-accent:#f97316">
          <h4 class="zielpfad-eval-card__title">GROW</h4>
          <p class="zielpfad-eval-card__question">Woran kannst du noch wachsen?</p>
          <div class="zielpfad-eval-card__value">${grow ? escapeHtml(grow) : "—"}</div>
        </article>
        <article class="zielpfad-eval-card zielpfad-eval-card--next" style="--eval-accent:#a855f7">
          <h4 class="zielpfad-eval-card__title">NEXT</h4>
          <p class="zielpfad-eval-card__question">Was machst du bei der nächsten Arbeit anders?</p>
          <div class="zielpfad-eval-card__value">${nextGoal ? escapeHtml(nextGoal) : "—"}</div>
        </article>
      </div>`;
  }

  function renderArchivedTopicCard(topic) {
    const V = window.LogbuchVisuals;
    const datePart = topic.checkpointDateLabel
      ? escapeHtml(topic.checkpointDateLabel)
      : "ohne Termin";
    const typePart = topic.checkpointTypeLabel
      ? `${escapeHtml(topic.checkpointTypeLabel)} · `
      : "";
    const prog = topic.targetGrade ? topicTaskProgress(topic) : null;
    const pct =
      prog && prog.hasRecommended && prog.total > 0
        ? Math.round((prog.completed / prog.total) * 100)
        : null;
    const reflectionDone = topic.achievedGrade
      ? [topic.grow, topic.glow, topic.nextGoal].filter((v) => String(v ?? "").trim()).length
      : 0;

    return `
      <article class="zielpfad-archived-card" data-topic-id="${escapeHtml(topic.id)}">
        <div class="zielpfad-archived-card__main">
          <div class="zielpfad-archived-card__copy">
            <p class="zielpfad-archived-card__title">${escapeHtml(topic.name)}</p>
            <p class="zielpfad-archived-card__meta">${typePart}${datePart}</p>
            <div class="zielpfad-archived-card__grades">
              <span>Ziel: ${escapeHtml(topic.targetGradeLabel || "–")}</span>
              <span>Erreicht: ${escapeHtml(topic.achievedGradeLabel || "–")}</span>
            </div>
            ${renderGoalResultBadge(topic)}
            <p class="zielpfad-archived-card__reflection">
              Reflexion: ${reflectionDone}/3 ${reflectionDone === 3 ? "✓" : "offen"}
            </p>
          </div>
          ${
            V && pct != null
              ? V.circularProgress({
                  completed: prog.completed,
                  total: prog.total,
                  label: "Fortschritt",
                  size: 88,
                  accent: topic.onTrack ? "#22c55e" : "#f97316"
                })
              : ""
          }
        </div>
        <div class="zielpfad-archived-card__body" hidden>
          ${renderArchivedFeedback(topic)}
        </div>
        <div class="zielpfad-actions">
          <button type="button" class="zielpfad-btn zielpfad-btn--ghost zielpfad-btn--sm" data-zs-toggle-archived="${escapeHtml(topic.id)}">
            Auswertung ansehen
          </button>
        </div>
      </article>`;
  }

  function renderTopicZielpfad(topic) {
    return `
      <div class="zielpfad-topic" data-topic-id="${escapeHtml(topic.id)}">
        ${renderLevelCards(topic)}
        ${
          topic.targetGrade
            ? `${renderOpenForGoalCard(topic)}
               ${renderNextStep(topic)}
               ${renderGoalTasks(topic)}
               ${renderResultSection(topic)}`
            : ""
        }
      </div>`;
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
          heroSrc: "/icons/student/hero/zielsetzung-hero.png"
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
      : `<div class="student-card"><div class="card-content"><p class="goal-card__what">Für ${escapeHtml(state.selectedSubject)} ist noch keine anstehende Klassenarbeit hinterlegt.</p></div></div>`;

    const pastHtml = past.length
      ? V.sectionBlock(
          "Vergangene Arbeiten",
          `<div class="zielpfad-archived-grid">${past.map(renderArchivedTopicCard).join("")}</div>`
        )
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

    const group = visibleGroups()[0];
    const { upcoming } = group ? splitTopicsForSubject(group) : { upcoming: null };
    const modalHtml = renderTargetGradeModal();
    const achievedModalHtml = renderAchievedGradeModal();

    root.innerHTML =
      V?.pageShell(`
        <div class="zielpfad-app">
          ${renderZielpfadHero(upcoming)}
          ${renderSubjectToolbar()}
          ${state.message ? `<div class="logbuch-msg logbuch-msg-ok">${escapeHtml(state.message)}</div>` : ""}
          ${state.error ? `<div class="logbuch-msg logbuch-msg-error">${escapeHtml(state.error)}</div>` : ""}
          ${renderGrouped()}
          ${modalHtml}
          ${achievedModalHtml}
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
        state.modal = null;
        saveField(topicId, "targetGradeKey", grade);
      });
    });

    root.querySelectorAll("[data-zs-open-achieved-grade-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const topicId = btn.dataset.topicId;
        if (!topicId) return;
        state.modal = { type: "achievedGrade", topicId };
        state.message = "";
        render();
      });
    });

    root.querySelectorAll("[data-zs-select-achieved-grade]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const topicId = btn.dataset.topicId;
        const grade = btn.dataset.grade;
        if (!topicId || !grade) return;
        state.modal = null;
        saveField(topicId, "achievedGradeKey", grade);
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

    root.querySelectorAll("[data-zs-practice-url]").forEach((btn) => {
      btn.addEventListener("click", () => {
        followPracticeUrl(btn.dataset.zsPracticeUrl);
      });
    });

    root.querySelectorAll("[data-zs-toggle-archived]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest(".zielpfad-archived-card");
        const body = card?.querySelector(".zielpfad-archived-card__body");
        if (!body) return;
        const open = body.hidden;
        body.hidden = !open;
        btn.textContent = open ? "Auswertung schließen" : "Auswertung ansehen";
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
    state.saving =
      field.startsWith("grow") || field.startsWith("glow") || field.startsWith("nextGoal")
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

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
    message: "",
    error: ""
  };

  let initPromise = null;
  let initGeneration = 0;
  let loadRequestId = 0;

  /** Spiegel von server.js expandGradeRulesForDisplay – nur Anzeige */
  function expandGradeRulesForDisplay(rules) {
    if (!rules) return {};
    const out = { ...rules };
    if (out.street_legend != null) {
      out.operator = Math.max(out.operator ?? 0, 1);
      out.rookie = Math.max(out.rookie ?? 0, 1);
    } else if (out.operator != null) {
      out.rookie = Math.max(out.rookie ?? 0, 1);
    }
    return out;
  }

  /** Spiegel von server.js recommendedTierCounts – nur Anzeige für nicht gewählte Zielnoten */
  function recommendedTierCounts(totalGoals, targetGradeKey) {
    const total = Math.max(0, Number(totalGoals) || 0);
    const key = String(targetGradeKey ?? "").replace(",", ".");
    if (!key || !total || !TARGET_GRADE_RULES[key]) return null;

    const rules = expandGradeRulesForDisplay(TARGET_GRADE_RULES[key]);
    const out = {};
    for (const tier of LEVEL_CHECK_TIER_ORDER) {
      if (rules[tier] != null) {
        out[tier] = Math.ceil(total * rules[tier]);
      }
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

  function tierBadgeLabel(tier, targetGrade) {
    const target = String(targetGrade ?? "");
    if (tier === "rookie" || tier === "operator") return "Grundlage für Note 3";
    if (tier === "street_legend") {
      return target === "1" ? "Zusätzlich für Note 1" : "Zusätzlich für Note 2";
    }
    return "";
  }

  function tierBadgeClass(tier) {
    if (tier === "rookie" || tier === "operator") return "zielpfad-badge--foundation";
    return "zielpfad-badge--extra";
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

    return `
      <div class="zs-feedback zielpfad-reflection">
        <h5 class="zielpfad-block__title zielpfad-block__title--sm">Reflexion</h5>
        ${renderFeedbackField(topic, "grow", "Grow", "Worin willst du besser werden?")}
        ${renderFeedbackField(topic, "glow", "Glow", "Was hast du gut gemacht und willst beibehalten?")}
        ${renderFeedbackField(
          topic,
          "nextGoal",
          "Mein Ziel für die nächste Klassenarbeit",
          "Worauf konzentrierst du dich als Nächstes?"
        )}
      </div>`;
  }

  function renderZielpfadHero(topic) {
    const subject = escapeHtml(state.selectedSubject || topic?.subject || "");
    const name = topic ? escapeHtml(topic.name) : "–";
    const typePart = topic?.checkpointTypeLabel ? `${escapeHtml(topic.checkpointTypeLabel)}` : "Check";
    const datePart = topic?.checkpointDateLabel
      ? `am ${escapeHtml(topic.checkpointDateLabel)}`
      : "Termin folgt";
    const goalPart = topic?.targetGrade
      ? `Dein Ziel: Note ${escapeHtml(topic.targetGradeLabel || topic.targetGrade)}`
      : "Wähle deine Zielnote unten";

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
              Sieh, welche Aufgaben du für deine Zielnote noch brauchst.
            </p>
            ${
              topic
                ? `<p class="zielpfad-hero__exam">
                    <strong>${subject} · ${name}</strong><br>
                    ${typePart} ${datePart}<br>
                    <span class="zielpfad-hero__goal">${goalPart}</span>
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

  function renderGradeGoals(topic) {
    const V = window.LogbuchVisuals;
    if (!V || !topic) return "";

    const selected = topic.targetGrade != null ? String(topic.targetGrade) : "";
    const saving = state.saving === topic.id;

    const cards = ZIELPFAD_PRIMARY_GRADES.map((grade) => {
      const prog = gradeGoalProgress(topic, grade);
      return V.gradeGoalCard({
        grade,
        percentage: prog.percentage,
        completedTasks: prog.completedTasks,
        totalTasks: prog.totalTasks,
        openTasks: prog.openTasks,
        selected: selected === grade,
        accent: GRADE_ACCENTS[grade] || "#22d3ee",
        unavailable: prog.unavailable
      });
    }).join("");

    return `
      <section class="zielpfad-block">
        <h3 class="zielpfad-block__title">Deine Notenziele</h3>
        <div class="grade-goal-grid ${saving ? "is-saving" : ""}" role="group" aria-label="Zielnote wählen">
          ${cards}
        </div>
        ${
          !selected
            ? `<p class="zielpfad-hint">Tippe auf eine Zielnote – dann siehst du deinen Aufgabenpfad.</p>`
            : ""
        }
      </section>`;
  }

  function nextStepReason(item, targetGrade) {
    const badge = tierBadgeLabel(item.tier, targetGrade);
    if (badge.toLowerCase().includes("grundlage")) {
      return `Diese Grundlage brauchst du für deine Zielnote ${formatGradeLabel(targetGrade)}.`;
    }
    return `Diese Aufgabe gehört zu deinem Ziel: Note ${formatGradeLabel(targetGrade)}.`;
  }

  function renderNextStep(topic) {
    if (!topic?.targetGrade) return "";

    const items = topic.workItems || [];
    const next = items[0];

    if (!next) {
      if (topic.onTrack) {
        return `
          <section class="zielpfad-block zielpfad-next">
            <h3 class="zielpfad-block__title">Dein nächster Schritt</h3>
            <article class="zielpfad-next-card zielpfad-next-card--done">
              <p class="zielpfad-next-card__eyebrow">Alles geschafft</p>
              <p class="zielpfad-next-card__text">Du bist on track für Zielnote ${escapeHtml(topic.targetGradeLabel || topic.targetGrade)}.</p>
              <div class="zielpfad-actions">
                <button type="button" class="zielpfad-btn zielpfad-btn--ghost" data-zs-goto-levelplan>Mein Lernstand öffnen</button>
              </div>
            </article>
          </section>`;
      }
      return `
        <section class="zielpfad-block zielpfad-next">
          <h3 class="zielpfad-block__title">Dein nächster Schritt</h3>
          <article class="zielpfad-next-card zielpfad-next-card--empty">
            <p class="zielpfad-next-card__text">Für dieses Ziel ist aktuell kein nächster Schritt hinterlegt.</p>
            <p class="zielpfad-next-card__hint">Markiere deinen Fortschritt im Mein Lernstand – dann erscheinen hier die passenden Aufgaben.</p>
            <div class="zielpfad-actions">
              <button type="button" class="zielpfad-btn" data-zs-goto-levelplan>Mein Lernstand öffnen</button>
            </div>
          </article>
        </section>`;
    }

    return `
      <section class="zielpfad-block zielpfad-next">
        <h3 class="zielpfad-block__title">Dein nächster Schritt</h3>
        <article class="zielpfad-next-card">
          <p class="zielpfad-next-card__eyebrow">${escapeHtml(next.tierLabel)} · ${escapeHtml(next.goalText)}</p>
          <p class="zielpfad-next-card__text">${escapeHtml(next.taskText)}</p>
          <p class="zielpfad-next-card__why">${escapeHtml(nextStepReason(next, topic.targetGrade))}</p>
          <div class="zielpfad-actions">
            <button type="button" class="zielpfad-btn" data-zs-goto-levelplan>Jetzt weiterarbeiten</button>
          </div>
        </article>
      </section>`;
  }

  function renderWhatsMissingCard(topic) {
    if (!topic?.targetGrade) return "";

    const items = topic.workItems || [];
    const foundationOpen = items.filter((i) => i.tier === "rookie" || i.tier === "operator").length;
    const operatorOpen = items.filter((i) => i.tier === "operator").length;
    const streetOpen = items.filter((i) => i.tier === "street_legend").length;
    const prog = topicTaskProgress(topic);
    const pct =
      prog.hasRecommended && prog.total > 0
        ? Math.round((prog.completed / prog.total) * 100)
        : null;
    const openTotal = items.length;
    const proofsDone = Math.max(0, (topic.totalGoals || 0) - (topic.unmarked || 0));

    const stats = [
      { value: foundationOpen, label: foundationOpen === 1 ? "Grundlage offen" : "Grundlagen offen" },
      { value: operatorOpen, label: operatorOpen === 1 ? "Operator-Aufgabe offen" : "Operator-Aufgaben offen" },
      { value: streetOpen, label: streetOpen === 1 ? "Street-Legend-Aufgabe offen" : "Street-Legend-Aufgaben offen" },
      { value: proofsDone, label: "Nachweise im Lernstand" }
    ];

    const summaryLine =
      openTotal > 0
        ? `Für deine Zielnote fehlen noch ${openTotal} Aufgabe${openTotal === 1 ? "" : "n"}.`
        : topic.onTrack
          ? "Du bist on track – weiter so!"
          : "Markiere deinen Fortschritt im Mein Lernstand.";

    return `
      <section class="zielpfad-block">
        <h3 class="zielpfad-block__title">Was fehlt noch?</h3>
        <article class="zielpfad-missing-card ${topic.onTrack ? "is-ok" : ""}">
          <div class="zielpfad-missing-grid">
            ${stats
              .map(
                (s) => `
              <div class="zielpfad-missing-stat">
                <strong>${escapeHtml(s.value)}</strong>
                <span>${escapeHtml(s.label)}</span>
              </div>`
              )
              .join("")}
            ${
              pct != null
                ? `<div class="zielpfad-missing-stat zielpfad-missing-stat--accent">
                    <strong>${pct} %</strong>
                    <span>bis zur Zielnote</span>
                  </div>`
                : ""
            }
          </div>
          <p class="zielpfad-missing-summary">${escapeHtml(summaryLine)}</p>
          ${
            topic.summary && !topic.onTrack
              ? `<p class="zielpfad-missing-detail">${escapeHtml(topic.summary)}</p>`
              : ""
          }
        </article>
      </section>`;
  }

  function groupWorkItems(items, targetGrade) {
    const target = String(targetGrade ?? "");
    const foundation = items.filter((i) => i.tier === "rookie" || i.tier === "operator");
    const street = items.filter((i) => i.tier === "street_legend");
    const groups = [];

    if (foundation.length) {
      groups.push({
        title: "Grundlage für Zielnote 3",
        items: foundation
      });
    }

    if (street.length && (target === "2" || target === "1")) {
      groups.push({
        title:
          target === "1" ? "Zusätzlich für Zielnote 1" : "Zusätzlich für Zielnote 2",
        items: street
      });
    }

    if (!groups.length && items.length) {
      groups.push({ title: "Aufgaben für dein Ziel", items });
    }

    return groups;
  }

  function renderTaskCard(item, index, topic) {
    const badge = tierBadgeLabel(item.tier, topic.targetGrade);
    return `
      <article class="zielpfad-task-card zielpfad-task-card--${item.status === "sicher" ? "sicher" : item.status === "in_arbeit" ? "arbeit" : "offen"}">
        <div class="zielpfad-task-card__head">
          <span class="zielpfad-order-badge">${escapeHtml(taskOrderLabel(index))}</span>
          <span class="zielpfad-status ${statusBadgeForGoal(item.status)}">${escapeHtml(statusLabelForGoal(item.status))}</span>
        </div>
        <p class="zielpfad-task-card__subject">${escapeHtml(item.goalText)}</p>
        <p class="zielpfad-task-card__text">${escapeHtml(item.taskText)}</p>
        <div class="zielpfad-task-card__meta">
          <span class="zielpfad-tier-badge">${escapeHtml(item.tierLabel)}</span>
          <span class="zielpfad-badge ${tierBadgeClass(item.tier)}">${escapeHtml(badge)}</span>
        </div>
        <div class="zielpfad-actions">
          <button type="button" class="zielpfad-btn zielpfad-btn--sm" data-zs-goto-levelplan>Aufgabe starten</button>
        </div>
      </article>`;
  }

  function renderGoalTasks(topic) {
    if (!topic?.targetGrade) return "";

    const items = topic.workItems || [];
    const targetLabel = formatGradeLabel(topic.targetGradeLabel || topic.targetGrade);

    if (!items.length) {
      if (topic.onTrack) {
        return `
          <section class="zielpfad-block">
            <h3 class="zielpfad-block__title">Aufgaben für dein Ziel</h3>
            <p class="zielpfad-block__sub">Diese Aufgaben brauchst du für Zielnote ${escapeHtml(targetLabel)}.</p>
            <article class="zielpfad-task-empty zielpfad-task-empty--ok">
              <p>Du bist on track für Zielnote ${escapeHtml(targetLabel)} – alle nötigen Aufgaben sind geschafft.</p>
            </article>
          </section>`;
      }
      return `
        <section class="zielpfad-block">
          <h3 class="zielpfad-block__title">Aufgaben für dein Ziel</h3>
          <p class="zielpfad-block__sub">Diese Aufgaben brauchst du für Zielnote ${escapeHtml(targetLabel)}.</p>
          <article class="zielpfad-task-empty">
            <p>Markiere deine Fortschritte im Mein Lernstand – dann siehst du hier die passenden Aufgaben.</p>
            <div class="zielpfad-actions">
              <button type="button" class="zielpfad-btn" data-zs-goto-levelplan>Mein Lernstand öffnen</button>
            </div>
          </article>
        </section>`;
    }

    const groups = groupWorkItems(items, topic.targetGrade);
    let globalIndex = 0;

    return `
      <section class="zielpfad-block">
        <h3 class="zielpfad-block__title">Aufgaben für dein Ziel</h3>
        <p class="zielpfad-block__sub">Diese Aufgaben brauchst du für Zielnote ${escapeHtml(targetLabel)}.</p>
        ${groups
          .map((group) => {
            const cards = group.items
              .map((item) => {
                const card = renderTaskCard(item, globalIndex, topic);
                globalIndex += 1;
                return card;
              })
              .join("");
            return `
              <div class="zielpfad-task-group">
                <h4 class="zielpfad-task-group__title">${escapeHtml(group.title)}</h4>
                <div class="zielpfad-task-grid">${cards}</div>
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
    const achievedSelected =
      topic.achievedGrade != null ? String(topic.achievedGrade) : "";
    const past = isCheckpointPast(topic);
    const targetLabel = formatGradeLabel(topic.targetGradeLabel || topic.targetGrade);
    const achievedLabel = topic.achievedGrade
      ? formatGradeLabel(topic.achievedGradeLabel || topic.achievedGrade)
      : null;

    let body = "";
    if (!past && !topic.achievedGrade) {
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
        <div class="zielpfad-result__form">
          ${renderAchievedGradeSelect(topic.id, achievedSelected, saving)}
        </div>
        ${renderFeedbackSection(topic)}`;
    }

    return `
      <section class="zielpfad-block zielpfad-result">
        <h3 class="zielpfad-block__title">Ergebnis nach dem Check</h3>
        <article class="zielpfad-result-card">${body}</article>
      </section>`;
  }

  function renderArchivedFeedback(topic) {
    const rows = [
      ["Grow", topic.grow, "Worin wolltest du besser werden?"],
      ["Glow", topic.glow, "Was hast du gut gemacht?"],
      ["Ziel für nächste Klassenarbeit", topic.nextGoal, "Dein Fokus für das nächste Mal"]
    ].filter(([, value]) => String(value ?? "").trim());

    if (!rows.length) return "";

    return `
      <div class="zs-feedback zs-feedback-archived zielpfad-archived-reflection">
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
        ${renderGradeGoals(topic)}
        ${
          topic.targetGrade
            ? `${renderNextStep(topic)}
               ${renderWhatsMissingCard(topic)}
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

    root.innerHTML =
      V?.pageShell(`
        <div class="zielpfad-app">
          ${renderZielpfadHero(upcoming)}
          ${renderSubjectToolbar()}
          ${state.message ? `<div class="logbuch-msg logbuch-msg-ok">${escapeHtml(state.message)}</div>` : ""}
          ${state.error ? `<div class="logbuch-msg logbuch-msg-error">${escapeHtml(state.error)}</div>` : ""}
          ${renderGrouped()}
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

    root.querySelectorAll("[data-grade-goal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const grade = btn.dataset.gradeGoal;
        const group = visibleGroups()[0];
        const { upcoming } = group ? splitTopicsForSubject(group) : { upcoming: null };
        if (!upcoming || state.saving) return;
        if (String(upcoming.targetGrade) === grade) return;
        saveField(upcoming.id, "targetGradeKey", grade);
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

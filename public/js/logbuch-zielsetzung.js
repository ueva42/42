/**
 * SRL-Logbuch – Zielsetzung (Zielnote, Reflexion Grow/Glow/Ziel, XP).
 */
(function () {
  const CUSTOM_OPTION = "__custom__";

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

  function renderTierBar(tier, totalGoals) {
    const current = tier.current ?? 0;
    const recommended = tier.recommended;
    const hasTarget = recommended != null && totalGoals > 0;
    const pct = totalGoals ? Math.min(100, Math.round((current / totalGoals) * 100)) : 0;
    const recPct =
      hasTarget ? Math.min(100, Math.round((recommended / totalGoals) * 100)) : null;
    const statusClass = hasTarget
      ? tier.onTrack
        ? "zs-tier-ontrack"
        : "zs-tier-behind"
      : "zs-tier-info";

    const countLabel = hasTarget
      ? `${current} / ${recommended} von ${totalGoals}${tier.remaining > 0 ? ` · noch ${tier.remaining}` : " · ✓"}`
      : `${current} von ${totalGoals}`;

    return `
      <div class="zs-tier-row ${statusClass}">
        <div class="zs-tier-head">
          <span class="zs-tier-label">${escapeHtml(tier.label)}</span>
          <span class="zs-tier-count">${countLabel}</span>
        </div>
        <div class="zs-tier-bar">
          <div class="zs-tier-fill" style="width:${pct}%"></div>
          ${recPct != null ? `<div class="zs-tier-marker" style="left:${recPct}%"></div>` : ""}
        </div>
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
      <article class="zs-topic-card zs-topic-card-archived" data-topic-id="${escapeHtml(topic.id)}">
        <div class="zs-topic-head">
          <div>
            <span class="zs-archived-badge">Vergangen</span>
            <h4 class="zs-topic-title">${escapeHtml(topic.name)}</h4>
            <p class="zs-topic-meta">${typePart}${datePart} · ${topic.totalGoals} Unterthemen</p>
          </div>
          <div class="zs-archived-grades">
            <div><span class="zs-archived-grade-label">Zielnote</span> ${escapeHtml(topic.targetGradeLabel || "–")}</div>
            <div><span class="zs-archived-grade-label">Erreicht</span> ${escapeHtml(topic.achievedGradeLabel || "–")}</div>
            ${renderGoalResultBadge(topic)}
          </div>
        </div>
        ${renderArchivedFeedback(topic)}
      </article>`;
  }

  function renderTopicCard(topic) {
    const saving = state.saving === topic.id;
    const targetSelected = topic.targetGrade != null ? String(topic.targetGrade) : "";
    const achievedSelected =
      topic.achievedGrade != null ? String(topic.achievedGrade) : "";

    return `
      <article class="zs-topic-card" data-topic-id="${escapeHtml(topic.id)}">
        <div class="zs-topic-head">
          <div>
            <h4 class="zs-topic-title">${escapeHtml(topic.name)}</h4>
            <p class="zs-topic-meta">${topic.totalGoals} Unterthemen</p>
          </div>
          <div class="zs-grade-row">
            ${renderGradeSelect(topic.id, "target", targetSelected, saving)}
            ${renderGradeSelect(topic.id, "achieved", achievedSelected, saving)}
          </div>
        </div>

        ${
          topic.targetGrade
            ? `<div class="zs-tiers">
                ${(topic.tiers || []).map((tier) => renderTierBar(tier, topic.totalGoals)).join("")}
              </div>`
            : `<p class="zs-topic-hint zs-topic-hint-muted">Wähle deine Zielnote – die Balken zeigen Rookie, Operator und Street Legend.</p>`
        }

        ${renderFeedbackSection(topic)}

        ${
          topic.unmarked
            ? `<p class="zs-unmarked">${topic.unmarked} Unterthema${topic.unmarked === 1 ? "" : "n"} noch ohne Markierung im Levelplan</p>`
            : ""
        }
      </article>`;
  }

  function renderUpcomingBanner() {
    if (!state.selectedSubject) return "";
    const upcoming = upcomingTopicMeta();
    if (!upcoming) {
      return `<div class="zs-upcoming-banner zs-upcoming-banner-muted">Für ${escapeHtml(state.selectedSubject)} ist noch keine anstehende Klassenarbeit hinterlegt.</div>`;
    }
    const datePart = upcoming.checkpointDateLabel
      ? ` · ${escapeHtml(upcoming.checkpointDateLabel)}`
      : " · Termin folgt";
    const typePart = upcoming.checkpointTypeLabel
      ? `<span class="zs-upcoming-type">${escapeHtml(upcoming.checkpointTypeLabel)}</span> · `
      : "";
    return `
      <div class="zs-upcoming-banner">
        ${typePart}Anstehend: <strong>${escapeHtml(upcoming.name)}</strong>${datePart}
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

    const pct = topics ? Math.round((withTarget / topics) * 100) : 0;

    return V.progressPanel({
      radial: V.radialProgress(pct, `${withTarget}/${topics}`, "Ziele gesetzt"),
      stats: V.statCards([
        { value: topics, label: "Themen", accent: true },
        { value: withTarget, label: "Mit Zielnote" },
        { value: onTrack, label: "On Track" },
        { value: state.selectedSubject || "–", label: "Fach" }
      ])
    });
  }

  function renderSubjectToolbar() {
    const subjects = availableSubjects();
    if (!subjects.length) return "";

    return `
      <div class="zs-toolbar">
        <label>
          Fach <span class="zs-required">*</span>
          <select id="zsSubjectSelect" class="zs-subject-select" required>
            <option value="" ${!state.selectedSubject ? "selected" : ""}>– Fach wählen –</option>
            ${subjects
              .map(
                (s) =>
                  `<option value="${escapeHtml(s)}" ${state.selectedSubject === s ? "selected" : ""}>${escapeHtml(s)}</option>`
              )
              .join("")}
          </select>
        </label>
      </div>`;
  }

  function renderLoadError() {
    return `
      <div class="lc-empty">
        <p>Zielsetzung konnte nicht geladen werden.</p>
        <p class="lc-empty-hint">Bitte erneut versuchen – manchmal hilft ein kurzer Moment oder Tab-Wechsel.</p>
        <button type="button" class="btn-primary zs-retry-btn" id="zsRetryBtn">Erneut laden</button>
      </div>`;
  }

  function renderGrouped() {
    if (!state.data?.hasClass) {
      return `<div class="lc-empty"><p>Dir ist noch keine Klasse zugeordnet.</p></div>`;
    }

    if (!state.selectedSubject) {
      return `
        <div class="lc-empty">
          <p>Bitte wähle zuerst ein Fach.</p>
          <p class="lc-empty-hint">Danach siehst du die anstehende Klassenarbeit und darunter vergangene Arbeiten.</p>
        </div>`;
    }

    const groups = visibleGroups();
    if (!state.data?.grouped?.length) {
      return `
        <div class="lc-empty">
          <p>Noch keine Themen.</p>
          <p class="lc-empty-hint">Sobald deine Lehrkraft im Levelstatus Themen anlegt, kannst du hier deine Zielnote setzen.</p>
        </div>`;
    }

    const group = groups[0];
    if (!group) {
      return `
        <div class="lc-empty">
          <p>Für ${escapeHtml(state.selectedSubject)} gibt es noch kein Klassenarbeit-Thema.</p>
          <p class="lc-empty-hint">Deine Lehrkraft legt Themen im Levelstatus an – Termine im Checkpoint-Plan.</p>
        </div>`;
    }

    const { upcoming, past } = splitTopicsForSubject(group);
    if (!upcoming && !past.length) {
      return `
        <div class="lc-empty">
          <p>Für ${escapeHtml(state.selectedSubject)} gibt es noch kein Klassenarbeit-Thema.</p>
          <p class="lc-empty-hint">Deine Lehrkraft legt Themen im Levelstatus an – Termine im Checkpoint-Plan.</p>
        </div>`;
    }

    const upcomingHtml = upcoming
      ? `<section class="zs-section zs-section-upcoming">
          <h3 class="zs-section-title">Anstehende Klassenarbeit</h3>
          ${renderTopicCard(upcoming)}
        </section>`
      : "";

    const pastHtml = past.length
      ? `<section class="zs-section zs-section-past">
          <h3 class="zs-section-title">Vergangene Arbeiten</h3>
          <div class="zs-topics">
            ${past.map(renderArchivedTopicCard).join("")}
          </div>
        </section>`
      : "";

    return `${upcomingHtml}${pastHtml}`;
  }

  function render() {
    const root = document.getElementById("zielsetzung-screen-root");
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="logbuch-loading">Lade Zielsetzung…</div>`;
      return;
    }

    if (!state.data) {
      root.innerHTML = renderLoadError();
      root.querySelector("#zsRetryBtn")?.addEventListener("click", () => {
        state.error = "";
        loadData(initGeneration);
      });
      return;
    }

    root.innerHTML = `
      <div class="student-page lc-shell zs-shell">
        ${renderSummaryPanel()}
        ${renderSubjectToolbar()}
        ${renderUpcomingBanner()}
        ${state.message ? `<div class="logbuch-msg logbuch-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="logbuch-msg logbuch-msg-error">${escapeHtml(state.error)}</div>` : ""}
        ${renderGrouped()}
      </div>`;

    bindHandlers(root);
  }

  function bindHandlers(root) {
    root.querySelector("#zsSubjectSelect")?.addEventListener("change", (e) => {
      state.selectedSubject = e.target.value;
      state.message = "";
      render();
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

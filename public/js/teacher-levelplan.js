/**
 * Lehrkraft – Levelplan (importierter Plan + Übungsseiten pro Unterthema).
 */
(function () {
  const FALLBACK_SUBJECTS = [
    "Mathe",
    "Deutsch",
    "BNT",
    "Englisch",
    "Geo",
    "Geschichte",
    "Projekt",
    "Physik",
    "Chemie",
    "Biologie",
    "AES",
    "Technik",
    "Französisch",
    "GK",
    "Musik",
    "BK",
    "WBS",
    "Religion/Ethik"
  ];

  const state = {
    classId: null,
    subject: null,
    data: null,
    loading: false,
    error: "",
    editingGoalId: null,
    draftUrls: {},
    savingGoalId: null,
    goalMessage: "",
    goalError: ""
  };

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sameId(a, b) {
    return String(a) === String(b);
  }

  function normalizePracticeUrlInput(raw) {
    if (raw == null) return "";
    return String(raw).trim();
  }

  function isValidPracticeUrl(url) {
    const value = normalizePracticeUrlInput(url);
    if (!value) return false;
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
      return Boolean(parsed.hostname);
    } catch {
      return false;
    }
  }

  function practiceUrlStatus(url) {
    const trimmed = normalizePracticeUrlInput(url);
    if (!trimmed) return { tone: "none", label: "Kein Link", icon: "○" };
    if (isValidPracticeUrl(trimmed)) return { tone: "ok", label: "Link hinterlegt", icon: "✓" };
    return { tone: "bad", label: "Ungültig", icon: "!" };
  }

  function renderPracticeStatusBadge(url) {
    const status = practiceUrlStatus(url);
    return `<span class="kr-practice-status kr-practice-status--${status.tone}" title="${escapeHtml(status.label)}"><span class="kr-practice-status__icon" aria-hidden="true">${status.icon}</span> ${escapeHtml(status.label)}</span>`;
  }

  function draftForGoal(goal) {
    if (state.draftUrls[goal.id] != null) return state.draftUrls[goal.id];
    return goal.practiceUrl || "";
  }

  function subjectsList() {
    const fromApi = state.data?.subjects;
    return Array.isArray(fromApi) && fromApi.length ? fromApi : FALLBACK_SUBJECTS;
  }

  function topicSortTime(topic) {
    if (!topic?.createdAt) return 0;
    const t = new Date(topic.createdAt).getTime();
    return Number.isFinite(t) ? t : 0;
  }

  function topicsForSubject() {
    return (state.data?.levelChecks || [])
      .filter((lc) => lc.subject === state.subject)
      .slice()
      .sort((a, b) => {
        const byDate = topicSortTime(b) - topicSortTime(a);
        if (byDate !== 0) return byDate;
        return (b.sortOrder ?? 0) - (a.sortOrder ?? 0);
      });
  }

  function formatTopicDate(topic) {
    if (!topic?.createdAt) return "";
    const d = new Date(topic.createdAt);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function findGoal(goalId) {
    for (const topic of state.data?.levelChecks || []) {
      const goal = (topic.goals || []).find((g) => sameId(g.id, goalId));
      if (goal) return goal;
    }
    return null;
  }

  function renderPracticeEditor(goal) {
    const draft = draftForGoal(goal);
    const status = practiceUrlStatus(draft);
    const isSaving = state.savingGoalId === String(goal.id);
    const testDisabled = !isValidPracticeUrl(draft);

    return `
      <tr class="kr-practice-edit-row">
        <td colspan="5">
          <div class="kr-practice-card">
            <div class="kr-practice-card__head">
              <h4>Übungsseite</h4>
              <p class="hint">Ein Link pro Unterthema – wird im Schülerbereich auf „Mein Zielpfad“ verwendet.</p>
            </div>
            <label class="kr-practice-card__field">
              <span>Link zur Übungsseite</span>
              <input
                type="url"
                class="kr-practice-input"
                data-goal-id="${escapeHtml(goal.id)}"
                placeholder="https://..."
                value="${escapeHtml(draft)}"
                spellcheck="false"
                autocomplete="url"
              >
            </label>
            <div class="kr-practice-card__meta">
              ${renderPracticeStatusBadge(draft)}
              ${state.goalError && sameId(state.editingGoalId, goal.id) ? `<span class="kr-practice-card__err">${escapeHtml(state.goalError)}</span>` : ""}
              ${state.goalMessage && sameId(state.editingGoalId, goal.id) ? `<span class="kr-practice-card__ok">${escapeHtml(state.goalMessage)}</span>` : ""}
            </div>
            <div class="kr-practice-card__actions">
              <button
                type="button"
                class="kr-practice-btn kr-practice-btn--ghost"
                data-kr-test-url="${escapeHtml(goal.id)}"
                ${testDisabled ? "disabled" : ""}
              >Link testen</button>
              <button
                type="button"
                class="kr-practice-btn"
                data-kr-save-url="${escapeHtml(goal.id)}"
                ${isSaving ? "disabled" : ""}
              >${isSaving ? "Speichern…" : "Speichern"}</button>
              <button
                type="button"
                class="kr-practice-btn kr-practice-btn--ghost"
                data-kr-clear-url="${escapeHtml(goal.id)}"
                ${isSaving ? "disabled" : ""}
              >Entfernen</button>
              <button type="button" class="kr-practice-btn kr-practice-btn--ghost" data-kr-cancel-edit="${escapeHtml(goal.id)}">Schließen</button>
            </div>
          </div>
        </td>
      </tr>`;
  }

  function renderTopicBlock(topic) {
    const goals = topic.goals || [];
    const dateLabel = formatTopicDate(topic);

    if (!goals.length) {
      return `
        <div class="kr-topic-block">
          <h3>${escapeHtml(topic.name)}${dateLabel ? ` <span class="hint">(${dateLabel})</span>` : ""}</h3>
          <p class="tc-empty">Noch keine Unterthemen in diesem Thema.</p>
        </div>`;
    }

    const rows = goals
      .map((goal) => {
        const isEditing = sameId(state.editingGoalId, goal.id);
        const row = `
      <tr>
        <td>${escapeHtml(goal.text)}</td>
        <td>${escapeHtml(goal.rookieGoalText || "–")}</td>
        <td>${escapeHtml(goal.operatorGoalText || "–")}</td>
        <td>${escapeHtml(goal.streetLegendGoalText || "–")}</td>
        <td class="kr-practice-cell">
          ${renderPracticeStatusBadge(goal.practiceUrl)}
          <button type="button" class="kr-practice-edit-btn" data-kr-edit-goal="${escapeHtml(goal.id)}">
            ${isEditing ? "Bearbeiten…" : "Bearbeiten"}
          </button>
        </td>
      </tr>`;
        return isEditing ? row + renderPracticeEditor(goal) : row;
      })
      .join("");

    return `
      <div class="kr-topic-block">
        <h3>${escapeHtml(topic.name)}${dateLabel ? ` <span class="hint">(${dateLabel})</span>` : ""}</h3>
        <p class="hint">${goals.length} Unterthemen</p>
        <div class="lpi-table-scroll">
          <table class="lpi-table kr-goals-table">
            <thead>
              <tr>
                <th>Unterthema (Was-Ziel)</th>
                <th>Rookie</th>
                <th>Operator</th>
                <th>Street Legend</th>
                <th>Übungsseite</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function renderContent() {
    const topics = topicsForSubject();
    if (!topics.length) {
      return `
        <div class="tc-empty">
          <p>Für ${escapeHtml(state.subject)} wurde noch kein Levelplan importiert.</p>
          <p class="hint">Nutze „Levelplan importieren“, um Themen und Zielstufen anzulegen.</p>
        </div>`;
    }

    return topics.map(renderTopicBlock).join("");
  }

  function render() {
    const root = document.getElementById("levelplanTabRoot");
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="tc-loading">Lade Levelplan…</div>`;
      return;
    }

    if (!state.data) {
      root.innerHTML = `<div class="tc-error">${escapeHtml(state.error || "Levelplan konnte nicht geladen werden.")}</div>`;
      return;
    }

    const subjectOptions = subjectsList()
      .map(
        (s) =>
          `<option value="${escapeHtml(s)}" ${s === state.subject ? "selected" : ""}>${escapeHtml(s)}</option>`
      )
      .join("");

    root.innerHTML = `
      <div class="panel">
        <h2>Levelplan</h2>
        <p class="hint">
          Übersicht über importierte Themen und Zielstufen (Rookie, Operator, Street Legend).
          Pro Unterthema kann optional eine Übungsseite hinterlegt werden.
        </p>

        <div class="tc-toolbar">
          <label>Klasse:
            <select id="lpClassSelect"></select>
          </label>
          <label>Fach:
            <select id="lpSubjectSelect">${subjectOptions}</select>
          </label>
        </div>

        ${state.error ? `<div class="tc-msg tc-msg-err">${escapeHtml(state.error)}</div>` : ""}

        ${renderContent()}
      </div>`;

    fillClassSelect(root);
    bindHandlers(root);
  }

  function fillClassSelect(root) {
    const sel = root.querySelector("#lpClassSelect");
    if (!sel || !window.__lpClasses) return;
    sel.innerHTML = window.__lpClasses
      .map(
        (c) =>
          `<option value="${c.id}" ${sameId(c.id, state.classId) ? "selected" : ""}>${escapeHtml(c.name)}</option>`
      )
      .join("");
  }

  function setDraft(goalId, value) {
    state.draftUrls[goalId] = value;
  }

  function openEditor(goalId) {
    const goal = findGoal(goalId);
    if (!goal) return;
    state.editingGoalId = goalId;
    state.goalMessage = "";
    state.goalError = "";
    if (state.draftUrls[goalId] == null) {
      state.draftUrls[goalId] = goal.practiceUrl || "";
    }
    render();
  }

  function closeEditor() {
    state.editingGoalId = null;
    state.goalMessage = "";
    state.goalError = "";
    render();
  }

  async function savePracticeUrl(goalId, value) {
    const trimmed = normalizePracticeUrlInput(value);
    if (trimmed && !isValidPracticeUrl(trimmed)) {
      state.goalError = "Bitte gib eine vollständige Webadresse ein.";
      state.goalMessage = "";
      render();
      return;
    }

    state.savingGoalId = String(goalId);
    state.goalError = "";
    state.goalMessage = "";
    render();

    try {
      const res = await fetch(`/api/teacher/levelcheck-goals/${encodeURIComponent(goalId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ practiceUrl: trimmed || null })
      });
      const data = await res.json();
      state.savingGoalId = null;

      if (!res.ok || !data.success) {
        state.goalError = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }

      const goal = findGoal(goalId);
      if (goal) goal.practiceUrl = data.goal?.practiceUrl || null;
      state.draftUrls[goalId] = data.goal?.practiceUrl || "";
      state.goalMessage = trimmed ? "Übungsseite gespeichert." : "Link entfernt.";
      state.goalError = "";
      render();
    } catch (err) {
      console.error(err);
      state.savingGoalId = null;
      state.goalError = "Netzwerkfehler beim Speichern.";
      render();
    }
  }

  function bindHandlers(root) {
    root.querySelector("#lpClassSelect")?.addEventListener("change", (e) => {
      state.classId = Number(e.target.value);
      state.editingGoalId = null;
      state.draftUrls = {};
      state.goalMessage = "";
      state.goalError = "";
      state.error = "";
      loadData();
    });

    root.querySelector("#lpSubjectSelect")?.addEventListener("change", (e) => {
      state.subject = e.target.value;
      state.editingGoalId = null;
      state.draftUrls = {};
      state.goalMessage = "";
      state.goalError = "";
      render();
    });

    root.querySelectorAll("[data-kr-edit-goal]").forEach((btn) => {
      btn.addEventListener("click", () => openEditor(btn.dataset.krEditGoal));
    });

    root.querySelectorAll("[data-kr-cancel-edit]").forEach((btn) => {
      btn.addEventListener("click", closeEditor);
    });

    root.querySelectorAll(".kr-practice-input").forEach((input) => {
      input.addEventListener("input", () => {
        setDraft(input.dataset.goalId, input.value);
        const card = input.closest(".kr-practice-card");
        const meta = card?.querySelector(".kr-practice-card__meta");
        const testBtn = card?.querySelector("[data-kr-test-url]");
        const draft = normalizePracticeUrlInput(input.value);
        if (meta) {
          const existing = meta.querySelector(".kr-practice-status");
          if (existing) existing.outerHTML = renderPracticeStatusBadge(draft);
        }
        if (testBtn) testBtn.disabled = !isValidPracticeUrl(draft);
      });
    });

    root.querySelectorAll("[data-kr-test-url]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const goalId = btn.dataset.krTestUrl;
        const draft = normalizePracticeUrlInput(draftForGoal({ id: goalId }));
        if (!isValidPracticeUrl(draft)) return;
        window.open(draft, "_blank", "noopener,noreferrer");
      });
    });

    root.querySelectorAll("[data-kr-save-url]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const goalId = btn.dataset.krSaveUrl;
        const input = root.querySelector(`.kr-practice-input[data-goal-id="${goalId}"]`);
        savePracticeUrl(goalId, input?.value ?? draftForGoal({ id: goalId }));
      });
    });

    root.querySelectorAll("[data-kr-clear-url]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const goalId = btn.dataset.krClearUrl;
        setDraft(goalId, "");
        savePracticeUrl(goalId, "");
      });
    });
  }

  async function loadClasses() {
    const r = await fetch("/api/class");
    const payload = await r.json();
    if (!r.ok || !Array.isArray(payload)) {
      throw new Error(payload?.error || "Klassen konnten nicht geladen werden.");
    }
    window.__lpClasses = payload;
    return payload;
  }

  async function loadData() {
    if (!state.classId) return;

    state.loading = true;
    if (!state.data) render();

    try {
      const params = new URLSearchParams({ classId: String(state.classId) });
      const res = await fetch(`/api/teacher/levelchecks?${params}`);
      const payload = await res.json();

      if (!res.ok) {
        state.loading = false;
        state.data = null;
        state.error = payload.error || "Laden fehlgeschlagen.";
        render();
        return;
      }

      state.data = payload;
      if (!state.subject || !subjectsList().includes(state.subject)) {
        state.subject = subjectsList()[0] || null;
      }
      state.loading = false;
      state.error = "";
      render();
    } catch (err) {
      console.error(err);
      state.loading = false;
      state.data = null;
      state.error = "Netzwerkfehler beim Laden.";
      render();
    }
  }

  async function init() {
    state.error = "";
    const root = document.getElementById("levelplanTabRoot");
    if (root) root.innerHTML = `<div class="tc-loading">Lade Levelplan…</div>`;

    try {
      const classes = await loadClasses();
      if (!classes.length) {
        if (root) {
          root.innerHTML = `<div class="tc-empty">Bitte zuerst eine Klasse anlegen.</div>`;
        }
        return;
      }

      if (!state.classId || !classes.some((c) => sameId(c.id, state.classId))) {
        state.classId = Number(classes[0].id);
      }

      await loadData();
    } catch (err) {
      console.error(err);
      if (root) {
        root.innerHTML = `<div class="tc-error">${escapeHtml(err.message || "Fehler beim Laden.")}</div>`;
      }
    }
  }

  window.TeacherLevelplan = { init };
})();

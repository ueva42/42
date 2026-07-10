/**
 * Lehrkraft – Termine (anstehende Nachweise einsehen).
 */
(function () {
  const TYPE_ORDER = ["klassenarbeit", "test", "praesentation", "custom"];

  const state = {
    classId: null,
    subjectFilter: "",
    data: null,
    loading: false,
    message: "",
    error: ""
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

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function isoToGerman(iso) {
    const value = String(iso || "").trim();
    if (!value) return "";
    const [y, m, d] = value.split("-");
    if (!y || !m || !d) return "";
    return `${d.padStart(2, "0")}.${m.padStart(2, "0")}.${y}`;
  }

  function subjectsList() {
    const fromApi = state.data?.subjects;
    return Array.isArray(fromApi) ? fromApi : [];
  }

  function typeLabelFor(type, customLabel, options) {
    if (type === "custom" && customLabel) return customLabel;
    const match = (options || []).find((o) => o.value === type);
    return match?.label || "Klassenarbeit";
  }

  function normalizeType(cp) {
    const type = cp?.checkpointType || "klassenarbeit";
    return type === "test" || type === "praesentation" || type === "custom" ? type : "klassenarbeit";
  }

  function linkedGoalLabels(cp, levelChecks) {
    const ids = new Set(
      (Array.isArray(cp.linkedSubtopicIds) ? cp.linkedSubtopicIds : []).map((id) => String(id))
    );
    const labels = [];
    for (const topic of levelChecks || []) {
      for (const goal of topic.goals || []) {
        if (ids.has(String(goal.id))) {
          labels.push(`${topic.name}: ${goal.text}`);
        }
      }
    }
    return labels;
  }

  function linkedTopicNames(cp, levelChecks) {
    const ids = new Set(
      (Array.isArray(cp.linkedSubtopicIds) ? cp.linkedSubtopicIds : []).map((id) => String(id))
    );
    const names = new Set();
    for (const topic of levelChecks || []) {
      for (const goal of topic.goals || []) {
        if (ids.has(String(goal.id))) names.add(topic.name);
      }
    }
    if (names.size) return [...names].join(", ");
    return cp.topicName || "–";
  }

  function allCheckpoints() {
    const typeOptions = state.data?.checkpointTypeOptions || [];
    const rows = [];
    for (const topic of state.data?.levelChecks || []) {
      if (state.subjectFilter && topic.subject !== state.subjectFilter) continue;
      for (const cp of topic.checkpoints || []) {
        if (!cp.checkpointDate) continue;
        const typeKey = normalizeType(cp);
        rows.push({
          ...cp,
          subject: topic.subject,
          topicId: topic.id,
          topicName: topic.name,
          typeKey,
          typeLabel: typeLabelFor(cp.checkpointType, cp.checkpointTypeLabel, typeOptions),
          dateIso: String(cp.checkpointDate)
        });
      }
    }
    return rows;
  }

  function upcomingCheckpoints() {
    const today = todayIso();
    return allCheckpoints()
      .filter((cp) => cp.dateIso >= today)
      .sort((a, b) => {
        const byDate = a.dateIso.localeCompare(b.dateIso);
        if (byDate !== 0) return byDate;
        const ao = TYPE_ORDER.indexOf(a.typeKey);
        const bo = TYPE_ORDER.indexOf(b.typeKey);
        return (ao >= 0 ? ao : 99) - (bo >= 0 ? bo : 99);
      });
  }

  function openCheckpointInPlan(cp) {
    const params = new URLSearchParams({
      checkpointId: String(cp.id),
      classId: String(state.classId),
      subject: cp.subject
    });
    const url = `/teacher/levelcheck-planen?${params}`;
    history.pushState({ tab: "competenciesTab" }, "", url);
    if (typeof showTab === "function") {
      showTab("competenciesTab", null, { skipHistory: true });
    }
    if (window.TeacherCompetencies) {
      window.TeacherCompetencies.init();
    }
  }

  function renderList() {
    const items = upcomingCheckpoints();
    const levelChecks = state.data?.levelChecks || [];

    if (!items.length) {
      return `
        <p class="tc-empty">Keine anstehenden Termine${state.subjectFilter ? ` für ${escapeHtml(state.subjectFilter)}` : ""}.</p>
        <p class="hint">Neue Nachweise legst du unter „Levelcheck planen“ an.</p>`;
    }

    const rows = items
      .map((cp) => {
        const goals = linkedGoalLabels(cp, levelChecks);
        const goalText = goals.length
          ? goals.slice(0, 2).map(escapeHtml).join(", ") + (goals.length > 2 ? " …" : "")
          : "Keine Was-Ziele markiert";
        const themaText = linkedTopicNames(cp, levelChecks);

        return `
        <li class="tc-checkpoint-item">
          <div class="tc-checkpoint-item-body tc-termine-item-body">
            <span class="tc-checkpoint-item-date">${escapeHtml(isoToGerman(cp.dateIso))}</span>
            <span class="tc-termine-subject">${escapeHtml(cp.subject)}</span>
            <span class="tc-termine-type">${escapeHtml(cp.typeLabel)}</span>
            <span class="tc-checkpoint-item-thema">${escapeHtml(themaText)}</span>
            <span class="tc-checkpoint-item-goals">${goalText}</span>
            <span class="tc-when tc-when-upcoming">anstehend</span>
          </div>
          <button type="button" class="tc-edit-btn tc-termine-edit" data-checkpoint-id="${escapeHtml(cp.id)}">Bearbeiten</button>
        </li>`;
      })
      .join("");

    return `<ul class="tc-checkpoint-overview tc-termine-list">${rows}</ul>`;
  }

  function render() {
    const root = document.getElementById("termineTabRoot");
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="tc-loading">Lade Termine…</div>`;
      return;
    }

    if (!state.data) {
      root.innerHTML = `<div class="tc-error">${escapeHtml(state.error || "Termine konnten nicht geladen werden.")}</div>`;
      return;
    }

    const subjects = subjectsList();
    const subjectOptions = [
      `<option value="">Alle Fächer</option>`,
      ...subjects.map(
        (s) =>
          `<option value="${escapeHtml(s)}" ${s === state.subjectFilter ? "selected" : ""}>${escapeHtml(s)}</option>`
      )
    ].join("");

    root.innerHTML = `
      <div class="panel">
        <h2>Termine</h2>
        <p class="hint">
          Alle anstehenden Nachweise auf einen Blick. Mit „Bearbeiten“ springst du direkt zu Levelcheck planen.
        </p>

        <div class="tc-toolbar">
          <label>Klasse:
            <select id="tmClassSelect"></select>
          </label>
          <label>Fach:
            <select id="tmSubjectSelect">${subjectOptions}</select>
          </label>
        </div>

        ${state.message ? `<div class="tc-msg tc-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="tc-msg tc-msg-err">${escapeHtml(state.error)}</div>` : ""}

        <div class="tc-termine-actions">
          <button type="button" class="action" id="tmNewCheckpointBtn">Neuen Nachweis planen</button>
        </div>

        ${renderList()}
      </div>`;

    fillClassSelect(root);
    bindHandlers(root);
  }

  function fillClassSelect(root) {
    const sel = root.querySelector("#tmClassSelect");
    if (!sel || !window.__tmClasses) return;
    sel.innerHTML = window.__tmClasses
      .map(
        (c) =>
          `<option value="${c.id}" ${sameId(c.id, state.classId) ? "selected" : ""}>${escapeHtml(c.name)}</option>`
      )
      .join("");
  }

  function bindHandlers(root) {
    root.querySelector("#tmClassSelect")?.addEventListener("change", (e) => {
      state.classId = Number(e.target.value);
      state.message = "";
      state.error = "";
      loadData();
    });

    root.querySelector("#tmSubjectSelect")?.addEventListener("change", (e) => {
      state.subjectFilter = e.target.value;
      render();
    });

    root.querySelector("#tmNewCheckpointBtn")?.addEventListener("click", () => {
      const params = new URLSearchParams({ classId: String(state.classId) });
      if (state.subjectFilter) params.set("subject", state.subjectFilter);
      const url = `/teacher/levelcheck-planen?${params}`;
      history.pushState({ tab: "competenciesTab" }, "", url);
      if (typeof showTab === "function") {
        showTab("competenciesTab", null, { skipHistory: true });
      }
      if (window.TeacherCompetencies) {
        window.TeacherCompetencies.init();
      }
    });

    root.querySelectorAll(".tc-termine-edit").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cp = upcomingCheckpoints().find((item) => sameId(item.id, btn.dataset.checkpointId));
        if (cp) openCheckpointInPlan(cp);
      });
    });
  }

  async function loadClasses() {
    const r = await fetch("/api/class");
    const payload = await r.json();
    if (!r.ok || !Array.isArray(payload)) {
      throw new Error(payload?.error || "Klassen konnten nicht geladen werden.");
    }
    window.__tmClasses = payload;
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
    state.message = "";
    state.error = "";

    const root = document.getElementById("termineTabRoot");
    if (root) root.innerHTML = `<div class="tc-loading">Lade Termine…</div>`;

    try {
      const classes = await loadClasses();
      if (!classes.length) {
        if (root) {
          root.innerHTML = `<div class="tc-empty">Bitte zuerst eine Klasse anlegen (Menü „Klassen & Schüler“).</div>`;
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

  window.TeacherTermine = { init };
})();

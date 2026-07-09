/**
 * Lehrkraft – Levelstatus (Checkpoint: Fach → Thema → Termin + Was-Ziele).
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

  const CHECKPOINT_TYPES = [
    { value: "klassenarbeit", label: "Klassenarbeit" },
    { value: "test", label: "Test" }
  ];

  const state = {
    classId: null,
    subject: null,
    themaId: null,
    data: null,
    loading: false,
    saving: false,
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

  function subjectsList() {
    const fromApi = state.data?.subjects;
    return Array.isArray(fromApi) && fromApi.length ? fromApi : FALLBACK_SUBJECTS;
  }

  function topicsForSubject() {
    return (state.data?.levelChecks || []).filter((lc) => lc.subject === state.subject);
  }

  function selectedTopic() {
    if (!state.themaId) return null;
    return topicsForSubject().find((t) => sameId(t.id, state.themaId)) || null;
  }

  function ensureThemaSelection() {
    const topics = topicsForSubject();
    if (!topics.length) {
      state.themaId = null;
      return;
    }
    if (!state.themaId || !topics.some((t) => sameId(t.id, state.themaId))) {
      state.themaId = topics[0].id;
    }
  }

  function checkpointTypeOptions(selected) {
    return CHECKPOINT_TYPES.map(
      (o) =>
        `<option value="${escapeHtml(o.value)}" ${o.value === selected ? "selected" : ""}>${escapeHtml(o.label)}</option>`
    ).join("");
  }

  function linkedIdsForTopic(topic) {
    const linked = topic?.linkedSubtopicIds;
    if (Array.isArray(linked) && linked.length) {
      return linked.map((id) => String(id));
    }
    return (topic?.goals || []).map((g) => String(g.id));
  }

  function renderWasGoalPicker(topic) {
    const goals = topic.goals || [];
    if (!goals.length) {
      return `<p class="tc-empty">Für dieses Thema gibt es noch keine Was-Ziele. Bitte zuerst im Reiter „Levelplan importieren“ anlegen.</p>`;
    }

    const linked = new Set(linkedIdsForTopic(topic));

    const items = goals
      .map(
        (goal) => `
      <label class="tc-was-goal-item">
        <input
          type="checkbox"
          class="tc-was-goal-check"
          value="${escapeHtml(goal.id)}"
          ${linked.has(String(goal.id)) ? "checked" : ""}
        >
        <span>${escapeHtml(goal.text)}</span>
      </label>`
      )
      .join("");

    return `
      <div class="tc-was-goals-block">
        <h4>Was-Ziele für diesen Checkpoint</h4>
        <p class="tc-hint">Wähle die Unterthemen, die zu dieser Klassenarbeit bzw. diesem Test gehören.</p>
        <div class="tc-was-goal-list">${items}</div>
      </div>`;
  }

  function renderTopicEditor(topic) {
    const type = topic.checkpointType === "test" ? "test" : "klassenarbeit";

    return `
      <article class="tc-levelcheck-card" data-check-id="${escapeHtml(topic.id)}">
        <h3 class="tc-levelcheck-name">${escapeHtml(topic.name)}</h3>
        <div class="tc-checkpoint-row">
          <label>
            Termin
            <input type="date" class="tc-checkpoint-date" data-check-id="${escapeHtml(topic.id)}" value="${escapeHtml(topic.checkpointDate || "")}">
          </label>
          <label>
            Art
            <select class="tc-checkpoint-type" data-check-id="${escapeHtml(topic.id)}">
              ${checkpointTypeOptions(type)}
            </select>
          </label>
        </div>
        ${renderWasGoalPicker(topic)}
      </article>`;
  }

  function render() {
    const root = document.getElementById("competenciesTabRoot");
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="tc-loading">Lade Levelstatus…</div>`;
      return;
    }

    if (!state.data) {
      root.innerHTML = `<div class="tc-error">${escapeHtml(state.error || "Levelstatus konnte nicht geladen werden.")}</div>`;
      return;
    }

    ensureThemaSelection();
    const topics = topicsForSubject();
    const topic = selectedTopic();

    const subjectOptions = subjectsList()
      .map(
        (s) =>
          `<option value="${escapeHtml(s)}" ${s === state.subject ? "selected" : ""}>${escapeHtml(s)}</option>`
      )
      .join("");

    const themaOptions = topics
      .map(
        (t) =>
          `<option value="${escapeHtml(t.id)}" ${sameId(t.id, state.themaId) ? "selected" : ""}>${escapeHtml(t.name)}</option>`
      )
      .join("");

    let body = "";
    if (!topics.length) {
      body = `
        <div class="tc-empty">
          <p>Für ${escapeHtml(state.subject)} wurden noch keine Themen importiert.</p>
          <p class="hint">Lege zuerst Was-Ziele unter „Levelplan importieren“ an und prüfe sie unter „Was-Ziele“.</p>
        </div>`;
    } else if (topic) {
      body = renderTopicEditor(topic);
    }

    root.innerHTML = `
      <div class="panel">
        <h2>Levelstatus</h2>
        <p class="hint">
          Pro Fach und Thema: Termin und Art (Klassenarbeit oder Test) festlegen und die passenden Was-Ziele auswählen.
          Rookie, Operator und Street Legend pflegst du im importierten Levelplan.
        </p>

        <div class="tc-toolbar">
          <label>Klasse:
            <select id="tcClassSelect"></select>
          </label>
          <label>Fach:
            <select id="tcSubjectSelect">${subjectOptions}</select>
          </label>
          <label>Thema:
            <select id="tcThemaSelect" ${topics.length ? "" : "disabled"}>${themaOptions}</select>
          </label>
        </div>

        ${state.message ? `<div class="tc-msg tc-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="tc-msg tc-msg-err">${escapeHtml(state.error)}</div>` : ""}

        ${body}
      </div>`;

    bindHandlers(root);
    fillClassSelect(root);
  }

  function fillClassSelect(root) {
    const sel = root.querySelector("#tcClassSelect");
    if (!sel || !window.__tcClasses) return;
    sel.innerHTML = window.__tcClasses
      .map(
        (c) =>
          `<option value="${c.id}" ${sameId(c.id, state.classId) ? "selected" : ""}>${escapeHtml(c.name)}</option>`
      )
      .join("");
  }

  function bindHandlers(root) {
    root.querySelector("#tcClassSelect")?.addEventListener("change", (e) => {
      state.classId = Number(e.target.value);
      state.message = "";
      state.error = "";
      loadData();
    });

    root.querySelector("#tcSubjectSelect")?.addEventListener("change", (e) => {
      state.subject = e.target.value;
      state.themaId = null;
      state.message = "";
      state.error = "";
      render();
    });

    root.querySelector("#tcThemaSelect")?.addEventListener("change", (e) => {
      state.themaId = e.target.value;
      state.message = "";
      state.error = "";
      render();
    });

    root.querySelector(".tc-checkpoint-date")?.addEventListener("change", (e) => {
      saveTopicMeta(e.target.dataset.checkId);
    });

    root.querySelector(".tc-checkpoint-type")?.addEventListener("change", (e) => {
      saveTopicMeta(e.target.dataset.checkId);
    });

    root.querySelectorAll(".tc-was-goal-check").forEach((input) => {
      input.addEventListener("change", () => {
        const card = input.closest(".tc-levelcheck-card");
        saveTopicMeta(card?.dataset?.checkId);
      });
    });
  }

  function readTopicPayload(checkId) {
    const card = document.querySelector(`.tc-levelcheck-card[data-check-id="${checkId}"]`);
    if (!card) return null;

    const dateEl = card.querySelector(".tc-checkpoint-date");
    const typeEl = card.querySelector(".tc-checkpoint-type");
    const linkedSubtopicIds = [...card.querySelectorAll(".tc-was-goal-check:checked")].map(
      (el) => el.value
    );

    return {
      checkpointDate: dateEl?.value || null,
      checkpointType: typeEl?.value || "klassenarbeit",
      checkpointTypeLabel: null,
      linkedSubtopicIds
    };
  }

  async function saveTopicMeta(checkId) {
    if (!checkId) return;
    const payload = readTopicPayload(checkId);
    if (!payload) return;

    state.saving = true;
    state.error = "";
    try {
      const res = await fetch(`/api/teacher/levelchecks/${encodeURIComponent(checkId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      state.saving = false;
      if (!data.success) {
        state.error = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }
      state.message = data.checkpointDate
        ? `${data.checkpointTypeLabel} gespeichert · ${data.checkpointDateLabel}`
        : `${data.checkpointTypeLabel} gespeichert`;
      await loadData();
    } catch (err) {
      console.error(err);
      state.saving = false;
      state.error = "Netzwerkfehler beim Speichern.";
      render();
    }
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

  async function loadClasses() {
    const r = await fetch("/api/class");
    const payload = await r.json();
    if (!r.ok || !Array.isArray(payload)) {
      throw new Error(payload?.error || "Klassen konnten nicht geladen werden.");
    }
    window.__tcClasses = payload;
    return payload;
  }

  async function init() {
    state.message = "";
    state.error = "";

    const root = document.getElementById("competenciesTabRoot");
    if (root) root.innerHTML = `<div class="tc-loading">Lade Levelstatus…</div>`;

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

  window.TeacherCompetencies = { init };
})();

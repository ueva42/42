/**
 * Lehrkraft – Levelstatus (Checkpoint-Karten + Was-Ziele aus allen Themen).
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

  function allGoalsInSubject() {
    const items = [];
    for (const topic of topicsForSubject()) {
      for (const goal of topic.goals || []) {
        items.push({
          id: String(goal.id),
          text: goal.text,
          themaId: String(topic.id),
          themaName: topic.name
        });
      }
    }
    return items;
  }

  function typeLabelForTopic(topic) {
    const type = topic.checkpointType === "test" ? "test" : "klassenarbeit";
    return CHECKPOINT_TYPES.find((o) => o.value === type)?.label || "Klassenarbeit";
  }

  function linkedIdsForTopic(topic) {
    const linked = topic?.linkedSubtopicIds;
    if (Array.isArray(linked) && linked.length) {
      return linked.map((id) => String(id));
    }
    return (topic?.goals || []).map((g) => String(g.id));
  }

  function checkpointTypeOptions(selected) {
    const type = selected === "test" ? "test" : "klassenarbeit";
    return CHECKPOINT_TYPES.map(
      (o) =>
        `<option value="${escapeHtml(o.value)}" ${o.value === type ? "selected" : ""}>${escapeHtml(o.label)}</option>`
    ).join("");
  }

  function renderCheckpointFields(topic) {
    const type = topic.checkpointType === "test" ? "test" : "klassenarbeit";
    return `
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
      </div>`;
  }

  function renderLinkedGoalsSelect(topic) {
    const allGoals = allGoalsInSubject();
    if (!allGoals.length) {
      return `<p class="tc-goal-empty">Noch keine Was-Ziele importiert.</p>`;
    }

    const linked = new Set(linkedIdsForTopic(topic));
    const byThema = {};
    for (const goal of allGoals) {
      if (!byThema[goal.themaName]) byThema[goal.themaName] = [];
      byThema[goal.themaName].push(goal);
    }

    const options = Object.entries(byThema)
      .map(([themaName, goals]) => {
        const opts = goals
          .map(
            (g) =>
              `<option value="${escapeHtml(g.id)}" ${linked.has(g.id) ? "selected" : ""}>${escapeHtml(g.text)}</option>`
          )
          .join("");
        return `<optgroup label="${escapeHtml(themaName)}">${opts}</optgroup>`;
      })
      .join("");

    return `
      <div class="tc-linked-block">
        <label class="tc-linked-label">
          Was-Ziele für diesen Checkpoint
          <span class="tc-hint">Mehrfachauswahl – auch Unterthemen aus anderen Themen möglich (Strg/Cmd + Klick).</span>
          <select multiple class="tc-linked-select" data-check-id="${escapeHtml(topic.id)}" size="${Math.min(10, Math.max(4, allGoals.length))}">
            ${options}
          </select>
        </label>
      </div>`;
  }

  function renderTopicCard(topic) {
    return `
      <article class="tc-levelcheck-card" data-check-id="${escapeHtml(topic.id)}">
        <div class="tc-levelcheck-head">
          <div>
            <span class="tc-levelcheck-subject">${escapeHtml(typeLabelForTopic(topic))}</span>
            <h4 class="tc-levelcheck-name">${escapeHtml(topic.name)}</h4>
            ${renderCheckpointFields(topic)}
          </div>
        </div>
        ${renderLinkedGoalsSelect(topic)}
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
        <p class="tc-empty">Für ${escapeHtml(state.subject)} noch keine Themen. Bitte zuerst unter „Levelplan importieren“ anlegen.</p>`;
    } else if (topic) {
      body = `<div class="tc-levelcheck-list">${renderTopicCard(topic)}</div>`;
    }

    root.innerHTML = `
      <div class="panel">
        <h2>Levelstatus</h2>
        <p class="hint">
          Pro Thema Termin und Art (Klassenarbeit oder Test) festlegen und die zugehörigen Was-Ziele wählen –
          z. B. für einen Test nur „Richtig zählen“, für eine Klassenarbeit mehrere Unterthemen auch aus anderen Themen.
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

    root.querySelector(".tc-linked-select")?.addEventListener("change", (e) => {
      saveTopicMeta(e.target.dataset.checkId);
    });
  }

  function readTopicPayload(checkId) {
    const card = document.querySelector(`.tc-levelcheck-card[data-check-id="${checkId}"]`);
    if (!card) return null;

    const dateEl = card.querySelector(".tc-checkpoint-date");
    const typeEl = card.querySelector(".tc-checkpoint-type");
    const linkedEl = card.querySelector(".tc-linked-select");
    const linkedSubtopicIds = linkedEl
      ? [...linkedEl.selectedOptions].map((opt) => opt.value)
      : [];

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
        ? `${data.checkpointTypeLabel} gespeichert · ${data.checkpointDateLabel} · ${payload.linkedSubtopicIds.length} Was-Ziel(e)`
        : `${data.checkpointTypeLabel} gespeichert · ${payload.linkedSubtopicIds.length} Was-Ziel(e)`;
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

/**
 * Lehrkraft – Levelstatus (Datum → Art → Thema → Was-Ziele markieren).
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

  const DEFAULT_CHECKPOINT_TYPES = [
    { value: "klassenarbeit", label: "Klassenarbeit" },
    { value: "test", label: "Test" },
    { value: "praesentation", label: "Präsentation" },
    { value: "custom", label: "Eigene Bezeichnung" }
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

  function checkpointTypeOptions() {
    return state.data?.checkpointTypeOptions?.length
      ? state.data.checkpointTypeOptions
      : DEFAULT_CHECKPOINT_TYPES;
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

  function typeLabelFor(type, customLabel) {
    if (type === "custom" && customLabel) return customLabel;
    const match = checkpointTypeOptions().find((o) => o.value === type);
    return match?.label || "Klassenarbeit";
  }

  function linkedIdsForTopic(topic) {
    if (!topic) return [];
    const linked = topic.linkedSubtopicIds;
    return Array.isArray(linked) ? linked.map((id) => String(id)) : [];
  }

  function renderCheckpointCard() {
    const topics = topicsForSubject();
    if (!topics.length) {
      return `<p class="tc-empty">Für ${escapeHtml(state.subject)} noch keine Themen. Bitte zuerst unter „Levelplan importieren“ anlegen.</p>`;
    }

    ensureThemaSelection();
    const topic = selectedTopic();
    if (!topic) return "";

    const type = topic.checkpointType || "klassenarbeit";
    const isCustom = type === "custom";
    const typeOptions = checkpointTypeOptions()
      .map(
        (o) =>
          `<option value="${escapeHtml(o.value)}" ${o.value === type ? "selected" : ""}>${escapeHtml(o.label)}</option>`
      )
      .join("");

    const themaOptions = topics
      .map(
        (t) =>
          `<option value="${escapeHtml(t.id)}" ${sameId(t.id, state.themaId) ? "selected" : ""}>${escapeHtml(t.name)}</option>`
      )
      .join("");

    const linked = new Set(linkedIdsForTopic(topic));
    const goals = topic.goals || [];

    const goalChecks = goals.length
      ? goals
          .map(
            (goal) => `
        <label class="tc-was-goal-item">
          <input type="checkbox" class="tc-was-goal-check" value="${escapeHtml(goal.id)}" ${linked.has(String(goal.id)) ? "checked" : ""}>
          <span>${escapeHtml(goal.text)}</span>
        </label>`
          )
          .join("")
      : `<p class="tc-goal-empty">Für dieses Thema gibt es noch keine Was-Ziele.</p>`;

    return `
      <article class="tc-levelcheck-card" data-check-id="${escapeHtml(topic.id)}">
        <div class="tc-levelcheck-head">
          <div>
            <span class="tc-levelcheck-subject">${escapeHtml(typeLabelFor(type, topic.checkpointTypeLabel))}</span>
            <h4 class="tc-levelcheck-name">${escapeHtml(topic.name)}</h4>
          </div>
        </div>

        <div class="tc-checkpoint-row">
          <label>
            Termin
            <input type="date" class="tc-checkpoint-date" value="${escapeHtml(topic.checkpointDate || "")}">
          </label>
          <label>
            Art
            <select class="tc-checkpoint-type">${typeOptions}</select>
          </label>
          <label class="tc-checkpoint-custom-wrap ${isCustom ? "" : "tc-checkpoint-custom-hidden"}">
            Eigene Bezeichnung
            <input
              type="text"
              class="tc-checkpoint-type-custom"
              maxlength="80"
              placeholder="z. B. Projektprüfung"
              value="${isCustom ? escapeHtml(topic.checkpointTypeLabel || "") : ""}"
              ${isCustom ? "" : "disabled"}
            >
          </label>
          <label>
            Thema
            <select class="tc-card-thema-select">${themaOptions}</select>
          </label>
        </div>

        <div class="tc-linked-block">
          <h4 class="tc-linked-title">Was-Ziele für diesen Checkpoint</h4>
          <p class="tc-hint">Markiere die Unterthemen aus „${escapeHtml(topic.name)}“, die abgefragt werden.</p>
          <div class="tc-was-goal-list">${goalChecks}</div>
        </div>
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

    const subjectOptions = subjectsList()
      .map(
        (s) =>
          `<option value="${escapeHtml(s)}" ${s === state.subject ? "selected" : ""}>${escapeHtml(s)}</option>`
      )
      .join("");

    root.innerHTML = `
      <div class="panel">
        <h2>Levelstatus</h2>
        <p class="hint">
          Termin und Art festlegen, Thema wählen, dann die Was-Ziele markieren, die in Klassenarbeit oder Test vorkommen.
        </p>

        <div class="tc-toolbar">
          <label>Klasse:
            <select id="tcClassSelect"></select>
          </label>
          <label>Fach:
            <select id="tcSubjectSelect">${subjectOptions}</select>
          </label>
        </div>

        ${state.message ? `<div class="tc-msg tc-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="tc-msg tc-msg-err">${escapeHtml(state.error)}</div>` : ""}

        <div class="tc-levelcheck-list">${renderCheckpointCard()}</div>
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

  function toggleCustomField(card, show) {
    const wrap = card?.querySelector(".tc-checkpoint-custom-wrap");
    if (!wrap) return;
    wrap.classList.toggle("tc-checkpoint-custom-hidden", !show);
    const input = wrap.querySelector(".tc-checkpoint-type-custom");
    if (input) {
      input.disabled = !show;
      if (!show) input.value = "";
    }
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

    const card = root.querySelector(".tc-levelcheck-card");
    if (!card) return;

    card.querySelector(".tc-card-thema-select")?.addEventListener("change", async (e) => {
      await saveTopicMeta(card.dataset.checkId);
      state.themaId = e.target.value;
      state.message = "";
      state.error = "";
      render();
    });

    card.querySelector(".tc-checkpoint-date")?.addEventListener("change", () => {
      saveTopicMeta(card.dataset.checkId);
    });

    card.querySelector(".tc-checkpoint-type")?.addEventListener("change", (e) => {
      toggleCustomField(card, e.target.value === "custom");
      saveTopicMeta(card.dataset.checkId);
    });

    card.querySelector(".tc-checkpoint-type-custom")?.addEventListener("blur", () => {
      saveTopicMeta(card.dataset.checkId);
    });

    card.querySelectorAll(".tc-was-goal-check").forEach((input) => {
      input.addEventListener("change", () => saveTopicMeta(card.dataset.checkId));
    });
  }

  function readTopicPayload(checkId) {
    const card = document.querySelector(`.tc-levelcheck-card[data-check-id="${checkId}"]`);
    if (!card) return null;

    const dateEl = card.querySelector(".tc-checkpoint-date");
    const typeEl = card.querySelector(".tc-checkpoint-type");
    const customEl = card.querySelector(".tc-checkpoint-type-custom");
    const checkpointType = typeEl?.value || "klassenarbeit";
    const linkedSubtopicIds = [...card.querySelectorAll(".tc-was-goal-check:checked")].map(
      (el) => el.value
    );

    return {
      checkpointDate: dateEl?.value || null,
      checkpointType,
      checkpointTypeLabel: checkpointType === "custom" ? customEl?.value?.trim() || "" : null,
      linkedSubtopicIds
    };
  }

  async function saveTopicMeta(checkId) {
    if (!checkId) return;
    const payload = readTopicPayload(checkId);
    if (!payload) return;

    if (payload.checkpointType === "custom" && !payload.checkpointTypeLabel) {
      state.error = "Bitte eine eigene Bezeichnung eingeben.";
      render();
      return;
    }

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

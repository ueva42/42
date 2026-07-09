/**
 * Lehrkraft – Levelstatus (Checkpoint planen + Übersicht).
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

  const TYPE_ORDER = ["klassenarbeit", "test", "praesentation", "custom"];

  const state = {
    classId: null,
    subject: null,
    themaId: null,
    editCheckpointId: null,
    data: null,
    loading: false,
    saving: false,
    deletingId: null,
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

  function germanToIso(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) return null;
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    const y = m[3];
    const iso = `${y}-${mo}-${d}`;
    const date = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    if (date.getFullYear() !== Number(y) || date.getMonth() + 1 !== Number(mo) || date.getDate() !== Number(d)) {
      return null;
    }
    return iso;
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

  function topicById(id) {
    return topicsForSubject().find((t) => sameId(t.id, id)) || null;
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

  function normalizeType(cp) {
    const type = cp?.checkpointType || "klassenarbeit";
    return type === "test" || type === "praesentation" || type === "custom" ? type : "klassenarbeit";
  }

  function checkpointById(id) {
    for (const topic of topicsForSubject()) {
      const match = (topic.checkpoints || []).find((cp) => sameId(cp.id, id));
      if (match) {
        return {
          ...match,
          topicId: topic.id,
          topicName: topic.name,
          goals: topic.goals || []
        };
      }
    }
    return null;
  }

  function linkedIdsForCheckpoint(cp, topic) {
    if (!cp) return [];
    const linked = cp.linkedSubtopicIds;
    return Array.isArray(linked) ? linked.map((id) => String(id)) : [];
  }

  function linkedGoalLabels(cp, topic) {
    const ids = new Set(linkedIdsForCheckpoint(cp, topic));
    const labels = [];
    for (const goal of topic?.goals || []) {
      if (ids.has(String(goal.id))) labels.push(goal.text);
    }
    return labels;
  }

  function allCheckpoints() {
    const rows = [];
    for (const topic of topicsForSubject()) {
      for (const cp of topic.checkpoints || []) {
        if (!cp.checkpointDate) continue;
        rows.push({
          ...cp,
          topicId: topic.id,
          topicName: topic.name,
          goals: topic.goals || [],
          typeKey: normalizeType(cp),
          typeLabel: typeLabelFor(cp.checkpointType, cp.checkpointTypeLabel),
          dateIso: String(cp.checkpointDate)
        });
      }
    }
    return rows;
  }

  function groupedCheckpointList() {
    const saved = allCheckpoints();
    const groups = new Map();

    for (const item of saved) {
      const key =
        item.typeKey === "custom"
          ? `custom:${item.checkpointTypeLabel || "Eigene"}`
          : item.typeKey;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: item.typeLabel,
          sortOrder: TYPE_ORDER.indexOf(item.typeKey),
          items: []
        });
      }
      groups.get(key).items.push(item);
    }

    for (const group of groups.values()) {
      group.items.sort((a, b) => b.dateIso.localeCompare(a.dateIso));
    }

    return [...groups.values()].sort((a, b) => {
      const ao = a.sortOrder >= 0 ? a.sortOrder : 99;
      const bo = b.sortOrder >= 0 ? b.sortOrder : 99;
      if (ao !== bo) return ao - bo;
      return a.label.localeCompare(b.label, "de");
    });
  }

  function formValues() {
    if (state.editCheckpointId) {
      const cp = checkpointById(state.editCheckpointId);
      if (!cp) return null;
      const type = normalizeType(cp);
      return {
        topicId: cp.topicId,
        date: isoToGerman(cp.checkpointDate),
        type,
        customLabel: type === "custom" ? cp.checkpointTypeLabel || "" : "",
        linked: new Set(linkedIdsForCheckpoint(cp))
      };
    }
    ensureThemaSelection();
    return {
      topicId: state.themaId,
      date: "",
      type: "klassenarbeit",
      customLabel: "",
      linked: new Set()
    };
  }

  function renderCheckpointForm() {
    const topics = topicsForSubject();
    if (!topics.length) {
      return `<p class="tc-empty">Für ${escapeHtml(state.subject)} noch keine Themen. Bitte zuerst unter „Levelplan importieren“ anlegen.</p>`;
    }

    if (state.editCheckpointId && !checkpointById(state.editCheckpointId)) {
      state.editCheckpointId = null;
    }

    ensureThemaSelection();
    const values = formValues();
    if (!values) {
      state.editCheckpointId = null;
      ensureThemaSelection();
      return renderCheckpointForm();
    }

    const topic = topicById(values.topicId) || topics[0];
    if (!topic) return "";

    const isCustom = values.type === "custom";
    const isEditing = !!state.editCheckpointId;
    const typeOptions = checkpointTypeOptions()
      .map(
        (o) =>
          `<option value="${escapeHtml(o.value)}" ${o.value === values.type ? "selected" : ""}>${escapeHtml(o.label)}</option>`
      )
      .join("");

    const themaOptions = topics
      .map(
        (t) =>
          `<option value="${escapeHtml(t.id)}" ${sameId(t.id, values.topicId) ? "selected" : ""}>${escapeHtml(t.name)}</option>`
      )
      .join("");

    const linked = values.linked;
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

    const saveLabel = typeLabelFor(
      values.type,
      isCustom ? values.customLabel || "Eigene Bezeichnung" : null
    );

    return `
      <section class="tc-form-section">
        <h3>${isEditing ? "Checkpoint bearbeiten" : "Neuen Checkpoint planen"}</h3>
        <article class="tc-levelcheck-card" data-topic-id="${escapeHtml(topic.id)}">
          <div class="tc-checkpoint-row">
            <label>
              Termin
              <input
                type="text"
                class="tc-checkpoint-date"
                placeholder="tt.mm.jjjj"
                inputmode="numeric"
                maxlength="10"
                value="${escapeHtml(values.date)}"
              >
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
                value="${isCustom ? escapeHtml(values.customLabel) : ""}"
                ${isCustom ? "" : "disabled"}
              >
            </label>
            <label>
              Thema
              <select class="tc-card-thema-select" ${isEditing ? "disabled" : ""}>${themaOptions}</select>
            </label>
          </div>

          <div class="tc-linked-block">
            <h4 class="tc-linked-title">Was-Ziele für diesen Checkpoint</h4>
            <p class="tc-hint">Markiere die Unterthemen aus „${escapeHtml(topic.name)}“, die abgefragt werden.</p>
            <div class="tc-was-goal-list">${goalChecks}</div>
          </div>

          <div class="tc-save-row">
            ${isEditing ? `<button type="button" class="tc-link-btn" id="tcNewCheckpointBtn">Neuen Checkpoint planen</button>` : ""}
            <button type="button" class="action" id="tcSaveCheckpointBtn" ${state.saving ? "disabled" : ""}>
              ${state.saving ? "Speichern…" : `${escapeHtml(saveLabel)} speichern`}
            </button>
          </div>
        </article>
      </section>`;
  }

  function renderCheckpointOverview() {
    const groups = groupedCheckpointList();
    if (!groups.length) {
      return `
        <section class="tc-overview-section">
          <h3>Geplante & vergangene Checkpoints</h3>
          <p class="tc-empty">Noch keine Checkpoints mit Termin gespeichert.</p>
        </section>`;
    }

    const today = todayIso();
    const sections = groups
      .map((group) => {
        const items = group.items
          .map((cp) => {
            const topic = topicById(cp.topicId);
            const when =
              cp.dateIso >= today
                ? `<span class="tc-when tc-when-upcoming">anstehend</span>`
                : `<span class="tc-when tc-when-past">vergangen</span>`;
            const goals = linkedGoalLabels(cp, topic);
            const goalText = goals.length
              ? goals.slice(0, 3).map(escapeHtml).join(", ") + (goals.length > 3 ? " …" : "")
              : "Keine Was-Ziele markiert";

            return `
            <li class="tc-checkpoint-item ${state.editCheckpointId && sameId(state.editCheckpointId, cp.id) ? "tc-checkpoint-item-active" : ""}">
              <button type="button" class="tc-checkpoint-item-main" data-edit-checkpoint-id="${escapeHtml(cp.id)}">
                <span class="tc-checkpoint-item-date">${escapeHtml(isoToGerman(cp.dateIso))}</span>
                <span class="tc-checkpoint-item-thema">${escapeHtml(cp.topicName)}</span>
                <span class="tc-checkpoint-item-goals">${goalText}</span>
                ${when}
              </button>
              <button type="button" class="tc-delete-btn tc-checkpoint-del" data-checkpoint-id="${escapeHtml(cp.id)}" ${state.deletingId === String(cp.id) ? "disabled" : ""} title="Checkpoint löschen">×</button>
            </li>`;
          })
          .join("");

        return `
        <div class="tc-checkpoint-group">
          <h4 class="tc-checkpoint-group-title">${escapeHtml(group.label)}</h4>
          <ul class="tc-checkpoint-overview">${items}</ul>
        </div>`;
      })
      .join("");

    return `
      <section class="tc-overview-section">
        <h3>Geplante & vergangene Checkpoints</h3>
        <p class="hint">Neueste Termine oben, älteste unten – gruppiert nach Art. Klicken zum Bearbeiten.</p>
        ${sections}
      </section>`;
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
          Termin (tt.mm.jjjj), Art und Thema wählen, Was-Ziele markieren – dann speichern.
          Pro Thema können mehrere Checkpoints mit unterschiedlichen Terminen angelegt werden.
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

        ${renderCheckpointForm()}
        ${renderCheckpointOverview()}
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

  function resetNewForm() {
    state.editCheckpointId = null;
    state.message = "";
    state.error = "";
    render();
  }

  function bindHandlers(root) {
    root.querySelector("#tcClassSelect")?.addEventListener("change", (e) => {
      state.classId = Number(e.target.value);
      state.editCheckpointId = null;
      state.message = "";
      state.error = "";
      loadData();
    });

    root.querySelector("#tcSubjectSelect")?.addEventListener("change", (e) => {
      state.subject = e.target.value;
      state.themaId = null;
      state.editCheckpointId = null;
      state.message = "";
      state.error = "";
      render();
    });

    const card = root.querySelector(".tc-levelcheck-card");
    if (card) {
      card.querySelector(".tc-card-thema-select")?.addEventListener("change", (e) => {
        if (state.editCheckpointId) return;
        state.themaId = e.target.value;
        state.message = "";
        state.error = "";
        render();
      });

      card.querySelector(".tc-checkpoint-type")?.addEventListener("change", (e) => {
        toggleCustomField(card, e.target.value === "custom");
        updateSaveButtonLabel(card);
      });

      card.querySelector(".tc-checkpoint-type-custom")?.addEventListener("input", () => {
        updateSaveButtonLabel(card);
      });

      card.querySelector("#tcSaveCheckpointBtn")?.addEventListener("click", () => {
        saveCheckpoint(card.dataset.topicId);
      });

      card.querySelector("#tcNewCheckpointBtn")?.addEventListener("click", resetNewForm);
    }

    root.querySelectorAll(".tc-checkpoint-item-main").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cp = checkpointById(btn.dataset.editCheckpointId);
        if (!cp) return;
        state.editCheckpointId = cp.id;
        state.themaId = cp.topicId;
        state.message = "";
        state.error = "";
        render();
      });
    });

    root.querySelectorAll(".tc-checkpoint-del").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteCheckpoint(btn.dataset.checkpointId);
      });
    });
  }

  function updateSaveButtonLabel(card) {
    const btn = card?.querySelector("#tcSaveCheckpointBtn");
    const typeEl = card?.querySelector(".tc-checkpoint-type");
    const customEl = card?.querySelector(".tc-checkpoint-type-custom");
    if (!btn || !typeEl) return;
    const type = typeEl.value || "klassenarbeit";
    const label = typeLabelFor(
      type,
      type === "custom" ? customEl?.value?.trim() || "Eigene Bezeichnung" : null
    );
    btn.textContent = `${label} speichern`;
  }

  function readCheckpointPayload(topicId) {
    const card = document.querySelector(`.tc-levelcheck-card[data-topic-id="${topicId}"]`);
    if (!card) return null;

    const themaEl = card.querySelector(".tc-card-thema-select");
    const dateEl = card.querySelector(".tc-checkpoint-date");
    const typeEl = card.querySelector(".tc-checkpoint-type");
    const customEl = card.querySelector(".tc-checkpoint-type-custom");
    const checkpointType = typeEl?.value || "klassenarbeit";
    const dateRaw = dateEl?.value?.trim() || "";
    const checkpointDate = germanToIso(dateRaw);
    const linkedSubtopicIds = [...card.querySelectorAll(".tc-was-goal-check:checked")].map(
      (el) => el.value
    );

    return {
      levelCheckId: themaEl?.value || topicId,
      checkpointDate,
      dateRaw,
      checkpointType,
      checkpointTypeLabel: checkpointType === "custom" ? customEl?.value?.trim() || "" : null,
      linkedSubtopicIds
    };
  }

  async function saveCheckpoint(topicId) {
    if (!topicId) return;
    const payload = readCheckpointPayload(topicId);
    if (!payload) return;

    if (!payload.dateRaw) {
      state.error = "Bitte ein Datum im Format tt.mm.jjjj eingeben.";
      render();
      return;
    }
    if (!payload.checkpointDate) {
      state.error = "Ungültiges Datum – bitte tt.mm.jjjj verwenden.";
      render();
      return;
    }
    if (payload.checkpointType === "custom" && !payload.checkpointTypeLabel) {
      state.error = "Bitte eine eigene Bezeichnung eingeben.";
      render();
      return;
    }

    state.saving = true;
    state.error = "";
    try {
      const isEdit = !!state.editCheckpointId;
      const url = isEdit
        ? `/api/teacher/levelcheck-checkpoints/${encodeURIComponent(state.editCheckpointId)}`
        : "/api/teacher/levelcheck-checkpoints";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          levelCheckId: payload.levelCheckId,
          checkpointDate: payload.checkpointDate,
          checkpointType: payload.checkpointType,
          checkpointTypeLabel: payload.checkpointTypeLabel,
          linkedSubtopicIds: payload.linkedSubtopicIds
        })
      });
      const data = await res.json();
      state.saving = false;
      if (!data.success) {
        state.error = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }
      const cp = data.checkpoint || {};
      state.message = `${cp.checkpointTypeLabel || "Checkpoint"} gespeichert · ${cp.checkpointDateLabel || isoToGerman(payload.checkpointDate)} · ${payload.linkedSubtopicIds.length} Was-Ziel(e)`;
      state.editCheckpointId = null;
      await loadData();
    } catch (err) {
      console.error(err);
      state.saving = false;
      state.error = "Netzwerkfehler beim Speichern.";
      render();
    }
  }

  async function deleteCheckpoint(checkpointId) {
    if (!checkpointId || !confirm("Diesen Checkpoint wirklich löschen?")) {
      return;
    }

    state.deletingId = String(checkpointId);
    state.error = "";
    render();

    try {
      const res = await fetch(
        `/api/teacher/levelcheck-checkpoints/${encodeURIComponent(checkpointId)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      state.deletingId = null;

      if (!data.success) {
        state.error = data.message || "Löschen fehlgeschlagen.";
        render();
        return;
      }

      if (sameId(state.editCheckpointId, checkpointId)) state.editCheckpointId = null;
      state.message = "Checkpoint gelöscht.";
      await loadData();
    } catch (err) {
      console.error(err);
      state.deletingId = null;
      state.error = "Netzwerkfehler beim Löschen.";
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
      if (state.editCheckpointId && !checkpointById(state.editCheckpointId)) {
        state.editCheckpointId = null;
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

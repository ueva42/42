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
    formDraft: {
      date: "",
      type: "klassenarbeit",
      customLabel: "",
      linked: []
    },
    data: null,
    loading: false,
    saving: false,
    deletingId: null,
    message: "",
    error: ""
  };

  function clearFormDraft() {
    state.formDraft = {
      date: "",
      type: "klassenarbeit",
      customLabel: "",
      linked: []
    };
  }

  function captureFormDraft(card) {
    if (!card || state.editCheckpointId) return;
    const dateEl = card.querySelector(".tc-checkpoint-date");
    const typeEl = card.querySelector(".tc-checkpoint-type");
    const customEl = card.querySelector(".tc-checkpoint-type-custom");
    state.formDraft = {
      date: dateEl?.value?.trim() || "",
      type: typeEl?.value || "klassenarbeit",
      customLabel: customEl?.value?.trim() || "",
      linked: [...card.querySelectorAll(".tc-was-goal-check:checked")].map((el) => el.value)
    };
  }

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

  function linkedGoalLabels(cp) {
    const ids = new Set(linkedIdsForCheckpoint(cp));
    const labels = [];
    for (const topic of topicsForSubject()) {
      for (const goal of topic.goals || []) {
        if (ids.has(String(goal.id))) {
          labels.push(`${topic.name}: ${goal.text}`);
        }
      }
    }
    return labels;
  }

  function linkedTopicNames(cp) {
    const ids = new Set(linkedIdsForCheckpoint(cp));
    const names = new Set();
    for (const topic of topicsForSubject()) {
      for (const goal of topic.goals || []) {
        if (ids.has(String(goal.id))) names.add(topic.name);
      }
    }
    if (names.size) return [...names].join(", ");
    return cp.topicName || "–";
  }

  function primaryTopicIdFromLinked(linkedIds) {
    const idSet = new Set((linkedIds || []).map((id) => String(id)));
    for (const topic of topicsForSubject()) {
      for (const goal of topic.goals || []) {
        if (idSet.has(String(goal.id))) return topic.id;
      }
    }
    return topicsForSubject()[0]?.id || null;
  }

  function renderGoalsByTopic(linked) {
    const topics = topicsForSubject();
    const sections = topics
      .map((topic) => {
        const goals = topic.goals || [];
        if (!goals.length) return "";
        const goalChecks = goals
          .map(
            (goal) => `
        <label class="tc-was-goal-item">
          <input type="checkbox" class="tc-was-goal-check" value="${escapeHtml(goal.id)}" ${linked.has(String(goal.id)) ? "checked" : ""}>
          <span>${escapeHtml(goal.text)}</span>
        </label>`
          )
          .join("");
        return `
        <div class="tc-topic-goal-group">
          <h5 class="tc-topic-goal-title">${escapeHtml(topic.name)}</h5>
          <div class="tc-was-goal-list">${goalChecks}</div>
        </div>`;
      })
      .filter(Boolean)
      .join("");

    return sections || `<p class="tc-goal-empty">Für dieses Fach gibt es noch keine Was-Ziele.</p>`;
  }

  function startEditCheckpoint(checkpointId) {
    const cp = checkpointById(checkpointId);
    if (!cp) return;
    clearFormDraft();
    state.editCheckpointId = cp.id;
    state.themaId = cp.topicId;
    state.message = "";
    state.error = "";
    render();
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
      date: state.formDraft.date,
      type: state.formDraft.type,
      customLabel: state.formDraft.customLabel,
      linked: new Set(state.formDraft.linked || [])
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

    const isCustom = values.type === "custom";
    const isEditing = !!state.editCheckpointId;
    const typeOptions = checkpointTypeOptions()
      .map(
        (o) =>
          `<option value="${escapeHtml(o.value)}" ${o.value === values.type ? "selected" : ""}>${escapeHtml(o.label)}</option>`
      )
      .join("");

    const linked = values.linked;
    const goalSections = renderGoalsByTopic(linked);

    const saveLabel = typeLabelFor(
      values.type,
      isCustom ? values.customLabel || "Eigene Bezeichnung" : null
    );

    return `
      <section class="tc-form-section">
        <h3>${isEditing ? "Checkpoint bearbeiten" : "Neuen Checkpoint planen"}</h3>
        <article class="tc-levelcheck-card">
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
          </div>

          <div class="tc-linked-block">
            <h4 class="tc-linked-title">Was-Ziele für diesen Nachweis</h4>
            <p class="tc-hint">Themen und Unterthemen aus dem Levelplan markieren – auch über mehrere Themen hinweg.</p>
            <div class="tc-topic-goal-groups">${goalSections}</div>
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
            const goals = linkedGoalLabels(cp);
            const goalText = goals.length
              ? goals.slice(0, 3).map(escapeHtml).join(", ") + (goals.length > 3 ? " …" : "")
              : "Keine Was-Ziele markiert";
            const themaText = linkedTopicNames(cp);
            const when =
              cp.dateIso >= today
                ? `<span class="tc-when tc-when-upcoming">anstehend</span>`
                : `<span class="tc-when tc-when-past">vergangen</span>`;

            return `
            <li class="tc-checkpoint-item ${state.editCheckpointId && sameId(state.editCheckpointId, cp.id) ? "tc-checkpoint-item-active" : ""}">
              <div class="tc-checkpoint-item-body">
                <span class="tc-checkpoint-item-date">${escapeHtml(isoToGerman(cp.dateIso))}</span>
                <span class="tc-checkpoint-item-thema">${escapeHtml(themaText)}</span>
                <span class="tc-checkpoint-item-goals">${goalText}</span>
                ${when}
              </div>
              <button type="button" class="tc-edit-btn tc-checkpoint-edit" data-edit-checkpoint-id="${escapeHtml(cp.id)}">Bearbeiten</button>
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
        <p class="hint">Neueste Termine oben, älteste unten – gruppiert nach Art.</p>
        ${sections}
      </section>`;
  }

  function render() {
    const root = document.getElementById("competenciesTabRoot");
    if (!root) return;

    const existingCard = root.querySelector(".tc-levelcheck-card");
    if (existingCard && !state.editCheckpointId) {
      captureFormDraft(existingCard);
    }

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
          Termin (tt.mm.jjjj) und Art wählen, Was-Ziele über mehrere Themen markieren – dann speichern.
          Pro Fach können mehrere Nachweise mit unterschiedlichen Terminen angelegt werden.
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
    clearFormDraft();
    state.message = "";
    state.error = "";
    render();
  }

  function bindHandlers(root) {
    root.querySelector("#tcClassSelect")?.addEventListener("change", (e) => {
      state.classId = Number(e.target.value);
      state.editCheckpointId = null;
      clearFormDraft();
      state.message = "";
      state.error = "";
      loadData();
    });

    root.querySelector("#tcSubjectSelect")?.addEventListener("change", (e) => {
      state.subject = e.target.value;
      state.themaId = null;
      state.editCheckpointId = null;
      clearFormDraft();
      state.message = "";
      state.error = "";
      render();
    });

    const card = root.querySelector(".tc-levelcheck-card");
    if (card) {
      card.querySelector(".tc-checkpoint-type")?.addEventListener("change", (e) => {
        captureFormDraft(card);
        toggleCustomField(card, e.target.value === "custom");
        updateSaveButtonLabel(card);
      });

      card.querySelector(".tc-checkpoint-type-custom")?.addEventListener("input", () => {
        captureFormDraft(card);
        updateSaveButtonLabel(card);
      });

      card.querySelector(".tc-checkpoint-date")?.addEventListener("input", () => {
        captureFormDraft(card);
      });

      card.querySelectorAll(".tc-was-goal-check").forEach((el) => {
        el.addEventListener("change", () => captureFormDraft(card));
      });

      card.querySelector("#tcSaveCheckpointBtn")?.addEventListener("click", () => {
        saveCheckpoint();
      });

      card.querySelector("#tcNewCheckpointBtn")?.addEventListener("click", resetNewForm);
    }

    root.querySelectorAll(".tc-checkpoint-edit").forEach((btn) => {
      btn.addEventListener("click", () => {
        startEditCheckpoint(btn.dataset.editCheckpointId);
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

  function readCheckpointPayload() {
    const card = document.querySelector(".tc-levelcheck-card");
    if (!card) return null;

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
      levelCheckId: primaryTopicIdFromLinked(linkedSubtopicIds),
      checkpointDate,
      dateRaw,
      checkpointType,
      checkpointTypeLabel: checkpointType === "custom" ? customEl?.value?.trim() || "" : null,
      linkedSubtopicIds
    };
  }

  async function saveCheckpoint() {
    const payload = readCheckpointPayload();
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
          classId: state.classId,
          subject: state.subject,
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
      clearFormDraft();
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

/**
 * Lehrkraft – Levelstatus (Fach → Checkpoint-Thema → Unterthemen).
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
    { value: "custom", label: "Eigene Angabe" }
  ];

  const state = {
    classId: null,
    subject: null,
    data: null,
    loading: false,
    saving: false,
    deletingId: null,
    message: "",
    error: ""
  };

  let rootClickBound = false;

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

  function checkpointTypeOptions(selected) {
    const options = state.data?.checkpointTypeOptions?.length
      ? state.data.checkpointTypeOptions
      : DEFAULT_CHECKPOINT_TYPES;
    return options
      .map(
        (o) =>
          `<option value="${escapeHtml(o.value)}" ${o.value === selected ? "selected" : ""}>${escapeHtml(o.label)}</option>`
      )
      .join("");
  }

  function subjectsList() {
    const fromApi = state.data?.subjects;
    return Array.isArray(fromApi) && fromApi.length ? fromApi : FALLBACK_SUBJECTS;
  }

  function subjectOptions(subjects, selected) {
    return (subjects || [])
      .map(
        (s) =>
          `<option value="${escapeHtml(s)}" ${s === selected ? "selected" : ""}>${escapeHtml(s)}</option>`
      )
      .join("");
  }

  function topicsForSubject() {
    const subject = state.subject;
    return (state.data?.levelChecks || []).filter((lc) => lc.subject === subject);
  }

  function typeLabelForTopic(topic) {
    if (topic.checkpointType === "custom" && topic.checkpointTypeLabel) {
      return topic.checkpointTypeLabel;
    }
    const match = (state.data?.checkpointTypeOptions || DEFAULT_CHECKPOINT_TYPES).find(
      (o) => o.value === topic.checkpointType
    );
    return match?.label || "Klassenarbeit";
  }

  function renderCheckpointFields(topicOrNull, prefix) {
    const topic = topicOrNull || {};
    const type = topic.checkpointType || "klassenarbeit";
    const isCustom = type === "custom";
    const checkId = topic.id ? ` data-check-id="${escapeHtml(topic.id)}"` : "";
    const dateValue = topic.checkpointDate || "";

    return `
      <div class="tc-checkpoint-row">
        <label>
          Termin
          <input
            type="date"
            class="tc-checkpoint-date"
            ${checkId}
            id="${prefix}CheckpointDate"
            value="${escapeHtml(dateValue)}"
          >
        </label>
        <label>
          Art
          <select class="tc-checkpoint-type" ${checkId} id="${prefix}CheckpointType">
            ${checkpointTypeOptions(type)}
          </select>
        </label>
        <label class="tc-checkpoint-custom-wrap ${isCustom ? "" : "tc-checkpoint-custom-hidden"}">
          Eigene Bezeichnung
          <input
            type="text"
            class="tc-checkpoint-type-custom"
            ${checkId}
            id="${prefix}CheckpointTypeCustom"
            maxlength="80"
            placeholder="z. B. Projektprüfung"
            value="${isCustom ? escapeHtml(topic.checkpointTypeLabel || "") : ""}"
            ${isCustom ? "" : "disabled"}
          >
        </label>
      </div>`;
  }

  function renderAddTopicForm() {
    return `
      <form class="tc-add-form" id="tcAddTopicForm">
        <h3>Neues Checkpoint-Thema</h3>
        <p class="tc-hint">Thema für ${escapeHtml(state.subject)} – z. B. „Bruchrechnung“. Termin und Art erscheinen im Checkpoint-Plan der Schüler:innen.</p>
        <div class="tc-add-grid">
          <label>
            Thema
            <input type="text" id="tcAddTopicName" maxlength="120" required placeholder="z. B. Bruchrechnung">
          </label>
        </div>
        ${renderCheckpointFields(null, "tcAdd")}
        <button type="submit" class="action" id="tcAddTopicBtn" ${state.saving ? "disabled" : ""}>
          ${state.saving ? "Speichern…" : "Thema anlegen"}
        </button>
      </form>`;
  }

  function renderSubtopicRow(goal) {
    return `
      <li class="tc-goal-item">
        <span class="tc-goal-num">${goal.sortOrder}.</span>
        <span class="tc-goal-text">${escapeHtml(goal.text)}</span>
        <button type="button" class="tc-delete-btn tc-goal-del" data-goal-id="${escapeHtml(goal.id)}" aria-label="Unterthema löschen">×</button>
      </li>`;
  }

  function renderTopic(topic) {
    return `
      <article class="tc-levelcheck-card" data-check-id="${escapeHtml(topic.id)}">
        <div class="tc-levelcheck-head">
          <div>
            <span class="tc-levelcheck-subject">${escapeHtml(typeLabelForTopic(topic))}</span>
            <h4 class="tc-levelcheck-name">${escapeHtml(topic.name)}</h4>
            ${renderCheckpointFields(topic, `tcTopic-${topic.id}`)}
          </div>
          <button type="button" class="tc-delete-btn tc-topic-delete-btn" data-check-id="${escapeHtml(topic.id)}" ${state.deletingId === String(topic.id) ? "disabled" : ""}>${state.deletingId === String(topic.id) ? "Löschen…" : "Thema löschen"}</button>
        </div>
        <ol class="tc-goal-list">
          ${(topic.goals || []).map(renderSubtopicRow).join("")}
          ${!(topic.goals || []).length ? `<li class="tc-goal-empty">Noch keine Unterthemen – unten das erste eintragen.</li>` : ""}
        </ol>
        <form class="tc-goal-add-form" data-check-id="${escapeHtml(topic.id)}">
          <input type="text" class="tc-goal-input" maxlength="300" placeholder="Neues Unterthema (z. B. Brüche erweitern)" required>
          <button type="submit" class="action tc-goal-add-btn">Unterthema hinzufügen</button>
        </form>
      </article>`;
  }

  function renderTopicsList() {
    const topics = topicsForSubject();
    if (!topics.length) {
      return `<p class="tc-empty">Für ${escapeHtml(state.subject)} noch keine Themen. Lege oben das erste an.</p>`;
    }
    return `<div class="tc-levelcheck-list">${topics.map(renderTopic).join("")}</div>`;
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

    root.innerHTML = `
      <div class="panel">
        <h2>Levelstatus</h2>
        <p class="hint">Pro Fach Checkpoint-Themen anlegen: Termin, Art (Klassenarbeit, Test, Präsentation …) und Unterthemen. Schüler:innen sehen Termine im Checkpoint-Plan und setzen Zielnoten in der Zielsetzung.</p>

        <div class="tc-toolbar">
          <label>Klasse:
            <select id="tcClassSelect"></select>
          </label>
          <label>Fach:
            <select id="tcSubjectSelect">${subjectOptions(subjectsList(), state.subject)}</select>
          </label>
        </div>

        ${state.message ? `<div class="tc-msg tc-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="tc-msg tc-msg-err">${escapeHtml(state.error)}</div>` : ""}

        ${renderAddTopicForm()}
        ${renderTopicsList()}
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

  function toggleCustomField(wrap, show) {
    if (!wrap) return;
    wrap.classList.toggle("tc-checkpoint-custom-hidden", !show);
    const input = wrap.querySelector(".tc-checkpoint-type-custom");
    if (input) {
      input.disabled = !show;
      if (!show) input.value = "";
    }
  }

  function bindCheckpointTypeToggle(scope) {
    scope.querySelectorAll(".tc-checkpoint-type").forEach((sel) => {
      sel.addEventListener("change", () => {
        const card = sel.closest(".tc-levelcheck-card") || sel.closest(".tc-add-form");
        const wrap = card?.querySelector(".tc-checkpoint-custom-wrap");
        toggleCustomField(wrap, sel.value === "custom");
        if (sel.dataset.checkId) {
          saveCheckpointMeta(sel.dataset.checkId, card);
        }
      });
    });
  }

  function bindRootActions() {
    const root = document.getElementById("competenciesTabRoot");
    if (!root || rootClickBound) return;
    rootClickBound = true;

    root.addEventListener("click", (e) => {
      const topicBtn = e.target.closest(".tc-topic-delete-btn");
      if (topicBtn) {
        e.preventDefault();
        e.stopPropagation();
        deleteTopic(topicBtn.getAttribute("data-check-id"));
        return;
      }

      const goalBtn = e.target.closest(".tc-goal-del");
      if (goalBtn) {
        e.preventDefault();
        e.stopPropagation();
        deleteSubtopic(goalBtn.getAttribute("data-goal-id"));
      }
    });
  }

  async function readJsonResponse(res) {
    try {
      return await res.json();
    } catch (_err) {
      return {};
    }
  }

  function apiErrorMessage(res, data, fallback) {
    if (res.status === 403) return "Keine Berechtigung.";
    return data.message || data.error || fallback;
  }

  async function requestLevelCheckDelete(checkId) {
    const encodedId = encodeURIComponent(checkId);
    let res = await fetch(`/api/teacher/levelchecks/${encodedId}`, { method: "DELETE" });
    if (res.status === 404 || res.status === 405) {
      res = await fetch(`/api/teacher/levelchecks/${encodedId}/delete`, { method: "POST" });
    }
    return res;
  }

  async function requestLevelCheckGoalDelete(goalId) {
    const encodedId = encodeURIComponent(goalId);
    let res = await fetch(`/api/teacher/levelcheck-goals/${encodedId}`, { method: "DELETE" });
    if (res.status === 404 || res.status === 405) {
      res = await fetch(`/api/teacher/levelcheck-goals/${encodedId}/delete`, { method: "POST" });
    }
    return res;
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
      state.message = "";
      state.error = "";
      render();
    });

    root.querySelector("#tcAddTopicForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      addTopic();
    });

    root.querySelectorAll(".tc-goal-add-form").forEach((form) => {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        addSubtopic(form);
      });
    });

    bindCheckpointTypeToggle(root);

    root.querySelectorAll(".tc-checkpoint-date").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.dataset.checkId) {
          saveCheckpointMeta(input.dataset.checkId, input.closest(".tc-levelcheck-card"));
        }
      });
    });

    root.querySelectorAll(".tc-checkpoint-type-custom").forEach((input) => {
      input.addEventListener("blur", () => {
        if (input.dataset.checkId && input.value.trim()) {
          saveCheckpointMeta(input.dataset.checkId, input.closest(".tc-levelcheck-card"));
        }
      });
    });
  }

  function readCheckpointPayload(scope) {
    const typeEl = scope?.querySelector(".tc-checkpoint-type");
    const dateEl = scope?.querySelector(".tc-checkpoint-date");
    const customEl = scope?.querySelector(".tc-checkpoint-type-custom");
    const checkpointType = typeEl?.value || "klassenarbeit";
    return {
      checkpointDate: dateEl?.value || null,
      checkpointType,
      checkpointTypeLabel: checkpointType === "custom" ? customEl?.value?.trim() || "" : null
    };
  }

  async function saveCheckpointMeta(checkId, scope) {
    if (!checkId || !scope) return;
    const payload = readCheckpointPayload(scope);
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
        state.error = data.message || "Checkpoint-Daten konnten nicht gespeichert werden.";
        render();
        return;
      }
      state.message = data.checkpointDate
        ? `${data.checkpointTypeLabel} gespeichert · ${data.checkpointDateLabel}`
        : `${data.checkpointTypeLabel} gespeichert (ohne Termin)`;
      await loadData();
    } catch (err) {
      console.error(err);
      state.saving = false;
      state.error = "Netzwerkfehler beim Speichern.";
      render();
    }
  }

  async function addTopic() {
    const root = document.getElementById("competenciesTabRoot");
    const form = root?.querySelector("#tcAddTopicForm");
    const name = root?.querySelector("#tcAddTopicName")?.value?.trim();
    const payload = readCheckpointPayload(form);

    if (!state.subject || !name) {
      state.error = "Bitte Thema benennen.";
      state.message = "";
      render();
      return;
    }
    if (payload.checkpointType === "custom" && !payload.checkpointTypeLabel) {
      state.error = "Bitte eine eigene Bezeichnung eingeben.";
      state.message = "";
      render();
      return;
    }

    state.saving = true;
    state.error = "";
    state.message = "";
    render();

    try {
      const res = await fetch("/api/teacher/levelchecks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: state.classId,
          subject: state.subject,
          name,
          ...payload
        })
      });
      const data = await res.json();
      state.saving = false;

      if (!data.success) {
        state.error = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }

      state.message = `„${name}" angelegt – jetzt Unterthemen hinzufügen.`;
      await loadData();
    } catch (err) {
      console.error(err);
      state.saving = false;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function addSubtopic(form) {
    const checkId = form.dataset.checkId;
    const input = form.querySelector(".tc-goal-input");
    const goalText = input?.value?.trim();
    if (!checkId || !goalText) return;

    state.saving = true;
    state.error = "";
    try {
      const res = await fetch(`/api/teacher/levelchecks/${encodeURIComponent(checkId)}/goals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalText })
      });
      const data = await res.json();
      state.saving = false;
      if (!data.success) {
        state.error = data.message || "Unterthema konnte nicht gespeichert werden.";
        render();
        return;
      }
      state.message = "Unterthema hinzugefügt.";
      await loadData();
    } catch (err) {
      console.error(err);
      state.saving = false;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function deleteTopic(checkId) {
    if (!checkId || state.deletingId) return;
    if (!confirm("Thema mit allen Unterthemen wirklich löschen?")) return;

    state.deletingId = String(checkId);
    state.error = "";
    state.message = "";
    render();

    try {
      const res = await requestLevelCheckDelete(checkId);
      const data = await readJsonResponse(res);
      state.deletingId = null;

      if (!res.ok || !data.success) {
        state.error = apiErrorMessage(res, data, "Löschen fehlgeschlagen.");
        render();
        return;
      }

      if (state.data?.levelChecks) {
        state.data = {
          ...state.data,
          levelChecks: state.data.levelChecks.filter((lc) => String(lc.id) !== String(checkId))
        };
      }
      state.message = "Thema gelöscht.";
      render();
      await loadData();
    } catch (err) {
      console.error(err);
      state.deletingId = null;
      state.error = "Netzwerkfehler beim Löschen.";
      render();
    }
  }

  async function deleteSubtopic(goalId) {
    if (!goalId || state.deletingId) return;
    if (!confirm("Unterthema wirklich löschen?")) return;

    state.error = "";
    state.message = "";

    try {
      const res = await requestLevelCheckGoalDelete(goalId);
      const data = await readJsonResponse(res);
      if (!res.ok || !data.success) {
        state.error = apiErrorMessage(res, data, "Löschen fehlgeschlagen.");
        render();
        return;
      }
      state.message = "Unterthema gelöscht.";
      await loadData();
    } catch (err) {
      console.error(err);
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
    state.deletingId = null;
    bindRootActions();

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

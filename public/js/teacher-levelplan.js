/**
 * Lehrkraft – Levelplan (Kataloge nach Klassenstufe ansehen, bearbeiten/ergänzen, zuweisen, löschen).
 */
(function () {
  const GRADE_LEVELS = ["5", "6", "7", "8", "9", "10"];

  const state = {
    gradeLevel: "9",
    catalogId: null,
    subject: null,
    catalogs: [],
    detail: null,
    classes: [],
    assignClassId: null,
    loading: false,
    assigning: false,
    deleting: false,
    deletingTopicId: null,
    deletingGoalId: null,
    // Inline-Editor: { type: "goal-add"|"goal-edit"|"topic-add"|"topic-rename", topicId?, goalId?, draft }
    editor: null,
    savingEditor: false,
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

  function friendlyError(message) {
    const raw = String(message || "");
    if (raw === "Forbidden" || /keine berechtigung/i.test(raw)) {
      return "Sitzung abgelaufen oder noch nicht bereit – bitte Seite neu laden oder erneut einloggen.";
    }
    return raw || "Fehler beim Laden.";
  }

  function sameId(a, b) {
    return String(a) === String(b);
  }

  function catalogLabel(c) {
    if (!c) return "Levelplan";
    const topics = Array.isArray(c.topicNames) ? c.topicNames.filter(Boolean) : [];
    if (topics.length === 1) return topics[0];
    if (topics.length > 1) return `${c.name || "Levelplan"} (${topics.length} Themen)`;
    return c.displayName || c.name || "Levelplan";
  }

  function subjectsInCatalog() {
    const checks = state.detail?.levelChecks || [];
    const fromChecks = [...new Set(checks.map((c) => c.subject).filter(Boolean))];
    const all = state.detail?.subjects || [];
    return fromChecks.length ? fromChecks : all;
  }

  function topicsForSubject() {
    return (state.detail?.levelChecks || []).filter((lc) => lc.subject === state.subject);
  }

  function assignmentsForSubject() {
    return (state.detail?.assignments || []).filter((a) => a.subject === state.subject);
  }

  function ensureSelections() {
    if (!state.catalogId || !state.catalogs.some((c) => sameId(c.id, state.catalogId))) {
      state.catalogId = state.catalogs[0]?.id || null;
    }
    const subjects = subjectsInCatalog();
    if (!state.subject || !subjects.includes(state.subject)) {
      state.subject = subjects[0] || null;
    }
    if (
      !state.assignClassId ||
      !state.classes.some((c) => sameId(c.id, state.assignClassId))
    ) {
      state.assignClassId = state.classes[0]?.id || null;
    }
  }

  function isEditor(type, key) {
    const ed = state.editor;
    if (!ed || ed.type !== type) return false;
    if (type === "goal-edit") return sameId(ed.goalId, key);
    if (type === "goal-add" || type === "topic-rename") return sameId(ed.topicId, key);
    return true;
  }

  function renderGoalForm(heading, saveLabel) {
    const d = state.editor?.draft || {};
    const dis = state.savingEditor ? "disabled" : "";
    return `
      <div class="lp-form" data-lp-form="goal">
        <strong>${escapeHtml(heading)}</strong>
        <label>Unterthema
          <input type="text" maxlength="300" data-lp-field="text" value="${escapeHtml(d.text || "")}" placeholder="z. B. Potenzen berechnen" ${dis}>
        </label>
        <div class="lp-form-grid">
          <label>Rookie – Was-Ziel
            <textarea data-lp-field="rookie" maxlength="500" placeholder="Ich kann …" ${dis}>${escapeHtml(d.rookie || "")}</textarea>
          </label>
          <label>Operator – Was-Ziel
            <textarea data-lp-field="operator" maxlength="500" placeholder="Ich kann …" ${dis}>${escapeHtml(d.operator || "")}</textarea>
          </label>
          <label>Street Legend – Was-Ziel
            <textarea data-lp-field="streetLegend" maxlength="500" placeholder="Ich kann …" ${dis}>${escapeHtml(d.streetLegend || "")}</textarea>
          </label>
        </div>
        <div class="lp-form-actions">
          <button type="button" class="kr-practice-btn" data-lp-save-editor ${dis}>${state.savingEditor ? "Speichern…" : escapeHtml(saveLabel)}</button>
          <button type="button" class="kr-practice-btn kr-practice-btn--ghost" data-lp-cancel-editor ${dis}>Abbrechen</button>
        </div>
      </div>`;
  }

  function renderNameForm(heading, placeholder, saveLabel) {
    const d = state.editor?.draft || {};
    const dis = state.savingEditor ? "disabled" : "";
    return `
      <div class="lp-form" data-lp-form="name">
        <label>${escapeHtml(heading)}
          <input type="text" maxlength="120" data-lp-field="name" value="${escapeHtml(d.name || "")}" placeholder="${escapeHtml(placeholder)}" ${dis}>
        </label>
        <div class="lp-form-actions">
          <button type="button" class="kr-practice-btn" data-lp-save-editor ${dis}>${state.savingEditor ? "Speichern…" : escapeHtml(saveLabel)}</button>
          <button type="button" class="kr-practice-btn kr-practice-btn--ghost" data-lp-cancel-editor ${dis}>Abbrechen</button>
        </div>
      </div>`;
  }

  function renderTopics() {
    const topics = topicsForSubject();
    if (!state.catalogId) {
      return `<div class="tc-empty"><p>Noch kein Levelplan für Klassenstufe ${escapeHtml(state.gradeLevel)}.</p><p class="hint">Importiere einen Plan unter „Levelplan importieren“ – dabei „Neuer Levelplan“ wählen.</p></div>`;
    }

    const topicHtml = topics
      .map((topic) => {
        const goals = topic.goals || [];
        const rows = goals
          .map((g) => {
            if (isEditor("goal-edit", g.id)) {
              return `<tr><td colspan="5">${renderGoalForm("Unterthema bearbeiten", "Änderungen speichern")}</td></tr>`;
            }
            return `
          <tr>
            <td>${escapeHtml(g.text)}</td>
            <td>${escapeHtml(g.rookieGoalText || "–")}</td>
            <td>${escapeHtml(g.operatorGoalText || "–")}</td>
            <td>${escapeHtml(g.streetLegendGoalText || "–")}</td>
            <td>
              <div class="lp-row-actions">
                <button type="button" class="kr-practice-btn kr-practice-btn--ghost" data-lp-edit-goal="${escapeHtml(g.id)}" title="Dieses Unterthema bearbeiten">Bearbeiten</button>
                <button type="button" class="tc-delete-btn" data-lp-del-goal="${escapeHtml(g.id)}" title="Dieses Unterthema löschen" ${
                  state.deletingGoalId === String(g.id) ? "disabled" : ""
                }>${state.deletingGoalId === String(g.id) ? "Löschen…" : "Löschen"}</button>
              </div>
            </td>
          </tr>`;
          })
          .join("");

        const renaming = isEditor("topic-rename", topic.id);
        const adding = isEditor("goal-add", topic.id);

        return `
        <div class="lpi-preview-wrap" style="margin-top:1em">
          <div class="wg-topic-head">
            <div>
              <h3>${escapeHtml(topic.name)}</h3>
              <p class="hint">${goals.length} Unterthemen</p>
            </div>
            <div class="lp-topic-actions">
              <button type="button" class="kr-practice-btn" data-lp-add-goal="${escapeHtml(topic.id)}">+ Unterthema hinzufügen</button>
              <button type="button" class="kr-practice-btn kr-practice-btn--ghost" data-lp-rename-topic="${escapeHtml(topic.id)}">Thema umbenennen</button>
              <button type="button" class="tc-delete-btn tc-topic-delete-btn" data-lp-del-topic="${escapeHtml(topic.id)}" ${
                state.deletingTopicId === String(topic.id) ? "disabled" : ""
              }>
                ${state.deletingTopicId === String(topic.id) ? "Löschen…" : "Thema löschen"}
              </button>
            </div>
          </div>
          ${renaming ? renderNameForm("Neuer Name des Themas", "Themenname", "Umbenennen") : ""}
          ${
            goals.length
              ? `<div class="lpi-table-scroll">
            <table class="lpi-table">
              <thead>
                <tr>
                  <th>Unterthema</th>
                  <th>Rookie</th>
                  <th>Operator</th>
                  <th>Street Legend</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`
              : adding
                ? ""
                : `<p class="hint">Noch keine Unterthemen – füge das erste mit „+ Unterthema hinzufügen“ hinzu.</p>`
          }
          ${adding ? renderGoalForm("Neues Unterthema", "Unterthema hinzufügen") : ""}
        </div>`;
      })
      .join("");

    const subjectLabel = state.subject || "dieses Fach";
    const emptyHint = topics.length
      ? ""
      : `<div class="tc-empty"><p>Für ${escapeHtml(subjectLabel)} gibt es in diesem Plan noch keine Themen.</p></div>`;
    const addTopic = isEditor("topic-add")
      ? renderNameForm(`Neues Thema in ${subjectLabel}`, "z. B. Potenzen und Wurzeln", "Thema anlegen")
      : `<button type="button" class="kr-practice-btn" data-lp-add-topic ${state.subject ? "" : "disabled"}>+ Neues Thema in ${escapeHtml(subjectLabel)}</button>`;

    return `${emptyHint}${topicHtml}<div class="lp-add-topic">${addTopic}</div>`;
  }

  function renderActiveBanner() {
    if (!state.catalogId) return "";
    const assigned = [...new Set((state.detail?.assignments || []).map((a) => a.className).filter(Boolean))];
    const where = assigned.length
      ? `Dieser Plan ist <b>aktiv</b> für ${assigned.map(escapeHtml).join(", ")}. `
      : "";
    return `<div class="lp-banner">
      ${where}Du kannst ihn <b>jederzeit direkt bearbeiten</b>: Themen und Unterthemen ergänzen, umbenennen oder Ziele ändern –
      du musst den Plan nicht neu anlegen. Änderungen sehen die Schüler:innen sofort.
      <div style="margin-top:8px">
        <button type="button" class="kr-practice-btn kr-practice-btn--ghost" id="lpAppendImportBtn">Mehrere per Text ergänzen (Import)</button>
      </div>
    </div>`;
  }

  function renderAssignments() {
    const list = assignmentsForSubject();
    if (!list.length) {
      return `<p class="hint" style="margin-top:.6em">Noch keiner Klasse für ${escapeHtml(state.subject || "dieses Fach")} zugewiesen.</p>`;
    }
    return `
      <ul class="hint" style="margin:.6em 0 0;padding-left:1.2em">
        ${list.map((a) => `<li><b>${escapeHtml(a.className)}</b> · ${escapeHtml(a.subject)}</li>`).join("")}
      </ul>`;
  }

  function render() {
    const root = document.getElementById("levelplanTabRoot");
    if (!root) return;

    if (state.loading && !state.catalogs.length && !state.detail) {
      root.innerHTML = `<div class="tc-loading">Lade Levelplan…</div>`;
      return;
    }

    ensureSelections();

    const gradeOptions = GRADE_LEVELS.map(
      (g) =>
        `<option value="${escapeHtml(g)}" ${String(g) === String(state.gradeLevel) ? "selected" : ""}>Klasse ${escapeHtml(g)}</option>`
    ).join("");

    const catalogOptions = state.catalogs
      .map(
        (c) =>
          `<option value="${escapeHtml(c.id)}" ${sameId(c.id, state.catalogId) ? "selected" : ""}>${escapeHtml(catalogLabel(c))}</option>`
      )
      .join("");

    const subjectOptions = subjectsInCatalog()
      .map(
        (s) =>
          `<option value="${escapeHtml(s)}" ${s === state.subject ? "selected" : ""}>${escapeHtml(s)}</option>`
      )
      .join("");

    const classOptions = state.classes
      .map(
        (c) =>
          `<option value="${escapeHtml(c.id)}" ${sameId(c.id, state.assignClassId) ? "selected" : ""}>${escapeHtml(c.name)}</option>`
      )
      .join("");

    const canAssign =
      state.catalogId && state.subject && state.assignClassId && !state.assigning && !state.deleting;

    root.innerHTML = `
      <div class="panel">
        <h2>Levelplan</h2>
        <p class="hint">
          Levelpläne einer <b>Klassenstufe</b> ansehen, <b>bearbeiten und ergänzen</b>, einer Klasse zuweisen oder löschen.
          Ganz neue Pläne legst du unter <b>Levelplan importieren</b> an (dort „Neuer Levelplan“ wählen).
        </p>

        <div class="tc-toolbar">
          <label>Klassenstufe:
            <select id="lpGradeSelect">${gradeOptions}</select>
          </label>
          <label>Levelplan:
            <select id="lpCatalogSelect" ${state.catalogs.length ? "" : "disabled"}>
              ${catalogOptions || `<option value="">— kein Plan —</option>`}
            </select>
          </label>
          <label>Fach:
            <select id="lpSubjectSelect" ${subjectOptions ? "" : "disabled"}>
              ${subjectOptions || `<option value="">—</option>`}
            </select>
          </label>
          ${
            state.catalogId
              ? `<button type="button" class="tc-delete-btn tc-topic-delete-btn" id="lpDeleteCatalogBtn" ${
                  state.deleting ? "disabled" : ""
                }>${state.deleting ? "Löschen…" : "Levelplan löschen"}</button>`
              : ""
          }
        </div>

        ${state.message ? `<div class="tc-msg tc-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="tc-msg tc-msg-err">${escapeHtml(state.error)}</div>` : ""}

        ${renderActiveBanner()}

        ${
          state.catalogId
            ? `<div class="kr-levels-panel" style="margin-top:1.2em">
          <h3>Klasse zuweisen</h3>
          <p class="hint">Die Klasse kann mehrere Levelpläne für dasselbe Fach haben.</p>
          <div class="tc-toolbar" style="align-items:flex-end;gap:.6em;flex-wrap:wrap">
            <label>Klasse:
              <select id="lpAssignClass">${classOptions || `<option value="">—</option>`}</select>
            </label>
            <button type="button" class="kr-practice-btn" id="lpAssignBtn" ${canAssign ? "" : "disabled"}>
              ${state.assigning ? "Speichern…" : "Dieser Klasse zuweisen"}
            </button>
            <button type="button" class="kr-practice-btn kr-practice-btn--ghost" id="lpUnassignBtn" ${canAssign ? "" : "disabled"}>
              Zuweisung entfernen
            </button>
          </div>
          ${renderAssignments()}
        </div>`
            : ""
        }

        ${state.loading && state.catalogId ? `<div class="tc-loading" style="margin-top:1em">Lade Themen…</div>` : renderTopics()}
      </div>`;

    bindHandlers(root);
  }

  function startEditor(editor) {
    state.editor = editor;
    state.message = "";
    state.error = "";
    render();
    const first = document.querySelector("#levelplanTabRoot [data-lp-field]");
    if (first) first.focus();
  }

  function readDraftFromDom(root) {
    if (!state.editor) return;
    root.querySelectorAll("[data-lp-field]").forEach((el) => {
      state.editor.draft[el.dataset.lpField] = el.value;
    });
  }

  async function saveEditor() {
    const ed = state.editor;
    if (!ed || state.savingEditor || !state.catalogId) return;
    const d = ed.draft || {};
    const base = `/api/teacher/level-plan-catalogs/${encodeURIComponent(state.catalogId)}`;
    let url;
    let method = "POST";
    let body;

    if (ed.type === "topic-add") {
      url = `${base}/topics`;
      body = { subject: state.subject, name: String(d.name || "").trim() };
      if (!body.name) return fail("Bitte einen Namen für das Thema eingeben.");
    } else if (ed.type === "topic-rename") {
      url = `${base}/topics/${encodeURIComponent(ed.topicId)}`;
      method = "PATCH";
      body = { name: String(d.name || "").trim() };
      if (!body.name) return fail("Bitte einen Namen eingeben.");
    } else {
      body = {
        text: String(d.text || "").trim(),
        rookieGoalText: String(d.rookie || "").trim(),
        operatorGoalText: String(d.operator || "").trim(),
        streetLegendGoalText: String(d.streetLegend || "").trim()
      };
      if (!body.text) return fail("Bitte einen Namen für das Unterthema eingeben.");
      if (!body.rookieGoalText || !body.operatorGoalText || !body.streetLegendGoalText) {
        return fail("Bitte Rookie-, Operator- und Street-Legend-Ziel ausfüllen.");
      }
      if (ed.type === "goal-add") {
        url = `${base}/topics/${encodeURIComponent(ed.topicId)}/goals`;
      } else {
        url = `${base}/goals/${encodeURIComponent(ed.goalId)}`;
        method = "PATCH";
      }
    }

    function fail(msg) {
      state.error = msg;
      render();
    }

    state.savingEditor = true;
    state.error = "";
    state.message = "";
    render();

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      state.savingEditor = false;
      if (!res.ok || !data.success) {
        state.error = data.message || data.error || "Speichern fehlgeschlagen.";
        render();
        return;
      }
      state.message = data.message || "Gespeichert.";
      // Neues Thema: direkt das erste Unterthema anlegen lassen (leere Themen werden sonst entfernt).
      if (ed.type === "topic-add" && data.topicId) {
        state.editor = { type: "goal-add", topicId: data.topicId, draft: {} };
        await loadCatalogs();
        await loadDetail();
        document.querySelector("#levelplanTabRoot [data-lp-field]")?.focus();
        return;
      }
      // Mehrere Unterthemen hintereinander: Formular für nächstes Unterthema offen lassen.
      state.editor = ed.type === "goal-add" ? { type: "goal-add", topicId: ed.topicId, draft: {} } : null;
      await loadDetail();
      if (state.editor) document.querySelector("#levelplanTabRoot [data-lp-field]")?.focus();
    } catch (err) {
      console.error(err);
      state.savingEditor = false;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  function openImportForCatalog() {
    if (!state.catalogId) return;
    if (window.TeacherLevelplanImport?.prefill) {
      window.TeacherLevelplanImport.prefill({
        gradeLevel: state.gradeLevel,
        catalogId: state.catalogId,
        subject: state.subject
      });
    }
    if (typeof window.showTab === "function") window.showTab("levelplanImportTab");
  }

  function bindHandlers(root) {
    root.querySelectorAll("[data-lp-field]").forEach((el) => {
      el.addEventListener("input", () => {
        if (state.editor) state.editor.draft[el.dataset.lpField] = el.value;
      });
    });
    root.querySelectorAll("[data-lp-save-editor]").forEach((btn) =>
      btn.addEventListener("click", () => {
        readDraftFromDom(root);
        saveEditor();
      })
    );
    root.querySelectorAll("[data-lp-cancel-editor]").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.editor = null;
        state.error = "";
        render();
      })
    );
    root.querySelectorAll("[data-lp-add-goal]").forEach((btn) =>
      btn.addEventListener("click", () =>
        startEditor({ type: "goal-add", topicId: btn.dataset.lpAddGoal, draft: {} })
      )
    );
    root.querySelectorAll("[data-lp-edit-goal]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const found = findGoal(btn.dataset.lpEditGoal);
        if (!found) return;
        startEditor({
          type: "goal-edit",
          goalId: found.goal.id,
          draft: {
            text: found.goal.text || "",
            rookie: found.goal.rookieGoalText || "",
            operator: found.goal.operatorGoalText || "",
            streetLegend: found.goal.streetLegendGoalText || ""
          }
        });
      })
    );
    root.querySelectorAll("[data-lp-rename-topic]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const topic = (state.detail?.levelChecks || []).find((t) => sameId(t.id, btn.dataset.lpRenameTopic));
        startEditor({
          type: "topic-rename",
          topicId: btn.dataset.lpRenameTopic,
          draft: { name: topic?.name || "" }
        });
      })
    );
    root.querySelector("[data-lp-add-topic]")?.addEventListener("click", () =>
      startEditor({ type: "topic-add", draft: { name: "" } })
    );
    root.querySelector("#lpAppendImportBtn")?.addEventListener("click", openImportForCatalog);

    root.querySelectorAll('.lp-form input[type="text"]').forEach((el) =>
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          readDraftFromDom(root);
          saveEditor();
        }
      })
    );

    root.querySelector("#lpGradeSelect")?.addEventListener("change", async (e) => {
      state.editor = null;
      state.gradeLevel = e.target.value;
      state.catalogId = null;
      state.detail = null;
      state.message = "";
      state.error = "";
      await loadCatalogs();
      await loadDetail();
    });

    root.querySelector("#lpCatalogSelect")?.addEventListener("change", async (e) => {
      state.editor = null;
      state.catalogId = e.target.value || null;
      state.message = "";
      state.error = "";
      await loadDetail();
    });

    root.querySelector("#lpSubjectSelect")?.addEventListener("change", (e) => {
      state.editor = null;
      state.subject = e.target.value;
      state.message = "";
      state.error = "";
      render();
    });

    root.querySelector("#lpAssignClass")?.addEventListener("change", (e) => {
      state.assignClassId = e.target.value;
    });

    root.querySelector("#lpAssignBtn")?.addEventListener("click", () => saveAssignment(true));
    root.querySelector("#lpUnassignBtn")?.addEventListener("click", () => saveAssignment(false));
    root.querySelector("#lpDeleteCatalogBtn")?.addEventListener("click", deleteCatalog);

    root.querySelectorAll("[data-lp-del-topic]").forEach((btn) => {
      btn.addEventListener("click", () => deleteTopic(btn.dataset.lpDelTopic));
    });

    root.querySelectorAll("[data-lp-del-goal]").forEach((btn) => {
      btn.addEventListener("click", () => deleteGoal(btn.dataset.lpDelGoal));
    });
  }

  async function saveAssignment(assign) {
    if (!state.assignClassId || !state.subject) return;
    if (assign && !state.catalogId) return;

    state.assigning = true;
    state.message = "";
    state.error = "";
    render();

    try {
      const res = await fetch("/api/teacher/level-plan-assignment", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: Number(state.assignClassId),
          subject: state.subject,
          catalogId: state.catalogId,
          unassign: !assign
        })
      });
      const data = await res.json();
      state.assigning = false;
      if (!res.ok || !data.success) {
        state.error = data.message || "Zuweisung fehlgeschlagen.";
        render();
        return;
      }
      state.message = data.message || (assign ? "Zuweisung gespeichert." : "Zuweisung entfernt.");
      await loadDetail();
    } catch (err) {
      console.error(err);
      state.assigning = false;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function deleteCatalog() {
    if (!state.catalogId) return;
    const label = catalogLabel(state.catalogs.find((c) => sameId(c.id, state.catalogId)) || state.detail?.catalog);
    if (
      !confirm(
        `Levelplan „${label}“ wirklich komplett löschen?\n\nAlle Themen und Klassen-Zuweisungen dieses Plans werden entfernt.`
      )
    ) {
      return;
    }

    state.deleting = true;
    state.message = "";
    state.error = "";
    render();

    try {
      const res = await fetch(
        `/api/teacher/level-plan-catalogs/${encodeURIComponent(state.catalogId)}/delete`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
      );
      const data = await res.json().catch(() => ({}));
      state.deleting = false;
      if (!res.ok || !data.success) {
        state.error = data.message || "Löschen fehlgeschlagen.";
        render();
        return;
      }
      const removedId = state.catalogId;
      state.message = data.message || "Levelplan gelöscht.";
      state.catalogs = state.catalogs.filter((c) => !sameId(c.id, removedId));
      state.catalogId = state.catalogs[0]?.id || null;
      state.detail = null;
      await loadCatalogs();
      await loadDetail();
    } catch (err) {
      console.error(err);
      state.deleting = false;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function deleteTopic(topicId) {
    if (!topicId) return;
    if (!confirm("Dieses Thema inkl. aller Unterthemen wirklich löschen?")) return;

    state.deletingTopicId = String(topicId);
    state.message = "";
    state.error = "";
    render();

    try {
      const res = await fetch(`/api/teacher/levelchecks/${encodeURIComponent(topicId)}`, {
        method: "DELETE"
      });
      const data = await res.json().catch(() => ({}));
      state.deletingTopicId = null;
      if (!res.ok || data.success === false) {
        state.error = data.error || data.message || "Thema konnte nicht gelöscht werden.";
        render();
        return;
      }
      state.message = "Thema gelöscht.";
      await loadCatalogs();
      await loadDetail();
    } catch (err) {
      console.error(err);
      state.deletingTopicId = null;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  function findGoal(goalId) {
    for (const topic of state.detail?.levelChecks || []) {
      const goal = (topic.goals || []).find((g) => sameId(g.id, goalId));
      if (goal) return { goal, topic };
    }
    return null;
  }

  async function deleteGoal(goalId) {
    if (!goalId || state.deletingGoalId) return;
    const found = findGoal(goalId);
    const label = found?.goal?.text ? `„${found.goal.text}“` : "dieses Unterthema";
    if (
      !confirm(
        `Unterthema ${label} wirklich löschen?\n\n` +
          "Schüler-Markierungen (Rookie/Operator/Street Legend), Übungsstand und Freischaltungen " +
          "zu diesem Unterthema werden entfernt. Das Thema und die übrigen Unterthemen bleiben erhalten."
      )
    ) {
      return;
    }

    state.deletingGoalId = String(goalId);
    state.message = "";
    state.error = "";
    render();

    try {
      const encodedId = encodeURIComponent(goalId);
      let res = await fetch(`/api/teacher/levelcheck-goals/${encodedId}?keepTopic=1`, {
        method: "DELETE"
      });
      if (res.status === 404 || res.status === 405) {
        res = await fetch(`/api/teacher/levelcheck-goals/${encodedId}/delete?keepTopic=1`, {
          method: "POST"
        });
      }
      const data = await res.json().catch(() => ({}));
      state.deletingGoalId = null;
      if (!res.ok || !data.success) {
        state.error = data.message || data.error || "Unterthema konnte nicht gelöscht werden.";
        render();
        return;
      }
      state.message = "Unterthema gelöscht.";
      await loadDetail();
    } catch (err) {
      console.error(err);
      state.deletingGoalId = null;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function loadCatalogs() {
    const res = await fetch(
      `/api/teacher/level-plan-catalogs?gradeLevel=${encodeURIComponent(state.gradeLevel)}`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || "Levelpläne konnten nicht geladen werden.");
    state.catalogs = data.catalogs || [];
    if (!state.catalogId || !state.catalogs.some((c) => sameId(c.id, state.catalogId))) {
      state.catalogId = state.catalogs[0]?.id || null;
    }
  }

  async function loadDetail() {
    if (!state.catalogId) {
      state.detail = null;
      state.classes = [];
      render();
      return;
    }

    state.loading = true;
    render();

    try {
      const res = await fetch(`/api/teacher/level-plan-catalogs/${encodeURIComponent(state.catalogId)}`);
      const data = await res.json();
      state.loading = false;
      if (!res.ok) {
        state.detail = null;
        state.error = friendlyError(data.message || data.error || "Levelplan konnte nicht geladen werden.");
        render();
        return;
      }
      state.detail = data;
      state.classes = data.classes || [];
      state.error = "";
      render();
    } catch (err) {
      console.error(err);
      state.loading = false;
      state.detail = null;
      state.error = "Netzwerkfehler beim Laden.";
      render();
    }
  }

  async function init(opts = {}) {
    state.message = "";
    state.error = "";
    state.editor = null;
    state.savingEditor = false;
    try {
      const params = new URLSearchParams(window.location.search || "");
      if (!opts.gradeLevel && params.get("grade")) opts.gradeLevel = params.get("grade");
      if (!opts.catalogId && params.get("catalogId")) opts.catalogId = params.get("catalogId");
    } catch (_) {}
    if (opts.gradeLevel) state.gradeLevel = String(opts.gradeLevel);
    if (opts.catalogId) state.catalogId = opts.catalogId;

    const root = document.getElementById("levelplanTabRoot");
    if (root) root.innerHTML = `<div class="tc-loading">Lade Levelplan…</div>`;

    try {
      await loadCatalogs();
      await loadDetail();
    } catch (err) {
      console.error(err);
      if (root) {
        root.innerHTML = `<div class="tc-error">${escapeHtml(friendlyError(err.message))}
          <p class="hint" style="margin-top:12px">
            <button type="button" class="action" id="tcLevelplanRetry">Erneut laden</button>
            <a class="action" href="/login" style="margin-left:8px">Neu einloggen</a>
          </p>
        </div>`;
        document.getElementById("tcLevelplanRetry")?.addEventListener("click", () => {
          init({ gradeLevel: state.gradeLevel, catalogId: state.catalogId });
        });
      }
    }
  }

  window.TeacherLevelplan = { init };
})();

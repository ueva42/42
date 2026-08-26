/**
 * Lehrkraft – Levelplan (Kataloge nach Klassenstufe ansehen, zuweisen, löschen).
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

  function renderTopics() {
    const topics = topicsForSubject();
    if (!state.catalogId) {
      return `<div class="tc-empty"><p>Noch kein Levelplan für Klassenstufe ${escapeHtml(state.gradeLevel)}.</p><p class="hint">Importiere einen Plan unter „Levelplan importieren“ – dabei „Neuer Levelplan“ wählen.</p></div>`;
    }
    if (!topics.length) {
      return `<div class="tc-empty"><p>Für ${escapeHtml(state.subject || "dieses Fach")} gibt es in diesem Plan noch keine Themen.</p></div>`;
    }

    return topics
      .map((topic) => {
        const goals = topic.goals || [];
        const rows = goals
          .map(
            (g) => `
          <tr>
            <td>${escapeHtml(g.text)}</td>
            <td>${escapeHtml(g.rookieGoalText || "–")}</td>
            <td>${escapeHtml(g.operatorGoalText || "–")}</td>
            <td>${escapeHtml(g.streetLegendGoalText || "–")}</td>
          </tr>`
          )
          .join("");

        return `
        <div class="lpi-preview-wrap" style="margin-top:1em">
          <div class="wg-topic-head">
            <div>
              <h3>${escapeHtml(topic.name)}</h3>
              <p class="hint">${goals.length} Unterthemen</p>
            </div>
            <button type="button" class="tc-delete-btn tc-topic-delete-btn" data-lp-del-topic="${escapeHtml(topic.id)}" ${
              state.deletingTopicId === String(topic.id) ? "disabled" : ""
            }>
              ${state.deletingTopicId === String(topic.id) ? "Löschen…" : "Thema löschen"}
            </button>
          </div>
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
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`
              : `<p class="hint">Keine Unterthemen.</p>`
          }
        </div>`;
      })
      .join("");
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
          Levelpläne einer <b>Klassenstufe</b> ansehen, einer Klasse zuweisen oder löschen.
          Neue Pläne legst du unter <b>Levelplan importieren</b> an (dort „Neuer Levelplan“ wählen).
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

  function bindHandlers(root) {
    root.querySelector("#lpGradeSelect")?.addEventListener("change", async (e) => {
      state.gradeLevel = e.target.value;
      state.catalogId = null;
      state.detail = null;
      state.message = "";
      state.error = "";
      await loadCatalogs();
      await loadDetail();
    });

    root.querySelector("#lpCatalogSelect")?.addEventListener("change", async (e) => {
      state.catalogId = e.target.value || null;
      state.message = "";
      state.error = "";
      await loadDetail();
    });

    root.querySelector("#lpSubjectSelect")?.addEventListener("change", (e) => {
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

  async function loadCatalogs() {
    const res = await fetch(
      `/api/teacher/level-plan-catalogs?gradeLevel=${encodeURIComponent(state.gradeLevel)}`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Levelpläne konnten nicht geladen werden.");
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
        state.error = data.error || "Levelplan konnte nicht geladen werden.";
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
        root.innerHTML = `<div class="tc-error">${escapeHtml(err.message || "Fehler beim Laden.")}</div>`;
      }
    }
  }

  window.TeacherLevelplan = { init };
})();

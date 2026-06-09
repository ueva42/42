/**
 * Lehrkraft – Levelcheck-Themen verwalten (pro Klasse).
 */
(function () {
  const FALLBACK_SUBJECTS = [
    "Mathe",
    "Deutsch",
    "BNT",
    "Englisch",
    "Geo",
    "Geschichte",
    "Projekt"
  ];

  const state = {
    classId: null,
    data: null,
    loading: false,
    saving: false,
    message: "",
    error: ""
  };

  function subjectsList() {
    const fromApi = state.data?.subjects;
    return Array.isArray(fromApi) && fromApi.length ? fromApi : FALLBACK_SUBJECTS;
  }

  function sameId(a, b) {
    return String(a) === String(b);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function subjectOptions(subjects, selected) {
    return (subjects || [])
      .map(
        (s) =>
          `<option value="${escapeHtml(s)}" ${s === selected ? "selected" : ""}>${escapeHtml(s)}</option>`
      )
      .join("");
  }

  function renderAddForm() {
    if (!state.data?.ok) return "";

    return `
      <form class="tc-add-form" id="tcAddForm">
        <h3>Neues Levelcheck-Thema</h3>
        <p class="tc-hint">Schüler:innen laden pro Thema drei Nachweise hoch: Rookie → Operator → Street Legend.</p>
        <div class="tc-add-grid">
          <label>
            Fach
            <select id="tcAddSubject" required>
              <option value="">Bitte wählen…</option>
              ${subjectOptions(subjectsList(), null)}
            </select>
          </label>
          <label>
            Thema
            <input type="text" id="tcAddTopic" maxlength="200" required placeholder="z. B. Bruchrechnung – Erweitern">
          </label>
        </div>
        <button type="submit" class="action" id="tcAddBtn" ${state.saving ? "disabled" : ""}>
          ${state.saving ? "Speichern…" : "Thema hinzufügen"}
        </button>
      </form>`;
  }

  function renderTierLegend() {
    const tiers = state.data?.tiers || [];
    if (!tiers.length) return "";

    return `
      <div class="tc-tier-legend">
        ${tiers
          .map(
            (t) =>
              `<span class="tc-tier-pill"><strong>${escapeHtml(t.label)}</strong> +${t.xp} XP</span>`
          )
          .join("")}
      </div>`;
  }

  function renderTable() {
    const topics = state.data?.topics || [];
    if (!topics.length) {
      return `<p class="tc-empty">Noch keine Levelcheck-Themen für diese Klasse.</p>`;
    }

    return `
      <div class="tc-table-wrap">
        <table class="tc-table">
          <thead>
            <tr>
              <th>Fach</th>
              <th>Thema</th>
              <th>Uploads</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${topics
              .map(
                (t) => `
              <tr data-topic-id="${escapeHtml(t.id)}">
                <td>${escapeHtml(t.subject)}</td>
                <td>${escapeHtml(t.topic)}</td>
                <td>${t.uploadCount || 0}</td>
                <td>
                  <button type="button" class="tc-delete-btn" data-topic-id="${escapeHtml(t.id)}">Löschen</button>
                </td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>`;
  }

  function render() {
    const root = document.getElementById("competenciesTabRoot");
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="tc-loading">Lade Levelcheck-Themen…</div>`;
      return;
    }

    if (!state.data?.ok) {
      root.innerHTML = `<div class="tc-error">${escapeHtml(state.error || "Levelcheck-Themen konnten nicht geladen werden.")}</div>`;
      return;
    }

    root.innerHTML = `
      <div class="panel">
        <h2>Levelcheck-Themen</h2>
        <p class="hint">Lege pro Klasse Fach-Themen an. Schüler:innen laden dafür Nachweise hoch und erhalten XP – du musst keinen Status mehr pflegen.</p>

        <div class="tc-toolbar">
          <label>Klasse:
            <select id="tcClassSelect"></select>
          </label>
        </div>

        ${renderTierLegend()}

        ${state.message ? `<div class="tc-msg tc-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="tc-msg tc-msg-err">${escapeHtml(state.error)}</div>` : ""}

        ${renderAddForm()}
        ${renderTable()}
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
      loadTopics();
    });

    root.querySelector("#tcAddForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      addTopic();
    });

    root.querySelectorAll(".tc-delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => deleteTopic(btn.dataset.topicId));
    });
  }

  async function addTopic() {
    const root = document.getElementById("competenciesTabRoot");
    const subject = root?.querySelector("#tcAddSubject")?.value;
    const topic = root?.querySelector("#tcAddTopic")?.value?.trim();

    if (!subject || !topic) {
      state.error = "Bitte Fach und Thema ausfüllen.";
      state.message = "";
      render();
      return;
    }

    state.saving = true;
    state.error = "";
    state.message = "";
    render();

    try {
      const res = await fetch("/api/teacher/levelcheck-topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: state.classId, subject, topic })
      });
      const data = await res.json();

      if (!data.success) {
        state.saving = false;
        state.error = data.message || "Speichern fehlgeschlagen.";
        render();
        return;
      }

      state.saving = false;
      state.message = "Thema angelegt.";
      await loadTopics();
    } catch (err) {
      console.error(err);
      state.saving = false;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function deleteTopic(topicId) {
    if (!confirm("Dieses Thema und alle zugehörigen Uploads wirklich löschen?")) return;

    try {
      const res = await fetch(`/api/teacher/levelcheck-topics/${encodeURIComponent(topicId)}`, {
        method: "DELETE"
      });
      const data = await res.json();

      if (!data.success) {
        state.error = data.message || "Löschen fehlgeschlagen.";
        render();
        return;
      }

      state.message = "Thema gelöscht.";
      state.error = "";
      await loadTopics();
    } catch (err) {
      console.error(err);
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function loadTopics() {
    if (!state.classId) return;

    state.loading = true;
    if (!state.data?.ok) render();

    try {
      const params = new URLSearchParams({ classId: String(state.classId) });
      const res = await fetch(`/api/teacher/levelcheck-topics?${params}`);
      const payload = await res.json();

      if (!res.ok) {
        state.loading = false;
        state.data = null;
        state.error = payload.error || payload.message || "Laden fehlgeschlagen.";
        render();
        return;
      }

      state.data = { ...payload, ok: true };
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
    state.data = null;

    const root = document.getElementById("competenciesTabRoot");
    if (root) root.innerHTML = `<div class="tc-loading">Lade Levelcheck-Themen…</div>`;

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

      await loadTopics();
    } catch (err) {
      console.error(err);
      if (root) {
        root.innerHTML = `<div class="tc-error">${escapeHtml(err.message || "Fehler beim Laden.")}</div>`;
      }
    }
  }

  window.TeacherCompetencies = { init };
})();

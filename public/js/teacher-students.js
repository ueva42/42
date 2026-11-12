/**
 * Lehrkraft – Schüler:innen anlegen und Einmalpasswörter verwalten.
 */
(function () {
  const state = {
    classes: [],
    classId: null,
    students: [],
    className: "",
    loading: false,
    saving: false,
    message: "",
    error: "",
    lastPassword: null
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

  function selectedClass() {
    return state.classes.find((c) => sameId(c.id, state.classId)) || null;
  }

  function renderPasswordBanner() {
    if (!state.lastPassword) return "";
    return `
      <div class="ts-pw-banner" role="status">
        <div>
          <p class="ts-pw-kicker">Einmalpasswort für ${escapeHtml(state.lastPassword.name)}</p>
          <p class="ts-pw-code">${escapeHtml(state.lastPassword.password)}</p>
          <p class="ts-hint">Beim ersten Login muss ein eigenes Passwort gesetzt werden. Bis dahin bleibt es hier sichtbar.</p>
        </div>
        <button type="button" class="action" id="tsCopyPwBtn">Kopieren</button>
      </div>`;
  }

  function renderRows() {
    if (!state.students.length) {
      return `<p class="tc-hint">Noch keine Schüler:innen in dieser Klasse. Unten den ersten Namen eintragen.</p>`;
    }
    return `
      <ul class="ts-list">
        ${state.students
          .map((s) => {
            const pw = s.firstLogin && s.password
              ? `<code class="ts-pw">${escapeHtml(s.password)}</code>`
              : `<span class="ts-active">Aktiv</span>`;
            return `
              <li class="ts-row">
                <div class="ts-row__main">
                  <strong>${escapeHtml(s.name)}</strong>
                  <span class="ts-row__meta">${pw}</span>
                </div>
                <div class="ts-row__actions">
                  <button type="button" class="action ts-reset" data-reset-id="${escapeHtml(s.id)}" data-reset-name="${escapeHtml(s.name)}">Neues Passwort</button>
                  <button type="button" class="tc-delete-btn ts-del" data-del-id="${escapeHtml(s.id)}" data-del-name="${escapeHtml(s.name)}">Löschen</button>
                </div>
              </li>`;
          })
          .join("")}
      </ul>`;
  }

  function render() {
    const root = document.getElementById("teacherStudentsTabRoot");
    if (!root) return;

    if (state.loading && !state.classes.length) {
      root.innerHTML = `<div class="tc-loading">Lade Klasse…</div>`;
      return;
    }

    root.innerHTML = `
      <style>
        .ts-wrap{display:grid;gap:16px}
        .ts-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
        .ts-toolbar label{display:flex;gap:8px;align-items:center;color:#cbd5e1;font-size:.9rem}
        .ts-pw-banner{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:14px 16px;border-radius:14px;border:1px solid rgba(74,222,128,.4);background:rgba(20,83,45,.28)}
        .ts-pw-kicker{margin:0;color:#bbf7d0;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;font-weight:700}
        .ts-pw-code{margin:6px 0;font-size:1.45rem;font-weight:800;letter-spacing:.12em;color:#f8fafc;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
        .ts-hint{margin:0;color:#94a3b8;font-size:.85rem;line-height:1.4}
        .ts-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}
        .ts-row{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;align-items:center;padding:12px 14px;border-radius:12px;border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.5)}
        .ts-row__main{display:grid;gap:4px;min-width:160px}
        .ts-row__meta{display:flex;align-items:center;gap:8px}
        .ts-pw{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.95rem;color:#fef08a;background:rgba(15,23,42,.7);padding:2px 8px;border-radius:8px}
        .ts-active{color:#86efac;font-size:.85rem;font-weight:700}
        .ts-row__actions{display:flex;flex-wrap:wrap;gap:8px}
        .ts-add{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:4px}
        .ts-add input{flex:1;min-width:180px}
        @media (max-width:640px){
          .ts-pw-banner{flex-direction:column;align-items:stretch}
          .ts-row__actions{width:100%}
          .ts-row__actions .action,.ts-row__actions .tc-delete-btn{flex:1}
        }
      </style>
      <div class="panel ts-wrap">
        <h2>Schüler:innen anlegen</h2>
        <p class="hint">Lege Konten für deine Klasse an. Beim Anlegen gibt es ein Einmalpasswort – nach dem ersten Login setzt die Person ein eigenes.</p>

        <div class="ts-toolbar">
          <label>Klasse:
            <select id="tsClassSelect">
              ${
                state.classes.length
                  ? state.classes
                      .map(
                        (c) =>
                          `<option value="${escapeHtml(c.id)}" ${sameId(c.id, state.classId) ? "selected" : ""}>${escapeHtml(c.name)}</option>`
                      )
                      .join("")
                  : `<option value="">Keine Klasse</option>`
              }
            </select>
          </label>
          <span class="slg-badge">${state.students.length} Person${state.students.length === 1 ? "" : "en"}</span>
        </div>

        ${state.message ? `<div class="tc-msg tc-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="tc-msg tc-msg-err">${escapeHtml(state.error)}</div>` : ""}
        ${renderPasswordBanner()}
        ${renderRows()}

        <form class="ts-add" id="tsAddForm">
          <input type="text" id="tsNameInput" class="tc-goal-input" maxlength="80" placeholder="Name der Schülerin / des Schülers" required ${!state.classId || state.saving ? "disabled" : ""}>
          <button type="submit" class="action" ${!state.classId || state.saving ? "disabled" : ""}>
            ${state.saving ? "Anlegen…" : "Anlegen"}
          </button>
        </form>
      </div>`;

    bind(root);
  }

  function bind(root) {
    root.querySelector("#tsClassSelect")?.addEventListener("change", (e) => {
      state.classId = Number(e.target.value) || null;
      state.lastPassword = null;
      state.message = "";
      state.error = "";
      loadStudents();
    });

    root.querySelector("#tsAddForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      addStudent();
    });

    root.querySelector("#tsCopyPwBtn")?.addEventListener("click", async () => {
      const pw = state.lastPassword?.password;
      if (!pw) return;
      try {
        await navigator.clipboard.writeText(pw);
        state.message = "Passwort kopiert.";
        render();
      } catch {
        state.message = `Passwort: ${pw}`;
        render();
      }
    });

    root.querySelectorAll("[data-reset-id]").forEach((btn) => {
      btn.addEventListener("click", () => resetPassword(btn.dataset.resetId, btn.dataset.resetName));
    });

    root.querySelectorAll("[data-del-id]").forEach((btn) => {
      btn.addEventListener("click", () => deleteStudent(btn.dataset.delId, btn.dataset.delName));
    });
  }

  async function loadClasses() {
    state.loading = true;
    state.error = "";
    render();
    try {
      const res = await fetch("/api/class", { credentials: "same-origin", cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data)) {
        state.classes = [];
        state.error = data?.message || data?.error || "Klassen konnten nicht geladen werden.";
        return;
      }
      state.classes = data;
      if (!state.classId || !state.classes.some((c) => sameId(c.id, state.classId))) {
        state.classId = state.classes[0]?.id || null;
      }
    } catch (err) {
      console.error(err);
      state.classes = [];
      state.error = "Netzwerkfehler.";
    } finally {
      state.loading = false;
      render();
      if (state.classId) await loadStudents();
    }
  }

  async function loadStudents() {
    if (!state.classId) {
      state.students = [];
      render();
      return;
    }
    state.loading = true;
    state.error = state.error || "";
    render();
    try {
      const res = await fetch(
        `/api/teacher/students?classId=${encodeURIComponent(state.classId)}`,
        { credentials: "same-origin", cache: "no-store" }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        state.students = [];
        state.error = data?.message || "Laden fehlgeschlagen.";
        return;
      }
      state.students = Array.isArray(data.students) ? data.students : [];
      state.className = data.className || selectedClass()?.name || "";
    } catch (err) {
      console.error(err);
      state.students = [];
      state.error = "Netzwerkfehler.";
    } finally {
      state.loading = false;
      render();
    }
  }

  async function addStudent() {
    const root = document.getElementById("teacherStudentsTabRoot");
    const input = root?.querySelector("#tsNameInput");
    const name = input?.value?.trim();
    if (!name || !state.classId || state.saving) return;

    state.saving = true;
    state.error = "";
    state.message = "";
    render();

    try {
      const res = await fetch("/api/teacher/students", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, classId: state.classId })
      });
      const data = await res.json().catch(() => null);
      state.saving = false;

      if (!res.ok || !data?.success) {
        state.error = data?.message || "Anlegen fehlgeschlagen.";
        render();
        return;
      }

      const pw = data.temporaryPassword || data.student?.password;
      state.lastPassword = pw
        ? { name: data.student?.name || name, password: pw }
        : null;
      state.message = `${data.student?.name || name} angelegt.`;
      await loadStudents();
    } catch (err) {
      console.error(err);
      state.saving = false;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function resetPassword(studentId, name) {
    if (!studentId || state.saving) return;
    if (
      !confirm(
        `Neues Einmalpasswort für ${name || "diese Person"} erzeugen?\nDas bisherige funktioniert danach nicht mehr.`
      )
    ) {
      return;
    }

    state.saving = true;
    state.error = "";
    state.message = "";
    render();

    try {
      const res = await fetch("/api/teacher/students/reset-password", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: Number(studentId) })
      });
      const data = await res.json().catch(() => null);
      state.saving = false;

      if (!res.ok || !data?.success) {
        state.error = data?.message || "Passwort konnte nicht gesetzt werden.";
        render();
        return;
      }

      const pw = data.temporaryPassword || data.password;
      state.lastPassword = pw
        ? { name: data.studentName || name || "Schüler:in", password: pw }
        : null;
      state.message = "Neues Einmalpasswort erzeugt.";
      await loadStudents();
    } catch (err) {
      console.error(err);
      state.saving = false;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function deleteStudent(studentId, name) {
    if (!studentId || state.saving) return;
    if (!confirm(`„${name || "Diese Person"}“ wirklich löschen? Das Konto ist danach weg.`)) {
      return;
    }

    state.saving = true;
    state.error = "";
    state.message = "";
    render();

    try {
      const res = await fetch(`/api/teacher/students/${encodeURIComponent(studentId)}`, {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store"
      });
      const data = await res.json().catch(() => null);
      state.saving = false;

      if (!res.ok || !data?.success) {
        state.error = data?.message || "Löschen fehlgeschlagen.";
        render();
        return;
      }

      if (sameId(state.lastPassword?.name, name)) state.lastPassword = null;
      state.message = "Schüler:in gelöscht.";
      await loadStudents();
    } catch (err) {
      console.error(err);
      state.saving = false;
      state.error = "Netzwerkfehler.";
      render();
    }
  }

  async function init() {
    state.message = "";
    state.error = "";
    state.lastPassword = null;
    await loadClasses();
  }

  window.TeacherStudents = { init };
})();

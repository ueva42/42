/**
 * SRL-Logbuch – KOMPETENZ-STATUS-Screen.
 */
(function () {
  const STATUS_STYLE = {
    offen: "status-offen",
    in_arbeit: "status-in-arbeit",
    bereit: "status-bereit",
    test_angemeldet: "status-test",
    bestanden: "status-bestanden",
    nacharbeit: "status-nacharbeit"
  };

  const state = {
    data: null,
    loading: false,
    modalItem: null
  };

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatUpdated(val) {
    if (!val) return "";
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  function buildRequestTemplate(item) {
    const name = state.data?.studentName || "Schüler:in";
    return `Levelaufstieg beantragen

Name: ${name}
Fach: ${item.subject}
Thema: ${item.topic}
Aktueller Status: ${item.statusLabel}

Ich fühle mich bereit für den nächsten Schritt und möchte einen Levelcheck / Levelaufstieg besprechen.`;
  }

  function renderItem(item) {
    const statusClass = STATUS_STYLE[item.status] || "status-offen";
    const updated = formatUpdated(item.updatedAt);
    const canRequest = ["in_arbeit", "bereit"].includes(item.status);

    return `
      <div class="comp-card ${statusClass}">
        <div class="comp-card-top">
          <span class="comp-topic">${escapeHtml(item.topic)}</span>
          <span class="comp-status-badge">${escapeHtml(item.statusLabel)}</span>
        </div>
        ${updated ? `<div class="comp-updated">Aktualisiert: ${escapeHtml(updated)}</div>` : ""}
        ${
          canRequest
            ? `<button type="button" class="comp-request-btn" data-item-id="${item.id}">
                Levelaufstieg beantragen
              </button>`
            : ""
        }
      </div>`;
  }

  function renderGrouped() {
    if (!state.data?.grouped?.length) {
      return `
        <div class="comp-empty">
          <p>Noch keine Kompetenz-Einträge.</p>
          <p class="comp-empty-hint">Deine Lehrkraft legt Themen und Status hier an.</p>
        </div>`;
    }

    return state.data.grouped
      .map(
        (group) => `
        <section class="comp-subject-group">
          <h3 class="comp-subject-title">${escapeHtml(group.subject)}</h3>
          <div class="comp-cards">
            ${group.items.map(renderItem).join("")}
          </div>
        </section>`
      )
      .join("");
  }

  function renderModal() {
    if (!state.modalItem) return "";

    const text = buildRequestTemplate(state.modalItem);
    return `
      <div class="comp-modal-overlay" id="compModalOverlay">
        <div class="comp-modal">
          <div class="comp-modal-head">
            <h3>Levelaufstieg beantragen</h3>
            <button type="button" class="comp-modal-close" id="compModalClose" aria-label="Schließen">✕</button>
          </div>
          <p class="comp-modal-hint">Zeige diesen Text deiner Lehrkraft oder kopiere ihn.</p>
          <textarea class="comp-modal-text" id="compModalText" readonly>${escapeHtml(text)}</textarea>
          <div class="comp-modal-actions">
            <button type="button" class="btn-primary" id="compModalCopy">Text kopieren</button>
            <button type="button" class="logbuch-btn-ghost" id="compModalClose2">Schließen</button>
          </div>
          <div class="comp-copy-msg" id="compCopyMsg" style="display:none;">Kopiert!</div>
        </div>
      </div>`;
  }

  function render() {
    const root = document.getElementById("competencies-screen-root");
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="logbuch-loading">Lade Kompetenzen…</div>`;
      return;
    }

    if (!state.data) {
      root.innerHTML = `<div class="logbuch-msg logbuch-msg-error">Kompetenzen konnten nicht geladen werden.</div>`;
      return;
    }

    root.innerHTML = `
      <div class="comp-shell">
        <p class="comp-intro">Deine Themen und Levelkarten – gruppiert nach Fach.</p>
        ${renderGrouped()}
        ${renderModal()}
      </div>`;

    bindHandlers(root);
  }

  function closeModal() {
    state.modalItem = null;
    render();
  }

  function bindHandlers(root) {
    root.querySelectorAll(".comp-request-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.itemId;
        for (const group of state.data.grouped) {
          const item = group.items.find((i) => i.id === id);
          if (item) {
            state.modalItem = item;
            render();
            break;
          }
        }
      });
    });

    root.querySelector("#compModalClose")?.addEventListener("click", closeModal);
    root.querySelector("#compModalClose2")?.addEventListener("click", closeModal);
    root.querySelector("#compModalOverlay")?.addEventListener("click", (e) => {
      if (e.target.id === "compModalOverlay") closeModal();
    });

    root.querySelector("#compModalCopy")?.addEventListener("click", async () => {
      const ta = root.querySelector("#compModalText");
      const msg = root.querySelector("#compCopyMsg");
      if (!ta) return;

      try {
        await navigator.clipboard.writeText(ta.value);
        if (msg) {
          msg.style.display = "block";
          setTimeout(() => {
            msg.style.display = "none";
          }, 2000);
        }
      } catch {
        ta.select();
        document.execCommand("copy");
        if (msg) {
          msg.style.display = "block";
          setTimeout(() => {
            msg.style.display = "none";
          }, 2000);
        }
      }
    });
  }

  async function init() {
    state.loading = true;
    state.modalItem = null;
    state.data = null;

    const root = document.getElementById("competencies-screen-root");
    if (root) {
      root.innerHTML = `<div class="logbuch-loading">Lade Kompetenzen…</div>`;
    }

    try {
      const res = await fetch("/api/student/competencies");
      state.data = await res.json();
      state.loading = false;
      render();
    } catch (err) {
      console.error(err);
      state.loading = false;
      state.data = null;
      render();
    }
  }

  window.LogbuchCompetencies = { init };
})();

/**
 * SRL-Logbuch – Levelchecks (Upload-Nachweise pro Thema).
 */
(function () {
  const state = {
    data: null,
    loading: false,
    uploading: null,
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

  function formatDate(val) {
    if (!val) return "";
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  function renderTier(topic, tier) {
    const uploadKey = `${topic.id}_${tier.id}`;
    const isUploading = state.uploading === uploadKey;

    if (tier.upload) {
      const label = tier.upload.fileName || "Nachweis";
      return `
        <div class="lc-tier lc-tier-done">
          <div class="lc-tier-head">
            <span class="lc-tier-name">${escapeHtml(tier.label)}</span>
            <span class="lc-tier-xp">+${tier.xp} XP ✓</span>
          </div>
          <a class="lc-tier-link" href="${escapeHtml(tier.upload.fileUrl)}" target="_blank" rel="noopener">
            ${escapeHtml(label)}
          </a>
          <div class="lc-tier-date">Hochgeladen: ${escapeHtml(formatDate(tier.upload.uploadedAt))}</div>
        </div>`;
    }

    if (!tier.unlocked) {
      return `
        <div class="lc-tier lc-tier-locked">
          <div class="lc-tier-head">
            <span class="lc-tier-name">${escapeHtml(tier.label)}</span>
            <span class="lc-tier-xp">+${tier.xp} XP</span>
          </div>
          <p class="lc-tier-lock-msg">Zuerst die vorherige Stufe hochladen.</p>
        </div>`;
    }

    return `
      <div class="lc-tier lc-tier-ready">
        <div class="lc-tier-head">
          <span class="lc-tier-name">${escapeHtml(tier.label)}</span>
          <span class="lc-tier-xp">+${tier.xp} XP</span>
        </div>
        <div class="file-upload">
          <input
            type="file"
            id="lc_file_${uploadKey}"
            class="file-input"
            accept="image/*,.pdf,application/pdf"
            data-topic-id="${escapeHtml(topic.id)}"
            data-tier="${escapeHtml(tier.id)}"
          >
          <label for="lc_file_${uploadKey}" class="file-label">Nachweis wählen</label>
          <span class="file-name" id="lc_name_${uploadKey}">Keine Datei ausgewählt</span>
          <button
            type="button"
            class="btn-primary lc-upload-btn"
            data-topic-id="${escapeHtml(topic.id)}"
            data-tier="${escapeHtml(tier.id)}"
            ${isUploading ? "disabled" : ""}
          >
            ${isUploading ? "Wird hochgeladen…" : "Hochladen"}
          </button>
        </div>
      </div>`;
  }

  function renderTopic(topic) {
    return `
      <article class="lc-topic-card">
        <div class="lc-topic-head">
          <h4 class="lc-topic-title">${escapeHtml(topic.topic)}</h4>
          <span class="lc-topic-progress">${topic.doneCount}/${topic.totalTiers}</span>
        </div>
        <div class="lc-tiers">
          ${topic.tiers.map((tier) => renderTier(topic, tier)).join("")}
        </div>
      </article>`;
  }

  function renderGrouped() {
    if (!state.data?.hasClass) {
      return `
        <div class="lc-empty">
          <p>Dir ist noch keine Klasse zugeordnet.</p>
          <p class="lc-empty-hint">Frag deine Lehrkraft, wenn Levelchecks fehlen.</p>
        </div>`;
    }

    if (!state.data?.grouped?.length) {
      return `
        <div class="lc-empty">
          <p>Noch keine Levelcheck-Themen.</p>
          <p class="lc-empty-hint">Deine Lehrkraft legt Fach-Themen an – dann kannst du hier Nachweise hochladen.</p>
        </div>`;
    }

    return state.data.grouped
      .map(
        (group) => `
        <section class="lc-subject-group">
          <h3 class="lc-subject-title">${escapeHtml(group.subject)}</h3>
          <div class="lc-topics">
            ${group.topics.map(renderTopic).join("")}
          </div>
        </section>`
      )
      .join("");
  }

  function render() {
    const root = document.getElementById("competencies-screen-root");
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `<div class="logbuch-loading">Lade Levelchecks…</div>`;
      return;
    }

    if (!state.data) {
      root.innerHTML = `<div class="logbuch-msg logbuch-msg-error">Levelchecks konnten nicht geladen werden.</div>`;
      return;
    }

    root.innerHTML = `
      <div class="lc-shell">
        <p class="lc-intro">
          Pro Thema drei Nachweise: <strong>Rookie</strong> → <strong>Operator</strong> → <strong>Street Legend</strong>.
          Du erhältst XP direkt nach dem Upload.
        </p>
        ${state.message ? `<div class="logbuch-msg logbuch-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="logbuch-msg logbuch-msg-error">${escapeHtml(state.error)}</div>` : ""}
        ${renderGrouped()}
      </div>`;

    bindHandlers(root);
  }

  function bindHandlers(root) {
    root.querySelectorAll('input[type="file"][id^="lc_file_"]').forEach((input) => {
      input.addEventListener("change", () => {
        const key = input.id.replace("lc_file_", "");
        const nameEl = root.querySelector(`#lc_name_${key}`);
        if (nameEl) {
          nameEl.textContent = input.files.length ? input.files[0].name : "Keine Datei ausgewählt";
        }
      });
    });

    root.querySelectorAll(".lc-upload-btn").forEach((btn) => {
      btn.addEventListener("click", () => uploadTier(btn.dataset.topicId, btn.dataset.tier));
    });
  }

  async function uploadTier(topicId, tier) {
    const key = `${topicId}_${tier}`;
    const input = document.getElementById(`lc_file_${key}`);
    if (!input?.files?.length) {
      state.error = "Bitte zuerst eine Datei wählen.";
      state.message = "";
      render();
      return;
    }

    state.uploading = key;
    state.error = "";
    state.message = "";
    render();

    try {
      const form = new FormData();
      form.append("file", input.files[0]);
      form.append("topicId", topicId);
      form.append("tier", tier);

      const res = await fetch("/api/student/levelcheck-upload", { method: "POST", body: form });
      const data = await res.json();

      state.uploading = null;

      if (!data.success) {
        state.error = data.message || "Upload fehlgeschlagen.";
        render();
        return;
      }

      state.message = `${data.tierLabel} hochgeladen – +${data.xpAwarded} XP!`;
      if (typeof loadMe === "function") loadMe();

      await loadData();
    } catch (err) {
      console.error(err);
      state.uploading = null;
      state.error = "Netzwerkfehler beim Upload.";
      render();
    }
  }

  async function loadData() {
    try {
      const res = await fetch("/api/student/levelchecks");
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

  async function init() {
    state.loading = true;
    state.uploading = null;
    state.message = "";
    state.error = "";
    state.data = null;

    const root = document.getElementById("competencies-screen-root");
    if (root) {
      root.innerHTML = `<div class="logbuch-loading">Lade Levelchecks…</div>`;
    }

    await loadData();
  }

  window.LogbuchCompetencies = { init };
})();

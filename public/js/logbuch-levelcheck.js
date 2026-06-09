/**
 * SRL-Logbuch – Levelcheck (Nachweise hochladen pro Levelcheck).
 */
(function () {
  const state = {
    data: null,
    loading: false,
    uploading: null,
    message: "",
    error: ""
  };

  let initPromise = null;
  let initGeneration = 0;
  let loadRequestId = 0;

  async function fetchJson(url, options = {}, retries = 1) {
    let lastErr = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, options);
        if (!res.ok) {
          const err = new Error(`HTTP ${res.status}`);
          if (attempt < retries && (res.status === 403 || res.status >= 500)) {
            await new Promise((r) => setTimeout(r, 350));
            continue;
          }
          throw err;
        }
        return await res.json();
      } catch (err) {
        lastErr = err;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 350));
          continue;
        }
      }
    }

    throw lastErr || new Error("Anfrage fehlgeschlagen");
  }

  function isLevelcheckPayload(data) {
    return data && typeof data.hasClass === "boolean" && Array.isArray(data.grouped);
  }

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

  function renderTier(levelCheck, tier) {
    const uploadKey = `${levelCheck.id}_${tier.id}`;
    const isUploading = state.uploading === uploadKey;

    if (tier.upload) {
      return `
        <div class="lc-tier lc-tier-done">
          <div class="lc-tier-head">
            <span class="lc-tier-name">${escapeHtml(tier.label)}</span>
            <span class="lc-tier-xp">+${tier.xp} XP ✓</span>
          </div>
          <a class="lc-tier-link" href="${escapeHtml(tier.upload.fileUrl)}" target="_blank" rel="noopener">
            ${escapeHtml(tier.upload.fileName || "Nachweis")}
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
            id="lchk_file_${uploadKey}"
            class="file-input"
            accept="image/*,.pdf,application/pdf"
          >
          <label for="lchk_file_${uploadKey}" class="file-label">Nachweis wählen</label>
          <span class="file-name" id="lchk_name_${uploadKey}">Keine Datei ausgewählt</span>
          <button
            type="button"
            class="btn-primary lc-upload-btn"
            data-check-id="${escapeHtml(levelCheck.id)}"
            data-tier="${escapeHtml(tier.id)}"
            data-upload-key="${escapeHtml(uploadKey)}"
            ${isUploading ? "disabled" : ""}
          >
            ${isUploading ? "Wird hochgeladen…" : "Hochladen"}
          </button>
        </div>
      </div>`;
  }

  function renderLevelCheck(lc) {
    return `
      <article class="lc-topic-card">
        <div class="lc-topic-head">
          <div>
            <h4 class="lc-topic-title">${escapeHtml(lc.name)}</h4>
            <p class="lc-topic-meta">${lc.goalCount} Ziele im Levelplan · ${escapeHtml(lc.subject)}</p>
          </div>
          <span class="lc-topic-progress">${lc.doneCount}/${lc.totalTiers}</span>
        </div>
        <div class="lc-tiers">
          ${lc.tiers.map((tier) => renderTier(lc, tier)).join("")}
        </div>
      </article>`;
  }

  function renderGrouped() {
    if (!state.data?.hasClass) {
      return `<div class="lc-empty"><p>Dir ist noch keine Klasse zugeordnet.</p></div>`;
    }

    if (!state.data?.grouped?.length) {
      return `
        <div class="lc-empty">
          <p>Noch keine Levelchecks.</p>
          <p class="lc-empty-hint">Sobald deine Lehrkraft Levelchecks anlegt, kannst du hier Nachweise hochladen.</p>
        </div>`;
    }

    return state.data.grouped
      .map(
        (group) => `
        <section class="lc-subject-group">
          <h3 class="lc-subject-title">${escapeHtml(group.subject)}</h3>
          <div class="lc-topics">
            ${group.levelChecks.map(renderLevelCheck).join("")}
          </div>
        </section>`
      )
      .join("");
  }

  function render() {
    const root = document.getElementById("levelcheck-screen-root");
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
          <strong>Levelcheck:</strong> Lade deinen Nachweis hoch – Rookie → Operator → Street Legend.
          Pro Levelcheck (z. B. Levelcheck I) einmal pro Stufe.
        </p>
        ${state.message ? `<div class="logbuch-msg logbuch-msg-ok">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="logbuch-msg logbuch-msg-error">${escapeHtml(state.error)}</div>` : ""}
        ${renderGrouped()}
      </div>`;

    bindHandlers(root);
  }

  function bindHandlers(root) {
    root.querySelectorAll('input[type="file"][id^="lchk_file_"]').forEach((input) => {
      input.addEventListener("change", () => {
        const key = input.id.replace("lchk_file_", "");
        const nameEl = root.querySelector(`#lchk_name_${key}`);
        if (nameEl) {
          nameEl.textContent = input.files.length ? input.files[0].name : "Keine Datei ausgewählt";
        }
      });
    });

    root.querySelectorAll(".lc-upload-btn").forEach((btn) => {
      btn.addEventListener("click", () =>
        uploadProof(btn.dataset.checkId, btn.dataset.tier, btn.dataset.uploadKey)
      );
    });
  }

  async function uploadProof(levelCheckId, tier, uploadKey) {
    const input = document.getElementById(`lchk_file_${uploadKey}`);
    if (!input?.files?.length) {
      state.error = "Bitte zuerst eine Datei wählen.";
      render();
      return;
    }

    state.uploading = uploadKey;
    state.error = "";
    state.message = "";
    render();

    try {
      const form = new FormData();
      form.append("file", input.files[0]);
      form.append("levelCheckId", levelCheckId);
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
      await loadData(initGeneration);
    } catch (err) {
      console.error(err);
      state.uploading = null;
      state.error = "Netzwerkfehler beim Upload.";
      render();
    }
  }

  async function loadData(generation = initGeneration) {
    const requestId = ++loadRequestId;

    try {
      const data = await fetchJson("/api/student/levelcheck");
      if (requestId !== loadRequestId || generation !== initGeneration) return;
      if (!isLevelcheckPayload(data)) throw new Error("Ungültige Levelcheck-Antwort");

      state.data = data;
      state.loading = false;
      render();
    } catch (err) {
      console.error(err);
      if (requestId !== loadRequestId || generation !== initGeneration) return;
      state.loading = false;
      state.data = null;
      render();
    }
  }

  async function initInternal() {
    const generation = ++initGeneration;
    state.loading = true;
    state.uploading = null;
    state.message = "";
    state.error = "";
    state.data = null;

    const root = document.getElementById("levelcheck-screen-root");
    if (root) root.innerHTML = `<div class="logbuch-loading">Lade Levelchecks…</div>`;

    await loadData(generation);
  }

  function init() {
    if (initPromise) return initPromise;
    initPromise = initInternal().finally(() => {
      initPromise = null;
    });
    return initPromise;
  }

  window.LogbuchLevelcheck = { init };
})();

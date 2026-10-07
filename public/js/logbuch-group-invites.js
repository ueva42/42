/**
 * Gruppeneinladungen – zentriertes Modal (nicht Glocke).
 * Annehmen / Ablehnen direkt hier; sichtbar auf Mein Tag & Gruppenmodus.
 */
(function () {
  const POLL_MS = 12000;
  let timerId = null;
  let started = false;
  let busy = false;
  let lastKey = "";

  function esc(str) {
    return window.LogbuchUI?.escapeHtml?.(str) ?? String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function ensureRoot() {
    let root = document.getElementById("solGroupInviteModalRoot");
    if (root) return root;
    root = document.createElement("div");
    root.id = "solGroupInviteModalRoot";
    root.setAttribute("aria-live", "polite");
    document.body.appendChild(root);
    if (!document.getElementById("solGroupInviteModalStyles")) {
      const style = document.createElement("style");
      style.id = "solGroupInviteModalStyles";
      style.textContent = `
        #solGroupInviteModalRoot{position:fixed;inset:0;z-index:12000;display:none;align-items:center;justify-content:center;padding:18px;pointer-events:none}
        #solGroupInviteModalRoot.is-open{display:flex;pointer-events:auto}
        .sol-invite-backdrop{position:absolute;inset:0;background:rgba(4,12,24,.72);backdrop-filter:blur(8px)}
        .sol-invite-dialog{position:relative;z-index:1;width:min(440px,100%);max-height:min(86vh,720px);overflow:auto;border-radius:22px;border:1px solid rgba(34,211,238,.42);background:linear-gradient(165deg,rgba(10,28,52,.97),rgba(8,18,36,.98));box-shadow:0 24px 64px rgba(0,0,0,.45),0 0 0 1px rgba(168,85,247,.18);padding:22px 20px 18px;color:#e0f2fe}
        .sol-invite-kicker{margin:0 0 6px;font-family:Orbitron,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;font-size:.72rem;color:#67e8f9}
        .sol-invite-title{margin:0 0 8px;font-size:1.35rem;line-height:1.25;font-weight:800}
        .sol-invite-lead{margin:0 0 16px;opacity:.82;line-height:1.45;font-size:.98rem}
        .sol-invite-card{display:grid;gap:6px;padding:14px 14px 12px;border-radius:16px;border:1px solid rgba(148,163,184,.28);background:rgba(8,24,48,.55);margin-bottom:12px}
        .sol-invite-card__subject{font-weight:800;font-size:1.08rem}
        .sol-invite-card__meta{opacity:.78;font-size:.92rem}
        .sol-invite-actions{display:flex;gap:10px;margin-top:8px}
        .sol-invite-actions button{flex:1;min-height:52px;border-radius:14px;font-size:1.02rem;font-weight:700;cursor:pointer;border:0}
        .sol-invite-btn--accept{background:linear-gradient(90deg,#22d3ee,#a855f7);color:#fff;box-shadow:0 8px 28px rgba(34,211,238,.28)}
        .sol-invite-btn--decline{background:transparent;border:1px solid rgba(34,211,238,.4)!important;color:#e0f2fe}
        .sol-invite-btn--accept:disabled,.sol-invite-btn--decline:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
        .sol-invite-error{margin:0 0 10px;padding:10px 12px;border-radius:12px;background:rgba(220,60,60,.22);color:#fecaca;font-size:.92rem}
        .sol-invite-ok{margin:0 0 10px;padding:10px 12px;border-radius:12px;background:rgba(34,211,238,.16);border:1px solid rgba(34,211,238,.28);font-size:.92rem}
        @media (prefers-reduced-motion:reduce){
          .sol-invite-backdrop{backdrop-filter:none}
        }
      `;
      document.head.appendChild(style);
    }
    return root;
  }

  function closeModal() {
    const root = ensureRoot();
    root.classList.remove("is-open");
    root.innerHTML = "";
    lastKey = "";
    document.body.style.removeProperty("overflow");
  }

  function inviteKey(invites) {
    return (invites || [])
      .map((i) => String(i.id || ""))
      .filter(Boolean)
      .sort()
      .join("|");
  }

  function renderModal(invites, { error = "", message = "" } = {}) {
    const root = ensureRoot();
    if (!invites?.length) {
      closeModal();
      return;
    }
    const key = inviteKey(invites);
    const first = invites[0];
    const more = invites.length - 1;
    const from = first.hostName
      ? `${first.hostName} hat dich eingeladen`
      : "Du wurdest eingeladen";
    const group =
      first.groupName ||
      (first.memberNames || []).filter(Boolean).slice(0, 3).join(", ") ||
      "Gruppe";
    const who = (first.memberNames || []).join(", ") || "noch ohne weitere Zusagen";
    root.innerHTML = `
      <div class="sol-invite-backdrop" data-invite-dismiss="1" tabindex="-1"></div>
      <div class="sol-invite-dialog" role="dialog" aria-modal="true" aria-labelledby="solInviteTitle">
        <p class="sol-invite-kicker">Gruppenmodus</p>
        <h2 class="sol-invite-title" id="solInviteTitle">Einladung zur Gruppe</h2>
        <p class="sol-invite-lead">${esc(from)}. Tippe auf Annehmen oder Ablehnen.</p>
        ${error ? `<p class="sol-invite-error">${esc(error)}</p>` : ""}
        ${message ? `<p class="sol-invite-ok">${esc(message)}</p>` : ""}
        <div class="sol-invite-card">
          <div class="sol-invite-card__subject">${esc(first.subject || "Fach")}${
            first.groupName ? `: ${esc(first.groupName)}` : ""
          }</div>
          <div class="sol-invite-card__meta">${esc(group)}</div>
          <div class="sol-invite-card__meta">${esc(who)} · ${Number(first.memberCount) || 0}/${
            Number(first.maxMembers) || 4
          } Personen</div>
          ${
            more > 0
              ? `<div class="sol-invite-card__meta">+${more} weitere Einladung${
                  more === 1 ? "" : "en"
                }</div>`
              : ""
          }
        </div>
        <div class="sol-invite-actions">
          <button type="button" class="sol-invite-btn--accept" data-invite-accept="${esc(
            first.id
          )}">Annehmen</button>
          <button type="button" class="sol-invite-btn--decline" data-invite-decline="${esc(
            first.id
          )}">Ablehnen</button>
        </div>
      </div>`;
    root.classList.add("is-open");
    document.body.style.overflow = "hidden";
    lastKey = key;

    root.querySelector("[data-invite-dismiss]")?.addEventListener("click", () => {
      // Backdrop schließt nicht – Einladung muss beantwortet werden
    });

    root.querySelectorAll("[data-invite-accept]").forEach((btn) => {
      btn.addEventListener("click", () => respond(btn.getAttribute("data-invite-accept"), true));
    });
    root.querySelectorAll("[data-invite-decline]").forEach((btn) => {
      btn.addEventListener("click", () => respond(btn.getAttribute("data-invite-decline"), false));
    });
  }

  async function respond(sessionId, accept) {
    if (!sessionId || busy) return;
    busy = true;
    const root = ensureRoot();
    root.querySelectorAll("button").forEach((b) => {
      b.disabled = true;
    });
    try {
      const res = await fetch(`/api/student/group-sessions/${sessionId}/invite-respond`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept: !!accept })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.message || data.error || "Das hat nicht geklappt.");
      }
      window.dispatchEvent(
        new CustomEvent("sol:group-invite-resolved", {
          detail: { sessionId, accept: !!accept, data }
        })
      );
      if (accept) {
        renderModal([], {});
        closeModal();
        // Kurz Feedback, dann restliche Einladungen nachladen
        const toast = document.createElement("div");
        toast.className = "sol-invite-dialog";
        toast.style.cssText =
          "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:12001;width:min(360px,90vw);text-align:center";
        toast.innerHTML = `<p class="sol-invite-ok" style="margin:0">Zusage gespeichert – du bist in der Gruppe.</p>`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 1600);
        if (window.StudentRouter?.navigateToSection) {
          // Gruppenmodus aktualisieren, falls geöffnet
          const onGm = (location.pathname || "").includes("gruppenmodus");
          if (onGm) {
            window.StudentRouter.navigateToSection("gruppenmodus");
          }
        }
      } else {
        closeModal();
      }
      await refresh({ force: true });
    } catch (err) {
      const invites = await fetchInvites().catch(() => []);
      renderModal(invites, { error: err.message || "Antwort fehlgeschlagen." });
    } finally {
      busy = false;
    }
  }

  async function fetchInvites() {
    const res = await fetch("/api/student/group-mode/pending-invites", {
      credentials: "same-origin",
      cache: "no-store"
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data.invites) ? data.invites : [];
  }

  async function refresh({ force = false } = {}) {
    if (document.hidden && !force) return;
    try {
      const invites = await fetchInvites();
      const key = inviteKey(invites);
      if (!invites.length) {
        closeModal();
        return;
      }
      if (!force && key === lastKey && ensureRoot().classList.contains("is-open")) {
        return;
      }
      renderModal(invites);
    } catch {
      /* ignore poll errors */
    }
  }

  function start() {
    if (started) return;
    started = true;
    refresh({ force: true });
    timerId = window.setInterval(() => refresh(), POLL_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refresh({ force: true });
    });
    window.addEventListener("sol:group-invite-resolved", () => {
      setTimeout(() => refresh({ force: true }), 400);
    });
  }

  function stop() {
    started = false;
    if (timerId) clearInterval(timerId);
    timerId = null;
    closeModal();
  }

  window.LogbuchGroupInvites = { start, stop, refresh, closeModal };
})();

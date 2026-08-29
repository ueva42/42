(() => {
  const STYLE_ID = "demo-banner-style";

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .demo-banner {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 40;
        padding: 8px 14px;
        text-align: center;
        font: 600 12px/1.35 "IBM Plex Sans", system-ui, sans-serif;
        color: #fef3c7;
        background: linear-gradient(90deg, #7c2d12, #92400e 45%, #7c2d12);
        border-top: 1px solid rgba(251, 191, 36, 0.45);
        box-shadow: 0 -4px 18px rgba(0, 0, 0, 0.2);
        pointer-events: none;
      }
      body.demo-mode-active {
        padding-bottom: 40px;
      }
      body.demo-mode-active.admin-app .sidebar,
      body.demo-mode-active.student-app .student-topbar {
        /* Top-Navigation bleibt frei */
      }
    `;
    document.head.appendChild(style);
  }

  async function showDemoBannerIfNeeded() {
    try {
      const res = await fetch("/api/auth/session", {
        credentials: "same-origin",
        cache: "no-store"
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.isDemo) return;

      injectStyles();
      document.body.classList.add("demo-mode-active");
      window.__isDemo = true;

      if (document.querySelector(".demo-banner")) return;

      const bar = document.createElement("div");
      bar.className = "demo-banner";
      bar.setAttribute("role", "status");
      bar.textContent =
        "Demo-Modus · Daten werden regelmäßig zurückgesetzt · Passwort demo2026";
      document.body.appendChild(bar);
    } catch (_err) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showDemoBannerIfNeeded);
  } else {
    showDemoBannerIfNeeded();
  }
})();

(() => {
  const STYLE_ID = "demo-banner-style";

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .demo-banner {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 99999;
        padding: 10px 16px;
        text-align: center;
        font: 600 13px/1.4 "IBM Plex Sans", system-ui, sans-serif;
        color: #fef3c7;
        background: linear-gradient(90deg, #7c2d12, #92400e 45%, #7c2d12);
        border-bottom: 1px solid rgba(251, 191, 36, 0.45);
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.25);
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

      if (document.querySelector(".demo-banner")) return;

      const bar = document.createElement("div");
      bar.className = "demo-banner";
      bar.setAttribute("role", "status");
      bar.textContent =
        "Demo-Modus – Beispieldaten werden regelmäßig zurückgesetzt · Alle Demo-Accounts: Passwort demo2026";
      document.body.prepend(bar);
    } catch (_err) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showDemoBannerIfNeeded);
  } else {
    showDemoBannerIfNeeded();
  }
})();

/**
 * Client-Helfer: freigeschaltete App-Module der Klasse.
 * Quelle: /api/student/me → featureModules (Default: alles an).
 */
(function () {
  const CORE = new Set(["hub", "today", "plan", "check", "reflect"]);

  const SECTION_MODULE = {
    week: "week",
    ueben: "ueben",
    levelplan: "levelplan",
    zielsetzung: "zielsetzung",
    hausaufgaben: "hausaufgaben",
    "checkpoint-plan": "checkpointPlan",
    materialschrank: "materialschrank",
    gruppenmodus: "gruppenmodus",
    "taktik-deck": "taktikDeck",
    missionen: "missionen",
    belohnungen: "belohnungen",
    charakter: "charakter",
    xp: "xp"
  };

  function modulesFromProfile() {
    const raw =
      window.__studentProfile?.featureModules ||
      window.__featureModules ||
      null;
    return raw && typeof raw === "object" ? raw : null;
  }

  function isModuleEnabled(moduleId) {
    if (!moduleId) return true;
    const mods = modulesFromProfile();
    if (!mods) return true;
    return mods[moduleId] !== false;
  }

  function isSectionEnabled(section) {
    const key = String(section || "").trim();
    if (!key || CORE.has(key)) return true;
    // Logic Coach ist kein Klassen-Modul – bleibt an, wenn der Server ihn freigibt
    if (key === "logic-coach") return true;
    const moduleId = SECTION_MODULE[key];
    if (!moduleId) return true;
    return isModuleEnabled(moduleId);
  }

  function applyNavVisibility() {
    document.querySelectorAll("[data-section]").forEach((el) => {
      const section = el.getAttribute("data-section");
      if (!section || CORE.has(section) || section === "hub") {
        el.hidden = false;
        el.removeAttribute("aria-hidden");
        return;
      }
      const on = isSectionEnabled(section);
      el.hidden = !on;
      el.setAttribute("aria-hidden", on ? "false" : "true");
      if (!on) el.classList.remove("active");
    });
  }

  let hubRefreshQueued = false;
  function refreshVisibleSurfaces() {
    applyNavVisibility();
    const section = document.body?.dataset?.studentSection || "";
    if (section !== "hub" || !window.LogbuchHub?.refresh || hubRefreshQueued) return;
    hubRefreshQueued = true;
    Promise.resolve()
      .then(() => window.LogbuchHub.refresh())
      .finally(() => {
        hubRefreshQueued = false;
      });
  }

  window.StudentFeatureModules = {
    CORE,
    SECTION_MODULE,
    isModuleEnabled,
    isSectionEnabled,
    applyNavVisibility,
    setModules(modules) {
      window.__featureModules = modules && typeof modules === "object" ? modules : null;
      if (window.__studentProfile) {
        window.__studentProfile.featureModules = window.__featureModules;
      }
      refreshVisibleSurfaces();
    }
  };
})();

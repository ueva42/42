/**
 * Client-side routing for /student/* SPA paths.
 */
(function () {
  const SECTION_ROUTES = {
    hub: "/student/hub",
    today: "/student/today",
    week: "/student/week",
    levelplan: "/student/levelplan",
    "taktik-deck": "/student/taktik-deck",
    zielsetzung: "/student/zielsetzung",
    "checkpoint-plan": "/student/checkpoint-plan",
    levelcheck: "/student/zielsetzung",
    competencies: "/student/levelplan",
    plan: "/student/plan",
    check: "/student/check",
    reflect: "/student/reflect",
    missionen: "/student/missionen",
    belohnungen: "/student/belohnungen",
    charakter: "/student/charakter",
    xp: "/student/xp"
  };

  const ROUTE_SECTIONS = {
    "/student/hub": "hub",
    "/student/today": "today",
    "/student/week": "week",
    "/student/levelplan": "levelplan",
    "/student/taktik-deck": "taktik-deck",
    "/student/zielsetzung": "zielsetzung",
    "/student/checkpoint-plan": "checkpoint-plan",
    "/student/levelcheck": "zielsetzung",
    "/student/competencies": "levelplan",
    "/student/plan": "plan",
    "/student/check": "check",
    "/student/reflect": "reflect",
    "/student/status": "hub",
    "/student/missionen": "missionen",
    "/student/belohnungen": "belohnungen",
    "/student/charakter": "charakter",
    "/student/xp": "xp"
  };

  const NAV_SECTIONS = new Set([
    "hub",
    "today",
    "week",
    "levelplan",
    "taktik-deck",
    "zielsetzung",
    "checkpoint-plan",
    "levelcheck",
    "missionen",
    "belohnungen",
    "charakter",
    "xp"
  ]);

  const FLOW_SECTIONS = new Set(["plan", "check", "reflect"]);

  const DEFAULT_SECTION = "hub";

  function normalizeSection(section) {
    return section === "levelcheck" ? "zielsetzung" : section;
  }

  function routeForSection(section) {
    const key = normalizeSection(section);
    return SECTION_ROUTES[key] || SECTION_ROUTES[DEFAULT_SECTION];
  }

  function sectionFromPath(pathname, search) {
    const base = pathname.replace(/\/+$/, "") || "/student/hub";
    let section = ROUTE_SECTIONS[base];

    if (base === "/student/plan" || base === "/student/check" || base === "/student/reflect") {
      return { section, query: new URLSearchParams(search || "") };
    }

    if (!section && base.startsWith("/student")) {
      section = DEFAULT_SECTION;
    }

    return { section: section || DEFAULT_SECTION, query: new URLSearchParams(search || "") };
  }

  function buildUrl(section, query) {
    const path = routeForSection(section);
    if (!query || !query.toString()) return path;
    return `${path}?${query.toString()}`;
  }

  function setNavActive(section) {
    document.querySelectorAll(".student-bottomnav-item, .student-nav-rail-item[data-section]").forEach((item) => {
      item.classList.toggle("active", item.dataset.section === section);
    });
  }

  function updateStudentChrome(section) {
    section = normalizeSection(section);
    document.body.dataset.studentSection = section;

    const backBtn = document.getElementById("topbarBackBtn");
    if (backBtn) backBtn.hidden = section === "hub" || FLOW_SECTIONS.has(section);

    document.body.classList.toggle("student-on-hub", section === "hub");

    if (NAV_SECTIONS.has(section)) {
      setNavActive(section === "levelcheck" ? "zielsetzung" : section);
    } else if (FLOW_SECTIONS.has(section)) {
      setNavActive("today");
    }
  }

  function showSectionOnly(section) {
    section = normalizeSection(section);
    document.querySelectorAll(".section").forEach((s) => {
      s.style.display = "none";
    });

    const el = document.getElementById(`${section}-section`);
    if (el) el.style.display = "block";

    updateStudentChrome(section);

    if (window.LogbuchScreens && typeof window.LogbuchScreens.init === "function") {
      const query = new URLSearchParams(location.search);
      window.LogbuchScreens.init(section, query);
    }

    document.body.classList.remove("menu-open");

    if (section === "today" && typeof window.refreshTodayStatus === "function") {
      window.refreshTodayStatus();
    }

    if (section === "hub" && window.LogbuchHub) {
      window.LogbuchHub.refreshStats();
    }
  }

  function navigateToSection(section, options = {}) {
    section = normalizeSection(section);
    const { replace = false, query = null } = options;
    const url = buildUrl(section, query);
    const state = { section, query: query ? query.toString() : "" };

    if (replace) {
      history.replaceState(state, "", url);
    } else if (location.pathname + location.search !== url) {
      history.pushState(state, "", url);
    }

    showSectionOnly(section);
  }

  function initFromPath() {
    const { section, query } = sectionFromPath(location.pathname, location.search);
    const normalizedPath = location.pathname.replace(/\/+$/, "") || "/student/hub";
    const url = buildUrl(section, query);

    history.replaceState(
      { section, query: query.toString() },
      "",
      normalizedPath === "/student/status" ? "/student/hub" : url
    );
    showSectionOnly(section);
  }

  function bindBottomNav() {
    document.querySelectorAll(".student-bottomnav-item, .student-nav-rail-item[data-section]").forEach((item) => {
      item.addEventListener("click", () => {
        navigateToSection(item.dataset.section);
      });
    });

    document.getElementById("topbarBackBtn")?.addEventListener("click", () => {
      navigateToSection("hub");
    });

    document.getElementById("topbarBrand")?.addEventListener("click", () => {
      navigateToSection("hub");
    });
  }

  window.StudentRouter = {
    SECTION_ROUTES,
    routeForSection,
    sectionFromPath,
    navigateToSection,
    showSectionOnly,
    initFromPath,
    bindBottomNav,
    DEFAULT_SECTION
  };

  window.addEventListener("popstate", (e) => {
    const section = e.state?.section || sectionFromPath(location.pathname, location.search).section;
    showSectionOnly(section);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindBottomNav);
  } else {
    bindBottomNav();
  }
})();

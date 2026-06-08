/**
 * Client-side routing for /student/* SPA paths.
 */
(function () {
  const SECTION_ROUTES = {
    today: "/student/today",
    week: "/student/week",
    competencies: "/student/competencies",
    plan: "/student/plan",
    check: "/student/check",
    reflect: "/student/reflect",
    status: "/student/status",
    missionen: "/student/missionen",
    belohnungen: "/student/belohnungen",
    charakter: "/student/charakter",
    xp: "/student/xp"
  };

  const ROUTE_SECTIONS = Object.fromEntries(
    Object.entries(SECTION_ROUTES).map(([section, route]) => [route, section])
  );

  const SIDEBAR_SECTIONS = new Set([
    "today",
    "week",
    "competencies",
    "status",
    "missionen",
    "belohnungen",
    "charakter",
    "xp"
  ]);

  const DEFAULT_SECTION = "today";

  function routeForSection(section) {
    return SECTION_ROUTES[section] || SECTION_ROUTES[DEFAULT_SECTION];
  }

  function sectionFromPath(pathname, search) {
    const base = pathname.replace(/\/+$/, "") || "/student/today";
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

  function setSidebarActive(section) {
    document.querySelectorAll(".menu-item").forEach((item) => {
      const itemSection = item.dataset.section;
      item.classList.toggle(
        "active",
        SIDEBAR_SECTIONS.has(section) && itemSection === section
      );
    });
  }

  function showSectionOnly(section) {
    document.querySelectorAll(".section").forEach((s) => {
      s.style.display = "none";
    });

    const el = document.getElementById(`${section}-section`);
    if (el) el.style.display = "block";

    setSidebarActive(section);

    if (window.LogbuchScreens && typeof window.LogbuchScreens.init === "function") {
      const query = new URLSearchParams(location.search);
      window.LogbuchScreens.init(section, query);
    }

    if (window.innerWidth <= 900) {
      document.body.classList.remove("menu-open");
    }
  }

  function navigateToSection(section, options = {}) {
    const { replace = false, query = null } = options;
    const url = buildUrl(section, query);
    const state = { section, query: query ? query.toString() : "" };

    if (replace) {
      history.replaceState(state, "", url);
    } else if (
      location.pathname + location.search !== url
    ) {
      history.pushState(state, "", url);
    }

    showSectionOnly(section);
  }

  function initFromPath() {
    const { section, query } = sectionFromPath(location.pathname, location.search);
    history.replaceState(
      { section, query: query.toString() },
      "",
      buildUrl(section, query)
    );
    showSectionOnly(section);
  }

  window.StudentRouter = {
    SECTION_ROUTES,
    routeForSection,
    sectionFromPath,
    navigateToSection,
    showSectionOnly,
    initFromPath,
    DEFAULT_SECTION
  };

  window.addEventListener("popstate", (e) => {
    const section = e.state?.section || sectionFromPath(location.pathname, location.search).section;
    showSectionOnly(section);
  });
})();

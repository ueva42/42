/**
 * Session-aware fetch + Rollen-Landing.
 * Logout nur wenn die Session nachweislich tot ist (401 / authenticated:false).
 * Ein 403 bei gültiger Session darf niemanden aus dem Tab werfen.
 *
 * Multi-Tab: Alle Tabs teilen EIN Session-Cookie (connect.sid). Meldet sich in
 * Tab B ein anderes Konto an, kann Tab A nicht parallel als altes Konto
 * weiterarbeiten. Wir verhindern nur, dass Tab A unter fremder Identität
 * liest/schreibt (409), und zeigen ein ruhiges Banner. Kein Auto-Redirect,
 * kein Wipe von localStorage, keine Kaskade über Tabs.
 */
(function () {
  if (window.__authFetchInstalled) return;
  window.__authFetchInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  const AUTH_KEY = "sol.authed";
  // Pro Tab: "role:userId" der Session, mit der diese Shell gebootet hat.
  // Cookies teilen sich alle Tabs – loggt sich woanders ein anderes Konto ein,
  // darf dieser Tab nicht still unter fremder Identität weiterlaufen.
  const TAB_IDENTITY_KEY = "sol.tabIdentity";
  const IDENTITY_HEADER = "X-Sol-User";
  // Pro Tab nach Logout/Kontowechsel: erst nach echtem Login darf der Tab wieder
  // eine Session übernehmen (sonst holt „Zurück“ fremde Shells zurück).
  // Bewusst ohne "sol."-Präfix, damit authClear() den Marker nicht löscht.
  const NEEDS_LOGIN_KEY = "solTabNeedsLogin";
  const RETRY_MS = [250, 700];
  const FETCH_TIMEOUT_MS = 8000;

  function authGet() {
    try {
      return sessionStorage.getItem(AUTH_KEY) || localStorage.getItem(AUTH_KEY) || "";
    } catch (_err) {
      return "";
    }
  }

  function authSet(role) {
    if (role !== "admin" && role !== "student" && role !== "superadmin" && role !== "teacher") return;
    try {
      sessionStorage.setItem(AUTH_KEY, role);
    } catch (_err) {}
    try {
      localStorage.setItem(AUTH_KEY, role);
    } catch (_err) {}
  }

  function clearStorageKeys(store) {
    if (!store) return;
    const keys = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key) continue;
      if (
        key === AUTH_KEY ||
        key.startsWith("sol.") ||
        key.startsWith("sol_") ||
        key.startsWith("sol-")
      ) {
        keys.push(key);
      }
    }
    keys.forEach((key) => {
      try {
        store.removeItem(key);
      } catch (_err) {}
    });
  }

  /** Nur dieser Tab (sessionStorage) – fasst den geteilten localStorage anderer Tabs nicht an. */
  function authClearTab() {
    try {
      clearStorageKeys(sessionStorage);
    } catch (_err) {}
    try {
      sessionStorage.setItem(NEEDS_LOGIN_KEY, "1");
    } catch (_err) {}
  }

  /** Explizites Logout: auch geteilte sol.*-Schlüssel entfernen. */
  function authClear() {
    authClearTab();
    try {
      clearStorageKeys(localStorage);
    } catch (_err) {}
  }

  function loginDone() {
    try {
      sessionStorage.removeItem(NEEDS_LOGIN_KEY);
    } catch (_err) {}
  }

  function tabNeedsLogin() {
    try {
      return sessionStorage.getItem(NEEDS_LOGIN_KEY) === "1";
    } catch (_err) {
      return false;
    }
  }

  function identityOf(data) {
    if (!data?.role || data.id == null) return "";
    return `${data.role}:${data.id}`;
  }

  function tabIdentityGet() {
    try {
      return sessionStorage.getItem(TAB_IDENTITY_KEY) || "";
    } catch (_err) {
      return "";
    }
  }

  function tabIdentitySet(identity) {
    if (!identity) return;
    try {
      sessionStorage.setItem(TAB_IDENTITY_KEY, identity);
    } catch (_err) {}
  }

  function tabUserId() {
    const identity = tabIdentityGet();
    const idx = identity.lastIndexOf(":");
    return idx > 0 ? identity.slice(idx + 1) : "";
  }

  function homeFor(role) {
    if (role === "superadmin") return "/superadmin";
    if (role === "student") return "/student/hub";
    if (role === "teacher") return "/teacher";
    if (role === "admin") return "/admin";
    return "/login";
  }

  /** Admin-Shell: /admin oder Admin-Session (auch wenn Tool-JS kurz /teacher/* pushState't). */
  function isAdminShell() {
    const path = window.location.pathname || "";
    if (path === "/admin" || path.startsWith("/admin/")) return true;
    if (window.__staffSession?.role === "admin") return true;
    if (authGet() === "admin") return true;
    return false;
  }

  /**
   * Tool-Navigation: unter Administration immer /admin[?qs]#hash,
   * unter Lehrer-Shell unverändert /teacher/...
   * @param {string} teacherPath z.B. "/teacher/levelcheck-planen?classId=1"
   * @param {string} adminHashKey z.B. "levelcheck-planen"
   */
  function staffToolUrl(teacherPath, adminHashKey) {
    const raw = String(teacherPath || "");
    const hashKey = String(adminHashKey || "").replace(/^#/, "");
    if (!isAdminShell() || !hashKey) return raw || "/teacher";
    try {
      const u = new URL(raw, window.location.origin);
      return `/admin${u.search || ""}#${hashKey}`;
    } catch (_err) {
      return `/admin#${hashKey}`;
    }
  }

  function loginUrl() {
    return `/login?loggedout=1&t=${Date.now()}`;
  }

  function goLogin() {
    if (window.__authBootstrap) return;
    if (window.__authFetchRedirecting) return;
    window.__authFetchRedirecting = true;
    authClearTab();
    window.location.replace(loginUrl());
  }

  /** Anderes Konto hat in diesem Browser die Session übernommen → Login, ohne die fremde Session zu zerstören. */
  function goSwitched(reason = "switched") {
    if (window.__authFetchRedirecting) return;
    if (window.__authFetchSwitching) return;
    window.__authFetchSwitching = true;
    window.__authFetchRedirecting = true;
    try {
      document.documentElement.style.visibility = "hidden";
    } catch (_err) {}
    authClearTab();
    const param = reason === "relogin" ? "relogin" : "switched";
    window.location.replace(`/login?${param}=1&t=${Date.now()}`);
  }

  let conflictBanner = null;

  /**
   * Ruhiger Hinweis statt Redirect: In diesem Browser ist ein anderes Konto
   * (oder keine Session) aktiv. Die Ansicht bleibt stehen, API-Aufrufe werden
   * serverseitig mit 409 abgelehnt, damit nichts unter falscher Identität läuft.
   */
  function showSessionConflict(kind = "other") {
    if (window.__authFetchRedirecting) return;
    if (conflictBanner?.isConnected) return;
    const build = () => {
      if (conflictBanner?.isConnected || !document.body) return;
      const bar = document.createElement("div");
      bar.setAttribute("role", "alert");
      bar.dataset.solSessionConflict = "1";
      bar.style.cssText =
        "position:fixed;left:0;right:0;top:0;z-index:2147483000;display:flex;flex-wrap:wrap;" +
        "gap:8px 12px;align-items:center;justify-content:center;padding:10px 14px;" +
        "background:#7c2d12;color:#fff;font:600 14px/1.35 system-ui,sans-serif;" +
        "box-shadow:0 2px 12px rgba(0,0,0,.4)";
      const msg = document.createElement("span");
      msg.textContent =
        kind === "ended"
          ? "Diese Sitzung wurde beendet (z. B. Abmeldung in einem anderen Tab). Änderungen hier werden nicht gespeichert."
          : "In diesem Browser ist jetzt ein anderes Konto angemeldet (alle Tabs teilen eine Sitzung). Diese Ansicht ist pausiert – es wird nichts unter dem falschen Konto gespeichert.";
      const mk = (label, onClick) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.style.cssText =
          "cursor:pointer;border:0;border-radius:8px;padding:6px 12px;font:700 13px system-ui,sans-serif;" +
          "background:#fff;color:#7c2d12";
        b.addEventListener("click", onClick);
        return b;
      };
      bar.append(
        msg,
        mk("Neu anmelden", () => goSwitched("relogin")),
        mk("Erneut prüfen", () => revalidateTabSession(true))
      );
      document.body.appendChild(bar);
      conflictBanner = bar;
    };
    if (document.body) build();
    else document.addEventListener("DOMContentLoaded", build, { once: true });
  }

  function hideSessionConflict() {
    if (conflictBanner) {
      conflictBanner.remove();
      conflictBanner = null;
    }
  }

  function goHome(roleOrPath) {
    if (window.__authFetchRedirecting) return;
    window.__authFetchRedirecting = true;
    const target =
      typeof roleOrPath === "string" && roleOrPath.startsWith("/")
        ? roleOrPath
        : homeFor(roleOrPath);
    window.location.replace(target || "/login");
  }

  /**
   * Prüft Session gegen erlaubte Rollen der aktuellen Shell.
   * Bei Mismatch → role home; bei fehlender Session → Login.
   * @returns {Promise<object|null>} Session-Payload oder null bei Redirect
   */
  async function enforceShell(allowedRoles, options = {}) {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    const requireAdmin = options.requireAdmin === true;
    try {
      const sessionRes = await fetchWithTimeout(
        "/api/auth/session",
        { credentials: "same-origin", cache: "no-store" },
        FETCH_TIMEOUT_MS
      );
      if (sessionRes.status === 401) {
        goLogin();
        return null;
      }
      if (!sessionRes.ok) return null;
      const data = await sessionRes.json().catch(() => null);
      if (!data || data.authenticated === false || !data.role) {
        goLogin();
        return null;
      }

      const pinned = tabIdentityGet();
      if (pinned && pinned !== identityOf(data)) {
        goSwitched();
        return null;
      }
      if (!pinned && tabNeedsLogin()) {
        goSwitched("relogin");
        return null;
      }

      const roleOk = roles.includes(data.role);
      const adminOk = !requireAdmin || data.canAdmin === true || data.role === "admin";
      if (!roleOk || !adminOk) {
        authSet(data.role);
        goHome(data.redirectTo || homeFor(data.role));
        return null;
      }

      authSet(data.role);
      tabIdentitySet(identityOf(data));
      return data;
    } catch (_err) {
      return null;
    }
  }

  async function logoutAndRedirect() {
    // Explizites Logout: immer als Dokument-Navigation (GET /logout).
    // Kein vorheriges POST /api/logout: dessen Clear-Site-Data hat Chrome die
    // Admin-Shell neu laden lassen. Lag noch ein zweites Session-Cookie
    // (Schüler) im Browser, wurde das dabei zur aktiven Session und /admin
    // hat auf /student/today weitergeleitet.
    window.__authFetchRedirecting = true;
    authClear();
    try {
      const tasks = [];
      if (navigator.serviceWorker?.getRegistrations) {
        tasks.push(
          navigator.serviceWorker.getRegistrations().then((regs) =>
            Promise.all(regs.map((r) => r.unregister()))
          )
        );
      }
      if (window.caches?.keys) {
        tasks.push(
          caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        );
      }
      if (tasks.length) {
        await Promise.race([
          Promise.all(tasks),
          new Promise((resolve) => setTimeout(resolve, 800))
        ]);
      }
    } catch (_err) {}
    window.location.replace(`/logout?t=${Date.now()}`);
  }

  window.SolAuth = {
    get: authGet,
    set: authSet,
    clear: authClear,
    is: (role) => authGet() === role,
    homeFor,
    isAdminShell,
    staffToolUrl,
    loginUrl,
    goLogin,
    goHome,
    goSwitched,
    showSessionConflict,
    clearTab: authClearTab,
    loginDone,
    needsLogin: tabNeedsLogin,
    tabIdentity: tabIdentityGet,
    enforceShell,
    logoutAndRedirect
  };

  function resolvePath(input) {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.pathname
          : input?.url || "";
    try {
      return new URL(raw, window.location.origin).pathname;
    } catch (_err) {
      return String(raw).split("?")[0];
    }
  }

  function shouldCheckSession(path) {
    if (window.__authBootstrap) return false;
    if (
      path === "/api/login" ||
      path === "/api/logout" ||
      path === "/api/auth/session" ||
      path === "/api/demo/login"
    ) {
      return false;
    }
    const loc = window.location.pathname || "";
    if (loc.startsWith("/login")) return false;
    return (
      loc.startsWith("/teacher") ||
      loc.startsWith("/student") ||
      loc.startsWith("/admin") ||
      loc.startsWith("/superadmin")
    );
  }

  function fetchWithTimeout(input, init, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const parentSignal = init?.signal;
    if (parentSignal) {
      if (parentSignal.aborted) ctrl.abort();
      else parentSignal.addEventListener("abort", () => ctrl.abort(), { once: true });
    }
    return nativeFetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
  }

  window.fetch = async function authFetch(input, init) {
    const path = resolvePath(input);
    if (!path.startsWith("/api/")) {
      return nativeFetch(input, init);
    }

    const mergedInit = {
      credentials: "same-origin",
      cache: "no-store",
      ...init
    };
    const expectUser = tabUserId();
    if (expectUser) {
      const headers = new Headers(
        init?.headers || (input instanceof Request ? input.headers : undefined)
      );
      headers.set(IDENTITY_HEADER, expectUser);
      mergedInit.headers = headers;
    }

    if (
      path === "/api/login" ||
      path === "/api/logout" ||
      path === "/api/demo/login"
    ) {
      return fetchWithTimeout(input, mergedInit, FETCH_TIMEOUT_MS);
    }

    let lastRes = null;
    const retries = path === "/api/auth/session" ? 0 : RETRY_MS.length;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        lastRes = await fetchWithTimeout(input, mergedInit, FETCH_TIMEOUT_MS);
      } catch (_err) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, RETRY_MS[attempt]));
          continue;
        }
        throw _err;
      }

      if (lastRes.status === 409 && lastRes.headers.get("X-Sol-Identity-Mismatch") === "1") {
        showSessionConflict();
        return lastRes;
      }
      if (lastRes.status !== 401 && lastRes.status !== 403) return lastRes;
      if (attempt < retries && lastRes.status === 401) {
        await new Promise((r) => setTimeout(r, RETRY_MS[attempt]));
        continue;
      }
      break;
    }

    if (lastRes && shouldCheckSession(path)) {
      try {
        const sessionRes = await fetchWithTimeout(
          "/api/auth/session",
          { credentials: "same-origin", cache: "no-store" },
          FETCH_TIMEOUT_MS
        );
        if (sessionRes.status === 401) {
          goLogin();
          return lastRes;
        }
        if (!sessionRes.ok) return lastRes;
        const sessionData = await sessionRes.json().catch(() => null);
        if (sessionData && sessionData.authenticated === false) {
          goLogin();
          return lastRes;
        }
        const pinned = tabIdentityGet();
        if (sessionData?.authenticated && pinned && pinned !== identityOf(sessionData)) {
          showSessionConflict();
          return lastRes;
        }
        // Falsche Rolle für diese Shell → sofort auf Rollen-Home
        if (sessionData?.authenticated && sessionData.role) {
          const loc = window.location.pathname || "";
          const role = sessionData.role;
          const onStudent = loc.startsWith("/student");
          const onTeacher = loc.startsWith("/teacher");
          const onAdmin = loc === "/admin" || loc.startsWith("/admin/");
          const onSuper = loc.startsWith("/superadmin");
          if (onStudent && role !== "student") {
            goHome(sessionData.redirectTo || homeFor(role));
            return lastRes;
          }
          // Admin darf Lernsteuerungs-APIs; alte Tool-pushState-URLs unter /teacher/*
          // dürfen Speichern nicht abbrechen (Retry statt Bounce).
          if (onTeacher && role !== "teacher" && role !== "admin") {
            goHome(sessionData.redirectTo || homeFor(role));
            return lastRes;
          }
          if (onAdmin && role !== "admin") {
            goHome(sessionData.redirectTo || homeFor(role));
            return lastRes;
          }
          if (onSuper && role !== "superadmin") {
            goHome(sessionData.redirectTo || homeFor(role));
            return lastRes;
          }
        }
        return fetchWithTimeout(input, mergedInit, FETCH_TIMEOUT_MS);
      } catch (_err) {
        return lastRes;
      }
    }
    return lastRes;
  };

  function onAppShellPath() {
    const loc = window.location.pathname || "";
    return (
      loc.startsWith("/teacher") ||
      loc.startsWith("/student") ||
      loc === "/admin" ||
      loc.startsWith("/admin/") ||
      loc.startsWith("/superadmin")
    );
  }

  function onLoginPath() {
    const loc = window.location.pathname || "";
    return loc === "/" || loc === "/login" || loc === "/login.html";
  }

  // bfcache (Zurück/Vor): eingefrorene Shell nie wiederverwenden – JS-State
  // (Redirect-Flags, User, Daten) stammt evtl. von einer anderen Session.
  // Neu laden → Server-Rollen-Gate + enforceShell mit Tab-Identität.
  window.addEventListener("pageshow", (e) => {
    // Zurück nach Logout: diese Shell nicht als eingeloggt stehen lassen.
    if (onAppShellPath() && tabNeedsLogin()) {
      try {
        document.documentElement.style.visibility = "hidden";
      } catch (_err) {}
      window.location.replace(`/login?relogin=1&t=${Date.now()}`);
      return;
    }
    if (!e.persisted) return;
    if (!onAppShellPath() && !onLoginPath()) return;
    try {
      document.documentElement.style.visibility = "hidden";
    } catch (_err) {}
    window.location.reload();
  });

  // Tab kommt zurück in den Vordergrund / anderer Tab hat Login-Status geändert:
  // Session gegen Tab-Identität prüfen.
  let lastRevalidate = 0;
  async function revalidateTabSession(force = false) {
    if (!onAppShellPath()) return;
    if (window.__authBootstrap || window.__authFetchRedirecting) return;
    const pinned = tabIdentityGet();
    if (!pinned) return;
    const now = Date.now();
    if (!force && now - lastRevalidate < 2000) return;
    lastRevalidate = now;
    try {
      const res = await fetchWithTimeout(
        "/api/auth/session",
        { credentials: "same-origin", cache: "no-store" },
        FETCH_TIMEOUT_MS
      );
      if (res.status === 401) {
        showSessionConflict("ended");
        return;
      }
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (!data || data.authenticated === false) {
        showSessionConflict("ended");
      } else if (identityOf(data) !== pinned) {
        showSessionConflict();
      } else {
        hideSessionConflict();
      }
    } catch (_err) {}
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") revalidateTabSession();
  });
  window.addEventListener("focus", () => revalidateTabSession());
  window.addEventListener("popstate", () => revalidateTabSession(true));
  // Bewusst KEIN storage-Listener: Login/Logout in einem Tab darf andere Tabs
  // nicht in einer Kaskade zum Login schicken.

  window.SolAuth.revalidate = revalidateTabSession;
})();

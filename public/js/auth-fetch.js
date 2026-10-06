/**
 * Session-aware fetch + Rollen-Landing.
 * Logout nur wenn die Session nachweislich tot ist (401 / authenticated:false).
 * Ein 403 bei gültiger Session darf niemanden aus dem Tab werfen.
 */
(function () {
  if (window.__authFetchInstalled) return;
  window.__authFetchInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  const AUTH_KEY = "sol.authed";
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
        key === "sol-admin-nav-collapsed"
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

  function authClear() {
    try {
      clearStorageKeys(sessionStorage);
    } catch (_err) {}
    try {
      clearStorageKeys(localStorage);
    } catch (_err) {}
  }

  function homeFor(role) {
    if (role === "superadmin") return "/superadmin";
    if (role === "student") return "/student/hub";
    if (role === "teacher" || role === "admin") return "/teacher";
    return "/login";
  }

  function loginUrl() {
    return `/login?loggedout=1&t=${Date.now()}`;
  }

  function goLogin() {
    if (window.__authBootstrap) return;
    if (window.__authFetchRedirecting) return;
    window.__authFetchRedirecting = true;
    authClear();
    window.location.replace(loginUrl());
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

      const roleOk = roles.includes(data.role);
      const adminOk = !requireAdmin || data.canAdmin === true || data.role === "admin";
      if (!roleOk || !adminOk) {
        authSet(data.role);
        goHome(data.redirectTo || homeFor(data.role));
        return null;
      }

      authSet(data.role);
      return data;
    } catch (_err) {
      return null;
    }
  }

  async function logoutAndRedirect() {
    if (window.__authFetchRedirecting) return;
    window.__authFetchRedirecting = true;
    authClear();
    try {
      await fetchWithTimeout(
        "/api/logout",
        { method: "POST", credentials: "same-origin", cache: "no-store" },
        FETCH_TIMEOUT_MS
      );
    } catch (_err) {}
    try {
      if (window.__purgeTeacherClientCaches) {
        await window.__purgeTeacherClientCaches();
      }
    } catch (_err) {}
    window.location.replace(loginUrl());
  }

  window.SolAuth = {
    get: authGet,
    set: authSet,
    clear: authClear,
    is: (role) => authGet() === role,
    homeFor,
    loginUrl,
    goLogin,
    goHome,
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
})();

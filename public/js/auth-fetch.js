/**
 * Session-aware fetch: cookies, kurzes Timeout, wenige Retries.
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
    if (role !== "admin" && role !== "student" && role !== "superadmin") return;
    try {
      sessionStorage.setItem(AUTH_KEY, role);
    } catch (_err) {}
    try {
      localStorage.setItem(AUTH_KEY, role);
    } catch (_err) {}
  }

  function authClear() {
    try {
      sessionStorage.removeItem(AUTH_KEY);
    } catch (_err) {}
    try {
      localStorage.removeItem(AUTH_KEY);
    } catch (_err) {}
  }

  window.SolAuth = {
    get: authGet,
    set: authSet,
    clear: authClear,
    is: (role) => authGet() === role
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

  function goLogin() {
    if (window.__authBootstrap) return;
    if (window.__authFetchRedirecting) return;
    if (authGet()) return;
    window.__authFetchRedirecting = true;
    window.location.href = "/login";
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
        return fetchWithTimeout(input, mergedInit, FETCH_TIMEOUT_MS);
      } catch (_err) {
        return lastRes;
      }
    }
    return lastRes;
  };
})();

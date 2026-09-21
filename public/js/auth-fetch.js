/**
 * Session-aware fetch: cookies + kurze Retries bei 401/403 (PG-Session-Lag).
 * Logout nur wenn die Session nachweislich tot ist (401 / authenticated:false).
 * Ein 403 bei gültiger Session darf die Lehrkraft nicht aus dem Tab werfen.
 */
(function () {
  if (window.__authFetchInstalled) return;
  window.__authFetchInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  const RETRY_MS = [150, 350, 700, 1200, 2000];

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
      return raw.split("?")[0];
    }
  }

  function shouldCheckSession(path) {
    if (window.__authBootstrap) return false;
    if (path === "/api/login" || path === "/api/auth/session") return false;
    const loc = window.location.pathname || "";
    if (loc.startsWith("/login")) return false;
    return (
      loc.startsWith("/teacher") ||
      loc.startsWith("/student") ||
      loc.startsWith("/admin") ||
      loc.startsWith("/superadmin")
    );
  }

  function remembered() {
    try {
      const flag = sessionStorage.getItem("sol.authed");
      return flag === "admin" || flag === "student";
    } catch (_err) {
      return false;
    }
  }

  function goLogin() {
    if (window.__authBootstrap) return;
    if (window.__authFetchRedirecting) return;
    if (remembered()) return;
    window.__authFetchRedirecting = true;
    window.location.href = "/login";
  }

  window.fetch = async function authFetch(input, init) {
    const path = resolvePath(input);
    if (!path.startsWith("/api/")) {
      return nativeFetch(input, init);
    }

    const mergedInit = mergedInitIfNeeded(init);

    for (let attempt = 0; attempt <= RETRY_MS.length; attempt++) {
      const res = await nativeFetch(input, mergedInit);
      if (res.status !== 401 && res.status !== 403) return res;

      if (attempt < RETRY_MS.length) {
        await new Promise((r) => setTimeout(r, RETRY_MS[attempt]));
        continue;
      }

      if (shouldCheckSession(path)) {
        try {
          const sessionRes = await nativeFetch("/api/auth/session", {
            credentials: "same-origin",
            cache: "no-store"
          });
          if (sessionRes.status === 401) {
            goLogin();
            return res;
          }
          if (!sessionRes.ok) {
            return res;
          }
          const sessionData = await sessionRes.json().catch(() => null);
          if (sessionData && sessionData.authenticated === false) {
            goLogin();
            return res;
          }
          const retryRes = await nativeFetch(input, mergedInit);
          return retryRes;
        } catch (_err) {
          return res;
        }
      }
      return res;
    }
  };

  function mergedInitIfNeeded(init) {
    return {
      credentials: "same-origin",
      cache: "no-store",
      ...init
    };
  }
})();

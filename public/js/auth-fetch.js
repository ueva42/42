/**
 * Session-aware fetch: cookies + kurze Retries bei 401/403 (PG-Session-Lag).
 * Nach bestätigter Session noch einmal versuchen — sonst bleibt „Forbidden“ trotz Login.
 * Logout nur wenn Session wirklich tot ist — nicht während App-Bootstrap.
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

  function goLogin() {
    if (window.__authBootstrap) return;
    if (window.__authFetchRedirecting) return;
    window.__authFetchRedirecting = true;
    window.location.href = "/login";
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

    for (let attempt = 0; attempt <= RETRY_MS.length; attempt++) {
      const res = await nativeFetch(input, mergedInit);
      if (res.status !== 401 && res.status !== 403) return res;

      if (attempt < RETRY_MS.length) {
        await new Promise((r) => setTimeout(r, RETRY_MS[attempt]));
        continue;
      }

      // Letzter Versuch: Session frisch vom Server laden, dann Request wiederholen
      if (shouldCheckSession(path)) {
        try {
          const sessionRes = await nativeFetch("/api/auth/session", {
            credentials: "same-origin",
            cache: "no-store"
          });
          if (!sessionRes.ok) {
            goLogin();
            return res;
          }
          const sessionData = await sessionRes.json().catch(() => null);
          if (sessionData && sessionData.authenticated === false) {
            goLogin();
            return res;
          }
          const retryRes = await nativeFetch(input, mergedInit);
          if (retryRes.status === 401 || retryRes.status === 403) {
            // Session da, aber Rolle passt nicht → Login
            const role = sessionData?.role;
            const onTeacher =
              (window.location.pathname || "").startsWith("/teacher") ||
              (window.location.pathname || "").startsWith("/admin");
            if (onTeacher && role && role !== "admin") {
              goLogin();
            }
          }
          return retryRes;
        } catch (_err) {
          goLogin();
          return res;
        }
      }
      return res;
    }
  };
})();

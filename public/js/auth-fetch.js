/**
 * Session-aware fetch: always send cookies, retry brief 401/403 (PG session store lag).
 * Persistent auth errors on app pages → Login (avoids stuck „Forbidden“ UI).
 */
(function () {
  if (window.__authFetchInstalled) return;
  window.__authFetchInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  const RETRY_MS = [200, 500, 1000, 2000];

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

  function shouldForceLogin(path) {
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
      if (attempt >= RETRY_MS.length) {
        if (shouldForceLogin(path)) goLogin();
        return res;
      }
      await new Promise((r) => setTimeout(r, RETRY_MS[attempt]));
    }
  };
})();

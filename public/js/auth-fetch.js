/**
 * Session-aware fetch: always send cookies, retry brief 401/403 (PG session store lag).
 */
(function () {
  if (window.__authFetchInstalled) return;
  window.__authFetchInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  const RETRY_MS = [250, 600];

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

  window.fetch = async function authFetch(input, init) {
    const path = resolvePath(input);
    if (!path.startsWith("/api/")) {
      return nativeFetch(input, init);
    }

    const mergedInit = { credentials: "same-origin", ...init };

    for (let attempt = 0; attempt <= RETRY_MS.length; attempt++) {
      const res = await nativeFetch(input, mergedInit);
      if (res.status !== 401 && res.status !== 403) return res;
      if (attempt >= RETRY_MS.length) {
        if (
          path !== "/api/login" &&
          path !== "/api/auth/session" &&
          !window.location.pathname.startsWith("/login")
        ) {
          window.location.href = "/login";
        }
        return res;
      }
      await new Promise((r) => setTimeout(r, RETRY_MS[attempt]));
    }
  };
})();

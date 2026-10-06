/**
 * Service Worker + Cache leeren (verhindert stale SPA-Shells aus SW/HTTP-Cache).
 * Auf Login und nach Logout – nicht bei jedem App-Tab-Reload.
 */
(function () {
  async function purgeTeacherClientCaches() {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (err) {
      console.warn("Cache reset:", err);
    }
  }

  window.__purgeTeacherClientCaches = purgeTeacherClientCaches;
  window.__purgeClientCaches = purgeTeacherClientCaches;

  const path = window.location.pathname || "";
  const params = new URLSearchParams(window.location.search || "");
  const onLogin = path === "/login" || path === "/login.html";
  const forcedLogout =
    params.get("loggedout") === "1" || params.get("logout") === "1";

  if (onLogin || forcedLogout) {
    try {
      window.SolAuth?.clear?.();
    } catch (_err) {}
    purgeTeacherClientCaches();
  }
})();

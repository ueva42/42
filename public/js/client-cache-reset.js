/**
 * Lehrer-Admin: Service Worker + Cache leeren (verhindert stale JS/403 aus altem SW).
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

  const path = window.location.pathname || "";
  if (
    path.startsWith("/teacher") ||
    path === "/admin" ||
    path.startsWith("/superadmin")
  ) {
    purgeTeacherClientCaches();
  }
})();

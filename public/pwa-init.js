(() => {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", async () => {
    const path = window.location.pathname || "";
    const isStudentApp =
      path.startsWith("/student") ||
      path === "/first-login" ||
      path === "/character-select";

    try {
      if (!isStudentApp) {
        // Login/Lehrer: kein SW — alte Registrierungen von früheren Versionen entfernen
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
        return;
      }
      await navigator.serviceWorker.register("/sw.js");
    } catch (err) {
      console.error("Service worker registration failed:", err);
    }
  });
})();

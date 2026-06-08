/**
 * Minimale Touch-Swipe-Hilfe für Logbuch-Screens.
 * Swipe links = nächster, Swipe rechts = vorheriger.
 */
(function () {
  let __activeContainer = null;

  function attach(container, handlers) {
    if (!container) return;
    if (__activeContainer && __activeContainer !== container) {
      detach(__activeContainer);
    }
    if (container.dataset.swipeBound === "1") return;
    container.dataset.swipeBound = "1";
    __activeContainer = container;

    const THRESHOLD = 50;
    const VERT_LOCK = 35;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let dragging = false;
    let lockedOut = false;

    container.addEventListener(
      "touchstart",
      (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        lastX = t.clientX;
        dragging = true;
        lockedOut = false;
      },
      { passive: true }
    );

    container.addEventListener(
      "touchmove",
      (e) => {
        if (!dragging || lockedOut) return;
        if (!e.touches || e.touches.length !== 1) return;
        const t = e.touches[0];
        lastX = t.clientX;
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > VERT_LOCK) {
          lockedOut = true;
        }
      },
      { passive: true }
    );

    container.addEventListener(
      "touchend",
      () => {
        if (!dragging || lockedOut) {
          dragging = false;
          return;
        }
        const dx = lastX - startX;
        if (dx <= -THRESHOLD) handlers.onSwipeLeft?.();
        else if (dx >= THRESHOLD) handlers.onSwipeRight?.();
        dragging = false;
      },
      { passive: true }
    );

    const keyHandler = (e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlers.onSwipeRight?.();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handlers.onSwipeLeft?.();
      }
    };

    if (handlers.enableKeys !== false) {
      window.addEventListener("keydown", keyHandler);
      container._logbuchSwipeKeyHandler = keyHandler;
    }
  }

  function detach(container) {
    if (!container) return;
    if (container._logbuchSwipeKeyHandler) {
      window.removeEventListener("keydown", container._logbuchSwipeKeyHandler);
      delete container._logbuchSwipeKeyHandler;
    }
    delete container.dataset.swipeBound;
    if (__activeContainer === container) __activeContainer = null;
  }

  window.LogbuchSwipe = { attach, detach };
})();

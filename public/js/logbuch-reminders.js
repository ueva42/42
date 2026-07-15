/**
 * Streets of Logic – In-App Erinnerungen für Zwischen-Check & Reflexion.
 *
 * Stufe 1 (implementiert):
 * - Zeiten aus timeslot-String (z. B. "7.50-8.35") berechnen
 * - Polling solange die Schüler-App offen ist
 * - Toast + Eintrag in der Glocke
 * - Snooze / Clear bei erledigtem Check/Reflect
 *
 * Stufe 2 (noch NICHT fertig):
 * - Web Push über Service Worker + serverseitigen Scheduler
 * - Bei gesperrtem iPad / geschlossener App kommen keine Push-Mitteilungen
 */
window.LogbuchReminders = (function () {
  const STORAGE_KEY = "sol_lesson_reminders_v1";
  const OPTIN_KEY = "sol_reminders_optin";
  const BELL_KEY = "sol_reminder_bell_v1";

  let timerId = null;
  let started = false;

  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function parseTimeslot(timeslot) {
    if (!timeslot) return null;
    const m = String(timeslot).match(/(\d{1,2})[.:](\d{2})\s*[-–—]\s*(\d{1,2})[.:](\d{2})/);
    if (!m) return null;
    const start = Number(m[1]) * 60 + Number(m[2]);
    let end = Number(m[3]) * 60 + Number(m[4]);
    if (end <= start) end += 24 * 60;
    return { start, end, duration: end - start };
  }

  function minutesNowBerlin() {
    const parts = new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(new Date());
    const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
    const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
    return hour * 60 + minute;
  }

  function lessonProgressPct(timeslot) {
    const parsed = parseTimeslot(timeslot);
    if (!parsed) return null;
    const now = minutesNowBerlin();
    if (now < parsed.start) return 0;
    if (now >= parsed.end) return 100;
    return Math.round(((now - parsed.start) / parsed.duration) * 100);
  }

  function checkReminderOffset(duration) {
    return duration <= 60 ? 20 : 45;
  }

  function reflectReminderOffset(duration) {
    return duration <= 60 ? 5 : 8;
  }

  function loadStore() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function loadBell() {
    try {
      return JSON.parse(localStorage.getItem(BELL_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveBell(items) {
    localStorage.setItem(BELL_KEY, JSON.stringify(items.slice(0, 40)));
  }

  function reminderKey(entryId, type) {
    return `${entryId}:${type}`;
  }

  function clearForEntry(entryId, type) {
    const store = loadStore();
    const key = reminderKey(entryId, type);
    delete store[key];
    saveStore(store);
    hideToast(entryId, type);
  }

  function markFired(entryId, type, extra = {}) {
    const store = loadStore();
    store[reminderKey(entryId, type)] = {
      firedAt: Date.now(),
      ...extra
    };
    saveStore(store);
  }

  function isFired(entryId, type) {
    return !!loadStore()[reminderKey(entryId, type)]?.firedAt;
  }

  function snooze(entryId, type, minutes = 5) {
    const store = loadStore();
    const key = reminderKey(entryId, type);
    store[key] = {
      ...(store[key] || {}),
      snoozeUntil: Date.now() + minutes * 60 * 1000,
      firedAt: null
    };
    saveStore(store);
    hideToast(entryId, type);
  }

  function pushBellItem(item) {
    const list = loadBell().filter((x) => x.id !== item.id);
    list.unshift(item);
    saveBell(list);
    if (typeof window.renderReminderBell === "function") {
      window.renderReminderBell();
    } else {
      mergeBellIntoNotifPanel();
    }
  }

  function mergeBellIntoNotifPanel() {
    const list = document.getElementById("notifList");
    if (!list) return;
    const reminders = loadBell();
    if (!reminders.length) return;

    const block = reminders
      .slice(0, 8)
      .map((r) => {
        const href =
          r.type === "check"
            ? `/student/check?entryId=${encodeURIComponent(r.entryId)}`
            : `/student/reflect?entryId=${encodeURIComponent(r.entryId)}`;
        return `
        <button type="button" class="notif-item notif-item--reminder" data-reminder-nav="${href}">
          <div class="notif-item__title">${escapeHtml(r.title)}</div>
          <div class="notif-item__src">${escapeHtml(r.text)}</div>
          <div class="notif-item__time">${escapeHtml(r.time || "")}</div>
        </button>`;
      })
      .join("");

    const existing = list.querySelector(".notif-reminder-block");
    if (existing) existing.remove();
    const wrap = document.createElement("div");
    wrap.className = "notif-reminder-block";
    wrap.innerHTML = `<div class="notif-reminder-label">Lern-Erinnerungen</div>${block}`;
    list.prepend(wrap);

    wrap.querySelectorAll("[data-reminder-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const url = new URL(btn.dataset.reminderNav, location.origin);
        const section = url.pathname.includes("/check") ? "check" : "reflect";
        window.StudentRouter?.navigateToSection(section, {
          query: new URLSearchParams({ entryId })
        });
        document.getElementById("notifPanel")?.classList.remove("open");
      });
    });
  }

  function escapeHtml(str) {
    return window.LogbuchUI?.escapeHtml(str) ?? String(str ?? "");
  }

  function ensureToastRoot() {
    let root = document.getElementById("reminderToastRoot");
    if (!root) {
      root = document.createElement("div");
      root.id = "reminderToastRoot";
      root.className = "reminder-toast-root";
      document.body.appendChild(root);
    }
    return root;
  }

  function hideToast(entryId, type) {
    document.getElementById(`reminder-toast-${entryId}-${type}`)?.remove();
  }

  function showToast({ entryId, type, subject, title, text }) {
    const root = ensureToastRoot();
    hideToast(entryId, type);
    const id = `reminder-toast-${entryId}-${type}`;
    const el = document.createElement("article");
    el.id = id;
    el.className = `reminder-toast reminder-toast--${type}`;
    el.innerHTML = `
      <div class="reminder-toast__copy">
        <p class="reminder-toast__title">${escapeHtml(title)}</p>
        <p class="reminder-toast__text">${escapeHtml(text)}</p>
      </div>
      <div class="reminder-toast__actions">
        <button type="button" class="today-app-btn" data-action="go">Jetzt ${type === "check" ? "checken" : "abschließen"}</button>
        <button type="button" class="today-app-btn today-app-btn--ghost" data-action="snooze">In 5 Minuten erinnern</button>
        <button type="button" class="reminder-toast__close" data-action="close" aria-label="Schließen">×</button>
      </div>`;
    root.appendChild(el);

    el.querySelector('[data-action="go"]')?.addEventListener("click", () => {
      const section = type === "check" ? "check" : "reflect";
      window.StudentRouter?.navigateToSection(section, {
        query: new URLSearchParams({ entryId })
      });
      hideToast(entryId, type);
    });
    el.querySelector('[data-action="snooze"]')?.addEventListener("click", () => {
      snooze(entryId, type, 5);
    });
    el.querySelector('[data-action="close"]')?.addEventListener("click", () => {
      markFired(entryId, type, { dismissed: true });
      hideToast(entryId, type);
    });

    pushBellItem({
      id: `${entryId}-${type}-${Date.now()}`,
      entryId,
      type,
      title,
      text: text || subject || "",
      time: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
    });
  }

  function maybeShowOptIn() {
    if (localStorage.getItem(OPTIN_KEY)) return;
    if (document.getElementById("reminderOptInCard")) return;
    const host = document.querySelector("#today-screen-root .today-app, #hub-screen-root, .student-page");
    if (!host) return;

    const card = document.createElement("article");
    card.id = "reminderOptInCard";
    card.className = "reminder-optin glow-panel";
    card.innerHTML = `
      <h3 class="reminder-optin__title">An Lern-Checks erinnern lassen?</h3>
      <p class="reminder-optin__text">Die App kann dich einmal in der Stunde an deinen Zwischen-Check und am Ende an deine Reflexion erinnern – solange die App geöffnet ist.</p>
      <div class="reminder-optin__actions">
        <button type="button" class="today-app-btn" id="reminderOptInYes">Erinnerungen aktivieren</button>
        <button type="button" class="today-app-btn today-app-btn--ghost" id="reminderOptInLater">Später</button>
      </div>`;
    host.prepend(card);

    card.querySelector("#reminderOptInYes")?.addEventListener("click", async () => {
      localStorage.setItem(OPTIN_KEY, "yes");
      card.remove();
      // Kein ungefragtes Permission-Prompt außer nach Klick – und nur für optionale In-App-System-Notifications.
      if ("Notification" in window && Notification.permission === "default") {
        try {
          await Notification.requestPermission();
        } catch {
          /* ignore */
        }
      }
    });
    card.querySelector("#reminderOptInLater")?.addEventListener("click", () => {
      localStorage.setItem(OPTIN_KEY, "later");
      card.remove();
    });
  }

  async function fetchTodayBlocks() {
    try {
      const res = await fetch(`/api/student/log/today?date=${encodeURIComponent(todayIso())}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.blocks) ? data.blocks : [];
    } catch {
      return [];
    }
  }

  function normalizeBlocks(raw) {
    // API shape: { blocks: [{ slot, entry }] } or entries list
    if (!Array.isArray(raw)) return [];
    return raw
      .map((b) => {
        if (b?.entry && b?.slot) {
          return {
            entry: b.entry,
            timeslot: b.slot.timeslot || b.entry.timeslot,
            subject: b.slot.subject || b.entry.subject,
            hasCheck: !!b.entry.hasCheck || !!b.entry.check_id,
            hasReflection: !!b.entry.hasReflection || !!b.entry.reflection_id
          };
        }
        if (b?.id && b?.subject) {
          return {
            entry: b,
            timeslot: b.timeslot,
            subject: b.subject,
            hasCheck: !!b.hasCheck,
            hasReflection: !!b.hasReflection
          };
        }
        return null;
      })
      .filter(Boolean);
  }

  function shouldFire(entryId, type, fireMinute, nowMinute, endMinute, snoozeUntil) {
    if (isFired(entryId, type) && !snoozeUntil) return false;
    if (snoozeUntil && Date.now() < snoozeUntil) return false;
    if (snoozeUntil && Date.now() >= snoozeUntil) return true;
    return nowMinute >= fireMinute && nowMinute < endMinute;
  }

  async function tick() {
    const blocks = normalizeBlocks(await fetchTodayBlocks());
    const now = minutesNowBerlin();
    const store = loadStore();

    blocks.forEach((block) => {
      const entry = block.entry;
      if (!entry?.id) return;
      const parsed = parseTimeslot(block.timeslot);
      if (!parsed) return;
      if (now < parsed.start || now >= parsed.end) return;

      const remain = parsed.end - now;
      const checkOff = checkReminderOffset(parsed.duration);
      const reflectOff = reflectReminderOffset(parsed.duration);
      const checkAt = parsed.start + checkOff;
      const reflectAt = parsed.end - reflectOff;

      const checkState = store[reminderKey(entry.id, "check")] || {};
      const reflectState = store[reminderKey(entry.id, "reflect")] || {};

      // Zwischen-Check
      if (!block.hasCheck && remain >= 10) {
        const latePlan = now > checkAt && !checkState.firedAt;
        const due =
          shouldFire(entry.id, "check", checkAt, now, parsed.end, checkState.snoozeUntil) ||
          (latePlan && now >= checkAt + 5 && now < parsed.end);
        if (due && !checkState.firedAt) {
          markFired(entry.id, "check");
          showToast({
            entryId: entry.id,
            type: "check",
            subject: block.subject,
            title: "Zeit für deinen Zwischen-Check",
            text: `Wie läuft es in ${block.subject}? Prüfe kurz deinen Weg zum Ziel.`
          });
        }
      } else if (block.hasCheck) {
        clearForEntry(entry.id, "check");
      }

      // Reflexion
      if (!block.hasReflection) {
        const due = shouldFire(
          entry.id,
          "reflect",
          reflectAt,
          now,
          parsed.end + 1,
          reflectState.snoozeUntil
        );
        if (due && !reflectState.firedAt && now >= reflectAt) {
          markFired(entry.id, "reflect");
          showToast({
            entryId: entry.id,
            type: "reflect",
            subject: block.subject,
            title: "Zeit für deinen Tagesabschluss",
            text: "Was hast du heute geschafft und was nimmst du mit?"
          });
        }
      } else {
        clearForEntry(entry.id, "reflect");
      }
    });

    maybeShowOptIn();
    mergeBellIntoNotifPanel();
  }

  function start() {
    if (started) return;
    started = true;
    tick();
    timerId = window.setInterval(tick, 30000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") tick();
    });
  }

  function stop() {
    started = false;
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  return {
    start,
    stop,
    tick,
    clearForEntry,
    snooze,
    parseTimeslot,
    lessonProgressPct,
    checkReminderOffset,
    reflectReminderOffset,
    mergeBellIntoNotifPanel,
    /** Web Push ist NICHT implementiert – nur In-App. */
    webPushReady: false
  };
})();

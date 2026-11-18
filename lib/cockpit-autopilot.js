/**
 * Cockpit-Autopilot: Zeiten, Phasen, Side-Quest-Wahl, Levelcheck-Vorschläge,
 * Schultage für Auto-Freigabe. Pro Klasse überschreibbar (Settings-JSONB).
 */

import {
  parseTimeslot,
  schoolDateTime,
  berlinClock
} from "./teacher-dashboard-signals.js";
import { TEACHER_DASHBOARD_CONFIG } from "./teacher-dashboard-config.js";

export const AUTOPILOT_DEFAULTS = {
  enabled: true,
  phasesOn: true,
  autoRaffleOn: true,
  raffleXp: 10,
  raffleLeadMinutes: 5,
  autoSideQuestOn: true,
  autoLevelcheckReleaseOn: true,
  levelcheckReleaseSchoolDays: 2,
  namesOnBeamer: true,
  soundOn: false,
  startPhaseMinutes: 10,
  endPhaseMinutes: 10,
  waitBeforeMinutes: 5,
  /** ISO-Datum + Uhrzeit „HH:MM“ in Europe/Berlin – nur für Tests / Simulation. */
  simDate: null,
  simTime: null
};

export function normalizeAutopilotSettings(raw = {}) {
  const d = AUTOPILOT_DEFAULTS;
  const src = raw && typeof raw === "object" ? raw : {};
  const num = (v, fallback, min = 0, max = 120) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  };
  return {
    enabled: src.enabled !== false,
    phasesOn: src.phasesOn !== false,
    autoRaffleOn: src.autoRaffleOn !== false,
    raffleXp: num(src.raffleXp, d.raffleXp, 1, 100),
    raffleLeadMinutes: num(src.raffleLeadMinutes, d.raffleLeadMinutes, 1, 30),
    autoSideQuestOn: src.autoSideQuestOn !== false,
    autoLevelcheckReleaseOn: src.autoLevelcheckReleaseOn !== false,
    levelcheckReleaseSchoolDays: num(
      src.levelcheckReleaseSchoolDays,
      d.levelcheckReleaseSchoolDays,
      1,
      10
    ),
    namesOnBeamer: src.namesOnBeamer !== false,
    soundOn: src.soundOn === true,
    startPhaseMinutes: num(src.startPhaseMinutes, d.startPhaseMinutes, 1, 40),
    endPhaseMinutes: num(src.endPhaseMinutes, d.endPhaseMinutes, 1, 40),
    waitBeforeMinutes: num(src.waitBeforeMinutes, d.waitBeforeMinutes, 0, 30),
    simDate: /^\d{4}-\d{2}-\d{2}$/.test(String(src.simDate || ""))
      ? String(src.simDate)
      : null,
    simTime: /^\d{1,2}:\d{2}$/.test(String(src.simTime || "").trim())
      ? String(src.simTime).trim()
      : null
  };
}

export function schoolTimeZone() {
  return TEACHER_DASHBOARD_CONFIG.schoolTimeZone || "Europe/Berlin";
}

/** Jetzt – ggf. mit Simulationsuhr (Settings). */
export function resolveAutopilotNow(settings, realNow = new Date()) {
  const s = normalizeAutopilotSettings(settings);
  if (!s.simDate || !s.simTime) return realNow;
  const [hh, mm] = s.simTime.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return realNow;
  return schoolDateTime(s.simDate, hh * 60 + mm, schoolTimeZone()) || realNow;
}

export function isoDayFromDate(date, timeZone = schoolTimeZone()) {
  return berlinClock(date, timeZone).iso;
}

export function addCalendarDays(iso, delta) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Mo–Fr zählen als Schultage (Ferien kennt die App nicht). */
export function addSchoolDays(iso, schoolDays) {
  let cursor = iso;
  let left = Math.max(0, Number(schoolDays) || 0);
  let guard = 0;
  while (left > 0 && guard < 400) {
    cursor = addCalendarDays(cursor, 1);
    const js = new Date(`${cursor}T12:00:00`).getDay();
    if (js >= 1 && js <= 5) left -= 1;
    guard += 1;
  }
  return cursor;
}

export function schoolDaysBetween(fromIso, toIso) {
  if (!fromIso || !toIso || toIso <= fromIso) return 0;
  let cursor = fromIso;
  let n = 0;
  let guard = 0;
  while (cursor < toIso && guard < 400) {
    cursor = addCalendarDays(cursor, 1);
    const js = new Date(`${cursor}T12:00:00`).getDay();
    if (js >= 1 && js <= 5) n += 1;
    guard += 1;
  }
  return n;
}

/**
 * @returns {"start"|"learn"|"end"|null}
 */
export function lessonPhase({ now, startAt, endAt, settings }) {
  const s = normalizeAutopilotSettings(settings);
  if (!s.phasesOn) return null;
  const at = now instanceof Date ? now : new Date(now);
  const start = startAt instanceof Date ? startAt : startAt ? new Date(startAt) : null;
  const end = endAt instanceof Date ? endAt : endAt ? new Date(endAt) : null;
  if (!start || !end || !(at >= start && at <= end)) return null;
  const startMs = s.startPhaseMinutes * 60 * 1000;
  const endMs = s.endPhaseMinutes * 60 * 1000;
  if (at.getTime() < start.getTime() + startMs) return "start";
  if (at.getTime() > end.getTime() - endMs) return "end";
  return "learn";
}

function slotBounds(iso, timeslot, timeZone) {
  const parsed = parseTimeslot(timeslot);
  if (!parsed || !iso) return null;
  return {
    start: parsed.start,
    end: parsed.end,
    startAt: schoolDateTime(iso, parsed.start, timeZone),
    endAt: schoolDateTime(iso, parsed.end, timeZone)
  };
}

/**
 * Flache Stundenliste aus Klassen-Slots bauen und aktuellen/ nächsten Zustand ermitteln.
 * @param {Array<{classId, className, subject, timeslot, room?, levelCheckId?, unitName?}>} lessons
 */
export function buildBeamerSchedule({
  lessons = [],
  now = new Date(),
  settings = {},
  timeZone = schoolTimeZone()
} = {}) {
  const s = normalizeAutopilotSettings(settings);
  const clock = berlinClock(now, timeZone);
  const today = clock.iso;
  const waitMs = s.waitBeforeMinutes * 60 * 1000;

  const enriched = [];
  for (const lesson of lessons) {
    if (!lesson?.timeslot || !lesson.classId) continue;
    const b = slotBounds(today, lesson.timeslot, timeZone);
    if (!b?.startAt || !b.endAt) continue;
    enriched.push({
      classId: Number(lesson.classId),
      className: lesson.className || "",
      subject: lesson.subject || "",
      timeslot: lesson.timeslot,
      room: lesson.room || null,
      levelCheckId: lesson.levelCheckId || null,
      unitName: lesson.unitName || null,
      startAt: b.startAt,
      endAt: b.endAt,
      startMin: b.start,
      endMin: b.end
    });
  }
  enriched.sort((a, b) => a.startAt - b.startAt);

  const current = enriched.find((l) => now >= l.startAt && now <= l.endAt) || null;
  const upcoming =
    enriched.find((l) => l.startAt > now) ||
    enriched.find((l) => now < l.startAt && l.startAt.getTime() - now.getTime() <= waitMs) ||
    null;

  let mode = "idle";
  let focus = null;
  let phase = null;
  let waiting = null;

  if (current) {
    mode = "live";
    focus = current;
    phase = lessonPhase({
      now,
      startAt: current.startAt,
      endAt: current.endAt,
      settings: s
    });
  } else {
    const next = enriched.find((l) => l.startAt > now);
    if (next && next.startAt.getTime() - now.getTime() <= waitMs) {
      mode = "waiting";
      waiting = next;
      focus = next;
    } else if (!next) {
      mode = "done";
    } else {
      mode = "gap";
      waiting = next;
    }
  }

  return {
    today,
    nowIso: now.toISOString(),
    mode,
    phase,
    current,
    waiting,
    focus,
    lessons: enriched.map((l) => ({
      classId: l.classId,
      className: l.className,
      subject: l.subject,
      timeslot: l.timeslot,
      room: l.room,
      levelCheckId: l.levelCheckId,
      unitName: l.unitName,
      startAt: l.startAt.toISOString(),
      endAt: l.endAt.toISOString()
    })),
    settings: s
  };
}

/**
 * Side Quest passend zu Respekt / Levelcheck / Stadtteil.
 * lastTyp verhindert zweimal hintereinander dieselbe Vorlage.
 */
export function pickSmartSideQuestTemplate({
  templates = [],
  respect = [],
  levelcheckInDays = null,
  lastTyp = null,
  hasCityMap = false
} = {}) {
  const list = Array.isArray(templates) ? [...templates] : [];
  if (!list.length) return null;

  const byId = (id) => list.find((t) => t.id === id || t.typ === id);
  const respectMap = new Map(
    (respect || []).map((r) => [String(r.id || r.key || ""), r])
  );
  const under = (id) => {
    const row = respectMap.get(id);
    if (!row) return false;
    return row.status !== "erreicht" && row.status !== "keine_daten";
  };

  let preferred = null;
  if (under("reflektiert") || under("reflection") || under("reflektieren")) {
    preferred = byId("reflektieren");
  } else if (under("geholfen") || under("helfen") || under("help")) {
    preferred = byId("hilfen");
  } else if (
    under("gutEingeschätzt") &&
    levelcheckInDays != null &&
    levelcheckInDays <= 3
  ) {
    preferred =
      (hasCityMap && byId("kontrolle")) ||
      byId("taktik") ||
      byId("logic_coach");
  }

  const pool = preferred
    ? [preferred, ...list.filter((t) => t !== preferred)]
    : list;
  const filtered = pool.filter((t) => t.typ !== lastTyp && t.id !== lastTyp);
  const pickFrom = filtered.length ? filtered : pool;
  return pickFrom[0] || null;
}

/**
 * Levelcheck-Termine bis zum Ziel: wöchentlich gleicher Wochentag,
 * Missionen der Reihe nach, erst Rookie dann Operator.
 */
export function proposeLevelcheckDates({
  goals = [],
  startDate,
  targetDate,
  weekday = null,
  maxChecks = 8
} = {}) {
  if (!startDate || !targetDate || targetDate <= startDate) return [];
  const goalList = (goals || []).filter((g) => g?.id);
  if (!goalList.length) return [];

  const startWd =
    weekday != null
      ? Number(weekday)
      : (() => {
          const js = new Date(`${startDate}T12:00:00`).getDay();
          return js === 0 ? 7 : js;
        })();

  const dates = [];
  let cursor = startDate;
  let guard = 0;
  while (dates.length < maxChecks && guard < 400) {
    cursor = addCalendarDays(cursor, 1);
    const js = new Date(`${cursor}T12:00:00`).getDay();
    const wd = js === 0 ? 7 : js;
    if (wd === startWd && cursor <= targetDate) dates.push(cursor);
    if (cursor > targetDate) break;
    guard += 1;
  }
  if (!dates.length) return [];

  const chunk = Math.max(1, Math.ceil(goalList.length / dates.length));
  const proposals = [];
  let gi = 0;
  dates.forEach((date, i) => {
    const slice = goalList.slice(gi, gi + chunk);
    gi += chunk;
    if (!slice.length) return;
    const tier = i < Math.ceil(dates.length / 2) ? "rookie" : "operator";
    proposals.push({
      date,
      checkLevel: tier,
      title: `Levelcheck ${i + 1}`,
      goalIds: slice.map((g) => String(g.id)),
      missionLabels: slice.map((g, n) => g.text || g.label || `Mission ${n + 1}`)
    });
  });
  return proposals;
}

export function autoReleaseDueDate(checkpointDate, schoolDays = 2) {
  const day = String(checkpointDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return addSchoolDays(day, schoolDays);
}

export function isAutoReleaseDue({
  checkpointDate,
  freigegebenAm,
  teacherLocked,
  today,
  schoolDays = 2
}) {
  if (freigegebenAm) return false;
  if (teacherLocked) return false;
  const due = autoReleaseDueDate(checkpointDate, schoolDays);
  if (!due || !today) return false;
  return today >= due;
}

/** Hinweis: Freigabe morgen (today + 1 Schultag = due). */
export function autoReleaseHint({
  checkpointDate,
  freigegebenAm,
  teacherLocked,
  today,
  schoolDays = 2
}) {
  if (freigegebenAm || teacherLocked) return null;
  const due = autoReleaseDueDate(checkpointDate, schoolDays);
  if (!due || !today) return null;
  const tomorrow = addSchoolDays(today, 1);
  if (due === tomorrow) return { due, kind: "tomorrow" };
  if (due === today) return { due, kind: "today" };
  return null;
}

/**
 * Cockpit-Ereignisse + Ticker-Hilfen (Stufe 2).
 */

export const POSITIVE_EVENT_TYPES = new Set([
  "tagesziel_gesetzt",
  "tagesziel_geschafft",
  "reflexion",
  "level_bestaetigt",
  "crew_tag",
  "hilfe_erledigt",
  "serie",
  "boss_besiegt",
  "side_quest_done",
  "ziehung",
  "taktik_deck",
  "logic_coach"
]);

const TICKER_LABELS = {
  tagesziel_gesetzt: "hat ein Tagesziel gesetzt",
  tagesziel_geschafft: "hat das Tagesziel geschafft",
  reflexion: "hat reflektiert",
  level_bestaetigt: "hat ein Level bestätigt",
  crew_tag: "Crew-Tag freigeschaltet",
  hilfe_erledigt: "hat geholfen",
  serie: "Serie erreicht",
  boss_besiegt: "Boss besiegt",
  side_quest_done: "Side Quest geschafft",
  ziehung: "Glücks-Ziehung",
  taktik_deck: "hat das Taktik-Deck geöffnet",
  logic_coach: "hat den Logic Coach gefragt"
};

/**
 * Speichert ein Ereignis. Fehler werden geschluckt, damit Aufrufer nicht brechen.
 */
export async function recordCockpitEvent(pool, {
  schoolId,
  classId,
  studentId = null,
  typ,
  data = null
} = {}) {
  if (!pool || !classId || !typ) return null;
  try {
    const r = await pool.query(
      `
      INSERT INTO cockpit_events (school_id, class_id, student_id, typ, data)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING id, created_at
    `,
      [
        schoolId != null ? Number(schoolId) : null,
        Number(classId),
        studentId != null ? Number(studentId) : null,
        String(typ).slice(0, 64),
        JSON.stringify(data || {})
      ]
    );
    return r.rows[0] || null;
  } catch (err) {
    console.warn("recordCockpitEvent:", err?.message || err);
    return null;
  }
}

/**
 * Fasst gleiche typ in der letzten Minute zusammen.
 * @param {{ id, typ, student_id, studentName?, beamerNameOk?, created_at, data }[]} rows
 */
export function collapseTickerEvents(rows, { windowMs = 60_000 } = {}) {
  const sorted = [...(rows || [])].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );
  const out = [];
  for (const row of sorted) {
    const at = new Date(row.created_at).getTime();
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.typ === row.typ &&
      Math.abs(new Date(prev.created_at).getTime() - at) <= windowMs
    ) {
      prev.count = (prev.count || 1) + 1;
      continue;
    }
    out.push({
      id: row.id,
      typ: row.typ,
      created_at: row.created_at,
      count: 1,
      studentId: row.student_id ?? row.studentId ?? null,
      studentName: row.studentName || null,
      beamerNameOk: row.beamerNameOk === true || row.beamer_name_ok === true,
      data: row.data || null
    });
  }
  return out;
}

export function formatTickerLine(ev, { forceAnon = false } = {}) {
  const typ = ev?.typ || "";
  const verb = TICKER_LABELS[typ] || typ;
  const count = Number(ev?.count) || 1;
  const canName = !forceAnon && ev?.beamerNameOk && ev?.studentName;
  if (count > 1) {
    if (typ === "tagesziel_gesetzt") {
      return `${count} haben gerade ihr Tagesziel gesetzt`;
    }
    if (typ === "hilfe_erledigt") {
      return `${count} Hilfen erledigt`;
    }
    return `${count}× ${verb}`;
  }
  const who = canName ? String(ev.studentName) : "Jemand";
  if (typ === "boss_besiegt" || typ === "side_quest_done" || typ === "ziehung") {
    return verb;
  }
  return `${who} ${verb}`;
}

/**
 * Letzte positive Events für den Beamer-Ticker (max. 6, kollabiert).
 */
export function buildTickerPayload(rows, { limit = 6, forceAnon = false } = {}) {
  const positive = (rows || []).filter((r) => POSITIVE_EVENT_TYPES.has(String(r.typ || "")));
  const collapsed = collapseTickerEvents(positive);
  return collapsed.slice(0, limit).map((ev) => ({
    id: ev.id,
    typ: ev.typ,
    at: ev.created_at,
    count: ev.count,
    text: formatTickerLine(ev, { forceAnon }),
    textAnon: formatTickerLine(ev, { forceAnon: true })
  }));
}

/** Fortschritt einer Side Quest aus Event-Zählung (best effort). */
export function sideQuestProgressFromEvents(events, typ, sinceIso = null) {
  const t = String(typ || "");
  let n = 0;
  for (const e of events || []) {
    if (String(e.typ) !== t) continue;
    if (sinceIso) {
      const at = e.created_at || e.at;
      if (at && new Date(at) < new Date(sinceIso)) continue;
    }
    n += 1;
  }
  return n;
}

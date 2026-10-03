/**
 * Regelbasiertes Coaching-Modul für den Lehrerbereich.
 * Nur beobachtbare Logbuch-Daten – keine Diagnosen.
 * Später erweiterbar um TeacherCoachingAssistant (KI), ohne Regel-API zu brechen.
 */

export const FEEDBACK_CHIPS = [
  { id: "gespraech", label: "Gespräch geführt" },
  { id: "ziel_angepasst", label: "Ziel angepasst" },
  { id: "strategie", label: "Strategie besprochen" },
  { id: "naechster_schritt", label: "Nächster Schritt geklärt" },
  { id: "weiter_so", label: "Weiter so" },
  { id: "naechste_stunde", label: "In der nächsten Stunde nachfragen" }
];

const NEGATIVE_CHECK = new Set(["nein", "👎", "stockt", "unsicher", "brauche_hilfe", "hilfe"]);

/** Zwischencheck-Antwort signalisiert Stocken/Hilfe (Legacy-Emojis + Klartext). */
export function isNegativeCheckValue(val) {
  if (val == null) return false;
  const s = String(val).trim().toLowerCase();
  if (NEGATIVE_CHECK.has(s)) return true;
  if (s.startsWith("nein")) return true;
  if (s.includes("hilfe") || s.includes("stock") || s.includes("nicht") || s.includes("hänge fest")) {
    return true;
  }
  return false;
}

/** Reflexion: Ziel nicht erreicht (ids wie "nein_nicht", Legacy "nein", Klartext). */
export function isGoalMissedReflection(reflection) {
  if (!reflection) return false;
  const achieved = String(reflection.goal_achieved || "").trim().toLowerCase();
  const answer = String(reflection.goal_reached_answer || "").trim().toLowerCase();
  if (achieved === "nein" || achieved.startsWith("nein")) return true;
  if (answer.startsWith("nein") || answer.includes("nicht geschafft")) return true;
  return false;
}

function priorityRank(p) {
  if (p === "hoch") return 0;
  if (p === "mittel") return 1;
  return 2;
}

/**
 * Baut Insight-Karten aus Tagesdaten eines Schülers.
 * @param {object} studentCtx
 * @returns {object[]} insights
 */
export function buildStudentInsights(studentCtx) {
  const {
    studentId,
    studentName,
    classId,
    className,
    date,
    entries = [],
    checks = [],
    reflections = [],
    recentReflections = [],
    feedbackToday = []
  } = studentCtx;

  const insights = [];
  const base = {
    studentId,
    studentName,
    classId,
    className,
    date
  };

  // A – Kein Plan heute
  if (!entries.length) {
    insights.push({
      ...base,
      ruleId: "A",
      priority: "hoch",
      title: "Noch kein Plan heute",
      observation: `${studentName} hat für heute noch keinen Logbuch-Plan eingetragen.`,
      prompt: "Kurz nachfragen: Was ist heute das erste Ziel – und brauchst du Unterstützung beim Start?",
      tone: "attention"
    });
  }

  // B – Ziel nicht erreicht + Sicherheit gesunken
  for (const entry of entries) {
    const reflection = reflections.find((r) => r.log_entry_id === entry.id);
    if (!reflection) continue;
    const before = entry.confidence_before;
    const after = reflection.confidence_after;
    const missed =
      reflection.goal_achieved === "nein" ||
      String(reflection.goal_reached_answer || "").toLowerCase().includes("nein");
    if (missed && before != null && after != null && Number(after) < Number(before)) {
      insights.push({
        ...base,
        ruleId: "B",
        priority: "hoch",
        title: "Ziel verfehlt, Sicherheit gesunken",
        observation: `${studentName} (${entry.subject}): Ziel nicht erreicht, Selbstwirksamkeit ${before} → ${after}.`,
        prompt: "Gesprächsimpuls: Was hat heute den Unterschied gemacht – und was wäre ein kleiner nächster Schritt?",
        tone: "attention",
        subject: entry.subject,
        entryId: entry.id
      });
    }
  }

  // C – Zwischencheck signalisiert Stocken/Hilfe
  for (const check of checks) {
    const stuck =
      isNegativeCheckValue(check.on_track) ||
      isNegativeCheckValue(check.understands) ||
      isNegativeCheckValue(check.progress) ||
      isNegativeCheckValue(check.next_step_answer);
    if (!stuck) continue;
    const entry = entries.find((e) => e.id === check.log_entry_id);
    insights.push({
      ...base,
      ruleId: "C",
      priority: "hoch",
      title: "Zwischencheck: stockt / unsicher",
      observation: `${studentName}${entry?.subject ? ` (${entry.subject})` : ""} hat im Zwischencheck Stocken oder Unsicherheit markiert.`,
      prompt: "Gesprächsimpuls: Wo genau hakt es – Verständnis, Tempo oder nächster Schritt?",
      tone: "attention",
      subject: entry?.subject || null,
      entryId: check.log_entry_id
    });
  }

  // D – Plan ohne Reflexion (Nachmittag/Ende)
  if (entries.length && reflections.length < entries.length) {
    const open = entries.filter((e) => !reflections.some((r) => r.log_entry_id === e.id));
    if (open.length) {
      insights.push({
        ...base,
        ruleId: "D",
        priority: "mittel",
        title: "Reflexion noch offen",
        observation: `${studentName}: ${open.length} von ${entries.length} Plänen ohne Tagesabschluss.`,
        prompt: "Erinnern: Kurzer Abschluss hilft, den nächsten Schritt festzuhalten.",
        tone: "neutral",
        subjects: open.map((e) => e.subject)
      });
    }
  }

  // E – Positive Hinweise
  const lastThree = recentReflections.slice(0, 3);
  const threeJa =
    lastThree.length >= 3 &&
    lastThree.every((r) => r.goal_achieved === "ja");
  if (threeJa) {
    insights.push({
      ...base,
      ruleId: "E",
      priority: "niedrig",
      title: "Stabile Zielerreichung",
      observation: `${studentName} hat die letzten drei Reflexionen mit „Ziel erreicht“ abgeschlossen.`,
      prompt: "Gesprächsimpuls: Passt die Zielhöhe noch – oder ist ein Levelcheck sinnvoll?",
      tone: "positive"
    });
  }

  const improved = entries.some((entry) => {
    const reflection = reflections.find((r) => r.log_entry_id === entry.id);
    if (!reflection) return false;
    const before = entry.confidence_before;
    const after = reflection.confidence_after;
    return before != null && after != null && Number(after) > Number(before);
  });
  if (improved && !threeJa) {
    insights.push({
      ...base,
      ruleId: "E+",
      priority: "niedrig",
      title: "Selbstwirksamkeit gestiegen",
      observation: `${studentName} meldet heute eine höhere Sicherheit nach der Arbeit.`,
      prompt: "Kurzes positives Feedback: Was hat heute geholfen?",
      tone: "positive"
    });
  }

  if (feedbackToday.length) {
    insights.push({
      ...base,
      ruleId: "F",
      priority: "niedrig",
      title: "Rückmeldung bereits notiert",
      observation: `Heute bereits ${feedbackToday.length} Rückmeldung(en) für ${studentName}.`,
      prompt: "Bei Bedarf ergänzen oder im Verlauf nachlesen.",
      tone: "neutral"
    });
  }

  return insights.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
}

/**
 * Aggregiert Klassen-Kennzahlen und priorisierte Insight-Karten (5–8).
 */
export function buildTodayCoachingView({
  classId,
  className,
  date,
  students,
  maxInsights = 8
}) {
  const allInsights = [];
  const studentTiles = [];
  let planned = 0;
  let reflected = 0;
  let needsAttention = 0;
  let positive = 0;

  for (const s of students) {
    const hasPlan = Boolean(s.entries?.length);
    const hasReflect = Boolean(s.reflections?.length);
    if (hasPlan) planned += 1;
    if (hasReflect) reflected += 1;
    const insights = buildStudentInsights({
      studentId: s.id,
      studentName: s.name,
      classId,
      className,
      date,
      entries: s.entries || [],
      checks: s.checks || [],
      reflections: s.reflections || [],
      recentReflections: s.recentReflections || [],
      feedbackToday: s.feedbackToday || []
    });
    const attention = insights.some((i) => i.priority === "hoch");
    const isPositive = insights.some((i) => i.tone === "positive");
    if (attention) needsAttention += 1;
    if (isPositive) positive += 1;
    allInsights.push(...insights);
    const top = insights[0] || null;
    studentTiles.push({
      id: s.id,
      name: s.name,
      planned: hasPlan,
      reflected: hasReflect,
      needsAttention: attention,
      positive: isPositive,
      topInsight: top?.title || null,
      priority: top?.priority || null
    });
  }

  allInsights.sort((a, b) => {
    const pr = priorityRank(a.priority) - priorityRank(b.priority);
    if (pr !== 0) return pr;
    return String(a.studentName).localeCompare(String(b.studentName), "de");
  });

  // Pro Schüler max. eine hoch-priore Karte in der Top-Liste, dann auffüllen
  const picked = [];
  const seenHigh = new Set();
  for (const insight of allInsights) {
    if (picked.length >= maxInsights) break;
    if (insight.priority === "hoch") {
      if (seenHigh.has(insight.studentId)) continue;
      seenHigh.add(insight.studentId);
    }
    picked.push(insight);
  }

  studentTiles.sort((a, b) => {
    const rank = (x) => (x.needsAttention ? 0 : x.planned ? 1 : 2);
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return String(a.name).localeCompare(String(b.name), "de");
  });

  return {
    classId,
    className,
    date,
    stats: {
      studentCount: students.length,
      plannedCount: planned,
      reflectedCount: reflected,
      needsAttentionCount: needsAttention,
      positiveCount: positive
    },
    students: studentTiles,
    insights: picked,
    insightTotal: allInsights.length
  };
}

/** Platzhalter für spätere KI-Schicht – gleiche Signatur, aktuell Pass-through. */
export class TeacherCoachingAssistant {
  constructor(options = {}) {
    this.enabled = Boolean(options.enabled);
  }

  async enrichInsights(insights) {
    if (!this.enabled) return insights;
    return insights;
  }
}

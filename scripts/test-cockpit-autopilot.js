/**
 * Unit-Tests für Cockpit-Autopilot (ohne DB).
 */
import assert from "node:assert/strict";
import {
  normalizeAutopilotSettings,
  addSchoolDays,
  schoolDaysBetween,
  lessonPhase,
  buildBeamerSchedule,
  pickSmartSideQuestTemplate,
  proposeLevelcheckDates,
  isAutoReleaseDue,
  autoReleaseHint,
  resolveAutopilotNow
} from "../lib/cockpit-autopilot.js";

function near(iso, hm) {
  const [h, m] = hm.split(":").map(Number);
  // schoolDateTime-ähnlich: lokale Interpretation als UTC-Offset-frei via Date
  return new Date(`${iso}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
}

{
  const s = normalizeAutopilotSettings({ raffleXp: 15, phasesOn: false, soundOn: true });
  assert.equal(s.raffleXp, 15);
  assert.equal(s.phasesOn, false);
  assert.equal(s.soundOn, true);
  assert.equal(s.enabled, true);
}

{
  assert.equal(addSchoolDays("2026-11-18", 2), "2026-11-20"); // Mi → Fr
  assert.equal(addSchoolDays("2026-11-20", 1), "2026-11-23"); // Fr → Mo
  assert.equal(schoolDaysBetween("2026-11-18", "2026-11-20"), 2);
}

{
  const start = near("2026-11-18", "08:00");
  const end = near("2026-11-18", "08:45");
  assert.equal(
    lessonPhase({ now: near("2026-11-18", "08:05"), startAt: start, endAt: end, settings: {} }),
    "start"
  );
  assert.equal(
    lessonPhase({ now: near("2026-11-18", "08:20"), startAt: start, endAt: end, settings: {} }),
    "learn"
  );
  assert.equal(
    lessonPhase({ now: near("2026-11-18", "08:40"), startAt: start, endAt: end, settings: {} }),
    "end"
  );
  assert.equal(
    lessonPhase({
      now: near("2026-11-18", "08:05"),
      startAt: start,
      endAt: end,
      settings: { phasesOn: false }
    }),
    null
  );
}

{
  const day = "2026-11-18";
  const lessons = [
    {
      classId: 1,
      className: "9a",
      subject: "Mathe",
      timeslot: "8.00-8.45",
      unitName: "Quadrate"
    },
    {
      classId: 2,
      className: "8b",
      subject: "Physik",
      timeslot: "10.00-10.45",
      unitName: "Kräfte"
    }
  ];
  const live = buildBeamerSchedule({
    lessons,
    now: near(day, "08:15"),
    settings: {}
  });
  assert.equal(live.mode, "live");
  assert.equal(live.current.className, "9a");
  assert.ok(live.phase);

  const wait = buildBeamerSchedule({
    lessons,
    now: near(day, "09:56"),
    settings: { waitBeforeMinutes: 5 }
  });
  assert.equal(wait.mode, "waiting");
  assert.equal(wait.waiting.className, "8b");

  const done = buildBeamerSchedule({
    lessons,
    now: near(day, "16:00"),
    settings: {}
  });
  assert.equal(done.mode, "done");
}

{
  const templates = [
    { id: "taktik", typ: "taktik_deck", text: "T" },
    { id: "hilfen", typ: "hilfe_erledigt", text: "H" },
    { id: "reflektieren", typ: "reflexion", text: "R" },
    { id: "kontrolle", typ: "training_kontrolle", text: "K" }
  ];
  const r = pickSmartSideQuestTemplate({
    templates,
    respect: [{ id: "reflektiert", status: "offen" }],
    lastTyp: null
  });
  assert.equal(r.id, "reflektieren");

  const h = pickSmartSideQuestTemplate({
    templates,
    respect: [{ id: "geholfen", status: "offen" }],
    lastTyp: "reflexion"
  });
  assert.equal(h.id, "hilfen");

  const c = pickSmartSideQuestTemplate({
    templates,
    respect: [{ id: "gutEingeschätzt", status: "offen" }],
    levelcheckInDays: 2,
    hasCityMap: true,
    lastTyp: "hilfe_erledigt"
  });
  assert.equal(c.id, "kontrolle");
}

{
  const goals = Array.from({ length: 6 }, (_, i) => ({ id: `g${i}`, text: `M${i + 1}` }));
  const props = proposeLevelcheckDates({
    goals,
    startDate: "2026-11-01",
    targetDate: "2026-12-15",
    weekday: 2
  });
  assert.ok(props.length >= 2);
  assert.equal(props[0].checkLevel, "rookie");
  assert.ok(props.every((p) => p.goalIds.length > 0));
}

{
  assert.equal(
    isAutoReleaseDue({
      checkpointDate: "2026-11-16",
      today: "2026-11-18",
      schoolDays: 2
    }),
    true
  );
  assert.equal(
    isAutoReleaseDue({
      checkpointDate: "2026-11-16",
      freigegebenAm: "2026-11-17",
      today: "2026-11-18",
      schoolDays: 2
    }),
    false
  );
  const hint = autoReleaseHint({
    checkpointDate: "2026-11-17",
    today: "2026-11-18",
    schoolDays: 2
  });
  assert.equal(hint.kind, "tomorrow");
}

{
  const now = resolveAutopilotNow({ simDate: "2026-11-18", simTime: "09:30" });
  assert.ok(now instanceof Date);
  assert.ok(!Number.isNaN(now.getTime()));
}

console.log("✔ cockpit-autopilot: alle Prüfungen bestanden");

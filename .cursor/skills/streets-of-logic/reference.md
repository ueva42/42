# Streets of Logic — Detailed Reference

## Stack & deployment

- **Runtime:** Node.js ESM, Express, `express-session`, `pg` (pool in `server.js`)
- **Storage:** Cloudflare R2 for uploads (`R2_*` env vars, `publicImageUrl()`)
- **DB:** PostgreSQL via `DATABASE_URL`; `migrate()` on boot
- **Hosting:** Railway (`npm start` → `node server.js`)
- **PWA:** `public/sw.js`, `pwa-init.js` — `/api/*` bypasses cache

### Env vars

- `DATABASE_URL` (required)
- `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`
- `PORT` (default 8080), `NODE_ENV` / `RAILWAY_ENVIRONMENT` for production cookies

---

## Database tables (active)

| Table | Purpose |
|-------|---------|
| `schools` | Multi-tenant root |
| `users` | student / admin / superadmin; `class_id`, `school_id`, `xp`, `level_id`, `first_login` |
| `classes` | Per-school classes |
| `timetables` | `class_id`, `weekday` 1–5, `timeslot`, `subject`, `room` |
| `log_entries` | Plan (UUID) |
| `log_checks` | Zwischen-Check |
| `log_reflections` | Tagesabschluss |
| `log_week_reflections` | Wochen-Zeitfresser |
| `level_checks` | Named levelcheck per class + subject |
| `level_check_goals` | Goals in grid |
| `level_check_marks` | Student levelplan marks |
| `level_check_proofs` | Student levelcheck uploads |
| `missions`, `bonuscards`, `characters`, `levels` | Gamification catalog |
| `xp_transactions` | XP audit |
| `student_uploads` | Mission proofs |
| `class_rewards`, `class_reward_rounds`, `class_reward_options`, `class_reward_votes` | Class voting |

**Legacy (tables exist, APIs unused):** `competency_status`, `level_check_topics`, `level_check_uploads`, `class_challenges`.

---

## LOG_SUBJECTS (keep synced)

Mathe, Deutsch, BNT, Englisch, Geo, Geschichte, Projekt, Physik, Chemie, Biologie, AES, Technik, Französisch, GK, Musik, BK, WBS, Religion/Ethik

Plan API validates subject against this list. Timetable allows custom subjects via „Sonstiges“ and `Frei`.

---

## XP values

### Logbook (`LOGBUCH_XP`)
- plan: 2, check: 3, reflect: 3, weekReflection: 10

### Levelcheck uploads (`LEVEL_CHECK_XP`)
- rookie: 5, operator: 8, street_legend: 12

Tiers must be uploaded sequentially (operator unlocks after rookie, etc.).

---

## Student routes (`student-router.js`)

| Section | Path |
|---------|------|
| today | `/student/today` |
| week | `/student/week` |
| levelplan | `/student/levelplan` |
| levelcheck | `/student/levelcheck` |
| plan/check/reflect | `/student/plan` etc. + query |
| status, missionen, belohnungen, charakter, xp | matching `/student/*` |

`/student/competencies` → levelplan (legacy alias).

---

## Teacher routes (`admin.html`)

| Path | Tab |
|------|-----|
| `/teacher/dashboard` | Klassenübersicht |
| `/teacher/week` | Woche Klasse |
| `/teacher/timetable` | Stundenplan |
| `/teacher/levelchecks` | Levelchecks |

`/admin` → redirect `/teacher/dashboard`. Hash tabs: `#xp`, `#class`, `#mission`, …

---

## Timetable implementation notes

- `TIMETABLE_MAX_SLOTS_PER_DAY = 7`
- `TIMETABLE_FREE_SUBJECT = "Frei"`
- `TIMETABLE_DEFAULT_TIMES` — prefill in editor + API `defaultTimeslots`
- Save: `PUT /api/teacher/timetable` — skips rows without subject; `DELETE` all rows for `class_id` then insert
- Student load: `fetchTimetableForClassDay(classId, weekday)` — **no school_id filter** (class_id is authoritative)
- `getStudentClassContext(studentId)` — `COALESCE(u.school_id, c.school_id)`, returns `className`
- `sortTimetableSlots()` — order by default times array, not string sort
- Mein Tag: `activeTimetable` excludes Frei; client `visibleBlocks()` double-filters

---

## Levelcheck teacher API

- `GET/POST /api/teacher/levelchecks`
- `POST /api/teacher/levelchecks/:id/goals`
- `DELETE /api/teacher/levelchecks/:id`
- `DELETE /api/teacher/levelcheck-goals/:id`

Admin UI: `teacher-competencies.js` — create levelcheck (subject + name), add multiple goals per check.

---

## Init race pattern (student + teacher dashboards)

Used in `logbuch-levelplan.js`, `logbuch-levelcheck.js`, `teacher-dashboard.js`:

```javascript
let initPromise = null;
let initGeneration = 0;
let loadRequestId = 0;

// fetchJson with one retry on 403/5xx (350ms)
// Ignore stale responses when requestId/generation mismatch
```

---

## Teacher dashboard hints

Computed per student per day from log data:
- Yellow: no entries
- Red: goal missed + confidence dropped
- Green: 3× „ja“ streak → „bereit für Levelcheck“
- Blue: stable progress

---

## Social form unlocks (plan screen)

- `gruppe`: level rank ≥ 1 or level name contains silber/street pro/gold/legend
- `frei`: rank ≥ 2 or gold/legend

---

## Security notes (for agents, not end users)

- Passwords compared/stored plain text in current codebase
- Login: `SELECT … WHERE name=$1 ORDER BY id ASC LIMIT 1` — duplicate names across schools ambiguous
- Do not commit `.env`, `backup.sql`, credentials

---

## Recent git themes (context)

- Levelplan / Levelcheck split for students
- Matrix levelcheck model (teacher goals + student marks)
- Timetable default times + extended subjects
- Free period „Frei“ option
- Mein Tag shows only non-free timetable subjects
- school_id / class_id timetable loading fixes
- First-load race guards for dashboard and levelplan

---

## File change → cache bust

When editing bundled JS, bump `?v=` in `student.html` or `admin.html` script tags for PWA clients.

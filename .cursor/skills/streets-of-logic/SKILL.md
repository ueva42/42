---
name: streets-of-logic
description: >-
  Streets of Logic (SRL-Logbuch / Temple of Logic 42) — Node/Express + PostgreSQL
  school learning logbook with XP gamification. Use when working in this repo,
  fixing student/admin features, timetables, levelplan/levelcheck, logbook flows,
  Railway deploy, or when the user mentions Streets of Logic, SRL-Logbuch,
  Mein Tag, Klassenübersicht, Stundenplan, or XP Edition.
---

# Streets of Logic — Agent Skill

German SRL logbook + GTA-themed XP platform for schools (classes 5–9+).

**Repo:** `https://github.com/ueva42/42.git`  
**Live:** `https://42-production-44e7.up.railway.app`  
**Entry:** `server.js` (monolith). Frontend in `public/`.

## Roles & entry points

| Role | After login | UI |
|------|-------------|-----|
| `student` | `/student/today` (or `/first-login`) | `public/student.html` SPA |
| `admin` (teacher) | `/teacher/dashboard` | `public/admin.html` |
| `superadmin` | `/superadmin` | `public/superadmin.html` |

Session: `req.session.user = { id, role, class_id, school_id }`. Multi-tenant via `school_id`.

## What the app does (feature map)

### Student (`StudentRouter` + `logbuch-screens.js`)

- **Mein Tag** — daily timetable blocks → Plan / Check / Reflect per subject slot
- **Meine Woche** — week overview + Zeitfresser reflection
- **Levelplan** — self-assessment matrix (Rookie / Operator / Street Legend per goal)
- **Levelcheck** — tiered proof uploads with XP
- **Status** — XP, level, class voting progress
- **Missionen / Belohnungen / Charakter / XP** — gamification (inline in `student.html`)

Sub-routes (query params): `/student/plan`, `/check`, `/reflect`.

### Admin / teacher

**Path tabs** (`/teacher/*`):

- **Klassenübersicht** — `teacher-dashboard.js`
- **Woche Klasse** — `teacher-week.js` (heatmap)
- **Stundenplan** — `teacher-timetable.js`
- **Levelchecks** — `teacher-competencies.js` (goals grid editor)

**Hash tabs** (`/admin#...`): XP, Klassen-Voting, Klassen & Schüler, Missionen, Bonuskarten, Charaktere, Level, Profil.

### Superadmin

Schools, per-school admins, system status, reset school.

## Core concepts (do not confuse)

| Concept | Meaning |
|---------|---------|
| **Plan / Check / Reflect** | SRL phases on `log_entries` → `log_checks` → `log_reflections` |
| **Levelplan** | Student marks goals in matrix (`level_check_marks`) — no upload |
| **Levelcheck** | Student uploads proofs per tier (`level_check_proofs`) — awards XP |
| **Stundenplan** | `timetables` table; drives **Mein Tag** blocks |
| **„Frei“** | Stored subject `Frei` = free period; **hidden** from student day view |
| **„— nicht genutzt —“** | Empty subject in editor = slot **not saved** |
| **Class voting** | `class_reward_rounds` / votes; not legacy `class_challenges` UI |

## Key files

```
server.js                          # APIs, migrate(), constants (LOG_SUBJECTS, …)
public/student.html                # Student shell + inline gamification JS
public/admin.html                  # Admin shell + legacy tab JS
public/js/student-router.js        # /student/* routing
public/js/logbuch-screens.js       # Screen dispatcher
public/js/logbuch-today.js           # Mein Tag
public/js/logbuch-plan|check|reflect.js
public/js/logbuch-levelplan.js     # Matrix
public/js/logbuch-levelcheck.js    # Uploads
public/js/teacher-dashboard.js
public/js/teacher-timetable.js
public/js/teacher-competencies.js
public/js/logbuch-constants.js     # window.LOGBUCH — keep in sync with server
```

## API patterns

- Student: `/api/student/*` (`isStudent`)
- Teacher: `/api/teacher/*` (`isAdmin`)
- Admin CRUD: `/api/class`, `/api/student`, `/api/missions`, …
- Superadmin: `/api/superadmin/*`

Timetable: `GET/PUT /api/teacher/timetable?classId=…`  
Mein Tag data: `GET /api/student/log/today?date=YYYY-MM-DD`  
Levelplan: `GET /api/student/levelplan`, `POST /api/student/levelcheck-mark`  
Levelcheck: `GET /api/student/levelcheck`, `POST /api/student/levelcheck-upload`

## Common change checklist

**Add/change subjects** — update all three:
1. `LOG_SUBJECTS` in `server.js`
2. `window.LOGBUCH.SUBJECTS` in `logbuch-constants.js`
3. `FALLBACK_SUBJECTS` in `teacher-competencies.js`

**Stundenplan / Mein Tag bug** — verify:
- Student `class_id` matches timetable class (Admin → Klassen & Schüler)
- Timetable saved (not just UI defaults)
- Query uses `class_id + weekday` (`fetchTimetableForClassDay` in `server.js`)
- Free slots filtered; only subjects with real Fach appear

**First-load empty screens** — `teacher-dashboard.js`, `logbuch-levelplan.js` use `initPromise` + `loadRequestId`; preserve pattern when editing.

**Async init** — call `TeacherDashboard.init()` / `LogbuchLevelplan.init()` without assuming sync; dedup via `initPromise`.

**Deploy** — push `main` → Railway auto-build. Bump `?v=` on changed scripts in HTML for PWA cache. Do not commit `backup.sql` or `.DS_Store` unless asked.

**Commits** — only when user explicitly requests.

## Default timetable times (7 slots)

`7.50-8.35`, `8.40-9.25`, `9.30-10.15`, `10.35-11.20`, `11.25-12.10`, `12.15-13.00`, `13.05-13.50`

## User preferences (from project history)

- Keep **Missionen** and admin sidebar as-is; teacher manages content
- Student: **Levelplan** (matrix) + **Levelcheck** (uploads) stay separate tabs
- Admin levelcheck editor stays on teacher side
- Minimize scope; match existing code style; German UI strings

## When stuck

Read [reference.md](reference.md) for full table list, XP values, deployment env vars, and known gotchas.

Typical Mein Tag empty causes: student wrong class, timetable not saved, all slots „Frei“ or „nicht genutzt“, weekend (no weekday).

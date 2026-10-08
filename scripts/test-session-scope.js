import assert from "assert";
import express from "express";
import session from "express-session";
import {
  SESSION_ROLES,
  sessionCookieNameFor,
  scopeFromPagePath,
  resolveRequestScopeHint,
  pickRequestScope,
  parseScopedSessionIds,
  rolesWithSessionCookie,
  orderRolesByPreference
} from "../lib/session-scope.js";
import { unsignSessionId } from "../lib/session-logout.js";
import crypto from "crypto";

const secret = "test-secret";
function sign(val) {
  const mac = crypto.createHmac("sha256", secret).update(val).digest("base64").replace(/=+$/, "");
  return `${val}.${mac}`;
}
const ck = (role, id) => `${sessionCookieNameFor(role)}=s%3A${encodeURIComponent(sign(id))}`;

// --- Pfad / Header / Referer -------------------------------------------------
assert.deepStrictEqual(SESSION_ROLES, ["admin", "teacher", "student", "superadmin"]);
assert.strictEqual(sessionCookieNameFor("admin"), "sol.sid.admin");
assert.strictEqual(scopeFromPagePath("/admin"), "admin");
assert.strictEqual(scopeFromPagePath("/teacher/klassen"), "teacher");
assert.strictEqual(scopeFromPagePath("/student/hub"), "student");
assert.strictEqual(scopeFromPagePath("/first-login"), "student");
assert.strictEqual(scopeFromPagePath("/superadmin"), "superadmin");
assert.strictEqual(scopeFromPagePath("/api/teacher/today"), null);

assert.deepStrictEqual(
  resolveRequestScopeHint({ path: "/api/teacher/today", headers: { "x-sol-scope": "admin" } }),
  { scope: "admin", source: "header" }
);
assert.deepStrictEqual(
  resolveRequestScopeHint({ path: "/teacher/week", headers: {} }),
  { scope: "teacher", source: "path" }
);
assert.deepStrictEqual(
  resolveRequestScopeHint({
    path: "/api/teacher/x",
    headers: { referer: "https://x.test/teacher/schueler?id=3" }
  }),
  { scope: "teacher", source: "referer" }
);
assert.deepStrictEqual(
  resolveRequestScopeHint({ path: "/api/x", headers: { "x-sol-scope": "hacker" } }),
  { scope: null, source: null }
);

// --- Cookie-Auswahl ----------------------------------------------------------
const both = [ck("admin", "A1"), ck("teacher", "T1")].join("; ");
assert.deepStrictEqual(parseScopedSessionIds(both, "admin", secret), ["A1"]);
assert.deepStrictEqual(parseScopedSessionIds(both, "teacher", secret), ["T1"]);
assert.deepStrictEqual(parseScopedSessionIds(both, "student", secret), []);
assert.deepStrictEqual(parseScopedSessionIds(both, "admin", "wrong"), []);
assert.deepStrictEqual(rolesWithSessionCookie(both, secret), ["admin", "teacher"]);
assert.strictEqual(unsignSessionId(sign("x"), secret), "x");

const pick = (path, headers, cookie) =>
  pickRequestScope({ path, headers, cookieHeader: cookie, secret });
// Header gewinnt, auch wenn beide Cookies da sind
assert.strictEqual(pick("/api/teacher/today", { "x-sol-scope": "teacher" }, both), "teacher");
assert.strictEqual(pick("/api/teacher/today", { "x-sol-scope": "admin" }, both), "admin");
// Seiten-Pfade
assert.strictEqual(pick("/admin", {}, both), "admin");
assert.strictEqual(pick("/teacher", {}, both), "teacher");
// Referer-Hinweis ohne passendes Cookie → auf vorhandene Cookies ausweichen
assert.strictEqual(
  pick("/api/x", { referer: "https://x.test/student/hub" }, ck("admin", "A1")),
  "admin"
);
// Ohne Hinweis: nur ein Cookie → genau dieses
assert.strictEqual(pick("/api/class", {}, ck("teacher", "T1")), "teacher");
// Ohne Hinweis, mehrere Cookies → Priorität admin vor teacher, außer zuletzt genutzte Rolle
assert.strictEqual(pick("/api/class", {}, both), "admin");
assert.strictEqual(pick("/api/class", {}, `${both}; sol_last_role=teacher`), "teacher");
assert.strictEqual(pick("/api/student/log/today", {}, `${both}; ${ck("student", "S1")}`), "student");
assert.deepStrictEqual(orderRolesByPreference(["student", "teacher"], {}), ["teacher", "student"]);
// Kein Cookie, keine Hinweise
assert.strictEqual(pick("/api/class", {}, ""), null);

// --- Mini-App: gleiche Muster wie server.js (ein Store, Cookie pro Rolle) -----
const store = new session.MemoryStore();
const mw = Object.fromEntries(
  SESSION_ROLES.map((role) => [
    role,
    session({
      name: sessionCookieNameFor(role),
      store,
      secret,
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, httpOnly: true, sameSite: "lax" }
    })
  ])
);
const SESSIONLESS = new Set(["/api/login", "/logout"]);
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  if (SESSIONLESS.has(req.path)) return next();
  const scope = pickRequestScope({
    path: req.path,
    headers: req.headers,
    cookieHeader: req.headers.cookie || "",
    secret
  });
  mw[scope || "student"](req, res, next);
});
app.post("/api/login", (req, res) => {
  const { role, id } = req.body;
  mw[role](req, res, () => {
    req.session.regenerate(() => {
      req.session.user = { id, role };
      req.session.save(() => res.json({ ok: true }));
    });
  });
});
app.get("/api/me", (req, res) => res.json({ user: req.session?.user || null }));
app.get("/logout", (req, res) => {
  const role = String(req.query.role);
  const ids = parseScopedSessionIds(req.headers.cookie || "", role, secret);
  let n = ids.length;
  const finish = () => {
    res.clearCookie(sessionCookieNameFor(role), { path: "/" });
    res.json({ ok: true });
  };
  if (!n) return finish();
  ids.forEach((id) => store.destroy(id, () => (--n === 0 ? finish() : null)));
});

const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;

// Einfacher Cookie-Jar
const jar = new Map();
function absorb(res) {
  for (const line of res.headers.getSetCookie()) {
    const [pair, ...attrs] = line.split(";");
    const eq = pair.indexOf("=");
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    const expired = attrs.some((a) => /expires=thu, 01 jan 1970/i.test(a)) || value === "";
    if (expired) jar.delete(name);
    else jar.set(name, value);
  }
}
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
async function call(path, { method = "GET", body, scope } = {}) {
  const headers = { cookie: cookieHeader() };
  if (body) headers["content-type"] = "application/json";
  if (scope) headers["x-sol-scope"] = scope;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  absorb(res);
  return res.json();
}

await call("/api/login", { method: "POST", body: { role: "admin", id: 1 } });
await call("/api/login", { method: "POST", body: { role: "teacher", id: 2 } });
assert.ok(jar.has("sol.sid.admin") && jar.has("sol.sid.teacher"), "both cookies coexist");

assert.strictEqual((await call("/api/me", { scope: "admin" })).user.id, 1);
assert.strictEqual((await call("/api/me", { scope: "teacher" })).user.id, 2);

// Nur Lehrer abmelden → Admin bleibt
await call("/logout?role=teacher");
assert.ok(jar.has("sol.sid.admin"), "admin cookie survives teacher logout");
assert.ok(!jar.has("sol.sid.teacher"), "teacher cookie cleared");
assert.strictEqual((await call("/api/me", { scope: "admin" })).user.id, 1);
assert.strictEqual((await call("/api/me", { scope: "teacher" })).user, null);

// Zweiter Lehrer-Login ersetzt nur das Lehrer-Cookie
await call("/api/login", { method: "POST", body: { role: "teacher", id: 3 } });
assert.strictEqual((await call("/api/me", { scope: "teacher" })).user.id, 3);
assert.strictEqual((await call("/api/me", { scope: "admin" })).user.id, 1);

// Admin abmelden → Lehrer bleibt
await call("/logout?role=admin");
assert.strictEqual((await call("/api/me", { scope: "admin" })).user, null);
assert.strictEqual((await call("/api/me", { scope: "teacher" })).user.id, 3);

server.close();
console.log("session-scope ok");

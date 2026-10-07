import crypto from "crypto";
import assert from "assert";
import express from "express";
import session from "express-session";
import signature from "cookie-signature";
import {
  parseAllSessionIds,
  hasLogoutMarker,
  sessionCookieClearVariants,
  SESSION_COOKIE_NAME
} from "../lib/session-logout.js";
import { defaultPostLoginPath } from "../lib/teacher-auth.js";

function sign(val, secret) {
  const mac = crypto.createHmac("sha256", secret).update(val).digest("base64").replace(/=+$/, "");
  return `${val}.${mac}`;
}

const secret = "test-secret";
const studentId = "student-session-id";
const adminId = "admin-session-id";
const header = [
  `${SESSION_COOKIE_NAME}=s%3A${encodeURIComponent(sign(studentId, secret))}`,
  `${SESSION_COOKIE_NAME}=s%3A${encodeURIComponent(sign(adminId, secret))}`,
  "sol_logout=1"
].join("; ");

assert.strictEqual(defaultPostLoginPath({ role: "student" }), "/student/hub");
assert.strictEqual(defaultPostLoginPath({ role: "admin" }), "/admin");

const ids = parseAllSessionIds(header, secret);
assert.deepStrictEqual(ids, [studentId, adminId], "both session ids must be collected");
assert.strictEqual(hasLogoutMarker(header), true);
assert.strictEqual(hasLogoutMarker("connect.sid=abc"), false);
assert.ok(sessionCookieClearVariants().some((v) => v.secure === false));
assert.ok(sessionCookieClearVariants().some((v) => v.secure === true));
assert.deepStrictEqual(parseAllSessionIds(header, "wrong-secret"), []);

const viaLib = sign(adminId, secret);
const viaPkg = signature.sign(adminId, secret);
assert.strictEqual(viaLib, viaPkg, "signature must match express-session");

function cookieHeader(res) {
  const raw = res.getHeader("set-cookie");
  return (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
}

async function listen(app) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  return { server, port };
}

const app = express();
app.use(
  session({
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, sameSite: "lax" }
  })
);
app.post("/login", (req, res) => {
  req.session.regenerate((err) => {
    if (err) return res.status(500).end();
    req.session.user = { id: 7, role: "admin" };
    req.session.save(() => {
      for (const opts of sessionCookieClearVariants()) {
        res.clearCookie(SESSION_COOKIE_NAME, opts);
      }
      res.json({ ok: true, role: req.session.user.role });
    });
  });
});

const { server, port } = await listen(app);
const loginRes = await fetch(`http://127.0.0.1:${port}/login`, { method: "POST" });
const setCookies = loginRes.headers.getSetCookie
  ? loginRes.headers.getSetCookie()
  : cookieHeader(loginRes);
assert.ok(loginRes.ok, "login response");
const fresh = setCookies.filter((c) => c.startsWith("connect.sid=s%3A") || c.includes("connect.sid=s%3A"));
assert.ok(fresh.length >= 1, "new session cookie must survive the clears");
const expiredStudentShape = setCookies.some((c) => /connect\.sid=;/.test(c) || /connect\.sid=;/.test(c) || c.includes("connect.sid=;") || c.includes("Expires=Thu, 01 Jan 1970"));
assert.ok(expiredStudentShape, "old cookie variants are expired");
server.close();

console.log("session-logout ok");

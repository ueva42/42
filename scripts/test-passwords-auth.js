/**
 * Unit-Tests: Passwort-Hashing, Legacy-Migration, Login-Rate-Limit.
 * Läuft ohne Datenbank.
 */
import assert from "assert";
import {
  hashPassword,
  verifyPassword,
  looksHashed,
  generateTempPassword,
  otpForDisplay
} from "../lib/passwords.js";
import {
  checkLoginAllowed,
  recordLoginFailure,
  recordLoginSuccess,
  _resetLoginRateLimitForTests,
  LOGIN_RATE_LIMIT
} from "../lib/login-rate-limit.js";

async function testPasswords() {
  const plain = "geheim42";
  const hashed = await hashPassword(plain);
  assert.ok(looksHashed(hashed), "Hash sollte bcrypt-Format haben");
  assert.notStrictEqual(hashed, plain);

  const ok = await verifyPassword(hashed, plain);
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.needsRehash, false);

  const bad = await verifyPassword(hashed, "falsch");
  assert.strictEqual(bad.ok, false);

  const legacy = await verifyPassword("klartext", "klartext");
  assert.strictEqual(legacy.ok, true);
  assert.strictEqual(legacy.needsRehash, true);

  const legacyBad = await verifyPassword("klartext", "anders");
  assert.strictEqual(legacyBad.ok, false);

  const otp = generateTempPassword(6);
  assert.strictEqual(otp.length, 6);

  assert.strictEqual(
    otpForDisplay({ first_login: true, temp_password: "Ab12Cd", password: hashed }),
    "Ab12Cd"
  );
  assert.strictEqual(
    otpForDisplay({ first_login: true, temp_password: null, password: "AltOTP1" }),
    "AltOTP1"
  );
  assert.strictEqual(
    otpForDisplay({ first_login: true, temp_password: null, password: hashed }),
    null
  );
  assert.strictEqual(
    otpForDisplay({ first_login: false, temp_password: "Ab12Cd", password: hashed }),
    null
  );

  console.log("✓ passwords");
}

function testRateLimit() {
  _resetLoginRateLimitForTests();
  const ip = "203.0.113.9";
  const username = "test.schueler";

  for (let i = 0; i < LOGIN_RATE_LIMIT.MAX_FAILURES - 1; i++) {
    assert.strictEqual(checkLoginAllowed({ ip, username }).allowed, true);
    recordLoginFailure({ ip, username });
  }
  assert.strictEqual(checkLoginAllowed({ ip, username }).allowed, true);
  recordLoginFailure({ ip, username });

  const blocked = checkLoginAllowed({ ip, username });
  assert.strictEqual(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec > 0);

  recordLoginSuccess({ ip, username: "other.user" });
  assert.strictEqual(checkLoginAllowed({ ip, username }).allowed, false);

  recordLoginSuccess({ ip, username });
  assert.strictEqual(checkLoginAllowed({ ip, username }).allowed, true);

  console.log("✓ login-rate-limit");
}

await testPasswords();
testRateLimit();
console.log("Alle Auth-Unit-Tests ok.");

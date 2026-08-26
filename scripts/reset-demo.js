#!/usr/bin/env node
/**
 * Demo-Schule zurücksetzen (für Cron / Railway Scheduled Job).
 * Aufruf: DATABASE_URL=... DEMO_RESET_SECRET=... node scripts/reset-demo.js
 * Oder:   npm run reset-demo  (nur DB, ohne HTTP)
 */
import pkg from "pg";
import { resetDemoSchool, isDemoEnabled } from "../lib/demo-seed.js";

const { Pool } = pkg;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL fehlt.");
    process.exit(1);
  }

  if (!isDemoEnabled()) {
    console.log("Demo deaktiviert (DEMO_ENABLED=false). Abbruch.");
    process.exit(0);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await resetDemoSchool(pool);
    console.log(result.message || "Demo-Schule zurückgesetzt.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Demo-Reset fehlgeschlagen:", err);
  process.exit(1);
});

import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function run() {
  console.log("🔧 Starte DB-Repair…");

  const sql = `

-- ========================================
--   TEMPLE OF LOGIC – DATABASE REPAIR KIT
--   Vollautomatisch, sicher, zerstörungsfrei
-- ========================================

-- USERS
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS class_id INTEGER,
  ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS character_id INTEGER,
  ADD COLUMN IF NOT EXISTS level_id INTEGER,
  ADD COLUMN IF NOT EXISTS traits JSONB,
  ADD COLUMN IF NOT EXISTS items JSONB,
  ADD COLUMN IF NOT EXISTS first_login BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS school_id INTEGER;

-- CLASSES
ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS school_id INTEGER;

-- MISSIONS
ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS require_upload BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS school_id INTEGER;

-- STUDENT UPLOADS
ALTER TABLE student_uploads
  ADD COLUMN IF NOT EXISTS school_id INTEGER;

-- BONUSCARDS
ALTER TABLE bonuscards
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS school_id INTEGER;

-- CHARACTERS
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS school_id INTEGER;

-- LEVELS
ALTER TABLE levels
  ADD COLUMN IF NOT EXISTS school_id INTEGER;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='levels'
      AND constraint_name='levels_min_xp_unique'
  ) THEN
    ALTER TABLE levels DROP CONSTRAINT levels_min_xp_unique;
  END IF;
END$$;

ALTER TABLE levels
  ADD CONSTRAINT IF NOT EXISTS levels_school_min_xp_unique
  UNIQUE(school_id,min_xp);

-- CLASS REWARD ROUNDS
ALTER TABLE class_reward_rounds
  ADD COLUMN IF NOT EXISTS school_id INTEGER,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS fixed_option_id INTEGER;

-- CLASS REWARD OPTIONS
ALTER TABLE class_reward_options
  ADD COLUMN IF NOT EXISTS reward_id INTEGER,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS round_id INTEGER;

-- CLASS REWARD VOTES
ALTER TABLE class_reward_votes
  DROP COLUMN IF EXISTS reward_id;

ALTER TABLE class_reward_votes
  ADD COLUMN IF NOT EXISTS round_id INTEGER,
  ADD COLUMN IF NOT EXISTS student_id INTEGER,
  ADD COLUMN IF NOT EXISTS option_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints
    WHERE table_name='class_reward_votes'
      AND constraint_name='class_reward_votes_unique_vote'
  ) THEN
    ALTER TABLE class_reward_votes
    ADD CONSTRAINT class_reward_votes_unique_vote
    UNIQUE(round_id, student_id);
  END IF;
END$$;

-- CLASS CHALLENGES
ALTER TABLE class_challenges
  ADD COLUMN IF NOT EXISTS school_id INTEGER,
  ADD COLUMN IF NOT EXISTS reward_id INTEGER,
  ADD COLUMN IF NOT EXISTS target_xp INTEGER,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- XP TRANSACTIONS
ALTER TABLE xp_transactions
  ADD COLUMN IF NOT EXISTS school_id INTEGER;

-- Optional Cleanup
ALTER TABLE bonuscards DROP COLUMN IF EXISTS xp_required;

`;

  try {
    await pool.query(sql);
    console.log("✅ DB erfolgreich repariert!");
  } catch (err) {
    console.error("❌ Fehler beim Reparieren:", err);
  } finally {
    process.exit(0);
  }
}

run();

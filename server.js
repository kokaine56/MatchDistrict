import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import { Resend } from 'resend';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { startSlotManagerWorker, reconcileTournamentSlots } from './workers/slotManagerWorker.js';

import { requireFeature, checkPlanLimits, getOrganizerUsage, PLAN_FEATURES, PLAN_ORDER } from './server/subscriptionMiddleware.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sanitizeImageUrlForDb(value) {
  if (value == null || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.length > 2048) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

function publicUserRow(row) {
  if (!row) return null;
  const user = { ...row };
  delete user.password;
  user.avatar = sanitizeImageUrlForDb(user.avatar);
  user.banner = sanitizeImageUrlForDb(user.banner);
  return user;
}

// Hash a password using pbkdf2
function hashPassword(password) {
  if (password == null || typeof password !== 'string') return '';
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `pbkdf2$${salt}$${hash}`;
}

// Verify a password against a hash
function verifyPassword(password, storedPassword) {
  if (!password || !storedPassword) return false;

  // If stored password doesn't follow the hash format, check plaintext (fallback for existing users)
  if (!storedPassword.startsWith('pbkdf2$')) {
    return password === storedPassword;
  }

  const parts = storedPassword.split('$');
  if (parts.length !== 3) return false;

  const salt = parts[1];
  const storedHash = parts[2];
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === storedHash;
}

// Manual .env loader
function loadEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const firstEqual = trimmed.indexOf('=');
          if (firstEqual !== -1) {
            const key = trimmed.slice(0, firstEqual).trim();
            let val = trimmed.slice(firstEqual + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      });
    }
  } catch (err) {
    console.warn('⚠️ [ENV LOADER] Could not load .env file:', err.message);
  }
}
loadEnv();

const { Pool } = pg;
const PORT = process.env.PORT || 10000;

// Derive the public-facing server URL from the incoming request
function getServerUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers['host'] || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

// Enforce and validate environment variables for production-grade security
if (!process.env.DATABASE_URL) {
  console.error('\n❌ [CRITICAL ERROR] DATABASE_URL is not set in the environment or .env file.');
  console.error('Hardcoded database credentials have been removed for production security.');
  console.error('Please configure DATABASE_URL in your environment or .env file before starting the server.\n');
  process.exit(1);
}

if (!process.env.SUPABASE_URL) {
  console.warn('⚠️ [WARNING] SUPABASE_URL is not defined in the environment. Falling back to default public URL.');
}

if (!process.env.SUPABASE_ANON_KEY) {
  console.warn('⚠️ [WARNING] SUPABASE_ANON_KEY is not defined in the environment. Supabase client authentication will fail.');
}

if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  console.warn('⚠️ [WARNING] ADMIN_EMAIL or ADMIN_PASSWORD is not set. Using default administrative credentials.');
}

const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET || 'matchdistrict_super_secure_jwt_secret_key_2026';

// Encryption helper functions for browser persistent session
const ENCRYPTION_KEY = crypto.scryptSync(JWT_SECRET, 'md-salt-string', 32);
const IV_LENGTH = 16;

function encryptSessionData(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptSessionData(text) {
  const textParts = text.split(':');
  if (textParts.length < 2) throw new Error('Invalid format');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Match District <auth@matchdistrict.in>';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ahgokqbjrpeotqzwilts.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

// Initialize Resend
const resend = new Resend(RESEND_API_KEY);

// Initialize Supabase Client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// PostgreSQL Connection Pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Initialize Supabase Tables & Verify Connection
async function initDb() {
  try {
    const client = await pool.connect();
    console.log('\n📦 [MATCH DISTRICT DB] Connected to Supabase PostgreSQL Database.');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255),
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        "gamerTag" VARCHAR(255),
        role VARCHAR(50) DEFAULT 'gamer',
        roles TEXT[] DEFAULT '{user}',
        tier VARCHAR(50) DEFAULT 'Amateur',
        experience TEXT,
        "socialLinks" TEXT,
        "kycDoc" VARCHAR(255),
        "orgApplicationStatus" VARCHAR(50) DEFAULT 'none',
        avatar TEXT,
        banner TEXT,
        phone VARCHAR(255),
        status VARCHAR(50) DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS otps (
        email VARCHAR(255) PRIMARY KEY,
        otp VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS password_resets (
        email VARCHAR(255) PRIMARY KEY,
        token VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS temp_users (
        email VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255),
        password VARCHAR(255),
        "gamerTag" VARCHAR(255),
        role VARCHAR(50),
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS registration_cooldowns (
        client_key VARCHAR(64) PRIMARY KEY,
        attempts INTEGER DEFAULT 1,
        cooldown_until TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS paired_devices (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_id VARCHAR(255) UNIQUE,
        device_name VARCHAR(255),
        api_key_hash VARCHAR(255) NOT NULL,
        refresh_token_hash VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        app_version VARCHAR(50),
        last_seen_at TIMESTAMPTZ,
        paired_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS payment_sms_verifications (
        id VARCHAR(50) PRIMARY KEY,
        utr VARCHAR(255) UNIQUE NOT NULL,
        amount INTEGER NOT NULL,
        bank VARCHAR(50),
        sender VARCHAR(255),
        sender_account VARCHAR(255),
        sms_hash VARCHAR(64) UNIQUE,
        device_id VARCHAR(255),
        matched_payment_id VARCHAR(50),
        matched_registration_id VARCHAR(50),
        match_type VARCHAR(20) DEFAULT 'unmatched',
        status VARCHAR(20) DEFAULT 'unmatched',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS utr_ref VARCHAR(255);
    `);

    // Ensure all columns exist in case the table was created previously with an older schema
    try {
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS uid VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "gamerTag" VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'gamer';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS tier VARCHAR(50) DEFAULT 'Amateur';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS experience TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "socialLinks" TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "kycDoc" VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "orgApplicationStatus" VARCHAR(50) DEFAULT 'none';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS banner TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Active';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "riotId" VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "bgmiId" VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "steamId" VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "discordTag" VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "gamertag_last_changed" TIMESTAMP;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "email_last_changed" TIMESTAMP;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "orgName" VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "orgMotto" VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "customDashboardSlug" VARCHAR(255);
        ALTER TABLE organizer_applications ADD COLUMN IF NOT EXISTS "orgImage" TEXT;
        ALTER TABLE organizer_plans ADD COLUMN IF NOT EXISTS yearly_price INT DEFAULT 0;
        ALTER TABLE organizer_plans ADD COLUMN IF NOT EXISTS has_premium_badge BOOLEAN DEFAULT false;
        ALTER TABLE organizer_plans ADD COLUMN IF NOT EXISTS staff_limit INT DEFAULT 0;
        ALTER TABLE organizer_plans ADD COLUMN IF NOT EXISTS api_access BOOLEAN DEFAULT false;
        ALTER TABLE organizer_plans ADD COLUMN IF NOT EXISTS white_label BOOLEAN DEFAULT false;
        ALTER TABLE organizer_plans ADD COLUMN IF NOT EXISTS custom_subdomain BOOLEAN DEFAULT false;
        ALTER TABLE organizer_plans ADD COLUMN IF NOT EXISTS automation_enabled BOOLEAN DEFAULT false;
        ALTER TABLE organizer_plans ADD COLUMN IF NOT EXISTS priority_support BOOLEAN DEFAULT false;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "orgBanner" TEXT DEFAULT '';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "orgBio" TEXT DEFAULT '';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS roles TEXT[] DEFAULT '{user}';
      `);
      // Backfill roles array from legacy `role` column for existing rows where roles IS NULL
      await client.query(`UPDATE users SET roles = ARRAY[role] WHERE roles IS NULL AND role IS NOT NULL`);
      console.log('📦 [MATCH DISTRICT DB] Supabase users and organizer tables schema verified and updated.');
    } catch (alterErr) {
      console.warn('⚠️ [MATCH DISTRICT DB] Could not alter tables:', alterErr.message);
    }
    await client.query(`
      CREATE TABLE IF NOT EXISTS organizer_applications (
        id VARCHAR(50) PRIMARY KEY,
        "applicantName" VARCHAR(255),
        "orgName" VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(255),
        "cityRegion" VARCHAR(255),
        games TEXT,
        experience TEXT,
        "socialLinks" TEXT,
        "discordLink" VARCHAR(255),
        "additionalNotes" TEXT,
        "kycDoc" VARCHAR(255),
        portfolio VARCHAR(255),
        "orgImage" TEXT,
        "adminNotes" TEXT,
        "selectedPlan" VARCHAR(50) DEFAULT 'Free',
        status VARCHAR(50) DEFAULT 'pending',
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS organizer_drafts (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        form_data TEXT NOT NULL,
        current_step INT DEFAULT 1,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS organizer_plans (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(50),
        monthly_price INT,
        max_tournaments INT,
        max_slots INT,
        has_verified_badge BOOLEAN
      );

      INSERT INTO organizer_plans (id, name, monthly_price, yearly_price, max_tournaments, max_slots, has_verified_badge, has_premium_badge, staff_limit, api_access, white_label, custom_subdomain, automation_enabled, priority_support) 
      VALUES 
        ('plan_free', 'Free', 0, 0, 30, 100, false, false, 0, false, false, false, false, false),
        ('plan_basic', 'Basic', 149, 1341, 60, 300, true, false, 3, false, false, false, false, true),
        ('plan_pro', 'Pro', 399, 3591, 999999, 1000, true, true, 999999, true, true, true, true, true)
      ON CONFLICT (id) DO NOTHING;

      CREATE TABLE IF NOT EXISTS subscriptions (
        id VARCHAR(50) PRIMARY KEY,
        organizer_id VARCHAR(50) UNIQUE,
        plan_id VARCHAR(50),
        billing_status VARCHAR(50) DEFAULT 'active',
        plan_start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        plan_expiration TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS plan_upgrade_requests (
        id VARCHAR(50) PRIMARY KEY,
        organizer_id VARCHAR(50),
        current_plan VARCHAR(50),
        requested_plan VARCHAR(50),
        payment_screenshot VARCHAR(255),
        transaction_id VARCHAR(100),
        payment_notes TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tournaments (
        id VARCHAR(50) PRIMARY KEY,
        title VARCHAR(255),
        game VARCHAR(255),
        status VARCHAR(50),
        "badgeBg" VARCHAR(100),
        "badgeText" VARCHAR(100),
        date VARCHAR(100),
        prize VARCHAR(100),
        entry VARCHAR(100),
        "teamsCount" VARCHAR(100),
        featured BOOLEAN DEFAULT false,
        "orgName" VARCHAR(255),
        "registrationOpenDate" VARCHAR(100),
        "registrationCloseDate" VARCHAR(100),
        "startDate" VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add extra metadata columns for dynamic detailed features
    try {
      await client.query(`
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS rules TEXT;
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS chat TEXT;
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS notices TEXT;
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS teams TEXT;
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS region VARCHAR(100);
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS format VARCHAR(100);
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS "slotsTotal" INTEGER DEFAULT 100;
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS "slotsFilled" INTEGER DEFAULT 0;
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS "roomID" VARCHAR(100);
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS "roomPassword" VARCHAR(100);
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS timeline TEXT;
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS "bannerUrl" TEXT;
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS "isDraft" BOOLEAN DEFAULT false;
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS "orgId" VARCHAR(50);
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS match_type VARCHAR(20) DEFAULT 'squad';
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS perspective VARCHAR(10) DEFAULT 'tpp';
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS reserved_slots INTEGER DEFAULT 0;
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS entry_fee_amount INTEGER DEFAULT 0;
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_pool_type VARCHAR(20) DEFAULT 'fixed';
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_pool_amount INTEGER DEFAULT 0;
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_split_1st VARCHAR(50) DEFAULT '';
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_split_2nd VARCHAR(50) DEFAULT '';
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_split_3rd VARCHAR(50) DEFAULT '';
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_split_mvp VARCHAR(50) DEFAULT '';
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS cover_image_url TEXT DEFAULT '';
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS lobby_start_time VARCHAR(100) DEFAULT '';
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS sponsors_data TEXT DEFAULT '[]';
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS sponsors_enabled BOOLEAN DEFAULT false;
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS mvp_enabled BOOLEAN DEFAULT false;
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS mvp_amount INTEGER DEFAULT 0;
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS kill_reward_enabled BOOLEAN DEFAULT false;
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS kill_reward_per_kill INTEGER DEFAULT 0;
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_positions TEXT DEFAULT '[]';
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS "orgLogo" TEXT DEFAULT '';
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS "orgHandle" VARCHAR(100) DEFAULT '';
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS "orgMotto" VARCHAR(255) DEFAULT '';
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS max_slots_per_room INTEGER DEFAULT NULL;
      `);
      console.log('📦 [MATCH DISTRICT DB] Supabase tournaments table schema updated with dynamic detail fields.');
    } catch (alterErr) {
      console.warn('⚠️ [MATCH DISTRICT DB] Could not alter tournaments table:', alterErr.message);
    }

    // ENSURE tournament_registrations table exists with all required columns
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS tournament_registrations (
          id VARCHAR(50) PRIMARY KEY,
          tournament_id VARCHAR(50) NOT NULL,
          user_id VARCHAR(50) NOT NULL,
          team_name VARCHAR(255) NOT NULL,
          captain VARCHAR(255) NOT NULL,
          members TEXT DEFAULT '[]',
          status VARCHAR(50) DEFAULT 'pending',
          slot_number INTEGER,
          transaction_id VARCHAR(100),
          payment_app VARCHAR(50),
          screenshot_url TEXT,
          email VARCHAR(255),
          phone VARCHAR(20),
          rejected_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('📦 [MATCH DISTRICT DB] tournament_registrations table ensured.');
    } catch (createRegErr) {
      console.warn('⚠️ [MATCH DISTRICT DB] Could not create/verify tournament_registrations:', createRegErr.message);
    }

    // ALTER tournament_registrations — add payment columns if missing (legacy migration)
    try {
      await client.query(`
        ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(100);
        ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS payment_app VARCHAR(50);
        ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS screenshot_url TEXT;
        ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS email VARCHAR(255);
        ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
        ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP;
      `);
      console.log('📦 [MATCH DISTRICT DB] tournament_registrations payment columns verified.');
    } catch (alterRegErr) {
      console.warn('⚠️ [MATCH DISTRICT DB] Could not alter tournament_registrations:', alterRegErr.message);
    }

    // CREATE registration_sessions table for temporary form data
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS registration_sessions (
          id VARCHAR(50) PRIMARY KEY,
          tournament_id VARCHAR(50) NOT NULL,
          user_id VARCHAR(50) NOT NULL,
          form_data TEXT NOT NULL,
          idempotency_key VARCHAR(64) UNIQUE,
          status VARCHAR(20) DEFAULT 'active',
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `);
      // Migrate existing TIMESTAMP columns to TIMESTAMPTZ (no-op if already correct)
      await client.query(`
        ALTER TABLE registration_sessions 
        ALTER COLUMN expires_at TYPE TIMESTAMPTZ 
        USING expires_at AT TIME ZONE 'UTC'
      `).catch(() => {});
      await client.query(`
        ALTER TABLE registration_sessions 
        ALTER COLUMN created_at TYPE TIMESTAMPTZ 
        USING created_at AT TIME ZONE 'UTC'
      `).catch(() => {});
      console.log('📦 [MATCH DISTRICT DB] registration_sessions table ensured.');
    } catch (sesErr) {
      console.warn('⚠️ [MATCH DISTRICT DB] Could not create registration_sessions:', sesErr.message);
    }

    // CREATE payment_submissions table for tournament entry fee payments
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS payment_submissions (
          id VARCHAR(50) PRIMARY KEY,
          registration_id VARCHAR(50),
          tournament_id VARCHAR(50) NOT NULL,
          user_id VARCHAR(50) NOT NULL,
          amount INTEGER NOT NULL DEFAULT 0,
          proof_url TEXT NOT NULL,
          utr_number VARCHAR(255),
          payment_app VARCHAR(50),
          payment_status VARCHAR(30) DEFAULT 'pending_admin_review',
          admin_notes TEXT,
          reviewed_by VARCHAR(50),
          reviewed_at TIMESTAMPTZ,
          idempotency_key VARCHAR(64) UNIQUE,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await client.query(`
        ALTER TABLE payment_submissions 
        ALTER COLUMN reviewed_at TYPE TIMESTAMPTZ 
        USING reviewed_at AT TIME ZONE 'UTC'
      `).catch(() => {});
      await client.query(`
        ALTER TABLE payment_submissions 
        ALTER COLUMN created_at TYPE TIMESTAMPTZ 
        USING created_at AT TIME ZONE 'UTC'
      `).catch(() => {});
      console.log('📦 [MATCH DISTRICT DB] payment_submissions table ensured.');
    } catch (payErr) {
      console.warn('⚠️ [MATCH DISTRICT DB] Could not create payment_submissions:', payErr.message);
    }

    // ALTER tournament_registrations — add new columns for enhanced flow
    try {
      await client.query(`
        ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS captain_uid VARCHAR(100);
        ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(64);
        ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
        ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS payment_id VARCHAR(50);
        ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
      `);
      console.log('📦 [MATCH DISTRICT DB] tournament_registrations enhanced columns verified.');
    } catch (alterReg2Err) {
      console.warn('⚠️ [MATCH DISTRICT DB] Could not alter tournament_registrations v2:', alterReg2Err.message);
    }

    // CREATE INDEX on registration_sessions for fast expiry queries
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_reg_sessions_expires ON registration_sessions(expires_at);
        CREATE INDEX IF NOT EXISTS idx_payment_submissions_status ON payment_submissions(payment_status);
        CREATE INDEX IF NOT EXISTS idx_registrations_idempotency ON tournament_registrations(idempotency_key);
        CREATE INDEX IF NOT EXISTS idx_registrations_payment_id ON tournament_registrations(payment_id);
      `);
      console.log('📦 [MATCH DISTRICT DB] Registration/payment indexes created.');

      // CREATE admin_action_log table for audit trail (supports both action and action_type columns for backward compat)
      await client.query(`
        CREATE TABLE IF NOT EXISTS admin_action_log (
          id VARCHAR(50) PRIMARY KEY,
          admin_id VARCHAR(50),
          action TEXT,
          action_type TEXT,
          target_type VARCHAR(50),
          target_id VARCHAR(50),
          target_user VARCHAR(50),
          details TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_admin_action_log_admin ON admin_action_log(admin_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_admin_action_log_created ON admin_action_log(created_at DESC)`);
      console.log('📦 [MATCH DISTRICT DB] admin_action_log table ensured.');
    } catch (idxErr) {
      console.warn('⚠️ [MATCH DISTRICT DB] Could not create indexes:', idxErr.message);
    }

    // CREATE sponsor & extension tables
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS sponsor_list (
          id VARCHAR(50) PRIMARY KEY,
          sponsor_request_id VARCHAR(50) REFERENCES sponsor_requests(id) ON DELETE SET NULL,
          name VARCHAR(255) NOT NULL,
          logo_url TEXT,
          sponsor_type VARCHAR(50) DEFAULT 'prize_pool',
          amount_contributed NUMERIC(10, 2) DEFAULT 0,
          assigned_by VARCHAR(50),
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS sponsor_contributions (
          id VARCHAR(50) PRIMARY KEY,
          tournament_id VARCHAR(50) NOT NULL,
          contributor_name VARCHAR(255) NOT NULL,
          contributor_email VARCHAR(255),
          amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
          message TEXT,
          screenshot_url TEXT,
          status VARCHAR(50) DEFAULT 'pending',
          admin_notes TEXT,
          admin_id VARCHAR(50),
          reviewed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_sponsor_contributions_tournament ON sponsor_contributions(tournament_id);
        ALTER TABLE sponsor_contributions ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(255);
        ALTER TABLE sponsor_contributions ADD COLUMN IF NOT EXISTS payment_app VARCHAR(50);
      `);
      console.log('📦 [MATCH DISTRICT DB] Sponsor, links, forms & admin log tables initialized.');
    } catch (extErr) {
      console.warn('⚠️ [MATCH DISTRICT DB] Could not create extension tables:', extErr.message);
    }

    // CREATE terms_acceptance_log table for legal proof of consent
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS terms_acceptance_log (
          id VARCHAR(50) PRIMARY KEY,
          user_id VARCHAR(50),
          email VARCHAR(255) NOT NULL,
          action VARCHAR(20) NOT NULL,
          terms_version VARCHAR(20) NOT NULL DEFAULT '1.0',
          privacy_version VARCHAR(20) NOT NULL DEFAULT '1.0',
          ip_address VARCHAR(45),
          user_agent TEXT,
          accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_terms_log_email ON terms_acceptance_log(email)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_terms_log_user ON terms_acceptance_log(user_id)`);
      console.log('📜 [MATCH DISTRICT DB] terms_acceptance_log table ensured.');
    } catch (talErr) {
      console.warn('⚠️ [MATCH DISTRICT DB] Could not create terms_acceptance_log:', talErr.message);
    }

    // CREATE slot_grid table for admin tournament slot occupancy mapping
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS slot_grid (
          id VARCHAR(50) PRIMARY KEY,
          tournament_id VARCHAR(50) NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
          room_index INTEGER NOT NULL,
          slot_index INTEGER NOT NULL,
          status VARCHAR(20) DEFAULT 'empty',
          registration_id VARCHAR(50) REFERENCES tournament_registrations(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(tournament_id, room_index, slot_index)
        );
        CREATE INDEX IF NOT EXISTS idx_slot_grid_tournament ON slot_grid(tournament_id);
      `);
      console.log('📦 [MATCH DISTRICT DB] slot_grid table initialized.');
    } catch (slotErr) {
      console.warn('⚠️ [MATCH DISTRICT DB] Could not create slot_grid table:', slotErr.message);
    }

    // --- ENABLE REALTIME REPLICATION ---
    try {
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
            CREATE PUBLICATION supabase_realtime;
          END IF;
        END $$;
      `);

      const tables = [
        'users',
        'organizer_applications',
        'org_applications',
        'tournaments',
        'tournament_registrations',
        'tournament_notices',
        'tournament_messages',
        'wallet_transactions'
      ];

      for (const table of tables) {
        const checkTableExists = await client.query(`
          SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = $1
        `, [table]);

        if (checkTableExists.rows.length > 0) {
          await client.query(`ALTER TABLE "${table}" REPLICA IDENTITY FULL;`);

          const pubTableCheck = await client.query(`
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
            AND schemaname = 'public' 
            AND tablename = $1
          `, [table]);

          if (pubTableCheck.rows.length === 0) {
            await client.query(`ALTER PUBLICATION supabase_realtime ADD TABLE "${table}";`);
            console.log(`📡 [REALTIME] Added table "${table}" to supabase_realtime publication.`);
          }
        }
      }
    } catch (realtimeErr) {
      console.warn('⚠️ [REALTIME] Failed to configure Supabase Realtime publication:', realtimeErr.message);
    }

    // Seed admin user if not present
    try {
      const adminEmail = process.env.ADMIN_EMAIL || ROOT_ADMIN_EMAIL;
      const adminPassword = process.env.ADMIN_PASSWORD || '101010';
      const checkAdmin = await client.query('SELECT * FROM users WHERE email = $1', [adminEmail]);
      if (checkAdmin.rows.length === 0) {
        const adminId = 'ADM-' + crypto.randomBytes(8).toString('hex');
        const hashedAdminPassword = hashPassword(adminPassword);
        await client.query(
          `INSERT INTO users (id, uid, name, email, password, "gamerTag", role, roles, tier, "orgApplicationStatus", avatar, status) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            adminId,
            adminId,
            'Super Admin',
            adminEmail,
            hashedAdminPassword,
            '@admin',
            'admin',
            ['user', 'admin'],
            'Pro',
            'none',
            'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=500&q=80',
            'Active'
          ]
        );
        console.log(`🛡️ [MATCH DISTRICT DB] Super Admin user seeded successfully (${adminEmail}).`);
      } else {
        // Safety repair: ensure the admin roles array always contains 'admin'
        const existing = checkAdmin.rows[0];
        const currentRoles = existing.roles || [];
        if (!currentRoles.includes('admin')) {
          await client.query(
            `UPDATE users SET role = 'admin', roles = $1 WHERE email = $2`,
            [['user', 'admin'], adminEmail]
          );
          console.log(`🛡️ [MATCH DISTRICT DB] Repaired admin roles for ${adminEmail} — 'admin' was missing.`);
        }
      }
    } catch (seedErr) {
      console.warn('⚠️ [MATCH DISTRICT DB] Failed to seed admin user:', seedErr.message);
    }

    // Seed default fee percentages if not set
    try {
      await client.query(`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES ('platform_fee_percentage', '10', CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO NOTHING
      `);
      console.log('💰 [MATCH DISTRICT DB] Default platform fee seeded (10%).');
    } catch (feeErr) {
      console.warn('⚠️ [MATCH DISTRICT DB] Could not seed platform fee:', feeErr.message);
    }

    try {
      await client.query(`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES ('organizer_fee_percentage', '5', CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO NOTHING
      `);
      console.log('💰 [MATCH DISTRICT DB] Default organizer fee seeded (5%).');
    } catch (orgFeeErr) {
      console.warn('⚠️ [MATCH DISTRICT DB] Could not seed organizer fee:', orgFeeErr.message);
    }

    // Seed default terms & privacy versions
    try {
      await client.query(`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES ('terms_version', '1.0', CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO NOTHING
      `);
      await client.query(`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES ('privacy_version', '1.0', CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO NOTHING
      `);
      console.log('📜 [MATCH DISTRICT DB] Default terms v1.0 & privacy v1.0 seeded.');
    } catch (verErr) {
      console.warn('⚠️ [MATCH DISTRICT DB] Could not seed terms versions:', verErr.message);
    }

    // ── HANDLE UNIFICATION MIGRATION: Sync orgHandle to gamerTag ──────────
    try {
      const migrateRes = await client.query(
        `UPDATE users SET "orgHandle" = "gamerTag"
         WHERE ("orgHandle" IS DISTINCT FROM "gamerTag" OR "orgHandle" IS NULL)
           AND ('organiser' = ANY(roles) OR 'admin' = ANY(roles))
           AND "gamerTag" IS NOT NULL`
      );
      if (migrateRes.rowCount > 0) {
        console.log(`🔄 [MIGRATION] Synced ${migrateRes.rowCount} existing organizer orgHandle → gamerTag.`);
        // Notify affected users via alerts
        const affectedRes = await client.query(
          `SELECT id FROM users
           WHERE ("orgHandle" IS DISTINCT FROM "gamerTag" OR "orgHandle" IS NULL)
             AND ('organiser' = ANY(roles) OR 'admin' = ANY(roles))
             AND "gamerTag" IS NOT NULL`
        );
        for (const row of affectedRes.rows) {
          await client.query(
            `INSERT INTO alerts (id, user_id, type, title, message, created_at)
             VALUES ($1, $2, 'info', 'Handle Unified',
                     'Your organization handle has been synced to match your gamerTag. You can now use your personal username as your org identity.',
                     CURRENT_TIMESTAMP)`,
            ['ALERT-' + crypto.randomBytes(4).toString('hex').toUpperCase(), row.id]
          );
        }
      }
    } catch (migErr) {
      console.warn('⚠️ [MIGRATION] Handle sync skipped:', migErr.message);
    }

    client.release();
    console.log('📦 [MATCH DISTRICT DB] Supabase Tables Initialized Successfully.\n');
  } catch (err) {
    console.error('❌ [MATCH DISTRICT DB] Failed to initialize Supabase DB:', err.message);
  }
}

// DB init completes before server accepts traffic (see listen below)

// Helper to sign JWT
function signJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + 86400000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

// Helper to verify JWT
function verifyJwt(token) {
  try {
    const [header, body, signature] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (signature === expectedSig) {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (payload.exp && payload.exp < Date.now()) {
        return { valid: false, error: 'Token expired' };
      }
      return { valid: true, payload };
    }
    return { valid: false, error: 'Invalid signature' };
  } catch (err) {
    return { valid: false, error: 'Malformed token' };
  }
}

// Helper to log terms/privacy acceptance to the audit table
async function logTermsAcceptance(pool, email, userId, action, req) {
  try {
    const tvRes = await pool.query(`SELECT value FROM site_settings WHERE key = 'terms_version'`).catch(() => ({ rows: [] }));
    const pvRes = await pool.query(`SELECT value FROM site_settings WHERE key = 'privacy_version'`).catch(() => ({ rows: [] }));
    const termsVersion = tvRes.rows[0]?.value || '1.0';
    const privacyVersion = pvRes.rows[0]?.value || '1.0';
    const ipAddress = req && req.headers
      ? ((req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket ? req.socket.remoteAddress : '') || 'unknown')
      : 'unknown';
    const userAgent = (req && req.headers && req.headers['user-agent']) || '';

    const id = 'TAL-' + crypto.randomBytes(8).toString('hex');
    await pool.query(
      `INSERT INTO terms_acceptance_log (id, user_id, email, action, terms_version, privacy_version, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, userId || null, email, action, termsVersion, privacyVersion, ipAddress, userAgent]
    ).catch(() => {});
    console.log(`\n📜 [TERMS ACCEPTANCE] ${action}`);
    console.log(`    Email: ${email} | User: ${userId || '—'}`);
    console.log(`    Terms: v${termsVersion} | Privacy: v${privacyVersion}`);
    console.log(`    IP: ${ipAddress} | UA: ${userAgent.slice(0, 80)}`);
    console.log(`    Log ID: ${id}\n`);
  } catch (err) {
    console.warn(`⚠️ [TERMS ACCEPTANCE] Failed to log ${action} for ${email}:`, err.message);
  }
}

// Helper to get authenticated user from authorization header
function getAuthUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.authUser = null;
    return null;
  }
  const token = authHeader.split(' ')[1];
  const res = verifyJwt(token);
  const user = res.valid ? res.payload : null;
  req.authUser = user;
  return user;
}

// ─────────────────────────────────────────────────────────────
// IAM Role Hierarchy Engine (Multi-Role Array)
// Role inheritance model:
//   admin (4) → organiser (3) → reg_payment_verifier (2) → user (1)
// Every user has a `roles TEXT[]` array (e.g. ["user", "organiser"]).
// Admin in the array grants automatic system-wide override.
// ─────────────────────────────────────────────────────────────
const ROLES = Object.freeze({
  ADMIN:               'admin',
  ORGANISER:           'organiser',
  REG_PAYMENT_VERIFIER: 'reg_payment_verifier',
  USER:                'user',
});

// ─── Absolute immutable root admin protection ───
// This hardcoded constant ensures the root admin account can NEVER be demoted,
// even if the ADMIN_EMAIL env variable is accidentally cleared or misconfigured.
// The primary guard uses env.ADMIN_EMAIL; this constant acts as the failsafe.
const ROOT_ADMIN_EMAIL = 'matchdistrict.in@gmail.com';

const ROLE_HIERARCHY = Object.freeze({
  [ROLES.USER]:               1,
  [ROLES.REG_PAYMENT_VERIFIER]: 2,
  [ROLES.ORGANISER]:           3,
  [ROLES.ADMIN]:              4,
});

/**
 * Normalizes a user object to always return a roles array.
 * Handles migration: if `roles` is missing but `role` exists, wraps it in an array.
 * @param {object} user - User object with optional `roles` (array) or `role` (string)
 * @returns {string[]}
 */
function getUserRoles(user) {
  if (!user) return [];
  if (user.roles && Array.isArray(user.roles) && user.roles.length > 0) return user.roles;
  if (user.role) return [user.role];
  return [];
}

/**
 * Checks if a user's roles array includes the target role.
 * Admin in the roles array grants automatic system-wide override.
 * @param {object} user       - User object with `roles` (array) or legacy `role` (string)
 * @param {string} targetRole - The role to check for
 * @returns {boolean}
 */
function hasRole(user, targetRole) {
  if (!user || !targetRole) return false;
  const roles = getUserRoles(user);
  if (roles.includes(ROLES.ADMIN)) return true;
  return roles.includes(targetRole);
}

/**
 * Checks if a user's highest role has sufficient hierarchical clearance.
 * @param {object} user        - User object
 * @param {string} requiredRole - The minimum role required
 * @returns {boolean}
 */
function hasRoleClearance(user, requiredRole) {
  if (!user || !requiredRole) return false;
  const roles = getUserRoles(user);
  if (roles.includes(ROLES.ADMIN)) return true;
  // Find the user's highest hierarchy level among their roles
  let userLevel = 0;
  for (const r of roles) {
    const level = ROLE_HIERARCHY[r] ?? 0;
    if (level > userLevel) userLevel = level;
  }
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? Infinity;
  return userLevel >= requiredLevel;
}

/**
 * Returns true if the user has at least organiser-level clearance.
 */
function hasOrganizerRights(user) {
  if (!user) return false;
  return hasRoleClearance(user, ROLES.ORGANISER);
}

/**
 * Permission matrix — maps capabilities to the roles allowed to perform them.
 * Admin auto-passes all capabilities via hasCapability.
 */
const PERMISSIONS = Object.freeze({
  PUBLISH_TOURNAMENT: [ROLES.ADMIN, ROLES.ORGANISER],
  VERIFY_PAYMENTS:    [ROLES.ADMIN, ROLES.REG_PAYMENT_VERIFIER],
  MANAGE_ROLES:       [ROLES.ADMIN],
});

/**
 * Validates if a user has the required capability.
 * Accepts a user object (with `roles` or `role` property).
 */
function hasCapability(user, capability) {
  if (!user || !capability) return false;
  const roles = getUserRoles(user);
  if (roles.includes(ROLES.ADMIN)) return true;
  const authorizedRoles = PERMISSIONS[capability];
  if (!authorizedRoles) return false;
  return roles.some(r => authorizedRoles.includes(r));
}

// Middleware to validate organizer status (uses hasOrganizerRights)
function requireOrganizer(req, res, authUser) {
  if (!authUser) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in.' }));
    return false;
  }
  if (!hasOrganizerRights(authUser)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Only organizers or administrators can perform this action.' }));
    return false;
  }
  return true;
}

// Middleware to validate organizer is approved (DB check) — for create/update tournament endpoints
async function requireApprovedOrganizer(req, res, authUser, pool) {
  if (!authUser) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in.' }));
    return false;
  }
  if (!hasOrganizerRights(authUser)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Only organizers or administrators can perform this action.' }));
    return false;
  }
  if (hasRole(authUser, ROLES.ADMIN)) return true; // admins bypass approval check
  try {
    const result = await pool.query(
      `SELECT "orgApplicationStatus" FROM users WHERE id = $1`,
      [authUser.id]
    );
    const status = result.rows[0]?.orgApplicationStatus || 'none';
    if (status !== 'approved') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'FORBIDDEN',
        message: 'Your organizer account has not been approved yet.'
      }));
      return false;
    }
    return true;
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: err.message }));
    return false;
  }
}

// Plan definitions moved to server/subscriptionMiddleware.js (imported above)

async function notifyFollowersOfTournament(t) {
  try {
    const orgId = t.orgId;
    if (!orgId) return;

    // Fetch organizer name
    const orgRes = await pool.query('SELECT name FROM users WHERE id = $1', [orgId]);
    const orgName = orgRes.rows[0]?.name || t.orgName || 'An Organizer';

    // Get followers
    const followersRes = await pool.query(
      `SELECT u.id, u.email, u.name 
       FROM users u 
       JOIN organiser_followers f ON u.id = f.user_id 
       WHERE f.organiser_id = $1`,
      [orgId]
    );

    for (const follower of followersRes.rows) {
      const alertId = 'ALT-' + crypto.randomBytes(8).toString('hex');
      const title = `New Tournament: ${t.title}`;
      const message = `${orgName} has hosted a new tournament "${t.title}" for ${t.game}! Check it out and register now.`;

      // 1. Insert alert in database
      await pool.query(
        `INSERT INTO alerts (id, user_id, title, message, tournament_id) 
         VALUES ($1, $2, $3, $4, $5)`,
        [alertId, follower.id, title, message, t.id]
      );

      // 2. Send email via Resend
      if (follower.email) {
        try {
          await resend.emails.send({
            from: RESEND_FROM_EMAIL,
            to: [follower.email],
            subject: `New Tournament by ${orgName}: ${t.title}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
                <h2 style="color: #333;">New Tournament Hosted!</h2>
                <p>Hello ${follower.name || 'Gamer'},</p>
                <p><strong>${orgName}</strong>, an organizer you follow, has just hosted a new tournament:</p>
                <div style="background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin: 15px 0; border-left: 4px solid #6366f1;">
                  <h3 style="margin-top: 0;">${t.title}</h3>
                  <p><strong>Game:</strong> ${t.game}</p>
                  <p><strong>Prize Pool:</strong> ${t.prize || 'N/A'}</p>
                  <p><strong>Date:</strong> ${t.date || 'TBD'}</p>
                </div>
                <p>Don't miss out on registering before slots are filled!</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="font-size: 12px; color: #888;">You are receiving this email because you follow ${orgName} on Match District.</p>
              </div>
            `
          });
        } catch (emailErr) {
          console.warn(`⚠️ [NOTIFICATION SERVICE] Failed to send email to ${follower.email}:`, emailErr.message);
        }
      }
    }
  } catch (err) {
    console.error('❌ [NOTIFICATION SERVICE] Error notifying followers:', err.message);
  }
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

const server = http.createServer(async (req, res) => {
  const urlPath = (req.url || '').split('?')[0];
  // CORS Headers for Render
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check endpoint for Docker/Render
  if (urlPath === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
    return;
  }

  // 1. OTP Sending Service
  if (req.url === '/api/auth/send-otp' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body);
        const email = parsed.email;
        let otp = parsed.otp;
        let expiry = parsed.expiry;

        if (!otp) {
          otp = Math.floor(100000 + Math.random() * 900000).toString();
        }
        if (!expiry) {
          expiry = Date.now() + 5 * 60 * 1000; // 5 minutes
        }



        // Rate limiting: Check if OTP was sent in the last 3 minutes
        const lastOtpRes = await pool.query('SELECT created_at FROM otps WHERE email = $1', [email]);
        if (lastOtpRes.rows.length > 0) {
          const lastCreatedAt = new Date(lastOtpRes.rows[0].created_at).getTime();
          const waitTimeLimit = 3 * 60 * 1000; // 3 minutes
          const timeElapsed = Date.now() - lastCreatedAt;
          if (timeElapsed < waitTimeLimit) {
            const secondsLeft = Math.ceil((waitTimeLimit - timeElapsed) / 1000);
            res.writeHead(429, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'TOO_MANY_REQUESTS',
              message: `Please wait ${secondsLeft} seconds before requesting another verification code.`,
              secondsLeft: secondsLeft
            }));
            return;
          }
        }

        console.log('\n=================================================================');
        console.log(`🔑 [MATCH DISTRICT OTP SERVICE] Verification Code Generated`);
        console.log(`📧 Email: ${email}`);
        console.log(`🔢 OTP:   ${otp}`);
        console.log(`⏱️  Valid: 5 minutes (until ${new Date(expiry).toLocaleTimeString()})`);
        console.log('=================================================================\n');

        // Store OTP in database
        const expiresAt = new Date(expiry);
        await pool.query(
          'INSERT INTO otps (email, otp, expires_at) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET otp = $2, expires_at = $3, created_at = CURRENT_TIMESTAMP',
          [email, otp, expiresAt]
        );

        // Send email via Resend
        try {
          const { data, error } = await resend.emails.send({
            from: RESEND_FROM_EMAIL,
            to: [email],
            subject: 'Your Match District Verification Code',
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
                <h2 style="color: #333; text-align: center;">Verify Your Email</h2>
                <p>Hello,</p>
                <p>Your verification code for Match District is:</p>
                <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #000; margin: 20px 0; border-radius: 4px;">
                  ${otp}
                </div>
                <p>This code will expire in 5 minutes.</p>
                <p>If you didn't request this code, you can safely ignore this email.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="font-size: 12px; color: #888; text-align: center;">&copy; 2026 Match District. All rights reserved.</p>
              </div>
            `
          });

          if (error) {
            console.error('❌ [RESEND ERROR]', error);
          } else {
            console.log('✅ [RESEND SUCCESS] OTP email sent to:', email);
          }
        } catch (resendErr) {
          console.error('❌ [RESEND EXCEPTION]', resendErr.message);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        const isSchemaError = err.message && err.message.includes('does not exist');
        const message = isSchemaError
          ? 'Registration service configuration error. Please contact support.'
          : err.message;
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: message }));
      }
    });
    return;
  }

  // 1b. OTP Verification Service
  if (req.url === '/api/auth/verify-otp' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { email, otp } = JSON.parse(body);

        // Explicitly check for 5-minute validity using current time
        const now = new Date();
        const dbRes = await pool.query(
          'SELECT * FROM otps WHERE email = $1 AND otp = $2 AND expires_at > $3',
          [email, otp, now]
        );

        if (dbRes.rows.length > 0) {
          // OTP is valid, delete it so it can't be reused
          await pool.query('DELETE FROM otps WHERE email = $1', [email]);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'OTP verified successfully.' }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid or expired OTP.' }));
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 2. JWT & Supabase Login Service
  if (req.url === '/api/auth/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        let { email: emailOrUsername, password } = JSON.parse(body);
        let email = emailOrUsername;

        // Resolve username to email if it does not contain '@'
        if (emailOrUsername && !emailOrUsername.includes('@')) {
          const userLookup = await pool.query(
            'SELECT email FROM users WHERE LOWER("gamerTag") = LOWER($1) OR LOWER("gamerTag") = LOWER($2) OR LOWER(name) = LOWER($1)',
            [emailOrUsername.trim(), '@' + emailOrUsername.trim()]
          );
          if (userLookup.rows.length > 0) {
            email = userLookup.rows[0].email;
          }
        }

        // Look up the user by email in the Supabase Database (users table)
        const dbUserRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        let foundUser = dbUserRes.rows[0];

        // If found, verify password from the database
        if (foundUser && foundUser.password && verifyPassword(password, foundUser.password)) {
          // Establish Supabase Auth session if they have a real auth UUID
          if (foundUser.uid && !foundUser.uid.startsWith('USR-') && !foundUser.uid.startsWith('ADM-')) {
            try {
              await supabase.auth.signInWithPassword({ email: foundUser.email, password });
            } catch (supErr) {
              console.warn('⚠️ [LOGIN] Supabase Auth session establish warning:', supErr.message);
            }
          }

          const token = signJwt({ email: foundUser.email, role: foundUser.role, roles: foundUser.roles || [foundUser.role], id: foundUser.uid || foundUser.id });
          const encryptedSession = encryptSessionData(JSON.stringify({ token, userId: foundUser.uid || foundUser.id, email: foundUser.email }));
          console.log(`\n🛡️ [MATCH DISTRICT AUTH] User "${foundUser.name || email}" logged in successfully via database verification. JWT Generated.\n`);
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': `token=${token}; Path=/; SameSite=Lax`
          });
          res.end(JSON.stringify({
            success: true,
            token,
            encryptedSession,
            user: publicUserRow(foundUser),
            message: hasRole(foundUser, ROLES.ADMIN)
              ? 'Superadmin credentials verified! Accessing Platform Command Center...'
              : `Welcome back, ${foundUser.name || foundUser.email.split('@')[0]}! Redirecting...`
          }));
          return;
        }

        // If not found in database or password verification failed, fall back to authenticating with Supabase Auth
        let authData = null;
        let authError = null;
        try {
          const authRes = await supabase.auth.signInWithPassword({ email, password });
          authData = authRes.data;
          authError = authRes.error;
        } catch (err) {
          authError = err;
        }

        if (authError) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: authError.message || 'Incorrect email or password.', code: 'WRONG_PASSWORD' }));
          return;
        }

        // If Supabase Auth succeeded, load/create profile from database
        const dbRes = await pool.query('SELECT * FROM users WHERE uid = $1 OR email = $2', [authData.user.id, email]);
        if (dbRes.rows.length > 0) {
          foundUser = dbRes.rows[0];
          if (foundUser.uid !== authData.user.id) {
            await pool.query('UPDATE users SET uid = $1 WHERE email = $2', [authData.user.id, email]);
            foundUser.uid = authData.user.id;
          }
        } else {
          const insertRes = await pool.query(
            `INSERT INTO users (id, uid, name, email, password, "gamerTag", role, roles, tier, "orgApplicationStatus") 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [
              authData.user.id,
              authData.user.id,
              email.split('@')[0],
              email,
              'REDACTED',
              '@' + email.split('@')[0],
              'player',
              ['user'],
              'Amateur',
              'none'
            ]
          );
          foundUser = insertRes.rows[0];
        }

        const token = signJwt({ email: foundUser.email, role: foundUser.role, roles: foundUser.roles || [foundUser.role], id: foundUser.uid || foundUser.id });
        const encryptedSession = encryptSessionData(JSON.stringify({ token, userId: foundUser.uid || foundUser.id, email: foundUser.email }));
        console.log(`\n🛡️ [MATCH DISTRICT AUTH] User "${foundUser.name || email}" logged in successfully via Supabase Auth. JWT Generated.\n`);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': `token=${token}; Path=/; SameSite=Lax`
        });
        res.end(JSON.stringify({ success: true, token, encryptedSession, user: publicUserRow(foundUser), message: `Welcome back, ${foundUser.name || foundUser.email.split('@')[0]}! Redirecting...` }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 3-temp. Temporary User Registration Details (saves for 5 minutes)
  if (req.url === '/api/auth/register-temp' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const userData = JSON.parse(body);

        // Cleanup expired temp users
        await pool.query('DELETE FROM temp_users WHERE expires_at < NOW()');

        // Check if the user email is already registered permanently
        const checkUser = await pool.query('SELECT * FROM users WHERE email = $1', [userData.email]);
        if (checkUser.rows.length > 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Email is already registered.' }));
          return;
        }

        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        const hashedPassword = hashPassword(userData.password);
        await pool.query(
          `INSERT INTO temp_users (email, name, password, "gamerTag", role, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (email)
           DO UPDATE SET name = $2, password = $3, "gamerTag" = $4, role = $5, expires_at = $6, created_at = CURRENT_TIMESTAMP`,
          [userData.email, userData.name || '', hashedPassword, userData.gamerTag || '', userData.role || 'player', expiresAt]
        );

        console.log(`📦 [MATCH DISTRICT TEMP REGISTER] Temporary registration details saved for: ${userData.email}`);

        // Log terms acceptance if user agreed (fire-and-forget — don't block the response)
        if (userData.agreeTerms === true) {
          logTermsAcceptance(pool, userData.email, null, 'temp_submit', req).catch(() => {});
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Details submitted successfully. Proceeding to verification.'
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 3. Supabase User Registration Service (finalizes from temp_users)
  if (req.url === '/api/auth/register' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { email, password } = JSON.parse(body);

        // Cleanup expired temp users
        await pool.query('DELETE FROM temp_users WHERE expires_at < NOW()');

        // Fetch temporary user details
        const tempUserRes = await pool.query('SELECT * FROM temp_users WHERE email = $1 AND expires_at > NOW()', [email]);
        if (tempUserRes.rows.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Registration session expired (5 min limit). Please submit details again.' }));
          return;
        }

        const tempUser = tempUserRes.rows[0];

        // Register user in Supabase Auth using password passed from client
        let userUUID = null;
        let isLocalFallback = false;
        const registerPassword = password || ('MatchDistrictTempPass' + Math.random().toString(36).slice(-8));

        try {
          const { data: authData, error: authError } = await supabase.auth.signUp({
            email: tempUser.email,
            password: registerPassword
          });

          if (authError) {
            console.warn(`⚠️ [SUPABASE SIGNUP ERROR] ${authError.message}. Falling back to local database registration.`);
            isLocalFallback = true;
          } else if (!authData || !authData.user) {
            console.warn(`⚠️ [SUPABASE SIGNUP] No auth user returned. Falling back to local database registration.`);
            isLocalFallback = true;
          } else {
            userUUID = authData.user.id;
          }
        } catch (signUpErr) {
          console.warn(`⚠️ [SUPABASE SIGNUP EXCEPTION] ${signUpErr.message}. Falling back to local database registration.`);
          isLocalFallback = true;
        }

        if (isLocalFallback) {
          // Check if already in users table
          const checkUser = await pool.query('SELECT * FROM users WHERE email = $1', [tempUser.email]);
          if (checkUser.rows.length > 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Email is already registered.' }));
            return;
          }
          userUUID = 'USR-' + crypto.randomBytes(12).toString('hex');
        }

        const defaultRole = tempUser.role || 'player';
        const defaultStatus = 'Active';
        const defaultGamerTag = tempUser.gamerTag || ('@' + (tempUser.name || tempUser.email.split('@')[0]).toLowerCase().replace(/\s+/g, '_'));

        let newUser = null;
        try {
          const dbRes = await pool.query(
            `INSERT INTO users (id, uid, name, email, password, "gamerTag", role, roles, tier, "orgApplicationStatus", avatar, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [
              userUUID, // id
              userUUID, // uid
              tempUser.name || '',
              tempUser.email,
              tempUser.password, // Store hashed password from tempUser
              defaultGamerTag,
              defaultRole,
              ['user'],
              'Amateur',
              'none',
              'https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&w=500&q=80',
              defaultStatus
            ]
          );
          newUser = dbRes.rows[0];

          // Delete from temp_users (registration completed)
          await pool.query('DELETE FROM temp_users WHERE email = $1', [tempUser.email]);
          console.log(`\n📦 [MATCH DISTRICT DB] User "${newUser.email}" registered permanently.\n`);

          // Log final terms acceptance (fire-and-forget — don't block JWT response)
          logTermsAcceptance(pool, newUser.email, newUser.id || newUser.uid, 'final_register', req).catch(() => {});
        } catch (dbErr) {
          const errorMsg = dbErr.message.includes('duplicate key value') ? 'Email is already registered.' : dbErr.message;
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: errorMsg }));
          return;
        }

        const token = signJwt({ email: newUser.email, role: newUser.role, roles: newUser.roles || [newUser.role], id: newUser.uid || newUser.id });
        const encryptedSession = encryptSessionData(JSON.stringify({ token, userId: newUser.uid || newUser.id, email: newUser.email }));
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': `token=${token}; Path=/; SameSite=Lax`
        });
        res.end(JSON.stringify({ success: true, token, encryptedSession, user: newUser }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 3a. POST /api/auth/reset-password Service
  if (req.url === '/api/auth/reset-password' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { email, password } = JSON.parse(body);

        const hashedPassword = hashPassword(password);
        // Update user's password in database
        const dbRes = await pool.query(
          'UPDATE users SET password = $1 WHERE email = $2 RETURNING *',
          [hashedPassword, email]
        );

        if (dbRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'User email not found.' }));
          return;
        }

        const updatedUser = dbRes.rows[0];

        // Try to update in Supabase Auth if user has UUID
        if (updatedUser.uid && !updatedUser.uid.startsWith('USR-')) {
          try {
            await supabase.auth.admin.updateUserById(updatedUser.uid, { password: password });
          } catch (supErr) {
            console.warn('⚠️ [RESET PASSWORD] Could not update Supabase Auth user password:', supErr.message);
          }
        }

        console.log(`🔑 [MATCH DISTRICT AUTH] Password reset successfully for user: ${email}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Password reset successful.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 3a-3. POST /api/auth/change-password Service
  if (req.url === '/api/auth/change-password' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { email, currentPassword, newPassword } = JSON.parse(body);

        // Fetch user from DB
        const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'User email not found.' }));
          return;
        }

        const dbUser = userRes.rows[0];

        // Verify current password against local database first
        let isPasswordCorrect = false;
        if (dbUser.password && verifyPassword(currentPassword, dbUser.password)) {
          isPasswordCorrect = true;
        } else {
          // Fallback: Verify current password via Supabase Auth
          try {
            const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
            if (!signInError) {
              isPasswordCorrect = true;
            }
          } catch (signInErr) {
            // ignore
          }
        }

        if (!isPasswordCorrect) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Incorrect current password.' }));
          return;
        }

        const hashedNewPassword = hashPassword(newPassword);
        // Update user's password in database
        const dbRes = await pool.query(
          'UPDATE users SET password = $1 WHERE email = $2 RETURNING *',
          [hashedNewPassword, email]
        );

        const updatedUser = dbRes.rows[0];

        // Try to update in Supabase Auth if user has UUID
        if (updatedUser.uid && !updatedUser.uid.startsWith('USR-')) {
          try {
            await supabase.auth.admin.updateUserById(updatedUser.uid, { password: newPassword });
          } catch (supErr) {
            console.warn('⚠️ [CHANGE PASSWORD] Could not update Supabase Auth user password:', supErr.message);
          }
        }

        console.log(`🔑 [MATCH DISTRICT AUTH] Password changed successfully for user: ${email}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Password updated successfully.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 3a-1. POST /api/auth/forgot-password-link Service
  if (req.url === '/api/auth/forgot-password-link' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { email } = JSON.parse(body);

        // Check if user exists in database
        const userRes = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'User with this email does not exist.' }));
          return;
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

        await pool.query(
          'INSERT INTO password_resets (email, token, expires_at) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET token = $2, expires_at = $3, created_at = CURRENT_TIMESTAMP',
          [email, token, expiresAt]
        );

        // Send reset email via Resend
        const resetLink = `http://${req.headers.host}/reset-password?token=${token}`;
        try {
          await resend.emails.send({
            from: RESEND_FROM_EMAIL,
            to: [email],
            subject: 'Reset Your Match District Password',
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
                <h2 style="color: #333; text-align: center;">Reset Your Password</h2>
                <p>Hello,</p>
                <p>You requested a password reset for your Match District account. Please use the link below to set a new password:</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${resetLink}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Reset Password</a>
                </div>
                <p>This link is valid for <strong>1 hour</strong>.</p>
                <p>If you didn't request this, you can safely ignore this email.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="font-size: 12px; color: #888; text-align: center;">&copy; 2026 Match District. All rights reserved.</p>
              </div>
            `
          });
          console.log(`✉️ [PASSWORD RESET] Link sent to: ${email}`);
        } catch (resendErr) {
          console.error('❌ [RESEND EXCEPTION]', resendErr.message);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Password reset link sent.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 3a-2. POST /api/auth/reset-password-token Service
  if (req.url === '/api/auth/reset-password-token' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { token, password } = JSON.parse(body);
        if (!token || !password) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Token and password are required.' }));
          return;
        }

        const now = new Date();
        const resetRes = await pool.query(
          'SELECT * FROM password_resets WHERE token = $1 AND expires_at > $2',
          [token, now]
        );

        if (resetRes.rows.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid or expired reset token.' }));
          return;
        }

        const email = resetRes.rows[0].email;

        const hashedPassword = hashPassword(password);
        // Update password in database
        const dbRes = await pool.query(
          'UPDATE users SET password = $1 WHERE email = $2 RETURNING *',
          [hashedPassword, email]
        );

        if (dbRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'User associated with token not found.' }));
          return;
        }

        const updatedUser = dbRes.rows[0];

        // Delete reset token (inactive now)
        await pool.query('DELETE FROM password_resets WHERE email = $1', [email]);

        // Try to update in Supabase Auth if user has UUID
        if (updatedUser.uid && !updatedUser.uid.startsWith('USR-')) {
          try {
            await supabase.auth.admin.updateUserById(updatedUser.uid, { password: password });
          } catch (supErr) {
            console.warn('⚠️ [RESET PASSWORD] Could not update Supabase Auth user password:', supErr.message);
          }
        }

        console.log(`🔑 [MATCH DISTRICT AUTH] Password updated successfully via reset token for user: ${email}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Password updated successfully.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 3a-3. GET /api/auth/validate-reset-token Service
  if (req.url.startsWith('/api/auth/validate-reset-token') && req.method === 'GET') {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      if (!token) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Token is required.' }));
        return;
      }

      const now = new Date();
      const resetRes = await pool.query(
        'SELECT * FROM password_resets WHERE token = $1 AND expires_at > $2',
        [token, now]
      );

      if (resetRes.rows.length === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, valid: false, message: 'Invalid or expired reset token.' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, valid: true, message: 'Valid token.' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 3b. GET /api/auth/me Service
  if (req.url === '/api/auth/me' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const dbRes = await pool.query('SELECT * FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (dbRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'USER_NOT_FOUND' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, user: publicUserRow(dbRes.rows[0]) }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 3b-2. POST /api/auth/restore-session Service
  if (req.url === '/api/auth/restore-session' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { encryptedSession } = JSON.parse(body);
        if (!encryptedSession) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Encrypted session is required.' }));
          return;
        }

        const decrypted = decryptSessionData(encryptedSession);
        const sessionData = JSON.parse(decrypted);

        // Verify JWT token inside the session
        const verified = verifyJwt(sessionData.token);
        if (!verified.valid) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Session expired or invalid.' }));
          return;
        }

        // Fetch user from database
        const dbRes = await pool.query('SELECT * FROM users WHERE id = $1 OR uid = $1', [sessionData.userId]);
        if (dbRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'User profile not found.' }));
          return;
        }

        const foundUser = dbRes.rows[0];
        const freshToken = signJwt({ email: foundUser.email, role: foundUser.role, roles: foundUser.roles || [foundUser.role], id: foundUser.uid || foundUser.id });
        const newEncryptedSession = encryptSessionData(JSON.stringify({ token: freshToken, userId: foundUser.uid || foundUser.id, email: foundUser.email }));

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': `token=${freshToken}; Path=/; SameSite=Lax`
        });
        res.end(JSON.stringify({
          success: true,
          token: freshToken,
          user: publicUserRow(foundUser),
          encryptedSession: newEncryptedSession
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Failed to restore session: ' + err.message }));
      }
    });
    return;
  }

  // 3c. GET /api/team-presets Service
  if (req.url === '/api/team-presets' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const dbRes = await pool.query('SELECT * FROM team_presets WHERE user_id = $1 ORDER BY created_at DESC', [authUser.id]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, presets: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 3d. POST /api/team-presets Service
  if (req.url === '/api/team-presets' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }
        const data = JSON.parse(body);
        if (!data.team_name || !data.captain) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Team name and captain tag are required.' }));
          return;
        }

        // Limit check: max 4 presets
        const countRes = await pool.query('SELECT COUNT(*) FROM team_presets WHERE user_id = $1', [authUser.id]);
        const currentCount = parseInt(countRes.rows[0].count, 10);
        if (currentCount >= 4) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'LIMIT_EXCEEDED', message: 'Maximum limit of 4 presets reached. Please delete an existing preset to save a new one.' }));
          return;
        }

        // Duplicate check: team_name (case-insensitive)
        const dupRes = await pool.query(
          'SELECT * FROM team_presets WHERE user_id = $1 AND LOWER(team_name) = LOWER($2)',
          [authUser.id, data.team_name.trim()]
        );
        if (dupRes.rows.length > 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'DUPLICATE_PRESET', message: 'A preset with this team name already exists.' }));
          return;
        }

        const presetId = 'PRST-' + Date.now().toString().slice(-6);
        const membersStr = data.members ? (typeof data.members === 'string' ? data.members : JSON.stringify(data.members)) : '[]';

        const dbRes = await pool.query(
          `INSERT INTO team_presets (id, user_id, team_name, captain, members)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [presetId, authUser.id, data.team_name.trim(), data.captain.trim(), membersStr]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, preset: dbRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 3e. DELETE /api/team-presets/:id Service
  if (req.url.startsWith('/api/team-presets/') && req.method === 'DELETE') {
    const id = req.url.split('/api/team-presets/')[1];
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const existRes = await pool.query('SELECT * FROM team_presets WHERE id = $1', [id]);
      if (existRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Preset not found.' }));
        return;
      }
      if (existRes.rows[0].user_id !== authUser.id) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You do not have permission to delete this preset.' }));
        return;
      }
      await pool.query('DELETE FROM team_presets WHERE id = $1', [id]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Preset deleted successfully.' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 3f. PUT /api/team-presets/:id Service
  if (req.url.startsWith('/api/team-presets/') && req.method === 'PUT') {
    const id = req.url.split('/api/team-presets/')[1];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }
        const data = JSON.parse(body);
        if (!data.team_name || !data.captain) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Team name and captain tag are required.' }));
          return;
        }

        const existRes = await pool.query('SELECT * FROM team_presets WHERE id = $1', [id]);
        if (existRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Preset not found.' }));
          return;
        }
        if (existRes.rows[0].user_id !== authUser.id) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You do not have permission to modify this preset.' }));
          return;
        }

        // Duplicate check: team_name (case-insensitive) excluding current preset
        const dupRes = await pool.query(
          'SELECT * FROM team_presets WHERE user_id = $1 AND LOWER(team_name) = LOWER($2) AND id <> $3',
          [authUser.id, data.team_name.trim(), id]
        );
        if (dupRes.rows.length > 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'DUPLICATE_PRESET', message: 'A preset with this team name already exists.' }));
          return;
        }

        const membersStr = data.members ? (typeof data.members === 'string' ? data.members : JSON.stringify(data.members)) : '[]';

        const dbRes = await pool.query(
          `UPDATE team_presets 
           SET team_name = $1, captain = $2, members = $3
           WHERE id = $4 RETURNING *`,
          [data.team_name.trim(), data.captain.trim(), membersStr, id]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, preset: dbRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 4. Supabase Organizer Application Submit Service
  if (req.url === '/api/org/apply' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }

        const appData = JSON.parse(body);
        let newApp = { ...appData };

        try {
          const checkApp = await pool.query('SELECT id FROM organizer_applications WHERE email = $1', [appData.email || authUser.email]);
          if (checkApp.rows.length > 0) {
            const existId = checkApp.rows[0].id;
            const dbRes = await pool.query(
              `UPDATE organizer_applications SET
                "applicantName" = $1, "orgName" = $2, phone = $3, "cityRegion" = $4, games = $5, experience = $6, "socialLinks" = $7, "discordLink" = $8, "additionalNotes" = $9, "kycDoc" = $10, portfolio = $11, "selectedPlan" = $12, status = $13, "orgImage" = $14, submitted_at = CURRENT_TIMESTAMP
               WHERE id = $15 RETURNING *`,
              [
                appData.applicantName || authUser.name || '',
                appData.orgName || '',
                appData.phone || '',
                appData.cityRegion || '',
                appData.games ? (typeof appData.games === 'string' ? appData.games : JSON.stringify(appData.games)) : '[]',
                appData.experience || '',
                appData.socialLinks || '',
                appData.discordLink || '',
                appData.additionalNotes || '',
                appData.kycDoc || 'Aadhaar / PAN ID Proof',
                appData.portfolio || '',
                appData.selectedPlan || 'Free',
                appData.status || 'pending',
                appData.orgImage || '',
                existId
              ]
            );
            newApp = dbRes.rows[0];
          } else {
            const dbRes = await pool.query(
              `INSERT INTO organizer_applications (id, "applicantName", "orgName", email, phone, "cityRegion", games, experience, "socialLinks", "discordLink", "additionalNotes", "kycDoc", portfolio, "selectedPlan", status, "orgImage") 
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *`,
              [
                appData.id || `ORG-REQ-${Date.now().toString().slice(-3)}`,
                appData.applicantName || authUser.name || '',
                appData.orgName || '',
                appData.email || authUser.email,
                appData.phone || '',
                appData.cityRegion || '',
                appData.games ? (typeof appData.games === 'string' ? appData.games : JSON.stringify(appData.games)) : '[]',
                appData.experience || '',
                appData.socialLinks || '',
                appData.discordLink || '',
                appData.additionalNotes || '',
                appData.kycDoc || 'Aadhaar / PAN ID Proof',
                appData.portfolio || '',
                appData.selectedPlan || 'Free',
                appData.status || 'pending',
                appData.orgImage || ''
              ]
            );
            newApp = dbRes.rows[0];
          }

          await pool.query(`UPDATE users SET "orgApplicationStatus" = 'pending' WHERE id = $1 OR email = $2`, [authUser.id, authUser.email]);
          console.log(`\n📦 [MATCH DISTRICT DB] Organizer Application "${newApp.orgName}" saved in Supabase PostgreSQL.\n`);
        } catch (dbErr) {
          console.warn('⚠️ [MATCH DISTRICT DB] Supabase org apply failed:', dbErr.message);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, application: newApp }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 5. Supabase Get Organizer Applications Service
  if (req.url === '/api/org/applications' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }

      let query = 'SELECT * FROM organizer_applications';
      const params = [];
      if (!hasRole(authUser, ROLES.ADMIN)) {
        query += ' WHERE email = $1';
        params.push(authUser.email);
      }
      query += ' ORDER BY submitted_at DESC';

      const dbRes = await pool.query(query, params);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, applications: dbRes.rows }));
    } catch (err) {
      console.warn('⚠️ [MATCH DISTRICT DB] Supabase fetch applications failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 6. Supabase Approve/Reject Organizer Application Service
  if (req.url === '/api/org/approve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Only admins can approve organizer applications.' }));
          return;
        }

        const { id, status, email, adminNotes } = JSON.parse(body);
        let updatedApp = { id, status, email };

        try {
          const dbRes = await pool.query(`UPDATE organizer_applications SET status = $1, "adminNotes" = $2, reviewed_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *`, [status, adminNotes || '', id]);
          if (dbRes.rows.length > 0) { updatedApp = dbRes.rows[0]; }

          if (email && status === 'approved') {
            const newRole = 'organiser';
            const approvedTier = updatedApp.selectedPlan || 'Free';

            // Extract orgMotto from experience string
            let orgMotto = '';
            if (updatedApp.experience && updatedApp.experience.includes('Motto: ')) {
              const match = updatedApp.experience.match(/Motto:\s*(.*?)\s*\|/);
              if (match) orgMotto = match[1];
            }

            // Use the user's existing gamerTag as the orgHandle (handle-only unification)
            const gamerTagRes = await pool.query('SELECT "gamerTag" FROM users WHERE email = $1', [email]);
            const existingGamerTag = gamerTagRes.rows[0]?.gamerTag || '';
            const orgHandle = existingGamerTag || ('@' + (updatedApp.applicantName || 'organizer').split(' ')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase());

            // Use applicant real name as org name if orgName is empty
            const orgName = updatedApp.orgName || updatedApp.applicantName || 'Organizer';

            const newRoles = ['user', 'organiser'];
            const userRes = await pool.query(
              `UPDATE users SET 
                role = $1, 
                roles = $2,
                "orgApplicationStatus" = $3, 
                tier = $4, 
                "orgName" = $5, 
                "orgMotto" = $6,
                "orgImage" = $7,
                "orgHandle" = $8
               WHERE email = $9 RETURNING id`,
              [newRole, newRoles, status, approvedTier, orgName, orgMotto, updatedApp.orgImage, orgHandle, email]
            );

            if (userRes.rows.length > 0) {
              const organizerId = userRes.rows[0].id;
              // Create default subscription
              const planId = approvedTier === 'Free' ? 'plan_free' : (approvedTier === 'Basic' ? 'plan_basic' : 'plan_pro');
              await pool.query(
                `INSERT INTO subscriptions (id, organizer_id, plan_id, billing_status) VALUES ($1, $2, $3, 'active')
                 ON CONFLICT (organizer_id) DO UPDATE SET plan_id = EXCLUDED.plan_id`,
                [`SUB-${Date.now()}`, organizerId, planId]
              );
            }
          } else if (email && status === 'rejected') {
            await pool.query(`UPDATE users SET "orgApplicationStatus" = 'rejected' WHERE email = $1`, [email]);
          }
          console.log(`\n📦 [MATCH DISTRICT DB] Organizer Application "${id}" updated to "${status}".\n`);
        } catch (dbErr) {
          console.warn('⚠️ [MATCH DISTRICT DB] Supabase approve failed:', dbErr.message);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, application: updatedApp }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // [LEGACY REMOVED] plan_upgrade_requests endpoints consolidated into payment_verifications system

  // 6e. Get Org by custom dashboard slug
  const orgSlugMatch = req.url.match(/^\/api\/org\/by-slug\/([^/]+)$/);
  if (orgSlugMatch && req.method === 'GET') {
    try {
      const slug = decodeURIComponent(orgSlugMatch[1]);
      const dbRes = await pool.query(
        `SELECT u.id, u.name, u."orgName", u.tier, u.experience AS "bio", u."orgHandle", u.avatar, u.banner, u."orgImage", u."orgMotto", u.email, u.wallet_balance,
                u."customDashboardSlug", u.created_at, u."orgBanner", u."orgBio"
         FROM users u
         WHERE u."customDashboardSlug" = $1 AND ('organiser' = ANY(u.roles) OR 'admin' = ANY(u.roles))`,
        [slug]
      );
      if (dbRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Organization not found' }));
        return;
      }
      const org = dbRes.rows[0];
      const tourneyRes = await pool.query(
        `SELECT id, title, game, "startDate", status FROM tournaments WHERE "orgId" = $1 AND ("isDraft" = false OR "isDraft" IS NULL) ORDER BY created_at DESC LIMIT 6`,
        [org.id]
      );
      org.recent_tournaments = tourneyRes.rows || [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, org }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- Dedicated endpoint: Update Organization Profile (org-only fields) ---
  if (urlPath === '/api/organization/update' && req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }
        if (!hasRole(authUser, ROLES.ORGANISER)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Only organizers can update organization profiles.' }));
          return;
        }

        const updateData = JSON.parse(body);

        // 30 days cooldown verification for organization name change
        if (updateData.orgName !== undefined) {
          const userCheckRes = await pool.query('SELECT "orgName", "orgname_last_changed" FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
          const currentUserRecord = userCheckRes.rows[0];
          if (currentUserRecord && currentUserRecord.orgName && updateData.orgName !== currentUserRecord.orgName) {
            if (currentUserRecord.orgname_last_changed) {
              const lastChanged = new Date(currentUserRecord.orgname_last_changed);
              const daysDiff = (Date.now() - lastChanged.getTime()) / (1000 * 60 * 60 * 24);
              if (daysDiff < 30) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'COOLDOWN_ACTIVE', message: `You can only change your organization name once every 30 days. Remaining: ${Math.ceil(30 - daysDiff)} days.` }));
                return;
              }
            }
          }
        }

        let orgNameLastChangedVal = undefined;
        if (updateData.orgName !== undefined) {
          const userCheckRes = await pool.query('SELECT "orgName" FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
          if (userCheckRes.rows[0] && userCheckRes.rows[0].orgName !== updateData.orgName) {
            orgNameLastChangedVal = new Date();
          }
        }

        const orgImageUrl = sanitizeImageUrlForDb(updateData.orgImage);
        const orgBannerUrl = sanitizeImageUrlForDb(updateData.orgBanner);

        const dbRes = await pool.query(
          `UPDATE users SET
            "orgName" = COALESCE($1, "orgName"),
            "orgMotto" = COALESCE($2, "orgMotto"),
            "orgImage" = COALESCE($3, "orgImage"),
            "orgBanner" = COALESCE($4, "orgBanner"),
            "orgBio" = COALESCE($5, "orgBio"),
            "orgname_last_changed" = COALESCE($6, "orgname_last_changed")
           WHERE (id = $7 OR uid = $7) RETURNING *`,
          [
            updateData.orgName ?? null,
            updateData.orgMotto ?? null,
            orgImageUrl,
            orgBannerUrl,
            updateData.orgBio ?? null,
            orgNameLastChangedVal,
            authUser.id
          ]
        );
        if (dbRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'USER_NOT_FOUND', message: 'User profile not found.' }));
          return;
        }
        console.log(`\n📦 [MATCH DISTRICT DB] Organization profile for user "${authUser.id}" updated.\n`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, user: publicUserRow(dbRes.rows[0]) }));
      } catch (err) {
        console.warn('⚠️ [MATCH DISTRICT DB] Organization update failed:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 7. JWT Token Verification Service
  if (req.url === '/api/auth/verify' && (req.method === 'POST' || req.method === 'GET')) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ valid: false, error: 'Missing or invalid Authorization header' }));
      return;
    }

    const token = authHeader.split(' ')[1];
    const result = verifyJwt(token);
    res.writeHead(result.valid ? 200 : 401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  // 7b. Supabase Get All Users Service
  if (req.url === '/api/users' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Only admins can view users list.' }));
        return;
      }

      const dbRes = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, users: dbRes.rows }));
    } catch (err) {
      console.warn('⚠️ [MATCH DISTRICT DB] Supabase fetch users failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7b-1. Supabase Get Public Organisers Service
  if (req.url === '/api/organisers' && req.method === 'GET') {
    try {
      const dbRes = await pool.query(`
        SELECT 
          u.id, u.name, u.email, u.avatar, u.banner, u.tier, u.experience, u."socialLinks", u.status, u.phone, u."gamerTag", u."orgApplicationStatus",
          u."orgName", u."orgHandle", u."orgImage", u."orgMotto",
          (SELECT COUNT(*) FROM tournaments t WHERE t."orgId" = u.id AND t."isDraft" = false) AS "tournamentsHosted"
        FROM users u
        WHERE 'organiser' = ANY(u.roles)
        ORDER BY u.created_at DESC
      `);

      const organisers = dbRes.rows.map(row => {
        // Deterministic hash based on ID
        let hash = 0;
        const idStr = row.id || '';
        for (let i = 0; i < idStr.length; i++) {
          hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
        }
        hash = Math.abs(hash);

        const rating = (4.3 + (hash % 7) * 0.1).toFixed(1);
        const followers = (hash % 120) * 500 + 1000;
        const disputes = hash % 3;

        return {
          id: row.id,
          name: row.name || 'Organiser',
          gamerTag: row.gamerTag || `@${(row.name || 'org').toLowerCase().replace(/\s+/g, '')}`,
          orgName: row.orgName || row.name || 'Organiser',
          orgHandle: row.orgHandle || row.gamerTag || `@${(row.name || 'org').toLowerCase().replace(/\s+/g, '')}`,
          orgImage: row.orgImage || row.avatar,
          orgMotto: row.orgMotto || '',
          email: row.email,
          phone: row.phone,
          avatar: row.avatar,
          banner: row.banner,
          tier: row.tier || 'Free',
          experience: row.experience,
          socialLinks: row.socialLinks,
          status: row.status,
          orgApplicationStatus: row.orgApplicationStatus,
          tournamentsHosted: parseInt(row.tournamentsHosted) || 0,
          rating,
          followers,
          disputes,
          kycVerified: row.orgApplicationStatus === 'approved',
          games: ['VALORANT', 'BGMI'] // Default popular games
        };
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, users: organisers }));
    } catch (err) {
      console.warn('⚠️ [MATCH DISTRICT DB] Supabase fetch organisers failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7b-1-1. Toggle Organizer Follow status
  const followMatch = req.url.match(/^\/api\/organisers\/([^/]+)\/follow$/);
  if (followMatch && req.method === 'POST') {
    try {
      const organiserId = decodeURIComponent(followMatch[1]);
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be logged in to follow organizers.' }));
        return;
      }

      const existRes = await pool.query('SELECT * FROM organiser_followers WHERE user_id = $1 AND organiser_id = $2', [authUser.id, organiserId]);
      if (existRes.rows.length > 0) {
        await pool.query('DELETE FROM organiser_followers WHERE user_id = $1 AND organiser_id = $2', [authUser.id, organiserId]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, followed: false, message: 'Unfollowed organizer successfully.' }));
      } else {
        const followId = 'FOL-' + crypto.randomBytes(8).toString('hex');
        await pool.query('INSERT INTO organiser_followers (id, user_id, organiser_id) VALUES ($1, $2, $3)', [followId, authUser.id, organiserId]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, followed: true, message: 'Followed organizer successfully.' }));
      }
    } catch (err) {
      console.warn('⚠️ [FOLLOW SERVICE] Toggle follow failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7b-1-2. Get Organizer Follow status for logged in user
  const followStatusMatch = req.url.match(/^\/api\/organisers\/([^/]+)\/follow-status$/);
  if (followStatusMatch && req.method === 'GET') {
    try {
      const organiserId = decodeURIComponent(followStatusMatch[1]);
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, followed: false }));
        return;
      }

      const existRes = await pool.query('SELECT * FROM organiser_followers WHERE user_id = $1 AND organiser_id = $2', [authUser.id, organiserId]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, followed: existRes.rows.length > 0 }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7b-1-3. Fetch user notifications/alerts
  if (req.url === '/api/alerts' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }

      const dbRes = await pool.query('SELECT * FROM alerts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [authUser.id]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, alerts: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7b-1-4. Mark all notifications/alerts as read
  if (req.url === '/api/alerts/read' && req.method === 'POST') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }

      await pool.query('UPDATE alerts SET is_read = true WHERE user_id = $1');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'All alerts marked as read.' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (urlPath.startsWith('/api/users/') && req.method === 'GET') {
    const parts = urlPath.split('/');
    if (parts.length === 4) {
      const userId = parts[3];
      try {
        const dbRes = await pool.query('SELECT * FROM users WHERE id = $1 OR uid = $1', [userId]);
        if (dbRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'User not found.' }));
          return;
        }
        const user = dbRes.rows[0];
        delete user.password;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, user }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }
  }

  if (urlPath.startsWith('/api/users/') && req.method === 'DELETE') {
    const id = urlPath.split('/api/users/')[1];
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Only admins can delete users.' }));
        return;
      }

      // 1. Get the user's details first (especially email and uid) to purge from other schemas
      const userRes = await pool.query('SELECT email, uid FROM users WHERE id = $1', [id]);
      const userEmail = userRes.rows[0]?.email;
      const userUid = userRes.rows[0]?.uid;

      // 2. Delete from auth.users (Supabase Auth)
      if (userUid) {
        await pool.query('DELETE FROM auth.users WHERE id = $1', [userUid]);
      }
      if (userEmail) {
        await pool.query('DELETE FROM auth.users WHERE email = $1', [userEmail]);
        await pool.query('DELETE FROM organizer_applications WHERE email = $1', [userEmail]);
        await pool.query('DELETE FROM otps WHERE email = $1', [userEmail]);
        await pool.query('DELETE FROM password_resets WHERE email = $1', [userEmail]);
        await pool.query('DELETE FROM temp_users WHERE email = $1', [userEmail]);
      }

      // 3. Delete subscriptions & upgrade requests
      await pool.query('DELETE FROM subscriptions WHERE organizer_id = $1', [id]);
      await pool.query('DELETE FROM plan_upgrade_requests WHERE organizer_id = $1', [id]);

      // 4. Delete followers / following
      await pool.query('DELETE FROM organiser_followers WHERE user_id = $1 OR organiser_id = $1', [id]);

      // 5. Delete alerts / notifications
      await pool.query('DELETE FROM alerts WHERE user_id = $1', [id]);

      // 6. Delete wallet transactions
      await pool.query('DELETE FROM wallet_transactions WHERE user_id = $1', [id]);

      // 7. Delete team presets
      await pool.query('DELETE FROM team_presets WHERE user_id = $1', [id]);

      // Cleanup subscription system tables
      await pool.query('DELETE FROM staff_members WHERE organizer_id = $1', [id]);
      await pool.query('DELETE FROM api_keys WHERE organizer_id = $1', [id]);
      await pool.query('DELETE FROM custom_subdomains WHERE organizer_id = $1', [id]);
      await pool.query('DELETE FROM white_label_settings WHERE organizer_id = $1', [id]);
      await pool.query('DELETE FROM automation_rules WHERE organizer_id = $1', [id]);
      await pool.query('DELETE FROM analytics_events WHERE organizer_id = $1', [id]);
      await pool.query('DELETE FROM billing_history WHERE organizer_id = $1', [id]);

      // 8. Delete user registrations from ALL tournaments
      await pool.query('DELETE FROM tournament_registrations WHERE user_id = $1', [id]);

      // 9. First delete all tournament registrations, notices, messages of tournaments hosted by this organizer
      await pool.query('DELETE FROM tournament_registrations WHERE tournament_id IN (SELECT id FROM tournaments WHERE "orgId" = $1)', [id]);
      await pool.query('DELETE FROM tournament_notices WHERE tournament_id IN (SELECT id FROM tournaments WHERE "orgId" = $1)', [id]);
      await pool.query('DELETE FROM tournament_messages WHERE tournament_id IN (SELECT id FROM tournaments WHERE "orgId" = $1)', [id]);

      // 10. Delete all tournaments hosted by this organizer
      await pool.query('DELETE FROM tournaments WHERE "orgId" = $1', [id]);

      // 11. Delete primary user record from public.users table
      await pool.query('DELETE FROM users WHERE id = $1', [id]);

      console.log(`\n📦 [MATCH DISTRICT DB] User "${id}" and all associated data completely purged from database.\n`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: `User ${id} and all associated data purged successfully.` }));
    } catch (err) {
      console.warn('⚠️ [MATCH DISTRICT DB] Supabase delete user failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (urlPath.startsWith('/api/users/') && req.method === 'PUT') {
    const id = urlPath.split('/api/users/')[1];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }

        // Fetch authenticated user's database record to verify permissions
        const authUserRes = await pool.query('SELECT id, uid, role FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (authUserRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'USER_NOT_FOUND', message: 'Authenticated user profile not found.' }));
          return;
        }
        const authUserRecord = authUserRes.rows[0];

        if (!hasRole(authUserRecord, ROLES.ADMIN) && authUserRecord.id !== id && authUserRecord.uid !== id) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You do not have permission to modify this user profile.' }));
          return;
        }

        const updateData = JSON.parse(body);

        // Prevent modifying email or username (gamerTag) for organisers (admins exempt)
        if (!hasRole(authUserRecord, ROLES.ADMIN) && hasRole(authUserRecord, ROLES.ORGANISER)) {
          if (updateData.email !== undefined || updateData.gamerTag !== undefined) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Organizers are not permitted to modify their account credentials (email/username).' }));
            return;
          }
        }

        // OTP verification for email change
        if (updateData.email !== undefined) {
          const userCheckRes = await pool.query('SELECT email, "email_last_changed" FROM users WHERE id = $1 OR uid = $1', [id]);
          const currentUserRecord = userCheckRes.rows[0];
          if (currentUserRecord && updateData.email.trim().toLowerCase() !== currentUserRecord.email.trim().toLowerCase()) {
            // Check 15 days rule:
            if (currentUserRecord.email_last_changed) {
              const lastChanged = new Date(currentUserRecord.email_last_changed);
              const daysDiff = (Date.now() - lastChanged.getTime()) / (1000 * 60 * 60 * 24);
              if (daysDiff < 15) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'COOLDOWN_ACTIVE', message: `You can only change your email address once every 15 days. Remaining: ${Math.ceil(15 - daysDiff)} days.` }));
                return;
              }
            }
            const otpCode = updateData.emailOtp;
            if (!otpCode) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'OTP_REQUIRED', message: 'Verification code is required to change your email address.' }));
              return;
            }
            const now = new Date();
            const otpRes = await pool.query('SELECT * FROM otps WHERE email = $1 AND otp = $2 AND expires_at > $3', [currentUserRecord.email, otpCode, now]);
            if (otpRes.rows.length === 0) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'INVALID_OTP', message: 'Verification code is incorrect or has expired.' }));
              return;
            }
            await pool.query('DELETE FROM otps WHERE email = $1', [currentUserRecord.email]);
          }
        }

        // OTP verification for username (gamerTag) change
        if (updateData.gamerTag !== undefined) {
          const userCheckRes = await pool.query('SELECT "gamerTag", email, "gamertag_last_changed" FROM users WHERE id = $1 OR uid = $1', [id]);
          const currentUserRecord = userCheckRes.rows[0];
          if (currentUserRecord && updateData.gamerTag !== currentUserRecord.gamerTag) {
            // Check 15 days rule:
            if (currentUserRecord.gamertag_last_changed) {
              const lastChanged = new Date(currentUserRecord.gamertag_last_changed);
              const daysDiff = (Date.now() - lastChanged.getTime()) / (1000 * 60 * 60 * 24);
              if (daysDiff < 15) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'COOLDOWN_ACTIVE', message: `You can only change your username once every 15 days. Remaining: ${Math.ceil(15 - daysDiff)} days.` }));
                return;
              }
            }

            const otpCode = updateData.otp;
            if (!otpCode) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'OTP_REQUIRED', message: 'Verification code is required to change your username/handle.' }));
              return;
            }
            const now = new Date();
            const otpRes = await pool.query('SELECT * FROM otps WHERE email = $1 AND otp = $2 AND expires_at > $3', [currentUserRecord.email, otpCode, now]);
            if (otpRes.rows.length === 0) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'INVALID_OTP', message: 'Verification code is incorrect or has expired.' }));
              return;
            }
            // Consume the OTP
            await pool.query('DELETE FROM otps WHERE email = $1', [currentUserRecord.email]);
          }
        }

        const avatarUrl = sanitizeImageUrlForDb(updateData.avatar);
        const bannerUrl = sanitizeImageUrlForDb(updateData.banner);

        let gamertagLastChangedVal = undefined;
        if (updateData.gamerTag !== undefined) {
          const userCheckRes = await pool.query('SELECT "gamerTag" FROM users WHERE id = $1 OR uid = $1', [id]);
          if (userCheckRes.rows[0] && userCheckRes.rows[0].gamerTag !== updateData.gamerTag) {
            gamertagLastChangedVal = new Date();
          }
        }

        let emailLastChangedVal = undefined;
        if (updateData.email !== undefined) {
          const userCheckRes = await pool.query('SELECT email FROM users WHERE id = $1 OR uid = $1', [id]);
          if (userCheckRes.rows[0] && userCheckRes.rows[0].email.trim().toLowerCase() !== updateData.email.trim().toLowerCase()) {
            emailLastChangedVal = new Date();
          }
        }

        const dbRes = await pool.query(
          `UPDATE users SET 
            name = COALESCE($1, name),
            "gamerTag" = COALESCE($2, "gamerTag"),
            email = COALESCE($3, email),
            phone = COALESCE($4, phone),
            avatar = COALESCE($5, avatar),
            experience = COALESCE($6, experience),
            "socialLinks" = COALESCE($7, "socialLinks"),
            tier = COALESCE($8, tier),
            status = COALESCE($9, status),
            "riotId" = COALESCE($10, "riotId"),
            "bgmiId" = COALESCE($11, "bgmiId"),
            "steamId" = COALESCE($12, "steamId"),
            "discordTag" = COALESCE($13, "discordTag"),
            banner = COALESCE($14, banner),
            "gamertag_last_changed" = COALESCE($15, "gamertag_last_changed"),
            "email_last_changed" = COALESCE($16, "email_last_changed"),
            role = COALESCE($17, role),
            roles = COALESCE($18, roles),
            "orgHandle" = COALESCE($20, "orgHandle")
           WHERE (id = $19 OR uid = $19) RETURNING *`,
          [
            updateData.name,
            updateData.gamerTag,
            updateData.email,
            updateData.phone,
            avatarUrl,
            updateData.experience !== undefined ? updateData.experience : updateData.bio,
            updateData.socialLinks,
            updateData.tier,
            updateData.status,
            updateData.riotId !== undefined ? updateData.riotId : null,
            updateData.bgmiId !== undefined ? updateData.bgmiId : null,
            updateData.steamId !== undefined ? updateData.steamId : null,
            updateData.discordTag !== undefined ? updateData.discordTag : null,
            bannerUrl,
            gamertagLastChangedVal,
            emailLastChangedVal,
            updateData.role,
            updateData.role ? (
              updateData.role === 'player' || updateData.role === 'user' ? ['user'] :
              updateData.role === 'organiser' ? ['user', 'organiser'] :
              updateData.role === 'reg_payment_verifier' ? ['user', 'reg_payment_verifier'] :
              updateData.role === 'admin' ? ['user', 'admin'] : ['user']
            ) : undefined,
            id,
            updateData.gamerTag
          ]
        );
        if (dbRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'USER_NOT_FOUND', message: 'User profile to update not found.' }));
          return;
        }
        console.log(`\n📦 [MATCH DISTRICT DB] User "${id}" updated in Supabase PostgreSQL.\n`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, user: publicUserRow(dbRes.rows[0]) }));
      } catch (err) {
        console.warn('⚠️ [MATCH DISTRICT DB] Supabase update user failed:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 7e. Supabase Get All Tournaments Service
  if (urlPath === '/api/tournaments' && req.method === 'GET') {
    try {
      const dbRes = await pool.query(`
        SELECT t.*, u.tier AS "orgTier", u."orgName" AS "userOrgName", u."orgImage" AS "userOrgImage", u.name AS "userName"
        FROM tournaments t
        LEFT JOIN users u ON t."orgId" = u.id
        WHERE (t."isDraft" = false OR t."isDraft" IS NULL)
        ORDER BY t.created_at DESC
      `);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const normalized = (dbRes.rows || []).map((r) => {
        // Compute sponsor contributions from sponsors_data
        let sponsorRevenue = 0;
        let hasApprovedSponsors = false;
        try {
          const sd = typeof r.sponsors_data === 'string' ? JSON.parse(r.sponsors_data) : (r.sponsors_data || []);
          if (Array.isArray(sd)) {
            const approved = sd.filter(s => s.status === 'approved');
            sponsorRevenue = approved.reduce((sum, s) => sum + (parseInt(s.amount) || 0), 0);
            hasApprovedSponsors = approved.length > 0;
          }
        } catch {}
        const basePrize = parseInt(r.prize_pool_amount) || 0;
        const totalPrize = basePrize + sponsorRevenue;
        return {
          ...r,
          cover_image_url: r.cover_image_url || '',
          orgName: r.orgName || r.userOrgName || r.userName || 'Match District Organizer',
          orgLogo: r.orgLogo || r.userOrgImage || '',
          sponsorRevenue,
          hasApprovedSponsors,
          basePrize,
          totalPrize,
          prize: (() => {
            if (r.prize && r.prize.startsWith('\u20B9') && !hasApprovedSponsors) return r.prize;
            if (totalPrize > 0) return `\u20B9${totalPrize.toLocaleString('en-IN')}`;
            if (r.prize && r.prize !== 'TBD' && r.prize !== 'TBA') return r.prize;
            return 'TBD';
          })(),
        };
      });
      res.end(JSON.stringify({ success: true, tournaments: normalized }));
    } catch (err) {
      console.warn('⚠️ [MATCH DISTRICT DB] Supabase fetch tournaments failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7e-1. Supabase Get Single Tournament Service
  const singleTournamentMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)$/);
  if (singleTournamentMatch && req.method === 'GET') {
    const id = decodeURIComponent(singleTournamentMatch[1]);
    try {
      const dbRes = await pool.query(`
        SELECT t.*, u.tier AS "orgTier", u."orgName" AS "userOrgName", u."orgImage" AS "userOrgImage", u.name AS "userName"
        FROM tournaments t
        LEFT JOIN users u ON t."orgId" = u.id
        WHERE t.id = $1
      `, [id]);
      if (dbRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        return;
      }
      const row = dbRes.rows[0];

      // Block draft access for non-owners (drafts should only be visible to the organizer)
      if (row.isDraft) {
        const authUser = getAuthUser(req);
        if (!authUser || (authUser.id !== row.orgId && !hasRole(authUser, ROLES.ADMIN))) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }
      }

      row.orgName = row.orgName || row.userOrgName || row.userName || 'Match District Organizer';
      row.orgLogo = row.orgLogo || row.userOrgImage || '';
      delete row.userOrgName;
      delete row.userOrgImage;
      delete row.userName;
      // Compute sponsor contributions
      let sponsorRevenue = 0;
      let hasApprovedSponsors = false;
      try {
        const sd = typeof row.sponsors_data === 'string' ? JSON.parse(row.sponsors_data) : (row.sponsors_data || []);
        if (Array.isArray(sd)) {
          const approved = sd.filter(s => s.status === 'approved');
          sponsorRevenue = approved.reduce((sum, s) => sum + (parseInt(s.amount) || 0), 0);
          hasApprovedSponsors = approved.length > 0;
        }
      } catch {}
      row.sponsorRevenue = sponsorRevenue;
      row.hasApprovedSponsors = hasApprovedSponsors;
      row.basePrize = parseInt(row.prize_pool_amount) || 0;
      row.totalPrize = row.basePrize + sponsorRevenue;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, tournament: row }));
    } catch (err) {
      console.warn('⚠️ [MATCH DISTRICT DB] Supabase fetch tournament failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7f. Supabase Create Tournament Service
  if (urlPath === '/api/tournaments' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in.' }));
          return;
        }

        const t = JSON.parse(body);
        const slotsTotal = t.slotsTotal !== undefined ? parseInt(t.slotsTotal) : 100;

        // ── ADMIN PATH: Full bypass, instant live state ──
        if (hasRole(authUser, ROLES.ADMIN)) {
          if (!t.title || t.title.length < 5 || t.title.length > 100) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'Title must be 5-100 characters.' }));
            return;
          }
          if (!t.game) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'Game selection is required.' }));
            return;
          }
          const adminMatchType = (t.match_type || 'squad').toLowerCase();
          if (!['solo', 'duo', 'squad'].includes(adminMatchType)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'Match type must be solo, duo, or squad.' }));
            return;
          }
          const floors = { solo: 50, duo: 25, squad: 13 };
          const ceilings = { solo: 100, duo: 50, squad: 25 };
          const ceiling = ceilings[adminMatchType] || 25;
          const adminSlotsTotal = slotsTotal < 2 ? 100 : slotsTotal;
          let maxSlotsPerRoom = t.max_slots_per_room !== undefined && t.max_slots_per_room !== null && t.max_slots_per_room !== ''
            ? parseInt(t.max_slots_per_room) : ceiling;
          if (maxSlotsPerRoom > ceiling) maxSlotsPerRoom = ceiling;
          if (maxSlotsPerRoom < (floors[adminMatchType] || 13)) maxSlotsPerRoom = floors[adminMatchType] || 13;
          const numRooms = Math.ceil(adminSlotsTotal / maxSlotsPerRoom);
          const tournamentId = `TRN-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          const now = new Date();
          const prizePoolAmount = parseInt(t.prize_pool_amount) || 0;
          const entryFeeAmount = parseInt(t.entry_fee_amount) || 0;
          const prizeDisplay = prizePoolAmount > 0 ? `₹${prizePoolAmount.toLocaleString('en-IN')}` : '';
          const entryDisplay = entryFeeAmount > 0 ? `₹${entryFeeAmount}` : 'Free';
          const regOpen = t.registrationOpenDate || now.toISOString().slice(0, 16);
          const regClose = t.registrationCloseDate || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
          const startDate = t.startDate || new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);

          const dbRes = await pool.query(
            `INSERT INTO tournaments (
              id, title, game, status, "badgeBg", "badgeText", date, prize, entry, "teamsCount", featured, "orgName",
              "orgLogo", "orgHandle", "orgMotto",
              "registrationOpenDate", "registrationCloseDate", "startDate",
              rules, chat, notices, teams, region, format, "slotsTotal", "slotsFilled", "roomID", "roomPassword",
              timeline, "bannerUrl", "logoUrl", "isDraft", version, "orgId",
              match_type, perspective, reserved_slots, entry_fee_amount, prize_pool_type, prize_pool_amount,
              prize_split_1st, prize_split_2nd, prize_split_3rd, prize_split_mvp, description, cover_image_url,
              lobby_start_time, mvp_enabled, mvp_amount, kill_reward_enabled, kill_reward_per_kill, prize_positions,
              sponsors_enabled, max_slots_per_room
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
              $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
              $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54)
            RETURNING *`,
            [
              tournamentId, t.title, t.game, 'live', 'bg-primary', 'LIVE', now.toISOString(),
              prizeDisplay, entryDisplay, '', true, 'Match District', '', 'matchdistrict', 'Admin Hosted',
              regOpen, regClose, startDate,
              t.rules ? (typeof t.rules === 'string' ? t.rules : JSON.stringify(t.rules)) : '[]',
              '[]', '[]', '[]', t.region || 'India', t.format || adminMatchType.toUpperCase(),
              adminSlotsTotal, 0, t.roomID || '', t.roomPassword || '',
              t.timeline ? (typeof t.timeline === 'string' ? t.timeline : JSON.stringify(t.timeline)) : '[]',
              t.bannerUrl || (t.cover_image_url || ''), '', false, 1, authUser.id,
              adminMatchType, t.perspective || 'tpp', parseInt(t.reserved_slots) || 0, entryFeeAmount,
              prizePoolAmount > 0 ? 'fixed' : 'dynamic', prizePoolAmount,
              t.prize_split_1st || '', t.prize_split_2nd || '', t.prize_split_3rd || '', t.prize_split_mvp || '',
              t.description || '', t.cover_image_url || '', t.lobby_start_time || '',
              t.mvp_enabled || false, t.mvp_amount ? parseInt(t.mvp_amount) : 0,
              t.kill_reward_enabled || false, t.kill_reward_per_kill ? parseInt(t.kill_reward_per_kill) : 0,
              t.prize_positions || '[]', t.sponsors_enabled || false, maxSlotsPerRoom
            ]
          );
          const createdTournament = dbRes.rows[0];
          try {
            const slotInserts = [];
            for (let r = 0; r < numRooms; r++) {
              const slotsInThisRoom = r < numRooms - 1 ? maxSlotsPerRoom : adminSlotsTotal - r * maxSlotsPerRoom;
              for (let s = 0; s < slotsInThisRoom; s++) {
                slotInserts.push(`('SG-${tournamentId}-R${r}-S${s}', '${tournamentId}', ${r}, ${s}, 'empty', NULL, CURRENT_TIMESTAMP)`);
              }
            }
            for (let i = 0; i < slotInserts.length; i += 500) {
              await pool.query(
                `INSERT INTO slot_grid (id, tournament_id, room_index, slot_index, status, registration_id, created_at) VALUES ${slotInserts.slice(i, i + 500).join(', ')} ON CONFLICT (tournament_id, room_index, slot_index) DO NOTHING`
              );
            }
          } catch (sgErr) { /* slot_grid non-critical */ }
          try {
            await pool.query(
              `INSERT INTO admin_action_log (id, admin_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5, $6)`,
              ['LOG-' + crypto.randomBytes(4).toString('hex').toUpperCase(), authUser.id,
               'admin_create_tournament', 'tournament', tournamentId,
               JSON.stringify({ title: t.title, game: t.game, slotsTotal: adminSlotsTotal, maxSlotsPerRoom, numRooms })]
            );
          } catch (logErr) { /* non-critical */ }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, tournament: createdTournament }));
          return;
        }

        // ── ORGANIZER PATH: Standard verification ──
        if (!requireOrganizer(req, res, authUser)) return;
        const isApproved = await requireApprovedOrganizer(req, res, authUser, pool);
        if (!isApproved) return;

        const isDraft = t.isDraft !== false; // default to draft if not specified

        // Fetch user's organization data (never trust client-supplied values)
        const orgUserRes = await pool.query(
          `SELECT "orgName", "orgHandle", "orgImage", "orgMotto", name, avatar, tier FROM users WHERE id = $1`,
          [authUser.id]
        );
        const orgUserRow = orgUserRes.rows[0] || {};
        const orgName = orgUserRow.orgName || '';
        const orgLogo = orgUserRow.orgImage || orgUserRow.avatar || '';
        const orgHandle = orgUserRow.orgHandle || '';
        const orgMotto = orgUserRow.orgMotto || '';

        // Block publishing without an organization profile (admins bypass)
        if (!hasRole(authUser, ROLES.ADMIN) && !isDraft && !orgUserRow.orgName) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'NO_ORG',
            message: 'You must create and activate an organization profile before publishing tournaments.'
          }));
          return;
        }

        // Check plan limits (admins bypass)
        const limitCheck = await checkPlanLimits(pool, authUser.id, slotsTotal, isDraft);
        if (!hasRole(authUser, ROLES.ADMIN) && !limitCheck.allowed) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'LIMIT_EXCEEDED', message: limitCheck.error }));
          return;
        }

        // Plan gate sponsors_enabled — only Basic/Pro can enable
        if (!hasRole(authUser, ROLES.ADMIN) && t.sponsors_enabled && !limitCheck.plan.sponsorSections) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Sponsor Contributions require the Basic plan or higher.', requiredPlan: 'Basic' }));
          return;
        }

        // Validate max_slots_per_room against floor constraint
        if (t.max_slots_per_room !== undefined && t.max_slots_per_room !== null && t.max_slots_per_room !== '') {
          const matchType = (t.match_type || 'squad').toLowerCase();
          const floors = { solo: 50, duo: 25, squad: 13 };
          const ceilings = { solo: 100, duo: 50, squad: 25 };
          const floor = floors[matchType] || 13;
          const ceiling = ceilings[matchType] || 25;
          const label = matchType.charAt(0).toUpperCase() + matchType.slice(1);
          const mVal = parseInt(t.max_slots_per_room);
          if (mVal > ceiling) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `${label} tournaments allow at most ${ceiling} slots per room.` }));
            return;
          }
          if (mVal < floor) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `Target capacity cannot be less than ${floor} teams for ${label} matches.` }));
            return;
          }
        }

        const dbRes = await pool.query(
          `INSERT INTO tournaments (
            id, title, game, status, "badgeBg", "badgeText", date, prize, entry, "teamsCount", featured, "orgName",
            "orgLogo", "orgHandle", "orgMotto",
            "registrationOpenDate", "registrationCloseDate", "startDate",
            rules, chat, notices, teams, region, format, "slotsTotal", "slotsFilled", "roomID", "roomPassword", timeline, "bannerUrl", "logoUrl", "isDraft", version, "orgId",
            match_type, perspective, reserved_slots, entry_fee_amount, prize_pool_type, prize_pool_amount,
            prize_split_1st, prize_split_2nd, prize_split_3rd, prize_split_mvp, description, cover_image_url, lobby_start_time,
            mvp_enabled, mvp_amount, kill_reward_enabled, kill_reward_per_kill, prize_positions, sponsors_enabled, max_slots_per_room
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31,
            $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54)
          ON CONFLICT (id) DO UPDATE SET
            status = COALESCE(EXCLUDED.status, tournaments.status),
            "isDraft" = COALESCE(EXCLUDED."isDraft", tournaments."isDraft"),
            title = COALESCE(EXCLUDED.title, tournaments.title),
            game = COALESCE(EXCLUDED.game, tournaments.game),
            "cover_image_url" = COALESCE(EXCLUDED."cover_image_url", tournaments."cover_image_url"),
            "startDate" = COALESCE(EXCLUDED."startDate", tournaments."startDate"),
            "registrationOpenDate" = COALESCE(EXCLUDED."registrationOpenDate", tournaments."registrationOpenDate"),
            "registrationCloseDate" = COALESCE(EXCLUDED."registrationCloseDate", tournaments."registrationCloseDate"),
            "slotsTotal" = COALESCE(EXCLUDED."slotsTotal", tournaments."slotsTotal"),
            "slotsFilled" = COALESCE(EXCLUDED."slotsFilled", tournaments."slotsFilled"),
            prize = COALESCE(EXCLUDED.prize, tournaments.prize),
            entry = COALESCE(EXCLUDED.entry, tournaments.entry),
            match_type = COALESCE(EXCLUDED.match_type, tournaments.match_type),
            perspective = COALESCE(EXCLUDED.perspective, tournaments.perspective),
            entry_fee_amount = COALESCE(EXCLUDED.entry_fee_amount, tournaments.entry_fee_amount),
            description = COALESCE(EXCLUDED.description, tournaments.description),
            max_slots_per_room = COALESCE(EXCLUDED.max_slots_per_room, tournaments.max_slots_per_room)
          RETURNING *`,
          [
            t.id || `TRN-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
            t.title || '',
            t.game || '',
            t.status || 'upcoming',
            t.badgeBg || (t.status === 'live' ? 'bg-error' : 'bg-primary'),
            t.badgeText || (t.status === 'live' ? 'LIVE NOW' : 'UPCOMING'),
            t.date || '',
            t.prize || '',
            t.entry || '',
            t.teamsCount || '',
            t.featured || false,
            orgName,
            orgLogo,
            orgHandle,
            orgMotto,
            t.registrationOpenDate || '',
            t.registrationCloseDate || '',
            t.startDate || '',
            t.rules ? (typeof t.rules === 'string' ? t.rules : JSON.stringify(t.rules)) : '[]',
            t.chat ? (typeof t.chat === 'string' ? t.chat : JSON.stringify(t.chat)) : '[]',
            t.notices ? (typeof t.notices === 'string' ? t.notices : JSON.stringify(t.notices)) : '[]',
            t.teams ? (typeof t.teams === 'string' ? t.teams : JSON.stringify(t.teams)) : '[]',
            t.region || '',
            t.format || '',
            slotsTotal,
            t.slotsFilled !== undefined ? parseInt(t.slotsFilled) : 0,
            t.roomID || '',
            t.roomPassword || '',
            t.timeline ? (typeof t.timeline === 'string' ? t.timeline : JSON.stringify(t.timeline)) : '[]',
            t.bannerUrl || '',
            t.logoUrl || '',
            isDraft,
            t.version !== undefined ? parseInt(t.version) : 1,
            authUser.id,
            t.match_type || 'squad',
            t.perspective || 'tpp',
            t.reserved_slots !== undefined ? parseInt(t.reserved_slots) : 0,
            t.entry_fee_amount !== undefined ? parseInt(t.entry_fee_amount) : 0,
            t.prize_pool_type || 'fixed',
            t.prize_pool_amount !== undefined ? parseInt(t.prize_pool_amount) : 0,
            t.prize_split_1st || '',
            t.prize_split_2nd || '',
            t.prize_split_3rd || '',
            t.prize_split_mvp || '',
            t.description || '',
            t.cover_image_url || '',
            t.lobby_start_time || '',
            t.mvp_enabled || false,
            t.mvp_amount !== undefined ? parseInt(t.mvp_amount) : 0,
            t.kill_reward_enabled || false,
            t.kill_reward_per_kill !== undefined ? parseInt(t.kill_reward_per_kill) : 0,
            t.prize_positions || '[]',
            t.sponsors_enabled !== undefined ? t.sponsors_enabled : false,
            t.max_slots_per_room !== undefined && t.max_slots_per_room !== null && t.max_slots_per_room !== '' ? parseInt(t.max_slots_per_room) : null
          ]
        );
        console.log(`\n📦 [MATCH DISTRICT DB] Tournament "${t.id}" created in Supabase PostgreSQL.\n`);
        const createdTournament = dbRes.rows[0];
        // Track analytics event
        try {
          await pool.query(
            `INSERT INTO analytics_events (id, organizer_id, event_type, event_data, tournament_id)
             VALUES ($1, $2, $3, $4, $5)`,
            ['AE-' + crypto.randomBytes(6).toString('hex').toUpperCase(), authUser.id, 'tournament_created',
            JSON.stringify({ title: t.title, game: t.game, slotsTotal, isDraft }), createdTournament.id]
          );
        } catch (aeErr) { /* analytics non-critical */ }
        if (!isDraft) {
          notifyFollowersOfTournament(createdTournament);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, tournament: createdTournament }));
      } catch (err) {
        console.warn('⚠️ [MATCH DISTRICT DB] Supabase create tournament failed:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 7g. Supabase Update Tournament Service
  if (req.url.startsWith('/api/tournaments/') && req.method === 'PUT' && !req.url.includes('/registrations/')) {
    const id = req.url.split('/api/tournaments/')[1];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in.' }));
          return;
        }

        const t = JSON.parse(body);

        // ── ADMIN PATH: Full bypass ──
        if (hasRole(authUser, ROLES.ADMIN)) {
          const existRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
          if (existRes.rows.length === 0) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
            return;
          }
          const existing = existRes.rows[0];

          // Admin is always allowed — force live + featured + Match District branding
          const slotsTotal = t.slotsTotal !== undefined ? parseInt(t.slotsTotal) : existing.slotsTotal;
          const prizePoolAmount = parseInt(t.prize_pool_amount) || existing.prize_pool_amount || 0;
          const entryFeeAmount = parseInt(t.entry_fee_amount) || existing.entry_fee_amount || 0;
          const prizeDisplay = prizePoolAmount > 0 ? `₹${prizePoolAmount.toLocaleString('en-IN')}` : existing.prize;
          const entryDisplay = entryFeeAmount > 0 ? `₹${entryFeeAmount}` : 'Free';

          // Validate title/game if present
          if (t.title !== undefined && (t.title.length < 5 || t.title.length > 100)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'Title must be 5-100 characters.' }));
            return;
          }

          const dbRes = await pool.query(
            `UPDATE tournaments SET
              title = COALESCE($1, title),
              game = COALESCE($2, game),
              status = $3,
              "badgeBg" = COALESCE($4, "badgeBg"),
              "badgeText" = COALESCE($5, "badgeText"),
              date = COALESCE($6, date),
              prize = COALESCE($7, prize),
              entry = COALESCE($8, entry),
              "teamsCount" = COALESCE($9, "teamsCount"),
              featured = true,
              "orgName" = 'Match District',
              "orgLogo" = COALESCE($10, "orgLogo"),
              "orgHandle" = 'matchdistrict',
              "orgMotto" = 'Admin Hosted',
              "registrationOpenDate" = COALESCE($11, "registrationOpenDate"),
              "registrationCloseDate" = COALESCE($12, "registrationCloseDate"),
              "startDate" = COALESCE($13, "startDate"),
              rules = COALESCE($14, rules),
              chat = COALESCE($15, chat),
              notices = COALESCE($16, notices),
              teams = COALESCE($17, teams),
              region = COALESCE($18, region),
              format = COALESCE($19, format),
              "slotsTotal" = COALESCE($20, "slotsTotal"),
              "slotsFilled" = COALESCE($21, "slotsFilled"),
              "roomID" = COALESCE($22, "roomID"),
              "roomPassword" = COALESCE($23, "roomPassword"),
              timeline = COALESCE($24, timeline),
              "bannerUrl" = COALESCE($25, "bannerUrl"),
              "logoUrl" = COALESCE($26, "logoUrl"),
              "isDraft" = false,
              version = COALESCE($27, version) + 1,
              "orgId" = COALESCE($28, "orgId"),
              match_type = COALESCE($29, match_type),
              perspective = COALESCE($30, perspective),
              reserved_slots = COALESCE($31, reserved_slots),
              entry_fee_amount = COALESCE($32, entry_fee_amount),
              prize_pool_type = COALESCE($33, prize_pool_type),
              prize_pool_amount = $34,
              prize_split_1st = COALESCE($35, prize_split_1st),
              prize_split_2nd = COALESCE($36, prize_split_2nd),
              prize_split_3rd = COALESCE($37, prize_split_3rd),
              prize_split_mvp = COALESCE($38, prize_split_mvp),
              description = COALESCE($39, description),
              cover_image_url = COALESCE($40, cover_image_url),
              lobby_start_time = COALESCE($41, lobby_start_time),
              mvp_enabled = COALESCE($42, mvp_enabled),
              mvp_amount = COALESCE($43, mvp_amount),
              kill_reward_enabled = COALESCE($44, kill_reward_enabled),
              kill_reward_per_kill = COALESCE($45, kill_reward_per_kill),
              prize_positions = COALESCE($46, prize_positions),
              sponsors_enabled = COALESCE($47, sponsors_enabled),
              max_slots_per_room = COALESCE($48, max_slots_per_room)
            WHERE id = $49 RETURNING *`,
            [
              t.title || null,
              t.game || null,
              'live',
              t.badgeBg || null,
              'LIVE',
              t.date || null,
              prizeDisplay,
              entryDisplay,
              t.teamsCount || null,
              t.orgLogo || null,
              t.registrationOpenDate || null,
              t.registrationCloseDate || null,
              t.startDate || null,
              t.rules ? (typeof t.rules === 'string' ? t.rules : JSON.stringify(t.rules)) : null,
              t.chat || null,
              t.notices || null,
              t.teams || null,
              t.region || null,
              t.format || null,
              slotsTotal,
              t.slotsFilled !== undefined ? parseInt(t.slotsFilled) : null,
              t.roomID || null,
              t.roomPassword || null,
              t.timeline ? (typeof t.timeline === 'string' ? t.timeline : JSON.stringify(t.timeline)) : null,
              t.bannerUrl || null,
              t.logoUrl || null,
              t.version !== undefined ? parseInt(t.version) : null,
              authUser.id,
              t.match_type || null,
              t.perspective || null,
              t.reserved_slots !== undefined ? parseInt(t.reserved_slots) : null,
              entryFeeAmount,
              t.prize_pool_type || null,
              prizePoolAmount,
              t.prize_split_1st || null,
              t.prize_split_2nd || null,
              t.prize_split_3rd || null,
              t.prize_split_mvp || null,
              t.description || null,
              t.cover_image_url || null,
              t.lobby_start_time || null,
              t.mvp_enabled !== undefined ? t.mvp_enabled : null,
              t.mvp_amount !== undefined ? parseInt(t.mvp_amount) : null,
              t.kill_reward_enabled !== undefined ? t.kill_reward_enabled : null,
              t.kill_reward_per_kill !== undefined ? parseInt(t.kill_reward_per_kill) : null,
              t.prize_positions || null,
              t.sponsors_enabled !== undefined ? t.sponsors_enabled : null,
              t.max_slots_per_room !== undefined && t.max_slots_per_room !== null && t.max_slots_per_room !== '' ? parseInt(t.max_slots_per_room) : null,
              id
            ]
          );
          const updated = dbRes.rows[0];
          // Attempt slot_grid init for admin path (non-critical)
          try {
            await pool.query(`DELETE FROM slot_grid WHERE tournament_id = $1`, [id]);
            const matchType = (t.match_type || existing.match_type || 'squad').toLowerCase();
            const ceilings = { solo: 100, duo: 50, squad: 25 };
            const maxPerRoom = ceilings[matchType] || 25;
            const numRooms = Math.ceil(slotsTotal / maxPerRoom);
            const slotInserts = [];
            for (let r = 0; r < numRooms; r++) {
              const slotsInThisRoom = r < numRooms - 1 ? maxPerRoom : slotsTotal - r * maxPerRoom;
              for (let s = 0; s < slotsInThisRoom; s++) {
                slotInserts.push(`('SG-${id}-R${r}-S${s}', '${id}', ${r}, ${s}, 'empty', NULL, CURRENT_TIMESTAMP)`);
              }
            }
            for (let i = 0; i < slotInserts.length; i += 500) {
              await pool.query(`INSERT INTO slot_grid (id, tournament_id, room_index, slot_index, status, registration_id, created_at) VALUES ${slotInserts.slice(i, i + 500).join(', ')} ON CONFLICT (tournament_id, room_index, slot_index) DO NOTHING`);
            }
          } catch (sgErr) { /* slot_grid non-critical */ }
          try {
            await pool.query(
              `INSERT INTO admin_action_log (id, admin_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5, $6)`,
              ['LOG-' + crypto.randomBytes(4).toString('hex').toUpperCase(), authUser.id,
               'admin_update_tournament', 'tournament', id,
               JSON.stringify({ title: t.title || existing.title, game: t.game || existing.game })]
            );
          } catch (logErr) { /* non-critical */ }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, tournament: updated }));
          return;
        }

        // ── ORGANIZER PATH: Standard verification ──
        if (!requireOrganizer(req, res, authUser)) return;
        const isApproved = await requireApprovedOrganizer(req, res, authUser, pool);
        if (!isApproved) return;

        // Fetch existing tournament
        const existRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
        if (existRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }
        const existing = existRes.rows[0];

        // Authorization check: User must be the original organizer
        if (existing.orgId !== authUser.id) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You do not have permission to modify this tournament.' }));
          return;
        }

        // Fetch user's organization data for orgName/orgLogo (never trust client-supplied values)
        const orgUserRes = await pool.query(
          `SELECT "orgName", "orgHandle", "orgImage", "orgMotto", name, avatar FROM users WHERE id = $1`,
          [authUser.id]
        );
        const orgUserRow = orgUserRes.rows[0] || {};
        t.orgName = orgUserRow.orgName || t.orgName || '';
        t.orgLogo = orgUserRow.orgImage || orgUserRow.avatar || '';
        t.orgHandle = orgUserRow.orgHandle || '';
        t.orgMotto = orgUserRow.orgMotto || '';

        // Block publishing without an organization profile (admins bypass)
        const newIsDraftPublish = t.isDraft !== undefined ? t.isDraft : existing.isDraft;
        if (!hasRole(authUser, ROLES.ADMIN) && !newIsDraftPublish && existing.isDraft === true && !orgUserRow.orgName) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'NO_ORG',
            message: 'You must create and activate an organization profile before publishing tournaments.'
          }));
          return;
        }

        // If trying to publish or modify slots total, validate plan limits
        const newSlotsTotal = t.slotsTotal !== undefined ? parseInt(t.slotsTotal) : existing.slotsTotal;
        const newIsDraft = t.isDraft !== undefined ? t.isDraft : existing.isDraft;

        if ((newIsDraft === false && existing.isDraft === true) || (t.slotsTotal !== undefined && parseInt(t.slotsTotal) !== existing.slotsTotal)) {
          const limitCheck = await checkPlanLimits(pool, existing.orgId || authUser.id, newSlotsTotal, newIsDraft, id);
          if (!hasRole(authUser, ROLES.ADMIN) && !limitCheck.allowed) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'LIMIT_EXCEEDED', message: limitCheck.error }));
            return;
          }
        }

        // Plan gate sponsors_enabled (admins bypass)
        if (!hasRole(authUser, ROLES.ADMIN) && t.sponsors_enabled) {
          const planCheck = await checkPlanLimits(pool, existing.orgId || authUser.id, 0, true, id);
          if (!planCheck.plan.sponsorSections) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Sponsor Contributions require the Basic plan or higher.' }));
            return;
          }
        }

        // Validate max_slots_per_room against floor constraint
        if (t.max_slots_per_room !== undefined && t.max_slots_per_room !== null && t.max_slots_per_room !== '') {
          const matchType = (t.match_type || existing.match_type || 'squad').toLowerCase();
          const floors = { solo: 50, duo: 25, squad: 13 };
          const ceilings = { solo: 100, duo: 50, squad: 25 };
          const floor = floors[matchType] || 13;
          const ceiling = ceilings[matchType] || 25;
          const label = matchType.charAt(0).toUpperCase() + matchType.slice(1);
          const mVal = parseInt(t.max_slots_per_room);
          if (mVal > ceiling) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `${label} tournaments allow at most ${ceiling} slots per room.` }));
            return;
          }
          if (mVal < floor) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `Target capacity cannot be less than ${floor} teams for ${label} matches.` }));
            return;
          }
        }

        const dbRes = await pool.query(
          `UPDATE tournaments SET
            title = COALESCE($1, title),
            game = COALESCE($2, game),
            status = COALESCE($3, status),
            "badgeBg" = COALESCE($4, "badgeBg"),
            "badgeText" = COALESCE($5, "badgeText"),
            date = COALESCE($6, date),
            prize = COALESCE($7, prize),
            entry = COALESCE($8, entry),
            "teamsCount" = COALESCE($9, "teamsCount"),
            featured = COALESCE($10, featured),
            "orgName" = COALESCE($11, "orgName"),
            "orgLogo" = COALESCE($12, "orgLogo"),
            "orgHandle" = COALESCE($13, "orgHandle"),
            "orgMotto" = COALESCE($14, "orgMotto"),
            "registrationOpenDate" = COALESCE($15, "registrationOpenDate"),
            "registrationCloseDate" = COALESCE($16, "registrationCloseDate"),
            "startDate" = COALESCE($17, "startDate"),
            rules = COALESCE($18, rules),
            chat = COALESCE($19, chat),
            notices = COALESCE($20, notices),
            teams = COALESCE($21, teams),
            region = COALESCE($22, region),
            format = COALESCE($23, format),
            "slotsTotal" = COALESCE($24, "slotsTotal"),
            "slotsFilled" = COALESCE($25, "slotsFilled"),
            "roomID" = COALESCE($26, "roomID"),
            "roomPassword" = COALESCE($27, "roomPassword"),
            timeline = COALESCE($28, timeline),
            "bannerUrl" = COALESCE($29, "bannerUrl"),
            "logoUrl" = COALESCE($30, "logoUrl"),
            "isDraft" = COALESCE($31, "isDraft"),
            version = COALESCE($32, version),
            match_type = COALESCE($33, match_type),
            perspective = COALESCE($34, perspective),
            reserved_slots = COALESCE($35, reserved_slots),
            entry_fee_amount = COALESCE($36, entry_fee_amount),
            prize_pool_type = COALESCE($37, prize_pool_type),
            prize_pool_amount = COALESCE($38, prize_pool_amount),
            prize_split_1st = COALESCE($39, prize_split_1st),
            prize_split_2nd = COALESCE($40, prize_split_2nd),
            prize_split_3rd = COALESCE($41, prize_split_3rd),
            prize_split_mvp = COALESCE($42, prize_split_mvp),
            description = COALESCE($43, description),
            cover_image_url = COALESCE($44, cover_image_url),
            lobby_start_time = COALESCE($45, lobby_start_time),
            mvp_enabled = COALESCE($46, mvp_enabled),
            mvp_amount = COALESCE($47, mvp_amount),
            kill_reward_enabled = COALESCE($48, kill_reward_enabled),
            kill_reward_per_kill = COALESCE($49, kill_reward_per_kill),
            prize_positions = COALESCE($50, prize_positions),
            sponsors_enabled = COALESCE($51, sponsors_enabled),
            max_slots_per_room = COALESCE($52, max_slots_per_room)
           WHERE id = $53 RETURNING *`,
          [
            t.title !== undefined ? t.title : null,
            t.game !== undefined ? t.game : null,
            t.status !== undefined ? t.status : null,
            t.badgeBg !== undefined ? t.badgeBg : null,
            t.badgeText !== undefined ? t.badgeText : null,
            t.date !== undefined ? t.date : null,
            t.prize !== undefined ? t.prize : null,
            t.entry !== undefined ? t.entry : null,
            t.teamsCount !== undefined ? t.teamsCount : null,
            t.featured !== undefined ? t.featured : null,
            t.orgName !== undefined ? t.orgName : null,
            t.orgLogo !== undefined ? t.orgLogo : null,
            t.orgHandle !== undefined ? t.orgHandle : null,
            t.orgMotto !== undefined ? t.orgMotto : null,
            t.registrationOpenDate !== undefined ? t.registrationOpenDate : null,
            t.registrationCloseDate !== undefined ? t.registrationCloseDate : null,
            t.startDate !== undefined ? t.startDate : null,
            t.rules !== undefined ? (typeof t.rules === 'string' ? t.rules : JSON.stringify(t.rules)) : null,
            t.chat !== undefined ? (typeof t.chat === 'string' ? t.chat : JSON.stringify(t.chat)) : null,
            t.notices !== undefined ? (typeof t.notices === 'string' ? t.notices : JSON.stringify(t.notices)) : null,
            t.teams !== undefined ? (typeof t.teams === 'string' ? t.teams : JSON.stringify(t.teams)) : null,
            t.region !== undefined ? t.region : null,
            t.format !== undefined ? t.format : null,
            t.slotsTotal !== undefined ? parseInt(t.slotsTotal) : null,
            t.slotsFilled !== undefined ? parseInt(t.slotsFilled) : null,
            t.roomID !== undefined ? t.roomID : null,
            t.roomPassword !== undefined ? t.roomPassword : null,
            t.timeline !== undefined ? (typeof t.timeline === 'string' ? t.timeline : JSON.stringify(t.timeline)) : null,
            t.bannerUrl !== undefined ? t.bannerUrl : null,
            t.logoUrl !== undefined ? t.logoUrl : null,
            t.isDraft !== undefined ? t.isDraft : null,
            t.version !== undefined ? parseInt(t.version) : null,
            t.match_type !== undefined ? t.match_type : null,
            t.perspective !== undefined ? t.perspective : null,
            t.reserved_slots !== undefined ? parseInt(t.reserved_slots) : null,
            t.entry_fee_amount !== undefined ? parseInt(t.entry_fee_amount) : null,
            t.prize_pool_type !== undefined ? t.prize_pool_type : null,
            t.prize_pool_amount !== undefined ? parseInt(t.prize_pool_amount) : null,
            t.prize_split_1st !== undefined ? t.prize_split_1st : null,
            t.prize_split_2nd !== undefined ? t.prize_split_2nd : null,
            t.prize_split_3rd !== undefined ? t.prize_split_3rd : null,
            t.prize_split_mvp !== undefined ? t.prize_split_mvp : null,
            t.description !== undefined ? t.description : null,
            t.cover_image_url !== undefined ? t.cover_image_url : null,
            t.lobby_start_time !== undefined ? t.lobby_start_time : null,
            t.mvp_enabled !== undefined ? t.mvp_enabled : null,
            t.mvp_amount !== undefined ? parseInt(t.mvp_amount) : null,
            t.kill_reward_enabled !== undefined ? t.kill_reward_enabled : null,
            t.kill_reward_per_kill !== undefined ? parseInt(t.kill_reward_per_kill) : null,
            t.prize_positions !== undefined ? t.prize_positions : null,
            t.sponsors_enabled !== undefined ? t.sponsors_enabled : null,
            t.max_slots_per_room !== undefined && t.max_slots_per_room !== null && t.max_slots_per_room !== '' ? parseInt(t.max_slots_per_room) : null,
            id
          ]
        );
        console.log(`\n📦 [MATCH DISTRICT DB] Tournament "${id}" updated in Supabase PostgreSQL.\n`);
        const updatedTournament = dbRes.rows[0];
        if (updatedTournament.isDraft === false && existing.isDraft === true) {
          notifyFollowersOfTournament(updatedTournament);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, tournament: updatedTournament }));
      } catch (err) {
        console.warn('⚠️ [MATCH DISTRICT DB] Supabase update tournament failed:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 7h. Supabase Delete Tournament Service
  if (req.url.startsWith('/api/tournaments/') && req.method === 'DELETE') {
    const id = req.url.split('/api/tournaments/')[1];
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;

      const existRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
      if (existRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        return;
      }
      const existing = existRes.rows[0];

      if (!hasRole(authUser, ROLES.ADMIN) && existing.orgId !== authUser.id) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You do not have permission to delete this tournament.' }));
        return;
      }

      // Cascade delete registrations, notices, and messages associated with the tournament
      await pool.query('DELETE FROM tournament_registrations WHERE tournament_id = $1', [id]);
      await pool.query('DELETE FROM tournament_notices WHERE tournament_id = $1', [id]);
      await pool.query('DELETE FROM tournament_messages WHERE tournament_id = $1', [id]);

      await pool.query('DELETE FROM tournaments WHERE id = $1', [id]);
      console.log(`\n📦 [MATCH DISTRICT DB] Tournament "${id}" and associated records deleted from Supabase PostgreSQL.\n`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: `Tournament ${id} and all related registrations/notices/messages deleted successfully.` }));
    } catch (err) {
      console.warn('⚠️ [MATCH DISTRICT DB] Supabase delete tournament failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7i. Supabase Secure Lobby Coordinator endpoint
  if (req.url.startsWith('/api/tournaments/') && req.url.endsWith('/lobby') && req.method === 'GET') {
    const parts = req.url.split('/');
    const id = parts[3];
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in to access room details.' }));
        return;
      }

      const dbRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
      if (dbRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        return;
      }
      const t = dbRes.rows[0];

      let isAllowed = false;
      if (hasRole(authUser, ROLES.ADMIN) || t.orgId === authUser.id) {
        isAllowed = true;
      } else {
        const regRes = await pool.query(
          'SELECT * FROM tournament_registrations WHERE tournament_id = $1 AND user_id = $2 AND status = $3',
          [id, authUser.id, 'approved']
        );
        if (regRes.rows.length > 0) {
          isAllowed = true;
        }
      }

      if (isAllowed) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, roomID: t.roomID, roomPassword: t.roomPassword }));
      } else {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'ACCESS_LOCKED', message: 'Credentials will unlock automatically once your registration status is Approved.' }));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7j1. GET /api/organiser/tournaments — fetch all tournaments for the authenticated organizer
  if (urlPath === '/api/organiser/tournaments' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;
      const dbRes = await pool.query(`
        SELECT t.*,
          u.tier AS "orgTier", u."orgName" AS "userOrgName", u.name AS "userName",
          (SELECT COUNT(*) FROM tournament_registrations WHERE tournament_id = t.id) AS "registrationCount",
          (SELECT COALESCE(SUM(COALESCE(amount,0)),0) FROM sponsor_contributions WHERE tournament_id = t.id AND status = 'approved') AS "sponsorRevenue"
        FROM tournaments t
        LEFT JOIN users u ON t."orgId" = u.id
        WHERE t."orgId" = $1
        ORDER BY t.created_at DESC
      `, [authUser.id]);
      const tournaments = (dbRes.rows || []).map((r) => ({
        ...r,
        orgName: r.orgName || r.userOrgName || r.userName || 'Organizer',
        orgLogo: r.orgLogo || r.userOrgImage || '',
        registrationCount: parseInt(r.registrationCount) || 0,
        sponsorRevenue: parseFloat(r.sponsorRevenue) || 0,
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, tournaments }));
    } catch (err) {
      console.warn('⚠️ [MATCH DISTRICT DB] Fetch organiser tournaments failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7j2. POST /api/tournaments/:id/duplicate — duplicate a tournament
  const duplicateMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/duplicate$/);
  if (duplicateMatch && req.method === 'POST') {
    const srcId = duplicateMatch[1];
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;
      const srcRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [srcId]);
      if (srcRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        return;
      }
      const src = srcRes.rows[0];
      if (src.orgId !== authUser.id && !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You do not have permission to duplicate this tournament.' }));
        return;
      }
      const newId = `TRN-${Date.now().toString().slice(-4)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const dbRes = await pool.query(
        `INSERT INTO tournaments (
          id, title, game, status, "badgeBg", "badgeText", date, prize, entry, "teamsCount",
          featured, "orgName", "orgLogo", "orgHandle", "orgMotto",
          "registrationOpenDate", "registrationCloseDate", "startDate",
          rules, chat, notices, teams, region, format, "slotsTotal", "slotsFilled",
          "roomID", "roomPassword", timeline, "bannerUrl", "logoUrl", "isDraft", version, "orgId",
          match_type, perspective, reserved_slots, entry_fee_amount, prize_pool_type,
          prize_pool_amount, prize_split_1st, prize_split_2nd, prize_split_3rd,
          prize_split_mvp, description, cover_image_url, lobby_start_time,
          mvp_enabled, mvp_amount, kill_reward_enabled, kill_reward_per_kill,
          prize_positions, sponsors_enabled
        ) SELECT
          $1, title, game, 'draft', 'bg-primary', 'DRAFT', '', prize, entry, '0',
          false, "orgName", "orgLogo", "orgHandle", "orgMotto",
          '', '', '',
          rules, chat, notices, teams, region, format, "slotsTotal", 0,
          '', '', timeline, "bannerUrl", "logoUrl", true, 1, $2,
          match_type, perspective, reserved_slots, entry_fee_amount, prize_pool_type,
          prize_pool_amount, prize_split_1st, prize_split_2nd, prize_split_3rd,
          prize_split_mvp, description, cover_image_url, lobby_start_time,
          mvp_enabled, mvp_amount, kill_reward_enabled, kill_reward_per_kill,
          prize_positions, sponsors_enabled
        FROM tournaments WHERE id = $3 RETURNING *`,
        [newId, authUser.id, srcId]
      );
      const dup = dbRes.rows[0];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, tournament: dup }));
    } catch (err) {
      console.warn('⚠️ [MATCH DISTRICT DB] Duplicate tournament failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7j3. POST /api/tournaments/:id/archive — archive a tournament
  const archiveMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/archive$/);
  if (archiveMatch && req.method === 'POST') {
    const id = archiveMatch[1];
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;
      const existRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
      if (existRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        return;
      }
      if (existRes.rows[0].orgId !== authUser.id && !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You do not have permission to archive this tournament.' }));
        return;
      }
      await pool.query('UPDATE tournaments SET status = $1, "isDraft" = false WHERE id = $2', ['archived', id]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Tournament archived.' }));
    } catch (err) {
      console.warn('⚠️ [MATCH DISTRICT DB] Archive tournament failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7j4. POST /api/tournaments/:id/status — set tournament status (live/completed)
  const statusMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/status$/);
  if (statusMatch && req.method === 'POST') {
    const id = statusMatch[1];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in.' }));
          return;
        }
        const tRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
        if (tRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }
        const t = tRes.rows[0];
        // Only the tournament owner or admin can change status
        if (t.orgId !== authUser.id && !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You do not have permission to update this tournament.' }));
          return;
        }
        const bodyData = JSON.parse(body);
        const newStatus = (bodyData.status || '').toLowerCase();
        const currentStatus = (t.status || '').toLowerCase();

        // Validate transitions
        const LIVE_ALLOWED_FROM = ['upcoming', 'open', 'registration_open', 'closed', 'registration_closed'];
        if (newStatus === 'live') {
          if (currentStatus === 'live') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'ALREADY_LIVE', message: 'Tournament is already live.' }));
            return;
          }
          if (currentStatus === 'completed' || currentStatus === 'archived') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'CANNOT_MODIFY', message: 'Cannot modify a completed or archived tournament.' }));
            return;
          }
          if (t.isDraft) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'IS_DRAFT', message: 'Publish the tournament first.' }));
            return;
          }
          if (!LIVE_ALLOWED_FROM.includes(currentStatus)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'INVALID_TRANSITION', message: 'Tournament must be past registration closed state before going live.' }));
            return;
          }
        } else if (newStatus === 'completed') {
          if (currentStatus === 'completed') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'ALREADY_COMPLETED', message: 'Tournament is already completed.' }));
            return;
          }
          if (currentStatus === 'archived') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'CANNOT_MODIFY', message: 'Cannot modify an archived tournament.' }));
            return;
          }
          if (t.isDraft) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'IS_DRAFT', message: 'Publish the tournament first.' }));
            return;
          }
          if (currentStatus !== 'live') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'FINISH_LIVE_FIRST', message: 'Tournament must be live before marking completed.' }));
            return;
          }
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_STATUS', message: 'Invalid status. Use "live" or "completed".' }));
          return;
        }

        await pool.query('UPDATE tournaments SET status = $1 WHERE id = $2', [newStatus, id]);
        console.log(`\n🏆 [MATCH DISTRICT TOURNAMENT] Status updated: ${id} → ${newStatus} (by ${authUser.email})\n`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, status: newStatus, message: `Tournament marked as ${newStatus}.` }));
      } catch (err) {
        console.warn('⚠️ [MATCH DISTRICT DB] Status update failed:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 7j5. GET /api/tournaments/:id/analytics — get analytics for a tournament
  const analyticsMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/analytics$/);
  if (analyticsMatch && req.method === 'GET') {
    const id = analyticsMatch[1];
    try {
      const authUser = getAuthUser(req);
      const tRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
      if (tRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        return;
      }
      const t = tRes.rows[0];
      if (authUser && t.orgId !== authUser.id && !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Access denied.' }));
        return;
      }
      const regRes = await pool.query(
        `SELECT status, COUNT(*)::int AS count FROM tournament_registrations WHERE tournament_id = $1 GROUP BY status`,
        [id]
      );
      const sponsorRes = await pool.query(
        `SELECT COALESCE(SUM(COALESCE(amount,0)),0) AS total, COUNT(*)::int AS count FROM sponsor_contributions WHERE tournament_id = $1 AND status = 'approved'`,
        [id]
      );
      const statusCounts = { pending: 0, pending_payment: 0, confirmed: 0, approved: 0, waitlisted: 0, rejected: 0, cancelled: 0, expired: 0 };
      regRes.rows.forEach((r) => { statusCounts[r.status] = r.count; });
      const totalReg = Object.values(statusCounts).reduce((a, b) => a + b, 0);
      const slotsTotal = parseInt(t.slotsTotal) || 100;
      const slotsFilled = parseInt(t.slotsFilled) || 0;
      const entryFee = parseInt(t.entry_fee_amount) || 0;
      const baseRevenue = entryFee * totalReg;
      const sponsorTotal = parseFloat(sponsorRes.rows[0]?.total) || 0;
      const conversionRate = slotsTotal > 0 ? Math.round((slotsFilled / slotsTotal) * 100) : 0;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        analytics: {
          totalRegistrations: totalReg,
          statusBreakdown: statusCounts,
          totalRevenue: baseRevenue,
          sponsorContributions: sponsorTotal,
          prizePool: parseInt(t.prize_pool_amount) || 0,
          conversionRate,
          slotsTotal,
          slotsFilled,
          registrationProgress: slotsTotal > 0 ? Math.round((slotsFilled / slotsTotal) * 100) : 0,
        }
      }));
    } catch (err) {
      console.warn('⚠️ [MATCH DISTRICT DB] Analytics fetch failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7j. Supabase Register Team Service
  // === REGISTRATION SESSION ENDPOINTS ===

  // 7i_a. Create registration session (temporary, before payment)
  if (req.url.match(/^\/api\/sessions\/create\/([^\/]+)$/) && req.method === 'POST') {
    const tournamentId = req.url.split('/')[4];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in to register.' }));
          return;
        }

        const formData = JSON.parse(body);
        if (!formData.team_name || !formData.captain) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Team name and captain tag are required.' }));
          return;
        }

        // Check tournament exists and is open
        const tRes = await pool.query(
          'SELECT id, title, status, "slotsTotal", "slotsFilled", entry_fee_amount, "registrationCloseDate" FROM tournaments WHERE id = $1',
          [tournamentId]
        );
        if (tRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }
        const tournament = tRes.rows[0];

        // Validate tournament state
        if (tournament.status === 'archived' || tournament.status === 'completed') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_CLOSED', message: 'Tournament has ended.' }));
          return;
        }
        if (tournament.registrationCloseDate) {
          const raw = tournament.registrationCloseDate;
          const closeDate = /^\d{4}-\d{2}-\d{2}$/.test(raw)
            ? new Date(raw + 'T23:59:59.999Z')
            : new Date(raw);
          if (closeDate < new Date()) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'REGISTRATION_CLOSED', message: 'Registration for this tournament has closed.' }));
            return;
          }
        }
        if (tournament.slotsFilled >= tournament.slotsTotal) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FULL', message: 'All slots for this tournament are filled.' }));
          return;
        }

        // Check duplicate registration
        const dupRes = await pool.query(
          'SELECT id, status FROM tournament_registrations WHERE tournament_id = $1 AND user_id = $2',
          [tournamentId, authUser.id]
        );
        if (dupRes.rows.length > 0) {
          const currentStatus = dupRes.rows[0].status;
          const reRegisterable = ['cancelled', 'expired', 'rejected', 'PAYMENT_REJECTED'];
          if (!reRegisterable.includes(currentStatus)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'ALREADY_REGISTERED', message: 'You have already registered a team for this tournament.' }));
            return;
          }
        }

        // Check duplicate team name
        const nameRes = await pool.query(
          'SELECT id FROM tournament_registrations WHERE tournament_id = $1 AND LOWER(team_name) = LOWER($2) AND status NOT IN (\'cancelled\', \'expired\', \'rejected\', \'PAYMENT_REJECTED\')',
          [tournamentId, formData.team_name.trim()]
        );
        if (nameRes.rows.length > 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'TEAM_NAME_TAKEN', message: 'This team name is already registered.' }));
          return;
        }

        // Generate idempotency key for session
        const idempotencyKey = 'IK-' + crypto.randomBytes(12).toString('hex');

        // Clean up old active sessions for this user+tournament
        await pool.query(
          "DELETE FROM registration_sessions WHERE user_id = $1 AND tournament_id = $2 AND status = 'active'",
          [authUser.id, tournamentId]
        );

        // Create session
        const sessionId = 'SES-' + Date.now().toString().slice(-6) + '-' + crypto.randomBytes(4).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min expiry

        await pool.query(
          `INSERT INTO registration_sessions (id, tournament_id, user_id, form_data, idempotency_key, status, expires_at)
           VALUES ($1, $2, $3, $4, $5, 'active', $6)`,
          [sessionId, tournamentId, authUser.id, JSON.stringify(formData), idempotencyKey, expiresAt]
        );

        const entryFeeAmount = parseInt(tournament.entry_fee_amount) || 0;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          session: {
            id: sessionId,
            tournament_id: tournamentId,
            expires_at: expiresAt,
            requiresPayment: entryFeeAmount > 0,
            entry_fee_amount: entryFeeAmount
          }
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 7i_b. Get registration session data
  if (req.url.match(/^\/api\/sessions\/([^\/]+)$/) && req.method === 'GET') {
    const sessionId = req.url.split('/')[3];
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }

      const sesRes = await pool.query('SELECT * FROM registration_sessions WHERE id = $1 AND user_id = $2', [sessionId, authUser.id]);
      if (sesRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Session not found or expired.' }));
        return;
      }

      const session = sesRes.rows[0];

      // If session is expired by time, mark it
      if (session.status === 'active' && new Date(session.expires_at) < new Date()) {
        await pool.query("UPDATE registration_sessions SET status = 'expired' WHERE id = $1", [sessionId]);
        session.status = 'expired';
      }

      // For completed sessions, return success + registration info so the success page can be re-shown
      if (session.status === 'completed') {
        const regRes = await pool.query(
          'SELECT * FROM tournament_registrations WHERE tournament_id = $1 AND user_id = $2 AND idempotency_key = $3 LIMIT 1',
          [session.tournament_id, authUser.id, session.idempotency_key]
        );
        const tRes = await pool.query(
          'SELECT id, title, game, "cover_image_url", prize, entry, entry_fee_amount, "orgName", status, "slotsTotal", "slotsFilled" FROM tournaments WHERE id = $1',
          [session.tournament_id]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          completed: true,
          session: {
            id: session.id,
            tournament_id: session.tournament_id,
            form_data: JSON.parse(session.form_data),
            status: 'completed'
          },
          registration: regRes.rows[0] || null,
          tournament: tRes.rows[0] || null
        }));
        return;
      }

      if (session.status !== 'active') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'SESSION_EXPIRED', message: 'This session has already been used or expired.' }));
        return;
      }

      // Also fetch tournament data
      const tRes = await pool.query(
        'SELECT id, title, game, "cover_image_url", prize, entry, entry_fee_amount, "orgName", status, "slotsTotal", "slotsFilled" FROM tournaments WHERE id = $1',
        [session.tournament_id]
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        session: {
          id: session.id,
          tournament_id: session.tournament_id,
          form_data: JSON.parse(session.form_data),
          expires_at: session.expires_at,
          created_at: session.created_at
        },
        tournament: tRes.rows[0] || null
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7i_c. Combined register-and-pay endpoint (creates registration + payment_submission atomically)
  if (req.url.match(/^\/api\/sessions\/([^\/]+)\/complete$/) && req.method === 'POST') {
    const sessionId = req.url.split('/')[3];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      const client = await pool.connect();
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in to complete registration.' }));
          return;
        }

        const payload = JSON.parse(body);
        const idempotencyKey = payload.idempotency_key;

        // Verify session belongs to user and is active
        const sesRes = await client.query(
          'SELECT * FROM registration_sessions WHERE id = $1 AND user_id = $2',
          [sessionId, authUser.id]
        );
        if (sesRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Session not found.' }));
          client.release();
          return;
        }

        const session = sesRes.rows[0];
        if (session.status !== 'active') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SESSION_EXPIRED', message: 'This session has already been used.' }));
          client.release();
          return;
        }
        if (new Date(session.expires_at) < new Date()) {
          await client.query("UPDATE registration_sessions SET status = 'expired' WHERE id = $1", [sessionId]);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SESSION_EXPIRED', message: 'Session has expired. Please register again.' }));
          client.release();
          return;
        }

        // Idempotency check: if we've already processed this key, return existing result
        if (idempotencyKey) {
          const existingReg = await client.query(
            'SELECT * FROM tournament_registrations WHERE idempotency_key = $1',
            [idempotencyKey]
          );
          if (existingReg.rows.length > 0) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, registration: existingReg.rows[0], idempotent: true }));
            client.release();
            return;
          }
        }

        const formData = JSON.parse(session.form_data);

        // Verify tournament is still open
        const tRes = await client.query(
          'SELECT id, title, "slotsTotal", "slotsFilled", entry_fee_amount, "registrationCloseDate" FROM tournaments WHERE id = $1',
          [session.tournament_id]
        );
        if (tRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          client.release();
          return;
        }
        const tournament = tRes.rows[0];

        // Registration close date check (defense-in-depth)
        if (tournament.registrationCloseDate) {
          const raw = tournament.registrationCloseDate;
          const closeDate = /^\d{4}-\d{2}-\d{2}$/.test(raw)
            ? new Date(raw + 'T23:59:59.999Z')
            : new Date(raw);
          if (closeDate < new Date()) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'REGISTRATION_CLOSED', message: 'Registration for this tournament has closed.' }));
            client.release();
            return;
          }
        }

        // Optimistic slot check
        if (tournament.slotsFilled >= tournament.slotsTotal) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FULL', message: 'All slots are filled.' }));
          client.release();
          return;
        }

        const entryFeeAmount = parseInt(tournament.entry_fee_amount) || 0;
        const isPaid = entryFeeAmount > 0;

        await client.query('BEGIN');

        // Duplicate registration guard (within transaction)
        const dupGuard = await client.query(
          `SELECT id, status FROM tournament_registrations WHERE tournament_id = $1 AND user_id = $2`,
          [session.tournament_id, authUser.id]
        );
        if (dupGuard.rows.length > 0) {
          const reRegisterable = ['cancelled', 'expired', 'rejected', 'PAYMENT_REJECTED'];
          if (!reRegisterable.includes(dupGuard.rows[0].status)) {
            await client.query('ROLLBACK');
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'ALREADY_REGISTERED', message: 'You have already registered a team for this tournament.' }));
            client.release();
            return;
          }
        }

        // Create tournament registration
        const regId = 'REG-' + Date.now().toString().slice(-6) + '-' + crypto.randomBytes(4).toString('hex');
        const membersStr = formData.members ? (typeof formData.members === 'string' ? formData.members : JSON.stringify(formData.members)) : '[]';

        const status = isPaid ? (payload.screenshot_url ? 'pending' : 'pending_payment') : 'pending';

        const regRes = await client.query(
          `INSERT INTO tournament_registrations (id, tournament_id, user_id, team_name, captain, captain_uid, members, status, email, phone, idempotency_key, version, screenshot_url, transaction_id, payment_app)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, $12, $13, $14) RETURNING *`,
          [regId, session.tournament_id, authUser.id, formData.team_name, formData.captain, formData.captain_uid || null,
           membersStr, status, formData.email || null, formData.phone || null, idempotencyKey || null,
           payload.screenshot_url || null, payload.utr_number || null, payload.payment_app || null]
        );

        let paymentRecord = null;

        if (isPaid && payload.screenshot_url) {
          // Create payment submission record
          const payId = 'PAY-' + Date.now().toString().slice(-6) + '-' + crypto.randomBytes(4).toString('hex');
          const payIdempKey = idempotencyKey ? 'PAY-' + idempotencyKey : null;

          await client.query(
            `INSERT INTO payment_submissions (id, registration_id, tournament_id, user_id, amount, proof_url, utr_number, payment_app, payment_status, idempotency_key)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending_admin_review', $9)`,
            [payId, regId, session.tournament_id, authUser.id, entryFeeAmount,
             payload.screenshot_url, payload.utr_number || null, payload.payment_app || null, payIdempKey]
          );

          // Link payment to registration
          await client.query(
            'UPDATE tournament_registrations SET payment_id = $1 WHERE id = $2',
            [payId, regId]
          );

          paymentRecord = { id: payId, amount: entryFeeAmount, status: 'pending_admin_review' };
        }

        // Mark session as used
        await client.query(
          "UPDATE registration_sessions SET status = 'completed' WHERE id = $1",
          [sessionId]
        );

        await client.query('COMMIT');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          registration: regRes.rows[0],
          payment: paymentRecord,
          requiresPayment: isPaid
        }));
      } catch (err) {
        await client.query('ROLLBACK');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      } finally {
        client.release();
      }
    });
    return;
  }

  if (req.url.startsWith('/api/tournaments/') && req.url.endsWith('/register') && req.method === 'POST') {
    const parts = req.url.split('/');
    const id = parts[3];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in to register.' }));
          return;
        }

        const data = JSON.parse(body);
        if (!data.team_name || !data.captain) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Team name and captain tag are required.' }));
          return;
        }

        // Check if user is already registered for this tournament
        // Allow re-registration if previous attempt was rejected, cancelled, or expired
        const dupRes = await pool.query(
          "SELECT * FROM tournament_registrations WHERE tournament_id = $1 AND user_id = $2 AND status NOT IN ('rejected', 'cancelled', 'expired')",
          [id, authUser.id]
        );
        if (dupRes.rows.length > 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'ALREADY_REGISTERED', message: 'You have already registered a team for this tournament.' }));
          return;
        }

        const tRes = await pool.query('SELECT "slotsTotal", "slotsFilled", "entry_fee_amount", "registrationCloseDate" FROM tournaments WHERE id = $1', [id]);
        if (tRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }
        const t = tRes.rows[0];

        // Check if registration window has closed
        if (t.registrationCloseDate && new Date(t.registrationCloseDate) < new Date()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'REGISTRATION_CLOSED', message: 'Registration has ended for this tournament.' }));
          return;
        }

        const entryFeeAmount = parseInt(t.entry_fee_amount) || 0;
        const isPaid = entryFeeAmount > 0;
        const isWaitlisted = t.slotsFilled >= t.slotsTotal;

        // Status: paid tournaments use pending_payment, free use pending
        let status;
        if (isWaitlisted) {
          status = 'waitlisted';
        } else if (isPaid) {
          status = 'pending_payment';
        } else {
          status = 'pending';
        }

        let slotNumber = data.slot_number ? parseInt(data.slot_number) : null;
        if (slotNumber) {
          const slotCheck = await pool.query(
            "SELECT id FROM tournament_registrations WHERE tournament_id = $1 AND slot_number = $2 AND status IN ('approved', 'confirmed', 'pending', 'pending_payment')",
            [id, slotNumber]
          );
          if (slotCheck.rows.length > 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'SLOT_TAKEN', message: `Slot #${slotNumber} is already reserved by another team.` }));
            return;
          }
        }

        const regId = 'REG-' + Date.now().toString().slice(-6);
        const membersStr = data.members ? (typeof data.members === 'string' ? data.members : JSON.stringify(data.members)) : '[]';
        const idempotencyKey = data.idempotency_key || null;

        // Idempotency check
        if (idempotencyKey) {
          const existingReg = await pool.query(
            'SELECT * FROM tournament_registrations WHERE idempotency_key = $1',
            [idempotencyKey]
          );
          if (existingReg.rows.length > 0) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, registration: existingReg.rows[0], requiresPayment: isPaid, idempotent: true }));
            return;
          }
        }

        const dbRes = await pool.query(
          `INSERT INTO tournament_registrations (id, tournament_id, user_id, team_name, captain, captain_uid, members, status, slot_number, email, phone, idempotency_key, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 1) RETURNING *`,
          [regId, id, authUser.id, data.team_name, data.captain, data.captain_uid || null, membersStr, status, slotNumber, data.email || null, data.phone || null, idempotencyKey]
        );

        await reconcileTournamentSlots(pool, id);

        console.log(`\n📦 [MATCH DISTRICT DB] Team "${data.team_name}" registered for "${id}" with status "${status}" and entry fee ${entryFeeAmount} in Supabase.\n`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, registration: dbRes.rows[0], requiresPayment: isPaid }));
      } catch (err) {
        const isSchemaError = err.message && err.message.includes('does not exist');
        const message = isSchemaError
          ? 'Registration service configuration error. Please contact support.'
          : err.message;
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: message }));
      }
    });
    return;
  }

  // 7j_b. Confirm registration after payment
  if (req.url.startsWith('/api/tournaments/') && req.url.includes('/register/') && req.url.endsWith('/confirm') && req.method === 'POST') {
    const parts = req.url.split('/');
    const tournamentId = parts[3];
    const regId = parts[5];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in to confirm registration.' }));
          return;
        }

        const regRes = await pool.query('SELECT * FROM tournament_registrations WHERE id = $1 AND tournament_id = $2', [regId, tournamentId]);
        if (regRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Registration not found.' }));
          return;
        }

        const reg = regRes.rows[0];
        if (reg.user_id !== authUser.id) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'This registration does not belong to you.' }));
          return;
        }

        if (reg.status !== 'pending_payment') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_STATUS', message: 'Registration is not awaiting payment.' }));
          return;
        }

        const bodyData = JSON.parse(body);
        const dbRes = await pool.query(
          `UPDATE tournament_registrations SET status = 'pending', transaction_id = $1, payment_app = $2, screenshot_url = $3 WHERE id = $4 RETURNING *`,
          [bodyData.transaction_id || null, bodyData.payment_app || null, bodyData.screenshot_url || null, regId]
        );

        await reconcileTournamentSlots(pool, tournamentId);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, registration: dbRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 7j_c. Submit payment proof for a registration (keeps status pending_payment)
  if (req.url.startsWith('/api/tournaments/') && req.url.includes('/register/') && req.url.endsWith('/payment') && req.method === 'POST') {
    const parts = req.url.split('/');
    const tournamentId = parts[3];
    const regId = parts[5];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in to submit payment proof.' }));
          return;
        }

        const bodyData = JSON.parse(body);
        if (!bodyData.screenshot_url) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'MISSING_SCREENSHOT', message: 'Payment screenshot is required.' }));
          return;
        }

        const regRes = await pool.query('SELECT * FROM tournament_registrations WHERE id = $1 AND tournament_id = $2', [regId, tournamentId]);
        if (regRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Registration not found.' }));
          return;
        }

        const reg = regRes.rows[0];
        if (reg.user_id !== authUser.id) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'This registration does not belong to you.' }));
          return;
        }

        if (reg.status !== 'pending_payment') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_STATUS', message: 'This registration is not awaiting payment.' }));
          return;
        }

        const dbRes = await pool.query(
          `UPDATE tournament_registrations SET transaction_id = $1, payment_app = $2, screenshot_url = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *`,
          [bodyData.transaction_id || null, bodyData.payment_app || null, bodyData.screenshot_url, regId]
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Payment proof submitted successfully.', registration: dbRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 7k. Supabase Get All Registrations for a Tournament (auth required)
  if (req.url.startsWith('/api/tournaments/') && req.url.endsWith('/registrations') && req.method === 'GET') {
    const parts = req.url.split('/');
    const id = parts[3];
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required.' }));
        return;
      }
      const dbRes = await pool.query('SELECT * FROM tournament_registrations WHERE tournament_id = $1 ORDER BY created_at ASC', [id]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, registrations: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7k_b. Supabase Get All Registrations for a User (auth + ownership required)
  if (req.url.startsWith('/api/users/') && req.url.endsWith('/registrations') && req.method === 'GET') {
    const parts = req.url.split('/');
    const userId = parts[3];
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required.' }));
        return;
      }
      if (authUser.id !== userId && !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You can only view your own registrations.' }));
        return;
      }
      const dbRes = await pool.query('SELECT * FROM tournament_registrations WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, registrations: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7l. Supabase Update Registration Status Service (Organizer approve/reject)
  if (req.url.startsWith('/api/tournaments/') && req.url.includes('/registrations/') && req.method === 'PUT') {
    const parts = req.url.split('/');
    const id = parts[3];
    const regId = parts[5];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in to approve rosters.' }));
          return;
        }

        const tRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
        if (tRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }
        const t = tRes.rows[0];

        // Authorization check: User must be admin or the original organizer
        if (!hasRole(authUser, ROLES.ADMIN) && t.orgId !== authUser.id) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You do not have permission to manage this tournament.' }));
          return;
        }

        const data = JSON.parse(body);
        const newStatus = data.status; // 'approved', 'rejected', 'pending', 'pending_payment', 'confirmed', 'cancelled', 'expired', 'waitlisted', 'PENDING_PAYMENT_VERIFICATION', 'PAYMENT_REJECTED', 'CONFIRMED'
        const validStatuses = ['approved', 'rejected', 'pending', 'pending_payment', 'confirmed', 'cancelled', 'expired', 'waitlisted', 'PENDING_PAYMENT_VERIFICATION', 'PAYMENT_REJECTED', 'CONFIRMED', 'VERIFIED_BY_HOST'];
        if (!validStatuses.includes(newStatus)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_STATUS', message: `Invalid status: ${newStatus}` }));
          return;
        }

        // Get current registration
        const regRes = await pool.query('SELECT * FROM tournament_registrations WHERE id = $1', [regId]);
        if (regRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Registration not found.' }));
          return;
        }
        const currentReg = regRes.rows[0];

        if (currentReg.status === newStatus) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, registration: currentReg }));
          return;
        }

        const rejectionReason = data.rejection_reason || null;

        let dbRes;
        if (newStatus === 'rejected' || newStatus === 'PAYMENT_REJECTED') {
          dbRes = await pool.query(
            `UPDATE tournament_registrations SET status = $1, rejected_at = NOW(), rejection_reason = COALESCE($2, rejection_reason) WHERE id = $3 RETURNING *`,
            [newStatus, rejectionReason, regId]
          );

          // Also update payment_submissions if linked
          if (currentReg.payment_id) {
            await pool.query(
              `UPDATE payment_submissions SET payment_status = 'rejected', admin_notes = $1, reviewed_by = $2, reviewed_at = NOW() WHERE id = $3`,
              [rejectionReason, authUser.id, currentReg.payment_id]
            );
          }

          // Alert user about rejection
          try {
            const alertId = 'ALT-' + crypto.randomBytes(6).toString('hex').toUpperCase();
            await pool.query(
              `INSERT INTO alerts (id, user_id, title, message, tournament_id)
               VALUES ($1, $2, $3, $4, $5)`,
              [alertId, currentReg.user_id, 'Registration Rejected',
               `Your registration "${currentReg.team_name}" was not approved.${rejectionReason ? ' Reason: ' + rejectionReason : ''}`,
               id]
            );
          } catch (alertErr) { /* non-critical */ }

          // Audit log for rejection
          try {
            const logId = 'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
            await pool.query(
              `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [logId, authUser.id, 'registration_' + newStatus, 'registration', regId,
               JSON.stringify({ teamName: currentReg.team_name, tournamentId: id, reason: rejectionReason })]
            );
          } catch (logErr) { /* non-critical */ }

          // Email notification on rejection (if payment was involved)
          if (currentReg.payment_id) {
            try {
              const userRes = await pool.query('SELECT email, name FROM users WHERE id = $1', [currentReg.user_id]);
              if (userRes.rows.length > 0 && userRes.rows[0].email) {
                const userEmail = userRes.rows[0].email;
                const userName = userRes.rows[0].name || currentReg.captain;
                const rejectMsg = rejectionReason || 'Payment verification failed';
                await resend.emails.send({
                  from: RESEND_FROM_EMAIL,
                  to: [userEmail],
                  subject: `Registration Rejected — ${t.title || 'Tournament'}`,
                  html: `
                    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #eaeaea;border-radius:8px;">
                      <h2 style="color:#dc2626;margin:0 0 16px 0;">Registration Status Update</h2>
                      <p style="color:#333;font-size:15px;line-height:1.5;">Hi ${userName},</p>
                      <p style="color:#333;font-size:15px;line-height:1.5;">
                        Your registration for <strong>${t.title || 'the tournament'}</strong> has been reviewed.
                      </p>
                      <div style="background:#fef2f2;padding:16px;border-radius:6px;margin:16px 0;">
                        <p style="margin:0 0 6px 0;font-weight:bold;color:#dc2626;">Status: <span style="text-transform:uppercase;">${newStatus === 'PAYMENT_REJECTED' ? 'Payment Rejected' : 'Rejected'}</span></p>
                        <p style="margin:0;color:#991b1b;font-size:14px;">${rejectMsg}</p>
                      </div>
                      <p style="color:#666;font-size:13px;">Team: ${currentReg.team_name}</p>
                      <hr style="border:0;border-top:1px solid #eee;margin:20px 0;" />
                      <p style="font-size:12px;color:#888;text-align:center;">&copy; 2026 Match District</p>
                    </div>
                  `
                });
                console.log('✅ [EMAIL] Rejection notification sent to', userEmail);
              }
            } catch (emailErr) {
              console.error('❌ [EMAIL] Failed to send rejection email:', emailErr.message);
            }
          }
        } else {
          dbRes = await pool.query(
            `UPDATE tournament_registrations SET status = $1 WHERE id = $2 RETURNING *`,
            [newStatus, regId]
          );
        }

        // Track analytics event for approved/confirmed registrations
        if (newStatus === 'approved' || newStatus === 'confirmed') {
          try {
            await pool.query(
              `INSERT INTO analytics_events (id, organizer_id, event_type, event_data, tournament_id)
               VALUES ($1, $2, $3, $4, $5)`,
              ['AE-' + crypto.randomBytes(6).toString('hex').toUpperCase(), t.orgId, 'registration_' + newStatus,
              JSON.stringify({ teamName: currentReg.team_name, captain: currentReg.captain }), id]
            );
          } catch (aeErr) { /* analytics non-critical */ }
        }

        // Update payment_submissions status when approving
        if ((newStatus === 'approved' || newStatus === 'confirmed') && currentReg.payment_id) {
          try {
            await pool.query(
              `UPDATE payment_submissions SET payment_status = 'verified', reviewed_by = $1, reviewed_at = NOW() WHERE id = $2`,
              [authUser.id, currentReg.payment_id]
            );
          } catch (payUpdErr) { /* non-critical */ }
        }

        // Alert + email + audit log for approval
        if (newStatus === 'approved' || newStatus === 'confirmed') {
          // Alert user
          try {
            const alertId = 'ALT-' + crypto.randomBytes(6).toString('hex').toUpperCase();
            await pool.query(
              `INSERT INTO alerts (id, user_id, title, message, tournament_id)
               VALUES ($1, $2, $3, $4, $5)`,
              [alertId, currentReg.user_id, 'Registration Confirmed',
               `Your team "${currentReg.team_name}" has been confirmed for ${t.title || 'the tournament'}!`,
               id]
            );
          } catch (alertErr) { /* non-critical */ }

          // Audit log
          try {
            const logId = 'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
            await pool.query(
              `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [logId, authUser.id, 'registration_' + newStatus, 'registration', regId,
               JSON.stringify({ teamName: currentReg.team_name, tournamentId: id, hasPayment: !!currentReg.payment_id })]
            );
          } catch (logErr) { /* non-critical */ }

          // Email notification on approval (if payment was involved)
          if (currentReg.payment_id) {
            try {
              const userRes = await pool.query('SELECT email, name FROM users WHERE id = $1', [currentReg.user_id]);
              if (userRes.rows.length > 0 && userRes.rows[0].email) {
                const userEmail = userRes.rows[0].email;
                const userName = userRes.rows[0].name || currentReg.captain;
                await resend.emails.send({
                  from: RESEND_FROM_EMAIL,
                  to: [userEmail],
                  subject: `Registration Confirmed ✅ — ${t.title || 'Tournament'}`,
                  html: `
                    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #eaeaea;border-radius:8px;">
                      <h2 style="color:#16a34a;margin:0 0 16px 0;">Registration Confirmed!</h2>
                      <p style="color:#333;font-size:15px;line-height:1.5;">Hi ${userName},</p>
                      <p style="color:#333;font-size:15px;line-height:1.5;">
                        Great news! Your team <strong>${currentReg.team_name}</strong> has been confirmed for <strong>${t.title || 'the tournament'}</strong>.
                      </p>
                      <div style="background:#f0fdf4;padding:16px;border-radius:6px;margin:16px 0;">
                        <p style="margin:0;font-weight:bold;color:#16a34a;">Status: Confirmed</p>
                      </div>
                      <p style="color:#666;font-size:13px;">Stay tuned for room credentials and further instructions.</p>
                      <hr style="border:0;border-top:1px solid #eee;margin:20px 0;" />
                      <p style="font-size:12px;color:#888;text-align:center;">&copy; 2026 Match District</p>
                    </div>
                  `
                });
                console.log('✅ [EMAIL] Approval notification sent to', userEmail);
              }
            } catch (emailErr) {
              console.error('❌ [EMAIL] Failed to send approval email:', emailErr.message);
            }
          }
        }

        await reconcileTournamentSlots(pool, id);

        console.log(`\n📦 [MATCH DISTRICT DB] Registration "${regId}" updated to status "${newStatus}" in Supabase and slot manager updated.\n`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, registration: dbRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 7m. Supabase Get Notices Service
  if (req.url.startsWith('/api/tournaments/') && req.url.endsWith('/notices') && req.method === 'GET') {
    const parts = req.url.split('/');
    const id = parts[3];
    try {
      const dbRes = await pool.query('SELECT * FROM tournament_notices WHERE tournament_id = $1 ORDER BY pin DESC, created_at DESC', [id]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, notices: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7n. Supabase Create Notice Service
  if (req.url.startsWith('/api/tournaments/') && req.url.endsWith('/notices') && req.method === 'POST') {
    const parts = req.url.split('/');
    const id = parts[3];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!requireOrganizer(req, res, authUser)) return;

        const tRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
        if (tRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }
        const t = tRes.rows[0];

        // Authorization check: User must be admin or the original organizer
        if (!hasRole(authUser, ROLES.ADMIN) && t.orgId !== authUser.id) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You do not have permission to post notices.' }));
          return;
        }

        const data = JSON.parse(body);
        if (!data.title || !data.text) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Title and text are required.' }));
          return;
        }

        const noticeId = 'NTC-' + Date.now().toString().slice(-6);
        const pin = data.pin || false;

        const dbRes = await pool.query(
          `INSERT INTO tournament_notices (id, tournament_id, title, text, pin)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [noticeId, id, data.title, data.text, pin]
        );

        console.log(`\n📦 [MATCH DISTRICT DB] Notice "${data.title}" saved in Supabase.\n`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, notice: dbRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 7n_b. Supabase Delete Notice Service
  if (req.url.startsWith('/api/notices/') && req.method === 'DELETE') {
    const id = req.url.split('/api/notices/')[1];
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in to delete notices.' }));
        return;
      }

      const noticeRes = await pool.query('SELECT tournament_id FROM tournament_notices WHERE id = $1', [id]);
      if (noticeRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Notice not found.' }));
        return;
      }
      const tournamentId = noticeRes.rows[0].tournament_id;
      const tRes = await pool.query('SELECT "orgId" FROM tournaments WHERE id = $1', [tournamentId]);
      if (tRes.rows.length > 0) {
        const t = tRes.rows[0];
        if (!hasRole(authUser, ROLES.ADMIN) && t.orgId !== authUser.id) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You do not have permission to delete this notice.' }));
          return;
        }
      }

      await pool.query('DELETE FROM tournament_notices WHERE id = $1', [id]);
      console.log(`\n📦 [MATCH DISTRICT DB] Notice "${id}" deleted from Supabase.\n`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7o. Supabase Get Chat Messages Service
  if (req.url.startsWith('/api/tournaments/') && req.url.endsWith('/chat') && req.method === 'GET') {
    const parts = req.url.split('/');
    const id = parts[3];
    try {
      const dbRes = await pool.query('SELECT * FROM tournament_messages WHERE tournament_id = $1 ORDER BY created_at ASC', [id]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, messages: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7p. Supabase Create Chat Message Service
  if (req.url.startsWith('/api/tournaments/') && req.url.endsWith('/chat') && req.method === 'POST') {
    const parts = req.url.split('/');
    const id = parts[3];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in to send chat messages.' }));
          return;
        }

        const data = JSON.parse(body);
        if (!data.text) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Message text is required.' }));
          return;
        }

        const msgId = 'MSG-' + Date.now().toString().slice(-6);
        const senderName = data.sender_name || authUser.gamerTag || authUser.name || 'Anonymous';
        const senderRole = data.sender_role || authUser.role || 'gamer';
        const isSystem = data.is_system || false;

        const dbRes = await pool.query(
          `INSERT INTO tournament_messages (id, tournament_id, sender_name, sender_role, text, is_system)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [msgId, id, senderName, senderRole, data.text, isSystem]
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: dbRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }



  // --- SITE SETTINGS: GET GLOBAL THEME (public) ---
  if (req.url === '/api/settings/theme' && req.method === 'GET') {
    try {
      const result = await pool.query(`SELECT value FROM site_settings WHERE key = 'theme'`);
      const themeValue = result.rows.length > 0 ? result.rows[0].value : 'dark';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, theme: themeValue }));
    } catch (err) {
      console.error('❌ [SETTINGS] Failed to fetch theme setting:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, theme: 'dark', error: err.message }));
    }
    return;
  }

  // --- SITE SETTINGS: SET GLOBAL THEME (admin only) ---
  if (req.url === '/api/settings/theme' && req.method === 'PUT') {
    const authUser = getAuthUser(req);
    if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Forbidden: Admin access required.' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { theme } = JSON.parse(body);
        if (!['dark', 'light'].includes(theme)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid theme value. Must be "dark" or "light".' }));
          return;
        }
        await pool.query(
          `INSERT INTO site_settings (key, value, updated_at)
           VALUES ('theme', $1, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
          [theme]
        );
        console.log(`🎨 [SETTINGS] Global theme updated to: ${theme} by admin ${authUser.email || authUser.id}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, theme, message: `Global site theme set to "${theme}" successfully.` }));
      } catch (err) {
        console.error('❌ [SETTINGS] Failed to update theme:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // --- SITE SETTINGS: GET PLATFORM FEE PERCENTAGE (public) ---
  if (req.url === '/api/settings/platform-fee' && req.method === 'GET') {
    try {
      const result = await pool.query(`SELECT value FROM site_settings WHERE key = 'platform_fee_percentage'`);
      const fee = result.rows.length > 0 ? parseFloat(result.rows[0].value) : 10;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, percentage: fee }));
    } catch (err) {
      console.error('❌ [SETTINGS] Failed to fetch platform fee:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, percentage: 10, error: err.message }));
    }
    return;
  }

  // --- SITE SETTINGS: SET PLATFORM FEE PERCENTAGE (admin only) ---
  if (req.url === '/api/settings/platform-fee' && req.method === 'PUT') {
    const authUser = getAuthUser(req);
    if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Forbidden: Admin access required.' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { percentage } = JSON.parse(body);
        const fee = parseFloat(percentage);
        if (isNaN(fee) || fee < 0 || fee > 100) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid fee percentage. Must be a number between 0 and 100.' }));
          return;
        }
        await pool.query(
          `INSERT INTO site_settings (key, value, updated_at)
           VALUES ('platform_fee_percentage', $1, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
          [fee.toString()]
        );
        console.log(`💰 [SETTINGS] Platform fee updated to ${fee}% by admin ${authUser.email || authUser.id}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, percentage: fee, message: `Platform fee set to ${fee}% successfully.` }));
      } catch (err) {
        console.error('❌ [SETTINGS] Failed to update platform fee:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // --- SITE SETTINGS: GET ORGANIZER FEE PERCENTAGE (public) ---
  if (req.url === '/api/settings/organizer-fee' && req.method === 'GET') {
    try {
      const result = await pool.query(`SELECT value FROM site_settings WHERE key = 'organizer_fee_percentage'`);
      const fee = result.rows.length > 0 ? parseFloat(result.rows[0].value) : 5;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, percentage: fee }));
    } catch (err) {
      console.error('❌ [SETTINGS] Failed to fetch organizer fee:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, percentage: 5, error: err.message }));
    }
    return;
  }

  // --- SITE SETTINGS: SET ORGANIZER FEE PERCENTAGE (admin only) ---
  if (req.url === '/api/settings/organizer-fee' && req.method === 'PUT') {
    const authUser = getAuthUser(req);
    if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Forbidden: Admin access required.' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { percentage } = JSON.parse(body);
        const fee = parseFloat(percentage);
        if (isNaN(fee) || fee < 0 || fee > 100) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid fee percentage. Must be a number between 0 and 100.' }));
          return;
        }
        await pool.query(
          `INSERT INTO site_settings (key, value, updated_at)
           VALUES ('organizer_fee_percentage', $1, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
          [fee.toString()]
        );
        console.log(`💰 [SETTINGS] Organizer fee updated to ${fee}% by admin ${authUser.email || authUser.id}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, percentage: fee, message: `Organizer fee set to ${fee}% successfully.` }));
      } catch (err) {
        console.error('❌ [SETTINGS] Failed to update organizer fee:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // --- GET TOURNAMENT SLOTS DETAIL ---
  if (req.url.startsWith('/api/tournaments/') && req.url.endsWith('/slots') && req.method === 'GET') {
    const parts = req.url.split('/');
    const id = parts[3];
    try {
      const tRes = await pool.query('SELECT "slotsTotal", "slotsFilled", match_type, max_slots_per_room FROM tournaments WHERE id = $1', [id]);
      if (tRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found' }));
        return;
      }
      const slotsTotal = parseInt(tRes.rows[0].slotsTotal) || 100;
      const slotsFilled = parseInt(tRes.rows[0].slotsFilled) || 0;
      const matchType = (tRes.rows[0].match_type || 'squad').toLowerCase();
      const maxSlotsPerRoom = tRes.rows[0].max_slots_per_room
        ? parseInt(tRes.rows[0].max_slots_per_room)
        : null;

      const regsRes = await pool.query(
        'SELECT id, team_name, captain, status, slot_number FROM tournament_registrations WHERE tournament_id = $1',
        [id]
      );
      const regs = regsRes.rows;

      const slots = [];
      for (let i = 1; i <= slotsTotal; i++) {
        const booked = regs.find(r => r.slot_number === i);
        if (booked) {
          slots.push({
            number: i,
            status: booked.status === 'approved' ? 'occupied' : booked.status === 'confirmed' ? 'confirmed' : 'pending',
            teamName: booked.team_name,
            captain: booked.captain,
            registrationId: booked.id
          });
        } else {
          slots.push({
            number: i,
            status: 'available',
            teamName: null,
            captain: null,
            registrationId: null
          });
        }
      }

      const roomCeilings = { solo: 100, duo: 50, squad: 25 };
      const roomFloors = { solo: 50, duo: 25, squad: 13 };
      const gameCeiling = roomCeilings[matchType] || 25;
      const floorConstraint = roomFloors[matchType] || 13;
      const effectiveMaxPerRoom = maxSlotsPerRoom || gameCeiling;
      const m = Math.max(1, effectiveMaxPerRoom);
      const total = Math.max(0, slotsTotal);

      let rooms = [];
      let balanced = false;

      if (total > 0 && total > m) {
        const initialRooms = Math.floor(total / m);
        const remainder = total % m;
        if (remainder > 0) {
          const newCapacity = Math.ceil(total / initialRooms);
          if (newCapacity <= gameCeiling && newCapacity >= floorConstraint) {
            // Balanced collapse
            const base = Math.floor(total / initialRooms);
            const extra = total % initialRooms;
            let cursor = 1;
            for (let i = 0; i < initialRooms; i++) {
              const size = i < extra ? base + 1 : base;
              const start = cursor;
              const end = cursor + size - 1;
              rooms.push({ roomNumber: i + 1, slotStart: start, slotEnd: end, slotsInRoom: size });
              cursor += size;
            }
            balanced = true;
          }
        }
      }

      if (rooms.length === 0) {
        // Fall back to simple split
        const totalRooms = Math.max(1, Math.ceil(total / m));
        for (let r = 0; r < totalRooms; r++) {
          const start = r * m + 1;
          const end = Math.min((r + 1) * m, total);
          rooms.push({
            roomNumber: r + 1,
            slotStart: start,
            slotEnd: end,
            slotsInRoom: end - start + 1,
          });
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        slotsTotal,
        slotsFilled,
        slotsAvailable: Math.max(0, slotsTotal - slotsFilled),
        slots,
        roomMeta: {
          matchType,
          maxSlotsPerRoom: effectiveMaxPerRoom,
          gameCeiling,
          floorConstraint,
          totalRooms: rooms.length,
          balanced,
          rooms,
        },
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ========================
  // TOURNAMENT CREATION API v2
  // ========================

  // 8a. GET /api/games - List available games
  if (req.url === '/api/games' && req.method === 'GET') {
    try {
      const dbRes = await pool.query(
        'SELECT id, name, icon, active, sort_order FROM games WHERE active = true ORDER BY sort_order ASC'
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, games: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 8b. GET /api/tournaments/draft/:userId - Load latest draft for user
  const draftLoadMatch = req.url.match(/^\/api\/tournaments\/draft\/([^/]+)$/);
  if (draftLoadMatch && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || authUser.id !== draftLoadMatch[1]) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }
      const dbRes = await pool.query(
        `SELECT * FROM tournaments WHERE "orgId" = $1 AND "isDraft" = true ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT 1`,
        [draftLoadMatch[1]]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, draft: dbRes.rows[0] || null }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 8c. DELETE /api/tournaments/:id/draft - Discard a draft
  const draftDeleteMatch = req.url.match(/^\/api\/tournaments\/([^/]+)\/draft$/);
  if (draftDeleteMatch && req.method === 'DELETE') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const tId = draftDeleteMatch[1];
      const existRes = await pool.query('SELECT * FROM tournaments WHERE id = $1 AND "isDraft" = true', [tId]);
      if (existRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Draft not found.' }));
        return;
      }
      if (!hasRole(authUser, ROLES.ADMIN) && existRes.rows[0].orgId !== authUser.id) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }
      await pool.query('DELETE FROM tournaments WHERE id = $1', [tId]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Draft discarded.' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 8d. PUT /api/tournaments/:id/auto-save - Save partial draft state
  const autoSaveMatch = req.url.match(/^\/api\/tournaments\/([^/]+)\/auto-save$/);
  if (autoSaveMatch && req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }
        const tId = autoSaveMatch[1];
        const existRes = await pool.query('SELECT * FROM tournaments WHERE id = $1 AND "isDraft" = true', [tId]);
        if (existRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Draft not found.' }));
          return;
        }
        if (!hasRole(authUser, ROLES.ADMIN) && existRes.rows[0].orgId !== authUser.id) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }

        const t = JSON.parse(body);

        // Build partial update — only update provided fields
        const updates = [];
        const values = [];
        let idx = 1;

        const fieldMap = {
          title: 'title', game: 'game', status: 'status', badgeBg: '"badgeBg"',
          badgeText: '"badgeText"', date: 'date', prize: 'prize', entry: 'entry',
          teamsCount: '"teamsCount"', featured: 'featured', orgName: '"orgName"',
          registrationOpenDate: '"registrationOpenDate"', registrationCloseDate: '"registrationCloseDate"',
          startDate: '"startDate"', rules: 'rules', region: 'region', format: 'format',
          slotsTotal: '"slotsTotal"', roomID: '"roomID"', roomPassword: '"roomPassword"',
          timeline: 'timeline', bannerUrl: '"bannerUrl"', logoUrl: '"logoUrl"',
          match_type: 'match_type', perspective: 'perspective',
          reserved_slots: 'reserved_slots', entry_fee_amount: 'entry_fee_amount',
          prize_pool_type: 'prize_pool_type', prize_pool_amount: 'prize_pool_amount',
          prize_split_1st: 'prize_split_1st', prize_split_2nd: 'prize_split_2nd',
          prize_split_3rd: 'prize_split_3rd', prize_split_mvp: 'prize_split_mvp',
          description: 'description', cover_image_url: 'cover_image_url',
          lobby_start_time: 'lobby_start_time',
          sponsors_enabled: 'sponsors_enabled'
        };

        for (const [key, col] of Object.entries(fieldMap)) {
          if (t[key] !== undefined) {
            updates.push(`${col} = $${idx++}`);
            let val = t[key];
            if (['slotsTotal', 'slotsFilled', 'reserved_slots', 'entry_fee_amount', 'prize_pool_amount', 'version'].includes(key)) {
              val = parseInt(val);
            } else if (['featured', 'isDraft'].includes(key)) {
              val = Boolean(val);
            } else if (['rules', 'timeline'].includes(key) && typeof val !== 'string') {
              val = JSON.stringify(val);
            }
            values.push(val);
          }
        }

        if (updates.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NO_FIELDS', message: 'No fields to update.' }));
          return;
        }

        values.push(tId);
        const query = `UPDATE tournaments SET ${updates.join(', ')}, version = version + 1 WHERE id = $${idx} RETURNING *`;
        const dbRes = await pool.query(query, values);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, tournament: dbRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 8e. POST /api/tournaments/:id/roadmap - Save roadmap rounds
  const roadmapPostMatch = req.url.match(/^\/api\/tournaments\/([^/]+)\/roadmap$/);
  if (roadmapPostMatch && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }
        const tId = roadmapPostMatch[1];
        const existRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [tId]);
        if (existRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }
        if (!hasRole(authUser, ROLES.ADMIN) && existRes.rows[0].orgId !== authUser.id) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }

        const payload = JSON.parse(body);
        const existingTimeline = existRes.rows[0].timeline ? JSON.parse(existRes.rows[0].timeline) : {};
        const existingArr = Array.isArray(existingTimeline) ? [] : (existingTimeline.roadmap || []);
        let updatedRoadmap;

        if (payload.replace) {
          updatedRoadmap = payload.rounds || [];
        } else if (payload.round) {
          // Add or update a single round
          const idx = existingArr.findIndex(r => r.id === payload.round.id);
          if (idx >= 0) {
            existingArr[idx] = payload.round;
          } else {
            existingArr.push(payload.round);
          }
          updatedRoadmap = existingArr;
        } else {
          updatedRoadmap = existingArr;
        }

        const updatedTimeline = {
          ...(typeof existingTimeline === 'object' && !Array.isArray(existingTimeline) ? existingTimeline : {}),
          roadmap: updatedRoadmap
        };

        await pool.query(
          'UPDATE tournaments SET timeline = $1, version = version + 1 WHERE id = $2',
          [JSON.stringify(updatedTimeline), tId]
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, roadmap: updatedRoadmap }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 8f. GET /api/tournaments/:id/roadmap - Fetch roadmap rounds
  const roadmapGetMatch = req.url.match(/^\/api\/tournaments\/([^/]+)\/roadmap$/);
  if (roadmapGetMatch && req.method === 'GET') {
    try {
      const tId = roadmapGetMatch[1];
      const dbRes = await pool.query('SELECT timeline FROM tournaments WHERE id = $1', [tId]);
      if (dbRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        return;
      }
      const raw = dbRes.rows[0].timeline;
      const parsed = raw ? JSON.parse(raw) : {};
      const roadmap = Array.isArray(parsed) ? parsed : (parsed.roadmap || []);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, roadmap }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 8g. POST /api/sponsor-request - Submit sponsored prize pool request
  if (req.url === '/api/sponsor-request' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }

        const payload = JSON.parse(body);
        const dbRes = await pool.query(
          `INSERT INTO sponsor_requests (id, organizer_id, tournament_id, prize_pool_amount, sponsor_type, description, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
          [
            `SPR-${Date.now().toString().slice(-6)}`,
            authUser.id,
            payload.tournament_id || '',
            parseInt(payload.prize_pool_amount) || 0,
            payload.sponsor_type || 'prize_pool',
            payload.description || ''
          ]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, request: dbRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 8h. GET /api/org/tournament-usage - Real-time tournament usage for current user
  if (req.url === '/api/org/tournament-usage' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }

      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      // Count tournaments created this month (excluding drafts)
      const countRes = await pool.query(
        `SELECT COUNT(*) as count FROM tournaments WHERE "orgId" = $1 AND "isDraft" = false AND created_at >= $2`,
        [authUser.id, firstOfMonth]
      );
      const tournamentCount = parseInt(countRes.rows[0].count) || 0;

      // Total slots across active non-draft tournaments
      const slotsRes = await pool.query(
        `SELECT COALESCE(SUM("slotsTotal"), 0) as total, COALESCE(SUM("slotsFilled"), 0) as filled FROM tournaments WHERE "orgId" = $1 AND "isDraft" = false`,
        [authUser.id]
      );

      let maxTournaments = 30;
      let maxSlots = 100;
      try {
        const planRes = await pool.query('SELECT tier FROM users WHERE id = $1', [authUser.id]);
        const tier = planRes.rows[0]?.tier || 'Free';
        if (tier === 'Pro') { maxTournaments = -1; maxSlots = 1000; }
        else if (tier === 'Basic') { maxTournaments = 60; maxSlots = 300; }
        else { maxTournaments = 30; maxSlots = 100; }
      } catch { /* use defaults */ }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        usage: {
          tournamentsThisMonth: tournamentCount,
          maxTournaments,
          totalSlots: parseInt(slotsRes.rows[0].total) || 0,
          maxSlots,
          tournamentsPercent: maxTournaments <= 0 ? 0 : Math.min(100, Math.round((tournamentCount / maxTournaments) * 100))
        }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 8i. POST /api/tournament/sponsors - Save sponsors for a tournament
  if (req.url === '/api/tournament/sponsors' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }

        const payload = JSON.parse(body);
        const { tournament_id, sponsors } = payload;

        if (!tournament_id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'MISSING_TOURNAMENT_ID' }));
          return;
        }

        // Verify ownership
        const ownerRes = await pool.query('SELECT "orgId" FROM tournaments WHERE id = $1', [tournament_id]);
        if (ownerRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
          return;
        }
        if (ownerRes.rows[0].orgId !== authUser.id && !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }

        // Store sponsors as JSON
        const sponsorsJson = JSON.stringify(sponsors || []);
        await pool.query(
          'UPDATE tournaments SET sponsors_data = $1 WHERE id = $2',
          [sponsorsJson, tournament_id]
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 8j. GET /api/tournament/sponsors/:id - Load sponsors for a tournament
  if (req.url.startsWith('/api/tournament/sponsors/') && req.method === 'GET') {
    const tournamentId = req.url.split('/api/tournament/sponsors/')[1];
    try {
      const resData = await pool.query(
        'SELECT sponsors_data FROM tournaments WHERE id = $1',
        [tournamentId]
      );

      if (resData.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
        return;
      }

      let sponsors = [];
      try {
        sponsors = JSON.parse(resData.rows[0].sponsors_data || '[]');
      } catch {}

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, sponsors }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ========================
  // PAYMENT VERIFICATION API
  // ========================

  // POST /api/payment/submit - Submit payment proof for manual verification
  if (req.url === '/api/payment/submit' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }

        const userRes = await pool.query('SELECT id, name, role FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
          return;
        }
        const user = userRes.rows[0];

        const { plan, billingCycle, amount, transactionId, screenshotUrl, notes } = JSON.parse(body);
        if (!plan || !amount || !transactionId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Plan, amount, and transaction ID are required.' }));
          return;
        }

        // Check for duplicate submission (same transaction ID for this user)
        const dupRes = await pool.query(
          'SELECT id FROM payment_verifications WHERE transaction_id = $1 AND user_id = $2',
          [transactionId, user.id]
        );
        if (dupRes.rows.length > 0) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'DUPLICATE', message: 'This transaction ID has already been submitted.' }));
          return;
        }

        const paymentId = 'PAY-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO payment_verifications (id, user_id, plan_name, billing_cycle, amount, transaction_id, payment_screenshot_url, payment_notes, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
          [paymentId, user.id, plan, billingCycle, amount, transactionId, screenshotUrl || null, notes || null]
        );

        // Create alert for user
        const alertId = 'ALT-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO alerts (id, user_id, title, message, is_read)
           VALUES ($1, $2, $3, $4, false)`,
          [alertId, user.id, 'Payment Submitted', `Your ${plan} plan payment of ₹${amount} has been submitted for verification. We'll notify you once it's reviewed.`]
        );

        console.log(`💰 [PAYMENT] User ${user.id} submitted payment proof for ${plan} plan (₹${amount})`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Payment proof submitted successfully! Awaiting verification.',
          payment: {
            id: paymentId,
            plan,
            billingCycle,
            amount,
            transactionId,
            status: 'pending',
            createdAt: new Date().toISOString()
          }
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // GET /api/payment/my - Get current user's payment submissions
  if (req.url === '/api/payment/my' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }

      const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
        return;
      }
      const user = userRes.rows[0];

      const dbRes = await pool.query(
        'SELECT * FROM payment_verifications WHERE user_id = $1 ORDER BY created_at DESC',
        [user.id]
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, payments: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // GET /api/payment/status/:id - Check status of a specific payment
  const paymentStatusMatch = req.url.match(/^\/api\/payment\/status\/([^/]+)$/);
  if (paymentStatusMatch && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }

      const paymentId = paymentStatusMatch[1];
      const dbRes = await pool.query(
        'SELECT pv.*, u.name as user_name FROM payment_verifications pv JOIN users u ON u.id = pv.user_id WHERE pv.id = $1',
        [paymentId]
      );

      if (dbRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, payment: dbRes.rows[0] }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- ADMIN PAYMENT VERIFICATION ENDPOINTS ---

  // GET /api/admin/payments - List all payment verifications
  if (req.url === '/api/admin/payments' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }

      const statusFilter = req.url.includes('?status=') ? req.url.split('?status=')[1].split('&')[0] : null;
      let query = `
        SELECT pv.*, u.name as user_name, u.email as user_email, u.tier as current_tier
        FROM payment_verifications pv
        JOIN users u ON u.id = pv.user_id
      `;
      const params = [];
      if (statusFilter) {
        query += ' WHERE pv.status = $1';
        params.push(statusFilter);
      }
      query += ' ORDER BY pv.created_at DESC';

      const dbRes = await pool.query(query, params);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, payments: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/admin/payments/approve - Approve a payment and activate subscription
  if (req.url === '/api/admin/payments/approve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasCapability(authUser, 'VERIFY_PAYMENTS')) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Access denied: Requires Payment Verifier or Admin permissions.' }));
          return;
        }

        const { paymentId } = JSON.parse(body);
        if (!paymentId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT' }));
          return;
        }

        // Get payment record
        const payRes = await pool.query('SELECT * FROM payment_verifications WHERE id = $1', [paymentId]);
        if (payRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
          return;
        }
        const payment = payRes.rows[0];
        if (payment.status !== 'pending') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'ALREADY_PROCESSED', message: 'This payment has already been reviewed.' }));
          return;
        }

        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // Update payment status
          await client.query(
            `UPDATE payment_verifications SET status = 'approved', admin_id = $1, reviewed_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [authUser.id, paymentId]
          );

          // Activate the subscription
          const plan = payment.plan_name;
          const cycle = payment.billing_cycle || 'monthly';

          // Get plan details
          const planRes = await client.query('SELECT * FROM organizer_plans WHERE name = $1', [plan]);
          if (planRes.rows.length === 0) {
            await client.query('ROLLBACK');
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'PLAN_NOT_FOUND' }));
            client.release();
            return;
          }
          const planDetails = planRes.rows[0];

          // ── Subscription Validation ───────────────────────────────────
          // Check for existing active subscription to prevent stacking
          const existingSubRes5 = await client.query('SELECT * FROM subscriptions WHERE organizer_id = $1', [payment.user_id]);
          const existingSub5 = existingSubRes5.rows[0];
          const userRes5 = await client.query('SELECT id, tier FROM users WHERE id = $1', [payment.user_id]);
          const targetUser5 = userRes5.rows[0];

          if (existingSub5 && existingSub5.billing_status === 'active') {
            if (targetUser5.tier === plan) {
              await client.query('ROLLBACK');
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                error: 'ALREADY_ACTIVE',
                message: `User already has an active ${plan} subscription. Cannot approve a duplicate.`
              }));
              client.release();
              return;
            }
            // Only allow upgrades (higher tier), block downgrades via payment approval
            const planOrder5 = ['Free', 'Basic', 'Pro'];
            const currentIdx5 = planOrder5.indexOf(targetUser5.tier);
            const newIdx5 = planOrder5.indexOf(plan);
            if (newIdx5 <= currentIdx5) {
              await client.query('ROLLBACK');
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                error: 'INVALID_UPGRADE',
                message: `Cannot activate ${plan} plan when user already has an active ${targetUser5.tier} subscription.`
              }));
              client.release();
              return;
            }
          }
          // ── End Validation ─────────────────────────────────────────

          // Update user tier
          await client.query('UPDATE users SET tier = $1 WHERE id = $2', [plan, payment.user_id]);

          // Calculate renewal date
          const renewalDate = new Date();
          if (cycle === 'monthly') {
            renewalDate.setMonth(renewalDate.getMonth() + 1);
          } else {
            renewalDate.setFullYear(renewalDate.getFullYear() + 1);
          }

          // Upsert subscription
          const subRes = await client.query('SELECT id FROM subscriptions WHERE organizer_id = $1', [payment.user_id]);
          if (subRes.rows.length > 0) {
            await client.query(
              `UPDATE subscriptions SET plan_id = $1, billing_status = 'active', billing_cycle = $2, plan_start_date = CURRENT_TIMESTAMP, renewal_date = $3, cancelled_at = NULL WHERE organizer_id = $4`,
              [planDetails.id, cycle, renewalDate, payment.user_id]
            );
          } else {
            const subId = 'SUB-' + crypto.randomBytes(6).toString('hex').toUpperCase();
            await client.query(
              `INSERT INTO subscriptions (id, organizer_id, plan_id, billing_status, billing_cycle, plan_start_date, renewal_date)
               VALUES ($1, $2, $3, 'active', $4, CURRENT_TIMESTAMP, $5)`,
              [subId, payment.user_id, planDetails.id, cycle, renewalDate]
            );
          }

          // Record billing history
          const billId = 'BILL-' + crypto.randomBytes(6).toString('hex').toUpperCase();
          await client.query(
            `INSERT INTO billing_history (id, organizer_id, plan_name, billing_cycle, amount, status)
             VALUES ($1, $2, $3, $4, $5, 'completed')`,
            [billId, payment.user_id, plan, cycle, payment.amount]
          );

          // Create alert for user - payment approved
          const alertId = 'ALT-' + crypto.randomBytes(6).toString('hex').toUpperCase();
          await client.query(
            `INSERT INTO alerts (id, user_id, title, message, is_read)
             VALUES ($1, $2, $3, $4, false)`,
            [alertId, payment.user_id, 'Payment Approved! 🎉', `Your ${plan} plan payment of ₹${payment.amount} has been approved! Your subscription is now active. Welcome to ${plan}!`]
          );

          await client.query('COMMIT');

          console.log(`💰 [PAYMENT] Admin ${authUser.id} approved payment ${paymentId} for ${plan} plan`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            message: `Payment approved and ${plan} plan activated!`,
            payment: { id: paymentId, status: 'approved' }
          }));
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/admin/payments/reject - Reject a payment
  if (req.url === '/api/admin/payments/reject' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasCapability(authUser, 'VERIFY_PAYMENTS')) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Access denied: Requires Payment Verifier or Admin permissions.' }));
          return;
        }

        const { paymentId, reason } = JSON.parse(body);
        if (!paymentId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT' }));
          return;
        }

        const payRes = await pool.query('SELECT * FROM payment_verifications WHERE id = $1', [paymentId]);
        if (payRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
          return;
        }
        const payment = payRes.rows[0];
        if (payment.status !== 'pending') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'ALREADY_PROCESSED', message: 'This payment has already been reviewed.' }));
          return;
        }

        const rejectionReason = reason || 'Payment verification failed. Please resubmit with correct details.';

        await pool.query(
          `UPDATE payment_verifications SET status = 'rejected', admin_id = $1, rejection_reason = $2, reviewed_at = CURRENT_TIMESTAMP WHERE id = $3`,
          [authUser.id, rejectionReason, paymentId]
        );

        // Create alert for user
        const alertId = 'ALT-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO alerts (id, user_id, title, message, is_read)
           VALUES ($1, $2, $3, $4, false)`,
          [alertId, payment.user_id, 'Payment Rejected', `Your ${payment.plan_name} plan payment was not approved. Reason: ${rejectionReason}. Please submit a new payment with corrected details.`]
        );

        console.log(`💰 [PAYMENT] Admin ${authUser.id} rejected payment ${paymentId}. Reason: ${rejectionReason}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Payment rejected.',
          payment: { id: paymentId, status: 'rejected', rejectionReason }
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // GET /api/admin/payments/stats - Payment verification statistics
  if (req.url === '/api/admin/payments/stats' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasCapability(authUser, 'VERIFY_PAYMENTS')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Access denied: Requires Payment Verifier or Admin permissions.' }));
        return;
      }

      const totalRes = await pool.query('SELECT COUNT(*) FROM payment_verifications');
      const pendingRes = await pool.query("SELECT COUNT(*) FROM payment_verifications WHERE status = 'pending'");
      const approvedRes = await pool.query("SELECT COUNT(*) FROM payment_verifications WHERE status = 'approved'");
      const rejectedRes = await pool.query("SELECT COUNT(*) FROM payment_verifications WHERE status = 'rejected'");
      const revenueRes = await pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM payment_verifications WHERE status = 'approved'");

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        stats: {
          total: parseInt(totalRes.rows[0].count),
          pending: parseInt(pendingRes.rows[0].count),
          approved: parseInt(approvedRes.rows[0].count),
          rejected: parseInt(rejectedRes.rows[0].count),
          totalRevenue: parseFloat(revenueRes.rows[0].total)
        }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ─────────────────────────────────────────────────────────────
  // POST /api/admin/update-role — Admin-only: promote/demote user role
  // ─────────────────────────────────────────────────────────────
  if (req.url === '/api/admin/update-role' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasCapability(authUser, 'MANAGE_ROLES')) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Unauthorized: Only administrators can access Role Management.' }));
          return;
        }

        const { targetUserId, newRole } = JSON.parse(body);
        if (!targetUserId || !newRole) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'targetUserId and newRole are required.' }));
          return;
        }

        // Validate newRole is a known role
        const validRoles = Object.values(ROLES);
        if (!validRoles.includes(newRole)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_ROLE', message: `Invalid role "${newRole}". Must be one of: ${validRoles.join(', ')}` }));
          return;
        }

        // Safety restraint: admins cannot demote themselves
        if (targetUserId === authUser.id && newRole !== ROLES.ADMIN) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SELF_DEMOTE', message: 'Safety Restraint: You cannot remove your own administrator status.' }));
          return;
        }

        // Check target user exists
        const userRes = await pool.query('SELECT id, name, email, role, roles FROM users WHERE id = $1', [targetUserId]);
        if (userRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'USER_NOT_FOUND' }));
          return;
        }

        const targetUser = userRes.rows[0];

        // ─── CRITICAL: Root admin account absolute safety guard ───
        const envRoot = (process.env.ADMIN_EMAIL || '').toLowerCase();
        const hardRoot = ROOT_ADMIN_EMAIL.toLowerCase();
        const isTargetRootAdmin = targetUser.email && (
          (envRoot && targetUser.email.toLowerCase() === envRoot) ||
          targetUser.email.toLowerCase() === hardRoot
        );
        if (isTargetRootAdmin) {
          if (newRole !== ROLES.ADMIN) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'SECURITY_CONSTRAINT',
              message: 'Security Constraint Violation: The root administrator account cannot be demoted or have its admin role removed.'
            }));
            return;
          }
          // Ensure the roles array always contains 'admin'
          if (!Array.isArray(targetUser.roles) || !targetUser.roles.includes(ROLES.ADMIN)) {
            await pool.query('UPDATE users SET roles = $1 WHERE id = $2', [['user', 'admin'], targetUserId]);
          }
        }
        // ─── End root admin guard ───

        // Build the new roles array:
        // - USER: reset to ["user"] and clear orgApplicationStatus
        // - Any privileged role: keep "user" base + add the new role (deduplicated)
        let newRoles;
        let orgStatusClear = '';
        if (newRole === ROLES.USER) {
          newRoles = ['user'];
          orgStatusClear = ', "orgApplicationStatus" = COALESCE("orgApplicationStatus", \'none\')';
        } else if (newRole === ROLES.ADMIN) {
          newRoles = ['user', 'admin'];
        } else if (newRole === ROLES.REG_PAYMENT_VERIFIER) {
          newRoles = ['user', 'reg_payment_verifier'];
        } else if (newRole === ROLES.ORGANISER) {
          newRoles = ['user', 'organiser'];
          orgStatusClear = ', "orgApplicationStatus" = \'approved\'';
        } else {
          newRoles = ['user'];
        }

        const updateRes = await pool.query(
          `UPDATE users SET role = $1, roles = $2${orgStatusClear} WHERE id = $3 RETURNING id, name, email, role, roles, "orgApplicationStatus"`,
          [newRole, newRoles, targetUserId]
        );

        // Auto-create a Free subscription for newly assigned organisers
        if (newRole === ROLES.ORGANISER) {
          try {
            await pool.query(
              `INSERT INTO subscriptions (id, organizer_id, plan_id, billing_status)
               VALUES ($1, $2, 'plan_free', 'active')
               ON CONFLICT (organizer_id) DO NOTHING`,
              ['SUB-' + Date.now(), targetUserId]
            );
          } catch (subErr) {
            console.warn('⚠️ [IAM] Could not auto-create subscription for organizer:', subErr.message);
          }
        }

        // Audit log
        const logId = 'ADM-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [logId, authUser.id, 'role_change', 'user', targetUserId, `${targetUser.role || JSON.stringify(targetUser.roles)} → ${newRole} (roles: ${JSON.stringify(newRoles)})`]
        );

        console.log(`🔐 [IAM] Admin ${authUser.id} changed ${targetUserId} role: ${targetUser.role} → ${newRole}, roles: ${JSON.stringify(newRoles)}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `User role successfully updated to ${newRole}`,
          user: updateRes.rows[0]
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // --- GET USER WALLET TRANSACTIONS ---
  if (req.url.startsWith('/api/users/') && req.url.endsWith('/wallet-transactions') && req.method === 'GET') {
    const parts = req.url.split('/');
    const userId = parts[3];
    try {
      const dbRes = await pool.query('SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, transactions: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- POST USER WALLET TRANSACTION ---
  if (req.url.startsWith('/api/users/') && req.url.endsWith('/wallet-transactions') && req.method === 'POST') {
    const parts = req.url.split('/');
    const userId = parts[3];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      const client = await pool.connect();
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          client.release();
          return;
        }

        if (!hasRole(authUser, ROLES.ADMIN) && authUser.id !== userId) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          client.release();
          return;
        }

        const { description, type, amount, status } = JSON.parse(body);
        if (!description || !type || !amount) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT' }));
          client.release();
          return;
        }

        await client.query('BEGIN');

        const txId = 'TXN-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await client.query(
          `INSERT INTO wallet_transactions (id, user_id, description, type, amount, status) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [txId, userId, description, type, amount, status || 'Completed']
        );

        // Update user balance if credit or debit
        const balanceChange = type === 'credit' ? Number(amount) : -Number(amount);
        await client.query(
          'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
          [balanceChange, userId]
        );

        await client.query('COMMIT');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, transaction: { id: txId, user_id: userId, description, type, amount, status: status || 'Completed' } }));
      } catch (err) {
        await client.query('ROLLBACK');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      } finally {
        client.release();
      }
    });
    return;
  }

  // ========================
  // SUBSCRIPTION API ENDPOINTS
  // ========================

  // GET /api/subscription/my - Get current subscription details with usage
  if (req.url === '/api/subscription/my' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }

      const userRes = await pool.query('SELECT * FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
        return;
      }
      const user = userRes.rows[0];

      // Get subscription
      const subRes = await pool.query('SELECT * FROM subscriptions WHERE organizer_id = $1', [user.id]);
      const subscription = subRes.rows[0] || null;

      // Get plan details
      const planRes = await pool.query('SELECT * FROM organizer_plans WHERE name = $1', [user.tier || 'Free']);
      const plan = planRes.rows[0] || null;

      // Get usage
      const usage = await getOrganizerUsage(pool, user.id);

      // Get billing history
      const billingRes = await pool.query(
        'SELECT * FROM billing_history WHERE organizer_id = $1 ORDER BY created_at DESC LIMIT 12',
        [user.id]
      );

      // Get plan features
      const features = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        subscription: {
          id: subscription?.id || null,
          plan: user.tier || 'Free',
          planId: plan?.id || 'plan_free',
          billingCycle: subscription?.billing_cycle || 'monthly',
          status: subscription?.billing_status || 'active',
          startDate: subscription?.plan_start_date || user.created_at,
          renewalDate: subscription?.renewal_date || subscription?.plan_expiration || null,
          isTrial: subscription?.is_trial || false,
          cancelledAt: subscription?.cancelled_at || null,
          features
        },
        planDetails: plan,
        usage,
        billingHistory: billingRes.rows
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/subscription/upgrade - Request plan upgrade (immediate for non-paid)
  if (req.url === '/api/subscription/upgrade' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }

        const { plan, billingCycle } = JSON.parse(body);
        if (!plan || !['Free', 'Basic', 'Pro'].includes(plan)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_PLAN', message: 'Invalid plan selected.' }));
          return;
        }

        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
          return;
        }
        const user = userRes.rows[0];

        // ── Subscription Validation ─────────────────────────────────────
        // Check existing subscription to prevent stacking & same-plan re-purchase
        const existingSubRes4 = await pool.query('SELECT * FROM subscriptions WHERE organizer_id = $1', [user.id]);
        const existingSub4 = existingSubRes4.rows[0];
        const planOrder4 = ['Free', 'Basic', 'Pro'];
        const currentIdx4 = planOrder4.indexOf(user.tier);
        const newIdx4 = planOrder4.indexOf(plan);

        // Block same-plan re-purchase if user already on this tier with active subscription
        if (user.tier === plan && existingSub4 && existingSub4.billing_status === 'active') {
          const renewalDate4 = existingSub4.renewal_date;
          const dateStr4 = renewalDate4 ? new Date(renewalDate4).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'ALREADY_ACTIVE',
            message: `You already have an active ${plan} subscription until ${dateStr4}.`
          }));
          return;
        }

        // Block downgrades via this endpoint (must use /api/subscription/downgrade)
        if (newIdx4 < currentIdx4) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'UPGRADE_REQUIRED',
            message: 'Please use the downgrade endpoint to switch to a lower plan.'
          }));
          return;
        }

        // Calculate prorated credit if upgrading from an active paid plan
        let proratedCredit4 = 0;
        if (currentIdx4 > 0 && existingSub4 && existingSub4.billing_status === 'active') {
          const now4 = new Date();
          const startDate4 = new Date(existingSub4.plan_start_date);
          const renewal4 = existingSub4.renewal_date ? new Date(existingSub4.renewal_date) : null;
          if (renewal4 && renewal4 > now4) {
            const totalMs4 = renewal4 - startDate4;
            const remainingMs4 = renewal4 - now4;
            if (totalMs4 > 0 && remainingMs4 > 0) {
              const oldPlanRes4 = await pool.query('SELECT * FROM organizer_plans WHERE name = $1', [user.tier]);
              if (oldPlanRes4.rows.length > 0) {
                const oldCycle4 = existingSub4.billing_cycle || 'monthly';
                const oldPrice4 = oldCycle4 === 'yearly' ? oldPlanRes4.rows[0].yearly_price : oldPlanRes4.rows[0].monthly_price;
                proratedCredit4 = Math.round(oldPrice4 * (remainingMs4 / totalMs4));
              }
            }
          }
        }
        // ── End Validation ─────────────────────────────────────────────

        // Get plan details
        const planRes = await pool.query('SELECT * FROM organizer_plans WHERE name = $1', [plan]);
        if (planRes.rows.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'PLAN_NOT_FOUND' }));
          return;
        }
        const planDetails = planRes.rows[0];
        const planId = planDetails.id;

        // Calculate price
        const cycle = billingCycle || 'monthly';
        const price = cycle === 'yearly' ? planDetails.yearly_price : planDetails.monthly_price;
        const finalAmount = Math.max(0, price - proratedCredit4);

        // Calculate renewal date
        const renewalDate = new Date();
        if (cycle === 'monthly') {
          renewalDate.setMonth(renewalDate.getMonth() + 1);
        } else {
          renewalDate.setFullYear(renewalDate.getFullYear() + 1);
        }

        // Update user tier
        await pool.query('UPDATE users SET tier = $1 WHERE id = $2', [plan, user.id]);

        // Upsert subscription
        const subId = 'SUB-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO subscriptions (id, organizer_id, plan_id, billing_status, billing_cycle, plan_start_date, renewal_date)
           VALUES ($1, $2, $3, 'active', $4, CURRENT_TIMESTAMP, $5)
           ON CONFLICT (organizer_id) DO UPDATE SET
             plan_id = EXCLUDED.plan_id,
             billing_cycle = EXCLUDED.billing_cycle,
             billing_status = 'active',
             plan_start_date = CURRENT_TIMESTAMP,
             renewal_date = EXCLUDED.renewal_date,
             cancelled_at = NULL`,
          [subId, user.id, planId, cycle, renewalDate]
        );

        // Record billing history for paid plans
        if (price > 0) {
          const billId = 'BILL-' + crypto.randomBytes(6).toString('hex').toUpperCase();
          await pool.query(
            `INSERT INTO billing_history (id, organizer_id, plan_name, billing_cycle, amount, status)
             VALUES ($1, $2, $3, $4, $5, 'completed')`,
            [billId, user.id, plan, cycle, price]
          );
        }

        console.log(`\n📦 [SUBSCRIPTION] User ${user.id} upgraded to ${plan} (${cycle})\n`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Successfully upgraded to ${plan} plan!`,
          subscription: {
            plan,
            billingCycle: cycle,
            renewalDate,
            price,
            proratedCredit: proratedCredit4,
            finalAmount
          }
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/subscription/downgrade - Downgrade to a lower plan
  if (req.url === '/api/subscription/downgrade' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }

        const { plan } = JSON.parse(body);
        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
          return;
        }
        const user = userRes.rows[0];

        const planRes = await pool.query('SELECT * FROM organizer_plans WHERE name = $1', [plan]);
        if (planRes.rows.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'PLAN_NOT_FOUND' }));
          return;
        }
        const planDetails = planRes.rows[0];

        const PLAN_ORDER = ['Free', 'Basic', 'Pro'];
        const currentIdx = PLAN_ORDER.indexOf(user.tier);
        const targetIdx = PLAN_ORDER.indexOf(plan);

        // Same-plan check
        if (user.tier === plan) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SAME_PLAN', message: `You are already on the ${plan} plan.` }));
          return;
        }

        // Block upgrade through downgrade endpoint
        if (targetIdx > currentIdx) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UPGRADE_ONLY', message: 'Please use the upgrade endpoint to move to a higher plan.' }));
          return;
        }

        // Block downgrade while active paid subscription exists
        const subRes = await pool.query('SELECT * FROM subscriptions WHERE organizer_id = $1', [user.id]);
        const existingSub = subRes.rows[0];
        if (existingSub && existingSub.billing_status === 'active' && currentIdx > 0 && targetIdx < currentIdx) {
          const expiryDate = existingSub.renewal_date
            ? new Date(existingSub.renewal_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'N/A';
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'DOWNGRADE_BLOCKED',
            message: `Your ${user.tier} subscription remains active until ${expiryDate}. Downgrading is available after expiry.`
          }));
          return;
        }

        // Update user tier
        await pool.query('UPDATE users SET tier = $1 WHERE id = $2', [plan, user.id]);

        // Get existing subscription or create new one
        if (subRes.rows.length > 0) {
          await pool.query(
            `UPDATE subscriptions SET plan_id = $1, billing_status = 'active' WHERE organizer_id = $2`,
            [planDetails.id, user.id]
          );
        } else {
          const subId = 'SUB-' + crypto.randomBytes(6).toString('hex').toUpperCase();
          await pool.query(
            `INSERT INTO subscriptions (id, organizer_id, plan_id, billing_status, billing_cycle)
             VALUES ($1, $2, $3, 'active', 'monthly')`,
            [subId, user.id, planDetails.id]
          );
        }

        console.log(`\n📦 [SUBSCRIPTION] User ${user.id} downgraded to ${plan}\n`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Downgraded to ${plan} plan. Some features may be limited.`
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/subscription/cancel - Cancel subscription (blocked for active paid plans)
  if (req.url === '/api/subscription/cancel' && req.method === 'POST') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }

      const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
        return;
      }
      const user = userRes.rows[0];

      // Block cancellation for active paid subscriptions
      if (user.tier !== 'Free') {
        const subRes = await pool.query('SELECT * FROM subscriptions WHERE organizer_id = $1', [user.id]);
        const existingSub = subRes.rows[0];
        if (existingSub && existingSub.billing_status === 'active') {
          const expiryDate = existingSub.renewal_date
            ? new Date(existingSub.renewal_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'N/A';
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'CANCEL_BLOCKED',
            message: `Your ${user.tier} subscription remains active until ${expiryDate}. Cancellation is available after expiry.`
          }));
          return;
        }
      }

      await pool.query(
        `UPDATE subscriptions SET billing_status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP WHERE organizer_id = $1`,
        [user.id]
      );
      await pool.query('UPDATE users SET tier = $1 WHERE id = $2', ['Free', user.id]);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Subscription cancelled. You have been moved to the Free plan.'
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/subscription/switch-cycle - Toggle monthly/yearly
  if (req.url === '/api/subscription/switch-cycle' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }

        const { billingCycle } = JSON.parse(body);
        if (!['monthly', 'yearly'].includes(billingCycle)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_CYCLE' }));
          return;
        }

        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
          return;
        }
        const user = userRes.rows[0];

        // Calculate new renewal date
        const renewalDate = new Date();
        if (billingCycle === 'monthly') {
          renewalDate.setMonth(renewalDate.getMonth() + 1);
        } else {
          renewalDate.setFullYear(renewalDate.getFullYear() + 1);
        }

        await pool.query(
          `UPDATE subscriptions SET billing_cycle = $1, renewal_date = $2 WHERE organizer_id = $3`,
          [billingCycle, renewalDate, user.id]
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Billing cycle switched to ${billingCycle}.`,
          renewalDate
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // GET /api/subscription/usage - Get usage statistics
  if (req.url === '/api/subscription/usage' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }

      const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
        return;
      }

      const usage = await getOrganizerUsage(pool, userRes.rows[0].id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, usage }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // GET /api/subscription/features - Check feature access
  if (req.url === '/api/subscription/features' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }

      const userRes = await pool.query('SELECT tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
        return;
      }

      const tier = userRes.rows[0].tier || 'Free';
      const features = PLAN_FEATURES[tier] || PLAN_FEATURES.Free;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, tier, features }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ========================
  // STAFF MANAGEMENT API
  // ========================

  // GET /api/organizer/staff - List staff members
  if (req.url === '/api/organizer/staff' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;

      const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false })); return; }

      const dbRes = await pool.query(
        'SELECT * FROM staff_members WHERE organizer_id = $1 ORDER BY invited_at DESC',
        [userRes.rows[0].id]
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, staff: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/organizer/staff - Invite staff member
  if (req.url === '/api/organizer/staff' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!requireOrganizer(req, res, authUser)) return;

        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false })); return; }
        const user = userRes.rows[0];
        const plan = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;

        if (!plan.staffManagement) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Staff management is only available on Basic and Pro plans.', limitType: 'staff' }));
          return;
        }

        // Check staff limit
        const staffCountRes = await pool.query(
          'SELECT COUNT(*) FROM staff_members WHERE organizer_id = $1 AND status = $2',
          [user.id, 'active']
        );
        const staffCount = parseInt(staffCountRes.rows[0].count);
        if (staffCount >= plan.staffLimit) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'STAFF_LIMIT_REACHED', limitType: 'staff', limitValue: plan.staffLimit, message: `Staff limit reached (${plan.staffLimit}). Upgrade to add more.` }));
          return;
        }

        const data = JSON.parse(body);
        const staffId = 'STF-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        const dbRes = await pool.query(
          `INSERT INTO staff_members (id, organizer_id, name, email, role, permissions)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [staffId, user.id, data.name, data.email, data.role || 'staff', data.permissions || '{}']
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, staff: dbRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // DELETE /api/organizer/staff/:id - Remove staff member
  const staffDeleteMatch = req.url.match(/^\/api\/organizer\/staff\/([^/]+)$/);
  if (staffDeleteMatch && req.method === 'DELETE') {
    const staffId = staffDeleteMatch[1];
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;

      await pool.query('DELETE FROM staff_members WHERE id = $1', [staffId]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Staff member removed.' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ========================
  // PRO FEATURES API
  // ========================

  // API Keys endpoints
  if (req.url === '/api/api-keys' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;

      const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false })); return; }

      const plan = PLAN_FEATURES[userRes.rows[0].tier || 'Free'] || PLAN_FEATURES.Free;
      if (!plan.apiAccess) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'API access is only available on the Pro plan.', limitType: 'api' }));
        return;
      }

      const dbRes = await pool.query(
        'SELECT id, key_prefix, name, permissions, usage_count, last_used_at, status, created_at FROM api_keys WHERE organizer_id = $1 ORDER BY created_at DESC',
        [userRes.rows[0].id]
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, keys: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (req.url === '/api/api-keys' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!requireOrganizer(req, res, authUser)) return;

        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false })); return; }

        const plan = PLAN_FEATURES[userRes.rows[0].tier || 'Free'] || PLAN_FEATURES.Free;
        if (!plan.apiAccess) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', limitType: 'api' }));
          return;
        }

        const data = JSON.parse(body);
        const rawKey = 'md_' + crypto.randomBytes(24).toString('hex');
        const keyPrefix = rawKey.substring(0, 10);
        const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
        const keyId = 'API-' + crypto.randomBytes(6).toString('hex').toUpperCase();

        await pool.query(
          `INSERT INTO api_keys (id, organizer_id, key_prefix, key_hash, name, permissions)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [keyId, userRes.rows[0].id, keyPrefix, keyHash, data.name || 'API Key', data.permissions || '{}']
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, key: { id: keyId, key_prefix: keyPrefix, name: data.name || 'API Key', rawKey }, message: 'Save this key now. It will not be shown again.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // DELETE /api/api-keys/:id - Revoke API key
  const apiKeyDeleteMatch = req.url.match(/^\/api\/api-keys\/([^/]+)$/);
  if (apiKeyDeleteMatch && req.method === 'DELETE') {
    const keyId = apiKeyDeleteMatch[1];
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;

      await pool.query(
        `UPDATE api_keys SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [keyId]
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'API key revoked.' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // Subdomain endpoints
  if (req.url === '/api/subdomains/check' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!requireOrganizer(req, res, authUser)) return;

        const { subdomain } = JSON.parse(body);
        if (!subdomain || !/^[a-z0-9-]{3,63}$/.test(subdomain)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_SUBDOMAIN', message: 'Subdomain must be 3-63 alphanumeric characters or hyphens.' }));
          return;
        }

        const existRes = await pool.query('SELECT id FROM custom_subdomains WHERE subdomain = $1', [subdomain]);
        const available = existRes.rows.length === 0;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, available, subdomain }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (req.url === '/api/subdomains' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!requireOrganizer(req, res, authUser)) return;

        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false })); return; }

        const plan = PLAN_FEATURES[userRes.rows[0].tier || 'Free'] || PLAN_FEATURES.Free;
        if (!plan.customSubdomain) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', limitType: 'subdomain' }));
          return;
        }

        const { subdomain } = JSON.parse(body);
        const existRes = await pool.query('SELECT id FROM custom_subdomains WHERE subdomain = $1', [subdomain]);
        if (existRes.rows.length > 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SUBDOMAIN_TAKEN' }));
          return;
        }

        const subId = 'SUBD-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO custom_subdomains (id, organizer_id, subdomain, ssl_status, cname_verified)
           VALUES ($1, $2, $3, 'pending', false)
           ON CONFLICT (organizer_id) DO UPDATE SET subdomain = EXCLUDED.subdomain, ssl_status = 'pending', cname_verified = false`,
          [subId, userRes.rows[0].id, subdomain]
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, subdomain, message: `Subdomain ${subdomain}.matchdistrict.com claimed!` }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // GET /api/subdomains/my - Get organizer's subdomains
  if (req.url === '/api/subdomains/my' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;

      const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false })); return; }

      const dbRes = await pool.query(
        'SELECT * FROM custom_subdomains WHERE organizer_id = $1',
        [userRes.rows[0].id]
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, subdomains: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // White-label endpoints
  if (req.url === '/api/white-label' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;

      const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false })); return; }

      const plan = PLAN_FEATURES[userRes.rows[0].tier || 'Free'] || PLAN_FEATURES.Free;
      if (!plan.whiteLabel) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', limitType: 'whiteLabel' }));
        return;
      }

      const dbRes = await pool.query('SELECT * FROM white_label_settings WHERE organizer_id = $1', [userRes.rows[0].id]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, settings: dbRes.rows[0] || null }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (req.url === '/api/white-label' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!requireOrganizer(req, res, authUser)) return;

        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false })); return; }

        const plan = PLAN_FEATURES[userRes.rows[0].tier || 'Free'] || PLAN_FEATURES.Free;
        if (!plan.whiteLabel) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', limitType: 'whiteLabel' }));
          return;
        }

        const data = JSON.parse(body);
        const wlId = 'WL-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        const dbRes = await pool.query(
          `INSERT INTO white_label_settings (id, organizer_id, primary_color, secondary_color, logo_url, banner_url, favicon_url, custom_css, tournament_page_branded, hide_matchdistrict_branding)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (organizer_id) DO UPDATE SET
             primary_color = COALESCE($3, white_label_settings.primary_color),
             secondary_color = COALESCE($4, white_label_settings.secondary_color),
             logo_url = COALESCE($5, white_label_settings.logo_url),
             banner_url = COALESCE($6, white_label_settings.banner_url),
             favicon_url = COALESCE($7, white_label_settings.favicon_url),
             custom_css = COALESCE($8, white_label_settings.custom_css),
             tournament_page_branded = COALESCE($9, white_label_settings.tournament_page_branded),
             hide_matchdistrict_branding = COALESCE($10, white_label_settings.hide_matchdistrict_branding),
             updated_at = CURRENT_TIMESTAMP
           RETURNING *`,
          [wlId, userRes.rows[0].id, data.primaryColor || '#6366F1', data.secondaryColor || '#14B8A6',
            data.logoUrl || null, data.bannerUrl || null, data.faviconUrl || null, data.customCss || null,
            data.tournamentPageBranded || false, data.hideMatchdistrictBranding || false]
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, settings: dbRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Automation rules endpoints
  if (req.url === '/api/automation-rules' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;

      const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false })); return; }

      const plan = PLAN_FEATURES[userRes.rows[0].tier || 'Free'] || PLAN_FEATURES.Free;
      if (!plan.tournamentAutomation) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', limitType: 'automation' }));
        return;
      }

      const dbRes = await pool.query(
        'SELECT * FROM automation_rules WHERE organizer_id = $1 ORDER BY created_at DESC',
        [userRes.rows[0].id]
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, rules: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (req.url === '/api/automation-rules' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!requireOrganizer(req, res, authUser)) return;

        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false })); return; }

        const plan = PLAN_FEATURES[userRes.rows[0].tier || 'Free'] || PLAN_FEATURES.Free;
        if (!plan.tournamentAutomation) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', limitType: 'automation' }));
          return;
        }

        const data = JSON.parse(body);
        const ruleId = 'AUTO-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        const dbRes = await pool.query(
          `INSERT INTO automation_rules (id, organizer_id, name, trigger_event, action_type, action_config)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [ruleId, userRes.rows[0].id, data.name, data.triggerEvent, data.actionType, data.actionConfig || '{}']
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, rule: dbRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // DELETE /api/automation-rules/:id
  const autoDeleteMatch = req.url.match(/^\/api\/automation-rules\/([^/]+)$/);
  if (autoDeleteMatch && req.method === 'DELETE') {
    const ruleId = autoDeleteMatch[1];
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;

      await pool.query('DELETE FROM automation_rules WHERE id = $1', [ruleId]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Automation rule deleted.' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ========================
  // ADMIN SUBSCRIPTION MANAGEMENT
  // ========================

  // GET /api/admin/subscriptions - List all subscriptions
  if (req.url === '/api/admin/subscriptions' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }

      const dbRes = await pool.query(`
        SELECT s.*, u.name as user_name, u.email as user_email, u.tier, u.status as user_status
        FROM subscriptions s
        JOIN users u ON u.id = s.organizer_id
        ORDER BY s.created_at DESC
      `);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, subscriptions: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/admin/subscriptions/override - Admin override subscription
  if (req.url === '/api/admin/subscriptions/override' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }

        const { userId, plan, billingCycle, status } = JSON.parse(body);
        if (!plan || !['Free', 'Basic', 'Pro'].includes(plan)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_PLAN' }));
          return;
        }

        // Update user tier
        await pool.query('UPDATE users SET tier = $1 WHERE id = $2', [plan, userId]);

        // Update subscription
        const planRes = await pool.query('SELECT id FROM organizer_plans WHERE name = $1', [plan]);
        if (planRes.rows.length > 0) {
          const planId = planRes.rows[0].id;
          const subRes = await pool.query('SELECT id FROM subscriptions WHERE organizer_id = $1', [userId]);
          if (subRes.rows.length > 0) {
            await pool.query(
              `UPDATE subscriptions SET plan_id = $1, billing_status = $2, billing_cycle = $3, cancelled_at = NULL WHERE organizer_id = $4`,
              [planId, status || 'active', billingCycle || 'monthly', userId]
            );
          } else {
            const subId = 'SUB-' + crypto.randomBytes(6).toString('hex').toUpperCase();
            await pool.query(
              `INSERT INTO subscriptions (id, organizer_id, plan_id, billing_status, billing_cycle)
               VALUES ($1, $2, $3, $4, $5)`,
              [subId, userId, planId, status || 'active', billingCycle || 'monthly']
            );
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: `User subscription set to ${plan}.` }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // GET /api/admin/subscriptions/stats - Subscription statistics
  if (req.url === '/api/admin/subscriptions/stats' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }

      const planCounts = await pool.query(
        `SELECT tier, COUNT(*) as count FROM users WHERE 'organiser' = ANY(roles) GROUP BY tier`
      );
      const totalOrganizers = await pool.query(`SELECT COUNT(*) FROM users WHERE 'organiser' = ANY(roles)`);
      const monthlyRevenue = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM billing_history WHERE status = 'completed' AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)`
      );
      const activeSubscriptions = await pool.query(
        `SELECT COUNT(*) FROM subscriptions WHERE billing_status = 'active'`
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        stats: {
          totalOrganizers: parseInt(totalOrganizers.rows[0].count),
          activeSubscriptions: parseInt(activeSubscriptions.rows[0].count),
          monthlyRevenue: parseFloat(monthlyRevenue.rows[0].total),
          planDistribution: planCounts.rows
        }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- ADMIN GET PENDING REGISTRATIONS WITH TOURNAMENT GAME INFO ---
  if (req.url === '/api/admin/pending-registrations' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
        return;
      }

      const dbRes = await pool.query(`
        SELECT r.*, t.title AS tournament_title, t.game AS tournament_game,
               t.entry_fee_amount, ps.payment_status AS pay_status, ps.id AS payment_submission_id,
               ps.proof_url AS payment_proof_url, ps.utr_number AS payment_utr
        FROM tournament_registrations r
        JOIN tournaments t ON r.tournament_id = t.id
        LEFT JOIN payment_submissions ps ON ps.registration_id = r.id
        WHERE r.status IN ('pending', 'pending_payment', 'PENDING_PAYMENT_VERIFICATION')
        ORDER BY t.game, t.title, r.created_at ASC
      `);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, registrations: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- VERIFIER: GET PENDING PAYMENT REGISTRATIONS ---
  if (req.url === '/api/verifier/pending-payments' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasCapability(authUser, 'VERIFY_PAYMENTS')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Access denied: Requires Payment Verifier or Admin permissions.' }));
        return;
      }

      const dbRes = await pool.query(`
        SELECT r.*, t.title AS tournament_title, t.game AS tournament_game,
               t.entry_fee_amount, t.orgid AS tournament_org_id, t.orgname AS tournament_org_name,
               ps.payment_status AS pay_status, ps.id AS payment_submission_id,
               ps.proof_url AS payment_proof_url, ps.utr_number AS payment_utr,
               ps.payment_app AS pay_app, u.name AS user_name, u.email AS user_email
        FROM tournament_registrations r
        JOIN tournaments t ON r.tournament_id = t.id
        LEFT JOIN payment_submissions ps ON ps.registration_id = r.id
        LEFT JOIN users u ON u.id = r.user_id
        WHERE r.status IN ('pending_payment', 'PENDING_PAYMENT_VERIFICATION')
        ORDER BY t.game, t.title, r.created_at ASC
      `);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, registrations: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- VERIFIER: VERIFY A SINGLE REGISTRATION PAYMENT ---
  if (req.url.startsWith('/api/verifier/verify/') && req.method === 'POST') {
    const regId = req.url.split('/api/verifier/verify/')[1];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasCapability(authUser, 'VERIFY_PAYMENTS')) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Access denied: Requires Payment Verifier or Admin permissions.' }));
          return;
        }

        const regRes = await pool.query('SELECT * FROM tournament_registrations WHERE id = $1', [regId]);
        if (regRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Registration not found.' }));
          return;
        }

        const currentReg = regRes.rows[0];
        if (currentReg.status !== 'pending_payment' && currentReg.status !== 'PENDING_PAYMENT_VERIFICATION') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_STATUS', message: 'Registration is not awaiting payment verification.' }));
          return;
        }

        const data = JSON.parse(body);
        const paymentApp = data.payment_app || currentReg.payment_app || null;

        // Update registration to VERIFIED_BY_HOST
        await pool.query(
          `UPDATE tournament_registrations SET status = 'VERIFIED_BY_HOST', payment_app = COALESCE($1, payment_app), updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [paymentApp, regId]
        );

        // Update payment_submissions if linked
        if (currentReg.payment_id) {
          await pool.query(
            `UPDATE payment_submissions SET payment_status = 'verified_by_host', reviewed_by = $1, reviewed_at = NOW() WHERE id = $2`,
            [authUser.id, currentReg.payment_id]
          );
        }

        // Alert the registering user
        try {
          const alertId = 'ALT-' + crypto.randomBytes(6).toString('hex').toUpperCase();
          await pool.query(
            `INSERT INTO alerts (id, user_id, title, message, is_read)
             VALUES ($1, $2, $3, $4, false)`,
            [alertId, currentReg.user_id, 'Payment Verified',
             `Your payment for team "${currentReg.team_name}" has been verified. Pending final approval from the tournament organizer.`]
          );
        } catch (alertErr) { /* non-critical */ }

        // Audit log
        try {
          const logId = 'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
          await pool.query(
            `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [logId, authUser.id, 'payment_verified_by_host', 'registration', regId,
             JSON.stringify({ teamName: currentReg.team_name, tournamentId: currentReg.tournament_id, paymentApp })]
          );
        } catch (logErr) { /* non-critical */ }

        console.log(`\n📦 [VERIFIER] Registration "${regId}" verified by ${authUser.id}. Status → VERIFIED_BY_HOST\n`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Payment verified successfully. Status set to VERIFIED_BY_HOST.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // --- ADMIN: BULK APPROVE VERIFIED REGISTRATIONS ---
  if (req.url === '/api/admin/bulk-approve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
          return;
        }

        const { registrationIds } = JSON.parse(body);
        if (!registrationIds || !Array.isArray(registrationIds) || registrationIds.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Registration IDs array is required.' }));
          return;
        }

        const results = { approved: [], skipped: [], errors: [] };

        for (const regId of registrationIds) {
          try {
            const regRes = await pool.query('SELECT * FROM tournament_registrations WHERE id = $1', [regId]);
            if (regRes.rows.length === 0) {
              results.skipped.push({ id: regId, reason: 'Not found' });
              continue;
            }

            const reg = regRes.rows[0];
            if (reg.status !== 'VERIFIED_BY_HOST') {
              results.skipped.push({ id: regId, reason: `Status is "${reg.status}", not VERIFIED_BY_HOST` });
              continue;
            }

            await pool.query(
              `UPDATE tournament_registrations SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
              [regId]
            );

            // Update payment_submissions if linked
            if (reg.payment_id) {
              await pool.query(
                `UPDATE payment_submissions SET payment_status = 'verified', reviewed_by = $1, reviewed_at = NOW() WHERE id = $2`,
                [authUser.id, reg.payment_id]
              );
            }

            // Alert the user
            try {
              const tRes = await pool.query('SELECT title FROM tournaments WHERE id = $1', [reg.tournament_id]);
              const tourneyTitle = tRes.rows[0]?.title || 'Tournament';
              const alertId = 'ALT-' + crypto.randomBytes(6).toString('hex').toUpperCase();
              await pool.query(
                `INSERT INTO alerts (id, user_id, title, message, tournament_id)
                 VALUES ($1, $2, $3, $4, $5)`,
                [alertId, reg.user_id, 'Registration Approved',
                 `Your team "${reg.team_name}" has been approved for ${tourneyTitle}!`,
                 reg.tournament_id]
              );
            } catch (alertErr) { /* non-critical */ }

            // Analytics event
            try {
              await pool.query(
                `INSERT INTO analytics_events (id, organizer_id, event_type, event_data, tournament_id)
                 VALUES ($1, $2, $3, $4, $5)`,
                ['AE-' + crypto.randomBytes(6).toString('hex').toUpperCase(), authUser.id, 'registration_bulk_approved',
                 JSON.stringify({ teamName: reg.team_name, captain: reg.captain, verifiedBy: reg.id }), reg.tournament_id]
              );
            } catch (aeErr) { /* analytics non-critical */ }

            results.approved.push(regId);
          } catch (err) {
            results.errors.push({ id: regId, error: err.message });
          }
        }

        // Reconcile slots for each affected tournament
        const tournamentIds = [...new Set(registrationIds.map(id => id.split('-')[0] === id ? null : null))]; // placeholder
        // Actually fetch tournament_ids from DB for the approved regs
        const tIdsRes = await pool.query(
          `SELECT DISTINCT tournament_id FROM tournament_registrations WHERE id = ANY($1)`,
          [registrationIds]
        );
        for (const row of tIdsRes.rows) {
          await reconcileTournamentSlots(pool, row.tournament_id);
        }

        // Audit log
        try {
          const logId = 'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
          await pool.query(
            `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [logId, authUser.id, 'bulk_approve_registrations', 'registration', 'bulk',
             JSON.stringify({ approvedCount: results.approved.length, skippedCount: results.skipped.length, errorCount: results.errors.length })]
          );
        } catch (logErr) { /* non-critical */ }

        console.log(`\n📦 [ADMIN] Bulk approved ${results.approved.length} registrations (${results.skipped.length} skipped, ${results.errors.length} errors)\n`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, results }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // --- ADMIN: BULK APPROVE ALL VERIFIED REGISTRATIONS (Approve All) ---
  if (req.url === '/api/admin/bulk-approve-all' && req.method === 'POST') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
        return;
      }

      // Fetch all registrations staged as VERIFIED_BY_HOST
      const pendingRes = await pool.query(
        `SELECT r.*, t.title AS tournament_title, t.game AS tournament_game
         FROM tournament_registrations r
         JOIN tournaments t ON r.tournament_id = t.id
         WHERE r.status = 'VERIFIED_BY_HOST'
         ORDER BY r.created_at ASC`
      );

      if (pendingRes.rows.length === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'No pending verifications found to approve.', approvedCount: 0 }));
        return;
      }

      const ids = pendingRes.rows.map(r => r.id);
      const approvedCount = ids.length;

      // Atomically approve all
      await pool.query(
        `UPDATE tournament_registrations SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE status = 'VERIFIED_BY_HOST'`
      );

      // Update linked payment_submissions
      for (const reg of pendingRes.rows) {
        if (reg.payment_id) {
          await pool.query(
            `UPDATE payment_submissions SET payment_status = 'verified', reviewed_by = $1, reviewed_at = NOW() WHERE id = $2`,
            [authUser.id, reg.payment_id]
          );
        }
      }

      // Notify each user and reconcile slots
      const tournamentIds = new Set();
      for (const reg of pendingRes.rows) {
        tournamentIds.add(reg.tournament_id);
        try {
          const alertId = 'ALT-' + crypto.randomBytes(6).toString('hex').toUpperCase();
          await pool.query(
            `INSERT INTO alerts (id, user_id, title, message, tournament_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [alertId, reg.user_id, 'Registration Approved',
             `Your team "${reg.team_name}" has been approved for ${reg.tournament_title}!`,
             reg.tournament_id]
          );
        } catch (alertErr) { /* non-critical */ }
      }

      // Reconcile slots for each affected tournament
      for (const tid of tournamentIds) {
        await reconcileTournamentSlots(pool, tid);
      }

      // Audit log
      try {
        const logId = 'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [logId, authUser.id, 'approve_all_verified', 'registration', 'bulk',
           JSON.stringify({ approvedCount, tournamentsAffected: tournamentIds.size })]
        );
      } catch (logErr) { /* non-critical */ }

      console.log(`\n📦 [ADMIN] Bulk approved ALL ${approvedCount} VERIFIED_BY_HOST registrations across ${tournamentIds.size} tournaments.\n`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: `Successfully approved all ${approvedCount} staged registrations.`,
        approvedCount,
        tournamentsAffected: tournamentIds.size
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- POST DYNAMIC SYSTEM PURGE (ADMIN ONLY) ---
  if (req.url === '/api/admin/purge' && req.method === 'POST') {
    const client = await pool.connect();
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
        client.release();
        return;
      }

      await client.query('BEGIN');

      // Delete registrations, notices, chat messages, tournaments, applications, transactions
      await client.query('DELETE FROM tournament_registrations');
      await client.query('DELETE FROM tournament_messages');
      await client.query('DELETE FROM tournament_notices');
      await client.query('DELETE FROM tournaments');
      await client.query('DELETE FROM organizer_applications');
      await client.query('DELETE FROM wallet_transactions');

      // Reset all players' wallet balances
      await client.query('UPDATE users SET wallet_balance = 0.00');

      await client.query('COMMIT');

      console.log('🛡️ [ADMIN COMMAND] Platform test & mock data purged to clean production state.');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'All database test data purged successfully!' }));
    } catch (err) {
      await client.query('ROLLBACK');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    } finally {
      client.release();
    }
    return;
  }

  // --- FULL DATABASE PURGE (ADMIN ONLY, DANGER ZONE) — Isolated Sequential Loop ---
  if (req.url === '/api/admin/purge-database' && req.method === 'POST') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
        return;
      }

      // Each table is TRUNCATE'd in isolation. CASCADE resolves FK dependencies automatically.
      // A missing table fails quietly without affecting the rest.
      const tablesToWipe = [
        'subscriptions',
        'alerts',
        'staff_members',
        'team_presets',
        'organiser_followers',
        'payment_verifications',
        'billing_history',
        'payment_submissions',
        'registration_sessions',
        'wallet_transactions',
        'export_usage_log',
        'api_keys',
        'custom_subdomains',
        'white_label_settings',
        'plan_upgrade_requests',
        'analytics_events',
        'tournament_registrations',
        'tournament_notices',
        'tournament_messages',
        'automation_rules',
        'sponsor_contributions',
        'slot_grid',
        'room_credentials',
        'sponsor_list',
        'sponsor_requests',
        'admin_action_log',
        'admin_subscription_log',
        'otps',
        'password_resets',
        'temp_users',
        'registration_cooldowns',
        'tournaments',
        'organizer_applications',
        'registrations',
        'notices',
        'organizer_profiles',
        'site_settings'
      ];

      let wipedCount = 0;
      let failedCount = 0;

      for (const tableName of tablesToWipe) {
        try {
          await pool.query(`TRUNCATE TABLE "${tableName}" CASCADE;`);
          wipedCount++;
        } catch (error) {
          console.warn(`[PURGE] Skipped table "${tableName}": relation might not exist.`);
          failedCount++;
        }
      }

      // Users table is special — preserve admin accounts so the platform isn't orphaned
      try {
        await pool.query(`DELETE FROM users WHERE role != 'admin'`);
        wipedCount++;
      } catch (error) {
        console.warn(`[PURGE] Could not delete from "users": ${error.message}`);
        failedCount++;
      }

      // Re-seed default site settings
      try {
        await pool.query(`
          INSERT INTO site_settings (key, value, updated_at) VALUES
            ('theme', 'dark', CURRENT_TIMESTAMP),
            ('platform_fee_percentage', '10', CURRENT_TIMESTAMP),
            ('organizer_fee_percentage', '5', CURRENT_TIMESTAMP)
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
        `);
      } catch (error) {
        console.warn(`[PURGE] Could not re-seed site_settings: ${error.message}`);
      }

      console.log(`🛡️ [ADMIN COMMAND] Full database purge executed. Wiped ${wipedCount} tables, skipped ${failedCount}.`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'CRITICAL ALARM: Database has been entirely wiped.',
        details: `Successfully wiped ${wipedCount} tables. Skipped ${failedCount} tables.`
      }));
    } catch (err) {
      console.error('❌ [ADMIN COMMAND] Database purge failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- GET DYNAMIC SYSTEM ACTIVITY LOGS (ADMIN ONLY) ---
  if (req.url === '/api/admin/activity-log' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
        return;
      }

      const usersRes = await pool.query('SELECT name, email, created_at FROM users ORDER BY created_at DESC LIMIT 3');
      const orgsRes = await pool.query('SELECT "orgName", submitted_at FROM organizer_applications ORDER BY submitted_at DESC LIMIT 3');
      const tourneysRes = await pool.query('SELECT title, created_at FROM tournaments ORDER BY created_at DESC LIMIT 3');

      const logs = [];

      usersRes.rows.forEach(u => {
        logs.push({
          text: `New gamer account registered: "${u.name || u.email.split('@')[0]}"`,
          time: u.created_at,
          icon: 'person_add',
          color: 'text-primary'
        });
      });

      orgsRes.rows.forEach(o => {
        logs.push({
          text: `New organizer KYC application submitted by "${o.orgName}"`,
          time: o.submitted_at,
          icon: 'how_to_reg',
          color: 'text-amber-400'
        });
      });

      tourneysRes.rows.forEach(t => {
        logs.push({
          text: `New tournament arena created: "${t.title}"`,
          time: t.created_at,
          icon: 'stadium',
          color: 'text-secondary'
        });
      });

      logs.sort((a, b) => new Date(b.time) - new Date(a.time));

      const logsWithRelativeTime = logs.map(l => {
        const diffMs = new Date() - new Date(l.time);
        const diffMin = Math.floor(diffMs / 60000);
        const diffHr = Math.floor(diffMin / 60);
        let timeStr = 'Just now';
        if (diffMin > 0 && diffMin < 60) timeStr = `${diffMin}m ago`;
        else if (diffHr > 0 && diffHr < 24) timeStr = `${diffHr}h ago`;
        else if (diffHr >= 24) timeStr = `${Math.floor(diffHr / 24)}d ago`;

        return {
          text: l.text,
          time: timeStr,
          icon: l.icon,
          color: l.color
        };
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, logs: logsWithRelativeTime }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- GET DYNAMIC SYSTEM FINANCIALS (ADMIN ONLY) ---
  if (req.url === '/api/admin/financials' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
        return;
      }

      const tournamentsRes = await pool.query(
        `SELECT id, prize, entry, "slotsFilled", status FROM tournaments WHERE status IN ('live', 'upcoming')`
      );

      // Fetch dynamic platform fee percentage
      const feeRes = await pool.query(`SELECT value FROM site_settings WHERE key = 'platform_fee_percentage'`);
      const platformFeePercentage = feeRes.rows.length > 0 ? parseFloat(feeRes.rows[0].value) : 10;
      const commissionRate = platformFeePercentage / 100;

      let totalPrizePools = 0;
      let totalAvailableCommission = 0;
      let activeTourneysCount = 0;

      tournamentsRes.rows.forEach(t => {
        const prizeNum = parseInt(String(t.prize).replace(/[^0-9]/g, '')) || 0;
        const entryNum = parseInt(String(t.entry).replace(/[^0-9]/g, '')) || 0;
        const slots = parseInt(t.slotsFilled) || 0;

        totalPrizePools += prizeNum;
        totalAvailableCommission += (entryNum * slots) * commissionRate;
        activeTourneysCount++;
      });

      // All-time historical metrics (all statuses including completed/archived)
      const allTimeRes = await pool.query(
        `SELECT prize, entry, "slotsFilled", status FROM tournaments WHERE status != 'draft'`
      );
      let allTimePrizePool = 0;
      let allTimeCommission = 0;
      allTimeRes.rows.forEach(t => {
        const prizeNum = parseInt(String(t.prize).replace(/[^0-9]/g, '')) || 0;
        const entryNum = parseInt(String(t.entry).replace(/[^0-9]/g, '')) || 0;
        const slots = parseInt(t.slotsFilled) || 0;
        allTimePrizePool += prizeNum;
        allTimeCommission += (entryNum * slots) * commissionRate;
      });
      const totalHostedArenas = allTimeRes.rows.length;

      const txnRes = await pool.query('SELECT * FROM wallet_transactions ORDER BY created_at DESC LIMIT 10');
      const ledgers = txnRes.rows.map(tx => ({
        id: tx.id,
        desc: tx.description,
        type: tx.type,
        amount: `₹${Number(tx.amount).toLocaleString('en-IN')}`,
        date: new Date(tx.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
        status: tx.status
      }));

      // Compute actual daily signup trajectory (last 10 days)
      const signupsRes = await pool.query(`
        SELECT DATE_TRUNC('day', created_at) as day, COUNT(*) as count 
        FROM users 
        GROUP BY day 
        ORDER BY day DESC 
        LIMIT 10
      `);

      // Compute actual daily registrations trajectory (last 10 days)
      const regsRes = await pool.query(`
        SELECT DATE_TRUNC('day', created_at) as day, COUNT(*) as count 
        FROM tournament_registrations 
        GROUP BY day 
        ORDER BY day DESC 
        LIMIT 10
      `);

      const engagementCurve = new Array(10).fill(0);
      signupsRes.rows.forEach((row, idx) => {
        if (idx < 10) engagementCurve[9 - idx] = parseInt(row.count) || 0;
      });

      const totalUsersRes = await pool.query('SELECT COUNT(*) FROM users');
      const totalUsers = parseInt(totalUsersRes.rows[0].count) || 0;
      if (engagementCurve.reduce((a, b) => a + b, 0) === 0) {
        engagementCurve[9] = totalUsers;
      }

      const trafficBars = new Array(10).fill(0);
      regsRes.rows.forEach((row, idx) => {
        if (idx < 10) trafficBars[9 - idx] = parseInt(row.count) || 0;
      });

      const totalRegsRes = await pool.query('SELECT COUNT(*) FROM tournament_registrations');
      const totalRegs = parseInt(totalRegsRes.rows[0].count) || 0;
      if (trafficBars.reduce((a, b) => a + b, 0) === 0) {
        trafficBars[9] = totalRegs;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        totalOperationalRevenue: totalAvailableCommission,
        totalPrizePools,
        activeTourneysCount,
        platformFeePercentage,
        allTimePrizePool,
        allTimeCommission,
        totalHostedArenas,
        ledger: ledgers,
        engagementCurve,
        trafficBars
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── HEALTH CHECK ENDPOINT ──────────────────────────────────────────────────
  if (req.url === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, status: 'healthy', timestamp: new Date().toISOString() }));
    return;
  }

  // ── ABUSE TRACKER: GET bad_words list (public – needed by the frontend worker) ──
  if (req.url === '/api/admin/badwords' && req.method === 'GET') {
    try {
      const result = await pool.query(`SELECT value FROM site_settings WHERE key = 'bad_words'`);
      const raw = result.rows[0]?.value || '[]';
      let words = [];
      try { words = JSON.parse(raw); } catch { words = []; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, words }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── ABUSE TRACKER: PUT bad_words list (admin only) ──────────────────────────
  if (req.url === '/api/admin/badwords' && req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
          return;
        }
        const { words } = JSON.parse(body);
        if (!Array.isArray(words)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'words must be an array of strings.' }));
          return;
        }
        // Sanitize: lowercase, trim, deduplicate, max 2000 words
        const sanitized = [...new Set(
          words.map(w => String(w).toLowerCase().trim()).filter(w => w.length > 0 && w.length <= 100)
        )].slice(0, 2000);

        await pool.query(
          `INSERT INTO site_settings (key, value, updated_at) VALUES ('bad_words', $1, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
          [JSON.stringify(sanitized)]
        );
        console.log(`🛡️ [ABUSE TRACKER] Admin updated bad words list. Total: ${sanitized.length} words.`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: sanitized.length, words: sanitized }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── SPONSOR: Submit prize pool request ──────────────────────────────────
  if (req.url === '/api/sponsor/request' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }
        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
        const user = userRes.rows[0];
        const plan = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;
        if (!plan.sponsorSections) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Sponsor sections are only available on Basic and Pro plans.' }));
          return;
        }
        const { tournamentId, prizePoolAmount, description } = JSON.parse(body);
        const id = 'SP-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO sponsor_requests (id, organizer_id, tournament_id, prize_pool_amount, description, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')`,
          [id, user.id, tournamentId || null, prizePoolAmount || 0, description || '']
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, id }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── SPONSOR: List organizer's sponsor requests ───────────────────────────
  if (req.url === '/api/sponsor/requests' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const user = userRes.rows[0];
      const dbRes = await pool.query(
        'SELECT * FROM sponsor_requests WHERE organizer_id = $1 ORDER BY created_at DESC',
        [user.id]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, requests: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── ADMIN SPONSOR: List all sponsor requests ─────────────────────────────
  if (req.url.startsWith('/api/admin/sponsor/requests') && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }
      const statusFilter = req.url.includes('?status=') ? req.url.split('?status=')[1].split('&')[0] : null;
      let query = `
        SELECT sr.*, u.name as organizer_name, u.email as organizer_email
        FROM sponsor_requests sr
        JOIN users u ON u.id = sr.organizer_id
      `;
      const params = [];
      if (statusFilter) {
        query += ' WHERE sr.status = $1';
        params.push(statusFilter);
      }
      query += ' ORDER BY sr.created_at DESC';
      const dbRes = await pool.query(query, params);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, requests: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── ADMIN SPONSOR: Approve sponsor request ───────────────────────────────
  if (req.url === '/api/admin/sponsor/approve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }
        const { requestId, adminNotes } = JSON.parse(body);
        if (!requestId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT' }));
          return;
        }
        const reqRes = await pool.query('SELECT * FROM sponsor_requests WHERE id = $1', [requestId]);
        if (reqRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
          return;
        }
        const sponsorReq = reqRes.rows[0];
        await pool.query(
          `UPDATE sponsor_requests SET status = 'approved', admin_id = $1, admin_notes = $2, reviewed_at = CURRENT_TIMESTAMP WHERE id = $3`,
          [authUser.id, adminNotes || '', requestId]
        );
        const alertId = 'ALT-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO alerts (id, user_id, title, message, is_read)
           VALUES ($1, $2, $3, $4, false)`,
          [alertId, sponsorReq.organizer_id, 'Sponsorship Approved', 'Your prize pool sponsorship request has been approved!']
        );
        const logId = 'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details)
           VALUES ($1, $2, 'sponsor_approve', 'sponsor_request', $3, $4)`,
          [logId, authUser.id, requestId, JSON.stringify({ adminNotes: adminNotes || '' })]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Sponsor request approved.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── ADMIN SPONSOR: Reject sponsor request ────────────────────────────────
  if (req.url === '/api/admin/sponsor/reject' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }
        const { requestId, adminNotes } = JSON.parse(body);
        if (!requestId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT' }));
          return;
        }
        const reqRes = await pool.query('SELECT * FROM sponsor_requests WHERE id = $1', [requestId]);
        if (reqRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
          return;
        }
        const sponsorReq = reqRes.rows[0];
        await pool.query(
          `UPDATE sponsor_requests SET status = 'rejected', admin_id = $1, admin_notes = $2, reviewed_at = CURRENT_TIMESTAMP WHERE id = $3`,
          [authUser.id, adminNotes || '', requestId]
        );
        const alertId = 'ALT-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO alerts (id, user_id, title, message, is_read)
           VALUES ($1, $2, $3, $4, false)`,
          [alertId, sponsorReq.organizer_id, 'Sponsorship Rejected', 'Your prize pool sponsorship request has been reviewed and was not approved at this time.']
        );
        const logId = 'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details)
           VALUES ($1, $2, 'sponsor_reject', 'sponsor_request', $3, $4)`,
          [logId, authUser.id, requestId, JSON.stringify({ adminNotes: adminNotes || '' })]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Sponsor request rejected.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── ADMIN SPONSOR: Assign sponsor to a request ───────────────────────────
  if (req.url === '/api/admin/sponsor/assign' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }
        const { sponsorRequestId, name, logoUrl, sponsorType, amountContributed } = JSON.parse(body);
        if (!name) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Sponsor name is required.' }));
          return;
        }
        const spId = 'SPN-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO sponsor_list (id, sponsor_request_id, name, logo_url, sponsor_type, amount_contributed, assigned_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [spId, sponsorRequestId || null, name, logoUrl || null, sponsorType || 'prize_pool', amountContributed || 0, authUser.id]
        );
        if (sponsorRequestId) {
          await pool.query(
            `UPDATE sponsor_requests SET status = 'approved', admin_id = $1, reviewed_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [authUser.id, sponsorRequestId]
          );
        }
        const logId = 'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details)
           VALUES ($1, $2, 'sponsor_assign', 'sponsor_list', $3, $4)`,
          [logId, authUser.id, spId, JSON.stringify({ sponsorName: name })]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Sponsor assigned successfully.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── SPONSOR: Submit public contribution ──────────────────────────────────
  const contribMatch = req.url.match(/^\/api\/tournament\/([^/]+)\/sponsor\/contribute$/);
  if (contribMatch && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const tournamentId = contribMatch[1];
        const payload = JSON.parse(body);
        if (!payload.contributor_name || !payload.amount || parseInt(payload.amount) <= 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Name and valid amount are required.' }));
          return;
        }
        // Check tournament exists and sponsors are enabled
        const tRes = await pool.query('SELECT id, sponsors_enabled FROM tournaments WHERE id = $1', [tournamentId]);
        if (tRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
          return;
        }
        if (!tRes.rows[0].sponsors_enabled) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SPONSORS_DISABLED', message: 'Sponsor contributions are not enabled for this tournament.' }));
          return;
        }
        const contribId = 'SC-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO sponsor_contributions (id, tournament_id, contributor_name, contributor_email, amount, message, screenshot_url, transaction_id, payment_app, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')`,
          [contribId, tournamentId, payload.contributor_name, payload.contributor_email || null, parseInt(payload.amount), payload.message || null, payload.screenshot_url || null, payload.transaction_id || null, payload.payment_app || null]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, id: contribId, message: 'Contribution submitted for review!' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── SPONSOR: Get public sponsor list for a tournament ────────────────────
  const pubSponsorMatch = req.url.match(/^\/api\/tournament\/([^/]+)\/sponsors\/public$/);
  if (pubSponsorMatch && req.method === 'GET') {
    (async () => {
      try {
        const tournamentId = pubSponsorMatch[1];
        // Get approved contributions
        const contribRes = await pool.query(
          `SELECT id, contributor_name, amount, message, created_at FROM sponsor_contributions
           WHERE tournament_id = $1 AND status = 'approved' ORDER BY amount DESC, created_at DESC`,
          [tournamentId]
        );
        // Get organizer-added sponsors from sponsors_data
        const tRes = await pool.query('SELECT sponsors_data FROM tournaments WHERE id = $1', [tournamentId]);
        let organizerSponsors = [];
        if (tRes.rows.length > 0 && tRes.rows[0].sponsors_data) {
          try { organizerSponsors = JSON.parse(tRes.rows[0].sponsors_data).filter(s => s.status === 'approved' && s.type !== 'public'); } catch {}
        }
        const allSponsors = [
          ...organizerSponsors.map(s => ({ type: 'organizer', name: s.name, amount: s.amount, logo: s.logo, website: s.website })),
          ...contribRes.rows.map(r => ({ type: 'public', name: r.contributor_name, amount: r.amount, message: r.message, date: r.created_at }))
        ];
        const totalContributions = allSponsors.reduce((sum, s) => sum + (parseInt(s.amount) || 0), 0);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, sponsors: allSponsors, totalContributions }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    })();
    return;
  }

  // ── ADMIN SPONSOR: List sponsor contributions ────────────────────────────
  if (req.url.startsWith('/api/admin/sponsor/contributions') && req.method === 'GET') {
    (async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }
        const urlObj = new URL(req.url, 'http://localhost');
        const statusFilter = urlObj.searchParams.get('status') || '';
        let query = `SELECT sc.*, t.title as tournament_title FROM sponsor_contributions sc LEFT JOIN tournaments t ON sc.tournament_id = t.id`;
        const params = [];
        if (statusFilter) {
          query += ` WHERE sc.status = $1`;
          params.push(statusFilter);
        }
        query += ` ORDER BY sc.created_at DESC`;
        const dbRes = await pool.query(query, params);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, contributions: dbRes.rows }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    })();
    return;
  }

  // ── ADMIN SPONSOR: Approve contribution (updates prize pool) ─────────────
  if (req.url === '/api/admin/sponsor/contribution/approve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }
        const { contributionId, adminNotes } = JSON.parse(body);
        if (!contributionId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT' }));
          return;
        }
        // Get the contribution
        const cRes = await pool.query('SELECT * FROM sponsor_contributions WHERE id = $1', [contributionId]);
        if (cRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
          return;
        }
        const contrib = cRes.rows[0];

      // Approve the contribution
      await pool.query(
        `UPDATE sponsor_contributions SET status = 'approved', admin_id = $1, admin_notes = $2, reviewed_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [authUser.id, adminNotes || null, contributionId]
      );

      // Append approved contribution to sponsors_data JSON column
      // (prize_pool_amount stays as base — total is computed dynamically)
      const spRes = await pool.query('SELECT sponsors_data FROM tournaments WHERE id = $1', [contrib.tournament_id]);
      let existingSponsors = [];
      if (spRes.rows.length > 0 && spRes.rows[0].sponsors_data) {
        try { existingSponsors = JSON.parse(spRes.rows[0].sponsors_data); } catch { existingSponsors = []; }
      }
      existingSponsors.push({
        id: contributionId,
        name: contrib.contributor_name,
        amount: parseInt(contrib.amount),
        message: contrib.message || '',
        logo: '',
        status: 'approved',
        type: 'public',
        approved_at: new Date().toISOString()
      });
      await pool.query('UPDATE tournaments SET sponsors_data = $1 WHERE id = $2',
        [JSON.stringify(existingSponsors), contrib.tournament_id]);

        // Log the action
        const logId = 'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details)
           VALUES ($1, $2, 'sponsor_contribution_approve', 'sponsor_contributions', $3, $4)`,
          [logId, authUser.id, contributionId, JSON.stringify({ amount: contrib.amount, contributor: contrib.contributor_name })]
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Contribution approved! Prize pool updated.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── ADMIN SPONSOR: Reject contribution ───────────────────────────────────
  if (req.url === '/api/admin/sponsor/contribution/reject' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }
        const { contributionId, adminNotes } = JSON.parse(body);
        if (!contributionId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT' }));
          return;
        }
        await pool.query(
          `UPDATE sponsor_contributions SET status = 'rejected', admin_id = $1, admin_notes = $2, reviewed_at = CURRENT_TIMESTAMP WHERE id = $3`,
          [authUser.id, adminNotes || null, contributionId]
        );

        const logId = 'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details)
           VALUES ($1, $2, 'sponsor_contribution_reject', 'sponsor_contributions', $3, $4)`,
          [logId, authUser.id, contributionId, JSON.stringify({ adminNotes })]
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Contribution rejected.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── ADMIN: Early Access Management ──────────────────────────────────────
  if (req.url === '/api/admin/early-access' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }
      const dbRes = await pool.query(
        `SELECT u.id, u.name, u.email FROM users u WHERE u.early_access = true ORDER BY u.created_at DESC`
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, users: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (req.url === '/api/admin/early-access' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }
        const { email } = JSON.parse(body);
        if (!email) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Email is required.' }));
          return;
        }
        const userRes = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'User not found with that email.' }));
          return;
        }
        const userId = userRes.rows[0].id;
        await pool.query(`UPDATE users SET early_access = true WHERE id = $1`, [userId]);
        const logId = 'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details)
           VALUES ($1, $2, 'early_access_grant', 'user', $3, $4)`,
          [logId, authUser.id, userId, JSON.stringify({ email })]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Early access granted.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (req.url.startsWith('/api/admin/early-access') && req.method === 'DELETE') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }
      const urlParams = new URLSearchParams(req.url.split('?')[1] || '');
      const userId = urlParams.get('userId');
      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'userId is required.' }));
        return;
      }
      await pool.query(`UPDATE users SET early_access = false WHERE id = $1`, [userId]);
      const logId = 'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
      await pool.query(
        `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details)
         VALUES ($1, $2, 'early_access_revoke', 'user', $3, $4)`,
        [logId, authUser.id, userId, JSON.stringify({})]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Early access revoked.' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── ADMIN: Organizer Usage Stats ──────────────────────────────────────
  if (req.url === '/api/admin/organizer-usage' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }
      const [tourneyRes, slotRes, orgRes, avgRes, staffRes, analyticsRes] = await Promise.all([
        pool.query('SELECT COUNT(*) as total FROM tournaments'),
        pool.query('SELECT COALESCE(SUM(slotsFilled), 0) as total FROM tournaments'),
        pool.query(`SELECT COUNT(*) as total FROM users WHERE 'organiser' = ANY(roles)`),
        pool.query(`SELECT COALESCE(AVG(tournament_count), 0) as avg FROM (SELECT COUNT(*) as tournament_count FROM tournaments GROUP BY "orgId") sub`),
        pool.query('SELECT COUNT(*) as total FROM staff_members'),
        pool.query(`SELECT COALESCE(SUM(amount), 0) as total FROM billing_history WHERE status = 'completed'`),
      ]);

      // Growth rates (compare current month vs previous month)
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const firstOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

      const [currentTourneys, prevTourneys] = await Promise.all([
        pool.query(`SELECT COUNT(*) as c FROM tournaments WHERE "createdAt" >= $1`, [firstOfMonth]),
        pool.query(`SELECT COUNT(*) as c FROM tournaments WHERE "createdAt" >= $1 AND "createdAt" < $2`, [firstOfPrevMonth, firstOfMonth]),
      ]);

      const [currentParticipants, prevParticipants] = await Promise.all([
        pool.query(`SELECT COALESCE(SUM("slotsFilled"), 0) as c FROM tournaments WHERE "createdAt" >= $1`, [firstOfMonth]),
        pool.query(`SELECT COALESCE(SUM("slotsFilled"), 0) as c FROM tournaments WHERE "createdAt" >= $1 AND "createdAt" < $2`, [firstOfPrevMonth, firstOfMonth]),
      ]);

      const tGrowth = prevTourneys.rows[0].c > 0 ? Math.round((currentTourneys.rows[0].c - prevTourneys.rows[0].c) / prevTourneys.rows[0].c * 100) : 0;
      const pGrowth = prevParticipants.rows[0].c > 0 ? Math.round((currentParticipants.rows[0].c - prevParticipants.rows[0].c) / prevParticipants.rows[0].c * 100) : 0;

      const stats = {
        totalTournaments: parseInt(tourneyRes.rows[0].total) || 0,
        totalParticipants: parseInt(slotRes.rows[0].total) || 0,
        activeOrganizers: parseInt(orgRes.rows[0].total) || 0,
        avgTournamentsPerOrganizer: parseFloat(avgRes.rows[0].avg) || 0,
        totalStaff: parseInt(staffRes.rows[0].total) || 0,
        totalRevenue: parseFloat(analyticsRes.rows[0].total) || 0,
        tournamentGrowth: tGrowth,
        participantGrowth: pGrowth,
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, stats }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── REGISTRATION FORM: Save custom form schema (PRO only) ────────────────
  if (req.url === '/api/registration-form' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!requireOrganizer(req, res, authUser)) return;
        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
        const user = userRes.rows[0];
        const plan = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;
        if (!plan.customRegistrationForms) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Custom registration forms are only available on the Pro plan.' }));
          return;
        }
        const { tournamentId, formSchema, isActive } = JSON.parse(body);
        if (!tournamentId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'tournamentId is required.' }));
          return;
        }
        const formId = 'FORM-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO custom_registration_forms (id, organizer_id, tournament_id, form_schema, is_active, updated_at)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
           ON CONFLICT (tournament_id)
           DO UPDATE SET form_schema = $4, is_active = $5, updated_at = CURRENT_TIMESTAMP`,
          [formId, user.id, tournamentId, JSON.stringify(formSchema || []), isActive !== undefined ? isActive : true]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, id: formId }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── REGISTRATION FORM: Get form schema for tournament ────────────────────
  const formGetMatch = req.url.match(/^\/api\/registration-form\/([^/]+)$/);
  if (formGetMatch && req.method === 'GET') {
    const tournamentId = formGetMatch[1];
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const dbRes = await pool.query(
        'SELECT * FROM custom_registration_forms WHERE tournament_id = $1',
        [tournamentId]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, form: dbRes.rows[0] || null }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── REGISTRATION FORMS: List organizer's custom forms ────────────────────
  if (req.url === '/api/registration-forms' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const user = userRes.rows[0];
      const dbRes = await pool.query(
        'SELECT * FROM custom_registration_forms WHERE organizer_id = $1 ORDER BY created_at DESC',
        [user.id]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, forms: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── CUSTOM LINK: Create custom link ──────────────────────────────────────
  if (req.url === '/api/custom-link' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!requireOrganizer(req, res, authUser)) return;
        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
        const user = userRes.rows[0];
        const plan = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;
        if (!plan.customLinks) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Custom links are available on Basic and Pro plans.' }));
          return;
        }
        const { tournamentId, slug, linkType } = JSON.parse(body);
        if (!slug) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Slug is required.' }));
          return;
        }
        const linkTypeVal = linkType || 'tournament';
        if (linkTypeVal === 'dashboard') {
          if (user.tier !== 'Pro') {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Dashboard custom links are only available on the Pro plan.' }));
            return;
          }
        }
        if (!/^[a-z0-9-]{3,50}$/.test(slug)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_SLUG', message: 'Slug must be 3-50 characters, lowercase alphanumeric with hyphens only.' }));
          return;
        }
        const slugCheck = await pool.query('SELECT id FROM custom_links WHERE slug = $1', [slug]);
        if (slugCheck.rows.length > 0) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SLUG_TAKEN', message: 'This slug is already in use.' }));
          return;
        }
        const id = 'LINK-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        const dbRes = await pool.query(
          `INSERT INTO custom_links (id, organizer_id, tournament_id, slug, link_type)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [id, user.id, tournamentId || null, slug, linkTypeVal]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, link: dbRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── CUSTOM LINKS: List organizer's custom links ──────────────────────────
  if (req.url === '/api/custom-links' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const user = userRes.rows[0];
      const dbRes = await pool.query(
        'SELECT * FROM custom_links WHERE organizer_id = $1 ORDER BY created_at DESC',
        [user.id]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, links: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── CUSTOM LINK: Update/edit custom link ─────────────────────────────────
  const linkUpdateMatch = req.url.match(/^\/api\/custom-link\/([^/]+)$/);
  if (linkUpdateMatch && req.method === 'PUT') {
    const linkId = linkUpdateMatch[1];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }
        const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
        const user = userRes.rows[0];
        const linkRes = await pool.query('SELECT * FROM custom_links WHERE id = $1', [linkId]);
        if (linkRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Custom link not found.' }));
          return;
        }
        if (linkRes.rows[0].organizer_id !== user.id && !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You do not own this link.' }));
          return;
        }
        const data = JSON.parse(body);
        if (data.slug) {
          if (!/^[a-z0-9-]{3,50}$/.test(data.slug)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'INVALID_SLUG', message: 'Slug must be 3-50 characters, lowercase alphanumeric with hyphens only.' }));
            return;
          }
          const slugCheck = await pool.query('SELECT id FROM custom_links WHERE slug = $1 AND id != $2', [data.slug, linkId]);
          if (slugCheck.rows.length > 0) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'SLUG_TAKEN', message: 'This slug is already in use.' }));
            return;
          }
          await pool.query('UPDATE custom_links SET slug = $1 WHERE id = $2', [data.slug, linkId]);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Custom link updated.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── CUSTOM LINK: Delete custom link ──────────────────────────────────────
  const linkDeleteMatch = req.url.match(/^\/api\/custom-link\/([^/]+)$/);
  if (linkDeleteMatch && req.method === 'DELETE') {
    const linkId = linkDeleteMatch[1];
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const user = userRes.rows[0];
      const linkRes = await pool.query('SELECT * FROM custom_links WHERE id = $1', [linkId]);
      if (linkRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Custom link not found.' }));
        return;
      }
      if (linkRes.rows[0].organizer_id !== user.id && !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You do not own this link.' }));
        return;
      }
      await pool.query('DELETE FROM custom_links WHERE id = $1', [linkId]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Custom link deleted.' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── SLUG: Resolve slug (PUBLIC) ──────────────────────────────────────────
  const slugMatch = req.url.match(/^\/api\/slug\/([^/]+)$/);
  if (slugMatch && req.method === 'GET') {
    const slug = slugMatch[1];
    try {
      const dbRes = await pool.query(
        'SELECT * FROM custom_links WHERE slug = $1 AND is_active = true',
        [slug]
      );
      if (dbRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Slug not found.' }));
        return;
      }
      const link = dbRes.rows[0];
      await pool.query('UPDATE custom_links SET visit_count = visit_count + 1 WHERE id = $1', [link.id]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        resolved: {
          linkType: link.link_type,
          tournamentId: link.tournament_id,
          organizerId: link.organizer_id,
          slug: link.slug
        }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── EXPORT: Export registrations as CSV ──────────────────────────────────
  const exportMatch = req.url.match(/^\/api\/tournament\/([^/]+)\/export\/(csv|xlsx)$/);
  if (exportMatch && req.method === 'GET') {
    const tournamentId = exportMatch[1];
    const format = exportMatch[2];
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;
      const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const user = userRes.rows[0];
      const plan = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;
      if (!plan.csvExport) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'CSV/Excel export is available on Basic and Pro plans.' }));
        return;
      }
      const tRes = await pool.query('SELECT "orgId" FROM tournaments WHERE id = $1', [tournamentId]);
      if (tRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        return;
      }
      if (tRes.rows[0].orgId !== user.id && !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You do not own this tournament.' }));
        return;
      }

      // Log export usage
      const logId = 'EXP-' + crypto.randomBytes(6).toString('hex').toUpperCase();
      await pool.query(
        'INSERT INTO export_usage_log (id, organizer_id, tournament_id, export_type, format) VALUES ($1, $2, $3, $4, $5)',
        [logId, user.id, tournamentId, 'registrations', format]
      );

      if (format === 'csv') {
        const regsRes = await pool.query(
          'SELECT team_name, captain, members, status, created_at FROM tournament_registrations WHERE tournament_id = $1 ORDER BY created_at ASC',
          [tournamentId]
        );
        const rows = regsRes.rows;
        const headers = ['Team Name', 'Captain', 'Members', 'Status', 'Registered At'];
        const csvRows = [headers.join(',')];
        for (const r of rows) {
          const members = r.members ? r.members.replace(/,/g, '; ') : '';
          csvRows.push([
            `"${(r.team_name || '').replace(/"/g, '""')}"`,
            `"${(r.captain || '').replace(/"/g, '""')}"`,
            `"${members.replace(/"/g, '""')}"`,
            r.status || '',
            r.created_at ? new Date(r.created_at).toISOString() : ''
          ].join(','));
        }
        const csvData = csvRows.join('\r\n');
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="registrations-${tournamentId}.csv"`
        });
        res.end(csvData);
      } else {
        const regsRes = await pool.query(
          'SELECT team_name, captain, members, status, created_at FROM tournament_registrations WHERE tournament_id = $1 ORDER BY created_at ASC',
          [tournamentId]
        );
        // Generate simple XLSX-compatible XML (Excel can open this)
        let xlsx = '<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>';
        xlsx += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">';
        xlsx += '<Worksheet ss:Name="Registrations"><Table>';
        xlsx += '<Row><Cell><Data ss:Type="String">Team Name</Data></Cell><Cell><Data ss:Type="String">Captain</Data></Cell><Cell><Data ss:Type="String">Members</Data></Cell><Cell><Data ss:Type="String">Status</Data></Cell><Cell><Data ss:Type="String">Registered At</Data></Cell></Row>';
        for (const r of regsRes.rows) {
          const members = r.members ? r.members.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
          xlsx += '<Row>';
          xlsx += `<Cell><Data ss:Type="String">${(r.team_name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Data></Cell>`;
          xlsx += `<Cell><Data ss:Type="String">${(r.captain || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Data></Cell>`;
          xlsx += `<Cell><Data ss:Type="String">${members}</Data></Cell>`;
          xlsx += `<Cell><Data ss:Type="String">${r.status || ''}</Data></Cell>`;
          xlsx += `<Cell><Data ss:Type="String">${r.created_at ? new Date(r.created_at).toISOString() : ''}</Data></Cell>`;
          xlsx += '</Row>';
        }
        xlsx += '</Table></Worksheet></Workbook>';
        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="registrations-${tournamentId}.xlsx"`
        });
        res.end(xlsx);
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── ANALYTICS: Get organizer analytics data ──────────────────────────────
  if (req.url === '/api/analytics/organizer' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;
      const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const user = userRes.rows[0];
      const plan = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;
      if (plan.analytics === 'basic' || !plan.analytics) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Advanced analytics are available on Basic and Pro plans.' }));
        return;
      }
      const monthlyData = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const label = `${year}-${String(month).padStart(2, '0')}`;
        const countRes = await pool.query(
          `SELECT COUNT(*) as cnt FROM tournaments WHERE "orgId" = $1 AND EXTRACT(YEAR FROM created_at) = $2 AND EXTRACT(MONTH FROM created_at) = $3`,
          [user.id, year, month]
        );
        monthlyData.push({ month: label, count: parseInt(countRes.rows[0].cnt) });
      }
      const regCountRes = await pool.query(
        `SELECT COUNT(*) as cnt FROM tournament_registrations tr JOIN tournaments t ON t.id = tr.tournament_id WHERE t."orgId" = $1`,
        [user.id]
      );
      const registrations = parseInt(regCountRes.rows[0].cnt);
      const slotRes = await pool.query(
        `SELECT SUM(CAST(t."slotsTotal" AS INTEGER)) as total, SUM(CAST(t."slotsFilled" AS INTEGER)) as filled FROM tournaments t WHERE t."orgId" = $1`,
        [user.id]
      );
      const totalSlots = parseInt(slotRes.rows[0]?.total) || 0;
      const filledSlots = parseInt(slotRes.rows[0]?.filled) || 0;
      const slotFillRate = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;
      const growthRes = await pool.query(
        `SELECT COUNT(*) as cnt FROM tournaments WHERE "orgId" = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
        [user.id]
      );
      const prevGrowthRes = await pool.query(
        `SELECT COUNT(*) as cnt FROM tournaments WHERE "orgId" = $1 AND created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days'`,
        [user.id]
      );
      const currentCount = parseInt(growthRes.rows[0].cnt);
      const prevCount = parseInt(prevGrowthRes.rows[0].cnt);
      const participantGrowth = prevCount > 0 ? Math.round(((currentCount - prevCount) / prevCount) * 100) : currentCount > 0 ? 100 : 0;
      const revenueRes = await pool.query(
        `SELECT SUM(CAST(t."slotsFilled" AS INTEGER) * CAST(COALESCE(NULLIF(t."entryFee", ''), '0') AS INTEGER)) as revenue FROM tournaments t WHERE t."orgId" = $1`,
        [user.id]
      );
      const revenue = parseInt(revenueRes.rows[0]?.revenue) || 0;
      const recentRes = await pool.query(
        'SELECT * FROM analytics_events WHERE organizer_id = $1 ORDER BY created_at DESC LIMIT 10',
        [user.id]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        monthlyTournaments: monthlyData,
        registrations,
        slotFillRate,
        participantGrowth,
        revenue,
        recentActivity: recentRes.rows
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── REVENUE ANALYTICS: Detailed revenue breakdown ─────────────────────────
  if (req.url === '/api/analytics/revenue' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;
      const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const user = userRes.rows[0];
      const plan = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;
      if (plan.analytics === 'basic' || !plan.analytics) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Revenue analytics are available on Basic and Pro plans.' }));
        return;
      }

      // Total revenue from entry fees
      const tourneyRes = await pool.query(
        `SELECT id, title, "entryFee", "slotsFilled", prize_pool, created_at 
         FROM tournaments WHERE "orgId" = $1 ORDER BY created_at DESC`,
        [user.id]
      );
      const tournaments = tourneyRes.rows;
      let totalRevenue = 0;
      let registrationRevenue = 0;
      const monthlyRevenue = {};
      for (const t of tournaments) {
        const entryFee = parseInt(String(t.entryFee || t.entry || '0').replace(/[^0-9]/g, '')) || 0;
        const filled = parseInt(t.slotsFilled) || 0;
        const rev = entryFee * filled;
        totalRevenue += rev;
        registrationRevenue += rev;
        const month = t.created_at ? t.created_at.slice(0, 7) : new Date().toISOString().slice(0, 7);
        monthlyRevenue[month] = (monthlyRevenue[month] || 0) + rev;
      }
      const revenueTrends = Object.entries(monthlyRevenue)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, amount]) => ({ month, amount }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        totalRevenue,
        registrationRevenue,
        prizePoolCommitment: tournaments.reduce((sum, t) => sum + (parseInt(String(t.prize_pool || '0').replace(/[^0-9]/g, '')) || 0), 0),
        revenueTrends,
        tournamentCount: tournaments.length
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── GROWTH ANALYTICS: Tournament & participant growth metrics ────────────
  if (req.url === '/api/analytics/growth' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;
      const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const user = userRes.rows[0];
      const plan = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;
      if (plan.analytics === 'basic' || !plan.analytics) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Growth analytics are available on Basic and Pro plans.' }));
        return;
      }

      // Monthly tournament growth (12 months)
      const monthlyTournaments = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const label = `${year}-${String(month).padStart(2, '0')}`;
        const countRes = await pool.query(
          `SELECT COUNT(*) as cnt FROM tournaments WHERE "orgId" = $1 AND EXTRACT(YEAR FROM created_at) = $2 AND EXTRACT(MONTH FROM created_at) = $3 AND "isDraft" = false`,
          [user.id, year, month]
        );
        monthlyTournaments.push({ month: label, count: parseInt(countRes.rows[0].cnt) });
      }

      // Registration growth (monthly for 6 months)
      const monthlyRegistrations = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const label = `${year}-${String(month).padStart(2, '0')}`;
        const countRes = await pool.query(
          `SELECT COUNT(*) as cnt FROM tournament_registrations tr 
           JOIN tournaments t ON t.id = tr.tournament_id 
           WHERE t."orgId" = $1 
             AND EXTRACT(YEAR FROM tr.created_at) = $2 
             AND EXTRACT(MONTH FROM tr.created_at) = $3`,
          [user.id, year, month]
        );
        monthlyRegistrations.push({ month: label, count: parseInt(countRes.rows[0].cnt) });
      }

      // Participant growth (unique participants over time)
      const participantGrowth = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const label = `${year}-${String(month).padStart(2, '0')}`;
        const countRes = await pool.query(
          `SELECT COUNT(DISTINCT tr.user_id) as cnt FROM tournament_registrations tr 
           JOIN tournaments t ON t.id = tr.tournament_id 
           WHERE t."orgId" = $1 
             AND EXTRACT(YEAR FROM tr.created_at) = $2 
             AND EXTRACT(MONTH FROM tr.created_at) = $3
             AND tr.status = 'approved'`,
          [user.id, year, month]
        );
        participantGrowth.push({ month: label, count: parseInt(countRes.rows[0].cnt) });
      }

      // 30-day growth rates
      const current30 = await pool.query(
        `SELECT COUNT(*) as tournaments, 
                (SELECT COUNT(*) FROM tournament_registrations tr JOIN tournaments t ON t.id = tr.tournament_id WHERE t."orgId" = $1 AND tr.created_at >= NOW() - INTERVAL '30 days') as registrations
         FROM tournaments WHERE "orgId" = $1 AND "isDraft" = false AND created_at >= NOW() - INTERVAL '30 days'`,
        [user.id]
      );
      const prev30 = await pool.query(
        `SELECT COUNT(*) as tournaments,
                (SELECT COUNT(*) FROM tournament_registrations tr JOIN tournaments t ON t.id = tr.tournament_id WHERE t."orgId" = $1 AND tr.created_at >= NOW() - INTERVAL '60 days' AND tr.created_at < NOW() - INTERVAL '30 days') as registrations
         FROM tournaments WHERE "orgId" = $1 AND "isDraft" = false AND created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days'`,
        [user.id]
      );

      const c = current30.rows[0];
      const p = prev30.rows[0];
      const calcGrowth = (curr, prev) => prev > 0 ? Math.round(((curr - prev) / prev) * 100) : curr > 0 ? 100 : 0;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        monthlyTournaments,
        monthlyRegistrations,
        participantGrowth,
        tournamentGrowth30d: calcGrowth(parseInt(c.tournaments), parseInt(p.tournaments)),
        registrationGrowth30d: calcGrowth(parseInt(c.registrations), parseInt(p.registrations)),
        currentPeriod: { tournaments: parseInt(c.tournaments), registrations: parseInt(c.registrations) },
        previousPeriod: { tournaments: parseInt(p.tournaments), registrations: parseInt(p.registrations) }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── EARLY ACCESS: Check early access status ──────────────────────────────
  if (req.url === '/api/early-access' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const user = userRes.rows[0];
      const plan = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;
      let enabled = plan.earlyAccess === true;
      if (!enabled) {
        const subRes = await pool.query(
          'SELECT early_access_enabled FROM subscriptions WHERE organizer_id = $1',
          [user.id]
        );
        if (subRes.rows.length > 0 && subRes.rows[0].early_access_enabled) {
          enabled = true;
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, enabled }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── ADMIN ACTION LOG: Get admin action log ───────────────────────────────
  if (req.url === '/api/admin/action-log' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }
      const dbRes = await pool.query(
        'SELECT * FROM admin_action_log ORDER BY created_at DESC LIMIT 50'
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, entries: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── REVENUE ANALYTICS: Detailed revenue breakdown ──────────────────────
  if (req.url === '/api/analytics/revenue' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;
      const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const userId = userRes.rows[0].id;

      // Tournament revenue (entry fees * slots filled)
      const tRevRes = await pool.query(
        `SELECT COALESCE(SUM(CAST(COALESCE(NULLIF(t."entryFee", ''), '0') AS INTEGER) * CAST("slotsFilled" AS INTEGER)), 0) as revenue
         FROM tournaments t WHERE t."orgId" = $1 AND t."isDraft" = false`,
        [userId]
      );
      const tournamentRevenue = parseFloat(tRevRes.rows[0].revenue) || 0;

      // Registration revenue (from paid registrations)
      const regRevRes = await pool.query(
        `SELECT COALESCE(SUM(CAST(COALESCE(NULLIF(t."entryFee", ''), '0') AS INTEGER)), 0) as revenue
         FROM tournament_registrations tr
         JOIN tournaments t ON t.id = tr.tournament_id
         WHERE t."orgId" = $1 AND tr.status = 'approved'`,
        [userId]
      );
      const registrationRevenue = parseFloat(regRevRes.rows[0].revenue) || 0;

      // Monthly revenue trend (last 6 months)
      const monthlyRevenue = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const label = `${year}-${String(month).padStart(2, '0')}`;
        const revRes = await pool.query(
          `SELECT COALESCE(SUM(CAST(COALESCE(NULLIF(t."entryFee", ''), '0') AS INTEGER) * CAST("slotsFilled" AS INTEGER)), 0) as rev
           FROM tournaments t WHERE t."orgId" = $1 AND t."isDraft" = false
           AND EXTRACT(YEAR FROM t.created_at) = $2 AND EXTRACT(MONTH FROM t.created_at) = $3`,
          [userId, year, month]
        );
        monthlyRevenue.push({ month: label, revenue: parseFloat(revRes.rows[0].rev) });
      }

      // Total prize pool managed
      const prizeRes = await pool.query(
        `SELECT COALESCE(SUM(CAST(COALESCE(NULLIF(t.prize, ''), '0') AS INTEGER)), 0) as total
         FROM tournaments t WHERE t."orgId" = $1 AND t."isDraft" = false`,
        [userId]
      );
      const totalPrizePool = parseFloat(prizeRes.rows[0].total) || 0;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        tournamentRevenue,
        registrationRevenue,
        totalRevenue: tournamentRevenue + registrationRevenue,
        totalPrizePool,
        monthlyRevenue
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── GROWTH ANALYTICS: Registration/participant/tournament growth ────────
  if (req.url === '/api/analytics/growth' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;
      const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const userId = userRes.rows[0].id;

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);

      // Registration growth (current 30d vs previous 30d)
      const regCurRes = await pool.query(
        `SELECT COUNT(*) as cnt FROM tournament_registrations tr
         JOIN tournaments t ON t.id = tr.tournament_id
         WHERE t."orgId" = $1 AND tr.created_at >= $2`,
        [userId, thirtyDaysAgo]
      );
      const regPrevRes = await pool.query(
        `SELECT COUNT(*) as cnt FROM tournament_registrations tr
         JOIN tournaments t ON t.id = tr.tournament_id
         WHERE t."orgId" = $1 AND tr.created_at >= $2 AND tr.created_at < $3`,
        [userId, sixtyDaysAgo, thirtyDaysAgo]
      );
      const currentRegs = parseInt(regCurRes.rows[0].cnt);
      const prevRegs = parseInt(regPrevRes.rows[0].cnt);
      const registrationGrowth = prevRegs > 0 ? Math.round(((currentRegs - prevRegs) / prevRegs) * 100) : currentRegs > 0 ? 100 : 0;

      // Participant growth (unique users registering)
      const partCurRes = await pool.query(
        `SELECT COUNT(DISTINCT tr.user_id) as cnt FROM tournament_registrations tr
         JOIN tournaments t ON t.id = tr.tournament_id
         WHERE t."orgId" = $1 AND tr.created_at >= $2`,
        [userId, thirtyDaysAgo]
      );
      const partPrevRes = await pool.query(
        `SELECT COUNT(DISTINCT tr.user_id) as cnt FROM tournament_registrations tr
         JOIN tournaments t ON t.id = tr.tournament_id
         WHERE t."orgId" = $1 AND tr.created_at >= $2 AND tr.created_at < $3`,
        [userId, sixtyDaysAgo, thirtyDaysAgo]
      );
      const currentParts = parseInt(partCurRes.rows[0].cnt);
      const prevParts = parseInt(partPrevRes.rows[0].cnt);
      const participantGrowth = prevParts > 0 ? Math.round(((currentParts - prevParts) / prevParts) * 100) : currentParts > 0 ? 100 : 0;

      // Tournament growth
      const tCurRes = await pool.query(
        'SELECT COUNT(*) as cnt FROM tournaments WHERE "orgId" = $1 AND "isDraft" = false AND created_at >= $2',
        [userId, thirtyDaysAgo]
      );
      const tPrevRes = await pool.query(
        'SELECT COUNT(*) as cnt FROM tournaments WHERE "orgId" = $1 AND "isDraft" = false AND created_at >= $2 AND created_at < $3',
        [userId, sixtyDaysAgo, thirtyDaysAgo]
      );
      const currentTours = parseInt(tCurRes.rows[0].cnt);
      const prevTours = parseInt(tPrevRes.rows[0].cnt);
      const tournamentGrowth = prevTours > 0 ? Math.round(((currentTours - prevTours) / prevTours) * 100) : currentTours > 0 ? 100 : 0;

      // Monthly performance (last 6 months - tournaments + regs)
      const monthlyPerformance = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const label = `${year}-${String(month).padStart(2, '0')}`;
        const tCountRes = await pool.query(
          'SELECT COUNT(*) as cnt FROM tournaments WHERE "orgId" = $1 AND "isDraft" = false AND EXTRACT(YEAR FROM created_at) = $2 AND EXTRACT(MONTH FROM created_at) = $3',
          [userId, year, month]
        );
        const rCountRes = await pool.query(
          `SELECT COUNT(*) as cnt FROM tournament_registrations tr
           JOIN tournaments t ON t.id = tr.tournament_id
           WHERE t."orgId" = $1 AND EXTRACT(YEAR FROM tr.created_at) = $2 AND EXTRACT(MONTH FROM tr.created_at) = $3`,
          [userId, year, month]
        );
        monthlyPerformance.push({
          month: label,
          tournaments: parseInt(tCountRes.rows[0].cnt),
          registrations: parseInt(rCountRes.rows[0].cnt)
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        registrationGrowth,
        participantGrowth,
        tournamentGrowth,
        monthlyPerformance
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── EXPORT USAGE: Log and get export usage ──────────────────────────────
  if (req.url === '/api/organizer/export-usage' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;
      const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const userId = userRes.rows[0].id;
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const logRes = await pool.query(
        'SELECT export_type, format, created_at FROM export_usage_log WHERE organizer_id = $1 AND created_at >= $2 ORDER BY created_at DESC',
        [userId, startOfMonth]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, exports: logRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── FEATURE FLAGS: Get all feature flags (public) ───────────────────────
  if (req.url === '/api/feature-flags' && req.method === 'GET') {
    try {
      const dbRes = await pool.query(
        'SELECT flag_key, flag_label, description, enabled, target_tier FROM feature_flags ORDER BY created_at DESC'
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, flags: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── FEATURE FLAGS: Admin create/update feature flag ──────────────────────
  if (req.url === '/api/admin/feature-flags' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }
        const { flagKey, flagLabel, description, enabled, targetTier } = JSON.parse(body);
        if (!flagKey || !flagLabel) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'flagKey and flagLabel are required.' }));
          return;
        }
        const flagId = 'FF-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO feature_flags (id, flag_key, flag_label, description, enabled, target_tier)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (flag_key) DO UPDATE SET
             flag_label = $3, description = $4, enabled = $5, target_tier = $6, updated_at = CURRENT_TIMESTAMP`,
          [flagId, flagKey, flagLabel, description || '', enabled || false, targetTier || 'pro']
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Feature flag saved.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── FEATURE FLAGS: Admin toggle early access for a user ──────────────────
  if (req.url.startsWith('/api/admin/early-access/') && req.method === 'PUT') {
    const parts = req.url.split('/');
    const targetUserId = parts[4];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }
        const { enabled } = JSON.parse(body);
        await pool.query('UPDATE users SET early_access = $1 WHERE id = $2', [!!enabled, targetUserId]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: `Early access ${enabled ? 'enabled' : 'disabled'} for user.` }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── CUSTOM DASHBOARD LINK: Set custom org slug ──────────────────────────
  if (req.url === '/api/organizer/dashboard-slug' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!requireOrganizer(req, res, authUser)) return;
        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
        const user = userRes.rows[0];
        const plan = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;
        if (!plan.customLinks) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Custom dashboard links are available on Pro plan.' }));
          return;
        }
        const { slug } = JSON.parse(body);
        if (!slug || !/^[a-z0-9-]{3,50}$/.test(slug)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_SLUG', message: 'Slug must be 3-50 chars, lowercase alphanumeric with hyphens.' }));
          return;
        }
        const slugCheck = await pool.query('SELECT id FROM users WHERE "orgSlug" = $1', [slug]);
        if (slugCheck.rows.length > 0) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SLUG_TAKEN', message: 'This dashboard slug is already in use.' }));
          return;
        }
        await pool.query('UPDATE users SET "orgSlug" = $1 WHERE id = $2', [slug, user.id]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, slug, message: 'Dashboard link set!' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── CUSTOM DASHBOARD LINK: Check slug availability ──────────────────────
  if (req.url === '/api/organizer/dashboard-slug/check' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { slug } = JSON.parse(body);
        if (!slug || !/^[a-z0-9-]{3,50}$/.test(slug)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_SLUG' }));
          return;
        }
        const slugCheck = await pool.query('SELECT id FROM users WHERE "orgSlug" = $1', [slug]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, available: slugCheck.rows.length === 0 }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── CUSTOM DASHBOARD LINK: Get current slug ─────────────────────────────
  if (req.url === '/api/organizer/dashboard-slug' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;
      const userRes = await pool.query('SELECT id, "orgSlug" FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, slug: userRes.rows[0].orgSlug || null }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── STAFF PERMISSIONS: Update staff permissions (PRO multi-admin) ────────
  if (req.url === '/api/organizer/staff/permissions' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!requireOrganizer(req, res, authUser)) return;
        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
        const user = userRes.rows[0];
        const plan = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;
        if (!plan.multiAdmin) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Multi-admin staff management is only available on the Pro plan.' }));
          return;
        }
        const { staffId, adminRole, permissions } = JSON.parse(body);
        if (!staffId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'staffId is required.' }));
          return;
        }
        const staffRes = await pool.query(
          'SELECT * FROM staff_members WHERE id = $1 AND organizer_id = $2',
          [staffId, user.id]
        );
        if (staffRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Staff member not found.' }));
          return;
        }
        await pool.query(
          `UPDATE staff_members SET admin_role = $1, permissions = $2 WHERE id = $3`,
          [adminRole || 'admin', permissions ? JSON.stringify(permissions) : staffRes.rows[0].permissions, staffId]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Staff permissions updated.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── PAIRING & AUTO-VERIFY ENDPOINTS ──────────────────────────────────

  // POST /api/pair/generate-key — Generate a device pairing API key (admin/org)
  if (req.url === '/api/pair/generate-key' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasCapability(authUser, 'VERIFY_PAYMENTS')) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }
        // Deactivate any existing devices for this user — only one active device at a time
        await pool.query(
          `UPDATE paired_devices SET is_active = false WHERE user_id = $1 AND is_active = true`,
          [authUser.id]
        );
        const rawKey = 'MDK-' + crypto.randomBytes(20).toString('hex');
        const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
        const deviceId = 'PAD-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO paired_devices (id, user_id, device_id, api_key_hash, is_active)
           VALUES ($1, $2, $3, $4, true)`,
          [deviceId, authUser.id, deviceId, keyHash]
        );
        console.log(`🔑 [PAIRING] Device key generated for user ${authUser.id} (device: ${deviceId})`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          api_key: rawKey,
          device_id: deviceId,
          server_url: getServerUrl(req),
          message: 'Scan the QR with your Payment Verification App to pair.'
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // GET /api/pair/devices — List paired devices for current user
  if (req.url === '/api/pair/devices' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasCapability(authUser, 'VERIFY_PAYMENTS')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }
      const devRes = await pool.query(
        `SELECT id, device_id, device_name, is_active, app_version, last_seen_at, paired_at
         FROM paired_devices WHERE user_id = $1 AND is_active = true
         ORDER BY paired_at DESC LIMIT 1`,
        [authUser.id]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, devices: devRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // DELETE /api/pair/devices/:id — Unpair a device
  const unpairMatch = req.url.match(/^\/api\/pair\/devices\/([^/]+)$/);
  if (unpairMatch && req.method === 'DELETE') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const deviceId = unpairMatch[1];
      const devRes = await pool.query('SELECT * FROM paired_devices WHERE id = $1', [deviceId]);
      if (devRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
        return;
      }
      if (devRes.rows[0].user_id !== authUser.id && !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }
      await pool.query('DELETE FROM paired_devices WHERE id = $1', [deviceId]);
      console.log(`🔌 [PAIRING] Device ${deviceId} unpaired by ${authUser.id}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Device unpaired.' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── MOBILE APP API v1 ENDPOINTS ──────────────────────────────────────

  // GET /api/v1/health — Public health check
  if (req.url === '/api/v1/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // GET /api/v1/plans — Fetch subscription plan catalog
  if (req.url === '/api/v1/plans' && req.method === 'GET') {
    try {
      const deviceAuth = await authenticateDevice(req);
      if (!deviceAuth) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const result = await pool.query(
        `SELECT name, monthly_price, yearly_price, max_tournaments, max_slots,
                has_verified_badge, has_premium_badge, staff_limit,
                api_access, white_label, custom_subdomain, automation_enabled, priority_support
         FROM organizer_plans ORDER BY monthly_price ASC`
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, plans: result.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // GET /api/v1/payments/all — All payment records with their current status (optional ?status= filter)
  if (req.url.startsWith('/api/v1/payments/all') && req.method === 'GET') {
    try {
      const deviceAuth = await authenticateDevice(req);
      if (!deviceAuth) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const statusFilter = urlObj.searchParams.get('status');
      const subWhere = statusFilter ? 'WHERE pv.status = $1' : '';
      const subParams = statusFilter ? [statusFilter] : [];
      const [subRes, regRes] = await Promise.all([
        pool.query(
          `SELECT pv.id, pv.user_id, pv.plan_name, pv.billing_cycle, pv.amount,
                  pv.transaction_id, pv.status, pv.admin_id, pv.rejection_reason,
                  pv.utr_ref, pv.created_at,
                u.name as user_name, u.email as user_email, u.phone as user_phone
           FROM payment_verifications pv
           JOIN users u ON u.id = pv.user_id
           ${subWhere}
           ORDER BY pv.created_at DESC
           LIMIT 100`,
          subParams
        ),
        pool.query(
          `SELECT tr.id, tr.tournament_id, tr.user_id, tr.team_name, tr.status,
                  tr.transaction_id, tr.email, tr.phone, tr.created_at,
                  t.title as tournament_title, t.game, t.entry_fee_amount as amount
           FROM tournament_registrations tr
           JOIN tournaments t ON t.id = tr.tournament_id
           WHERE tr.status IN ('pending_payment','confirmed','cancelled','expired')
           ORDER BY tr.created_at DESC
           LIMIT 100`
        )
      ]);
      const payments = [
        ...subRes.rows.map(r => ({ ...r, payment_type: 'subscription' })),
        ...regRes.rows.map(r => ({ ...r, payment_type: 'registration' }))
      ];
      payments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        count: payments.length,
        payments
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/v1/auth/device — Device authentication (app calls with API key)
  if (req.url === '/api/v1/auth/device' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { api_key, device_id } = JSON.parse(body);
        if (!api_key) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'API key required' }));
          return;
        }
        const keyHash = crypto.createHash('sha256').update(api_key).digest('hex');
        const devRes = await pool.query(
          'SELECT * FROM paired_devices WHERE api_key_hash = $1 AND is_active = true',
          [keyHash]
        );
        if (devRes.rows.length === 0) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_API_KEY', message: 'Invalid or inactive API key.' }));
          return;
        }
        const device = devRes.rows[0];
        const refreshToken = crypto.randomBytes(32).toString('hex');
        const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        await pool.query(
          `UPDATE paired_devices SET device_id = COALESCE($1, device_id), device_name = $2, refresh_token_hash = $3,
           last_seen_at = NOW(), app_version = $4 WHERE id = $5`,
          [device_id || device.device_id, device_id || device.device_name, refreshHash, null, device.id]
        );
        const deviceJwt = signJwt({
          type: 'device',
          device_id: device_id || device.device_id,
          user_id: device.user_id,
          scope: 'payment_verification'
        });
        console.log(`📱 [DEVICE] Device paired: ${device_id || device.device_id} → user ${device.user_id}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          access_token: deviceJwt,
          refresh_token: refreshToken,
          expires_in: 86400,
          message: 'Authenticated'
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/v1/auth/refresh — Refresh device JWT
  if (req.url === '/api/v1/auth/refresh' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const params = new URLSearchParams(req.url.includes('?') ? req.url.split('?')[1] : '');
        const refreshToken = params.get('refresh_token') || (body ? JSON.parse(body).refresh_token : null);
        if (!refreshToken) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Refresh token required' }));
          return;
        }
        const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const devRes = await pool.query(
          'SELECT * FROM paired_devices WHERE refresh_token_hash = $1 AND is_active = true',
          [refreshHash]
        );
        if (devRes.rows.length === 0) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_TOKEN', message: 'Invalid or expired refresh token.' }));
          return;
        }
        const device = devRes.rows[0];
        const newRefreshToken = crypto.randomBytes(32).toString('hex');
        const newRefreshHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
        const newDeviceJwt = signJwt({
          type: 'device',
          device_id: device.device_id,
          user_id: device.user_id,
          scope: 'payment_verification'
        });
        await pool.query(
          'UPDATE paired_devices SET refresh_token_hash = $1, last_seen_at = NOW() WHERE id = $2',
          [newRefreshHash, device.id]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          access_token: newDeviceJwt,
          refresh_token: newRefreshToken,
          expires_in: 86400
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Helper: verify device JWT middleware
  async function authenticateDevice(req) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7);
    const result = verifyJwt(token);
    if (!result.valid) return null;
    const p = result.payload;
    if (p.type !== 'device' || p.scope !== 'payment_verification') return null;
    // Verify device is still active in DB (handles revocation)
    const check = await pool.query(
      'SELECT is_active FROM paired_devices WHERE device_id = $1 AND is_active = true',
      [p.device_id]
    );
    if (check.rows.length === 0) return null;
    return p;
  }

  // POST /api/v1/payments/verify — Core auto-verify endpoint (app calls with SMS data)
  if (req.url === '/api/v1/payments/verify' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const deviceAuth = await authenticateDevice(req);
        if (!deviceAuth) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }
        const { amount, utr, bank, sender, sender_account, timestamp, sms_hash, device_id } = JSON.parse(body);
        if (!utr || !amount) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Missing required fields: utr, amount' }));
          return;
        }
        const now = new Date();
        const smsTime = timestamp ? new Date(timestamp) : now;

        // 1. Dedup: check if UTR already processed
        const dupUtr = await pool.query('SELECT id, status FROM payment_sms_verifications WHERE utr = $1', [utr]);
        if (dupUtr.rows.length > 0) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true, message: 'Already verified',
            payment_id: dupUtr.rows[0].id, status: dupUtr.rows[0].status
          }));
          return;
        }

        // 2. Dedup: check if sms_hash already exists
        if (sms_hash) {
          const dupHash = await pool.query('SELECT id, status FROM payment_sms_verifications WHERE sms_hash = $1', [sms_hash]);
          if (dupHash.rows.length > 0) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true, message: 'Already verified',
              payment_id: dupHash.rows[0].id, status: dupHash.rows[0].status
            }));
            return;
          }
        }

        const smsRecordId = 'SMS-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        let matchedPaymentId = null;
        let matchedRegId = null;
        let matchType = 'unmatched';
        let finalStatus = 'unmatched';

        // 3. Match subscription payments (payment_verifications table)
        const subPayments = await pool.query(
          `SELECT pv.*, u.name as user_name, u.email as user_email FROM payment_verifications pv
           JOIN users u ON u.id = pv.user_id
           WHERE pv.status = 'pending' AND pv.amount = $1
           ORDER BY pv.created_at DESC`,
          [amount]
        );

        if (subPayments.rows.length === 1) {
          // Exact match — auto-approve
          const payment = subPayments.rows[0];
          await autoApproveSubscription(pool, payment, deviceAuth.user_id, utr);
          matchedPaymentId = payment.id;
          matchType = 'subscription';
          finalStatus = 'verified';
          console.log(`✅ [AUTO-VERIFY] Subscription payment ${payment.id} auto-approved (UTR: ${utr})`);
        } else if (subPayments.rows.length > 1) {
          // Multiple matches — try by time proximity (match within 30 min of SMS)
          for (const p of subPayments.rows) {
            const pTime = new Date(p.created_at).getTime();
            const sTime = smsTime.getTime();
            if (Math.abs(sTime - pTime) < 30 * 60 * 1000) {
              await autoApproveSubscription(pool, p, deviceAuth.user_id, utr);
              matchedPaymentId = p.id;
              matchType = 'subscription';
              finalStatus = 'verified';
              console.log(`✅ [AUTO-VERIFY] Subscription payment ${p.id} auto-approved (UTR: ${utr}, time proximity)`);
              break;
            }
          }
        }

        // 4. If no subscription match, try tournament registration matching
        if (!matchedPaymentId) {
          const regPayments = await pool.query(
            `SELECT tr.id, tr.tournament_id, tr.user_id, tr.team_name, tr.created_at,
                    t.entry_fee_amount, t.title as tournament_title
             FROM tournament_registrations tr
             JOIN tournaments t ON t.id = tr.tournament_id
             WHERE tr.status = 'pending_payment' AND t.entry_fee_amount = $1
             ORDER BY tr.created_at DESC`,
            [amount]
          );

          if (regPayments.rows.length === 1) {
            const reg = regPayments.rows[0];
            await pool.query(
              `UPDATE tournament_registrations SET status = 'confirmed', transaction_id = $1, updated_at = NOW() WHERE id = $2`,
              [utr, reg.id]
            );
            await pool.query(
              `UPDATE tournaments SET "slotsFilled" = COALESCE("slotsFilled", 0) + 1 WHERE id = $1`,
              [reg.tournament_id]
            );
            matchedRegId = reg.id;
            matchType = 'registration';
            finalStatus = 'verified';
            console.log(`✅ [AUTO-VERIFY] Registration ${reg.id} for "${reg.tournament_title}" auto-approved (UTR: ${utr})`);
          } else if (regPayments.rows.length > 1) {
            for (const reg of regPayments.rows) {
              const rTime = new Date(reg.created_at).getTime();
              const sTime = smsTime.getTime();
              if (Math.abs(sTime - rTime) < 30 * 60 * 1000) {
                await pool.query(
                  `UPDATE tournament_registrations SET status = 'confirmed', transaction_id = $1, updated_at = NOW() WHERE id = $2`,
                  [utr, reg.id]
                );
                await pool.query(
                  `UPDATE tournaments SET "slotsFilled" = COALESCE("slotsFilled", 0) + 1 WHERE id = $1`,
                  [reg.tournament_id]
                );
                matchedRegId = reg.id;
                matchType = 'registration';
                finalStatus = 'verified';
                console.log(`✅ [AUTO-VERIFY] Registration ${reg.id} auto-approved (UTR: ${utr}, time proximity)`);
                break;
              }
            }
          }
        }

        // 5. Record the SMS verification
        await pool.query(
          `INSERT INTO payment_sms_verifications
           (id, utr, amount, bank, sender, sender_account, sms_hash, device_id, matched_payment_id, matched_registration_id, match_type, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [smsRecordId, utr, amount, bank || null, sender || null, sender_account || null, sms_hash || null,
           device_id || deviceAuth.device_id, matchedPaymentId, matchedRegId, matchType, finalStatus, smsTime]
        );

        // 6. Notify matched user
        if (matchedPaymentId || matchedRegId) {
          const userId = matchedPaymentId
            ? (await pool.query('SELECT user_id FROM payment_verifications WHERE id = $1', [matchedPaymentId])).rows[0]?.user_id
            : (await pool.query('SELECT user_id FROM tournament_registrations WHERE id = $1', [matchedRegId])).rows[0]?.user_id;
          if (userId) {
            const alertId = 'ALT-' + crypto.randomBytes(6).toString('hex').toUpperCase();
            await pool.query(
              `INSERT INTO alerts (id, user_id, title, message, is_read)
               VALUES ($1, $2, $3, $4, false)`,
              [alertId, userId,
               finalStatus === 'verified' ? 'Payment Auto-Verified' : 'Payment Received',
               finalStatus === 'verified'
                 ? `Your payment of ₹${amount} was auto-verified. Thank you!`
                 : `Your payment of ₹${amount} was received and is pending manual review.`
              ]
            );
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: finalStatus === 'verified' ? 'Payment verified' : 'Logged for review',
          payment_id: matchedPaymentId || smsRecordId,
          status: finalStatus
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // GET /api/v1/payments/pending — Fetch all pending payments awaiting SMS verification
  if (req.url === '/api/v1/payments/pending' && req.method === 'GET') {
    try {
      const deviceAuth = await authenticateDevice(req);
      if (!deviceAuth) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const [subRes, regRes] = await Promise.all([
        pool.query(
          `SELECT pv.id, pv.user_id, pv.plan_name, pv.billing_cycle, pv.amount,
                  pv.created_at, pv.transaction_id as user_provided_utr,
                  u.name as user_name, u.email as user_email, u.phone as user_phone
           FROM payment_verifications pv
           JOIN users u ON u.id = pv.user_id
           WHERE pv.status = 'pending'
           ORDER BY pv.created_at DESC`
        ),
        pool.query(
          `SELECT tr.id as registration_id, tr.tournament_id, tr.user_id, tr.team_name,
                  tr.email, tr.phone, t.entry_fee_amount as amount, t.title as tournament_title,
                  t.game, tr.created_at
           FROM tournament_registrations tr
           JOIN tournaments t ON t.id = tr.tournament_id
           WHERE tr.status = 'pending_payment'
           ORDER BY tr.created_at DESC`
        )
      ]);
      const pending = [
        ...subRes.rows.map(r => ({ ...r, type: 'subscription', pending_id: r.id })),
        ...regRes.rows.map(r => ({ ...r, type: 'registration', pending_id: r.registration_id }))
      ];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: pending.length, pending }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // GET /api/v1/payments/history — Verification history (recent approved/rejected/unmatched)
  if (req.url === '/api/v1/payments/history' && req.method === 'GET') {
    try {
      const deviceAuth = await authenticateDevice(req);
      if (!deviceAuth) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const result = await pool.query(
        `SELECT sv.id, sv.utr, sv.amount, sv.bank, sv.sender, sv.match_type, sv.status,
                sv.matched_payment_id, sv.matched_registration_id, sv.created_at
         FROM payment_sms_verifications sv
         WHERE sv.device_id = $1
         ORDER BY sv.created_at DESC
         LIMIT 50`,
        [deviceAuth.device_id]
      );
      // Enrich with display names
      const rows = [];
      for (const r of result.rows) {
        let detail = null;
        if (r.matched_payment_id) {
          const pRes = await pool.query(
            `SELECT pv.plan_name, pv.billing_cycle, u.name as user_name
             FROM payment_verifications pv JOIN users u ON u.id = pv.user_id WHERE pv.id = $1`,
            [r.matched_payment_id]
          );
          if (pRes.rows.length) detail = { ...pRes.rows[0], type: 'subscription' };
        } else if (r.matched_registration_id) {
          const regRes = await pool.query(
            `SELECT tr.team_name, t.title as tournament_title, t.game
             FROM tournament_registrations tr JOIN tournaments t ON t.id = tr.tournament_id WHERE tr.id = $1`,
            [r.matched_registration_id]
          );
          if (regRes.rows.length) detail = { ...regRes.rows[0], type: 'registration' };
        }
        rows.push({ ...r, detail });
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: rows.length, history: rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/v1/device/heartbeat — Device keeps alive (every 30 min)
  if (req.url === '/api/v1/device/heartbeat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const deviceAuth = await authenticateDevice(req);
        if (!deviceAuth) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }
        const { device_id, app_version } = JSON.parse(body);
        await pool.query(
          `UPDATE paired_devices SET last_seen_at = NOW(), app_version = COALESCE($1, app_version) WHERE device_id = $2 AND is_active = true`,
          [app_version || null, device_id || deviceAuth.device_id]
        );
        const [subCount, regCount] = await Promise.all([
          pool.query(`SELECT COUNT(*) as c FROM payment_verifications WHERE status = 'pending'`),
          pool.query(`SELECT COUNT(*) as c FROM tournament_registrations WHERE status = 'pending_payment'`)
        ]);
        const pendingCount = parseInt(subCount.rows[0].c) + parseInt(regCount.rows[0].c);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          timestamp: new Date().toISOString(),
          pending_count: pendingCount
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 8. Serve Static Files from dist/ for all other requests (React SPA fallback)
  let filePath = path.join(__dirname, 'dist', req.url === '/' ? 'index.html' : req.url);

  try {
    let stat = await fs.promises.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      stat = await fs.promises.stat(filePath);
    }
  } catch (err) {
    // SPA Fallback: If file not found, serve index.html for client-side React routing
    filePath = path.join(__dirname, 'dist', 'index.html');
  }

  try {
    const data = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

// ── AUTO-VERIFY: Approve subscription and activate plan ─────────────────
async function autoApproveSubscription(pool, payment, adminId, utrRef) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE payment_verifications SET status = 'approved', admin_id = $1, reviewed_at = CURRENT_TIMESTAMP, utr_ref = $2 WHERE id = $3`,
      [adminId || 'auto-verify', utrRef || null, payment.id]
    );
    const plan = payment.plan_name;
    const cycle = payment.billing_cycle || 'monthly';
    const planRes = await client.query('SELECT * FROM organizer_plans WHERE name = $1', [plan]);
    if (planRes.rows.length > 0) {
      const planDetails = planRes.rows[0];
      await client.query('UPDATE users SET tier = $1 WHERE id = $2', [plan, payment.user_id]);
      const renewalDate = new Date();
      if (cycle === 'monthly') renewalDate.setMonth(renewalDate.getMonth() + 1);
      else renewalDate.setFullYear(renewalDate.getFullYear() + 1);
      const subRes = await client.query('SELECT id FROM subscriptions WHERE organizer_id = $1', [payment.user_id]);
      if (subRes.rows.length > 0) {
        await client.query(
          `UPDATE subscriptions SET plan_id = $1, billing_status = 'active', billing_cycle = $2,
           plan_start_date = CURRENT_TIMESTAMP, renewal_date = $3, cancelled_at = NULL WHERE organizer_id = $4`,
          [planDetails.id, cycle, renewalDate, payment.user_id]
        );
      } else {
        const subId = 'SUB-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await client.query(
          `INSERT INTO subscriptions (id, organizer_id, plan_id, billing_status, billing_cycle, plan_start_date, renewal_date)
           VALUES ($1, $2, $3, 'active', $4, CURRENT_TIMESTAMP, $5)`,
          [subId, payment.user_id, planDetails.id, cycle, renewalDate]
        );
      }
      const billId = 'BILL-' + crypto.randomBytes(6).toString('hex').toUpperCase();
      await client.query(
        `INSERT INTO billing_history (id, organizer_id, plan_name, billing_cycle, amount, status)
         VALUES ($1, $2, $3, $4, $5, 'completed')`,
        [billId, payment.user_id, plan, cycle, payment.amount]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── AUTO LIFECYCLE: Auto live/complete based on round timings ─────────────
async function processTournamentLifecycle(now) {
  try {
    // Auto-live: tournaments whose first round starts within 5 min (or already started)
    const notLive = await pool.query(
      `SELECT id, timeline FROM tournaments
       WHERE ("isDraft" = false OR "isDraft" IS NULL)
         AND status NOT IN ('live','completed','archived')
         AND timeline IS NOT NULL AND timeline != '' AND timeline != '[]'`
    );
    for (const t of notLive.rows) {
      try {
        const parsed = typeof t.timeline === 'string' ? JSON.parse(t.timeline) : t.timeline;
        const rounds = parsed?.roadmap || (Array.isArray(parsed) ? parsed : []);
        const first = rounds[0];
        if (!first?.date || !first?.time) continue;
        const roundStart = new Date(`${first.date}T${first.time}+05:30`);
        if (isNaN(roundStart.getTime())) continue;
        if (now >= new Date(roundStart.getTime() - 5 * 60 * 1000)) {
          await pool.query('UPDATE tournaments SET status = $1 WHERE id = $2', ['live', t.id]);
          console.log(`🏆 [AUTO LIFECYCLE] Tournament ${t.id} set to live (round 1 at ${first.date}T${first.time} IST)`);
        }
      } catch (_) { /* skip malformed timeline */ }
    }

    // Live-state tournaments: revert if first round hasn't started, complete if last round ended 12+ h ago
    const liveOnes = await pool.query(
      `SELECT id, timeline FROM tournaments
       WHERE status = 'live'
         AND timeline IS NOT NULL AND timeline != '' AND timeline != '[]'`
    );
    for (const t of liveOnes.rows) {
      try {
        const parsed = typeof t.timeline === 'string' ? JSON.parse(t.timeline) : t.timeline;
        const rounds = parsed?.roadmap || (Array.isArray(parsed) ? parsed : []);
        if (!rounds.length) continue;
        const first = rounds[0];
        const last = rounds[rounds.length - 1];

        // Revert-live: first round hasn't started yet (now < roundStart - 5min)
        if (first?.date && first?.time) {
          const roundStart = new Date(`${first.date}T${first.time}+05:30`);
          if (!isNaN(roundStart.getTime()) && now < new Date(roundStart.getTime() - 5 * 60 * 1000)) {
            await pool.query('UPDATE tournaments SET status = NULL WHERE id = $1', [t.id]);
            console.log(`🔄 [AUTO LIFECYCLE] Tournament ${t.id} reverted from live (round 1 at ${first.date}T${first.time} IST, now is before -5min)`);
            continue; // skip complete check since status was reverted
          }
        }

        // Auto-complete: last round ended 12+ hours ago
        if (last?.date && last?.time) {
          const lastEnd = new Date(`${last.date}T${last.time}+05:30`);
          if (!isNaN(lastEnd.getTime()) && now >= new Date(lastEnd.getTime() + 12 * 60 * 60 * 1000)) {
            await pool.query('UPDATE tournaments SET status = $1 WHERE id = $2', ['completed', t.id]);
            console.log(`🏆 [AUTO LIFECYCLE] Tournament ${t.id} set to completed (last round at ${last.date}T${last.time} IST)`);
          }
        }
      } catch (_) { /* skip malformed timeline */ }
    }
  } catch (err) {
    console.error('Auto lifecycle error:', err.message);
  }
}

// ── AUTOMATION PROCESSOR: In-process timer for tournament automations ─────
function startAutomationProcessor() {
  console.log('⏰ Automation processor started (interval: 60s)');
  setInterval(async () => {
    try {
      const now = new Date();
      await processTournamentLifecycle(now);
      const rulesRes = await pool.query(
        'SELECT * FROM automation_rules WHERE is_active = true'
      );
      for (const rule of rulesRes.rows) {
        try {
          const config = typeof rule.action_config === 'string' ? JSON.parse(rule.action_config) : (rule.action_config || {});
          const tournamentId = config.tournamentId || rule.tournament_id;
          if (!tournamentId) continue;
          const scheduledAt = config.scheduledAt ? new Date(config.scheduledAt) : null;
          if (scheduledAt && scheduledAt > now) continue;
          if (rule.trigger_event === 'auto_publish') {
            await pool.query(
              'UPDATE tournaments SET status = $1, "isDraft" = false WHERE id = $2',
              ['published', tournamentId]
            );
            await pool.query(
              'INSERT INTO admin_action_log (id, admin_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
              ['LOG-' + crypto.randomBytes(4).toString('hex').toUpperCase(), 'system', 'auto_publish', 'tournament', tournamentId, JSON.stringify({ rule_id: rule.id })]
            );
          } else if (rule.trigger_event === 'auto_open_registration') {
            await pool.query(
              "UPDATE tournaments SET status = 'registration_open' WHERE id = $1",
              [tournamentId]
            );
          } else if (rule.trigger_event === 'auto_close_registration') {
            await pool.query(
              "UPDATE tournaments SET status = 'live' WHERE id = $1",
              [tournamentId]
            );
          } else if (rule.trigger_event === 'auto_reminder') {
            const tRes = await pool.query('SELECT "orgId", title FROM tournaments WHERE id = $1', [tournamentId]);
            if (tRes.rows.length > 0) {
              const orgId = tRes.rows[0].orgId;
              const tTitle = tRes.rows[0].title;
              const regs = await pool.query(
                'SELECT DISTINCT email FROM tournament_registrations WHERE tournament_id = $1 AND email IS NOT NULL',
                [tournamentId]
              );
              for (const reg of regs.rows) {
                try {
                  if (resend) {
                    await resend.emails.send({
                      from: 'Match District <notifications@matchdistrict.in>',
                      to: reg.email,
                      subject: `Reminder: ${tTitle} starts soon!`,
                      html: `<p>Your tournament <strong>${tTitle}</strong> is starting soon. Please check in and join the lobby.</p>`,
                    });
                  }
                } catch (_) { }
              }
            }
          } else if (rule.trigger_event === 'auto_notification') {
            const noticeText = config.message || 'Automated notification from Match District.';
            await pool.query(
              `INSERT INTO notices (id, tournament_id, title, content, created_at)
               VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
              ['NOTICE-' + crypto.randomBytes(6).toString('hex').toUpperCase(), tournamentId, 'Automated Notice', noticeText]
            );
          } else if (rule.trigger_event === 'auto_status_update') {
            const targetStatus = config.targetStatus || 'live';
            await pool.query(
              'UPDATE tournaments SET status = $1 WHERE id = $2',
              [targetStatus, tournamentId]
            );
          }
          await pool.query(
            'UPDATE automation_rules SET last_run_at = CURRENT_TIMESTAMP WHERE id = $1',
            [rule.id]
          );
        } catch (ruleErr) {
          console.error('Automation rule error:', rule.id, ruleErr.message);
        }
      }
    } catch (err) {
      console.error('Automation processor error:', err.message);
    }
  }, 60000);
}

(async () => {
  await initDb();
  startSlotManagerWorker(pool);
  startAutomationProcessor();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 [MATCH DISTRICT PRODUCTION SERVER] Running on http://localhost:${PORT}`);
    console.log(`🌐 Network: http://127.0.0.1:${PORT} (listening on all interfaces 0.0.0.0)`);
    console.log(`📦 Serving static frontend from ./dist`);
    console.log(`🔑 API Endpoints active (OTP, JWT Auth, Supabase DB)\n`);
  });
})();

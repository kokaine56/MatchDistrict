// server/schemaMigrations.js
// Single authoritative source of truth for MatchDistrict database schema and DDL migrations.
// Applied at production startup by server.js initDb to the live Supabase database.

export const SCHEMA_TABLES = Object.freeze([
  'users',
  'user_discord_connections',
  'auth_identities',
  'auth_link_challenges',
  'otps',
  'verification_abuse',
  'email_change_requests',
  'password_resets',
  'temp_users',
  'registration_cooldowns',
  'payment_verifications',
  'notifications',
  'alerts',
  'site_settings',
  'organiser_followers',
  'organizer_applications',
  'organizer_drafts',
  'organizer_plans',
  'subscriptions',
  'plan_upgrade_requests',
  'tournaments',
  'tournament_registrations',
  'tournament_registration_groups',
  'registration_sessions',
  'payment_submissions',
  'team_presets',
  'admin_action_log',
  'terms_acceptance_log',
  'slot_grid',
  'sponsor_requests',
  'sponsor_list',
  'sponsor_contributions',
  'tournament_planning_config',
  'tournament_planning_result',
  'tournament_rounds',
  'tournament_days',
  'tournament_groups',
  'tournament_rooms',
  'tournament_matches',
  'tournament_teams',
  'tournament_team_members',
  'tournament_team_invitations',
  'tournament_match_assignments',
  'tournament_scoring_rules',
  'tournament_match_results',
  'tournament_match_results_audit',
  'tournament_leaderboard',
  'tournament_final_standings',
  'tournament_prize_awards',
  'user_payout_profiles',
  'tournament_prize_payments',
  'system_services',
  'service_health_checks',
  'system_incidents',
  'security_findings',
  'monitoring_settings',
  'tournament_promotions',
  'analytics_events',
  'api_keys',
  'automation_rules',
  'billing_history',
  'custom_links',
  'custom_registration_forms',
  'custom_subdomains',
  'export_usage_log',
  'feature_flags',
  'games',
  'staff_members',
  'wallet_transactions',
  'tournament_notices',
  'tournament_messages',
  'notices',
  'white_label_settings',
  'profiles',
]);

function splitSqlStatements(sql) {
  const statements = [];
  let start = 0;
  let quote = null;
  let dollarTag = null;
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; i += 1; } continue; }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) { i += dollarTag.length - 1; dollarTag = null; }
      continue;
    }
    if (quote) {
      if (ch === quote && next === quote) { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '-' && next === '-') { lineComment = true; i += 1; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === '$') {
      const match = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) { dollarTag = match[0]; i += dollarTag.length - 1; continue; }
    }
    if (ch === ';') {
      const statement = sql.slice(start, i).trim();
      if (statement) statements.push(statement);
      start = i + 1;
    }
  }
  const tail = sql.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

export async function runMigrationBatch(client, sql) {
  for (const statement of splitSqlStatements(sql)) {
    const target = statement.match(/\bTABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)/i)?.[1]
      || statement.match(/\bON\s+(?:public\.)?"?([a-z_][a-z0-9_]*)/i)?.[1]
      || statement.match(/\b(?:INTO|UPDATE|FROM)\s+(?:public\.)?"?([a-z_][a-z0-9_]*)/i)?.[1]
      || statement.match(/\b(?:FUNCTION|TRIGGER)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)/i)?.[1]
      || 'unknown';
    try {
      await client.query(statement);
    } catch (error) {
      console.error(`[SCHEMA] Migration statement failed for table/target "${target}" [code: ${error.code || 'UNKNOWN'}]: ${error.message}`);
      throw new Error(`Schema migration failed for table/target "${target}" [code: ${error.code || 'UNKNOWN'}]: ${error.message}`, { cause: error });
    }
  }
}

/**
 * Runs all idempotent DDL migrations to ensure all required tables, columns,
 * constraints, indexes, and triggers exist in the target database.
 *
 * @param {object} clientOrPool - pg Client or Pool
 */
export async function runSchemaMigrations(clientOrPool) {
  // A pg Pool has .connect() but no .release(); a checked-out PoolClient has .release()
  const isPool = typeof clientOrPool.connect === 'function' && typeof clientOrPool.release !== 'function';
  const client = isPool ? await clientOrPool.connect() : clientOrPool;

  try {
    // 1. Users, OTPs, password resets, and session tracking
    await runMigrationBatch(client, `
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

      -- OAuth-only users have no password credential until they explicitly create one.
      ALTER TABLE users ALTER COLUMN password DROP NOT NULL;

      ALTER TABLE users ADD COLUMN IF NOT EXISTS uid VARCHAR(255);
      -- Kept nullable until the explicitly phased backfill migration verifies all accounts.
      ALTER TABLE users ADD COLUMN IF NOT EXISTS district_id VARCHAR(32);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "riotId" VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "bgmiId" VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "steamId" VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "discordTag" VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "gamertag_last_changed" TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "email_last_changed" TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "orgName" VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "orgMotto" VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "customDashboardSlug" VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "orgBanner" TEXT DEFAULT '';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "orgBio" TEXT DEFAULT '';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "orgHandle" VARCHAR(100);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "orgImage" TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS early_access BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_totp_secret VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_totp_activated BOOLEAN DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "orgSlug" VARCHAR(100);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_id VARCHAR(32);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id) WHERE discord_id IS NOT NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_set BOOLEAN DEFAULT true;
      UPDATE users SET password_set = false WHERE google_id IS NOT NULL AND password_set IS NULL;
      UPDATE users SET password_set = true WHERE password_set IS NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(32);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS username_last_changed TIMESTAMP;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (lower(username)) WHERE username IS NOT NULL;

      CREATE TABLE IF NOT EXISTS user_discord_connections (
        user_id VARCHAR(50) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        discord_id VARCHAR(32) NOT NULL UNIQUE,
        username VARCHAR(64),
        global_name VARCHAR(128),
        avatar_hash VARCHAR(64),
        connected_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_user_discord_connections_discord_id ON user_discord_connections(discord_id);

      CREATE TABLE IF NOT EXISTS auth_identities (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider VARCHAR(20) NOT NULL CHECK (provider IN ('google', 'discord')),
        provider_user_id VARCHAR(64) NOT NULL,
        provider_email VARCHAR(255),
        email_verified BOOLEAN,
        display_name VARCHAR(128),
        avatar_url TEXT,
        linked_at TIMESTAMPTZ DEFAULT NOW(),
        last_login_at TIMESTAMPTZ,
        UNIQUE (provider, provider_user_id),
        UNIQUE (user_id, provider)
      );
      CREATE INDEX IF NOT EXISTS idx_auth_identities_provider_email_lower
        ON auth_identities (lower(provider_email)) WHERE provider_email IS NOT NULL;
      CREATE TABLE IF NOT EXISTS auth_link_challenges (
        user_id VARCHAR(50) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        code_hash VARCHAR(64) NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Compatibility backfills are additive and safe to repeat. Conflicting mappings
      -- are left untouched for manual review; no account is reassigned or merged.
      INSERT INTO auth_identities (id, user_id, provider, provider_user_id, provider_email, email_verified, linked_at)
      SELECT 'AID-' || md5('google:' || u.id), u.id, 'google', u.google_id, u.email, true, COALESCE(u.created_at, NOW())
      FROM users u WHERE u.google_id IS NOT NULL AND btrim(u.google_id) <> ''
      ON CONFLICT DO NOTHING;
      INSERT INTO auth_identities (id, user_id, provider, provider_user_id, display_name, linked_at)
      SELECT 'AID-' || md5('discord:' || u.id), u.id, 'discord', u.discord_id,
             COALESCE(NULLIF(d.global_name, ''), NULLIF(d.username, '')), COALESCE(d.connected_at, NOW())
      FROM users u LEFT JOIN user_discord_connections d ON d.user_id = u.id AND d.discord_id = u.discord_id
      WHERE u.discord_id IS NOT NULL AND btrim(u.discord_id) <> ''
      ON CONFLICT DO NOTHING;
      INSERT INTO auth_identities (id, user_id, provider, provider_user_id, display_name, linked_at)
      SELECT 'AID-' || md5('discord:' || d.user_id), d.user_id, 'discord', d.discord_id,
             COALESCE(NULLIF(d.global_name, ''), NULLIF(d.username, '')), COALESCE(d.connected_at, NOW())
      FROM user_discord_connections d
      ON CONFLICT DO NOTHING;

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
      ALTER TABLE temp_users ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;
      ALTER TABLE temp_users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255);
      ALTER TABLE otps ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0;

      CREATE TABLE IF NOT EXISTS registration_cooldowns (
        client_key VARCHAR(64) PRIMARY KEY,
        attempts INTEGER DEFAULT 1,
        cooldown_until TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );


      CREATE TABLE IF NOT EXISTS payment_verifications (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50),
        plan_name VARCHAR(100),
        billing_cycle VARCHAR(50),
        amount NUMERIC(10, 2),
        transaction_id VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        admin_id VARCHAR(50),
        rejection_reason TEXT,
        reviewed_at TIMESTAMPTZ,
        payment_screenshot_url TEXT,
        payment_notes TEXT,
        utr_ref VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS user_id VARCHAR(50);
      ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS plan_name VARCHAR(100);
      ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(50);
      ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS amount NUMERIC(10, 2);
      ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(255);
      ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';
      ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS admin_id VARCHAR(50);
      ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
      ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
      ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS payment_screenshot_url TEXT;
      ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS payment_notes TEXT;
      ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS utr_ref VARCHAR(255);
      ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
      ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();


      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        type VARCHAR(50) DEFAULT 'info',
        title VARCHAR(255),
        message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS site_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS organiser_followers (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        organiser_id VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE organiser_followers ADD COLUMN IF NOT EXISTS organiser_id VARCHAR(50);
      ALTER TABLE organiser_followers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

      -- Bell notifications: columns that existing INSERT/SELECT statements already rely on
      ALTER TABLE alerts ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;
      ALTER TABLE alerts ADD COLUMN IF NOT EXISTS tournament_id VARCHAR(50);
      -- 24-hour notification lifetime: cleanup + read filters use created_at
      CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts (created_at);
      CREATE INDEX IF NOT EXISTS idx_alerts_user_created ON alerts (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at);

      -- Verification abuse guard (HMAC-hashed subjects only; no raw emails or IPs)
      CREATE TABLE IF NOT EXISTS verification_abuse (
        id BIGSERIAL PRIMARY KEY,
        subject_type VARCHAR(10) NOT NULL CHECK (subject_type IN ('user', 'email', 'ip')),
        subject_key CHAR(64) NOT NULL,
        action VARCHAR(40) NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        request_count INTEGER NOT NULL DEFAULT 0,
        window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_sent_at TIMESTAMPTZ,
        lock_level INTEGER NOT NULL DEFAULT 0,
        locked_until TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (subject_type, subject_key, action)
      );
      CREATE INDEX IF NOT EXISTS idx_verification_abuse_updated_at ON verification_abuse (updated_at);

      -- Two-step email change state (codes stored as SHA-256 digests only)
      CREATE TABLE IF NOT EXISTS email_change_requests (
        user_id VARCHAR(50) PRIMARY KEY,
        old_code_hash VARCHAR(64),
        old_code_expires_at TIMESTAMPTZ,
        old_attempts INTEGER NOT NULL DEFAULT 0,
        old_verified_at TIMESTAMPTZ,
        new_email VARCHAR(255),
        new_code_hash VARCHAR(64),
        new_code_expires_at TIMESTAMPTZ,
        new_attempts INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Organizer apps, plans, and subscriptions
    await runMigrationBatch(client, `
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
        yearly_price INT DEFAULT 0,
        max_tournaments INT,
        max_slots INT,
        has_verified_badge BOOLEAN,
        has_premium_badge BOOLEAN DEFAULT false,
        staff_limit INT DEFAULT 0,
        api_access BOOLEAN DEFAULT false,
        white_label BOOLEAN DEFAULT false,
        custom_subdomain BOOLEAN DEFAULT false,
        automation_enabled BOOLEAN DEFAULT false,
        priority_support BOOLEAN DEFAULT false
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
        plan_expiration TIMESTAMP,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS early_access_enabled BOOLEAN DEFAULT false;
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(50);
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS renewal_date TIMESTAMPTZ;
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

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

    // 3. Tournaments, registrations, registration sessions, and payments
    await runMigrationBatch(client, `
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
      ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS "entryFee" VARCHAR(100);
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
      ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS roadmap_status VARCHAR(50) DEFAULT 'pending';
      ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;
      ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS finalized_by VARCHAR(50);
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
      ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS teams_per_match INTEGER DEFAULT 20;
      ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS unique_amount_suffix_enabled BOOLEAN DEFAULT false;
      ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS card_color VARCHAR(50) DEFAULT 'white';
      ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS rounds_published BOOLEAN DEFAULT true;
      ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS teams_per_group INTEGER DEFAULT 16;
      ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS roadmap_image_url TEXT DEFAULT '';
      ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS matches_per_day INTEGER;
      ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS first_match_time VARCHAR(10);
      ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS match_gap_minutes INTEGER;
      ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS match_duration_minutes INTEGER;
      ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS teams_advancing_per_district INTEGER;
      ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS enable_semi_finals BOOLEAN;
      ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS room_credentials_release_minutes INTEGER DEFAULT 15;

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
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        group_id VARCHAR(50),
        group_name VARCHAR(50),
        captain_uid VARCHAR(100),
        idempotency_key VARCHAR(64),
        version INTEGER DEFAULT 1,
        payment_id VARCHAR(50),
        rejection_reason TEXT,
        amount_due NUMERIC(10, 2)
      );
      ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS captain_uid VARCHAR(100);
      ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(64);
      ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
      ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS payment_id VARCHAR(50);
      ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
      ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP;
      ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS screenshot_url TEXT;
      ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(100);
      ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS payment_app VARCHAR(50);
      ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS group_id VARCHAR(50);
      ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS group_name VARCHAR(50);
      ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS amount_due NUMERIC(10, 2);
      CREATE INDEX IF NOT EXISTS idx_tournament_registrations_tournament ON tournament_registrations(tournament_id);
      CREATE INDEX IF NOT EXISTS idx_tournament_registrations_user ON tournament_registrations(user_id);
      CREATE INDEX IF NOT EXISTS idx_tournament_registrations_status ON tournament_registrations(status);
      CREATE INDEX IF NOT EXISTS idx_tournament_registrations_idempotency ON tournament_registrations(idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_tournament_registrations_amount_due ON tournament_registrations(amount_due);

      CREATE TABLE IF NOT EXISTS tournament_registration_groups (
        id VARCHAR(50) PRIMARY KEY,
        tournament_id VARCHAR(50) NOT NULL,
        group_index INTEGER NOT NULL,
        name VARCHAR(5) NOT NULL,
        capacity INTEGER NOT NULL DEFAULT 16,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (tournament_id, group_index)
      );
      CREATE INDEX IF NOT EXISTS idx_registration_groups_tournament ON tournament_registration_groups(tournament_id);

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
      ALTER TABLE registration_sessions ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(64);
      ALTER TABLE registration_sessions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

      CREATE TABLE IF NOT EXISTS payment_submissions (
        id VARCHAR(50) PRIMARY KEY,
        registration_id VARCHAR(50),
        tournament_id VARCHAR(50) NOT NULL,
        user_id VARCHAR(50) NOT NULL,
        amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
        proof_url TEXT NOT NULL,
        utr_number VARCHAR(255),
        payment_app VARCHAR(50),
        payment_status VARCHAR(30) DEFAULT 'pending_admin_review',
        admin_notes TEXT,
        reviewed_by VARCHAR(50),
        reviewed_at TIMESTAMPTZ,
        idempotency_key VARCHAR(64) UNIQUE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE payment_submissions ADD COLUMN IF NOT EXISTS utr_number VARCHAR(255);
      ALTER TABLE payment_submissions ADD COLUMN IF NOT EXISTS payment_app VARCHAR(50);
      ALTER TABLE payment_submissions ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'pending_admin_review';
      ALTER TABLE payment_submissions ADD COLUMN IF NOT EXISTS admin_notes TEXT;
      ALTER TABLE payment_submissions ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(50);
      ALTER TABLE payment_submissions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
      ALTER TABLE payment_submissions ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(64);
      ALTER TABLE payment_submissions ADD COLUMN IF NOT EXISTS amount NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE payment_submissions ADD COLUMN IF NOT EXISTS proof_url TEXT;
      CREATE INDEX IF NOT EXISTS idx_payment_submissions_registration ON payment_submissions(registration_id);
      CREATE INDEX IF NOT EXISTS idx_payment_submissions_tournament ON payment_submissions(tournament_id);
      CREATE INDEX IF NOT EXISTS idx_payment_submissions_user ON payment_submissions(user_id);

      CREATE TABLE IF NOT EXISTS team_presets (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        team_name VARCHAR(255) NOT NULL,
        captain VARCHAR(255),
        members TEXT DEFAULT '[]',
        preset_name VARCHAR(255),
        game VARCHAR(100) DEFAULT 'BGMI',
        captain_uid VARCHAR(100),
        players TEXT DEFAULT '[]',
        substitutes TEXT DEFAULT '[]',
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

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
      ALTER TABLE admin_action_log ADD COLUMN IF NOT EXISTS action TEXT;
      ALTER TABLE admin_action_log ADD COLUMN IF NOT EXISTS action_type TEXT;
      ALTER TABLE admin_action_log ADD COLUMN IF NOT EXISTS target_type VARCHAR(50);
      ALTER TABLE admin_action_log ADD COLUMN IF NOT EXISTS target_id VARCHAR(50);
      ALTER TABLE admin_action_log ADD COLUMN IF NOT EXISTS target_user VARCHAR(50);
      ALTER TABLE admin_action_log ADD COLUMN IF NOT EXISTS details TEXT;
      ALTER TABLE admin_action_log ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
      CREATE INDEX IF NOT EXISTS idx_admin_action_log_admin ON admin_action_log(admin_id);
      CREATE INDEX IF NOT EXISTS idx_admin_action_log_created ON admin_action_log(created_at DESC);

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

      CREATE TABLE IF NOT EXISTS sponsor_requests (
        id VARCHAR(50) PRIMARY KEY,
        organizer_id VARCHAR(50),
        tournament_id VARCHAR(50),
        prize_pool_amount INTEGER DEFAULT 0,
        sponsor_type VARCHAR(50) DEFAULT 'prize_pool',
        description TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        admin_notes TEXT,
        admin_id VARCHAR(50),
        reviewed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

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
        user_id VARCHAR(50),
        contributor_name VARCHAR(255) NOT NULL,
        contributor_email VARCHAR(255),
        amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
        message TEXT,
        screenshot_url TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        admin_notes TEXT,
        admin_id VARCHAR(50),
        reviewed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        transaction_id VARCHAR(255),
        payment_app VARCHAR(50)
      );
    `);

    // 4. Roadmap and Rounds structural foundation
    await runMigrationBatch(client, `
      CREATE TABLE IF NOT EXISTS tournament_planning_config (
        id VARCHAR(50) PRIMARY KEY,
        tournament_id VARCHAR(50) NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        expected_teams INTEGER NOT NULL DEFAULT 0,
        maximum_teams INTEGER NOT NULL DEFAULT 0,
        players_per_team INTEGER NOT NULL DEFAULT 4,
        teams_per_room INTEGER NOT NULL DEFAULT 16,
        teams_per_group INTEGER NOT NULL DEFAULT 16,
        max_simultaneous_rooms INTEGER NOT NULL DEFAULT 1,
        matches_per_team INTEGER NOT NULL DEFAULT 3,
        match_duration_minutes INTEGER NOT NULL DEFAULT 25,
        break_between_matches_minutes INTEGER NOT NULL DEFAULT 5,
        daily_start_time VARCHAR(10) NOT NULL DEFAULT '10:00',
        daily_end_time VARCHAR(10) NOT NULL DEFAULT '22:00',
        max_matches_per_day INTEGER DEFAULT NULL,
        config_status VARCHAR(30) DEFAULT 'draft',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tournament_id)
      );

      CREATE TABLE IF NOT EXISTS tournament_planning_result (
        id VARCHAR(50) PRIMARY KEY,
        tournament_id VARCHAR(50) NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        config_snapshot JSONB NOT NULL,
        planning_team_count INTEGER NOT NULL,
        expected_teams INTEGER NOT NULL,
        required_rooms INTEGER NOT NULL,
        max_simultaneous_rooms INTEGER NOT NULL,
        teams_per_room INTEGER NOT NULL,
        matches_per_team INTEGER NOT NULL,
        total_room_sessions INTEGER NOT NULL,
        match_duration_minutes INTEGER NOT NULL,
        break_between_matches_minutes INTEGER NOT NULL,
        daily_operating_minutes INTEGER NOT NULL,
        match_slot_minutes INTEGER NOT NULL,
        sequential_slots_per_room INTEGER NOT NULL,
        calculated_daily_capacity INTEGER NOT NULL,
        configured_max_per_day INTEGER,
        effective_daily_capacity INTEGER NOT NULL,
        required_days INTEGER NOT NULL,
        tournament_start_date VARCHAR(30),
        tournament_end_date VARCHAR(30),
        daily_plan JSONB NOT NULL,
        plan_version INTEGER NOT NULL DEFAULT 1,
        plan_status VARCHAR(30) DEFAULT 'generated',
        generated_by VARCHAR(50) NOT NULL,
        generated_at TIMESTAMPTZ DEFAULT NOW(),
        approved_by VARCHAR(50),
        approved_at TIMESTAMPTZ,
        round_plan JSONB,
        UNIQUE(tournament_id, plan_version)
      );

      CREATE TABLE IF NOT EXISTS tournament_rounds (
        id VARCHAR(50) PRIMARY KEY,
        tournament_id VARCHAR(50) NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        round_number INTEGER NOT NULL,
        name VARCHAR(255) NOT NULL,
        status VARCHAR(30) DEFAULT 'configured',
        teams_advancing INTEGER,
        "date" VARCHAR(30),
        "time" VARCHAR(10),
        map VARCHAR(255),
        round_type VARCHAR(50) DEFAULT 'qualifier',
        advancement_type VARCHAR(50) DEFAULT 'per_district',
        advancement_target_round_id VARCHAR(50),
        teams_advancing_per_district INTEGER,
        teams_advancing_per_match INTEGER,
        round_order INTEGER,
        teams_in INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tournament_id, round_number)
      );
      CREATE INDEX IF NOT EXISTS idx_tournament_rounds_tournament ON tournament_rounds(tournament_id);
      ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS teams_in INTEGER;
      ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS round_type VARCHAR(50) DEFAULT 'qualifier';
      ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS advancement_type VARCHAR(50) DEFAULT 'per_district';
      ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS advancement_target_round_id VARCHAR(50);
      ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS teams_advancing_per_district INTEGER;
      ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS teams_advancing_per_match INTEGER;
      ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS round_order INTEGER;
      ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS lobbies_note TEXT;
      ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;
      ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS is_grand_final BOOLEAN DEFAULT false;
      ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS "date" VARCHAR(30);
      ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS "time" VARCHAR(10);
      ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS map VARCHAR(255);

      CREATE TABLE IF NOT EXISTS tournament_days (
        id VARCHAR(50) PRIMARY KEY,
        tournament_id VARCHAR(50) NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        day_number INTEGER NOT NULL,
        date VARCHAR(30) NOT NULL,
        round_id VARCHAR(50)
      );
      ALTER TABLE tournament_days ADD COLUMN IF NOT EXISTS round_id VARCHAR(50);
      ALTER TABLE tournament_days ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;
      CREATE INDEX IF NOT EXISTS idx_tournament_days_tournament ON tournament_days(tournament_id);

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'uq_tournament_days_round_day'
            AND conrelid = 'public.tournament_days'::regclass
        ) THEN
          ALTER TABLE public.tournament_days ADD CONSTRAINT uq_tournament_days_round_day
            UNIQUE (tournament_id, round_id, day_number);
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS tournament_groups (
        id VARCHAR(50) PRIMARY KEY,
        day_id VARCHAR(50) REFERENCES tournament_days(id) ON DELETE CASCADE,
        tournament_id VARCHAR(50) NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        group_name VARCHAR(100) NOT NULL,
        sequence INTEGER NOT NULL,
        round_id VARCHAR(50),
        display_order INTEGER,
        district_id VARCHAR(50),
        UNIQUE(day_id, sequence)
      );
      ALTER TABLE tournament_groups ADD COLUMN IF NOT EXISTS district_id VARCHAR(50);
      ALTER TABLE tournament_groups ADD COLUMN IF NOT EXISTS display_order INTEGER;
      ALTER TABLE tournament_groups ADD COLUMN IF NOT EXISTS round_id VARCHAR(50);
      CREATE INDEX IF NOT EXISTS idx_tournament_groups_day ON tournament_groups(day_id);

      CREATE TABLE IF NOT EXISTS tournament_rooms (
        id VARCHAR(50) PRIMARY KEY,
        group_id VARCHAR(50) REFERENCES tournament_groups(id) ON DELETE CASCADE,
        day_id VARCHAR(50) REFERENCES tournament_days(id) ON DELETE CASCADE,
        tournament_id VARCHAR(50) NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        room_number INTEGER NOT NULL,
        capacity INTEGER NOT NULL,
        status VARCHAR(30) DEFAULT 'DRAFT',
        round_id VARCHAR(50),
        UNIQUE(tournament_id, room_number)
      );
      ALTER TABLE tournament_rooms ADD COLUMN IF NOT EXISTS round_id VARCHAR(50);
      ALTER TABLE tournament_rooms ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'DRAFT';
      ALTER TABLE tournament_rooms ADD COLUMN IF NOT EXISTS capacity INTEGER;
      CREATE INDEX IF NOT EXISTS idx_tournament_rooms_group ON tournament_rooms(group_id);

      CREATE TABLE IF NOT EXISTS tournament_matches (
        id VARCHAR(50) PRIMARY KEY,
        room_id VARCHAR(50) REFERENCES tournament_rooms(id) ON DELETE CASCADE,
        group_id VARCHAR(50) REFERENCES tournament_groups(id) ON DELETE CASCADE,
        day_id VARCHAR(50) REFERENCES tournament_days(id) ON DELETE CASCADE,
        tournament_id VARCHAR(50) NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        match_number INTEGER NOT NULL,
        start_time VARCHAR(10) NOT NULL,
        end_time VARCHAR(10) NOT NULL,
        status VARCHAR(30) DEFAULT 'PENDING',
        room_identifier VARCHAR(100),
        room_password VARCHAR(100),
        credential_status VARCHAR(30) DEFAULT 'Not Configured',
        round_id VARCHAR(50),
        map VARCHAR(100),
        id_pwd_release_time VARCHAR(50),
        group_name VARCHAR(100),
        next_match_id VARCHAR(50) REFERENCES tournament_matches(id) ON DELETE SET NULL,
        next_round_id VARCHAR(50) REFERENCES tournament_rounds(id) ON DELETE SET NULL,
        teams_advancing INTEGER,
        progression_processed BOOLEAN DEFAULT false,
        origin VARCHAR(20) DEFAULT 'automatic',
        manual_override BOOLEAN DEFAULT FALSE,
        notes TEXT,
        display_order INTEGER,
        district_id VARCHAR(50)
      );
      ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS district_id VARCHAR(50);
      ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS display_order INTEGER;
      ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS origin VARCHAR(20) DEFAULT 'automatic';
      ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS manual_override BOOLEAN DEFAULT FALSE;
      ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS id_pwd_release_time VARCHAR(50);
      ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS group_name VARCHAR(100);
      ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS map VARCHAR(100);
      ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS teams_advancing INTEGER;
      ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS progression_processed BOOLEAN DEFAULT false;
      ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS next_match_id VARCHAR(50);
      ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS next_round_id VARCHAR(50);
      ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS round_id VARCHAR(50);
      ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS day_id VARCHAR(50);
      CREATE INDEX IF NOT EXISTS idx_tournament_matches_room ON tournament_matches(room_id);
      CREATE INDEX IF NOT EXISTS idx_tournament_matches_district ON tournament_matches(district_id);

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'uq_tournament_matches_round_match'
            AND conrelid = 'public.tournament_matches'::regclass
        ) THEN
          ALTER TABLE tournament_matches ADD CONSTRAINT uq_tournament_matches_round_match
            UNIQUE NULLS NOT DISTINCT (tournament_id, round_id, match_number);
        END IF;
      END $$;
    `);

    // 5. Teams, team members, invitations, and match assignments
    await runMigrationBatch(client, `
      CREATE TABLE IF NOT EXISTS tournament_teams (
        id VARCHAR(50) PRIMARY KEY,
        tournament_id VARCHAR(50) NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        team_name VARCHAR(255) NOT NULL,
        leader_user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'awaiting_members',
        registration_id VARCHAR(50),
        status_before_dq VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tournament_id, team_name)
      );
      ALTER TABLE tournament_teams ADD COLUMN IF NOT EXISTS status_before_dq VARCHAR(50);
      ALTER TABLE tournament_teams ADD COLUMN IF NOT EXISTS registration_id VARCHAR(50);
      ALTER TABLE tournament_teams ADD COLUMN IF NOT EXISTS squad_waived_by VARCHAR(50);
      ALTER TABLE tournament_teams ADD COLUMN IF NOT EXISTS squad_waived_at TIMESTAMPTZ;
      ALTER TABLE tournament_teams ADD COLUMN IF NOT EXISTS squad_waived_reason TEXT;
      CREATE INDEX IF NOT EXISTS idx_tournament_teams_tournament ON tournament_teams(tournament_id);
      CREATE INDEX IF NOT EXISTS idx_tournament_teams_registration ON tournament_teams(registration_id);
      CREATE INDEX IF NOT EXISTS idx_tournament_teams_squad_waived ON tournament_teams(squad_waived_by);

      CREATE TABLE IF NOT EXISTS tournament_team_members (
        id VARCHAR(50) PRIMARY KEY,
        tournament_team_id VARCHAR(50) NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
        tournament_id VARCHAR(50) NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        roster_slot INTEGER,
        UNIQUE(tournament_id, user_id)
      );
      ALTER TABLE tournament_team_members ADD COLUMN IF NOT EXISTS roster_slot INTEGER;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_roster_slot ON tournament_team_members(tournament_team_id, roster_slot) WHERE roster_slot IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_tournament_team_members_team ON tournament_team_members(tournament_team_id);

      CREATE TABLE IF NOT EXISTS tournament_team_invitations (
        id VARCHAR(50) PRIMARY KEY,
        tournament_id VARCHAR(50) NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        tournament_team_id VARCHAR(50) NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
        created_by_user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(100) UNIQUE NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON tournament_team_invitations(token);
      CREATE INDEX IF NOT EXISTS idx_team_invitations_team ON tournament_team_invitations(tournament_team_id);

      CREATE TABLE IF NOT EXISTS tournament_match_assignments (
        id VARCHAR(50) PRIMARY KEY,
        tournament_id VARCHAR(50) NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        tournament_team_id VARCHAR(50) NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
        match_id VARCHAR(50) NOT NULL REFERENCES tournament_matches(id) ON DELETE CASCADE,
        room_id VARCHAR(50) REFERENCES tournament_rooms(id) ON DELETE CASCADE,
        group_id VARCHAR(50) REFERENCES tournament_groups(id) ON DELETE CASCADE,
        day_id VARCHAR(50) REFERENCES tournament_days(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'allocated',
        source VARCHAR(20) DEFAULT 'manual',
        assigned_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tournament_team_id, match_id)
      );
      CREATE INDEX IF NOT EXISTS idx_match_assignments_team ON tournament_match_assignments(tournament_team_id);
      CREATE INDEX IF NOT EXISTS idx_match_assignments_match ON tournament_match_assignments(match_id);
      CREATE INDEX IF NOT EXISTS idx_match_assignments_room ON tournament_match_assignments(room_id);
    `);

    // 6. Scoring, results, leaderboard, standings, prize awards, and prize payments
    await runMigrationBatch(client, `
      CREATE TABLE IF NOT EXISTS tournament_scoring_rules (
        tournament_id VARCHAR(50) PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
        kill_points_multiplier INTEGER DEFAULT 1,
        placement_points_map JSONB DEFAULT '{"1": 15, "2": 12, "3": 10, "4": 8, "5": 6, "6": 4, "7": 2, "8": 1, "9": 1, "10": 1, "11": 1, "12": 1, "13": 0, "14": 0, "15": 0, "16": 0, "17": 0, "18": 0, "19": 0, "20": 0}'::jsonb,
        wwcd_bonus INTEGER DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tournament_match_results (
        id VARCHAR(50) PRIMARY KEY,
        tournament_id VARCHAR(50) NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        match_id VARCHAR(50) NOT NULL REFERENCES tournament_matches(id) ON DELETE CASCADE,
        team_id VARCHAR(50) NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
        placement INTEGER NOT NULL,
        kills INTEGER NOT NULL,
        kill_points INTEGER DEFAULT 0,
        placement_points INTEGER DEFAULT 0,
        wwcd BOOLEAN DEFAULT FALSE,
        total_points INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'pending',
        submitted_by VARCHAR(50),
        verified_by VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(match_id, team_id)
      );
      CREATE INDEX IF NOT EXISTS idx_match_results_tourn ON tournament_match_results(tournament_id);
      CREATE INDEX IF NOT EXISTS idx_match_results_match ON tournament_match_results(match_id);

      CREATE TABLE IF NOT EXISTS tournament_match_results_audit (
        id VARCHAR(50) PRIMARY KEY,
        result_id VARCHAR(50) NOT NULL REFERENCES tournament_match_results(id) ON DELETE CASCADE,
        action VARCHAR(50) NOT NULL,
        previous_data JSONB,
        new_data JSONB,
        actor_id VARCHAR(50),
        reason TEXT,
        timestamp TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tournament_leaderboard (
        id VARCHAR(50) PRIMARY KEY,
        tournament_id VARCHAR(50) NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        team_id VARCHAR(50) NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
        matches_played INTEGER DEFAULT 0,
        total_kills INTEGER DEFAULT 0,
        total_kill_points INTEGER DEFAULT 0,
        total_placement_points INTEGER DEFAULT 0,
        total_points INTEGER DEFAULT 0,
        wwcd_count INTEGER DEFAULT 0,
        best_placement INTEGER,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tournament_id, team_id)
      );
      CREATE INDEX IF NOT EXISTS idx_leaderboard_tournament ON tournament_leaderboard(tournament_id);

      CREATE TABLE IF NOT EXISTS tournament_final_standings (
        id VARCHAR(50) PRIMARY KEY,
        tournament_id VARCHAR(50) NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        team_id VARCHAR(50) NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
        rank INTEGER NOT NULL,
        total_points INTEGER NOT NULL DEFAULT 0,
        total_kills INTEGER NOT NULL DEFAULT 0,
        wwcd_count INTEGER NOT NULL DEFAULT 0,
        best_placement INTEGER,
        team_name VARCHAR(255),
        leader_name VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tournament_id, team_id),
        UNIQUE (tournament_id, rank)
      );
      CREATE INDEX IF NOT EXISTS idx_final_standings_tournament ON tournament_final_standings(tournament_id, rank);

      CREATE TABLE IF NOT EXISTS tournament_prize_awards (
        id VARCHAR(50) PRIMARY KEY,
        tournament_id VARCHAR(50) NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        final_standing_id VARCHAR(50) REFERENCES tournament_final_standings(id) ON DELETE RESTRICT,
        team_id VARCHAR(50) NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
        rank INTEGER NOT NULL,
        award_type VARCHAR(30) NOT NULL DEFAULT 'placement',
        prize_amount INTEGER NOT NULL CHECK (prize_amount >= 0),
        percentage NUMERIC(8,4),
        recipient_user_id VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending_payout',
        generated_by VARCHAR(50),
        paid_at TIMESTAMPTZ,
        recorded_by VARCHAR(50) REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tournament_id, award_type, rank)
      );
      CREATE INDEX IF NOT EXISTS idx_prize_awards_tournament ON tournament_prize_awards(tournament_id, rank);
      CREATE INDEX IF NOT EXISTS idx_prize_awards_recipient ON tournament_prize_awards(recipient_user_id);
      CREATE INDEX IF NOT EXISTS idx_prize_awards_status ON tournament_prize_awards(tournament_id, status);

      CREATE TABLE IF NOT EXISTS user_payout_profiles (
        user_id VARCHAR(50) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        upi_id VARCHAR(255) NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tournament_prize_payments (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        tournament_id VARCHAR(50) NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
        prize_award_id VARCHAR(50) NOT NULL UNIQUE REFERENCES tournament_prize_awards(id) ON DELETE RESTRICT,
        team_id VARCHAR(50) NOT NULL REFERENCES tournament_teams(id) ON DELETE RESTRICT,
        amount INTEGER NOT NULL CHECK (amount > 0),
        currency VARCHAR(3) NOT NULL DEFAULT 'INR',
        payment_type VARCHAR(40) NOT NULL CHECK (payment_type = 'tournament_prize'),
        payment_status VARCHAR(20) NOT NULL CHECK (payment_status = 'paid'),
        utr_reference VARCHAR(128) NOT NULL,
        recipient_upi_id VARCHAR(255) NOT NULL,
        paid_at TIMESTAMPTZ NOT NULL,
        recorded_by VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_prize_payments_utr
        ON tournament_prize_payments (lower(btrim(utr_reference)));
      CREATE INDEX IF NOT EXISTS idx_tournament_prize_payments_user
        ON tournament_prize_payments(user_id, paid_at DESC);

      CREATE OR REPLACE FUNCTION reject_prize_payment_mutation() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'Tournament prize payment history is immutable';
      END;
      $$;

      DROP TRIGGER IF EXISTS trg_prize_payment_immutable ON tournament_prize_payments;
      CREATE TRIGGER trg_prize_payment_immutable
        BEFORE UPDATE OR DELETE ON tournament_prize_payments
        FOR EACH ROW EXECUTE FUNCTION reject_prize_payment_mutation();
    `);

    // 7. System monitoring and promotions
    await runMigrationBatch(client, `
      CREATE TABLE IF NOT EXISTS system_services (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        type VARCHAR(50) NOT NULL,
        description TEXT,
        enabled BOOLEAN DEFAULT true,
        criticality VARCHAR(20) DEFAULT 'normal',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS service_health_checks (
        id SERIAL PRIMARY KEY,
        service_id VARCHAR(50) NOT NULL REFERENCES system_services(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL,
        response_time_ms INTEGER,
        status_code INTEGER,
        error_message TEXT,
        checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS system_incidents (
        id VARCHAR(50) PRIMARY KEY,
        service_id VARCHAR(50) NOT NULL REFERENCES system_services(id) ON DELETE CASCADE,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP,
        duration_seconds INTEGER,
        severity VARCHAR(20) NOT NULL,
        reason TEXT,
        status VARCHAR(20) DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS security_findings (
        id VARCHAR(50) PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        severity VARCHAR(20) NOT NULL,
        service VARCHAR(100),
        description TEXT,
        detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP,
        status VARCHAR(20) DEFAULT 'open',
        fingerprint TEXT UNIQUE
      );

      CREATE TABLE IF NOT EXISTS monitoring_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tournament_promotions (
        id VARCHAR(50) PRIMARY KEY,
        tournament_id VARCHAR(50) NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        is_active BOOLEAN NOT NULL DEFAULT true,
        placement VARCHAR(32) NOT NULL DEFAULT 'trending_featured',
        priority INTEGER NOT NULL DEFAULT 0,
        display_order INTEGER NOT NULL DEFAULT 0,
        starts_at TIMESTAMPTZ,
        ends_at TIMESTAMPTZ,
        created_by VARCHAR(50),
        updated_by VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_promotions_tournament ON tournament_promotions(tournament_id);
    `);

    // 8. Organizer dashboard and legacy operational tables queried by server.js
    await runMigrationBatch(client, `
      CREATE TABLE IF NOT EXISTS analytics_events (
        id VARCHAR(50) PRIMARY KEY,
        organizer_id VARCHAR(50),
        event_type VARCHAR(100),
        event_data TEXT,
        tournament_id VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_analytics_events_organizer_created ON analytics_events(organizer_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS api_keys (
        id VARCHAR(50) PRIMARY KEY,
        organizer_id VARCHAR(50) NOT NULL,
        key_prefix VARCHAR(32) NOT NULL,
        key_hash TEXT NOT NULL,
        name VARCHAR(255),
        permissions TEXT DEFAULT '[]',
        usage_count INTEGER DEFAULT 0,
        last_used_at TIMESTAMP,
        status VARCHAR(30) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        revoked_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_api_keys_organizer ON api_keys(organizer_id);

      CREATE TABLE IF NOT EXISTS automation_rules (
        id VARCHAR(50) PRIMARY KEY,
        organizer_id VARCHAR(50),
        name VARCHAR(255),
        trigger_event VARCHAR(100),
        action_type VARCHAR(100),
        action_config TEXT DEFAULT '{}',
        is_active BOOLEAN DEFAULT false,
        last_run_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS billing_history (
        id VARCHAR(50) PRIMARY KEY,
        organizer_id VARCHAR(50),
        plan_name VARCHAR(100),
        billing_cycle VARCHAR(50),
        amount INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'pending',
        invoice_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS custom_links (
        id VARCHAR(50) PRIMARY KEY,
        organizer_id VARCHAR(50),
        tournament_id VARCHAR(50),
        slug VARCHAR(255) UNIQUE NOT NULL,
        link_type VARCHAR(50),
        is_active BOOLEAN DEFAULT true,
        visit_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS custom_registration_forms (
        id VARCHAR(50) PRIMARY KEY,
        organizer_id VARCHAR(50),
        tournament_id VARCHAR(50) UNIQUE,
        form_schema TEXT DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS custom_subdomains (
        id VARCHAR(50) PRIMARY KEY,
        organizer_id VARCHAR(50),
        subdomain VARCHAR(255) UNIQUE NOT NULL,
        ssl_status VARCHAR(50) DEFAULT 'pending',
        cname_verified BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS export_usage_log (
        id VARCHAR(50) PRIMARY KEY,
        organizer_id VARCHAR(50),
        tournament_id VARCHAR(50),
        export_type VARCHAR(100),
        format VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS feature_flags (
        id VARCHAR(50) PRIMARY KEY,
        flag_key VARCHAR(100) UNIQUE NOT NULL,
        flag_label VARCHAR(255),
        description TEXT,
        enabled BOOLEAN DEFAULT false,
        target_tier VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS games (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        icon TEXT,
        active BOOLEAN DEFAULT true,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS staff_members (
        id VARCHAR(50) PRIMARY KEY,
        organizer_id VARCHAR(50) NOT NULL,
        name VARCHAR(255),
        email VARCHAR(255) NOT NULL,
        role VARCHAR(50),
        admin_role VARCHAR(50),
        permissions TEXT DEFAULT '[]',
        status VARCHAR(30) DEFAULT 'pending',
        invited_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(organizer_id, email)
      );

      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        description TEXT,
        type VARCHAR(50),
        amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tournament_notices (
        id VARCHAR(50) PRIMARY KEY,
        tournament_id VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        text TEXT,
        pin BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tournament_messages (
        id VARCHAR(50) PRIMARY KEY,
        tournament_id VARCHAR(50) NOT NULL,
        sender_name VARCHAR(255),
        sender_role VARCHAR(50),
        text TEXT NOT NULL,
        is_system BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS notices (
        id VARCHAR(50) PRIMARY KEY,
        tournament_id VARCHAR(50),
        title VARCHAR(255),
        content TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS white_label_settings (
        id VARCHAR(50) PRIMARY KEY,
        organizer_id VARCHAR(50) UNIQUE NOT NULL,
        primary_color VARCHAR(20),
        secondary_color VARCHAR(20),
        logo_url TEXT,
        banner_url TEXT,
        favicon_url TEXT,
        custom_css TEXT,
        tournament_page_branded BOOLEAN DEFAULT false,
        hide_matchdistrict_branding BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS profiles (
        id VARCHAR(50) PRIMARY KEY,
        uid VARCHAR(255),
        name VARCHAR(255),
        email VARCHAR(255) UNIQUE NOT NULL,
        "gamerTag" VARCHAR(255),
        role VARCHAR(50) DEFAULT 'gamer',
        roles TEXT[] DEFAULT '{user}',
        tier VARCHAR(50) DEFAULT 'Amateur',
        avatar TEXT,
        banner TEXT,
        phone VARCHAR(255),
        status VARCHAR(50) DEFAULT 'Active',
        "riotId" VARCHAR(255),
        "bgmiId" VARCHAR(255),
        "steamId" VARCHAR(255),
        "discordTag" VARCHAR(255),
        "socialLinks" TEXT,
        "orgName" VARCHAR(255),
        "orgMotto" VARCHAR(255),
        "orgHandle" VARCHAR(100),
        "orgImage" TEXT,
        "orgBio" TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username VARCHAR(32);

    `);

    await runMigrationBatch(client, `
      INSERT INTO games (id, name, icon, active, sort_order)
      VALUES
        ('bgmi', 'BGMI', '', true, 10),
        ('valorant', 'VALORANT', '', true, 20),
        ('free-fire', 'Free Fire', '', true, 30),
        ('codm', 'Call of Duty: Mobile', '', true, 40)
      ON CONFLICT (id) DO NOTHING;
    `);

    // 9. Default site settings seeds
    await runMigrationBatch(client, `
      INSERT INTO site_settings (key, value, updated_at)
      VALUES 
        ('platform_fee_percentage', '10', CURRENT_TIMESTAMP),
        ('organizer_fee_percentage', '5', CURRENT_TIMESTAMP),
        ('terms_version', '1.0', CURRENT_TIMESTAMP),
        ('privacy_version', '1.0', CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO NOTHING;
    `);

  } finally {
    if (isPool) client.release();
  }
}

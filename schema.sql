-- ==========================================
-- MATCH DISTRICT ESPORTS PLATFORM DATABASE SCHEMA
-- Target Database: Supabase PostgreSQL (with RLS, PL/pgSQL Triggers, and Realtime Replication)
-- ==========================================

-- ------------------------------------------
-- 1. Enums and Types
-- ------------------------------------------

-- Create custom subscription_tier enum if it does not exist
DO $$ BEGIN
    CREATE TYPE subscription_tier AS ENUM ('free', 'basic', 'pro');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create custom tournament_status enum if it does not exist
DO $$ BEGIN
    CREATE TYPE tournament_status AS ENUM ('draft', 'published', 'registration_open', 'ongoing', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create custom registration_status enum if it does not exist
DO $$ BEGIN
    CREATE TYPE registration_status AS ENUM ('pending', 'approved', 'waitlisted', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create custom admin_role enum if it does not exist
DO $$ BEGIN
    CREATE TYPE admin_role AS ENUM ('owner', 'moderator', 'coordinator');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ------------------------------------------
-- 2. Relational Table Architecture
-- ------------------------------------------

-- Organizer Profiles Table (links directly to auth.users)
CREATE TABLE IF NOT EXISTS organizer_profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    tier subscription_tier DEFAULT 'free'::subscription_tier NOT NULL,
    is_verified BOOLEAN DEFAULT false NOT NULL,
    logo_url TEXT,
    banner_url TEXT,
    branding_color VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tournaments Table (belongs to an organizer profile)
CREATE TABLE IF NOT EXISTS tournaments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organizer_id UUID REFERENCES organizer_profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    game TEXT NOT NULL,
    status tournament_status DEFAULT 'draft'::tournament_status NOT NULL,
    slots_total INTEGER NOT NULL CHECK (slots_total > 0),
    slots_filled INTEGER DEFAULT 0 NOT NULL CHECK (slots_filled >= 0 AND slots_filled <= slots_total),
    rules TEXT,
    poster_url TEXT,
    entry_fee NUMERIC(10, 2) DEFAULT 0.00 NOT NULL CHECK (entry_fee >= 0),
    prize_pool NUMERIC(10, 2) NOT NULL CHECK (prize_pool >= 0),
    is_draft BOOLEAN DEFAULT true NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE,
    card_color VARCHAR(50) DEFAULT 'white' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Registrations Table (maps users/teams to tournaments)
CREATE TABLE IF NOT EXISTS registrations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    squad_name TEXT NOT NULL,
    team_tag VARCHAR(10),
    status registration_status DEFAULT 'pending'::registration_status NOT NULL,
    members JSONB DEFAULT '[]'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(tournament_id, user_id)
);

-- Room Credentials Table (credentials linked to tournaments)
CREATE TABLE IF NOT EXISTS room_credentials (
    tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE PRIMARY KEY,
    room_id TEXT NOT NULL,
    room_password TEXT NOT NULL,
    is_released BOOLEAN DEFAULT false NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Notices Table (official coordinator announcements)
CREATE TABLE IF NOT EXISTS notices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------
-- 2b. Subscription & Billing Tables
-- ------------------------------------------

-- Organizer Plans catalog (plan definitions)
CREATE TABLE IF NOT EXISTS organizer_plans (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    monthly_price INT DEFAULT 0,
    yearly_price INT DEFAULT 0,
    max_tournaments INT DEFAULT 30,
    max_slots INT DEFAULT 100,
    has_verified_badge BOOLEAN DEFAULT false,
    has_premium_badge BOOLEAN DEFAULT false,
    staff_limit INT DEFAULT 0,
    api_access BOOLEAN DEFAULT false,
    white_label BOOLEAN DEFAULT false,
    custom_subdomain BOOLEAN DEFAULT false,
    automation_enabled BOOLEAN DEFAULT false,
    priority_support BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Subscriptions (one per organizer)
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organizer_id VARCHAR(50) UNIQUE REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    plan_id VARCHAR(50) REFERENCES organizer_plans(id) NOT NULL,
    billing_status VARCHAR(20) DEFAULT 'active' CHECK (billing_status IN ('active', 'cancelled', 'expired', 'past_due')),
    billing_cycle VARCHAR(20) DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
    plan_start_date TIMESTAMPTZ DEFAULT NOW(),
    renewal_date TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment Verifications (UPI screenshot submissions)
CREATE TABLE IF NOT EXISTS payment_verifications (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    org_id VARCHAR(50) REFERENCES users(id),
    plan_name VARCHAR(50) NOT NULL,
    billing_cycle VARCHAR(20) DEFAULT 'monthly',
    amount INT NOT NULL,
    transaction_id VARCHAR(255),
    payment_screenshot_url TEXT,
    payment_notes TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_id VARCHAR(50) REFERENCES users(id),
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

-- Billing History
CREATE TABLE IF NOT EXISTS billing_history (
    id VARCHAR(50) PRIMARY KEY,
    organizer_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    plan_name VARCHAR(50) NOT NULL,
    billing_cycle VARCHAR(20),
    amount INT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    invoice_url VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin Subscription Change Audit Log
CREATE TABLE IF NOT EXISTS admin_subscription_log (
    id VARCHAR(50) PRIMARY KEY,
    admin_id VARCHAR(50) REFERENCES users(id) NOT NULL,
    target_user_id VARCHAR(50) REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure users.tier defaults to 'Free'
ALTER TABLE users ALTER COLUMN tier SET DEFAULT 'Free';

-- Auto-update subscription.updated_at
CREATE OR REPLACE FUNCTION fn_update_subscription_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subscription_updated ON subscriptions;
CREATE TRIGGER trg_subscription_updated
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_subscription_timestamp();

-- Seed organizer_plans if empty
INSERT INTO organizer_plans (id, name, monthly_price, yearly_price, max_tournaments, max_slots, has_verified_badge, has_premium_badge, staff_limit, api_access, white_label, custom_subdomain, automation_enabled, priority_support)
SELECT * FROM (VALUES
    ('plan_free', 'Free', 0, 0, 30, 100, false, false, 0, false, false, false, false, false),
    ('plan_basic', 'Basic', 149, 1341, 60, 200, true, false, 3, false, false, false, false, true),
    ('plan_pro', 'Pro', 399, 3591, 999999, 1000, true, true, 999999, true, true, true, true, true)
) AS v
WHERE NOT EXISTS (SELECT 1 FROM organizer_plans);

-- ------------------------------------------
-- 3. Automated Database Triggers
-- ------------------------------------------

-- PL/pgSQL function to keep slots_filled synced on status updates to 'approved'
CREATE OR REPLACE FUNCTION fn_sync_tournament_slots()
RETURNS TRIGGER AS $$
BEGIN
    -- Handles INSERT
    IF (TG_OP = 'INSERT') THEN
        IF (NEW.status = 'approved'::registration_status) THEN
            UPDATE tournaments 
            SET slots_filled = slots_filled + 1 
            WHERE id = NEW.tournament_id;
        END IF;
    
    -- Handles UPDATE
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Case 1: Status changed to approved
        IF (NEW.status = 'approved'::registration_status AND OLD.status != 'approved'::registration_status) THEN
            UPDATE tournaments 
            SET slots_filled = slots_filled + 1 
            WHERE id = NEW.tournament_id;
        -- Case 2: Status changed from approved to something else
        ELSIF (OLD.status = 'approved'::registration_status AND NEW.status != 'approved'::registration_status) THEN
            UPDATE tournaments 
            SET slots_filled = slots_filled - 1 
            WHERE id = NEW.tournament_id;
        END IF;
        
    -- Handles DELETE
    ELSIF (TG_OP = 'DELETE') THEN
        IF (OLD.status = 'approved'::registration_status) THEN
            UPDATE tournaments 
            SET slots_filled = slots_filled - 1 
            WHERE id = OLD.tournament_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger to registrations table
DROP TRIGGER IF EXISTS trg_sync_tournament_slots ON registrations;
CREATE TRIGGER trg_sync_tournament_slots
AFTER INSERT OR UPDATE OR DELETE ON registrations
FOR EACH ROW EXECUTE FUNCTION fn_sync_tournament_slots();

-- PL/pgSQL function to enforce plan-based limits on tournament creation and slots
CREATE OR REPLACE FUNCTION fn_enforce_tournament_plan_limits()
RETURNS TRIGGER AS $$
DECLARE
    v_tier subscription_tier;
    v_tournaments_count INTEGER;
BEGIN
    -- Get the organizer's subscription tier
    SELECT tier INTO v_tier FROM organizer_profiles WHERE id = NEW.organizer_id;
    
    -- Default to 'free' if no profile exists
    IF v_tier IS NULL THEN
        v_tier := 'free'::subscription_tier;
    END IF;

    -- Count existing tournaments (excluding drafts) for this organizer in the current month
    IF (TG_OP = 'INSERT') THEN
        SELECT COUNT(*) INTO v_tournaments_count 
        FROM tournaments 
        WHERE organizer_id = NEW.organizer_id 
          AND is_draft = false 
          AND created_at >= date_trunc('month', CURRENT_TIMESTAMP);
        
        -- Check total tournament limits per month
        IF v_tier = 'free'::subscription_tier AND v_tournaments_count >= 30 THEN
            RAISE EXCEPTION 'Free tier organizers are limited to a maximum of 30 tournaments per month.';
        ELSIF v_tier = 'basic'::subscription_tier AND v_tournaments_count >= 60 THEN
            RAISE EXCEPTION 'Basic tier organizers are limited to a maximum of 60 tournaments per month.';
        -- Pro has no limit
        END IF;
    END IF;

    -- Check slots_total limits for the tournament
    IF v_tier = 'free'::subscription_tier AND NEW.slots_total > 100 THEN
        RAISE EXCEPTION 'Free tier tournaments cannot exceed 100 total slots.';
    ELSIF v_tier = 'basic'::subscription_tier AND NEW.slots_total > 200 THEN
        RAISE EXCEPTION 'Basic tier tournaments cannot exceed 200 total slots.';
    ELSIF v_tier = 'pro'::subscription_tier AND NEW.slots_total > 1000 THEN
        RAISE EXCEPTION 'Pro tier tournaments cannot exceed 1000 total slots.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger to tournaments table
DROP TRIGGER IF EXISTS trg_enforce_tournament_plan_limits ON tournaments;
CREATE TRIGGER trg_enforce_tournament_plan_limits
BEFORE INSERT OR UPDATE ON tournaments
FOR EACH ROW EXECUTE FUNCTION fn_enforce_tournament_plan_limits();

-- ------------------------------------------
-- 4. Row Level Security (RLS) & Policies
-- ------------------------------------------

-- Enable RLS on all tables
ALTER TABLE organizer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

-- --- Policies for organizer_profiles ---
DROP POLICY IF EXISTS "Public Read Organizer Profiles" ON organizer_profiles;
CREATE POLICY "Public Read Organizer Profiles" ON organizer_profiles
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "CRUD Own Organizer Profile" ON organizer_profiles;
CREATE POLICY "CRUD Own Organizer Profile" ON organizer_profiles
    FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- --- Policies for tournaments ---
DROP POLICY IF EXISTS "Select Tournaments" ON tournaments;
CREATE POLICY "Select Tournaments" ON tournaments
    FOR SELECT USING (
        is_draft = false 
        OR status != 'draft'::tournament_status 
        OR organizer_id = auth.uid()
    );

DROP POLICY IF EXISTS "CRUD Own Tournaments" ON tournaments;
CREATE POLICY "CRUD Own Tournaments" ON tournaments
    FOR ALL USING (organizer_id = auth.uid()) WITH CHECK (organizer_id = auth.uid());

-- --- Policies for registrations ---
DROP POLICY IF EXISTS "Select Registrations" ON registrations;
CREATE POLICY "Select Registrations" ON registrations
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Insert Own Registration" ON registrations;
CREATE POLICY "Insert Own Registration" ON registrations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Update registrations" ON registrations;
CREATE POLICY "Update registrations" ON registrations
    FOR UPDATE USING (
        auth.uid() = user_id 
        OR EXISTS (
            SELECT 1 FROM tournaments 
            WHERE tournaments.id = registrations.tournament_id 
            AND tournaments.organizer_id = auth.uid()
        )
    ) WITH CHECK (
        auth.uid() = user_id 
        OR EXISTS (
            SELECT 1 FROM tournaments 
            WHERE tournaments.id = registrations.tournament_id 
            AND tournaments.organizer_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Delete registrations" ON registrations;
CREATE POLICY "Delete registrations" ON registrations
    FOR DELETE USING (
        auth.uid() = user_id 
        OR EXISTS (
            SELECT 1 FROM tournaments 
            WHERE tournaments.id = registrations.tournament_id 
            AND tournaments.organizer_id = auth.uid()
        )
    );

-- --- Policies for room_credentials ---
DROP POLICY IF EXISTS "Select Room Credentials" ON room_credentials;
CREATE POLICY "Select Room Credentials" ON room_credentials
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tournaments 
            WHERE tournaments.id = room_credentials.tournament_id 
            AND tournaments.organizer_id = auth.uid()
        )
        OR (
            is_released = true 
            AND EXISTS (
                SELECT 1 FROM registrations 
                WHERE registrations.tournament_id = room_credentials.tournament_id 
                AND registrations.user_id = auth.uid() 
                AND registrations.status = 'approved'::registration_status
            )
        )
    );

DROP POLICY IF EXISTS "CRUD Room Credentials" ON room_credentials;
CREATE POLICY "CRUD Room Credentials" ON room_credentials
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM tournaments 
            WHERE tournaments.id = room_credentials.tournament_id 
            AND tournaments.organizer_id = auth.uid()
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM tournaments 
            WHERE tournaments.id = room_credentials.tournament_id 
            AND tournaments.organizer_id = auth.uid()
        )
    );

-- --- Policies for notices ---
DROP POLICY IF EXISTS "Select Notices" ON notices;
CREATE POLICY "Select Notices" ON notices
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "CRUD Notices" ON notices;
CREATE POLICY "CRUD Notices" ON notices
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM tournaments 
            WHERE tournaments.id = notices.tournament_id 
            AND tournaments.organizer_id = auth.uid()
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM tournaments 
            WHERE tournaments.id = notices.tournament_id 
            AND tournaments.organizer_id = auth.uid()
        )
    );

-- ------------------------------------------
-- 5. Realtime Replication Configuration
-- ------------------------------------------

-- Ensure the supabase_realtime publication exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END
$$;

-- Add tables safely to realtime replication publication
DO $$
BEGIN
    -- Add tournaments
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'tournaments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE tournaments;
    END IF;

    -- Add registrations
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'registrations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE registrations;
    END IF;

    -- Add notices
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'notices'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE notices;
    END IF;

    -- Add room_credentials
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'room_credentials'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE room_credentials;
    END IF;
END
$$;

-- ------------------------------------------
-- 5b. Tournament Leaderboard Tables
-- ------------------------------------------

-- Scored teams for a tournament (one row per tournament + team)
-- Total Points = Kills + Placement Points + Bonus Points.
-- WWCD (first-place finishes) is tracked separately and is NOT a point category.
CREATE TABLE IF NOT EXISTS tournament_leaderboard (
    id VARCHAR(50) PRIMARY KEY,
    tournament_id VARCHAR(50) NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    team_id VARCHAR(50) NOT NULL REFERENCES tournament_registrations(id) ON DELETE CASCADE,
    team_name VARCHAR(255) NOT NULL,
    kills INTEGER DEFAULT 0,
    placement_points INTEGER DEFAULT 0,
    wwcd INTEGER DEFAULT 0,
    bonus_points INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0,
    updated_by VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tournament_id, team_id)
);

ALTER TABLE tournament_leaderboard ADD COLUMN IF NOT EXISTS wwcd INTEGER DEFAULT 0;
ALTER TABLE tournament_leaderboard ADD COLUMN IF NOT EXISTS placement_points INTEGER DEFAULT 0;
ALTER TABLE tournament_leaderboard ADD COLUMN IF NOT EXISTS bonus_points INTEGER DEFAULT 0;

-- Audit trail for every score change (previous → new) and removal
CREATE TABLE IF NOT EXISTS leaderboard_audit (
    id VARCHAR(50) PRIMARY KEY,
    tournament_id VARCHAR(50) NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    team_id VARCHAR(50) NOT NULL REFERENCES tournament_registrations(id) ON DELETE CASCADE,
    team_name VARCHAR(255),
    previous_score INTEGER,
    new_score INTEGER,
    updated_by VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_tournament ON tournament_leaderboard(tournament_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_audit_tournament ON leaderboard_audit(tournament_id);

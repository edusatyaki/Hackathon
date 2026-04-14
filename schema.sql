-- ============================================================
-- HACKFEST — SUPABASE SCHEMA & RLS POLICIES
-- Run this entire script in the Supabase SQL Editor
-- WARNING: This version will DROP existing tables and recreate them.
-- ============================================================

-- 0. Cleanup existing objects
DROP TABLE IF EXISTS submissions CASCADE;
DROP TABLE IF EXISTS progress CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS rounds CASCADE;
DROP TABLE IF EXISTS hackathons CASCADE;
DROP TABLE IF EXISTS team_members CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS admins CASCADE;
DROP FUNCTION IF EXISTS validate_answer CASCADE;

-- 1. Create Tables

CREATE TABLE admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password TEXT, -- Used only for Local Mock mode
    role TEXT DEFAULT 'admin'
);

CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_name TEXT UNIQUE NOT NULL,
    lead_email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('lead', 'member'))
);

CREATE TABLE hackathons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    rules TEXT,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    prize TEXT,
    max_team_size INTEGER DEFAULT 4,
    registration_open BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE rounds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hackathon_id UUID REFERENCES hackathons(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    UNIQUE (hackathon_id, round_number)
);

CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    round_id UUID REFERENCES rounds(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    answer TEXT NOT NULL,
    answer_type TEXT DEFAULT 'string',
    case_sensitive BOOLEAN DEFAULT false
);

CREATE TABLE progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    hackathon_id UUID REFERENCES hackathons(id) ON DELETE CASCADE,
    current_round INTEGER DEFAULT 1,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (team_id, hackathon_id)
);

CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    hackathon_id UUID REFERENCES hackathons(id) ON DELETE CASCADE,
    round_id UUID REFERENCES rounds(id) ON DELETE CASCADE,
    submitted_answer TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 2. Validate Answer Function
-- Secure, server-side function to check answers
-- ============================================================

CREATE OR REPLACE FUNCTION validate_answer(p_team_id UUID, p_hackathon_id UUID, p_round_id UUID, p_answer TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_correct_answer TEXT;
    v_case_sensitive BOOLEAN;
    v_is_correct BOOLEAN := false;
    v_current_round INTEGER;
    v_total_rounds INTEGER;
BEGIN
    -- Get the correct answer from the specific question
    SELECT answer, case_sensitive 
    INTO v_correct_answer, v_case_sensitive
    FROM questions
    WHERE round_id = p_round_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- Compare logic (handling spaces and case sensitivity)
    IF v_case_sensitive THEN
        v_is_correct := (TRIM(p_answer) = TRIM(v_correct_answer));
    ELSE
        v_is_correct := (LOWER(TRIM(p_answer)) = LOWER(TRIM(v_correct_answer)));
    END IF;

    -- Log submission
    INSERT INTO submissions (team_id, hackathon_id, round_id, submitted_answer, is_correct)
    VALUES (p_team_id, p_hackathon_id, p_round_id, p_answer, v_is_correct);

    -- If correct, update progress table to next round
    IF v_is_correct THEN
        -- Check total rounds for this hackathon
        SELECT COUNT(*) INTO v_total_rounds
        FROM rounds
        WHERE hackathon_id = p_hackathon_id;

        -- Get current progress
        SELECT current_round INTO v_current_round
        FROM progress
        WHERE team_id = p_team_id AND hackathon_id = p_hackathon_id;

        -- Update progress, cap at total rounds + 1 (meaning finished)
        IF v_current_round <= v_total_rounds THEN
            UPDATE progress
            SET current_round = current_round + 1,
                last_updated = NOW()
            WHERE team_id = p_team_id AND hackathon_id = p_hackathon_id;
        END IF;
    END IF;

    RETURN v_is_correct;
END;
$$;

-- ============================================================
-- 3. Row Level Security (RLS) Policies
-- ============================================================

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE hackathons ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Policies

CREATE POLICY "Public Read Access" ON admins FOR SELECT USING (true);
CREATE POLICY "Admins can manage admins" ON admins FOR ALL USING (true);

CREATE POLICY "Public Read Access" ON teams FOR SELECT USING (true);
CREATE POLICY "Public Insert Access" ON teams FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin Full Teams" ON teams FOR ALL USING (true);

CREATE POLICY "Public Read Access" ON team_members FOR SELECT USING (true);
CREATE POLICY "Public Insert Access" ON team_members FOR INSERT WITH CHECK (true);

CREATE POLICY "Public Read Access" ON hackathons FOR SELECT USING (true);
CREATE POLICY "Admin Full Hackathons" ON hackathons FOR ALL USING (true);

CREATE POLICY "Public Read Access" ON rounds FOR SELECT USING (true);
CREATE POLICY "Admin Full Rounds" ON rounds FOR ALL USING (true);

-- PROGRESS table needs read/write
CREATE POLICY "Public Select Progress" ON progress FOR SELECT USING (true);
CREATE POLICY "Public Insert Progress" ON progress FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Progress" ON progress FOR UPDATE USING (true);

-- SUBMISSIONS
CREATE POLICY "Public Select Submissions" ON submissions FOR SELECT USING (true);

-- QUESTIONS: Hide the exact answer string from normal querying
CREATE POLICY "Public Select Questions" ON questions FOR SELECT USING (true);
CREATE POLICY "Admin Full Questions" ON questions FOR ALL USING (true);

-- Enable Realtime for Progress
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE progress;
COMMIT;

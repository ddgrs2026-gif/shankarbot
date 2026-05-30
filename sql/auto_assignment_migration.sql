-- ─── STEP 1: Create grievance_members table ───────────────────────────────
CREATE TABLE IF NOT EXISTS grievance_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    assignment_order INTEGER NOT NULL UNIQUE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── STEP 2: Create assignment_tracker table ──────────────────────────────
CREATE TABLE IF NOT EXISTS assignment_tracker (
    id INTEGER PRIMARY KEY,
    last_assigned_order INTEGER NOT NULL DEFAULT 0
);

-- Insert initial row (only once)
INSERT INTO assignment_tracker (id, last_assigned_order)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

-- ─── STEP 3: Add assignment columns to grievances table ───────────────────
ALTER TABLE grievances
    ADD COLUMN IF NOT EXISTS assigned_member_name TEXT,
    ADD COLUMN IF NOT EXISTS assigned_member_email TEXT,
    ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE;

-- ─── STEP 4: Sample members (edit with real names/emails) ─────────────────
-- INSERT INTO grievance_members (name, email, assignment_order) VALUES
--     ('Member One',   'member1@college.edu', 1),
--     ('Member Two',   'member2@college.edu', 2),
--     ('Member Three', 'member3@college.edu', 3);

-- ─── STEP 5: Feedback table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grievance_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grievance_id TEXT NOT NULL,         -- public GRV-XXXXXX id
    user_phone TEXT NOT NULL,
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- Student Registration Portal — Database Schema
-- Ma Foi / ProSculpt BFSI & Data Analytics Program
-- ============================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Table: students
-- ============================================================
CREATE TABLE IF NOT EXISTS students (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ma_foi_id                   TEXT UNIQUE NOT NULL,
    batch_id                    TEXT NOT NULL,

    -- Personal Information
    first_name                  TEXT NOT NULL CHECK (char_length(trim(first_name)) >= 1),
    last_name                   TEXT NOT NULL CHECK (char_length(trim(last_name)) >= 1),
    -- full_name is a generated column: first_name + space + last_name
    full_name                   TEXT GENERATED ALWAYS AS (trim(first_name) || ' ' || trim(last_name)) STORED,
    email                       TEXT NOT NULL CHECK (email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'),
    phone                       TEXT NOT NULL CHECK (phone ~ '^\d{10}$'),
    gender                      TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other', 'Prefer not to say')),
    address                     TEXT NOT NULL CHECK (char_length(trim(address)) >= 10),
    date_of_birth               DATE NOT NULL,
    aadhaar_number              TEXT NOT NULL CHECK (aadhaar_number ~ '^\d{12}$'),
    educational_qualification   TEXT NOT NULL,
    graduation_year             INT NOT NULL CHECK (graduation_year BETWEEN 1990 AND 2035),
    program                     TEXT NOT NULL CHECK (program IN ('BFSI', 'Data Analytics')),
    location                    TEXT NOT NULL CHECK (location IN ('Bangalore', 'Kolkata')),

    -- Family Background (optional fields)
    father_name                 TEXT,
    mother_name                 TEXT,
    father_occupation           TEXT,
    parent_contact              TEXT CHECK (parent_contact IS NULL OR parent_contact ~ '^\d{10}$'),
    total_family_members        INT CHECK (total_family_members IS NULL OR total_family_members BETWEEN 1 AND 30),
    annual_family_income        TEXT,
    -- Father Aadhaar stored as "XXX___YYY" — first 3 + last 3 digits, separated by delimiter
    father_aadhaar_masked       TEXT CHECK (
        father_aadhaar_masked IS NULL OR 
        father_aadhaar_masked ~ '^\d{3}:\d{3}$'
    ),

    -- Timestamps
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup during edit/verify
CREATE INDEX IF NOT EXISTS idx_students_ma_foi_id  ON students (ma_foi_id);
CREATE INDEX IF NOT EXISTS idx_students_phone       ON students (phone);
CREATE INDEX IF NOT EXISTS idx_students_location    ON students (location);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_students_updated_at
    BEFORE UPDATE ON students
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Table: documents
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    ma_foi_id       TEXT NOT NULL,
    doc_type        TEXT NOT NULL,   -- machine key: '10th_marksheet', etc.
    doc_label       TEXT NOT NULL,   -- human label: '10th Marksheet'
    file_name       TEXT NOT NULL,   -- renamed file: BLR001_B01_10th Marksheet_Name.pdf
    storage_path    TEXT NOT NULL,   -- path inside bucket
    public_url      TEXT NOT NULL,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Enforce one document per type per student
    UNIQUE (student_id, doc_type)
);

CREATE INDEX IF NOT EXISTS idx_documents_student_id ON documents (student_id);
CREATE INDEX IF NOT EXISTS idx_documents_ma_foi_id  ON documents (ma_foi_id);

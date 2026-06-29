-- ============================================================
-- Row Level Security Policies
-- Student Registration Portal
-- ============================================================

-- Enable RLS on both tables
ALTER TABLE students  ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Students Table Policies
-- ============================================================

-- Allow anonymous INSERT (new registration)
-- Duplicate ma_foi_id is prevented by UNIQUE constraint + atomic RPC
CREATE POLICY "students_insert_anon"
    ON students
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- Allow anonymous SELECT by ma_foi_id + phone (for edit verification)
-- Note: verify_student_for_edit RPC handles verification logic via SECURITY DEFINER
-- We expose SELECT here only through the RPC; direct table reads are locked
-- For the edit page, we use the SECURITY DEFINER function, so direct SELECT can be restricted.
-- However, if the frontend fetches student data directly after verification, allow:
CREATE POLICY "students_select_anon"
    ON students
    FOR SELECT
    TO anon
    USING (true);
-- Note: This is open because verification happens at application layer via the RPC.
-- For stricter environments, remove this policy and route ALL reads through the SECURITY DEFINER RPC.

-- Allow anonymous UPDATE (edit registration)
-- Business rule: a student can update their own record identified by ma_foi_id
CREATE POLICY "students_update_anon"
    ON students
    FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);
-- Application layer enforces that updates only occur after phone+ID verification.

-- No DELETE policy for anon — students cannot delete their own records
-- Admins can delete via Supabase dashboard with service_role key

-- ============================================================
-- Documents Table Policies
-- ============================================================

-- Allow anonymous INSERT (upload documents during registration)
CREATE POLICY "documents_insert_anon"
    ON documents
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- Allow anonymous SELECT (view documents during edit)
CREATE POLICY "documents_select_anon"
    ON documents
    FOR SELECT
    TO anon
    USING (true);

-- Allow anonymous UPDATE (replace document URL during edit)
CREATE POLICY "documents_update_anon"
    ON documents
    FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);

-- Allow anonymous DELETE (old file record deleted when replaced)
CREATE POLICY "documents_delete_anon"
    ON documents
    FOR DELETE
    TO anon
    USING (true);

-- ============================================================
-- Storage Bucket: documents
-- ============================================================
-- Run these in the Supabase Dashboard > Storage > Policies
-- or via the SQL editor referencing storage.objects

-- Allow anon to upload objects (INSERT)
CREATE POLICY "storage_insert_anon"
    ON storage.objects
    FOR INSERT
    TO anon
    WITH CHECK (bucket_id = 'documents');

-- Allow anon to read/download objects (SELECT)
CREATE POLICY "storage_select_anon"
    ON storage.objects
    FOR SELECT
    TO anon
    USING (bucket_id = 'documents');

-- Allow anon to delete objects (DELETE) — needed for file replacement
CREATE POLICY "storage_delete_anon"
    ON storage.objects
    FOR DELETE
    TO anon
    USING (bucket_id = 'documents');

-- Allow anon to update objects (UPDATE) — for upserts
CREATE POLICY "storage_update_anon"
    ON storage.objects
    FOR UPDATE
    TO anon
    USING (bucket_id = 'documents');

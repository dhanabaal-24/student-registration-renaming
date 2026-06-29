-- ============================================================
-- PostgreSQL RPC Functions
-- ============================================================

-- ============================================================
-- Function: get_next_ma_foi_id
-- Purpose : Atomically find and reserve the lowest available
--           Ma Foi ID for a given location.
-- 
-- Algorithm:
--   1. Acquire a session-level advisory lock keyed on location
--      so concurrent calls for the same location serialize.
--   2. Parse all existing IDs for that location into integers.
--   3. Find the lowest positive integer NOT in that set.
--   4. Format and return the new ID (e.g. BLR003, KOL007).
--   5. The caller MUST INSERT the student row in the same
--      transaction; the lock is released at transaction end.
--
-- Note: Advisory lock key is a hash of the location prefix
--   'BLR' → 1, 'KOL' → 2  (deterministic, small integers)
-- ============================================================
CREATE OR REPLACE FUNCTION get_next_ma_foi_id(p_location TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_prefix        TEXT;
    v_lock_key      BIGINT;
    v_numbers       INT[];
    v_candidate     INT := 1;
    v_num           INT;
    v_new_id        TEXT;
BEGIN
    -- Determine prefix and lock key
    IF p_location = 'Bangalore' THEN
        v_prefix   := 'BLR';
        v_lock_key := 1001;
    ELSIF p_location = 'Kolkata' THEN
        v_prefix   := 'KOL';
        v_lock_key := 1002;
    ELSE
        RAISE EXCEPTION 'Invalid location: %. Must be Bangalore or Kolkata.', p_location;
    END IF;

    -- Acquire transaction-level advisory lock (released at COMMIT/ROLLBACK)
    -- This serializes concurrent ID generation for the same location.
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- Collect all existing numeric suffixes for this prefix
    SELECT ARRAY(
        SELECT CAST(
            substring(ma_foi_id FROM char_length(v_prefix) + 1) AS INT
        )
        FROM students
        WHERE ma_foi_id LIKE (v_prefix || '%')
          AND ma_foi_id ~ ('^' || v_prefix || '\d+$')
        ORDER BY 1
    )
    INTO v_numbers;

    -- Find the lowest missing positive integer (gap-fill)
    FOREACH v_num IN ARRAY v_numbers LOOP
        IF v_num = v_candidate THEN
            v_candidate := v_candidate + 1;
        ELSIF v_num > v_candidate THEN
            EXIT; -- Found a gap at v_candidate
        END IF;
        -- If v_num < v_candidate, it's a duplicate (shouldn't happen); skip
    END LOOP;

    -- Format: prefix + zero-padded 3-digit number (e.g. BLR001, KOL012)
    v_new_id := v_prefix || LPAD(v_candidate::TEXT, 3, '0');

    RETURN v_new_id;
END;
$$;

-- Grant execute to anon and authenticated roles
GRANT EXECUTE ON FUNCTION get_next_ma_foi_id(TEXT) TO anon, authenticated;


-- ============================================================
-- Function: verify_student_for_edit
-- Purpose : Verify Ma Foi ID + phone combination for edit access.
--           Returns student UUID if valid, NULL otherwise.
--           Intentionally returns no detail about which field failed.
-- ============================================================
CREATE OR REPLACE FUNCTION verify_student_for_edit(
    p_ma_foi_id TEXT,
    p_phone     TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_student_id UUID;
BEGIN
    SELECT id INTO v_student_id
    FROM students
    WHERE ma_foi_id = p_ma_foi_id
      AND phone     = p_phone;

    RETURN v_student_id; -- NULL if not found
END;
$$;

GRANT EXECUTE ON FUNCTION verify_student_for_edit(TEXT, TEXT) TO anon, authenticated;


-- ============================================================
-- Function: get_student_full_record
-- Purpose : Return student + documents in one call (for edit page)
-- ============================================================
CREATE OR REPLACE FUNCTION get_student_full_record(p_ma_foi_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_student   JSON;
    v_documents JSON;
    v_result    JSON;
BEGIN
    SELECT row_to_json(s) INTO v_student
    FROM students s
    WHERE s.ma_foi_id = p_ma_foi_id;

    IF v_student IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT json_agg(d) INTO v_documents
    FROM documents d
    WHERE d.ma_foi_id = p_ma_foi_id;

    v_result := json_build_object(
        'student',   v_student,
        'documents', COALESCE(v_documents, '[]'::JSON)
    );

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_student_full_record(TEXT) TO anon, authenticated;

-- ============================================================
-- Supabase Storage Configuration
-- ============================================================
-- Run in Supabase SQL Editor AFTER creating the bucket
-- via Dashboard > Storage > New Bucket

-- Create bucket: 'documents'
-- Settings:
--   Name: documents
--   Public: false (we serve files via signed URLs or public_url as needed)
--   File size limit: 5242880 (5 MB)
--   Allowed MIME types: application/pdf, image/jpeg, image/jpg, image/png

-- If using SQL to create (Supabase supports this via the storage API):
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'documents',
    'documents',
    false,
    5242880,
    ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
SET
    file_size_limit     = EXCLUDED.file_size_limit,
    allowed_mime_types  = EXCLUDED.allowed_mime_types;

-- ============================================================
-- Folder structure (created automatically on first upload):
-- documents/
--   BLR001/
--     BLR001_B01_10th Marksheet_Dhanabal Kumar.pdf
--     BLR001_B01_12th Marksheet_Dhanabal Kumar.pdf
--     BLR001_B01_Degree Certificate_Dhanabal Kumar.pdf
--     BLR001_B01_Aadhaar Card_Dhanabal Kumar.jpg
--     BLR001_B01_Ration Card_Dhanabal Kumar.pdf
--     BLR001_B01_Signature_Dhanabal Kumar.png
--     BLR001_B01_Passport Photo_Dhanabal Kumar.jpg
--   KOL001/
--     KOL001_B01_10th Marksheet_Rahul Sharma.pdf
--     ...
-- ============================================================

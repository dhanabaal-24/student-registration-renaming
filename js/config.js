/**
 * config.js
 * =========
 * Single source of truth for all application-wide configuration.
 * To change the batch, update BATCH_ID here — all filenames and
 * database records will reflect the new value automatically.
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// BATCH CONFIGURATION
// Change this value to update the batch for all future registrations
// ─────────────────────────────────────────────────────────────
export const BATCH_ID = 'B01';

// ─────────────────────────────────────────────────────────────
// SUPABASE CONFIGURATION
// Replace with your actual Supabase project URL and anon key
// ─────────────────────────────────────────────────────────────
export const SUPABASE_URL  = 'https://dxhssaqjvrhcvjzqvxsf.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4aHNzYXFqdnJoY3ZqenF2eHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MTI5MTEsImV4cCI6MjA5ODI4ODkxMX0.KnY9jzrsGtSd0gqbFptt0khg2RKspyCf91OlohA4hNo';

// ─────────────────────────────────────────────────────────────
// STORAGE CONFIGURATION
// ─────────────────────────────────────────────────────────────
export const STORAGE_BUCKET = 'documents';

// ─────────────────────────────────────────────────────────────
// DOCUMENT TYPES
// Order matters — displayed in this order in the upload section.
// doc_type : machine key (stored in DB, used in filenames)
// label    : human-readable name shown in UI and filenames
// required : whether submission can proceed without this file
// ─────────────────────────────────────────────────────────────
export const DOCUMENT_TYPES = [
    {
        doc_type : '10th_marksheet',
        label    : '10th Marksheet',
        required : true,
    },
    {
        doc_type : '12th_marksheet',
        label    : '12th Marksheet',
        required : true,
    },
    {
        doc_type : 'degree_certificate',
        label    : '6th Semester Marksheet / Degree Certificate',
        required : true,
    },
    {
        doc_type : 'aadhaar_card',
        label    : 'Aadhaar Card',
        required : true,
    },
    {
        doc_type : 'ration_income',
        label    : 'EWS Certificate',
        required : true,
    },
    {
        doc_type : 'signature',
        label    : 'Signature',
        required : true,
    },
    {
        doc_type : 'passport_photo',
        label    : 'Passport Size Photo',
        required : true,
    },
];

// ─────────────────────────────────────────────────────────────
// VALIDATION CONSTANTS
// ─────────────────────────────────────────────────────────────
export const MAX_FILE_SIZE_BYTES  = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_MIME_TYPES   = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
export const ALLOWED_EXTENSIONS   = ['.pdf', '.jpg', '.jpeg', '.png'];

export const GRADUATION_YEAR_MIN  = 1990;
export const GRADUATION_YEAR_MAX  = 2035;

// ─────────────────────────────────────────────────────────────
// PROGRAM OPTIONS
// ─────────────────────────────────────────────────────────────
export const PROGRAMS   = ['BFSI', 'Data Analytics'];
export const LOCATIONS  = ['Bangalore', 'Kolkata'];
export const GENDERS    = ['Male', 'Female', 'Other', 'Prefer not to say'];

export const QUALIFICATIONS = [
    'High School (10th)',
    '12th / Intermediate',
    'Diploma',
    'B.Com',
    'B.Sc',
    'B.A',
    'B.Tech / B.E',
    'BBA',
    'BCA',
    'Other Graduate',
    'Post Graduate',
];

export const INCOME_RANGES = [
    'Below ₹1,00,000',
    '₹1,00,000 – ₹2,50,000',
    '₹2,50,000 – ₹5,00,000',
    '₹5,00,000 – ₹10,00,000',
    'Above ₹10,00,000',
];

/**
 * config.js — V5
 * ==============
 * Single source of truth for ALL application-wide configuration.
 * Every table name, view name, document type, and filename rule
 * lives here. Never hardcode these values anywhere else.
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// SUPABASE — set your real credentials here
// ─────────────────────────────────────────────────────────────
export const SUPABASE_URL  = 'https://dxhssaqjvrhcvjzqvxsf.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4aHNzYXFqdnJoY3ZqenF2eHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MTI5MTEsImV4cCI6MjA5ODI4ODkxMX0.KnY9jzrsGtSd0gqbFptt0khg2RKspyCf91OlohA4hNo';

// ─────────────────────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────────────────────
export const STORAGE_BUCKET = 'documents';

// Storage folder conventions
// Nasscom:  documents/nasscom/{MaFoiID}/
// Bajaj:    (no registration docs — folder unused)
// Placement: documents/placements/{placementId}/
// Payslips:  documents/payslips/{placementId}/

// ─────────────────────────────────────────────────────────────
// TABLE & VIEW NAMES (V5 schema)
// ─────────────────────────────────────────────────────────────
export const TABLE_STUDENTS          = 'students_v2';
export const TABLE_REGISTRATION_DOCS = 'registration_documents';
export const TABLE_BATCHES           = 'batches_v2';
export const TABLE_BATCH_ASSIGNMENTS = 'batch_assignments_v2';
export const TABLE_BATCH_HISTORY     = 'batch_history';
export const TABLE_PLACEMENTS        = 'placements_v2';
export const TABLE_PLACEMENT_DOCS    = 'placement_documents';
export const TABLE_PAYSLIPS          = 'payslips_v2';
export const TABLE_CENTERS           = 'centers';
export const TABLE_AUDIT_LOGS        = 'audit_logs';

export const VIEW_STUDENT_FULL   = 'v_student_full';
export const VIEW_BATCH_FULL     = 'v_batch_full';
export const VIEW_DASHBOARD_STATS = 'v_dashboard_stats';

// ─────────────────────────────────────────────────────────────
// PROJECT CODES (match `projects.code` in DB)
// ─────────────────────────────────────────────────────────────
export const PROJECT_NASSCOM = 'nasscom';
export const PROJECT_BAJAJ   = 'bajaj';

// ─────────────────────────────────────────────────────────────
// DOCUMENT TYPES — NASSCOM REGISTRATION (7 docs)
// doc_type must match the CHECK constraint in registration_documents
// label is used verbatim in filenames — don't change lightly
// ─────────────────────────────────────────────────────────────
export const DOCUMENT_TYPES = [
    { doc_type: '10th_marksheet',     label: '10th Marksheet',                      required: true  },
    { doc_type: '12th_marksheet',     label: '12th Marksheet',                      required: true  },
    { doc_type: 'degree_certificate', label: '6th Semester Marksheet / Degree Cert',required: true  },
    { doc_type: 'aadhaar_card',       label: 'Aadhaar Card',                        required: true  },
    { doc_type: 'ews_certificate',    label: 'EWS Certificate',                     required: true  },
    { doc_type: 'signature',          label: 'Signature',                           required: true  },
    { doc_type: 'passport_photo',     label: 'Passport Size Photo',                 required: true  },
];

// ─────────────────────────────────────────────────────────────
// DOCUMENT TYPES — PLACEMENT (offer letter etc.)
// ─────────────────────────────────────────────────────────────
export const PLACEMENT_DOC_TYPES = [
    { doc_type: 'offer_letter',       label: 'Offer Letter'       },
    { doc_type: 'email_confirmation', label: 'Email Confirmation' },
    { doc_type: 'id_card',            label: 'Employee ID Card'   },
];

// ─────────────────────────────────────────────────────────────
// LOCATION CODE MAP (for Ma Foi ID generation)
// Location name → DB location code → Ma Foi ID prefix
// ─────────────────────────────────────────────────────────────
export const NASSCOM_LOCATION_CODES = {
    'Bangalore': 'BLR',
    'Kolkata':   'KOL',
};

// ─────────────────────────────────────────────────────────────
// DROPDOWN OPTIONS
// ─────────────────────────────────────────────────────────────
export const NASSCOM_PROGRAMS   = ['BFSI', 'Data Analytics'];
export const NASSCOM_LOCATIONS  = ['Bangalore', 'Kolkata'];
export const BAJAJ_PROGRAMS     = ['Gold Loan', 'Microfinance'];
export const BAJAJ_LOCATIONS    = ['Chennai', 'Madurai', 'Bangalore', 'Kolkata'];
export const GENDERS            = ['Male', 'Female', 'Other', 'Prefer not to say'];

export const QUALIFICATIONS = [
    'High School (10th)',
    '12th / Intermediate',
    'Diploma',
    'B.Com', 'B.Sc', 'B.A', 'B.Tech / B.E', 'BBA', 'BCA',
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

// ─────────────────────────────────────────────────────────────
// FILE VALIDATION
// ─────────────────────────────────────────────────────────────
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;  // 5 MB
export const ALLOWED_MIME_TYPES  = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
];
export const ALLOWED_EXTENSIONS  = ['.pdf', '.jpg', '.jpeg', '.png'];
export const GRADUATION_YEAR_MIN = 1990;
export const GRADUATION_YEAR_MAX = 2035;

// ─────────────────────────────────────────────────────────────
// FILENAME BUILDERS
// All document naming logic lives here as pure JS functions.
// These exactly mirror the PostgreSQL functions in the DB
// (build_reg_doc_filename, build_offer_filename, build_payslip_filename)
// so that JS and DB are always in sync.
//
// Convention:
//   Registration (Nasscom, no batch): MaFoiID_DocLabel_StudentName.ext
//   Registration (Nasscom, batched):  MaFoiID_BatchCode_DocLabel_StudentName.ext
//   Placement doc (Nasscom):          MaFoiID_BatchCode_StudentName_Company_DocLabel.ext
//   Placement doc (Bajaj):            BatchCode_StudentName_Company_DocLabel.ext
//   Payslip (Nasscom):                MaFoiID_BatchCode_Payslip(M{n})_StudentName_Company.ext
//   Payslip (Bajaj):                  BatchCode_Payslip(M{n})_StudentName_Company.ext
// ─────────────────────────────────────────────────────────────

/**
 * Build a registration document filename (Nasscom only).
 * @param {string}      maFoiId   - e.g. 'BLR001'
 * @param {string|null} batchCode - null if not yet assigned
 * @param {string}      docLabel  - e.g. '10th Marksheet'
 * @param {string}      fullName  - e.g. 'Dhanabal D'
 * @param {string}      extension - e.g. '.pdf'
 * @returns {string}
 */
export function buildRegDocFilename(maFoiId, batchCode, docLabel, fullName, extension) {
    const ext = sanitizeExtension(extension);
    if (batchCode) {
        return `${maFoiId}_${batchCode}_${docLabel}_${fullName}${ext}`;
    }
    return `${maFoiId}_${docLabel}_${fullName}${ext}`;
}

/**
 * Build a placement joining document filename.
 * @param {string|null} maFoiId   - null for Bajaj
 * @param {string}      batchCode - e.g. 'B01_BFSI_DDC'
 * @param {string}      fullName  - student full name
 * @param {string}      company   - company name
 * @param {string}      docLabel  - 'Offer Letter', 'Email Confirmation', 'Employee ID Card'
 * @param {string}      extension
 * @returns {string}
 */
export function buildOfferFilename(maFoiId, batchCode, fullName, company, docLabel, extension) {
    const ext = sanitizeExtension(extension);
    if (maFoiId) {
        return `${maFoiId}_${batchCode}_${fullName}_${company}_${docLabel}${ext}`;
    }
    return `${batchCode}_${fullName}_${company}_${docLabel}${ext}`;
}

/**
 * Build a payslip filename.
 * @param {string|null} maFoiId
 * @param {string}      batchCode
 * @param {number}      monthNumber - 1, 2, or 3
 * @param {string}      fullName
 * @param {string}      company
 * @param {string}      extension
 * @returns {string}
 */
export function buildPayslipFilename(maFoiId, batchCode, monthNumber, fullName, company, extension) {
    const ext = sanitizeExtension(extension);
    const label = `Payslip(M${monthNumber})`;
    if (maFoiId) {
        return `${maFoiId}_${batchCode}_${label}_${fullName}_${company}${ext}`;
    }
    return `${batchCode}_${label}_${fullName}_${company}${ext}`;
}

/**
 * Build the batch code from its components.
 * Mirrors the PostgreSQL function build_batch_code().
 * @param {number} batchNumber - 1, 2, 3...
 * @param {string} programCode - 'BFSI', 'DA', 'GL', 'MFI'
 * @param {string} centerCode  - e.g. 'DDC', 'Friends Center'
 * @returns {string} e.g. 'B01_BFSI_DDC'
 */
export function buildBatchCode(batchNumber, programCode, centerCode) {
    const num = String(batchNumber).padStart(2, '0');
    return `B${num}_${programCode}_${centerCode}`;
}

// ─────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────

function sanitizeExtension(ext) {
    const e = ext.toLowerCase().trim();
    return e.startsWith('.') ? e : '.' + e;
}
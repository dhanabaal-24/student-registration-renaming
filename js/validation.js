/**
 * validation.js
 * =============
 * Pure validation functions. Each validator returns:
 *   { valid: boolean, message: string }
 *
 * Inline error display is handled by the form modules.
 */

'use strict';

import {
    MAX_FILE_SIZE_BYTES,
    ALLOWED_MIME_TYPES,
    ALLOWED_EXTENSIONS,
    GRADUATION_YEAR_MIN,
    GRADUATION_YEAR_MAX,
} from './config.js';

// ─────────────────────────────────────────────────────────────
// PRIMITIVE VALIDATORS
// ─────────────────────────────────────────────────────────────

export function validateRequired(value, label = 'This field') {
    if (!value || String(value).trim() === '') {
        return { valid: false, message: `${label} is required.` };
    }
    return { valid: true, message: '' };
}

export function validateName(value, label = 'Name') {
    const req = validateRequired(value, label);
    if (!req.valid) return req;
    const trimmed = value.trim();
    if (trimmed.length < 2) return { valid: false, message: `${label} must be at least 2 characters.` };
    if (trimmed.length > 60) return { valid: false, message: `${label} must not exceed 60 characters.` };
    if (!/^[a-zA-Z\s.\-']+$/.test(trimmed)) {
        return { valid: false, message: `${label} should contain only letters, spaces, dots, or hyphens.` };
    }
    return { valid: true, message: '' };
}

export function validateEmail(value) {
    const req = validateRequired(value, 'Email');
    if (!req.valid) return req;
    const re = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
    if (!re.test(value.trim())) {
        return { valid: false, message: 'Enter a valid email address (e.g. name@example.com).' };
    }
    return { valid: true, message: '' };
}

export function validatePhone(value, label = 'Phone number') {
    const req = validateRequired(value, label);
    if (!req.valid) return req;
    const digits = value.replace(/\D/g, '');
    if (!/^\d{10}$/.test(digits)) {
        return { valid: false, message: `${label} must be exactly 10 digits.` };
    }
    if (/^0{10}$/.test(digits)) {
        return { valid: false, message: `${label} is not valid.` };
    }
    return { valid: true, message: '' };
}

export function validateAadhaar(value, label = 'Aadhaar number') {
    const req = validateRequired(value, label);
    if (!req.valid) return req;
    const digits = value.replace(/\D/g, '');
    if (!/^\d{12}$/.test(digits)) {
        return { valid: false, message: `${label} must be exactly 12 digits.` };
    }
    // Aadhaar cannot start with 0 or 1
    if (['0', '1'].includes(digits[0])) {
        return { valid: false, message: `${label} is not valid.` };
    }
    return { valid: true, message: '' };
}

export function validateFatherAadhaar(first3, last3) {
    if (!first3 && !last3) return { valid: true, message: '' }; // optional
    if (first3 && !/^\d{3}$/.test(first3)) {
        return { valid: false, message: 'First 3 digits of Father\'s Aadhaar must be exactly 3 digits.' };
    }
    if (last3 && !/^\d{3}$/.test(last3)) {
        return { valid: false, message: 'Last 3 digits of Father\'s Aadhaar must be exactly 3 digits.' };
    }
    if ((first3 && !last3) || (!first3 && last3)) {
        return { valid: false, message: 'Please enter both First 3 and Last 3 digits of Father\'s Aadhaar, or leave both empty.' };
    }
    return { valid: true, message: '' };
}

export function validateDateOfBirth(value) {
    const req = validateRequired(value, 'Date of birth');
    if (!req.valid) return req;
    const dob  = new Date(value);
    const now  = new Date();
    if (isNaN(dob.getTime())) {
        return { valid: false, message: 'Enter a valid date of birth.' };
    }
    const age = (now - dob) / (1000 * 60 * 60 * 24 * 365.25);
    if (age < 15) {
        return { valid: false, message: 'Student must be at least 15 years old.' };
    }
    if (age > 60) {
        return { valid: false, message: 'Enter a valid date of birth.' };
    }
    if (dob > now) {
        return { valid: false, message: 'Date of birth cannot be in the future.' };
    }
    return { valid: true, message: '' };
}

export function validateGraduationYear(value) {
    const req = validateRequired(value, 'Graduation year');
    if (!req.valid) return req;
    const year = parseInt(value, 10);
    if (isNaN(year)) return { valid: false, message: 'Enter a valid graduation year.' };
    if (year < GRADUATION_YEAR_MIN || year > GRADUATION_YEAR_MAX) {
        return { valid: false, message: `Graduation year must be between ${GRADUATION_YEAR_MIN} and ${GRADUATION_YEAR_MAX}.` };
    }
    return { valid: true, message: '' };
}

export function validateSelect(value, label = 'This field') {
    if (!value || value === '') {
        return { valid: false, message: `Please select a ${label.toLowerCase()}.` };
    }
    return { valid: true, message: '' };
}

export function validateAddress(value) {
    const req = validateRequired(value, 'Address');
    if (!req.valid) return req;
    if (value.trim().length < 10) {
        return { valid: false, message: 'Address must be at least 10 characters.' };
    }
    return { valid: true, message: '' };
}

export function validateFamilyMembers(value) {
    if (!value || String(value).trim() === '') return { valid: true, message: '' }; // optional
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 1 || n > 30) {
        return { valid: false, message: 'Family members must be a number between 1 and 30.' };
    }
    return { valid: true, message: '' };
}

// ─────────────────────────────────────────────────────────────
// FILE VALIDATORS
// ─────────────────────────────────────────────────────────────

export function validateFile(file) {
    if (!file) return { valid: false, message: 'Please select a file.' };

    // Check MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return {
            valid  : false,
            message: `Invalid file type. Allowed: PDF, JPG, JPEG, PNG.`,
        };
    }

    // Check extension as secondary guard
    const name = file.name.toLowerCase();
    const hasValidExt = ALLOWED_EXTENSIONS.some(ext => name.endsWith(ext));
    if (!hasValidExt) {
        return {
            valid  : false,
            message: `Invalid file extension. Allowed: .pdf, .jpg, .jpeg, .png.`,
        };
    }

    // Check size
    if (file.size > MAX_FILE_SIZE_BYTES) {
        return {
            valid  : false,
            message: `File is too large (${formatBytes(file.size)}). Maximum allowed size is 5 MB.`,
        };
    }

    return { valid: true, message: '' };
}

function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ─────────────────────────────────────────────────────────────
// FULL SECTION VALIDATORS
// Returns array of { field, message } for any failures
// ─────────────────────────────────────────────────────────────

export function validateStudentSection(data) {
    const errors = [];

    const checks = [
        { field: 'first_name',                  result: validateName(data.first_name, 'First name') },
        { field: 'last_name',                   result: validateName(data.last_name,  'Last name') },
        { field: 'email',                       result: validateEmail(data.email) },
        { field: 'phone',                       result: validatePhone(data.phone) },
        { field: 'gender',                      result: validateSelect(data.gender, 'Gender') },
        { field: 'address',                     result: validateAddress(data.address) },
        { field: 'date_of_birth',               result: validateDateOfBirth(data.date_of_birth) },
        { field: 'aadhaar_number',              result: validateAadhaar(data.aadhaar_number) },
        { field: 'educational_qualification',   result: validateSelect(data.educational_qualification, 'Educational qualification') },
        { field: 'graduation_year',             result: validateGraduationYear(data.graduation_year) },
        { field: 'program',                     result: validateSelect(data.program, 'Program') },
        { field: 'location',                    result: validateSelect(data.location, 'Location') },
    ];

    for (const { field, result } of checks) {
        if (!result.valid) errors.push({ field, message: result.message });
    }

    return errors;
}

export function validateFamilySection(data) {
    const errors = [];

    // Parent contact is optional but must be valid if provided
    if (data.parent_contact && data.parent_contact.trim()) {
        const r = validatePhone(data.parent_contact, 'Parent contact number');
        if (!r.valid) errors.push({ field: 'parent_contact', message: r.message });
    }

    if (data.total_family_members) {
        const r = validateFamilyMembers(data.total_family_members);
        if (!r.valid) errors.push({ field: 'total_family_members', message: r.message });
    }

    const aadhaarResult = validateFatherAadhaar(data.father_aadhaar_first3, data.father_aadhaar_last3);
    if (!aadhaarResult.valid) {
        errors.push({ field: 'father_aadhaar_first3', message: aadhaarResult.message });
    }

    return errors;
}

export function validateDocumentSection(files) {
    const errors = [];
    // files is a Map<doc_type, File>
    // Check all required documents are present
    // The required check is done against DOCUMENT_TYPES in the form module.
    // Here we validate each file that IS provided.
    for (const [docType, file] of files.entries()) {
        const r = validateFile(file);
        if (!r.valid) {
            errors.push({ field: docType, message: r.message });
        }
    }
    return errors;
}

/**
 * main.js
 * =======
 * Entry point for the registration form.
 * Handles:
 *   - Multi-step navigation
 *   - Inline field validation on blur
 *   - Review section rendering
 *   - Submit orchestration
 */

'use strict';

import { initDocumentSlots }       from './documents.js';
import { submitRegistration }      from './registration.js';
import { toast }                   from './toast.js';
import { scrollToElement, debounce } from './utils.js';
import {
    validateName, validateEmail, validatePhone,
    validateAadhaar, validateDateOfBirth, validateGraduationYear,
    validateSelect, validateAddress,
    validateFatherAadhaar,
    validateStudentSection, validateFamilySection,
} from './validation.js';
import { validateAllDocuments, highlightMissingDocs } from './documents.js';

// ─────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────
let currentStep = 1;
const TOTAL_STEPS = 4;

// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initDocumentSlots(document.getElementById('upload-grid'));
    bindStepNavigation();
    bindInlineValidation();
    bindSubmit();
    showStep(1);
});

// ─────────────────────────────────────────────────────────────
// STEP NAVIGATION
// ─────────────────────────────────────────────────────────────
function showStep(step) {
    // Hide all sections
    document.querySelectorAll('.step-section').forEach(s => {
        s.hidden = true;
        s.setAttribute('aria-hidden', 'true');
    });

    // Show target section
    const target = document.getElementById(`step-${step}`);
    if (target) {
        target.hidden = false;
        target.removeAttribute('aria-hidden');
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Update progress indicator
    updateProgress(step);
    currentStep = step;

    // Build review on step 4
    if (step === 4) buildReview();
}

function updateProgress(step) {
    document.querySelectorAll('.progress-step').forEach((el, idx) => {
        const stepNum = idx + 1;
        el.classList.remove('progress-step--active', 'progress-step--completed');
        if (stepNum < step) {
            el.classList.add('progress-step--completed');
            el.querySelector('.progress-step__dot').innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="16" height="16" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
            `;
        } else if (stepNum === step) {
            el.classList.add('progress-step--active');
            el.setAttribute('aria-current', 'step');
            el.querySelector('.progress-step__dot').textContent = stepNum;
        } else {
            el.removeAttribute('aria-current');
            el.querySelector('.progress-step__dot').textContent = stepNum;
        }
    });
}

function bindStepNavigation() {
    // Step 1 → 2
    document.getElementById('btn-step1-next')?.addEventListener('click', () => {
        if (validateStep1()) showStep(2);
    });

    // Step 2 → 1
    document.getElementById('btn-step2-back')?.addEventListener('click', () => showStep(1));

    // Step 2 → 3
    document.getElementById('btn-step2-next')?.addEventListener('click', () => {
        if (validateStep2()) showStep(3);
    });

    // Step 3 → 2
    document.getElementById('btn-step3-back')?.addEventListener('click', () => showStep(2));

    // Step 3 → 4
    document.getElementById('btn-step3-next')?.addEventListener('click', () => {
        if (validateStep3()) showStep(4);
    });

    // Step 4 → 3
    document.getElementById('btn-step4-back')?.addEventListener('click', () => showStep(3));
}

// ─────────────────────────────────────────────────────────────
// STEP VALIDATORS (with inline error display)
// ─────────────────────────────────────────────────────────────
function validateStep1() {
    const data = collectStudentData();
    const errors = validateStudentSection(data);
    clearAllErrors('step-1');
    displayErrors(errors);

    if (errors.length > 0) {
        scrollToFirstError('step-1');
        toast.error(`Please fix ${errors.length} error${errors.length > 1 ? 's' : ''} before continuing.`);
        return false;
    }
    return true;
}

function validateStep2() {
    const data = collectFamilyData();
    const errors = validateFamilySection(data);
    clearAllErrors('step-2');
    displayErrors(errors);

    if (errors.length > 0) {
        scrollToFirstError('step-2');
        toast.error('Please fix the errors in Family Background before continuing.');
        return false;
    }
    return true;
}

function validateStep3() {
    const docErrors = validateAllDocuments();
    if (docErrors.length > 0) {
        highlightMissingDocs();
        toast.error(`Please upload ${docErrors.length} missing required document${docErrors.length > 1 ? 's' : ''}.`);
        return false;
    }
    return true;
}

// ─────────────────────────────────────────────────────────────
// INLINE VALIDATION (on blur)
// ─────────────────────────────────────────────────────────────
function bindInlineValidation() {
    const validators = {
        'first_name'                : (v) => validateName(v, 'First name'),
        'last_name'                 : (v) => validateName(v, 'Last name'),
        'email'                     : validateEmail,
        'phone'                     : validatePhone,
        'gender'                    : (v) => validateSelect(v, 'Gender'),
        'address'                   : validateAddress,
        'date_of_birth'             : validateDateOfBirth,
        'aadhaar_number'            : validateAadhaar,
        'educational_qualification' : (v) => validateSelect(v, 'Educational qualification'),
        'graduation_year'           : validateGraduationYear,
        'program'                   : (v) => validateSelect(v, 'Program'),
        'location'                  : (v) => validateSelect(v, 'Location'),
        'parent_contact'            : (v) => !v || !v.trim() ? { valid: true } : validatePhone(v, 'Parent contact'),
    };

    for (const [fieldId, validator] of Object.entries(validators)) {
        const el = document.getElementById(fieldId);
        if (!el) continue;

        el.addEventListener('blur', () => {
            const result = validator(el.value);
            setFieldState(fieldId, result);
        });

        // Clear error on input
        el.addEventListener('input', debounce(() => {
            const fieldWrapper = document.getElementById(`field-${fieldId}`);
            if (fieldWrapper?.classList.contains('form-field--error')) {
                const result = validator(el.value);
                if (result.valid) setFieldState(fieldId, result);
            }
        }, 400));
    }

    // Father Aadhaar pair validation on blur
    ['father_aadhaar_first3', 'father_aadhaar_last3'].forEach(id => {
        const el = document.getElementById(id);
        el?.addEventListener('blur', () => {
            const first3 = document.getElementById('father_aadhaar_first3')?.value;
            const last3  = document.getElementById('father_aadhaar_last3')?.value;
            const result = validateFatherAadhaar(first3, last3);
            const errorEl = document.getElementById('father_aadhaar-error');
            const wrapper = document.getElementById('field-father_aadhaar_first3');
            if (errorEl) errorEl.textContent = result.valid ? '' : result.message;
            if (wrapper) {
                wrapper.classList.toggle('form-field--error', !result.valid);
                wrapper.classList.toggle('form-field--valid', result.valid && !!(first3 || last3));
            }
        });
    });
}

function setFieldState(fieldId, result) {
    const wrapper = document.getElementById(`field-${fieldId}`);
    const errorEl = document.getElementById(`${fieldId}-error`);
    if (!wrapper) return;

    wrapper.classList.toggle('form-field--error', !result.valid);
    wrapper.classList.toggle('form-field--valid', result.valid);

    if (errorEl) {
        errorEl.textContent = result.valid ? '' : result.message;
    }
}

// ─────────────────────────────────────────────────────────────
// DATA COLLECTION
// ─────────────────────────────────────────────────────────────
function collectStudentData() {
    const val = (id) => document.getElementById(id)?.value?.trim() || '';
    return {
        first_name                : val('first_name'),
        last_name                 : val('last_name'),
        email                     : val('email'),
        phone                     : val('phone').replace(/\D/g, ''),
        gender                    : val('gender'),
        address                   : val('address'),
        date_of_birth             : val('date_of_birth'),
        aadhaar_number            : val('aadhaar_number').replace(/\D/g, ''),
        educational_qualification : val('educational_qualification'),
        graduation_year           : val('graduation_year'),
        program                   : val('program'),
        location                  : val('location'),
    };
}

function collectFamilyData() {
    const val = (id) => document.getElementById(id)?.value?.trim() || '';
    return {
        father_name           : val('father_name'),
        mother_name           : val('mother_name'),
        father_occupation     : val('father_occupation'),
        parent_contact        : val('parent_contact').replace(/\D/g, ''),
        total_family_members  : val('total_family_members'),
        annual_family_income  : val('annual_family_income'),
        father_aadhaar_first3 : val('father_aadhaar_first3'),
        father_aadhaar_last3  : val('father_aadhaar_last3'),
    };
}

// ─────────────────────────────────────────────────────────────
// REVIEW RENDERING
// ─────────────────────────────────────────────────────────────
function buildReview() {
    const student = collectStudentData();
    const family  = collectFamilyData();

    const container = document.getElementById('review-content');
    if (!container) return;

    const fullName = `${student.first_name} ${student.last_name}`;

    const row = (label, value) => value
        ? `<tr><th scope="row">${label}</th><td>${escHtml(value)}</td></tr>`
        : '';

    container.innerHTML = `
        <style>
            .review-table { width:100%; border-collapse:collapse; font-size:13.5px; margin-bottom:16px; }
            .review-table th { width:40%; text-align:left; padding:8px 10px; color:var(--color-text-secondary); font-weight:600; background:var(--color-surface-2); border-bottom:1px solid var(--color-border); }
            .review-table td { padding:8px 10px; border-bottom:1px solid var(--color-border); color:var(--color-text); }
            .review-section-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:var(--color-primary); margin:20px 0 8px; }
            .review-edit-link { font-size:12px; color:var(--color-primary); cursor:pointer; text-decoration:underline; float:right; font-weight:600; }
        </style>

        <div class="review-section-label">
            Personal Information
            <span class="review-edit-link" role="button" tabindex="0" data-goto-step="1" aria-label="Edit student information">Edit</span>
        </div>
        <table class="review-table" aria-label="Student information summary">
            ${row('Full Name', fullName)}
            ${row('Email', student.email)}
            ${row('Phone', student.phone)}
            ${row('Gender', student.gender)}
            ${row('Date of Birth', student.date_of_birth)}
            ${row('Address', student.address)}
            ${row('Aadhaar', maskAadhaar(student.aadhaar_number))}
            ${row('Qualification', student.educational_qualification)}
            ${row('Graduation Year', student.graduation_year)}
            ${row('Program', student.program)}
            ${row('Location', student.location)}
        </table>

        <div class="review-section-label">
            Family Background
            <span class="review-edit-link" role="button" tabindex="0" data-goto-step="2" aria-label="Edit family background">Edit</span>
        </div>
        <table class="review-table" aria-label="Family background summary">
            ${row("Father's Name", family.father_name)}
            ${row("Mother's Name", family.mother_name)}
            ${row("Father's Occupation", family.father_occupation)}
            ${row('Parent Contact', family.parent_contact)}
            ${row('Family Members', family.total_family_members)}
            ${row('Annual Income', family.annual_family_income)}
            ${family.father_aadhaar_first3 ? row("Father's Aadhaar", `${family.father_aadhaar_first3} ··· XXXXXX ··· ${family.father_aadhaar_last3}`) : ''}
        </table>

        <div class="review-section-label">
            Documents
            <span class="review-edit-link" role="button" tabindex="0" data-goto-step="3" aria-label="Edit documents">Edit</span>
        </div>
        <div id="review-docs">
            ${buildDocReview()}
        </div>

        <div style="background:var(--color-primary-light);border-radius:var(--radius-md);padding:var(--space-4);margin-top:var(--space-4);border:1px solid #c7d3ff;">
            <p style="font-size:13px;color:var(--color-primary);font-weight:600;margin-bottom:4px;">
                ⚠️ Please verify all information before submitting.
            </p>
            <p style="font-size:12px;color:var(--color-text-secondary);">
                After submission, you can edit your registration using your Ma Foi ID and registered phone number.
            </p>
        </div>
    `;

    // Edit links
    container.querySelectorAll('[data-goto-step]').forEach(el => {
        el.addEventListener('click', () => showStep(parseInt(el.dataset.gotoStep)));
        el.addEventListener('keydown', e => { if (e.key === 'Enter') showStep(parseInt(el.dataset.gotoStep)); });
    });
}

function buildDocReview() {
    try {
        const docTypes = [
            { doc_type: '10th_marksheet',     label: '10th Marksheet' },
            { doc_type: '12th_marksheet',     label: '12th Marksheet' },
            { doc_type: 'degree_certificate', label: '6th Sem Marksheet / Degree Certificate' },
            { doc_type: 'aadhaar_card',       label: 'Aadhaar Card' },
            { doc_type: 'ration_income',      label: 'Ration Card / Income Certificate' },
            { doc_type: 'signature',          label: 'Signature' },
            { doc_type: 'passport_photo',     label: 'Passport Size Photo' },
        ];

        return `<table class="review-table" aria-label="Documents summary">
            ${docTypes.map(dt => {
                const slot = document.querySelector(`[data-doc-type="${dt.doc_type}"]`);
                const hasFile    = slot?.querySelector('.upload-slot__preview--new');
                const hasExisting = slot?.querySelector('[data-preview]');
                const status = (hasFile || hasExisting)
                    ? '<span style="color:var(--color-success);font-weight:600;">✓ Ready</span>'
                    : '<span style="color:var(--color-error);">⚠ Missing</span>';
                return `<tr><th scope="row">${dt.label}</th><td>${status}</td></tr>`;
            }).join('')}
        </table>`;
    } catch {
        return '<p style="font-size:13px;color:var(--color-text-muted);">Document summary unavailable.</p>';
    }
}

// ─────────────────────────────────────────────────────────────
// SUBMIT
// ─────────────────────────────────────────────────────────────
function bindSubmit() {
    document.getElementById('btn-submit')?.addEventListener('click', async () => {
        const submitBtn = document.getElementById('btn-submit');
        const student   = collectStudentData();
        const family    = collectFamilyData();
        await submitRegistration(student, family, submitBtn);
    });
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function displayErrors(errors) {
    for (const { field, message } of errors) {
        const wrapper  = document.getElementById(`field-${field}`);
        const errorEl  = document.getElementById(`${field}-error`) ||
                         document.getElementById(`father_aadhaar-error`);
        if (wrapper) wrapper.classList.add('form-field--error');
        if (errorEl) errorEl.textContent = message;
    }
}

function clearAllErrors(stepId) {
    const section = document.getElementById(stepId);
    if (!section) return;
    section.querySelectorAll('.form-field--error').forEach(el => el.classList.remove('form-field--error'));
    section.querySelectorAll('.form-field__error').forEach(el => { el.textContent = ''; });
}

function scrollToFirstError(stepId) {
    const section = document.getElementById(stepId);
    const first   = section?.querySelector('.form-field--error');
    if (first) scrollToElement(first);
}

function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function maskAadhaar(n) {
    if (!n || n.length !== 12) return n || '—';
    return 'XXXX XXXX ' + n.slice(8);
}

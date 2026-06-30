/**
 * edit.js — V2
 * =============
 * Handles the Edit Registration flow for BOTH Nasscom and Bajaj:
 *   1. Verify identity (Ma Foi ID + Phone for Nasscom, Phone + Phone for Bajaj)
 *   2. Load existing record from students_v2 (joined with project/program/location)
 *   3. Populate all form fields
 *   4. Submit UPDATE (never INSERT)
 *   5. Handle document replacements (non-fatal)
 */

'use strict';

import { supabase }                from './supabase.js';
import { DOCUMENT_TYPES, BAJAJ_DOCUMENT_TYPES,
         TABLE_STUDENTS, TABLE_REGISTRATION_DOCS,
         PROJECT_NASSCOM, VIEW_STUDENT_FULL } from './config.js';
import { verifyStudentForEdit }    from './id-generator.js';
import { uploadDocumentSDK as uploadDoc, deleteDocument } from './storage.js';
import { getDocumentState, validateAllDocuments as validateDocs, highlightMissingDocs } from './documents.js';
import { validateStudentSection, validateFamilySection } from './validation.js';
import { toast }                   from './toast.js';
import { scrollToElement }         from './utils.js';

// ─────────────────────────────────────────────────────────────
// VERIFICATION
// ─────────────────────────────────────────────────────────────
//
// Both Nasscom and Bajaj students verify with: Email + Date of Birth.
// This is uniform across both projects — no Ma Foi ID or phone number
// is needed at the verify gate. The Ma Foi ID (if any) is fetched
// automatically once identity is confirmed, for document naming.
//
export async function verifyAndLoad(email, dob) {
    const cleanEmail = email.trim().toLowerCase();
    const cleanDob   = dob.trim();

    if (!cleanEmail || !cleanDob) {
        throw new Error('Please enter both your email address and date of birth.');
    }

    const result = await verifyStudentForEdit(cleanEmail, cleanDob);

    if (!result) {
        throw new Error('No registration found with that email and date of birth. Please check your details and try again.');
    }

    const { data: student, error: studentErr } = await supabase
        .from(VIEW_STUDENT_FULL)
        .select('*')
        .eq('id', result.studentId)
        .single();

    if (studentErr || !student) {
        throw new Error('Could not load your registration. Please try again.');
    }

    const { data: documents } = await supabase
        .from(TABLE_REGISTRATION_DOCS)
        .select('*')
        .eq('student_id', result.studentId);

    return { student, documents: documents || [], projectCode: result.projectCode };
}

// ─────────────────────────────────────────────────────────────
// UPDATE SUBMISSION
// ─────────────────────────────────────────────────────────────

export async function submitUpdate(studentId, maFoiId, projectCode, studentData, familyData, submitBtn) {

    // ── 1. Validate ────────────────────────────────────────────
    const studentErrors = validateStudentSection(studentData);
    const familyErrors  = validateFamilySection(familyData);

    // For the edit page, doc validation only fails if a required doc
    // has NEITHER an existing file NOR a new replacement selected.
    const docErrors = validateDocs();

    if (studentErrors.length > 0) {
        toast.error('Please fix errors in the Student Information section.');
        displayFieldErrors(studentErrors);
        scrollToFirstError();
        return;
    }
    if (familyErrors.length > 0) {
        toast.error('Please fix errors in the Family Background section.');
        displayFieldErrors(familyErrors);
        scrollToFirstError();
        return;
    }
    // Bajaj has no required documents (matches DOCUMENT_TYPES vs BAJAJ_DOCUMENT_TYPES)
    if (projectCode === PROJECT_NASSCOM && docErrors.length > 0) {
        toast.error('Please upload all required documents.');
        highlightMissingDocs();
        return;
    }

    // ── 2. Lock UI ─────────────────────────────────────────────
    submitBtn.disabled  = true;
    submitBtn.innerHTML = `<span class="btn__spinner" aria-hidden="true"></span> Saving changes…`;

    const fullName = `${studentData.first_name.trim()} ${studentData.last_name.trim()}`;

    // ── 3. UPDATE student record FIRST ────────────────────────
    // Always update the student data regardless of document upload status.
    try {
        toast.info('Updating your registration…');
        const updatePayload = buildUpdatePayload(studentData, familyData);
        console.log('[Edit] Updating student record…', updatePayload);

        const { error: updateError } = await supabase
            .from(TABLE_STUDENTS)
            .update(updatePayload)
            .eq('id', studentId);

        if (updateError) {
            throw new Error(`Update failed: ${updateError.message}`);
        }

        console.log('[Edit] Student record updated successfully.');
    } catch (err) {
        console.error('[Edit] Student UPDATE failed:', err);
        toast.error(err.message || 'Update failed. Please try again.');
        submitBtn.disabled  = false;
        submitBtn.innerHTML = 'Save Changes';
        return;
    }

    // ── 4. Handle document replacements (per-file resilient) ───
    try {
        toast.info('Processing document updates…');
        const docTypesForProject = projectCode === PROJECT_NASSCOM ? DOCUMENT_TYPES : BAJAJ_DOCUMENT_TYPES;
        const failures = await processDocumentReplacements(maFoiId, studentId, fullName, docTypesForProject, projectCode);
        console.log('[Edit] Document replacements processed.');
        if (failures.length > 0) {
            toast.error(`Registration updated, but these documents failed to upload: ${failures.join(', ')}. Please try uploading them again.`);
        }
    } catch (err) {
        console.error('[Edit] Document replacement step threw unexpectedly:', err);
        toast.error('Registration updated, but document processing failed: ' + (err.message || 'Unknown error'));
    }

    // ── 5. Redirect to success ─────────────────────────────────
    console.log('[Edit] Redirecting to success page.');
    const successType = projectCode === PROJECT_NASSCOM ? 'update' : 'bajaj-update';

    try {
        sessionStorage.setItem('mafoi_reg', JSON.stringify({
            maFoiId: projectCode === PROJECT_NASSCOM ? maFoiId : null,
            fullName,
            type: successType,
        }));
    } catch (_) {}

    const paramsObj = { name: fullName, type: successType };
    if (projectCode === PROJECT_NASSCOM) paramsObj.id = maFoiId;
    const params = new URLSearchParams(paramsObj);
    window.location.href = 'success.html?' + params.toString();
}

// ─────────────────────────────────────────────────────────────
// DOCUMENT REPLACEMENT
// ─────────────────────────────────────────────────────────────

async function processDocumentReplacements(maFoiId, studentId, fullName, docTypes, projectCode) {
    const docState  = getDocumentState();
    // Nasscom uses Ma Foi ID as folder name; Bajaj uses a short student-id ref
    const folderName = projectCode === PROJECT_NASSCOM
        ? maFoiId
        : `bajaj/${studentId.replace(/-/g,'').slice(0,8).toUpperCase()}`;

    const failures = [];

    for (const docType of docTypes) {
        const state = docState.get(docType.doc_type);
        if (!state?.file) continue; // No new file selected — keep existing

        try {
            // Upload new file (no Ma Foi ID prefix for Bajaj since it's null)
            const result = await uploadDoc({
                file       : state.file,
                maFoiId    : projectCode === PROJECT_NASSCOM ? maFoiId : null,
                folderName,
                docLabel   : docType.label,
                fullName,
            });

            // Delete old file from storage (best-effort, never blocks the new upload)
            if (state.existingPath) {
                try { await deleteDocument(state.existingPath); }
                catch (e) { console.warn('[Edit] Old file delete failed (non-fatal):', e); }
            }

            // Upsert document record in DB
            const { error: upsertError } = await supabase
                .from(TABLE_REGISTRATION_DOCS)
                .upsert({
                    student_id   : studentId,
                    doc_type     : docType.doc_type,
                    doc_label    : docType.label,
                    file_name    : result.fileName,
                    storage_path : result.storagePath,
                    public_url   : result.publicUrl,
                }, { onConflict: 'student_id,doc_type' });

            if (upsertError) {
                console.error(`[Edit] Document upsert failed for ${docType.label}:`, upsertError);
                failures.push(docType.label);
            }
        } catch (err) {
            console.error(`[Edit] Upload failed for "${docType.label}":`, err);
            failures.push(docType.label);
        }
    }

    return failures;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function buildUpdatePayload(studentData, familyData) {
    let fatherAadhaarMasked = null;
    if (familyData.father_aadhaar_first3 && familyData.father_aadhaar_last3) {
        fatherAadhaarMasked = `${familyData.father_aadhaar_first3}:${familyData.father_aadhaar_last3}`;
    }

    // Note: program/location are NOT editable post-registration in V2
    // (they're foreign keys tied to project setup). Only personal/family
    // fields and documents can be changed via Edit Registration.
    return {
        first_name                 : studentData.first_name.trim(),
        last_name                  : studentData.last_name.trim(),
        full_name                  : `${studentData.first_name.trim()} ${studentData.last_name.trim()}`,
        email                      : studentData.email.trim().toLowerCase(),
        phone                      : studentData.phone.trim(),
        gender                     : studentData.gender,
        address                    : studentData.address.trim(),
        date_of_birth              : studentData.date_of_birth,
        aadhaar_number              : studentData.aadhaar_number.replace(/\D/g, ''),
        educational_qualification  : studentData.educational_qualification,
        graduation_year            : parseInt(studentData.graduation_year, 10),
        father_name                : familyData.father_name?.trim()        || null,
        mother_name                : familyData.mother_name?.trim()        || null,
        father_occupation          : familyData.father_occupation?.trim()  || null,
        parent_contact              : familyData.parent_contact?.trim()     || null,
        total_family_members       : familyData.total_family_members
                                          ? parseInt(familyData.total_family_members, 10) : null,
        annual_family_income       : familyData.annual_family_income       || null,
        father_aadhaar_masked      : fatherAadhaarMasked,
        // updated_at is set automatically by DB trigger
    };
}

function displayFieldErrors(errors) {
    for (const { field, message } of errors) {
        const el = document.getElementById(`field-${field}`);
        if (el) {
            el.classList.add('form-field--error');
            const errEl = el.querySelector('.form-field__error');
            if (errEl) errEl.textContent = message;
        }
    }
}

function scrollToFirstError() {
    const first = document.querySelector('.form-field--error, .upload-slot--error');
    if (first) scrollToElement(first);
}
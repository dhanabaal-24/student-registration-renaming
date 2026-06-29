/**
 * edit.js
 * =======
 * Handles the Edit Registration flow:
 *   1. Verify Ma Foi ID + Phone
 *   2. Load existing record
 *   3. Populate all form fields
 *   4. Submit UPDATE (never INSERT)
 *   5. Handle document replacements (non-fatal)
 */

'use strict';

import { supabase }            from './supabase.js';
import { BATCH_ID, DOCUMENT_TYPES } from './config.js';
import { verifyStudentForEdit } from './id-generator.js';
import { uploadDocumentSDK as uploadDoc, deleteDocument } from './storage.js';
import { getDocumentState, initDocumentSlots, validateAllDocuments as validateDocs, highlightMissingDocs } from './documents.js';
import { validateStudentSection, validateFamilySection } from './validation.js';
import { toast }               from './toast.js';
import { scrollToElement }     from './utils.js';

// ─────────────────────────────────────────────────────────────
// VERIFICATION
// ─────────────────────────────────────────────────────────────

export async function verifyAndLoad(maFoiId, phone) {
    const cleanId    = maFoiId.trim().toUpperCase();
    const cleanPhone = phone.replace(/\D/g, '').trim();

    if (!cleanId || !cleanPhone) {
        throw new Error('Please enter both your Ma Foi ID and registered phone number.');
    }

    const studentUuid = await verifyStudentForEdit(cleanId, cleanPhone);

    if (!studentUuid) {
        throw new Error('Invalid Ma Foi ID or Phone Number. Please check your details and try again.');
    }

    const { data: student, error: studentErr } = await supabase
        .from('students')
        .select('*')
        .eq('id', studentUuid)
        .single();

    if (studentErr || !student) {
        throw new Error('Could not load your registration. Please try again.');
    }

    const { data: documents } = await supabase
        .from('documents')
        .select('*')
        .eq('student_id', studentUuid);

    return { student, documents: documents || [] };
}

// ─────────────────────────────────────────────────────────────
// UPDATE SUBMISSION
// ─────────────────────────────────────────────────────────────

export async function submitUpdate(studentId, maFoiId, studentData, familyData, submitBtn) {

    // ── 1. Validate ────────────────────────────────────────────
    const studentErrors = validateStudentSection(studentData);
    const familyErrors  = validateFamilySection(familyData);

    // For the edit page, doc validation only fails if a required doc
    // has NEITHER an existing file NOR a new replacement selected.
    // This is handled by validateDocs() which checks existingUrl too.
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
    if (docErrors.length > 0) {
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
    // This ensures phone number, name, etc. are ALWAYS saved.
    try {
        toast.info('Updating your registration…');
        const updatePayload = buildUpdatePayload(studentData, familyData);
        console.log('[Edit] Updating student record…', updatePayload);

        const { error: updateError } = await supabase
            .from('students')
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

    // ── 4. Handle document replacements (non-fatal) ────────────
    // If a user selected new files, upload them and update DB records.
    // If storage isn't set up or upload fails, we warn but don't block.
    try {
        toast.info('Processing document updates…');
        await processDocumentReplacements(maFoiId, studentId, fullName);
        console.log('[Edit] Document replacements processed.');
    } catch (err) {
        console.warn('[Edit] Document replacement failed (non-fatal):', err);
        toast.warning('Registration updated! Some document uploads failed — contact support if needed.');
        // Still proceed to success — student data IS updated.
    }

    // ── 5. Redirect to success ─────────────────────────────────
    console.log('[Edit] Redirecting to success page. maFoiId:', maFoiId);
    try {
        sessionStorage.setItem('mafoi_reg', JSON.stringify({ maFoiId, fullName, type: 'update' }));
    } catch (_) {}

    const params = new URLSearchParams({ id: maFoiId, name: fullName, type: 'update' });
    window.location.href = 'success.html?' + params.toString();
}

// ─────────────────────────────────────────────────────────────
// DOCUMENT REPLACEMENT
// ─────────────────────────────────────────────────────────────

async function processDocumentReplacements(maFoiId, studentId, fullName) {
    const docState = getDocumentState();

    for (const docType of DOCUMENT_TYPES) {
        const state = docState.get(docType.doc_type);
        if (!state?.file) continue; // No new file selected — keep existing

        // Upload new file
        const result = await uploadDoc({
            file     : state.file,
            maFoiId,
            batchId  : BATCH_ID,
            docLabel : docType.label,
            fullName,
        });

        // Delete old file from storage (best-effort)
        if (state.existingPath) {
            try { await deleteDocument(state.existingPath); }
            catch (e) { console.warn('[Edit] Old file delete failed (non-fatal):', e); }
        }

        // Upsert document record in DB
        const { error: upsertError } = await supabase
            .from('documents')
            .upsert({
                student_id   : studentId,
                ma_foi_id    : maFoiId,
                doc_type     : docType.doc_type,
                doc_label    : docType.label,
                file_name    : result.fileName,
                storage_path : result.storagePath,
                public_url   : result.publicUrl,
            }, { onConflict: 'student_id,doc_type' });

        if (upsertError) {
            console.warn(`[Edit] Document upsert failed for ${docType.label}:`, upsertError);
            // Non-fatal — student record is already updated
        }
    }
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function buildUpdatePayload(studentData, familyData) {
    let fatherAadhaarMasked = null;
    if (familyData.father_aadhaar_first3 && familyData.father_aadhaar_last3) {
        fatherAadhaarMasked = `${familyData.father_aadhaar_first3}:${familyData.father_aadhaar_last3}`;
    }

    return {
        first_name                : studentData.first_name.trim(),
        last_name                 : studentData.last_name.trim(),
        email                     : studentData.email.trim().toLowerCase(),
        phone                     : studentData.phone.trim(),
        gender                    : studentData.gender,
        address                   : studentData.address.trim(),
        date_of_birth             : studentData.date_of_birth,
        aadhaar_number            : studentData.aadhaar_number.replace(/\D/g, ''),
        educational_qualification : studentData.educational_qualification,
        graduation_year           : parseInt(studentData.graduation_year, 10),
        program                   : studentData.program,
        location                  : studentData.location,
        father_name               : familyData.father_name?.trim()        || null,
        mother_name               : familyData.mother_name?.trim()        || null,
        father_occupation         : familyData.father_occupation?.trim()  || null,
        parent_contact            : familyData.parent_contact?.trim()     || null,
        total_family_members      : familyData.total_family_members
                                        ? parseInt(familyData.total_family_members, 10) : null,
        annual_family_income      : familyData.annual_family_income       || null,
        father_aadhaar_masked     : fatherAadhaarMasked,
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
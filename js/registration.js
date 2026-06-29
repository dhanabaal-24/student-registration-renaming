/**
 * registration.js — bulletproof version
 * Student is ALWAYS saved. Uploads are best-effort.
 * Redirect ALWAYS fires if student INSERT succeeds.
 */

'use strict';

import { supabase }            from './supabase.js';
import { BATCH_ID, DOCUMENT_TYPES } from './config.js';
import { generateMaFoiId }     from './id-generator.js';
import { uploadDocumentSDK as uploadDoc } from './storage.js';
import { getDocumentState, validateAllDocuments, highlightMissingDocs } from './documents.js';
import { validateStudentSection, validateFamilySection } from './validation.js';
import { toast }               from './toast.js';
import { scrollToElement }     from './utils.js';

export async function submitRegistration(studentData, familyData, submitBtn) {

    // ── Validate ──────────────────────────────────────────────
    const studentErrors = validateStudentSection(studentData);
    const familyErrors  = validateFamilySection(familyData);
    const docErrors     = validateAllDocuments();

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

    // ── Lock UI ───────────────────────────────────────────────
    submitBtn.disabled  = true;
    submitBtn.innerHTML = '<span class="btn__spinner" aria-hidden="true"></span> Saving…';

    // ── Step 1: Generate Ma Foi ID ────────────────────────────
    let maFoiId;
    try {
        toast.info('Generating your Ma Foi ID…');
        maFoiId = await generateMaFoiId(studentData.location);
        console.log('[Reg] Ma Foi ID generated:', maFoiId);
    } catch (err) {
        console.error('[Reg] ID generation failed:', err);
        toast.error('Could not generate Ma Foi ID: ' + err.message);
        submitBtn.disabled  = false;
        submitBtn.innerHTML = 'Submit Registration';
        return;
    }

    const fullName = `${studentData.first_name.trim()} ${studentData.last_name.trim()}`;

    // ── Step 2: INSERT student ────────────────────────────────
    let studentId;
    try {
        toast.info('Saving your registration…');
        const record = buildStudentRecord(studentData, familyData, maFoiId, BATCH_ID);
        console.log('[Reg] Inserting student record…', record);

        const { data, error } = await supabase
            .from('students')
            .insert([record])
            .select('id, ma_foi_id')
            .single();

        if (error) {
            // Duplicate ID — retry once
            if (error.code === '23505') {
                console.warn('[Reg] Duplicate ID, retrying…');
                maFoiId = await generateMaFoiId(studentData.location);
                const { data: d2, error: e2 } = await supabase
                    .from('students')
                    .insert([{ ...record, ma_foi_id: maFoiId }])
                    .select('id, ma_foi_id')
                    .single();
                if (e2) throw e2;
                studentId = d2.id;
                maFoiId   = d2.ma_foi_id;
            } else {
                throw error;
            }
        } else {
            studentId = data.id;
            maFoiId   = data.ma_foi_id;
        }
        console.log('[Reg] Student saved. ID:', studentId, 'MaFoiId:', maFoiId);
    } catch (err) {
        console.error('[Reg] Student INSERT failed:', err);
        toast.error('Registration failed: ' + (err.message || JSON.stringify(err)));
        submitBtn.disabled  = false;
        submitBtn.innerHTML = 'Submit Registration';
        return;
    }

    // ── Step 3: Upload documents (best-effort, non-fatal) ─────
    toast.info('Uploading documents…');
    let docResults = [];
    try {
        docResults = await uploadAllDocuments(maFoiId, fullName);
        console.log('[Reg] Documents uploaded:', docResults.length);
    } catch (err) {
        console.warn('[Reg] Document upload failed (non-fatal):', err);
        // Don't block redirect — student is already saved
    }

    // ── Step 4: INSERT document rows (best-effort) ────────────
    if (docResults.length > 0 && studentId) {
        try {
            const docRows = docResults.map(doc => ({
                student_id   : studentId,
                ma_foi_id    : maFoiId,
                doc_type     : doc.doc_type,
                doc_label    : doc.doc_label,
                file_name    : doc.fileName,
                storage_path : doc.storagePath,
                public_url   : doc.publicUrl,
            }));
            const { error } = await supabase.from('documents').insert(docRows);
            if (error) console.warn('[Reg] Document rows insert error:', error);
        } catch (err) {
            console.warn('[Reg] Document rows insert threw:', err);
        }
    }

    // ── Step 5: ALWAYS redirect to success ───────────────────
    console.log('[Reg] Redirecting to success. maFoiId:', maFoiId, 'fullName:', fullName);

    // Store in sessionStorage as backup (in case query params are stripped)
    try {
        sessionStorage.setItem('mafoi_reg', JSON.stringify({ maFoiId, fullName, type: 'new' }));
    } catch (_) {}

    const params = new URLSearchParams({ id: maFoiId, name: fullName, type: 'new' });
    window.location.href = 'success.html?' + params.toString();
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function buildStudentRecord(studentData, familyData, maFoiId, batchId) {
    let fatherAadhaarMasked = null;
    if (familyData.father_aadhaar_first3 && familyData.father_aadhaar_last3) {
        fatherAadhaarMasked = `${familyData.father_aadhaar_first3}:${familyData.father_aadhaar_last3}`;
    }
    return {
        ma_foi_id                 : maFoiId,
        batch_id                  : batchId,
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
        father_name               : familyData.father_name?.trim()       || null,
        mother_name               : familyData.mother_name?.trim()       || null,
        father_occupation         : familyData.father_occupation?.trim() || null,
        parent_contact            : familyData.parent_contact?.trim()    || null,
        total_family_members      : familyData.total_family_members
                                        ? parseInt(familyData.total_family_members, 10) : null,
        annual_family_income      : familyData.annual_family_income      || null,
        father_aadhaar_masked     : fatherAadhaarMasked,
    };
}

async function uploadAllDocuments(maFoiId, fullName) {
    const docState = getDocumentState();
    const results  = [];
    for (const docType of DOCUMENT_TYPES) {
        const state = docState.get(docType.doc_type);
        if (!state?.file) continue;
        const result = await uploadDoc({
            file     : state.file,
            maFoiId,
            batchId  : BATCH_ID,
            docLabel : docType.label,
            fullName,
        });
        results.push({ doc_type: docType.doc_type, doc_label: docType.label, ...result });
    }
    return results;
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
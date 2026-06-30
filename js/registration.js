/**
 * registration.js — V2
 * =====================
 * Nasscom registration submission.
 * Writes into students_v2 + registration_documents (new normalized schema).
 * Student is ALWAYS saved. Uploads are best-effort.
 * Redirect ALWAYS fires if student INSERT succeeds.
 */

'use strict';

import { supabase }            from './supabase.js';
import { DOCUMENT_TYPES, PROJECT_NASSCOM,
         TABLE_STUDENTS, TABLE_REGISTRATION_DOCS } from './config.js';
import { generateMaFoiId }     from './id-generator.js';
import { uploadDocumentSDK as uploadDoc } from './storage.js';
import { getDocumentState, validateAllDocuments, highlightMissingDocs } from './documents.js';
import { validateStudentSection, validateFamilySection } from './validation.js';
import { toast }               from './toast.js';
import { scrollToElement }     from './utils.js';

// Cache of lookup IDs (project/program/location) resolved once per session
let lookupCache = null;

async function resolveLookups(programName, locationName) {
    if (!lookupCache) lookupCache = {};
    const cacheKey = `${programName}|${locationName}`;
    if (lookupCache[cacheKey]) return lookupCache[cacheKey];

    console.log('[Lookup] Resolving project for code:', JSON.stringify(PROJECT_NASSCOM));
    const { data: project, error: pErr } = await supabase
        .from('projects').select('id').eq('code', PROJECT_NASSCOM).single();

    console.log('[Lookup] Project query result:', { project, error: pErr });

    if (pErr || !project) {
        const detail = pErr
            ? `Supabase error: ${pErr.message} (code: ${pErr.code || 'none'}, details: ${pErr.details || 'none'}, hint: ${pErr.hint || 'none'})`
            : 'Query succeeded but returned no project.';
        throw new Error(`Could not resolve Nasscom project. ${detail}`);
    }

    console.log('[Lookup] Resolving program:', programName, 'for project:', project.id);
    const { data: program, error: prErr } = await supabase
        .from('programs').select('id').eq('project_id', project.id).eq('name', programName).single();

    console.log('[Lookup] Program query result:', { program, error: prErr });

    if (prErr || !program) {
        const detail = prErr
            ? `Supabase error: ${prErr.message} (code: ${prErr.code || 'none'})`
            : 'Query succeeded but returned no program.';
        throw new Error(`Could not resolve program "${programName}". ${detail}`);
    }

    console.log('[Lookup] Resolving location:', locationName, 'for project:', project.id);
    const { data: location, error: lErr } = await supabase
        .from('locations').select('id').eq('project_id', project.id).eq('name', locationName).single();

    console.log('[Lookup] Location query result:', { location, error: lErr });

    if (lErr || !location) {
        const detail = lErr
            ? `Supabase error: ${lErr.message} (code: ${lErr.code || 'none'})`
            : 'Query succeeded but returned no location.';
        throw new Error(`Could not resolve location "${locationName}". ${detail}`);
    }

    const resolved = { projectId: project.id, programId: program.id, locationId: location.id };
    lookupCache[cacheKey] = resolved;
    return resolved;
}

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

    // ── Step 1: Resolve project/program/location lookup IDs ───
    let lookups;
    try {
        lookups = await resolveLookups(studentData.program, studentData.location);
    } catch (err) {
        console.error('[Reg] Lookup resolution failed:', err);
        toast.error(err.message);
        resetBtn(submitBtn);
        return;
    }

    // ── Step 2: Generate Ma Foi ID ─────────────────────────────
    let maFoiId;
    try {
        toast.info('Generating your Ma Foi ID…');
        maFoiId = await generateMaFoiId(studentData.location);
        console.log('[Reg] Ma Foi ID generated:', maFoiId);
    } catch (err) {
        console.error('[Reg] ID generation failed:', err);
        toast.error('Could not generate Ma Foi ID: ' + err.message);
        resetBtn(submitBtn);
        return;
    }

    const fullName = `${studentData.first_name.trim()} ${studentData.last_name.trim()}`;

    // ── Step 3: INSERT student into students_v2 ────────────────
    let studentId;
    try {
        toast.info('Saving your registration…');
        const record = buildStudentRecord(studentData, familyData, maFoiId, lookups);
        console.log('[Reg] Inserting student record…', record);

        const { data, error } = await supabase
            .from(TABLE_STUDENTS)
            .insert([record])
            .select('id, ma_foi_id')
            .single();

        if (error) {
            // Duplicate ID — retry once
            if (error.code === '23505') {
                console.warn('[Reg] Duplicate ID, retrying…');
                maFoiId = await generateMaFoiId(studentData.location);
                const { data: d2, error: e2 } = await supabase
                    .from(TABLE_STUDENTS)
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
        resetBtn(submitBtn);
        return;
    }

    // ── Step 4: Upload documents (per-file resilient, errors surfaced) ─
    toast.info('Uploading documents…');
    let docResults = [];
    try {
        const { results, failures } = await uploadAllDocuments(maFoiId, fullName);
        docResults = results;
        console.log('[Reg] Documents uploaded:', docResults.length, 'of', DOCUMENT_TYPES.length);

        if (failures.length > 0) {
            console.error('[Reg] Some documents FAILED to upload:', failures);
            const names = failures.map(f => f.label).join(', ');
            toast.error(`These documents failed to upload: ${names}. Your registration is saved — please re-upload them via Edit Registration.`);
        }
    } catch (err) {
        console.error('[Reg] Document upload step threw unexpectedly:', err);
        toast.error('Document upload failed: ' + (err.message || 'Unknown error') + '. Your registration is saved — please re-upload documents via Edit Registration.');
    }

    // ── Step 5: INSERT document rows ────────────────────────────
    if (docResults.length > 0 && studentId) {
        try {
            const docRows = docResults.map(doc => ({
                student_id   : studentId,
                doc_type     : doc.doc_type,
                doc_label    : doc.doc_label,
                file_name    : doc.fileName,
                storage_path : doc.storagePath,
                public_url   : doc.publicUrl,
            }));
            const { error } = await supabase.from(TABLE_REGISTRATION_DOCS).insert(docRows);
            if (error) {
                console.error('[Reg] Document rows insert error:', error);
                toast.error('Documents uploaded but failed to save records: ' + error.message);
            }
        } catch (err) {
            console.error('[Reg] Document rows insert threw:', err);
            toast.error('Documents uploaded but failed to save records: ' + (err.message || 'Unknown error'));
        }
    }

    // ── Step 6: ALWAYS redirect to success ──────────────────────
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

function resetBtn(submitBtn) {
    submitBtn.disabled  = false;
    submitBtn.innerHTML = 'Submit Registration';
}

function buildStudentRecord(studentData, familyData, maFoiId, lookups) {
    let fatherAadhaarMasked = null;
    if (familyData.father_aadhaar_first3 && familyData.father_aadhaar_last3) {
        fatherAadhaarMasked = `${familyData.father_aadhaar_first3}:${familyData.father_aadhaar_last3}`;
    }
    return {
        project_id                 : lookups.projectId,
        program_id                 : lookups.programId,
        location_id                : lookups.locationId,
        ma_foi_id                  : maFoiId,
        first_name                 : studentData.first_name.trim(),
        last_name                  : studentData.last_name.trim(),
        full_name                  : `${studentData.first_name.trim()} ${studentData.last_name.trim()}`,
        email                      : studentData.email.trim().toLowerCase(),
        phone                      : studentData.phone.trim(),
        gender                     : studentData.gender,
        address                    : studentData.address.trim(),
        date_of_birth              : studentData.date_of_birth,
        aadhaar_number             : studentData.aadhaar_number.replace(/\D/g, ''),
        educational_qualification  : studentData.educational_qualification,
        graduation_year            : parseInt(studentData.graduation_year, 10),
        father_name                : familyData.father_name?.trim()       || null,
        mother_name                : familyData.mother_name?.trim()       || null,
        father_occupation          : familyData.father_occupation?.trim() || null,
        parent_contact              : familyData.parent_contact?.trim()    || null,
        total_family_members       : familyData.total_family_members
                                          ? parseInt(familyData.total_family_members, 10) : null,
        annual_family_income       : familyData.annual_family_income      || null,
        father_aadhaar_masked      : fatherAadhaarMasked,
        registration_status        : 'registered',
        placement_status           : 'pending',
    };
}

async function uploadAllDocuments(maFoiId, fullName) {
    const docState = getDocumentState();
    const results  = [];
    const failures = [];
    for (const docType of DOCUMENT_TYPES) {
        const state = docState.get(docType.doc_type);
        if (!state?.file) continue;
        try {
            const result = await uploadDoc({
                file       : state.file,
                maFoiId,
                folderName : maFoiId,
                docLabel   : docType.label,
                fullName,
            });
            results.push({ doc_type: docType.doc_type, doc_label: docType.label, ...result });
        } catch (err) {
            console.error(`[Reg] Upload failed for "${docType.label}":`, err);
            failures.push({ label: docType.label, message: err.message || String(err) });
        }
    }
    return { results, failures };
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
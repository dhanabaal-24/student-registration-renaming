/**
 * id-generator.js — V2
 * =====================
 * Calls the PostgreSQL RPC `get_next_ma_foi_id_v2` to atomically
 * generate the lowest available Ma Foi ID for a given location code
 * (e.g. 'BLR', 'KOL'). Only used for Nasscom — Bajaj never gets a
 * Ma Foi ID.
 *
 * The RPC holds a pg_advisory_xact_lock for the duration of the
 * calling transaction, ensuring no two concurrent registrations
 * receive the same ID.
 */

'use strict';

import { supabase } from './supabase.js';

const LOCATION_CODE_MAP = {
    'Bangalore': 'BLR',
    'Kolkata'  : 'KOL',
};

/**
 * Generate the next Ma Foi ID for the given Nasscom location.
 * Nasscom only — never call this for Bajaj registrations.
 *
 * @param {'Bangalore'|'Kolkata'} location
 * @returns {Promise<string>} - e.g. "BLR001", "KOL003"
 * @throws {Error} if the RPC fails or location is invalid
 */
export async function generateMaFoiId(location) {
    const locationCode = LOCATION_CODE_MAP[location];
    if (!locationCode) {
        throw new Error(`Invalid Nasscom location: "${location}". Must be "Bangalore" or "Kolkata".`);
    }

    const { data, error } = await supabase.rpc('get_next_ma_foi_id_v2', {
        p_location_code: locationCode,
    });

    if (error) {
        console.error('[ID Generator] RPC error:', error);
        throw new Error(`Failed to generate Ma Foi ID: ${error.message}`);
    }

    if (!data || typeof data !== 'string') {
        throw new Error('Ma Foi ID generation returned an unexpected response.');
    }

    return data; // e.g. "BLR001"
}

/**
 * Verify student identity for edit access (works for BOTH projects).
 * Verifies by Email + Date of Birth — uniform for Nasscom and Bajaj,
 * regardless of whether the student has a Ma Foi ID.
 *
 * @param {string} email
 * @param {string} dob - ISO date string, e.g. "2002-06-15"
 * @returns {Promise<{studentId: string, fullName: string, projectCode: string, maFoiId: string|null}|null>}
 */
export async function verifyStudentForEdit(email, dob) {
    const { data, error } = await supabase.rpc('verify_student_by_email_dob', {
        p_email : email.trim().toLowerCase(),
        p_dob   : dob,
    });

    if (error) {
        console.error('[ID Generator] Verify RPC error:', error);
        throw new Error(`Verification failed: ${error.message}`);
    }

    if (!data || data.length === 0) return null;

    const row = data[0];
    return {
        studentId   : row.student_id,
        fullName    : row.full_name,
        projectCode : row.project_code,
        maFoiId     : row.ma_foi_id,
    };
}
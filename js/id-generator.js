/**
 * id-generator.js
 * ===============
 * Calls the PostgreSQL RPC `get_next_ma_foi_id` to atomically
 * generate the lowest available Ma Foi ID for a given location.
 *
 * The RPC holds a pg_advisory_xact_lock for the duration of the
 * calling transaction, ensuring no two concurrent registrations
 * receive the same ID.
 *
 * IMPORTANT: The returned ID is only "reserved" while the
 * transaction is active. The caller must INSERT the student
 * record in the same transaction (handled by registration.js).
 */

'use strict';

import { supabase } from './supabase.js';

/**
 * Generate the next Ma Foi ID for the given location.
 *
 * @param {'Bangalore'|'Kolkata'} location
 * @returns {Promise<string>} - e.g. "BLR001", "KOL003"
 * @throws {Error} if the RPC fails
 */
export async function generateMaFoiId(location) {
    if (!['Bangalore', 'Kolkata'].includes(location)) {
        throw new Error(`Invalid location: "${location}". Must be "Bangalore" or "Kolkata".`);
    }

    const { data, error } = await supabase.rpc('get_next_ma_foi_id', {
        p_location: location,
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
 * Verify student identity for edit access.
 * Returns the student UUID if valid, or null if not found.
 *
 * @param {string} maFoiId
 * @param {string} phone
 * @returns {Promise<string|null>} UUID or null
 */
export async function verifyStudentForEdit(maFoiId, phone) {
    const { data, error } = await supabase.rpc('verify_student_for_edit', {
        p_ma_foi_id : maFoiId.trim().toUpperCase(),
        p_phone     : phone.trim(),
    });

    if (error) {
        console.error('[ID Generator] Verify RPC error:', error);
        throw new Error(`Verification failed: ${error.message}`);
    }

    return data || null; // UUID string or null
}

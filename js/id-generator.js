'use strict';
import { supabase } from './supabase.js';
import { NASSCOM_LOCATION_CODES } from './config.js';

export async function generateMaFoiId(locationName) {
    const code = NASSCOM_LOCATION_CODES[locationName];
    if (!code) throw new Error(`Unknown location "${locationName}". Valid: ${Object.keys(NASSCOM_LOCATION_CODES).join(', ')}`);
    const { data, error } = await supabase.rpc('get_next_ma_foi_id_v2', { p_location_code: code });
    if (error) throw new Error('Ma Foi ID generation failed: ' + error.message);
    if (!data)  throw new Error('Ma Foi ID generation returned empty.');
    return data;
}

export async function verifyStudentByEmailDob(email, dob) {
    const { data, error } = await supabase.rpc('verify_student_by_email_dob', {
        p_email: email.trim().toLowerCase(),
        p_dob  : dob,
    });
    if (error) throw new Error('Verification failed: ' + error.message);
    if (!data || data.length === 0) return null;
    const row = data[0];
    return { studentId: row.student_id, fullName: row.full_name, projectCode: row.project_code, maFoiId: row.ma_foi_id || null };
}
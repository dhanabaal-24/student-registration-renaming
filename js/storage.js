/**
 * storage.js
 * ==========
 * Handles all interactions with Supabase Storage:
 *   - Upload with progress tracking
 *   - Delete (for replacements)
 *   - Get public URL
 *
 * File naming is applied here using the canonical pattern:
 *   MaFoiID_BatchID_DocumentLabel_FullName.ext
 */

'use strict';

import { supabase }       from './supabase.js';
import { STORAGE_BUCKET } from './config.js';
import { buildFilename, getExtension, buildStoragePath } from './utils.js';

/**
 * Upload a document to Supabase Storage.
 * Renames the file before uploading.
 * Reports progress via the onProgress callback.
 *
 * @param {Object}   opts
 * @param {string|null} opts.maFoiId    - e.g. "BLR001", or null for Bajaj
 * @param {string}   opts.folderName    - storage folder (maFoiId or ref code)
 * @param {string}   opts.docLabel      - e.g. "10th Marksheet"
 * @param {string}   opts.fullName      - e.g. "Dhanabal Kumar"
 * @param {File}     opts.file          - The raw File object
 * @param {Function} [opts.onProgress]  - (percent: number) => void
 *
 * @returns {Promise<{ storagePath: string, publicUrl: string, fileName: string }>}
 * @throws {Error}
 */
export async function uploadDocument({ file, maFoiId, folderName, docLabel, fullName, onProgress }) {
    // 1. Build canonical filename
    const ext      = getExtension(file);
    const fileName = buildFilename(maFoiId, docLabel, fullName, ext);
    const path     = buildStoragePath(folderName || maFoiId, fileName);

    // 2. Upload to Supabase Storage
    // Supabase JS v2 does not natively support upload progress in the browser,
    // so we use XMLHttpRequest for progress tracking.
    const { storagePath, publicUrl } = await uploadWithProgress({
        file,
        path,
        fileName,
        onProgress,
    });

    return { storagePath, publicUrl, fileName };
}

/**
 * Delete a file from Supabase Storage by its storage path.
 *
 * @param {string} storagePath - e.g. "BLR001/BLR001_B01_Signature_Name.png"
 * @returns {Promise<void>}
 */
export async function deleteDocument(storagePath) {
    const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([storagePath]);

    if (error) {
        console.error('[Storage] Delete error:', error);
        throw new Error(`Failed to delete file: ${error.message}`);
    }
}

/**
 * Get the public URL for a file.
 * Note: bucket must be public, or use createSignedUrl for private buckets.
 *
 * @param {string} storagePath
 * @returns {string}
 */
export function getPublicUrl(storagePath) {
    const { data } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(storagePath);

    return data?.publicUrl || '';
}

/**
 * Create a short-lived signed URL for viewing a private file.
 *
 * @param {string} storagePath
 * @param {number} expiresIn  - seconds (default: 3600 = 1 hour)
 * @returns {Promise<string>}
 */
export async function createSignedUrl(storagePath, expiresIn = 3600) {
    const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(storagePath, expiresIn);

    if (error) throw new Error(`Failed to create signed URL: ${error.message}`);
    return data.signedUrl;
}

// ─────────────────────────────────────────────────────────────
// Internal: XHR-based upload with progress
// ─────────────────────────────────────────────────────────────

function uploadWithProgress({ file, path, fileName, onProgress }) {
    return new Promise(async (resolve, reject) => {
        // Supabase JS v2: access internal URL via supabaseUrl config
        // The storage REST endpoint is at: {supabaseUrl}/storage/v1/object/{bucket}/{path}
        const supabaseUrl  = supabase.supabaseUrl;           // e.g. https://xyz.supabase.co
        const supabaseKey  = supabase.supabaseKey;           // anon key
        const uploadUrl    = `${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${path
            .split('/')
            .map(encodeURIComponent)
            .join('/')}`;

        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl, true);

        // Set Supabase auth headers
        xhr.setRequestHeader('Authorization', `Bearer ${supabaseKey}`);
        xhr.setRequestHeader('x-upsert', 'true'); // overwrite on replace
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

        if (xhr.upload && typeof onProgress === 'function') {
            xhr.upload.addEventListener('progress', (evt) => {
                if (evt.lengthComputable) {
                    onProgress(Math.round((evt.loaded / evt.total) * 100));
                }
            });
        }

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                const publicUrl = getPublicUrl(path);
                resolve({ storagePath: path, publicUrl, fileName });
            } else {
                let msg = `Upload failed with status ${xhr.status}`;
                try {
                    const body = JSON.parse(xhr.responseText);
                    msg = body.message || body.error || msg;
                } catch (_) { /* ignore parse error */ }
                reject(new Error(msg));
            }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error during upload.')));
        xhr.addEventListener('abort', () => reject(new Error('Upload was aborted.')));

        xhr.send(file);
    });
}

/**
 * Fallback: Standard Supabase upload (no progress) used when XHR approach
 * has CORS issues. Tries XHR first, falls back to SDK.
 *
 * @param {Object}   opts
 * @param {File}     opts.file
 * @param {string|null} opts.maFoiId    - e.g. "BLR001", or null for Bajaj
 * @param {string}   opts.folderName    - storage folder (maFoiId or ref code)
 * @param {string}   opts.docLabel
 * @param {string}   opts.fullName
 */
export async function uploadDocumentSDK({ file, maFoiId, folderName, docLabel, fullName }) {
    const ext      = getExtension(file);
    const fileName = buildFilename(maFoiId, docLabel, fullName, ext);
    const path     = buildStoragePath(folderName || maFoiId, fileName);

    const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, {
            upsert      : true,
            contentType : file.type,
        });

    if (error) throw new Error(`Upload failed: ${error.message}`);

    const publicUrl = getPublicUrl(path);
    return { storagePath: path, publicUrl, fileName };
}
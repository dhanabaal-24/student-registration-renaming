/**
 * utils.js
 * ========
 * Pure utility functions with no side effects.
 * Used across registration, edit, and storage modules.
 */

'use strict';

/**
 * Sanitize a string for use in a filename.
 * Removes characters illegal in most filesystems.
 * Collapses multiple spaces into one.
 */
export function sanitizeForFilename(str) {
    return str
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')  // remove illegal chars
        .replace(/\s+/g, ' ')                       // collapse whitespace
        .trim();
}

/**
 * Build the canonical filename for a document.
 * Format: MaFoiID_BatchID_DocumentLabel_FullName.ext
 *
 * @param {string} maFoiId   - e.g. "BLR001"
 * @param {string} batchId   - e.g. "B01"
 * @param {string} docLabel  - e.g. "10th Marksheet"
 * @param {string} fullName  - e.g. "Dhanabal Kumar"
 * @param {string} extension - e.g. ".pdf" (with leading dot)
 * @returns {string}
 */
export function buildFilename(maFoiId, batchId, docLabel, fullName, extension) {
    const safeLabel    = sanitizeForFilename(docLabel);
    const safeName     = sanitizeForFilename(fullName);
    const safeExt      = extension.toLowerCase().replace(/[^.a-z0-9]/g, '');
    return `${maFoiId}_${batchId}_${safeLabel}_${safeName}${safeExt}`;
}

/**
 * Extract the file extension (including dot, lowercase).
 * Returns '.pdf', '.jpg', '.jpeg', '.png' etc.
 */
export function getExtension(file) {
    const name = file.name || '';
    const idx  = name.lastIndexOf('.');
    if (idx === -1) return '';
    return name.slice(idx).toLowerCase();
}

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Debounce a function.
 */
export function debounce(fn, ms = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

/**
 * Deep clone a plain object/array (JSON-safe values only).
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Capitalize first letter of each word.
 */
export function toTitleCase(str) {
    return str
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Format a date string to DD/MM/YYYY for display.
 */
export function formatDate(isoDate) {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    if (isNaN(d)) return isoDate;
    return d.toLocaleDateString('en-IN', {
        day  : '2-digit',
        month: '2-digit',
        year : 'numeric',
    });
}

/**
 * Mask Aadhaar number for display: XXXX XXXX 1234
 */
export function maskAadhaar(aadhaar) {
    if (!aadhaar || aadhaar.length !== 12) return aadhaar;
    return 'XXXX XXXX ' + aadhaar.slice(8);
}

/**
 * Sleep for ms milliseconds.
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a short random string (for idempotency or temp IDs).
 */
export function randomId(length = 8) {
    return Math.random().toString(36).slice(2, 2 + length);
}

/**
 * Check if a value is a non-empty string after trimming.
 */
export function isNonEmpty(val) {
    return typeof val === 'string' && val.trim().length > 0;
}

/**
 * Scroll to an element smoothly.
 */
export function scrollToElement(el, offset = 80) {
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top, behavior: 'smooth' });
}

/**
 * Convert a File to base64 data URL (for previews).
 */
export function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.readAsDataURL(file);
    });
}

/**
 * Build storage path: documents/BLR001/filename
 */
export function buildStoragePath(maFoiId, filename) {
    return `${maFoiId}/${filename}`;
}

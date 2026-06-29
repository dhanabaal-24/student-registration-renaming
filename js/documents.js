/**
 * documents.js
 * ============
 * Manages the document upload UI slots.
 * Each slot supports: drag-drop, browse, preview, remove, replace, progress.
 *
 * State is maintained in a Map: doc_type → { file, existingUrl, existingPath, existingFileName }
 */

'use strict';

import { DOCUMENT_TYPES, ALLOWED_EXTENSIONS, MAX_FILE_SIZE_BYTES } from './config.js';
import { validateFile } from './validation.js';
import { fileToDataURL, formatBytes } from './utils.js';
import { toast } from './toast.js';

// ─────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────
// Map<doc_type, { file: File|null, existingUrl: string|null, existingPath: string|null, existingFileName: string|null }>
const documentState = new Map();

// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────

/**
 * Initialize (or reinitialize) document slots in the given container.
 * Call once on page load; call again with existingDocs for the edit page.
 *
 * @param {HTMLElement} container
 * @param {Array}       [existingDocs=[]] - from DB documents rows
 */
export function initDocumentSlots(container, existingDocs = []) {
    documentState.clear();
    container.innerHTML = '';

    // Build initial state
    for (const docType of DOCUMENT_TYPES) {
        const existing = existingDocs.find(d => d.doc_type === docType.doc_type) || null;
        documentState.set(docType.doc_type, {
            file             : null,
            existingUrl      : existing?.public_url  || null,
            existingPath     : existing?.storage_path || null,
            existingFileName : existing?.file_name    || null,
        });
        container.appendChild(renderSlot(docType));
    }
}

/**
 * Returns the current file selection map.
 * @returns {Map<string, File|null>}
 */
export function getSelectedFiles() {
    const map = new Map();
    for (const [docType, state] of documentState.entries()) {
        map.set(docType, state.file);
    }
    return map;
}

/**
 * Returns full document state (for the edit/upload flow).
 * @returns {Map<string, {file, existingUrl, existingPath, existingFileName}>}
 */
export function getDocumentState() {
    return documentState;
}

/**
 * Validate that all required documents have either a file or an existing URL.
 * @returns {Array<{doc_type, label, message}>}
 */
export function validateAllDocuments() {
    const errors = [];
    for (const docType of DOCUMENT_TYPES) {
        if (!docType.required) continue;
        const state = documentState.get(docType.doc_type);
        if (!state.file && !state.existingUrl) {
            errors.push({
                doc_type: docType.doc_type,
                label   : docType.label,
                message : `${docType.label} is required.`,
            });
        }
    }
    return errors;
}

// ─────────────────────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────────────────────

function renderSlot(docType) {
    const slot = document.createElement('div');
    slot.className          = 'upload-slot';
    slot.dataset.docType    = docType.doc_type;
    slot.setAttribute('aria-label', `Upload ${docType.label}`);

    const state = documentState.get(docType.doc_type);
    const hasExisting = !!state.existingUrl;

    slot.innerHTML = `
        <div class="upload-slot__header">
            <span class="upload-slot__label">
                ${docType.label}
                ${docType.required ? '<span class="upload-slot__required" aria-label="required">*</span>' : ''}
            </span>
            <span class="upload-slot__status" aria-live="polite"></span>
        </div>

        <div class="upload-slot__drop-zone ${hasExisting ? 'upload-slot__drop-zone--has-file' : ''}"
             role="button"
             tabindex="0"
             aria-label="Drop file here or click to browse"
             data-drop-zone>
            ${hasExisting ? renderExistingPreview(state) : renderEmptyState()}
        </div>

        <div class="upload-slot__progress" aria-hidden="true">
            <div class="upload-slot__progress-bar" style="width:0%"></div>
        </div>

        <div class="upload-slot__error" role="alert" aria-live="assertive"></div>

        <input type="file"
               class="upload-slot__input visually-hidden"
               accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
               aria-label="Select ${docType.label}"
               data-file-input>
    `;

    bindSlotEvents(slot, docType);
    return slot;
}

function renderEmptyState() {
    return `
        <div class="upload-slot__empty">
            <svg class="upload-slot__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p class="upload-slot__hint">Drag & drop or <span class="upload-slot__browse-link">browse</span></p>
            <p class="upload-slot__formats">PDF, JPG, JPEG, PNG · Max 5 MB</p>
        </div>
    `;
}

function renderExistingPreview(state) {
    const isPdf  = state.existingFileName?.toLowerCase().endsWith('.pdf');
    const isImg  = !isPdf;
    return `
        <div class="upload-slot__preview" data-preview>
            ${isImg
                ? `<img src="${state.existingUrl}" alt="Uploaded document preview" class="upload-slot__preview-img" loading="lazy">`
                : `<div class="upload-slot__pdf-preview">
                       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                           <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                           <polyline points="14 2 14 8 20 8"/>
                       </svg>
                       <span>PDF Document</span>
                   </div>`
            }
            <div class="upload-slot__preview-actions">
                <a href="${state.existingUrl}" target="_blank" rel="noopener noreferrer"
                   class="btn btn--ghost btn--sm" aria-label="View document">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    View
                </a>
                <a href="${state.existingUrl}" download class="btn btn--ghost btn--sm" aria-label="Download document">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Download
                </a>
                <button type="button" class="btn btn--outline btn--sm upload-slot__replace-btn" aria-label="Replace document">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                    Replace
                </button>
            </div>
            <p class="upload-slot__file-name" aria-label="Current file">${state.existingFileName || 'Uploaded'}</p>
        </div>
    `;
}

function renderFilePreview(file, dataUrl) {
    const isImage = file.type.startsWith('image/');
    return `
        <div class="upload-slot__preview upload-slot__preview--new" data-preview>
            ${isImage
                ? `<img src="${dataUrl}" alt="Preview of ${file.name}" class="upload-slot__preview-img">`
                : `<div class="upload-slot__pdf-preview">
                       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                           <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                           <polyline points="14 2 14 8 20 8"/>
                       </svg>
                       <span>PDF Document</span>
                   </div>`
            }
            <div class="upload-slot__preview-actions">
                <button type="button" class="btn btn--danger btn--sm upload-slot__remove-btn" aria-label="Remove file">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                    Remove
                </button>
            </div>
            <p class="upload-slot__file-name">${file.name} · ${formatBytes(file.size)}</p>
        </div>
    `;
}

// ─────────────────────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────────────────────

function bindSlotEvents(slot, docType) {
    const dropZone  = slot.querySelector('[data-drop-zone]');
    const fileInput = slot.querySelector('[data-file-input]');

    // Click / keyboard to open file browser
    dropZone.addEventListener('click', (e) => {
        if (!e.target.closest('a') && !e.target.closest('button[aria-label="View document"]') && !e.target.closest('button[aria-label="Download document"]')) {
            fileInput.click();
        }
    });
    dropZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });

    // Replace button
    dropZone.addEventListener('click', (e) => {
        if (e.target.closest('.upload-slot__replace-btn')) fileInput.click();
    });

    // Remove button
    dropZone.addEventListener('click', (e) => {
        if (e.target.closest('.upload-slot__remove-btn')) {
            clearSlotFile(slot, docType);
        }
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelected(slot, docType, file);
        fileInput.value = ''; // reset so same file can be re-selected
    });

    // Drag events
    dropZone.addEventListener('dragenter', (e) => { e.preventDefault(); dropZone.classList.add('upload-slot__drop-zone--drag-over'); });
    dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); dropZone.classList.add('upload-slot__drop-zone--drag-over'); });
    dropZone.addEventListener('dragleave', (e) => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('upload-slot__drop-zone--drag-over'); });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('upload-slot__drop-zone--drag-over');
        const file = e.dataTransfer?.files?.[0];
        if (file) handleFileSelected(slot, docType, file);
    });
}

async function handleFileSelected(slot, docType, file) {
    clearError(slot);

    const validation = validateFile(file);
    if (!validation.valid) {
        showError(slot, validation.message);
        return;
    }

    // Update state
    const state = documentState.get(docType.doc_type);
    state.file = file;
    documentState.set(docType.doc_type, state);

    // Generate preview
    const dropZone = slot.querySelector('[data-drop-zone]');
    dropZone.classList.add('upload-slot__drop-zone--has-file');

    try {
        const dataUrl = await fileToDataURL(file);
        dropZone.innerHTML = renderFilePreview(file, dataUrl);
    } catch (err) {
        dropZone.innerHTML = renderFilePreview(file, '');
    }

    setStatus(slot, 'Ready to upload', 'ready');
}

function clearSlotFile(slot, docType) {
    const state = documentState.get(docType.doc_type);
    state.file = null;
    documentState.set(docType.doc_type, state);

    const dropZone = slot.querySelector('[data-drop-zone]');
    dropZone.classList.remove('upload-slot__drop-zone--has-file');
    dropZone.innerHTML = state.existingUrl ? renderExistingPreview(state) : renderEmptyState();
    setStatus(slot, '', '');
    clearError(slot);
}

// ─────────────────────────────────────────────────────────────
// PROGRESS
// ─────────────────────────────────────────────────────────────

export function setSlotProgress(docType, percent) {
    const slot     = document.querySelector(`[data-doc-type="${docType}"]`);
    if (!slot) return;
    const bar = slot.querySelector('.upload-slot__progress-bar');
    const wrap = slot.querySelector('.upload-slot__progress');
    if (!bar || !wrap) return;
    wrap.style.display = 'block';
    bar.style.width    = `${Math.min(100, percent)}%`;
    if (percent >= 100) {
        setStatus(slot, 'Uploaded ✓', 'success');
        setTimeout(() => { wrap.style.display = 'none'; }, 1500);
    }
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function showError(slot, message) {
    const errorEl = slot.querySelector('.upload-slot__error');
    if (errorEl) { errorEl.textContent = message; errorEl.style.display = 'block'; }
    slot.classList.add('upload-slot--error');
}

function clearError(slot) {
    const errorEl = slot.querySelector('.upload-slot__error');
    if (errorEl) { errorEl.textContent = ''; errorEl.style.display = 'none'; }
    slot.classList.remove('upload-slot--error');
}

function setStatus(slot, message, type) {
    const statusEl = slot.querySelector('.upload-slot__status');
    if (!statusEl) return;
    statusEl.textContent  = message;
    statusEl.className    = `upload-slot__status upload-slot__status--${type}`;
}

/**
 * Mark all slots with missing required docs as error.
 */
export function highlightMissingDocs() {
    for (const docType of DOCUMENT_TYPES) {
        if (!docType.required) continue;
        const state = documentState.get(docType.doc_type);
        if (!state.file && !state.existingUrl) {
            const slot = document.querySelector(`[data-doc-type="${docType.doc_type}"]`);
            if (slot) showError(slot, `${docType.label} is required.`);
        }
    }
}

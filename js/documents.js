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

// Which document type set is currently active (Nasscom vs Bajaj)
let activeDocTypes = DOCUMENT_TYPES;

// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────

/**
 * Initialize (or reinitialize) document slots in the given container.
 * Call once on page load; call again with existingDocs for the edit page.
 *
 * @param {HTMLElement} container
 * @param {Array}       [existingDocs=[]] - from DB documents rows
 * @param {Array}       [docTypes=DOCUMENT_TYPES] - which doc type set to render
 *                       (pass BAJAJ_DOCUMENT_TYPES for Bajaj forms)
 */
export function initDocumentSlots(container, existingDocs = [], docTypes = DOCUMENT_TYPES) {
    documentState.clear();
    container.innerHTML = '';
    activeDocTypes = docTypes;

    // Build initial state
    for (const docType of docTypes) {
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
    for (const docType of activeDocTypes) {
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
    slot.className       = 'upload-slot-new';
    slot.dataset.docType = docType.doc_type;

    const state = documentState.get(docType.doc_type);
    const hasExisting = !!state.existingUrl;
    if (hasExisting) slot.classList.add('has-file');

    slot.innerHTML = `
        <div class="upload-slot-new__label">
            ${docType.label}
            ${docType.required ? '<span class="upload-slot-new__req">*</span>' : ''}
        </div>

        <div class="upload-slot-new__drop"
             role="button" tabindex="0"
             aria-label="Drop file here or click to browse"
             data-drop-zone>
            ${hasExisting ? renderExistingPreview(state) : renderEmptyState()}
        </div>

        <div class="upload-slot-new__progress" aria-hidden="true">
            <div class="upload-slot-new__progress-bar" style="width:0%"></div>
        </div>

        <div class="upload-slot-new__error" role="alert"></div>

        <input type="file"
               accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
               aria-label="Select ${docType.label}"
               data-file-input>
    `;

    bindSlotEvents(slot, docType);
    return slot;
}

function renderEmptyState() {
    return `
        <svg class="upload-slot-new__icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <p class="upload-slot-new__hint">Drag &amp; drop or click to browse</p>
        <p class="upload-slot-new__formats">PDF, JPG, JPEG, PNG up to 5 MB</p>
    `;
}

function renderExistingPreview(state) {
    const name = state.existingFileName || 'Uploaded file';
    return `
        <div class="upload-slot-new__preview" data-preview>
            <svg class="upload-slot-new__preview-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span class="upload-slot-new__preview-name" title="${name}">${name}</span>
            <button type="button" class="upload-slot-new__remove upload-slot__replace-btn" aria-label="Replace document" title="Click to replace">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
            </button>
        </div>
    `;
}

function renderFilePreview(file, dataUrl) {
    return `
        <div class="upload-slot-new__preview upload-slot-new__preview--new" data-preview>
            <svg class="upload-slot-new__preview-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span class="upload-slot-new__preview-name" title="${file.name}">${file.name} · ${formatBytes(file.size)}</span>
            <button type="button" class="upload-slot-new__remove upload-slot__remove-btn" aria-label="Remove file">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
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
    dropZone.addEventListener('dragenter', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', (e) => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
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
    dropZone.classList.add('has-file');

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
    dropZone.classList.remove('has-file');
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
    const bar = slot.querySelector('.upload-slot-new__progress-bar');
    const wrap = slot.querySelector('.upload-slot-new__progress');
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
    const errorEl = slot.querySelector('.upload-slot-new__error');
    if (errorEl) { errorEl.textContent = message; errorEl.style.display = 'block'; }
    slot.classList.add('has-error');
}

function clearError(slot) {
    const errorEl = slot.querySelector('.upload-slot-new__error');
    if (errorEl) { errorEl.textContent = ''; errorEl.style.display = 'none'; }
    slot.classList.remove('has-error');
}

function setStatus(slot, message, type) {
    const statusEl = slot.querySelector('.upload-slot-new__status');
    if (!statusEl) return;
    statusEl.textContent  = message;
    statusEl.className    = `upload-slot__status upload-slot__status--${type}`;
}

/**
 * Mark all slots with missing required docs as error.
 */
export function highlightMissingDocs() {
    for (const docType of activeDocTypes) {
        if (!docType.required) continue;
        const state = documentState.get(docType.doc_type);
        if (!state.file && !state.existingUrl) {
            const slot = document.querySelector(`[data-doc-type="${docType.doc_type}"]`);
            if (slot) showError(slot, `${docType.label} is required.`);
        }
    }
}
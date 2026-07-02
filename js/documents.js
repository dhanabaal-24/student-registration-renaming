'use strict';
import { MAX_FILE_SIZE_BYTES, ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS } from './config.js';

const documentState = new Map();
let activeDocTypes = [];

export function initDocumentSlots(container, docTypes, existingDocs = []) {
    documentState.clear();
    container.innerHTML = '';
    activeDocTypes = docTypes;
    for (const dt of docTypes) {
        const existing = existingDocs.find(d => d.doc_type === dt.doc_type) || null;
        documentState.set(dt.doc_type, {
            file: null,
            existingUrl : existing?.public_url    || null,
            existingPath: existing?.storage_path  || null,
            existingName: existing?.file_name     || null,
        });
        container.appendChild(renderSlot(dt, existing));
    }
}

export function getDocumentState() { return documentState; }

export function validateAllDocuments(docTypes = activeDocTypes) {
    const missing = [];
    for (const dt of docTypes) {
        if (!dt.required) continue;
        const s = documentState.get(dt.doc_type);
        if (!s?.file && !s?.existingUrl) missing.push(dt.label);
    }
    return missing;
}

export function highlightMissingDocs(docTypes = activeDocTypes) {
    for (const dt of docTypes) {
        if (!dt.required) continue;
        const s = documentState.get(dt.doc_type);
        if (!s?.file && !s?.existingUrl) {
            const slot = document.querySelector(`[data-doc-type="${dt.doc_type}"]`);
            if (slot) {
                slot.classList.add('has-error');
                const errEl = slot.querySelector('.upload-slot__error');
                if (errEl) errEl.textContent = dt.label + ' is required.';
            }
        }
    }
}

function esc(s) { const d=document.createElement('div'); d.textContent=String(s??''); return d.innerHTML; }
function trunc(str,n) { return str&&str.length>n ? str.slice(0,n-1)+'\u2026' : str; }

function emptyDropHTML() {
    return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text-muted)"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>'
    + '<p class="upload-slot__hint">Drag &amp; drop or <span class="upload-slot__browse">browse</span></p>'
    + '<p class="upload-slot__formats">PDF \xb7 JPG \xb7 PNG \xb7 max 5 MB</p>';
}

function renderSlot(dt, existing) {
    const slot = document.createElement('div');
    slot.className = 'upload-slot' + (existing ? ' has-file' : '');
    slot.setAttribute('data-doc-type', dt.doc_type);
    const reqStar = dt.required ? '<span class="upload-slot__req">*</span>' : '';

    if (existing) {
        slot.innerHTML =
          '<div class="upload-slot__label">' + esc(dt.label) + reqStar + '</div>'
        + '<div class="upload-slot__drop upload-slot__drop--uploaded" role="button" tabindex="0">'
        + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>'
        + '<p class="upload-slot__file-name" title="' + esc(existing.file_name) + '">' + esc(trunc(existing.file_name,32)) + '</p>'
        + '<div class="upload-slot__actions">'
        + '<a href="' + esc(existing.public_url) + '" target="_blank" rel="noopener" class="upload-slot__view-link" onclick="event.stopPropagation()">View</a>'
        + '<span class="upload-slot__replace">Click to replace</span>'
        + '</div></div>'
        + '<div class="upload-slot__error" role="alert"></div>'
        + '<input type="file" class="upload-slot__input" accept=".pdf,.jpg,.jpeg,.png">';
    } else {
        slot.innerHTML =
          '<div class="upload-slot__label">' + esc(dt.label) + reqStar + '</div>'
        + '<div class="upload-slot__drop" role="button" tabindex="0">' + emptyDropHTML() + '</div>'
        + '<div class="upload-slot__error" role="alert"></div>'
        + '<input type="file" class="upload-slot__input" accept=".pdf,.jpg,.jpeg,.png">';
    }

    bindSlotEvents(slot, dt);
    return slot;
}

function bindSlotEvents(slot, dt) {
    const drop  = slot.querySelector('.upload-slot__drop');
    const input = slot.querySelector('.upload-slot__input');
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click();} });
    drop.addEventListener('dragover',  e => { e.preventDefault(); drop.classList.add('drag-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('drag-over'); const f=e.dataTransfer?.files?.[0]; if(f) handleFile(slot,dt,f); });
    input.addEventListener('change', e => { const f=e.target.files?.[0]; if(f) handleFile(slot,dt,f); input.value=''; });
}

function handleFile(slot, dt, file) {
    slot.classList.remove('has-error');
    const errEl = slot.querySelector('.upload-slot__error');
    if (errEl) errEl.textContent = '';

    const result = validateFile(file);
    if (!result.valid) { slot.classList.add('has-error'); if(errEl) errEl.textContent=result.message; return; }

    const state = documentState.get(dt.doc_type) || {};
    state.file = file;
    documentState.set(dt.doc_type, state);

    slot.classList.add('has-file');
    const drop = slot.querySelector('.upload-slot__drop');
    drop.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>'
    + '<p class="upload-slot__file-name" title="' + esc(file.name) + '">' + esc(trunc(file.name,32)) + '</p>'
    + '<button type="button" class="upload-slot__remove" aria-label="Remove">'
    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
    + '</button>';

    drop.querySelector('.upload-slot__remove').addEventListener('click', e => {
        e.stopPropagation();
        const s = documentState.get(dt.doc_type)||{};
        s.file = null;
        documentState.set(dt.doc_type, s);
        slot.classList.remove('has-file','has-error');
        drop.innerHTML = emptyDropHTML();
        drop.addEventListener('click', () => slot.querySelector('.upload-slot__input').click());
    });
}

function validateFile(file) {
    if (!ALLOWED_MIME_TYPES.includes(file.type))
        return { valid:false, message:'Invalid type. Use PDF, JPG, or PNG.' };
    if (!ALLOWED_EXTENSIONS.some(e => file.name.toLowerCase().endsWith(e)))
        return { valid:false, message:'Invalid extension. Use .pdf, .jpg, or .png.' };
    if (file.size > MAX_FILE_SIZE_BYTES)
        return { valid:false, message:'File too large (' + (file.size/1048576).toFixed(1) + ' MB). Max 5 MB.' };
    return { valid:true, message:'' };
}
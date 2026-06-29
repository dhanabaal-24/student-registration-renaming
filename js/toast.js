/**
 * toast.js
 * ========
 * Lightweight toast notification system.
 * No alert() anywhere in the application — all user feedback goes through here.
 *
 * Usage:
 *   import { toast } from './toast.js';
 *   toast.success('Registration saved!');
 *   toast.error('Invalid phone number.');
 *   toast.info('Processing your request…');
 *   toast.warning('File size exceeds 5 MB.');
 */

'use strict';

export class ToastManager {
    constructor() {
        this._container = null;
        this._queue     = [];
        this._init();
    }

    _init() {
        // Create container if it doesn't exist
        if (!document.getElementById('toast-container')) {
            this._container = document.createElement('div');
            this._container.id              = 'toast-container';
            this._container.setAttribute('aria-live', 'polite');
            this._container.setAttribute('aria-atomic', 'false');
            document.body.appendChild(this._container);
        } else {
            this._container = document.getElementById('toast-container');
        }
    }

    /**
     * Show a toast notification.
     * @param {string} message
     * @param {'success'|'error'|'info'|'warning'} type
     * @param {number} duration - ms before auto-dismiss (0 = no auto-dismiss)
     */
    show(message, type = 'info', duration = 4000) {
        if (!this._container) this._init();

        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

        const icons = {
            success : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
            error   : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
            warning : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
            info    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
        };

        toast.innerHTML = `
            <span class="toast__icon" aria-hidden="true">${icons[type] || icons.info}</span>
            <span class="toast__message">${this._escapeHtml(message)}</span>
            <button class="toast__close" aria-label="Dismiss notification">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        `;

        const closeBtn = toast.querySelector('.toast__close');
        closeBtn.addEventListener('click', () => this._dismiss(toast));

        this._container.appendChild(toast);

        // Trigger entrance animation on next frame
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.classList.add('toast--visible');
            });
        });

        if (duration > 0) {
            setTimeout(() => this._dismiss(toast), duration);
        }

        return toast;
    }

    _dismiss(toast) {
        if (!toast || toast.classList.contains('toast--dismissing')) return;
        toast.classList.add('toast--dismissing');
        toast.classList.remove('toast--visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    success(message, duration = 4000) { return this.show(message, 'success', duration); }
    error(message, duration = 6000)   { return this.show(message, 'error',   duration); }
    info(message, duration = 4000)    { return this.show(message, 'info',    duration); }
    warning(message, duration = 5000) { return this.show(message, 'warning', duration); }
}

export const toast = new ToastManager();

/**
 * confetti.js
 * ===========
 * Lightweight, dependency-free confetti cannon.
 * Renders onto a <canvas> element passed in at initialisation.
 *
 * Usage:
 *   import { Confetti } from './confetti.js';
 *   const c = new Confetti(canvasElement);
 *   c.launch();          // fire a burst
 *   c.stop();            // stop emitting (particles finish naturally)
 *   c.destroy();         // stop + clear canvas
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────

const COLORS = [
    '#0E4BFF', // ProSculpt blue
    '#2FE6A6', // ProSculpt emerald
    '#FF6B6B', // coral
    '#FFD93D', // golden yellow
    '#C77DFF', // lavender
    '#FF9F43', // orange
    '#48DBFB', // sky
    '#FFFFFF', // white
];

const PARTICLE_COUNT      = 180;   // particles per burst
const GRAVITY             = 0.25;  // downward acceleration per frame
const DRAG                = 0.98;  // horizontal velocity decay
const INITIAL_VY_MIN      = -18;   // initial upward velocity range
const INITIAL_VY_MAX      = -8;
const INITIAL_VX_SPREAD   = 10;    // horizontal spread
const WOBBLE_SPEED        = 0.05;  // how fast particles spin/wobble
const PARTICLE_WIDTH_MIN  = 6;
const PARTICLE_WIDTH_MAX  = 12;
const PARTICLE_HEIGHT_MIN = 4;
const PARTICLE_HEIGHT_MAX = 8;
const FADE_START_RATIO    = 0.6;   // start fading when life drops below this %

// ─────────────────────────────────────────────────────────────
// PARTICLE CLASS
// ─────────────────────────────────────────────────────────────

class Particle {
    /**
     * @param {number} x  - origin x
     * @param {number} y  - origin y
     */
    constructor(x, y) {
        this.x       = x;
        this.y       = y;
        this.vx      = (Math.random() - 0.5) * INITIAL_VX_SPREAD;
        this.vy      = rand(INITIAL_VY_MIN, INITIAL_VY_MAX);
        this.color   = COLORS[Math.floor(Math.random() * COLORS.length)];
        this.width   = rand(PARTICLE_WIDTH_MIN, PARTICLE_WIDTH_MAX);
        this.height  = rand(PARTICLE_HEIGHT_MIN, PARTICLE_HEIGHT_MAX);
        this.angle   = Math.random() * Math.PI * 2;
        this.wobble  = (Math.random() - 0.5) * WOBBLE_SPEED * 2;
        this.maxLife = 180 + Math.floor(Math.random() * 60); // frames
        this.life    = this.maxLife;
        this.shape   = Math.random() < 0.4 ? 'circle' : 'rect';
    }

    /** Advance physics one frame. Returns false when particle is dead. */
    update() {
        this.vy    += GRAVITY;
        this.vx    *= DRAG;
        this.x     += this.vx;
        this.y     += this.vy;
        this.angle += this.wobble;
        this.life  -= 1;
        return this.life > 0;
    }

    /** Draw the particle on a canvas context. */
    draw(ctx) {
        const lifeRatio = this.life / this.maxLife;
        const alpha     = lifeRatio < FADE_START_RATIO
            ? lifeRatio / FADE_START_RATIO
            : 1;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = this.color;

        if (this.shape === 'circle') {
            ctx.beginPath();
            ctx.arc(0, 0, this.width / 2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillRect(
                -this.width  / 2,
                -this.height / 2,
                this.width,
                this.height,
            );
        }

        ctx.restore();
    }
}

// ─────────────────────────────────────────────────────────────
// CONFETTI CONTROLLER
// ─────────────────────────────────────────────────────────────

export class Confetti {
    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        if (!(canvas instanceof HTMLCanvasElement)) {
            throw new TypeError('[Confetti] Expected an HTMLCanvasElement.');
        }

        this._canvas    = canvas;
        this._ctx       = canvas.getContext('2d');
        this._particles = [];
        this._rafId     = null;
        this._emitting  = false;

        // Keep canvas sized to its container
        this._resizeObserver = new ResizeObserver(() => this._resize());
        this._resizeObserver.observe(canvas.parentElement || document.body);
        this._resize();
    }

    // ── Public API ───────────────────────────────────────────

    /** Fire a burst of confetti from the top-centre of the canvas. */
    launch() {
        this._emitting = true;
        this._spawnBurst();

        // Spawn a smaller second wave after 400 ms for a fuller effect
        setTimeout(() => this._spawnBurst(Math.floor(PARTICLE_COUNT * 0.5)), 400);
        setTimeout(() => { this._emitting = false; }, 1200);

        if (!this._rafId) {
            this._loop();
        }
    }

    /** Stop emitting new particles (existing ones finish their animation). */
    stop() {
        this._emitting = false;
    }

    /** Stop animation and clear the canvas completely. */
    destroy() {
        this.stop();
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        this._particles = [];
        this._resizeObserver.disconnect();
    }

    // ── Private ──────────────────────────────────────────────

    _resize() {
        const parent = this._canvas.parentElement || document.body;
        this._canvas.width  = parent.offsetWidth  || window.innerWidth;
        this._canvas.height = parent.offsetHeight || window.innerHeight;
    }

    _spawnBurst(count = PARTICLE_COUNT) {
        const cx = this._canvas.width / 2;
        const cy = this._canvas.height * 0.25; // launch from upper quarter

        for (let i = 0; i < count; i++) {
            // Spread origin slightly so particles don't all start at exact centre
            const ox = cx + (Math.random() - 0.5) * 80;
            const oy = cy + (Math.random() - 0.5) * 20;
            this._particles.push(new Particle(ox, oy));
        }
    }

    _loop() {
        this._rafId = requestAnimationFrame(() => {
            const ctx = this._ctx;
            ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

            // Update and draw; filter out dead particles
            this._particles = this._particles.filter(p => {
                const alive = p.update();
                if (alive) p.draw(ctx);
                return alive;
            });

            // Continue loop while particles remain
            if (this._particles.length > 0) {
                this._loop();
            } else {
                this._rafId = null;
            }
        });
    }
}

// ─────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────

function rand(min, max) {
    return min + Math.random() * (max - min);
}

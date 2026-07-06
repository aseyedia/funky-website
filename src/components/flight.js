import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

// God-mode fly camera. Pointer-lock look, WASD relative to where you're
// looking, Space/C for up/down, Shift to boost, wheel to change base speed.
// ESC (releasing pointer lock) hands the camera back via onExit.

export class FlightControls {
    constructor(camera, domElement, { onEnter, onExit } = {}) {
        this.camera = camera;
        this.enabled = false;
        this.baseSpeed = 45;
        this.velocity = new THREE.Vector3();
        this.onEnter = onEnter;
        this.onExit = onExit;
        this.keys = new Set();

        this.plc = new PointerLockControls(camera, domElement);
        this.plc.addEventListener('lock', () => {
            this.enabled = true;
            this.velocity.set(0, 0, 0);
            if (this.onEnter) this.onEnter();
        });
        this.plc.addEventListener('unlock', () => {
            if (!this.enabled) return;
            this.enabled = false;
            if (this.onExit) this.onExit();
        });

        document.addEventListener('keydown', e => { if (this.enabled) this.keys.add(e.code); });
        document.addEventListener('keyup', e => this.keys.delete(e.code));
        document.addEventListener('wheel', e => {
            if (!this.enabled) return;
            this.baseSpeed = THREE.MathUtils.clamp(this.baseSpeed * Math.exp(-e.deltaY * 0.0012), 5, 400);
        }, { passive: true });

        this._forward = new THREE.Vector3();
        this._right = new THREE.Vector3();
        this._target = new THREE.Vector3();
    }

    enter() {
        if (!this.enabled) this.plc.lock();
    }

    exit() {
        if (this.enabled) this.plc.unlock();
    }

    update(dt) {
        if (!this.enabled) return;
        dt = Math.min(dt, 0.1); // tab-switch guard

        this.camera.getWorldDirection(this._forward);
        this._right.crossVectors(this._forward, this.camera.up).normalize();

        this._target.set(0, 0, 0);
        if (this.keys.has('KeyW')) this._target.add(this._forward);
        if (this.keys.has('KeyS')) this._target.sub(this._forward);
        if (this.keys.has('KeyD')) this._target.add(this._right);
        if (this.keys.has('KeyA')) this._target.sub(this._right);
        if (this.keys.has('Space')) this._target.y += 1;
        if (this.keys.has('KeyC')) this._target.y -= 1;

        if (this._target.lengthSq() > 0) this._target.normalize();
        const boost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 4 : 1;
        this._target.multiplyScalar(this.baseSpeed * boost);

        // exponential damping — frame-rate independent, feels like gliding
        const k = 1 - Math.exp(-5 * dt);
        this.velocity.lerp(this._target, k);
        this.camera.position.addScaledVector(this.velocity, dt);

        // skim the water, never go under it
        if (this.camera.position.y < 3) {
            this.camera.position.y = 3;
            if (this.velocity.y < 0) this.velocity.y = 0;
        }
    }
}

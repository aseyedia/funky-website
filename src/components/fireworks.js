import * as THREE from 'three';

// One shared THREE.Points pool for every rocket + explosion spark. A rocket is
// a single particle (kind 0) that free-falls under gravity; when its life
// hits 1.0 it explodes into ~300 sparks (kind 1) instead of just dying.
// Particles are allocated from a ring buffer — spawning past capacity quietly
// recycles the oldest slot, which is fine at the particle counts this hits.
const MAX_PARTICLES = 1500;
const GRAVITY = 22;

const vertexShader = `
attribute vec3 aColor;
attribute float aLife;
varying vec3 vColor;
varying float vLife;
void main() {
    vColor = aColor;
    vLife = aLife;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 12.0 * (300.0 / -mvPosition.z) * (0.3 + 0.7 * aLife);
    gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = `
varying vec3 vColor;
varying float vLife;
void main() {
    if (vLife <= 0.0) discard;
    float d = length(gl_PointCoord - vec2(0.5));
    float alpha = smoothstep(0.5, 0.0, d) * vLife;
    gl_FragColor = vec4(vColor, alpha);
}
`;

export class FireworkSystem {
    constructor(maxParticles = MAX_PARTICLES) {
        this.maxParticles = maxParticles;
        this.positions = new Float32Array(maxParticles * 3);
        this.colors = new Float32Array(maxParticles * 3);
        this.lifeAttr = new Float32Array(maxParticles);

        this.velocities = new Float32Array(maxParticles * 3);
        this.maxLife = new Float32Array(maxParticles);
        this.age = new Float32Array(maxParticles);
        this.active = new Uint8Array(maxParticles);
        this.kind = new Uint8Array(maxParticles); // 0 = rocket, 1 = spark
        this.cursor = 0;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
        geometry.setAttribute('aLife', new THREE.BufferAttribute(this.lifeAttr, 1));

        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        this.points = new THREE.Points(geometry, material);
        this.points.frustumCulled = false; // positions move well outside any static bounding sphere
    }

    _spawn(x, y, z, vx, vy, vz, color, maxLifeSeconds, kind) {
        const i = this.cursor;
        this.cursor = (this.cursor + 1) % this.maxParticles;
        this.positions[i * 3] = x;
        this.positions[i * 3 + 1] = y;
        this.positions[i * 3 + 2] = z;
        this.velocities[i * 3] = vx;
        this.velocities[i * 3 + 1] = vy;
        this.velocities[i * 3 + 2] = vz;
        this.colors[i * 3] = color.r;
        this.colors[i * 3 + 1] = color.g;
        this.colors[i * 3 + 2] = color.b;
        this.maxLife[i] = maxLifeSeconds;
        this.age[i] = 0;
        this.active[i] = 1;
        this.kind[i] = kind;
        this.lifeAttr[i] = 1;
        return i;
    }

    launch(origin) {
        const vx = (Math.random() - 0.5) * 4;
        const vy = 55 + Math.random() * 15;
        const vz = (Math.random() - 0.5) * 4;
        const color = new THREE.Color().setHSL(Math.random(), 1, 0.6);
        this._spawn(origin.x, origin.y, origin.z, vx, vy, vz, color, 1.4 + Math.random() * 0.4, 0);
    }

    _explode(i) {
        const ox = this.positions[i * 3];
        const oy = this.positions[i * 3 + 1];
        const oz = this.positions[i * 3 + 2];
        const hue = Math.random();
        const sparkCount = 250 + Math.floor(Math.random() * 100);
        for (let n = 0; n < sparkCount; n++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const speed = 12 + Math.random() * 18;
            const vx = Math.sin(phi) * Math.cos(theta) * speed;
            const vy = Math.sin(phi) * Math.sin(theta) * speed;
            const vz = Math.cos(phi) * speed;
            const color = new THREE.Color().setHSL((hue + (Math.random() - 0.5) * 0.06 + 1) % 1, 1, 0.55 + Math.random() * 0.2);
            this._spawn(ox, oy, oz, vx, vy, vz, color, 1.2 + Math.random() * 0.8, 1);
        }
    }

    update(dt) {
        for (let i = 0; i < this.maxParticles; i++) {
            if (!this.active[i]) continue;
            this.age[i] += dt;
            const t = this.age[i] / this.maxLife[i];
            if (t >= 1) {
                if (this.kind[i] === 0) this._explode(i);
                this.active[i] = 0;
                this.lifeAttr[i] = 0;
                continue;
            }
            this.velocities[i * 3 + 1] -= GRAVITY * dt;
            this.positions[i * 3] += this.velocities[i * 3] * dt;
            this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
            this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
            this.lifeAttr[i] = this.kind[i] === 0 ? 1 : Math.max(0, 1 - t);
        }
        this.points.geometry.attributes.position.needsUpdate = true;
        this.points.geometry.attributes.aColor.needsUpdate = true;
        this.points.geometry.attributes.aLife.needsUpdate = true;
    }
}

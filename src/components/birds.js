import * as THREE from 'three';

// 24 low-poly seagulls circling the monument on a torus band. Boids
// (separation/alignment/cohesion) run CPU-side — trivial at this agent
// count — and drive per-instance matrices on one InstancedMesh. Wing flap
// is a vertex-shader sine offset on the wingtip vertices, keyed by a
// per-instance phase so the flock doesn't flap in lockstep.

const BIRD_COUNT = 24;
const BIRD_SIZE = 5; // half-wingspan-ish, in world units

const TORUS_R_MIN = 150;
const TORUS_R_MAX = 400;
const ALT_MIN = 40;
const ALT_MAX = 120;

const SEPARATION_DIST = 25;
const ALIGN_DIST = 60;
const COHESION_DIST = 60;
const MAX_SPEED = 35;
const MIN_SPEED = 15;

const vertexShader = `
attribute float aSide;
attribute float aPhase;
uniform float uTime;
varying float vDist;
void main() {
    vec3 pos = position;
    float flap = sin(uTime * 6.0 + aPhase) * 0.5;
    pos.y += aSide * flap * abs(position.x);
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
    vDist = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = `
varying float vDist;
void main() {
    vec3 base = vec3(0.04, 0.04, 0.05);
    vec3 fogColor = vec3(0.75, 0.78, 0.82);
    float fogFactor = clamp((vDist - 200.0) / 600.0, 0.0, 1.0);
    gl_FragColor = vec4(mix(base, fogColor, fogFactor), 1.0);
}
`;

function createBirdGeometry() {
    const s = BIRD_SIZE;
    // flat seagull silhouette: two triangles sharing a body spine, wingtips
    // at the outer verts (aSide = +-1), body verts don't flap (aSide = 0)
    const positions = new Float32Array([
        0, 0, 0.6 * s, -1 * s, 0, -0.5 * s, 0, 0, -0.1 * s,
        0, 0, 0.6 * s, 0, 0, -0.1 * s, 1 * s, 0, -0.5 * s,
    ]);
    const side = new Float32Array([0, -1, 0, 0, 0, 1]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    return geometry;
}

export class BirdFlock {
    constructor(count = BIRD_COUNT) {
        this.count = count;
        this.positions = [];
        this.velocities = [];

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = TORUS_R_MIN + Math.random() * (TORUS_R_MAX - TORUS_R_MIN);
            const altitude = ALT_MIN + Math.random() * (ALT_MAX - ALT_MIN);
            this.positions.push(new THREE.Vector3(Math.cos(angle) * radius, altitude, Math.sin(angle) * radius));
            this.velocities.push(new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)).multiplyScalar(20 + Math.random() * 10));
        }

        const geometry = createBirdGeometry();
        const phase = new Float32Array(count);
        for (let i = 0; i < count; i++) phase[i] = Math.random() * Math.PI * 2;
        geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));

        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: { uTime: { value: 0 } },
            side: THREE.DoubleSide,
        });

        this.mesh = new THREE.InstancedMesh(geometry, material, count);
        this.mesh.frustumCulled = false;
        this._dummy = new THREE.Object3D();
        this._steer = new THREE.Vector3();
        this._diff = new THREE.Vector3();
    }

    update(dt, elapsedTime) {
        for (let i = 0; i < this.count; i++) {
            const pos = this.positions[i];
            const vel = this.velocities[i];
            const sep = new THREE.Vector3();
            const align = new THREE.Vector3();
            const coh = new THREE.Vector3();
            let sepCount = 0, alignCount = 0, cohCount = 0;

            for (let j = 0; j < this.count; j++) {
                if (i === j) continue;
                const other = this.positions[j];
                const d = pos.distanceTo(other);
                if (d < SEPARATION_DIST && d > 0.001) {
                    this._diff.subVectors(pos, other).divideScalar(d);
                    sep.add(this._diff);
                    sepCount++;
                }
                if (d < ALIGN_DIST) {
                    align.add(this.velocities[j]);
                    alignCount++;
                }
                if (d < COHESION_DIST) {
                    coh.add(other);
                    cohCount++;
                }
            }

            this._steer.set(0, 0, 0);
            if (sepCount > 0) this._steer.addScaledVector(sep.divideScalar(sepCount), 3.0);
            if (alignCount > 0) this._steer.addScaledVector(align.divideScalar(alignCount).sub(vel), 0.15);
            if (cohCount > 0) this._steer.addScaledVector(coh.divideScalar(cohCount).sub(pos), 0.05);

            // torus-band containment: gentle pull back toward the ring
            const horizR = Math.hypot(pos.x, pos.z);
            if (horizR > TORUS_R_MAX) {
                this._steer.x += (-pos.x / horizR) * (horizR - TORUS_R_MAX) * 0.05;
                this._steer.z += (-pos.z / horizR) * (horizR - TORUS_R_MAX) * 0.05;
            } else if (horizR < TORUS_R_MIN) {
                this._steer.x += (pos.x / horizR) * (TORUS_R_MIN - horizR) * 0.05;
                this._steer.z += (pos.z / horizR) * (TORUS_R_MIN - horizR) * 0.05;
            }
            if (pos.y > ALT_MAX) this._steer.y -= (pos.y - ALT_MAX) * 0.1;
            else if (pos.y < ALT_MIN) this._steer.y += (ALT_MIN - pos.y) * 0.1;

            vel.addScaledVector(this._steer, dt);
            const speed = vel.length();
            if (speed > MAX_SPEED) vel.multiplyScalar(MAX_SPEED / speed);
            else if (speed < MIN_SPEED && speed > 0.001) vel.multiplyScalar(MIN_SPEED / speed);

            pos.addScaledVector(vel, dt);

            this._dummy.position.copy(pos);
            this._dummy.up.set(0, 1, 0);
            this._dummy.lookAt(pos.x + vel.x, pos.y + vel.y, pos.z + vel.z);
            this._dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this._dummy.matrix);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
        this.mesh.material.uniforms.uTime.value = elapsedTime;
    }
}

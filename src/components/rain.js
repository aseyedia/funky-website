import * as THREE from 'three';

// ~2000-streak rain field wrapped around the camera, same mod-wrap trick
// clouds.js uses for its puff tile — no CPU per-particle simulation, the
// fall + wrap is entirely in the vertex shader driven by uTime.

const RAIN_COUNT = 2000;
const TILE = 500;   // horizontal wrap extent around the camera
const HEIGHT = 150;  // vertical wrap band, centered on the camera

const vertexShader = `
attribute vec3 aSeed;
attribute float aSpeed;
uniform float uTime;
uniform vec3 uCamPos;
varying float vAlpha;

void main() {
    vec3 world = aSeed;
    world.xz = mod(world.xz - uCamPos.xz + ${TILE.toFixed(1)} * 0.5, ${TILE.toFixed(1)}) - ${TILE.toFixed(1)} * 0.5 + uCamPos.xz;
    world.y = mod(world.y - uTime * aSpeed - uCamPos.y + ${HEIGHT.toFixed(1)} * 0.5, ${HEIGHT.toFixed(1)}) - ${HEIGHT.toFixed(1)} * 0.5 + uCamPos.y;

    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    float dist = -mvPosition.z;
    gl_PointSize = clamp(2200.0 / dist, 4.0, 70.0);
    gl_Position = projectionMatrix * mvPosition;
    vAlpha = clamp(1.0 - dist / 400.0, 0.0, 1.0);
}
`;

const fragmentShader = `
varying float vAlpha;
void main() {
    float dx = abs(gl_PointCoord.x - 0.5);
    float streak = smoothstep(0.5, 0.0, dx * 10.0);
    float vFade = clamp(1.0 - abs(gl_PointCoord.y - 0.5) * 1.4, 0.0, 1.0);
    float a = streak * vFade * vAlpha * 0.5;
    if (a < 0.01) discard;
    gl_FragColor = vec4(0.75, 0.8, 0.85, a);
}
`;

export class RainSystem {
    constructor(count = RAIN_COUNT) {
        this.enabled = false;
        this.presetOn = false;
        this.userEnabled = null; // null = follow preset

        const seeds = new Float32Array(count * 3);
        const speeds = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            seeds[i * 3] = (Math.random() - 0.5) * TILE;
            seeds[i * 3 + 1] = (Math.random() - 0.5) * HEIGHT;
            seeds[i * 3 + 2] = (Math.random() - 0.5) * TILE;
            speeds[i] = 60 + Math.random() * 40;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(seeds, 3)); // unused by shader but keeps geometry valid
        geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
        geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));

        const material = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 }, uCamPos: { value: new THREE.Vector3() } },
            vertexShader,
            fragmentShader,
            transparent: true,
            depthWrite: false,
        });

        this.points = new THREE.Points(geometry, material);
        this.points.frustumCulled = false;
        this.points.visible = false;
    }

    setPresetActive(on) {
        this.presetOn = on;
        this._apply();
    }

    setUserEnabled(on) {
        this.userEnabled = on;
        this._apply();
    }

    _apply() {
        this.enabled = this.userEnabled !== null ? this.userEnabled : this.presetOn;
        this.points.visible = this.enabled;
    }

    update(time, camera) {
        if (!this.enabled) return;
        this.points.material.uniforms.uTime.value = time;
        this.points.material.uniforms.uCamPos.value.copy(camera.position);
    }
}

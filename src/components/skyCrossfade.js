import * as THREE from 'three';

// scene.background can't be lerped directly, so a switch fades through this
// large inverted sphere instead: it samples BOTH the old and new equirect
// HDRI textures and mixes them by uBlend. Rendered first (no depth write,
// renderOrder -1) while scene.background is temporarily null; once the
// blend finishes, scene.background hard-swaps to the new texture (three's
// own — correct — path) and the sphere hides again.
//
// Reuses three's own equirectUv chunk so the sampling matches however
// three itself resolves an equirect background, rather than reimplementing
// that convention and risking a pop at the handoff.

const vertexShader = /* glsl */`
varying vec3 vWorldDir;
void main() {
    vWorldDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */`
#include <common>
uniform sampler2D uOldMap;
uniform sampler2D uNewMap;
uniform float uBlend;
varying vec3 vWorldDir;
void main() {
    vec2 uv = equirectUv(vWorldDir);
    vec4 oldColor = texture2D(uOldMap, uv);
    vec4 newColor = texture2D(uNewMap, uv);
    gl_FragColor = mix(oldColor, newColor, uBlend);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

export class SkyCrossfade {
    constructor(scene, radius = 4000) {
        const geometry = new THREE.SphereGeometry(radius, 32, 16);
        const material = new THREE.ShaderMaterial({
            uniforms: { uOldMap: { value: null }, uNewMap: { value: null }, uBlend: { value: 0 } },
            vertexShader,
            fragmentShader,
            side: THREE.BackSide,
            depthWrite: false,
            depthTest: false,
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.renderOrder = -1;
        this.mesh.visible = false;
        this.mesh.frustumCulled = false;
        scene.add(this.mesh);

        this.blending = false;
        this.elapsed = 0;
        this.duration = 1.5;
        this.onComplete = null;
    }

    start(oldTexture, newTexture, duration, onComplete) {
        const u = this.mesh.material.uniforms;
        u.uOldMap.value = oldTexture;
        u.uNewMap.value = newTexture;
        u.uBlend.value = 0;
        this.duration = duration;
        this.elapsed = 0;
        this.blending = true;
        this.mesh.visible = true;
        this.onComplete = onComplete;
    }

    // Force-completes immediately — used when a new switch interrupts an
    // in-flight blend, so state never straddles two overlapping timers.
    finish() {
        if (!this.blending) return;
        this.blending = false;
        this.mesh.visible = false;
        const cb = this.onComplete;
        this.onComplete = null;
        if (cb) cb();
    }

    update(dt, camera) {
        if (!this.blending) return;
        this.mesh.position.copy(camera.position);
        this.elapsed += dt;
        const t = Math.min(1, this.elapsed / this.duration);
        this.mesh.material.uniforms.uBlend.value = t;
        if (t >= 1) this.finish();
    }
}

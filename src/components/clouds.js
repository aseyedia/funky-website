import * as THREE from 'three';

// Procedural cloud system: instanced billboard puffs (one draw call) + a
// scrolling FBM cirrus deck (one draw call). No textures downloaded — the
// puff sprite is painted on a canvas at startup.

const TILE = 3000;           // clouds wrap around the camera within this tile
const PUFF_FADE_NEAR = 40;   // puffs fade out this close to the camera (fly-through)
const PUFF_FADE_FAR = 1250;  // and out again before the wrap edge would pop
const DECK_ALTITUDE = 900;

// Per-HDRI presets: cloud tint (HDR-ish values survive ACES), deck opacity,
// CSS color for the in-cloud screen wash, and whether clouds fit the sky at all.
// sun: unit-ish direction toward the sun in the equirect HDRI, estimated by
// scanning each .hdr for its brightest pixel and converting equirect UV to a
// world direction (top-of-image = +Y). null where there's no visible sun disc.
export const CLOUD_PRESETS = {
    '001': { on: true,  tint: [1.9, 1.9, 1.95], deck: 0.45, wash: '255,255,255', sun: [0.870, 0.462, 0.174] }, // Day
    '002': { on: true,  tint: [1.7, 1.15, 0.85], deck: 0.35, wash: '255,215,185', sun: [-0.499, 0.250, -0.830] }, // Dusk
    '003': { on: true,  tint: [0.55, 0.58, 0.62], deck: 0.55, wash: '150,155,160', fx: 'rain', sun: null }, // Stormy
    '004': { on: true,  tint: [1.05, 1.07, 1.1], deck: 0.5,  wash: '225,228,232', sun: null }, // Overcast
    '005': { on: true,  tint: [1.8, 1.2, 1.3],  deck: 0.35, wash: '255,205,215', sun: [0.840, 0.230, -0.491] }, // Pink Sunset
    '006': { on: true,  tint: [0.35, 0.4, 0.55], deck: 0.3,  wash: '90,100,130', sun: null },  // Full Moon
    '007': { on: true,  tint: [1.5, 1.25, 1.05], deck: 0.4,  wash: '245,225,200', sun: [0.237, 0.109, -0.965] }, // Cloudy Sunset
    '008': { on: false, tint: [1.9, 1.9, 1.95], deck: 0.4,  wash: '255,255,255', sun: [-0.503, 0.539, -0.676] }, // Another World
    'memorial': { on: false, tint: [1.9, 1.9, 1.95], deck: 0.4, wash: '255,255,255', sun: null },
};

function makePuffTexture(size = 256) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    // core glow
    let g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.65)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    // overlapping blobs break the perfect circle into a cauliflower edge
    for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        const rad = size * (0.12 + Math.random() * 0.16);
        const x = size / 2 + Math.cos(a) * size * (0.1 + Math.random() * 0.18);
        const y = size / 2 + Math.sin(a) * size * (0.08 + Math.random() * 0.14);
        g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, 'rgba(255,255,255,0.35)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

const puffVertex = /* glsl */`
    attribute vec3 aOffset;
    attribute float aScale;
    attribute float aPhase;
    uniform float uTime;
    uniform vec3 uCamPos;
    uniform float uBass;
    varying vec2 vUv;
    varying float vFade;

    void main() {
        vUv = uv;
        // wrap the puff field around the camera so the sky never runs out
        vec3 world = aOffset;
        world.xz = mod(world.xz - uCamPos.xz + ${TILE.toFixed(1)} * 0.5, ${TILE.toFixed(1)}) - ${TILE.toFixed(1)} * 0.5;
        world.xz += uCamPos.xz;

        float d = distance(world, uCamPos);
        vFade = smoothstep(${PUFF_FADE_NEAR.toFixed(1)}, ${(PUFF_FADE_NEAR * 3).toFixed(1)}, d)
              * (1.0 - smoothstep(${(PUFF_FADE_FAR * 0.8).toFixed(1)}, ${PUFF_FADE_FAR.toFixed(1)}, d));

        // slow breathing + a nudge from the bass line
        float s = aScale * (1.0 + 0.06 * sin(uTime * 0.15 + aPhase) + uBass * 0.12);

        // billboard with a slow per-puff roll
        float ang = aPhase * 6.2831 + uTime * 0.015;
        float ca = cos(ang), sa = sin(ang);
        vec2 corner = mat2(ca, -sa, sa, ca) * position.xy;

        vec4 mv = viewMatrix * vec4(world, 1.0);
        mv.xy += corner * s;
        gl_Position = projectionMatrix * mv;
    }
`;

const puffFragment = /* glsl */`
    uniform sampler2D uMap;
    uniform vec3 uTint;
    uniform float uOpacity;
    varying vec2 vUv;
    varying float vFade;

    void main() {
        float a = texture2D(uMap, vUv).a * vFade * uOpacity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uTint, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
    }
`;

const deckVertex = /* glsl */`
    varying vec2 vXZ;
    void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vXZ = wp.xz;
        gl_Position = projectionMatrix * viewMatrix * wp;
    }
`;

const deckFragment = /* glsl */`
    uniform float uTime;
    uniform vec3 uTint;
    uniform float uDeckOpacity;
    uniform vec3 uCamPos;
    varying vec2 vXZ;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
    }

    void main() {
        vec2 p = vXZ * 0.0009 + vec2(uTime * 0.006, uTime * 0.0025);
        float n = fbm(p);
        float a = smoothstep(0.42, 0.78, n) * uDeckOpacity;
        float d = distance(vXZ, uCamPos.xz);
        a *= 1.0 - smoothstep(3500.0, 5200.0, d);
        if (a < 0.005) discard;
        gl_FragColor = vec4(uTint, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
    }
`;

export class CloudField {
    constructor({ clusterCount = 10 } = {}) {
        this.group = new THREE.Group();
        this.enabled = true;
        this.density = 1.0;
        this.washColor = '255,255,255';
        this.washDensity = 0;
        this.clusters = []; // CPU copies for fly-through wash checks

        const uniforms = {
            uTime: { value: 0 },
            uCamPos: { value: new THREE.Vector3() },
            uBass: { value: 0 },
            uTint: { value: new THREE.Vector3(1.9, 1.9, 1.95) },
            uOpacity: { value: 1 },
            uMap: { value: makePuffTexture() },
        };
        this.uniforms = uniforms;

        // --- instanced puffs ---
        const offsets = [];
        const scales = [];
        const phases = [];
        for (let c = 0; c < clusterCount; c++) {
            const cx = (Math.random() - 0.5) * TILE;
            const cz = (Math.random() - 0.5) * TILE;
            const cy = 250 + Math.random() * 450;
            const radius = 60 + Math.random() * 90;
            const puffs = 8 + Math.floor(Math.random() * 7);
            this.clusters.push({ center: new THREE.Vector3(cx, cy, cz), radius: radius * 1.25 });
            for (let i = 0; i < puffs; i++) {
                // squashed ellipsoid scatter — clouds are wider than they are tall
                const a = Math.random() * Math.PI * 2;
                const r = Math.pow(Math.random(), 0.7) * radius;
                offsets.push(
                    cx + Math.cos(a) * r,
                    cy + (Math.random() - 0.5) * radius * 0.55,
                    cz + Math.sin(a) * r
                );
                scales.push(radius * (0.8 + Math.random() * 0.9));
                phases.push(Math.random());
            }
        }

        const plane = new THREE.PlaneGeometry(1, 1);
        const geo = new THREE.InstancedBufferGeometry();
        geo.index = plane.index;
        geo.setAttribute('position', plane.getAttribute('position'));
        geo.setAttribute('uv', plane.getAttribute('uv'));
        geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3));
        geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(new Float32Array(scales), 1));
        geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(phases), 1));
        geo.instanceCount = scales.length;

        const puffMat = new THREE.ShaderMaterial({
            uniforms: { uTime: uniforms.uTime, uCamPos: uniforms.uCamPos, uBass: uniforms.uBass, uTint: uniforms.uTint, uOpacity: uniforms.uOpacity, uMap: uniforms.uMap },
            vertexShader: puffVertex,
            fragmentShader: puffFragment,
            transparent: true,
            depthWrite: false,
        });
        this.puffMesh = new THREE.Mesh(geo, puffMat);
        this.puffMesh.frustumCulled = false; // instances wrap in the shader; bounds are meaningless
        this.puffMesh.renderOrder = 2;
        this.group.add(this.puffMesh);

        // --- cirrus deck ---
        this.deckUniforms = {
            uTime: uniforms.uTime,
            uCamPos: uniforms.uCamPos,
            uTint: uniforms.uTint,
            uDeckOpacity: { value: 0.45 },
        };
        const deckMat = new THREE.ShaderMaterial({
            uniforms: this.deckUniforms,
            vertexShader: deckVertex,
            fragmentShader: deckFragment,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        this.deckMesh = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), deckMat);
        this.deckMesh.rotation.x = -Math.PI / 2;
        this.deckMesh.position.y = DECK_ALTITUDE;
        this.deckMesh.frustumCulled = false;
        this.deckMesh.renderOrder = 1;
        this.group.add(this.deckMesh);

        this._baseDeckOpacity = 0.45;
        this._wrapped = new THREE.Vector3();
    }

    applyPreset(key) {
        const p = CLOUD_PRESETS[key];
        if (!p) return;
        this.uniforms.uTint.value.fromArray(p.tint);
        this._baseDeckOpacity = p.deck;
        this.washColor = p.wash;
        this.setEnabled(p.on && this.userEnabled !== false);
        this.presetOn = p.on;
        this._refresh();
    }

    // user override from the GUI; presets still decide when re-applied
    setUserEnabled(on) {
        this.userEnabled = on;
        this.setEnabled(on);
    }

    setEnabled(on) {
        this.enabled = on;
        this.group.visible = on;
        if (!on) this.washDensity = 0;
    }

    setDensity(d) {
        this.density = d;
        this._refresh();
    }

    _refresh() {
        this.uniforms.uOpacity.value = this.density;
        this.deckUniforms.uDeckOpacity.value = this._baseDeckOpacity * this.density;
    }

    update(time, camera, bass) {
        if (!this.enabled) return;
        this.uniforms.uTime.value = time;
        this.uniforms.uBass.value = bass;
        this.uniforms.uCamPos.value.copy(camera.position);
        this.deckMesh.position.x = camera.position.x;
        this.deckMesh.position.z = camera.position.z;

        // fly-through wash: how deep is the camera inside the nearest cloud?
        let wash = 0;
        for (const c of this.clusters) {
            // same wrap the shader applies
            this._wrapped.copy(c.center);
            this._wrapped.x = ((this._wrapped.x - camera.position.x + TILE * 0.5) % TILE + TILE) % TILE - TILE * 0.5 + camera.position.x;
            this._wrapped.z = ((this._wrapped.z - camera.position.z + TILE * 0.5) % TILE + TILE) % TILE - TILE * 0.5 + camera.position.z;
            const d = this._wrapped.distanceTo(camera.position);
            wash = Math.max(wash, 1 - d / c.radius);
        }
        // deck layer counts too
        const deckDist = Math.abs(camera.position.y - DECK_ALTITUDE);
        wash = Math.max(wash, (1 - deckDist / 55) * this.deckUniforms.uDeckOpacity.value * 1.4);
        this.washDensity = THREE.MathUtils.clamp(wash, 0, 1) * this.density;
    }
}

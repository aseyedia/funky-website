// In main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { cubeToy, updateCube, cubeParams } from './components/cube.js';
import AssetLoader from './components/assetLoader.js';
import { CloudField, CLOUD_PRESETS } from './components/clouds.js';
import { RainSystem } from './components/rain.js';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';
import { SkyCrossfade } from './components/skyCrossfade.js';
import { FlightControls } from './components/flight.js';
import { FireworkSystem } from './components/fireworks.js';
import { BirdFlock } from './components/birds.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import dancerLinesRaw from './data/dancer-lines.txt?raw';

let previousTime = 0;
const desiredFPS = 60;
const frameDuration = 1000 / desiredFPS;

// FPS meter only when ?stats is in the URL (dev tool, not for visitors)
const stats = new URLSearchParams(location.search).has('stats') ? new Stats() : null;
if (stats) {
    stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
    stats.dom.id = 'stats-panel';
    document.body.appendChild(stats.dom);
}

const performanceStart = performance.now();
console.log('Script start time:', performanceStart);

let scene, camera, renderer, controls, transformControl, sound, water, dirLight;
let currentSkyTexture = null; // active HDR equirect, disposed on HDRI switch
let analyser = null;
let bassSmooth = 0; // slow-moving bass baseline, used to isolate beat transients
let currentBass = 0;
let currentPunch = 0; // transient kick strength, drives beat-synced dancer switches
let fadeProgress = 1; // 0..1, ramps up in the render loop after each play()
const FADE_SECONDS = 2.5;
const audioParams = { volume: 0.5 };
let clouds = null;
let flight = null;
let fireworks = null;
let birds = null;
let rain = null;
let sunFlare = null;
let sunFlareAnchor = null;
const SUN_DISTANCE = 5000;
const sunTuneParams = { x: 0, y: 0, z: 0 };
let currentSunPresetKey = '001';
let skyCrossfade = null;
let hdriRequestId = 0;
const DIR_LIGHT_BASE_INTENSITY = 2.5;
const weatherParams = { rain: false };
let lightningScheduled = false;
let nextLightningAt = 0;
let lightningFlashFrames = 0;
const dancerRaycaster = new THREE.Raycaster();
const cloudParams = { enabled: true, density: 1.0 };
const SPAWN_POSITION = new THREE.Vector3(0, 30, 100);
let homing = false;
let homeElapsed = 0;
const HOME_SECONDS = 1.5;
const homeFrom = new THREE.Vector3();
let cameraFocus = null; // { dancer, savedPos, savedTarget, phase: 'in'|'holding'|'out', elapsed }
const CAMERA_FOCUS_SECONDS = 1.2;
const CAMERA_FOCUS_MAX_HOLD_MS = 90000; // idle safety net once the choice UI is up — resets on every new line, so a real back-and-forth chat isn't capped, only an abandoned tab is
const CAMERA_FOCUS_DISTANCE = 18;
const cameraFocusFrom = new THREE.Vector3();
const cameraFocusTo = new THREE.Vector3();

// Adaptive quality: one-step pixelRatio + cloud-density drop under load.
let basePixelRatio = 1;
let qualityLowered = false;
let qualityDensityScale = 1;
let fpsAvg = 60;
let highFpsSince = null;
let lastQualityLog = null;
const qualityParams = { mode: 'auto' };

const textMeshes = [];
const params = { roughness: 0.1, metalness: 1.0, exposure: 1.0 };
let currentCube = null;

// Dancer state
const dancers = [];
let dancersLoading = false;
const DANCER_POSITIONS = [
    { x: -25, y: 0, z: 15 },
    { x:   0, y: 0, z: 20 },
    { x:  25, y: 0, z: 15 },
];

const danceAnimations = [
    "models/anims/breakdance 1990.glb",
    "models/anims/breakdance 1990 (2).glb",
    "models/anims/breakdance 1990 (3).glb",
    "models/anims/breakdance uprock.glb",
    "models/anims/breakdance uprock (2).glb",
    "models/anims/breakdance uprock var 1 start.glb",
    "models/anims/breakdance uprock var 1.glb",
    "models/anims/breakdance uprock var 1 end.glb",
    "models/anims/breakdance uprock var 2.glb",
    "models/anims/breakdance uprock to ground.glb",
    "models/anims/breakdance uprock to ground (2).glb",
    "models/anims/breakdance footwork 1.glb",
    "models/anims/breakdance footwork 2.glb",
    "models/anims/breakdance footwork 3.glb",
    "models/anims/breakdance footwork to freeze.glb",
    "models/anims/breakdance freezes.glb",
    "models/anims/breakdance freeze var 1.glb",
    "models/anims/breakdance freeze var 2.glb",
    "models/anims/breakdance freeze var 3.glb",
    "models/anims/breakdance freeze var 4.glb",
    "models/anims/crossleg freeze.glb",
    "models/anims/flair.glb",
    "models/anims/flair (2).glb",
    "models/anims/flair (3).glb",
    "models/anims/breakdance swipes.glb",
    "models/anims/brooklyn uprock.glb",
    "models/anims/breakdance footwork to idle.glb",
    "models/anims/breakdance footwork to idle (2).glb",
    "models/anims/breakdance ready.glb",
    "models/anims/breakdance ready (2).glb",
    "models/anims/breakdance ready (3).glb",
    "models/anims/breakdance ending 1.glb",
    "models/anims/breakdance ending 2.glb",
    "models/anims/breakdance ending 3.glb",
];

// Sourced from src/data/dancer-lines.txt — edit that file, not this array.
const AFFIRMATIONS = dancerLinesRaw.split('\n').map(l => l.trim()).filter(Boolean);

const TTS_FETCH_TIMEOUT_MS = 6000; // canned opening line: TTS-only round trip
const CHAT_FETCH_TIMEOUT_MS = 12000; // free-text turn: OpenRouter + TTS
const CHAT_MESSAGE_MAX_LENGTH = 300;
const CONVERSATION_HISTORY_MAX_ENTRIES = 8; // user+assistant entries kept per dancer, oldest dropped first

init();
animate();

const lazyLoadItems = new Set();
function showLazyStatus(id, msg) {
    lazyLoadItems.add(id);
    const el = document.getElementById('lazy-status');
    if (!el) return;
    el.textContent = msg || `loading ${id}...`;
    el.style.display = 'block';
    el.style.opacity = '1';
}
function hideLazyStatus(id) {
    lazyLoadItems.delete(id);
    if (lazyLoadItems.size === 0) {
        const el = document.getElementById('lazy-status');
        if (!el) return;
        el.style.opacity = '0';
        setTimeout(() => { el.style.display = 'none'; }, 600);
    }
}

function init() {
    AssetLoader.loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
        const bar = document.getElementById('loadingBar');
        if (bar) bar.style.width = `${Math.min(100, (itemsLoaded / itemsTotal) * 100)}%`;
    };

    setupCamera();
    setupScene();
    setupRenderer();
    setupControls();
    setupLights();

    AssetLoader.preload(() => {
        console.log('Essential assets loaded, setting up scene');
        setupObjects(() => {
            initGUI();
            document.getElementById('loadingScreen').style.display = 'none';

            // Lazy load HDRI in background
            showLazyStatus('hdri', 'loading environment...');
            loadHDRI(`${import.meta.env.BASE_URL}hdr/ocean_hdri/001/001.hdr`, () => {
                hideLazyStatus('hdri');
            });

            // Lazy load audio
            showLazyStatus('audio', 'loading audio...');
            setupAudio(() => hideLazyStatus('audio'));
        });
    });

    transformControl = new TransformControls(camera, renderer.domElement);
    transformControl.rotationSnap = THREE.MathUtils.degToRad(15); // 15 degrees in radians
    transformControl.translationSnap = 1; // 1 unit
    scene.add(transformControl);
    transformControl.addEventListener('dragging-changed', event => controls.enabled = !event.value);

    clouds = new CloudField();
    clouds.applyPreset('001'); // matches the default Day HDRI
    scene.add(clouds.group);

    fireworks = new FireworkSystem();
    scene.add(fireworks.points);

    birds = new BirdFlock();
    scene.add(birds.mesh);

    rain = new RainSystem();
    scene.add(rain.points);
    applyWeatherForPreset('001'); // matches the default Day HDRI

    setupSunFlare();
    applySunForPreset('001');

    skyCrossfade = new SkyCrossfade(scene);

    flight = new FlightControls(camera, renderer.domElement, {
        onEnter: () => {
            controls.enabled = false;
            document.getElementById('flight-hint').classList.add('active');
            document.getElementById('crosshair').classList.add('active');
        },
        onExit: () => {
            // re-aim the orbit pivot just ahead of wherever flight left us
            const fwd = new THREE.Vector3();
            camera.getWorldDirection(fwd);
            // 120 sits inside OrbitControls' min/max distance band — no snap on exit
            controls.target.copy(camera.position).addScaledVector(fwd, 120);
            controls.enabled = true;
            document.getElementById('flight-hint').classList.remove('active');
            document.getElementById('crosshair').classList.remove('active');
        },
    });

    window.addEventListener('resize', onWindowResize, false);
    console.log("Initial setup complete");
    const loadingScreenTime = performance.now();
    console.log('Total Loading time:', loadingScreenTime - performanceStart);

    // Add key event listeners
    window.addEventListener('keydown', transformKey, false);
    window.addEventListener('keyup', onKeyUp, false);
    window.addEventListener('keydown', e => {
        if (e.code !== 'KeyF' || e.repeat) return;
        if (e.target.tagName === 'INPUT') return; // lil-gui fields
        flight.enabled ? flight.exit() : flight.enter();
    }, false);
    window.addEventListener('keydown', e => {
        if (e.code !== 'KeyH' || e.repeat) return;
        if (e.target.tagName === 'INPUT') return; // lil-gui fields
        startHoming();
    }, false);
    window.addEventListener('keydown', e => {
        if (e.code !== 'KeyP' || e.repeat) return;
        if (e.target.tagName === 'INPUT') return; // lil-gui fields
        takePhoto();
    }, false);
    renderer.domElement.addEventListener('click', onDancerClick);
    renderer.domElement.addEventListener('dblclick', onFireworkDoubleClick);
    renderer.domElement.addEventListener('mousemove', onDancerHover);
}

function onFireworkDoubleClick(e) {
    if (flight.enabled) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const rayDir = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(camera).sub(camera.position);
    rayDir.y = 0;
    if (rayDir.lengthSq() < 1e-6) {
        camera.getWorldDirection(rayDir);
        rayDir.y = 0;
    }
    rayDir.normalize();

    const dist = 400 + Math.random() * 400;
    const origin = new THREE.Vector3(
        camera.position.x + rayDir.x * dist,
        5 + Math.random() * 15, // launches from near the horizon
        camera.position.z + rayDir.z * dist
    );
    fireworks.launch(origin);
}

function applyCloudDensity() {
    clouds.setDensity(cloudParams.density * qualityDensityScale);
}

function setQuality(lowered) {
    if (lowered === qualityLowered) return;
    qualityLowered = lowered;
    renderer.setPixelRatio(lowered ? Math.max(1, basePixelRatio - 0.5) : basePixelRatio);
    qualityDensityScale = lowered ? 0.5 : 1;
    applyCloudDensity();
    const msg = lowered ? 'Adaptive quality: dropped (low fps)' : 'Adaptive quality: restored';
    if (msg !== lastQualityLog) {
        console.log(msg);
        lastQualityLog = msg;
    }
}

function makeFlareTexture(size, stops) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([offset, color]) => g.addColorStop(offset, color));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function setupSunFlare() {
    const glowTex = makeFlareTexture(256, [
        [0, 'rgba(255,255,255,1)'],
        [0.2, 'rgba(255,250,230,0.8)'],
        [0.5, 'rgba(255,240,200,0.22)'],
        [1, 'rgba(255,240,200,0)'],
    ]);
    const ringTex = makeFlareTexture(128, [
        [0, 'rgba(255,255,255,0)'],
        [0.35, 'rgba(255,255,255,0)'],
        [0.5, 'rgba(210,225,255,0.45)'],
        [0.68, 'rgba(210,225,255,0)'],
        [1, 'rgba(210,225,255,0)'],
    ]);

    sunFlare = new Lensflare();
    sunFlare.addElement(new LensflareElement(glowTex, 700, 0));
    sunFlare.addElement(new LensflareElement(ringTex, 120, 0.3));
    sunFlare.addElement(new LensflareElement(ringTex, 60, 0.5));
    sunFlare.addElement(new LensflareElement(ringTex, 180, 0.75));
    sunFlare.addElement(new LensflareElement(ringTex, 90, 1.0));

    sunFlareAnchor = new THREE.Object3D();
    sunFlareAnchor.add(sunFlare);
    scene.add(sunFlareAnchor);
}

function updateSunFlarePosition() {
    const dir = new THREE.Vector3(sunTuneParams.x, sunTuneParams.y, sunTuneParams.z);
    if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
    dir.normalize();
    sunFlareAnchor.position.copy(dir.multiplyScalar(SUN_DISTANCE));
}

function applySunForPreset(key) {
    currentSunPresetKey = key;
    const preset = CLOUD_PRESETS[key];
    const sun = preset && preset.sun;
    if (sun) {
        sunTuneParams.x = sun[0];
        sunTuneParams.y = sun[1];
        sunTuneParams.z = sun[2];
        updateSunFlarePosition();
        sunFlare.visible = true;
    } else {
        sunFlare.visible = false;
    }
}

function applyWeatherForPreset(key) {
    const preset = CLOUD_PRESETS[key];
    rain.setPresetActive(!!preset && preset.fx === 'rain');
    weatherParams.rain = rain.enabled;
    lightningScheduled = false; // reschedule fresh whenever rain's active state changes
}

function scheduleNextLightning(atTime) {
    nextLightningAt = atTime + 6000 + Math.random() * 8000;
}

function triggerLightning() {
    dirLight.intensity = DIR_LIGHT_BASE_INTENSITY * 8;
    renderer.toneMappingExposure = params.exposure * 2.2;
    lightningFlashFrames = 2;
    setTimeout(playThunder, 500 + Math.random() * 1500);
}

function playThunder() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const duration = 1.2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start();
    noise.stop(ctx.currentTime + duration);
    noise.onended = () => ctx.close();
}

function startHoming() {
    if (homing || cameraFocus) return;
    homing = true;
    homeElapsed = 0;
    homeFrom.copy(camera.position);
}

function startCameraFocus(dancer) {
    if (cameraFocus || !dancer.headBone) return;
    // clear any hover glow immediately — it stays suppressed for the whole
    // dolly (onDancerHover ignores hover while cameraFocus is active) until
    // dolly-out fully completes
    if (hoveredDancer) {
        setDancerHighlight(hoveredDancer, false);
        hoveredDancer = null;
        renderer.domElement.style.cursor = 'auto';
    }
    const headPos = dancer.headBone.getWorldPosition(new THREE.Vector3());
    const awayFromHead = new THREE.Vector3().subVectors(camera.position, headPos);
    if (awayFromHead.lengthSq() < 1e-6) awayFromHead.set(0, 0, 1);
    awayFromHead.normalize();

    cameraFocusFrom.copy(camera.position);
    cameraFocusTo.copy(headPos).addScaledVector(awayFromHead, CAMERA_FOCUS_DISTANCE);

    controls.enabled = false;
    cameraFocus = {
        dancer,
        savedPos: camera.position.clone(),
        savedTarget: controls.target.clone(),
        phase: 'in',
        elapsed: 0,
    };
}

function resetCameraFocusIdle(dancer) {
    if (cameraFocus && cameraFocus.dancer === dancer) cameraFocus.elapsed = 0;
}

function updateCameraFocus(dt) {
    if (!cameraFocus) return;
    const headPos = cameraFocus.dancer.headBone.getWorldPosition(new THREE.Vector3());

    if (cameraFocus.phase === 'in') {
        cameraFocus.elapsed += dt;
        const t = Math.min(1, cameraFocus.elapsed / CAMERA_FOCUS_SECONDS);
        const eased = 1 - Math.pow(1 - t, 3);
        camera.position.lerpVectors(cameraFocusFrom, cameraFocusTo, eased);
        camera.lookAt(headPos);
        if (t >= 1) {
            cameraFocus.phase = 'holding';
            cameraFocus.elapsed = 0;
        }
    } else if (cameraFocus.phase === 'holding') {
        camera.lookAt(headPos);
        cameraFocus.elapsed += dt * 1000;
        if (!cameraFocus.dancer.talking || cameraFocus.elapsed >= CAMERA_FOCUS_MAX_HOLD_MS) {
            cameraFocusFrom.copy(camera.position);
            cameraFocus.phase = 'out';
            cameraFocus.elapsed = 0;
        }
    } else if (cameraFocus.phase === 'out') {
        cameraFocus.elapsed += dt;
        const t = Math.min(1, cameraFocus.elapsed / CAMERA_FOCUS_SECONDS);
        const eased = 1 - Math.pow(1 - t, 3);
        camera.position.lerpVectors(cameraFocusFrom, cameraFocus.savedPos, eased);
        camera.lookAt(cameraFocus.savedTarget);
        if (t >= 1) {
            controls.target.copy(cameraFocus.savedTarget);
            controls.enabled = true;
            cameraFocus = null;
        }
    }
}

function takePhoto() {
    document.body.classList.add('photo-mode');
    requestAnimationFrame(() => {
        // buffer isn't preserved between frames — render fresh, synchronously,
        // right before toBlob reads it, or the capture can come back blank.
        renderer.render(scene, camera);
        renderer.domElement.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `funky-${Date.now()}.png`;
            a.click();
            URL.revokeObjectURL(url);
            document.body.classList.remove('photo-mode');
        }, 'image/png');
    });
}

function isMobile() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return (/android/i.test(userAgent) || /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream);
}

function setupCamera() {
    const fov = isMobile() ? 80 : 40;
    // far plane covers the cloud tile + deck fade so nothing clips mid-flight
    camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 1, 8000);
    camera.position.copy(SPAWN_POSITION);
}

function setupScene() {
    scene = new THREE.Scene();
}

function setupRenderer() {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    basePixelRatio = Math.min(window.devicePixelRatio, isMobile() ? 1.5 : 2);
    renderer.setPixelRatio(basePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = params.exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(renderer.domElement);
}

function setupControls() {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.maxDistance = 200;
    controls.minDistance = 90;
}

function setupLights() {
    const ambLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambLight);

    dirLight = new THREE.DirectionalLight(0xffffff, DIR_LIGHT_BASE_INTENSITY);
    dirLight.position.set(5, 10, 7.5);
    dirLight.castShadow = true;
    scene.add(dirLight);
}

function setupAudio(onLoaded) {
    const listener = new THREE.AudioListener();
    camera.add(listener);

    sound = new THREE.Audio(listener);
    const audioLoader = new THREE.AudioLoader();
    const btn = document.getElementById('music-toggle');

    function setBtnPlaying(playing) {
        btn.classList.toggle('playing', playing);
        btn.querySelector('.label').textContent = playing ? 'pause' : 'play music';
        if (!playing) resetMusicVisuals();
    }

    // Fade driven from the render loop. Web Audio gain ramps scheduled in the
    // same task as context.resume() get dropped by Chromium (timeline not
    // ticking yet) — gain froze at 0 and the first play was silent.
    function fadeIn() {
        fadeProgress = 0;
        sound.setVolume(0);
        sound.play();
    }

    function startMusic() {
        listener.context.resume().then(() => {
            if (!sound.isPlaying) fadeIn();
            setBtnPlaying(true);
        });
        removeGestureListeners();
    }

    const onFirstGesture = () => startMusic();
    function removeGestureListeners() {
        document.removeEventListener('click', onFirstGesture);
        document.removeEventListener('keydown', onFirstGesture);
    }

    audioLoader.load(`${import.meta.env.BASE_URL}fresh_and_clean.mp3`, buffer => {
        sound.setBuffer(buffer);
        sound.setLoop(true);
        analyser = new THREE.AudioAnalyser(sound, 64);
        if (onLoaded) onLoaded();
        btn.classList.add('ready');

        btn.addEventListener('click', e => {
            e.stopPropagation(); // keep the global first-gesture handler from double-firing
            if (sound.isPlaying) {
                sound.pause();
                setBtnPlaying(false);
                removeGestureListeners();
            } else {
                startMusic();
            }
        });

        if (listener.context.state === 'suspended') {
            // autoplay is blocked until a gesture; first interaction anywhere starts the music
            document.addEventListener('click', onFirstGesture);
            document.addEventListener('keydown', onFirstGesture);
        } else {
            fadeIn();
            setBtnPlaying(true);
        }
    }, undefined, () => {
        if (onLoaded) onLoaded(); // hide status even on error
    });
}

function resetMusicVisuals() {
    currentBass = 0;
    currentPunch = 0;
    textMeshes.forEach(m => m.scale.setScalar(1));
    if (water) water.material.uniforms['distortionScale'].value = 3.7;
}

function setupObjects(callback) {
    createText('Arta Seyedian', () => {
        createOcean();
        if (callback) callback();
    });
}

function enableDancer() {
    if (dancers.length > 0) {
        dancers.forEach(d => {
            d.model.visible = true;
            if (d.glow) d.glow.visible = true;
            playDancerNextAnimation(d);
        });
        return;
    }
    if (dancersLoading) return;
    dancersLoading = true;
    showLazyStatus('dancers', 'loading dancers...');

    const dancerGlowTexture = makeFlareTexture(128, [
        [0, 'rgba(255,221,85,0.6)'],
        [0.4, 'rgba(255,221,85,0.28)'],
        [1, 'rgba(255,221,85,0)'],
    ]);

    let remaining = DANCER_POSITIONS.length;
    DANCER_POSITIONS.forEach((pos, i) => {
        AssetLoader.loadCharacterModel((fbx) => {
            remaining--;
            if (fbx) {
                fbx.position.set(pos.x, pos.y, pos.z);
                let dancerMesh = null;
                fbx.traverse((child) => {
                    if (child.isMesh) {
                        child.material = child.material.clone();
                        dancerMesh = child;
                    }
                });
                scene.add(fbx);

                // Invisible, generously-sized proxy for click/hover raycasting —
                // the exact mesh silhouette (arms/legs mid-dance) makes for a
                // frustratingly small real hitbox. Child of fbx, so it moves
                // with the dancer and the existing parent-walk in raycastDancer
                // still resolves it back to this dancer.
                // fbx itself carries a x10 scale (glTF meters -> old FBX-derived
                // scene scale), so these local dimensions become radius 10 /
                // height 22 / y-center 11 in world units once rendered.
                const hitZone = new THREE.Mesh(
                    new THREE.CylinderGeometry(1, 1, 2.2, 8),
                    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
                );
                hitZone.position.y = 1.1;
                fbx.add(hitZone);

                // Soft glow on the water beneath each dancer, hinting they're
                // clickable before anyone hovers. Flat plane (not a sprite) so
                // it actually lies on the water instead of billboarding.
                const glow = new THREE.Mesh(
                    new THREE.PlaneGeometry(26, 26),
                    new THREE.MeshBasicMaterial({
                        map: dancerGlowTexture, transparent: true, depthWrite: false,
                        blending: THREE.AdditiveBlending, opacity: 0.35,
                    })
                );
                glow.rotation.x = -Math.PI / 2;
                glow.position.set(pos.x, 0.15, pos.z);
                scene.add(glow);

                const dancerMixer = new THREE.AnimationMixer(fbx);
                const animOffset = Math.floor(i * danceAnimations.length / DANCER_POSITIONS.length);
                const dancer = {
                    model: fbx, mesh: dancerMesh, mixer: dancerMixer, animIndex: animOffset, currentAction: null,
                    loading: false, clipElapsed: 0, clipDuration: Infinity,
                    // GLTFLoader strips ':' from node names, so the source rig's
                    // "mixamorig8:Head" comes through as "mixamorig8Head".
                    headBone: fbx.getObjectByName('mixamorig8Head'), talking: false,
                    bubbleEl: null, choiceEl: null, conversationHistory: [],
                    // stable per-dancer voice slot (0/1/2) — set from the DANCER_POSITIONS
                    // loop index, not push order, since these callbacks resolve async
                    voiceIndex: i,
                    hitZone, glow,
                };
                dancers.push(dancer);
                playDancerNextAnimation(dancer);
            }
            if (remaining === 0) {
                dancersLoading = false;
                hideLazyStatus('dancers');
            }
        });
    });
}

function disableDancer() {
    dancers.forEach(d => {
        d.mixer.stopAllAction();
        d.currentAction = null;
        // otherwise a dancer disabled mid-talk (mid-fetch/mid-audio) stays
        // permanently unclickable after re-enabling — nothing else clears it.
        d.talking = false;
        d.model.visible = false;
        if (d.glow) d.glow.visible = false;
        if (d.choiceEl) d.choiceEl.style.display = 'none';
        d.conversationHistory = [];
    });
}

function playDancerNextAnimation(dancer) {
    if (dancer.loading) return;
    dancer.loading = true;
    if (dancer.animIndex >= danceAnimations.length) dancer.animIndex = 0;
    const path = danceAnimations[dancer.animIndex++];
    AssetLoader.loadNextAnimation(path, (clip) => {
        dancer.loading = false;
        if (!clip) {
            playDancerNextAnimation(dancer);
            return;
        }
        if (dancer.currentAction) dancer.currentAction.fadeOut(0.5);
        const action = dancer.mixer.clipAction(clip);
        action.reset();
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.fadeIn(0.5);
        action.play();
        dancer.currentAction = action;
        dancer.clipDuration = clip.duration;
        dancer.clipElapsed = 0;
    });
}

function startDialogue(dancer) {
    if (dancer.talking || cameraFocus || homing) return;
    dancer.talking = true;
    startCameraFocus(dancer);
    speakCannedLine(dancer);
}

// Starts (or restarts) the looping talk animation and hands the caller the
// new action once it's ready. Canned lines call this immediately (text is
// already known, nothing to wait for); chat replies call this only after
// the AI response arrives, so the dancer never "talks" silently.
function beginTalkAnimation(dancer, callback) {
    AssetLoader.loadNextAnimation('models/anims/talking.glb', (clip) => {
        if (!clip) {
            callback(null);
            return;
        }
        if (dancer.currentAction) dancer.currentAction.fadeOut(0.3);
        const action = dancer.mixer.clipAction(clip);
        action.reset();
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.fadeIn(0.3);
        action.play();
        dancer.currentAction = action;
        callback(action);
    });
}

function scheduleReadingTimeFinish(dancer, action, text) {
    const words = text.split(/\s+/).length;
    const seconds = Math.max(3, words * 0.35);
    setTimeout(() => onLineFinished(dancer, action), seconds * 1000);
}

// Opening line: picked from the bundled canned lines, not AI-generated —
// so there's no network wait before the dancer starts talking. The only
// round trip left is fetching audio for a line whose text we already have.
function speakCannedLine(dancer) {
    const text = AFFIRMATIONS[Math.floor(Math.random() * AFFIRMATIONS.length)];
    beginTalkAnimation(dancer, (action) => {
        if (!action) {
            dancer.talking = false;
            return;
        }
        showAffirmationBubble(dancer, text);
        // the opening line has to be in history too, or the first chat reply
        // has no idea what the dancer just said and answers out of context
        dancer.conversationHistory.push({ role: 'assistant', content: text });

        fetch(`${import.meta.env.BASE_URL}api/dancer-line`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voiceIndex: dancer.voiceIndex, text }),
            signal: AbortSignal.timeout(TTS_FETCH_TIMEOUT_MS),
        })
            .then((r) => (r.ok ? r.json() : { audio: null }))
            .then(({ audio }) => {
                if (dancer.currentAction !== action) return; // superseded
                if (audio) {
                    playDancerAudio(
                        audio,
                        () => onLineFinished(dancer, action),
                        () => scheduleReadingTimeFinish(dancer, action, text)
                    );
                } else {
                    scheduleReadingTimeFinish(dancer, action, text);
                }
            })
            .catch(() => {
                if (dancer.currentAction !== action) return;
                scheduleReadingTimeFinish(dancer, action, text);
            });
    });
}

let duckTarget = 1;
let duckFactor = 1;

function playDancerAudio(base64Mp3, onEnded, onFailure) {
    const audioEl = new Audio(`data:audio/mpeg;base64,${base64Mp3}`);
    duckTarget = 0.25;
    const stopDucking = () => { duckTarget = 1; onEnded(); };
    const handleFailure = () => { duckTarget = 1; onFailure(); };
    audioEl.addEventListener('ended', stopDucking);
    audioEl.addEventListener('error', handleFailure);
    audioEl.play().catch(handleFailure);
}

// A line finished (audio ended, or the reading-time estimate elapsed) —
// hand control back to the visitor instead of auto-dismissing.
function onLineFinished(dancer, action) {
    if (dancer.currentAction !== action) return; // superseded by a newer line already
    showDialogueChoice(dancer);
}

function dismissDialogue(dancer) {
    hideDialogueChoice(dancer);
    dancer.conversationHistory = [];
    dancer.talking = false;
    if (dancer.bubbleEl) dancer.bubbleEl.style.display = 'none';
    playDancerNextAnimation(dancer);
}

function sendChatMessage(dancer, rawMessage) {
    const userMessage = rawMessage.trim().slice(0, CHAT_MESSAGE_MAX_LENGTH);
    if (!userMessage) return;
    hideDialogueChoice(dancer);
    showAffirmationBubble(dancer, '...');

    fetch(`${import.meta.env.BASE_URL}api/dancer-line`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            voiceIndex: dancer.voiceIndex,
            userMessage,
            conversationHistory: dancer.conversationHistory,
        }),
        signal: AbortSignal.timeout(CHAT_FETCH_TIMEOUT_MS),
    })
        .then((r) => {
            if (!r.ok) throw new Error(`status ${r.status}`);
            return r.json();
        })
        .then(({ text, audio }) => {
            if (!dancer.talking) return; // dialogue was dismissed while this was in flight
            dancer.conversationHistory.push({ role: 'user', content: userMessage });
            dancer.conversationHistory.push({ role: 'assistant', content: text });
            while (dancer.conversationHistory.length > CONVERSATION_HISTORY_MAX_ENTRIES) {
                dancer.conversationHistory.shift();
            }
            beginTalkAnimation(dancer, (action) => {
                if (!action) {
                    showDialogueChoice(dancer);
                    return;
                }
                showAffirmationBubble(dancer, text);
                if (audio) {
                    playDancerAudio(
                        audio,
                        () => onLineFinished(dancer, action),
                        () => scheduleReadingTimeFinish(dancer, action, text)
                    );
                } else {
                    scheduleReadingTimeFinish(dancer, action, text);
                }
            });
        })
        .catch(() => {
            if (!dancer.talking) return;
            beginTalkAnimation(dancer, (action) => {
                if (!action) {
                    showDialogueChoice(dancer);
                    return;
                }
                const text = "Hmm, lost the beat for a second — try me again?";
                showAffirmationBubble(dancer, text);
                scheduleReadingTimeFinish(dancer, action, text);
            });
        });
}

function showDialogueChoice(dancer) {
    if (!dancer.choiceEl) {
        const el = document.createElement('div');
        el.className = 'dancer-choice';
        el.innerHTML = `
            <button type="button" class="dancer-choice-dismiss">Thanks!</button>
            <form class="dancer-choice-form">
                <input type="text" class="dancer-choice-input" placeholder="Say something back..." maxlength="${CHAT_MESSAGE_MAX_LENGTH}" autocomplete="off">
            </form>
        `;
        document.body.appendChild(el);
        dancer.choiceEl = el;
        el.querySelector('.dancer-choice-dismiss').addEventListener('click', () => dismissDialogue(dancer));
        el.querySelector('.dancer-choice-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const input = el.querySelector('.dancer-choice-input');
            const value = input.value;
            input.value = '';
            sendChatMessage(dancer, value);
        });
    }
    dancer.choiceEl.style.display = 'flex';
    resetCameraFocusIdle(dancer);
}

function hideDialogueChoice(dancer) {
    if (dancer.choiceEl) dancer.choiceEl.style.display = 'none';
}

function showAffirmationBubble(dancer, text) {
    if (!dancer.bubbleEl) {
        const el = document.createElement('div');
        el.className = 'dancer-bubble';
        document.body.appendChild(el);
        dancer.bubbleEl = el;
    }
    dancer.bubbleEl.textContent = text;
    dancer.bubbleEl.style.display = 'block';
    resetCameraFocusIdle(dancer);
}

function raycastDancer(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
    );
    dancerRaycaster.setFromCamera(ndc, camera);
    // three.js raycasting ignores Object3D.visible entirely (it only affects
    // rendering) — filter out disabled dancers ourselves or they stay clickable.
    // Raycasts against hitZone (a generous invisible cylinder), not the exact
    // mesh silhouette — arms/legs mid-dance make for a frustratingly small
    // real hitbox otherwise.
    const hits = dancerRaycaster.intersectObjects(dancers.filter(d => d.model.visible).map(d => d.hitZone), true);
    if (hits.length === 0) return null;
    const hitObj = hits[0].object;
    return dancers.find(d => {
        let o = hitObj;
        while (o) {
            if (o === d.model) return true;
            o = o.parent;
        }
        return false;
    }) || null;
}

function onDancerClick(e) {
    if (flight.enabled || dancers.length === 0 || cameraFocus || homing) return;
    const dancer = raycastDancer(e.clientX, e.clientY);
    if (dancer) startDialogue(dancer);
}

let hoveredDancer = null;

function setDancerHighlight(dancer, on) {
    if (dancer.mesh) {
        dancer.mesh.material.emissive.setHex(on ? 0xffdd55 : 0x000000);
        dancer.mesh.material.emissiveIntensity = on ? 0.6 : 0;
    }
    if (dancer.glow) {
        dancer.glow.material.opacity = on ? 0.75 : 0.35;
    }
}

function onDancerHover(e) {
    // suppressed for the whole dolly (in/holding/out), not just while flying —
    // otherwise a different idle dancer can light up mid-focus, promising a
    // click that onDancerClick's cameraFocus guard will silently ignore
    if (flight.enabled || dancers.length === 0 || cameraFocus) {
        if (hoveredDancer) {
            setDancerHighlight(hoveredDancer, false);
            hoveredDancer = null;
            renderer.domElement.style.cursor = 'auto';
        }
        return;
    }
    const hit = raycastDancer(e.clientX, e.clientY);
    if (hit === hoveredDancer) return;
    if (hoveredDancer) setDancerHighlight(hoveredDancer, false);
    hoveredDancer = hit;
    if (hoveredDancer) setDancerHighlight(hoveredDancer, true);
    renderer.domElement.style.cursor = hoveredDancer ? 'pointer' : 'auto';
}

function createText(message, callback) {
    function attemptCreateText() {
        const font = AssetLoader.getAsset('fonts', 'helvetiker');
        if (!font) {
            console.log('Font not loaded yet, retrying in 100ms');
            setTimeout(attemptCreateText, 100);
            return;
        }
        
        const textGeometry = new TextGeometry(message, {
            font: font,
            size: 10,
            depth: 2,
            curveSegments: 3,
            bevelEnabled: true,
            bevelThickness: 1,
            bevelSize: 1,
            bevelOffset: 0,
            bevelSegments: 3
        });
        textGeometry.computeBoundingBox();
        const centerOffsetX = -0.5 * (textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x);
        // No explicit envMap — the material picks up scene.environment automatically.
        const textMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: params.metalness,
            roughness: params.roughness,
            envMapIntensity: 1.0,
            clearcoat: 1.0,
            clearcoatRoughness: 0,
            ior: 1.5,
            reflectivity: 1.0
        });
        const textMesh = new THREE.Mesh(textGeometry, textMaterial);
        textMesh.position.set(centerOffsetX, 10, 0);
        textMesh.castShadow = true;
        scene.add(textMesh);
        textMeshes.push(textMesh);
        console.log("Text mesh created:", textMesh);
        if (callback) callback();
    }

    attemptCreateText();
}

// The English name is an extruded TextGeometry, but that font format (and
// three.js's TextGeometry itself) only lays out glyphs left-to-right with
// no Arabic-script shaping — Persian text needs both RTL reordering and
// per-letter contextual forms, which the browser's own text engine already
// does correctly. So the Persian variant is a canvas-rendered texture on a
// plane instead of a second extruded font.
let persianNameMesh = null;
let persianNameEnabled = false;

async function createPersianNameMesh() {
    await document.fonts.load('160px Lalezar');

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '160px Lalezar';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('آرتا سیدیان', canvas.width / 2, canvas.height / 2 + 20);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const geometry = new THREE.PlaneGeometry(80, 80 * (canvas.height / canvas.width));
    const material = new THREE.MeshPhysicalMaterial({
        map: texture,
        transparent: true,
        metalness: params.metalness,
        roughness: params.roughness,
        envMapIntensity: 1.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0,
    });
    persianNameMesh = new THREE.Mesh(geometry, material);
    persianNameMesh.position.set(0, 10, 0);
    persianNameMesh.visible = persianNameEnabled;
    scene.add(persianNameMesh);
    textMeshes.push(persianNameMesh);
}

function togglePersianName(enabled) {
    persianNameEnabled = enabled;
    if (textMeshes[0]) textMeshes[0].visible = !enabled; // the English mesh is always textMeshes[0]
    if (enabled && !persianNameMesh) {
        createPersianNameMesh();
    } else if (persianNameMesh) {
        persianNameMesh.visible = enabled;
    }
}

function createOcean() {
    const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
    const waterNormals = AssetLoader.getAsset('textures', 'waterNormals');
    if (!waterNormals) {
        console.error('Water normals texture not loaded');
        return;
    }
    waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;
    
    water = new Water(waterGeometry, {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals: waterNormals,
        alpha: 1.0,
        sunDirection: new THREE.Vector3(),
        sunColor: 0xffffff,
        waterColor: 0x001e0f,
        distortionScale: 3.7,
        fog: scene.fog !== undefined
    });
    water.rotation.x = -Math.PI / 2;
    scene.add(water);
}

function attachTransformControls(cube, eventKey = null) {
    if (cube && cube.parent === scene) {
        const mode = eventKey === 'w' ? 'translate' : eventKey === 'e' ? 'scale' : 'rotate';
        transformControl.setMode(mode);
        transformControl.attach(cube);
        console.log(`TransformControls attached to cube with mode: ${mode}`);
    } else {
        console.warn("Attempted to attach TransformControls to an object not in the scene", cube);
    }
}

function detachTransformControls() {
    transformControl.detach();
    console.log("TransformControls detached.");
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate(currentTime) {
    requestAnimationFrame(animate);

    const deltaTime = currentTime - previousTime;
    
    if (deltaTime >= frameDuration) {
        if (stats) stats.begin();

        const dt = deltaTime / 1000;

        if (qualityParams.mode === 'auto') {
            const dtSafe = Math.min(dt, 0.1);
            const instFps = dtSafe > 0 ? 1 / dtSafe : fpsAvg;
            fpsAvg += (instFps - fpsAvg) * (1 - Math.exp(-dtSafe / 3)); // ~3s rolling average
            if (fpsAvg < 40) {
                highFpsSince = null;
                setQuality(true);
            } else if (fpsAvg > 55) {
                if (highFpsSince === null) highFpsSince = currentTime;
                if (currentTime - highFpsSince >= 10000) setQuality(false);
            } else {
                highFpsSince = null;
            }
        }

        if (homing) {
            homeElapsed += dt;
            const t = Math.min(1, homeElapsed / HOME_SECONDS);
            const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
            camera.position.lerpVectors(homeFrom, SPAWN_POSITION, eased);
            if (t >= 1) {
                homing = false;
                flight.velocity.set(0, 0, 0);
                if (!flight.enabled) controls.target.set(0, 0, 0);
            }
        } else if (cameraFocus) {
            updateCameraFocus(dt);
        } else {
            flight.update(dt);
            if (!flight.enabled) controls.update();
        }

        if (water) {
            // infinite ocean: keep the plane centered under the camera
            water.position.x = camera.position.x;
            water.position.z = camera.position.z;
            if (water.material.uniforms['time']) {
                water.material.uniforms['time'].value += 1.0 / desiredFPS;
            }
        }

        if (sound && sound.isPlaying) {
            if (fadeProgress < 1) fadeProgress = Math.min(1, fadeProgress + dt / FADE_SECONDS);
            duckFactor += (duckTarget - duckFactor) * (1 - Math.exp(-dt / 0.3));
            sound.setVolume(audioParams.volume * fadeProgress * duckFactor);
        }

        // Music-reactive: kick hits bounce the text, bass stirs the water.
        // Pulsing on the transient (bass above its own moving average) instead of
        // raw level makes each beat pop rather than the text sitting enlarged.
        if (analyser && sound && sound.isPlaying) {
            const freq = analyser.getFrequencyData();
            let bass = 0;
            for (let i = 0; i < 8; i++) bass += freq[i];
            bass /= 8 * 255;
            currentBass = bass;
            bassSmooth = bassSmooth * 0.92 + bass * 0.08;
            currentPunch = Math.max(0, bass - bassSmooth) * 4;
            textMeshes.forEach(m => m.scale.set(1 + currentPunch * 0.2, 1 + currentPunch * 0.6, 1 + currentPunch * 0.2));
            if (water) water.material.uniforms['distortionScale'].value = 3.7 + bass * 4;
        }

        clouds.update(currentTime / 1000, camera, currentBass);
        fireworks.update(dt);
        birds.update(dt, currentTime / 1000);
        rain.update(currentTime / 1000, camera);
        skyCrossfade.update(dt, camera);
        weatherParams.rain = rain.enabled;

        if (rain.enabled) {
            if (!lightningScheduled) {
                scheduleNextLightning(currentTime);
                lightningScheduled = true;
            }
            if (currentTime >= nextLightningAt) {
                triggerLightning();
                scheduleNextLightning(currentTime);
            }
        } else {
            lightningScheduled = false;
        }
        if (lightningFlashFrames > 0) {
            lightningFlashFrames--;
            if (lightningFlashFrames === 0) {
                dirLight.intensity = DIR_LIGHT_BASE_INTENSITY;
                renderer.toneMappingExposure = params.exposure;
            }
        }
        const washEl = document.getElementById('cloud-wash');
        washEl.style.opacity = (clouds.washDensity * 0.92).toFixed(3);
        washEl.style.background = `rgb(${clouds.washColor})`;

        dancers.forEach(d => {
            d.mixer.update(dt);

            const bubbleShown = d.bubbleEl && d.bubbleEl.style.display !== 'none';
            const choiceShown = d.choiceEl && d.choiceEl.style.display !== 'none';
            if (d.headBone && (bubbleShown || choiceShown)) {
                const headPos = d.headBone.getWorldPosition(new THREE.Vector3());
                headPos.y += 3; // clear the top of the head
                headPos.project(camera);
                const left = `${(headPos.x * 0.5 + 0.5) * window.innerWidth}px`;
                const top = `${(-headPos.y * 0.5 + 0.5) * window.innerHeight}px`;
                if (bubbleShown) { d.bubbleEl.style.left = left; d.bubbleEl.style.top = top; }
                if (choiceShown) { d.choiceEl.style.left = left; d.choiceEl.style.top = top; }
            }

            if (d.loading || d.talking || !d.currentAction) return;
            d.clipElapsed += dt;
            const ratio = d.clipElapsed / d.clipDuration;
            if ((ratio >= 0.7 && currentPunch > 0.25) || ratio >= 1.3) {
                playDancerNextAnimation(d);
            }
        });

        renderer.render(scene, camera);

        if (stats) stats.end();

        previousTime = currentTime - (deltaTime % frameDuration);
    }
}


function loadHDRI(path, callback) {
    const name = path.split('/').pop();
    console.log("Loading HDRI:", path);
    const requestId = ++hdriRequestId;
    AssetLoader.loadHDRI(name, path, (texture) => {
        if (!texture) {
            console.error('HDRI texture not loaded:', path);
            return;
        }
        if (requestId !== hdriRequestId) {
            texture.dispose(); // superseded by a newer pick before this one finished loading
            return;
        }

        // Full-res equirect as the sky (much sharper than the old 256px PMREM
        // cubemap); the renderer PMREMs scene.environment internally and caches it.
        texture.mapping = THREE.EquirectangularReflectionMapping;

        if (!currentSkyTexture) {
            // first load — nothing to blend from
            scene.background = texture;
            scene.environment = texture;
            currentSkyTexture = texture;
            if (callback) callback();
            return;
        }

        if (skyCrossfade.blending) skyCrossfade.finish(); // snap any in-flight blend before starting a new one

        const oldSky = currentSkyTexture;
        scene.background = null;
        scene.environment = texture; // reflection pop is barely noticeable — not worth blending
        skyCrossfade.start(oldSky, texture, 1.5, () => {
            scene.background = texture;
            oldSky.dispose();
            currentSkyTexture = texture;
        });

        if (callback) callback();
    });
}

function addSettings(cubeFolder) {
    if (cubeFolder.controllers.length > 1) {
        console.log("Showing old controllers");
        cubeFolder.controllers.forEach(controller => {
            controller.show(true);
        });
    } else {
        console.log("Adding cube folder options");
        cubeFolder.add(cubeParams, 'size', 10, 100).name('Size').onChange(() => updateCubeAndTransformControls());
        cubeFolder.addColor(cubeParams, 'color').name('Color').onChange(() => updateCubeAndTransformControls());
        cubeFolder.add(cubeParams, 'transmission', 0, 1).name('Transmission').onChange(() => updateCubeAndTransformControls());
        cubeFolder.add(cubeParams, 'opacity', 0, 1).name('Opacity').onChange(() => updateCubeAndTransformControls());
        cubeFolder.add(cubeParams, 'metalness', 0, 1).name('Metalness').onChange(() => updateCubeAndTransformControls());
        cubeFolder.add(cubeParams, 'reflectivity', 0, 1).name('Reflectivity').onChange(() => updateCubeAndTransformControls());
        cubeFolder.add(cubeParams, 'roughness', 0, 1).name('Roughness').onChange(() => updateCubeAndTransformControls());
        cubeFolder.add(cubeParams, 'ior', 1, 2.333).name('IOR').onChange(() => updateCubeAndTransformControls());
        cubeFolder.add(cubeParams, 'thickness', 0, 100).name('Thickness').onChange(() => updateCubeAndTransformControls());
        cubeFolder.add(cubeParams, 'specularIntensity', 0, 1).name('Specular Intensity').onChange(() => updateCubeAndTransformControls());
        cubeFolder.addColor(cubeParams, 'specularColor').name('Specular Color').onChange(() => updateCubeAndTransformControls());
        cubeFolder.add(cubeParams, 'dispersion', 0, 1).name('Dispersion').onChange(() => updateCubeAndTransformControls());
    }
}

function updateCubeAndTransformControls() {
    if (currentCube) {
        updateCube(scene, cubeParams);
        // attachTransformControls(currentCube);
    }
}

function removeSettings(cubeFolder) {
    console.log("Controllers before hiding:", cubeFolder.controllers);
    const controllersToRemove = cubeFolder.controllers.slice(1);
    console.log("Controllers to be hidden:", controllersToRemove);
    controllersToRemove.forEach(controller => {
        controller.show(false)
    });
}

function initGUI() {
    const gui = new GUI();
    gui.add({ home: () => startHoming() }, 'home').name('Return home (H)');
    gui.add({ photo: () => takePhoto() }, 'photo').name('Photo (P)');
    gui.add(qualityParams, 'mode', ['auto', 'high', 'low']).name('Quality').onChange(v => {
        highFpsSince = null;
        if (v === 'high') setQuality(false);
        else if (v === 'low') setQuality(true);
        // 'auto' just lets the rolling-fps loop take back over from here
    });

    const hdrFolder = gui.addFolder('HDRI');
    const hdrOptions = {
        'Day': '001/001.hdr',
        'Dusk': '002/002.hdr',
        'Stormy': '003/003.hdr',
        'Overcast': '004/004.hdr',
        'Pink Sunset': '005/005.hdr',
        'Full Moon': '006/006.hdr',
        'Cloudy Sunset': '007/007.hdr',
        'Another World': '008/008.hdr',
        'Memorial Church': 'memorial.hdr'
    };

    // In your initGUI function, update the HDRI onChange handler:
    hdrFolder.add({ hdr: hdrOptions['Day'] }, 'hdr', hdrOptions).name('Select HDRI').onChange(value => {
        // prepend hdr/ocean_hdri to value
        const path = `${import.meta.env.BASE_URL}hdr/ocean_hdri/${value}`;
        loadHDRI(path);
        const presetKey = value.split('/').pop().replace('.hdr', '');
        clouds.applyPreset(presetKey);
        applyWeatherForPreset(presetKey);
        applySunForPreset(presetKey);
    });

    hdrFolder.close();

    const skyFolder = gui.addFolder('Clouds');
    skyFolder.add(cloudParams, 'enabled').name('Enable').onChange(v => clouds.setUserEnabled(v));
    skyFolder.add(cloudParams, 'density', 0, 1).name('Density').onChange(() => applyCloudDensity());
    skyFolder.add(weatherParams, 'rain').name('Rain').listen().onChange(v => rain.setUserEnabled(v));
    skyFolder.close();

    // Temporary: sun direction was estimated from each HDRI's brightest pixel.
    // Tune live per-preset here, then bake the numbers back into CLOUD_PRESETS.
    const sunFolder = gui.addFolder('Sun (flare tuning)');
    const onSunTuneChange = () => {
        updateSunFlarePosition();
        if (CLOUD_PRESETS[currentSunPresetKey].sun) {
            CLOUD_PRESETS[currentSunPresetKey].sun = [sunTuneParams.x, sunTuneParams.y, sunTuneParams.z];
        }
    };
    sunFolder.add(sunTuneParams, 'x', -1, 1, 0.01).listen().onChange(onSunTuneChange);
    sunFolder.add(sunTuneParams, 'y', -1, 1, 0.01).listen().onChange(onSunTuneChange);
    sunFolder.add(sunTuneParams, 'z', -1, 1, 0.01).listen().onChange(onSunTuneChange);
    sunFolder.close();

    if (!isMobile()) {
        const flightFolder = gui.addFolder('Flight');
        flightFolder.add({ fly: () => flight.enter() }, 'fly').name('Take off (F)');
        flightFolder.add(flight, 'baseSpeed', 5, 400).name('Speed').listen();
        flightFolder.open();
    }

    const audioFolder = gui.addFolder('Audio');
    audioFolder.add(audioParams, 'volume', 0, 1).name('Volume').onChange(v => {
        if (sound) sound.setVolume(v * fadeProgress * duckFactor);
    });
    audioFolder.open();
    isMobile() ? gui.close() : gui.open();

    // Persian name toggle: hidden until the flat-plane look and font get
    // revisited (createPersianNameMesh/togglePersianName below still work,
    // just not wired into the GUI right now).

    const dancerFolder = gui.addFolder('Dancer');
    dancerFolder.add({ enabled: false }, 'enabled').name('Enable').onChange(value => {
        value ? enableDancer() : disableDancer();
    });
    dancerFolder.open();

    const cubeFolder = gui.addFolder('Cube');
    cubeParams.enabled = false;
    cubeFolder.add(cubeParams, 'enabled').name('Enable').onChange(value => {
        if (value) {
            if (!currentCube) {
                currentCube = cubeToy(scene, cubeParams);
                scene.add(currentCube);
            } else if (currentCube) {
                console.log(currentCube, "already exists in scene");
                currentCube.visible = true;
                scene.add(currentCube);
            }
            addSettings(cubeFolder);
        } else {
            scene.remove(currentCube);
            console.log(currentCube, "removed from scene")
            currentCube.visible = false;
            detachTransformControls();
            removeSettings(cubeFolder);
        }
    });

    cubeFolder.close();

}

function transformKey(event) {
    if (flight && flight.enabled) return; // W/E/R belong to movement while flying
    if (event.target.tagName === 'INPUT') return; // dancer chat box
    if (currentCube && ['w', 'e', 'r'].includes(event.key)) {
        attachTransformControls(currentCube, event.key);
    }
}

function onKeyUp(event) {
    if (flight && flight.enabled) return;
    if (['w', 'e', 'r'].includes(event.key)) {
        detachTransformControls();
    }
}


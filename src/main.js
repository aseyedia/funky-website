// In main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { cubeToy, updateCube, cubeParams } from './components/cube.js';
import AssetLoader from './components/assetLoader.js';
import { CloudField } from './components/clouds.js';
import { FlightControls } from './components/flight.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';

let previousTime = 0;
const desiredFPS = 60;
const frameDuration = 1000 / desiredFPS;

// FPS meter only when ?stats is in the URL (dev tool, not for visitors)
const stats = new URLSearchParams(location.search).has('stats') ? new Stats() : null;
if (stats) {
    stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
    document.body.appendChild(stats.dom);
}

const performanceStart = performance.now();
console.log('Script start time:', performanceStart);

let scene, camera, renderer, controls, transformControl, sound, water;
let currentSkyTexture = null; // active HDR equirect, disposed on HDRI switch
let analyser = null;
let bassSmooth = 0; // slow-moving bass baseline, used to isolate beat transients
let currentBass = 0;
let fadeProgress = 1; // 0..1, ramps up in the render loop after each play()
const FADE_SECONDS = 2.5;
const audioParams = { volume: 0.5 };
let clouds = null;
let flight = null;
const cloudParams = { enabled: true, density: 1.0 };

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
}

function isMobile() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return (/android/i.test(userAgent) || /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream);
}

function setupCamera() {
    const fov = isMobile() ? 80 : 40;
    // far plane covers the cloud tile + deck fade so nothing clips mid-flight
    camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 1, 8000);
    camera.position.set(0, 30, 100);
}

function setupScene() {
    scene = new THREE.Scene();
}

function setupRenderer() {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile() ? 1.5 : 2));
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

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
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
            playDancerNextAnimation(d);
        });
        return;
    }
    if (dancersLoading) return;
    dancersLoading = true;
    showLazyStatus('dancers', 'loading dancers...');

    let remaining = DANCER_POSITIONS.length;
    DANCER_POSITIONS.forEach((pos, i) => {
        AssetLoader.loadCharacterModel((fbx) => {
            remaining--;
            if (fbx) {
                fbx.position.set(pos.x, pos.y, pos.z);
                scene.add(fbx);
                const dancerMixer = new THREE.AnimationMixer(fbx);
                const animOffset = Math.floor(i * danceAnimations.length / DANCER_POSITIONS.length);
                const dancer = { model: fbx, mixer: dancerMixer, animIndex: animOffset, currentAction: null, loading: false };
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
        d.model.visible = false;
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
        // Schedule transition to next animation after one full play-through
        setTimeout(() => {
            if (dancer.currentAction === action) playDancerNextAnimation(dancer);
        }, clip.duration * 1000);
    });
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
        flight.update(dt);
        if (!flight.enabled) controls.update();

        if (water) {
            // infinite ocean: keep the plane centered under the camera
            water.position.x = camera.position.x;
            water.position.z = camera.position.z;
            if (water.material.uniforms['time']) {
                water.material.uniforms['time'].value += 1.0 / desiredFPS;
            }
        }

        if (sound && sound.isPlaying && fadeProgress < 1) {
            fadeProgress = Math.min(1, fadeProgress + dt / FADE_SECONDS);
            sound.setVolume(audioParams.volume * fadeProgress);
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
            const punch = Math.max(0, bass - bassSmooth) * 4;
            textMeshes.forEach(m => m.scale.set(1 + punch * 0.2, 1 + punch * 0.6, 1 + punch * 0.2));
            if (water) water.material.uniforms['distortionScale'].value = 3.7 + bass * 4;
        }

        clouds.update(currentTime / 1000, camera, currentBass);
        const washEl = document.getElementById('cloud-wash');
        washEl.style.opacity = (clouds.washDensity * 0.92).toFixed(3);
        washEl.style.background = `rgb(${clouds.washColor})`;

        dancers.forEach(d => d.mixer.update(dt));

        renderer.render(scene, camera);

        if (stats) stats.end();

        previousTime = currentTime - (deltaTime % frameDuration);
    }
}


function loadHDRI(path, callback) {
    const name = path.split('/').pop();
    console.log("Loading HDRI:", path);
    AssetLoader.loadHDRI(name, path, (texture) => {
        if (!texture) {
            console.error('HDRI texture not loaded:', path);
            return;
        }

        // Full-res equirect as the sky (much sharper than the old 256px PMREM
        // cubemap); the renderer PMREMs scene.environment internally and caches it.
        texture.mapping = THREE.EquirectangularReflectionMapping;
        const oldSky = currentSkyTexture;
        scene.background = texture;
        scene.environment = texture;
        currentSkyTexture = texture;
        if (oldSky && oldSky !== texture) oldSky.dispose(); // frees GPU memory (leaked before)

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
        clouds.applyPreset(value.split('/').pop().replace('.hdr', ''));
    });

    hdrFolder.close();

    const skyFolder = gui.addFolder('Clouds');
    skyFolder.add(cloudParams, 'enabled').name('Enable').onChange(v => clouds.setUserEnabled(v));
    skyFolder.add(cloudParams, 'density', 0, 1).name('Density').onChange(v => clouds.setDensity(v));
    skyFolder.close();

    if (!isMobile()) {
        const flightFolder = gui.addFolder('Flight');
        flightFolder.add({ fly: () => flight.enter() }, 'fly').name('Take off (F)');
        flightFolder.add(flight, 'baseSpeed', 5, 400).name('Speed').listen();
        flightFolder.open();
    }

    const audioFolder = gui.addFolder('Audio');
    audioFolder.add(audioParams, 'volume', 0, 1).name('Volume').onChange(v => {
        if (sound) sound.setVolume(v * fadeProgress);
    });
    audioFolder.open();
    isMobile() ? gui.close() : gui.open();

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


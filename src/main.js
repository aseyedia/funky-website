// In main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { cubeToy, updateCube, cubeParams } from './components/cube.js';
import AssetLoader from './components/assetLoader.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';

let previousTime = 0;
const desiredFPS = 60;
const frameDuration = 1000 / desiredFPS;

// Initialize stats
const stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
document.body.appendChild(stats.dom);

const performanceStart = performance.now();
console.log('Script start time:', performanceStart);

let scene, camera, renderer, controls, transformControl, pmremGenerator, sound, water;

const textMeshes = [];
const params = { roughness: 0.1, metalness: 1.0, exposure: 1.0 };
let currentCube = null;

// Dancer state
const dancers = [];
let dancersLoading = false;
const DANCER_POSITIONS = [
    { x: -25, y: 0, z: 45 },
    { x:   0, y: 0, z: 55 },
    { x:  25, y: 0, z: 45 },
];

const danceAnimations = [
    "Breakdance_Pack/breakdance 1990.fbx",
    "Breakdance_Pack/breakdance 1990 (2).fbx",
    "Breakdance_Pack/breakdance 1990 (3).fbx",
    "Breakdance_Pack/breakdance uprock.fbx",
    "Breakdance_Pack/breakdance uprock (2).fbx",
    "Breakdance_Pack/breakdance uprock var 1 start.fbx",
    "Breakdance_Pack/breakdance uprock var 1.fbx",
    "Breakdance_Pack/breakdance uprock var 1 end.fbx",
    "Breakdance_Pack/breakdance uprock var 2.fbx",
    "Breakdance_Pack/breakdance uprock to ground.fbx",
    "Breakdance_Pack/breakdance uprock to ground (2).fbx",
    "Breakdance_Pack/breakdance footwork 1.fbx",
    "Breakdance_Pack/breakdance footwork 2.fbx",
    "Breakdance_Pack/breakdance footwork 3.fbx",
    "Breakdance_Pack/breakdance footwork to freeze.fbx",
    "Breakdance_Pack/breakdance freezes.fbx",
    "Breakdance_Pack/breakdance freeze var 1.fbx",
    "Breakdance_Pack/breakdance freeze var 2.fbx",
    "Breakdance_Pack/breakdance freeze var 3.fbx",
    "Breakdance_Pack/breakdance freeze var 4.fbx",
    "Breakdance_Pack/crossleg freeze.fbx",
    "Breakdance_Pack/flair.fbx",
    "Breakdance_Pack/flair (2).fbx",
    "Breakdance_Pack/flair (3).fbx",
    "Breakdance_Pack/breakdance swipes.fbx",
    "Breakdance_Pack/brooklyn uprock.fbx",
    "Breakdance_Pack/breakdance footwork to idle.fbx",
    "Breakdance_Pack/breakdance footwork to idle (2).fbx",
    "Breakdance_Pack/breakdance ready.fbx",
    "Breakdance_Pack/breakdance ready (2).fbx",
    "Breakdance_Pack/breakdance ready (3).fbx",
    "Breakdance_Pack/breakdance ending 1.fbx",
    "Breakdance_Pack/breakdance ending 2.fbx",
    "Breakdance_Pack/breakdance ending 3.fbx",
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

    pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    window.addEventListener('resize', onWindowResize, false);
    console.log("Initial setup complete");
    const loadingScreenTime = performance.now();
    console.log('Total Loading time:', loadingScreenTime - performanceStart);

    // Add key event listeners
    window.addEventListener('keydown', transformKey, false);
    window.addEventListener('keyup', onKeyUp, false);
}

function isMobile() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return (/android/i.test(userAgent) || /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream);
}

function setupCamera() {
    const fov = isMobile() ? 80 : 40;
    camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 1, 1000);
    camera.position.set(0, 30, 100);
}

function setupScene() {
    scene = new THREE.Scene();
}

function setupRenderer() {
    renderer = new THREE.WebGLRenderer({ antialias: true });
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

    audioLoader.load(`${import.meta.env.BASE_URL}fresh_and_clean.mp3`, buffer => {
        sound.setBuffer(buffer);
        sound.setLoop(true);
        sound.setVolume(0.5);
        if (onLoaded) onLoaded();
        if (listener.context.state === 'suspended') {
            document.addEventListener('click', resumeAudioContext);
            document.addEventListener('keydown', resumeAudioContext);
        } else {
            sound.play();
        }
    }, undefined, () => {
        if (onLoaded) onLoaded(); // hide status even on error
    });

    function resumeAudioContext() {
        listener.context.resume().then(() => {
            sound.play();
            document.removeEventListener('click', resumeAudioContext);
            document.removeEventListener('keydown', resumeAudioContext);
        });
    }
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
        const textMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: params.metalness,
            roughness: params.roughness,
            envMapIntensity: 1.0,
            clearcoat: 1.0,
            clearcoatRoughness: 0,
            ior: 1.5,
            reflectivity: 1.0,
            envMap: scene.environment
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
        // Start stats recording
        stats.begin();

        controls.update();

        if (water && water.material.uniforms['time']) {
            water.material.uniforms['time'].value += 1.0 / desiredFPS;
        }

        dancers.forEach(d => d.mixer.update(deltaTime / 1000));

        renderer.render(scene, camera);

        // End stats recording
        stats.end();

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

        const hdrRenderTarget = pmremGenerator.fromEquirectangular(texture);
        scene.environment = hdrRenderTarget.texture;
        scene.background = hdrRenderTarget.texture;

        scene.environment.needsUpdate = true;
        scene.background.needsUpdate = true;

        updateTextEnvMap(hdrRenderTarget.texture);

        scene.traverse(child => {
            if (child.isMesh) {
                child.material.needsUpdate = true;
            }
        });

        if (callback) callback();
    });
}


function updateTextEnvMap(envMap) {
    textMeshes.forEach(mesh => {
        mesh.material.envMap = envMap;
        mesh.material.needsUpdate = true;
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
    });

    hdrFolder.close();

    const audioFolder = gui.addFolder('Audio');
    audioFolder.add({ mute: false }, 'mute').name('Mute').onChange(value => {
        sound.setVolume(value ? 0 : 0.5);
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
    if (currentCube && ['w', 'e', 'r'].includes(event.key)) {
        attachTransformControls(currentCube, event.key);
    }
}

function onKeyUp(event) {
    if (['w', 'e', 'r'].includes(event.key)) {
        detachTransformControls();
    }
}


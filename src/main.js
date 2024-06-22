import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { AudioLoader, AudioListener, Audio } from 'three';

let camera, scene, renderer, controls, pmremGenerator, water, depthMap;
let sound;

const textMeshes = [];
let hdrPath = '';

const params = {
    roughness: 0.1,
    metalness: 1.0,
    exposure: 1.0
};

// Create a loading screen
const loadingScreen = document.createElement('div');
loadingScreen.id = 'loadingScreen';
loadingScreen.style.position = 'absolute';
loadingScreen.style.width = '100%';
loadingScreen.style.height = '100%';
loadingScreen.style.backgroundColor = '#000';
loadingScreen.style.color = '#fff';
loadingScreen.style.display = 'flex';
loadingScreen.style.alignItems = 'center';
loadingScreen.style.justifyContent = 'center';
loadingScreen.innerText = 'Loading...';
document.body.appendChild(loadingScreen);

init();
animate();

function init() {
    setupCamera();
    setupScene();
    setupRenderer();
    setupControls();
    setupAudio(); // Call setupAudio here
    pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    setupLights();
    loadInitialHDRI(() => {
        setupObjects(() => {
            initGUI();
            // Hide loading screen
            loadingScreen.style.display = 'none';
        });
    });
    window.addEventListener('resize', onWindowResize, false);
    console.log("Initial setup complete");
}

function setupCamera() {
    camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 1, 1000);
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
    renderer.outputEncoding = THREE.sRGBEncoding;
    document.body.appendChild(renderer.domElement);
}

function setupControls() {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.maxPolarAngle = Math.PI / 2.1;
}

function setupAudio() {
    // Create an AudioListener and add it to the camera
    const listener = new THREE.AudioListener();
    camera.add(listener);

    // Create a global audio source
    sound = new THREE.Audio(listener);

    // Load a sound and set it as the Audio object's buffer
    const audioLoader = new THREE.AudioLoader();
    audioLoader.load('/fresh_and_clean.mp3', function (buffer) {
        sound.setBuffer(buffer);
        sound.setLoop(true);
        sound.setVolume(0.5);
        sound.play();
    });
}

function setupLights() {
    const ambLight = new THREE.AmbientLight(0xffffff, 1.5); // Increased intensity
    scene.add(ambLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5); // Increased intensity
    dirLight.position.set(5, 10, 7.5);
    dirLight.castShadow = true;
    scene.add(dirLight);
}

function setupObjects(callback) {
    createText('Arta Seyedian', () => {
        createOcean();
        if (callback) callback();
    });
}

function createText(message, callback) {
    const loader = new FontLoader();
    loader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', (font) => {
        const textGeometry = new TextGeometry(message, {
            font: font,
            size: 10,
            depth: 2,
            curveSegments: 12,
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
            clearcoatRoughness: 0.1,
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
    });
}

function createOcean() {
    const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
    water = new Water(waterGeometry, {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals: new THREE.TextureLoader().load('https://threejs.org/examples/textures/waternormals.jpg', (texture) => {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        }),
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

function loadInitialHDRI(callback) {
    hdrPath = '/hdr/ocean_hdri/001/001.hdr';
    loadHDRI(() => {
        const depthDir = '/hdr/ocean_hdri/001';
        loadDepthMapFromDir(depthDir, callback);
    });
}

function loadHDRI(callback) {
    if (!hdrPath) return;

    console.log("Loading HDRI from path:", hdrPath);
    new RGBELoader()
        .setDataType(THREE.HalfFloatType) // Use HalfFloatType
        .load(hdrPath, (texture) => {
            console.log("HDRI parsed successfully", texture);
            const hdrRenderTarget = pmremGenerator.fromEquirectangular(texture);
            scene.environment = hdrRenderTarget.texture;
            scene.background = hdrRenderTarget.texture;
            updateTextEnvMap(hdrRenderTarget.texture);
            texture.dispose();
            pmremGenerator.dispose();
            console.log("HDRI environment applied");

            if (callback) callback();
        }, undefined, (error) => {
            console.error("Error loading HDRI:", error);
        });
}

function loadDepthMap(path, callback) {
    if (!path) return;

    new THREE.TextureLoader().load(path, (texture) => {
        depthMap = texture;
        depthMap.minFilter = THREE.LinearFilter;
        depthMap.magFilter = THREE.LinearFilter;
        depthMap.format = THREE.RGBAFormat; // Adjusted format to RGBAFormat
        console.log("Depth map loaded");
        if (callback) callback();
    }, undefined, (error) => {
        console.error("Error loading depth map:", error);
    });
}

function loadDepthMapFromDir(depthDir, callback) {
    const depthFile = 'depth.jpg';
    const filePath = `${depthDir}/${depthFile}`;
    console.log("Checking:", filePath);
    const req = new XMLHttpRequest();
    req.open('HEAD', filePath, false);
    req.send();

    if (req.status !== 404) {
        console.log("Depth map path:", filePath);
        loadDepthMap(filePath, callback);
    } else {
        console.log("No depth map found for directory:", depthDir);
        if (callback) callback(); // Ensure callback is called if no depth map is found
    }
}

function updateTextEnvMap(envMap) {
    textMeshes.forEach(mesh => {
        mesh.material.envMap = envMap;
        mesh.material.needsUpdate = true;
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    if (water && water.material.uniforms['time']) {
        water.material.uniforms['time'].value += 1.0 / 60.0;
    }
    renderer.render(scene, camera);
}

function initGUI() {
    const gui = new GUI();
    const textMaterial = textMeshes[0]?.material;
    if (textMaterial) {
        const textFolder = gui.addFolder('Text Material');
        textFolder.addColor({ color: 0xffffff }, 'color').onChange(value => textMaterial.color.set(value));
        textFolder.add(params, 'metalness', 0, 1).onChange(value => textMaterial.metalness = value).setValue(1.0);
        textFolder.add(params, 'roughness', 0, 1).onChange(value => textMaterial.roughness = value).setValue(0.1);
        textFolder.add(params, 'exposure', 0, 2).onChange(value => renderer.toneMappingExposure = value).setValue(1.0);
        textFolder.open();
    } else {
        console.error('Text material not found for GUI initialization.');
    }

    const hdrFolder = gui.addFolder('HDRI');
    const hdrOptions = {
        '001/001.hdr': '001/001.hdr',
        '002/002.hdr': '002/002.hdr',
        '003/003.hdr': '003/003.hdr',
        '004/004.hdr': '004/004.hdr',
        '005/005.hdr': '005/005.hdr',
        '006/006.hdr': '006/006.hdr',
        '007/007.hdr': '007/007.hdr',
        '008/008.hdr': '008/008.hdr'
    };

    hdrOptions['memorial.hdr'] = 'memorial.hdr';
    hdrFolder.add({ hdr: hdrOptions['001/001.hdr'] }, 'hdr', hdrOptions).name('Select HDRI').onChange(value => {
        hdrPath = value === 'memorial.hdr' ? `/hdr/${value}` : `/hdr/ocean_hdri/${value}`;
        loadHDRI(() => {
            // if memorial.hdr, no depth map
            if (value === 'memorial.hdr') return;
            const depthDir = `/hdr/ocean_hdri/${value.split('/')[0]}`;
            console.log("Depth directory:", depthDir);
            loadDepthMapFromDir(depthDir);
        });
    });
    hdrFolder.open();
}

       

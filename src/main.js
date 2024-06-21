import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

const hdrPath = './assets/hdr/royal_esplanade_1k.hdr';

let camera, scene, renderer, controls, pmremGenerator;
const textMeshes = [];

const params = {
    roughness: 0.1,
    metalness: 1.0,
    exposure: 1.0
};

init();
animate();

function init() {
    setupCamera();
    setupScene();
    setupRenderer();
    setupControls();
    pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    setupLights();
    loadHDRI(() => {
        createText('Arta Seyedian', () => {
            initGUI();
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

function setupLights() {
    const ambLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(5, 10, 7.5);
    dirLight.castShadow = true;
    scene.add(dirLight);
}

function createText(message, callback) {
    const loader = new FontLoader();
    loader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', (font) => {
        const textGeometry = new TextGeometry(message, {
            font: font,
            size: 10,
            height: 2,
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

function loadHDRI(callback) {
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
}

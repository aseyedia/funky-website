import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

// Important parameters
const skyScale = 450000;
const cameraFOV = 70;
const cameraPosition = new THREE.Vector3(0, 30, 100);
const ambientLightColor = 0xffffff;
const ambientLightIntensity = 0.5;
const spotLightColor = 0xffffff;
const spotLightIntensity = 1;
const spotLightPosition = new THREE.Vector3(2, 2, 2);
const textColor = 0xffffff;
const textMetalness = 0.1;
const textRoughness = 0.4;
const textEnvMapIntensity = 1.0;
const textClearcoat = 1.0;
const textClearcoatRoughness = 0.1;
const textRefractionRatio = 0.98;
const textIOR = 1.5;

let camera, scene, renderer, controls, water, sky, sun;
const textMeshes = [];

// Parameters object to manage sun position
const params = {
    elevation: 2,
    azimuth: 180
};

// Initialize the scene
init();
animate();

function init() {
    setupCamera();
    setupScene();
    setupRenderer();
    setupControls();
    setupLights();
    initSky(() => {
        setupObjects(() => {
            initGUI(); // Initialize GUI after objects are set up
        });
    });
    window.addEventListener('resize', onWindowResize, false);
    console.log("Initial setup complete");
}

// Set up the camera
function setupCamera() {
    camera = new THREE.PerspectiveCamera(cameraFOV, window.innerWidth / window.innerHeight, 0.01, 1000);
    camera.position.copy(cameraPosition);
}

// Set up the scene
function setupScene() {
    scene = new THREE.Scene();
}

// Set up the renderer
function setupRenderer() {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);
}

// Set up the controls for camera movement
function setupControls() {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.maxPolarAngle = Math.PI / 2; // Limit the vertical rotation of the camera
}

// Set up the lights in the scene
function setupLights() {
    const ambLight = new THREE.AmbientLight(ambientLightColor, ambientLightIntensity); // Ambient light
    scene.add(ambLight);

    const spotLight = new THREE.SpotLight(spotLightColor, spotLightIntensity); // Spotlight
    spotLight.position.copy(spotLightPosition);
    spotLight.castShadow = true;
    spotLight.angle = Math.PI / 6;
    spotLight.penumbra = 0.1;
    spotLight.decay = 2;
    spotLight.distance = 50;
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;
    spotLight.shadow.camera.near = 0.5;
    spotLight.shadow.camera.far = 50;
    scene.add(spotLight);
}

// Set up objects in the scene
function setupObjects(callback) {
    createText('Arta Seyedian', () => {
        createOcean();
        if (callback) callback();
    });
}

// Create 3D text
function createText(message, callback) {
    const loader = new FontLoader();
    loader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', (font) => {
        const fontOptions = {
            font: font,
            size: 10,
            height: 2,
            curveSegments: 12,
            bevelEnabled: true,
            bevelThickness: 1,
            bevelSize: 1,
            bevelOffset: 0,
            bevelSegments: 3
        };

        const textGeometry = new TextGeometry(message, fontOptions);
        textGeometry.computeBoundingBox();

        const centerOffsetX = -0.5 * (textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x);

        const textMaterial = new THREE.MeshPhysicalMaterial({
            color: textColor,
            metalness: textMetalness,
            roughness: textRoughness,
            envMapIntensity: textEnvMapIntensity,
            clearcoat: textClearcoat,
            clearcoatRoughness: textClearcoatRoughness,
            refractionRatio: textRefractionRatio,
            ior: textIOR,
            envMap: scene.environment
        });

        const textMesh = new THREE.Mesh(textGeometry, textMaterial);
        textMesh.position.set(centerOffsetX, 10, 0); // Set Y offset to +10
        textMesh.castShadow = true;
        scene.add(textMesh);
        textMeshes.push(textMesh);

        console.log("Text mesh created:", textMesh);

        if (callback) callback();
    });
}

// Create ocean using water object
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

// Initialize sky object and set as environment map
function initSky(callback) {
    sky = new Sky();
    sky.scale.setScalar(skyScale);
    sun = new THREE.Vector3();

    updateSunPosition();

    scene.add(sky);

    // Update scene environment and background with sky
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const skyRenderTarget = pmremGenerator.fromScene(sky);
    scene.environment = skyRenderTarget.texture;
    scene.background = skyRenderTarget.texture;

    console.log("Sky initialized and set as environment");

    if (callback) callback();
}

// Update the sun position
function updateSunPosition() {
    const phi = THREE.MathUtils.degToRad(90 - params.elevation);
    const theta = THREE.MathUtils.degToRad(params.azimuth);

    sun.setFromSphericalCoords(1, phi, theta);
    if (sky.material.uniforms) {
        sky.material.uniforms.sunPosition.value.copy(sun);
    }
    console.log(`Sun position updated: Azimuth=${params.azimuth}, Elevation=${params.elevation}`);
}

// Handle window resize events
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    water.material.uniforms['time'].value += 1.0 / 60.0; // Update water animation
    renderer.render(scene, camera);
}

// GUI for controlling materials and sun position
function initGUI() {
    const gui = new GUI();

    // Text Material Controls
    const textMaterial = textMeshes[0]?.material;
    if (textMaterial) {
        const textFolder = gui.addFolder('Text Material');
        textFolder.addColor({ color: textColor }, 'color').onChange(value => textMaterial.color.set(value));
        textFolder.add(textMaterial, 'metalness', 0, 1);
        textFolder.add(textMaterial, 'roughness', 0, 1);
        textFolder.add(textMaterial, 'envMapIntensity', 0, 3);
        textFolder.add(textMaterial, 'clearcoat', 0, 1);
        textFolder.add(textMaterial, 'clearcoatRoughness', 0, 1);
        textFolder.add(textMaterial, 'refractionRatio', 0.5, 1);
        textFolder.add(textMaterial, 'ior', 1, 2.333);
        textFolder.open();
    } else {
        console.error('Text material not found for GUI initialization.');
    }

    // Sun Controls
    const sunFolder = gui.addFolder('Sun');
    sunFolder.add(params, 'elevation', 0, 90).onChange(updateSunPosition);
    sunFolder.add(params, 'azimuth', -180, 180).onChange(updateSunPosition);
    sunFolder.open();
}

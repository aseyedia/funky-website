import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

const hdrPath = './assets/hdr/royal_esplanade_1k.hdr';

let camera, scene, renderer, controls, water, sky, sun, pmremGenerator;
const textMeshes = [];

const params = {
    elevation: 2,
    azimuth: 180,
    environment: 'Sky'
};

init();
animate();

function init() {
    setupCamera();
    setupScene();
    setupRenderer();
    setupControls();
    setupLights();
    pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    checkHDRFileAccess();
    initSky(() => {
        setupObjects(() => {
            initGUI();
        });
    });
    window.addEventListener('resize', onWindowResize, false);
    console.log("Initial setup complete");
}

function setupCamera() {
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 1000);
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
    renderer.toneMappingExposure = 0.6;
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

    const spotLight = new THREE.SpotLight(0xffffff, 1);
    spotLight.position.set(2, 2, 2);
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
            metalness: 0.1,
            roughness: 0.4,
            envMapIntensity: 1.0,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1,
            ior: 1.5,
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

function initSky(callback) {
    sky = new Sky();
    sky.scale.setScalar(450000);
    sun = new THREE.Vector3();
    updateSunPosition();
    scene.add(sky);
    const skyRenderTarget = pmremGenerator.fromScene(sky);
    scene.environment = skyRenderTarget.texture;
    scene.background = skyRenderTarget.texture;
    console.log("Sky initialized and set as environment");
    if (callback) callback();
}

function updateSunPosition() {
    const phi = THREE.MathUtils.degToRad(90 - params.elevation);
    const theta = THREE.MathUtils.degToRad(params.azimuth);
    sun.setFromSphericalCoords(1, phi, theta);
    if (sky.material.uniforms) {
        sky.material.uniforms.sunPosition.value.copy(sun);
    }
    console.log(`Sun position updated: Azimuth=${params.azimuth}, Elevation=${params.elevation}`);
}

function loadHDRI() {
    console.log("Loading HDRI from path:", hdrPath);
    fetch(hdrPath)
        .then(response => response.arrayBuffer())
        .then(buffer => {
            console.log("HDRI file loaded, buffer length:", buffer.byteLength);
            new RGBELoader()
                .setDataType(THREE.HalfFloatType)
                .parse(buffer, function (texture) {
                    console.log("HDRI parsed successfully", texture);
                    const hdrRenderTarget = pmremGenerator.fromEquirectangular(texture);
                    scene.environment = hdrRenderTarget.texture;
                    scene.background = hdrRenderTarget.texture;
                    textMeshes.forEach(mesh => {
                        mesh.material.envMap = hdrRenderTarget.texture;
                        mesh.material.needsUpdate = true;
                    });
                    texture.dispose();
                    pmremGenerator.dispose();
                    console.log("HDRI environment applied");
                }, function (error) {
                    console.error("Error parsing HDRI:", error);
                });
        })
        .catch(error => {
            console.error("Error loading HDRI file:", error);
        });
}

function checkHDRFileAccess() {
    fetch(hdrPath)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok ' + response.statusText);
            }
            return response.blob();
        })
        .then(blob => {
            console.log("HDRI file is accessible:", blob);
            loadHDRI();
        })
        .catch(error => {
            console.error("Error checking HDRI file access:", error);
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
        textFolder.add(textMaterial, 'metalness', 0, 1);
        textFolder.add(textMaterial, 'roughness', 0, 1);
        textFolder.add(textMaterial, 'envMapIntensity', 0, 3);
        textFolder.add(textMaterial, 'clearcoat', 0, 1);
        textFolder.add(textMaterial, 'clearcoatRoughness', 0, 1);
        textFolder.add(textMaterial, 'ior', 1, 2.333);
        textFolder.open();
    } else {
        console.error('Text material not found for GUI initialization.');
    }
    const sunFolder = gui.addFolder('Sun');
    sunFolder.add(params, 'elevation', 0, 90).onChange(updateSunPosition);
    sunFolder.add(params, 'azimuth', -180, 180).onChange(updateSunPosition);
    sunFolder.open();
    const environmentFolder = gui.addFolder('Environment');
    environmentFolder.add(params, 'environment', ['Sky', 'HDRI']).onChange(value => {
        if (value === 'Sky') {
            initSky();
        } else {
            loadHDRI();
        }
    });
    environmentFolder.open();
}

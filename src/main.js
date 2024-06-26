const performanceStart = performance.now();
console.log('Script start time:', performanceStart);

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

let camera, scene, renderer, controls, pmremGenerator, water, depthMap;
let sound, cube;
let remove = false;

let currentHDRTexture = null;
let currentHDRRenderTarget = null;

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

let isFirstCall = true;
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
    loadInitialHDRI(() => {
        setupObjects(() => {
            // cubeToy();
            initGUI();
            // Hide loading screen
            loadingScreen.style.display = 'none';
        });
    });
    window.addEventListener('resize', onWindowResize, false);
    console.log("Initial setup complete");
    const loadingScreenTime = performance.now();
    console.log('Total Loading time:', loadingScreenTime - performanceStart);

}

function isMobile() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return (/android/i.test(userAgent) || /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream);
}

function setupCamera() {
    const fov = isMobile() ? 80 : 40; // Increase FOV for mobile devices
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
    renderer.outputEncoding = THREE.sRGBEncoding;
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
function setupAudio() {
    const listener = new THREE.AudioListener();
    camera.add(listener);

    sound = new THREE.Audio(listener);

    const audioLoader = new THREE.AudioLoader();

    // Load a sound and set it as the Audio object's buffer
    audioLoader.load('/fresh_and_clean.mp3', function (buffer) {
        sound.setBuffer(buffer);
        sound.setLoop(true);
        sound.setVolume(0.5);
        // Play the sound if the context is already resumed
        if (listener.context.state === 'suspended') {
            document.addEventListener('click', resumeAudioContext);
            document.addEventListener('keydown', resumeAudioContext);
        } else {
            sound.play();
        }
    });

    function resumeAudioContext() {
        listener.context.resume().then(() => {
            sound.play();
            document.removeEventListener('click', resumeAudioContext);
            document.removeEventListener('keydown', resumeAudioContext);
        });
    }
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
        // log performance time
        const endTime = performance.now();
        console.log("Operation took", endTime - performanceStart, "milliseconds");
        if (callback) callback();
    });
}



function cubeToy(remove = false) {
    if (remove) {
        if (cube) {
            scene.remove(cube);
            cube = null;
        }
        return;
    }

    const geometry = new THREE.BoxGeometry(cubeParams.size, cubeParams.size, cubeParams.size);
    const material = new THREE.MeshPhysicalMaterial({
        color: cubeParams.color,
        transmission: cubeParams.transmission,
        opacity: cubeParams.opacity,
        metalness: cubeParams.metalness,
        roughness: cubeParams.roughness,
        ior: cubeParams.ior,
        thickness: cubeParams.thickness,
        specularIntensity: cubeParams.specularIntensity,
        specularColor: cubeParams.specularColor,
        envMapIntensity: cubeParams.envMapIntensity,
        clearcoat: cubeParams.clearcoat,
        clearcoatRoughness: cubeParams.clearcoatRoughness,
        clearcoatNormalScale: cubeParams.clearcoatNormalScale,
        clearcoatNormalMap: cubeParams.clearcoatNormalMap,
        clearcoatRoughnessMap: cubeParams.clearcoatRoughnessMap,
        reflectivity: cubeParams.reflectivity,
        iridescence: cubeParams.iridescence,
        iridescenceIOR: cubeParams.iridescenceIOR,
        iridescenceThicknessRange: cubeParams.iridescenceThicknessRange,
        iridescenceThicknessMap: cubeParams.iridescenceThicknessMap,
        sheen: cubeParams.sheen,
        sheenRoughness: cubeParams.sheenRoughness,
        sheenColor: cubeParams.sheenColor,
        sheenColorMap: cubeParams.sheenColorMap,
        sheenRoughnessMap: cubeParams.sheenRoughnessMap,
        transmissionMap: cubeParams.transmissionMap,
        attenuationColor: cubeParams.attenuationColor,
        attenuationDistance: cubeParams.attenuationDistance,
        dispersion: cubeParams.dispersion,
        anisotropy: cubeParams.anisotropy,
        anisotropyMap: cubeParams.anisotropyMap,
        anisotropyRotation: cubeParams.anisotropyRotation
    });

    cube = new THREE.Mesh(geometry, material);
    cube.position.set(cubeParams.posX, cubeParams.posY, cubeParams.posZ);
    scene.add(cube);
}

function updateCube() {
    if (cube) {
        scene.remove(cube);
    }
    cubeToy();
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

            // Dispose of the previous HDR texture and render target
            if (currentHDRTexture) {
                currentHDRTexture.dispose();
            }
            if (currentHDRRenderTarget) {
                currentHDRRenderTarget.texture.dispose();
                currentHDRRenderTarget.dispose();
            }

            const hdrRenderTarget = pmremGenerator.fromEquirectangular(texture);
            scene.environment = hdrRenderTarget.texture;
            scene.background = hdrRenderTarget.texture;
            updateTextEnvMap(hdrRenderTarget.texture);

            // Keep track of the current HDR texture and render target
            currentHDRTexture = texture;
            currentHDRRenderTarget = hdrRenderTarget;

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
    // log performance time
    // if first function call, log time
    if (isFirstCall) {
        const performanceAnimate = performance.now();
        //print performance time
        console.log('Time to animate():', performanceAnimate - performanceStart);
        isFirstCall = false;
    }
}

const cubeParams = {
    enabled: false,
    size: 50,
    posX: 0,
    posY: -10,
    posZ: 0,
    color: 0xffffff,
    transmission: 1,
    opacity: 1,
    metalness: 0,
    roughness: 0,
    ior: 1.5,
    thickness: 100,
    specularIntensity: 1,
    specularColor: 0xffffff,
    envMapIntensity: 1,
    clearcoat: 0,
    clearcoatRoughness: 0,
    clearcoatNormalScale: 1,
    clearcoatNormalMap: null,
    clearcoatRoughnessMap: null,
    reflectivity: 0.5,
    iridescence: 0,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [100, 400],
    iridescenceThicknessMap: null,
    sheen: 0,
    sheenRoughness: 1,
    sheenColor: 0x000000,
    sheenColorMap: null,
    sheenRoughnessMap: null,
    transmissionMap: null,
    attenuationColor: 0xffffff,
    attenuationDistance: Infinity,
    dispersion: 0,
    anisotropy: 0,
    anisotropyMap: null,
    anisotropyRotation: 0,
    defines: {}
};

function initGUI() {
    const gui = new GUI();
    const textMaterial = textMeshes[0]?.material;
    if (textMaterial) {
        const textFolder = gui.addFolder('Text Material');
        textFolder.addColor({ color: 0xffffff }, 'color').onChange(value => textMaterial.color.set(value));
        // textFolder.add(params, 'metalness', 0, 1).onChange(value => textMaterial.metalness = value).setValue(1.0);
        // textFolder.add(params, 'roughness', 0, 1).onChange(value => textMaterial.roughness = value).setValue(0.1);
        // textFolder.add(params, 'exposure', 0, 2).onChange(value => renderer.toneMappingExposure = value).setValue(1.0);
        textFolder.close();
    } else {
        console.error('Text material not found for GUI initialization.');
    }

    const hdrFolder = gui.addFolder('HDRI');
    const hdrOptions = {
        'Day': '001/001.hdr',
        'Dusk': '002/002.hdr',
        'Stormy': '003/003.hdr',
        'Overcast': '004/004.hdr',
        'Pink Sunset': '005/005.hdr',
        'Full Moon': '006/006.hdr',
        'Cloudy Sunset': '007/007.hdr',
        'Another World': '008/008.hdr'
    };

    hdrOptions['Memorial Church'] = 'memorial.hdr';
    hdrFolder.add({ hdr: hdrOptions['Day'] }, 'hdr', hdrOptions).name('Select HDRI').onChange(value => {
        hdrPath = value === 'memorial.hdr' ? `/hdr/${value}` : `/hdr/ocean_hdri/${value}`;
        loadHDRI(() => {
            // if memorial.hdr, no depth map
            if (value === 'memorial.hdr') return;
            const depthDir = `/hdr/ocean_hdri/${value.split('/')[0]}`;
            console.log("Depth directory:", depthDir);
            loadDepthMapFromDir(depthDir);
        });
    });

    hdrFolder.close();

    // add an option to mute audio
    const audioFolder = gui.addFolder('Audio');
    audioFolder.add({ mute: false }, 'mute').name('Mute').onChange(value => {
        sound.setVolume(value ? 0 : 0.5);
    });
    audioFolder.open();
    isMobile() ? gui.close() : gui.open();
    
    const cubeFolder = gui.addFolder('Cube Toy');
    cubeFolder.add(cubeParams, 'enabled').name('Enable').onChange(value => {
        if (value) cubeToy(false);
        else cubeToy(remove = true);
    });
    cubeFolder.addColor(cubeParams, 'color').name('Color').onChange(updateCube);
    cubeFolder.add(cubeParams, 'transmission', 0, 1).name('Transmission').onChange(updateCube);
    cubeFolder.add(cubeParams, 'opacity', 0, 1).name('Opacity').onChange(updateCube);
    cubeFolder.add(cubeParams, 'metalness', 0, 1).name('Metalness').onChange(updateCube);
    cubeFolder.add(cubeParams, 'roughness', 0, 1).name('Roughness').onChange(updateCube);
    cubeFolder.add(cubeParams, 'ior', 1, 2.333).name('IOR').onChange(updateCube);
    cubeFolder.add(cubeParams, 'thickness', 0, 100).name('Thickness').onChange(updateCube);
    cubeFolder.add(cubeParams, 'specularIntensity', 0, 1).name('Specular Intensity').onChange(updateCube);
    cubeFolder.addColor(cubeParams, 'specularColor').name('Specular Color').onChange(updateCube);
    cubeFolder.add(cubeParams, 'envMapIntensity', 0, 10).name('Env Map Intensity').onChange(updateCube);
    cubeFolder.add(cubeParams, 'clearcoat', 0, 1).name('Clearcoat').onChange(updateCube);
    cubeFolder.add(cubeParams, 'clearcoatRoughness', 0, 1).name('Clearcoat Roughness').onChange(updateCube);
    cubeFolder.add(cubeParams, 'clearcoatNormalScale', 0, 1).name('Clearcoat Normal Scale').onChange(updateCube);
    // cubeFolder.add(cubeParams, 'clearcoatNormalMap').name('Clearcoat Normal Map').onChange(updateCube);
    // cubeFolder.add(cubeParams, 'clearcoatRoughnessMap').name('Clearcoat Roughness Map').onChange(updateCube);
    cubeFolder.add(cubeParams, 'reflectivity', 0, 1).name('Reflectivity').onChange(updateCube);
    cubeFolder.add(cubeParams, 'iridescence', 0, 1).name('Iridescence').onChange(updateCube);
    cubeFolder.add(cubeParams, 'iridescenceIOR', 1, 2.333).name('Iridescence IOR').onChange(updateCube);
    cubeFolder.add(cubeParams, 'iridescenceThicknessRange', [0, 1000]).name('Iridescence Thickness Range').onChange(updateCube);
    //cubeFolder.add(cubeParams, 'iridescenceThicknessMap').name('Iridescence Thickness Map').onChange(updateCube);
    cubeFolder.add(cubeParams, 'sheen', 0, 1).name('Sheen').onChange(updateCube);
    cubeFolder.add(cubeParams, 'sheenRoughness', 0, 1).name('Sheen Roughness').onChange(updateCube);
    cubeFolder.addColor(cubeParams, 'sheenColor').name('Sheen Color').onChange(updateCube);
    //cubeFolder.add(cubeParams, 'sheenColorMap').name('Sheen Color Map').onChange(updateCube);
    // cubeFolder.add(cubeParams, 'sheenRoughnessMap').name('Sheen Roughness Map').onChange(updateCube);
    //cubeFolder.add(cubeParams, 'transmissionMap').name('Transmission Map').onChange(updateCube);
    cubeFolder.addColor(cubeParams, 'attenuationColor').name('Attenuation Color').onChange(updateCube);
    cubeFolder.add(cubeParams, 'attenuationDistance', 0, Infinity).name('Attenuation Distance').onChange(updateCube);
    cubeFolder.add(cubeParams, 'dispersion', 0, 1).name('Dispersion').onChange(updateCube);
    cubeFolder.add(cubeParams, 'anisotropy', 0, 1).name('Anisotropy').onChange(updateCube);
    //cubeFolder.add(cubeParams, 'anisotropyMap').name('Anisotropy Map').onChange(updateCube);
    cubeFolder.add(cubeParams, 'anisotropyRotation', 0, Math.PI * 2).name('Anisotropy Rotation').onChange(updateCube);
    cubeFolder.close();
    
}

// Lazy load non-essential scripts
document.addEventListener('DOMContentLoaded', () => {
    setupAudio();
});

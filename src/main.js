import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { cubeToy, updateCube, cubeParams } from '/root/funky-website/src/components/cube.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

const performanceStart = performance.now();
console.log('Script start time:', performanceStart);

let scene, camera, renderer, controls, transformControl, pmremGenerator, sound, water;
let hdrPath = '/hdr/ocean_hdri/001/001.hdr';
let depthDir = '/hdr/ocean_hdri/001';
let depthMap;
let currentHDRTexture = null;
let currentHDRRenderTarget = null;

const cloudParams = { enabled: false };
const textMeshes = [];
const params = { roughness: 0.1, metalness: 1.0, exposure: 1.0 };
let isFirstCall = true;

init();
animate();

function init() {
    setupCamera();
    setupScene();
    setupRenderer();
    setupControls();
    setupLights();

    loadInitialHDRI(() => {
        setupObjects(() => {
            createClouds();
            initGUI();
            document.getElementById('loadingScreen').style.display = 'none';
        });
    });

    transformControl = new TransformControls(camera, renderer.domElement);
    scene.add(transformControl);
    transformControl.addEventListener('dragging-changed', event => controls.enabled = !event.value);

    pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

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

function setupLights() {
    const ambLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
    dirLight.position.set(5, 10, 7.5);
    dirLight.castShadow = true;
    scene.add(dirLight);
}

function setupAudio() {
    const listener = new THREE.AudioListener();
    camera.add(listener);

    sound = new THREE.Audio(listener);
    const audioLoader = new THREE.AudioLoader();

    audioLoader.load('/fresh_and_clean.mp3', buffer => {
        sound.setBuffer(buffer);
        sound.setLoop(true);
        sound.setVolume(0.5);
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

function setupObjects(callback) {
    createText('Arta Seyedian', () => {
        createOcean();
        if (callback) callback();
    });
}

function createText(message, callback) {
    const loader = new FontLoader();
    loader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', font => {
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
        const endTime = performance.now();
        console.log("Operation took", endTime - performanceStart, "milliseconds");
        if (callback) callback();
    });
}

let clouds = [];

function createClouds() {
    const geo = new THREE.BufferGeometry();

    const tuft1 = new THREE.SphereGeometry(1.5, 7, 8);
    tuft1.translate(-2, 0, 0);

    const tuft2 = new THREE.SphereGeometry(1.5, 7, 8);
    tuft2.translate(2, 0, 0);

    const tuft3 = new THREE.SphereGeometry(2.0, 7, 8);
    tuft3.translate(0, 0, 0);

    const combinedVertices = new Float32Array([
        ...tuft1.attributes.position.array,
        ...tuft2.attributes.position.array,
        ...tuft3.attributes.position.array
    ]);

    geo.setAttribute('position', new THREE.BufferAttribute(combinedVertices, 3));
    geo.computeVertexNormals();

    jitter(geo, 0.2);
    chopBottom(geo, -0.5);

    const material = new THREE.MeshLambertMaterial({
        color: 'white',
        flatShading: true,
    });

    const cloud = new THREE.Mesh(geo, material);
    cloud.position.set(0, 20, 0);
    scene.add(cloud);

    const light2 = new THREE.DirectionalLight(0xff5566, 0.7);
    light2.position.set(-3, -1, 0).normalize();
    scene.add(light2);
}

function jitter(geo, per) {
    const position = geo.attributes.position;
    const count = position.count;

    for (let i = 0; i < count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);

        position.setXYZ(
            i,
            x + (Math.random() * per * 2 - per),
            y + (Math.random() * per * 2 - per),
            z + (Math.random() * per * 2 - per)
        );
    }
    position.needsUpdate = true;
}

function chopBottom(geo, bottom) {
    const position = geo.attributes.position;
    const count = position.count;

    for (let i = 0; i < count; i++) {
        const y = position.getY(i);
        if (y < bottom) {
            position.setY(i, bottom);
        }
    }
    position.needsUpdate = true;
}

function removeClouds() {
    clouds.forEach(cloud => scene.remove(cloud));
    clouds = [];
}

function createOcean() {
    const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
    water = new Water(waterGeometry, {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals: new THREE.TextureLoader().load('https://threejs.org/examples/textures/waternormals.jpg', texture => {
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

function attachTransformControls(cube) {
    if (cube) {
        transformControl.attach(cube);
    }
}

function detachTransformControls() {
    transformControl.detach();
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
    if (isFirstCall) {
        const performanceAnimate = performance.now();
        console.log('Time to animate():', performanceAnimate - performanceStart);
        isFirstCall = false;
    }
}

function loadInitialHDRI(callback) {
    loadHDRI(() => {
        loadDepthMapFromDir(depthDir, callback);
    });
}

function loadHDRI(callback) {
    if (!hdrPath) return;

    console.log("Loading HDRI from path:", hdrPath);
    new RGBELoader()
        .setDataType(THREE.HalfFloatType)
        .load(hdrPath, texture => {
            console.log("HDRI parsed successfully", texture);

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

            scene.environment.needsUpdate = true;
            scene.background.needsUpdate = true;

            updateTextEnvMap(hdrRenderTarget.texture);

            currentHDRTexture = texture;
            currentHDRRenderTarget = hdrRenderTarget;

            console.log("HDRI environment applied");

            scene.traverse(child => {
                if (child.isMesh) {
                    child.material.needsUpdate = true;
                }
            });

            if (callback) callback();
        }, undefined, error => {
            console.error("Error loading HDRI:", error);
        });
}

function loadDepthMap(path, callback) {
    if (!path) return;

    new THREE.TextureLoader().load(path, texture => {
        depthMap = texture;
        depthMap.minFilter = THREE.LinearFilter;
        depthMap.magFilter = THREE.LinearFilter;
        depthMap.format = THREE.RGBAFormat;
        console.log("Depth map loaded");
        if (callback) callback();
    }, undefined, error => {
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
        if (callback) callback();
    }
}

function updateTextEnvMap(envMap) {
    textMeshes.forEach(mesh => {
        mesh.material.envMap = envMap;
        mesh.material.needsUpdate = true;
    });
}

function addSettings(cubeFolder) {

    // if cubefolder has more than one controller, show them
    if (cubeFolder.controllers.length > 1) {
        // log showing old controllers
        console.log("Showing old controllers");
        cubeFolder.controllers.forEach(controller => {
            controller.show(true);
        });
    } else {
        // log adding cube folder options
        console.log("Adding cube folder options");
        cubeFolder.add(cubeParams, 'size', 10, 100).name('Size').onChange(() => updateCube(scene, cubeParams));
        cubeFolder.addColor(cubeParams, 'color').name('Color').onChange(() => updateCube(scene, cubeParams));
        cubeFolder.add(cubeParams, 'transmission', 0, 1).name('Transmission').onChange(() => updateCube(scene, cubeParams));
        cubeFolder.add(cubeParams, 'opacity', 0, 1).name('Opacity').onChange(() => updateCube(scene, cubeParams));
        cubeFolder.add(cubeParams, 'metalness', 0, 1).name('Metalness').onChange(() => updateCube(scene, cubeParams));
        cubeFolder.add(cubeParams, 'roughness', 0, 1).name('Roughness').onChange(() => updateCube(scene, cubeParams));
        cubeFolder.add(cubeParams, 'ior', 1, 2.333).name('IOR').onChange(() => updateCube(scene, cubeParams));
        cubeFolder.add(cubeParams, 'thickness', 0, 100).name('Thickness').onChange(() => updateCube(scene, cubeParams));
        cubeFolder.add(cubeParams, 'specularIntensity', 0, 1).name('Specular Intensity').onChange(() => updateCube(scene, cubeParams));
        cubeFolder.addColor(cubeParams, 'specularColor').name('Specular Color').onChange(() => updateCube(scene, cubeParams));
        // cubeFolder.add(cubeParams, 'envMapIntensity', 0, 10).name('Env Map Intensity').onChange(() => updateCube(scene, cubeParams));
        // cubeFolder.add(cubeParams, 'clearcoat', 0, 1).name('Clearcoat').onChange(() => updateCube(scene, cubeParams));
        // cubeFolder.add(cubeParams, 'clearcoatRoughness', 0, 1).name('Clearcoat Roughness').onChange(() => updateCube(scene, cubeParams));
        // cubeFolder.add(cubeParams, 'reflectivity', 0, 1).name('Reflectivity').onChange(() => updateCube(scene, cubeParams));
        // cubeFolder.add(cubeParams, 'iridescence', 0, 1).name('Iridescence').onChange(() => updateCube(scene, cubeParams));
        // cubeFolder.add(cubeParams, 'iridescenceIOR', 1, 2.333).name('Iridescence IOR').onChange(() => updateCube(scene, cubeParams));
        // cubeFolder.add(cubeParams, 'sheen', 0, 1).name('Sheen').onChange(() => updateCube(scene, cubeParams));
        // cubeFolder.add(cubeParams, 'sheenRoughness', 0, 1).name('Sheen Roughness').onChange(() => updateCube(scene, cubeParams));
        // cubeFolder.addColor(cubeParams, 'sheenColor').name('Sheen Color').onChange(() => updateCube(scene, cubeParams));
        // cubeFolder.addColor(cubeParams, 'attenuationColor').name('Attenuation Color').onChange(() => updateCube(scene, cubeParams));
        // cubeFolder.add(cubeParams, 'attenuationDistance', 0, 1000).name('Attenuation Distance').onChange(() => updateCube(scene, cubeParams));
        cubeFolder.add(cubeParams, 'dispersion', 0, 1).name('Dispersion').onChange(() => updateCube(scene, cubeParams));
        // cubeFolder.add(cubeParams, 'anisotropy', 0, 1).name('Anisotropy').onChange(() => updateCube(scene, cubeParams));
        // cubeFolder.add(cubeParams, 'anisotropyRotation', 0, Math.PI * 2).name('Anisotropy Rotation').onChange(() => updateCube(scene, cubeParams));
    }
}

function removeSettings(cubeFolder) {
    // Log all controllers before hiding them
    console.log("Controllers before hiding:", cubeFolder.controllers);

    // Iterate over the controllers and hide them, starting from the second one
    const controllersToRemove = cubeFolder.controllers.slice(1);
    // Log controllersToRemove
    console.log("Controllers to be hidden:", controllersToRemove);
    controllersToRemove.forEach(controller => {
        controller.show(false)
    });
}

function initGUI() {
    const gui = new GUI();
    const textMaterial = textMeshes[0]?.material;
    if (textMaterial) {
        const textFolder = gui.addFolder('Text Material');
        textFolder.addColor({ color: 0xffffff }, 'color').onChange(value => textMaterial.color.set(value));
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
        'Another World': '008/008.hdr',
        'Memorial Church': 'memorial.hdr'
    };

    hdrFolder.add({ hdr: hdrOptions['Day'] }, 'hdr', hdrOptions).name('Select HDRI').onChange(value => {
        hdrPath = value === 'memorial.hdr' ? `/hdr/${value}` : `/hdr/ocean_hdri/${value}`;
        console.log("HDR Path changed to:", hdrPath);
        loadHDRI(() => {
            if (value === 'memorial.hdr') return;
            const depthDir = `/hdr/ocean_hdri/${value.split('/')[0]}`;
            console.log("Depth directory:", depthDir);
            loadDepthMapFromDir(depthDir);
        });
    });

    hdrFolder.close();

    const audioFolder = gui.addFolder('Audio');
    audioFolder.add({ mute: false }, 'mute').name('Mute').onChange(value => {
        sound.setVolume(value ? 0 : 0.5);
    });
    audioFolder.open();
    isMobile() ? gui.close() : gui.open();

    const cubeFolder = gui.addFolder('Cube');
    cubeParams.enabled = false;
    cubeFolder.add(cubeParams, 'enabled').name('Enable').onChange(value => {
        if (value) {
            attachTransformControls(cubeToy(scene, cubeParams));
            addSettings(cubeFolder);
        } else {
            cubeToy(scene, cubeParams, true);
            detachTransformControls();
            removeSettings(cubeFolder);
        }
    });

    cubeFolder.close();

    const cloudFolder = gui.addFolder('Clouds');
    cloudFolder.add(cloudParams, 'enabled').name('Enable Clouds').onChange(value => {
        if (value) createClouds();
        else removeClouds();
    });
    cloudFolder.close();
}

document.addEventListener('DOMContentLoaded', () => {
    setupAudio();
});

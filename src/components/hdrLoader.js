import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';


let hdrPath;
let depthMap;
let textMeshes = []; // This should be populated elsewhere in your main code
let pmremGenerator; // This should be initialized in your main code
let scene; // This should be initialized in your main code

let currentHDRTexture = null;
let currentHDRRenderTarget = null;

let renderer;

export function initializeHDRLoader(pScene, pPmremGenerator, pTextMeshes, pRenderer) {
    scene = pScene;
    pmremGenerator = pPmremGenerator;
    textMeshes = pTextMeshes;
    renderer = pRenderer; // Assign the renderer
}


export function loadInitialHDRI(callback) {
    hdrPath = '/hdr/ocean_hdri/001/001.hdr';
    loadHDRI(() => {
        const depthDir = '/hdr/ocean_hdri/001';
        loadDepthMapFromDir(depthDir, callback);
    });
}

export function loadHDRI(callback) {
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

export function loadDepthMap(path, callback) {
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

export function loadDepthMapFromDir(depthDir, callback) {
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

export function updateTextEnvMap(envMap) {
    textMeshes.forEach(mesh => {
        mesh.material.envMap = envMap;
        mesh.material.needsUpdate = true;
    });
}
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';


let cube;

export const cubeParams = {
    enabled: false,
    size: 50,
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
    reflectivity: 0.5,
    iridescence: 0,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [100, 400],
    sheen: 0,
    sheenRoughness: 1,
    sheenColor: 0x000000,
    dispersion: 0,
    anisotropy: 0,
    anisotropyRotation: 0,
    attenuationColor: 0xffffff,
    attenuationDistance: Infinity,
    posX: 0,
    posY: 0,
    posZ: 0
};

export function cubeToy(scene, cubeParams, remove = false) {
    if (remove) {
        if (cube) {
            scene.remove(cube);
            cube.geometry.dispose();
            cube.material.dispose();
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
        reflectivity: cubeParams.reflectivity,
        iridescence: cubeParams.iridescence,
        iridescenceIOR: cubeParams.iridescenceIOR,
        iridescenceThicknessRange: cubeParams.iridescenceThicknessRange,
        sheen: cubeParams.sheen,
        sheenRoughness: cubeParams.sheenRoughness,
        sheenColor: cubeParams.sheenColor,
        dispersion: cubeParams.dispersion,
        anisotropy: cubeParams.anisotropy,
        anisotropyRotation: cubeParams.anisotropyRotation,
        attenuationColor: cubeParams.attenuationColor,
        attenuationDistance: cubeParams.attenuationDistance
    });

    cube = new THREE.Mesh(geometry, material);
    cube.position.set(cubeParams.posX, cubeParams.posY, cubeParams.posZ);
    scene.add(cube);

    return cube;
};

export function updateCube(scene, cubeParams) {
    if (cube) {
        scene.remove(cube);
        cube.geometry.dispose();
        cube.material.dispose();
    }
    cubeToy(scene, cubeParams);
}

// export { cubeToy, updateCube, cubeParams };

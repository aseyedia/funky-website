import * as THREE from 'three';
// import { objectDirection } from 'three/examples/jsm/nodes/Nodes.js';

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
    dispersion: 1,
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
        // log removing cube to console
        console.log('Remove == True');
        if (cube) {
            console.log('Setting cube visible to false')
            cube.visible = false;
            // scene.remove(cube);
            // cube.geometry.dispose();
            // cube.material.dispose();
            // cube = null;
        }
        return;
    }
    if (cube == true && remove == false) {
        if (cube.visible === false) {
            cube.visible = true;
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
    if (!cube) {
        // If cube doesn't exist, create it.
        cube = cubeToy(scene, cubeParams);
    } else {
        // Update cube material properties directly.
        cube.material.color.set(cubeParams.color);
        cube.material.transmission = cubeParams.transmission;
        cube.material.opacity = cubeParams.opacity;
        cube.material.metalness = cubeParams.metalness;
        cube.material.roughness = cubeParams.roughness;
        cube.material.ior = cubeParams.ior;
        cube.material.thickness = cubeParams.thickness;
        cube.material.specularIntensity = cubeParams.specularIntensity;
        cube.material.specularColor.set(cubeParams.specularColor);
        cube.material.reflectivity = cubeParams.reflectivity;
        // Add or update any other properties as needed.
        
        // Update cube geometry if size has changed.
        if (cube.geometry.parameters.width !== cubeParams.size) {
            cube.geometry.dispose(); // Dispose of the old geometry.
            cube.geometry = new THREE.BoxGeometry(cubeParams.size, cubeParams.size, cubeParams.size);
        }
        
        // Optionally, update cube position.
        // cube.position.set(cubeParams.posX, cubeParams.posY, cubeParams.posZ);
    }
}

// export { cubeToy, updateCube, cubeParams };

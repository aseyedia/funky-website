import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

let camera, scene, renderer, controls;
const textMeshes = [];

init();
animate();

function init() {
    // Camera setup
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 10);
    camera.position.set(0, 1, 2);

    // Scene setup
    scene = new THREE.Scene();

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; // Enable shadows
    document.body.appendChild(renderer.domElement);

    // Orbit Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // An animation loop is required when either damping or auto-rotation are enabled
    controls.dampingFactor = 0.1;
    controls.maxPolarAngle = Math.PI / 2; // Prevent the camera from moving below the ground level

    // Ambient Light
    const ambLight = new THREE.AmbientLight(0xffffff, 0.5); // Reduced intensity for better contrast
    scene.add(ambLight);

    // Spotlight with shadows
    const spotLight = new THREE.SpotLight(0xffffff, 1);
    spotLight.position.set(2, 2, 2);
    spotLight.castShadow = true; // Enable shadows for the light
    spotLight.angle = Math.PI / 6;
    spotLight.penumbra = 0.1;
    spotLight.decay = 2;
    spotLight.distance = 50;
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;
    spotLight.shadow.camera.near = 0.5;
    spotLight.shadow.camera.far = 50;
    scene.add(spotLight);

    // Ground Plane
    const groundGeometry = new THREE.PlaneGeometry(500, 500);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x4e8f38 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2; // Rotate ground to be horizontal
    ground.receiveShadow = true; // Enable shadows for the ground
    scene.add(ground);

    // Load the font and create text geometries
    const loader = new FontLoader();
    loader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', function (font) {
        const message = 'Arta Seyedian';
        const fontOptions = {
            font: font,
            size: 0.1,
            height: 0.02, // Use depth instead of height to avoid deprecation warning
            curveSegments: 12,
            bevelEnabled: true,
            bevelThickness: 0.005,
            bevelSize: 0.005,
            bevelOffset: 0,
            bevelSegments: 3
        };

        const letters = Array.from(message);
        let offsetX = 0;
        const letterSpacing = 0.02; // Adjust letter spacing

        letters.forEach((letter, index) => {
            const textGeometry = new TextGeometry(letter, fontOptions);
            textGeometry.computeBoundingBox();

            console.log(`Letter: ${letter}, BoundingBox:`, textGeometry.boundingBox); // Log bounding box

            // Ensure bounding box values are valid
            if (textGeometry.boundingBox && isFinite(textGeometry.boundingBox.max.x) && isFinite(textGeometry.boundingBox.min.x)) {
                const charWidth = textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x;
                const centerOffsetY = -textGeometry.boundingBox.min.y; // Move the geometry up to sit on the ground
                textGeometry.translate(0, centerOffsetY, 0);

                const textMaterial = new THREE.MeshNormalMaterial(); // Change to MeshNormalMaterial

                const textMesh = new THREE.Mesh(textGeometry, textMaterial);
                textMesh.position.x = offsetX;
                textMesh.castShadow = true; // Enable shadows for the text mesh
                textMeshes.push(textMesh);
                scene.add(textMesh);

                console.log(`Letter ${letter}: position x = ${textMesh.position.x}`); // Log each letter's position

                offsetX += charWidth + letterSpacing; // Add letter spacing
            } else {
                console.error(`Invalid BoundingBox for letter: ${letter}`);
            }
        });

        // Center the entire text
        const totalWidth = offsetX - letterSpacing; // Adjust total width calculation
        textMeshes.forEach(mesh => {
            mesh.position.x -= totalWidth / 2;
        });

        // Log to check if text meshes are created
        console.log("Text meshes created: ", textMeshes.length);
    });

    window.addEventListener('resize', onWindowResize, false);

    // Log to check initial setup
    console.log("Initial setup complete");
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    // Prevent the camera from going below the ground
    if (camera.position.y < 0.1) {
        camera.position.y = 0.1;
    }

    // Update controls
    controls.update();

    renderer.render(scene, camera);
}

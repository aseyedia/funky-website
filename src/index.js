import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import * as dat from 'dat.gui';

// GUI controls
const gui = new dat.GUI();
const controls = {
    text: 'Arta Seyedian',
    speed: 0.01,
    direction: 1
};

let camera, scene, renderer;
const textMeshes = [];

init();
animate();

function generateText(value) {
    // Remove old text meshes
    textMeshes.forEach(mesh => scene.remove(mesh));
    textMeshes.length = 0;

    // Generate new text meshes
    const loader = new FontLoader();
    loader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', function (font) {
        const fontOptions = {
            font: font,
            size: 0.1,
            depth: 0.02, // Use depth instead of height to avoid deprecation warning
            curveSegments: 12,
            bevelEnabled: true,
            bevelThickness: 0.005,
            bevelSize: 0.005,
            bevelOffset: 0,
            bevelSegments: 3
        };

        const letters = Array.from(value);
        let offsetX = 0;
        const letterSpacing = 0.05; // Adjust letter spacing
        letters.forEach((letter, index) => {
            if (letter === ' ') {
                offsetX += letterSpacing; // Add space for spaces
                return;
            }

            const textGeometry = new TextGeometry(letter, fontOptions);
            textGeometry.computeBoundingBox();
            if (textGeometry.boundingBox && isFinite(textGeometry.boundingBox.max.x) && isFinite(textGeometry.boundingBox.min.x)) {
                let charWidth = textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x;
                const centerOffset = -0.5 * (textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x);
                textGeometry.translate(centerOffset, 0, 0);

                const textMaterial = new THREE.MeshNormalMaterial(); // Changed to MeshNormalMaterial
                const textMesh = new THREE.Mesh(textGeometry, textMaterial);
                textMesh.position.x = offsetX;
                textMeshes.push(textMesh);
                scene.add(textMesh);

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

        console.log("Text meshes created: ", textMeshes.length);
    });
}

function init() {
    // Camera setup
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 10);
    camera.position.z = 1;

    // Scene setup
    scene = new THREE.Scene();

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Ambient Light
    const ambLight = new THREE.AmbientLight(0xffffff, 1); // Increased intensity for better visibility
    scene.add(ambLight);

    window.addEventListener('resize', onWindowResize, false);

    console.log("Initial setup complete");

    generateText(controls.text); // Generate initial text

    // GUI controls initialization
    gui.add(controls, 'text').onChange(generateText);
    gui.add(controls, 'speed', 0, 0.1); // min: 0, max: 0.1
    gui.add(controls, 'direction', -1, 1); // min: -1, max: 1
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    // Use controls.speed and controls.direction
    textMeshes.forEach(mesh => {
        mesh.rotation.y += controls.speed * controls.direction;
    });

    renderer.render(scene, camera);
}

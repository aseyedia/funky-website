import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

let camera, scene, renderer;
const textMeshes = [];

init();
animate();

function init() {
	// Camera setup
	camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 10);
	camera.position.z = 1;

	// Scene setup
	scene = new THREE.Scene();

	// Renderer setup
	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.shadowMap.enabled = true; // Enable shadows
	document.body.appendChild(renderer.domElement);

	// Ambient Light
	const ambLight = new THREE.AmbientLight(0xffffff, 1); // Increased intensity for better visibility
	scene.add(ambLight);

	// Point Light with shadows
	const pointLight = new THREE.PointLight(0xffffff, 1);
	pointLight.position.set(2, 2, 2);
	pointLight.castShadow = true; // Enable shadows for the light
	scene.add(pointLight);

	// Ground Plane
	const groundGeometry = new THREE.PlaneGeometry(500, 500);
	const groundMaterial = new THREE.MeshNormalMaterial({ color: 0x4e8f38 });
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
		const letterSpacing = 0.05; // Increase letter spacing
		letters.forEach((letter, index) => {
			const textGeometry = new TextGeometry(letter, fontOptions);
			textGeometry.computeBoundingBox();
			// Ensure bounding box values are valid
			if (textGeometry.boundingBox && isFinite(textGeometry.boundingBox.max.x) && isFinite(textGeometry.boundingBox.min.x)) {
				let charWidth = textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x;
				// Manual adjustment for certain characters
				if (letter === 'i') {
					charWidth += 0.01; // Adjust as needed
				}
				// Center the geometry
				const centerOffset = -0.5 * (textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x);
				textGeometry.translate(centerOffset, 0, 0);
				const textMaterial = new THREE.MeshNormalMaterial({ color: 0xffffff }); // Change to MeshPhongMaterial for better lighting
				const textMesh = new THREE.Mesh(textGeometry, textMaterial);
				textMesh.position.x = offsetX;
				textMesh.castShadow = true; // Enable shadows for the text mesh
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

    // Rotate each letter around its own vertical axis
    textMeshes.forEach(mesh => {
        mesh.rotation.y += 0.005; // Slow down rotation speed
    });

    renderer.render(scene, camera);
}

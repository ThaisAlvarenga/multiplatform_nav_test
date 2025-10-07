// --- CDN imports (works on GitHub Pages) ---
import * as THREE from 'https://unpkg.com/three@0.165.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.165.0/examples/jsm/controls/OrbitControls.js';
import { VRButton } from 'https://unpkg.com/three@0.165.0/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'https://unpkg.com/three@0.165.0/examples/jsm/webxr/XRControllerModelFactory.js';

// Setup the renderer
const renderer = new THREE.WebGLRenderer();
renderer.setClearColor(0x222230);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Create a new scene
const scene = new THREE.Scene();

// Setup scene lighting
const light = new THREE.DirectionalLight();
light.intensity = 2;
light.position.set(2, 5, 10);
light.castShadow = true;
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.1));

// Setup camera
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
camera.position.set(-5, 5, 12);
camera.layers.enable(1);
controls.target.set(-1, 2, 0);
controls.update();

// Render loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// ========= END SCENE SETUP =========

const floorGeometry = new THREE.PlaneGeometry(25, 20);
const boxGeometry = new THREE.BoxGeometry(2, 2, 2);
const cylinderGeometry = new THREE.CylinderGeometry(0.5, 0.5, 2);
const material = new THREE.MeshLambertMaterial();

const floorMesh = new THREE.Mesh(
  floorGeometry, 
  new THREE.MeshLambertMaterial({ color: 0xffffff })
);
floorMesh.rotation.x = - Math.PI / 2.0;
floorMesh.name = 'Floor';
floorMesh.receiveShadow = true;
scene.add(floorMesh);

function createMesh(geometry, material, x, y, z, name, layer) {
  const mesh = new THREE.Mesh(geometry, material.clone());
  mesh.position.set(x, y, z);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.layers.set(layer);
  return mesh;
}

const cylinders = new THREE.Group();
cylinders.add(createMesh(cylinderGeometry, material, 3, 1, 0, 'Cylinder A', 0));
cylinders.add(createMesh(cylinderGeometry, material, 4.2, 1, 0, 'Cylinder B', 0))
cylinders.add(createMesh(cylinderGeometry, material, 3.6, 3, 0, 'Cylinder C', 0));
scene.add(cylinders);

const boxes = new THREE.Group();
boxes.add(createMesh(boxGeometry, material, -1, 1, 0, 'Box A', 0));
boxes.add(createMesh(boxGeometry, material, -4, 1, 0, 'Box B', 0))
boxes.add(createMesh(boxGeometry, material, -2.5, 3, 0, 'Box C', 0));
scene.add(boxes);

animate();

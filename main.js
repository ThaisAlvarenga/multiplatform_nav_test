// XR OrbitControls-style navigation
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRButton } from 'three/addons/webxr/XRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { VRButton } from 'https://unpkg.com/three@0.165.0/examples/jsm/webxr/VRButton.js';


// ------------------------------------
// renderer / scene / camera
// ------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setClearColor(0x222230);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

// lights
const light = new THREE.DirectionalLight();
light.intensity = 2;
light.position.set(2, 5, 10);
light.castShadow = true;
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.1));

// camera + desktop OrbitControls
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
camera.position.set(-5, 5, 12);
camera.layers.enable(1);
controls.target.set(-1, 2, 0);
controls.update();

// XR button
document.body.appendChild(XRButton.createButton(renderer, {
  requiredFeatures: ['local-floor'],
  optionalFeatures: ['hand-tracking']
}));

// ------------------------------------
// World geometry (your sample objects)
// ------------------------------------
const floorGeometry = new THREE.PlaneGeometry(25, 20);
const boxGeometry = new THREE.BoxGeometry(2, 2, 2);
const cylinderGeometry = new THREE.CylinderGeometry(0.5, 0.5, 2);
const material = new THREE.MeshLambertMaterial();

const floorMesh = new THREE.Mesh(
  floorGeometry,
  new THREE.MeshLambertMaterial({ color: 0xffffff })
);
floorMesh.rotation.x = -Math.PI / 2.0;
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
cylinders.add(createMesh(cylinderGeometry, material, 4.2, 1, 0, 'Cylinder B', 0));
cylinders.add(createMesh(cylinderGeometry, material, 3.6, 3, 0, 'Cylinder C', 0));
scene.add(cylinders);

const boxes = new THREE.Group();
boxes.add(createMesh(boxGeometry, material, -1, 1, 0, 'Box A', 0));
boxes.add(createMesh(boxGeometry, material, -4, 1, 0, 'Box B', 0));
boxes.add(createMesh(boxGeometry, material, -2.5, 3, 0, 'Box C', 0));
scene.add(boxes);

// ------------------------------------
// XR "Orbit" nav state
// ------------------------------------
const target = new THREE.Vector3(-1, 2, 0);  // same as controls.target
let radius = 12;                              // dolly distance
let theta = Math.atan2(camera.position.x - target.x, camera.position.z - target.z); // around Y
let phi = Math.acos(
  THREE.MathUtils.clamp(
    (camera.position.y - target.y) / new THREE.Vector3().subVectors(camera.position, target).length(),
    -1, 1
  )
); // up/down
const spherical = new THREE.Spherical(radius, phi, theta);

const XR_NAV = {
  orbitSpeed: 1.4,    // radians/sec with thumbstick or hand-drag
  dollySpeed: 3.0,    // meters/sec (closer/farther)
  minRadius: 2.0,
  maxRadius: 50.0,
  minPhi: 0.01,
  maxPhi: Math.PI - 0.01,
};

// helper to apply spherical to camera in XR
function applySphericalToCamera() {
  spherical.radius = THREE.MathUtils.clamp(spherical.radius, XR_NAV.minRadius, XR_NAV.maxRadius);
  spherical.phi = THREE.MathUtils.clamp(spherical.phi, XR_NAV.minPhi, XR_NAV.maxPhi);
  const pos = new THREE.Vector3().setFromSpherical(spherical).add(target);
  camera.position.copy(pos);
  camera.lookAt(target);
}

// initialize spherical from current camera
(function syncSphericalFromCamera() {
  const offset = new THREE.Vector3().subVectors(camera.position, target);
  spherical.setFromVector3(offset);
})();

// ------------------------------------
// Controllers (for XR)
// ------------------------------------
const controllerModelFactory = new XRControllerModelFactory();

const controllers = [0, 1].map((i) => {
  const ctrl = renderer.xr.getController(i);
  scene.add(ctrl);

  const grip = renderer.xr.getControllerGrip(i);
  grip.add(controllerModelFactory.createControllerModel(grip));
  scene.add(grip);

  // XR "select" to do raycast pick
  ctrl.addEventListener('selectstart', () => (ctrl.userData.selecting = true));
  ctrl.addEventListener('selectend', () => (ctrl.userData.selecting = false));

  return { ctrl, grip };
});

// Optional hands (for hand-tracking orbit)
const hands = [0, 1].map((i) => {
  const hand = renderer.xr.getHand(i);
  hand.userData.isPinching = false;
  hand.addEventListener('pinchstart', () => (hand.userData.isPinching = true));
  hand.addEventListener('pinchend', () => (hand.userData.isPinching = false));
  scene.add(hand);
  return hand;
});

// ------------------------------------
// Raycasting (desktop + XR select)
// ------------------------------------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

document.addEventListener('mousedown', onMouseDown);

function onMouseDown(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  if (hits.length) {
    const obj = hits[0].object;
    if (obj.material && obj.material.color) obj.material.color.setRGB(Math.random(), Math.random(), Math.random());
    console.log(`${obj.name || '(unnamed)'} clicked`);
  }
}

// XR select ray from controller
function raycastFromController(ctrl) {
  const rayOrigin = new THREE.Vector3();
  const rayDir = new THREE.Vector3(0, 0, -1);
  ctrl.matrixWorld.decompose(rayOrigin, new THREE.Quaternion(), new THREE.Vector3());
  rayDir.applyQuaternion(ctrl.quaternion);
  raycaster.set(rayOrigin, rayDir.normalize());

  const hits = raycaster.intersectObjects(scene.children, true);
  if (hits.length) {
    const obj = hits[0].object;
    if (obj.material && obj.material.color) obj.material.color.setRGB(Math.random(), Math.random(), Math.random());
    console.log(`[XR] ${obj.name || '(unnamed)'} selected`);
  }
}

// ------------------------------------
// XR Orbit logic (controllers + hands)
// ------------------------------------
function updateXROrbit(dt) {
  const session = renderer.xr.getSession?.();
  if (!session) return;

  // Controllers with XRStandardGamepad (Quest)
  renderer.xr.getSession().inputSources.forEach((src) => {
    const gp = src.gamepad;
    if (!gp) return;

    // Try both stick mappings
    const lx = gp.axes[2] ?? gp.axes[0] ?? 0; // left-right
    const ly = gp.axes[3] ?? gp.axes[1] ?? 0; // up-down

    // Orbit around target: left-right rotates theta, up-down changes phi
    const orbitScale = XR_NAV.orbitSpeed * dt;
    spherical.theta -= lx * orbitScale;        // rotate around Y
    spherical.phi   -= ly * orbitScale * 0.8;  // pitch

    // Dolly on secondary stick Y if available
    const dy = gp.axes[1] ?? 0;
    spherical.radius += -dy * XR_NAV.dollySpeed * dt * 0.5;

    // Trigger "select" raycast
    if (src && src.handedness && gp.buttons?.[0]?.pressed) {
      const idx = src.handedness === 'left' ? 0 : 1;
      if (controllers[idx]) {
        raycastFromController(controllers[idx].ctrl);
      }
    }
  });

  // Hand-tracking (AVP, Quest hands)
  const leftPinch = hands[0]?.userData.isPinching;
  const rightPinch = hands[1]?.userData.isPinching;

  // store last hand pose to compute deltas
  hands.forEach((hand, i) => {
    if (!hand) return;
    hand.userData.lastPos = hand.userData.lastPos || new THREE.Vector3();
    hand.getWorldPosition(hand.userData.currentPos || (hand.userData.currentPos = new THREE.Vector3()));
    if (!hand.userData.hadFirst) {
      hand.userData.lastPos.copy(hand.userData.currentPos);
      hand.userData.hadFirst = true;
    }
  });

  // Single-hand pinch = orbit (based on hand movement)
  if (leftPinch ^ rightPinch) {
    const i = leftPinch ? 0 : 1;
    const hand = hands[i];
    if (hand) {
      hand.getWorldPosition(hand.userData.currentPos);
      const delta = new THREE.Vector3().subVectors(hand.userData.currentPos, hand.userData.lastPos);
      // Map world-space lateral movement to orbit deltas
      spherical.theta -= delta.x * 1.2;       // horizontal moves rotate around Y
      spherical.phi   -= delta.y * 1.2;       // vertical moves pitch
      hand.userData.lastPos.copy(hand.userData.currentPos);
    }
  }

  // Both hands pinching = dolly (move both hands forward/back)
  if (leftPinch && rightPinch) {
    const lp = hands[0].userData.currentPos, rp = hands[1].userData.currentPos;
    const lastL = hands[0].userData.lastPos, lastR = hands[1].userData.lastPos;
    const avg = new THREE.Vector3().addVectors(lp, rp).multiplyScalar(0.5);
    const lastAvg = new THREE.Vector3().addVectors(lastL, lastR).multiplyScalar(0.5);
    const dz = avg.z - lastAvg.z; // push/pull
    spherical.radius += dz * 10.0; // scale to feel right
    hands[0].userData.lastPos.copy(lp);
    hands[1].userData.lastPos.copy(rp);
  }

  applySphericalToCamera();
}

// ------------------------------------
// Rendering
// ------------------------------------
function animateDesktop() {
  requestAnimationFrame(animateDesktop);
  controls.update();
  renderer.render(scene, camera);
}

// XR + Desktop in one loop
renderer.setAnimationLoop((t, frame) => {
  if (renderer.xr.isPresenting) {
    const dt = Math.min(0.05, renderer.xr.getFrame?.().deltaTime ? renderer.xr.getFrame().deltaTime / 1000 : 1 / 60);
    updateXROrbit(dt || 1/60);
    renderer.render(scene, camera);
  } else {
    controls.update();
    renderer.render(scene, camera);
  }
});

// ------------------------------------
// Resize
// ------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

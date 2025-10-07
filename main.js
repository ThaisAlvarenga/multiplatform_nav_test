// --- imports (CDN-safe if needed) ---
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRButton } from 'three/addons/webxr/XRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// --- renderer / scene / camera ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setClearColor(0x222230);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(2,5,10);
light.castShadow = true;
scene.add(light, new THREE.AmbientLight(0xffffff, 0.1));

const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 1000);

// === RIG (critical for XR) ===
const rig = new THREE.Group();
scene.add(rig);
rig.add(camera); // head-tracked camera lives inside the rig

// Desktop controls (disabled while in XR)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(-1, 2, 0);
camera.position.set(-5, 5, 12);
controls.update();

// XR button
document.body.appendChild(XRButton.createButton(renderer, {
  requiredFeatures: ['local-floor'],
  optionalFeatures: ['hand-tracking']
}));

// ---------- your world ----------
const floorGeometry = new THREE.PlaneGeometry(25, 20);
const floorMesh = new THREE.Mesh(
  floorGeometry, new THREE.MeshLambertMaterial({ color: 0xffffff })
);
floorMesh.rotation.x = -Math.PI/2;
floorMesh.receiveShadow = true;
scene.add(floorMesh);

const boxGeometry = new THREE.BoxGeometry(2,2,2);
const cylinderGeometry = new THREE.CylinderGeometry(0.5,0.5,2);
const baseMat = new THREE.MeshLambertMaterial();

function createMesh(geometry, material, x, y, z, name, layer) {
  const m = new THREE.Mesh(geometry, material.clone());
  m.position.set(x,y,z);
  m.name = name;
  m.castShadow = m.receiveShadow = true;
  m.layers.set(layer);
  return m;
}
const cylinders = new THREE.Group();
cylinders.add(createMesh(cylinderGeometry, baseMat, 3,   1, 0, 'Cylinder A', 0));
cylinders.add(createMesh(cylinderGeometry, baseMat, 4.2, 1, 0, 'Cylinder B', 0));
cylinders.add(createMesh(cylinderGeometry, baseMat, 3.6, 3, 0, 'Cylinder C', 0));
scene.add(cylinders);

const boxes = new THREE.Group();
boxes.add(createMesh(boxGeometry, baseMat, -1,  1, 0, 'Box A', 0));
boxes.add(createMesh(boxGeometry, baseMat, -4,  1, 0, 'Box B', 0));
boxes.add(createMesh(boxGeometry, baseMat, -2.5,3, 0, 'Box C', 0));
scene.add(boxes);

// ---------- XR Orbit-style nav state ----------
const target = new THREE.Vector3(-1, 2, 0);      // pivot point
let spherical = new THREE.Spherical();           // radius, phi, theta

// initialize spherical from current desktop camera
(function syncSpherical() {
  const offset = new THREE.Vector3().subVectors(camera.position, target);
  spherical.setFromVector3(offset);
})();

const XR_NAV = {
  orbitSpeed: 1.4,       // rad/s
  dollySpeed:  3.0,      // m/s
  minRadius:   1.5,
  maxRadius:   50,
  minPhi:      0.01,
  maxPhi:      Math.PI - 0.01
};

function applySphericalToRig() {
  spherical.radius = THREE.MathUtils.clamp(spherical.radius, XR_NAV.minRadius, XR_NAV.maxRadius);
  spherical.phi    = THREE.MathUtils.clamp(spherical.phi, XR_NAV.minPhi, XR_NAV.maxPhi);
  const pos = new THREE.Vector3().setFromSpherical(spherical).add(target);
  // In XR, move the rig (not the camera). The headset adds head offset inside the rig.
  rig.position.copy(pos);

  // Optional: orient rig roughly toward target so controllers feel aligned
  rig.lookAt(target);
}

// ---------- Controllers & hands ----------
const controllerModelFactory = new XRControllerModelFactory();
const controllers = [0,1].map((i) => {
  const ctrl = renderer.xr.getController(i);
  ctrl.addEventListener('select', () => raycastFromController(ctrl));
  scene.add(ctrl);

  const grip = renderer.xr.getControllerGrip(i);
  grip.add(controllerModelFactory.createControllerModel(grip));
  scene.add(grip);

  return { ctrl, grip };
});

const hands = [0,1].map((i) => {
  const h = renderer.xr.getHand(i);
  h.userData.isPinching = false;
  h.addEventListener('pinchstart', () => (h.userData.isPinching = true));
  h.addEventListener('pinchend',   () => (h.userData.isPinching = false));
  scene.add(h);
  return h;
});

// ---------- Raycasting (desktop + XR) ----------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

document.addEventListener('mousedown', (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width)  * 2 - 1;
  mouse.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  if (hits.length) hits[0].object.material.color.setRGB(Math.random(),Math.random(),Math.random());
});

function raycastFromController(ctrl) {
  const origin = new THREE.Vector3();
  const quat   = new THREE.Quaternion();
  const dir    = new THREE.Vector3(0,0,-1);
  ctrl.matrixWorld.decompose(origin, quat, new THREE.Vector3());
  dir.applyQuaternion(quat).normalize();
  raycaster.set(origin, dir);
  const hits = raycaster.intersectObjects(scene.children, true);
  if (hits.length) hits[0].object.material.color.setRGB(Math.random(),Math.random(),Math.random());
}

// ---------- XR input → orbit/dolly ----------
function updateXROrbit(dt) {
  const session = renderer.xr.getSession?.();
  if (!session) return;

  // Gamepad (Quest) — try both stick mappings
  session.inputSources.forEach((src) => {
    const gp = src.gamepad;
    if (!gp) return;

    // prefer left stick on axes[2,3]; fallback to [0,1]
    const lx = (gp.axes[2] ?? gp.axes[0] ?? 0);
    const ly = (gp.axes[3] ?? gp.axes[1] ?? 0);

    const orbitScale = XR_NAV.orbitSpeed * dt;
    spherical.theta -= lx * orbitScale;        // yaw
    spherical.phi   -= ly * orbitScale * 0.8;  // pitch

    // Use right stick Y if present for dolly (fallback to same stick if not)
    const ry = (gp.axes[1] ?? 0);
    spherical.radius += -ry * XR_NAV.dollySpeed * dt * 0.6;
  });

  // Hand-tracking (pinch + move)
  const left = hands[0], right = hands[1];
  const leftPinch  = left?.userData.isPinching;
  const rightPinch = right?.userData.isPinching;

  [left, right].forEach((h) => {
    if (!h) return;
    h.userData.lastPos = h.userData.lastPos || new THREE.Vector3();
    h.userData.currPos = h.userData.currPos || new THREE.Vector3();
    h.getWorldPosition(h.userData.currPos);
    if (!h.userData.init) {
      h.userData.lastPos.copy(h.userData.currPos);
      h.userData.init = true;
    }
  });

  // One-hand pinch = orbit
  if (leftPinch ^ rightPinch) {
    const h = leftPinch ? left : right;
    const delta = new THREE.Vector3().subVectors(h.userData.currPos, h.userData.lastPos);
    spherical.theta -= delta.x * 1.2;
    spherical.phi   -= delta.y * 1.2;
    h.userData.lastPos.copy(h.userData.currPos);
  }

  // Two-hand pinch = dolly (push/pull)
  if (leftPinch && rightPinch) {
    const avg     = new THREE.Vector3().addVectors(left.userData.currPos, right.userData.currPos).multiplyScalar(0.5);
    const lastAvg = new THREE.Vector3().addVectors(left.userData.lastPos, right.userData.lastPos).multiplyScalar(0.5);
    spherical.radius += (avg.z - lastAvg.z) * 10.0;
    left.userData.lastPos.copy(left.userData.currPos);
    right.userData.lastPos.copy(right.userData.currPos);
  }

  applySphericalToRig();
}

// ---------- Render loop ----------
let lastT = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  if (renderer.xr.isPresenting) {
    // XR mode: use orbital rig logic
    updateXROrbit(dt);
    renderer.render(scene, camera);
  } else {
    // Desktop: classic OrbitControls
    controls.update();
    renderer.render(scene, camera);
  }
});

// ---------- Resize ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

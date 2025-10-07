// --- CDN imports (works on GitHub Pages) ---
import * as THREE from 'https://unpkg.com/three@0.165.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.165.0/examples/jsm/controls/OrbitControls.js';
import { XRButton } from 'https://unpkg.com/three@0.165.0/examples/jsm/webxr/XRButton.js';
import { XRControllerModelFactory } from 'https://unpkg.com/three@0.165.0/examples/jsm/webxr/XRControllerModelFactory.js';

// ---------- renderer / scene / camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);
renderer.setClearColor(0x222230);
renderer.shadowMap.enabled = true;
renderer.xr.enabled = true;
document.body.style.margin = '0';
document.body.appendChild(renderer.domElement);

// Critical so OrbitControls receives pointer/touch:
renderer.domElement.style.display = 'block';
renderer.domElement.style.touchAction = 'none'; // mobile Safari/Chrome
renderer.domElement.tabIndex = 0;               // keyboard focus if needed

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 1000);

// Desktop OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.9;
controls.zoomSpeed = 1.0;
controls.panSpeed = 0.8;

// World + initial camera
scene.add(new THREE.AmbientLight(0xffffff, 0.1));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(2,5,10);
sun.castShadow = true;
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(25, 20),
  new THREE.MeshLambertMaterial({ color: 0xffffff })
);
floor.rotation.x = -Math.PI/2;
floor.receiveShadow = true;
scene.add(floor);

const mat = new THREE.MeshLambertMaterial();
const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,2), mat.clone());
cyl.position.set(3,1,0);
scene.add(cyl);

const box = new THREE.Mesh(new THREE.BoxGeometry(2,2,2), mat.clone());
box.position.set(-1,1,0);
scene.add(box);

// Set the same target you like for orbiting
const target = new THREE.Vector3(-1, 2, 0);
controls.target.copy(target);
camera.position.set(-5, 5, 12);
controls.update();

// XR button
document.body.appendChild(XRButton.createButton(renderer, {
  requiredFeatures: ['local-floor'],
  optionalFeatures: ['hand-tracking'],
}));

// ---------- XR orbit via rig ----------
const rig = new THREE.Group();
scene.add(rig);

let spherical = new THREE.Spherical(); // radius, phi, theta

function syncSphericalFromCameraWorld() {
  const camWorld = new THREE.Vector3();
  camera.getWorldPosition(camWorld);
  const offset = camWorld.sub(target);
  spherical.setFromVector3(offset);
}

const XR_NAV = {
  orbitSpeed: 1.4,  // rad/s
  dollySpeed: 3.0,  // m/s
  minRadius: 1.5, maxRadius: 50,
  minPhi: 0.01, maxPhi: Math.PI - 0.01
};

function applySphericalToRig() {
  spherical.radius = THREE.MathUtils.clamp(spherical.radius, XR_NAV.minRadius, XR_NAV.maxRadius);
  spherical.phi    = THREE.MathUtils.clamp(spherical.phi, XR_NAV.minPhi, XR_NAV.maxPhi);
  const pos = new THREE.Vector3().setFromSpherical(spherical).add(target);
  rig.position.copy(pos);
  rig.lookAt(target);
}

// Re-parent camera ONLY while in XR
renderer.xr.addEventListener('sessionstart', () => {
  rig.add(camera);
  syncSphericalFromCameraWorld();     // start XR orbit from current view
  controls.enabled = false;           // avoid fighting inputs
});

renderer.xr.addEventListener('sessionend', () => {
  scene.add(camera);                  // back to desktop
  controls.enabled = true;
  controls.update();
});

// ---------- Controllers (optional visual models) ----------
const controllerModelFactory = new XRControllerModelFactory();
for (let i=0;i<2;i++){
  const grip = renderer.xr.getControllerGrip(i);
  grip.add(controllerModelFactory.createControllerModel(grip));
  scene.add(grip);
}

// ---------- XR input → orbit/dolly ----------
function updateXROrbit(dt) {
  const session = renderer.xr.getSession?.();
  if (!session) return;

  session.inputSources.forEach((src) => {
    const gp = src.gamepad;
    if (!gp) return;

    // robust axis pick (works on most headsets)
    const x = gp.axes[2] ?? gp.axes[0] ?? 0;
    const y = gp.axes[3] ?? gp.axes[1] ?? 0;

    const orbitScale = XR_NAV.orbitSpeed * dt;
    if (Math.abs(x) > 0.05) spherical.theta -= x * orbitScale;        // yaw
    if (Math.abs(y) > 0.05) spherical.phi   -= y * orbitScale * 0.8;  // pitch

    // use the other stick Y (or same if only one) for dolly
    const ry = gp.axes[1] ?? 0;
    if (Math.abs(ry) > 0.05) spherical.radius += -ry * XR_NAV.dollySpeed * dt * 0.6;
  });

  applySphericalToRig();
}

// ---------- Raycasting (desktop click example) ----------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
renderer.domElement.addEventListener('mousedown', (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left)/rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top)/rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  // const hits = raycaster.intersectObjects(scene.children, true);
  // if (hits.length) hits[0].object.material.color.setRGB(Math.random(),Math.random(),Math.random());
}, { passive:false });

// ---------- Render loop ----------
let last = performance.now();
renderer.setAnimationLoop((t) => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last)/1000);
  last = now;

  if (renderer.xr.isPresenting) {
    updateXROrbit(dt);
    renderer.render(scene, camera);
  } else {
    controls.update();
    renderer.render(scene, camera);
  }
});

// ---------- Resize ----------
addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

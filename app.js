// ============================================================
// ANIMATE v0.1 — a simple 3D animation app for kids.
// One data set (channels + keys) drives the 3D view, the
// timeline, and the Graph Editor. Plain static file, no build.
// ============================================================

import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// ---------- Small helpers ----------
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rad = (deg) => (deg * Math.PI) / 180;
const fmt = (n) => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};
function say(msg) { $('statusMsg').textContent = msg; }
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------- Constants and state ----------
const FPS = 24;
const FIRST_FRAME = 1;
let LAST_FRAME = 48;   // scene length in frames; the user can change it
const SCENE_NAME = 'my-scene';

let currentFrame = 1;
let frameFloat = 1;          // smooth playhead while playing
let playing = false;
let activeTool = 'move';     // select | move | rotate | scale
let ghostOn = false;
let ghostAhead = 3;   // ghosts after this frame (blue)
let ghostBehind = 3;  // ghosts before this frame (red)
let ghostStep = 4;    // frames between ghosts
let autoKeyOn = false;
let template = 2;            // 1 Ball, 2 Ball+Tail, 3 Ball+Legs
const sliders = { ballSize: 1, tailLength: 4, tailBend: 0.35, legLength: 1 };

// ---------- Data core: channels and keys ----------
// A channel is a list of keys: { frame, value, tangent }.
// tangent is one of: 'auto' | 'flat' | 'linear' | 'step'.
const CHANNEL_NAMES = [
  'moveX', 'moveY', 'moveZ',
  'rotateX', 'rotateY', 'rotateZ',
  'scaleX', 'scaleY', 'scaleZ',
  'tail1', 'tail2', 'tail3', 'legStep'
];
const DEFAULTS = {
  moveX: 0, moveY: 0, moveZ: 0,
  rotateX: 0, rotateY: 0, rotateZ: 0,
  scaleX: 1, scaleY: 1, scaleZ: 1,
  tail1: 0, tail2: 0, tail3: 0, legStep: 0
};
const CHAN_LABEL = {
  moveX: 'Move X', moveY: 'Move Y', moveZ: 'Move Z',
  rotateX: 'Rotate X', rotateY: 'Rotate Y', rotateZ: 'Rotate Z',
  scaleX: 'Scale X', scaleY: 'Scale Y', scaleZ: 'Scale Z',
  tail1: 'Tail 1', tail2: 'Tail 2', tail3: 'Tail 3', legStep: 'Leg Step'
};
const CHAN_COLOR = {
  moveX: '#ff6b6b', moveY: '#5cd68c', moveZ: '#54aaff',
  rotateX: '#ff9d7a', rotateY: '#a8e063', rotateZ: '#7ac7ff',
  scaleX: '#ffb042', scaleY: '#ffd76e', scaleZ: '#e0aaff',
  tail1: '#5ad2dc', tail2: '#ff7eb6', tail3: '#fab005', legStep: '#c792ff'
};
// The tail has three controllers. Each one bends the tail from its
// joint onward, so the tail can make C shapes and S shapes.
const TAIL_CHANNELS = ['tail1', 'tail2', 'tail3'];
const TRANSFORM_CHANNELS = [
  'moveX', 'moveY', 'moveZ', 'rotateX', 'rotateY', 'rotateZ', 'scaleX', 'scaleY', 'scaleZ'
];

let channels = {};
function emptyChannels() {
  const out = {};
  for (const name of CHANNEL_NAMES) out[name] = [];
  return out;
}
function sortKeys(name) {
  channels[name].sort((a, b) => a.frame - b.frame);
}
function addKey(name, frame, value, tangent = 'auto') {
  const keys = channels[name];
  const old = keys.find((k) => k.frame === frame);
  if (old) {
    // A new tangent type clears any bezier slopes on the key.
    if (old.tangent !== tangent) { delete old.slopeIn; delete old.slopeOut; delete old.lenIn; delete old.lenOut; }
    old.value = value; old.tangent = tangent;
    return old;
  }
  const key = { frame, value, tangent };
  keys.push(key); sortKeys(name);
  return key;
}

// Read one channel at any frame (frame can be a decimal).
function evalChannel(name, frame) {
  const keys = channels[name];
  if (!keys || keys.length === 0) return DEFAULTS[name];
  if (frame <= keys[0].frame) return keys[0].value;
  const lastKey = keys[keys.length - 1];
  if (frame >= lastKey.frame) return lastKey.value;

  // Find the pair of keys around this frame.
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].frame <= frame) i++;
  const k0 = keys[i], k1 = keys[i + 1];
  const h = k1.frame - k0.frame;
  const t = (frame - k0.frame) / h;

  // Step: hold the first value until the next key.
  if (k0.tangent === 'step') return k0.value;
  // Linear on both ends: a straight line. Bezier slopes win over linear.
  if (k0.tangent === 'linear' && k1.tangent === 'linear' &&
      typeof k0.slopeOut !== 'number' && typeof k1.slopeIn !== 'number') {
    return lerp(k0.value, k1.value, t);
  }
  // Smooth: Hermite curve (Catmull-Rom style slopes through the keys).
  // Simple approximation for 'flat': the slope at a flat key is zero.
  // A 'linear' end uses the straight chord slope for that end.
  const prev = keys[i - 1] || k0;
  const next = keys[i + 2] || k1;
  let m0 = (k1.value - prev.value) / Math.max(1, k1.frame - prev.frame);
  let m1 = (next.value - k0.value) / Math.max(1, next.frame - k0.frame);
  if (k0.tangent === 'flat') m0 = 0;
  if (k1.tangent === 'flat') m1 = 0;
  if (k0.tangent === 'linear') m0 = (k1.value - k0.value) / h;
  if (k1.tangent === 'linear') m1 = (k1.value - k0.value) / h;
  // Bezier handles: a slope set by a handle drag wins over the type.
  if (typeof k0.slopeOut === 'number') m0 = k0.slopeOut;
  if (typeof k1.slopeIn === 'number') m1 = k1.slopeIn;
  // Cubic bezier form. A handle length of h/3 on both sides
  // matches the old Hermite curve exactly, so untouched keys
  // and old files keep their shape.
  const hasLen = typeof k0.lenOut === 'number' || typeof k1.lenIn === 'number';
  const L0 = typeof k0.lenOut === 'number' ? clamp(k0.lenOut, 0.1, h) : h / 3;
  const L1 = typeof k1.lenIn === 'number' ? clamp(k1.lenIn, 0.1, h) : h / 3;
  const c0 = k0.value + m0 * L0;
  const c1 = k1.value - m1 * L1;
  if (!hasLen) {
    const u = 1 - t;
    return u * u * u * k0.value + 3 * u * u * t * c0 + 3 * u * t * t * c1 + t * t * t * k1.value;
  }
  // A dragged handle stores its own length. The curve is
  // parametric, like Maya: the handle point sits L frames
  // from its key, so a long handle pulls the curve toward
  // its height across more time, and a short handle keeps
  // the pull close to the key. Find the curve parameter
  // whose frame matches, then read its value.
  const x0 = k0.frame, x1 = k0.frame + L0, x2 = k1.frame - L1, x3 = k1.frame;
  let lo = 0, hi = 1, tt = t;
  for (let n = 0; n < 24; n++) {
    tt = (lo + hi) / 2;
    const u = 1 - tt;
    const x = u * u * u * x0 + 3 * u * u * tt * x1 + 3 * u * tt * tt * x2 + tt * tt * tt * x3;
    if (x < frame) lo = tt; else hi = tt;
  }
  const u = 1 - tt;
  return u * u * u * k0.value + 3 * u * u * tt * c0 + 3 * u * tt * tt * c1 + tt * tt * tt * k1.value;
}
function evalAll(frame) {
  const pose = {};
  for (const name of CHANNEL_NAMES) pose[name] = evalChannel(name, frame);
  return pose;
}
// The live pose. Frame changes fill it from the channels.
// Tool drags change it by hand until the next frame change.
let livePose = evalAll(1);

// ---------- Undo (Ctrl+Z, up to 99 steps) ----------
// Each step holds a full copy of the state before one action:
// channels, the live pose, the template, and the sliders.
const history = [];
function pushHistory(label) {
  history.push({
    label,
    state: JSON.parse(JSON.stringify({ channels, livePose, template, sliders, frames: LAST_FRAME }))
  });
  if (history.length > 99) history.shift();   // keep the last 99 actions
}
function undo() {
  const item = history.pop();
  if (!item) { say('Nothing to undo.'); return; }
  channels = item.state.channels;
  Object.assign(sliders, item.state.sliders);
  livePose = item.state.livePose;
  geSelectedKey = null;
  geSelKeys = [];
  $('sldSize').value = sliders.ballSize;
  $('sldTailLen').value = sliders.tailLength;
  $('sldTailBend').value = sliders.tailBend;
  $('sldLegLen').value = sliders.legLength;
  setTemplate(item.state.template);   // rebuilds the rig and applies the pose
  setSceneLength(item.state.frames || 48);
  drawRuler();
  if (graphOpen) { buildGeChannelList(); drawGraph(); geInfo(); }
  say(`Undo: ${item.label}.`);
}

// Lesson 1 bounce. Kept for the Lesson pick in a later step.
// The scene does NOT load it at start: a new scene opens with no keys.
// Contacts at frames 1, 13, 23, 31, 37, 43, 48. Peaks get lower.
function loadLessonBounce() {
  channels = emptyChannels();
  const contacts = [1, 13, 23, 31, 37, 43, 48];
  const peaks = [[7, 2.6], [18, 2.0], [27, 1.4], [34, 0.95], [40, 0.55], [45, 0.25]];
  for (const f of contacts) addKey('moveY', f, 0, 'auto');
  for (const [f, v] of peaks) addKey('moveY', f, v, 'flat');
  addKey('moveX', 1, -3, 'linear');
  addKey('moveX', 24, -0.25, 'linear');
  addKey('moveX', 48, 2.5, 'linear');
  addKey('moveZ', 1, 0, 'auto');
  for (const n of ['rotateX', 'rotateY', 'rotateZ']) addKey(n, 1, 0, 'auto');
  addKey('scaleX', 1, 1, 'auto'); addKey('scaleY', 1, 1, 'auto'); addKey('scaleZ', 1, 1, 'auto');
  for (const f of contacts) {
    if (f === 1) continue;
    addKey('scaleY', f, 0.72, 'auto');   // squash at contact
    addKey('scaleX', f, 1.28, 'auto');
  }
  for (const [f] of peaks) {
    addKey('scaleY', f, 1.06, 'auto');   // a small stretch near the top
    addKey('scaleX', f, 0.94, 'auto');
  }
  // Tail controllers in degrees. Tail 2 runs against Tail 1 a beat
  // later: that lag is what makes the overlap read.
  addKey('tail1', 1, 0, 'auto');
  addKey('tail1', 12, -28, 'auto');
  addKey('tail1', 24, 28, 'auto');
  addKey('tail1', 36, -20, 'auto');
  addKey('tail1', 48, 10, 'auto');
  addKey('tail2', 1, 0, 'auto');
  addKey('tail2', 16, 22, 'auto');
  addKey('tail2', 28, -22, 'auto');
  addKey('tail2', 40, 14, 'auto');
  addKey('tail2', 48, -6, 'auto');
  addKey('legStep', 1, 0, 'auto');
  addKey('legStep', 12, 0.6, 'auto');
  addKey('legStep', 24, -0.6, 'auto');
  addKey('legStep', 36, 0.6, 'auto');
  addKey('legStep', 48, 0, 'auto');
}
// A new scene opens clean: no keys on any channel.
channels = emptyChannels();

// ---------- Three.js scene ----------
const host = $('canvasHost');
const scene = new THREE.Scene();
// The paper lives inside the 3D view: the scene backdrop is flat
// paper color, so no view can fall through to black.
const PAPER_COLOR = 0xfffef7;
scene.background = new THREE.Color(PAPER_COLOR);
// Debug switches for view tests: ?bg=red paints the backdrop red,
// ?floor=off hides the floor sheet. Normal use ignores both.
const DEBUG_Q = new URLSearchParams(location.search);
if (DEBUG_Q.get('bg') === 'red') scene.background = new THREE.Color(0xff0000);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
camera.position.set(5.5, 3.6, 8.5);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
renderer.setClearColor(0x000000, 0);   // clear = see-through, so the paper shows
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
host.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(4, 8, 5);
scene.add(sun);
// The floor is grid paper with no end: one small graph-paper tile,
// repeated across a very wide plane, so the paper runs to the
// horizon in every view and no plane edge can ever show.
function makePaperTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#fffef7'; x.fillRect(0, 0, c.width, c.height);
  // Fine grid: a line every 32 px.
  x.strokeStyle = 'rgba(120, 165, 220, 0.5)'; x.lineWidth = 2;
  for (let p = 0; p <= c.width; p += 32) {
    x.beginPath(); x.moveTo(p, 0); x.lineTo(p, c.height); x.stroke();
    x.beginPath(); x.moveTo(0, p); x.lineTo(c.width, p); x.stroke();
  }
  // Bold grid: a stronger line every 5 cells, like real graph paper.
  x.strokeStyle = 'rgba(90, 140, 205, 0.65)'; x.lineWidth = 3;
  for (let p = 0; p <= c.width; p += 160) {
    x.beginPath(); x.moveTo(p, 0); x.lineTo(p, c.height); x.stroke();
    x.beginPath(); x.moveTo(0, p); x.lineTo(c.width, p); x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(75, 75);   // one tile = 4 world units
  tex.anisotropy = 8;
  return tex;
}
const floorSheet = new THREE.Mesh(
  new THREE.PlaneGeometry(300, 300),
  new THREE.MeshBasicMaterial({ map: makePaperTexture() })
);
floorSheet.rotation.x = -Math.PI / 2;
floorSheet.position.y = -0.001;
if (DEBUG_Q.get('floor') === 'off') floorSheet.visible = false;
scene.add(floorSheet);
// (The old dark ground plane from the first build is gone.
// It hid under the paper sheet and showed as a black band
// in the flat views and around the sheet edges.)

// ---------- Camera: simple custom orbit (Alt + drag) ----------
// We do not use OrbitControls. TransformControls owns plain drags.
// While Alt is held we turn TransformControls off and orbit by hand.
const orbitTarget = new THREE.Vector3(0, 1.2, 0);
let sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(orbitTarget));
// Views: Perspective (orbit), plus flat Front, Side, and Top views.
// Flat views use a long, narrow lens so lines stay near parallel.
let viewMode = 'persp';
let flatDist = 12;
const VIEW_NAMES = { persp: 'Camera 1', front: 'Front', side: 'Side', top: 'Top' };
function applyCamera() {
  if (viewMode === 'persp') {
    camera.up.set(0, 1, 0);
    camera.fov = 45;
    camera.position.copy(orbitTarget).add(new THREE.Vector3().setFromSpherical(sph));
  } else {
    camera.fov = 15;
    const t = orbitTarget;
    if (viewMode === 'front') {
      camera.up.set(0, 1, 0);
      camera.position.set(t.x, t.y, t.z + flatDist);
    } else if (viewMode === 'side') {
      camera.up.set(0, 1, 0);
      camera.position.set(t.x + flatDist, t.y, t.z);
    } else {   // top: look straight down, scene front points up-screen
      camera.up.set(0, 0, -1);
      camera.position.set(t.x, t.y + flatDist, t.z + 0.001);
    }
  }
  camera.updateProjectionMatrix();
  camera.lookAt(orbitTarget);
  $('viewLabel').textContent = '3D VIEW — ' + VIEW_NAMES[viewMode];
}
function setView(mode) {
  viewMode = mode;
  document.querySelectorAll('.view-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === mode));
  applyCamera();
}
// F in a viewport: frame the picked object. The orbit center
// moves to the object center, so Alt+drag turns around it.
function frameViewport() {
  if (!charGroup) { say('Nothing to frame yet.'); return; }
  let center, label;
  if (selectedCtrl !== 'ball' && tailCtrlJoints[selectedCtrl]) {
    center = new THREE.Vector3();
    tailCtrlJoints[selectedCtrl].getWorldPosition(center);
    label = CHAN_LABEL[selectedCtrl];
  } else {
    center = charGroup.position.clone();   // the ball center
    label = 'the ball';
  }
  orbitTarget.copy(center);
  if (viewMode === 'persp') sph.radius = clamp(ballRadius * 5, 3.5, 40);
  else flatDist = clamp(ballRadius * 7, 4, 40);
  applyCamera();
  say(`Camera framed on ${label}. Alt+drag now turns around it.`);
}
document.querySelectorAll('.view-btn').forEach((b) =>
  b.addEventListener('click', () => setView(b.dataset.view)));
applyCamera();
let altDrag = null;
window.addEventListener('pointerdown', (e) => {
  if (e.altKey && e.target === renderer.domElement) {
    tc.enabled = false;
    altDrag = { x: e.clientX, y: e.clientY, button: e.button };
    e.stopPropagation();
    e.preventDefault();
  }
}, true);
window.addEventListener('pointermove', (e) => {
  if (!altDrag) return;
  const dx = e.clientX - altDrag.x, dy = e.clientY - altDrag.y;
  altDrag.x = e.clientX; altDrag.y = e.clientY;
  if (altDrag.button === 2 || e.shiftKey || viewMode !== 'persp') {
    // Pan: move the target in the camera plane.
    // Flat views always pan: a flat view does not turn.
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
    orbitTarget.addScaledVector(right, -dx * 0.01).addScaledVector(up, dy * 0.01);
  } else if (e.ctrlKey || e.metaKey) {
    if (viewMode === 'persp') sph.radius = clamp(sph.radius - dy * 0.05, 3, 40);   // zoom
    else flatDist = clamp(flatDist - dy * 0.05, 4, 40);
  } else {
    sph.theta -= dx * 0.008;                               // turn
    sph.phi = clamp(sph.phi - dy * 0.008, 0.15, 1.5);
  }
  applyCamera();
}, true);
window.addEventListener('pointerup', () => {
  if (altDrag) { altDrag = null; tc.enabled = true; }
}, true);
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  const d = Math.sign(e.deltaY) * 0.7;
  if (viewMode === 'persp') sph.radius = clamp(sph.radius + d, 3, 40);
  else flatDist = clamp(flatDist + d, 4, 40);
  applyCamera();
}, { passive: false });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keyup', (e) => { if (e.key === 'Alt') tc.enabled = true; });

// ---------- TransformControls (Q / W / E / R tools) ----------
const tc = new TransformControls(camera, renderer.domElement);
scene.add(tc);
tc.setMode('translate');

// ---------- The character rig ----------
// charGroup is the control. Its pivot is the CENTER of the ball.
// Move and rotate channels drive it, so the ball turns around its center.
// Scale channels squash the ball mesh around the same center.
let charGroup = null, ballMesh = null, tailRoot = null, tailJoints = [], legL = null, legR = null;
let tailCtrlJoints = { tail1: null, tail2: null, tail3: null };
let tailCtrlMeshes = [];      // the ring meshes in the 3D view
let selectedCtrl = 'ball';    // 'ball' or a tail channel name
let ghostPool = [];   // [{mesh, side, idx}] built by buildRig
let ballRadius = 0.9, legClear = 0;

// Sketch look, after the user's pencil-sphere sketch:
// white paper fill, graphite hatching that grows dense in
// the shade, cross-hatch in the dark core, a thin ink edge.
// The hatch sits in screen space, like lines drawn on paper.
// The light still turns with the form, so the ball stays 3D.
function makeSketchMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      lightDir: { value: new THREE.Vector3(0.55, 0.75, 0.6) }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 lightDir;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      float hatchLine(float u) {
        float s = abs(fract(u) - 0.5);
        return smoothstep(0.24, 0.10, s);
      }
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(-vViewPos);
        float ndl = dot(n, normalize(lightDir));
        float tone = clamp(ndl * 0.62 + 0.38, 0.0, 1.0);
        vec2 fc = gl_FragCoord.xy;
        float wob = sin(fc.y * 0.33) * 0.7 + sin(fc.x * 0.19) * 0.5;
        float l1 = hatchLine((fc.x + fc.y + wob) / 7.0);
        float l2 = hatchLine((fc.x - fc.y - wob) / 8.0);
        float ink = 0.0;
        ink += l1 * 0.60 * smoothstep(0.92, 0.60, tone);
        ink += l2 * 0.62 * smoothstep(0.55, 0.32, tone);
        ink += 0.35 * smoothstep(0.30, 0.05, tone);
        float rim = pow(1.0 - abs(dot(n, v)), 2.4);
        ink += rim * 0.20;
        vec3 col = vec3(1.0, 0.997, 0.988);
        col *= mix(0.88, 1.0, tone);
        col = mix(col, vec3(0.13, 0.13, 0.14), clamp(ink, 0.0, 1.0) * 0.88);
        gl_FragColor = vec4(col, 1.0);
      }`
  });
}
const sketchMat = makeSketchMaterial();
// Ink outline: a slightly larger shell worn inside-out.
// A second faint shell sits just outside it: the double
// stroke of a hand-drawn line.
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x1f2328, side: THREE.BackSide });
const outlineMatSoft = new THREE.MeshBasicMaterial({
  color: 0x1f2328, side: THREE.BackSide, transparent: true, opacity: 0.35, depthWrite: false
});
function addOutline(mesh, grow) {
  const ol = new THREE.Mesh(unitSphere, outlineMat);
  ol.scale.setScalar(grow);
  mesh.add(ol);
  const ol2 = new THREE.Mesh(unitSphere, outlineMatSoft);
  ol2.scale.setScalar(grow + 0.022);
  mesh.add(ol2);
  return ol;
}
const ballMat = sketchMat;
const tailMat = sketchMat;
const legMat = sketchMat;
const ghostMat = new THREE.MeshBasicMaterial({
  color: 0xb7c9da, transparent: true, opacity: 0.18, depthWrite: false
});
const seamMat = new THREE.MeshBasicMaterial({ color: 0xd92b2b });

// Scribble cast shadow: a flat patch of horizontal pencil
// strokes on the floor, like the shadow in the sketch.
// It follows the ball and fades as the ball rises.
function makeShadowTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.strokeStyle = '#23262b'; x.lineCap = 'round';
  for (let i = 0; i < 340; i++) {
    const t = Math.pow(Math.random() * 2 - 1, 3);
    const py = 64 + t * 52;
    const extent = 118 * Math.cos(((py - 64) / 64) * Math.PI * 0.45);
    if (extent < 8) continue;
    const x0 = 128 - extent * (0.35 + Math.random() * 0.65);
    const x1 = 128 + extent * (0.35 + Math.random() * 0.65);
    x.globalAlpha = 0.05 + Math.random() * 0.11;
    x.lineWidth = 1.4 + Math.random() * 1.8;
    x.beginPath(); x.moveTo(x0, py); x.lineTo(x1, py + (Math.random() * 2 - 1)); x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const sketchShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false })
);
sketchShadow.rotation.x = -Math.PI / 2;
sketchShadow.rotation.z = -0.12;
sketchShadow.position.y = 0.006;
sketchShadow.renderOrder = 1;
sketchShadow.visible = false;
scene.add(sketchShadow);
function updateSketchShadow() {
  if (!charGroup) { sketchShadow.visible = false; return; }
  sketchShadow.visible = true;
  const h = Math.max(0, livePose.moveY);   // height above the rest pose
  const shrink = clamp(1.18 - h * 0.13, 0.55, 1.18);
  sketchShadow.position.x = charGroup.position.x - 0.38 * ballRadius;
  sketchShadow.position.z = charGroup.position.z - 0.22 * ballRadius;
  sketchShadow.scale.set(
    3.4 * ballRadius * shrink * Math.max(livePose.scaleX, 0.4),
    1.5 * ballRadius * shrink, 1);
  sketchShadow.material.opacity = clamp(0.92 - h * 0.20, 0.30, 0.92);
}
const unitSphere = new THREE.SphereGeometry(1, 32, 24);

function disposeGroup(g) {
  g.traverse((o) => { if (o.geometry && o.geometry !== unitSphere) o.geometry.dispose(); });
}

function buildRig() {
  if (charGroup) { scene.remove(charGroup); disposeGroup(charGroup); }
  for (const g of ghostPool) { scene.remove(g.mesh); g.mesh.material.dispose(); }
  ghostPool = [];
  charGroup = new THREE.Group();
  charGroup.name = 'BallControl';
  ballRadius = 0.9 * sliders.ballSize;
  legClear = template === 3 ? sliders.legLength * 0.85 : 0;

  ballMesh = new THREE.Mesh(unitSphere, ballMat);
  ballMesh.name = 'Ball';
  addOutline(ballMesh, 1.04);
  // Red center line around the ball, so rotation reads at a
  // glance. One tick dot on the line shows spin along the
  // line too. Both ride on the ball, squash and all.
  const seam = new THREE.Mesh(new THREE.TorusGeometry(1.005, 0.022, 10, 72), seamMat);
  seam.name = 'CenterLine';
  seam.rotation.x = Math.PI / 2;   // the line lies flat: a horizontal equator
  ballMesh.add(seam);
  const tick = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), seamMat);
  tick.position.set(1.005, 0, 0);
  ballMesh.add(tick);
  charGroup.add(ballMesh);

  tailJoints = []; tailRoot = null; legL = null; legR = null;
  tailCtrlJoints = { tail1: null, tail2: null, tail3: null };
  tailCtrlMeshes = [];
  if (template === 2) {
    // A chain of small spheres. Each joint bends a little.
    const count = Math.round(sliders.tailLength);
    const segLen = ballRadius * 0.55;
    tailRoot = new THREE.Group(); tailRoot.name = 'TailRoot';
    charGroup.add(tailRoot);
    let parent = tailRoot;
    for (let i = 0; i < count; i++) {
      const joint = new THREE.Group();
      joint.name = 'Tail' + (i + 1);
      joint.position.x = i === 0 ? 0 : segLen;
      const seg = new THREE.Mesh(unitSphere, tailMat);
      const r = ballRadius * (0.34 - i * 0.035);
      seg.scale.setScalar(Math.max(r, 0.08));
      seg.position.x = segLen / 2;
      addOutline(seg, 1.06);
      joint.add(seg);
      parent.add(joint);
      tailJoints.push(joint);
      parent = joint;
    }
    // Three controllers along the tail: base, mid, and tip.
    // Each controller is a ring in the 3D view. Click a ring to pick
    // it, then rotate it. Its bend runs from its joint to the tip.
    const ctrlIdx = {
      tail1: 0,
      tail2: Math.floor(count / 3),
      tail3: Math.floor((2 * count) / 3)
    };
    const seen = new Set();
    for (const name of TAIL_CHANNELS) {
      const idx = ctrlIdx[name];
      if (idx >= count || seen.has(idx)) continue;
      seen.add(idx);
      const joint = tailJoints[idx];
      tailCtrlJoints[name] = joint;
      const r = ballRadius * (0.34 - idx * 0.035) + 0.14;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.035, 10, 28),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(CHAN_COLOR[name]) })
      );
      ring.rotation.y = Math.PI / 2;   // the ring stands around the tail
      ring.userData.ctrl = name;
      joint.add(ring);
      // A loose second ring: the sketched double-stroke look.
      const twin = new THREE.Mesh(ring.geometry, ring.material);
      twin.rotation.set(0.07, Math.PI / 2, 0);
      twin.scale.setScalar(1.12);
      twin.position.x = 0.02;
      joint.add(twin);
      tailCtrlMeshes.push(ring);
    }
  }
  if (template === 3) {
    // Two simple legs under the ball.
    const legLen = sliders.legLength * 0.85;
    const mkLeg = (name, z) => {
      const hip = new THREE.Group();
      hip.name = name;
      hip.position.set(0, -ballRadius, z);   // hip at the bottom of the ball (pivot is the center)
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, legLen, 10), legMat);
      cyl.position.y = -legLen / 2;
      const foot = new THREE.Mesh(unitSphere, legMat);
      foot.scale.set(0.24, 0.12, 0.16);
      foot.position.set(0.1, -legLen, 0);
      addOutline(foot, 1.07);
      hip.add(cyl); hip.add(foot);
      charGroup.add(hip);
      return hip;
    };
    legL = mkLeg('LegL', ballRadius * 0.42);
    legR = mkLeg('LegR', -ballRadius * 0.42);
  }

  // Ghost pool: up to 8 ghosts per side. Each ghost gets
  // its own material, so near ghosts can draw darker
  // than far ghosts.
  ghostPool = [];
  for (const side of [-1, 1]) {
    for (let idx = 1; idx <= 8; idx++) {
      const m = new THREE.Mesh(unitSphere, ghostMat.clone());
      // Behind ghosts are red. Ahead ghosts are blue.
      m.material.color.set(side < 0 ? 0xd94f4f : 0x3f7fbf);
      m.name = side < 0 ? `GhostBefore${idx}` : `GhostAfter${idx}`;
      m.visible = false;
      scene.add(m);
      ghostPool.push({ mesh: m, side, idx });
    }
  }
  scene.add(charGroup);
  selectedCtrl = 'ball';
  tc.attach(charGroup);
  applyPose();
}

// Pose the character from the live pose values.
function applyPose() {
  if (!charGroup) return;
  const p = livePose;
  // The group origin IS the ball center. moveY 0 = the ball rests on
  // the ground (or on its legs), so the center sits one radius up.
  charGroup.position.set(p.moveX, legClear + ballRadius + p.moveY, p.moveZ);
  charGroup.rotation.set(rad(p.rotateX), rad(p.rotateY), rad(p.rotateZ));
  // Squash grows and shrinks around the center. The center does not move.
  ballMesh.position.y = 0;
  ballMesh.scale.set(ballRadius * p.scaleX, ballRadius * p.scaleY, ballRadius * p.scaleZ);
  if (tailRoot) {
    tailRoot.position.set(ballRadius * 0.72, ballRadius * 0.3, 0);
    // The Tail bend slider is a soft base curl, spread over all joints.
    const each = tailJoints.length ? sliders.tailBend / tailJoints.length : 0;
    for (const j of tailJoints) j.rotation.set(0, 0, each);
    // Each controller adds its own bend at its joint, in degrees.
    // The bend runs from that joint to the tip, so Tail 1 one way
    // and Tail 2 the other way makes an S shape.
    for (const name of TAIL_CHANNELS) {
      const j = tailCtrlJoints[name];
      if (j) j.rotation.z = each + rad(p[name]);
    }
  }
  if (legL) { legL.rotation.z = p.legStep; legR.rotation.z = -p.legStep; }
  updateGhosts();
  updateSettings();
}

// Ghosts (onion skins): ball poses before and after this
// frame. Ghosts near the frame are darker. Ghosts far
// from the frame are lighter.
function updateGhosts() {
  const show = ghostOn && !playblastActive;
  for (const g of ghostPool) {
    const mesh = g.mesh;
    const limit = g.side > 0 ? ghostAhead : ghostBehind;
    if (!show || g.idx > limit) { mesh.visible = false; continue; }
    const f = currentFrame + g.side * g.idx * ghostStep;
    mesh.visible = f >= FIRST_FRAME && f <= LAST_FRAME;
    if (!mesh.visible) continue;
    const t = limit > 1 ? (g.idx - 1) / (limit - 1) : 0;
    mesh.material.opacity = 0.5 + (0.08 - 0.5) * t;
    const gp = evalAll(f);
    mesh.position.set(
      gp.moveX,
      gp.moveY + legClear + ballRadius,
      gp.moveZ
    );
    mesh.scale.set(ballRadius * gp.scaleX, ballRadius * gp.scaleY, ballRadius * gp.scaleZ);
  }
}

function updateSettings() {
  // The settings boxes show the live values. A box the user is
  // typing in is left alone until the typing is done.
  for (const input of document.querySelectorAll('.chan-input')) {
    if (document.activeElement === input) continue;
    input.value = fmt(livePose[input.dataset.chan]);
  }
  $('setFrame').textContent = String(currentFrame);
}

// ---------- Frame control ----------
function setFrame(f) {
  currentFrame = clamp(Math.round(f), FIRST_FRAME, LAST_FRAME);
  frameFloat = currentFrame;
  livePose = evalAll(currentFrame);
  applyPose();
  $('frameReadout').textContent = `Frame ${currentFrame} / ${LAST_FRAME}`;
  drawRuler();
  if (graphOpen) drawGraph();
}

// One undo step per tool drag: the state at the start of the drag.
tc.addEventListener('dragging-changed', (e) => {
  if (e.value) pushHistory('Move with tool');
});

// Dragging with a tool writes back into the live pose (not yet keyed).
tc.addEventListener('objectChange', () => {
  if (!charGroup) return;
  if (selectedCtrl !== 'ball') {
    // A tail controller is picked. Only its bend (rotation z) counts.
    const j = tailCtrlJoints[selectedCtrl];
    if (j) {
      const base = tailJoints.length ? sliders.tailBend / tailJoints.length : 0;
      const deg = (j.rotation.z - base) * 180 / Math.PI;
      livePose[selectedCtrl] = Math.round(clamp(deg, -170, 170) * 100) / 100;
    }
    applyPose();
    if (autoKeyOn) { writeKeys(); drawRuler(); if (graphOpen) drawGraph(); }
    return;
  }
  if (tc.mode === 'scale') {
    // Scale lives on the ball, not the whole group. Move it across.
    livePose.scaleX *= charGroup.scale.x;
    livePose.scaleY *= charGroup.scale.y;
    livePose.scaleZ *= charGroup.scale.z;
    charGroup.scale.set(1, 1, 1);
  } else {
    livePose.moveX = charGroup.position.x;
    // The group sits at the ball center: take the rest height back off.
    livePose.moveY = charGroup.position.y - (legClear + ballRadius);
    livePose.moveZ = charGroup.position.z;
    livePose.rotateX = charGroup.rotation.x * 180 / Math.PI;
    livePose.rotateY = charGroup.rotation.y * 180 / Math.PI;
    livePose.rotateZ = charGroup.rotation.z * 180 / Math.PI;
  }
  applyPose();
  // Auto Key: any move with a tool writes keys at this frame.
  if (autoKeyOn) { writeKeys(); drawRuler(); if (graphOpen) drawGraph(); }
});

// ---------- Tools ----------
function selectedObject() {
  return selectedCtrl === 'ball' ? charGroup : tailCtrlJoints[selectedCtrl];
}
function setTool(tool) {
  activeTool = tool;
  document.querySelectorAll('.tool-btn[data-tool]').forEach((b) =>
    b.classList.toggle('active', b.dataset.tool === tool));
  if (tool === 'select') { tc.detach(); return; }
  const obj = selectedObject();
  if (obj) tc.attach(obj);
  tc.setMode(tool === 'move' ? 'translate' : tool);
}

// Pick the ball or a tail controller by clicking in the 3D view.
function selectControl(name) {
  if (name !== 'ball' && !tailCtrlJoints[name]) return;
  selectedCtrl = name;
  if (name === 'ball') {
    say('Ball picked.');
  } else {
    say(`${CHAN_LABEL[name]} picked. Use the Rotate tool (E) and drag the round arrows.`);
    if (activeTool === 'move' || activeTool === 'scale') setTool('rotate');
  }
  if (activeTool !== 'select') {
    const obj = selectedObject();
    if (obj) tc.attach(obj);
  }
}
const raycaster = new THREE.Raycaster();
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.altKey || !charGroup) return;
  if (tc.axis) return;   // the press is on the tool gizmo, not the rig
  const rect = renderer.domElement.getBoundingClientRect();
  const nd = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(nd, camera);
  const ringHits = raycaster.intersectObjects(tailCtrlMeshes, false);
  if (ringHits.length) { selectControl(ringHits[0].object.userData.ctrl); return; }
  const rigHits = raycaster.intersectObject(charGroup, true);
  if (rigHits.length && selectedCtrl !== 'ball') selectControl('ball');
});
document.querySelectorAll('.tool-btn[data-tool]').forEach((b) =>
  b.addEventListener('click', () => setTool(b.dataset.tool)));

// Write keys for ALL channels at this frame, from the live pose:
// the ball transform, the three tail controllers, and leg step.
function writeKeys() {
  for (const name of CHANNEL_NAMES) {
    const old = channels[name].find((k) => k.frame === currentFrame);
    addKey(name, currentFrame, Math.round(livePose[name] * 100) / 100, old ? old.tangent : 'auto');
  }
}
function setKey() {
  pushHistory('Set key');
  writeKeys();
  // The fresh key picks itself on the timeline, ready to move or copy.
  tlSelFrames.clear();
  tlSelFrames.add(currentFrame);
  say(`Key set at frame ${currentFrame}.`);
  drawRuler();
  updateKeyTools();
  if (graphOpen) drawGraph();
}
$('btnSetKey').addEventListener('click', setKey);
// Right click on Set Key: turn Auto Key on or off.
// With Auto Key on, any move sets a key at this frame.
$('btnSetKey').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  autoKeyOn = !autoKeyOn;
  $('btnSetKey').classList.toggle('autokey-on', autoKeyOn);
  $('autoKeyTag').classList.toggle('hidden', !autoKeyOn);
  say(autoKeyOn
    ? 'Auto Key is ON. Any move sets a key at this frame. Right click Set Key to turn it off.'
    : 'Auto Key is OFF.');
});

// Type a value in a Settings box: the pose takes the value at once.
// With Auto Key on, the typed value also sets a key.
document.querySelectorAll('.chan-input').forEach((input) => {
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
  input.addEventListener('change', () => {
    const name = input.dataset.chan;
    const v = parseFloat(input.value);
    if (!isFinite(v)) { updateSettings(); return; }
    if (Math.round(v * 100) / 100 !== livePose[name]) pushHistory('Type value');
    livePose[name] = Math.round(v * 100) / 100;
    applyPose();
    if (autoKeyOn) { writeKeys(); drawRuler(); if (graphOpen) drawGraph(); }
    updateSettings();
  });
});

function setGhost(on) {
  ghostOn = on;
  $('btnGhost').classList.toggle('on', on);
  $('ghostBox').classList.toggle('hidden', !on);
  updateGhosts();
}
// Pressing Ghost turns ghosts on and opens the options
// box. Pressing it again with the box open turns them off.
// If the box was closed by hand, the press reopens it.
function ghostButtonPress() {
  if (!ghostOn) { setGhost(true); return; }
  if ($('ghostBox').classList.contains('hidden')) {
    $('ghostBox').classList.remove('hidden');
    return;
  }
  setGhost(false);
}
$('btnGhost').addEventListener('click', ghostButtonPress);
$('ghostClose').addEventListener('click', () => $('ghostBox').classList.add('hidden'));
function ghostSetting(input, min, max, fallback) {
  const v = parseInt(input.value, 10);
  return isFinite(v) ? clamp(v, min, max) : fallback;
}
$('ghostBehind').addEventListener('input', () => {
  ghostBehind = ghostSetting($('ghostBehind'), 0, 8, 3);
  updateGhosts();
});
$('ghostAhead').addEventListener('input', () => {
  ghostAhead = ghostSetting($('ghostAhead'), 0, 8, 3);
  updateGhosts();
});
$('ghostStep').addEventListener('input', () => {
  ghostStep = ghostSetting($('ghostStep'), 1, 24, 4);
  updateGhosts();
});
for (const id of ['ghostBehind', 'ghostAhead', 'ghostStep']) {
  $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
}

function setGizmoSize(factor) {
  // Grow or shrink the tool gizmo in the viewport.
  const next = clamp(Math.round(tc.size * factor * 100) / 100, 0.25, 4);
  tc.setSize(next);
  say(`Gizmo size ${Math.round(next * 100)}%.`);
}
function stepPlayheadToKey(dir) {
  // Jump the playhead to the next or previous key frame.
  // With the Graph Editor open, only its picked curves count.
  let frames;
  if (graphOpen && typeof geSelected !== 'undefined' && geSelected.size) {
    frames = new Set();
    for (const n of geSelected) for (const k of channels[n]) frames.add(k.frame);
  } else {
    frames = keyFrames();
  }
  const sorted = [...frames].sort((a, b) => a - b);
  stopPlay();
  let target;
  if (dir > 0) target = sorted.find((f) => f > currentFrame);
  else target = sorted.reverse().find((f) => f < currentFrame);
  if (target === undefined) {
    say(dir > 0 ? 'No key after this frame.' : 'No key before this frame.');
    return;
  }
  setFrame(target);
  if (graphOpen) drawGraph();
  say(`Frame ${target}.`);
}
window.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'c' && !graphOpen && tlSelFrames.size) {
    e.preventDefault(); copyTimelineKeys(); return;
  }
  if ((e.ctrlKey || e.metaKey) && k === 'v' && !graphOpen && tlClipboard) {
    e.preventDefault(); pasteTimelineKeys(); return;
  }
  if (graphOpen && k.startsWith('arrow')) {
    // Arrow keys shift picked keys while the Graph Editor is open.
    e.preventDefault();
    const fa = Math.max(1, parseInt($('geShiftFrames').value, 10) || 1);
    const va = parseFloat($('geShiftValue').value);
    const step = isFinite(va) ? va : 0.1;
    if (k === 'arrowleft') nudgeKeys(-fa, 0);
    else if (k === 'arrowright') nudgeKeys(fa, 0);
    else if (k === 'arrowup') nudgeKeys(0, step);
    else if (k === 'arrowdown') nudgeKeys(0, -step);
    return;
  }
  const dirKey = (e.code === 'Period' || e.key === '>' || e.key === '.') ? 1
    : (e.code === 'Comma' || e.key === '<' || e.key === ',') ? -1 : 0;
  if (dirKey !== 0 && (e.altKey || e.key === '>' || e.key === '<')) {
    // > jumps to the next key. < jumps to the previous key.
    // With Alt held, the same keys step one frame instead.
    // The key code is checked too, so Alt works on any layout.
    e.preventDefault();
    if (e.altKey) {
      stopPlay();
      setFrame(clamp(currentFrame + dirKey, FIRST_FRAME, LAST_FRAME));
      if (graphOpen) drawGraph();
      say(`Frame ${currentFrame}.`);
    } else {
      stepPlayheadToKey(dirKey);
    }
    return;
  }
  if (k === 'f') {
    // F frames: a picked key in the Graph Editor,
    // or the picked object in a viewport.
    e.preventDefault();
    if (graphOpen) frameGeKey(); else frameViewport();
    return;
  }
  if (k === 'q') setTool('select');
  else if (k === 'w') setTool('move');
  else if (k === 'e') setTool('rotate');
  else if (k === 'r') setTool('scale');
  else if (k === 's') setKey();
  else if (k === 'g') ghostButtonPress();
  else if (k === '+' || k === '=') { e.preventDefault(); setGizmoSize(1.1); }
  else if (k === '-' || k === '_') { e.preventDefault(); setGizmoSize(0.9); }
  else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (graphOpen) { e.preventDefault(); deletePickedKey(); }
    else if (tlSelFrames.size) { e.preventDefault(); deleteTimelineKeys(); }
  }
  else if (k === ' ') { e.preventDefault(); playing ? stopPlay() : startPlay(); }
});

// ---------- Timeline ruler ----------
const ruler = $('ruler');
const rctx = ruler.getContext('2d');
function rulerGeom() {
  const w = ruler.clientWidth, h = ruler.clientHeight;
  const padL = 26, padR = 12;
  return { w, h, padL, frameX: (f) => padL + ((f - 1) / (LAST_FRAME - 1)) * (w - padL - padR) };
}
function sizeRuler() {
  const dpr = Math.min(window.devicePixelRatio, 2);
  ruler.width = ruler.clientWidth * dpr;
  ruler.height = ruler.clientHeight * dpr;
  rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawRuler();
}
function keyFrames() {
  const set = new Set();
  for (const name of CHANNEL_NAMES) for (const k of channels[name]) set.add(k.frame);
  return set;
}
function drawRuler() {
  if (!ruler.clientWidth) return;
  const { w, h, frameX } = rulerGeom();
  rctx.clearRect(0, 0, w, h);
  rctx.fillStyle = '#fffdf2';
  rctx.fillRect(0, 0, w, h);
  rctx.strokeStyle = '#b9ac8d';
  rctx.strokeRect(0.5, 0.5, w - 1, 34);
  rctx.font = '11px sans-serif';
  rctx.textAlign = 'center';
  for (let f = FIRST_FRAME; f <= LAST_FRAME; f++) {
    const x = frameX(f);
    rctx.strokeStyle = '#8fa0bb';
    rctx.beginPath(); rctx.moveTo(x, 24); rctx.lineTo(x, 33); rctx.stroke();
    if ((f - 1) % 4 === 0) { rctx.fillStyle = '#5a6c8a'; rctx.fillText(String(f), x, 14); }
  }
  // Key diamonds. Picked keys are rose, larger, and ink-edged.
  const framesNow = keyFrames();
  for (const f of [...tlSelFrames]) if (!framesNow.has(f)) tlSelFrames.delete(f);
  for (const f of [...framesNow].sort((a, b) => a - b)) {
    const x = frameX(f), y = 48;
    const picked = tlSelFrames.has(f);
    const r = picked ? 8.5 : 7;
    rctx.beginPath();
    rctx.moveTo(x, y - r); rctx.lineTo(x + r, y); rctx.lineTo(x, y + r); rctx.lineTo(x - r, y);
    rctx.closePath();
    rctx.fillStyle = picked ? '#d3546b' : '#ffb042';
    rctx.fill();
    if (picked) { rctx.strokeStyle = '#3c4a63'; rctx.lineWidth = 1.5; rctx.stroke(); rctx.lineWidth = 1; }
  }
  // Playhead.
  const px = frameX(currentFrame);
  rctx.strokeStyle = '#d3546b'; rctx.lineWidth = 2;
  rctx.beginPath(); rctx.moveTo(px, 0); rctx.lineTo(px, h); rctx.stroke();
  rctx.lineWidth = 1;
  rctx.fillStyle = '#d3546b';
  rctx.beginPath(); rctx.moveTo(px - 6, 0); rctx.lineTo(px + 6, 0); rctx.lineTo(px, 9);
  rctx.closePath(); rctx.fill();
}
let rulerDrag = false;
function rulerFrameFromEvent(e) {
  const rect = ruler.getBoundingClientRect();
  const { w, padL } = rulerGeom();
  const ratio = (e.clientX - rect.left - padL) / (w - padL - 12);
  return clamp(Math.round(1 + ratio * (LAST_FRAME - 1)), FIRST_FRAME, LAST_FRAME);
}

// ---------- Timeline key editing ----------
// A timeline pick is a FRAME. The pick covers every channel
// key at that frame, like a Maya keyframe. Shift+click adds
// picks. Middle-drag moves the picked frames left or right.
const tlSelFrames = new Set();
let tlClipboard = null;   // {anchor, keys:[{chan, off, value, tangent, slopeIn?, slopeOut?}]}
let tlKeyDrag = null;     // {lastFrame, historyDone}
function sortedTlSel() { return [...tlSelFrames].sort((a, b) => a - b); }
function updateKeyTools() {
  const info = $('keySelInfo');
  if (!info) return;
  const n = tlSelFrames.size;
  info.textContent = n ? `${n} key frame${n > 1 ? 's' : ''} picked` : 'No key picked';
}
function refreshAfterKeyEdit(msg) {
  livePose = evalAll(currentFrame);
  applyPose();
  drawRuler();
  if (graphOpen) { drawGraph(); geInfo(); }
  updateKeyTools();
  if (msg) say(msg);
}
function canMoveSelectedOne(delta) {
  const frames = sortedTlSel();
  if (!frames.length) return false;
  const targets = frames.map((f) => f + delta);
  if (targets.some((f) => f < FIRST_FRAME || f > LAST_FRAME)) return false;
  const selSet = new Set(frames);
  for (const name of CHANNEL_NAMES) {
    for (const k of channels[name]) {
      if (targets.includes(k.frame) && !selSet.has(k.frame)) return false;   // a key is in the way
    }
  }
  return true;
}
function moveSelectedFramesOne(delta) {
  const frames = sortedTlSel();
  const selSet = new Set(frames);
  for (const name of CHANNEL_NAMES) {
    for (const k of channels[name]) if (selSet.has(k.frame)) k.frame += delta;
    sortKeys(name);
  }
  tlSelFrames.clear();
  for (const f of frames) tlSelFrames.add(f + delta);
  return true;
}
function shiftSelectedFrames(delta) {
  if (!tlSelFrames.size) { say('Pick a key on the timeline first.'); return; }
  if (!canMoveSelectedOne(Math.sign(delta))) {
    say('Those keys cannot move that way. A key is in the way, or the scene ends.');
    return;
  }
  pushHistory('Move keys');
  let moved = 0;
  while (moved < Math.abs(delta) && canMoveSelectedOne(Math.sign(delta))) {
    moveSelectedFramesOne(Math.sign(delta));
    moved++;
  }
  const note = moved < Math.abs(delta) ? ' A key stopped the move.' : '';
  refreshAfterKeyEdit(`Moved keys ${moved} frame${moved > 1 ? 's' : ''} ${delta < 0 ? 'left' : 'right'}.${note}`);
}
function deleteTimelineKeys() {
  if (!tlSelFrames.size) { say('Pick a key on the timeline first.'); return; }
  pushHistory('Delete keys');
  let n = 0;
  for (const name of CHANNEL_NAMES) {
    const before = channels[name].length;
    channels[name] = channels[name].filter((k) => !tlSelFrames.has(k.frame));
    n += before - channels[name].length;
  }
  const frames = tlSelFrames.size;
  tlSelFrames.clear();
  refreshAfterKeyEdit(`Deleted ${frames} key frame${frames > 1 ? 's' : ''} (${n} channel keys).`);
}
function copyTimelineKeys() {
  if (!tlSelFrames.size) { say('Pick a key on the timeline first.'); return; }
  const frames = sortedTlSel();
  const anchor = frames[0];
  const keys = [];
  for (const name of CHANNEL_NAMES) {
    for (const k of channels[name]) {
      if (!tlSelFrames.has(k.frame)) continue;
      keys.push({
        chan: name, off: k.frame - anchor, value: k.value, tangent: k.tangent,
        ...(typeof k.slopeIn === 'number' ? { slopeIn: k.slopeIn } : {}),
        ...(typeof k.slopeOut === 'number' ? { slopeOut: k.slopeOut } : {}),
        ...(typeof k.lenIn === 'number' ? { lenIn: k.lenIn } : {}),
        ...(typeof k.lenOut === 'number' ? { lenOut: k.lenOut } : {})
      });
    }
  }
  tlClipboard = { anchor, keys };
  say(`Copied ${frames.length} key frame${frames.length > 1 ? 's' : ''}. Move the playhead, then press Paste.`);
}
function pasteTimelineKeys() {
  if (!tlClipboard) { say('Copy a key first.'); return; }
  const dest = currentFrame;
  if (tlClipboard.keys.some((k) => dest + k.off < FIRST_FRAME || dest + k.off > LAST_FRAME)) {
    say('Paste would fall outside the scene. Move the playhead and try again.');
    return;
  }
  pushHistory('Paste keys');
  const pasted = new Set();
  for (const item of tlClipboard.keys) {
    const f = dest + item.off;
    const old = channels[item.chan].find((k) => k.frame === f);
    if (old) channels[item.chan].splice(channels[item.chan].indexOf(old), 1);   // paste replaces a key in the way
    const nk = { frame: f, value: item.value, tangent: item.tangent };
    if (typeof item.slopeIn === 'number') nk.slopeIn = item.slopeIn;
    if (typeof item.slopeOut === 'number') nk.slopeOut = item.slopeOut;
    if (typeof item.lenIn === 'number') nk.lenIn = item.lenIn;
    if (typeof item.lenOut === 'number') nk.lenOut = item.lenOut;
    channels[item.chan].push(nk);
    pasted.add(f);
  }
  for (const name of CHANNEL_NAMES) sortKeys(name);
  tlSelFrames.clear();
  for (const f of pasted) tlSelFrames.add(f);
  refreshAfterKeyEdit(`Pasted keys at frame ${dest}.`);
}
function rulerKeyHit(e) {
  const rect = ruler.getBoundingClientRect();
  const { frameX } = rulerGeom();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;
  if (py < 30) return null;   // the diamond row lives below the numbers
  for (const f of keyFrames()) if (Math.abs(px - frameX(f)) <= 9) return f;
  return null;
}
ruler.addEventListener('pointerdown', (e) => {
  stopPlay();
  ruler.setPointerCapture(e.pointerId);
  const hit = rulerKeyHit(e);
  if (e.button === 1) {
    // Middle mouse: pick keys and drag them along the ruler.
    e.preventDefault();
    if (hit !== null) {
      if (e.shiftKey) tlSelFrames.add(hit);
      else if (!tlSelFrames.has(hit)) { tlSelFrames.clear(); tlSelFrames.add(hit); }
      tlKeyDrag = { lastFrame: hit, historyDone: false };
      setFrame(hit);
    }
    updateKeyTools();
    return;
  }
  if (e.button !== 0) return;
  if (hit !== null) {
    if (e.shiftKey) { tlSelFrames.has(hit) ? tlSelFrames.delete(hit) : tlSelFrames.add(hit); }
    else if (!tlSelFrames.has(hit)) { tlSelFrames.clear(); tlSelFrames.add(hit); }
    setFrame(hit);
    updateKeyTools();
    return;
  }
  if (!e.shiftKey) { tlSelFrames.clear(); updateKeyTools(); }
  rulerDrag = true;
  setFrame(rulerFrameFromEvent(e));
});
ruler.addEventListener('pointermove', (e) => {
  if (tlKeyDrag) {
    let delta = rulerFrameFromEvent(e) - tlKeyDrag.lastFrame;
    while (delta !== 0) {
      const step = Math.sign(delta);
      if (!canMoveSelectedOne(step)) break;
      if (!tlKeyDrag.historyDone) { pushHistory('Move keys'); tlKeyDrag.historyDone = true; }
      moveSelectedFramesOne(step);
      tlKeyDrag.lastFrame += step;
      delta -= step;
    }
    if (tlKeyDrag.historyDone) { setFrame(tlKeyDrag.lastFrame); refreshAfterKeyEdit(); }
    return;
  }
  if (rulerDrag) setFrame(rulerFrameFromEvent(e));
});
const endRulerDrag = () => { rulerDrag = false; tlKeyDrag = null; };
ruler.addEventListener('pointerup', endRulerDrag);
ruler.addEventListener('pointercancel', endRulerDrag);
ruler.addEventListener('contextmenu', (e) => e.preventDefault());

$('btnKeyCopy').addEventListener('click', copyTimelineKeys);
$('btnKeyPaste').addEventListener('click', pasteTimelineKeys);
$('btnKeyDelete').addEventListener('click', deleteTimelineKeys);
function keyShiftAmount() {
  const v = parseInt($('keyShiftAmount').value, 10);
  return isFinite(v) && v > 0 ? Math.min(v, 480) : 1;
}
$('btnKeyLeft').addEventListener('click', () => shiftSelectedFrames(-keyShiftAmount()));
$('btnKeyRight').addEventListener('click', () => shiftSelectedFrames(keyShiftAmount()));
$('keyShiftAmount').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

// ---------- Play / stop ----------
function startPlay() { playing = true; $('btnPlay').innerHTML = '&#10073;&#10073; Pause'; }
function stopPlay() { playing = false; $('btnPlay').innerHTML = '&#9654; Play'; }
$('btnPlay').addEventListener('click', () => (playing ? stopPlay() : startPlay()));
$('btnStop').addEventListener('click', () => { stopPlay(); });
$('btnToStart').addEventListener('click', () => { stopPlay(); setFrame(FIRST_FRAME); });

// ---------- Scene length (the Frames box in the timeline) ----------
function setSceneLength(n) {
  LAST_FRAME = clamp(Math.round(n) || 48, 12, 480);
  $('sceneLen').value = LAST_FRAME;
  $('geFrameInput').max = LAST_FRAME;
  if (currentFrame > LAST_FRAME) setFrame(LAST_FRAME);
  else { drawRuler(); if (graphOpen) drawGraph(); }
}
$('sceneLen').addEventListener('change', () => {
  const v = parseInt($('sceneLen').value, 10);
  if (!isFinite(v)) { $('sceneLen').value = LAST_FRAME; return; }
  const n = clamp(Math.round(v), 12, 480);
  if (n === LAST_FRAME) { $('sceneLen').value = LAST_FRAME; return; }
  pushHistory('Scene length');
  setSceneLength(n);
  say(`Scene length is now ${LAST_FRAME} frames.`);
});

// ---------- Rig panel ----------
function setTemplate(t) {
  template = t;
  document.querySelectorAll('.tpl-btn').forEach((b) =>
    b.classList.toggle('active', Number(b.dataset.tpl) === t));
  $('lessonSelect').value = String(t);
  buildRig();
}
document.querySelectorAll('.tpl-btn').forEach((b) =>
  b.addEventListener('click', () => {
    const t = Number(b.dataset.tpl);
    if (t !== template) pushHistory('Change rig');
    setTemplate(t);
  }));
$('btnBuildRig').addEventListener('click', () => { buildRig(); say('Rig built.'); });
$('lessonSelect').addEventListener('change', (e) => {
  const t = Number(e.target.value);
  if (t !== template) pushHistory('Change rig');
  setTemplate(t);
});

// One undo step per slider drag: save the state at the first move.
const sliderBurst = {};
function noteSliderStart(id, label) {
  if (!sliderBurst[id]) { pushHistory(label); sliderBurst[id] = true; }
}
for (const id of ['sldSize', 'sldTailLen', 'sldTailBend', 'sldLegLen']) {
  $(id).addEventListener('change', () => { sliderBurst[id] = false; });
}
$('sldSize').addEventListener('input', (e) => { noteSliderStart('sldSize', 'Ball size'); sliders.ballSize = Number(e.target.value); buildRig(); });
$('sldTailLen').addEventListener('input', (e) => { noteSliderStart('sldTailLen', 'Tail length'); sliders.tailLength = Number(e.target.value); buildRig(); });
$('sldTailBend').addEventListener('input', (e) => { noteSliderStart('sldTailBend', 'Tail bend'); sliders.tailBend = Number(e.target.value); applyPose(); });
$('sldLegLen').addEventListener('input', (e) => { noteSliderStart('sldLegLen', 'Leg length'); sliders.legLength = Number(e.target.value); buildRig(); });

// ---------- Save / Open project JSON ----------
function projectData() {
  return {
    app: 'ANIMATE', version: 1, name: SCENE_NAME,
    template, sliders: { ...sliders }, channels, frames: LAST_FRAME
  };
}
$('btnSave').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(projectData(), null, 2)], { type: 'application/json' });
  downloadBlob(blob, SCENE_NAME + '.animate.json');
  say('Project saved as a JSON file.');
});
$('btnOpen').addEventListener('click', () => $('openFile').click());
$('openFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.channels) throw new Error('no channels');
    pushHistory('Open file');
    channels = emptyChannels();
    for (const name of CHANNEL_NAMES) {
      if (Array.isArray(data.channels[name])) {
        channels[name] = data.channels[name]
          .filter((k) => typeof k.frame === 'number' && typeof k.value === 'number')
          .map((k) => ({
            frame: k.frame, value: k.value, tangent: k.tangent || 'auto',
            ...(typeof k.slopeIn === 'number' ? { slopeIn: k.slopeIn } : {}),
            ...(typeof k.slopeOut === 'number' ? { slopeOut: k.slopeOut } : {}),
            ...(typeof k.lenIn === 'number' ? { lenIn: k.lenIn } : {}),
            ...(typeof k.lenOut === 'number' ? { lenOut: k.lenOut } : {})
          }));
        sortKeys(name);
      }
    }
    // Old files have one Tail Bend channel. Its keys move to Tail 1,
    // with values changed from bend units to degrees.
    if (Array.isArray(data.channels.tailBend)) {
      for (const k of data.channels.tailBend) {
        if (typeof k.frame === 'number' && typeof k.value === 'number') {
          addKey('tail1', k.frame, Math.round(k.value * 57.3 * 100) / 100, k.tangent || 'auto');
        }
      }
    }
    if (data.sliders) Object.assign(sliders, data.sliders);
    $('sldSize').value = sliders.ballSize;
    $('sldTailLen').value = sliders.tailLength;
    $('sldTailBend').value = sliders.tailBend;
    $('sldLegLen').value = sliders.legLength;
    if (data.frames) setSceneLength(data.frames);
    stopPlay();
    setTemplate([1, 2, 3].includes(data.template) ? data.template : 2);
    setFrame(FIRST_FRAME);
    say('Project opened.');
  } catch (err) {
    say('That file could not be opened.');
  }
});

// ---------- Graph Editor (separate window) ----------
let graphOpen = false;
let geChannel = 'moveY';                 // the main picked channel
let geSelected = new Set(['moveY']);     // all picked channels (Shift+click adds more)
let geKeyChannel = 'moveY';              // the channel of the picked key
let geShowAll = false;
let geSelectedKey = null;   // a key object inside channels[geKeyChannel]
let geSelKeys = [];         // [{chan, key}] all picked keys (click or drag box)
let geMarquee = null;       // the live drag box {x0, y0, x1, y1, add}
let geHandles = null;       // screen points of the active key's bezier handles
let geDrag = null;
let geView = null;          // zoomed view {f0, f1, v0, v1}; null = full auto view
function keyIsPicked(key) { return geSelKeys.some((s) => s.key === key); }

// The length of one bezier handle, in frames: the stored
// length if the handle was dragged, else a third of the span
// to the next key (the neutral length), else 4 at the ends.
function keyHandleLen(name, key, side) {
  const keys = channels[name];
  const i = keys.indexOf(key);
  if (side === 'out') {
    if (typeof key.lenOut === 'number') return key.lenOut;
    const next = keys[i + 1];
    return next ? (next.frame - key.frame) / 3 : 4;
  }
  if (typeof key.lenIn === 'number') return key.lenIn;
  const prev = keys[i - 1];
  return prev ? (key.frame - prev.frame) / 3 : 4;
}

// The slope of a key on one side, as the curve math sees it:
// a bezier slope set by hand wins, then the tangent type rules.
function keySlope(name, key, side) {
  const custom = side === 'out' ? key.slopeOut : key.slopeIn;
  if (typeof custom === 'number') return custom;
  if (key.tangent === 'flat' || key.tangent === 'step') return 0;
  const keys = channels[name];
  const i = keys.indexOf(key);
  const prev = keys[i - 1], next = keys[i + 1];
  if (key.tangent === 'linear') {
    if (side === 'out') return next ? (next.value - key.value) / Math.max(1, next.frame - key.frame) : 0;
    return prev ? (key.value - prev.value) / Math.max(1, key.frame - prev.frame) : 0;
  }
  const a = prev || key, b = next || key;
  if (a === b) return 0;
  return (b.value - a.value) / Math.max(1, b.frame - a.frame);
}
const geCanvas = $('geCanvas');
const gctx = geCanvas.getContext('2d');

function buildGeChannelList() {
  const box = $('geChannels');
  box.innerHTML = '';
  const hint = document.createElement('div');
  hint.className = 'ge-hint';
  hint.textContent = 'Click: pick one curve. Shift+click: pick more curves. Wheel: zoom. Alt+middle-drag: pan. F: frame a picked key. Double-click graph: full view. > and < jump between keys. Alt+> and Alt+< step one frame.';
  box.appendChild(hint);
  const groups = [
    ['BALL CONTROL', TRANSFORM_CHANNELS],
    ['EXTRA', ['tail1', 'tail2', 'tail3', 'legStep']]
  ];
  for (const [gname, names] of groups) {
    const h = document.createElement('div');
    h.className = 'ge-group-name'; h.textContent = gname;
    box.appendChild(h);
    for (const name of names) {
      const b = document.createElement('button');
      b.className = 'ge-chan' + (geSelected.has(name) ? ' active' : '');
      b.innerHTML = `<span class="ge-dot" style="background:${CHAN_COLOR[name]}"></span>${CHAN_LABEL[name]}`;
      b.addEventListener('click', (e) => {
        if (e.shiftKey) {
          // Shift+click: add this curve to the pick, or take it out.
          if (geSelected.has(name)) {
            if (geSelected.size > 1) geSelected.delete(name);
          } else {
            geSelected.add(name);
          }
          geChannel = name;
        } else {
          geSelected = new Set([name]);
          geChannel = name;
        }
        geKeyChannel = geChannel;
        geSelectedKey = null;
        geSelKeys = [];
        buildGeChannelList(); drawGraph(); geInfo();
      });
      box.appendChild(b);
    }
  }
}
function geGeom() {
  const w = geCanvas.clientWidth, h = geCanvas.clientHeight;
  const padL = 48, padR = 14, padT = 14, padB = 26;
  // Auto value scale from the curves on show.
  const names = geShowAll ? CHANNEL_NAMES : [...geSelected];
  let lo = Infinity, hi = -Infinity;
  for (const n of names) {
    for (let f = FIRST_FRAME; f <= LAST_FRAME; f++) {
      const v = evalChannel(n, f);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    for (const k of channels[n]) { if (k.value < lo) lo = k.value; if (k.value > hi) hi = k.value; }
  }
  if (!isFinite(lo)) { lo = -1; hi = 1; }
  if (hi - lo < 1) { lo -= 0.5; hi += 0.5; }
  const pad = (hi - lo) * 0.15; lo -= pad; hi += pad;
  // A zoomed view (wheel or F key) replaces the auto range.
  let f0 = FIRST_FRAME, f1 = LAST_FRAME, v0 = lo, v1 = hi;
  if (geView) { f0 = geView.f0; f1 = geView.f1; v0 = geView.v0; v1 = geView.v1; }
  return {
    w, h, padL, padT,
    x: (f) => padL + ((f - f0) / (f1 - f0)) * (w - padL - padR),
    y: (v) => padT + (1 - (v - v0) / (v1 - v0)) * (h - padT - padB),
    frame: (px) => f0 + ((px - padL) / (w - padL - padR)) * (f1 - f0),
    value: (py) => v0 + (1 - (py - padT) / (h - padT - padB)) * (v1 - v0),
    lo: v0, hi: v1, f0, f1
  };
}
function sizeGeCanvas() {
  const dpr = Math.min(window.devicePixelRatio, 2);
  geCanvas.width = geCanvas.clientWidth * dpr;
  geCanvas.height = geCanvas.clientHeight * dpr;
  gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawGraph();
}
function drawGraph() {
  if (!graphOpen || !geCanvas.clientWidth) return;
  const g = geGeom();
  const { w, h } = g;
  gctx.clearRect(0, 0, w, h);
  gctx.fillStyle = '#fffef7'; gctx.fillRect(0, 0, w, h);
  // Faint ruled paper lines behind the curves.
  gctx.strokeStyle = 'rgba(120, 165, 220, 0.35)';
  gctx.beginPath();
  for (let y = 18; y < h; y += 26) { gctx.moveTo(0, y); gctx.lineTo(w, y); }
  gctx.stroke();
  // Grid.
  gctx.font = '11px sans-serif'; gctx.textAlign = 'center';
  const fStep = (g.f1 - g.f0) > 24 ? 4 : (g.f1 - g.f0) > 10 ? 2 : 1;
  for (let f = Math.max(FIRST_FRAME, Math.ceil(g.f0)); f <= Math.min(LAST_FRAME, g.f1); f += fStep) {
    const x = g.x(f);
    gctx.strokeStyle = '#dbe4f0';
    gctx.beginPath(); gctx.moveTo(x, g.padT); gctx.lineTo(x, h - 26); gctx.stroke();
    gctx.fillStyle = '#5a6c8a'; gctx.fillText(String(f), x, h - 8);
  }
  for (let i = 0; i <= 4; i++) {
    const v = g.lo + ((g.hi - g.lo) * i) / 4;
    const y = g.y(v);
    gctx.strokeStyle = '#dbe4f0';
    gctx.beginPath(); gctx.moveTo(g.padL, y); gctx.lineTo(w - 14, y); gctx.stroke();
    gctx.fillStyle = '#5a6c8a'; gctx.textAlign = 'right';
    gctx.fillText(fmt(v), g.padL - 6, y + 4);
    gctx.textAlign = 'center';
  }
  if (g.lo < 0 && g.hi > 0) {
    gctx.strokeStyle = '#3c4a63';
    gctx.beginPath(); gctx.moveTo(g.padL, g.y(0)); gctx.lineTo(w - 14, g.y(0)); gctx.stroke();
  }
  // Curves. Picked channels are bright. The rest are faint.
  const drawCurve = (name, bright, width) => {
    gctx.strokeStyle = CHAN_COLOR[name];
    gctx.globalAlpha = bright ? 1 : 0.4;
    gctx.lineWidth = width;
    gctx.beginPath();
    for (let f = FIRST_FRAME; f <= LAST_FRAME; f += 0.25) {
      const x = g.x(f), y = g.y(evalChannel(name, f));
      if (f === FIRST_FRAME) gctx.moveTo(x, y); else gctx.lineTo(x, y);
    }
    gctx.stroke();
    gctx.globalAlpha = 1; gctx.lineWidth = 1;
  };
  if (geShowAll) for (const n of CHANNEL_NAMES) if (!geSelected.has(n)) drawCurve(n, false, 1.5);
  for (const n of geSelected) if (n !== geChannel) drawCurve(n, true, 2.25);
  drawCurve(geChannel, true, 3);
  // Key dots on all picked channels. Picked keys are orange.
  for (const n of geSelected) {
    for (const k of channels[n]) {
      const x = g.x(k.frame), y = g.y(k.value);
      const picked = keyIsPicked(k);
      gctx.beginPath(); gctx.arc(x, y, k === geSelectedKey ? 8 : 5.5, 0, Math.PI * 2);
      gctx.fillStyle = picked ? '#ffb042' : '#ffffff';
      gctx.fill();
      gctx.strokeStyle = CHAN_COLOR[n]; gctx.lineWidth = 2; gctx.stroke();
      gctx.lineWidth = 1;
    }
  }
  // Playhead: a rose line at the current frame, synced with
  // the timeline ruler. setFrame redraws the graph on every
  // frame change, so the line tracks scrubbing and play.
  if (currentFrame >= g.f0 && currentFrame <= g.f1) {
    const px = g.x(currentFrame);
    gctx.strokeStyle = '#d3546b'; gctx.lineWidth = 2;
    gctx.beginPath(); gctx.moveTo(px, g.padT); gctx.lineTo(px, h - 26); gctx.stroke();
    gctx.lineWidth = 1;
    gctx.fillStyle = '#d3546b';
    gctx.beginPath();
    gctx.moveTo(px - 6, g.padT); gctx.lineTo(px + 6, g.padT); gctx.lineTo(px, g.padT + 9);
    gctx.closePath(); gctx.fill();
  }
  // Bezier handles on the active key: two lines with square ends.
  // Drag an end to change the slope on that side of the key.
  geHandles = null;
  if (geSelectedKey && channels[geKeyChannel].includes(geSelectedKey)) {
    const k = geSelectedKey;
    const Hin = keyHandleLen(geKeyChannel, k, 'in');
    const Hout = keyHandleLen(geKeyChannel, k, 'out');
    const kx = g.x(k.frame), ky = g.y(k.value);
    const inPt = { x: g.x(k.frame - Hin), y: g.y(k.value - keySlope(geKeyChannel, k, 'in') * Hin) };
    const outPt = { x: g.x(k.frame + Hout), y: g.y(k.value + keySlope(geKeyChannel, k, 'out') * Hout) };
    geHandles = { in: inPt, out: outPt };
    gctx.strokeStyle = '#ffb042'; gctx.lineWidth = 1.5;
    gctx.beginPath(); gctx.moveTo(inPt.x, inPt.y); gctx.lineTo(kx, ky); gctx.lineTo(outPt.x, outPt.y); gctx.stroke();
    gctx.lineWidth = 1;
    for (const p of [inPt, outPt]) {
      gctx.fillStyle = '#fffef7';
      gctx.fillRect(p.x - 6, p.y - 6, 12, 12);
      gctx.strokeStyle = '#ffb042'; gctx.lineWidth = 2;
      gctx.strokeRect(p.x - 6, p.y - 6, 12, 12);
      gctx.lineWidth = 1;
    }
  }
  // The live drag box.
  if (geMarquee) {
    const xa = Math.min(geMarquee.x0, geMarquee.x1), xb = Math.max(geMarquee.x0, geMarquee.x1);
    const ya = Math.min(geMarquee.y0, geMarquee.y1), yb = Math.max(geMarquee.y0, geMarquee.y1);
    gctx.fillStyle = 'rgba(255, 176, 66, 0.12)';
    gctx.fillRect(xa, ya, xb - xa, yb - ya);
    gctx.strokeStyle = '#ffb042'; gctx.lineWidth = 1.5;
    gctx.strokeRect(xa, ya, xb - xa, yb - ya);
    gctx.lineWidth = 1;
  }
  $('geChanName').textContent = geSelected.size === 1
    ? CHAN_LABEL[geChannel]
    : `${geSelected.size} curves picked`;
}
function geInfo() {
  const el = $('geInfo');
  const fi = $('geFrameInput'), vi = $('geValueInput');
  document.querySelectorAll('.tan-btn').forEach((b) =>
    b.classList.toggle('active', !!geSelectedKey && geSelectedKey.tangent === b.dataset.tan));
  if (!geSelectedKey) {
    fi.disabled = true; vi.disabled = true;
    fi.value = ''; vi.value = '';
    el.textContent = geSelKeys.length > 1
      ? `${geSelKeys.length} keys picked. Tangent buttons and Delete work on all picked keys.`
      : 'Click a key dot to pick it. Drag on empty space to pick many keys in a box.';
    return;
  }
  // Type-in boxes for the picked key. A box in use is left alone.
  fi.disabled = false; vi.disabled = false;
  if (document.activeElement !== fi) fi.value = geSelectedKey.frame;
  if (document.activeElement !== vi) vi.value = fmt(geSelectedKey.value);
  el.textContent =
    (geSelKeys.length > 1 ? `${geSelKeys.length} keys picked. ` : '') +
    `Picked key — Channel ${CHAN_LABEL[geKeyChannel]} • Frame ${geSelectedKey.frame} • ` +
    `Value ${fmt(geSelectedKey.value)} • Tangent ${geSelectedKey.tangent}. ` +
    'Drag a square handle: pull in or out for length, up or down for slope. ' +
    'Press Delete to remove the picked keys.';
}
// Remove the picked key from the picked channel.
function deletePickedKey() {
  // Delete works on all picked keys at once (one undo step).
  if (!geSelKeys.length && geSelectedKey) geSelKeys = [{ chan: geKeyChannel, key: geSelectedKey }];
  if (!geSelKeys.length) { say('Pick a key in the Graph Editor first.'); return; }
  pushHistory(geSelKeys.length > 1 ? 'Delete keys' : 'Delete key');
  const n = geSelKeys.length;
  const first = geSelKeys[0];
  for (const { chan, key } of geSelKeys) {
    const arr = channels[chan];
    const i = arr.indexOf(key);
    if (i >= 0) arr.splice(i, 1);
  }
  say(n > 1 ? `${n} keys removed.` : `Key removed — ${CHAN_LABEL[first.chan]} frame ${first.key.frame}.`);
  geSelKeys = [];
  geSelectedKey = null;
  geDrag = null;
  livePose = evalAll(currentFrame);
  applyPose(); drawGraph(); geInfo(); drawRuler();
}
// Graph zoom: the wheel zooms at the mouse point, so the
// frame and value under the cursor stay under the cursor.
geCanvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const g = geGeom();
  const rect = geCanvas.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;
  const aF = g.frame(px), aV = g.value(py);
  const zoom = e.deltaY < 0 ? 0.82 : 1.22;   // wheel up: zoom in
  let fSpan = clamp((g.f1 - g.f0) * zoom, 3, Math.max(12, LAST_FRAME - 1));
  let vSpan = clamp((g.hi - g.lo) * zoom, 0.25, 400);
  const fx = (aF - g.f0) / (g.f1 - g.f0);
  const fy = (aV - g.lo) / (g.hi - g.lo);
  let f0 = aF - fx * fSpan;
  f0 = clamp(f0, FIRST_FRAME - fSpan * 0.25, LAST_FRAME - fSpan * 0.75);
  geView = { f0, f1: f0 + fSpan, v0: aV - fy * vSpan, v1: aV - fy * vSpan + vSpan };
  drawGraph();
}, { passive: false });
geCanvas.addEventListener('dblclick', () => { geView = null; drawGraph(); });

// F in the Graph Editor: frame the picked key.
// With no key picked, F frames the full curves again.
function frameGeKey() {
  const target = geSelectedKey || (geSelKeys.length ? geSelKeys[0].key : null);
  if (!target) { geView = null; drawGraph(); return; }
  const g = geGeom();
  const fSpan = clamp((LAST_FRAME - 1) * 0.3, 8, 20);
  const vSpan = Math.max(1.2, (g.hi - g.lo) * 0.28);
  geView = {
    f0: target.frame - fSpan / 2, f1: target.frame + fSpan / 2,
    v0: target.value - vSpan / 2, v1: target.value + vSpan / 2
  };
  drawGraph();
}

// The Graph Editor window floats. Drag its head to move it.
// Drag the corner grip to resize it. The app stays live
// behind it: the overlay lets every click through.
const geWin = $('graphWindow');
function placeGraphWindow() {
  if (geWin.dataset.placed) return;
  geWin.dataset.placed = '1';
  geWin.style.left = '48px';
  geWin.style.top = '44px';
  geWin.style.width = Math.min(980, Math.max(430, window.innerWidth - 80)) + 'px';
  geWin.style.height = Math.min(600, Math.max(300, window.innerHeight - 110)) + 'px';
}
const geHead = document.querySelector('.ge-head');
let geWinDrag = null;
geHead.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, input, label, select, a')) return;   // head controls stay clickable
  const r = geWin.getBoundingClientRect();
  geWinDrag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
  geHead.setPointerCapture(e.pointerId);
});
geHead.addEventListener('pointermove', (e) => {
  if (!geWinDrag) return;
  const r = geWin.getBoundingClientRect();
  const left = clamp(e.clientX - geWinDrag.dx, -r.width + 140, window.innerWidth - 90);
  const top = clamp(e.clientY - geWinDrag.dy, 0, window.innerHeight - 46);
  geWin.style.left = left + 'px';
  geWin.style.top = top + 'px';
});
const endGeWinDrag = () => { geWinDrag = null; };
geHead.addEventListener('pointerup', endGeWinDrag);
geHead.addEventListener('pointercancel', endGeWinDrag);
let geWinResize = null;
$('geResize').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  const r = geWin.getBoundingClientRect();
  geWinResize = { x: e.clientX, y: e.clientY, w: r.width, h: r.height };
  $('geResize').setPointerCapture(e.pointerId);
});
$('geResize').addEventListener('pointermove', (e) => {
  if (!geWinResize) return;
  const w = clamp(geWinResize.w + (e.clientX - geWinResize.x), 430, window.innerWidth - 12);
  const h = clamp(geWinResize.h + (e.clientY - geWinResize.y), 300, window.innerHeight - 12);
  geWin.style.width = w + 'px';
  geWin.style.height = h + 'px';
  sizeGeCanvas();
});
const endGeWinResize = () => { geWinResize = null; };
$('geResize').addEventListener('pointerup', endGeWinResize);
$('geResize').addEventListener('pointercancel', endGeWinResize);

function openGraph() {
  graphOpen = true;
  placeGraphWindow();
  $('graphOverlay').classList.remove('hidden');
  buildGeChannelList();
  requestAnimationFrame(() => { sizeGeCanvas(); geInfo(); });
}
function closeGraph() {
  graphOpen = false;
  $('graphOverlay').classList.add('hidden');
  drawRuler();
}
$('btnGraph').addEventListener('click', openGraph);
$('btnGraphClose').addEventListener('click', closeGraph);
$('geShowAll').addEventListener('change', (e) => { geShowAll = e.target.checked; drawGraph(); });
document.querySelectorAll('.tan-btn').forEach((b) =>
  b.addEventListener('click', () => {
    // Tangent buttons work on all picked keys at once.
    // A type pick also clears bezier slopes on those keys.
    const targets = geSelKeys.length ? geSelKeys.map((s) => s.key)
      : (geSelectedKey ? [geSelectedKey] : []);
    if (!targets.length) { say('Pick a key in the Graph Editor first.'); return; }
    if (targets.some((k) => k.tangent !== b.dataset.tan || typeof k.slopeIn === 'number' || typeof k.slopeOut === 'number')) {
      pushHistory('Change tangent');
    }
    for (const k of targets) {
      k.tangent = b.dataset.tan;
      delete k.slopeIn; delete k.slopeOut; delete k.lenIn; delete k.lenOut;
    }
    livePose = evalAll(currentFrame);
    applyPose(); drawGraph(); geInfo(); drawRuler();
  }));

// Shift keys in time or value with the arrow buttons.
// Picked keys move. With no keys picked, whole picked curves move.
function nudgeKeys(df, dv) {
  let targets = geSelKeys;
  if (!targets.length) {
    targets = [];
    for (const n of geSelected) {
      for (const k of channels[n]) targets.push({ chan: n, key: k });
    }
  }
  if (!targets.length) { say('No keys to shift. Pick keys, or pick a curve.'); return; }
  pushHistory('Shift keys');
  const moving = new Set(targets.map((t) => t.key));
  for (const { key } of targets) {
    if (df) key.frame = clamp(key.frame + df, FIRST_FRAME, LAST_FRAME);
    if (dv) key.value = Math.round((key.value + dv) * 100) / 100;
  }
  for (const n of new Set(targets.map((t) => t.chan))) {
    if (df) {
      // One key per frame: a key in the way of a shifted key is removed.
      const frames = new Set(targets.filter((t) => t.chan === n).map((t) => t.key.frame));
      channels[n] = channels[n].filter((k) => moving.has(k) || !frames.has(k.frame));
    }
    sortKeys(n);
  }
  livePose = evalAll(currentFrame);
  applyPose(); drawGraph(); geInfo(); drawRuler();
  say(`Shifted ${targets.length} key${targets.length > 1 ? 's' : ''}.`);
}
function shiftFramesAmt() { return Math.max(1, parseInt($('geShiftFrames').value, 10) || 1); }
function shiftValueAmt() {
  const v = parseFloat($('geShiftValue').value);
  return isFinite(v) ? v : 0.1;
}
$('geShiftL').addEventListener('click', () => nudgeKeys(-shiftFramesAmt(), 0));
$('geShiftR').addEventListener('click', () => nudgeKeys(shiftFramesAmt(), 0));
$('geShiftU').addEventListener('click', () => nudgeKeys(0, shiftValueAmt()));
$('geShiftD').addEventListener('click', () => nudgeKeys(0, -shiftValueAmt()));

// Type a new frame or value for the picked key in the Graph Editor.
function geRefreshAfterEdit() {
  sortKeys(geKeyChannel);
  livePose = evalAll(currentFrame);
  applyPose(); drawGraph(); geInfo(); drawRuler();
}
$('geFrameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
$('geValueInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
$('geFrameInput').addEventListener('change', () => {
  if (!geSelectedKey) return;
  const f = clamp(Math.round(parseFloat($('geFrameInput').value)), FIRST_FRAME, LAST_FRAME);
  if (!isFinite(f)) { geInfo(); return; }
  if (f !== geSelectedKey.frame) pushHistory('Edit key frame');
  // One key per frame in a channel: a key in the way is replaced.
  const clash = channels[geKeyChannel].find((k) => k !== geSelectedKey && k.frame === f);
  if (clash) channels[geKeyChannel].splice(channels[geKeyChannel].indexOf(clash), 1);
  geSelectedKey.frame = f;
  geRefreshAfterEdit();
});
$('geValueInput').addEventListener('change', () => {
  if (!geSelectedKey) return;
  const v = parseFloat($('geValueInput').value);
  if (!isFinite(v)) { geInfo(); return; }
  if (Math.round(v * 100) / 100 !== geSelectedKey.value) pushHistory('Edit key value');
  geSelectedKey.value = Math.round(v * 100) / 100;
  geRefreshAfterEdit();
});

geCanvas.addEventListener('pointerdown', (e) => {
  // Middle mouse: Alt+drag pans the view. A plain middle
  // press does nothing, so it cannot start a stray drag box.
  if (e.button === 1) {
    e.preventDefault();
    if (e.altKey) {
      const g = geGeom();
      if (!geView) geView = { f0: g.f0, f1: g.f1, v0: g.lo, v1: g.hi };
      geDrag = {
        kind: 'pan', x: e.offsetX, y: e.offsetY, view: { ...geView },
        pxF: (g.w - 62) / (g.f1 - g.f0), pxV: (g.h - 40) / (g.hi - g.lo)
      };
      geCanvas.setPointerCapture(e.pointerId);
    }
    return;
  }
  const g = geGeom();
  const mx = e.offsetX, my = e.offsetY;
  // 1) A bezier handle of the active key. A click right on
  // the key dot itself picks the key, even when a short
  // handle sits close to it.
  if (geSelectedKey && geHandles) {
    const kx = g.x(geSelectedKey.frame), ky = g.y(geSelectedKey.value);
    const onKey = Math.hypot(kx - mx, ky - my) <= 12;
    if (!onKey) {
      for (const side of ['in', 'out']) {
        const hp = geHandles[side];
        if (hp && Math.hypot(hp.x - mx, hp.y - my) <= 16) {
          geDrag = { kind: 'handle', side, pushed: false };
          geCanvas.setPointerCapture(e.pointerId);
          return;
        }
      }
    }
  }
  // 2) A key on any picked curve.
  let hit = null, hitChan = null;
  for (const n of geSelected) {
    for (const k of channels[n]) {
      if (Math.hypot(g.x(k.frame) - mx, g.y(k.value) - my) <= 12) {
        hit = k; hitChan = n; break;
      }
    }
    if (hit) break;
  }
  if (hit) {
    if (!keyIsPicked(hit)) geSelKeys = [{ chan: hitChan, key: hit }];
    geSelectedKey = hit;
    geKeyChannel = hitChan;
    geDrag = {
      kind: 'key', pushed: false,
      startFrame: hit.frame, startValue: hit.value, lastDF: 0, lastDV: 0
    };
    geCanvas.setPointerCapture(e.pointerId);
    drawGraph(); geInfo();
    return;
  }
  // 3) Empty space: start a drag box. Shift adds to the pick.
  geMarquee = { x0: mx, y0: my, x1: mx, y1: my, add: e.shiftKey };
  geDrag = { kind: 'marquee' };
  geCanvas.setPointerCapture(e.pointerId);
});
geCanvas.addEventListener('pointermove', (e) => {
  if (!geDrag) return;
  const g = geGeom();
  if (geDrag.kind === 'pan') {
    // The content follows the cursor: the view window moves
    // back in frame and with the cursor in value.
    const df = (e.offsetX - geDrag.x) / geDrag.pxF;
    const dv = (e.offsetY - geDrag.y) / geDrag.pxV;
    geView.f0 = geDrag.view.f0 - df;
    geView.f1 = geDrag.view.f1 - df;
    geView.v0 = geDrag.view.v0 + dv;
    geView.v1 = geDrag.view.v1 + dv;
    drawGraph();
    return;
  }
  if (geDrag.kind === 'marquee') {
    geMarquee.x1 = e.offsetX; geMarquee.y1 = e.offsetY;
    drawGraph();
    return;
  }
  if (geDrag.kind === 'handle') {
    if (!geDrag.pushed) { pushHistory('Move tangent handle'); geDrag.pushed = true; }
    const k = geSelectedKey;
    const keys = channels[geKeyChannel];
    const i = keys.indexOf(k);
    const hf = g.frame(e.offsetX);
    const hv = g.value(e.offsetY);
    // Pull the handle in or out to set its length. Drag up
    // or down to set its slope. The length stops at the
    // neighbor key, so a handle cannot pass it.
    if (geDrag.side === 'out') {
      const maxLen = keys[i + 1] ? keys[i + 1].frame - k.frame : 48;
      const len = clamp(Math.round((hf - k.frame) * 10) / 10, 0.5, Math.max(0.5, maxLen));
      k.lenOut = len;
      k.slopeOut = Math.round(((hv - k.value) / len) * 100) / 100;
    } else {
      const maxLen = keys[i - 1] ? k.frame - keys[i - 1].frame : 48;
      const len = clamp(Math.round((k.frame - hf) * 10) / 10, 0.5, Math.max(0.5, maxLen));
      k.lenIn = len;
      k.slopeIn = Math.round(((k.value - hv) / len) * 100) / 100;
    }
    livePose = evalAll(currentFrame);
    applyPose(); drawGraph(); geInfo();
    return;
  }
  // Move all picked keys by the same step as the dragged key.
  if (!geDrag.pushed) {
    pushHistory(geSelKeys.length > 1 ? 'Move keys' : 'Move key');
    geDrag.pushed = true;
  }
  const df = Math.round(g.frame(e.offsetX)) - geDrag.startFrame;
  const dv = Math.round((g.value(e.offsetY) - geDrag.startValue) * 100) / 100;
  const ddf = df - geDrag.lastDF;
  const ddv = Math.round((dv - geDrag.lastDV) * 100) / 100;
  if (!ddf && !ddv) return;
  geDrag.lastDF = df; geDrag.lastDV = dv;
  for (const { key } of geSelKeys) {
    key.frame = clamp(key.frame + ddf, FIRST_FRAME, LAST_FRAME);
    key.value = Math.round((key.value + ddv) * 100) / 100;
  }
  for (const n of new Set(geSelKeys.map((s) => s.chan))) sortKeys(n);
  livePose = evalAll(currentFrame);
  applyPose(); drawGraph(); geInfo(); drawRuler();
});
geCanvas.addEventListener('pointerup', () => {
  if (!geDrag) return;
  if (geDrag.kind === 'marquee' && geMarquee) {
    const g = geGeom();
    const xa = Math.min(geMarquee.x0, geMarquee.x1), xb = Math.max(geMarquee.x0, geMarquee.x1);
    const ya = Math.min(geMarquee.y0, geMarquee.y1), yb = Math.max(geMarquee.y0, geMarquee.y1);
    const tiny = xb - xa < 4 && yb - ya < 4;
    if (tiny) {
      // A plain click on empty space clears the pick.
      if (!geMarquee.add) { geSelKeys = []; geSelectedKey = null; }
    } else {
      const found = [];
      for (const n of geSelected) {
        for (const k of channels[n]) {
          const x = g.x(k.frame), y = g.y(k.value);
          if (x >= xa && x <= xb && y >= ya && y <= yb) found.push({ chan: n, key: k });
        }
      }
      if (geMarquee.add) {
        for (const f of found) if (!keyIsPicked(f.key)) geSelKeys.push(f);
      } else {
        geSelKeys = found;
      }
      if (found.length) {
        geSelectedKey = found[found.length - 1].key;
        geKeyChannel = found[found.length - 1].chan;
      } else if (!geMarquee.add) {
        geSelectedKey = null;
      }
    }
    geMarquee = null;
  }
  if (geDrag.kind === 'key') {
    // After a group move: one key per frame in a channel.
    // A key that was not moved and sits in the way is removed.
    for (const n of new Set(geSelKeys.map((s) => s.chan))) {
      const pickedFrames = new Set(
        geSelKeys.filter((s) => s.chan === n).map((s) => s.key.frame));
      channels[n] = channels[n].filter(
        (k) => keyIsPicked(k) || !pickedFrames.has(k.frame));
      sortKeys(n);
    }
  }
  geDrag = null;
  drawGraph(); geInfo(); drawRuler();
});

// ---------- Playblast (see docs/playblast-plan.md) ----------
// Real-time pacing: step one frame, hold 1/24 s, requestFrame().
// The file type is real: MP4 if the browser can, else WebM.
// We never rename a WebM file to .mp4.
let playblastActive = false;
let pbCancel = false;

function pickMime() {
  const order = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const m of order) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function playblast() {
  if (playblastActive) return;
  const mime = pickMime();
  if (!mime) { say('This browser can not record a movie.'); return; }
  playblastActive = true; pbCancel = false;
  stopPlay();
  const savedFrame = currentFrame;

  // Capture at 1280x720. The normal view size comes back after.
  const hostW = host.clientWidth, hostH = host.clientHeight;
  renderer.setSize(1280, 720, false);
  camera.aspect = 1280 / 720; camera.updateProjectionMatrix();
  tc.visible = false; tc.enabled = false;
  // The backdrop is already paper color, in the app and in the movie.
  scene.background = new THREE.Color(PAPER_COLOR);
  updateGhosts(); // ghosts hide while playblastActive is true

  $('pbBox').classList.remove('hidden');
  $('pbText').textContent = 'Frame 0 of ' + LAST_FRAME;
  $('pbFill').style.width = '0%';

  const stream = renderer.domElement.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5000000 });
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise((r) => { rec.onstop = r; });
  rec.start();
  try {
    for (let f = FIRST_FRAME; f <= LAST_FRAME; f++) {
      if (pbCancel) break;
      livePose = evalAll(f);
      applyPose();
      renderer.render(scene, camera);
      if (track.requestFrame) track.requestFrame();
      $('pbText').textContent = `Frame ${f} of ${LAST_FRAME}`;
      $('pbFill').style.width = ((f / LAST_FRAME) * 100) + '%';
      await sleep(1000 / FPS);
    }
  } finally {
    if (rec.state !== 'inactive') rec.stop();
    await stopped;
    // Restore the normal view.
    renderer.setSize(hostW, hostH, false);
    camera.aspect = hostW / hostH; camera.updateProjectionMatrix();
    scene.background = new THREE.Color(PAPER_COLOR);
    tc.visible = true; tc.enabled = true;
    playblastActive = false;
    $('pbBox').classList.add('hidden');
    setFrame(savedFrame);
  }
  if (pbCancel) { say('Playblast stopped. No movie was saved.'); return; }

  const blob = new Blob(chunks, { type: rec.mimeType || mime });
  const isMp4 = blob.type.includes('mp4');
  const ext = isMp4 ? 'mp4' : 'webm';
  const fileName = `${SCENE_NAME}.${ext}`;
  downloadBlob(blob, fileName);
  $('doneText').textContent = isMp4
    ? `Your movie is an MP4 file. Its name is ${fileName}. It is saved in your downloads.`
    : `Your movie is a WebM file. Its name is ${fileName}. It is saved in your downloads. ` +
      'This browser can not record MP4, so the app made a WebM file. A WebM file plays in Chrome, Edge, Firefox, and Safari.';
  const openLink = $('doneOpen');
  openLink.href = URL.createObjectURL(blob);
  $('doneBox').classList.remove('hidden');
  say('Playblast done. Movie saved.');
}
$('btnPlayblast').addEventListener('click', playblast);
$('btnPbCancel').addEventListener('click', () => { pbCancel = true; });
$('btnDoneClose').addEventListener('click', () => $('doneBox').classList.add('hidden'));

// ---------- Maya link (see docs/fbx-maya-link.md) ----------
let fbxMixer = null;
function showNote(text) {
  const n = $('mayaNote');
  n.textContent = text;
  n.classList.remove('hidden');
}
$('mayaNote').addEventListener('click', () => $('mayaNote').classList.add('hidden'));

$('btnGetMaya').addEventListener('click', () => $('fbxFile').click());
$('fbxFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const url = URL.createObjectURL(file);
  new FBXLoader().load(url,
    (obj) => {
      scene.add(obj);
      obj.position.set(0, 0, -3);
      if (obj.animations && obj.animations.length) {
        fbxMixer = new THREE.AnimationMixer(obj);
        fbxMixer.clipAction(obj.animations[0]).play();
      }
      showNote('Maya file loaded. The motion plays here. ' +
        'Note: the curves come in flattened. Tangents do not survive import, ' +
        'so fine curve edits stay in the project JSON file.');
      URL.revokeObjectURL(url);
    },
    undefined,
    () => {
      showNote('That FBX file could not be loaded. It may be too old. ' +
        'FBX files must be version 7000 or up (text) or 6400 or up (binary).');
      URL.revokeObjectURL(url);
    });
});

$('btnSendMaya').addEventListener('click', () => {
  new GLTFExporter().parse(charGroup,
    (result) => {
      const glb = new Blob([result], { type: 'model/gltf-binary' });
      downloadBlob(glb, SCENE_NAME + '.glb');
      setTimeout(() => {
        const json = new Blob([JSON.stringify(projectData(), null, 2)], { type: 'application/json' });
        downloadBlob(json, SCENE_NAME + '.animate.json');
      }, 400);
      showNote('Fallback pack saved: one GLB file plus the project JSON file. ' +
        'The JSON file holds the exact keys and tangents. ' +
        'The server Blender step comes next. It will turn these files into an FBX file for Maya.');
    },
    () => say('The GLB file could not be made.'),
    { binary: true });
});

// ---------- Tutorial walkthrough ----------
// A paper card guides a new user through one small task at a time.
// The card does not block the app. The user does the real work.
// Red outlines show where to look. A green Done line shows progress.
let tutIndex = -1;
let tutTimer = null;
let tutTargetEl = null;
const tutFlags = { sawFront: false, sawSide: false, played: false, saved: false };
const TUT_SEEN_KEY = 'animate.tutorial.seen.v1';
function tutSeen() {
  try { return localStorage.getItem(TUT_SEEN_KEY) === 'yes'; } catch { return true; }
}
function markTutSeen() {
  try { localStorage.setItem(TUT_SEEN_KEY, 'yes'); } catch { /* private mode: skip */ }
}
function hasKey(name, frame) {
  return channels[name].some((k) => k.frame === frame);
}
function anyTailKey() {
  return TAIL_CHANNELS.some((name) => channels[name].length > 0);
}
const TUT_STEPS = [
  {
    title: 'Welcome to ANIMATE!',
    text: 'We will make a bouncing ball. Each step has one small job.',
    task: 'Press Next when you are ready.',
    target: null
  },
  {
    title: 'Pick the Ball rig',
    text: 'The Rig panel picks the character. Lesson 1 uses the plain ball.',
    task: 'Click 1 Ball. Then click BUILD RIG.',
    target: '#rigPanel',
    done: () => template === 1,
    actionLabel: 'Help me',
    action: () => {
      if (template !== 1) pushHistory('Change rig');
      setTemplate(1);
      buildRig();
      say('Ball rig ready.');
    }
  },
  {
    title: 'Look around',
    text: 'Views help you judge a pose. Front and Side are flat views.',
    task: 'Click Front. Click Side. Click Perspective.',
    target: '#viewBtns',
    done: () => tutFlags.sawFront && tutFlags.sawSide && viewMode === 'persp'
  },
  {
    title: 'Pick the Move tool',
    text: 'Move changes place. Rotate turns. Scale changes size.',
    task: 'Press W, or click Move in the Tools rail.',
    target: '.tool-btn[data-tool="move"]',
    done: () => activeTool === 'move'
  },
  {
    title: 'Make the first pose',
    text: 'A pose is the ball position at one frame. Start high.',
    task: 'Go to frame 1. Drag the ball up.',
    target: '#viewWrap',
    done: () => currentFrame === 1 && Math.abs(livePose.moveY) > 0.05,
    actionLabel: 'Show me',
    action: () => {
      setFrame(1);
      livePose.moveY = 1.6;
      applyPose();
      updateSettings();
    }
  },
  {
    title: 'Set the first key',
    text: 'A key saves the pose at this frame.',
    task: 'Press S, or click Set Key.',
    target: '#btnSetKey',
    done: () => hasKey('moveY', 1)
  },
  {
    title: 'Make the hit pose',
    text: 'The low pose is the contact pose. The ball hits the floor here.',
    task: 'Click frame 13 on the ruler. Drag the ball down to the floor.',
    target: '#ruler',
    done: () => currentFrame === 13,
    actionLabel: 'Go to frame 13',
    action: () => { setFrame(13); livePose.moveY = 0; applyPose(); updateSettings(); }
  },
  {
    title: 'Set the hit key',
    text: 'Save the contact pose before you move on.',
    task: 'Press S, or click Set Key.',
    target: '#btnSetKey',
    done: () => hasKey('moveY', 13)
  },
  {
    title: 'Make the end pose',
    text: 'Give the ball a clear end pose. Up and to the side reads well.',
    task: 'Click frame 24 on the ruler. Drag the ball up and to the side.',
    target: '#ruler',
    done: () => currentFrame === 24,
    actionLabel: 'Show me',
    action: () => {
      setFrame(24);
      livePose.moveY = 1.1;
      livePose.moveX = 1.0;
      applyPose();
      updateSettings();
    }
  },
  {
    title: 'Set the end key and play',
    text: 'The app fills the frames between keys. That fill is the motion.',
    task: 'Press S. Then press Play.',
    target: '#btnPlay',
    done: () => hasKey('moveY', 24) && (playing || tutFlags.played)
  },
  {
    title: 'Save the work',
    text: 'Save early. Open brings the work back later.',
    task: 'Click Save at the top. Then press Next.',
    target: '#btnSave',
    done: () => tutFlags.saved
  },
  {
    title: 'Next rig: Ball + Tail',
    text: 'The tail adds overlap. The tail follows the ball a beat late.',
    task: 'Click 2 Ball + Tail. Then click BUILD RIG.',
    target: '#rigPanel',
    done: () => template === 2,
    actionLabel: 'Help me',
    action: () => {
      if (template !== 2) pushHistory('Change rig');
      setTemplate(2);
      buildRig();
      say('Ball + Tail rig ready.');
    }
  },
  {
    title: 'Pose the tail',
    text: 'Tail rings are controllers. Tail 1 is cyan. Tail 2 is pink. Tail 3 is yellow.',
    task: 'Click the cyan ring. Drag the round arrows. Press S to set a key.',
    target: '#viewWrap',
    done: () => anyTailKey(),
    actionLabel: 'Pick Tail 1',
    action: () => selectControl('tail1')
  },
  {
    title: 'Open the Graph Editor',
    text: 'The Graph Editor shows value over time. Move Y shows height over time.',
    task: 'Click OPEN GRAPH EDITOR. Click Move Y in the list.',
    target: '#btnGraph',
    done: () => graphOpen && geChannel === 'moveY'
  },
  {
    title: 'Touch one key',
    text: 'A steep line means fast motion. A flat line means slow motion.',
    task: 'Click one key dot. Drag it a little. Try Auto or Flat.',
    target: '#geCanvas',
    done: () => !!geSelectedKey || geSelKeys.length > 0
  },
  {
    title: 'You know the loop',
    text: 'Pose. Key. Play. Fix. Save. That loop makes animation.',
    task: 'Close the Graph Editor. Save, or click PLAYBLAST to make a movie.',
    target: '#btnPlayblast'
  }
];
function setTutTarget(selector) {
  if (tutTargetEl) tutTargetEl.classList.remove('coach-target');
  tutTargetEl = selector ? document.querySelector(selector) : null;
  if (tutTargetEl) tutTargetEl.classList.add('coach-target');
}
function updateTutCheck() {
  if (tutIndex < 0) return;
  if (viewMode === 'front') tutFlags.sawFront = true;
  if (viewMode === 'side') tutFlags.sawSide = true;
  if (playing) tutFlags.played = true;
  const step = TUT_STEPS[tutIndex];
  const done = step.done ? step.done() : false;
  $('tutCheck').textContent = done ? 'Done. Press Next.' : '';
}
function showTutStep(i) {
  tutIndex = clamp(i, 0, TUT_STEPS.length - 1);
  const step = TUT_STEPS[tutIndex];
  $('tutorialCard').classList.remove('hidden');
  $('tutStep').textContent = `Step ${tutIndex + 1} of ${TUT_STEPS.length}`;
  $('tutTitle').textContent = step.title;
  $('tutText').textContent = step.text;
  $('tutTask').textContent = step.task;
  $('tutBack').disabled = tutIndex === 0;
  $('tutNext').textContent = tutIndex === TUT_STEPS.length - 1 ? 'Finish' : 'Next';
  $('tutAction').classList.toggle('hidden', !step.action);
  if (step.action) $('tutAction').textContent = step.actionLabel || 'Help me';
  setTutTarget(step.target);
  updateTutCheck();
  if (!tutTimer) tutTimer = setInterval(updateTutCheck, 400);
}
function closeTutorial() {
  tutIndex = -1;
  setTutTarget(null);
  $('tutorialCard').classList.add('hidden');
  if (tutTimer) { clearInterval(tutTimer); tutTimer = null; }
  markTutSeen();
}
function openTutorial(startAt = 0) {
  markTutSeen();
  showTutStep(startAt);
}
$('btnTutorial').addEventListener('click', () => openTutorial(0));
$('tutExit').addEventListener('click', closeTutorial);
$('tutBack').addEventListener('click', () => showTutStep(tutIndex - 1));
$('tutNext').addEventListener('click', () => {
  if (tutIndex >= TUT_STEPS.length - 1) closeTutorial();
  else showTutStep(tutIndex + 1);
});
$('tutAction').addEventListener('click', () => {
  const step = TUT_STEPS[tutIndex];
  if (step && step.action) { step.action(); updateTutCheck(); }
});
$('btnSave').addEventListener('click', () => { tutFlags.saved = true; });

// ---------- Main loop and resize ----------
const clock = new THREE.Clock();
function loop() {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (playing && !playblastActive) {
    frameFloat += dt * FPS;
    if (frameFloat > LAST_FRAME) frameFloat = FIRST_FRAME;
    const f = Math.floor(frameFloat);
    if (f !== currentFrame) setFrame(f);
  }
  if (fbxMixer) fbxMixer.update(dt);
  updateSketchShadow();
  renderer.render(scene, camera);
}
function layout() {
  const w = host.clientWidth, h = host.clientHeight;
  if (w && h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  sizeRuler();
  if (graphOpen) sizeGeCanvas();
}
new ResizeObserver(layout).observe(host);
window.addEventListener('resize', layout);

// ---------- Start ----------
// More debug switches: ?tc=off hides the tool gizmo,
// ?rig=off skips the character rig (and the gizmo with it).
if (DEBUG_Q.get('tc') === 'off') { tc.visible = false; tc.enabled = false; }
if (DEBUG_Q.get('rig') === 'off') { tc.visible = false; tc.enabled = false; }
else buildRig();
layout();
setFrame(FIRST_FRAME);
renderer.setAnimationLoop(loop);
say('Empty scene. Move the ball, then press Set Key.');
if (!tutSeen()) openTutorial(0);

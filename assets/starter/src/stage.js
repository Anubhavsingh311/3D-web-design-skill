import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TIERS } from './perf.js';

// Creates the fixed, transparent WebGL stage. Returns null when WebGL is unavailable so the caller
// can fall back to the static page.
export function createStage(canvas, { config, tierIndex = 0, onContextLost, onContextRestored } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: tierIndex < 2,           // fixed at context creation, so it follows the starting tier
      alpha: true,                        // the page shows through, this is what blends object and site
      powerPreference: 'high-performance',
    });
  } catch (err) {
    console.warn('WebGL unavailable, using static fallback.', err);
    return null;
  }
  if (!renderer.getContext()) return null;

  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping; // keeps brand colours true, unlike ACES
  renderer.toneMappingExposure = 1;

  const scene = new THREE.Scene();
  // The camera is deliberately NOT added to the scene. CSS3DRenderer reads it directly.
  const camera = new THREE.PerspectiveCamera(config.fov, 1, 0.1, 100);
  camera.position.set(0, 0, config.cameraZ);

  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  key.position.set(3, 4, 5);
  const rim = new THREE.DirectionalLight(0xffffff, 0.6);
  rim.position.set(-4, 2, -3);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f99, 0.9); // stands in for the environment on the low tier
  scene.add(key, rim, hemi);

  let tier = TIERS[tierIndex];
  let envTex = null;
  let size = { w: 1, h: 1 };

  // Image based light gives PBR materials believable reflections without HDR downloads.
  function applyEnvironment() {
    if (tier.env) {
      if (!envTex) {
        const pmrem = new THREE.PMREMGenerator(renderer);
        const room = new RoomEnvironment();
        envTex = pmrem.fromScene(room, 0.04).texture;
        room.dispose?.();
        pmrem.dispose();
      }
      scene.environment = envTex;
      scene.environmentIntensity = 0.45;
      hemi.visible = false;
    } else {
      scene.environment = null;
      hemi.visible = true;
    }
  }
  applyEnvironment();

  // Tint the key light with the page paper, so a warm page gets warm light. No pure white anywhere.
  function setTint(paper) {
    key.color.copy(paper).lerp(new THREE.Color(1, 1, 1), 0.55);
  }

  function resize(w, h) {
    size = { w, h };
    // The caller passes the stage box. All layers (canvas, CSS3D layer, camera) come from this one measurement.
    const cap = Math.min(config.maxDPR, tier.dpr, w < 800 ? 1.5 : Infinity);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    renderer.setSize(w, h, false); // false: CSS controls the canvas box
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function setTier(index) {
    tier = TIERS[index];
    applyEnvironment();
    resize(size.w, size.h);
  }

  // Mobile browsers drop contexts in the background. preventDefault() lets the browser restore it.
  // Three re-creates its own GPU state, but the PMREM environment is a render target, so it must be rebuilt.
  const lost = (e) => { e.preventDefault(); onContextLost?.(); };
  const restored = () => { envTex = null; applyEnvironment(); onContextRestored?.(); };
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);

  function dispose(releaseContext = false) {
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', restored);
    renderer.setAnimationLoop(null);
    envTex?.dispose();
    renderer.dispose();
    // Only release the context when the canvas element is being thrown away too. A canvas that is
    // reused (HMR, remount) must keep its context, because a lost one cannot be handed to a new renderer.
    if (releaseContext) renderer.forceContextLoss();
  }

  return { renderer, scene, camera, lights: { key, rim, hemi }, resize, setTier, setTint, dispose, get tier() { return tier; } };
}

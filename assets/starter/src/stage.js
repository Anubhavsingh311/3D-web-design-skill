import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CONFIG } from './config.js';

// Creates the fixed, transparent WebGL stage. Returns null when WebGL is unavailable so the
// caller can fall back to the static page.
export function createStage(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,                       // the page shows through, this is what blends object and site
      powerPreference: 'high-performance',
    });
  } catch (err) {
    console.warn('WebGL unavailable, using static fallback.', err);
    return null;
  }

  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping; // keeps brand colours true, unlike ACES
  renderer.toneMappingExposure = 1;

  const scene = new THREE.Scene();
  // The camera is deliberately NOT added to the scene. CSS3DRenderer reads it directly.
  const camera = new THREE.PerspectiveCamera(CONFIG.fov, 1, 0.1, 100);
  camera.position.set(0, 0, CONFIG.cameraZ);

  // Image based light gives PBR materials believable reflections without HDR downloads.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  key.position.set(3, 4, 5);
  const rim = new THREE.DirectionalLight(0xffffff, 0.6);
  rim.position.set(-4, 2, -3);
  scene.add(key, rim);

  function resize() {
    // clientWidth excludes the scrollbar, so the canvas, the camera aspect and the DOM layout agree.
    const w = document.documentElement.clientWidth;
    const h = window.innerHeight;
    const cap = w < 800 ? CONFIG.mobileDPR : CONFIG.maxDPR;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    renderer.setSize(w, h, false); // false: CSS controls the canvas box
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    return { w, h };
  }

  function dispose() {
    renderer.setAnimationLoop(null);
    renderer.dispose();
  }

  return { renderer, scene, camera, lights: { key, rim }, resize, dispose };
}

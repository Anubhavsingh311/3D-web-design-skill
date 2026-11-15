import * as THREE from 'three';
import { engine } from 'animejs';
import { CONFIG } from './config.js';
import { createStage } from './stage.js';
import { loadModel, makeDemoObject, prepareObject, applyExplode } from './ingest.js';
import { createLooks } from './looks.js';
import { measureChapters, readTokens } from './layout.js';
import { createSlotBinder } from './register.js';
import { buildPoses, buildScrubbed, buildStatic } from './choreo.js';

async function init() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = createStage(document.getElementById('stage'));
  if (!stage) {
    document.documentElement.classList.add('no-webgl');
    return;
  }

  const raw = CONFIG.modelUrl ? await loadModel(CONFIG.modelUrl) : makeDemoObject();
  const obj = prepareObject(raw, CONFIG.objectSize);

  // `floater` carries idle motion and pointer parallax. `pivot` (inside it) belongs to the timeline.
  // Never write the same property from two systems.
  const floater = new THREE.Group();
  floater.add(obj.pivot);
  stage.scene.add(floater);

  const tokens = readTokens();
  const looks = createLooks(obj.meshes, tokens);

  const panelEl = document.getElementById('panel-screen');
  const binder = obj.slots.screen && panelEl
    ? createSlotBinder({
        mount: document.getElementById('css-layer'),
        slot: obj.slots.screen,
        panel: panelEl,
        width: CONFIG.panel.width,
        height: CONFIG.panel.height,
      })
    : null;
  const panelPaths = panelEl ? [...panelEl.querySelectorAll('path')] : [];

  const state = { draw: 0, reveal: 0, explode: 0, lines: 1, panel: 0, dark: 0 };
  const root = document.documentElement;
  const inkC = new THREE.Color(tokens.ink);
  const paperC = new THREE.Color(tokens.paper);
  const tmp = new THREE.Color();
  let lastDark = -1;
  let choreo = null;

  function rebuild() {
    choreo?.destroy();
    const { w, h } = stage.resize();
    looks.resize(w, h);
    binder?.resize(w, h);
    const poses = buildPoses(measureChapters(stage.camera, CONFIG.objectSize));
    choreo = reduced
      ? buildStatic({ pivot: obj.pivot, state, poses })
      : buildScrubbed({ pivot: obj.pivot, state, poses, panelPaths });
  }

  rebuild();
  document.fonts?.ready.then(rebuild); // fonts change layout, so measure again

  let t = 0;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(rebuild, 150);
  });

  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  // Anime.js and Three.js share one clock: Three owns the loop, Anime.js is ticked inside it.
  engine.useDefaultMainLoop = false;
  stage.renderer.setAnimationLoop((time) => {
    engine.update();

    if (!reduced) {
      pointer.sx += (pointer.x - pointer.sx) * 0.06;
      pointer.sy += (pointer.y - pointer.sy) * 0.06;
      floater.rotation.y = pointer.sx * 0.12 + Math.sin(time * 0.0004) * 0.04;
      floater.rotation.x = pointer.sy * 0.08;
    }

    applyExplode(obj.units, state.explode * CONFIG.explodeDistance);
    looks.apply(state, obj.pivot);
    binder?.update(state.panel);

    // The page background and text follow the same `dark` value as the object, so they never disagree.
    if (Math.abs(state.dark - lastDark) > 0.002) {
      lastDark = state.dark;
      root.style.setProperty('--bg', tmp.copy(paperC).lerp(inkC, state.dark).getStyle());
      root.style.setProperty('--fg', tmp.copy(inkC).lerp(paperC, state.dark).getStyle());
    }

    stage.renderer.render(stage.scene, stage.camera);
    binder?.render(stage.camera);
  });
}

init();

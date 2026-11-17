import * as THREE from 'three';
import { engine, animate } from 'animejs';
import { CONFIG, poseFor } from './config.js';
import { createStage, disposeTree } from './stage.js';
import { loadModel, DEMOS, makeDemoObject, prepareObject, applyExplode, auditObject, addSlot } from './ingest.js';
import { createLooks } from './looks.js';
import { createTheme, readTokens } from './theme.js';
import { readStageBox, measureChapters, measureScheduleInput } from './layout.js';
import { buildSchedule, stageOffset } from './schedule.js';
import { createSlotBinder, slotSize } from './register.js';
import { createContact } from './contact.js';
import { buildScrubbed, buildStatic, applyPose } from './choreo.js';
import { pickTier, TIERS, BUDGETS, createFrameMonitor } from './perf.js';
import { MODEL_URL } from './model.js';
import { mountDebug } from './debug.js';

// Builds the whole experience and returns { ready, destroy }. destroy() is safe at any moment, even
// while the model is still loading, and leaves the page exactly as it found it. That is what makes
// React StrictMode, HMR and SPA route changes work. Never call createExperience twice without destroying.
export function createExperience(options = {}) {
  const cfg = { ...CONFIG, ...options.config };
  const q = new URLSearchParams(location.search);
  const flags = { debug: q.has('debug'), verify: q.has('verify') };
  const ac = new AbortController();
  const { signal } = ac;
  const root = document.documentElement;
  const teardown = [];
  let disposed = false;
  let firstFrameSeen = false;

  const on = (target, type, fn, opts) => target.addEventListener(type, fn, { ...opts, signal });

  // Posters: `<div class="anchor" data-poster="/posters/intro.png">` shows an image in the anchor box until the
  // first frame renders and for good when WebGL is missing. Set before anything async so it paints immediately.
  const posterAnchors = [...document.querySelectorAll('.anchor[data-poster]')];
  posterAnchors.forEach((a) => a.style.setProperty('--poster', `url("${a.dataset.poster}")`));
  teardown.push(() => posterAnchors.forEach((a) => a.style.removeProperty('--poster')));

  async function boot() {
    const canvas = options.canvas || document.getElementById('stage');
    let tierIndex = pickTier(q.get('tier'));
    const stage = createStage(canvas, { config: cfg, tierIndex, onContextLost: () => root.classList.add('context-lost'), onContextRestored: () => root.classList.remove('context-lost') });
    if (!stage) { root.classList.add('no-webgl'); return; }
    teardown.push(() => stage.dispose(options.releaseContext));

    // Anime.js ticks inside our render loop, so the two share one clock.
    engine.useDefaultMainLoop = false;
    teardown.push(() => { engine.useDefaultMainLoop = true; engine.wake(); });

    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let theme = createTheme(readTokens());
    stage.setTint(theme.paper);

    // ---- the object --------------------------------------------------------------------------
    const demo = q.get('demo');
    const url = cfg.modelUrl ?? MODEL_URL;
    let raw;
    if (demo && DEMOS[demo]) raw = DEMOS[demo]();
    else if (url) raw = await loadModel(url, stage.renderer);
    else raw = makeDemoObject();
    if (disposed) { disposeTree(raw); return; } // destroyed while loading: nothing owns the model yet, so free it here

    const obj = prepareObject(raw, { size: cfg.objectSize, fit: cfg.fit, explode: cfg.explode });
    for (const [key, spec] of Object.entries(cfg.slots || {})) if (!obj.slots[key]) addSlot(obj, key, spec);
    const narrow = document.documentElement.clientWidth < 800;
    obj.audit = auditObject(obj, narrow ? BUDGETS.mobile : BUDGETS.desktop); // before the look layers touch any material
    if (flags.debug || flags.verify) obj.audit.warnings.forEach((w) => console.warn(`[3d-stage] ${w.code}: ${w.msg}`));

    // `floater` carries idle motion and pointer parallax. `pivot` (inside it) belongs to the timeline.
    // Never write the same property from two systems.
    const floater = new THREE.Group();
    floater.add(obj.pivot);
    stage.scene.add(floater);
    teardown.push(() => { stage.scene.remove(floater); disposeTree(obj.raw); });

    let dissolveCenter = null;
    const from = cfg.dissolve?.from && obj.slots[cfg.dissolve.from];
    if (from) dissolveCenter = obj.pivot.worldToLocal(from.getWorldPosition(new THREE.Vector3()));
    const looks = createLooks(obj.meshes, theme, { pivot: obj.pivot, ...cfg.look, dissolve: cfg.dissolve, dissolveCenter });
    teardown.push(() => looks.dispose());

    let contact = createContact(cfg.contact, { scene: stage.scene, theme, size: obj.size });
    teardown.push(() => contact.dispose());

    // ---- the DOM panel on the slot -----------------------------------------------------------
    const panelEl = document.getElementById('panel-screen');
    const slot = obj.slots.screen;
    let binder = null;
    let panelPaths = [];
    if (slot && panelEl) {
      const sz = slotSize(slot); // identity pose: the panel takes the slot's aspect, so it is never stretched
      const width = cfg.panelWidth;
      const height = Math.round(width * sz.aspect);
      binder = createSlotBinder({ mount: document.getElementById('css-layer'), slot, panel: panelEl, width, height });
      panelEl.style.width = `${width}px`;
      panelEl.style.height = `${height}px`;
      panelPaths = [...panelEl.querySelectorAll('path')];
      teardown.push(() => binder.dispose());
    }

    // ---- state, theme, choreography ----------------------------------------------------------
    const state = { draw: 0, reveal: 0, explode: 0, lines: 1, panel: 0, dark: 0 };
    const themeOut = { bg: new THREE.Color(), fg: new THREE.Color() };
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    let lastDark = -1;
    function writeTheme() {
      if (Math.abs(state.dark - lastDark) < 0.002) return;
      lastDark = state.dark;
      theme.at(state.dark, themeOut);
      root.style.setProperty('--bg', themeOut.bg.getStyle());
      root.style.setProperty('--fg', themeOut.fg.getStyle());
      themeMeta?.setAttribute('content', themeOut.bg.getStyle());
    }
    teardown.push(() => ['--bg', '--fg', '--stage-w', '--stage-h'].forEach((p) => root.style.removeProperty(p)));

    let choreo = null;
    let layout = [];
    let poses = [];
    let schedule = { range: 0, chapters: [], warnings: [] };
    let box = readStageBox();

    function rebuild() {
      choreo?.destroy();
      choreo = null;
      box = readStageBox();
      root.style.setProperty('--stage-w', `${box.w}px`);
      root.style.setProperty('--stage-h', `${box.h}px`);
      stage.resize(box.w, box.h);
      looks.resize(box.w, box.h);
      binder?.resize(box.w, box.h);
      layout = measureChapters(stage.camera, box, cfg.objectSize);
      poses = [];
      [...document.querySelectorAll('.chapter')].forEach((el, i) => poses.push({ ...poseFor(el.dataset.chapter, i, poses[i - 1]), ...layout[i] }));
      schedule = buildSchedule({ ...measureScheduleInput(box), moveVh: cfg.moveVh });
      if (schedule.warnings.length && (flags.debug || flags.verify)) console.warn('[3d-stage] schedule:', schedule.warnings.join('; '));
      choreo = reduced.matches || schedule.range <= 0
        ? buildStatic({ pivot: obj.pivot, state, poses })
        : buildScrubbed({ pivot: obj.pivot, state, poses, schedule, panelPaths, smoothing: flags.verify ? true : cfg.scrollSmoothing, debug: flags.debug, viewH: box.h });
    }
    teardown.push(() => choreo?.destroy());
    rebuild();
    document.fonts?.ready.then(() => { if (!disposed) rebuild(); }); // fonts change layout, so measure again

    // Rebuild only when the stage box really changed. The URL bar sliding on a phone changes
    // innerHeight but not the svh-sized .pin, so it costs nothing here.
    let timer = 0;
    on(window, 'resize', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { const b = readStageBox(); if (b.w !== box.w || b.h !== box.h) rebuild(); }, 150);
    });
    teardown.push(() => clearTimeout(timer));
    on(reduced, 'change', rebuild);
    on(matchMedia('(prefers-color-scheme: dark)'), 'change', () => {
      theme = createTheme(readTokens());
      looks.setTheme(theme);
      contact.dispose();
      contact = createContact(cfg.contact, { scene: stage.scene, theme, size: obj.size });
      lastDark = -1;
    });

    // ---- intro draw-in, pointer, loop --------------------------------------------------------
    const intro = { v: cfg.intro && !reduced.matches && !flags.verify ? 0 : 1 };
    if (intro.v < 1) {
      const introAnim = animate(intro, { v: 1, duration: 1400, ease: 'outCubic' });
      teardown.push(() => introAnim.revert());
    }

    const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
    on(window, 'pointermove', (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });

    const layers = [stage.renderer.domElement, document.getElementById('css-layer')].filter(Boolean);
    let lastOffset = NaN;
    const monitor = createFrameMonitor({
      onSlow() {
        if (flags.verify || tierIndex >= TIERS.length - 1) return;
        tierIndex++;
        stage.setTier(tierIndex);
        looks.resize(box.w, box.h);
        if (flags.debug) console.info(`[3d-stage] slow frames, dropped to tier ${TIERS[tierIndex].name}`);
      },
    });

    let last = performance.now();
    const api = {
      frames: 0, state, audit: obj.audit, renderer: stage.renderer, camera: stage.camera, scene: stage.scene, pivot: obj.pivot, floater, obj,
      get schedule() { return schedule; },
      get layout() { return layout; },
      get poses() { return poses; },
      get choreo() { return choreo; },
      get mode() { return choreo?.mode; },
      get box() { return box; },
      get ready() { return firstFrameSeen; },
      tier: () => TIERS[tierIndex].name,
      looksStats: () => looks.stats(),
      // Projected centre of an object (default: the pivot) in CSS px of the stage box.
      project(target = obj.pivot) {
        const v = target.getWorldPosition(new THREE.Vector3()).project(stage.camera);
        return { x: (v.x * 0.5 + 0.5) * box.w, y: (-v.y * 0.5 + 0.5) * box.h };
      },
      // Share of the canvas the object covers, and its bounding box, read back from real pixels.
      coverage(cols = 160) {
        stage.renderer.render(stage.scene, stage.camera);
        const src = stage.renderer.domElement;
        const rows = Math.max(1, Math.round((cols * src.height) / src.width));
        const c = document.createElement('canvas');
        c.width = cols;
        c.height = rows;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(src, 0, 0, cols, rows);
        const d = g.getImageData(0, 0, cols, rows).data;
        let n = 0, x0 = cols, y0 = rows, x1 = -1, y1 = -1;
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          if (d[(y * cols + x) * 4 + 3] > 24) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        }
        const sx = box.w / cols, sy = box.h / rows;
        return { fraction: n / (cols * rows), bbox: n ? { x0: x0 * sx, y0: y0 * sy, x1: (x1 + 1) * sx, y1: (y1 + 1) * sy } : null };
      },
      // Bounds of every explode unit in OBJECT space (the space CONFIG.slots uses), from the model's own geometry
      // only. Read it at rest (scroll 0) to choose slot positions: front face = max z, centre = centre.
      partBounds() {
        obj.pivot.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(obj.pivot.matrixWorld).invert();
        const m = new THREE.Matrix4();
        const v = new THREE.Vector3();
        const r = (n) => Math.round(n * 1000) / 1000;
        return obj.units.map((u) => {
          const box = new THREE.Box3();
          for (const mesh of obj.meshes) {
            let inside = false;
            for (let a = mesh; a; a = a.parent) if (a === u) { inside = true; break; }
            if (!inside) continue;
            const pos = mesh.geometry.attributes.position;
            m.multiplyMatrices(inv, mesh.matrixWorld);
            for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(m));
          }
          const f = (x) => x.toArray().map(r);
          return { name: u.name, min: f(box.min), max: f(box.max), center: f(box.getCenter(new THREE.Vector3())), size: f(box.getSize(new THREE.Vector3())) };
        });
      },
      // Freeze on chapter i's pose (used to render posters and in tests). A resize rebuilds the choreography again.
      setPose(i) { choreo?.destroy(); choreo = null; intro.v = 1; applyPose(obj.pivot, state, poses[i]); },
      rebuild,
    };
    if (flags.debug) console.info('[3d-stage] object size', obj.size.toArray().map((n) => Math.round(n * 1000) / 1000), 'parts (object space)', api.partBounds());
    const debug = mountDebug({ api, flags, signal });
    teardown.push(() => debug.dispose());

    const frame = (now) => {
      const dt = now - last;
      last = now;
      engine.update();
      // Scroll the fixed layers away with the page before <main> and after its last pin. When they are
      // fully out of view, keep the scroll state and skip the GPU work.
      const offset = stageOffset(schedule, window.scrollY);
      if (offset !== lastOffset) {
        lastOffset = offset;
        const t = offset ? `translate3d(0, ${offset}px, 0)` : '';
        layers.forEach((el) => { el.style.transform = t; });
      }
      if (Math.abs(offset) >= box.h) return;

      const live = cfg.idle && !reduced.matches && !flags.verify && TIERS[tierIndex].parallax;
      if (live) {
        pointer.sx += (pointer.x - pointer.sx) * 0.06;
        pointer.sy += (pointer.y - pointer.sy) * 0.06;
        floater.rotation.y = pointer.sx * 0.12 + Math.sin(now * 0.0004) * 0.04;
        floater.rotation.x = pointer.sy * 0.08;
      } else {
        floater.rotation.set(0, 0, 0);
      }

      applyExplode(obj.units, state.explode * cfg.explode.distance);
      looks.apply(state, obj.pivot, stage.camera, intro.v);
      contact.update(obj.pivot, state, stage.camera);
      binder?.update(state.panel);
      writeTheme();

      stage.renderer.render(stage.scene, stage.camera);
      binder?.render(stage.camera);
      api.frames++;
      if (!firstFrameSeen) { firstFrameSeen = true; root.classList.add('stage-ready'); }
      if (!flags.verify) monitor.update(dt);
    };
    stage.renderer.setAnimationLoop(frame);

    // Stop the loop while the page is hidden (background tab, minimised window, another virtual desktop) and resume on
    // return. Browsers throttle requestAnimationFrame in hidden tabs, but not on every platform and not for an occluded
    // window, and the anime.js clock would otherwise jump. `last` resets so the first frame back is not a stall.
    on(document, 'visibilitychange', () => {
      if (document.hidden) { stage.renderer.setAnimationLoop(null); return; }
      last = performance.now();
      stage.renderer.setAnimationLoop(frame);
    });
    if (document.hidden) stage.renderer.setAnimationLoop(null); // mounted in a background tab: wait to be shown
    teardown.push(() => { root.classList.remove('stage-ready', 'no-webgl', 'stage-error', 'context-lost'); layers.forEach((el) => { el.style.transform = ''; }); });
  }

  const ready = boot().catch((err) => {
    console.error('[3d-stage]', err);
    root.classList.add('stage-error');
  });

  function destroy() {
    if (disposed) return;
    disposed = true;
    ac.abort();
    while (teardown.length) {
      try { teardown.pop()(); } catch (e) { console.warn('[3d-stage] teardown', e); }
    }
  }

  return { ready, destroy };
}

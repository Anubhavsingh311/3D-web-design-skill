---
name: "3d-web-design"
description: Build scroll-driven 3D object experiences where a real model (GLB, GLTF, OBJ, FBX, STL, or a procedural stand-in) lives inside a website's layout instead of floating over it. The object sketches itself with draw-on edges and hidden-line removal, explodes into parts or layers, dissolves into physically based material, glides between layout anchors as chapters scroll, and hosts live HTML or SVG on its surface with correct occlusion. Three.js plus Anime.js v4 (onScroll, timeline, createDrawable) on a tested Vite starter with a headless-browser verifier. Use for scrollytelling product pages, 3D hero objects, sketch-to-solid reveals, exploded views, Apple-style product scroll, animejs.com style landing pages, "put my model into the site", "scroll 3D", "3D that blends into the page", DOM panels on a 3D screen, or turning a GLB into a page section, even if the user never names Three.js or Anime.js. Not for plain model viewers or embeds, Spline or Sketchfab iframes, 3D games, or shader backgrounds with no object.
---

# Scroll 3D Object Stage

Build a page where one 3D object lives inside the layout, changes state as the reader scrolls, and shares its camera, palette and grid with the DOM. The reference experience is the homepage of animejs.com. Treat it as a technique study, never as a template to copy (see "Originality").

## What you are starting from

| Asset | What it is | Evidence it works |
|---|---|---|
| `assets/starter/` | Vite project: stage, ingest, looks, schedule, choreography, DOM registration, lifecycle, tiers, debug hooks | `npm test` (35 Node tests) and `scripts/verify.mjs` (about 145 browser checks over 3 viewports plus reduced motion, no WebGL, remount, context loss, resize, posters, single-file build) |
| `assets/fixtures/*.glb` | Six real GLBs: parts with an Empty slot, a quad slot authored facing the wrong way, a five-layer stack, one fused smooth knot, and meshopt and Draco compressed variants | Each loaded through the real GLTFLoader path in the verifier |
| `scripts/inspect-model.mjs` | Zero-dependency GLB audit: triangles, texture memory, explode units, markers, budget findings with fix commands | Run it before writing any code |
| `scripts/verify.mjs` | Builds, serves the production bundle, asserts numbers in headless Chromium with software WebGL | Exit code 1 on any failure |
| `references/` | One file per concern, read when the step says so | |

Evidence is from headless Chromium with software WebGL. Real GPU frame times, Safari CSS 3D behaviour, touch feel and the phone URL bar are NOT verified. Say so in the hand-off.

## The architecture (memorise this)

```
z0  #bg          fixed colour layer, animated with the object (one shared `dark` value)
z1  #css-layer   CSS3DRenderer output: DOM panels transformed by the SAME camera as WebGL
z2  #stage       fixed transparent WebGL canvas, pointer-events none
z3  main         real page text, normal document flow, real native scroll
```

Rules that make it work, and why:

1. **Native scroll only.** The stage is fixed and reads scroll progress. Hijacked scroll breaks accessibility, anchors and touch momentum.
2. **One master timeline, measured in pixels of scroll.** One unit of timeline time is one scrolled pixel, and each move starts and ends where the page geometry says. An abstract "1000 ms per chapter" timeline drifts: any child that outlives the nominal end (a staggered SVG tail) silently rescales every other tween, so the object arrives later in every chapter. The original starter lost up to 0.85 viewport heights this way.
3. **State object plus pose objects.** The timeline tweens a plain `state` ({draw, reveal, explode, lines, panel, dark}) and the `pivot` group. The render loop reads them. Testable in Node, independent of adapter quirks.
4. **Layout drives placement.** The object goes where the active chapter's `.anchor` box is, measured as a difference of two rects, so it is scroll invariant and works at any nesting depth.
5. **One theme value.** Page background, text, sketch lines and fill all derive from `state.dark`. Background lerps. Foreground does not: it jumps to whichever of ink or paper reads better. A lerp of both is identical at 0.5, which hid every heading and every line at 1.09:1 contrast in the original.
6. **One stage box.** Canvas, CSS3D layer, camera and anchors are all sized from the stuck `.pin` (100svh), not `window.innerHeight`, which changes whenever a phone's URL bar slides.

## Workflow

Follow in order. State assumptions in one line each, then proceed. Ask at most one question, and only when no object and no brief exist.

### Step 0: Intake
Collect or assume: the object (file path, or "procedural stand-in"), brand tokens (ink, paper, accent, font), the chapter list (default five: intro, sketch, parts, material, detail), the target (default Vite plus vanilla JS; see `references/11-integration-and-delivery.md` for React, Next, or a single hosted file).

If a model file exists, audit it first. It takes a second and decides the whole plan:
```bash
node scripts/inspect-model.mjs path/to/model.glb
```
It reports explode feasibility, marker kinds, triangle and texture budgets, and the exact `gltf-transform` command for each problem.

### Step 1: Start from the starter
Copy `assets/starter/` into the project, then `npm install`. Do not rewrite it. You edit `src/config.js` (tuning and the `CHAPTERS` pose table), `index.html` (chapters and copy) and `src/style.css` (tokens). Everything else is infrastructure.

Pinned and tested together, do not bump silently: `animejs 4.5.0`, `three 0.187.0`, `vite ^7`. (Latest on npm at the time of writing: animejs 4.5.0, three 0.187.0, vite 8, untested here.) The Three.js adapter needs Three.js 0.150 or newer and is imported once as a side effect: `import 'animejs/adapters/three'`.

### Step 2: Ingest the object
Read `references/04-object-ingest.md`. Always:
1. Optimise WITHOUT destroying the structure. Default `gltf-transform optimize` joins meshes (7 explode parts became 3) and prunes empty nodes (every `slot_*` Empty vanished), both measured:
   ```bash
   gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress webp --texture-size 2048 --join false --simplify false --instance false
   # markers are Empties? add --flatten false --prune false (quad markers do not need it)
   node scripts/inspect-model.mjs out.glb --against in.glb     # must say "structure preserved"
   ```
   Target under 3 MB, hard cap 5 MB.
2. Drop it at `src/model/object.glb`. Vite finds it, no URL to configure. With no file, a procedural machine is used. `?demo=knot` and `?demo=machine` force a demo.
3. Read the audit the runtime prints (`window.__stage.audit` with `?verify` or `?debug`). Fix what it flags: a fused mesh cannot explode, skinned and instanced meshes are not sketched.
4. Give the DOM panel a place, in order of preference: a flat quad mesh named `slot_screen` (converted automatically, cannot be mis-oriented, survives optimisers), an Empty named `slot_screen` (local +Z facing out, scale = panel size, fragile), or `CONFIG.slots` in code for models with no marker. Read `window.__stage.partBounds()` (with `?verify` or `?debug`) for each part's bounds in the coordinates `CONFIG.slots` uses. Open `?debug`: the blue axis of each slot must point out of the surface.

### Step 3: Choose a look recipe
Read `references/03-sketch-and-look-recipes.md`. Default is **sketch to solid**: paper-coloured fill (hides back edges), pen-ordered edge lines that draw on, silhouette outlines on smooth parts, then a noisy dissolve sweep into the original PBR material with an accent cut edge. Pick one look per page. Mixing three reads as a demo reel, not a brand.

### Step 4: Choreograph
Read `references/05-scroll-choreography.md`. In `src/config.js`, `CHAPTERS` has one row per `<section class="chapter" data-chapter="id">`, matched by id, each row being the pose at the END of the move into that chapter. A chapter without a row inherits the previous pose and warns. Rules of thumb:
- Chapters rest while their pin is stuck, and the object moves during the crossing between pins. Keep chapters 180 to 260vh so each rests for at least half a screen.
- Under about 180 degrees of rotation per chapter. More looks like a loading spinner.
- One headline change per chapter: draw, then explode, then material, then panel.
- Every tween has explicit `[from, to]` values, so a rebuild after resize is safe.

### Step 5: Register DOM to the object
Read `references/02-dom-webgl-registration.md`. `createSlotBinder` for panels that sit on a surface and are occluded by nearer geometry. `projectToScreen` for flat labels. The panel takes the slot's aspect ratio automatically.

### Step 6: Blend into the site
Read `references/06-blend-into-site.md`. Minimum bar before calling it done:
- Colours come from the site's CSS custom properties (`readTokens()`), never hex in JS or GLSL.
- Background and text follow `state.dark`, and contrast never drops under about 4:1 (the starter's `theme.worstContrast()` and the verifier check it).
- The object fills the same grid column as the chapter's `.anchor` on every breakpoint.
- No pure white or black in lighting or albedo. `NeutralToneMapping` keeps brand colours.
- Exactly one contact cue: `grain`, `shadow` or `none` in `CONFIG.contact`.

### Step 7: Resilience
Read `references/07-performance-and-fallbacks.md`. The starter already implements: reduced motion (cuts between poses), no WebGL (`.no-webgl`, readable page), quality tiers with a frame-time monitor, context loss recovery, offscreen render skip, resize and font rebuilds, and a real `destroy()`. Your job is to keep the text in the DOM, add poster images for the fallback, and respect the budgets.

### Step 8: Verify (do not skip)
Read `references/08-verification.md`. Then run, from the project folder:
```bash
npm test
node <skill>/scripts/verify.mjs --project . --out verify-out --posters
```
The first run installs `puppeteer-core` and `@sparticuz/chromium` into `/tmp/3dweb-tools` (needs registry access, about 100 MB). Read `verify-out/contact-sheet.png`, fix every FAIL, and re-run. If no browser can run, say so and list what is unverified. Never claim visual correctness from a clean build.

## Core code patterns (already in the starter, shown so you can reason about them)

One loop shared by Three.js and Anime.js:
```js
engine.useDefaultMainLoop = false;                 // Three.js owns the loop. Restore it in destroy().
renderer.setAnimationLoop((now) => {
  engine.update();                                 // tick Anime.js inside it
  applyExplode(units, state.explode * cfg.explode.distance);
  looks.apply(state, pivot, camera, intro.v);      // theme, lines, hull, dissolve uniforms
  binder?.update(state.panel);
  renderer.render(scene, camera);
  binder?.render(camera);                          // CSS3DRenderer, same camera
});
```

Master timeline, in pixels, pinned to the scroll range:
```js
const observer = onScroll({ target: 'main', enter: { container: 0, target: 'top' },
  leave: { container: viewH, target: 'bottom' }, sync: 0.45 });   // absolute px, immune to the URL bar
const tl = createTimeline({ defaults: { ease: 'inOutCubic' }, autoplay: observer });
tl.add(pivot, { x: [a.x, b.x], rotateY: [a.rotateY, b.rotateY], duration }, moveStart);
tl.add(state, { draw: [a.draw, b.draw], dark: [a.dark, b.dark], duration }, moveStart);
tl.call(() => {}, schedule.range);                 // pin duration to the scroll distance
```

Theme at any `dark`: `theme.at(dark)` returns `{ bg, fg }`. `fg` is the better of ink and inkDark for that `bg`.

## Anime.js v4 facts

| Wrong (v3) | Right (v4) |
|---|---|
| `import anime from 'animejs'` | `import { animate, createTimeline, onScroll } from 'animejs'` |
| `anime({ targets })` | `animate(targets, params)` |
| `easing: 'easeOutQuad'` | `ease: 'outQuad'` |
| `direction: 'alternate'` | `alternate: true` |
| `anime.setDashoffset` | `createDrawable(selector)` then animate `draw` |
| `anime.timeline()` | `createTimeline()` |

Verified in the 4.5.0 source and in the browser:
- `onScroll` thresholds read `'<container position> <target position>'`. They also accept `{ container, target }`, where a number is absolute pixels. Pixels beat `'bottom bottom'` because 'bottom' of the container is `window.innerHeight`.
- Progress maps onto the timeline's TOTAL duration. Any child that ends after your intended end rescales everything. Pin the duration with `tl.call(fn, range)` and assert `tl.duration === range`.
- A numeric `sync` becomes a per-frame lerp factor of `0.01 + 0.19 * sync`. The old starter's 0.18 gave 0.044 per frame, a time constant of about 0.4 s. The new default 0.45 gives about 0.096. `true` is strict 1:1.
- The Three.js adapter: `x/y/z` are position, `rotateX/Y/Z` are degrees, `scale` is uniform. Setting scale or opacity to 0 flips `visible`. Material `opacity` needs `transparent = true`.
- `engine.useDefaultMainLoop = false` is global. Restore it and call `engine.wake()` on teardown so the host page's other animations survive.
- `tl.revert()` plus `observer.revert()` is a complete teardown.

## Failure modes this skill was built to avoid (all measured, see `references/09-anti-patterns.md`)

1. Text and sketch lines vanishing mid-transition (1.09:1 contrast when both are lerped).
2. The object arriving late and later per chapter (abstract timeline plus a staggered tail).
3. Accent specks left on the finished solid (dissolve constant 1.14 against a required 1.17 minimum).
4. A CDN decoder path although three 0.187 ships Draco and KTX2 decoders and Vite bundles them.
5. A remount (React StrictMode, HMR) losing the DOM panel because dispose never gave it back.
6. Documented features that the code did not have (tiers, context loss, offscreen pause, destroy).
7. An untested GLB path: the old starter only ever ran the procedural object.
8. The recommended `optimize` command itself: with default flags it merged the parts and deleted the markers the rest of the skill depends on.

## Originality and licensing

Anime.js and Three.js are MIT. The animejs.com site's models, diagrams, copy, logo and layout are not offered for reuse. Do not download or recreate its GLB files, SVG diagrams or text. Build an original object, original panel content and original copy. The deliverable markets the user's product, not Anime.js.

## Anti-patterns

Full list with the tell for each in `references/09-anti-patterns.md`. The big ones: scroll hijacking, two systems writing one property, measuring layout once, hex in shaders, a 40 MB model, an abstract-millisecond timeline, lerping text against background, and claiming it works because `vite build` passed.

## Output contract

When finished, hand back:
- the project folder and the exact commands to run it (`npm install`, `npm run dev`, `npm run build`, optional `npm run build:single`);
- one paragraph: the chapters and what moves in each;
- the verification evidence: `npm test` result, the `verify.mjs` summary line, and the contact sheet path, with the viewports covered;
- what was NOT verified (real GPU, Safari, touch feel, phone URL bar) and how the user can check it;
- any assumption about the object or brand, and any audit warning you chose to accept.

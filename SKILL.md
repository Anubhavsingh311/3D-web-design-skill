---
name: "3d-web-design"
description: Build scroll-driven 3D object experiences where a real 3D model (GLB, GLTF, OBJ, FBX, STL, or a procedural shape) is woven into a website instead of floating on top of it. Covers the object itself drawing as a sketch (edge draw-on, hidden-line removal), exploding into parts, dissolving into physically based material, and pinning live HTML or SVG onto the object's surface so the DOM occludes correctly. Uses Three.js with Anime.js v4 (onScroll, timeline, createDrawable, Three.js adapter). Use this skill whenever the user wants a scroll-animated 3D product, hero object, sketch-to-solid reveal, exploded view, "3D that blends into the page", an animejs.com style landing page, DOM elements attached to a 3D model, or says things like "put my model into the site", "scroll 3D", "sketch animation 3D", "3D hero", or "make the object part of the page", even if they never name Three.js or Anime.js.
---

# Scroll 3D Object Stage

Build a page where one 3D object lives inside the layout, changes state as the reader scrolls, and shares its camera, palette and grid with the DOM. The reference experience is the homepage of animejs.com. Treat it as a technique study, never as a template to copy (see "Originality").

## What the reference actually does

Read `references/01-reference-anatomy.md` before designing. The short version, with confidence labels:

- Fact: the site pairs scroll-synced SVG line drawing (`createDrawable` plus `onScroll({ sync: true })`) with staggered grids, timelines, springs and a Three.js scene. Its own course page lists HTML, CSS, SVG, Canvas 2D and WebGL (Three.js) as the ingredients.
- Widely reported, not verified in source: DOM demos shown "inside" the 3D machine are one div transformed with CSS 3D to match the WebGL model beneath it. This skill implements that idea with the standard, documented route (CSS3DRenderer plus a hole-punch plane).
- Inference: a fixed canvas stage behind scrolling chapters, with one master timeline mapped to scroll progress.

The reference moves a camera through a fixed machine. This skill goes further: the **object** is the actor (rotate, move to layout anchors, draw, explode, dissolve), and the camera only dollies lightly.

## The architecture (memorise this)

```
z0  #bg          fixed colour layer, animated with the object (one shared `dark` value)
z1  #css-layer   CSS3DRenderer output: DOM panels transformed by the SAME camera as WebGL
z2  #stage       fixed transparent WebGL canvas, pointer-events none
z3  main         real page text, in normal document flow, real native scroll
```

Rules that make it work, and why:

1. **Native scroll only.** The page scrolls normally. The stage is fixed and reads progress. Hijacked scroll breaks accessibility, anchors and mobile momentum.
2. **One master timeline, one scroll observer.** All motion (object pose, material state, SVG drawing) lives in a single `createTimeline` linked to `onScroll`. Two competing timelines drift apart.
3. **State object plus pose objects.** The timeline tweens a plain `state` ({draw, reveal, explode, lines, panel, dark}) and the `pivot` group. The render loop reads them. This is debuggable, testable in Node, and independent of adapter quirks.
4. **Layout drives placement.** The object goes where the active chapter's `.anchor` box is, measured in the DOM. That is what makes it look designed rather than overlaid.
5. **The object owns its own theme.** Page background and text colour derive from the same `dark` value as the object, so they cannot disagree.

## Workflow

Follow in order. State assumptions in one line each, then proceed. Ask at most one question, and only when no object and no brief exist.

### Step 0: Intake
Collect or assume: the object (file path, or "procedural stand-in"), the brand tokens (ink, paper, accent, font), the chapter list (default five: intro, sketch, parts, material, detail), and the target framework (default: Vite plus vanilla JS; use the project's framework if one exists). If the project already has React, wrap the stage in one component that owns `init()` and `destroy()`; never re-create the renderer on re-render.

### Step 1: Start from the starter
Copy `assets/starter/` into the project. It is a verified, working Vite project (builds clean, runs in headless Chromium with WebGL, zero console errors, node smoke test passes). Do not rewrite it from scratch. Edit `src/config.js` (pose table, tuning), `index.html` (chapters and copy) and `src/style.css` (tokens).

Pinned versions (tested together, do not bump silently): `animejs 4.5.0`, `three 0.187.0`, `vite ^7`. The Three.js adapter needs Three.js 0.150 or newer. Import it once, as a side effect: `import 'animejs/adapters/three'`.

### Step 2: Ingest the object
Read `references/04-object-ingest.md`. Always:
1. Convert to GLB. Optimise with `gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress webp` (target under 3 MB for the hero object, under 5 MB hard cap).
2. Pass the loaded scene through `prepareObject(raw, size)`. It centres the object, scales the largest dimension to `size`, builds the `pivot > holder > raw` hierarchy and discovers `slot_*` and `anchor_*` markers.
3. Name parts meaningfully in the source file. Explode and sketch stagger operate on the children of the first branching node, so a single fused mesh cannot explode. If the model is one mesh, tell the user and either split it by material or skip the explode chapter.
4. Add a `slot_screen` marker (Empty, scale = panel size in object units, local +Z facing out, 0.01 in front of the surface) wherever a DOM panel should live.

### Step 3: Choose a look recipe
Read `references/03-sketch-and-look-recipes.md`. Default recipe is **sketch to solid**: paper-coloured fill (hides back edges), fat edge lines that draw on, then a noisy dissolve sweep into the original PBR material with an accent-coloured cut edge. Other recipes: blueprint (orthographic, dashed hidden lines), hatch, toon outline, wireframe-to-solid. Pick one per page. Mixing three looks reads as a demo reel, not a brand.

Smooth shapes (spheres, tori, scans) have no hard edges. The starter retries edge extraction at a low angle. If that still looks wrong, add the silhouette pass from the reference file.

### Step 4: Choreograph
Read `references/05-scroll-choreography.md`. Edit the `CHAPTERS` table in `src/config.js`: one row per `.chapter`, each row is the pose at the END of that chapter's transition. Rules of thumb:
- Every chapter has a hold (default 30 percent) where nothing moves, so text can be read.
- Rotation per chapter stays under about 180 degrees. Larger spins look like a loading spinner.
- Change one big thing per chapter (draw, then explode, then material, then panel). Parallel big changes dilute each other.
- Every tween has explicit `[from, to]` values. This makes rebuilds after resize safe.

### Step 5: Register DOM to the object
Read `references/02-dom-webgl-registration.md`. Use:
- `createSlotBinder` for panels that must sit on a surface, warp with perspective and be occluded by nearer geometry.
- `projectToScreen` for flat labels that only follow a point.
The occlusion trick: the WebGL canvas is transparent, and a plane with `blending: NoBlending, opacity: 0` punches an exact hole where the DOM panel sits behind. Anything nearer than the plane still covers the panel.

### Step 6: Blend into the site
Read `references/06-blend-into-site.md`. Minimum bar before calling it done:
- Colours come from the site's CSS custom properties (`readTokens()`), not hard-coded hex.
- Page background and text follow the object's `dark` state.
- The object occupies the same grid column as the chapter's `.anchor`, on every breakpoint.
- Lighting has no pure white and no pure black; tone mapping is `NeutralToneMapping` so brand colours survive.
- One contact cue ties object to page: a soft shadow plane, a baseline rule it sits on, or grain shared with the page. Pick one.

### Step 7: Resilience
Read `references/07-performance-and-fallbacks.md`. Non-negotiable:
- `prefers-reduced-motion`: no scrubbing, cut between poses (`buildStatic`).
- No WebGL: `createStage` returns null, add `.no-webgl`, the page stays fully readable.
- Mobile: DPR cap 1.5, and a lighter geometry or fewer parts if the model exceeds 150k triangles.
- Rebuild on resize (debounced) and after `document.fonts.ready`. Layout measurements go stale otherwise.
- Provide the text content in the DOM. The 3D object is decoration, never the only carrier of meaning.

### Step 8: Verify (do not skip)
Read `references/08-verification.md`. Build, then actually look at it:
```
npm run build
node test/smoke.mjs
```
Then load in a headless browser with software WebGL, scroll to 0, 30, 50, 70, 100 percent, wait 3 seconds each (software GL is slow), capture screenshots, and read them. Check the console is empty. If no browser is available, say so plainly and list what is unverified. Never claim visual correctness from a clean build alone.

## Core code patterns (copy, do not reinvent)

Render loop shared by Three.js and Anime.js:
```js
import { engine } from 'animejs';
engine.useDefaultMainLoop = false;          // Three.js owns the loop
renderer.setAnimationLoop((time) => {
  engine.update();                           // tick Anime.js inside it
  applyExplode(units, state.explode * CONFIG.explodeDistance);
  looks.apply(state, pivot);
  binder?.update(state.panel);
  renderer.render(scene, camera);
  binder?.render(camera);                    // CSS3DRenderer, same camera
});
```

Master timeline bound to scroll:
```js
const observer = onScroll({ target: 'main', enter: 'top top', leave: 'bottom bottom', sync: 0.18 });
const tl = createTimeline({ defaults: { ease: 'inOutCubic', duration: T }, autoplay: observer });
tl.add(pivot, { x: [a.x, b.x], rotateY: [a.rotateY, b.rotateY], scale: [a.scale, b.scale] }, at);
tl.add(state, { draw: [0, 1], reveal: [0, 0] }, at);
tl.add(createDrawable(svgPaths), { draw: ['0 0', '0 1'], delay: stagger(70) }, at + T * 0.3);
```

Three.js adapter facts (verified in the 4.5.0 source): `x/y/z` map to position, `rotateX/Y/Z` are in degrees, `scale` is uniform, `scaleX/Y/Z` are per axis. Setting scale or opacity to 0 through the adapter flips `visible` to false. Material `opacity` only fades if `material.transparent = true`. A `Group` has no material, so fade its meshes instead. Animating a shared material changes every mesh using it.

Draw-on edges (the "sketch" core): `EdgesGeometry` into `LineSegmentsGeometry`, a `LineMaterial` with `dashed: true`, `dashSize` growing from 0 to the total edge length and `gapSize` larger than that, after `line.computeLineDistances()`. Set `material.resolution` on every resize or lines render hair-thin.

## Anime.js v4 pitfalls (agents keep writing v3)

| Wrong (v3) | Right (v4) |
|---|---|
| `import anime from 'animejs'` | `import { animate, createTimeline, onScroll } from 'animejs'` |
| `anime({ targets })` | `animate(targets, params)` |
| `easing: 'easeOutQuad'` | `ease: 'outQuad'` |
| `direction: 'alternate'` | `alternate: true` |
| `anime.setDashoffset` | `createDrawable(selector)` then animate `draw` |
| `anime.timeline()` | `createTimeline()` |
| `translateX: 100` | `x: 100` (both work, `x` is preferred) |

Thresholds in `onScroll` read `'<container position> <target position>'`, for example `'bottom top'` means the container's bottom meets the target's top. Turn on `debug: true` while tuning, then remove it.

## Originality and licensing

Anime.js and Three.js are MIT. The animejs.com site's models, diagrams, copy, logo and layout are not offered for reuse. Do not download or recreate its GLB files, SVG diagrams or text. Build an original object, original panel content and original copy. The deliverable markets the user's product, not Anime.js.

## Anti-patterns (full list in `references/09-anti-patterns.md`)

- Scroll hijacking, or a smooth-scroll library fighting `onScroll`.
- Writing the same property from two systems (timeline and idle wobble on the same group). Use the `floater > pivot` split.
- A canvas that is `pointer-events: auto` and blocks links.
- Measuring layout once at load and never again.
- Putting colour in shaders as hex instead of reading tokens.
- A 40 MB model, or textures that were never compressed.
- Claiming it works because `vite build` passed.

## Output contract

When finished, hand back: the project folder, a one-paragraph description of the chapters and what moves in each, the exact commands to run it, the list of what was verified (build, node test, headless screenshots with the scroll positions used) and what was not, and any assumption made about the object or brand.

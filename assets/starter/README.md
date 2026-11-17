# Scroll 3D object stage (starter)

A Vite project: one 3D object lives in the page layout, sketches itself, explodes, dissolves into material and hosts a live DOM panel, driven by native scroll. Three.js 0.187 and Anime.js 4.5.0, pinned and tested together.

```bash
npm install
npm run dev            # http://localhost:5173, add ?debug for a HUD, anchor outlines and slot axes
npm test               # 36 Node unit tests, no browser
npm run build          # dist/
npm run build:single   # ONE self-contained dist-single/index.html (meshopt or plain GLB only)
```

Verify in a real (headless) browser from the skill folder:
```bash
node <skill>/scripts/verify.mjs --project . --out verify-out --posters
```

## What you edit
| File | What |
|---|---|
| `src/config.js` | tuning (`CONFIG`) and the pose table (`CHAPTERS`, matched to `data-chapter` ids) |
| `index.html` | chapters, copy, the DOM panel |
| `src/style.css` | tokens `--ink --paper --accent`, optional `--paper-dark --ink-dark`, layout |
| `src/model/object.glb` | your model. Picked up automatically. No file means a procedural machine |

Everything else is infrastructure. Read `references/` in the skill before changing it.

## Modules
| Module | Job |
|---|---|
| `experience.js` | `createExperience()` returns `{ ready, destroy }`. Wires everything, owns the render loop |
| `schedule.js` | scroll geometry to timeline windows, in pixels. Pure |
| `choreo.js` | the master Anime.js timeline and the reduced-motion fallback |
| `layout.js` | anchor boxes to world placement, the one stage box |
| `ingest.js` | load, normalise, markers, slots (quad, Empty, coded), explode units and modes, audit |
| `looks.js` | fill, solid with dissolve, pen-ordered lines, silhouette hulls |
| `edges.js` | edge segment ordering for the draw-on. Pure |
| `theme.js` | one `dark` value for page and object, contrast-safe. Pure |
| `register.js` | DOM panel on a surface (CSS3DRenderer plus hole-punch plane) |
| `contact.js` | the one cue that ties object to page: `grain`, `shadow`, `none` |
| `stage.js` | renderer, lights, environment, tiers, context loss, `disposeTree` |
| `perf.js` | tier picking and the frame monitor. Pure |
| `debug.js` | `?debug` HUD and `?verify` hooks (`window.__stage`) |
| `model.js` | finds `src/model/object.glb` at build time (Vite only) |

## URL flags
`?debug` HUD, anchor outlines, slot axes. `?verify` deterministic mode for tests. `?tier=low|mid|high`. `?demo=machine|knot`.

## Conventions
- Chapters: `<section class="chapter" data-chapter="id">` with `.pin` (sticky, 100svh) containing `.copy` and `.anchor`.
- A chapter without a `CHAPTERS` row inherits the previous pose and warns.
- The timeline writes `pivot` and `state` only. Idle motion writes `floater` only.
- Never write a colour in JS or GLSL. Use the CSS tokens.
- A model needs `slot_screen` (a flat quad is best) for the panel chapter, or define it in `CONFIG.slots`.

# 08. Verification

A clean `vite build` proves nothing about a scroll experience. Verify at three levels, in this order, and put the evidence in the hand-off.

## Level 1: unit tests (Node, no browser, seconds)
```bash
cd <project> && npm test
```
35 tests cover the pure logic: theme contrast, schedule math, edge ordering, perf tiers and the frame monitor, ingest (bounds, markers, quad and coded slots, units, both explode modes, audit), contact shadow placement, looks (dissolve invariants, multi-material, hull selection, line contrast, draw-on stagger, threshold raising), layout and registration math, config fallback. Several tests are regression witnesses: they assert that the ORIGINAL behaviour (lerped colours, a 1.14 dissolve constant, a linear chapter timeline) fails, so the bug cannot return unnoticed. `node test/unit.mjs <substring>` runs a subset.

## Level 2: pre-flight on the model (seconds)
```bash
node <skill>/scripts/inspect-model.mjs model.glb
node <skill>/scripts/inspect-model.mjs out.glb --against in.glb     # after any optimise
```
See `04-object-ingest.md`.

## Level 3: headless browser (about 3 minutes for everything)
```bash
node <skill>/scripts/verify.mjs --project . --out verify-out --posters [--single] [--viewports desktop,mobile,landscape]
```
It builds, serves the production bundle, and drives real Chromium with software WebGL (SwiftShader), so it needs no GPU and no browser download. First run installs `puppeteer-core` and `@sparticuz/chromium` into `/tmp/3dweb-tools` (or `TOOLS_DIR`), which needs registry access and about 100 MB. If the sandbox blocks it, say so in the hand-off and list what is unverified. Do not substitute a clean build.

It loads the page with `?verify`: strict 1:1 scroll sync, no idle motion, no intro draw, no tier changes, and `window.__stage` exposed (state, pivot, schedule, timeline, `project()`, `coverage()`, `setPose()`, audit). Production visits without the flag are unaffected.

### What it asserts (per viewport: desktop 1280x720, phone 390x844, landscape phone 844x390)
| Check | Fails when |
|---|---|
| boots and renders a frame | shader error, model failure, CSP |
| timeline duration equals the scroll range | a child tween outlives the schedule (the 4210 vs 4000 bug) |
| scroll observer range equals the schedule range | thresholds not absolute, `main` not the observer target |
| schedule has no warnings | a chapter rests under half a screen, or is shorter than the viewport |
| model audit has no blocking warning | triangles, draw calls, VRAM, skinned, instanced |
| no horizontal overflow | a panel, an anchor or the canvas wider than the viewport |
| first screen is not empty | pose 0 draws nothing, or the model never appears |
| object at rest at its pose for the WHOLE reading window (3 probes per chapter) | arrival lag, wrong pose row, stale layout |
| object centre sits on its anchor (within 2 px) | layout measured at the wrong time, wrong box |
| drawn pixels centred on the anchor | object off-centre, wrong `fit`, markers in the bounds |
| text block fits the viewport | copy overflows on small screens |
| move into chapter i is halfway at the crossing's midpoint | object stuck, or moves outside its window |
| timeline time equals pixels scrolled | smoothing active in verify mode, wrong range |
| text contrast stays above 3.5:1 through every transition | lerped foreground and background |
| stage layers leave with the last pin, rendering pauses offscreen | missing `stageOffset`, a fixed layer over the footer |
| no console errors | anything |

### Behaviour groups (desktop)
- **reduced-motion**: static mode, the pose cuts to the chapter in view.
- **no-webgl** (Chromium started with `--disable-3d-apis`): `html.no-webgl`, readable headings, no uncaught errors, posters visible if `data-poster` is set.
- **lifecycle**: mount, unmount, mount, unmount, mount: one canvas, the panel re-bound (or untouched when there is no slot), still renders, no errors. Then `WEBGL_lose_context`: flagged, restored, renders again.
- **resize** while scrolled: the timeline rebuilds for the new size and still maps pixels to time exactly.
- **single-file** (`--single`): builds `dist-single`, no external requests, under 16 MB, boots from `file://`, renders, no errors.
- **posters** (`--posters`): transparent WebP per chapter.

Outputs in `--out`: a screenshot per viewport per chapter, `contact-sheet.png`, `audit.json`, `report.json`, `reduced-motion.png`, `no-webgl.png`, `after-context-loss.png`, `single-file.png`. Exit code is 1 on any failure.

## Read the pictures
Numbers are necessary and not sufficient. Open `contact-sheet.png` and look for what code cannot assert:
- Does each frame read as designed, with text and object balanced? Is the sketch a drawing, or a mesh dump?
- Is the dissolve edge clean? Any specks on the finished solid?
- Does the panel sit on the surface with the right perspective, and does the model's geometry pass in front of it where it should?
- Is any line or text hard to read in the dark chapters?
Zoom in on a full-resolution screenshot before judging line quality: downscaled contact sheets alias thin lines into dots, which looks like a bug and is not.

## Failure triage
| Symptom | Likely cause | Fix |
|---|---|---|
| "object at rest" fails on later chapters only | timeline not in pixels, or a tail past the range | use `schedule.js`, pin duration with `tl.call` |
| "object centre sits on its anchor" off by tens of px | layout measured before fonts loaded, or `offsetTop` used | rebuild on `fonts.ready`, measure rect differences |
| off on mobile only | canvas sized from `innerHeight` | `readStageBox()` |
| "drawn pixels centred" fails, centre offset | marker quad in the bounds, or `fit: 'box'` with a lopsided object | check `slot_*` handling, try `fit: 'sphere'` |
| contrast fails | foreground lerped | `createTheme().at()` |
| remount check fails: panel gone | dispose did not return the panel | `binder.dispose()` |
| first screen empty | pose 0 `draw` is 0 and there is no intro | `draw: 0.35`, `intro: true` |
| console error about WASM or decoders in single mode | Draco or KTX2 in a `build:single` | meshopt or uncompressed |
| model audit: fused | one mesh | split it, or drop the explode chapter |

## What is NOT verified, always say so
Real GPU frame times, Safari and iOS CSS 3D compositing, touch scrub feel, the phone URL bar behaviour, and Blender's export orientation for Empties. Give the user a short real-device checklist: scroll on an iPhone and an Android phone, check the detail chapter's panel, rotate the device, and check the first paint on a throttled connection.

# 07. Performance, resilience and fallbacks

Everything marked "in the starter" is implemented and exercised by `verify.mjs`. Frame times on real GPUs and phones are NOT measured here (headless software GL), so budgets below are design limits, not measurements.

## Budgets
| | Desktop | Phone |
|---|---|---|
| Triangles | 300k | 100k |
| Draw calls (the looks add up to 3 per mesh) | 300 | 120 |
| Model file | 5 MB hard cap | 3 MB |
| Texture memory | under 160 MB | under 160 MB, prefer 1024 px or KTX2 |
| JS (starter, gzip) | about 195 KB | same |

`auditObject` checks these with the desktop or phone budget chosen by viewport width, and prints codes (`triangles`, `draw-calls`, `vram`). Measured starter bundle: 717 KB raw, 195 KB gzip, with the Draco, KTX2 and glTF loaders as lazy chunks.

## Quality tiers (in the starter, `src/perf.js`)
| Tier | DPR cap | Environment | Parallax and idle |
|---|---|---|---|
| high | 2 | yes | yes |
| mid | 1.5 | yes | no |
| low | 1 | no (hemisphere light instead) | no |

- Starting tier from cheap signals: 2 cores or 2 GB is low, 4 cores or 4 GB or a coarse pointer is mid, else high. Phones are not automatically low: current ones are fast. `?tier=low|mid|high` forces one.
- A frame monitor watches frame deltas. When 60 percent of a 45-frame window exceeds 26 ms it drops one tier, then waits 120 frames so it cannot flap. The first 60 frames (shader compiles) and stalls over 250 ms (tab switches, long tasks) are ignored. Unit tested for all three behaviours.
- `antialias` is fixed when the context is created, so it follows the STARTING tier only.
- `?verify` disables the monitor so captures are deterministic. Software GL would otherwise drop to low immediately.

## Rendering costs
- Pixel ratio is the biggest lever. Never pass raw `devicePixelRatio` to `setPixelRatio`. `stage.resize` uses `min(devicePixelRatio, CONFIG.maxDPR (2), tier.dpr, 1.5 below 800 px wide)`, so a 3x phone renders at 1.5 and a Retina desktop at 2. The tier monitor lowers it further on slow GPUs.
- The fill, solid and lines layers triple draw calls. Merge small meshes first.
- The dissolve shader is cheap. It no longer recomputes a `Box3` every frame: the range is computed once, in object space.
- `renderer.info.render.calls` and `.triangles` are in the `?debug` HUD.

## Scroll and offscreen
- The stage layers scroll away with the last pin (`stageOffset`), and when they are fully out of view the loop skips drawing and keeps only the scroll state. Verified: the frame counter stops.
- Render on demand (skip frames while nothing changes) is NOT in the starter, because idle drift keeps the scene alive. If you disable idle (`idle: false`) you can skip `render()` when scroll progress and pointer are settled, but measure first.
- `will-change: transform` on the canvas is not needed: the stage only moves outside the experience.

## Resize, fonts, URL bar
- Resize events are debounced (150 ms `setTimeout`, cleared on teardown) and the handler returns without work when the stage box did not change. Do not call `renderer.setSize` or rebuild the timeline directly from a `resize` listener: it fires continuously while a window is dragged and on every orientation change.
- One stage box (`readStageBox`) sizes canvas, CSS3D layer and camera from the stuck `.pin` (100svh). A resize rebuilds only if width or pin height really changed, so a phone's URL bar sliding costs nothing. NOT verified on a real phone.
- Rebuild also runs on `document.fonts.ready` and on `prefers-reduced-motion` change. A rebuild after resize restores the same scroll position (verified: timeline time equals scrolled pixels afterwards).

## Hidden document (in the starter, verified)
`experience.js` listens to `visibilitychange`. While `document.hidden` is true it calls `renderer.setAnimationLoop(null)`, and on return it resets the frame clock and restarts the loop, so the monitor never sees a giant delta and anime.js time-based tweens do not run on a stale clock. Browsers already throttle `requestAnimationFrame` in background tabs, but not on every platform and not for an occluded window or another virtual desktop, so the explicit stop is the reliable version. A stage mounted in an already hidden tab waits for the first `visible` event. `verify.mjs` fakes `document.hidden`, asserts the frame counter freezes, then asserts it advances again.

## Context loss (in the starter, verified)
Mobile browsers drop WebGL contexts in the background. `stage.js` calls `preventDefault()` on `webglcontextlost` so the browser may restore, adds `html.context-lost` for styling, and on restore rebuilds the PMREM environment (a render target, which does not survive). Three re-creates its own GPU state. Verified with `WEBGL_lose_context`: the object renders again after restore. The canvas is reused across remounts, so the context is NOT force-released on `destroy()` unless you pass `releaseContext: true` for a canvas you are discarding.

## Fallback matrix
| Condition | Behaviour | How it is tested |
|---|---|---|
| `prefers-reduced-motion` | static mode, poses cut per chapter, no idle, no intro, chapters 100vh | `verify.mjs` reduced-motion group |
| No WebGL | `html.no-webgl`: canvas hidden, page fully readable, posters in the anchors if `data-poster` is set | launched with `--disable-3d-apis` |
| Model fails to load | `html.stage-error`, console error, page readable | by construction (boot is try/caught) |
| Context lost | `html.context-lost`, recovers on restore | `WEBGL_lose_context` |
| JS disabled | all text is real DOM, chapters and pins are plain CSS, canvas stays invisible | by construction |
| Slow GPU | frame monitor steps the tier down | unit tests |

## Single-file build
`npm run build:single` makes ONE `dist-single/index.html` with JS, CSS and the GLB inlined (`vite-plugin-singlefile`). Verified: an 812 KB file with a meshopt GLB boots from `file://`, renders, makes no external requests and logs no errors (`verify.mjs --single`). Draco and KTX2 are left out of this mode. Use it for hosts that take one HTML file, for emailing a preview, or for a hosted-page tool, see `11-integration-and-delivery.md`.

## Memory
- Dispose on teardown (the starter does): geometries, textures, materials, render targets, the environment, the CSS3D scene. WebGL resources are never garbage collected, so one `disposeTree(root)` (`stage.js`) walks a subtree and frees geometry, material arrays, textures in material slots and textures in `ShaderMaterial` uniforms. It runs on the loaded model, then once more on the whole scene as a safety net, and `destroy()` during the model download frees the late-arriving model too. A bare `obj.material.dispose()` is not enough: it misses material arrays and every texture.
- The verifier reads the OLD renderer's `info.memory` straight after `unmount()` and requires zero geometries and zero textures.
- Do not allocate vectors or colours in the render loop. The starter reuses temporaries.
- A model's textures are the VRAM cost. 2048 by 2048 is about 21 MB with mips. Five of them is a phone problem.

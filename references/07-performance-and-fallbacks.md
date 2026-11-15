# 07. Performance, accessibility and fallbacks

## Budgets
| Item | Desktop | Mobile |
|---|---|---|
| Model download | 5 MB hard cap, 3 MB target | 3 MB |
| Triangles | 300k | 100k |
| Draw calls (sketch look uses 3 per mesh) | 300 | 120 |
| Pixel ratio | 2 | 1.5 |
| JS (gzip) | 200 KB | 200 KB |
| Frame time | 16 ms | 20 ms |

The starter's bundle is about 170 KB gzip including Three.js. Keep it that way by importing addons by path, loading loaders lazily, and avoiding postprocessing unless the design needs it.

## Cheap wins
- Cap DPR (`stage.resize()` does).
- Pause rendering when the canvas is out of view (`IntersectionObserver` on `main`) and when the tab is hidden (`setAnimationLoop` already pauses with rAF).
- Render on demand for static chapters: if scroll progress, pointer and idle are all settled, skip the frame. Reduces battery use a lot on long reading sections.
- Merge small meshes offline. The sketch look triples draw calls per mesh.
- Reuse geometry, never clone it per instance. Use `InstancedMesh` for repeated parts. Anime.js's adapter can animate instances with `getInstances()`.
- Avoid `MeshPhysicalMaterial` transmission on mobile. It renders the scene twice.
- Shadows: one light, 1024 map, `PCFSoftShadowMap`, and only if a contact shadow is in the design.

## Tiering
Detect once at init:
```js
const lowEnd = navigator.hardwareConcurrency <= 4 || /Android|iPhone/.test(navigator.userAgent);
```
Low tier: DPR 1, no environment map (use two lights), edge lines at `linewidth: 1.2`, no pointer parallax, `scrollSmoothing: true` (cheaper than eased smoothing). A frame-time monitor that drops a tier after 30 slow frames is better than user-agent sniffing, add it when the object is heavy.

## prefers-reduced-motion
`buildStatic()` cuts between poses when a chapter is 60 percent visible. No idle, no pointer parallax, no scrub. Chapter height falls to 100vh in CSS. The DOM panel simply appears.

## No WebGL, context loss, old devices
- `createStage()` returns null if WebGL fails. Add `.no-webgl`, which hides canvas and CSS layer and shows a styled `.anchor` box. Put a static `<img>` of the object in each `.anchor` as the real fallback.
- Handle `webglcontextlost` (call `event.preventDefault()`) and `webglcontextrestored` (rebuild materials). Mobile browsers drop contexts in the background.

## Accessibility
- All meaning is in DOM text. The canvas is `aria-hidden="true"`.
- The DOM panel keeps real text and `role="img"` plus `aria-label` for SVG diagrams.
- Contrast: text over the object needs 4.5:1 at every scroll position. Check both `dark` states and the mid-transition.
- Focus: nothing in the stage is focusable. Keep the page fully keyboard usable. Skip link at top.
- Do not trap or hijack scroll. Keep native anchors working. When jumping to `#section`, the timeline follows because it is scroll-driven.
- Motion: respect reduced motion (above). Offer no auto-playing loops longer than 5 seconds.
- Seizure safety: no flashing above 3 per second. The dissolve edge is a sweep, not a strobe.

## SEO and sharing
The page is server-renderable because text is DOM. Give the OG image a static render of the solid object, not the sketch.

## Memory and teardown
`engine.useDefaultMainLoop = false` means Anime.js stops if you stop calling `engine.update()`. On route change in an SPA: `choreo.destroy()`, `looks.dispose()`, `binder.dispose()`, `stage.dispose()`, remove listeners.

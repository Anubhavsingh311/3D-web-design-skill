# 10. Sources and what each contributed

Primary
- animejs.com homepage and docs: feature set, scroll-synced `createDrawable` sample, `onScroll` thresholds, engine `update()` for external loops, Three.js adapter docs (loading, supported targets, gotchas).
- animejs package v4.5.0 source (`dist/modules/adapters/three/object3d.js`): verified property names (`x`, `rotateX` in degrees, `scale`, per-axis scale, visibility flip).
- Anime.js migration guide v3 to v4 (wiki): syntax changes, manual main loop for Three.js.
- Anime.js Learn page: statement that the landing page uses HTML, CSS, SVG, Canvas 2D and WebGL (Three.js).
- three.js manual, "Aligning HTML elements to 3D": projection of points to CSS pixels.
- three.js forum threads on CSS3DRenderer occlusion: the NoBlending hole-punch plane, the CSS layer behind a transparent canvas, pointer-event implications.
- Motion.dev "Three.js: Scroll-driven logo" example: `EdgesGeometry` plus `LineDashedMaterial` with growing `dashSize` as a draw-on.

Inspiration (structure and ideas, no code copied)
- `awwwards-3d` Claude skill (tsogjavklann): skill layout with locked versions, references, templates, anti-pattern list and a verification stance.
- `3d-web-experience` skills (davila7 and others): asset pipeline basics, `gltf-transform`, scroll-driven R3F and GSAP patterns.
- Anime.js v4 skills from the community: the v3 to v4 pitfalls table.
- A published studio case study on orthographic blueprint rendering with `EdgesGeometry` plus a custom conditional-lines shader: blueprint recipe.
- A community clone of the Anime.js homepage (React, Vite, Anime.js, Three.js) that copies the site's own GLB assets. Read for architecture only. Do not reuse its assets.

Not verified
- The site's real internal implementation of DOM-in-3D (reported only).
- Real-device behaviour (Safari CSS 3D, touch scrub feel, GPU frame times).

Measured in this environment (headless Chromium 153 with SwiftShader WebGL2, Node 22, npm registry latest: animejs 4.5.0, three 0.187.0, vite 8.3.8 with 7.3.8 used)
- Original starter: builds, smoke test passes, zero console errors. Timeline duration 4210 against a nominal 4000. Text contrast 1.09:1 at `dark = 0.525` (screenshot). Last-chapter arrival 613 px late. Draco decoder pointed at gstatic although three 0.187 ships and Vite bundles its own.
- Anime.js 4.5.0 source: `engine.useDefaultMainLoop` and `engine.wake()`; `timeline.call` adds a zero-duration child; `onScroll` threshold parsing (strings, `{ container, target }`, numbers as pixels); numeric `sync` becomes a per-frame lerp factor `lerp(0.01, 0.2, sync)`.
- three 0.187 source: `DRACOLoader` and `KTX2Loader` default decoder URLs via `new URL(..., import.meta.url)`.
- gltf-transform 4.5.1 CLI: which `optimize` flags keep markers and parts (tests above), and the GLB results for meshopt and Draco output.
- Rebuilt starter: 35 unit tests, about 145 browser checks across three viewports, four GLB fixtures plus meshopt and Draco variants, a single-file build from `file://`, a React 18 StrictMode harness with unmount and remount.

Not verified
- The site's real internal implementation of DOM-in-3D (reported only).
- Real-device behaviour: Safari CSS 3D, touch scrub feel, GPU frame times, the phone URL bar, Blender's Empty export orientation (derived from the exporter's axis conversion, not run).
- Next.js (see `11-integration-and-delivery.md`), GSAP and react-three-fiber ports.

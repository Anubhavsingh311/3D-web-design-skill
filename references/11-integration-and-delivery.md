# 11. Integration and delivery

## Vanilla (the starter, tested)
`src/main.js` calls `createExperience()` once. The page must contain, in this order: `#bg`, `#css-layer`, `canvas#stage`, a hidden `#panels` holding `.panel#panel-screen`, then `<main>` with `<section class="chapter" data-chapter="...">` blocks, each `.pin` containing a `.copy` and an `.anchor`.

`createExperience({ config, canvas, releaseContext })` returns `{ ready, destroy }`.
- `destroy()` is safe at any moment, even during model loading. It restores the model's materials, gives the DOM panel back to its parent, disposes GPU resources, aborts every listener, restores `engine.useDefaultMainLoop`, clears the CSS variables and classes it set, and removes `window.__stage`.
- Call `createExperience` twice only with a `destroy()` in between.
- Vite HMR: `import.meta.hot.dispose(() => experience.destroy())` is already in `main.js`.

## React 18 (tested: Vite 7, React 18.3, dev StrictMode, unmount then remount, zero console errors)
Copy `assets/starter/src/*` into the app (keep the module files together, the entry `main.js` is not needed), then add `assets/templates/react/ScrollStage.jsx` and `Chapters.jsx`.
```jsx
import ScrollStage from './ScrollStage.jsx';
import Chapters from './Chapters.jsx';
export default function Home() { return <ScrollStage><Chapters /></ScrollStage>; }
```
```jsx
// ScrollStage.jsx
useEffect(() => { const e = createExperience({ config }); return () => e.destroy(); }, []);
```
Why it is safe: StrictMode's dev double-invocation is mount, cleanup, mount. `destroy()` returns the panel to `#panels`, so the second mount finds it where it expects it. Verified in a harness that toggles the component off and on: one canvas, the panel bound in `#css-layer`, the object renders, `window.__stage` cleaned up in between.
- `config` is read once. Remount with a new `key` to change it.
- React removes the DOM before passive effect cleanup runs on a real unmount. That is fine here because the panel sits inside React-owned nodes at that point. If you conditionally remove only `#panels` or only `#css-layer`, call `destroy()` first (a layout effect).
- Do not set `releaseContext: true` under StrictMode: the canvas element survives the simulated unmount, and a force-lost context cannot be handed to a new renderer. For a canvas you create and discard yourself, pass it in `canvas` with `releaseContext: true` on teardown.
- Put the model at `src/model/object.glb` (Vite). In another bundler see below.

## Vue, Svelte, others
Same shape: `createExperience()` in the mounted hook, `destroy()` in the unmount hook, markup rendered by the framework. UNTESTED, but nothing in the starter depends on React.

## Next.js and other non-Vite bundlers (UNTESTED)
Three things in the starter are Vite-specific: `import.meta.glob` (`src/model.js`), `import.meta.env.MODE` (`ingest.js`, guarded with optional chaining so it is undefined elsewhere), and `import.meta.hot` (`main.js`, guarded). In Next:
1. Replace `src/model.js` with `export const MODEL_URL = null;` and pass `config: { modelUrl: '/models/object.glb' }` (file in `public/`).
2. Render the stage in a client component (`'use client'`), loaded with `dynamic(() => import('./ScrollStage'), { ssr: false })`. Three.js and Anime.js touch `window`.
3. Import the CSS from a global stylesheet. Check that `three/addons/...` and `animejs/adapters/three` resolve (they are package `exports`).
4. The decoders: three 0.187 resolves them with `new URL(..., import.meta.url)`, which Webpack 5 and Turbopack support. Test a Draco or KTX2 file before relying on it, or use meshopt.

## Single hosted file
`npm run build:single` writes one `dist-single/index.html` with JS, CSS and the GLB inlined (`vite-plugin-singlefile`, `assetsInlineLimit` raised, Draco and KTX2 left out).
- Verified: 812 KB with a meshopt GLB, boots from `file://`, renders, no external requests, no console errors (`verify.mjs --single`).
- Use meshopt or an uncompressed GLB. Do not use Draco or KTX2 here.
- Keep it under the host's limit (16 MB for a typical hosted-page publisher). The verifier checks 16 MB.
- NOT verified: a specific host's content-security policy. Meshopt decoding uses WebAssembly, and a policy that forbids `wasm-unsafe-eval` would block it. If a host refuses, ship an uncompressed GLB (larger, no WASM).
- No fonts or images from other origins. The starter uses system fonts and inline SVG.
- If the host offers a publish step for single HTML files, publish `dist-single/index.html` and also hand back the project folder, so the user can edit and rebuild. Do not paste a bundle into chat.

## Porting the choreography layer (UNTESTED)
The architecture is library-agnostic. Only `src/choreo.js` and the `engine` lines in `experience.js` are Anime.js-specific. `schedule.js`, `layout.js`, `ingest.js`, `looks.js`, `register.js`, `theme.js`, `edges.js` take plain Three.js objects and numbers.
- **GSAP ScrollTrigger**: one `gsap.timeline({ scrollTrigger: { trigger: 'main', start: 'top top', end: () => '+=' + schedule.range, scrub: 0.5 } })`. Use pixels as the time axis, exactly as here: add each move at `moveStart` with `duration = moveEnd - moveStart`, tween `state` and `pivot` (radians, `scale.x/y/z`), and keep `schedule.range` as the total. Remove the `engine` lines.
- **react-three-fiber**: `createLooks(meshes, theme, { pivot })` works on any mesh list. Call `looks.apply(state, pivot, camera)` in `useFrame`. R3F owns the renderer, so `createExperience` does not apply. Build the pieces yourself: `prepareObject`, `createLooks`, `createSlotBinder` (give it the R3F camera from `useThree`) and the schedule. drei's `<Html transform>` also puts DOM in 3D but has no hole-punch occlusion.

## SPA checklist
- One `createExperience` per mount, `destroy()` on unmount.
- Anything after `<main>` is fine: the stage layers leave with the last pin.
- Anchors and chapters must exist when it mounts. Measure again (`api.rebuild()`) after dynamic content changes the layout.
- Route changes that keep the canvas element alive can reuse it. Otherwise let it be garbage collected, or pass `releaseContext`.

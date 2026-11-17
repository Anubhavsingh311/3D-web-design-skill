# 09. Anti-patterns

Each item has the tell that reveals it in review. Items 24 and up were found by measuring the original starter and are covered by regression tests.

1. **Scroll hijacking.** Tell: `wheel` listeners with `preventDefault`, `overflow: hidden` on body. Fix: native scroll, `onScroll` reads it.
2. **Two writers to one property.** Tell: idle wobble code touching `pivot.rotation`. Fix: idle on `floater`, timeline on `pivot`.
3. **Stale layout.** Tell: `measureChapters()` called once. Fix: rebuild on resize and `document.fonts.ready`.
4. **Chapter backgrounds above the canvas.** Tell: object invisible on a coloured section. Fix: background layer at z0, chapters transparent.
5. **Opaque canvas.** Tell: `alpha: false` or a clear colour with alpha 1. Fix: `alpha: true`, `setClearColor(0, 0)`.
6. **Canvas blocks clicks.** Tell: links dead under the canvas. Fix: `pointer-events: none` on `#stage` and `#css-layer`.
7. **v3 Anime.js syntax.** Tell: `anime(`, `targets:`, `easing:`. See the table in SKILL.md.
8. **Reading from-values implicitly.** Tell: tween without `[from, to]` after a rebuild jumps. Fix: explicit arrays.
9. **Hex in shaders.** Tell: `vec3(1.0, 0.35, 0.2)` for brand colour. Fix: uniforms fed from CSS tokens.
10. **ACES tone mapping on a brand site.** Tell: oranges turn salmon. Fix: `NeutralToneMapping`.
11. **Fill colour not equal to background.** Tell: a visible silhouette where there should be only lines. Fix: `toneMapped: false`, colour from `--paper`.
12. **Thin 1 px lines.** Tell: `LineBasicMaterial` for the sketch. Fix: `LineMaterial` and set `resolution` on resize.
13. **`DoubleSide` to hide bad normals.** Tell: it is on everywhere. Fix: flip normals at the source.
14. **Uncompressed models.** Tell: GLB over 5 MB. Fix: `gltf-transform optimize` WITH the structure-preserving flags (item 28).
15. **Model is one fused mesh and explode is promised.** Tell: units.length is 1. Fix: split offline or cut the chapter.
16. **Hole plane without an offset.** Tell: flickering panel edge. Fix: slot 0.01 in front of the surface.
17. **Panel text scaled up from small.** Tell: blurry text. Fix: author large, scale down.
18. **Everything animates at once.** Tell: no chapter has a single headline change. Fix: sequence draw, explode, material, panel.
19. **No fallback.** Tell: blank page without WebGL or with reduced motion. Fix: `.no-webgl`, `buildStatic`, static images.
20. **Declaring victory from a build.** Tell: no screenshots in the hand-off. Fix: `08-verification.md`.
21. **Copying the reference's assets.** Tell: their GLBs, SVGs or copy in the repo. Fix: original content only.
22. **Reading layout in the render loop.** Tell: `getBoundingClientRect` inside `setAnimationLoop`. Fix: measure in `rebuild()`.
23. **Leaking GPU memory in SPAs.** Tell: no `dispose()` on route change.

24. **Lerping text against background.** Tell: both colours animated from one value. Measured: 1.09:1 contrast at the midpoint, headings and lines gone. Fix: `createTheme().at(dark)`, foreground jumps to the better of two inks.
25. **An abstract-millisecond timeline mapped onto scroll.** Tell: `chapterMs`, `holdFraction`. Measured: the object arrived 0.85 viewport heights late in the last chapter. Fix: a pixel-time schedule from measured geometry.
26. **A tween that outlives the nominal end.** Tell: a stagger or a delay near the end of the timeline. Anime.js maps progress onto the TOTAL duration, so everything silently rescales (4210 against 4000). Fix: end it inside the range, pin the duration with `tl.call(fn, range)`, assert `tl.duration === range`.
27. **Dissolve end state not clean.** Tell: accent specks on the finished object. Fix: `K >= 1 + noise + band` (1.14 against a required 1.17).
28. **`gltf-transform optimize` with defaults.** Tell: explode units dropped, `slot_*` gone. Measured: 7 units became 3 and every Empty marker vanished. Fix: `--join false --simplify false --instance false`, plus `--flatten false --prune false` for Empty markers, then `inspect-model.mjs --against`.
29. **Orienting an Empty by guesswork.** Tell: the panel faces up, down or into the body. Fix: use a quad mesh, or check the blue axis with `?debug`.
30. **Sizing from `window.innerHeight`.** Tell: layers disagree after a phone's URL bar slides. Fix: one stage box from the stuck `.pin` (100svh), absolute-pixel scroll thresholds.
31. **A CDN decoder path.** Tell: `setDecoderPath('https://www.gstatic.com/...')`. three 0.187 ships and bundles the decoders. Fix: delete it.
32. **No `destroy()`.** Tell: HMR or StrictMode shows two loops, a missing panel, a dead context. Fix: `createExperience()` returning `destroy()`, panel handed back, listeners on one AbortController, `engine.useDefaultMainLoop` restored.
33. **Documented, not built.** Tell: a doc describes tiers, context loss or offscreen pause and the code has none. Fix: implement it or delete the claim, and test it.
34. **A fixed stage over content after `<main>`.** Tell: the object floating over the footer. Fix: `stageOffset` scrolls the layers away with the last pin, rendering stops once they are gone.
35. **A path never exercised.** Tell: the GLB route was written and only the procedural object ever ran. Fix: fixtures through the real loader (`assets/fixtures`).
36. **Stretching the panel to a fixed size.** Tell: a 1:2 screen shows a squashed 1.6:1 panel. Fix: panel height from the slot's aspect.
37. **World-space dissolve noise.** Tell: the noise swims while the object rotates. Fix: object-space front and noise.
38. **Scattered edge order.** Tell: draw-on looks like specks appearing. Fix: `orderSegments` chains and visits nearest first.
39. **Hull outlines on hard parts.** Tell: torn corners. Fix: `look.outline: 'auto'` gives hulls only to smooth parts.
40. **Disposing only `material`.** Tell: `scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); })` and the texture count still climbs on every remount. Fix: `disposeTree`, which also frees material arrays, slot textures and shader uniform textures.
41. **Freeing only what was mounted.** Tell: a fast route change while the GLB downloads leaves the model on the GPU. Fix: free the model in the `disposed` branch after the await.
42. **A render loop that ignores the page being hidden.** Tell: GPU and battery use with the tab in the background, or a jump on return. Fix: stop the loop on `visibilitychange`, reset the frame clock on resume.

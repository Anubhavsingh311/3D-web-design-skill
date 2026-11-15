# 09. Anti-patterns

Each item has the tell that reveals it in review.

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
14. **Uncompressed models.** Tell: GLB over 5 MB. Fix: `gltf-transform optimize`.
15. **Model is one fused mesh and explode is promised.** Tell: units.length is 1. Fix: split offline or cut the chapter.
16. **Hole plane without an offset.** Tell: flickering panel edge. Fix: slot 0.01 in front of the surface.
17. **Panel text scaled up from small.** Tell: blurry text. Fix: author large, scale down.
18. **Everything animates at once.** Tell: no chapter has a single headline change. Fix: sequence draw, explode, material, panel.
19. **No fallback.** Tell: blank page without WebGL or with reduced motion. Fix: `.no-webgl`, `buildStatic`, static images.
20. **Declaring victory from a build.** Tell: no screenshots in the hand-off. Fix: `08-verification.md`.
21. **Copying the reference's assets.** Tell: their GLBs, SVGs or copy in the repo. Fix: original content only.
22. **Reading layout in the render loop.** Tell: `getBoundingClientRect` inside `setAnimationLoop`. Fix: measure in `rebuild()`.
23. **Leaking GPU memory in SPAs.** Tell: no `dispose()` on route change.

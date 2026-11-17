# 03. Sketch and look recipes

## Recipe A: sketch to solid (default, implemented in `src/looks.js`)
Up to four layers on identical geometry, driven by one `state`:

| Layer | Material | Purpose |
|---|---|---|
| fill | one shared `MeshBasicMaterial`, colour = page background, `toneMapped: false`, `polygonOffset` | hides back edges (hidden-line removal) and matches the page exactly |
| solid | clone of the original PBR material (per group, for multi-material meshes) plus a dissolve patch | the final material, revealed by a noisy sweep |
| lines | `LineSegments2` + `LineMaterial` (`dashed`, growing `dashSize`) | fat, resolution-aware crease lines that draw on in pen order |
| hull | inverted-hull `ShaderMaterial`, smooth parts only | silhouettes, which have no crease to draw |

State keys: `draw` (0 to 1, staggered across parts), `reveal` (0 to 1 dissolve), `lines` (opacity), `dark` (theme).

### Why these choices
- **Fat lines, not `LineSegments`.** WebGL lines are 1 px. A sketch needs 1.5 to 2.5 px. `LineMaterial` needs `resolution.set(w, h)` on resize (CSS px, so DPR cancels). The starter does it in `looks.resize()`.
- **Dashed trick for draw-on.** After `computeLineDistances()` distances accumulate across segments in index order. Growing `dashSize` from 0 to the total length, with a larger `gapSize`, reveals segments in order. One caveat measured: `computeLineDistances` accumulates in float32, so the last few segments can fall outside `total` by rounding. `gapSize = total * 2 + 1` and `dashSize = local * total` finish exactly in practice (tested at `draw = 1`).
- **Pen order, not face order.** `EdgesGeometry` emits segments in face-adjacency order, which on real models draws as scattered specks. `orderSegments()` (`src/edges.js`) chains connected segments into polylines and visits chains nearest first, so the reveal reads as one pen. Measured: a shuffled hex-tube torus (144 segments) goes from continuity 0.03 to 0.97 in 6 chains, with the identical set of segments and the same total length.
- **Parts draw largest first** (`look.drawOrder`: `'size'`, `'scene'`, `'bottom-up'`), staggered over 60 percent of the draw range and all finishing together at `draw = 1`.
- **polygonOffset on surfaces.** Edges lie exactly on faces. Pushing faces back stops z-fighting and lets lines win.
- **Edge angle.** `EdgesGeometry(geo, 28)` keeps edges between faces more than 28 degrees apart. Hard-surface models want 25 to 40. On a dense noisy mesh (scan, subdivided surface) a low threshold gives a mesh dump, so `analyseEdges` raises the threshold by 15 degrees at a time (up to 75) while more than 60 percent of the triangle count is drawn as edges. Tested with a jittered icosphere.
- **Accent after encoding.** The accent is mixed after `dithering_fragment`, when `gl_FragColor` is already sRGB, so the uniform is pre-encoded with `convertLinearToSRGB()`.

### Silhouettes for smooth parts (implemented)
Smooth surfaces (spheres, cylinders, tori, scans) have no crease to draw, so the lines layer alone leaves them looking open. `look.outline: 'auto'` adds an inverted hull to a part when its smooth share exceeds 0.55, where smooth share is `1 - hardEdges / (1.5 * triangles)`. Measured: cube 0.33 (creases only, no hull), cylinder and hex-tube torus 0.67 (hull plus lines), sphere, smooth torus and torus knot 1.00 (hull only). `'always'` and `'never'` override.
- The hull is the same geometry drawn as back faces, pushed outward along the normals by a constant number of SCREEN pixels (computed in clip space), so the outline keeps its weight at any object scale. Only the rim survives, because the fill covers the rest.
- It draws on as a clock wipe around the projected object centre, starting at 12 o'clock and finishing with `draw`.
- Limits: a hull tears at hard corners (that is why hard parts do not get one), and it shares the model's geometry (never dispose that from the looks layer).

### Dissolve (implemented): constants that must hold
The shader keeps a fragment when `reveal * K - field > 0` and tints it while that value is under `band`. `field` runs from 0 to `1 + noise`.
- `reveal = 0` must discard everything: true because `field >= 0`.
- `reveal = 1` must show everything untinted: needs `K >= 1 + noise + band`. The starter uses `K = 1 + noise + band + 0.03` (1.2 for the defaults). The original used 1.14 and left accent specks on 0.40 percent of the finished object's surface samples (the top edge, where noise is high). A unit test sweeps the grid and also asserts the old constant fails.
- The front is measured in **object space** (`uObjInv` is the pivot's inverse world matrix), so it travels with the object as it rotates and the noise sticks to the surface instead of swimming. The original used world space, recomputed a `Box3` over the whole object every frame, and the front moved relative to the object whenever it rotated.
- `dissolve.mode`: `'axis'` (default, along `dissolve.axis`, reads as construction when it climbs) or `'radial'` from `dissolve.from`, the name of a slot (reads as the screen powering the object).
- Multi-material meshes keep one patched clone per geometry group.

## Recipe B: blueprint (sketch only, NOT in the starter)
- `OrthographicCamera` for a flat technical view (a studio used `EdgesGeometry` for outer contours plus a custom `LineSegments` shader for internal and conditional lines).
- Background `#0b2a4a`, lines `#cfe8ff`, hidden lines dashed at 30 percent opacity (the same edges again with `depthFunc: GreaterDepth`, `dashed: true`).
- Dimension lines and labels as SVG in the DOM, positioned with `projectToScreen`, drawn with `createDrawable`.
Needs `ortho` support in `layout.js` (`viewToWorld` assumes perspective) and `register.js` (CSS3DRenderer supports orthographic cameras). Untested.

## Recipe C: hatch (sketch only)
Fragment shader: `float l = dot(normal, lightDir)`, then three line densities by thresholds (`l < 0.6`, `< 0.35`, `< 0.15`) using screen-space stripes from `fract(gl_FragCoord.x * 0.25 + gl_FragCoord.y * 0.25)`. Screen-space hatching keeps line weight constant under scaling. Pair with Recipe A's lines for contours.

## Recipe D: wireframe to solid (cheapest, sketch only)
`WireframeGeometry2` with `LineMaterial`, line opacity from 1 to 0 as the solid's opacity from 0 to 1 (`transparent: true`). Reads as a CAD tween. Busier than A.

## Recipe E: particles to object (sketch only)
`Points` with a vertex shader that lerps between random scatter positions and `MeshSurfaceSampler` samples of the model, driven by `uProgress`. Easy to overdo. Use for a single intro beat.

## Transitions between looks
Never hard-switch materials. Use a shared uniform with a spatial sweep and a lit edge.

## Colour rules
- Two inks and one accent. Lines are ink (or paper on dark). The accent appears only at the dissolve edge and on one or two small parts.
- Fill equals page background, otherwise the sketch looks pasted on.
- **Never lerp text and background against each other.** They cross at 0.5 with identical colour. Use `createTheme()`: the background lerps, the foreground (text and lines) jumps to whichever of ink or inkDark has more contrast with it. Worst case is about 4:1 for a typical palette at the crossover, against 1.09:1 for the lerp (a screenshot of the original shows every heading and line gone). `theme.worstContrast()` returns the number for any palette. For a dark chapter that is not a plain inversion set `--paper-dark` and `--ink-dark`.

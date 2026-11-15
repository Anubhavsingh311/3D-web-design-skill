# 03. Sketch and look recipes

## Recipe A: sketch to solid (default, implemented in `src/looks.js`)
Three stacked layers on identical geometry, driven by one `state`:

| Layer | Material | Purpose |
|---|---|---|
| fill | `MeshBasicMaterial`, colour = paper, `toneMapped: false`, `polygonOffset` | hides back edges (hidden-line removal) and matches the page background exactly |
| solid | clone of the original PBR material plus `onBeforeCompile` dissolve patch | the final material, revealed by a noisy sweep along world Y |
| lines | `LineSegments2` + `LineMaterial` (`dashed`, growing `dashSize`) | fat, resolution-aware edge lines that draw on |

State keys: `draw` (0 to 1 edge draw-on, staggered across parts), `reveal` (0 to 1 dissolve), `lines` (line opacity), `dark` (swaps ink and paper).

Why these choices:
- **Fat lines, not `LineSegments`.** WebGL lines are 1 px. A sketch needs 1.5 to 2.5 px. `LineMaterial` needs `resolution.set(w, h)` on every resize.
- **Dashed trick for draw-on.** After `computeLineDistances()` distances accumulate across segments in index order. Growing `dashSize` from 0 to the total length with a huge `gapSize` reveals segments in order. Sort edges (for example by position along an axis) before building the geometry if the order should read as a deliberate stroke.
- **polygonOffset on surfaces.** Edges lie exactly on faces. Pushing faces back by `polygonOffsetFactor: 1` stops z-fighting and lets lines win.
- **Edge angle.** `EdgesGeometry(geo, 28)` keeps edges between faces more than 28 degrees apart. Hard-surface models want 25 to 40. Scans and organic shapes need a silhouette pass (below).
- **Accent after encoding.** In the dissolve patch the accent is mixed after `dithering_fragment`, when `gl_FragColor` is already sRGB-encoded, so the uniform is pre-encoded with `convertLinearToSRGB()`.

### Silhouette pass (for curved or organic objects)
Inverted hull: add a clone of each mesh with `side: BackSide`, an ink `MeshBasicMaterial`, and a vertex shader that moves vertices along their normals by a small world-space amount (`transformed += normal * uWidth`). Render before the fill. Gives a constant outline on any smooth shape. Animate `uWidth` from 0 to draw it in.

## Recipe B: blueprint
- `OrthographicCamera` for a flat technical view (a studio used exactly this with `EdgesGeometry` for outer contours plus a custom `LineSegments` shader for internal and conditional lines).
- Background `#0b2a4a`, lines `#cfe8ff`, hidden lines dashed at 30 percent opacity (render the same edges a second time with `depthFunc: GreaterDepth`, `dashed: true`).
- Dimension lines and labels as SVG in the DOM, positioned with `projectToScreen`, drawn with `createDrawable`.

## Recipe C: hatch
Fragment shader: compute `float l = dot(normal, lightDir)`, then three line densities by thresholds (`l < 0.6`, `< 0.35`, `< 0.15`) using `fract(gl_FragCoord.x * 0.25 + gl_FragCoord.y * 0.25)` style screen-space stripes. Screen-space hatching keeps line weight constant under scaling. Pair with Recipe A's lines for contours.

## Recipe D: wireframe to solid (cheapest)
`WireframeGeometry2` with `LineMaterial`, `opacity` from 1 to 0 as the solid's `opacity` from 0 to 1 (`transparent: true`). Reads as a CAD tween. Visually busier than A.

## Recipe E: particles to object
`Points` with a vertex shader that lerps between random scatter positions and `MeshSurfaceSampler` samples of the model, driven by `uProgress`. Costs one more asset-free pass, but is easy to overdo. Use for a single intro beat only.

## Transitions between looks
Never hard-switch materials. Use a shared uniform (`uReveal`) with a spatial sweep and a lit edge. A sweep along an axis the viewer reads as "up" feels like construction. A radial sweep from the slot feels like the screen is powering the object.

## Colour rules
- Two inks and one accent. Lines are ink (or paper on dark). The accent appears only at the dissolve edge and on one or two small parts.
- Fill equals page background, otherwise the sketch looks pasted on.
- Check contrast of lines against fill at both `dark = 0` and `dark = 1`.

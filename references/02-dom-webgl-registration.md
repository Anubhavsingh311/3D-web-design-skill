# 02. Registering DOM to the 3D object

Three levels, cheapest first. Pick the cheapest that meets the design.

| Need | Technique | Cost |
|---|---|---|
| A label that follows a point | `projectToScreen()` then `transform: translate()` | trivial |
| A panel that sits on a surface, warps with perspective, may be occluded | CSS3DRenderer plus hole-punch plane (`createSlotBinder`) | low |
| A panel on a curved surface | Render to a canvas texture, or warp the element yourself | high, avoid |

## Level 1: point labels
```js
const { x, y, behind } = projectToScreen(anchorObject, camera, box.w, box.h);
el.style.transform = `translate(${x}px, ${y}px)`;
el.hidden = behind;
```
Position only. No rotation or perspective. For occlusion by the model, raycast from the camera to the anchor and hide the label when the first hit is not the anchor's own part. Use `box` from `readStageBox()`, never `window.innerHeight`.

## Level 2: surface panels (verified in headless Chromium, desktop, phone and landscape)
Layer order, back to front: `#css-layer` (CSS3DRenderer), `#stage` (transparent canvas), `main`.

1. The panel element is wrapped in a `CSS3DObject` inside a separate scene. CSS3DRenderer uses the SAME `PerspectiveCamera` as WebGL and derives its CSS perspective from the camera's projection matrix, so the DOM foreshortens exactly like the model.
2. One world unit equals one CSS pixel inside CSS3DRenderer. Each frame the slot's world matrix is decomposed into position, quaternion and scale. The CSS object gets position and quaternion as they are, and scale `slotWorldSize / panelIntrinsicPx`.
3. A child plane of the slot (`PlaneGeometry(1,1)`) uses `MeshBasicMaterial({ opacity: 0, transparent: true, blending: NoBlending, side: DoubleSide })`. `NoBlending` overwrites the canvas pixels with transparent ones, which reveals the panel behind the canvas. Geometry nearer to the camera than the plane fails the depth test against it, so it still covers the panel. That is real occlusion: the ring passes in front of the screen in the starter.
4. `backface-visibility: hidden` on the panel hides it when the slot turns away.
5. **The panel takes the slot's aspect ratio.** `slotSize(slot)` reads the slot's world size at the identity pose and the starter sets the panel's CSS height to `panelWidth * aspect`. A 1:2 phone screen and a 1.6:1 monitor both come out undistorted. (The original stretched the panel to a fixed 480 by 300.)
6. `dispose()` gives the panel element back to its original parent and restores its inline style. Without that, a remount (React StrictMode, HMR, route change) finds the panel gone. Tested.
7. CSS3DObject sets `user-select: none`. The binder clears it again, because the panel is real text.

## Slot convention: three ways to define one
A slot is an `Object3D` named `slot_<n>`. Its local unit plane (1 by 1, centred, facing +Z) is the panel area. Its scale is the size in object units. It sits about 0.01 (or 0.4 percent of the object size) in front of the surface, otherwise the hole z-fights with the body.

1. **A flat quad mesh named `slot_screen` (preferred).** Model a plane where the screen goes. `prepareObject` reads its geometry: it flattens world up onto the plane to get "up", takes the in-plane extents as width and height, flips the normal to face away from the object centre, lifts it off the surface, hides the quad, and creates the slot. It works in any DCC tool and cannot be mis-oriented. Keep the quad axis aligned (not rotated about its own normal), because width and height are measured along world right and up. Tested with a quad authored facing the wrong way, through the real GLB loader.
2. **An Empty named `slot_screen`.** Scale is the panel size, local +Z must face out. Fragile, see "Orientation of Empties" and "Optimisers delete Empties".
3. **In code, for models with no marker at all** (most downloads, and any file an optimiser stripped). `CONFIG.slots` in `src/config.js`:
   ```js
   slots: { screen: { position: [-0.2, 0.02, 0.3], size: [1, 0.62], normal: [0, 0, 1], part: 'body' } }
   ```
   Coordinates are normalised object space: origin at the object's centre, longest side equal to `objectSize` (2). Read them from the running page: `window.__stage.partBounds()` returns every part's min, max, centre and size in exactly this space (original geometry only, read it at scroll 0), and `?debug` logs it once. The front face of a part is its max z, so a screen on the front of `body` is `position: [cx, cy, body.max.z]`. Measured on a model whose marker an optimiser deleted: `position: [-0.153, -0.222, 0.237]` put the panel on the body's front face with the ring correctly passing in front of it. A marker inside the file wins over config. The slot attaches to `part` (a unit name) or to the nearest unit, so it travels with that part when the object explodes.

Open `?debug`. Every slot gets an axes helper: red right, green up, **blue is the way the panel faces and must point out of the surface**. That is the fastest orientation check there is.

### Orientation of Empties from Blender (derived, not tested in Blender)
The glTF exporter converts Z-up to Y-up by conjugating every node transform. Under that conversion, glTF local +Z corresponds to Blender local **-Y**, and glTF local +Y to Blender local +Z. So an Empty with no rotation on a front-facing surface (its -Y toward the front view) already exports facing +Z, and rotating it 90 degrees on X turns it to face up or down. A Blender plane MESH is different: its normal is +Z in Blender, which exports as +Y (edge-on to the camera), so planes need a 90 degree X rotation. The original docs said "rotate the empty 90 degrees on X", which is wrong for Empties. Use a quad mesh and the question disappears. Whatever you do, confirm with the `?debug` axes.

### Optimisers delete Empties
`gltf-transform optimize` with default flags prunes and flattens away empty leaf nodes, so `slot_*` and `anchor_*` Empties vanish silently. Measured: they survive only with `--flatten false --prune false` together. Quad slots survive because they have geometry, as long as `--join false` (joining merges the quad into the body) and `--simplify false` (simplifying can collapse a 2-triangle quad). Always compare after optimising:
```bash
node scripts/inspect-model.mjs out.glb --against in.glb
```
It prints markers lost and explode units before and after.

## Known limits
- The hole is a flat quad. A curved screen needs a hole mesh with the matching shape, and the DOM still stays flat. For curved surfaces render the panel to a texture instead.
- Interaction: the canvas is `pointer-events: none` and `main` is above the CSS layer, so panels are not clickable by default. For a clickable panel: `binder.setInteractive(true)`, then in CSS `main { pointer-events: none } main .copy, main a { pointer-events: auto }` and `.panel { pointer-events: auto }`. Check that only the visible panel region captures events.
- Text inside a heavily scaled panel can look soft. Author the panel at its largest on-screen size and scale down, not up.
- No `overflow: auto` scroll regions inside the panel. Nested scroll inside a 3D transform is miserable.
- iOS Safari has had CSS 3D compositing quirks. NOT tested here. Test on a real device and keep a fallback where the panel renders flat in the anchor box.

## Why not match a matrix3d by hand
Hand-built `matrix3d` strings need the projection, aspect, viewport flip and half-pixel offsets to agree, and they silently drift on resize. CSS3DRenderer is the maintained implementation of exactly that.

## Why not render the DOM into a texture
Libraries that rasterise DOM to canvas lose selectable text, accessibility and live SVG, and cost a texture upload per change. Use only when the surface is curved.

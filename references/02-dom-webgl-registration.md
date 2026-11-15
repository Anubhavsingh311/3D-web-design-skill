# 02. Registering DOM to the 3D object

Three levels, cheapest first. Pick the cheapest that meets the design.

| Need | Technique | Cost |
|---|---|---|
| A label that follows a point | `projectToScreen()` then set `transform: translate()` | trivial |
| A panel that sits on a surface, warps with perspective, may be occluded | CSS3DRenderer plus hole-punch plane (`createSlotBinder`) | low |
| A panel on a curved surface | Render to a canvas texture, or warp the element yourself | high, avoid |

## Level 1: point labels
```js
const { x, y, behind } = projectToScreen(anchorObject, camera, viewW, viewH);
el.style.transform = `translate(${x}px, ${y}px)`;
el.hidden = behind;
```
Position only. No rotation or perspective. For occlusion by the model, raycast from the camera to the anchor and hide the label when the first hit is not the anchor's own part.

## Level 2: surface panels (verified in headless Chromium)
Layer order, back to front: `#css-layer` (CSS3DRenderer), `#stage` (transparent canvas), `main`.

1. The panel element is wrapped in a `CSS3DObject` inside a separate scene. The CSS3DRenderer uses the SAME `PerspectiveCamera` as WebGL. It derives its CSS perspective from the camera's projection matrix, so the DOM foreshortens exactly like the model.
2. One world unit equals one CSS pixel inside CSS3DRenderer. Each frame, decompose the slot's world matrix into position, quaternion, scale. Copy position and quaternion to the CSS object. Set scale to `slotWorldSize / panelIntrinsicPx`.
   ```js
   slot.matrixWorld.decompose(p, q, s);
   cssObject.position.copy(p);
   cssObject.quaternion.copy(q);
   cssObject.scale.set(s.x / panelWidthPx, s.y / panelHeightPx, 1);
   ```
3. A child plane of the slot (`PlaneGeometry(1,1)`) uses `MeshBasicMaterial({ opacity: 0, transparent: true, blending: THREE.NoBlending, side: DoubleSide })`. With NoBlending it overwrites the canvas pixels with transparent ones, which reveals the panel behind the canvas. Geometry nearer to the camera than the plane fails the depth test against it, so it still covers the panel. That is real occlusion (the ring passing in front of the screen in the starter proves it).
4. Set `backface-visibility: hidden` on the panel so it disappears when the slot turns away.

### Slot convention
An `Object3D` named `slot_<name>`. Its local unit plane (1 by 1, centred, facing +Z) is the panel. Its scale is the size in object units. Place it about 0.01 in front of the surface, otherwise the hole z-fights with the body.

Blender export: glTF converts Z-up to Y-up. A Blender plane that faces +Z exports facing +Y (edge-on to the camera). Rotate the empty 90 degrees on X in Blender so it faces -Y, which exports as +Z. If the panel shows edge-on in the browser, that is the cause. Add `?debug` and an `AxesHelper` on the slot to see it.

### Known limits
- The hole is a flat quad. A curved screen needs a hole mesh with matching shape, and the DOM still stays flat. For curved surfaces, render the panel to a texture instead.
- Interaction: the canvas is `pointer-events: none` and `main` is above the CSS layer, so panels are not clickable by default. For clickable panels, set `main { pointer-events: none }` and `main .copy, main a { pointer-events: auto }`, then set `.panel { pointer-events: auto }` and the CSS renderer element to `pointer-events: auto`. Check that only the visible panel region captures events.
- Text inside a heavily scaled panel can look soft. Author the panel at its largest on-screen size and scale down, not up.
- Do not give the panel `overflow: auto` scroll regions. Nested scroll inside a 3D transform is miserable.
- iOS Safari has had CSS 3D compositing quirks. Test on a real device and keep a fallback where the panel renders flat in the anchor box when `.no-3d-panels` is set.

## Why not match a matrix3d by hand
Hand-built `matrix3d` strings need the projection, aspect, viewport flip and half-pixel offsets to agree, and they silently drift on resize. CSS3DRenderer is the maintained implementation of exactly that. Use it.

## Why not render the DOM into a texture
Libraries that rasterise DOM to canvas lose selectable text, accessibility and live SVG, and cost a texture upload per change. Use only when the surface is curved.

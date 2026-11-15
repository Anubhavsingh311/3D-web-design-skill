# 04. Object ingest pipeline

The user hands over an object. Your job: make any object behave like the demo.

## Intake table

| Input | Action |
|---|---|
| `.glb` / `.gltf` | use directly after optimisation |
| `.obj` / `.stl` / `.ply` | load with `OBJLoader` / `STLLoader` / `PLYLoader` from `three/addons`, wrap in a `Group`, assign a `MeshStandardMaterial` if none. For delivery, convert to GLB offline. |
| `.fbx` | `FBXLoader`, expect huge files. Convert to GLB offline. |
| `.blend` | export GLB from Blender (`+Y up`, apply modifiers, Draco or Meshopt off at export, compress afterwards with gltf-transform) |
| a screenshot or description only | build a procedural stand-in from primitives with the same part names, say so, and design the pipeline so the real file drops in via `CONFIG.modelUrl` |
| Spline / Sketchfab link | ask for a downloadable GLB, do not scrape |

## Optimise
```bash
npm i -g @gltf-transform/cli
gltf-transform optimize in.glb public/models/object.glb --compress meshopt --texture-compress webp
gltf-transform inspect public/models/object.glb     # triangles, textures, size
```
Budgets: under 3 MB and 100k triangles for the hero object on mobile, 5 MB hard cap. `meshopt` needs `MeshoptDecoder` (the starter wires it). If using Draco, copy the decoder files to `/public/draco/` for production instead of the gstatic URL used in the starter.

## Normalise (`prepareObject`)
Everything downstream assumes the same frame, so normalise once:
`pivot (timeline owns) > holder (scale k) > raw (centred)`. After this the object's largest dimension is `CONFIG.objectSize` (default 2) and its bounding-box centre is the origin, whatever the source units were. Never animate `holder` or `raw`.

## Parts
- Explode units are the children of the first node that branches (single-child wrapper chains are skipped).
- Direction is from the whole-object centre to the unit's centre, converted into the unit's parent space.
- Travel is scaled by distance from the centre, so the main body barely moves and outer parts travel furthest. Without this, the body flies off its anchor.
- A single fused mesh cannot explode. Options: split by material in Blender, split by connected components offline, or drop the explode chapter. Do not fake it with random vertex noise.

## Markers
- `slot_<name>`: DOM panel host (see `02-dom-webgl-registration.md`).
- `anchor_<name>`: label point, read with `projectToScreen`.
Markers are Empties in Blender. If a marker arrives as a mesh, `prepareObject` hides it.

## Materials
- Keep the source PBR material for the solid look. It gets cloned per mesh, so the original is untouched.
- Materials that are arrays (multi-material meshes): the starter uses the first. For a faithful result, split the mesh by material.
- Textures: set `texture.anisotropy = renderer.capabilities.getMaxAnisotropy()` for hero surfaces, keep `colorSpace = SRGBColorSpace` on colour maps (GLTFLoader does this).
- Transparent or glass parts need `transparent: true` and care with `renderOrder` against the fill layer. Test them early.

## Sanity checks to run on any new object
1. `node test/smoke.mjs` style check: dimensions after normalise equal `objectSize`, centre is near zero.
2. Count meshes. Over about 60 meshes: merge small ones, the sketch layer adds one draw call per mesh per layer.
3. Look at the edge extraction at three thresholds (15, 28, 45) and pick the one that reads as a drawing, not a mesh dump.
4. Confirm winding and normals: if the solid looks inside-out, flip normals in the source. `side: DoubleSide` hides the problem and doubles the cost.
5. Confirm scale and orientation: front of the object should face +Z at `rotateY: 0` so the detail chapter can show the front.

## Dispose
On teardown call `looks.dispose()`, `binder.dispose()`, `geometry.dispose()` and `material.dispose()` for everything you created, and `renderer.dispose()`. Single-page apps leak GPU memory otherwise.

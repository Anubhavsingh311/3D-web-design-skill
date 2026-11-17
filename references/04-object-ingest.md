# 04. Object ingest pipeline

The user hands over an object. Your job: make any object behave like the demo, and find out BEFORE building what it cannot do.

## Step 1: audit the file
```bash
node scripts/inspect-model.mjs model.glb
```
No dependencies, no GPU. It reads the glTF JSON and the image headers and reports: explode units (the same rule the runtime uses), markers and their kind, triangles, drawable primitives, texture memory, extensions, and findings with the fix command for each. The runtime repeats the structural checks on the loaded scene (`window.__stage.audit`, printed to the console with `?debug` or `?verify`) and is the authority.

Finding codes: `fused` (cannot explode), `no-slot`, `skinned`, `instanced`, `morph`, `transparent`, `triangles`, `draw-calls`, `vram`, `texture-size`, `uncompressed`, `spec-gloss`, `decoder`.

## Intake table

| Input | Action |
|---|---|
| `.glb` | optimise (below), drop at `src/model/object.glb` |
| `.gltf` with sidecar files | `gltf-transform copy in.gltf out.glb`, then as above. Only `.glb` is auto-detected. |
| `.obj` / `.stl` / `.ply` / `.fbx` | convert to GLB offline (Blender, `obj2gltf`, `FBX2glTF`). FBX is usually huge. |
| `.blend` | Blender: export glTF Binary, +Y up, apply modifiers, export WITHOUT Draco or meshopt, compress afterwards with gltf-transform. Name parts meaningfully. Model the screen as a flat quad named `slot_screen`. |
| a screenshot or a description only | build a procedural stand-in from primitives with the same part names, say so, and design it so the real file drops in at `src/model/object.glb` |
| Spline / Sketchfab link | ask for a downloadable GLB, do not scrape |

## Step 2: optimise without destroying the structure
The obvious command is a trap. `gltf-transform optimize` with default flags also joins meshes, simplifies, creates GPU instances, flattens and prunes. Measured on the fixtures:

| Default `optimize` did | Consequence for this skill |
|---|---|
| joined meshes that share a material | explode units 7 became 3 (`footL`, `footR`, `mast`, `tip` gone) and the quad slot merged into the body |
| pruned and flattened empty nodes | every `slot_*` and `anchor_*` Empty disappeared, silently |
| `instance` can create `EXT_mesh_gpu_instancing` | the sketch layers do not support instancing |

Use this instead:
```bash
npm i -g @gltf-transform/cli
gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress webp --texture-size 2048 \
  --join false --simplify false --instance false
# markers are Empties? add:  --flatten false --prune false     (quad markers do not need this)
node scripts/inspect-model.mjs out.glb --against in.glb
```
The last line prints `structure preserved` or `STRUCTURE LOST` with the units and markers that went missing. Run it every time. Over budget on triangles? Simplify as a separate, deliberate step: `gltf-transform simplify out.glb out2.glb --ratio 0.5 --error 0.001`, then compare again.

Budgets: under 3 MB and 100k triangles for the hero object on a phone, 5 MB hard cap on desktop. Download size is not GPU memory: a 2048 by 2048 texture is about 21 MB of VRAM with mips once decoded, whatever its file size. The audit estimates it.

### Decoders
three 0.187 ships default decoder URLs for Draco and KTX2 and Vite bundles them, so there is nothing to host and no CDN path to set. (The original starter pointed Draco at gstatic.com, which was an unnecessary external dependency.) Meshopt is wired too. Verified: meshopt and Draco models load and render through the starter. `npm run build:single` leaves Draco and KTX2 out (their decoders are large), so use meshopt or no compression there.

## Step 3: place it
Drop it at `src/model/object.glb`. `src/model.js` finds it at build time with `import.meta.glob`, so there is no URL to get wrong. No file means the procedural machine. `?demo=machine` and `?demo=knot` force a demo.

## Normalise (`prepareObject`)
Everything downstream assumes the same frame, so normalise once: `pivot (timeline owns) > holder (scale k) > raw (centred)`. After this the object's fit dimension equals `CONFIG.objectSize` (2) and its bounding-box centre is the origin, whatever the source units were. Never animate `holder` or `raw`.
- **Bounds are precise** (every vertex through the real matrices) and **ignore markers**. `Box3.setFromObject` over-estimates rotated parts (a unit sphere rotated 45 degrees about one axis measures 2.83 wide instead of 2.00, and 3.41 about two axes) and counts marker quads, which de-centres and mis-scales CAD exports.
- `CONFIG.fit = 'box'` makes the longest side equal the size, the tightest fit. `'sphere'` makes the bounding sphere's diameter equal the size, so the object can rotate to any angle without leaving its anchor. A cube at 45 degrees has a projected width 41 percent over its box fit, so use `'sphere'` for compact objects and `'box'` for long ones.

## Parts (explode)
- Units are the children of the first node that branches. Single-child wrapper chains are skipped, and markers and hidden nodes do not count. (The original counted a top-level slot as a child, so a wrapper chain looked branching and the real parts never separated.)
- `explode.mode: 'radial'` moves each unit away from the centre of the whole object, scaled by its distance, so the main body barely moves and outer parts travel furthest. The centre is the bounding-box centre, so a lopsided object moves its core. Keep the arrangement roughly symmetric or switch modes.
- `explode.mode: 'axis'` with `axis: 'x' | 'y' | 'z'` separates layers in rank order along one axis. The outermost two travel exactly `distance`, the middle one stays, and every neighbour pair gains the same extra gap. Use it for phones, laptops, watches and anything built in layers. Verified with the `stack.glb` fixture (five layers, axis `z`).
- A slot attached to a unit travels with it. A slot authored at the top level is attached (world transform preserved) to the nearest unit.
- A single fused mesh cannot explode. Options: split by material or connected component in Blender, or drop the explode chapter. Do not fake it with vertex noise. The audit flags `fused`.

## Markers
- `slot_<n>`: DOM panel host. Prefer a flat quad mesh, see `02-dom-webgl-registration.md`. Or define it in `CONFIG.slots` for models with none.
- `anchor_<n>`: label point, read with `projectToScreen`. Empties only, and they die in an optimiser the same way slot Empties do.

## Materials
- The source PBR material is cloned for the solid look, so the original is untouched. Multi-material meshes (geometry groups) keep one clone per group.
- Skinned meshes, instanced meshes and morph targets are not supported by the sketch and dissolve layers (bind pose and base shape are used). The audit warns.
- Textures: `texture.anisotropy = renderer.capabilities.getMaxAnisotropy()` for hero surfaces. GLTFLoader already sets sRGB on colour maps.
- Transparent or glass parts need `transparent: true` and care with `renderOrder` against the fill layer. Test them early.

## Sanity checks for any new object
1. `inspect-model.mjs` shows `READY`, or every warning is understood and accepted.
2. Verify at three edge thresholds (15, 28, 45) in a screenshot and pick the one that reads as a drawing. Set `look.edgeAngle`.
3. Under about 60 meshes. The sketch look adds up to three draw calls per mesh.
4. Inside-out solid? Flip normals in the source. `side: DoubleSide` hides it and doubles the cost.
5. Front of the object faces +Z at `rotateY: 0` so the detail chapter can show it.
6. `?debug`: the crosshair sits on the object's centre, the dashed boxes are the anchors, blue slot axes point out of the surface. `window.__stage.partBounds()` lists every part's bounds in object space, which is what `CONFIG.slots` needs.

## Teardown
`experience.destroy()` runs everything in reverse: it restores the model's own materials (`looks.dispose()`), hands the panel back (`binder.dispose()`), removes the lights, disposes the model's geometry and textures, restores `engine.useDefaultMainLoop`, and aborts every listener. Single-page apps leak GPU memory otherwise. See `11-integration-and-delivery.md`.

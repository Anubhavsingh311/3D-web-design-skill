# 06. Making the object belong to the page

"Seamless" is a list of small agreements between the 3D and the DOM. Check each one.

## 1. One source of colour
`readTokens()` reads `--ink`, `--paper`, `--accent` from the document. Never hard-code hex in JS or GLSL. When the site rebrands, nothing in the 3D changes except tokens. If the site has a dark mode, call `looks.setTokens(readTokens())` on `matchMedia('(prefers-color-scheme: dark)')` change.

## 2. One source of theme
The timeline animates `state.dark`. The render loop writes `--bg` and `--fg` on `:root` from it, and the fill, lines and text all follow. The page and object cannot disagree mid-scroll. Avoid per-section background colours on `.chapter` elements: they would sit above the canvas in the stacking order and hide the object.

## 3. One grid
The object fills the `.anchor` box. On mobile the anchor moves under or over the copy via CSS, and the object follows because layout is remeasured. Never position the object with hard-coded world coordinates.

## 4. One camera
Use a low fov (30 to 40) and a camera distance that matches a product shot. Wide fovs make DOM panels distort. CSS3DRenderer shares the WebGL camera, so DOM panels share the perspective too.

## 5. Light that matches the page
- `NeutralToneMapping` and `toneMappingExposure: 1`. ACES shifts hue and desaturates brand colours.
- `RoomEnvironment` through `PMREMGenerator` as a free studio. `scene.environmentIntensity` around 0.45.
- Key light 1.3, rim 0.6. If the page is warm paper, tint the key light slightly warm (`0xfff4e6`). If the page is dark, drop the key to 1.0 and raise the rim.
- No pure white parts. Cap albedo at about 0.85 or the object clips against paper backgrounds.
- `fillMat.toneMapped = false` so sketch paper equals the CSS paper colour exactly.

## 6. Contact cue (pick one)
- **Shadow plane**: `ShadowMaterial({ opacity: 0.15 })` under the object, one `DirectionalLight` with `castShadow`, 1024 map. Only on a ground that exists in the layout.
- **Baseline rule**: a 1 px DOM line at the object's resting baseline that draws on with `createDrawable`.
- **Shared grain**: a fixed `::after` noise overlay (`mix-blend-mode: multiply`, opacity 0.05) above both canvas and page, so everything shares texture.

## 7. Depth sandwich
Default: text above the object (`main` z3 above `#stage` z2). To let the object pass in front of a heading: swap those z-indexes for that chapter, or render a second canvas above the text with only the foreground object. Do not use both on one page without a reason.

## 8. Type and diagram language
Panel content uses the site's fonts and tokens. SVG strokes match the line weight of the 3D lines (about 2 to 2.5 px). Labels use the same monospace as the page's eyebrows.

## 9. Motion language
One ease family for the whole page (`inOutCubic` plus `outExpo`). One stagger rhythm (60 to 90 ms). Idle motion is subtler than scroll motion.

## 10. Loading
The page must be readable before the model arrives. Show the layout with empty `.anchor` boxes, then fade the canvas in (`opacity: 0 to 1`, 400 ms) when the first frame renders. A 2D poster image of the object, absolutely positioned in the first anchor, is the best placeholder.

## Checklist (all must be yes)
- Does the object use the site's colours via tokens?
- Does it sit in the grid column the copy leaves for it, on mobile as well?
- Are page background and text changing together with the object?
- Is any part pure white or pure black?
- Is there exactly one contact cue?
- Does the first screen look finished before scrolling?

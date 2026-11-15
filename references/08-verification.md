# 08. Verification

A clean build proves imports resolve. It proves nothing about whether the object is visible, placed, lit or occluded. Verify in layers.

## Layer 1: pure logic (Node, no browser)
`npm test` runs `test/smoke.mjs`:
- normalisation: largest dimension equals `objectSize`, centre at origin
- explode: no unit exceeds the requested travel, the outermost unit travels exactly that far
- looks: nothing drawn at `draw = 0`, everything at 1, parts stagger in order
- slot math: the CSS object's corners equal the slot's corners
- `viewToWorld`: a world point projects back to the pixel it came from
Add a case here for every new helper. These tests caught a divide-by-zero on meshes with no extractable edges.

## Layer 2: build
`npm run build` must finish with no errors. Warnings about chunk size are acceptable for Three.js.

## Layer 3: real browser, real WebGL
Use `scripts/headless-capture.mjs` (software GL through `@sparticuz/chromium`, works in sandboxes that cannot download a browser).
1. `npm run build`
2. In a scratch folder: `npm i puppeteer-core @sparticuz/chromium`
3. `node headless-capture.mjs <projectDir> <outDir>`
It scrolls to 0, 30, 50, 70 and 100 percent, waits 3.5 s each, writes PNGs and prints console output and a WebGL flag.

Read every PNG and answer:
| Frame | Question |
|---|---|
| 0 | Is something visible before any scroll? Is the first screen finished? |
| 30 | Is the sketch drawn, with hidden lines hidden? |
| 50 | Is the main body still on its anchor while parts separate? Are parts on screen? |
| 70 | Is the dissolve edge visible, with the accent colour, without a pure white body? |
| 100 | Is the DOM panel on the surface, and does nearer geometry cover it? |
Also: text legible over the object at every stop, theme (background and text) consistent with the object, console empty.

Software GL runs at a few frames per second, so scroll smoothing lags. A frame that looks mid-transition after 3.5 s is normal there. Judge motion feel in a real browser, judge layout, lighting and occlusion from the captures.

## Layer 4: things only a human can judge
Feel of the scrub on a trackpad and a wheel, touch momentum on a phone, real GPU frame time, Safari CSS 3D behaviour. State these as unverified in the hand-off, and say how to check them.

## Debug switches
- `?debug` turns on the `onScroll` threshold overlay.
- Add `new THREE.AxesHelper(0.3)` to each slot to check orientation.
- Set `CONFIG.holdFraction = 0` to see raw transitions.
- Log `state` once per second to compare with the timeline.

## Hand-off wording
List exactly: commands run, scroll positions captured, what was observed, what was not tested. Never write "works perfectly".

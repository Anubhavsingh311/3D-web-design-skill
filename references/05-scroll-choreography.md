# 05. Scroll choreography

## The model: time is pixels
Each `.chapter` is tall (240vh in the starter) and contains a `position: sticky; height: 100svh` `.pin`. While a chapter is active its `.pin` is glued to the viewport. The `.anchor` inside is an empty box that reserves the object's place in the grid.

The master timeline's time axis is **pixels of scroll**: timeline time `t` means `scrollY - main.top = t`. `src/schedule.js` turns measured geometry into windows:

```
          chapter 0 pinned        crossing        chapter 1 pinned        crossing
scroll  |-----------------------|-------------|-----------------------|-----------...
object  |         REST          |    MOVE     |         REST          |    MOVE
        0                   top1 - vh        top1                 top2 - vh
```
- **Rest window of chapter i**: its pin is stuck. The object holds its pose exactly. Text is read against a still object.
- **Move window into chapter i**: chapter i's top travels from the bottom of the viewport to the top (one viewport height of scrolling, `moveVh = 1`). The old text slides out while the new text slides in, and the object glides to the new anchor in the same gesture.
- The windows tile `[0, range]` with no gap or overlap, where `range = main.height - pin height`. The last chapter rests until the end of the page.

### Why not an abstract timeline
The original gave each chapter 1000 "ms" of timeline, a 30 percent hold and a 70 percent move. That cannot match the page, for two reasons, both measured:
1. A chapter is 1728 px tall at 720 px viewport height but the timeline chapter mapped to 1881 px, so pose `i` arrived `153 * i` px late: 613 px (0.85 viewport heights) late in the last chapter, spending 61 percent of that chapter's reading time in motion.
2. Anime.js maps scroll progress onto the timeline's TOTAL duration. The staggered SVG panel draw ended at 4210 while the last move ended at 4000, which silently rescaled every tween by 5 percent. Any child that outlives the nominal end does this.
In pixels both disappear: arrival equals the pin by construction (tested for 3, 5, 8 and 12 chapters at different heights), and `tl.call(() => {}, range)` pins the total duration to the scroll distance. `verify.mjs` asserts `tl.duration === range`, `tl.currentTime === scrollY - mainTop`, and that the observer's own start and end match the schedule.

## Anchors (why they work at any scroll position)
`measureChapters` takes `anchorRect - pinRect` (scroll invariant, any nesting depth) plus the pin's `top` value (so a fixed header offset works), then `viewToWorld()` converts pixels to world units at the object plane from the camera's fov and aspect. The object's scale comes from the anchor's smaller side. Remeasure and rebuild on width change, on `document.fonts.ready`, and on `prefers-reduced-motion` change.

Everything shares ONE box (`readStageBox()`): width from `documentElement.clientWidth`, height from the stuck `.pin` (100svh). Canvas, CSS3D layer and camera aspect all read it, and it is set as `--stage-w` and `--stage-h`. A phone's `window.innerHeight` changes every time the URL bar slides while `100svh` does not, so a resize that changes only `innerHeight` triggers no rebuild. NOT verified on a real phone: headless emulation changes every viewport unit at once.

The `onScroll` thresholds are absolute pixels for the same reason: `enter: { container: 0, target: 'top' }`, `leave: { container: viewH, target: 'bottom' }`. The string `'bottom bottom'` means `window.innerHeight`.

## Pose table
`CHAPTERS` rows in `src/config.js`, matched to `<section class="chapter" data-chapter="id">` by id, in DOM order. A row is the pose at the END of the move into that chapter:
- `rotateX`, `rotateY` in degrees (adapter convention).
- `draw` 0 to 1: edge draw-on progress.
- `reveal` 0 to 1: dissolve to solid.
- `explode` 0 to 1 (times `explode.distance`).
- `lines` 0 to 1: line opacity (about 0.15 once solid so contours stay as an accent).
- `panel` 0 or 1: DOM panel visibility.
- `dark` 0 or 1: page and object theme.
`x`, `y`, `scale` come from layout. A DOM chapter without a row inherits the previous pose and logs a warning, so adding a section never crashes the page. An extra row is ignored.

## Sequencing rules
1. One headline change per chapter.
2. Rest before move: the schedule does this for you. Keep chapters 180 to 260vh. The schedule warns when a chapter rests for under half a screen, or when a chapter is shorter than the viewport and its pin cannot stick.
3. Panels appear only when the object faces the camera (`rotateY` a multiple of 360, small `rotateX`).
4. Dark chapters carry the "inside" story (parts, internals). Light chapters carry the "outside" story.
5. The first frame must not be empty. `intro: true` also draws the first sketch in over 1.4 seconds on load (a separate multiplier on `draw`, so it never fights the timeline). Reduced motion and `?verify` skip it.
6. The last chapter ends at rest, facing front, with a call to action in the DOM. Anything after `<main>` is fine: the stage layers scroll away with the last pin (`stageOffset`) and rendering stops once they are off screen, so the object never floats over a footer.

## Tuning
- `moveVh`: 1 uses the whole crossing. Below 1 the object waits and moves late. Above 1 it starts during the previous rest. A move never starts before the previous chapter's pin begins, so it is clamped to the chapter height.
- Per-chapter easing: `inOutCubic` for moves (default), `outExpo` for things that land.
- Rotation per chapter under about 180 degrees.

## Scroll sync modes (`onScroll`)
- `sync: true`: strict 1:1 scrub. `?verify` uses it, so tests are deterministic.
- `sync: 0 to 1`: smooth scrub. Verified in the source: a number becomes a per-frame lerp factor `0.01 + 0.19 * sync` toward the scroll position. 0.18 (the old default) is 0.044 per frame, a time constant of about 23 frames (0.4 s at 60 fps), which feels floaty. The new default 0.45 is 0.096 per frame (about 10 frames, 0.17 s). Tune on a real trackpad and a real wheel. Software GL lags, so judge feel in a normal browser.
- `sync: 'play pause'`: plays on enter, pauses on leave (one-shot reveals instead of scrub).
- `debug: true`: draws the thresholds. `?debug` turns it on.

## Idle and pointer motion
On `floater`, the parent of `pivot`. The timeline never touches `floater`. Idle amplitude under about 2 degrees, pointer parallax under about 7, lerped with factor 0.06. Off under reduced motion, in `?verify`, and below the high tier.

## SVG in the same timeline
`createDrawable(paths)` then animate `draw: ['0 0', '0 1']` as a timeline child, with stagger. The window ends before the chapter's rest ends: a stagger that outlives the timeline rescales everything. Drawables need strokes (`fill: none`).

## Do not
- Do not use scroll-jacking libraries together with `onScroll` unless you tested the combination. If you must smooth scroll, drive the observer from the smoothed position and test on touch.
- Do not tween `camera.fov` without `camera.updateProjectionMatrix()`. CSS3DRenderer follows the new fov automatically.
- Do not read layout inside the render loop. Measure in `rebuild()` only.
- Do not give two systems one property. The timeline owns `pivot` and `state`, idle owns `floater`.

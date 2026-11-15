# 05. Scroll choreography

## The model
Each `.chapter` is tall (240vh in the starter) and contains a `position: sticky; height: 100vh` `.pin`. While the chapter is active, `.pin` is glued to the viewport. The `.anchor` inside it is an empty box that reserves the object's place in the grid.

One timeline spans the whole `main` element. Chapter `i` occupies `[(i-1) * D, i * D]` of the timeline (in arbitrary milliseconds, only ratios matter). Inside that slot: a hold of `holdFraction * D`, then a transition of `D - hold`.

```
progress 0 ........................................ 1
chapter 0  | hold | move 0->1 | hold | move 1->2 | ...
```

## Reading anchors (why it works at any scroll position)
Anchors are measured relative to `.pin` (`offsetLeft`, `offsetTop`), not with `getBoundingClientRect()`. Because `.pin` is stuck to the viewport during its chapter, those offsets equal viewport coordinates and do not change with scroll. `viewToWorld()` converts pixels to world units at the object plane using the camera's fov and aspect.

Remeasure on resize and on `document.fonts.ready`, then `destroy()` and rebuild the timeline.

## Pose table
Each row of `CHAPTERS` is a target pose:
- `rotateX`, `rotateY` in degrees (adapter convention).
- `draw` 0 to 1: edge draw-on progress.
- `reveal` 0 to 1: dissolve to solid.
- `explode` 0 to 1.
- `lines` 0 to 1: line opacity (fade to about 0.15 once solid so contours stay as an accent).
- `panel` 0 or 1: DOM panel visibility.
- `dark` 0 or 1: page and object theme.
`x`, `y`, `scale` come from layout.

## Sequencing rules
1. One headline change per chapter.
2. Hold before move, so the text reads against a still object.
3. Panels appear only when the object faces the camera (`rotateY` multiple of 360, small `rotateX`).
4. Dark chapters carry the "inside" story (parts, internals). Light chapters carry the "outside" story.
5. The first frame must not be empty. Start with `draw` around 0.35 so there is something to see before any scroll.
6. The last chapter ends at rest, facing front, with a call to action in the DOM.

## Easing
- `inOutCubic` for object moves (the default).
- `outExpo` for things that should land (panel fade).
- `linear` only for continuous rotation tied directly to progress.
- Use `playbackEase` rarely. Smoothness comes from `onScroll`'s `sync` smoothing value instead.

## Scroll sync modes (`onScroll`)
- `sync: true` strict 1:1 scrub.
- `sync: 0.1 to 0.3` smooth scrub, a number between 0 and 1. Tune by eye on a real trackpad and a real mouse wheel. Software-GL screenshots lag, so judge feel in a normal browser.
- `sync: 'play pause'` plays when entering, pauses when leaving (use for one-shot reveals instead of scrub).
- `debug: true` draws the thresholds. Always use it while tuning thresholds.

## Idle and pointer motion
Put it on `floater`, the parent of `pivot`. The timeline never touches `floater`. Idle amplitudes: under 3 degrees rotation, pointer parallax under 7 degrees, lerped with factor 0.06. Disable both under reduced motion.

## SVG in the same timeline
`createDrawable(paths)` then animate `draw: ['0 0', '0 1']` as a timeline child. This is what makes DOM diagrams and the 3D object feel authored together. Stagger 60 to 90 ms per path. Drawables need strokes (`fill: none`).

## Optional: pure adapter style
For simple pages you can skip the `state` object and animate Three.js objects and materials directly (`tl.add(mesh, { rotateY: 360, opacity: 0.5, uTint: '#0ff' })`). Use the `state` pattern when several systems read the same values (materials, CSS, DOM) because a single source of truth is easier to debug.

## Do not
- Do not use scroll-jacking libraries together with `onScroll` unless you have tested the combination. If you must smooth scroll, drive the observer from the smoothed position and test on touch.
- Do not tween `camera.fov` and expect the projection to update. Call `camera.updateProjectionMatrix()` after, and note that CSS3DRenderer follows the new fov automatically.
- Do not read layout inside the render loop. Measure in `rebuild()` only.

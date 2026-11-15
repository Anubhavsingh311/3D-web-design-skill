# 01. Anatomy of the reference (animejs.com)

How this was gathered: the homepage text and code samples were fetched and read, the Anime.js 4.5 docs and package source were read, and community commentary was searched. Rendered pixels and the site's own JavaScript were NOT inspected. Every claim carries a label.

Labels: **[fact]** read directly from the site, docs or package source. **[reported]** stated by others, plausible, not verified. **[inference]** reasoned from the above.

## Page structure [fact]
Hero ("All-in-one animation engine"), then a "complete animator's toolbox" block, then feature chapters: Intuitive API, Enhanced transforms, Scroll Observer, Advanced staggering, SVG toolset, Springs and draggable, Runs like clockwork (timeline), Responsive animations (scope), bundle size, sponsors, start animating. Each chapter pairs a short claim with three bullet links and a live code sample.

## Techniques visible in the page's own code samples [fact]
- Scroll-synced line drawing: `animate(createDrawable('path'), { draw: ['0 0', '0 1', '1 1'], delay: stagger(40), ease: 'inOut(3)', autoplay: onScroll({ sync: true }) })`. The `['0 0','0 1','1 1']` keyframes draw a line in, then draw it out the other end.
- Grid stagger: `stagger([1.1, .75], { grid: [13, 13], from: 'center' })` for a ripple of scale across 169 dots.
- Timeline with a ticker: a row of ticks staggered at 10 ms, with a rotating element pinned to the timeline start using `'<'`.
- Spring release on a draggable: `createSpring({ stiffness: 120, damping: 6 })`.
- Motion path plus morphing between SVG shapes (`createMotionPath`, `morphTo`).
- Scope with media queries so the same animation re-orients in portrait.
- The engine splits into modules and advertises a 24.5 KB total bundle.

## Three.js involvement [fact]
- The site's Learn page says the landing page uses HTML, CSS, SVG, Canvas 2D and WebGL (Three.js).
- Anime.js 4.5 ships a Three.js adapter, and the logo animation was made with Anime.js and Three.js.

## DOM demos inside the 3D machine [reported]
A forum commenter wrote that the demos shown inside the 3D machine live in a single div that is CSS-3D-transformed to match the model rendered in a canvas below it, and another said the 3D parts are probably react-three-fiber. Treat as plausible. This skill reproduces the effect with CSS3DRenderer (same camera for DOM and WebGL) rather than guessing the site's internal matrix code.

## What the visual language is [inference]
- Technical-diagram aesthetic: thin consistent strokes, a limited palette, monospace labels.
- Alternating dark and light chapters, so the background is a story device, not a constant.
- Motion is choreographed to scroll in chapters, with moments of rest.
- Performance complaints exist (one commenter reported low frame rates on a phone), which is a reminder to build the fallback tiers in `07-performance-and-fallbacks.md`.

## What to copy as technique, what not to copy
Copy: line drawing synced to scroll, staggers, chapter rhythm, DOM-in-3D registration, shared state across DOM and WebGL, dark/light chapter changes.
Do not copy: their models, diagrams, copy, logo, or layout.

## Where this skill goes beyond the reference
The reference's 3D is a machine the camera moves around. This skill makes the user's object the actor: it draws itself, moves between layout anchors, explodes, dissolves into material and hosts live DOM on its surface.

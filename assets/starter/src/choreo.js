import { createTimeline, createDrawable, onScroll, stagger } from 'animejs';
import 'animejs/adapters/three'; // side-effect import: lets animate()/timeline target Three.js objects
import { CONFIG, CHAPTERS } from './config.js';

// Merge the author's pose table with the measured layout (x, y, scale per chapter).
export function buildPoses(layout) {
  return CHAPTERS.map((c, i) => ({ ...c, ...layout[i] }));
}

const STATE_KEYS = ['draw', 'reveal', 'explode', 'lines', 'panel', 'dark'];

// One master timeline. Chapter i-1 to i is a transition that starts after a hold, so the object
// rests while the reader reads, then moves while the reader scrolls to the next block.
// Every tween has explicit [from, to] values, so rebuilding after a resize never reads stale state.
export function buildScrubbed({ pivot, state, poses, panelPaths }) {
  const D = CONFIG.chapterMs;
  const hold = D * CONFIG.holdFraction;
  const T = D - hold;

  applyPose(pivot, state, poses[0]);

  const observer = onScroll({
    target: 'main',
    enter: 'top top',        // progress 0: top of main meets top of the viewport
    leave: 'bottom bottom',  // progress 1: bottom of main meets bottom of the viewport
    sync: CONFIG.scrollSmoothing,
    debug: new URLSearchParams(location.search).has('debug'),
  });

  const tl = createTimeline({
    defaults: { ease: 'inOutCubic', duration: T },
    autoplay: observer,
  });

  for (let i = 1; i < poses.length; i++) {
    const a = poses[i - 1];
    const b = poses[i];
    const at = (i - 1) * D + hold;

    // The object itself, through the Three.js adapter (degrees, flat property names).
    tl.add(pivot, {
      x: [a.x, b.x],
      y: [a.y, b.y],
      scale: [a.scale, b.scale],
      rotateX: [a.rotateX, b.rotateX],
      rotateY: [a.rotateY, b.rotateY],
    }, at);

    // Plain numbers that the render loop feeds into materials, explode offsets and CSS.
    const params = {};
    STATE_KEYS.forEach((k) => { params[k] = [a[k], b[k]]; });
    tl.add(state, params, at);

    // SVG line drawing inside the DOM panel, in the SAME timeline as the 3D object.
    if (panelPaths.length && a.panel === 0 && b.panel === 1) {
      tl.add(createDrawable(panelPaths), {
        draw: ['0 0', '0 1'],
        delay: stagger(70),
        duration: T * 0.7,
        ease: 'inOutQuad',
      }, at + T * 0.3);
    }
  }

  return {
    destroy() {
      observer.revert();
      tl.revert();
    },
  };
}

// prefers-reduced-motion: no scrubbing and no tweened movement. Cut between poses per chapter.
export function buildStatic({ pivot, state, poses }) {
  const chapters = [...document.querySelectorAll('.chapter')];
  applyPose(pivot, state, poses[0]);
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) applyPose(pivot, state, poses[chapters.indexOf(e.target)]);
    });
  }, { threshold: 0.6 });
  chapters.forEach((c) => io.observe(c));
  return { destroy: () => io.disconnect() };
}

export function applyPose(pivot, state, pose) {
  pivot.position.set(pose.x, pose.y, 0);
  pivot.rotation.set((pose.rotateX * Math.PI) / 180, (pose.rotateY * Math.PI) / 180, 0);
  pivot.scale.setScalar(pose.scale);
  STATE_KEYS.forEach((k) => { state[k] = pose[k]; });
}

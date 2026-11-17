import { createTimeline, createDrawable, onScroll, stagger } from 'animejs';
import 'animejs/adapters/three'; // side-effect import: lets animate()/timeline target Three.js objects
import { POSE_KEYS } from './config.js';

export function applyPose(pivot, state, pose) {
  pivot.position.set(pose.x, pose.y, 0);
  pivot.rotation.set((pose.rotateX * Math.PI) / 180, (pose.rotateY * Math.PI) / 180, 0);
  pivot.scale.setScalar(pose.scale);
  POSE_KEYS.forEach((k) => { state[k] = pose[k]; });
}

// One master timeline. Its time axis is PIXELS OF SCROLL (see schedule.js), so every move starts and
// ends exactly where the page layout says it should, whatever the chapter heights are.
// Every tween has explicit [from, to] values, so rebuilding after a resize never reads stale state.
export function buildScrubbed({ pivot, state, poses, schedule, panelPaths, smoothing, debug, viewH }) {
  applyPose(pivot, state, poses[0]);

  // Thresholds are absolute pixels, not 'bottom bottom'. 'bottom' of the container means window.innerHeight,
  // which changes on phones whenever the URL bar slides. viewH is the stuck .pin height and does not.
  const observer = onScroll({
    target: 'main',
    enter: { container: 0, target: 'top' },
    leave: { container: viewH, target: 'bottom' },
    sync: smoothing,
    debug,
  });

  const tl = createTimeline({ defaults: { ease: 'inOutCubic' }, autoplay: observer });

  for (let i = 1; i < poses.length; i++) {
    const a = poses[i - 1];
    const b = poses[i];
    const w = schedule.chapters[i];
    const duration = Math.max(1, w.moveEnd - w.moveStart);

    // The object itself, through the Three.js adapter (degrees, flat property names).
    tl.add(pivot, {
      x: [a.x, b.x], y: [a.y, b.y], scale: [a.scale, b.scale],
      rotateX: [a.rotateX, b.rotateX], rotateY: [a.rotateY, b.rotateY],
      duration,
    }, w.moveStart);

    // Plain numbers that the render loop feeds into materials, explode offsets and CSS.
    const params = { duration };
    POSE_KEYS.forEach((k) => { params[k] = [a[k], b[k]]; });
    tl.add(state, params, w.moveStart);

    // SVG line drawing inside the DOM panel, in the SAME timeline as the 3D object. The window ends before
    // the chapter's rest ends: a stagger that outlives the timeline would silently rescale everything.
    if (panelPaths.length && a.panel === 0 && b.panel === 1) {
      const from = w.moveStart + duration * 0.3;
      const until = Math.min(schedule.range, w.moveEnd + 0.5 * viewH);
      const total = Math.max(1, until - from);
      const step = panelPaths.length > 1 ? (total * 0.3) / (panelPaths.length - 1) : 0;
      tl.add(createDrawable(panelPaths), {
        draw: ['0 0', '0 1'], delay: stagger(step), duration: total * 0.7, ease: 'inOutQuad',
      }, from);
    }
  }

  // Pin the duration to the scroll distance. Progress maps onto the timeline's total duration, so any
  // difference here would stretch every tween.
  tl.call(() => {}, schedule.range);

  return {
    mode: 'scrubbed', tl, observer,
    destroy() { observer.revert(); tl.revert(); },
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
  return { mode: 'static', destroy: () => io.disconnect() };
}

// Turns page layout into 3D placement. The object sits wherever the .anchor box of the active
// chapter sits, so the 3D piece shares the page grid instead of floating over it.
//
// Assumes each chapter is `.chapter > .pin(position: sticky; height: 100vh) > .anchor`.
// While a chapter is active its .pin is stuck to the viewport, so offsetLeft / offsetTop measured
// against .pin equal viewport coordinates. This makes the result independent of scroll position.

export function viewToWorld(camera, px, py, viewW, viewH) {
  const dist = camera.position.z; // the object plane is z = 0
  const visH = 2 * dist * Math.tan((camera.fov * Math.PI) / 360);
  const visW = visH * camera.aspect;
  return {
    x: (px / viewW - 0.5) * visW,
    y: (0.5 - py / viewH) * visH,
    unitsPerPx: visH / viewH,
  };
}

export function measureChapters(camera, objectSize) {
  const viewW = document.documentElement.clientWidth;
  const viewH = window.innerHeight;
  return [...document.querySelectorAll('.chapter')].map((chapter) => {
    const a = chapter.querySelector('.anchor');
    const cx = a.offsetLeft + a.offsetWidth / 2;
    const cy = a.offsetTop + a.offsetHeight / 2;
    const sizePx = Math.min(a.offsetWidth, a.offsetHeight);
    const w = viewToWorld(camera, cx, cy, viewW, viewH);
    return { x: w.x, y: w.y, scale: (sizePx * w.unitsPerPx) / objectSize };
  });
}

// Reads the site's own CSS custom properties so the 3D look follows the design system.
export function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  const get = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  return {
    ink: get('--ink', '#15171a'),
    paper: get('--paper', '#f3f0e8'),
    accent: get('--accent', '#ff5a36'),
  };
}

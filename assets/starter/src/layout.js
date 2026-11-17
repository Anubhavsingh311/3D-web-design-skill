// Turns page layout into 3D placement. The object sits wherever the .anchor box of the active chapter
// sits, so the 3D piece shares the page grid instead of floating over it.
//
// Assumes each chapter is `.chapter > .pin (position: sticky, height: 100svh) > ... > .anchor`.
// While a chapter is active its .pin is stuck to the viewport. Everything here is measured as a
// DIFFERENCE between two rects (anchor minus pin), so it does not depend on the scroll position, and
// it works at any nesting depth, unlike offsetLeft and offsetTop which stop at the nearest positioned ancestor.

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

// The one box every layer (canvas, CSS3D layer, camera, anchors) is sized from. Height comes from the
// stuck .pin (100svh), NOT window.innerHeight: on phones innerHeight changes every time the URL bar
// slides, while svh does not, so measuring from the pin keeps all layers in agreement without rebuilds.
export function readStageBox() {
  const pin = document.querySelector('.pin');
  return { w: document.documentElement.clientWidth, h: pin ? pin.clientHeight : window.innerHeight };
}

export function measureChapters(camera, box, objectSize) {
  return [...document.querySelectorAll('.chapter')].map((chapter) => {
    const pin = chapter.querySelector('.pin') || chapter;
    const anchor = chapter.querySelector('.anchor');
    const pr = pin.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    const stuckTop = parseFloat(getComputedStyle(pin).top) || 0;
    const cx = ar.left + ar.width / 2;
    const cy = stuckTop + (ar.top - pr.top) + ar.height / 2;
    const size = Math.min(ar.width, ar.height);
    const w = viewToWorld(camera, cx, cy, box.w, box.h);
    return { x: w.x, y: w.y, scale: (size * w.unitsPerPx) / objectSize, px: { cx, cy, size } };
  });
}

// Chapter tops and heights relative to <main>, plus main's own height. Scroll invariant.
export function measureScheduleInput(box) {
  const main = document.querySelector('main');
  const mr = main.getBoundingClientRect();
  const chapters = [...document.querySelectorAll('.chapter')];
  const rects = chapters.map((c) => c.getBoundingClientRect());
  return {
    mainTop: mr.top + window.scrollY, // absolute, used to scroll the stage away with the last pin
    tops: rects.map((r) => r.top - mr.top),
    heights: rects.map((r) => r.height),
    mainHeight: mr.height,
    viewH: box.h,
  };
}

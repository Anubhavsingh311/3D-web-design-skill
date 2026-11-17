// Scroll schedule: converts measured page geometry into the time axis of the master timeline.
//
// The timeline runs in PIXELS OF SCROLL, not in arbitrary milliseconds. One unit of timeline time
// is one pixel scrolled. That makes alignment exact by construction:
//   rest window of chapter i   its .pin is stuck to the viewport, the object holds still
//   move window into chapter i the chapter's top travels from the viewport bottom to the viewport
//                              top (one viewport height of scrolling), the object glides to the new anchor
//
// An abstract "1000 ms per chapter" timeline cannot do this: any child that outlives the nominal
// end (a staggered SVG tail, for example) rescales every other tween, and a chapter height in CSS
// never equals the timeline's chapter length, so the object arrives later and later down the page.
//
// Pure function: no DOM, no Three.js. Tested in test/unit.mjs.
export function buildSchedule({ tops, heights, mainHeight, viewH, mainTop = 0, moveVh = 1 }) {
  const n = tops.length;
  const range = Math.max(0, mainHeight - viewH); // scroll distance onScroll maps to progress 0..1
  const warnings = [];
  const chapters = [];

  for (let i = 0; i < n; i++) {
    let moveStart = i === 0 ? 0 : tops[i] - Math.min(moveVh * viewH, tops[i] - tops[i - 1]);
    let moveEnd = i === 0 ? 0 : tops[i];
    moveStart = Math.min(Math.max(moveStart, 0), range);
    moveEnd = Math.min(Math.max(moveEnd, 0), range);
    chapters.push({ index: i, top: tops[i], height: heights[i], moveStart, moveEnd, restStart: moveEnd, restEnd: range });
  }
  for (let i = 0; i < n - 1; i++) chapters[i].restEnd = chapters[i + 1].moveStart;

  for (const c of chapters) {
    const rest = c.restEnd - c.restStart;
    c.rest = rest;
    if (c.height < viewH - 1) warnings.push(`chapter ${c.index} is shorter than the viewport, its .pin cannot stick`);
    else if (rest < 0.5 * viewH) warnings.push(`chapter ${c.index} rests for only ${Math.round(rest)}px (under half a screen). Make it taller or lower moveVh`);
  }
  return { range, chapters, warnings, mainTop };
}

// The stage layers are fixed. Before <main> reaches the top, and after its last pin lets go, they must scroll
// with the page, otherwise the object floats over whatever sits above or below the experience.
// Returns the translateY in px to apply to the canvas and the CSS3D layer (positive = pushed down).
export function stageOffset(schedule, scrollY) {
  const before = Math.max(0, schedule.mainTop - scrollY);
  const after = Math.max(0, scrollY - (schedule.mainTop + schedule.range));
  return before - after;
}

// Which chapter owns a scroll position. A move window belongs to the chapter being moved into.
export function chapterAt(schedule, y) {
  let found = 0;
  for (const c of schedule.chapters) if (y >= c.moveStart) found = c.index;
  return found;
}

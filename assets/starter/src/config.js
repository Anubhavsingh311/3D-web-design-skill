// Single place to tune the experience. Change values here, not inside the modules.

export const CONFIG = {
  modelUrl: null,        // '/models/object.glb' once you have one. null = procedural demo object.
  objectSize: 2,         // largest dimension of the object after normalisation, in world units
  cameraZ: 7,            // camera distance from the object plane (z = 0)
  fov: 35,               // low fov = calmer perspective, closer to a product shot
  maxDPR: 2,             // pixel ratio cap on desktop
  mobileDPR: 1.5,        // pixel ratio cap under 800px wide
  explodeDistance: 0.7,  // how far parts travel when state.explode = 1 (object size = 2)
  chapterMs: 1000,       // timeline length per chapter. Only ratios matter, scroll maps the whole timeline.
  holdFraction: 0.3,     // share of each chapter where the object rests while the reader reads
  scrollSmoothing: 0.18, // onScroll sync smoothing (0 to 1). Tune by eye. Use true for strict 1:1 scrub.
  panel: { width: 480, height: 300 }, // intrinsic CSS size of the DOM panel that sits on the slot
};

// One row per .chapter in index.html, same order. Each row is the pose reached at the END of
// that chapter's transition. x, y and scale come from the .anchor element in the page layout,
// so they are not listed here.
export const CHAPTERS = [
  { id: 'intro',   rotateX: -10, rotateY: 25,  draw: 0.35, reveal: 0, explode: 0, lines: 1,    panel: 0, dark: 0 },
  { id: 'sketch',  rotateX: -18, rotateY: 200, draw: 1, reveal: 0, explode: 0, lines: 1,    panel: 0, dark: 0 },
  { id: 'explode', rotateX: -22, rotateY: 320, draw: 1, reveal: 0, explode: 1, lines: 1,    panel: 0, dark: 1 },
  { id: 'solid',   rotateX: -12, rotateY: 380, draw: 1, reveal: 1, explode: 0, lines: 0.15, panel: 0, dark: 1 },
  { id: 'detail',  rotateX: 0,   rotateY: 360, draw: 1, reveal: 1, explode: 0, lines: 0.15, panel: 1, dark: 0 },
];

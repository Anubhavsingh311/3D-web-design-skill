// Single place to tune the experience. Change values here, not inside the modules.

export const CONFIG = {
  modelUrl: null,         // null: use src/model/object.glb if present, else a procedural demo object
  objectSize: 2,          // the object's fit dimension after normalisation, in world units
  fit: 'box',             // 'box': largest bounding-box side == objectSize. 'sphere': bounding-sphere diameter == objectSize (never overflows its anchor, at any rotation)
  cameraZ: 7,             // camera distance from the object plane (z = 0)
  fov: 35,                // low fov = calmer perspective, closer to a product shot
  maxDPR: 2,              // pixel ratio cap on the high tier (the mid and low tiers cap lower)
  explode: {
    mode: 'radial',       // 'radial': parts leave the centre of mass. 'axis': parts separate in layers along one axis (phones, laptops, watches)
    axis: 'y',            // used by 'axis' mode: 'x' | 'y' | 'z'
    distance: 0.7,        // travel of the outermost part at state.explode = 1, in object units (object size = 2)
  },
  dissolve: {
    mode: 'axis',         // 'axis': the dissolve front sweeps along `axis` of the object. 'radial': it spreads out from `from`
    axis: [0, 1, 0],      // object-space direction, so the front travels with the object when it rotates
    from: 'screen',       // radial centre: the name of a slot_<name> marker, or null for the object centre
    noise: 0.12,          // raggedness of the front
  },
  look: {
    lineWidth: 1.6,       // sketch line width in CSS px
    edgeAngle: 28,        // crease threshold in degrees. Hard-surface models want 25 to 40
    outline: 'auto',      // silhouette lines for smooth surfaces: 'auto' (where creases cannot describe the shape) | 'always' | 'never'
    drawOrder: 'size',    // order parts draw in: 'size' (largest first) | 'scene' | 'bottom-up'
  },
  moveVh: 1,              // length of each object move in viewport heights. 1 = the whole crossing between two chapters
  scrollSmoothing: 0.45,  // onScroll sync value. Becomes a per-frame lerp factor of 0.01 + 0.19 * value. true = strict 1:1
  intro: true,            // draw the first sketch in over about a second on load
  idle: true,             // slow idle drift and pointer parallax on the high tier
  contact: 'grain',       // the one cue that ties object to page: 'grain' | 'shadow' | 'none'
  panelWidth: 480,        // intrinsic CSS width of the DOM panel on the slot. Its height follows the slot's aspect.
  // Slots for models that carry no slot_<name> marker (a marker inside the file wins). Coordinates are in
  // normalised object space: origin at the object's centre, longest side = objectSize. Turn on ?debug to see
  // each slot's axes (blue = the way the panel faces) and read the object's size from window.__stage.obj.size.
  slots: {
    // screen: { position: [-0.2, 0.02, 0.3], size: [1, 0.62], normal: [0, 0, 1], part: 'body' },
  },
};

// One row per chapter, matched to `<section class="chapter" data-chapter="...">` by id. The row is the
// pose reached at the END of the move into that chapter. x, y and scale come from the .anchor box.
// A chapter without a row inherits the previous pose and still glides to its own anchor.
export const CHAPTERS = [
  { id: 'intro',   rotateX: -10, rotateY: 25,  draw: 0.35, reveal: 0, explode: 0, lines: 1,    panel: 0, dark: 0 },
  { id: 'sketch',  rotateX: -18, rotateY: 200, draw: 1,    reveal: 0, explode: 0, lines: 1,    panel: 0, dark: 0 },
  { id: 'explode', rotateX: -22, rotateY: 320, draw: 1,    reveal: 0, explode: 1, lines: 1,    panel: 0, dark: 1 },
  { id: 'solid',   rotateX: -12, rotateY: 380, draw: 1,    reveal: 1, explode: 0, lines: 0.15, panel: 0, dark: 1 },
  { id: 'detail',  rotateX: 0,   rotateY: 360, draw: 1,    reveal: 1, explode: 0, lines: 0.15, panel: 1, dark: 0 },
];

export const POSE_KEYS = ['draw', 'reveal', 'explode', 'lines', 'panel', 'dark'];

// Pose for a chapter element: the row with the same id, else the previous pose (or the first row).
export function poseFor(id, index, previous) {
  const row = CHAPTERS.find((c) => c.id === id);
  if (row) return { ...row };
  console.warn(`[3d-stage] chapter "${id}" has no row in CHAPTERS. It inherits the previous pose.`);
  return { ...(previous || CHAPTERS[0]), id: id || `chapter-${index}` };
}

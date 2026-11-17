import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { orderSegments } from './edges.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Dissolve front constants. The shader keeps a fragment when  reveal * K - field > 0  and tints it with
// the accent while that value is under `band`. field runs 0 to 1 + noise. For the end states to be clean:
//   reveal = 0  everything discarded   (field >= 0, so reveal * K - field <= 0)
//   reveal = 1  nothing discarded and nothing tinted   (K - (1 + noise) >= band)
// An earlier version used K = 1.14 and left accent specks on the top edge of the finished object.
export const DISSOLVE = { band: 0.05, margin: 0.03 };
export const dissolveK = (noise) => 1 + noise + DISSOLVE.band + DISSOLVE.margin;

// Per mesh we stack up to four layers on identical geometry:
//   1. fill     the original mesh with one shared unlit paper material. Hides back edges (hidden-line removal).
//   2. solid    a child mesh with the original PBR material(s) plus a dissolve patch. Hidden until reveal > 0.
//   3. lines    fat crease lines (LineSegments2) that draw on, in pen order.
//   4. hull     (smooth parts only) an inverted-hull outline for silhouettes, which have no crease to draw.
// One `state` object (draw, reveal, lines, dark) drives all of it, see apply().
export function createLooks(meshes, initialTheme, opts = {}) {
  const {
    pivot, lineWidth = 1.6, edgeAngle = 28, outline = 'auto', drawOrder = 'size',
    dissolve = {}, dissolveCenter = null,
  } = opts;
  let theme = initialTheme;
  const noise = dissolve.noise ?? 0.12;

  const shared = {
    uReveal: { value: 0 },
    uObjInv: { value: new THREE.Matrix4() },
    uAxis: { value: new THREE.Vector3(...(dissolve.axis || [0, 1, 0])).normalize() },
    uCenter: { value: dissolveCenter ? dissolveCenter.clone() : new THREE.Vector3() },
    uRange: { value: new THREE.Vector2(0, 1) },
    uMode: { value: dissolve.mode === 'radial' ? 1 : 0 },
    uEdge: { value: theme.accent.clone().convertLinearToSRGB() }, // mixed after output encoding, so pre-encode it
  };
  if (pivot) shared.uRange.value.fromArray(objectRange(meshes, pivot, shared.uAxis.value, shared.uMode.value, shared.uCenter.value));

  const fillMat = new THREE.MeshBasicMaterial({
    color: theme.paper.clone(),
    toneMapped: false,     // paper must match the page background exactly
    polygonOffset: true,   // push surfaces back so the edge lines always win the depth test
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  const hullU = {
    uColor: { value: new THREE.Color() }, uPx: { value: lineWidth }, uRes: { value: new THREE.Vector2(1, 1) },
    uDraw: { value: 0 }, uOpacity: { value: 1 }, uCenterNdc: { value: new THREE.Vector2() }, uAspect: { value: 1 },
  };
  let hullMat = null;
  const getHullMat = () => hullMat || (hullMat = new THREE.ShaderMaterial({ uniforms: hullU, vertexShader: HULL_VS, fragmentShader: HULL_FS, side: THREE.BackSide, transparent: true }));

  const parts = [];
  meshes.forEach((mesh, order) => {
    const original = mesh.material;
    const makeSolid = (m) => {
      const c = m.clone();
      c.polygonOffset = true;
      c.polygonOffsetFactor = 1;
      c.polygonOffsetUnits = 1;
      patchDissolve(c, shared, noise);
      return c;
    };
    const solidMat = Array.isArray(original) ? original.map(makeSolid) : makeSolid(original); // groups keep their own material
    const solid = new THREE.Mesh(mesh.geometry, solidMat);
    solid.name = `${mesh.name}__solid`;
    solid.renderOrder = 1;
    solid.visible = false;
    mesh.material = fillMat;
    mesh.add(solid);

    const a = analyseEdges(mesh.geometry, edgeAngle);
    let line = null;
    let lineMat = null;
    let total = 0;
    let continuity = 1;
    if (a.hard > 0) {
      const ord = orderSegments(a.positions);
      total = ord.total;
      continuity = ord.continuity;
      lineMat = new LineMaterial({ color: 0xffffff, linewidth: lineWidth, transparent: true, dashed: true, dashSize: 0, gapSize: total * 2 + 1 });
      line = new LineSegments2(new LineSegmentsGeometry().setPositions(ord.positions), lineMat);
      line.computeLineDistances();
      line.name = `${mesh.name}__lines`;
      line.renderOrder = 2;
      line.visible = false;
      mesh.add(line);
    }

    const wantHull = outline === 'always' || (outline === 'auto' && a.smoothShare > 0.55);
    let hull = null;
    if (wantHull && mesh.geometry.attributes.normal) {
      hull = new THREE.Mesh(mesh.geometry, getHullMat()); // shares the model's geometry, never disposed here
      hull.name = `${mesh.name}__hull`;
      hull.frustumCulled = false;
      hull.visible = false;
      mesh.add(hull);
    }

    const box = new THREE.Box3().setFromObject(mesh);
    parts.push({ mesh, original, solid, solidMat, line, lineMat, hull, total, continuity, angle: a.angle, smoothShare: a.smoothShare, order, diag: box.getSize(new THREE.Vector3()).length(), minY: box.min.y, rank: 0 });
  });

  // Stagger rank: who starts drawing first.
  const sorted = parts.slice();
  if (drawOrder === 'size') sorted.sort((p, q) => q.diag - p.diag);
  else if (drawOrder === 'bottom-up') sorted.sort((p, q) => p.minY - q.minY);
  sorted.forEach((p, i) => { p.rank = i; });

  const span = 0.6; // share of the draw range used to stagger the parts
  const tmp = { bg: new THREE.Color(), fg: new THREE.Color() };
  const ndc = new THREE.Vector3();

  // Call once per frame, after the timeline has written `state` and before rendering.
  function apply(state, pivotObj, camera, boot = 1) {
    const n = parts.length;
    const draw = clamp01(state.draw * boot);
    theme.at(state.dark, tmp);
    fillMat.color.copy(tmp.bg);
    for (const p of parts) {
      const start = n > 1 ? (p.rank / (n - 1)) * span : 0;
      const local = p.total > 0 ? clamp01((draw - start) / (1 - span)) : 0;
      if (p.line) {
        p.lineMat.dashSize = local * p.total;
        p.lineMat.opacity = state.lines;
        p.lineMat.color.copy(tmp.fg);
        p.line.visible = state.lines > 0.001 && local > 0;
      }
      if (p.hull) p.hull.visible = state.lines > 0.001 && draw > 0;
      p.solid.visible = state.reveal > 0.001;
    }
    shared.uReveal.value = state.reveal;
    if (state.reveal > 0.001 && pivotObj) {
      pivotObj.updateWorldMatrix(true, false);
      shared.uObjInv.value.copy(pivotObj.matrixWorld).invert();
    }
    if (hullMat && pivotObj && camera) {
      hullU.uColor.value.copy(tmp.fg);
      hullU.uOpacity.value = state.lines;
      hullU.uDraw.value = draw;
      pivotObj.getWorldPosition(ndc).project(camera);
      hullU.uCenterNdc.value.set(ndc.x, ndc.y);
    }
  }

  function resize(w, h) {
    for (const p of parts) p.lineMat?.resolution.set(w, h);
    hullU.uRes.value.set(w, h);
    hullU.uAspect.value = w / h;
  }

  function setTheme(next) {
    theme = next;
    shared.uEdge.value.copy(theme.accent).convertLinearToSRGB();
  }

  function stats() {
    const withLines = parts.filter((p) => p.line);
    return {
      parts: parts.length,
      lined: withLines.length,
      hulls: parts.filter((p) => p.hull).length,
      continuity: withLines.length ? withLines.reduce((s, p) => s + p.continuity, 0) / withLines.length : 1,
    };
  }

  // Restores the model's own materials, so a remount (HMR, StrictMode) sees an untouched object.
  function dispose() {
    for (const p of parts) {
      p.mesh.remove(p.solid);
      if (p.line) { p.mesh.remove(p.line); p.line.geometry.dispose(); p.lineMat.dispose(); }
      if (p.hull) p.mesh.remove(p.hull);
      [].concat(p.solidMat).forEach((m) => m.dispose());
      p.mesh.material = p.original;
    }
    fillMat.dispose();
    hullMat?.dispose();
    parts.length = 0;
  }

  return { parts, apply, resize, setTheme, stats, dispose, shared, fillMat };
}

// Crease edges for a mesh, plus how smooth the surface is (0 = all creases, 1 = no creases at all).
function analyseEdges(geo, angle) {
  const tri = Math.floor((geo.index ? geo.index.count : geo.attributes.position.count) / 3);
  let deg = angle;
  let edges = new THREE.EdgesGeometry(geo, deg);
  let hard = edges.attributes.position.count / 2;
  // Dense, noisy meshes (scans, subdivided surfaces) are a mesh dump at a low threshold. Raise it until
  // the result reads as a drawing.
  while (tri > 400 && hard > 0.6 * tri && deg < 75) {
    deg += 15;
    edges.dispose();
    edges = new THREE.EdgesGeometry(geo, deg);
    hard = edges.attributes.position.count / 2;
  }
  const positions = Float32Array.from(edges.attributes.position.array);
  edges.dispose();
  // A closed triangle mesh has about 1.5 edges per triangle. The share that is not a crease is "smooth".
  const smoothShare = tri > 0 ? 1 - Math.min(1, hard / (1.5 * tri)) : 0;
  return { positions, hard, tri, smoothShare, angle: deg };
}

// Range of the dissolve coordinate over the whole object, in pivot space. Uses the 8 corners of each
// geometry's bounding box: cheap, and a slight over-estimate only delays the front by a hair.
function objectRange(meshes, pivot, axis, mode, center) {
  pivot.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(pivot.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  let lo = Infinity;
  let hi = -Infinity;
  for (const mesh of meshes) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox;
    m.multiplyMatrices(inv, mesh.matrixWorld);
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(m);
      const s = mode === 1 ? v.distanceTo(center) : v.dot(axis);
      lo = Math.min(lo, s);
      hi = Math.max(hi, s);
    }
  }
  if (mode === 1) lo = 0;
  return Number.isFinite(lo) ? [lo, hi] : [0, 1];
}

// Dissolve: discard fragments behind a noisy front, glow the cut edge with the accent. The front is
// measured in OBJECT space (pivot space), so it travels with the object when it rotates, and the noise
// is stuck to the surface instead of swimming. onBeforeCompile keeps the full PBR lighting.
function patchDissolve(mat, shared, noise) {
  const K = dissolveK(noise).toFixed(4);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uReveal: shared.uReveal, uObjInv: shared.uObjInv, uAxis: shared.uAxis, uRange: shared.uRange, uCenter: shared.uCenter, uMode: shared.uMode, uEdge: shared.uEdge });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nuniform mat4 uObjInv;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvObj = (uObjInv * modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vObj;
        uniform float uReveal;
        uniform vec3 uAxis;
        uniform vec2 uRange;
        uniform vec3 uCenter;
        uniform float uMode;
        uniform vec3 uEdge;
        float dHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float dS = uMode < 0.5 ? dot(vObj, uAxis) : length(vObj - uCenter);
        float dSweep = clamp((dS - uRange.x) / max(uRange.y - uRange.x, 1e-4), 0.0, 1.0);
        float dField = dSweep + dHash(floor(vObj * 64.0)) * ${noise.toFixed(4)};
        float dEdge = uReveal * ${K} - dField;
        if (dEdge <= 0.0) discard;`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        gl_FragColor.rgb = mix(uEdge, gl_FragColor.rgb, smoothstep(0.0, ${DISSOLVE.band.toFixed(4)}, dEdge));`);
  };
  mat.customProgramCacheKey = () => `dissolve-v2-${noise}`;
}

// Inverted hull: back faces pushed outward along their normals by a constant number of SCREEN pixels,
// so the outline keeps its weight at any object scale. Only the rim shows, because the front faces
// (the fill) cover the rest. The draw-on is a clock wipe around the object centre, starting at 12 o'clock.
const HULL_VS = `
  uniform float uPx;
  uniform vec2 uRes;
  varying vec2 vNdc;
  void main() {
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec3 vn = normalize(normalMatrix * normal);
    vec2 dirPx = (projectionMatrix * vec4(vn, 0.0)).xy * uRes * 0.5;
    vec2 off = length(dirPx) > 1e-5 ? normalize(dirPx) : vec2(0.0);
    clip.xy += off * (uPx * 2.0 / uRes) * clip.w;
    vNdc = clip.xy / clip.w;
    gl_Position = clip;
  }`;
const HULL_FS = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uDraw;
  uniform vec2 uCenterNdc;
  uniform float uAspect;
  varying vec2 vNdc;
  void main() {
    vec2 d = (vNdc - uCenterNdc) * vec2(uAspect, 1.0);
    float t = fract(atan(d.x, d.y) / 6.28318530718);
    if (t > uDraw) discard;
    gl_FragColor = vec4(uColor, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

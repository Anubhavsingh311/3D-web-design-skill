import * as THREE from 'three';
import { BUDGETS } from './perf.js';

const isMarker = (o) => o.name.startsWith('slot_') || o.name.startsWith('anchor_');
const markerAncestor = (o) => { for (let p = o; p; p = p.parent) if (isMarker(p)) return p; return null; };

// ---------------------------------------------------------------------------------------------
// Loading. Loaders are imported lazily so the demo object does not pay for them. three 0.150+ ships
// its own Draco and KTX2 decoders and Vite bundles them, so there is no CDN path to configure.
// Single-file mode leaves Draco and KTX2 out (their decoders are large). Use meshopt there.
// ---------------------------------------------------------------------------------------------
export async function loadModel(url, renderer) {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
  ]);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const disposables = [];
  if (import.meta.env?.MODE !== 'single') {
    const [{ DRACOLoader }, { KTX2Loader }] = await Promise.all([
      import('three/addons/loaders/DRACOLoader.js'),
      import('three/addons/loaders/KTX2Loader.js'),
    ]);
    const draco = new DRACOLoader();
    loader.setDRACOLoader(draco);
    disposables.push(draco);
    if (renderer) {
      const ktx2 = new KTX2Loader().detectSupport(renderer);
      loader.setKTX2Loader(ktx2);
      disposables.push(ktx2);
    }
  }
  try {
    const gltf = await loader.loadAsync(url);
    return gltf.scene;
  } finally {
    disposables.forEach((d) => d.dispose());
  }
}

// ---------------------------------------------------------------------------------------------
// Procedural stand-ins so the starter runs with no asset. Names follow the conventions the rest of
// the code relies on:
//   slot_<n>   marks where a DOM panel lives. Either an Object3D (an Empty: local +Z faces out, its scale
//              is the panel size) or a flat quad mesh (any orientation: it is converted automatically).
//   anchor_<n> an Object3D that marks a point DOM labels can follow (optional).
// ---------------------------------------------------------------------------------------------
export function makeDemoObject() {
  const root = new THREE.Group();
  root.name = 'demo';
  const mat = (color, metalness = 0.25, roughness = 0.45) => new THREE.MeshStandardMaterial({ color, metalness, roughness });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 0.6), mat('#c9ced4'));
  body.name = 'body';
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.2, 48), mat('#ff5a36', 0.1, 0.35));
  dial.name = 'dial';
  dial.position.set(0.55, 0.65, 0);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.06, 16, 96), mat('#8a9099', 0.6, 0.3));
  ring.name = 'ring';
  ring.rotation.x = Math.PI / 2;
  const footL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.4), mat('#5d636b'));
  footL.name = 'footL';
  footL.position.set(-0.6, -0.61, 0);
  const footR = footL.clone();
  footR.name = 'footR';
  footR.position.x = 0.6;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 16), mat('#8a9099', 0.6, 0.3));
  mast.name = 'mast';
  mast.position.set(-0.65, 0.85, 0);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 16), mat('#ff5a36', 0.1, 0.35));
  tip.name = 'tip';
  tip.position.set(-0.65, 1.2, 0);

  // The slot is a child of the body, so it travels with the body when the object explodes.
  const slot = new THREE.Object3D();
  slot.name = 'slot_screen';
  slot.position.set(-0.2, 0.02, 0.31); // 0.01 in front of the body face (z = 0.30)
  slot.scale.set(1.0, 0.62, 1);        // size of the panel in object units
  body.add(slot);

  root.add(body, dial, ring, footL, footR, mast, tip);
  return root;
}

// One fused, smooth mesh with no parts: the hard case for sketch lines (silhouette needed) and for explode (impossible).
export function makeKnotObject() {
  const root = new THREE.Group();
  root.name = 'knot';
  const mesh = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.7, 0.26, 240, 36),
    new THREE.MeshStandardMaterial({ color: '#c9ced4', metalness: 0.3, roughness: 0.4 })
  );
  mesh.name = 'knot';
  root.add(mesh);
  return root;
}

export const DEMOS = { machine: makeDemoObject, knot: makeKnotObject };

// ---------------------------------------------------------------------------------------------
// Bounds. Precise (every vertex, through the real matrices) and aware of markers: slot and anchor
// geometry never counts. Box3.setFromObject over-estimates rotated parts and counts marker quads,
// which de-centres and mis-scales models exported from CAD or Blender.
// ---------------------------------------------------------------------------------------------
export function boundsOf(root) {
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const visit = (cb) => root.traverse((o) => {
    if (!o.isMesh || !o.visible || markerAncestor(o)) return;
    const pos = o.geometry?.attributes?.position;
    if (!pos) return;
    if (o.isInstancedMesh) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox;
      for (let k = 0; k < o.count; k++) {
        o.getMatrixAt(k, m).premultiply(o.matrixWorld);
        for (let c = 0; c < 8; c++) cb(v.set(c & 1 ? b.max.x : b.min.x, c & 2 ? b.max.y : b.min.y, c & 4 ? b.max.z : b.min.z).applyMatrix4(m));
      }
      return;
    }
    for (let i = 0; i < pos.count; i++) cb(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
  });
  const box = new THREE.Box3();
  visit((p) => box.expandByPoint(p));
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
  const size = box.getSize(new THREE.Vector3());
  return {
    box,
    size,
    maxDim: Math.max(size.x, size.y, size.z),
    radiusFrom(c) {
      let r2 = 0;
      visit((p) => { r2 = Math.max(r2, p.distanceToSquared(c)); });
      return Math.sqrt(r2);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Slots from a quad mesh. Empties are fragile: their local +Z depends on how the DCC tool exports.
// A flat quad is not, because its geometry says where it is, how big it is and which way it faces.
// The result is an Object3D that follows the slot convention. The source quad is hidden.
// ---------------------------------------------------------------------------------------------
function slotFromMesh(mesh, objectCenter, maxDim) {
  const pos = mesh.geometry.attributes.position;
  const idx = mesh.geometry.index;
  mesh.updateWorldMatrix(true, false);
  const pts = [];
  for (let i = 0; i < pos.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));

  const nrm = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const triCount = idx ? idx.count / 3 : pts.length / 3;
  for (let t = 0; t < triCount; t++) {
    const a = pts[idx ? idx.getX(t * 3) : t * 3];
    const b = pts[idx ? idx.getX(t * 3 + 1) : t * 3 + 1];
    const c = pts[idx ? idx.getX(t * 3 + 2) : t * 3 + 2];
    nrm.add(e1.subVectors(b, a).cross(e2.subVectors(c, a))); // area weighted
  }
  if (nrm.lengthSq() < 1e-18) nrm.set(0, 0, 1);
  nrm.normalize();

  const centroid = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  // Face away from the object: that is the side a viewer sees a screen on.
  if (nrm.dot(centroid.clone().sub(objectCenter)) < 0) nrm.negate();

  // In-plane axes: "up" is world +Y flattened onto the plane (world +Z if the plane is horizontal).
  const up = new THREE.Vector3(0, 1, 0).addScaledVector(nrm, -nrm.y);
  if (up.lengthSq() < 1e-6) up.set(0, 0, 1).addScaledVector(nrm, -nrm.z);
  up.normalize();
  const right = new THREE.Vector3().crossVectors(up, nrm).normalize();

  let r0 = Infinity, r1 = -Infinity, u0 = Infinity, u1 = -Infinity, n0 = Infinity, n1 = -Infinity;
  const d = new THREE.Vector3();
  for (const p of pts) {
    d.subVectors(p, centroid);
    const r = d.dot(right), u = d.dot(up), n = d.dot(nrm);
    r0 = Math.min(r0, r); r1 = Math.max(r1, r); u0 = Math.min(u0, u); u1 = Math.max(u1, u); n0 = Math.min(n0, n); n1 = Math.max(n1, n);
  }
  const w = r1 - r0;
  const h = u1 - u0;
  const flatness = (n1 - n0) / Math.max(w, h, 1e-9);

  const center = centroid.clone()
    .addScaledVector(right, (r0 + r1) / 2)
    .addScaledVector(up, (u0 + u1) / 2)
    .addScaledVector(nrm, 0.004 * maxDim); // in front of the surface, or the hole z-fights with it
  const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, nrm));
  const world = new THREE.Matrix4().compose(center, quat, new THREE.Vector3(w, h, 1));

  const slot = new THREE.Object3D();
  slot.name = mesh.name;
  mesh.name = `${mesh.name}__src`;
  const parent = mesh.parent;
  parent.updateWorldMatrix(true, false);
  new THREE.Matrix4().copy(parent.matrixWorld).invert().multiply(world).decompose(slot.position, slot.quaternion, slot.scale);
  slot.userData.fromMesh = { flatness };
  parent.add(slot);
  return slot;
}

// ---------------------------------------------------------------------------------------------
// Explode units: the children of the first node that branches (single-child wrappers are skipped).
// Markers and hidden nodes do not count, otherwise a slot at the top level hides the real parts.
// ---------------------------------------------------------------------------------------------
const hasMesh = (o) => (o.isMesh && !markerAncestor(o)) || o.children.some(hasMesh);
const realKids = (n) => n.children.filter((c) => !isMarker(c) && c.visible !== false && hasMesh(c));

function explodeUnits(root) {
  let node = root;
  for (;;) {
    const kids = realKids(node);
    if (kids.length === 1 && !kids[0].isMesh) node = kids[0]; else return kids;
  }
}

// A slot must travel with the part it sits on. Slots that were authored at the top level get attached
// (world transform preserved) to the nearest unit.
function reparentSlots(slots, units) {
  if (!units.length) return;
  const boxes = units.map((u) => new THREE.Box3().setFromObject(u));
  const p = new THREE.Vector3();
  for (const s of slots) {
    let inside = false;
    for (let a = s; a; a = a.parent) if (units.includes(a)) { inside = true; break; }
    if (inside) continue;
    s.getWorldPosition(p);
    let best = 0;
    let bd = Infinity;
    boxes.forEach((b, i) => { const dd = b.distanceToPoint(p); if (dd < bd) { bd = dd; best = i; } });
    units[best].attach(s);
  }
}

function prepareExplode(pivot, units, { mode = 'radial', axis = 'y' } = {}) {
  pivot.updateMatrixWorld(true);
  const boxes = units.map((u) => new THREE.Box3().setFromObject(u));
  const whole = new THREE.Box3();
  boxes.forEach((b) => whole.union(b));
  const oc = whole.getCenter(new THREE.Vector3());
  const centers = boxes.map((b) => b.getCenter(new THREE.Vector3()));

  let dirs; // world-space direction and a signed factor per unit
  if (mode === 'axis') {
    const ax = axis.isVector3 ? axis.clone().normalize() : new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
    // Layers separate in rank order, evenly: neighbours always gain the same extra gap, the two
    // outermost layers travel the full distance, the middle one stays. Proportional scaling would
    // leave layers near the middle stuck together.
    const order = centers.map((c, i) => [c.clone().sub(oc).dot(ax), i]).sort((a, b) => a[0] - b[0]);
    const n = units.length;
    const factor = new Array(n).fill(0);
    order.forEach(([, i], rank) => { factor[i] = n > 1 ? (rank - (n - 1) / 2) / ((n - 1) / 2) : 0; });
    dirs = units.map((_, i) => ({ dirW: ax.clone(), factor: factor[i] }));
  } else {
    const rel = centers.map((c) => c.clone().sub(oc));
    const lens = rel.map((r) => r.length());
    const maxLen = Math.max(...lens, 1e-6);
    // Parts near the centre of mass (usually the main body) barely move, outer parts travel furthest.
    dirs = rel.map((r, i) => ({ dirW: lens[i] < 1e-8 ? new THREE.Vector3(0, 1, 0) : r.clone().normalize(), factor: lens[i] / maxLen }));
  }

  units.forEach((u, i) => {
    const { dirW, factor } = dirs[i];
    // Convert the world direction into the unit's parent space so nested transforms stay correct.
    const a = u.parent.worldToLocal(centers[i].clone());
    const b = u.parent.worldToLocal(centers[i].clone().add(dirW));
    u.userData.home = u.position.clone();
    u.userData.dir = b.sub(a).multiplyScalar(factor); // local offset for 1 world unit of travel
  });
}

// amount is in object units (the object is `size` wide). 0 = assembled.
export function applyExplode(units, amount) {
  for (const u of units) u.position.copy(u.userData.home).addScaledVector(u.userData.dir, amount);
}

// ---------------------------------------------------------------------------------------------
// Slots defined in code. Most downloaded models have no slot_* marker, and an optimiser run with
// default flags deletes Empty markers. Coordinates are in NORMALISED object space: the origin is the
// centre of the object and its fit dimension equals `size` (2 by default). `lift` moves the slot off the
// surface so the hole does not z-fight with it. The slot is attached to `part` (a unit name) or to the
// nearest unit, so it travels with that part when the object explodes.
// ---------------------------------------------------------------------------------------------
export function addSlot(obj, key, { position = [0, 0, 0], size = [1, 1], normal = [0, 0, 1], up = [0, 1, 0], part = null, lift = 0.01 } = {}) {
  const n = new THREE.Vector3(...normal).normalize();
  const u = new THREE.Vector3(...up);
  u.addScaledVector(n, -u.dot(n));
  if (u.lengthSq() < 1e-6) u.set(0, 0, 1).addScaledVector(n, -n.z);
  u.normalize();
  const r = new THREE.Vector3().crossVectors(u, n).normalize();
  const slot = new THREE.Object3D();
  slot.name = `slot_${key}`;
  slot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, u, n));
  slot.position.fromArray(position).addScaledVector(n, lift);
  slot.scale.set(size[0], size[1], 1);
  obj.pivot.add(slot);
  obj.pivot.updateMatrixWorld(true);
  const host = part && obj.units.find((x) => x.name === part);
  if (host) host.attach(slot); else reparentSlots([slot], obj.units);
  obj.slots[key] = slot;
  return slot;
}

// ---------------------------------------------------------------------------------------------
// Normalisation. Every object, whatever its authoring scale or pivot, ends up centred on the origin
// with its fit dimension equal to `size`. Hierarchy: pivot > holder (scale) > raw. The scroll
// timeline drives `pivot` only.
// ---------------------------------------------------------------------------------------------
export function prepareObject(raw, { size = 2, fit = 'box', explode = {} } = {}) {
  raw.updateMatrixWorld(true);

  // Markers first, so their geometry never reaches the bounds.
  const slots = {};
  const anchors = {};
  const markers = [];
  raw.traverse((o) => { if (isMarker(o)) markers.push(o); });
  const pre = boundsOf(raw);
  const preCenter = pre.box.getCenter(new THREE.Vector3());
  for (const m of markers) {
    if (m.name.startsWith('slot_')) {
      const key = m.name.slice(5);
      slots[key] = m.isMesh ? slotFromMesh(m, preCenter, pre.maxDim) : m;
    } else {
      anchors[m.name.slice(7)] = m;
    }
    if (m.isMesh) m.visible = false;
  }

  const b = boundsOf(raw);
  const center = b.box.getCenter(new THREE.Vector3());
  const k = fit === 'sphere' ? size / Math.max(2 * b.radiusFrom(center), 1e-6) : size / Math.max(b.maxDim, 1e-6);

  raw.position.sub(center);
  const holder = new THREE.Group();
  holder.name = 'holder';
  holder.scale.setScalar(k);
  holder.add(raw);
  const pivot = new THREE.Group();
  pivot.name = 'pivot';
  pivot.add(holder);
  pivot.updateMatrixWorld(true);

  const meshes = [];
  raw.traverse((o) => { if (o.isMesh && o.visible && !markerAncestor(o)) meshes.push(o); });

  const units = explodeUnits(raw);
  reparentSlots(Object.values(slots), units);
  prepareExplode(pivot, units, explode);

  const obj = { pivot, holder, raw, meshes, slots, anchors, units, normalizeScale: k, size: b.size.clone().multiplyScalar(k) };
  obj.audit = auditObject(obj);
  return obj;
}

// ---------------------------------------------------------------------------------------------
// Audit. Runs on the model exactly as loaded, before the look layers replace any material. Warnings
// carry a code so tests and the verify script can match them.
// ---------------------------------------------------------------------------------------------
export function auditObject({ meshes, units, slots }, budget = BUDGETS.desktop) {
  let triangles = 0, skinned = 0, instanced = 0, morph = 0, multiMaterial = 0, transparent = 0;
  const textures = new Map();
  for (const m of meshes) {
    const g = m.geometry;
    const t = (g.index ? g.index.count : (g.attributes.position?.count || 0)) / 3;
    triangles += m.isInstancedMesh ? t * m.count : t;
    if (m.isSkinnedMesh) skinned++;
    if (m.isInstancedMesh) instanced++;
    if (g.morphAttributes && Object.keys(g.morphAttributes).length) morph++;
    if (Array.isArray(m.material)) multiMaterial++;
    for (const mat of [].concat(m.material)) {
      if (mat.transparent) transparent++;
      for (const key of Object.keys(mat)) { const v = mat[key]; if (v && v.isTexture) textures.set(v.uuid, v); }
    }
  }
  let vram = 0;
  const texList = [];
  for (const t of textures.values()) {
    const img = t.image;
    const w = img?.width || img?.naturalWidth || t.mipmaps?.[0]?.width || 0;
    const h = img?.height || img?.naturalHeight || t.mipmaps?.[0]?.height || 0;
    vram += w * h * (t.isCompressedTexture ? 1 : 4) * 1.33;
    texList.push({ w, h, compressed: !!t.isCompressedTexture });
  }
  const drawCalls = meshes.length * 3; // fill, solid and lines layers (plus an outline pass on smooth parts)
  const slotNames = Object.keys(slots);
  const warnings = [];
  const warn = (code, msg) => warnings.push({ code, msg });
  if (units.length < 2) warn('fused', `Explode needs separate parts and found ${units.length}. Split the mesh by part or material in the source file, or drop the explode chapter.`);
  if (skinned) warn('skinned', `${skinned} SkinnedMesh found. Sketch and dissolve use the bind pose. Bake the pose you want in the source file.`);
  if (instanced) warn('instanced', `${instanced} InstancedMesh found. The dissolve and sketch layers do not support instancing. Merge or expand the instances.`);
  if (morph) warn('morph', `${morph} mesh(es) with morph targets. Edge lines are built from the base shape.`);
  if (transparent) warn('transparent', `${transparent} transparent material(s). Check renderOrder against the fill layer early.`);
  if (triangles > budget.triangles) warn('triangles', `${Math.round(triangles)} triangles exceeds the ${budget.triangles} budget. Decimate or use gltf-transform simplify.`);
  if (drawCalls > budget.drawCalls) warn('draw-calls', `${meshes.length} meshes give about ${drawCalls} draw calls, budget ${budget.drawCalls}. Merge small meshes.`);
  if (vram > 160 * 1048576) warn('vram', `Textures need about ${Math.round(vram / 1048576)} MB of GPU memory. Cap textures at 2048, or 1024 for mobile, or use KTX2.`);
  if (!slotNames.length) warn('no-slot', 'No slot_* marker found. A chapter that shows a DOM panel has nothing to attach to.');
  return {
    meshes: meshes.length, triangles: Math.round(triangles), drawCalls, units: units.length, slots: slotNames,
    skinned, instanced, morph, multiMaterial, transparent, textures: texList, vramMB: Math.round(vram / 1048576),
    fused: units.length < 2, warnings,
  };
}

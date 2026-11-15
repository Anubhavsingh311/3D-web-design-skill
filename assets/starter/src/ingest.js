import * as THREE from 'three';

// ---------------------------------------------------------------------------------------------
// Loading. Loaders are imported lazily so the demo object does not pay for them.
// ---------------------------------------------------------------------------------------------
export async function loadModel(url) {
  const [{ GLTFLoader }, { DRACOLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/loaders/DRACOLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
  ]);
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  // For production, copy node_modules/three/examples/jsm/libs/draco/gltf/ to /public/draco/ and use that path.
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  draco.dispose();
  return gltf.scene;
}

// ---------------------------------------------------------------------------------------------
// Procedural stand-in so the starter runs with no asset. Replace with the user's object.
// Names follow the conventions the rest of the code relies on:
//   slot_<name>   an Object3D whose local unit plane (1 x 1, facing +Z) hosts a DOM panel.
//                 Its scale is the panel size, its position sits slightly in FRONT of the surface.
//   anchor_<name> an Object3D that marks a point DOM labels can follow (optional).
// ---------------------------------------------------------------------------------------------
export function makeDemoObject() {
  const root = new THREE.Group();
  root.name = 'demo';
  const mat = (color, metalness = 0.25, roughness = 0.45) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 0.6), mat('#c9ced4'));
  body.name = 'body';

  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.2, 48), mat('#ff5a36', 0.1, 0.35));
  dial.name = 'dial';
  dial.position.set(0.55, 0.65, 0);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.06, 6, 64), mat('#8a9099', 0.6, 0.3));
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
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat('#ff5a36', 0.1, 0.35));
  tip.name = 'tip';
  tip.position.set(-0.65, 1.2, 0);

  // The slot is a child of the body, so it travels with the body when the object explodes.
  const slot = new THREE.Object3D();
  slot.name = 'slot_screen';
  slot.position.set(-0.2, 0.02, 0.31);   // 0.01 in front of the body face (z = 0.30)
  slot.scale.set(1.0, 0.62, 1);          // world size of the panel in object units
  body.add(slot);

  root.add(body, dial, ring, footL, footR, mast, tip);
  return root;
}

// ---------------------------------------------------------------------------------------------
// Normalisation. Every object, whatever its authoring scale or pivot, ends up centred on the
// origin with its largest dimension equal to `size`. Hierarchy: pivot > holder (scale) > raw.
// The scroll timeline drives `pivot` only.
// ---------------------------------------------------------------------------------------------
export function prepareObject(raw, size = 2) {
  raw.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(raw);
  const center = box.getCenter(new THREE.Vector3());
  const dim = box.getSize(new THREE.Vector3());
  const k = size / Math.max(dim.x, dim.y, dim.z, 1e-6);

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
  const slots = {};
  const anchors = {};
  raw.traverse((o) => {
    if (o.isMesh) meshes.push(o);
    if (o.name.startsWith('slot_')) slots[o.name.slice(5)] = o;
    if (o.name.startsWith('anchor_')) anchors[o.name.slice(7)] = o;
  });

  // Slots and anchors are pure markers. A Blender plane exported as a mesh would otherwise render.
  Object.values(slots).forEach((s) => { if (s.isMesh) s.visible = false; });
  const drawable = meshes.filter((m) => !m.name.startsWith('slot_'));

  const units = explodeUnits(raw);
  prepareExplode(pivot, units);

  return { pivot, holder, raw, meshes: drawable, slots, anchors, units, normalizeScale: k };
}

// The parts that move when the object explodes: the children of the first node that branches.
function explodeUnits(root) {
  let node = root;
  while (node.children.length === 1 && !node.children[0].isMesh) node = node.children[0];
  return node.children.filter((c) => c.isMesh || c.children.length > 0);
}

function prepareExplode(pivot, units) {
  pivot.updateMatrixWorld(true);
  const all = new THREE.Box3().setFromObject(pivot);
  const oc = all.getCenter(new THREE.Vector3());
  const info = units.map((u) => {
    const c = new THREE.Box3().setFromObject(u).getCenter(new THREE.Vector3());
    const dirW = c.clone().sub(oc);
    const len = dirW.length();
    if (len < 1e-8) dirW.set(0, 1, 0);
    return { u, c, dirW: dirW.normalize(), len };
  });
  const maxLen = Math.max(...info.map((i) => i.len), 1e-6);
  info.forEach(({ u, c, dirW, len }) => {
    // Parts near the centre of mass (usually the main body) barely move, outer parts travel furthest.
    const factor = len / maxLen;
    // Convert the world direction into the unit's parent space so nested transforms stay correct.
    const a = u.parent.worldToLocal(c.clone());
    const b = u.parent.worldToLocal(c.clone().add(dirW));
    u.userData.home = u.position.clone();
    u.userData.dir = b.sub(a).multiplyScalar(factor); // local offset for 1 world unit of travel at factor 1
  });
}

// amount is in object units (the object is `size` wide). 0 = assembled.
export function applyExplode(units, amount) {
  for (const u of units) u.position.copy(u.userData.home).addScaledVector(u.userData.dir, amount);
}

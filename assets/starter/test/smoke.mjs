// Node smoke test: no browser, no WebGL. Checks the pure logic of ingest, looks and registration math.
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { makeDemoObject, prepareObject, applyExplode } from '../src/ingest.js';
import { createLooks } from '../src/looks.js';
import { viewToWorld } from '../src/layout.js';

// 1. normalisation: centred, largest dimension == size, slots found
const obj = prepareObject(makeDemoObject(), 2);
const box = new THREE.Box3().setFromObject(obj.pivot);
const dim = box.getSize(new THREE.Vector3());
assert.ok(Math.abs(Math.max(dim.x, dim.y, dim.z) - 2) < 1e-6, 'largest dimension is 2');
assert.ok(box.getCenter(new THREE.Vector3()).length() < 1e-6, 'centred on origin');
assert.ok(obj.slots.screen, 'slot_screen discovered');
assert.ok(obj.units.length >= 5, 'explode units found');
console.log('ok normalise', dim.toArray().map((n) => +n.toFixed(3)));

// 2. explode: no unit travels further than `amount`, and the outermost unit travels exactly `amount`
const before = obj.units.map((u) => new THREE.Vector3().setFromMatrixPosition(u.matrixWorld));
applyExplode(obj.units, 0.5);
obj.pivot.updateMatrixWorld(true);
const moved = obj.units.map((u, i) => new THREE.Vector3().setFromMatrixPosition(u.matrixWorld).distanceTo(before[i]));
assert.ok(moved.every((d) => d <= 0.5 + 1e-5), 'no unit exceeds amount');
assert.ok(Math.abs(Math.max(...moved) - 0.5) < 1e-5, 'outermost unit travels exactly amount');
applyExplode(obj.units, 0);
console.log('ok explode', moved.map((d) => +d.toFixed(2)).join(' '));

// 3. looks: draw-on staggers parts, reveal toggles solids
const looks = createLooks(obj.meshes, { ink: '#111111', paper: '#eeeeee', accent: '#ff5a36' });
looks.apply({ draw: 0, reveal: 0, lines: 1, dark: 0 });
assert.ok(looks.parts.every((p) => p.lineMat.dashSize === 0 && !p.solid.visible), 'nothing drawn at 0');
looks.apply({ draw: 1, reveal: 1, lines: 1, dark: 0 }, obj.pivot);
assert.ok(looks.parts.every((p) => Math.abs(p.lineMat.dashSize - p.total) < 1e-9 && p.solid.visible), 'all drawn at 1');
looks.apply({ draw: 0.4, reveal: 0, lines: 1, dark: 0 });
const ds = looks.parts.map((p) => p.lineMat.dashSize / p.total);
assert.ok(ds[0] > ds[ds.length - 1], 'first part draws before the last');
console.log('ok looks', ds.map((n) => +n.toFixed(2)).join(' '));
looks.dispose();

// 4. slot registration: the CSS object transform reproduces the slot's projected corners.
// CSS3DRenderer works in px with perspective = projection[5] * height/2. Reproduce its math.
const W = 1280, H = 720;
const cam = new THREE.PerspectiveCamera(35, W / H, 0.1, 100);
cam.position.set(0, 0, 7); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
const slot = obj.slots.screen;
obj.pivot.position.set(0.8, -0.3, 0); obj.pivot.rotation.set(-0.2, 0.5, 0); obj.pivot.scale.setScalar(1.3);
obj.pivot.updateMatrixWorld(true);
const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
slot.matrixWorld.decompose(p, q, s);
const PW = 480, PH = 300;
const css = new THREE.Object3D();
css.position.copy(p); css.quaternion.copy(q); css.scale.set(s.x / PW, s.y / PH, 1); css.updateMatrixWorld();
const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
corners.forEach(([cx, cy]) => {
  const viaSlot = new THREE.Vector3(cx, cy, 0).applyMatrix4(slot.matrixWorld);
  const viaCss = new THREE.Vector3(cx * PW, cy * PH, 0).applyMatrix4(css.matrixWorld);
  assert.ok(viaSlot.distanceTo(viaCss) < 1e-5, 'css object corners match slot corners');
});
console.log('ok slot math');

// 5. viewToWorld round trip: a world point projects back to the pixel it came from
const w = viewToWorld(cam, 900, 200, W, H);
const ndc = new THREE.Vector3(w.x, w.y, 0).project(cam);
assert.ok(Math.abs((ndc.x * 0.5 + 0.5) * W - 900) < 1e-6 && Math.abs((-ndc.y * 0.5 + 0.5) * H - 200) < 1e-6);
console.log('ok viewToWorld');
console.log('ALL OK');

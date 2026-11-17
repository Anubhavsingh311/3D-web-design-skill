// Node unit tests. No browser, no GPU. Run with `npm test`.
// Covers the pure logic: theme, schedule, edge ordering, perf, ingest, looks, layout math.
// What needs a real browser (timeline vs scroll, occlusion, resize, remount) lives in scripts/verify.mjs.
import * as THREE from 'three';
import { createTheme, contrast } from '../src/theme.js';
import { buildSchedule, stageOffset, chapterAt } from '../src/schedule.js';
import { orderSegments, continuityOf } from '../src/edges.js';
import { pickTier, createFrameMonitor, TIERS } from '../src/perf.js';
import { prepareObject, boundsOf, applyExplode, auditObject, addSlot, makeDemoObject, makeKnotObject } from '../src/ingest.js';
import { createLooks, DISSOLVE, dissolveK } from '../src/looks.js';
import { viewToWorld } from '../src/layout.js';
import { slotSize, projectToScreen } from '../src/register.js';
import { CHAPTERS, poseFor } from '../src/config.js';
import { shadowPlacement } from '../src/contact.js';

let passed = 0;
const failures = [];
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const ok = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };
const near = (a, b, eps, msg) => ok(Math.abs(a - b) <= eps, `${msg || 'near'}: ${a} vs ${b} (eps ${eps})`);

const tokens = { ink: '#15171a', paper: '#f3f0e8', accent: '#ff5a36' };
const std = (color = '#c9ced4') => new THREE.MeshStandardMaterial({ color });
const box = (w, h, d, name, x = 0, y = 0, z = 0, mat = std()) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.name = name; m.position.set(x, y, z); return m; };

// ---------------------------------------------------------------- theme
test('theme: text never disappears into the background', () => {
  const theme = createTheme(tokens);
  ok(theme.worstContrast() >= 3.9, `worst contrast ${theme.worstContrast().toFixed(2)} should be >= 3.9`);
  const out = theme.at(0);
  ok(contrast(out.bg, out.fg) > 12, 'light state is high contrast');
  const dark = theme.at(1);
  ok(contrast(dark.bg, dark.fg) > 12, 'dark state is high contrast');
});
test('theme: regression witness, a naive lerp of both colours hits 1:1 contrast', () => {
  const ink = new THREE.Color(tokens.ink), paper = new THREE.Color(tokens.paper);
  const bg = paper.clone().lerp(ink, 0.5), fg = ink.clone().lerp(paper, 0.5);
  ok(contrast(bg, fg) < 1.01, 'the original approach is invisible at 0.5');
});
test('theme: optional dark palette is honoured', () => {
  const theme = createTheme({ ...tokens, paperDark: '#0e1a2b', inkDark: '#e8eefc' });
  const d = theme.at(1);
  ok(Math.abs(d.bg.b - new THREE.Color('#0e1a2b').b) < 1e-6, 'dark background is the brand navy');
  ok(theme.worstContrast() >= 3.5, 'still readable throughout');
});

// ---------------------------------------------------------------- schedule
const geo = (n, h, vh) => ({ tops: Array.from({ length: n }, (_, i) => i * h), heights: Array(n).fill(h), mainHeight: n * h, viewH: vh });
test('schedule: windows tile the scroll range with no gap or overlap', () => {
  const s = buildSchedule(geo(5, 1728, 720));
  near(s.range, 7920, 0, 'range');
  for (let i = 0; i < 5; i++) {
    const c = s.chapters[i];
    near(c.restStart, c.moveEnd, 0, 'rest begins where the move ends');
    if (i < 4) near(c.restEnd, s.chapters[i + 1].moveStart, 0, 'rest ends where the next move begins');
  }
  near(s.chapters[4].restEnd, s.range, 0, 'last rest reaches the end of the page');
  near(s.chapters[1].moveStart, 1008, 0.001); near(s.chapters[1].moveEnd, 1728, 0.001);
});
test('schedule: arrival matches the pin, at any chapter height and count', () => {
  for (const [n, h, vh] of [[3, 1000, 800], [8, 2200, 900], [5, 1728, 720], [12, 1300, 600]]) {
    const s = buildSchedule(geo(n, h, vh));
    s.chapters.forEach((c, i) => { if (i) near(c.moveEnd, c.top, 0.001, `chapter ${i} arrives exactly when its pin sticks`); });
  }
});
test('schedule: regression witness, the old linear mapping arrives later each chapter', () => {
  // The old timeline was 4 x 1000 ms plus a 210 ms staggered tail, mapped onto the scroll range.
  const range = 7920, total = 4210;
  const lag = (i) => (i * 1000 * range) / total - i * 1728;
  near(lag(4), 612.9, 1, 'last chapter arrives 613 px (0.85 viewport heights) late');
  ok(lag(4) > lag(1), 'and the lag grows with the chapter index');
});
test('schedule: variable chapter heights keep every move inside its crossing', () => {
  const heights = [1500, 2600, 1800, 3000];
  const tops = heights.map((_, i) => heights.slice(0, i).reduce((a, b) => a + b, 0));
  const s = buildSchedule({ tops, heights, mainHeight: heights.reduce((a, b) => a + b, 0), viewH: 800 });
  s.chapters.forEach((c, i) => { if (i) { ok(c.moveEnd - c.moveStart <= 800 + 1e-6, 'move never longer than one viewport'); ok(c.moveStart >= s.chapters[i - 1].moveEnd, 'moves never overlap'); } });
  ok(s.warnings.length === 0, `no warnings: ${s.warnings}`);
});
test('schedule: flags chapters that leave no time to read', () => {
  const s = buildSchedule(geo(4, 800, 720)); // 800px chapters in a 720px viewport rest for 80px
  ok(s.warnings.some((w) => w.includes('rests for only')), 'warns about short rests');
  const t = buildSchedule(geo(3, 500, 720));
  ok(t.warnings.some((w) => w.includes('shorter than the viewport')), 'warns when a pin cannot stick');
});
test('schedule: stage layers scroll away before and after the experience', () => {
  const s = buildSchedule({ ...geo(5, 1728, 720), mainTop: 600 });
  near(stageOffset(s, 0), 600, 0, 'pushed down while main is below the fold');
  near(stageOffset(s, 600), 0, 0, 'pinned while the experience runs');
  near(stageOffset(s, 600 + s.range), 0, 0, 'still pinned on the last pixel');
  near(stageOffset(s, 600 + s.range + 200), -200, 0, 'leaves with the last pin');
  near(stageOffset(s, -50), 650, 0, 'follows iOS overscroll');
});
test('schedule: chapterAt picks the chapter being moved into', () => {
  const s = buildSchedule(geo(5, 1728, 720));
  ok(chapterAt(s, 100) === 0 && chapterAt(s, 1500) === 1 && chapterAt(s, 7000) === 4);
});

// ---------------------------------------------------------------- edges
test('edges: ordering preserves the geometry and improves continuity', () => {
  const eg = new THREE.EdgesGeometry(new THREE.TorusGeometry(1, 0.3, 6, 24), 28);
  const raw = Float32Array.from(eg.attributes.position.array);
  const n = raw.length / 6;
  // shuffle to simulate arbitrary mesh order
  const idx = Array.from({ length: n }, (_, i) => i);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  idx.sort(() => rnd() - 0.5);
  const shuffled = new Float32Array(raw.length);
  idx.forEach((s, d) => shuffled.set(raw.subarray(s * 6, s * 6 + 6), d * 6));
  const before = continuityOf(shuffled);
  const res = orderSegments(shuffled);
  ok(res.positions.length === raw.length, 'same segment count');
  const canon = (a) => { const out = []; for (let i = 0; i < a.length; i += 6) { const p = [a.slice(i, i + 3), a.slice(i + 3, i + 6)].map((v) => [...v].map((x) => x.toFixed(4)).join(',')).sort(); out.push(p.join('|')); } return out.sort(); };
  ok(JSON.stringify(canon(res.positions)) === JSON.stringify(canon(raw)), 'identical set of segments, only order and direction changed');
  ok(res.continuity > 0.9 && res.continuity > before + 0.5, `continuity ${before.toFixed(2)} -> ${res.continuity.toFixed(2)}`);
  let len = 0; for (let i = 0; i < raw.length; i += 6) len += Math.hypot(raw[i + 3] - raw[i], raw[i + 4] - raw[i + 1], raw[i + 5] - raw[i + 2]);
  near(res.total, len, 1e-3, 'total length');
});
test('edges: degenerate inputs are safe', () => {
  ok(orderSegments(new Float32Array(0)).total === 0);
  ok(orderSegments(Float32Array.from([0, 0, 0, 1, 0, 0])).chains === 1);
});

// ---------------------------------------------------------------- perf
test('perf: tier picking and the frame monitor', () => {
  ok(pickTier('low') === 2 && pickTier('high') === 0);
  ok(pickTier(null, { cores: 8, memory: 8, coarse: false }) === 0);
  ok(pickTier(null, { cores: 8, memory: 8, coarse: true }) === 1, 'coarse pointer starts on mid, not low');
  ok(pickTier(null, { cores: 2, memory: 8, coarse: false }) === 2);
  let slow = 0;
  const m = createFrameMonitor({ onSlow: () => slow++ });
  for (let i = 0; i < 60; i++) m.update(80);       // warm-up frames are ignored
  ok(slow === 0, 'warm-up ignored');
  for (let i = 0; i < 45; i++) m.update(40);
  ok(slow === 1, 'one downgrade request for a slow window');
  for (let i = 0; i < 100; i++) m.update(40);
  ok(slow === 1, 'cooldown prevents flapping');
  const fast = createFrameMonitor({ onSlow: () => slow++ });
  for (let i = 0; i < 300; i++) fast.update(i % 50 === 0 ? 900 : 16); // stalls are ignored
  ok(slow === 1, 'stalls and fast frames never downgrade');
  ok(TIERS.length === 3);
});

// ---------------------------------------------------------------- ingest
test('ingest: precise bounds beat Box3.setFromObject on rotated parts', () => {
  const g = new THREE.Group();
  // A rotated sphere: its true extent is the diameter, but the AABB of its rotated bounding box is 41% larger.
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), std()); ball.name = 'ball'; ball.rotation.set(0, Math.PI / 4, Math.PI / 4); g.add(ball);
  const loose = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
  const tight = boundsOf(g).size;
  near(tight.x, 2, 0.01, 'precise bounds are the diameter');
  ok(loose.x > 2.5, `loose bounds over-estimate: ${loose.x.toFixed(2)}`);
});
test('ingest: marker geometry never reaches the bounds', () => {
  const g = new THREE.Group();
  g.add(box(2, 2, 2, 'body'));
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), std()); quad.name = 'slot_far'; quad.position.set(100, 0, 0); g.add(quad);
  near(boundsOf(g).maxDim, 2, 1e-6, 'bounds ignore the far marker quad');
});
test('ingest: any object lands centred with its fit dimension equal to the size', () => {
  const g = new THREE.Group();
  g.add(box(10, 4, 2, 'a', 30, 7, -5), box(3, 3, 3, 'b', 36, 7, -5));
  g.scale.setScalar(1); // authoring scale and offset are arbitrary
  const o = prepareObject(g, { size: 2 });
  const b = boundsOf(o.pivot);
  near(b.maxDim, 2, 1e-6, 'max dim'); near(b.box.getCenter(new THREE.Vector3()).length(), 0, 1e-6, 'centre');
});
test('ingest: fit "sphere" keeps every vertex inside the bounding sphere at any rotation', () => {
  const g = new THREE.Group(); g.add(box(1, 1, 1, 'cube'));
  const o = prepareObject(g, { size: 2, fit: 'sphere' });
  const r = boundsOf(o.pivot).radiusFrom(new THREE.Vector3());
  near(r, 1, 1e-6, 'bounding sphere radius == size / 2');
  const o2 = prepareObject(new THREE.Group().add(box(1, 1, 1, 'cube')), { size: 2, fit: 'box' });
  ok(boundsOf(o2.pivot).radiusFrom(new THREE.Vector3()) > 1.5, 'box fit lets a rotated cube overflow its anchor');
});
test('ingest: a quad slot becomes a correctly sized and oriented slot, whatever its authoring orientation', () => {
  const g = new THREE.Group();
  g.add(box(2, 2, 2, 'body'));
  // a 1 x 0.5 quad lying on the +X face, authored facing the wrong way and tilted about the face normal
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), std()); quad.name = 'slot_screen';
  quad.position.set(1.001, 0.2, 0); quad.rotation.set(0, -Math.PI / 2, 0); quad.updateMatrixWorld(true);
  g.add(quad);
  const o = prepareObject(g, { size: 2 });
  const slot = o.slots.screen; ok(slot && !slot.isMesh, 'converted to an Object3D');
  o.pivot.updateMatrixWorld(true);
  const s = slotSize(slot);
  const k = o.normalizeScale;
  // the quad is 1 wide (runs along world Z here) and 0.5 tall (world Y). Horizontal is "right", vertical is world up.
  near(s.w, 1 * k, 1e-5, 'width is the extent along the horizontal in-plane axis');
  near(s.h, 0.5 * k, 1e-5, 'height is the extent along the vertical in-plane axis');
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(slot.matrixWorld);
  near(normal.x, 1, 1e-5, 'faces out of the +X face');
  const p = slot.getWorldPosition(new THREE.Vector3());
  ok(p.x > 1 * k, 'sits in front of the face, so the hole does not z-fight');
  ok(quad.visible === false, 'source quad is hidden');
});
test('ingest: a top-level slot is attached to the nearest part and keeps its world transform', () => {
  const g = new THREE.Group();
  g.add(box(1, 1, 1, 'left', -2, 0, 0), box(1, 1, 1, 'right', 2, 0, 0));
  const slot = new THREE.Object3D(); slot.name = 'slot_screen'; slot.position.set(2.4, 0, 0.55); g.add(slot);
  const o = prepareObject(g, { size: 2 });
  let under = null; for (let a = o.slots.screen; a; a = a.parent) if (o.units.includes(a)) under = a;
  ok(under && under.name === 'right', `slot rides with ${under?.name}`);
  o.pivot.updateMatrixWorld(true);
  const w = o.slots.screen.getWorldPosition(new THREE.Vector3());
  ok(w.x > 0, 'world position preserved on the right side');
});
test('ingest: a top-level slot does not hide the real parts from explode', () => {
  const g = new THREE.Group();
  const wrap = new THREE.Group(); wrap.add(box(1, 1, 1, 'a', -1), box(1, 1, 1, 'b', 1)); g.add(wrap);
  const slot = new THREE.Object3D(); slot.name = 'slot_screen'; g.add(slot);
  const o = prepareObject(g, { size: 2 });
  ok(o.units.length === 2 && o.units.every((u) => !u.name.startsWith('slot_')), `units: ${o.units.map((u) => u.name)}`);
});
test('ingest: axis explode separates layers evenly, outermost travel exactly the distance', () => {
  const g = new THREE.Group();
  const ys = [-1.2, -0.5, 0, 0.3, 1.1];
  ys.forEach((y, i) => g.add(box(2, 0.1, 2, `layer${i}`, 0, y, 0)));
  const o = prepareObject(g, { size: 2, explode: { mode: 'axis', axis: 'y', distance: 1 } });
  applyExplode(o.units, 0.8);
  const dy = o.units.map((u) => u.position.y - u.userData.home.y);
  const sorted = o.units.map((u, i) => [u.userData.home.y, dy[i]]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const k = o.normalizeScale;
  near(Math.abs(sorted[0]) * k, 0.8, 1e-6, 'bottom layer travels the full amount'); near(Math.abs(sorted[4]) * k, 0.8, 1e-6, 'top layer too');
  near(sorted[2], 0, 1e-9, 'middle layer stays');
  ok(sorted.every((v, i) => !i || v > sorted[i - 1]), 'order preserved, every layer separates from its neighbour');
  const gaps = sorted.slice(1).map((v, i) => v - sorted[i]);
  near(Math.max(...gaps), Math.min(...gaps), 1e-9, 'neighbours gain the same extra gap');
});
test('ingest: radial explode moves outer parts furthest, the core stays', () => {
  const g = new THREE.Group();
  // symmetric, so the centre of the whole object is the centre of the core
  g.add(box(2, 2, 2, 'core'), box(0.5, 0.5, 0.5, 'farR', 3, 0, 0), box(0.5, 0.5, 0.5, 'farL', -3, 0, 0), box(0.5, 0.5, 0.5, 'nearR', 1.4, 0, 0), box(0.5, 0.5, 0.5, 'nearL', -1.4, 0, 0));
  const o = prepareObject(g, { size: 2, explode: { mode: 'radial' } });
  applyExplode(o.units, 1);
  const d = Object.fromEntries(o.units.map((u) => [u.name, u.position.distanceTo(u.userData.home)]));
  ok(d.farR > d.nearR && d.nearR > d.core && d.core < 1e-9, JSON.stringify(d));
  near(d.farR, d.farL, 1e-9, 'mirror parts travel equally');
});
test('ingest: a slot defined in code lands where asked, faces out, and rides with its part', () => {
  const g = new THREE.Group();
  g.add(box(2, 2, 2, 'body'), box(0.5, 0.5, 0.5, 'knob', 2, 0, 0));
  const o = prepareObject(g, { size: 2 });
  ok(o.audit.warnings.some((w) => w.code === 'no-slot'), 'starts with no slot');
  const k = o.normalizeScale;
  const slot = addSlot(o, 'screen', { position: [0.4 * k, 0.1, 0], size: [0.6, 0.3], normal: [1, 0, 0], part: 'body' });
  o.pivot.updateMatrixWorld(true);
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(slot.matrixWorld);
  near(normal.x, 1, 1e-9, 'faces +X');
  const s = slotSize(slot);
  near(s.w, 0.6, 1e-9); near(s.h, 0.3, 1e-9);
  near(slot.getWorldPosition(new THREE.Vector3()).x, 0.4 * k + 0.01, 1e-9, 'lifted off the surface');
  ok(slot.parent.name === 'body' && o.slots.screen === slot, 'attached to the named part and registered');
  applyExplode(o.units, 1);
  ok(!auditObject(o).warnings.some((w) => w.code === 'no-slot'), 'audit sees it');
  const free = addSlot(o, 'other', { position: [2 * k, 0, 0], size: [0.1, 0.1] });
  ok(free.parent.name === 'knob', `without a part it picks the nearest: ${free.parent.name}`);
});
test('ingest: audit reports what an agent needs before building', () => {
  const g = new THREE.Group(); g.add(box(1, 1, 1, 'only'));
  const o = prepareObject(g, { size: 2 });
  ok(o.audit.fused && o.audit.warnings.some((w) => w.code === 'fused') && o.audit.warnings.some((w) => w.code === 'no-slot'));
  const sk = new THREE.SkinnedMesh(new THREE.BoxGeometry(), std()); sk.name = 'skin';
  const a = auditObject({ meshes: [sk], units: [sk, sk], slots: { s: {} } });
  ok(a.warnings.some((w) => w.code === 'skinned'));
  const big = auditObject({ meshes: [box(1, 1, 1, 'x')], units: [1, 2], slots: { s: {} } }, { triangles: 5, drawCalls: 1 });
  ok(big.warnings.some((w) => w.code === 'triangles') && big.warnings.some((w) => w.code === 'draw-calls'));
  ok(makeDemoObject() && makeKnotObject());
});

// ---------------------------------------------------------------- looks
test('looks: dissolve end states are clean for every noise setting', () => {
  const mirror = (reveal, sweep, hash, noise) => { const e = reveal * dissolveK(noise) - (sweep + hash * noise); return { gone: e <= 0, tinted: e > 0 && e < DISSOLVE.band }; };
  for (const noise of [0, 0.12, 0.3]) for (let a = 0; a <= 20; a++) for (let b = 0; b < 20; b++) {
    const sweep = a / 20, hash = b / 20;
    ok(mirror(0, sweep, hash, noise).gone, 'reveal 0 discards everything');
    const full = mirror(1, sweep, hash, noise);
    ok(!full.gone && !full.tinted, `reveal 1 shows everything, untinted (noise ${noise}, sweep ${sweep}, hash ${hash})`);
  }
});
test('looks: regression witness, the old constant left accent specks at full reveal', () => {
  ok(1.14 - (1 + 0.12) < DISSOLVE.band, 'K = 1.14 tints the top edge when reveal = 1');
});
test('looks: multi-material meshes keep one patched solid material per group', () => {
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.clearGroups(); geo.addGroup(0, 18, 0); geo.addGroup(18, 18, 1);
  const mats = [std('#ff0000'), std('#00ff00')];
  const mesh = new THREE.Mesh(geo, mats); mesh.name = 'two';
  const g = new THREE.Group(); g.add(mesh);
  const o = prepareObject(g, { size: 2 });
  const looks = createLooks(o.meshes, createTheme(tokens), { pivot: o.pivot });
  const solid = looks.parts[0].solid;
  ok(Array.isArray(solid.material) && solid.material.length === 2 && solid.material.every((m) => typeof m.onBeforeCompile === 'function'), 'patched clone per group');
  ok(!Array.isArray(mesh.material), 'the fill layer is one shared material');
  looks.dispose();
  ok(mesh.material === mats, 'dispose gives the model its own materials back');
});
test('looks: lines stay readable against the fill at every dark value', () => {
  const g = new THREE.Group(); g.add(box(1, 1, 1, 'a'));
  const o = prepareObject(g, { size: 2 });
  const theme = createTheme(tokens);
  const looks = createLooks(o.meshes, theme, { pivot: o.pivot });
  const cam = new THREE.PerspectiveCamera(35, 1.6, 0.1, 100); cam.position.z = 7;
  let worst = Infinity;
  for (let i = 0; i <= 40; i++) {
    looks.apply({ draw: 1, reveal: 0, explode: 0, lines: 1, panel: 0, dark: i / 40 }, o.pivot, cam);
    worst = Math.min(worst, contrast(looks.fillMat.color, looks.parts[0].lineMat.color));
  }
  ok(worst >= 3.9, `lowest line-to-fill contrast ${worst.toFixed(2)}`);
  looks.dispose();
});
test('looks: draw-on staggers parts and finishes together', () => {
  const g = new THREE.Group(); g.add(box(2, 1, 1, 'big'), box(0.3, 0.3, 0.3, 'small', 2, 0, 0), box(0.2, 0.2, 0.2, 'tiny', -2, 0, 0));
  const o = prepareObject(g, { size: 2 });
  const looks = createLooks(o.meshes, createTheme(tokens), { pivot: o.pivot, drawOrder: 'size' });
  const cam = new THREE.PerspectiveCamera(35, 1.6, 0.1, 100); cam.position.z = 7;
  const at = (draw) => { looks.apply({ draw, reveal: 0, explode: 0, lines: 1, panel: 0, dark: 0 }, o.pivot, cam); return looks.parts.map((p) => p.lineMat.dashSize / p.total); };
  ok(at(0).every((v) => v === 0));
  const mid = at(0.5);
  ok(mid[0] > mid[1] && mid[1] > mid[2], `largest part draws first: ${mid.map((v) => v.toFixed(2))}`);
  ok(at(1).every((v) => Math.abs(v - 1) < 1e-9), 'all parts complete at draw = 1');
  looks.dispose();
});
test('looks: silhouette hull goes to smooth parts only, and respects the override', () => {
  const build = (mesh, outline) => { const g = new THREE.Group(); g.add(mesh); const o = prepareObject(g, { size: 2 }); const l = createLooks(o.meshes, createTheme(tokens), { pivot: o.pivot, outline }); const r = l.parts[0]; const out = { hull: !!r.hull, lined: !!r.line, smooth: r.smoothShare }; l.dispose(); return out; };
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), std());
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), std());
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.7, 0.26, 240, 36), std());
  ok(build(sphere, 'auto').hull && !build(sphere, 'auto').lined, 'a sphere has no creases, so the hull carries it');
  ok(!build(cube, 'auto').hull && build(cube, 'auto').lined, 'a cube is all creases, no hull');
  ok(build(knot, 'auto').hull, 'a smooth knot gets a hull');
  ok(!build(sphere, 'never').hull && build(cube, 'always').hull, 'overrides win');
});
test('looks: noisy meshes raise the crease threshold instead of drawing a mesh dump', () => {
  const geo = new THREE.IcosahedronGeometry(1, 6); // already non-indexed, 980 triangles
  const p = geo.attributes.position; let s = 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647 - 0.5;
  const jitter = new Map();
  for (let i = 0; i < p.count; i++) { const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; if (!jitter.has(k)) jitter.set(k, [r() * 0.3, r() * 0.3, r() * 0.3]); const j = jitter.get(k); p.setXYZ(i, p.getX(i) + j[0], p.getY(i) + j[1], p.getZ(i) + j[2]); }
  geo.computeVertexNormals();
  const g = new THREE.Group(); g.add(new THREE.Mesh(geo, std()));
  const o = prepareObject(g, { size: 2 });
  const l = createLooks(o.meshes, createTheme(tokens), { pivot: o.pivot });
  ok(l.parts[0].angle > 28, `threshold raised to ${l.parts[0].angle} degrees`);
  l.dispose();
});

// ---------------------------------------------------------------- layout, register, config
test('contact: the shadow blob projects just below the object, not behind it', () => {
  const cam = new THREE.PerspectiveCamera(35, 1.6, 0.1, 100); cam.position.z = 7; cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const pivot = new THREE.Group(); pivot.position.set(1.2, 0.5, 0); pivot.scale.setScalar(0.6);
  const size = new THREE.Vector3(2, 1.6, 0.6);
  const p = shadowPlacement({ pivot, size, camera: cam });
  const ndc = (x, y, z) => new THREE.Vector3(x, y, z).project(cam);
  const bottom = ndc(pivot.position.x, pivot.position.y - (size.y / 2) * pivot.scale.x, 0);   // object's bottom edge centre
  const blob = ndc(p.x, p.y, p.z);
  ok(blob.y < bottom.y, `blob centre is below the object bottom on screen (${blob.y.toFixed(3)} < ${bottom.y.toFixed(3)})`);
  ok(bottom.y - blob.y < 0.1, 'and close to it, so it reads as contact');
  const half = (cx, w, z) => ndc(cx + w / 2, 0, z).x - ndc(cx - w / 2, 0, z).x;
  const projObj = half(pivot.position.x, size.x * pivot.scale.x, 0);
  near(half(p.x, p.w, p.z) / projObj, 1.15, 1e-6, 'projected width is 1.15 x the object');
  near(ndc(p.x, 0, p.z).x, ndc(pivot.position.x, 0, 0).x, 1e-9, 'centred under the object');
});
test('layout: viewToWorld maps pixels to the object plane and back', () => {
  const cam = new THREE.PerspectiveCamera(35, 1280 / 720, 0.1, 100); cam.position.z = 7; cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const w = viewToWorld(cam, 960, 270, 1280, 720);
  const ndc = new THREE.Vector3(w.x, w.y, 0).project(cam);
  near((ndc.x * 0.5 + 0.5) * 1280, 960, 1e-6, 'x round trip'); near((-ndc.y * 0.5 + 0.5) * 720, 270, 1e-6, 'y round trip');
});
test('register: slot aspect and projection', () => {
  const s = new THREE.Object3D(); s.scale.set(1, 0.62, 1);
  const holder = new THREE.Group(); holder.scale.setScalar(2); holder.add(s); holder.updateMatrixWorld(true);
  near(slotSize(s).aspect, 0.62, 1e-9, 'aspect survives a uniform scale');
  const cam = new THREE.PerspectiveCamera(35, 2, 0.1, 100); cam.position.z = 7; cam.updateMatrixWorld(true);
  const p = projectToScreen(new THREE.Object3D(), cam, 1000, 500);
  near(p.x, 500, 1e-6); near(p.y, 250, 1e-6);
});
test('config: a chapter without a row inherits the previous pose and warns', () => {
  const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  const p = poseFor('unknown', 3, CHAPTERS[2]);
  console.warn = warn;
  ok(warned === 1 && p.rotateY === CHAPTERS[2].rotateY && p.id === 'unknown');
  ok(poseFor('solid', 3, null).reveal === 1, 'known ids resolve to their row');
});

// ---------------------------------------------------------------- run
const only = process.argv[2];
for (const [name, fn] of tests) {
  if (only && !name.includes(only)) continue;
  try { fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { failures.push(name); console.log(`  FAIL ${name}\n       ${e.message}`); }
}
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);

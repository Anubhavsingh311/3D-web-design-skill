#!/usr/bin/env node
// Pre-flight audit of a .glb or .gltf. No dependencies: it reads the glTF JSON and the image headers
// directly, so it works before anything is installed and it never needs a GPU or a DOM.
//
//   node inspect-model.mjs model.glb [--json] [--against original.glb]
//
// Answers the questions that decide whether the scroll experience will work, BEFORE writing code:
//   Will explode work (separate parts) or is the model one fused mesh?
//   Is there a slot_* marker for the DOM panel, and is it an Empty or a quad?
//   Does it fit the triangle, draw call and GPU memory budgets on desktop and on a phone?
//   Anything the sketch layers cannot handle (skins, instancing, morph targets)?
// The runtime repeats the structural checks on the loaded scene (window.__stage.audit) and is the
// authority. This tool exists so the surprises arrive early.
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
const asJson = process.argv.includes('--json');
const againstIdx = process.argv.indexOf('--against');
if (!file || !fs.existsSync(file)) { console.error('usage: node inspect-model.mjs model.glb [--json] [--against original.glb]'); process.exit(2); }

const BUDGETS = { desktop: { triangles: 300000, drawCalls: 300, modelMB: 5 }, mobile: { triangles: 100000, drawCalls: 120, modelMB: 3 } };
function analyze(file) {
const buf = fs.readFileSync(file);
let json;
let bin = null;
if (buf.readUInt32LE(0) === 0x46546c67) { // 'glTF'
  let o = 12;
  while (o < buf.length) {
    const len = buf.readUInt32LE(o); const type = buf.readUInt32LE(o + 4);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8')); else if (type === 0x004e4942) bin = data;
    o += 8 + len + ((4 - (len % 4)) % 4);
  }
} else json = JSON.parse(buf.toString('utf8'));
if (!json) { console.error('not a glTF file'); process.exit(2); }

const dirOf = path.dirname(file);
const loadUri = (uri) => (uri.startsWith('data:') ? Buffer.from(uri.split(',')[1], 'base64') : fs.readFileSync(path.join(dirOf, decodeURIComponent(uri))));
const buffers = (json.buffers || []).map((b, i) => (i === 0 && bin ? bin : b.uri ? loadUri(b.uri) : null));
const accessors = json.accessors || [], meshes = json.meshes || [], nodes = json.nodes || [], materials = json.materials || [];
const used = new Set(json.extensionsUsed || []);

// ---- images: dimensions from the headers, no decoding ------------------------------------------
function imageBytes(img) {
  if (img.bufferView !== undefined) { const v = json.bufferViews[img.bufferView]; return buffers[v.buffer]?.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength); }
  return img.uri ? loadUri(img.uri) : null;
}
function dims(b, mime) {
  if (!b || b.length < 32) return null;
  if (b[0] === 0x89 && b[1] === 0x50) return { fmt: 'png', w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let o = 2; o < b.length - 9;) { if (b[o] !== 0xff) { o++; continue; } const m = b[o + 1]; if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { fmt: 'jpeg', h: b.readUInt16BE(o + 5), w: b.readUInt16BE(o + 7) }; o += 2 + b.readUInt16BE(o + 2); }
  }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const k = b.toString('ascii', 12, 16);
    if (k === 'VP8X') return { fmt: 'webp', w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (k === 'VP8 ') return { fmt: 'webp', w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (k === 'VP8L') { const v = b.readUInt32LE(21); return { fmt: 'webp', w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
  }
  if (b[0] === 0xab && b.toString('ascii', 1, 5) === 'KTX ') return { fmt: 'ktx2', w: b.readUInt32LE(20), h: b.readUInt32LE(24) };
  return { fmt: mime || 'unknown', w: 0, h: 0 };
}
const images = (json.images || []).map((img, i) => {
  const b = imageBytes(img); const d = dims(b, img.mimeType) || { fmt: 'unknown', w: 0, h: 0 };
  const compressed = d.fmt === 'ktx2';
  return { index: i, ...d, bytes: b ? b.length : 0, vramMB: (d.w * d.h * (compressed ? 1 : 4) * 1.33) / 1048576 };
});

// ---- geometry ----------------------------------------------------------------------------------
const primTris = (p) => {
  const mode = p.mode ?? 4; const cnt = p.indices !== undefined ? accessors[p.indices].count : accessors[p.attributes.POSITION].count;
  return mode === 4 ? cnt / 3 : mode === 5 || mode === 6 ? Math.max(0, cnt - 2) : 0;
};
const meshInfo = meshes.map((m) => ({ name: m.name, prims: m.primitives.length, tris: m.primitives.reduce((s, p) => s + primTris(p), 0), morph: m.primitives.some((p) => p.targets?.length), nonTri: m.primitives.some((p) => (p.mode ?? 4) < 4), mats: new Set(m.primitives.map((p) => p.material)).size }));
const sceneRoots = (json.scenes?.[json.scene ?? 0]?.nodes) || [];
const isMarker = (n) => /^(slot_|anchor_)/.test(n.name || '');
const hasMesh = (i) => nodes[i].mesh !== undefined || (nodes[i].children || []).some(hasMesh);
const nodeTris = (i) => (nodes[i].mesh !== undefined ? meshInfo[nodes[i].mesh].tris : 0) + (nodes[i].children || []).reduce((s, c) => s + nodeTris(c), 0);

let instances = 0, totalTris = 0, drawables = 0;
const walkAll = (i) => { const n = nodes[i]; if (n.mesh !== undefined && !isMarker(n)) { instances++; totalTris += meshInfo[n.mesh].tris; drawables += meshInfo[n.mesh].prims; } (n.children || []).forEach(walkAll); };
sceneRoots.forEach(walkAll);

// Explode units, the way the runtime finds them: descend through single-child wrappers.
const kidsOf = (list) => list.filter((i) => !isMarker(nodes[i]) && hasMesh(i));
const isMeshLeaf = (i) => nodes[i].mesh !== undefined && meshes[nodes[i].mesh].primitives.length === 1;
let level = kidsOf(sceneRoots);
while (level.length === 1 && !isMeshLeaf(level[0])) level = kidsOf(nodes[level[0]].children || []);
const units = level.map((i) => ({ name: nodes[i].name || `node${i}`, tris: Math.round(nodeTris(i)) }));

// ---- markers -----------------------------------------------------------------------------------
const markers = [];
nodes.forEach((n, i) => { if (isMarker(n)) markers.push({ name: n.name, kind: n.mesh !== undefined ? 'quad mesh (auto-converted)' : 'empty', scale: n.scale, rotation: n.rotation }); });

// ---- findings ----------------------------------------------------------------------------------
const findings = [];
const add = (level, code, msg, fix) => findings.push({ level, code, msg, fix });
const slotCount = markers.filter((m) => m.name.startsWith('slot_')).length;
if (units.length < 2) add('warn', 'fused', `Explode needs separate parts. Found ${units.length} unit(s).`, 'Split the model by part or material in the source file, or drop the explode chapter.');
if (!slotCount) add('info', 'no-slot', 'No slot_* marker. A DOM panel on the object needs one.', 'Add an Empty or a flat quad named slot_screen on the surface (see references/02).');
if ((json.skins || []).length) add('warn', 'skinned', `${json.skins.length} skin(s). Sketch and dissolve use the bind pose.`, 'Bake the pose you want in the source file.');
if (used.has('EXT_mesh_gpu_instancing')) add('warn', 'instanced', 'GPU instancing is used. The sketch layers do not support instancing.', 'Apply instances in the source file or run gltf-transform unpartition / dedup carefully.');
if (meshInfo.some((m) => m.morph)) add('info', 'morph', 'Morph targets present. Edge lines use the base shape.', null);
if (meshInfo.some((m) => m.nonTri)) add('warn', 'non-triangles', 'Lines or points primitives found. Only triangle meshes are sketched.', null);
const blend = materials.filter((m) => m.alphaMode === 'BLEND').length;
if (blend) add('info', 'transparent', `${blend} transparent material(s). Check render order against the fill layer early.`, null);
if (used.has('KHR_materials_pbrSpecularGlossiness')) add('warn', 'spec-gloss', 'Specular-glossiness materials are not supported by current three.', 'Convert to metallic-roughness: gltf-transform metalrough in.glb out.glb');
const sizeMB = buf.length / 1048576;
for (const [name, b] of Object.entries(BUDGETS)) {
  if (totalTris > b.triangles) add('warn', `triangles-${name}`, `${Math.round(totalTris)} triangles exceeds the ${name} budget of ${b.triangles}.`, 'gltf-transform simplify in.glb out.glb --ratio 0.5 --error 0.001');
  if (drawables * 3 > b.drawCalls) add('warn', `draw-calls-${name}`, `${drawables} drawable primitives is about ${drawables * 3} draw calls, ${name} budget ${b.drawCalls}.`, 'Merge small meshes: gltf-transform join in.glb out.glb');
  if (sizeMB > b.modelMB) add(name === 'mobile' ? 'warn' : 'info', `size-${name}`, `File is ${sizeMB.toFixed(1)} MB, ${name} budget ${b.modelMB} MB.`, 'gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress webp --texture-size 2048');
}
const vram = images.reduce((s, i) => s + i.vramMB, 0);
if (vram > 160) add('warn', 'vram', `Textures need about ${Math.round(vram)} MB of GPU memory.`, 'Cap textures at 2048 (1024 for mobile) or use KTX2: gltf-transform optimize ... --texture-size 2048');
if (images.some((i) => Math.max(i.w, i.h) > 2048)) add('warn', 'texture-size', 'A texture is larger than 2048 px.', 'gltf-transform resize in.glb out.glb --width 2048 --height 2048');
if (!used.has('EXT_meshopt_compression') && !used.has('KHR_draco_mesh_compression') && sizeMB > 1) add('info', 'uncompressed', 'Geometry is not compressed.', 'gltf-transform optimize in.glb out.glb --compress meshopt');
if (images.some((i) => i.fmt === 'png' && i.bytes > 600000)) add('info', 'png-weight', 'Large PNG textures found. WebP is typically 3 to 5 times smaller.', 'gltf-transform webp in.glb out.glb');
if (used.has('KHR_draco_mesh_compression') || used.has('KHR_texture_basisu')) add('info', 'decoder', 'Draco or KTX2 is used: fine for normal builds, NOT available in build:single mode. Meshopt works everywhere.', null);

const report = {
  file: path.basename(file), sizeMB: +sizeMB.toFixed(2), generator: json.asset?.generator || null,
  extensionsUsed: [...used], extensionsRequired: json.extensionsRequired || [],
  counts: { nodes: nodes.length, meshes: meshes.length, primitives: meshInfo.reduce((s, m) => s + m.prims, 0), materials: materials.length, textures: (json.textures || []).length, images: images.length, skins: (json.skins || []).length, animations: (json.animations || []).length, cameras: (json.cameras || []).length },
  triangles: Math.round(totalTris), drawablePrimitives: drawables, meshInstances: instances, vramMB: Math.round(vram),
  images, units, markers, findings,
  explode: units.length >= 2 ? 'possible' : 'not possible (one unit)',
  verdict: findings.some((f) => f.level === 'warn') ? 'needs attention' : 'ready',
};
return report;
}
const report = analyze(file);


// ---- compare with the file this one was made from -----------------------------------------------
// `gltf-transform optimize` with default flags JOINS meshes (explode loses its parts), prunes empty
// nodes (slot and anchor Empties vanish) and can turn repeated meshes into GPU instances. Run this after
// every optimise to catch it.
let diff = null;
if (againstIdx > 0 && process.argv[againstIdx + 1]) {
  const base = analyze(process.argv[againstIdx + 1]);
  const names = (a) => a.map((u) => u.name);
  const lostUnits = names(base.units).filter((n) => !names(report.units).includes(n));
  const lostMarkers = base.markers.map((m) => m.name).filter((n) => !report.markers.some((m) => m.name === n));
  diff = { unitsBefore: base.units.length, unitsAfter: report.units.length, lostUnits, lostMarkers, trianglesBefore: base.triangles, trianglesAfter: report.triangles, sizeBeforeMB: base.sizeMB, sizeAfterMB: report.sizeMB, instancingAdded: report.extensionsUsed.includes('EXT_mesh_gpu_instancing') && !base.extensionsUsed.includes('EXT_mesh_gpu_instancing') };
  diff.ok = !lostMarkers.length && report.units.length >= base.units.length && !diff.instancingAdded;
  report.against = diff;
}

if (asJson) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

const line = (s = '') => console.log(s);
line(`${report.file}   ${report.sizeMB} MB   ${report.generator || 'unknown generator'}`);
line(`nodes ${report.counts.nodes}, meshes ${report.counts.meshes}, primitives ${report.counts.primitives}, materials ${report.counts.materials}, images ${report.counts.images}, skins ${report.counts.skins}, animations ${report.counts.animations}`);
line(`triangles ${report.triangles}   drawable primitives ${report.drawablePrimitives}   texture memory ~${report.vramMB} MB`);
line(`extensions: ${report.extensionsUsed.join(', ') || 'none'}`);
if (report.images.length) line(`textures: ${report.images.map((i) => `${i.w}x${i.h} ${i.fmt}`).join(', ')}`);
line(`\nexplode units (${report.units.length}): ${report.units.map((u) => `${u.name} (${u.tris})`).join(', ') || 'none'}   -> explode ${report.explode}`);
line(`markers: ${report.markers.map((m) => `${m.name} [${m.kind}]`).join(', ') || 'none'}`);
line(`\n${report.verdict.toUpperCase()}`);
for (const f of report.findings) { line(`  ${f.level === 'warn' ? '!' : '-'} ${f.code}: ${f.msg}`); if (f.fix) line(`      fix: ${f.fix}`); }
if (!report.findings.length) line('  no findings');

if (diff) {
  line(`\nCOMPARED WITH ${path.basename(process.argv[againstIdx + 1])}: ${diff.ok ? 'structure preserved' : 'STRUCTURE LOST'}`);
  line(`  explode units ${diff.unitsBefore} -> ${diff.unitsAfter}${diff.lostUnits.length ? `  (gone: ${diff.lostUnits.join(', ')})` : ''}`);
  line(`  markers lost: ${diff.lostMarkers.join(', ') || 'none'}`);
  line(`  triangles ${diff.trianglesBefore} -> ${diff.trianglesAfter}, size ${diff.sizeBeforeMB} MB -> ${diff.sizeAfterMB} MB`);
  if (diff.instancingAdded) line('  ! GPU instancing was introduced. Re-run optimize with --instance false.');
  if (!diff.ok) line('  fix: gltf-transform optimize in.glb out.glb --compress meshopt --join false --simplify false --instance false\n       add --flatten false --prune false as well if the markers are Empties (quad markers survive without them)');
}

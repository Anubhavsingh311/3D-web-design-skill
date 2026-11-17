#!/usr/bin/env node
// Regenerates assets/fixtures/*.glb with three's GLTFExporter, so the GLB code path can be tested
// without a Blender install. Needs the starter's node_modules (three).
//   node make-fixtures.mjs [--starter ../assets/starter] [--out ../assets/fixtures]
//
//   machine.glb        the demo object: 7 parts, slot_screen as an Empty with scale
//   machine-quad.glb   same, but slot_screen is a flat quad authored facing the WRONG way
//   stack.glb          five flat layers (a phone-like sandwich) for explode mode "axis", slot on the top layer
//   knot.glb           one fused smooth mesh: silhouette lines yes, explode impossible
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const starter = path.resolve(args.starter || path.join(here, '../assets/starter'));
const outDir = path.resolve(args.out || path.join(here, '../assets/fixtures'));
const imp = (rel) => import(pathToFileURL(path.join(starter, 'node_modules', rel)).href);
const THREE = await imp('three/build/three.module.js');
const { GLTFExporter } = await imp('three/examples/jsm/exporters/GLTFExporter.js');
const { makeDemoObject, makeKnotObject } = await import(pathToFileURL(path.join(starter, 'src/ingest.js')).href);

// GLTFExporter reads blobs with FileReader, which Node does not have.
globalThis.FileReader = class {
  readAsArrayBuffer(b) { b.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); }); }
  readAsDataURL(b) { b.arrayBuffer().then((r) => { this.result = `data:${b.type};base64,${Buffer.from(r).toString('base64')}`; this.onloadend?.(); }); }
};

async function write(name, root) {
  const buf = await new Promise((res, rej) => new GLTFExporter().parse(root, res, rej, { binary: true }));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, name), Buffer.from(buf));
  console.log(`${name}  ${(buf.byteLength / 1024).toFixed(1)} KB`);
}
const std = (c, m = 0.25, r = 0.45) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r });
const box = (w, h, d, name, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.name = name; m.position.set(x, y, z); return m; };

await write('machine.glb', makeDemoObject());

const quadScene = makeDemoObject();
const body = quadScene.getObjectByName('body');
const empty = body.getObjectByName('slot_screen');
const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), std('#ffffff'));
quad.name = 'slot_screen';
quad.position.copy(empty.position);
quad.scale.set(empty.scale.x, empty.scale.y, 1);
quad.rotation.y = Math.PI; // normal points INTO the body: the converter must flip it
body.remove(empty);
body.add(quad);
await write('machine-quad.glb', quadScene);

const stack = new THREE.Group();
stack.name = 'stack';
stack.add(
  box(1.0, 2.0, 0.03, 'glass', 0, 0, 0.18, std('#9fb4c7', 0.1, 0.1)),
  box(0.96, 1.96, 0.02, 'display', 0, 0, 0.14, std('#1b1f26', 0.2, 0.3)),
  box(0.9, 1.8, 0.04, 'board', 0, 0, 0.06, std('#2f7d4f', 0.2, 0.5)),
  box(0.7, 1.2, 0.08, 'battery', 0, -0.2, -0.02, std('#c9ced4', 0.6, 0.35)),
  box(1.0, 2.0, 0.05, 'back', 0, 0, -0.1, std('#5d636b', 0.5, 0.4)),
);
const slot = new THREE.Object3D();
slot.name = 'slot_screen';
slot.position.set(0, 0, 0.196);
slot.scale.set(0.8, 1.6, 1);
stack.getObjectByName('glass').add(slot);
await write('stack.glb', stack);

await write('knot.glb', makeKnotObject());

import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

// Pins a real DOM element (HTML or SVG) onto a surface of the 3D object.
//
// How it works, in three layers (back to front):
//   1. CSS3DRenderer layer   the panel, transformed by the SAME camera as WebGL.
//   2. WebGL canvas          transparent. A plane on the slot uses NoBlending + opacity 0, which
//                            overwrites the pixels with transparent ones, so the panel behind shows
//                            through exactly there. Anything nearer than the plane still occludes it.
//   3. Page text
//
// Slot convention: an Object3D whose local unit plane (1 x 1, facing +Z) is the panel area.
export function createSlotBinder({ mount, slot, panel, width, height }) {
  // Remember where the panel lived, so dispose() can give it back. Without this, a remount
  // (HMR, React StrictMode, SPA route change) finds the panel gone.
  const home = { parent: panel.parentNode, next: panel.nextSibling, style: panel.getAttribute('style') };

  const cssRenderer = new CSS3DRenderer();
  cssRenderer.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  mount.appendChild(cssRenderer.domElement);

  const cssScene = new THREE.Scene();
  const cssObject = new CSS3DObject(panel);
  panel.style.userSelect = ''; // CSS3DObject disables selection. The panel is real text, keep it selectable.
  cssScene.add(cssObject);

  const hole = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, transparent: true, blending: THREE.NoBlending, side: THREE.DoubleSide })
  );
  hole.name = 'slot_hole';
  slot.add(hole);

  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  let shown = null;

  // visible: 0..1 from the timeline.
  function update(visible) {
    const on = visible > 0.01;
    if (on !== shown) {
      shown = on;
      hole.visible = on;
      panel.style.visibility = on ? 'visible' : 'hidden';
      panel.setAttribute('aria-hidden', on ? 'false' : 'true');
    }
    if (!on) return;
    panel.style.opacity = String(visible);
    slot.updateWorldMatrix(true, false);
    slot.matrixWorld.decompose(p, q, s);
    cssObject.position.copy(p);
    cssObject.quaternion.copy(q);
    // 1 world unit = 1 CSS px inside CSS3DRenderer, so scale by (world size / intrinsic px size)
    cssObject.scale.set(s.x / width, s.y / height, 1);
  }

  const resize = (w, h) => cssRenderer.setSize(w, h);
  const render = (camera) => cssRenderer.render(cssScene, camera);

  // Panels are not clickable by default (main sits above the CSS layer). To make one clickable, also set
  // `main { pointer-events: none } main .copy, main a { pointer-events: auto }` in CSS.
  function setInteractive(on) {
    cssRenderer.domElement.style.pointerEvents = on ? 'auto' : 'none';
  }

  function dispose() {
    slot.remove(hole);
    hole.geometry.dispose();
    hole.material.dispose();
    cssScene.remove(cssObject);
    if (home.style === null) panel.removeAttribute('style'); else panel.setAttribute('style', home.style);
    panel.removeAttribute('aria-hidden');
    if (home.parent) home.parent.insertBefore(panel, home.next);
    cssRenderer.domElement.remove();
  }

  return { update, resize, render, dispose, setInteractive, cssScene, cssObject, hole };
}

// Label that follows a 3D point (no perspective warp): the cheap alternative to a full panel.
export function projectToScreen(object3d, camera, viewW, viewH, out = new THREE.Vector3()) {
  object3d.getWorldPosition(out).project(camera);
  return { x: (out.x * 0.5 + 0.5) * viewW, y: (-out.y * 0.5 + 0.5) * viewH, behind: out.z > 1 };
}

// World size of a slot at the identity pose, as width and height. Used to give the panel the slot's aspect.
export function slotSize(slot) {
  slot.updateWorldMatrix(true, false);
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  slot.matrixWorld.decompose(p, q, s);
  return { w: s.x, h: s.y, aspect: s.y / s.x };
}

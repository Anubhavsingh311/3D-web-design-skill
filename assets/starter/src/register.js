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
  const cssRenderer = new CSS3DRenderer();
  cssRenderer.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  mount.appendChild(cssRenderer.domElement);

  const cssScene = new THREE.Scene();
  const cssObject = new CSS3DObject(panel);
  cssScene.add(cssObject);

  const hole = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      opacity: 0,
      transparent: true,
      blending: THREE.NoBlending,
      side: THREE.DoubleSide,
    })
  );
  hole.name = 'slot_hole';
  slot.add(hole);

  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();

  // visible: 0..1 from the timeline. Below ~0 the whole path is skipped.
  function update(visible) {
    const on = visible > 0.01;
    hole.visible = on;
    panel.style.visibility = on ? 'visible' : 'hidden';
    panel.style.opacity = String(visible);
    if (!on) return;
    slot.updateWorldMatrix(true, false);
    slot.matrixWorld.decompose(p, q, s);
    cssObject.position.copy(p);
    cssObject.quaternion.copy(q);
    // 1 world unit = 1 CSS px inside CSS3DRenderer, so scale by (world size / intrinsic px size)
    cssObject.scale.set(s.x / width, s.y / height, 1);
  }

  function resize(w, h) {
    cssRenderer.setSize(w, h);
  }

  function render(camera) {
    cssRenderer.render(cssScene, camera);
  }

  function dispose() {
    slot.remove(hole);
    hole.geometry.dispose();
    hole.material.dispose();
    cssRenderer.domElement.remove();
  }

  return { update, resize, render, dispose, cssScene, cssObject, hole };
}

// Label that follows a 3D point (no perspective warp): the cheap alternative to a full panel.
export function projectToScreen(object3d, camera, viewW, viewH, out = new THREE.Vector3()) {
  object3d.getWorldPosition(out).project(camera);
  return { x: (out.x * 0.5 + 0.5) * viewW, y: (-out.y * 0.5 + 0.5) * viewH, behind: out.z > 1 };
}

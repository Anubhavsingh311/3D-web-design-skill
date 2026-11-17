import * as THREE from 'three';

// The one visual agreement that ties the object to the page. Pick exactly one.
//   grain   a fixed noise overlay above canvas and page, so both share texture. Always valid. (CSS only)
//   shadow  a soft blob under the object. Only for layouts where the object plausibly rests on something.
//   none    no cue. Use when the page supplies its own (a baseline rule, a plinth in the layout).
// Where the blob goes, as pure math. The blob sits BEHIND the object (so the object always covers it) but must
// PROJECT just below the object's bottom edge. Anything farther from the camera shrinks toward the screen
// centre, so its world position and size are scaled up by the same perspective factor. Without this the blob
// projects up behind the object and is never visible (this was a real bug: no pixel changed).
export function shadowPlacement({ pivot, size, camera, z = -0.8, gap = 0.04, widen = 1.15 }) {
  const k = pivot.scale.x;
  const d0 = camera.position.z;                 // distance to the object plane
  const s = (d0 - z) / d0;                      // perspective factor for the blob plane
  const w = Math.max(size.x, size.z) * k * widen * s;
  return { x: pivot.position.x * s, y: (pivot.position.y - (size.y / 2) * k - gap) * s, z, w, h: w * 0.2 };
}

export function createContact(kind, { scene, theme, size }) {
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  if (kind === 'grain') {
    root?.classList.add('contact-grain');
    return { update() {}, dispose() { root?.classList.remove('contact-grain'); } };
  }
  if (kind !== 'shadow' || typeof document === 'undefined') return { update() {}, dispose() {} };

  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.22 });
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  blob.name = 'contact_shadow';
  blob.renderOrder = -1;
  scene.add(blob);
  const tmp = { bg: new THREE.Color(), fg: new THREE.Color() };

  // `size` is the object's bounding size in pivot space at rest.
  return {
    update(pivot, state, camera) {
      const p = shadowPlacement({ pivot, size, camera });
      blob.scale.set(p.w, p.h, 1);
      blob.position.set(p.x, p.y, p.z);
      theme.at(state.dark, tmp);
      mat.color.copy(tmp.fg).lerp(tmp.bg, 0.2);
      mat.opacity = 0.3 * (1 - 0.8 * state.dark) * Math.min(1, 1 - state.explode * 0.6);
    },
    dispose() { scene.remove(blob); blob.geometry.dispose(); mat.dispose(); map.dispose(); },
  };
}

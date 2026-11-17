import * as THREE from 'three';

// `?debug` shows a HUD, anchor outlines and a crosshair on the projected object centre.
// `?verify` (used by scripts/verify.mjs) is deterministic: strict scroll sync, no idle motion, no tier
// changes. Both expose window.__stage. Neither is on in normal visits, so production behaviour is unchanged.
export function mountDebug({ api, flags, signal }) {
  if (!flags.debug && !flags.verify) return { dispose() {} };
  window.__stage = api;
  const root = document.documentElement;
  if (flags.verify) root.classList.add('verify');
  if (!flags.debug) return { dispose() { delete window.__stage; root.classList.remove('verify'); } };

  root.classList.add('debug');
  // Axes on every slot: red = right, green = up, BLUE = the way the panel faces. Blue must point out of the surface.
  const axes = Object.values(api.obj.slots).map((slot) => { const h = new THREE.AxesHelper(0.5); h.name = 'slot_axes'; slot.add(h); return h; });
  const hud = document.createElement('pre');
  hud.id = 'stage-hud';
  const cross = document.createElement('div');
  cross.id = 'stage-cross';
  document.body.append(hud, cross);

  let frames = 0;
  let t0 = performance.now();
  let fps = 0;
  const id = setInterval(() => {
    const now = performance.now();
    fps = ((api.frames - frames) * 1000) / (now - t0);
    frames = api.frames;
    t0 = now;
    const s = api.state;
    const info = api.renderer.info.render;
    const a = api.audit;
    hud.textContent = [
      `fps ${fps.toFixed(0)}   tier ${api.tier()}   mode ${api.mode}`,
      `scroll ${Math.round(scrollY)} / ${Math.round(api.schedule.range)}`,
      `draw ${s.draw.toFixed(2)}  reveal ${s.reveal.toFixed(2)}  explode ${s.explode.toFixed(2)}`,
      `lines ${s.lines.toFixed(2)}  panel ${s.panel.toFixed(2)}  dark ${s.dark.toFixed(2)}`,
      `calls ${info.calls}  tris ${info.triangles}  parts ${a.units}  meshes ${a.meshes}`,
      ...a.warnings.map((w) => `! ${w.code}`),
    ].join('\n');
    const p = api.project();
    cross.style.transform = `translate(${p.x}px, ${p.y}px)`;
  }, 250);
  signal?.addEventListener('abort', () => clearInterval(id));

  return {
    dispose() {
      clearInterval(id);
      hud.remove();
      cross.remove();
      axes.forEach((h) => { h.parent?.remove(h); h.dispose?.(); });
      root.classList.remove('debug', 'verify');
      delete window.__stage;
    },
  };
}

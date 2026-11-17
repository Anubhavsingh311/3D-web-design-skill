// Quality tiers and a frame-time monitor. Pure, so they can be unit tested. The starter wires them in experience.js.

export const TIERS = [
  { name: 'high', dpr: 2, env: true, parallax: true },
  { name: 'mid', dpr: 1.5, env: true, parallax: false },
  { name: 'low', dpr: 1, env: false, parallax: false },
];

// Budgets that audit() and the docs refer to.
export const BUDGETS = {
  desktop: { triangles: 300000, drawCalls: 300, modelMB: 5 },
  mobile: { triangles: 100000, drawCalls: 120, modelMB: 3 },
};

// Initial tier from cheap signals. The frame monitor corrects it at runtime, so this only has to be
// roughly right. Phones are not automatically low: current ones are fast.
export function pickTier(override, env = {}) {
  const idx = (n) => TIERS.findIndex((t) => t.name === n);
  if (override && idx(override) >= 0) return idx(override);
  const cores = env.cores ?? (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 8) ?? 8;
  const mem = env.memory ?? (typeof navigator !== 'undefined' ? navigator.deviceMemory : 8) ?? 8;
  const coarse = env.coarse ?? (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
  if (cores <= 2 || mem <= 2) return 2;
  if (cores <= 4 || mem <= 4 || coarse) return 1;
  return 0;
}

// Watches frame deltas (ms). When most frames in a window are slow it asks for one tier down, then
// waits a cooldown so it cannot flap. Stalls (tab switch, long task) are ignored.
export function createFrameMonitor({ windowSize = 45, slowMs = 26, slowShare = 0.6, stallMs = 250, cooldownFrames = 120, warmupFrames = 60, onSlow } = {}) {
  let seen = 0;
  let cool = 0;
  let slow = 0;
  let count = 0;
  return {
    update(dt) {
      seen++;
      if (seen <= warmupFrames || dt > stallMs) return; // shader compiles and stalls are not steady state
      if (cool > 0) { cool--; return; }
      count++;
      if (dt > slowMs) slow++;
      if (count >= windowSize) {
        const share = slow / count;
        count = 0;
        slow = 0;
        if (share >= slowShare) { cool = cooldownFrames; onSlow?.(share); }
      }
    },
  };
}

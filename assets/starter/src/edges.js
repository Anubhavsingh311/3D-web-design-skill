// Edge ordering for the draw-on effect.
//
// A growing dash reveals segments in index order. EdgesGeometry emits them in face-adjacency order,
// which on real models looks like scattered specks. Chaining connected segments into polylines and
// visiting the polylines nearest-first makes the reveal read as one pen moving over the object.
//
// Input: Float32Array of segments, 6 floats each (x0 y0 z0 x1 y1 z1).
// Output: { positions, total, chains, continuity }
//   total       summed segment length (the dash length that reveals everything)
//   continuity  share of consecutive segments that touch end to start (1 = one unbroken stroke)
export function orderSegments(pos, { axis = [0, 1, 0], maxChainsForGreedy = 5000 } = {}) {
  const n = Math.floor(pos.length / 6);
  const len = (i) => Math.hypot(pos[i * 6 + 3] - pos[i * 6], pos[i * 6 + 4] - pos[i * 6 + 1], pos[i * 6 + 5] - pos[i * 6 + 2]);
  if (n < 3) {
    let t = 0;
    for (let i = 0; i < n; i++) t += len(i);
    return { positions: Float32Array.from(pos), total: t, chains: n, continuity: 1 };
  }

  // Quantise endpoints so shared vertices compare equal despite float noise.
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos[i + k]); hi[k] = Math.max(hi[k], pos[i + k]); }
  const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
  const q = 1 / (diag * 1e-5);
  const key = (o) => `${Math.round(pos[o] * q)}_${Math.round(pos[o + 1] * q)}_${Math.round(pos[o + 2] * q)}`;

  const ka = new Array(n);
  const kb = new Array(n);
  const adj = new Map();
  const link = (k, i) => { const a = adj.get(k); if (a) a.push(i); else adj.set(k, [i]); };
  for (let i = 0; i < n; i++) { ka[i] = key(i * 6); kb[i] = key(i * 6 + 3); link(ka[i], i); link(kb[i], i); }

  const used = new Uint8Array(n);
  const take = (k) => {
    const a = adj.get(k);
    while (a && a.length) { const j = a.pop(); if (!used[j]) return j; }
    return -1;
  };
  const proj = (i) => {
    const o = i * 6;
    return ((pos[o] + pos[o + 3]) * axis[0] + (pos[o + 1] + pos[o + 4]) * axis[1] + (pos[o + 2] + pos[o + 5]) * axis[2]) / 2;
  };

  // Walk each seed forward and backward until the polyline ends. Seeds go lowest first along `axis`.
  const seeds = Array.from({ length: n }, (_, i) => i).sort((a, b) => proj(a) - proj(b));
  const chains = []; // each chain: array of [segmentIndex, flipped]
  for (const s of seeds) {
    if (used[s]) continue;
    used[s] = 1;
    const fwd = [[s, false]];
    for (let k = kb[s]; ;) {
      const j = take(k);
      if (j < 0) break;
      used[j] = 1;
      if (ka[j] === k) { fwd.push([j, false]); k = kb[j]; } else { fwd.push([j, true]); k = ka[j]; }
    }
    const back = [];
    for (let k = ka[s]; ;) {
      const j = take(k);
      if (j < 0) break;
      used[j] = 1;
      if (kb[j] === k) { back.push([j, false]); k = ka[j]; } else { back.push([j, true]); k = kb[j]; }
    }
    back.reverse();
    chains.push(back.concat(fwd));
  }

  const startOf = (ch) => { const [i, f] = ch[0]; const o = i * 6 + (f ? 3 : 0); return [pos[o], pos[o + 1], pos[o + 2]]; };
  const endOf = (ch) => { const [i, f] = ch[ch.length - 1]; const o = i * 6 + (f ? 0 : 3); return [pos[o], pos[o + 1], pos[o + 2]]; };
  const reverse = (ch) => ch.slice().reverse().map(([i, f]) => [i, !f]);
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const dot = (p) => p[0] * axis[0] + p[1] * axis[1] + p[2] * axis[2];

  let ordered;
  if (chains.length <= maxChainsForGreedy) {
    // Start at the chain end with the lowest projection, then always jump to the nearest chain end.
    const left = chains.map((ch) => ({ ch, a: startOf(ch), b: endOf(ch) }));
    let first = 0;
    let firstLow = Infinity;
    left.forEach((c, i) => { const v = Math.min(dot(c.a), dot(c.b)); if (v < firstLow) { firstLow = v; first = i; } });
    const cur = left.splice(first, 1)[0];
    ordered = [dot(cur.a) <= dot(cur.b) ? cur.ch : reverse(cur.ch)];
    let tip = endOf(ordered[0]);
    while (left.length) {
      let bi = 0;
      let bd = Infinity;
      let bRev = false;
      for (let i = 0; i < left.length; i++) {
        const da = d2(tip, left[i].a);
        const db = d2(tip, left[i].b);
        if (da < bd) { bd = da; bi = i; bRev = false; }
        if (db < bd) { bd = db; bi = i; bRev = true; }
      }
      const pick = left.splice(bi, 1)[0];
      const ch = bRev ? reverse(pick.ch) : pick.ch;
      ordered.push(ch);
      tip = endOf(ch);
    }
  } else {
    ordered = chains.sort((a, b) => dot(startOf(a)) - dot(startOf(b)));
  }

  const out = new Float32Array(n * 6);
  let w = 0;
  let total = 0;
  let touching = 0;
  let prevEnd = null;
  const eps2 = (diag * 1e-4) ** 2;
  for (const ch of ordered) {
    for (const [i, f] of ch) {
      const o = i * 6;
      const a = f ? o + 3 : o;
      const b = f ? o : o + 3;
      out[w++] = pos[a]; out[w++] = pos[a + 1]; out[w++] = pos[a + 2];
      out[w++] = pos[b]; out[w++] = pos[b + 1]; out[w++] = pos[b + 2];
      total += len(i);
      const start = [pos[a], pos[a + 1], pos[a + 2]];
      if (prevEnd && d2(prevEnd, start) < eps2) touching++;
      prevEnd = [pos[b], pos[b + 1], pos[b + 2]];
    }
  }
  return { positions: out, total, chains: ordered.length, continuity: n > 1 ? touching / (n - 1) : 1 };
}

// Same continuity metric for any segment array, so tests can compare before and after.
export function continuityOf(pos) {
  const n = Math.floor(pos.length / 6);
  if (n < 2) return 1;
  let touching = 0;
  for (let i = 0; i < n - 1; i++) {
    const a = i * 6 + 3;
    const b = (i + 1) * 6;
    if (Math.abs(pos[a] - pos[b]) + Math.abs(pos[a + 1] - pos[b + 1]) + Math.abs(pos[a + 2] - pos[b + 2]) < 1e-5) touching++;
  }
  return touching / (n - 1);
}

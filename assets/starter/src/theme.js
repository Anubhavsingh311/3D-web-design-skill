import * as THREE from 'three';

// WCAG relative luminance of a THREE.Color (its r, g, b are linear already).
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

export function contrast(a, b) {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// One theme for the page AND the object, driven by a single `dark` value (0 to 1).
//
//   bg  lerps from paper to paperDark.
//   fg  is NOT lerped. It jumps to whichever of ink or inkDark reads better on the current bg.
//
// Why: lerping the page background paper to ink while lerping the text ink to paper makes the two
// colours identical at dark = 0.5 (contrast 1:1). Headings and sketch lines vanish mid-transition.
// Any continuous path from dark to light must cross the background's path, so the only fix is a jump.
// The jump happens where both candidates have equal contrast (about 4:1 for a typical palette).
export function createTheme(tokens) {
  const ink = new THREE.Color(tokens.ink);
  const paper = new THREE.Color(tokens.paper);
  const paperDark = new THREE.Color(tokens.paperDark || tokens.ink);
  const inkDark = new THREE.Color(tokens.inkDark || tokens.paper);
  const accent = new THREE.Color(tokens.accent);

  function at(dark, out = { bg: new THREE.Color(), fg: new THREE.Color() }) {
    out.bg.copy(paper).lerp(paperDark, dark);
    out.fg.copy(contrast(out.bg, ink) >= contrast(out.bg, inkDark) ? ink : inkDark);
    return out;
  }

  // Lowest contrast between text and background over the whole 0..1 range. Use in tests and reviews.
  function worstContrast(steps = 200) {
    let worst = Infinity;
    const out = { bg: new THREE.Color(), fg: new THREE.Color() };
    for (let i = 0; i <= steps; i++) {
      at(i / steps, out);
      worst = Math.min(worst, contrast(out.bg, out.fg));
    }
    return worst;
  }

  return { ink, paper, paperDark, inkDark, accent, at, worstContrast };
}

// Reads the site's own CSS custom properties so the 3D look follows the design system.
// Optional --paper-dark and --ink-dark describe a dark chapter that is not a plain inversion.
export function readTokens(el = document.documentElement) {
  const cs = getComputedStyle(el);
  const get = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  return {
    ink: get('--ink', '#15171a'),
    paper: get('--paper', '#f3f0e8'),
    accent: get('--accent', '#ff5a36'),
    paperDark: get('--paper-dark', ''),
    inkDark: get('--ink-dark', ''),
  };
}

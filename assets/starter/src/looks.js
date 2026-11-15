import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Per mesh we stack three layers on identical geometry:
//   1. fill   the original mesh with an unlit paper colour. It hides back edges (hidden-line removal).
//   2. solid  a child mesh with the original PBR material plus a dissolve patch. Hidden until reveal > 0.
//   3. lines  fat edge lines (LineSegments2) that draw themselves on as state.draw goes 0 to 1.
// One `state` object (draw, reveal, lines, dark) drives all of it, see apply().
export function createLooks(meshes, tokens, { lineWidth = 1.6, edgeAngle = 28 } = {}) {
  const ink = new THREE.Color(tokens.ink);
  const paper = new THREE.Color(tokens.paper);
  const accent = new THREE.Color(tokens.accent);

  const shared = {
    uReveal: { value: 0 },
    uBounds: { value: new THREE.Vector2(-1, 1) },          // world y range, refreshed while dissolving
    uEdge: { value: accent.clone().convertLinearToSRGB() }, // mixed after output encoding, so pre-encode it
  };

  const parts = [];
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  meshes.forEach((mesh) => {
    const base = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const solidMat = base.clone();
    solidMat.polygonOffset = true;
    solidMat.polygonOffsetFactor = 1;
    solidMat.polygonOffsetUnits = 1;
    patchDissolve(solidMat, shared);

    const fillMat = new THREE.MeshBasicMaterial({
      color: paper.clone(),
      toneMapped: false,     // paper must match the page background exactly
      polygonOffset: true,   // push surfaces back so the edge lines always win the depth test
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    mesh.material = fillMat;

    const solid = new THREE.Mesh(mesh.geometry, solidMat);
    solid.name = `${mesh.name}__solid`;
    solid.renderOrder = 1;
    mesh.add(solid);

    // Smooth shapes (spheres, tori, organic scans) have no hard edges at the normal threshold and would
    // vanish from the sketch. Retry with a low threshold, which traces the facet flow instead.
    let edges = new THREE.EdgesGeometry(mesh.geometry, edgeAngle);
    if (edges.attributes.position.count < 12) {
      edges.dispose();
      edges = new THREE.EdgesGeometry(mesh.geometry, 8);
    }
    const pos = edges.attributes.position;
    let total = 0;
    for (let i = 0; i + 1 < pos.count; i += 2) {
      total += tmpA.fromBufferAttribute(pos, i).distanceTo(tmpB.fromBufferAttribute(pos, i + 1));
    }
    const lineGeo = new LineSegmentsGeometry().fromEdgesGeometry(edges);
    const lineMat = new LineMaterial({
      color: ink.getHex(),
      linewidth: lineWidth,   // pixels
      transparent: true,
      dashed: true,           // the dash grows from 0 to the total edge length: that is the draw-on
      dashSize: 0,
      gapSize: total * 2 + 1,
    });
    const line = new LineSegments2(lineGeo, lineMat);
    line.computeLineDistances();
    line.name = `${mesh.name}__lines`;
    line.renderOrder = 2;
    mesh.add(line);
    edges.dispose();

    parts.push({ mesh, solid, solidMat, fillMat, line, lineMat, total });
  });

  const box = new THREE.Box3();

  // Call once per frame. `pivot` is only used to measure world bounds for the dissolve sweep.
  function apply(state, pivot) {
    const n = parts.length;
    const span = 0.6; // share of the draw range used to stagger the parts
    for (let i = 0; i < n; i++) {
      const p = parts[i];
      const start = n > 1 ? (i / (n - 1)) * span : 0;
      const local = p.total > 0 ? clamp01((state.draw - start) / (1 - span)) : 0;
      p.lineMat.dashSize = local * p.total;
      p.lineMat.opacity = state.lines;
      p.line.visible = state.lines > 0.001 && local > 0;
      p.lineMat.color.copy(ink).lerp(paper, state.dark);
      p.fillMat.color.copy(paper).lerp(ink, state.dark);
      p.solid.visible = state.reveal > 0.001;
    }
    shared.uReveal.value = state.reveal;
    if (pivot && state.reveal > 0 && state.reveal < 1) {
      box.setFromObject(pivot);
      shared.uBounds.value.set(box.min.y, box.max.y);
    }
  }

  function resize(w, h) {
    for (const p of parts) p.lineMat.resolution.set(w, h);
  }

  function setTokens(next) {
    ink.set(next.ink);
    paper.set(next.paper);
    accent.set(next.accent);
    shared.uEdge.value.copy(accent).convertLinearToSRGB();
  }

  function dispose() {
    for (const p of parts) {
      p.mesh.remove(p.solid);
      p.mesh.remove(p.line);
      p.solidMat.dispose();
      p.fillMat.dispose();
      p.line.geometry.dispose();
      p.lineMat.dispose();
    }
    parts.length = 0;
  }

  return { parts, apply, resize, setTokens, dispose };
}

// Dissolve: discard fragments below a noisy sweep along world Y, glow the cut edge with the accent.
// onBeforeCompile keeps the full MeshStandardMaterial lighting, so the revealed solid still looks PBR.
function patchDissolve(mat, shared) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uReveal = shared.uReveal;
    shader.uniforms.uBounds = shared.uBounds;
    shader.uniforms.uEdge = shared.uEdge;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        uniform float uReveal;
        uniform vec2 uBounds;
        uniform vec3 uEdge;
        float dHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        float dSweep = (vWPos.y - uBounds.x) / max(uBounds.y - uBounds.x, 1e-4);
        float dField = dSweep + dHash(floor(vWPos * 64.0)) * 0.12;
        float dEdge = uReveal * 1.14 - dField;
        if (dEdge <= 0.0) discard;`
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        gl_FragColor.rgb = mix(uEdge, gl_FragColor.rgb, smoothstep(0.0, 0.05, dEdge));`
      );
  };
  mat.customProgramCacheKey = () => 'dissolve-v1';
}

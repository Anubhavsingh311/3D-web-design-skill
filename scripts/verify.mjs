#!/usr/bin/env node
// Headless verification of a project built from assets/starter. Real Chromium with software WebGL
// (SwiftShader), so it works in sandboxes with no GPU and no browser download.
//
//   node verify.mjs --project <dir> [--out <dir>] [--viewports desktop,mobile,landscape]
//                   [--skip-build] [--posters] [--poster-px 640] [--single] [--port 4399]
//
// It builds the project, serves the production bundle, loads it with ?verify (deterministic: strict
// scroll sync, no idle motion) and asserts NUMBERS, not impressions:
//   timeline duration equals the scroll range, scroll maps 1:1 onto timeline time
//   the object is at rest at its chapter's pose for the whole reading window, and glides in between
//   the object sits on its anchor box, text stays inside the viewport, contrast never collapses
//   no horizontal overflow, no console errors, first frame is not empty
//   reduced motion, no WebGL, remount (StrictMode/HMR), context loss and resize all behave
// --single also builds the single-file bundle (npm run build:single) and boots it from file://.
// Screenshots, a contact sheet, report.json and (with --posters) transparent posters land in --out.
// Exit code 1 if any check fails.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));
const project = path.resolve(args.project || '.');
const out = path.resolve(args.out || path.join(project, 'verify-out'));
const port = Number(args.port || 4399);
const VIEWPORTS = {
  desktop: { width: 1280, height: 720, isMobile: false },
  mobile: { width: 390, height: 844, isMobile: true },
  landscape: { width: 844, height: 390, isMobile: true },
};
const wanted = String(args.viewports || 'desktop,mobile,landscape').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- tools: puppeteer-core and a Chromium that needs no download --------------------------------
const TOOLS = process.env.TOOLS_DIR || '/tmp/3dweb-tools';
async function importFrom(pkg) {
  try { return await import(pkg); } catch {}
  const dir = path.join(TOOLS, 'node_modules', ...pkg.split('/'));
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  let entry = meta.exports?.['.'];
  entry = typeof entry === 'string' ? entry : entry?.import?.default || entry?.import || entry?.default || meta.module || meta.main;
  if (entry && typeof entry === 'object') entry = entry.default || Object.values(entry)[0];
  return import(pathToFileURL(path.join(dir, entry)).href);
}
async function loadTools() {
  const need = () => !fs.existsSync(path.join(TOOLS, 'node_modules/puppeteer-core')) || !fs.existsSync(path.join(TOOLS, 'node_modules/@sparticuz/chromium'));
  if (need()) {
    console.log(`installing puppeteer-core and @sparticuz/chromium into ${TOOLS} (needs registry access, about 100 MB)`);
    fs.mkdirSync(TOOLS, { recursive: true });
    fs.writeFileSync(path.join(TOOLS, 'package.json'), '{"name":"3dweb-tools","private":true,"type":"module"}');
    const r = spawnSync('npm', ['i', 'puppeteer-core', '@sparticuz/chromium', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: TOOLS, stdio: 'inherit' });
    if (r.status !== 0) { console.error('could not install the browser tools. Set TOOLS_DIR to a folder that has them.'); process.exit(2); }
  }
  const pptr = (await importFrom('puppeteer-core')).default;
  const chromium = (await importFrom('@sparticuz/chromium')).default;
  return { pptr, chromium };
}

// ---- results ----------------------------------------------------------------------------------
const results = [];
let currentGroup = '';
function check(name, pass, detail = '') {
  results.push({ group: currentGroup, name, pass: !!pass, detail: String(detail) });
  console.log(`${pass ? '  PASS' : '  FAIL'}  ${currentGroup ? currentGroup + ': ' : ''}${name}${detail ? '  ' + detail : ''}`);
}
const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const { pptr, chromium } = await loadTools();

  // ---- build and serve ----------------------------------------------------------------------
  if (!fs.existsSync(path.join(project, 'node_modules'))) spawnSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: project, stdio: 'inherit' });
  if (!args['skip-build']) {
    const b = spawnSync('npm', ['run', 'build'], { cwd: project, encoding: 'utf8' });
    if (b.status !== 0) { console.error(b.stdout, b.stderr); process.exit(2); }
  }
  const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: project, stdio: 'ignore' });
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch {}
    if (i > 60) { srv.kill(); throw new Error('preview server did not start'); }
    await sleep(250);
  }
  const url = `http://127.0.0.1:${port}/`;
  const launch = async (extra = []) => pptr.launch({
    args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...extra],
    executablePath: await chromium.executablePath(), headless: 'shell',
  });
  const browser = await launch();
  const sheet = [];

  // ---- helpers bound to a page ---------------------------------------------------------------
  const frames = (page, n = 2) => page.evaluate((k) => new Promise((res) => { const t = window.__stage.frames + k; const id = setInterval(() => { if (window.__stage.frames >= t) { clearInterval(id); res(); } }, 16); }), n);
  const scrollTo = async (page, y, n = 2) => { await page.evaluate((v) => window.scrollTo(0, v), Math.round(y)); await frames(page, n); };
  const readState = (page) => page.evaluate(() => {
    const s = window.__stage; const d = 180 / Math.PI;
    return { ...s.state, rotX: s.pivot.rotation.x * d, rotY: s.pivot.rotation.y * d, x: s.pivot.position.x, y: s.pivot.position.y, scale: s.pivot.scale.x };
  });
  const newPage = async (b, vp, query = '?verify') => {
    const page = await b.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1, isMobile: !!vp.isMobile, hasTouch: !!vp.isMobile });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto(url + query, { waitUntil: 'load' });
    page.errors = errors;
    return page;
  };
  const POSE_EPS = { draw: 0.02, reveal: 0.02, explode: 0.02, lines: 0.02, panel: 0.02, dark: 0.02 };
  const poseDelta = (got, pose) => {
    let worst = ['', 0];
    for (const k of Object.keys(POSE_EPS)) { const d = Math.abs(got[k] - pose[k]) / POSE_EPS[k]; if (d > worst[1]) worst = [k, d]; }
    for (const [g, p, eps] of [['rotX', 'rotateX', 0.6], ['rotY', 'rotateY', 0.6], ['x', 'x', 0.01], ['y', 'y', 0.01], ['scale', 'scale', 0.01]]) { const d = Math.abs(got[g] - pose[p]) / eps; if (d > worst[1]) worst = [g, d]; }
    return worst; // [key, multiples of its tolerance]; <= 1 is a pass
  };

  // ---- per viewport -------------------------------------------------------------------------
  for (const name of wanted) {
    const vp = VIEWPORTS[name];
    if (!vp) continue;
    currentGroup = name;
    const dir = path.join(out, name);
    fs.mkdirSync(dir, { recursive: true });
    const page = await newPage(browser, vp);
    try { await page.waitForFunction(() => window.__stage?.ready, { timeout: 60000 }); } catch { check('stage boots and renders a frame', false, 'timed out'); await page.close(); continue; }
    check('stage boots and renders a frame', true);
    const S = await page.evaluate(() => {
      const s = window.__stage;
      return { mode: s.mode, tier: s.tier(), range: s.schedule.range, mainTop: s.schedule.mainTop, chapters: s.schedule.chapters.map((c) => ({ ...c })), poses: s.poses.map((p) => ({ ...p })), audit: s.audit, looks: s.looksStats(), warnings: s.schedule.warnings, tlDuration: s.choreo?.tl?.duration, obs: [s.choreo?.observer?.offsetStart, s.choreo?.observer?.offsetEnd], box: s.box };
    });
    fs.writeFileSync(path.join(dir, 'audit.json'), JSON.stringify({ audit: S.audit, looks: S.looks, schedule: S.chapters, warnings: S.warnings }, null, 2));
    check('scrubbed mode', S.mode === 'scrubbed', S.mode);
    check('timeline duration equals the scroll range', Math.abs(S.tlDuration - S.range) <= 1, `${S.tlDuration} vs ${S.range}`);
    check('scroll observer range equals the schedule range', Math.abs(S.obs[1] - S.obs[0] - S.range) <= 1, `${S.obs[1] - S.obs[0]} vs ${S.range}`);
    check('schedule has no warnings', S.warnings.length === 0, S.warnings.join('; '));
    check('model audit has no blocking warnings', !S.audit.warnings.some((w) => ['triangles', 'draw-calls', 'vram', 'skinned', 'instanced'].includes(w.code)), S.audit.warnings.map((w) => w.code).join(','));
    check('no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    check('page has exactly one h1 for assistive technology', (await page.evaluate(() => document.querySelectorAll('h1').length)) === 1);

    // first frame must not be empty
    await scrollTo(page, 0, 3);
    const first = await page.evaluate(() => window.__stage.coverage());
    check('first screen is not empty', first.fraction > 0.002, `coverage ${(first.fraction * 100).toFixed(2)}%`);

    // each chapter: at rest through the whole window, on its anchor, text inside the viewport
    let contactChecked = false;
    for (let i = 0; i < S.chapters.length; i++) {
      const c = S.chapters[i];
      const pose = S.poses[i];
      const probes = [c.restStart + 4, (c.restStart + c.restEnd) / 2, c.restEnd - 4].map((v) => Math.min(Math.max(v, c.restStart), c.restEnd));
      let worst = ['', 0];
      for (const y of probes) { await scrollTo(page, y); const d = poseDelta(await readState(page), pose); if (d[1] > worst[1]) worst = d; }
      check(`chapter ${i} (${pose.id}): object at rest at its pose for the whole reading window`, worst[1] <= 1, worst[1] > 1 ? `${worst[0]} off by ${worst[1].toFixed(1)}x tolerance` : '');
      await scrollTo(page, probes[1]);
      const place = await page.evaluate((idx) => {
        const a = document.querySelectorAll('.anchor')[idx].getBoundingClientRect();
        const p = window.__stage.project();
        const cov = window.__stage.coverage();
        const cp = document.querySelectorAll('.chapter')[idx].querySelector('.copy').getBoundingClientRect();
        const iw = document.documentElement.clientWidth, ih = window.__stage.box.h;
        return { dx: p.x - (a.left + a.width / 2), dy: p.y - (a.top + a.height / 2), size: Math.min(a.width, a.height), cov, fits: cp.left >= -1 && cp.right <= iw + 1 && cp.top >= -1 && cp.bottom <= ih + 1, copy: [Math.round(cp.top), Math.round(cp.bottom), ih] };
      }, i);
      check(`chapter ${i}: object centre sits on its anchor`, Math.hypot(place.dx, place.dy) <= 2, `off by ${place.dx.toFixed(1)}, ${place.dy.toFixed(1)} px`);
      if (place.cov.bbox) {
        const cx = (place.cov.bbox.x0 + place.cov.bbox.x1) / 2, cy = (place.cov.bbox.y0 + place.cov.bbox.y1) / 2;
        const a = await page.evaluate((idx) => { const r = document.querySelectorAll('.anchor')[idx].getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, i);
        check(`chapter ${i}: drawn pixels centred on the anchor`, Math.hypot(cx - a[0], cy - a[1]) <= 0.45 * place.size, `centre off by ${Math.hypot(cx - a[0], cy - a[1]).toFixed(0)} px of ${place.size.toFixed(0)}`);
      } else check(`chapter ${i}: drawn pixels centred on the anchor`, false, 'nothing drawn');
      check(`chapter ${i}: text block fits the viewport`, place.fits, place.fits ? '' : `copy top/bottom/viewport ${place.copy}`);
      if (place.cov.bbox) {
        const b = place.cov.bbox, w = S.box.w, h = S.box.h;
        const cut = b.x0 <= 1 || b.y0 <= 1 || b.x1 >= w - 1 || b.y1 >= h - 1;
        check(`chapter ${i}: object is not cut off by the viewport edge`, !cut, cut ? `drawn pixels span ${Math.round(b.x0)}..${Math.round(b.x1)} x ${Math.round(b.y0)}..${Math.round(b.y1)} of ${w}x${h}. Lower explode.distance, use fit "sphere", or shrink the anchor` : '');
      }
      if (!contactChecked && pose.dark === 0) {
        contactChecked = true;
        // A contact cue that changes no pixel is not a cue. The shadow blob is a scene object, so toggle it.
        const delta = await page.evaluate(() => {
          const o = window.__stage.scene.getObjectByName('contact_shadow');
          if (!o) return null;
          const a = window.__stage.coverage().fraction; o.visible = false; const b = window.__stage.coverage().fraction; o.visible = true;
          return a - b;
        });
        if (delta !== null) check('contact shadow is visible below the object', delta > 0.0005, `adds ${(delta * 100).toFixed(2)}% coverage`);
      }
      const shot = path.join(dir, `chapter-${i}-${pose.id}.png`);
      await page.screenshot({ path: shot });
      sheet.push({ file: shot, label: `${name} ${i} ${pose.id}` });
    }

    // moves: the object is genuinely in motion in the middle of the crossing
    for (let i = 1; i < S.chapters.length; i++) {
      const c = S.chapters[i];
      await scrollTo(page, (c.moveStart + c.moveEnd) / 2);
      const got = await readState(page);
      const a = S.poses[i - 1], b = S.poses[i];
      let best = null;
      for (const [g, p] of [['x', 'x'], ['y', 'y'], ['rotY', 'rotateY'], ['rotX', 'rotateX'], ['scale', 'scale'], ['dark', 'dark'], ['explode', 'explode'], ['reveal', 'reveal'], ['draw', 'draw'], ['panel', 'panel']]) {
        const span = b[p] - a[p];
        if (Math.abs(span) < (g === 'x' || g === 'y' || g === 'scale' ? 1e-3 : 0.02)) continue;
        const t = (got[g] - a[p]) / span;
        if (!best || Math.abs(t - 0.5) < Math.abs(best[1] - 0.5)) best = [g, t];
      }
      check(`move into chapter ${i}: halfway through the crossing the object is halfway through its move`, !best || (best[1] > 0.2 && best[1] < 0.8), best ? `${best[0]} at ${best[1].toFixed(2)}` : 'nothing changes in this move');
    }

    // timeline time equals scroll distance (strict sync in verify mode)
    let maxErr = 0;
    for (const f of [0.13, 0.41, 0.77]) {
      await scrollTo(page, S.range * f);
      const r = await page.evaluate(() => ({ t: window.__stage.choreo.tl.currentTime, y: window.scrollY, top: window.__stage.schedule.mainTop }));
      maxErr = Math.max(maxErr, Math.abs(r.t - (r.y - r.top)));
    }
    check('timeline time equals pixels scrolled', maxErr <= 2, `max error ${maxErr.toFixed(2)} px`);

    // contrast of text and background through every transition
    let worstC = Infinity;
    const N = 36;
    for (let k = 0; k <= N; k++) {
      await scrollTo(page, (S.range * k) / N, 1);
      const cs = await page.evaluate(() => { const s = getComputedStyle(document.documentElement); return [s.getPropertyValue('--bg'), s.getPropertyValue('--fg')]; });
      worstC = Math.min(worstC, contrast(rgb(cs[0]), rgb(cs[1])));
    }
    check('text contrast stays above 3.5:1 through every transition', worstC >= 3.5, `lowest ${worstC.toFixed(2)}:1`);

    // anything after <main> scrolls the stage away with the last pin, and rendering stops once it is gone
    const tail = await page.evaluate(() => {
      const s = window.__stage;
      const maxY = document.documentElement.scrollHeight - innerHeight;
      return { maxY, over: maxY - (s.schedule.mainTop + s.schedule.range), h: s.box.h, hasFooter: !!document.querySelector('footer') };
    });
    if (tail.hasFooter && tail.over > 0) {
      await page.evaluate((y) => window.scrollTo(0, y), tail.maxY);
      await sleep(900);
      const a = await page.evaluate(() => ({ bottom: document.getElementById('stage').getBoundingClientRect().bottom, f: window.__stage.frames }));
      const expected = tail.h - Math.min(tail.over, tail.h * 3);
      check('stage layers leave with the last pin, at scroll speed', Math.abs(a.bottom - expected) <= 2 || a.bottom <= 0, `stage bottom ${Math.round(a.bottom)} px, expected ${Math.round(Math.max(expected, 0))}`);
      if (tail.over >= tail.h) {
        await sleep(700);
        const f2 = await page.evaluate(() => window.__stage.frames);
        check('rendering pauses once the stage is off screen', f2 === a.f, `${a.f} -> ${f2} frames`);
      }
    }
    check('no console errors', page.errors.length === 0, page.errors.slice(0, 2).join(' | '));
    await page.close();
  }

  // ---- behaviour checks on the desktop viewport -----------------------------------------------
  if (wanted.includes('desktop')) {
    currentGroup = 'reduced-motion';
    let page = await newPage(browser, VIEWPORTS.desktop);
    await page.close();
    page = await browser.newPage();
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.setViewport({ width: 1280, height: 720 });
    const rmErrors = [];
    page.on('pageerror', (e) => rmErrors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') rmErrors.push(m.text()); });
    await page.goto(url + '?verify', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__stage?.ready, { timeout: 60000 });
    check('static mode, no scrubbing', await page.evaluate(() => window.__stage.mode === 'static'));
    const idx = 3;
    await page.evaluate((i) => document.querySelectorAll('.chapter')[i].scrollIntoView(), idx);
    await sleep(900); await frames(page, 3);
    const d = poseDelta(await readState(page), await page.evaluate((i) => ({ ...window.__stage.poses[i] }), idx));
    check('object cuts to the pose of the chapter in view', d[1] <= 1, d[1] > 1 ? `${d[0]} off by ${d[1].toFixed(1)}x` : '');
    check('no console errors', rmErrors.length === 0, rmErrors.join(' | '));
    await page.screenshot({ path: path.join(out, 'reduced-motion.png') });
    await page.close();

    currentGroup = 'no-webgl';
    const plain = await launch(['--disable-3d-apis']);
    const p2 = await plain.newPage();
    await p2.setViewport({ width: 1280, height: 720 });
    const nwErr = [];
    p2.on('pageerror', (e) => nwErr.push(e.message));
    await p2.goto(url, { waitUntil: 'load' });
    await sleep(1500);
    const nw = await p2.evaluate(() => ({ cls: document.documentElement.classList.contains('no-webgl'), h1: (document.querySelector('h1, h2') || document.body).getBoundingClientRect().height, text: document.querySelectorAll('.chapter').length }));
    check('falls back to the static page without WebGL', nw.cls && nw.h1 > 0 && nw.text > 0, JSON.stringify(nw));
    const posterInfo = await p2.evaluate(() => { const a = [...document.querySelectorAll('.anchor[data-poster]')]; return { n: a.length, shown: a.filter((x) => getComputedStyle(x).backgroundImage !== 'none').length }; });
    if (posterInfo.n) check('posters show in the anchor boxes without WebGL', posterInfo.shown === posterInfo.n, JSON.stringify(posterInfo));
    check('no uncaught errors without WebGL', nwErr.length === 0, nwErr.join(' | '));
    await p2.screenshot({ path: path.join(out, 'no-webgl.png') });
    await plain.close();

    currentGroup = 'lifecycle';
    page = await newPage(browser, VIEWPORTS.desktop);
    await page.waitForFunction(() => window.__stage?.ready, { timeout: 60000 });
    await page.evaluate(async () => { window.__mount.unmount(); await window.__mount.mount(); window.__mount.unmount(); await window.__mount.mount(); });
    await page.waitForFunction(() => window.__stage?.ready, { timeout: 60000 });
    const re = await page.evaluate(() => ({ canvases: document.querySelectorAll('canvas#stage').length, panels: document.querySelectorAll('#css-layer .panel').length, parked: document.querySelectorAll('#panels .panel').length, slot: !!window.__stage.obj.slots.screen }));
    // With a slot_screen the panel moves into the CSS layer. Without one it must stay parked, untouched.
    check('remount twice leaves one canvas and the panel where it belongs', re.canvases === 1 && re.panels === (re.slot ? 1 : 0) && re.parked === (re.slot ? 0 : 1), JSON.stringify(re));
    await scrollTo(page, 3000);
    check('remounted stage renders', (await page.evaluate(() => window.__stage.coverage())).fraction > 0.002);
    check('no console errors across remounts', page.errors.length === 0, page.errors.slice(0, 2).join(' | '));

    // context loss and restore
    await page.evaluate(() => { const gl = window.__stage.renderer.getContext(); window.__lose = gl.getExtension('WEBGL_lose_context'); window.__lose.loseContext(); });
    await sleep(500);
    const flagged = await page.evaluate(() => document.documentElement.classList.contains('context-lost'));
    await page.evaluate(() => window.__lose.restoreContext());
    await sleep(800); await frames(page, 3);
    const back = await page.evaluate(() => ({ cov: window.__stage.coverage().fraction, flag: document.documentElement.classList.contains('context-lost') }));
    check('context loss is flagged, then rendering resumes', flagged && !back.flag && back.cov > 0.002, JSON.stringify({ flagged, ...back }));
    await page.screenshot({ path: path.join(out, 'after-context-loss.png') });

    // resize while scrolled: the choreography is rebuilt at the same place
    currentGroup = 'resize';
    await page.setViewport({ width: 1280, height: 720 });
    await scrollTo(page, 4300);
    await page.setViewport({ width: 1100, height: 760 });
    await sleep(1200); await frames(page, 3);
    const rz = await page.evaluate(() => { const s = window.__stage; return { dur: s.choreo.tl.duration, range: s.schedule.range, t: s.choreo.tl.currentTime, y: window.scrollY, top: s.schedule.mainTop, w: s.box.w, h: s.box.h }; });
    check('timeline is rebuilt for the new size', Math.abs(rz.dur - rz.range) <= 1 && rz.w === 1100 && rz.h === 760, JSON.stringify(rz));
    check('and it is still scroll-accurate after the rebuild', Math.abs(rz.t - (rz.y - rz.top)) <= 2, `${rz.t.toFixed(1)} vs ${(rz.y - rz.top).toFixed(1)}`);
    await page.close();

    if (args.single) {
      currentGroup = 'single-file';
      const b = spawnSync('npm', ['run', 'build:single'], { cwd: project, encoding: 'utf8' });
      const html = path.join(project, 'dist-single', 'index.html');
      if (b.status !== 0 || !fs.existsSync(html)) check('npm run build:single succeeds', false, (b.stderr || b.stdout || '').slice(-300));
      else {
        const kb = fs.statSync(html).size / 1024;
        const text = fs.readFileSync(html, 'utf8');
        const external = (text.match(/(?:src|href)=["']https?:\/\/[^"']+/g) || []).filter((u) => !/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/.test(u));
        check('single file has no external requests', external.length === 0, external.slice(0, 2).join(' '));
        check('single file stays under the 16 MB hosting limit', kb < 16 * 1024, `${kb.toFixed(0)} KB`);
        const sp = await browser.newPage();
        const spErr = [];
        sp.on('console', (m) => { if (m.type() === 'error') spErr.push(m.text()); });
        sp.on('pageerror', (e) => spErr.push(e.message));
        sp.on('requestfailed', (r) => spErr.push(`request failed: ${r.url().slice(0, 80)}`));
        await sp.setViewport({ width: 1280, height: 720 });
        await sp.goto(pathToFileURL(html).href + '?verify', { waitUntil: 'load' });
        let booted = true;
        try { await sp.waitForFunction(() => window.__stage?.ready, { timeout: 60000 }); } catch { booted = false; }
        check('single file boots from file://', booted);
        if (booted) {
          await scrollTo(sp, 3300);
          const cov = await sp.evaluate(() => window.__stage.coverage());
          check('single file renders the object', cov.fraction > 0.002, `coverage ${(cov.fraction * 100).toFixed(2)}%`);
          await sp.screenshot({ path: path.join(out, 'single-file.png') });
        }
        check('single file has no console errors', spErr.length === 0, spErr.slice(0, 2).join(' | '));
        await sp.close();
      }
    }

    if (args.posters) {
      currentGroup = 'posters';
      const pp = await browser.newPage();
      await pp.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
      await pp.goto(url + '?verify', { waitUntil: 'load' });
      await pp.waitForFunction(() => window.__stage?.ready, { timeout: 60000 });
      await pp.addStyleTag({ content: 'main,footer,#bg,.skip{visibility:hidden!important}body::after{display:none!important}html,body{background:transparent!important}' });
      fs.mkdirSync(path.join(out, 'posters'), { recursive: true });
      const n = await pp.evaluate(() => window.__stage.poses.length);
      for (let i = 0; i < n; i++) {
        await pp.evaluate((k) => window.__stage.setPose(k), i);
        await frames(pp, 3);
        const g = await pp.evaluate((k) => ({ ...window.__stage.layout[k].px, id: window.__stage.poses[k].id, w: window.__stage.box.w, h: window.__stage.box.h }), i);
        const half = g.size * 0.8;
        const clip = { x: Math.max(0, g.cx - half), y: Math.max(0, g.cy - half), width: Math.min(g.w, 2 * half), height: Math.min(g.h, 2 * half) };
        const png = await pp.screenshot({ clip, omitBackground: true, encoding: 'base64' });
        // Right-size and re-encode in the page: transparent WebP, a few tens of KB instead of hundreds.
        const webp = await pp.evaluate(async (b64, px) => {
          const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
          const k = Math.min(1, px / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          return c.toDataURL('image/webp', 0.85).split(',')[1];
        }, png, Number(args['poster-px'] || 640));
        fs.writeFileSync(path.join(out, 'posters', `${g.id}.webp`), Buffer.from(webp, 'base64'));
      }
      const sizes = fs.readdirSync(path.join(out, 'posters')).map((f) => Math.round(fs.statSync(path.join(out, 'posters', f)).size / 1024));
      check('posters rendered as transparent WebP', true, `${n} files in ${path.join(out, 'posters')} (${sizes.join(', ')} KB). Copy them to public/posters and add data-poster to each .anchor`);
      await pp.close();
    }
  }

  // ---- contact sheet ---------------------------------------------------------------------------
  if (sheet.length) {
    const p = await browser.newPage();
    const cells = sheet.map((s) => `<figure><img src="data:image/png;base64,${fs.readFileSync(s.file).toString('base64')}"><figcaption>${s.label}</figcaption></figure>`).join('');
    await p.setViewport({ width: 1800, height: 900 });
    await p.setContent(`<style>body{margin:0;background:#777;font:12px monospace;color:#fff}div{display:flex;flex-wrap:wrap;gap:6px;padding:6px}figure{margin:0;width:350px}img{width:350px;height:auto;max-height:420px;object-fit:contain;background:#444;display:block}figcaption{padding:2px 0}</style><div>${cells}</div>`);
    await p.screenshot({ path: path.join(out, 'contact-sheet.png'), fullPage: true });
    await p.close();
  }

  await browser.close();
  srv.kill();
  const failed = results.filter((r) => !r.pass);
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ project, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. Output in ${out}`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });

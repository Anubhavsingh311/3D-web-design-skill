// Headless WebGL capture. Usage (from a scratch folder, not the project):
//   npm i puppeteer-core @sparticuz/chromium
//   npm run build   # in the project, so `vite preview` has something to serve
//   node headless-capture.mjs <projectDir> <outDir>
// Uses software GL (SwiftShader), so frames are slow: the script waits 3.5 s per scroll stop.
// It prints console errors and whether WebGL initialised. Read the PNGs, do not just trust exit code 0.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const srv = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { cwd: process.argv[2] || process.cwd(), stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 3500));
const browser = await puppeteer.launch({
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  executablePath: await chromium.executablePath(),
  headless: 'shell',
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto('http://localhost:4173/', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 2500));
const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
for (const f of [0, 0.3, 0.5, 0.7, 1]) {
  await page.evaluate((y) => window.scrollTo(0, y), total * f);
  await new Promise((r) => setTimeout(r, 3500));
  await page.screenshot({ path: `${process.argv[3] || '.'}/shot-${Math.round(f * 100)}.png` });
}
console.log(logs.slice(0, 15).join('\n') || 'no console output');
console.log('webgl ok:', await page.evaluate(() => !document.documentElement.classList.contains('no-webgl')));
await browser.close();
srv.kill();

import { defineConfig } from 'vite';

// `npm run build`         normal build into dist/
// `npm run build:single`  ONE self-contained dist-single/index.html (JS, CSS and the GLB inlined).
//                         Use it for hosts that accept a single file. Meshopt-compressed or plain GLBs only:
//                         Draco and KTX2 decoders are left out of this mode on purpose (see ingest.js).
export default defineConfig(async ({ mode }) => {
  const single = mode === 'single';
  const plugins = [];
  if (single) plugins.push((await import('vite-plugin-singlefile')).viteSingleFile());
  return {
    plugins,
    build: { target: 'esnext', ...(single ? { outDir: 'dist-single', assetsInlineLimit: 100_000_000 } : {}) },
  };
});

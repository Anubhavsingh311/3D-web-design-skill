// Drop your optimised GLB at src/model/object.glb. Vite resolves it at build time, so there is no URL
// to get wrong, and single-file mode (`npm run build:single`) inlines it as a data URI.
// Only .glb is picked up here. A .gltf with sidecar files needs converting first.
const found = import.meta.glob('./model/object.glb', { query: '?url', import: 'default', eager: true });
export const MODEL_URL = Object.values(found)[0] ?? null;

import { createExperience } from './experience.js';

let experience = createExperience();

// HMR: tear down before the module is replaced, otherwise two render loops fight over one canvas.
if (import.meta.hot) import.meta.hot.dispose(() => experience.destroy());

// Remount hooks for scripts/verify.mjs. They exist only with ?verify.
if (new URLSearchParams(location.search).has('verify')) {
  window.__mount = {
    unmount: () => experience.destroy(),
    mount: () => { experience = createExperience(); return experience.ready; },
  };
}

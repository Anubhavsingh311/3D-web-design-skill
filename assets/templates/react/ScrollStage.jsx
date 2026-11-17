import { useEffect } from 'react';
import { createExperience } from './experience.js'; // copied from assets/starter/src
import './style.css';

// Owns the whole experience for as long as it is mounted. Safe under React 18 StrictMode, whose dev build
// mounts, unmounts and mounts again: createExperience() and destroy() are idempotent and destroy() hands
// the DOM panel back, so the second mount finds everything where it expects it.
//
// Render the page markup (see Chapters.jsx) as `children`. It must contain, in this order:
//   #bg, #css-layer, canvas#stage, a hidden #panels holding .panel#panel-screen, <main> with the chapters.
// `config` is read once. To change it, remount with a new `key`.
export default function ScrollStage({ config, children }) {
  useEffect(() => {
    const experience = createExperience({ config });
    return () => experience.destroy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return children;
}

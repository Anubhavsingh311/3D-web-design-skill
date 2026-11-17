# 06. Blending the object into the site

The test: cover the page text and show someone one frame. Could the object belong to any other site? If yes, it is floating, not blended. Every layer below ties the object to the site's own system.

## 1. Tokens, read from the site
`readTokens()` reads `--ink`, `--paper`, `--accent` (and optionally `--paper-dark`, `--ink-dark`) from `:root`. The 3D look, the page colours and the DOM panel come from the same variables, so a rebrand is one CSS edit. Never write a hex value in JS or GLSL. A `prefers-color-scheme` change re-reads the tokens and rebuilds the theme and contact cue.

## 2. One theme value for page and object
`state.dark` (0 to 1) drives everything:
- `--bg` on `:root` (and `<meta name="theme-color">`) lerps from paper to paperDark. The fill layer uses the same colour, so the sketch and the page are one surface.
- `--fg` is NOT lerped. `createTheme().at(dark)` returns the foreground as whichever of `ink` or `inkDark` has more contrast with the current background. The text and the sketch lines both use it.

Why the jump: a lerp of both colours is identical at the midpoint, and any continuous foreground path from dark to light has to cross the background's path somewhere (intermediate value theorem). Measured on the original starter: 1.09:1 at `dark = 0.525`, with every heading and every sketch line gone (screenshot in the evidence for this skill). With the jump the worst case for the default palette is about 4:1 at the crossover and above 12:1 at both ends. `theme.worstContrast()` returns the number for your palette, and the verifier samples 37 scroll positions and fails below 3.5:1.

A dark chapter that is not a plain inversion (a navy, a forest green): set `--paper-dark` and `--ink-dark` in `:root`. The lines and text pick the better of `--ink` and `--ink-dark` per frame.

## 3. Grid: the anchor box
The object fills the chapter's `.anchor`, which is a normal grid cell. On every breakpoint, the object's centre and size come from that box (`measureChapters`). Do not position the canvas content with magic numbers. Check with `?debug`: dashed boxes are the anchors, the crosshair is the object's projected centre, and `verify.mjs` asserts they agree within 2 px.

## 4. Type
The DOM panel uses the site's font stack. If a web font loads late, layout shifts and the anchors move, so the starter rebuilds on `document.fonts.ready`. Preload the hero font. Panel text at the largest on-screen size, scaled down.

## 5. Light
- Tint the key light with the page paper (`stage.setTint`), so a warm page gets warm light. No pure white and no pure black in lighting, albedo or the `LineMaterial` colour.
- Keep albedo under about 0.85 and use `NeutralToneMapping`. ACES shifts brand colours, which is the fastest way to make an object look pasted in.
- Environment intensity around 0.45. The environment is a procedural room (no HDR download). The low tier replaces it with a hemisphere light.

## 6. One contact cue (`CONFIG.contact`)
Pick exactly one, because two cues compete.
- `'grain'` (default): a fixed noise overlay (`body::after`, multiply, 7 percent) above canvas and page, so both share one texture. CSS only, always valid.
- `'shadow'`: a soft ellipse under the object that follows its position and scale and fades in dark chapters and while exploded. Only for layouts where the object plausibly rests on something.
- `'none'`: when the page supplies its own cue (a baseline rule, a plinth, a coloured band the object stands on).
Posters and screenshots hide the grain so they stay transparent.

## 7. Motion language
Match the site's easing. If the site uses `cubic-bezier(.2,.8,.2,1)` for UI, use an equivalent in the timeline (`outExpo` is close). Durations in the pose table are scroll distances, so "speed" is the reader's, not yours. One property family per chapter changes.

## 8. First paint and fallbacks
- **Poster.** `<div class="anchor" data-poster="/posters/intro.png">` shows an image in the anchor box until the first frame renders, and permanently without WebGL. The canvas fades in over 0.4 s (`html.stage-ready`).
- **Generate posters instead of shooting them:** `node scripts/verify.mjs --project . --posters` renders every chapter's pose with a transparent background and writes right-sized WebP (`--poster-px 640` default, 6 to 19 KB each measured). Copy them to `public/posters/`, add `data-poster` to each anchor. Verified: with posters wired in, the no-WebGL run shows all five.
- The same renders make the Open Graph image and the loading placeholder.

## 9. Accessibility
- All text is real DOM text. The canvas is `aria-hidden`. The panel toggles `aria-hidden` with its visibility.
- Provide a skip link (the starter has one) and visible focus (`a:focus-visible`).
- `prefers-reduced-motion`: no scrubbing, no idle motion, no intro draw, chapters 100vh, poses cut when a chapter is 60 percent visible.
- Contrast: see section 2. Text over the object is the one place it can fail, so keep copy in its own column.
- Do not trap scroll or focus inside panels.

## Minimum bar (the checklist from SKILL.md, with how each is checked)
| Item | Check |
|---|---|
| Colours from CSS custom properties | grep for `#` and `0x` in `src/` outside `config.js` demo materials |
| Background and text follow `dark`, contrast above 4:1 | `theme.worstContrast()`, verifier group "text contrast stays above 3.5:1" |
| Object fills its anchor on every breakpoint | verifier "object centre sits on its anchor" per chapter, per viewport |
| No pure white or black, neutral tone mapping | review `stage.js` and materials |
| One contact cue | `CONFIG.contact` is not two things |

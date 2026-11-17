// The markup the experience expects, as JSX. Same ids and classes as assets/starter/index.html.
const CHAPTERS = [
  { id: 'intro', eyebrow: '01 / Object', title: 'Your object, drawn into the page.', body: 'Scroll. It sketches itself, comes apart, turns solid, then hands the page a live diagram.' },
  { id: 'sketch', eyebrow: '02 / Sketch', title: 'Every edge is drawn, not shown.', body: 'Hidden lines stay hidden. Parts draw one after another as you scroll.' },
  { id: 'explode', eyebrow: '03 / Parts', title: 'Separate it to explain it.', body: 'Each part travels along its own axis away from the centre of mass.' },
  { id: 'solid', eyebrow: '04 / Material', title: 'Sketch dissolves into material.', body: 'A noisy sweep swaps paper for physically based shading, edge lit with the brand accent.' },
  { id: 'detail', eyebrow: '05 / Detail', title: 'The screen is a real web page.', body: 'The panel is HTML and SVG pinned to the object with the same camera.', cta: true },
];

export default function Chapters() {
  return (
    <>
      <div id="bg" />
      <div id="css-layer" />
      <canvas id="stage" aria-hidden="true" />
      <div id="panels" hidden>
        <div className="panel" id="panel-screen">
          <svg viewBox="0 0 480 300" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Signal diagram">
            <path d="M24 40 H456" />
            <path d="M24 90 C120 90 120 150 216 150 S312 90 456 90" />
            <path d="M24 210 H160 L200 170 L260 250 L300 210 H456" />
            <path d="M24 270 H456" />
          </svg>
        </div>
      </div>
      <main>
        {CHAPTERS.map((c, i) => (
          <section className="chapter" data-chapter={c.id} key={c.id}>
            <div className="pin">
              <div className="copy">
                <p className="eyebrow">{c.eyebrow}</p>
                {i === 0 ? <h1>{c.title}</h1> : <h2>{c.title}</h2>}
                <p>{c.body}</p>
                {c.cta && <a className="cta" href="#contact">Start building</a>}
              </div>
              <div className="anchor" />
            </div>
          </section>
        ))}
      </main>
      <footer className="end" id="contact">
        <h2>Anything after the experience scrolls away with it.</h2>
      </footer>
    </>
  );
}

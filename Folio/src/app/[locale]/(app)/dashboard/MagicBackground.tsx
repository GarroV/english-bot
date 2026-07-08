// Ambient "magic circle" (魔法陣) behind the dashboard — v4. Anime magic circles read as MAGIC
// because of: luminous thin lines on a DARK ground + bloom; strict monochrome (one hue + white);
// clean precise geometry with breathing room; brightness hierarchy for depth; a hot focal core.
// So this draws a dark radial "well" beneath a crisp cyan circle, monochrome, with a glowing core
// and a glow filter on the hero star. Pure SVG + CSS keyframes (transform/opacity), Server
// Component, aria-hidden + pointer-events-none, freezes under prefers-reduced-motion.

const C = 500; // viewBox centre
const TAU = Math.PI * 2;
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

function pt(i: number, n: number, R: number, phaseDeg = -90): [number, number] {
  const a = (phaseDeg * Math.PI) / 180 + (i / n) * TAU;
  return [C + R * Math.cos(a), C + R * Math.sin(a)];
}
const f = (n: number) => n.toFixed(1);

// Star polygon {n/k}: connect every k-th vertex → array of `points` strings (one per component).
function star(n: number, k: number, R: number, phaseDeg = -90): string[] {
  const d = gcd(n, k);
  const comps: string[] = [];
  for (let s = 0; s < d; s++) {
    const pts: string[] = [];
    let i = s;
    do { const [x, y] = pt(i, n, R, phaseDeg); pts.push(`${f(x)},${f(y)}`); i = (i + k) % n; } while (i !== s);
    comps.push(pts.join(" "));
  }
  return comps;
}

// Dense rune bands — many small glyphs read better than a few big ones. `runeBand` repeats a pool
// to N glyphs so each ring is a tight belt of runes; textLength keeps them evenly distributed.
const FUTHARK = [..."ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ"];
const FUTHORC = [..."ᚪᚫᚣᛠᚸᛢᛥᚻᛡᚹᚩᛄᛒᚷᛦᚾᛝᚦᛁᛗᛚᛞᚧᚫ"];
const runeBand = (pool: string[], n: number) =>
  Array.from({ length: n }, (_, i) => pool[(i * 7) % pool.length]).join(" ");
const OUTER_RUNES = runeBand(FUTHARK, 54);
const MID_RUNES = runeBand(FUTHORC, 46);
const INNER_RUNES = runeBand(FUTHARK, 22);

const BRIGHT = "#d7fff8"; // near-white cyan for the hottest accents

// Degree scale: 72 minor ticks (every 5°), every 6th long (every 30°).
const TICKS = Array.from({ length: 72 }, (_, i) => {
  const major = i % 6 === 0;
  const [x1, y1] = pt(i, 72, major ? 452 : 460);
  const [x2, y2] = pt(i, 72, 470);
  return { x1, y1, x2, y2, w: major ? 1.4 : 0.7 };
});
const HEPTA = Array.from({ length: 7 }, (_, i) => pt(i, 7, 348)); // node anchors on the hero star

export function MagicBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
      <div className="folio-magic-well" />
      <div className="folio-magic-glow" />
      <svg
        viewBox="0 0 1000 1000"
        className="h-[128%] max-h-none w-auto max-w-none min-w-[128%] text-[#5eead4] opacity-90"
        fill="none"
      >
        <defs>
          <path id="mbRune" d="M500,500 m-452,0 a452,452 0 1,1 904,0 a452,452 0 1,1 -904,0" />
          <path id="mbMid" d="M500,500 m-404,0 a404,404 0 1,0 808,0 a404,404 0 1,0 -808,0" />
          <path id="mbInner" d="M500,500 m-150,0 a150,150 0 1,1 300,0 a150,150 0 1,1 -300,0" />
          <radialGradient id="mbCore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={BRIGHT} stopOpacity="0.9" />
            <stop offset="45%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Hot core fill */}
        <circle cx={C} cy={C} r="235" fill="url(#mbCore)" />

        {/* L1 — outer rim + ticks + runes (slow CW). Dim structure, mid-bright glyphs. */}
        <g className="folio-spin-slow">
          <circle cx={C} cy={C} r="488" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.55" />
          <circle cx={C} cy={C} r="480" stroke="currentColor" strokeWidth="0.7" strokeOpacity="0.35" />
          {TICKS.map((t, i) => (
            <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="currentColor" strokeWidth={t.w} strokeOpacity="0.4" />
          ))}
          <text fill="currentColor" fillOpacity="0.7" fontSize="21" letterSpacing="1" style={{ fontFamily: "Georgia, serif" }}>
            <textPath href="#mbRune" startOffset="0" textLength="2840" lengthAdjust="spacing">{OUTER_RUNES}</textPath>
          </text>
        </g>

        {/* L2 — second runic ring + segmented + thin rings (CCW). No digits. */}
        <g className="folio-spin-rev">
          <circle cx={C} cy={C} r="430" stroke="currentColor" strokeWidth="0.7" strokeOpacity="0.3" />
          <circle cx={C} cy={C} r="422" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.5" pathLength={360} strokeDasharray="1.5 6.5" />
          <text fill="currentColor" fillOpacity="0.55" fontSize="19" letterSpacing="1" style={{ fontFamily: "Georgia, serif" }}>
            <textPath href="#mbMid" startOffset="0" textLength="2538" lengthAdjust="spacing">{MID_RUNES}</textPath>
          </text>
          <circle cx={C} cy={C} r="382" stroke="currentColor" strokeWidth="0.6" strokeOpacity="0.3" />
        </g>

        {/* L3 — hero star cluster (CW), the brightest layer, with glow. */}
        <g className="folio-spin-med folio-glow">
          <circle cx={C} cy={C} r="356" stroke={BRIGHT} strokeWidth="1.6" strokeOpacity="0.85" />
          {star(7, 3, 348).map((p, i) => (
            <polygon key={`s7-${i}`} points={p} stroke="currentColor" strokeWidth="2" strokeOpacity="0.9" strokeLinejoin="round" />
          ))}
          {star(7, 2, 348).map((p, i) => (
            <polygon key={`s72-${i}`} points={p} stroke="currentColor" strokeWidth="1" strokeOpacity="0.4" strokeLinejoin="round" />
          ))}
          {HEPTA.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="11" stroke={BRIGHT} strokeWidth="1.5" strokeOpacity="0.9"
              className="folio-twinkle" style={{ animationDelay: `${(i * 0.42).toFixed(2)}s` }} />
          ))}
        </g>

        {/* L4 — inner sigil: hexagram + inner runes (fast CCW). */}
        <g className="folio-spin-fast">
          <circle cx={C} cy={C} r="210" stroke="currentColor" strokeWidth="0.8" strokeOpacity="0.45" />
          {star(6, 2, 196).map((p, i) => (
            <polygon key={`h1-${i}`} points={p} stroke="currentColor" strokeWidth="1.3" strokeOpacity="0.75" strokeLinejoin="round" />
          ))}
          <circle cx={C} cy={C} r="168" stroke="currentColor" strokeWidth="0.6" strokeOpacity="0.35" />
          <text fill="currentColor" fillOpacity="0.6" fontSize="14" letterSpacing="0.5" style={{ fontFamily: "Georgia, serif" }}>
            <textPath href="#mbInner" startOffset="0" textLength="942" lengthAdjust="spacing">{INNER_RUNES}</textPath>
          </text>
          <circle cx={C} cy={C} r="118" stroke="currentColor" strokeWidth="0.8" strokeOpacity="0.5" />
        </g>

        {/* Focal emblem (static, hot) */}
        <g className="folio-glow">
          {star(6, 2, 40).map((p, i) => (
            <polygon key={`e-${i}`} points={p} stroke={BRIGHT} strokeWidth="1.2" strokeOpacity="0.9" strokeLinejoin="round" />
          ))}
          <circle cx={C} cy={C} r="7" fill={BRIGHT} stroke="none" />
        </g>
      </svg>
    </div>
  );
}

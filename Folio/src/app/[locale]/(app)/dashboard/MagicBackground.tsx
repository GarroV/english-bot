// Ambient "magic circle" (魔法陣) behind the dashboard — v2, research-informed (anime summoning
// arrays + occult sacred geometry). Pure SVG + CSS keyframes: Server Component, no client JS,
// compositor-friendly (transform/opacity only). aria-hidden + pointer-events-none; freezes under
// prefers-reduced-motion. Four counter-rotating layers on coprime periods so they never resync.
// Shows through the gaps between opaque bento cards — never hurts card readability.

const C = 500; // viewBox centre
const TAU = Math.PI * 2;
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

// i-th of n points on a circle of radius R, first vertex at 12 o'clock.
function pt(i: number, n: number, R: number, phaseDeg = -90): [number, number] {
  const a = (phaseDeg * Math.PI) / 180 + (i / n) * TAU;
  return [C + R * Math.cos(a), C + R * Math.sin(a)];
}
const f = (n: number) => n.toFixed(1);

// Star polygon {n/k}: connect every k-th vertex. gcd(n,k)===1 → one unicursal stroke; else d
// components (e.g. {6/2} = two triangles). Returns an array of SVG `points` strings.
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

// Elder Futhark runes + numerals for the arc-text rings (decorative, arcane flavour).
const OUTER_RUNES = "ᚠ ᚢ ᚦ ᚨ ᚱ ᚲ ᚷ ᚹ ᚺ ᚾ ᛁ ᛃ ᛇ ᛈ ᛉ ᛊ ᛏ ᛒ ᛖ ᛗ ᛚ ᛜ ᛞ ᛟ";
const INNER_RUNES = "ᛝ ᛟ ᚦ ᛉ ᛃ ᛒ ᛗ ᛞ ᚨ ᚱ";
const DIGITS = "0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9";

// Degree scale: 72 minor ticks (every 5°), every 6th long (every 30°) — the "instrument" look.
const TICKS = Array.from({ length: 72 }, (_, i) => {
  const major = i % 6 === 0;
  const [x1, y1] = pt(i, 72, major ? 456 : 462);
  const [x2, y2] = pt(i, 72, 474);
  return { x1, y1, x2, y2, w: major ? 1.4 : 0.7 };
});
// Second, finer scale nearer the numerals.
const TICKS2 = Array.from({ length: 60 }, (_, i) => {
  const major = i % 5 === 0;
  const [x1, y1] = pt(i, 60, 372);
  const [x2, y2] = pt(i, 60, major ? 356 : 362);
  return { x1, y1, x2, y2, w: major ? 1.2 : 0.6 };
});

const HEPTA = Array.from({ length: 7 }, (_, i) => pt(i, 7, 340));      // satellite-node anchors
const GREEK = ["π", "δ", "ω", "ν"].map((ch, i) => ({ ch, p: pt(i, 4, 300) }));
const DIAMONDS = Array.from({ length: 8 }, (_, i) => pt(i, 8, 436));
const SEED = [[C, C] as [number, number], ...Array.from({ length: 6 }, (_, i) => pt(i, 6, 132))];

export function MagicBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden opacity-[0.2] dark:opacity-[0.36]"
    >
      <div className="folio-magic-glow" />
      <svg
        viewBox="0 0 1000 1000"
        className="h-[132%] max-h-none w-auto max-w-none min-w-[132%] text-primary [--accent:var(--brand-coral)]"
        fill="none"
      >
        <defs>
          <path id="mbRune" d="M500,500 m-452,0 a452,452 0 1,1 904,0 a452,452 0 1,1 -904,0" />
          <path id="mbDigit" d="M500,500 m-398,0 a398,398 0 1,0 796,0 a398,398 0 1,0 -796,0" />
          <path id="mbInner" d="M500,500 m-150,0 a150,150 0 1,1 300,0 a150,150 0 1,1 -300,0" />
          <radialGradient id="mbCore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.55" />
            <stop offset="55%" stopColor="var(--accent)" stopOpacity="0.14" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Underlay: Seed of Life + faint frame (static, gives density/depth) */}
        <g opacity="0.5">
          {SEED.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="132" stroke="currentColor" strokeWidth="0.6" />
          ))}
          <circle cx={C} cy={C} r="492" stroke="currentColor" strokeWidth="0.6" />
        </g>

        {/* Core glow fill */}
        <circle cx={C} cy={C} r="230" fill="url(#mbCore)" />

        {/* L1 — outer rim + degree ticks + runes + greek markers + diamonds (slow, CW) */}
        <g className="folio-spin-slow">
          <circle cx={C} cy={C} r="486" stroke="currentColor" strokeWidth="1.4" />
          <circle cx={C} cy={C} r="478" stroke="currentColor" strokeWidth="0.8" />
          {TICKS.map((t, i) => (
            <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="currentColor" strokeWidth={t.w} />
          ))}
          {DIAMONDS.map(([x, y], i) => (
            <rect key={i} x={x - 5} y={y - 5} width="10" height="10" transform={`rotate(45 ${f(x)} ${f(y)})`} stroke="var(--accent)" strokeWidth="1" />
          ))}
          <text fill="currentColor" fontSize="33" letterSpacing="2" style={{ fontFamily: "Georgia, serif" }}>
            <textPath href="#mbRune" startOffset="0" textLength="2840" lengthAdjust="spacingAndGlyphs">{OUTER_RUNES}</textPath>
          </text>
          {GREEK.map(({ ch, p }, i) => (
            <text key={i} x={p[0]} y={p[1]} fill="var(--accent)" fontSize="30" textAnchor="middle" dominantBaseline="central" style={{ fontFamily: "Georgia, serif" }}>{ch}</text>
          ))}
        </g>

        {/* L2 — numerals + segmented/dotted rings + finer scale (medium, CCW) */}
        <g className="folio-spin-rev">
          <circle cx={C} cy={C} r="420" stroke="var(--accent)" strokeWidth="1" pathLength={360} strokeDasharray="2 8" />
          <circle cx={C} cy={C} r="410" stroke="currentColor" strokeWidth="1.1" />
          <circle cx={C} cy={C} r="388" stroke="currentColor" strokeWidth="3" strokeLinecap="round" pathLength={90} strokeDasharray="0 1" />
          {TICKS2.map((t, i) => (
            <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="currentColor" strokeWidth={t.w} />
          ))}
          <text fill="currentColor" fontSize="24" letterSpacing="3" style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>
            <textPath href="#mbDigit" startOffset="0" textLength="2500" lengthAdjust="spacingAndGlyphs">{DIGITS}</textPath>
          </text>
        </g>

        {/* L3 — nested star polygons + satellite nodes (medium, CW) */}
        <g className="folio-spin-med">
          <circle cx={C} cy={C} r="345" stroke="var(--accent)" strokeWidth="1.4" />
          <circle cx={C} cy={C} r="300" stroke="currentColor" strokeWidth="0.7" />
          {star(7, 3, 340).map((p, i) => (
            <polygon key={`s7-${i}`} points={p} stroke="var(--accent)" strokeWidth="1.6" strokeLinejoin="round" />
          ))}
          {star(8, 3, 300, -90 + 22.5).map((p, i) => (
            <polygon key={`s8-${i}`} points={p} stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
          ))}
          {HEPTA.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="13" stroke="var(--accent)" strokeWidth="1.5"
              className="folio-twinkle" style={{ animationDelay: `${(i * 0.45).toFixed(2)}s` }} />
          ))}
        </g>

        {/* L4 — inner sigil: hexagram + inner runes (fast, CCW) */}
        <g className="folio-spin-fast">
          <circle cx={C} cy={C} r="210" stroke="currentColor" strokeWidth="1" />
          {star(6, 2, 196).map((p, i) => (
            <polygon key={`h1-${i}`} points={p} stroke={i === 0 ? "currentColor" : "var(--accent)"} strokeWidth="1.3" strokeLinejoin="round" />
          ))}
          <circle cx={C} cy={C} r="168" stroke="var(--accent)" strokeWidth="0.7" />
          <text fill="var(--accent)" fontSize="22" letterSpacing="2" style={{ fontFamily: "Georgia, serif" }}>
            <textPath href="#mbInner" startOffset="0" textLength="942" lengthAdjust="spacingAndGlyphs">{INNER_RUNES}</textPath>
          </text>
          <circle cx={C} cy={C} r="120" stroke="currentColor" strokeWidth="0.8" />
          {star(6, 2, 104).map((p, i) => (
            <polygon key={`h2-${i}`} points={p} stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round" />
          ))}
        </g>

        {/* Focal emblem — sun/moon (static) */}
        <circle cx={C} cy={C} r="30" stroke="var(--accent)" strokeWidth="1.4" />
        <circle cx={C + 9} cy={C - 3} r="24" stroke="currentColor" strokeWidth="1" />
        <circle cx={C} cy={C} r="6" fill="var(--accent)" stroke="none" />
      </svg>
    </div>
  );
}

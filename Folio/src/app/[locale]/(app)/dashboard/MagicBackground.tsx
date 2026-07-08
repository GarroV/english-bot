// Ambient "magic circle" behind the dashboard: counter-rotating rings of runes and numerals around
// an inscribed pentagram, with a soft pulsing glow. Pure SVG + CSS keyframes (folio-spin/pulse in
// globals.css) — Server Component, no client JS, compositor-friendly (transform/opacity only).
// aria-hidden + pointer-events-none; freezes under prefers-reduced-motion. Shows through the empty
// space between the opaque bento cards, so it never hurts card readability.

// Elder Futhark runes (Unicode) for the outer/inner rings — decorative, arcane flavour.
const OUTER_RUNES = "ᚠ ᚢ ᚦ ᚨ ᚱ ᚲ ᚷ ᚹ ᚺ ᚾ ᛁ ᛃ ᛇ ᛈ ᛉ ᛊ ᛏ ᛒ ᛖ ᛗ ᛚ ᛜ ᛞ ᛟ";
const INNER_RUNES = "ᛝ ᛟ ᚦ ᛉ ᛃ ᛒ ᛗ ᛞ";
const DIGITS = "0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5";

// 72 radial ticks around the outer ring (every 6th is longer) — generated, not hand-authored.
const TICKS = Array.from({ length: 72 }, (_, i) => {
  const a = (i / 72) * Math.PI * 2;
  const long = i % 6 === 0;
  const r1 = long ? 458 : 464;
  return {
    x1: 500 + r1 * Math.cos(a), y1: 500 + r1 * Math.sin(a),
    x2: 500 + 470 * Math.cos(a), y2: 500 + 470 * Math.sin(a),
    w: long ? 1.4 : 0.7,
  };
});

// Pentagram vertices (r=330 from centre, first point at top) — also used to place accent nodes.
const STAR = "500,170 694,767 186.1,398 813.9,398 306,767";
const NODES = [[500, 170], [694, 767], [186.1, 398], [813.9, 398], [306, 767]];

export function MagicBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden opacity-[0.18] dark:opacity-[0.34]"
    >
      <div className="folio-magic-glow" />
      <svg
        viewBox="0 0 1000 1000"
        className="h-[125%] max-h-none w-auto max-w-none min-w-[125%] text-primary [--accent:var(--brand-coral)]"
        fill="none"
      >
        <defs>
          <path id="runeRing" d="M500,500 m-452,0 a452,452 0 1,1 904,0 a452,452 0 1,1 -904,0" />
          <path id="digitRing" d="M500,500 m-388,0 a388,388 0 1,1 776,0 a388,388 0 1,1 -776,0" />
          <path id="innerRunes" d="M500,500 m-196,0 a196,196 0 1,1 392,0 a196,196 0 1,1 -392,0" />
        </defs>

        {/* Outer ring: runes + ticks (slow, clockwise) */}
        <g className="folio-spin-slow">
          <circle cx="500" cy="500" r="480" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="500" cy="500" r="470" stroke="currentColor" strokeWidth="0.8" />
          {TICKS.map((t, i) => (
            <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="currentColor" strokeWidth={t.w} />
          ))}
          <text fill="currentColor" fontSize="34" letterSpacing="2" style={{ fontFamily: "var(--font-heading, Georgia), serif" }}>
            <textPath href="#runeRing" startOffset="0" textLength="2840" lengthAdjust="spacing">{OUTER_RUNES}</textPath>
          </text>
        </g>

        {/* Numerals ring (medium, counter-clockwise) */}
        <g className="folio-spin-rev">
          <circle cx="500" cy="500" r="410" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="500" cy="500" r="366" stroke="var(--accent)" strokeWidth="0.8" />
          <text fill="currentColor" fontSize="26" letterSpacing="4" style={{ fontFamily: "var(--font-mono, ui-monospace), monospace", fontWeight: 600 }}>
            <textPath href="#digitRing" startOffset="0" textLength="2438" lengthAdjust="spacing">{DIGITS}</textPath>
          </text>
        </g>

        {/* Pentagram in a circle (medium, clockwise) */}
        <g className="folio-spin-med">
          <circle cx="500" cy="500" r="330" stroke="var(--accent)" strokeWidth="1.6" />
          <polygon points={STAR} stroke="var(--accent)" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
          {NODES.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="12" stroke="var(--accent)" strokeWidth="1.6" fill="none" />
          ))}
        </g>

        {/* Inner sigil: hexagram + runes (fast, counter-clockwise) */}
        <g className="folio-spin-fast">
          <circle cx="500" cy="500" r="210" stroke="currentColor" strokeWidth="1" />
          <polygon points="500,290 681,631 319,631" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <polygon points="500,710 319,369 681,369" stroke="var(--accent)" strokeWidth="1.2" fill="none" />
          <text fill="var(--accent)" fontSize="26" letterSpacing="2" style={{ fontFamily: "var(--font-heading, Georgia), serif" }}>
            <textPath href="#innerRunes" startOffset="0" textLength="1231" lengthAdjust="spacing">{INNER_RUNES}</textPath>
          </text>
          <circle cx="500" cy="500" r="120" stroke="currentColor" strokeWidth="0.8" />
        </g>

        <circle cx="500" cy="500" r="8" stroke="var(--accent)" strokeWidth="1.4" />
      </svg>
    </div>
  );
}

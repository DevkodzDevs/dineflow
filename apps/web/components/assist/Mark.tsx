/**
 * The Assist mark: a flip tile with a four-point spark where the numeral would be and the hinge
 * line through it. Three states: idle (the spark breathes), thinking (the tile turns over on its
 * hinge, like a digit changing), alert (the spark goes ember and a ring pulses once).
 *
 * Idle is built in layers (2026-10-22, the owner: "a lightweight feel"). The mark is on every screen and idle forever,
 * and its breathing ran on shapes *inside* one SVG — the browser cannot hand those to the compositor, so it restyled and
 * repainted the page's main thread every frame for as long as the app was open (measured on a 4×-slow phone: the main
 * thread never rested). Now the glow is a box with a radial gradient and the spark its own small SVG over the tile, each
 * animating only opacity and transform on its own layer — the same look, off the main thread. Thinking and alert last
 * seconds and keep the single SVG (the tile flips with its spark).
 */
export type MarkState = "idle" | "thinking" | "alert";
const SPARK = "M16 8.5c.6 3.6 2.9 6 6.5 7.5-3.6 1.5-5.9 3.9-6.5 7.5-.6-3.6-2.9-6-6.5-7.5 3.6-1.5 5.9-3.9 6.5-7.5Z";
const Defs = ({ spark }: { spark: string }) => (
  <defs>
    <linearGradient id="am-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#33343e" /><stop offset=".5" stopColor="#24252d" /><stop offset=".5" stopColor="#1a1b22" /><stop offset="1" stopColor="#1f2027" /></linearGradient>
    <radialGradient id="am-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor={spark} stopOpacity=".6" /><stop offset="1" stopColor={spark} stopOpacity="0" /></radialGradient>
  </defs>
);
const Tile = () => (<>
  <rect x="4" y="4" width="24" height="24" rx="6.5" fill="url(#am-tile)" stroke="#0a0a0d" strokeWidth="1.6" />
  <rect x="4.8" y="4.8" width="22.4" height="1" rx=".5" fill="#fff" fillOpacity=".08" />
</>);
const Hinges = () => (<>
  <rect x="2.6" y="12.6" width="2.4" height="6.8" rx="1.2" fill="#3a3b45" stroke="#0a0a0d" strokeWidth="1" />
  <rect x="27" y="12.6" width="2.4" height="6.8" rx="1.2" fill="#3a3b45" stroke="#0a0a0d" strokeWidth="1" />
</>);
const HingeLine = () => <rect x="4" y="15.3" width="24" height="1.4" fill="#0a0a0d" />;

export function AssistMark({ size = 28, state = "idle", className }: { size?: number; state?: MarkState; className?: string }) {
  const spark = state === "alert" ? "#ff453a" : "#4cd964";
  if (state === "idle") {
    const layer = { position: "absolute", inset: 0, width: size, height: size, overflow: "visible" } as const;
    return (
      <span className={`am am-idle relative inline-block shrink-0 ${className ?? ""}`} style={{ width: size, height: size }} aria-hidden>
        {/* the glow: r 15 of 32 around the centre, as the SVG circle was */}
        <span className="am-halo-l" style={{ position: "absolute", inset: size / 32, borderRadius: "50%", background: `radial-gradient(closest-side, ${spark}99, ${spark}00)` }} />
        <svg viewBox="0 0 32 32" fill="none" style={layer}><Defs spark={spark} /><Tile /><Hinges /></svg>
        <svg viewBox="0 0 32 32" fill="none" style={layer} className="am-spark-l"><path d={SPARK} fill={spark} /></svg>
        <svg viewBox="0 0 32 32" fill="none" style={layer}><HingeLine /></svg>
      </span>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={`am am-${state} ${className ?? ""}`} aria-hidden style={{ overflow: "visible" }}>
      <Defs spark={spark} />
      <circle className="am-ring" cx="16" cy="16" r="15" stroke={spark} strokeWidth="1.5" fill="none" opacity="0" />
      <circle className="am-halo" cx="16" cy="16" r="15" fill="url(#am-glow)" />
      <g className="am-tile">
        <Tile />
        <path className="am-spark" d={SPARK} fill={spark} />
        <HingeLine />
      </g>
      <Hinges />
    </svg>
  );
}

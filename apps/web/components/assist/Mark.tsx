/**
 * The Assist mark: a flip tile with a four-point spark where the numeral would be and the hinge
 * line through it. Three states: idle (the spark breathes), thinking (the tile turns over on its
 * hinge, like a digit changing), alert (the spark goes ember and a ring pulses once).
 */
export type MarkState = "idle" | "thinking" | "alert";
export function AssistMark({ size = 28, state = "idle", className }: { size?: number; state?: MarkState; className?: string }) {
  const spark = state === "alert" ? "#ff453a" : "#4cd964";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={`am am-${state} ${className ?? ""}`} aria-hidden style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="am-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#33343e" /><stop offset=".5" stopColor="#24252d" /><stop offset=".5" stopColor="#1a1b22" /><stop offset="1" stopColor="#1f2027" /></linearGradient>
        <radialGradient id="am-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor={spark} stopOpacity=".6" /><stop offset="1" stopColor={spark} stopOpacity="0" /></radialGradient>
      </defs>
      <circle className="am-ring" cx="16" cy="16" r="15" stroke={spark} strokeWidth="1.5" fill="none" opacity="0" />
      <circle className="am-halo" cx="16" cy="16" r="15" fill="url(#am-glow)" />
      <g className="am-tile">
        <rect x="4" y="4" width="24" height="24" rx="6.5" fill="url(#am-tile)" stroke="#0a0a0d" strokeWidth="1.6" />
        <rect x="4.8" y="4.8" width="22.4" height="1" rx=".5" fill="#fff" fillOpacity=".08" />
        <path className="am-spark" d="M16 8.5c.6 3.6 2.9 6 6.5 7.5-3.6 1.5-5.9 3.9-6.5 7.5-.6-3.6-2.9-6-6.5-7.5 3.6-1.5 5.9-3.9 6.5-7.5Z" fill={spark} />
        <rect x="4" y="15.3" width="24" height="1.4" fill="#0a0a0d" />
      </g>
      <rect x="2.6" y="12.6" width="2.4" height="6.8" rx="1.2" fill="#3a3b45" stroke="#0a0a0d" strokeWidth="1" />
      <rect x="27" y="12.6" width="2.4" height="6.8" rx="1.2" fill="#3a3b45" stroke="#0a0a0d" strokeWidth="1" />
    </svg>
  );
}

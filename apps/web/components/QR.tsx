"use client";
import { useEffect, useState } from "react";

const INK = "#10201a";   // the receipt's ink green; reads as black to a scanner

/** A QR code drawn in the browser. Shows a shimmer square until the code is ready. */
export function QR({ value, size = 140, label, className = "" }: { value: string; size?: number; label?: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    qrDataUrl(value, size).then((s) => { if (on) setSrc(s); });
    return () => { on = false; };
  }, [value, size]);
  return (
    <div className={`inline-flex flex-col items-center ${className}`}>
      {src ? <img src={src} width={size} height={size} alt={value} /> : <div className="shimmer rounded" style={{ width: size, height: size }} />}
      {label && <div className="text-xs mt-1">{label}</div>}
    </div>
  );
}

/** The same code as a data URL, for markup that is built as a string (the browser print fallback). */
export async function qrDataUrl(value: string, size = 160) {
  const q = await import("qrcode");
  return q.toDataURL(value, { width: size, margin: 1, color: { dark: INK, light: "#ffffff" } });
}

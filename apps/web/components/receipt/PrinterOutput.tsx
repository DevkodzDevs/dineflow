"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Printer as PrinterIcon, Scissors } from "lucide-react";
import { Receipt, PAPER_PX, type ReceiptData } from "./Receipt";

/**
 * The bill coming out of the machine.
 *
 * Alignment rules that matter here:
 *  - the printer body is exactly BEZEL px wider than the paper on each side,
 *  - the slot, the paper column and the machine share one centre line,
 *  - the sheet is clipped to the slot while it feeds, so no torn top edge
 *    is ever visible above the teeth.
 */
const BEZEL = 22;

export function PrinterOutput({ data, printing, onTear, label = "Counter printer" }: { data: ReceiptData; printing?: boolean; onTear?: () => void; label?: string }) {
  const reduce = useReducedMotion();
  const paperW = PAPER_PX[data.width ?? 80];
  const bodyW = paperW + BEZEL * 2;
  const [phase, setPhase] = useState<"idle" | "feeding" | "done" | "torn">(printing ? "feeding" : "done");
  const paperRef = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);

  useLayoutEffect(() => { if (paperRef.current) setH(paperRef.current.offsetHeight); }, [data]);
  useEffect(() => {
    if (!printing) return;
    setPhase("feeding");
    const t = setTimeout(() => setPhase("done"), reduce ? 0 : 2000);
    return () => clearTimeout(t);
  }, [printing, reduce]);

  const feeding = phase === "feeding";
  const visible = phase === "torn" ? 0 : h;

  return (
    <div className="printer flex flex-col items-center" style={{ width: bodyW }}>
      {/* ── machine ─────────────────────────────────────────────── */}
      <div className="printer-body" style={{ width: bodyW }}>
        <span className="printer-led" aria-hidden />
        <div className="flex items-center gap-2 text-white/55 text-[11px] font-semibold mb-3" style={{ paddingLeft: 68, paddingRight: 38 }}>
          <PrinterIcon size={13} className="shrink-0" />
          <span className="truncate">{label}</span>
          <span className="ml-auto num tracking-[0.16em] shrink-0">{feeding ? "PRINTING" : "READY"}</span>
        </div>
        {/* slot is exactly as wide as the paper, centred in the body */}
        <div className="relative mx-auto" style={{ width: paperW }}>
          <div className="printer-slot" />
          <span className="printer-teeth" aria-hidden />
        </div>
      </div>

      {/* ── paper: same width, same centre line, clipped to the slot ── */}
      <div className="printer-out overflow-hidden" style={{ width: paperW, height: visible, transition: `height ${feeding ? 0 : 0.45}s var(--ease-out)` }}>
        <motion.div
          initial={reduce || !printing ? false : { y: -h }}
          animate={{ y: phase === "torn" ? -h - 48 : 0, opacity: phase === "torn" ? 0 : 1 }}
          transition={reduce ? { duration: 0 } : phase === "torn" ? { duration: 0.45, ease: [0.16, 1, 0.3, 1] } : { duration: 2, ease: "linear" }}
          className={feeding && !reduce ? "feeding" : ""}
          style={{ width: paperW, transformOrigin: "top center" }}
        >
          <div className="relative" style={{ width: paperW }}>
            {/* shadow cast by the bezel onto the sheet, only across the paper */}
            <div className="absolute inset-x-0 top-0 h-6 z-10 pointer-events-none" style={{ background: "linear-gradient(180deg, rgb(13 28 23 / .38), rgb(13 28 23 / .06) 55%, transparent)" }} />
            <Receipt ref={paperRef} data={data} noTopEdge />
          </div>
        </motion.div>
      </div>

      {phase === "done" && onTear && (
        <motion.button initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          onClick={() => { setPhase("torn"); setTimeout(onTear, 420); }}
          className="no-print mt-4 flex items-center gap-2 text-xs font-semibold text-steel hover:text-ink transition">
          <Scissors size={14} /> Tear off
        </motion.button>
      )}
    </div>
  );
}

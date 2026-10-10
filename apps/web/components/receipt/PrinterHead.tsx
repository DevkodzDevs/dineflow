import { Printer as PrinterIcon } from "lucide-react";

/**
 * The machine the order page's KOT tickets come out of — the same body, vent, LED, slot and teeth as
 * the bill's `PrinterOutput`, without the feed: the tickets are already printed.
 *
 * Its slots sit in the same grid as the tickets under it (`gap-4`, one column on a phone, two from
 * `sm`, the same `px-3.5 sm:px-5` inset), so each slot lies exactly over a first-row ticket. The page
 * pulls the tickets 4px up under it (`-mt-1`) and paints the machine above them (`z-[3]` over
 * `z-[1]`), so a ticket's top runs into the slot and the teeth bite its edge — and a ticket that
 * feeds in later slides out from behind the machine, not over it.
 */
export function PrinterHead({ label, status, slots }: { label: string; status: string; slots: 1 | 2 }) {
  return (
    <div className="printer-body relative z-[3]" role="img" aria-label={`${label} · ${status.toLowerCase()}`} data-printer>
      <span className="printer-led" aria-hidden />
      <div className="flex items-center gap-2 text-white/55 text-[11px] font-semibold mb-3 pl-[68px] pr-[38px]" aria-hidden>
        <PrinterIcon size={13} className="shrink-0" />
        <span className="truncate">{label}</span>
        <span className="ml-auto num tracking-[0.16em] shrink-0">{status}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 px-3.5 sm:px-5" aria-hidden>
        <div className="relative" data-slot><div className="printer-slot" /><span className="printer-teeth" /></div>
        {slots === 2 && <div className="relative hidden sm:block" data-slot><div className="printer-slot" /><span className="printer-teeth" /></div>}
      </div>
    </div>
  );
}

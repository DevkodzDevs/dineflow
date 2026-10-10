import { Printer as PrinterIcon } from "lucide-react";

/**
 * The machine a KOT ticket comes out of on the order page — the same body, vent, LED, slot and teeth
 * as the bill's `PrinterOutput`, without the feed: the ticket is already printed.
 *
 * One per ticket, so every ticket on the page hangs from a printer — on a phone the second and third
 * tickets used to hang in the air under the first one's machine. The slot is inset `px-3.5` and the
 * ticket under it gets the same inset (`PrintedTicket` in OrderDetail), so the slot lies exactly over
 * the paper. The page pulls the ticket 4px up under it (`-mt-1`) and paints the machine above it
 * (`z-[3]` over `z-[1]`), so the paper runs into the slot and the teeth bite its edge — and a ticket
 * that arrives later slides out from behind the machine, not over it.
 */
export function PrinterHead({ label, status }: { label: string; status: string }) {
  return (
    <div className="printer-body relative z-[3]" role="img" aria-label={`${label} · ${status.toLowerCase()}`} data-printer>
      <span className="printer-led" aria-hidden />
      <div className="flex items-center gap-2 text-white/55 text-[11px] font-semibold mb-3 pl-[68px] pr-[38px]" aria-hidden>
        <PrinterIcon size={13} className="shrink-0" />
        <span className="truncate">{label}</span>
        <span className="ml-auto num tracking-[0.16em] shrink-0">{status}</span>
      </div>
      <div className="relative mx-3.5" data-slot aria-hidden><div className="printer-slot" /><span className="printer-teeth" /></div>
    </div>
  );
}

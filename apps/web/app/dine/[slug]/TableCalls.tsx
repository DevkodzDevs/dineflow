"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { HandPlatter, Receipt, GlassWater, Check, Star } from "lucide-react";
import { cn } from "@/components/ui";
import { callTable, tableCalls } from "../actions";

type Kind = "waiter" | "bill" | "water";
const ASK: { k: Kind; label: string; done: string; Icon: typeof HandPlatter }[] = [
  { k: "waiter", label: "Call waiter", done: "Waiter called", Icon: HandPlatter },
  { k: "bill", label: "Bill please", done: "Bill asked for", Icon: Receipt },
  { k: "water", label: "Water", done: "Water asked for", Icon: GlassWater },
];

/**
 * At a table (the table's QR, 0103): three big buttons — Call waiter, Bill please, Water. A tap sends it to the
 * staff's Orders floor and their alert; the button then says it was sent and, once a waiter has tapped it on
 * their side, "On the way". A second tap while it is open sends nothing new. The page asks every 15 seconds.
 * Under them, a link to rate the meal (the feedback page, private to the property).
 */
export function TableCalls({ slug, token, table }: { slug: string; token: string; table: string }) {
  const [pending, start] = useTransition(); const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [calls, setCalls] = useState<{ kind: string; status: string }[]>([]);
  const load = useCallback(() => { void tableCalls(slug, token).then((r) => { if ("calls" in r && r.calls) setCalls(r.calls); }); }, [slug, token]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  const stateOf = (k: Kind) => calls.find((c) => c.kind === k)?.status ?? null;
  return (
    <div className="mb-6 rounded-[22px] border border-[var(--color-separator)] bg-[var(--color-bg-2)] p-4" data-table-calls>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-[15px] font-bold">Need something at {table}?</div>
        <span className="text-[12px] text-[var(--color-label-2)]">We come to you</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {ASK.map(({ k, label, done, Icon }) => {
          const st = stateOf(k);
          return (
            <button key={k} type="button" disabled={pending} data-call-kind={k} data-state={st ?? "none"}
              onClick={() => start(async () => { const r = await callTable(slug, token, k); if ("error" in r) setMsg({ text: r.error!, err: true }); else { setMsg({ text: r.call?.again ? "Already asked — someone will be with you shortly" : `${done} — someone will be with you shortly` }); load(); } })}
              className={cn("min-h-[84px] rounded-[18px] flex flex-col items-center justify-center gap-1.5 px-1 text-[13.5px] font-bold transition-colors",
                st === "open" ? "bg-[var(--color-orange-2)] text-[var(--color-orange)]" : st === "done" ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")}>
              {st === "done" ? <Check size={24} aria-hidden /> : <Icon size={24} aria-hidden />}
              <span className="leading-tight text-center">{st === "open" ? done : st === "done" ? "On the way" : label}</span>
            </button>
          );
        })}
      </div>
      {msg && <p role="status" aria-live="polite" className={cn("mt-3 text-[13.5px] font-semibold text-center", msg.err ? "text-[var(--color-red)]" : "text-[var(--color-green)]")} data-call-msg>{msg.text}</p>}
      <Link href={`/feedback/${slug}?t=${encodeURIComponent(token)}`} className="mt-3 min-h-11 rounded-xl flex items-center justify-center gap-1.5 text-[13.5px] font-semibold text-[var(--color-label-2)] hover:text-[var(--color-label)] hover:bg-[var(--color-fill)]" data-rate-link>
        <Star size={15} aria-hidden /> How was your meal? Rate us
      </Link>
    </div>
  );
}

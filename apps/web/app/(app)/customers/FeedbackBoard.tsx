"use client";
import { useMemo, useState, useTransition } from "react";
import { Star, Phone, MessageCircle, Check, QrCode } from "lucide-react";
import Link from "next/link";
import { Empty, cn, useToast } from "@/components/ui";
import { useLive } from "@/lib/useLive";
import { markFeedbackSeen } from "./actions";

export type Feedback = { id: string; rating: number; tags: string[]; comment: string | null; guest_name: string | null; guest_phone: string | null; status: "new" | "seen"; created_at: string; dining_tables: { name: string } | null };
const wa = (phone: string, text: string) => `https://wa.me/${phone.length === 10 ? "91" + phone : phone}?text=${encodeURIComponent(text)}`;
const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(new Date(iso)); };

function Stars({ n, size = 16 }: { n: number; size?: number }) {
  return <span className="inline-flex gap-0.5" aria-label={`${n} of 5 stars`}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} aria-hidden className={i <= n ? "fill-[var(--color-orange)] text-[var(--color-orange)]" : "text-[var(--color-label-3)]"} />)}</span>;
}

/**
 * What guests said from the feedback QR (0103): the average and the spread for the last 30 days, then each note,
 * newest first — three stars or fewer edged in red. A note with a phone has Call and WhatsApp; "Mark read" clears
 * it from the unread count. Only staff of this property see any of it.
 */
export function FeedbackBoard({ items, q, restaurant }: { items: Feedback[]; q: string; restaurant: string }) {
  useLive(["guest_feedback"]);
  const toast = useToast(); const [pending, start] = useTransition(); const [read, setRead] = useState<Set<string>>(new Set());
  const [only, setOnly] = useState<"all" | "low" | "new">("all");
  const month = useMemo(() => items.filter((f) => Date.now() - new Date(f.created_at).getTime() < 30 * 86400000), [items]);
  const avg = month.length ? month.reduce((a, f) => a + f.rating, 0) / month.length : 0;
  const spread = [5, 4, 3, 2, 1].map((n) => ({ n, c: month.filter((f) => f.rating === n).length }));
  const isNew = (f: Feedback) => f.status === "new" && !read.has(f.id);
  const needle = q.trim().toLowerCase();
  const list = items.filter((f) => (only === "low" ? f.rating <= 3 : only === "new" ? isNew(f) : true)
    && (!needle || [f.comment, f.guest_name, f.guest_phone, f.dining_tables?.name, ...f.tags].some((x) => (x ?? "").toLowerCase().includes(needle))));
  const counts = { all: items.length, low: items.filter((f) => f.rating <= 3).length, new: items.filter(isNew).length };

  return (
    <div className="space-y-4" data-feedback-board>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="feather !rounded-[22px] p-5 flex items-center gap-5 min-w-0">
          <div className="font-display num text-[56px] leading-none" data-feedback-avg>{month.length ? avg.toFixed(1) : "—"}</div>
          <div className="min-w-0"><Stars n={Math.round(avg)} size={20} /><div className="text-[13.5px] text-steel mt-1">{month.length} rating{month.length === 1 ? "" : "s"} in 30 days</div></div>
        </div>
        <div className="feather !rounded-[22px] p-5 min-w-0 space-y-1.5" aria-label="How the ratings spread">
          {spread.map(({ n, c }) => (
            <div key={n} className="flex items-center gap-3 text-[13px]">
              <span className="w-7 shrink-0 font-bold num">{n}★</span>
              <span className="flex-1 min-w-0 h-2.5 rounded-full bg-[var(--color-fill)] overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${month.length ? (c / month.length) * 100 : 0}%`, background: n <= 3 ? "var(--color-red)" : "var(--color-green)" }} /></span>
              <span className="w-8 shrink-0 text-right num text-steel">{c}</span>
            </div>))}
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
        {([["all", "All"], ["new", "Unread"], ["low", "3★ or less"]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setOnly(k)} aria-pressed={only === k} className={cn("shrink-0 !min-h-11 rounded-full px-4 inline-flex items-center gap-2 text-[13.5px] font-extrabold", only === k ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)]")}>
            {label}<b className="num text-[12px] opacity-80">{counts[k]}</b></button>))}
        <Link href="/settings/screens" className="ml-auto shrink-0 !min-h-11 rounded-full px-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-steel hover:bg-[var(--color-fill)]"><QrCode size={15} aria-hidden /> Feedback QR</Link>
      </div>

      {items.length === 0 ? <Empty title="No feedback yet" hint="Print the feedback QR from Settings → Screens & feedback." />
        : list.length === 0 ? <Empty title="Nothing here" hint="Try another filter." /> : (
        <div className="grid gap-3 lg:grid-cols-2" data-feedback-list>
          {list.map((f) => (
            <div key={f.id} data-feedback={f.id} className={cn("feather !rounded-[22px] p-4 flex flex-col gap-2.5 min-w-0 border-l-4", f.rating <= 3 ? "!border-l-[var(--color-red)]" : "!border-l-[var(--color-green)]")}>
              <div className="flex items-center gap-2 min-w-0">
                <Stars n={f.rating} />
                {isNew(f) && <span className="svc-chip lone st-late !min-h-6 !text-[11px] !px-2">New</span>}
                <span className="ml-auto shrink-0 text-[12.5px] text-steel">{f.dining_tables?.name ? `${f.dining_tables.name} · ` : ""}{ago(f.created_at)}</span>
              </div>
              {f.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{f.tags.map((t) => <span key={t} className="text-[12px] font-semibold rounded-full bg-[var(--color-fill)] px-2.5 py-1">{t}</span>)}</div>}
              {f.comment && <p className="text-[14.5px] leading-snug break-words">“{f.comment}”</p>}
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[13px] text-steel min-w-0 truncate">{f.guest_name ?? "Anonymous"}{f.guest_phone ? ` · ${f.guest_phone}` : ""}</span>
                <span className="ml-auto flex gap-2">
                  {f.guest_phone && <a href={`tel:${f.guest_phone}`} className="svc-btn quiet sm !min-h-11 !px-3" aria-label="Call the guest"><Phone size={16} aria-hidden /></a>}
                  {f.guest_phone && <a href={wa(f.guest_phone, `Hi${f.guest_name ? " " + f.guest_name.split(" ")[0] : ""}, this is ${restaurant}. Thank you for your feedback${f.rating <= 3 ? " — we are sorry about your visit and would like to make it right." : "!"}`)} target="_blank" rel="noreferrer" className="svc-btn quiet sm !min-h-11 !px-3" aria-label="WhatsApp the guest"><MessageCircle size={16} aria-hidden /></a>}
                  {isNew(f) && <button type="button" disabled={pending} data-feedback-seen className="svc-btn go sm !min-h-11 !px-4"
                    onClick={() => { setRead((s) => new Set(s).add(f.id)); start(async () => { const r = await markFeedbackSeen(f.id); if ("error" in r) { toast(r.error!, "err"); setRead((s) => { const n = new Set(s); n.delete(f.id); return n; }); } }); }}><Check size={16} aria-hidden /> Mark read</button>}
                </span>
              </div>
            </div>))}
        </div>)}
    </div>
  );
}

"use client";
import { useState } from "react";
import { Copy, Loader2, Megaphone, MessageCircle, Sparkles, Users } from "lucide-react";
import { Button, Card, Pill, Sheet, useToast } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { waHref, firstName } from "@/lib/wa";
import { inAudience, type Audience, type Facts, type Idea } from "@/lib/marketing";
import { marketingIdeas } from "./actions";

type Person = { id: string; phone: string; name: string | null; visits: number; points: number; first_visit_at: string | null; last_visit_at: string | null };
const WHO: Record<Audience, string> = { all: "Everyone", regulars: "Regulars", lapsed: "Not seen lately", new: "New this month", points: "Can redeem points" };

/**
 * Ideas from your sales. One press reads the last 30 days and comes back with up to four campaigns,
 * each resting on a number from those 30 days. Each one opens the list of guests it is for, with
 * the message typed and their first name in it — the owner sends them one by one from WhatsApp.
 */
export function MarketingIdeas({ customers, minRedeem }: { customers: Person[]; minRedeem: number }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ideas: Idea[]; facts: Facts; ai: boolean } | null>(null);
  const [open, setOpen] = useState<Idea | null>(null);
  const who = (a: Audience) => customers.filter((c) => inAudience(a, c, minRedeem));
  const get = async () => { setBusy(true); const r = await marketingIdeas(); setBusy(false); if ("error" in r) toast(r.error, "err"); else setRes(r); };
  const people = open ? who(open.audience) : [];

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <span className="h-10 w-10 rounded-xl grid place-items-center shrink-0 bg-[var(--color-fill)] text-[var(--color-tint)]"><Megaphone size={18} /></span>
        <div className="flex-1 min-w-[12rem]">
          <div className="text-[15px] font-semibold flex items-center gap-2">Ideas from your sales {res && (res.ai ? <Pill tone="ready"><Sparkles size={10} /> AI</Pill> : <Pill tone="gold">from your numbers</Pill>)}</div>
          <div className="text-xs text-[var(--color-label-2)]">{res
            ? `Last 30 days: ${res.facts.orders} orders, average ${formatINR(res.facts.avg_ticket, { whole: true })}${res.facts.top[0] ? `, best seller ${res.facts.top[0].name}` : ""}${res.facts.slowest_day ? `, quietest on ${res.facts.slowest_day}s` : ""}.`
            : "Campaigns built on your last 30 days — what sells, the quiet days, and who has not been back."}</div>
        </div>
        <Button variant={res ? "gray" : undefined} disabled={busy} onClick={get}>{busy ? <><Loader2 size={15} className="animate-spin" /> Reading…</> : res ? "Fresh ideas" : <><Sparkles size={15} /> Get ideas</>}</Button>
      </div>

      {res && res.ideas.length === 0 && <p className="mt-4 text-sm text-[var(--color-label-2)]">Not enough sales yet to say anything useful. Try again after a couple of weeks of orders.</p>}
      {res && res.ideas.length > 0 && (
        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {res.ideas.map((i, k) => {
            const list = who(i.audience); const n = list.length; const eg = firstName(list[0]?.name ?? "") || "there";
            return (
              <div key={k} className="min-w-0 rounded-2xl border border-[var(--color-separator)] p-4 flex flex-col gap-2">
                <div className="font-semibold text-[15px] leading-snug">{i.title}</div>
                <p className="text-xs text-[var(--color-label-2)]">{i.why}</p>
                <div className="flex flex-wrap gap-1.5"><Pill tone="ready">{i.offer}</Pill><Pill tone="served">{i.when}</Pill></div>
                <p className="text-[13px] rounded-xl bg-[var(--color-fill)] p-3 leading-relaxed">{i.message.replace(/\{name\}/g, eg)}</p>
                <div className="mt-auto flex gap-2 pt-1">
                  <button type="button" onClick={() => setOpen(i)} disabled={n === 0}
                    className="flex-1 min-h-11 rounded-full px-4 flex items-center justify-center gap-2 text-sm font-semibold bg-[var(--color-green-2)] text-[var(--color-green)] hover:brightness-110 transition disabled:opacity-50">
                    <Users size={15} className="shrink-0" /> {n ? `Send to ${n} · ${WHO[i.audience]}` : i.audience === "all" ? "No saved customers yet" : `No one in ${WHO[i.audience]} yet`}</button>
                  <button type="button" aria-label="Copy the message" onClick={() => { void navigator.clipboard.writeText(i.message.replace(/\{name\}/g, "").replace(/^Hi\s*,\s*/, "Hi, ")).then(() => toast("Message copied")); }} className="icon-btn !rounded-full bg-[var(--color-fill)] shrink-0"><Copy size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? `${open.title} · ${people.length}` : ""}>
        {open && (
          <div className="space-y-3">
            <p className="text-xs text-[var(--color-label-2)]">Each button opens WhatsApp with the message typed and the guest’s name in it. Send them one at a time — WhatsApp limits messages to people who have not saved your number.</p>
            <div className="rounded-2xl border border-[var(--color-separator)] divide-y divide-[var(--color-separator)] overflow-hidden">
              {people.slice(0, 300).map((c) => {
                const href = waHref(c.phone, open.message.replace(/\{name\}/g, firstName(c.name ?? "") || "there"));
                return (
                  <div key={c.id} className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0"><div className="font-semibold text-[14px] truncate">{c.name ?? c.phone}</div><div className="num text-[11px] text-[var(--color-label-2)]">{c.phone} · {c.visits} visit{c.visits === 1 ? "" : "s"}</div></div>
                    {href && <a href={href} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${c.name ?? c.phone}`} className="icon-btn !rounded-full bg-[var(--color-green-2)] text-[var(--color-green)] shrink-0"><MessageCircle size={15} /></a>}
                  </div>
                );
              })}
            </div>
            {people.length > 300 && <p className="text-xs text-[var(--color-label-2)]">Showing the first 300. Use the CSV on the Customers screen for the rest.</p>}
          </div>
        )}
      </Sheet>
    </Card>
  );
}

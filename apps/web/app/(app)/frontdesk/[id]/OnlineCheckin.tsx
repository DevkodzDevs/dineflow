"use client";
import { useState } from "react";
import { CheckCircle2, Copy, MessageCircle, Tablet } from "lucide-react";
import { Card, Pill, useToast } from "@/components/ui";
import { waHref, waDate, firstName } from "@/lib/wa";

type Pre = { nationality?: string; arrival_time?: string | null; requests?: string | null; id_type?: string; id_last4?: string } | null;

/**
 * Online check-in on the folio (migration 0081). Before the guest has filled it: the link, sent on
 * WhatsApp or copied, and "Open on this tablet" for a guest standing at the desk. After: what they
 * told us — arrival time, ID to look at, nationality, requests — so the desk is ready for them.
 */
export function OnlineCheckin({ token, base, at, pre, guest, phone, property, checkIn }: {
  token: string; base: string; at: string | null; pre: Pre; guest: string; phone: string | null; property: string; checkIn: string;
}) {
  const toast = useToast(); const [copied, setCopied] = useState(false);
  const url = `${base}/checkin/${token}`;
  const wa = waHref(phone, `Hi ${firstName(guest)}, save time at ${property}: check in online before you arrive on ${waDate(checkIn)} — it takes a minute. ${url}`);
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); toast("Check-in link copied"); setTimeout(() => setCopied(false), 2000); } catch { toast(url); } };
  const btn = "min-h-11 rounded-full px-4 flex items-center justify-center gap-2 text-sm font-semibold transition";

  return (
    <Card className="mt-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-steel">Online check-in</span>
        {at ? <Pill tone="ready"><CheckCircle2 size={11} /> done</Pill> : <Pill tone="gold">not yet</Pill>}
        {at && <span className="ml-auto text-xs text-steel">{new Date(at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}</span>}
      </div>
      {at && pre ? (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="min-w-0"><div className="text-[11px] text-steel">Arriving</div><div className="font-semibold num">{pre.arrival_time || "—"}</div></div>
          <div className="min-w-0"><div className="text-[11px] text-steel">ID to check</div><div className="font-semibold truncate">{pre.id_type} ••{pre.id_last4}</div></div>
          <div className="min-w-0"><div className="text-[11px] text-steel">Nationality</div><div className="font-semibold truncate">{pre.nationality || "—"}</div></div>
          <div className="min-w-0 col-span-2 sm:col-span-1"><div className="text-[11px] text-steel">Requests</div><div className="font-semibold text-[13px] leading-snug">{pre.requests || "—"}</div></div>
          {pre.nationality && pre.nationality.trim().toLowerCase() !== "indian" && <p className="col-span-2 sm:col-span-4 text-xs text-[var(--color-orange)]">Foreign national — check the passport and visa and file Form C within 24 hours of arrival.</p>}
        </div>
      ) : (
        <p className="mt-2 text-sm text-steel">Send the guest a link to fill in their details before they arrive, or hand them this screen on a tablet.</p>
      )}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
        {wa && <a href={wa} target="_blank" rel="noreferrer" className={`${btn} bg-[var(--color-green-2)] text-[var(--color-green)] hover:brightness-110`}><MessageCircle size={16} className="shrink-0" /> {at ? "Send again" : "Send on WhatsApp"}</a>}
        <button type="button" onClick={copy} className={`${btn} bg-[var(--color-fill)] text-[var(--color-label)] hover:brightness-110`}><Copy size={15} className="shrink-0" /> {copied ? "Copied" : "Copy link"}</button>
        <a href={`/checkin/${token}?kiosk=1`} className={`${btn} bg-[var(--color-fill)] text-[var(--color-label)] hover:brightness-110`}><Tablet size={15} className="shrink-0" /> Open on this tablet</a>
      </div>
    </Card>
  );
}

"use client";
import { useState, useTransition } from "react";
import { Copy, ExternalLink, QrCode } from "lucide-react";
import { Button, Field, Card } from "@/components/ui";
import { QR } from "../../labour/LabourClient";
import { saveBookingPage } from "./actions";

export function BookingPageClient({ base, r }: { base: string; r: { booking_slug: string | null; tagline: string | null; policies: string | null; advance_pct: number; booking_engine: boolean; name: string } }) {
  const [slug, setSlug] = useState(r.booking_slug ?? ""); const [msg, setMsg] = useState<string | null>(null); const [pending, start] = useTransition();
  const url = `${base}/book/${slug}`;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card><form className="space-y-4" action={(fd) => start(async () => { const x = await saveBookingPage(fd); setMsg("error" in x ? x.error! : "Saved"); })}>
        <Field label="Page address" hint="Letters, numbers and dashes"><div className="flex items-center gap-1"><span className="text-sm text-steel num">{base}/book/</span><input name="booking_slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} required /></div></Field>
        <Field label="Tagline"><input name="tagline" defaultValue={r.tagline ?? ""} placeholder="Sea-facing rooms, five minutes from the sunrise point" /></Field>
        <Field label="Policies shown to guests"><textarea name="policies" rows={3} defaultValue={r.policies ?? ""} placeholder="Free cancellation up to 48 hours. ID required at check-in." /></Field>
        <Field label="Advance to collect %" hint="Shown on the page; payment gateway comes next version"><input name="advance_pct" type="number" className="num" defaultValue={r.advance_pct} /></Field>
        <label className="flex items-center gap-2 text-sm normal-case"><input type="checkbox" name="booking_engine" defaultChecked={r.booking_engine} className="!w-auto" /> Accept direct bookings</label>
        {msg && <p className="text-sm text-mint">{msg}</p>}
        <Button disabled={pending}>Save</Button>
      </form></Card>
      <Card className="text-center h-fit"><div className="text-xs font-semibold uppercase tracking-wide text-steel mb-3">Share it</div>
        <QR value={url} size={160} /><div className="num text-xs mt-2 break-all">{url}</div>
        <div className="flex gap-2 mt-3"><Button size="sm" variant="outline" className="flex-1" onClick={() => navigator.clipboard.writeText(url)}><Copy size={14} /> Copy</Button><a href={url} target="_blank" rel="noreferrer" className="flex-1"><Button size="sm" className="w-full"><ExternalLink size={14} /> Open</Button></a></div>
        <p className="text-xs text-steel mt-3 text-left"><QrCode size={12} className="inline" /> Print the QR for your reception desk and visiting cards. Every booking through it costs you 0% commission instead of 15–20%.</p></Card>
    </div>
  );
}

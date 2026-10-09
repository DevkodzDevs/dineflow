"use client";
import { useState } from "react";
import { getClient } from "@/lib/supabase/lazy";
import { waDate } from "@/lib/wa";

export type View = {
  property: string; address: string | null; phone: string | null; booking_no: number; status: string;
  check_in: string; check_out: string; nights: number; adults: number; children: number; room_type: string | null;
  guest: { full_name: string | null; email: string | null; address: string | null; id_type: string | null; id_last4: string | null; phone_tail: string };
  precheckin: { nationality?: string; arrival_time?: string | null; requests?: string | null; id_type?: string; id_last4?: string } | null;
  done_at: string | null;
};
const IDS = ["Aadhaar", "Passport", "Driving licence", "Voter ID", "Other"];

/**
 * Online check-in. The guest confirms who they are before they arrive, so the desk hands over a key
 * instead of a form. Only the last four characters of the ID are asked for — the desk sees the
 * card itself on arrival. On the desk's tablet (`kiosk`) the finish screen asks for it back.
 */
export function CheckinClient({ token, initial, kiosk }: { token: string; initial: View | null; kiosk: boolean }) {
  const [v, setV] = useState(initial);
  const g = v?.guest; const p = v?.precheckin;
  const [f, setF] = useState({
    full_name: g?.full_name ?? "", email: g?.email ?? "", address: g?.address ?? "",
    id_type: p?.id_type ?? g?.id_type ?? "Aadhaar", id_last4: p?.id_last4 ?? g?.id_last4 ?? "",
    nationality: p?.nationality ?? "Indian", arrival_time: p?.arrival_time ?? "", requests: p?.requests ?? "", agree: false,
  });
  const [editing, setEditing] = useState(!v?.done_at);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  if (!v) return <main className="min-h-dvh grid place-items-center p-6 text-center"><div><h1 className="text-[28px]">This link has expired</h1><p className="text-[var(--color-label-2)] mt-2">The booking may already be checked in or closed. Please ask at the front desk.</p></div></main>;
  if (v.status === "checked_in") return <main className="min-h-dvh grid place-items-center p-6 text-center"><div><div className="eyebrow">{v.property}</div><h1 className="text-[30px] mt-1">You're checked in</h1><p className="text-[var(--color-label-2)] mt-2">Enjoy your stay. Message the desk any time.</p></div></main>;

  const submit = async () => {
    setBusy(true); setErr(null);
    const { error } = await (await getClient()).rpc("checkin_submit", { p_token: token, p_data: f });
    setBusy(false);
    if (error) { setErr(error.message.replace(/^.*?:\s*/, "")); return; }
    setV({ ...v, done_at: new Date().toISOString(), guest: { ...v.guest, full_name: f.full_name, email: f.email, address: f.address, id_type: f.id_type, id_last4: f.id_last4.toUpperCase() }, precheckin: { nationality: f.nationality, arrival_time: f.arrival_time || null, requests: f.requests || null, id_type: f.id_type, id_last4: f.id_last4.toUpperCase() } });
    setEditing(false);
    if (kiosk) window.scrollTo({ top: 0 });
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <main className="min-h-dvh max-w-lg mx-auto px-5 py-8">
      <div className="eyebrow">{v.property}</div>
      <h1 className="text-[32px] mt-1 leading-tight">{editing ? "Check in before you arrive" : kiosk ? "Thank you — all done" : "You're checked in online"}</h1>

      {/* the stay, so the guest knows this is theirs */}
      <div className="feather p-4 mt-5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 text-sm">
        <div className="min-w-0"><div className="text-[11px] uppercase tracking-wide text-[var(--color-label-2)]">Arrive</div><div className="font-semibold">{waDate(v.check_in)}</div></div>
        <div className="min-w-0"><div className="text-[11px] uppercase tracking-wide text-[var(--color-label-2)]">Leave</div><div className="font-semibold">{waDate(v.check_out)}</div></div>
        <div className="min-w-0 col-span-2 text-[var(--color-label-2)]">{v.room_type ?? "Room"} · {v.nights} night{v.nights === 1 ? "" : "s"} · {v.adults + v.children} guest{v.adults + v.children === 1 ? "" : "s"} · booking #{v.booking_no}</div>
      </div>

      {!editing ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl bg-[var(--color-green-2)] text-[var(--color-label)] p-4 text-[15px] leading-relaxed">
            {kiosk
              ? <>Please hand the tablet back to the desk. Your key will be ready in a moment.</>
              : <>See you on <b>{waDate(v.check_in)}</b>{v.precheckin?.arrival_time ? <> at about <b>{v.precheckin.arrival_time}</b></> : null}. At the desk, just show your <b>{v.precheckin?.id_type ?? v.guest.id_type}</b> ending <b>{v.precheckin?.id_last4 ?? v.guest.id_last4}</b> and collect your key.</>}
          </div>
          {!kiosk && <button type="button" onClick={() => setEditing(true)} className="btn btn-gray w-full !h-12">Change my details</button>}
          {!kiosk && v.phone && <p className="text-sm text-[var(--color-label-2)] text-center">Questions? Call <a className="underline" href={`tel:${v.phone}`}>{v.phone}</a></p>}
        </div>
      ) : (
        /* The form sits on white section cards: the paper page and a paper input are almost the same
           colour, so a field on the bare page has no edge at all. On a card every field shows its
           box, with a firm border, and focus still rings it in green. */
        <form className="ci-form mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <section className="feather p-4 sm:p-5 space-y-4">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-label-2)]">About you</h2>
            <div><label htmlFor="ci-name">Full name, as on your ID</label><input id="ci-name" value={f.full_name} onChange={set("full_name")} autoComplete="name" required /></div>
            <div><label htmlFor="ci-email">Email (for your bill)</label><input id="ci-email" type="email" value={f.email} onChange={set("email")} autoComplete="email" inputMode="email" placeholder="you@example.com" /></div>
            <div><label htmlFor="ci-addr">Home address</label><textarea id="ci-addr" rows={2} value={f.address} onChange={set("address")} autoComplete="street-address" required /></div>
          </section>
          <section className="feather p-4 sm:p-5 space-y-4">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-label-2)]">Your ID</h2>
            <div><label>ID you will show at the desk</label>
              <div className="flex flex-wrap gap-2">{IDS.map((x) => <button key={x} type="button" onClick={() => setF({ ...f, id_type: x })} aria-pressed={f.id_type === x} className={`chip ${f.id_type === x ? "on" : ""}`}>{x}</button>)}</div></div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
              <div className="min-w-0"><label htmlFor="ci-id4">Last 4 of the ID</label><input id="ci-id4" value={f.id_last4} maxLength={4} onChange={(e) => setF({ ...f, id_last4: e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase() })} className="num tracking-[0.3em]" autoComplete="off" placeholder="1234" required /></div>
              <div className="min-w-0"><label htmlFor="ci-nat">Nationality</label><input id="ci-nat" value={f.nationality} onChange={set("nationality")} autoComplete="country-name" /></div>
            </div>
            <p className="text-xs text-[var(--color-label-2)] leading-relaxed">We keep only the last four characters. The desk looks at the card itself when you arrive.{f.nationality.trim().toLowerCase() !== "indian" && f.nationality.trim() ? " Guests from outside India: please bring your passport and visa — the desk files Form C." : ""}</p>
          </section>
          <section className="feather p-4 sm:p-5 space-y-4">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-label-2)]">Your arrival</h2>
            <div><label htmlFor="ci-time">Arriving at about</label><input id="ci-time" type="time" value={f.arrival_time} onChange={set("arrival_time")} className="num" /></div>
            <div><label htmlFor="ci-req">Anything we should know?</label><textarea id="ci-req" rows={2} maxLength={300} value={f.requests} onChange={set("requests")} placeholder="Early check-in, extra bed, a quiet room, an allergy…" /></div>
          </section>
          <label className="feather !mb-0 p-4 flex items-start gap-3 text-sm normal-case !font-normal cursor-pointer min-h-11">
            <input type="checkbox" checked={f.agree} onChange={(e) => setF({ ...f, agree: e.target.checked })} className="!w-5 !h-5 mt-0.5 shrink-0" />
            <span>These details are correct, and I will show the ID above when I arrive.</span>
          </label>
          {err && <p className="text-sm text-[var(--color-red)]" role="alert">{err.charAt(0).toUpperCase() + err.slice(1)}.</p>}
          <div className="pt-1"><button type="submit" disabled={busy || !f.agree || !f.full_name || !f.address || f.id_last4.length !== 4} className="btn btn-filled w-full !h-[52px] !text-base">{busy ? "Saving…" : "Check in"}</button></div>
        </form>
      )}
    </main>
  );
}

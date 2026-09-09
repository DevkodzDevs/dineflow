"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Flip, Countdown } from "@/components/ui";

type S = { token: string; name: string; party: number; status: "waiting" | "called" | "seated" | "left"; place: number; waiting: number; minutes: number | null; table: string | null; restaurant: string };

/** The guest's page: join with a name and party size, then watch your place move up. Refreshes itself every 20 s. */
export function QueueClient({ slug, name, initial }: { slug: string; name: string | null; initial: S | null }) {
  const [s, setS] = useState<S | null>(initial); const [form, setForm] = useState({ name: "", phone: "", party: 2 }); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const sb = createClient();
  useEffect(() => { if (!s || s.status === "seated" || s.status === "left") return; const i = setInterval(async () => { const { data } = await sb.rpc("queue_status", { p_token: s.token }); if (data) setS(data as S); }, 20000); return () => clearInterval(i); }, [s, sb]);
  useEffect(() => { if (s?.token) history.replaceState(null, "", `?t=${s.token}`); }, [s?.token]);
  const join = async () => { setBusy(true); setErr(null); const { data, error } = await sb.rpc("queue_join", { p_slug: slug, p_name: form.name, p_phone: form.phone, p_party: form.party }); setBusy(false); if (error) setErr(error.message); else setS(data as S); };
  const leave = async () => { if (!s) return; await sb.rpc("queue_leave", { p_token: s.token }); setS({ ...s, status: "left" }); };

  if (!name) return <main className="min-h-dvh grid place-items-center p-6"><p className="text-[var(--color-label-2)]">This place isn't taking a queue right now.</p></main>;
  return (
    <main className="min-h-dvh max-w-md mx-auto px-5 py-8">
      <div className="eyebrow">{name}</div>
      {!s ? (<>
        <h1 className="text-[34px] mt-1">Join the queue</h1>
        <p className="text-[var(--color-label-2)] mt-2">Put your name down and watch your place from here. No app, nothing to download.</p>
        <div className="stack mt-6">
          <input placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Phone (optional, so we can call you)" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <div><label>How many of you</label><div className="flex gap-2 mt-2 flex-wrap">{[1, 2, 3, 4, 5, 6, 8].map((n) => <button key={n} onClick={() => setForm({ ...form, party: n })} className={`chip ${form.party === n ? "on" : ""}`}>{n}</button>)}</div></div>
          {err && <p className="text-sm text-[var(--color-red)]">{err}</p>}
          <button disabled={!form.name || busy} onClick={join} className="btn btn-filled w-full !h-[52px] !text-base">Join the queue</button>
        </div>
      </>) : s.status === "seated" ? (<>
        <h1 className="text-[34px] mt-1">Your table's ready</h1>
        <div className="flip-row justify-center my-10"><Flip value={s.table ?? "—"} label="table" tone="live" /></div>
        <p className="text-center text-[var(--color-label-2)]">Come on in, {s.name.split(" ")[0]}.</p>
      </>) : s.status === "left" ? (
        <h1 className="text-[34px] mt-1">You've left the queue</h1>
      ) : (<>
        <h1 className="text-[34px] mt-1">{s.status === "called" ? "You're up" : "You're in the queue"}</h1>
        <div className="flip-row justify-center my-10"><Flip value={s.place} label="your place" tone={s.status === "called" ? "live" : undefined} /><Countdown seconds={(s.minutes ?? 0) * 60} label="about" doneLabel="now" tone={s.status === "called" ? "live" : undefined} /></div>
        <p className="text-center text-[var(--color-label-2)]">{s.status === "called" ? "Please come to the host stand." : `${s.waiting} ${s.waiting === 1 ? "party" : "parties"} waiting · table for ${s.party}. This page updates itself.`}</p>
        <button onClick={leave} className="btn btn-gray w-full mt-10">Leave the queue</button>
      </>)}
    </main>
  );
}

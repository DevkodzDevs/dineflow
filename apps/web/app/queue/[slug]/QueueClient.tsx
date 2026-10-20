"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getClient } from "@/lib/supabase/lazy";
import { Flip, Countdown } from "@/components/ui";
import { GuestNotice } from "@/components/legal/GuestNotice";

type S = { token: string; name: string; party: number; status: "waiting" | "called" | "seated" | "left"; place: number; waiting: number; minutes: number | null; table: string | null; restaurant: string };

/** This device's place in this property's queue, so scanning the door code again (or coming back from the menu)
 *  shows the place instead of an empty form. A private window may refuse storage — the page works without it. */
const KEPT = (slug: string) => `df-queue:${slug}`;
const keep = (slug: string, token: string | null) => { try { if (token) localStorage.setItem(KEPT(slug), token); else localStorage.removeItem(KEPT(slug)); } catch {} };
const kept = (slug: string) => { try { return localStorage.getItem(KEPT(slug)); } catch { return null; } };

/** The guest's page: join with a name and party size, then watch your place move up. Refreshes itself every 20 s. */
export function QueueClient({ slug, name, initial }: { slug: string; name: string | null; initial: S | null }) {
  const router = useRouter();
  const [s, setS] = useState<S | null>(initial); const [form, setForm] = useState({ name: "", phone: "", party: 2 }); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  /* A guest opens this on their own phone, often on mobile data, and all it has to do at first is
     show a name and a form. The client is fetched when they actually press something. */
  useEffect(() => { if (!s || s.status === "seated" || s.status === "left") return; const i = setInterval(async () => { const { data } = await (await getClient()).rpc("queue_status", { p_token: s.token }); if (data) setS(data as S); }, 20000); return () => clearInterval(i); }, [s]);
  useEffect(() => { if (s?.token) history.replaceState(null, "", `?t=${s.token}`); }, [s?.token]);
  // a place this device already holds here comes back (2026-10-20: going Back never leaves the queue)
  useEffect(() => {
    if (initial) return; const t = kept(slug); if (!t) return;
    (async () => { const { data } = await (await getClient()).rpc("queue_status", { p_token: t }); const st = data as S | null; if (st && (st.status === "waiting" || st.status === "called")) setS(st); else keep(slug, null); })();
  }, [initial, slug]);
  useEffect(() => { if (!s) return; keep(slug, s.status === "waiting" || s.status === "called" ? s.token : null); }, [s, slug]);
  const join = async () => { setBusy(true); setErr(null); const { data, error } = await (await getClient()).rpc("queue_join", { p_slug: slug, p_name: form.name, p_phone: form.phone, p_party: form.party }); setBusy(false); if (error) setErr(error.message); else setS(data as S); };
  const leave = async () => { if (!s) return; await (await getClient()).rpc("queue_leave", { p_token: s.token }); setS({ ...s, status: "left" }); };
  /** Back to where they came from on this site; straight from the door code there is nowhere behind them, so the
   *  property's own page (the storefront the queue belongs to). Never leaves the queue. */
  const back = () => {
    try { if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) { history.back(); return; } } catch {}
    router.push(`/dine/${slug}`);
  };

  if (!name) return <main className="min-h-dvh grid place-items-center p-6"><p className="text-[var(--color-label-2)]">This place isn't taking a queue right now.</p></main>;
  const queued = !!s && (s.status === "waiting" || s.status === "called");
  return (
    <main className="min-h-dvh max-w-md mx-auto px-5 pt-4 pb-8">
      <button type="button" onClick={back} data-queue-back aria-label={queued ? "Back — your place in the queue is kept" : "Back"}
        className="!min-h-11 h-11 -ml-1 mb-4 inline-flex items-center gap-1 pl-2 pr-4 rounded-full bg-[var(--color-fill)] text-[15px] font-semibold text-[var(--color-label)] hover:bg-[var(--color-fill-2)] active:scale-[.97] transition">
        <ChevronLeft size={20} aria-hidden /> Back
      </button>
      <div className="eyebrow">{name}</div>
      {!s ? (<>
        <h1 className="text-[34px] mt-1">Join the queue</h1>
        <p className="text-[var(--color-label-2)] mt-2">Put your name down and watch your place from here. No app, nothing to download.</p>
        <div className="stack mt-6">
          <input placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Phone (optional, so we can call you)" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <div><label>How many of you</label><div className="flex gap-2 mt-2 flex-wrap">{[1, 2, 3, 4, 5, 6, 8].map((n) => <button key={n} onClick={() => setForm({ ...form, party: n })} className={`chip min-w-11 justify-center ${form.party === n ? "on" : ""}`}>{n}</button>)}</div></div>
          {err && <p className="text-sm text-[var(--color-red)]">{err}</p>}
          <button disabled={!form.name || busy} onClick={join} className="btn btn-filled w-full !h-[52px] !text-base">Join the queue</button>
          <GuestNotice property={name} use="to call you when your table is ready" />
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
        <p className="mt-3 text-center text-[13px] text-[var(--color-label-2)]" data-queue-kept>Going back keeps your place — scan the code or open this page again to see it.</p>
      </>)}
    </main>
  );
}

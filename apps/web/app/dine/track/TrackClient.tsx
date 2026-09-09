"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronLeft, Search, Phone, Clock, Check } from "lucide-react";
import { Button, Field, Pill, useToast } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { track } from "../actions";

const STEPS = ["new", "accepted", "ready", "picked_up"];
export function TrackClient() {
  const toast = useToast(); const [pending, start] = useTransition();
  const [f, setF] = useState({ ref: "", phone: "" }); const [res, setRes] = useState<Record<string, unknown> | null>(null);
  const r = res as never as { kind?: string; status?: string; ref?: string; name?: string; total?: number; date?: string; time?: string; party?: number; offer?: string; phone?: string; items?: { name: string; qty: number }[] } | null;
  return (
    <div className="min-h-dvh bg-[var(--color-bg)] p-5">
      <div className="max-w-md mx-auto pt-8">
        <Link href="/dine" className="inline-flex items-center gap-1.5 text-sm text-[var(--color-label-2)] mb-4"><ChevronLeft size={16} /> Back</Link>
        <h1 className="text-3xl">Track your <em>order</em></h1>
        <p className="text-sm text-[var(--color-label-2)] mt-1.5">Enter the reference you were given and the phone number you booked with.</p>
        <div className="card p-5 mt-5 space-y-3">
          <Field label="Reference"><input value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} placeholder="123456 or a booking number" className="num" /></Field>
          <Field label="Phone"><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="num" /></Field>
          <Button className="w-full" loading={pending} disabled={!f.ref || !f.phone}
            onClick={() => start(async () => { const x = await track(f.ref.trim(), f.phone.trim()) as { error?: string; result?: Record<string, unknown> | null }; if (x.error) toast(x.error, "err"); else if (!x.result) toast("Nothing found with that reference and number", "err"); else setRes(x.result); })}>
            <Search size={16} /> Find it
          </Button>
        </div>

        {r && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-5 mt-4">
            <div className="flex items-center justify-between"><h2 className="text-xl">{r.name}</h2><Pill tone={r.status === "cancelled" || r.status === "rejected" ? "alert" : r.status === "picked_up" || r.status === "completed" ? "ready" : "preparing"}>{String(r.status).replace("_", " ")}</Pill></div>
            {r.kind === "order" ? (<>
              <div className="flex items-center gap-1 mt-4">
                {STEPS.map((s, i) => { const at = STEPS.indexOf(String(r.status)); return (
                  <div key={s} className="flex-1"><div className={`h-1.5 rounded-full ${i <= at ? "bg-[var(--color-tint)]" : "bg-[var(--color-fill-2)]"}`} /><div className={`text-[10px] mt-1.5 capitalize ${i <= at ? "font-semibold" : "text-[var(--color-label-3)]"}`}>{s.replace("_", " ")}</div></div>); })}
              </div>
              <ul className="mt-4 text-sm space-y-1">{(r.items ?? []).map((i, n) => <li key={n} className="flex justify-between"><span>{i.qty} × {i.name}</span></li>)}</ul>
              <div className="flex justify-between font-bold mt-3 pt-3 border-t border-[var(--color-separator)]"><span>Total</span><span className="num">{formatINR(Number(r.total ?? 0))}</span></div>
            </>) : (<>
              <div className="text-sm mt-3 space-y-1"><div className="flex justify-between"><span className="text-[var(--color-label-2)]">When</span><span className="num">{r.date} · {r.time}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-label-2)]">Party</span><span className="num">{r.party}</span></div>
                {r.offer && <div className="flex justify-between"><span className="text-[var(--color-label-2)]">Offer</span><span className="font-semibold">{r.offer}</span></div>}</div>
            </>)}
            {r.phone && <a href={`tel:${r.phone}`}><Button variant="gray" className="w-full mt-4"><Phone size={15} /> Call {r.name}</Button></a>}
          </motion.div>
        )}
      </div>
    </div>
  );
}

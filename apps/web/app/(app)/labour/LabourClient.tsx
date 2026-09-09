"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, HardHat, QrCode, Printer, Check, Banknote, Pencil } from "lucide-react";
import { Button, Sheet, Field, Card, Pill, StatTile, cn, Empty } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { LABOUR_SKILLS } from "@dineflow/shared";
import { saveLabourer, setLabourStatus, markAttendance, payLabour, punchCode } from "./actions";

type L = { id: string; code: string; full_name: string; phone: string | null; skill: string | null; daily_wage: number; id_type: string | null; id_last4: string | null; address: string | null; emergency_contact: string | null; notes: string | null; joined_on: string; status: string };
type A = { id: string; labourer_id: string; work_date: string; in_at: string | null; out_at: string | null; hours: number | null; wage: number };
type P = { id: string; labourer_id: string; amount: number; method: string; period_from: string | null; period_to: string | null; created_at: string };

export function LabourClient({ today, labourers, attendance, payments, tab, openId, rooms, ingredients, property }: { today: string; labourers: L[]; attendance: A[]; payments: P[]; tab: "today" | "wages" | "labels"; openId: string | null; rooms: { id: string; number: string; floor: number }[]; ingredients: { id: string; name: string; unit: string; barcode: string | null }[]; property: string }) {
  const [edit, setEdit] = useState<Partial<L> | null>(openId ? labourers.find((l) => l.id === openId) ?? null : null);
  const [pay, setPay] = useState<L | null>(null); const [err, setErr] = useState<string | null>(null); const [pending, start] = useTransition(); const [code, setCode] = useState(""); const [toast, setToast] = useState<string | null>(null);
  const active = labourers.filter((l) => l.status === "active");
  const todayAtt = attendance.filter((a) => a.work_date === today);
  const byL = (id: string) => attendance.filter((a) => a.labourer_id === id);
  const earned = (id: string) => byL(id).reduce((t, a) => t + Number(a.wage), 0);
  const paid = (id: string) => payments.filter((p) => p.labourer_id === id).reduce((t, p) => t + Number(p.amount), 0);
  const monthWages = active.reduce((t, l) => t + earned(l.id), 0); const monthPaid = active.reduce((t, l) => t + paid(l.id), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Present today" value={`${todayAtt.length} / ${active.length}`} tone={todayAtt.length === active.length && active.length ? "good" : undefined} />
        <StatTile label="Today's wages" value={formatINR(todayAtt.reduce((t, a) => t + Number(a.wage), 0))} delay={0.05} />
        <StatTile label="This month" value={formatINR(monthWages)} sub={`${attendance.length} man-days`} delay={0.1} />
        <StatTile label="Due to pay" value={formatINR(Math.max(0, monthWages - monthPaid))} sub={`${formatINR(monthPaid)} paid`} tone={monthWages - monthPaid > 0 ? "alert" : "good"} delay={0.15} />
      </div>
      <div className="toolbar"><div className="toolbar-group">
        {[["today", "Today"], ["wages", "Wages & payments"], ["labels", "QR labels"]].map(([k, l]) => <Link key={k} href={`/labour?tab=${k}`} className={cn("chip", tab === k && "on")}>{l}</Link>)}
        <form className="ml-2 flex gap-1" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await punchCode(code); if ("error" in r) setErr(r.error!); else { const x = r as unknown as { name: string; event: string; hours?: number }; setToast(`${x.name} · ${x.event === "in" ? "punched IN" : x.event === "out" ? `punched OUT · ${x.hours} h` : "already done today"}`); setCode(""); } }); }}><input placeholder="Badge code L0001" value={code} onChange={(e) => setCode(e.target.value)} className="num !w-40 !py-2 uppercase" /><Button variant="outline" aria-label="Punch"><QrCode size={16} /></Button></form>
        </div><div className="toolbar-group toolbar-end"><Button onClick={() => setEdit({ daily_wage: 500, skill: "other" })}><Plus size={16} /> Labourer</Button></div>
      </div>
      {toast && <div className="feather p-3 text-sm flex items-center gap-2 border-mint"><Check size={15} className="text-mint" /> {toast}</div>}
      {err && <p className="text-sm text-chili">{err}</p>}

      {tab === "today" && (active.length === 0 ? <Empty title="No labourers yet" hint="Add workers here, or scan their ID card on the Scan page." action={<Link href="/scan"><Button>Scan an ID</Button></Link>} /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((l, i) => { const a = todayAtt.find((x) => x.labourer_id === l.id); return (
            <motion.div key={l.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card lift className={cn("h-full", a && "border-mint")}>
                <div className="flex items-start gap-3"><span className={cn("h-11 w-11 rounded-2xl grid place-items-center font-display text-lg", a ? "bg-mint-2 text-ink" : "bg-ink text-champagne")}>{l.full_name.slice(0, 1)}</span>
                  <div className="flex-1 min-w-0"><div className="font-semibold truncate">{l.full_name}</div><div className="text-xs text-steel">{l.skill} · <span className="num">{l.code}</span> · {formatINR(Number(l.daily_wage))}/day</div></div>
                  <button onClick={() => setEdit(l)} className="text-steel hover:text-ink"><Pencil size={14} /></button></div>
                <div className="mt-3 flex items-center gap-2 text-xs">{a ? <><Pill tone="ready">present</Pill><span className="num text-steel">{a.in_at ? new Date(a.in_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}{a.out_at ? ` → ${new Date(a.out_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · ${a.hours} h` : ""}</span></> : <Pill tone="pending">absent</Pill>}
                  <span className="ml-auto num text-steel">{byL(l.id).length} days this month</span></div>
                <div className="mt-3 flex gap-2">{a ? <Button size="sm" variant="outline" className="flex-1" disabled={pending} onClick={() => start(() => { markAttendance(l.id, today, false, 0); })}>Mark absent</Button> : <Button size="sm" className="flex-1" disabled={pending} onClick={() => start(() => { markAttendance(l.id, today, true, Number(l.daily_wage)); })}><Check size={14} /> Mark present</Button>}<Button size="sm" variant="ghost" onClick={() => setPay(l)}><Banknote size={14} /></Button></div>
              </Card></motion.div>); })}
        </div>
      ))}

      {tab === "wages" && (
        <div className="feather overflow-x-auto table-wrap"><table className="w-full text-sm min-w-[720px]"><thead><tr><th className="text-left px-4 py-3">Worker</th><th className="text-right px-4 py-3">Days</th><th className="text-right px-4 py-3">Hours</th><th className="text-right px-4 py-3">Earned</th><th className="text-right px-4 py-3">Paid</th><th className="text-right px-4 py-3">Balance</th><th className="px-4 py-3"></th></tr></thead>
          <tbody>{labourers.map((l) => { const e = earned(l.id), p = paid(l.id); return <tr key={l.id} className={cn("border-t border-line", l.status !== "active" && "opacity-50")}><td className="px-4 py-3"><div className="font-semibold">{l.full_name}</div><div className="text-xs text-steel">{l.skill} · {l.code}</div></td><td className="px-4 py-3 text-right num">{byL(l.id).length}</td><td className="px-4 py-3 text-right num">{byL(l.id).reduce((t, a) => t + Number(a.hours ?? 0), 0).toFixed(1)}</td><td className="px-4 py-3 text-right num">{formatINR(e)}</td><td className="px-4 py-3 text-right num text-steel">{formatINR(p)}</td><td className={cn("px-4 py-3 text-right num font-semibold", e - p > 0 && "text-chili")}>{formatINR(e - p)}</td><td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => setPay(l)}><Banknote size={14} /> Pay</Button></td></tr>; })}</tbody></table></div>
      )}

      {tab === "labels" && <Labels property={property} labourers={active} rooms={rooms} ingredients={ingredients} />}

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `${edit.full_name} · ${edit.code}` : "New labourer"}>
        <form className="space-y-4" action={(fd) => start(async () => { setErr(null); const r = await saveLabourer(fd); if ("error" in r) setErr(r.error!); else setEdit(null); })}>
          {edit?.id && <input type="hidden" name="id" value={edit.id} />}
          <div className="grid grid-cols-2 gap-3"><Field label="Full name"><input name="full_name" defaultValue={edit?.full_name} required autoFocus /></Field><Field label="Phone"><input name="phone" defaultValue={edit?.phone ?? ""} /></Field>
            <Field label="Skill"><select name="skill" defaultValue={edit?.skill ?? "other"}>{LABOUR_SKILLS.map((k) => <option key={k}>{k}</option>)}</select></Field><Field label="Daily wage (₹)"><input name="daily_wage" type="number" className="num" defaultValue={edit?.daily_wage ?? 500} /></Field>
            <Field label="ID type"><input name="id_type" defaultValue={edit?.id_type ?? ""} placeholder="Aadhaar" /></Field><Field label="ID last 4"><input name="id_last4" maxLength={4} className="num" defaultValue={edit?.id_last4 ?? ""} /></Field>
            <Field label="Joined on"><input name="joined_on" type="date" className="num" defaultValue={edit?.joined_on ?? today} /></Field><Field label="Emergency contact"><input name="emergency_contact" defaultValue={edit?.emergency_contact ?? ""} /></Field></div>
          <Field label="Address"><input name="address" defaultValue={edit?.address ?? ""} /></Field><Field label="Notes"><textarea name="notes" rows={2} defaultValue={edit?.notes ?? ""} /></Field>
          {err && <p className="text-sm text-chili">{err}</p>}
          <div className="flex gap-2"><Button className="flex-1" disabled={pending}>Save</Button>{edit?.id && <Button type="button" variant="outline" onClick={() => start(async () => { await setLabourStatus(edit.id!, edit.status === "active" ? "inactive" : "active"); setEdit(null); })}>{edit.status === "active" ? "Deactivate" : "Reactivate"}</Button>}</div>
          {edit?.id && <div className="pt-3 border-t border-line"><QR value={`df:lab:${edit.code}`} label={`${edit.full_name} · ${edit.code}`} /></div>}
        </form>
      </Sheet>
      <Sheet open={!!pay} onClose={() => setPay(null)} title={`Pay · ${pay?.full_name ?? ""}`}>
        {pay && <form className="space-y-4" action={(fd) => start(async () => { const r = await payLabour(pay.id, Number(fd.get("amount")), String(fd.get("method")), String(fd.get("from")), String(fd.get("to")), String(fd.get("note"))); if ("error" in r) setErr(r.error!); else setPay(null); })}>
          <p className="text-sm text-steel">Earned this month <b className="num text-ink">{formatINR(earned(pay.id))}</b> · paid <b className="num text-ink">{formatINR(paid(pay.id))}</b> · balance <b className="num text-chili">{formatINR(earned(pay.id) - paid(pay.id))}</b></p>
          <div className="grid grid-cols-2 gap-3"><Field label="Amount (₹)"><input name="amount" type="number" className="num" defaultValue={Math.max(0, earned(pay.id) - paid(pay.id))} required /></Field><Field label="Method"><select name="method" defaultValue="cash"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Bank</option></select></Field><Field label="From"><input name="from" type="date" className="num" defaultValue={today.slice(0, 8) + "01"} /></Field><Field label="To"><input name="to" type="date" className="num" defaultValue={today} /></Field></div>
          <Field label="Note"><input name="note" placeholder="Weekly settlement" /></Field><Button className="w-full" disabled={pending}><Banknote size={16} /> Record payment</Button></form>}
      </Sheet>
    </div>
  );
}

/* ── printable QR labels: scan any of these on the Scan page or the phone ── */
function Labels({ property, labourers, rooms, ingredients }: { property: string; labourers: L[]; rooms: { id: string; number: string; floor: number }[]; ingredients: { id: string; name: string; unit: string; barcode: string | null }[] }) {
  const [kind, setKind] = useState<"rooms" | "products" | "labour">(rooms.length ? "rooms" : "products");
  const items = kind === "rooms" ? rooms.map((r) => ({ v: `df:room:${r.id}`, t: `Room ${r.number}`, s: `Floor ${r.floor}` })) : kind === "products" ? ingredients.map((i) => ({ v: `df:ing:${i.id}`, t: i.name, s: i.unit })) : labourers.map((l) => ({ v: `df:lab:${l.code}`, t: l.full_name, s: l.code }));
  return (
    <div>
      <div className="no-print flex items-center gap-2 mb-4">{(["rooms", "products", "labour"] as const).map((k) => <button key={k} onClick={() => setKind(k)} className={cn("chip capitalize", kind === k && "on")}>{k}</button>)}<Button variant="outline" className="ml-auto" onClick={() => window.print()}><Printer size={16} /> Print sheet</Button></div>
      <p className="no-print text-xs text-steel mb-4">Stick room labels inside the door frame, product labels on storage bins, labour labels on ID badges. Any camera — web Scan page or the phone app — reads them.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-4 gap-3">{items.map((it) => <div key={it.v} className="feather p-3 text-center print:break-inside-avoid"><QR value={it.v} size={120} /><div className="font-semibold text-sm mt-1">{it.t}</div><div className="text-[10px] text-steel">{it.s} · {property}</div></div>)}{items.length === 0 && <p className="text-sm text-steel col-span-full">Nothing to print yet.</p>}</div>
    </div>
  );
}

export function QR({ value, size = 140, label }: { value: string; size?: number; label?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { import("qrcode").then((q) => q.toDataURL(value, { width: size, margin: 1, color: { dark: "#10201a" } }).then(setSrc)); }, [value, size]);
  return <div className="inline-flex flex-col items-center">{src ? <img src={src} width={size} height={size} alt={value} /> : <div className="shimmer rounded" style={{ width: size, height: size }} />}{label && <div className="text-xs mt-1">{label}</div>}</div>;
}

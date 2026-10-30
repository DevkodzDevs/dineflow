"use client";
import { useEffect, useState, useTransition } from "react";
import { QR } from "@/components/QR";
export { QR };   // the booking-page and storefront settings import it from here
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, QrCode, Printer, Check, Banknote, Pencil, Link2, Copy, MessageCircle, Fingerprint, Camera, ClipboardCheck, MapPin, CalendarDays, LayoutGrid, Rows3 } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { Button, Sheet, Field, Card, Pill, StatTile, cn, Empty, useToast } from "@/components/ui";
import { ViewSwitch, useViewPref } from "@/components/ui/ViewSwitch";
import { formatINR } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { LABOUR_SKILLS } from "@dineflow/shared";
import { saveLabourer, setLabourStatus, markAttendance, payLabour, punchCode } from "./actions";

type L = { id: string; code: string; full_name: string; phone: string | null; skill: string | null; daily_wage: number; id_type: string | null; id_last4: string | null; address: string | null; emergency_contact: string | null; notes: string | null; joined_on: string; status: string; punch_token?: string | null };
type A = { id: string; labourer_id: string; work_date: string; in_at: string | null; out_at: string | null; hours: number | null; wage: number; method_in?: string | null; method_out?: string | null };
type Log = { id: string; labourer_id: string; at: string; direction: "in" | "out"; method: string; distance_m: number | null; photo: string | null };
const HOW: Record<string, { label: string; Icon: typeof QrCode }> = { manual: { label: "Manual", Icon: ClipboardCheck }, qr: { label: "Badge", Icon: QrCode }, biometric: { label: "Fingerprint", Icon: Fingerprint }, selfie: { label: "Selfie", Icon: Camera } };
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
type P = { id: string; labourer_id: string; amount: number; method: string; period_from: string | null; period_to: string | null; created_at: string };

export function LabourClient({ today, labourers, attendance, payments, tab, openId, rooms, ingredients, property, methods = ["manual", "qr"], log = [] }: { today: string; labourers: L[]; attendance: A[]; payments: P[]; tab: "today" | "wages" | "labels"; openId: string | null; rooms: { id: string; number: string; floor: number }[]; ingredients: { id: string; name: string; unit: string; barcode: string | null }[]; property: string; methods?: string[]; log?: Log[] }) {
  const [link, setLink] = useState<L | null>(null); const [copied, setCopied] = useState(false);
  const manual = methods.includes("manual"), phone = methods.includes("biometric") || methods.includes("selfie");
  const linkUrl = (l: L) => (typeof window === "undefined" ? "" : window.location.origin) + `/attend/${l.punch_token ?? ""}`;
  const [edit, setEdit] = useState<Partial<L> | null>(openId ? labourers.find((l) => l.id === openId) ?? null : null);
  const [pay, setPay] = useState<L | null>(null); const [err, setErr] = useState<string | null>(null); const [pending, start] = useTransition(); const [code, setCode] = useState(""); const [toast, setToast] = useState<string | null>(null);
  /* the month calendar on each card — with many workers the calendars made the board long. 2026-10-30 (the owner: "add the
     default pin here"): the app's one ViewSwitch, Calendar | Compact, a tap for this visit and the pin for this device's
     default, in place of the on/off switch; a device that had switched the calendar off keeps that as its default. */
  useEffect(() => { try { if (localStorage.getItem("df-labour-cal") === "0" && !localStorage.getItem("df-view:labour-cal")) localStorage.setItem("df-view:labour-cal", "plain"); localStorage.removeItem("df-labour-cal"); } catch { /* storage refused */ } }, []);
  const calLay = useViewPref("labour-cal", ["cal", "plain"] as const);
  const showCal = (calLay.chosen ?? "cal") === "cal";
  const active = labourers.filter((l) => l.status === "active");
  const todayAtt = attendance.filter((a) => a.work_date === today);
  const byL = (id: string) => attendance.filter((a) => a.labourer_id === id);
  const wagesLay = useViewPref("wages", ["cards", "table"] as const); const notify = useToast();
  const wagesShown = wagesLay.chosen ?? (wagesLay.wide === null ? null : wagesLay.wide ? "table" : "cards");
  const earned = (id: string) => byL(id).reduce((t, a) => t + Number(a.wage), 0);
  const paid = (id: string) => payments.filter((p) => p.labourer_id === id).reduce((t, p) => t + Number(p.amount), 0);
  const monthWages = active.reduce((t, l) => t + earned(l.id), 0); const monthPaid = active.reduce((t, l) => t + paid(l.id), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3">
        <StatTile label="Present today" value={`${todayAtt.length} / ${active.length}`} tone={todayAtt.length === active.length && active.length ? "good" : undefined} />
        <StatTile label="Today's wages" value={formatINR(todayAtt.reduce((t, a) => t + Number(a.wage), 0))} delay={0.05} />
        <StatTile label="This month" value={formatINR(monthWages)} sub={`${attendance.length} man-days`} delay={0.1} />
        <StatTile label="Due to pay" value={formatINR(Math.max(0, monthWages - monthPaid))} sub={`${formatINR(monthPaid)} paid`} tone={monthWages - monthPaid > 0 ? "alert" : "good"} delay={0.15} />
      </div>
      {/* a phone (2026-10-26, the owner: "not looking good"): the three tabs are one full-width segmented row with short
          names, the badge code its own full-width row under them — in one sliding track the tabs were cut ("…ments") and
          the badge field sat half off the screen. From sm the track is as it was (display: contents). */}
      <div className="toolbar"><div className="toolbar-group max-sm:!flex-wrap max-sm:!overflow-visible max-sm:!gap-2.5" data-labour-tabs>
        <div className="contents max-sm:!flex max-sm:![flex:1_1_100%] max-sm:p-1 max-sm:gap-1 max-sm:rounded-full max-sm:bg-[var(--color-fill)]" role="tablist" aria-label="Labour">
        {[["today", "Today", "Today"], ["wages", "Wages & payments", "Wages"], ["labels", "QR labels", "QR labels"]].map(([k, l, short]) => <Link key={k} href={`/labour?tab=${k}`} role="tab" aria-selected={tab === k} data-labour-tab={k}
          className={cn("chip", tab === k && "on", "max-sm:!flex-1 max-sm:justify-center max-sm:!min-h-11 max-sm:!border-transparent", tab !== k && "max-sm:!bg-transparent")}><span className="sm:hidden">{short}</span><span className="max-sm:hidden">{l}</span></Link>)}
        </div>
        <form className="ml-2 flex gap-1 max-sm:!ml-0 max-sm:![flex:1_1_100%] max-sm:!gap-2" data-badge-form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await punchCode(code); if ("error" in r) setErr(r.error!); else { const x = r as unknown as { name: string; event: string; hours?: number }; setToast(`${x.name} · ${x.event === "in" ? "punched IN" : x.event === "out" ? `punched OUT · ${x.hours} h` : "already done today"}`); setCode(""); } }); }}><input placeholder="Badge code" aria-label="Badge code" value={code} onChange={(e) => setCode(e.target.value)} className="num !w-32 sm:!w-44 !py-2 !px-3 uppercase min-w-0 max-sm:!w-auto max-sm:flex-1 max-sm:!h-12 max-sm:!px-4" /><Button variant="outline" aria-label="Punch" className="max-sm:!h-12 max-sm:!w-12 max-sm:!px-0"><QrCode size={16} /></Button></form>
        </div><div className="toolbar-group toolbar-end"><Button onClick={() => setEdit({ daily_wage: 500, skill: "other" })}><Plus size={16} /> Labourer</Button></div>
      </div>
      {toast && <div className="feather p-3 text-sm flex items-center gap-2 border-mint"><Check size={15} className="text-mint" /> {toast}</div>}
      {err && <p className="text-sm text-chili">{err}</p>}

      {tab === "today" && (active.length === 0 ? <Empty title="No labourers yet" hint="Add or scan an ID" action={<Link href="/scan"><Button>Scan an ID</Button></Link>} /> : (
        <div className="space-y-3">
        <div className="flex justify-end" data-cal-toggle>
          <ViewSwitch label="Show each worker's month" data="labour-cal" shown={calLay.chosen ?? "cal"} onPick={calLay.pick} saved={calLay.saved}
            onKeep={(v) => { calLay.keep(v); notify(v === "cal" ? "Calendar set as default" : "Compact set as default"); }}
            options={[{ v: "cal", label: "With the month calendar", icon: CalendarDays, word: "Calendar" }, { v: "plain", label: "Compact, no calendar", icon: Rows3, word: "Compact" }]} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((l, i) => { const a = todayAtt.find((x) => x.labourer_id === l.id); return (
            <motion.div key={l.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card lift className={cn("h-full", a && "border-mint")}>
                <div className="flex items-start gap-3"><span className={cn("h-11 w-11 rounded-2xl grid place-items-center font-display text-lg", a ? "bg-mint-2 text-ink" : "bg-ink text-on-label")}>{l.full_name.slice(0, 1)}</span>
                  <div className="flex-1 min-w-0"><div className="font-semibold truncate">{l.full_name}</div><div className="text-xs text-steel">{l.skill} · <span className="num">{l.code}</span> · {formatINR(Number(l.daily_wage))}/day</div></div>
                  <button onClick={() => setEdit(l)} className="text-steel hover:text-ink"><Pencil size={14} /></button></div>
                <div className="mt-3 flex items-center gap-2 text-xs">{a ? <><Pill tone="ready">present</Pill><span className="num text-steel min-w-0 truncate" data-times>{a.in_at ? hhmm(a.in_at) : ""}{a.out_at ? ` → ${hhmm(a.out_at)} · ${a.hours} h` : ""}{a.method_in && HOW[a.method_in] ? ` · ${HOW[a.method_in].label}` : ""}</span></> : <Pill tone="pending">absent</Pill>}
                  <span className="ml-auto num text-steel">{byL(l.id).length} day{byL(l.id).length === 1 ? "" : "s"} this month</span></div>
                {showCal && <MonthDots days={byL(l.id).map((x) => x.work_date)} today={today} />}
                <div className="mt-3 flex gap-2">{manual ? (a ? <Button size="sm" variant="outline" className="flex-1" disabled={pending} onClick={() => start(async () => { const r = await markAttendance(l.id, today, false, 0); if ("error" in r) setErr(r.error!); })}>Mark absent</Button> : <Button size="sm" className="flex-1" disabled={pending} onClick={() => start(async () => { const r = await markAttendance(l.id, today, true, Number(l.daily_wage)); if ("error" in r) setErr(r.error!); })}><Check size={14} /> Mark present</Button>) : <span className="flex-1 min-w-0 self-center text-[12px] text-steel truncate">Manual marking is off</span>}{/* the squares beside it are the main button's height (40px, 44 on touch) with a 20px icon on a grey
                    fill — they were 14px icons on a bare button, hard to see and to hit. Default size, not "sm":
                    sm's !px-4 beats !px-0 and squeezes the icon */}
                  {phone && <Button variant="outline" className="shrink-0 !h-10 !w-10 !px-0 !rounded-xl" aria-label={`Punch link for ${l.full_name}`} title="Punch link" onClick={() => { setCopied(false); setLink(l); }} data-punch-link><Link2 size={20} /></Button>}
                  <Button variant="outline" className="shrink-0 !h-10 !w-10 !px-0 !rounded-xl" aria-label={`Pay ${l.full_name}`} title="Pay" onClick={() => setPay(l)} data-pay><Banknote size={20} /></Button></div>
              </Card></motion.div>); })}
        </div>
        </div>
      ))}
      {tab === "today" && log.length > 0 && <PunchLog log={log} labourers={labourers} />}

      {tab === "wages" && (<>
        {/* Cards or the table (2026-10-25, the owner: "the Pantry switch, everywhere it is needed"): the table is 720px and a
            phone scrolled it sideways. Nothing chosen: cards below md, the table from md; the pin keeps a choice (df-view:wages). */}
        <div className="flex items-center gap-3 mb-3" data-wages-bar>
          <span className="text-[13px] text-steel"><b className="num text-[var(--color-label)]">{labourers.length}</b> {labourers.length === 1 ? "worker" : "workers"} · <b className="num text-[var(--color-label)]">{formatINR(labourers.reduce((t, l) => t + Math.max(0, earned(l.id) - paid(l.id)), 0))}</b> to pay</span>
          <div className="ml-auto"><ViewSwitch label="Show wages as" data="wages" shown={wagesShown} onPick={wagesLay.pick} saved={wagesLay.saved}
            onKeep={(v) => { wagesLay.keep(v); notify(v === "table" ? "Table set as default" : "Cards set as default"); }}
            options={[{ v: "cards", label: "Cards", icon: LayoutGrid, word: "Cards" }, { v: "table", label: "Table", icon: Rows3, word: "Table" }]} /></div>
        </div>
        <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3", wagesLay.chosen === "table" ? "hidden" : wagesLay.chosen === "cards" ? "" : "md:hidden")} data-wage-cards>
          {labourers.map((l) => { const e = earned(l.id), p = paid(l.id), bal = e - p; return (
            <div key={l.id} className={cn("feather !rounded-[20px] p-4 min-w-0 flex flex-col gap-3", l.status !== "active" && "opacity-60")} data-wage-card={l.id}>
              <div className="flex items-center gap-3 min-w-0">
                <span className="min-w-0 flex-1"><span className="block font-bold text-[15px] truncate">{l.full_name}</span><span className="block text-[12.5px] text-steel truncate">{l.skill} · {l.code}</span></span>
                <Button size="sm" variant="outline" className="shrink-0 [@media(pointer:coarse)]:!min-h-11" onClick={() => setPay(l)}><Banknote size={14} /> Pay</Button>
              </div>
              <div className="grid grid-cols-3 gap-2 rounded-[14px] bg-[var(--color-fill)] p-2.5 text-center">
                <span className="min-w-0"><span className="block font-display num text-[18px] leading-none">{byL(l.id).length}</span><span className="block text-[11px] text-steel mt-1">days · {byL(l.id).reduce((t, a) => t + Number(a.hours ?? 0), 0).toFixed(1)} h</span></span>
                <span className="min-w-0"><span className="block num text-[13px] font-bold leading-none mt-1 truncate">{formatINR(e)}</span><span className="block text-[11px] text-steel mt-1">earned · {formatINR(p, { whole: true })} paid</span></span>
                <span className="min-w-0"><span className={cn("block num text-[13px] font-bold leading-none mt-1 truncate", bal > 0 && "text-chili")}>{formatINR(bal)}</span><span className="block text-[11px] text-steel mt-1">balance</span></span>
              </div>
            </div>); })}
        </div>
        <div className={cn("feather overflow-x-auto table-wrap", wagesLay.chosen === "cards" ? "hidden" : wagesLay.chosen === "table" ? "" : "hidden md:block")} data-wage-table><table className="w-full text-sm min-w-[720px]"><thead><tr><th className="text-left px-4 py-3">Worker</th><th className="text-right px-4 py-3">Days</th><th className="text-right px-4 py-3">Hours</th><th className="text-right px-4 py-3">Earned</th><th className="text-right px-4 py-3">Paid</th><th className="text-right px-4 py-3">Balance</th><th className="px-4 py-3"></th></tr></thead>
          <tbody>{labourers.map((l) => { const e = earned(l.id), p = paid(l.id); return <tr key={l.id} className={cn("border-t border-line", l.status !== "active" && "opacity-50")}><td className="px-4 py-3"><div className="font-semibold">{l.full_name}</div><div className="text-xs text-steel">{l.skill} · {l.code}</div></td><td className="px-4 py-3 text-right num">{byL(l.id).length}</td><td className="px-4 py-3 text-right num">{byL(l.id).reduce((t, a) => t + Number(a.hours ?? 0), 0).toFixed(1)}</td><td className="px-4 py-3 text-right num">{formatINR(e)}</td><td className="px-4 py-3 text-right num text-steel">{formatINR(p)}</td><td className={cn("px-4 py-3 text-right num font-semibold", e - p > 0 && "text-chili")}>{formatINR(e - p)}</td><td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => setPay(l)}><Banknote size={14} /> Pay</Button></td></tr>; })}</tbody></table></div>
      </>)}

      {tab === "labels" && <Labels property={property} labourers={active} rooms={rooms} ingredients={ingredients} />}

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `${edit.full_name} · ${edit.code}` : "New labourer"}>
        <form className="space-y-4" action={(fd) => start(async () => { setErr(null); const r = await saveLabourer(fd); if ("error" in r) setErr(r.error!); else setEdit(null); })}>
          {edit?.id && <input type="hidden" name="id" value={edit.id} />}
          <div className="grid grid-cols-2 gap-3"><Field label="Full name"><input name="full_name" defaultValue={edit?.full_name} required autoFocus /></Field><Field label="Phone"><input name="phone" defaultValue={edit?.phone ?? ""} /></Field>
            {/* a skill picked fills its usual day's wage (2026-10-30, the owner: "the amount by their position") — what this
                property pays that skill now, else the usual rate — until the wage is typed by hand */}
            <Field label="Skill"><select name="skill" defaultValue={edit?.skill ?? "other"} data-labour-skill onChange={(e) => { const w = e.currentTarget.form?.elements.namedItem("daily_wage") as HTMLInputElement | null; if (w && !w.dataset.typed) w.value = String(wageFor(e.target.value, labourers)); }}>{LABOUR_SKILLS.map((k) => <option key={k}>{k}</option>)}</select></Field>
            <Field label="Daily wage (₹)"><input name="daily_wage" type="number" className="num" defaultValue={edit?.daily_wage ?? wageFor(edit?.skill ?? "other", labourers)} onInput={(e) => { e.currentTarget.dataset.typed = "1"; }} data-labour-wage /></Field>
            <Field label="ID type"><input name="id_type" defaultValue={edit?.id_type ?? ""} placeholder="Aadhaar" /></Field><Field label="ID last 4"><input name="id_last4" maxLength={4} className="num" defaultValue={edit?.id_last4 ?? ""} /></Field>
            <Field label="Joined on"><input name="joined_on" type="date" className="num" defaultValue={edit?.joined_on ?? today} /></Field><Field label="Emergency contact"><input name="emergency_contact" defaultValue={edit?.emergency_contact ?? ""} /></Field></div>
          <Field label="Address"><input name="address" defaultValue={edit?.address ?? ""} /></Field><Field label="Notes"><textarea name="notes" rows={2} defaultValue={edit?.notes ?? ""} /></Field>
          {/* the code first and Save · Deactivate last, so the buttons are the dialog's pinned footer (2026-10-21) */}
          {edit?.id && <div className="pb-1"><QR value={`df:lab:${edit.code}`} label={`${edit.full_name} · ${edit.code}`} /></div>}
          {err && <p className="text-sm text-chili">{err}</p>}
          <div className="flex gap-2"><Button className="flex-1" disabled={pending}>Save</Button>{edit?.id && <Button type="button" variant="outline" onClick={() => start(async () => { const r = await setLabourStatus(edit.id!, edit.status === "active" ? "inactive" : "active"); if ("error" in r) return void setErr(r.error!); setEdit(null); })}>{edit.status === "active" ? "Deactivate" : "Reactivate"}</Button>}</div>
        </form>
      </Sheet>
      <Sheet open={!!link} onClose={() => setLink(null)} title={`Punch link · ${link?.full_name ?? ""}`}>
        {link && <div className="space-y-4" data-link-sheet>
          <p className="text-sm text-steel">{link.full_name}: {[methods.includes("biometric") && "fingerprint / Face ID", methods.includes("selfie") && "selfie"].filter(Boolean).join(" or ")}. Don&apos;t share.</p>
          <div className="grid place-items-center rounded-2xl bg-white p-4"><QR value={linkUrl(link)} size={200} /></div>
          <div className="rounded-xl bg-[var(--color-fill)] px-3 py-2.5 text-[12px] num break-all" data-link-url>{linkUrl(link)}</div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={async () => setCopied(await copyText(linkUrl(link)))}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy link"}</Button>
            <a className="btn btn-filled" target="_blank" rel="noreferrer" href={`https://wa.me/${(link.phone ?? "").replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}?text=${encodeURIComponent(`Your attendance link for ${property}: ${linkUrl(link)}`)}`}><MessageCircle size={16} /> WhatsApp</a>
          </div>
        </div>}
      </Sheet>
      <Sheet open={!!pay} onClose={() => setPay(null)} title={`Pay · ${pay?.full_name ?? ""}`}>
        {pay && <form className="space-y-4" action={(fd) => start(async () => { const r = await payLabour(pay.id, Number(fd.get("amount")), String(fd.get("method")), String(fd.get("from")), String(fd.get("to")), String(fd.get("note"))); if ("error" in r) setErr(r.error!); else setPay(null); })}>
          <p className="text-sm text-steel">Earned this month <b className="num text-ink">{formatINR(earned(pay.id))}</b> · paid <b className="num text-ink">{formatINR(paid(pay.id))}</b> · balance <b className="num text-chili">{formatINR(earned(pay.id) - paid(pay.id))}</b></p>
          {/* the amount is there already (2026-10-30, the owner: "add the amount by their position; change it if needed"): what
              is owed this month, else one day at their rate; the chips put a day, a week or the balance in, and it stays editable */}
          <PayAmount key={pay.id} rate={Number(pay.daily_wage)} skill={pay.skill} balance={Math.max(0, earned(pay.id) - paid(pay.id))} />
          <div className="grid grid-cols-2 gap-3"><div className="col-span-2"><Field label="Method"><select name="method" defaultValue="cash"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Bank</option></select></Field></div><Field label="From"><input name="from" type="date" className="num" defaultValue={today.slice(0, 8) + "01"} /></Field><Field label="To"><input name="to" type="date" className="num" defaultValue={today} /></Field></div>
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
      <p className="no-print text-xs text-steel mb-4">For doors, bins, badges</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-4 gap-3">{items.map((it) => <div key={it.v} className="feather p-3 text-center print:break-inside-avoid"><QR value={it.v} size={120} /><div className="font-semibold text-sm mt-1">{it.t}</div><div className="text-[10px] text-steel">{it.s} · {property}</div></div>)}{items.length === 0 && <p className="sm:hidden text-sm text-steel col-span-full">Nothing to print yet.</p>}{items.length === 0 && <EmptyState from="sm" className="col-span-full no-print" icon={QrCode} hue="tint" data-labels-empty={kind}
        title={kind === "rooms" ? "No rooms yet" : kind === "products" ? "No products yet" : "No labourers yet"}
        hint={kind === "rooms" ? "Add rooms first" : kind === "products" ? "Add pantry items first" : "Add a labourer first"} />}</div>
    </div>
  );
}


/**
 * The month as a small calendar: one cell per day with its number, Monday first, solid green on the
 * days somebody turned up, today ringed. "11 days this month" is a number; this says whether those
 * eleven were a run or were scattered — which is what a supervisor scanning the wall of cards wants.
 * It was 31 thin dark-grey bars with no numbers, unreadable on a dark card and on a phone. Only the
 * weeks up to this one are drawn, so early in the month a card stays short.
 */
function MonthDots({ days, today }: { days: string[]; today: string }) {
  const worked = new Set(days);
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)), dayNow = Number(today.slice(8, 10));
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;            // blanks before the 1st, Monday first
  const inMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lastCell = Math.min(inMonth, dayNow + (6 - ((lead + dayNow - 1) % 7)));    // to the end of this week
  const count = days.filter((d) => d.slice(0, 7) === today.slice(0, 7)).length;
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "long", timeZone: "UTC" });
  return (
    <div className="mt-3 rounded-2xl bg-[color-mix(in_srgb,var(--color-fill)_60%,transparent)] p-3" role="img" data-month-dots
      aria-label={`${count} of the first ${dayNow} days of ${month} worked`}>
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[12.5px] font-semibold">{month}</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-[var(--color-label-2)]"><span className="h-2.5 w-2.5 rounded-[3px] bg-[var(--color-green)]" /> worked</span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-label-2)]"><span className="h-2.5 w-2.5 rounded-[3px] bg-[var(--color-fill-2)]" /> off</span>
      </div>
      <div className="grid grid-cols-7 gap-1" aria-hidden>
        {["M", "T", "W", "T", "F", "S", "S"].map((w, k) => <span key={k} className="text-center text-[10px] font-semibold text-[var(--color-label-3)] pb-0.5">{w}</span>)}
        {Array.from({ length: lead }, (_, k) => <span key={`b${k}`} />)}
        {Array.from({ length: lastCell }, (_, i) => {
          const d = i + 1, date = `${today.slice(0, 8)}${String(d).padStart(2, "0")}`;
          const on = worked.has(date), ahead = d > dayNow, isToday = d === dayNow;
          return (
            <span key={date} title={date}
              className={cn("h-7 rounded-[8px] grid place-items-center num text-[11.5px] font-semibold",
                on ? "bg-[var(--color-green)] text-[var(--color-on-tint)]"
                  : ahead ? "text-[var(--color-label-3)] opacity-50"
                    : "bg-[var(--color-fill-2)] text-[var(--color-label-2)]",
                isToday && "ring-2 ring-[var(--color-tint)] ring-offset-1 ring-offset-[var(--color-bg-2)]")}>{d}</span>
          );
        })}
      </div>
    </div>
  );
}

/** Today's punches, newest first: who, in or out, how — and the selfie, so a manager can see it was them. */
function PunchLog({ log, labourers }: { log: Log[]; labourers: L[] }) {
  const name = (id: string) => labourers.find((l) => l.id === id)?.full_name ?? "—";
  return (
    <section className="feather p-4 sm:p-5" data-punch-log>
      <div className="flex items-center gap-2 mb-3"><h3 className="text-base font-semibold">Today&apos;s punches</h3><span className="ml-auto text-xs text-steel num">{log.length}</span></div>
      <ul className="divide-y divide-[var(--color-separator)]">
        {log.map((p) => { const H = HOW[p.method] ?? HOW.manual; return (
          <li key={p.id} className="flex items-center gap-3 py-2.5 min-w-0">
            {p.photo ? <a href={p.photo} target="_blank" rel="noreferrer" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL from a private bucket */}
              <img src={p.photo} alt={`Selfie · ${name(p.labourer_id)}`} className="h-11 w-11 rounded-xl object-cover" /></a>
              : <span className="h-11 w-11 shrink-0 rounded-xl bg-[var(--color-fill)] grid place-items-center text-steel"><H.Icon size={17} /></span>}
            <div className="min-w-0 flex-1"><div className="text-sm font-semibold truncate">{name(p.labourer_id)}</div>
              <div className="text-xs text-steel truncate">{H.label}{p.distance_m != null && <> · <MapPin size={11} className="inline -mt-0.5" /> {p.distance_m} m away</>}</div></div>
            <span className={cn("shrink-0 text-[11px] font-semibold uppercase rounded-full px-2 py-0.5", p.direction === "in" ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[var(--color-fill)] text-[var(--color-label-2)]")}>{p.direction}</span>
            <span className="shrink-0 num text-sm w-12 text-right">{hhmm(p.at)}</span>
          </li>); })}
      </ul>
    </section>
  );
}

/** A day's usual wage for a skill: what this property pays it now (the middle of its active workers' rates), else the
 *  common rate for that work, else ₹500. Only a starting figure — the owner types another. */
const USUAL: Record<string, number> = { "cook helper": 600, cleaner: 500, housekeeping: 550, gardener: 550, security: 650, driver: 800, porter: 550, electrician: 900, plumber: 900, other: 500 };
function wageFor(skill: string, labourers: L[]): number {
  const rates = labourers.filter((l) => l.status === "active" && l.skill === skill && Number(l.daily_wage) > 0).map((l) => Number(l.daily_wage)).sort((a, b) => a - b);
  return rates.length ? rates[Math.floor((rates.length - 1) / 2)] : USUAL[skill] ?? 500;
}

/** The amount to pay, filled in: the balance owed, else one day at their rate — and a day, a week or the balance a tap away. */
function PayAmount({ rate, skill, balance }: { rate: number; skill: string | null; balance: number }) {
  const [amount, setAmount] = useState(String(balance > 0 ? balance : rate));
  const picks: [string, number][] = [["1 day", rate], ["1 week", rate * 7], ...(balance > 0 ? [["Balance", balance] as [string, number]] : [])];
  return (
    <div data-pay-amount>
      <Field label="Amount (₹)"><input name="amount" type="number" inputMode="decimal" min={1} step="0.01" className="num !text-[20px] !font-bold" value={amount} onChange={(e) => setAmount(e.target.value)} required data-pay-input /></Field>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {picks.map(([l, v]) => <button key={l} type="button" onClick={() => setAmount(String(v))} aria-pressed={Number(amount) === v} data-pay-pick={l}
          className={cn("h-9 [@media(pointer:coarse)]:h-11 px-3 rounded-full text-[12.5px] font-bold inline-flex items-center gap-1.5 transition-colors", Number(amount) === v ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")}>
          {l}<span className="num opacity-80">{formatINR(v, { whole: true })}</span></button>)}
        <span className="ml-auto text-[12px] text-steel num" data-pay-rate>{skill ? `${skill} · ` : ""}{formatINR(rate, { whole: true })} a day</span>
      </div>
    </div>
  );
}

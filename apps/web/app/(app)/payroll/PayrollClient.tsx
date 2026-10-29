"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Calculator, Lock, FileText, FileSpreadsheet, HandCoins, Check, Settings2, Wallet, IndianRupee, Landmark, CalendarClock, Minus, Plus, CalendarDays, CircleDashed, PencilLine } from "lucide-react";
import { Card, Empty, Switch, cn, useToast, FlapShuffle } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { saveSettings, setPay, giveAdvance, buildMonth, setLine, finalise, payLine } from "./actions";
import { Say } from "@/components/ui/Say";
import { EmptyState } from "@/components/ui/EmptyState";

export type Person = { id: string; full_name: string; role: string; pay: { profile_id: string; basis: "monthly" | "daily"; amount: number; pf_on: boolean; esi_on: boolean; pf_basic_pct?: number } | null };
export type Advance = { id: string; profile_id: string; amount: number; given_on: string; method: string; note: string | null };
export type Run = { id: string; month: string; status: "draft" | "final"; pf: boolean; esi: boolean; paid_offs: number; wage_rule?: boolean; finalised_at: string | null };
export type Line = { id: string; profile_id: string; name: string; role: string | null; basis: string; rate: number; days_in_month: number; days_present: number; paid_days: number; gross: number; bonus: number; pf_wage?: number; pf_employee: number; esi_employee: number; advances: number; other_deduction: number; net: number; pf_employer: number; esi_employer: number; note: string | null; paid_at: string | null; paid_method: string | null };

const inr = (n: number) => formatINR(Number(n));
const monthName = (m: string) => new Date(m + "-01T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const shift = (m: string, by: number) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + by, 1)).toISOString().slice(0, 7);
const cap = (s: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ") : "");

/**
 * Four parts, in the order a month goes: the switches (PF, ESI, paid weekly offs), each person's rate, advances
 * given, and the month's sheet — Work out → adjust bonus / other deductions on the draft → Finalise → Pay each line
 * (a Salaries expense) and print the payslip. Excel downloads the sheet with the employer's PF and ESI.
 */
/** below lg each figure is a small tile: its label (from data-label) on top, the figure under it, two across (2026-10-21) */
const cell = "max-lg:flex max-lg:flex-col max-lg:items-start max-lg:justify-between max-lg:gap-1 max-lg:!px-3 max-lg:!py-2.5 max-lg:rounded-xl max-lg:bg-[var(--color-fill)] max-lg:min-w-0 max-lg:text-left max-lg:text-[15px] max-lg:font-bold max-lg:before:content-[attr(data-label)] max-lg:before:font-sans max-lg:before:text-[11.5px] max-lg:before:font-semibold max-lg:before:text-steel";
const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export function PayrollClient({ month, today, property, settings, people, advances, run, lines }: { month: string; today: string; property: string; settings: { pf: boolean; esi: boolean; offs: number; rule: boolean }; people: Person[]; advances: Advance[]; run: Run | null; lines: Line[] }) {
  const toast = useToast(); const [pending, start] = useTransition();
  const [cfg, setCfg] = useState(settings); const [saved, setSaved] = useState(settings);
  const [rates, setRates] = useState<Record<string, { basis: "monthly" | "daily"; amount: string; pf: boolean; esi: boolean; basic: string }>>(() =>
    Object.fromEntries(people.map((p) => [p.id, { basis: p.pay?.basis ?? "monthly", amount: p.pay ? String(Number(p.pay.amount)) : "", pf: p.pay?.pf_on ?? true, esi: p.pay?.esi_on ?? true, basic: String(Number(p.pay?.pf_basic_pct ?? 100)) }])));
  const [adv, setAdv] = useState({ who: people[0]?.id ?? "", amount: "", method: "cash", note: "" });
  const [edits, setEdits] = useState<Record<string, { bonus: string; other: string }>>({});
  const final = run?.status === "final";
  const t = lines.reduce((a, l) => ({ gross: a.gross + Number(l.gross) + Number(l.bonus), base: a.base + Number(l.gross), bonus: a.bonus + Number(l.bonus), pf: a.pf + Number(l.pf_employee), esi: a.esi + Number(l.esi_employee), adv: a.adv + Number(l.advances), other: a.other + Number(l.other_deduction), net: a.net + Number(l.net), pfr: a.pfr + Number(l.pf_employer), esir: a.esir + Number(l.esi_employer) }), { gross: 0, base: 0, bonus: 0, pf: 0, esi: 0, adv: 0, other: 0, net: 0, pfr: 0, esir: 0 });
  /** PF and ESI for a month are due by the 15th of the next */
  const dueOn = new Date(shift(month, 1) + "-15T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const owedAdv = (id: string) => advances.filter((a) => a.profile_id === id).reduce((s, a) => s + Number(a.amount), 0);
  const act = (p: Promise<{ error?: string } | { ok: true }>, ok: string) => start(async () => { const r = await p; if ("error" in r && r.error) toast(r.error, "err"); else toast(ok); });

  const payslip = async (l: Line) => {
    const { tablesPdf } = await import("@/lib/tablePdf"); const { download } = await import("@/lib/xlsx");
    const rows = (xs: [string, number][]) => xs.filter(([, v]) => Number(v) !== 0).map(([k, v]) => [k, Number(v)] as [string, number]);
    const bytes = await tablesPdf(`Payslip · ${l.name}`, `${property} · ${monthName(month)} · ${cap(l.role)}`, [
      { title: "Attendance", head: ["", ""], rows: [["Days in the month", l.days_in_month], ["Days present", l.days_present], ["Paid days", Number(l.paid_days)], ["Rate", `${inr(l.rate)} ${l.basis === "monthly" ? "a month" : "a day"}`]] },
      { title: "Earnings", head: ["", "Amount"], rows: rows([["Pay for paid days", l.gross], ["Bonus", l.bonus]]) },
      { title: "Deductions", note: Number(l.pf_wage ?? 0) ? `PF worked on Rs ${Number(l.pf_wage).toLocaleString("en-IN")} (basic + DA${run?.wage_rule ? ", at least half of pay" : ""}, up to Rs 15,000)` : undefined, head: ["", "Amount"], rows: rows([["PF (employee 12%)", l.pf_employee], ["ESI (employee 0.75%)", l.esi_employee], ["Advance recovered", l.advances], ["Other", l.other_deduction]]) },
      { title: "Net pay", head: ["", "Amount"], rows: [["Paid to you", Number(l.net)], ...(l.paid_at ? [["Paid on", `${new Date(l.paid_at).toLocaleDateString("en-IN")} · ${(l.paid_method ?? "").toUpperCase()}`] as [string, string]] : [])] },
      ...(Number(l.pf_employer) || Number(l.esi_employer) ? [{ title: "Paid by the employer for you", head: ["", "Amount"], rows: rows([["PF (employer 12%)", l.pf_employer], ["ESI (employer 3.25%)", l.esi_employer]]) }] : []),
    ]);
    download(`payslip-${l.name.replace(/[^\w]+/g, "-").toLowerCase()}-${month}.pdf`, new Uint8Array(bytes), "application/pdf");
  };
  const excel = async () => {
    const { xlsx, download, XLSX_TYPE } = await import("@/lib/xlsx");
    const head = ["Name", "Role", "Basis", "Rate", "Days present", "Paid days", "Gross", "Bonus", "PF wage", "PF (employee)", "ESI (employee)", "Advance", "Other", "Net", "PF (employer)", "ESI (employer)", "Paid"];
    download(`payroll-${property.replace(/[^\w]+/g, "-").toLowerCase()}-${month}.xlsx`, xlsx([{ name: `Payroll ${month}`, rows: [head, ...lines.map((l) => [l.name, cap(l.role), l.basis, Number(l.rate), l.days_present, Number(l.paid_days), Number(l.gross), Number(l.bonus), Number(l.pf_wage ?? 0), Number(l.pf_employee), Number(l.esi_employee), Number(l.advances), Number(l.other_deduction), Number(l.net), Number(l.pf_employer), Number(l.esi_employer), l.paid_at ? `${(l.paid_method ?? "").toUpperCase()} ${l.paid_at.slice(0, 10)}` : ""]), ["Total", "", "", "", "", "", t.base, t.bonus, "", t.pf, t.esi, t.adv, t.other, t.net, t.pfr, t.esir, ""]] }]), XLSX_TYPE);
  };

  return (
    <div className="space-y-5" data-payroll>
      {/* the switches and the advances side by side; the rates take the whole width under them (2026-10-20) */}
      <div className="grid gap-4 md:grid-cols-2 md:items-start">
          {/* ── the switches ── */}
          {/* the rules, as settings rows (2026-10-24, the owner: "design"): a badge per rule in its own colour, the words,
              and a switch on the right — the whole row is the tap target; weekly offs is a − n + stepper. Save is the main
              button only while something has changed, and says Saved when nothing has. */}
          <Card className="min-w-0" data-payroll-settings>
            <div className="flex items-center gap-3 mb-4">
              <span className="h-11 w-11 shrink-0 rounded-[14px] grid place-items-center bg-[var(--color-green-2)] text-[var(--color-green)]"><Settings2 size={20} aria-hidden /></span>
              <div className="min-w-0"><div className="text-[17px] font-extrabold leading-tight">Pay rules</div><div className="text-[12.5px] text-steel mt-0.5">Applied each month</div></div>
            </div>
            <div className="rounded-[18px] border border-[var(--color-separator)] divide-y divide-[var(--color-separator)] overflow-hidden bg-[var(--color-bg)]">
              {([["pf", "PF", "Provident fund", "12% staff + 12% you · to ₹15,000 · 20+ staff", "var(--color-blue)", "var(--color-blue-2)"],
                ["esi", "ESI", "Health insurance", "0.75% staff + 3.25% you · to ₹21,000 · 10+ staff", "var(--color-violet)", "var(--color-violet-2)"]] as const).map(([k, badge, what, hint, hue, hue2]) => (
                <label key={k} className="flex items-center gap-3 px-3.5 py-3 min-h-[64px] cursor-pointer hover:bg-[var(--color-fill)] transition-colors" data-switch={k}>
                  <span className="h-11 w-11 shrink-0 rounded-[13px] grid place-items-center text-[12.5px] font-extrabold tracking-wide" style={{ background: hue2, color: hue }}>{badge}</span>
                  {/* a phone (2026-10-26, the owner: "not looking good"): the badge already says PF / ESI, so the title is the
                      plain name on one line, the hint under it; "Include PF · Provident fund" wrapped to two lines there */}
                  <span className="flex-1 min-w-0"><span className="block text-[15px] font-bold leading-snug"><span className="sm:hidden">{what}</span><span className="hidden sm:inline">Include {badge} <span className="font-semibold text-steel">· {what}</span></span></span><span className="block text-[12.5px] max-sm:text-[12px] text-steel leading-snug mt-0.5">{hint}</span></span>
                  <Switch on={cfg[k]} onChange={(v) => setCfg((c) => ({ ...c, [k]: v }))} name={`Include ${badge}`} />
                </label>))}
              {cfg.pf && <label className="flex items-center gap-3 px-3.5 py-3 min-h-[64px] cursor-pointer hover:bg-[var(--color-fill)] transition-colors" data-switch="rule">
                <span className="h-11 w-11 shrink-0 rounded-[13px] grid place-items-center text-[12.5px] font-extrabold bg-[var(--color-orange-2)] text-[var(--color-orange)]">50%</span>
                <span className="flex-1 min-w-0"><span className="block text-[15px] font-bold leading-snug">The 50% wage rule</span><span className="block text-[12.5px] text-steel leading-snug mt-0.5">From 21 Nov 2025: PF on ≥50% pay</span></span>
                <Switch on={cfg.rule} onChange={(v) => setCfg((c) => ({ ...c, rule: v }))} name="The 50% wage rule" />
              </label>}
              <div className="flex items-center gap-3 px-3.5 py-3 min-h-[64px] max-sm:flex-wrap max-sm:gap-y-3" data-payroll-offs>
                <span className="h-11 w-11 shrink-0 rounded-[13px] grid place-items-center bg-[var(--color-cyan-2)] text-[var(--color-cyan)]"><CalendarClock size={19} aria-hidden /></span>
                <span className="flex-1 min-w-0"><span className="block text-[15px] font-bold leading-snug">Paid weekly offs</span><span className="block text-[12.5px] text-steel leading-snug mt-0.5">For monthly-paid staff</span></span>
                {/* a phone (2026-10-26): the words take the row and the stepper sits under them, full width — − and + at the
                    ends, the count on a split-flap in the middle (it was squeezed beside the words, which ran to four lines) */}
                <div className="shrink-0 flex items-center rounded-[14px] border border-[var(--color-separator)] bg-[var(--color-bg-2)] max-sm:basis-full max-sm:justify-between max-sm:p-1.5 max-sm:bg-[var(--color-fill)] max-sm:border-transparent" data-offs-stepper>
                  <button type="button" aria-label="One fewer weekly off" disabled={cfg.offs <= 0} onClick={() => setCfg((c) => ({ ...c, offs: Math.max(0, c.offs - 1) }))} className="h-11 w-11 grid place-items-center rounded-l-[14px] hover:bg-[var(--color-fill)] disabled:opacity-35 max-sm:h-12 max-sm:w-14 max-sm:rounded-[12px] max-sm:bg-[var(--color-bg-2)] max-sm:shadow-[0_1px_3px_rgb(0_0_0/0.18)]"><Minus size={16} aria-hidden /></button>
                  <span className="num w-8 text-center text-[17px] font-bold max-sm:hidden" aria-live="polite" data-offs={cfg.offs}>{cfg.offs}</span>
                  <span className="sm:hidden flex items-center gap-2.5" data-offs-flap={cfg.offs}>
                    <FlapShuffle value={cfg.offs} pad={0} size="xs" tile="40px" say={`${cfg.offs} paid weekly offs`} />
                    <span className="text-[12.5px] font-semibold text-steel leading-tight">{cfg.offs === 1 ? "day off" : "days off"}<br />a month</span>
                  </span>
                  <button type="button" aria-label="One more weekly off" disabled={cfg.offs >= 8} onClick={() => setCfg((c) => ({ ...c, offs: Math.min(8, c.offs + 1) }))} className="h-11 w-11 grid place-items-center rounded-r-[14px] hover:bg-[var(--color-fill)] disabled:opacity-35 max-sm:h-12 max-sm:w-14 max-sm:rounded-[12px] max-sm:bg-[var(--color-bg-2)] max-sm:shadow-[0_1px_3px_rgb(0_0_0/0.18)]"><Plus size={16} aria-hidden /></button>
                </div>
              </div>
            </div>
            {(() => { const dirty = cfg.pf !== saved.pf || cfg.esi !== saved.esi || cfg.offs !== saved.offs || cfg.rule !== saved.rule; return (
              <button type="button" disabled={pending || !dirty} className={cn("svc-btn sm w-full mt-3", dirty ? "go" : "quiet")} data-save-payroll-settings data-dirty={dirty}
                onClick={() => { const next = cfg; start(async () => { const r = await saveSettings(next.pf, next.esi, next.offs, next.rule); if ("error" in r && r.error) toast(r.error, "err"); else { toast("Saved · rework the month"); setSaved(next); } }); }}>
                <Check size={16} aria-hidden />{dirty ? <Say w="save" /> : "Saved"}</button>); })()}
          </Card>

          {/* ── advances ── */}
          <Card className="min-w-0" data-advances>
            <div className="flex items-center gap-2 text-[17px] font-extrabold mb-1"><Wallet size={18} aria-hidden /> Advances</div>
            <p className="text-[12.5px] text-steel mb-3">From drawer · cut from pay</p>
            <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-2">
              <select value={adv.who} onChange={(e) => setAdv((a) => ({ ...a, who: e.target.value }))} aria-label="Who">{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
              <input inputMode="decimal" className="num" placeholder="₹" value={adv.amount} onChange={(e) => setAdv((a) => ({ ...a, amount: e.target.value.replace(/[^\d.]/g, "") }))} data-advance-amount />
              <select value={adv.method} onChange={(e) => setAdv((a) => ({ ...a, method: e.target.value }))} aria-label="Paid by"><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank</option></select>
              <input placeholder="Note" value={adv.note} maxLength={200} onChange={(e) => setAdv((a) => ({ ...a, note: e.target.value }))} />
            </div>
            <button type="button" disabled={pending || !adv.who || !(Number(adv.amount) > 0)} className="svc-btn quiet sm w-full mt-2" data-give-advance
              onClick={() => start(async () => { const r = await giveAdvance(adv.who, Number(adv.amount), adv.method, adv.note); if ("error" in r && r.error) toast(r.error, "err"); else { toast("Advance written down"); setAdv((a) => ({ ...a, amount: "", note: "" })); } })}><HandCoins size={16} aria-hidden /><Say w="give_advance" /></button>
            {advances.length > 0 && <ul className="mt-3 divide-y divide-[var(--color-separator)] text-[13.5px]">{advances.map((a) => <li key={a.id} className="py-2 flex justify-between gap-2"><span className="truncate">{people.find((p) => p.id === a.profile_id)?.full_name ?? "—"} · {a.given_on}{a.note ? ` · ${a.note}` : ""}</span><span className="num font-bold shrink-0">{inr(a.amount)}</span></li>)}</ul>}
          </Card>
      </div>

      {/* ── rates ──
          One set of pieces, two layouts, chosen by the list's own width (@container, 62rem): wide, a table whose every
          row uses the same column tracks (`--rate-cols`, built from which of PF and ESI are on) under a header row —
          the wrappers turn `contents` so their pieces become the row's cells, and the Basic % field keeps its slot,
          dimmed, when a person's PF is off; narrower, a card per person (two across from 36rem): name and Save on top,
          then Paid by and the rate, then PF · basic % · ESI. */}
      <Card className="min-w-0" data-rates>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[17px] font-extrabold"><IndianRupee size={18} aria-hidden /> Pay rates</div>
            <p className="text-[12.5px] text-steel mt-0.5 max-w-[46rem]">Days come from attendance</p>
          </div>
          {people.length > 0 && <span className="shrink-0 rounded-full px-3 h-8 inline-flex items-center text-[12.5px] font-bold bg-[var(--color-fill)] num" data-rates-count>{people.filter((p) => p.pay).length} of {people.length} on the sheet</span>}
        </div>
        {people.length === 0 ? <Empty title="No staff yet" hint="Add them in Staff" /> : (
          <div className="@container" style={{ "--rate-cols": ["minmax(0,1.5fr)", "8.75rem", "minmax(9rem,1fr)", ...(cfg.pf ? ["12rem"] : []), ...(cfg.esi ? ["5.75rem"] : []), "7rem"].join(" ") } as React.CSSProperties}>
            <div className="hidden @[62rem]:grid [grid-template-columns:var(--rate-cols)] gap-x-3 px-3 pb-2 border-b border-[var(--color-separator)] text-[12px] font-semibold text-steel" aria-hidden>
              <span>Person</span><span>Paid by</span><span>Rate</span>{cfg.pf && <span>PF · basic + DA</span>}{cfg.esi && <span>ESI</span>}<span />
            </div>
            <div className="grid gap-3 @[36rem]:grid-cols-2 @[62rem]:grid-cols-1 @[62rem]:gap-0 @[62rem]:divide-y @[62rem]:divide-[var(--color-separator)]">
              {people.map((p) => {
                const r = rates[p.id]; const set = (x: Partial<typeof r>) => setRates((all) => ({ ...all, [p.id]: { ...all[p.id], ...x } }));
                const saved = p.pay; const owed = owedAdv(p.id);
                const dirty = !saved ? r.amount !== "" : r.basis !== saved.basis || Number(r.amount) !== Number(saved.amount) || r.pf !== saved.pf_on || r.esi !== saved.esi_on || Number(r.basic) !== Number(saved.pf_basic_pct ?? 100);
                const pill = (on: boolean) => cn("inline-flex items-center gap-2 !min-h-11 h-11 px-3 rounded-xl cursor-pointer text-[13.5px] font-bold ring-1 ring-inset select-none", on ? "ring-[var(--color-tint)] bg-[color-mix(in_srgb,var(--color-tint)_12%,transparent)]" : "ring-[var(--color-separator)] text-steel");
                return (
                  <div key={p.id} data-rate={p.full_name}
                    className="min-w-0 grid gap-3 content-start rounded-2xl bg-[var(--color-fill)] p-4 @[62rem]:[grid-template-columns:var(--rate-cols)] @[62rem]:items-center @[62rem]:gap-x-3 @[62rem]:gap-y-0 @[62rem]:rounded-none @[62rem]:bg-transparent @[62rem]:px-3 @[62rem]:py-3 @[62rem]:hover:bg-[var(--color-fill)]">
                    {/* who, and Save (top right on a card; the last column in the table) */}
                    <div className="flex items-center gap-3 min-w-0 @[62rem]:contents">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="h-10 w-10 shrink-0 rounded-full grid place-items-center text-[13px] font-extrabold bg-[var(--color-fill-2)]" aria-hidden>{initials(p.full_name)}</span>
                        <div className="min-w-0">
                          <div className="font-bold truncate">{p.full_name}</div>
                          <div className="text-[12px] text-steel flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            <span>{cap(p.role)}</span>
                            {owed > 0 && <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-orange)]"><HandCoins size={12} aria-hidden />advance {inr(owed)}</span>}
                            {!saved && <span className="font-semibold text-[var(--color-orange)]" data-no-rate>· no rate yet</span>}
                          </div>
                        </div>
                      </div>
                      <button type="button" disabled={pending || r.amount === "" || !dirty} className={cn("svc-btn sm shrink-0 !px-4 @[62rem]:order-last @[62rem]:w-full", dirty ? "go" : "quiet")} data-save-rate
                        onClick={() => act(setPay(p.id, r.basis, Number(r.amount), r.pf, r.esi, Math.min(100, Math.max(1, Number(r.basic) || 100))), `${p.full_name}: rate saved`)}>
                        {!dirty && saved ? <><Check size={16} aria-hidden />Saved</> : "Save"}</button>
                    </div>
                    {/* paid by and the rate */}
                    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 min-w-0 @[62rem]:contents">
                      <div className="grid grid-cols-2 rounded-xl bg-[var(--color-bg-3)] p-1 w-[8.75rem]" role="group" aria-label={`${p.full_name}: paid by`}>
                        {(["monthly", "daily"] as const).map((b) => <button key={b} type="button" aria-pressed={r.basis === b} onClick={() => set({ basis: b })} className={cn("!min-h-10 [@media(pointer:coarse)]:!min-h-11 rounded-lg text-[13px] font-bold", r.basis === b ? "bg-[var(--color-bg-2)] text-[var(--color-label)] shadow-feather" : "text-steel")}>{b === "monthly" ? "Month" : "Day"}</button>)}
                      </div>
                      <label className="relative block min-w-0">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] font-bold text-steel pointer-events-none" aria-hidden>₹</span>
                        <input inputMode="decimal" className="num !pl-8 !pr-[4.25rem]" placeholder="0" value={r.amount} onChange={(e) => set({ amount: e.target.value.replace(/[^\d.]/g, "") })} aria-label={`${p.full_name}: rate`} />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12.5px] font-semibold text-steel pointer-events-none" aria-hidden>/ {r.basis === "monthly" ? "month" : "day"}</span>
                      </label>
                    </div>
                    {/* PF on basic + DA, and ESI — each in its own slot, whether or not this person has it */}
                    {(cfg.pf || cfg.esi) && <div className="flex flex-wrap items-center gap-2 min-w-0 @[62rem]:contents">
                      {cfg.pf && <div className="flex items-center gap-2 min-w-0">
                        <label className={pill(r.pf)}><input type="checkbox" checked={r.pf} onChange={(e) => set({ pf: e.target.checked })} />PF</label>
                        <label className={cn("relative block w-[6.5rem] shrink-0 transition-opacity", !r.pf && "opacity-40")} title="Basic + DA share of pay — PF is on this">
                          <input inputMode="numeric" disabled={!r.pf} className="!h-11 !min-h-11 num !pl-3 !pr-[3.6rem]" value={r.basic} onChange={(e) => set({ basic: e.target.value.replace(/[^\d.]/g, "").slice(0, 5) })} aria-label={`${p.full_name}: basic + DA percent`} data-basic-pct />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-steel pointer-events-none" aria-hidden>% basic</span>
                        </label>
                      </div>}
                      {cfg.esi && <div className="min-w-0"><label className={pill(r.esi)}><input type="checkbox" checked={r.esi} onChange={(e) => set({ esi: e.target.checked })} />ESI</label></div>}
                    </div>}
                  </div>);
              })}
            </div>
          </div>)}
      </Card>

      {/* ── the month ── */}
      <Card className="min-w-0 !p-0 overflow-hidden" data-payroll-month>
        {/* the month: one navigator (◀ month + its state ▶), then the actions — on a phone the main one takes the
            row and the others share the next, rather than three buttons wrapping wherever they fell (2026-10-21) */}
        <div className="p-4 flex flex-wrap items-center gap-3 border-b border-[var(--color-separator)]">
          {/* the month (2026-10-24, the owner: "design"): round ◀ ▶ buttons either side of a calendar tile, the month, and
              its state as a coloured chip — Not worked out (grey, dashed), Draft (amber), Final (green, locked) */}
          <div className="flex items-center gap-2 max-sm:w-full sm:min-w-[21rem]" data-payroll-nav>
            <Link href={`/payroll?m=${shift(month, -1)}`} className="h-11 w-11 shrink-0 grid place-items-center rounded-full border border-[var(--color-separator)] bg-[var(--color-bg-2)] shadow-[var(--shadow-card)] hover:border-[var(--color-line-2)] active:scale-95 transition" aria-label="Previous month"><ChevronLeft size={19} /></Link>
            <div className="flex-1 min-w-0 flex items-center gap-3 rounded-[18px] border border-[var(--color-separator)] bg-[var(--color-bg)] px-3 py-2">
              <span className="h-11 w-11 shrink-0 rounded-[13px] grid place-items-center bg-[var(--color-blue-2)] text-[var(--color-blue)]"><CalendarDays size={20} aria-hidden /></span>
              <div className="min-w-0">
                <div className="text-[17px] font-extrabold leading-tight truncate" data-payroll-month-name>{monthName(month)}</div>
                <span className={cn("mt-1 inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11.5px] font-bold",
                  !run ? "border border-dashed border-[var(--color-line-2)] text-steel" : final ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[var(--color-orange-2)] text-[var(--color-orange)]")} data-month-state={!run ? "none" : final ? "final" : "draft"}>
                  {!run ? <CircleDashed size={12} aria-hidden /> : final ? <Lock size={11} aria-hidden /> : <PencilLine size={12} aria-hidden />}
                  {run ? <span data-run-status>{final ? "Final" : "Draft"}</span> : <span>Not worked out</span>}
                </span>
              </div>
            </div>
            <Link href={`/payroll?m=${shift(month, 1)}`} className={cn("h-11 w-11 shrink-0 grid place-items-center rounded-full border border-[var(--color-separator)] bg-[var(--color-bg-2)] shadow-[var(--shadow-card)] hover:border-[var(--color-line-2)] active:scale-95 transition", month >= today.slice(0, 7) && "pointer-events-none opacity-40")} aria-label="Next month"><ChevronRight size={19} /></Link>
          </div>
          <div className="flex flex-wrap gap-2 max-sm:w-full sm:ml-auto" data-payroll-actions>
            {!final && <button type="button" disabled={pending} className="svc-btn go sm !px-4 max-sm:basis-full" data-build onClick={() => act(buildMonth(month), run ? "Worked out again" : "Worked out")}><Calculator size={17} aria-hidden /><Say w={run ? "work_out_again" : "work_out_pay"} /></button>}
            {run && !final && lines.length > 0 && <button type="button" disabled={pending} className="svc-btn quiet sm !px-4 max-sm:flex-1" data-finalise onClick={() => { if (confirm(`Finalise ${monthName(month)}? Lines stop changing and advances are marked recovered.`)) act(finalise(run.id), "Finalised"); }}><Lock size={16} aria-hidden /><Say w="finalise" /></button>}
            {lines.length > 0 && <button type="button" className="svc-btn quiet sm !px-4 max-sm:flex-1" onClick={() => void excel()} data-payroll-xlsx><FileSpreadsheet size={16} aria-hidden /> Excel</button>}
          </div>
        </div>
        {!run ? <div className="p-4"><EmptyState size="sm" icon={Calculator} hue="blue" title={`${monthName(month)} not worked out`} hint={<>Set rates, then <b>Work out pay</b></>} data-payroll-empty="none" /></div>
          : lines.length === 0 ? <div className="p-4"><EmptyState size="sm" icon={IndianRupee} hue="orange" title="No pay rates yet" hint="Add rates, then rework" data-payroll-empty="rates" /></div> : (<>
          <div className="overflow-x-auto"><table className="w-full text-[13.5px] lg:min-w-[900px] max-lg:block">
            <thead className="max-lg:hidden"><tr className="text-left text-steel text-[12px] border-b border-[var(--color-separator)]">{["Name", "Days", "Gross", "Bonus", "PF", "ESI", "Advance", "Other", "Net", ""].map((h, i) => <th key={i} className={cn("py-2 font-semibold", i === 0 ? "pl-4" : "text-right pr-3", i === 9 && "pr-4")}>{h}</th>)}</tr></thead>
            <tbody className="max-lg:grid max-lg:gap-3 max-lg:p-3 sm:max-lg:grid-cols-2">{lines.map((l) => { const e = edits[l.id] ?? { bonus: String(Number(l.bonus) || ""), other: String(Number(l.other_deduction) || "") }; const dirty = Number(e.bonus || 0) !== Number(l.bonus) || Number(e.other || 0) !== Number(l.other_deduction); return (
              <tr key={l.id} className="border-b border-[var(--color-separator)] last:border-b-0 max-lg:relative max-lg:grid max-lg:grid-cols-2 max-lg:gap-2 max-lg:min-w-0 max-lg:rounded-2xl max-lg:border-0 max-lg:bg-[var(--color-fill)] max-lg:p-3" data-line={l.name}>
                <td className="py-2.5 pl-4 max-lg:col-span-2 max-lg:!p-0 max-lg:pb-1 max-lg:!pr-[7.5rem] min-w-0"><div className="flex items-center gap-2.5 min-w-0">
                  <span className="lg:hidden h-10 w-10 shrink-0 rounded-full grid place-items-center text-[13px] font-extrabold bg-[var(--color-fill-2)]" aria-hidden>{initials(l.name)}</span>
                  <div className="min-w-0"><div className="font-bold truncate max-lg:text-[15.5px]">{l.name}</div><div className="text-[12px] text-steel num">{l.basis === "monthly" ? `${inr(l.rate)}/month` : `${inr(l.rate)}/day`}</div></div></div></td>
                {/* days: a column in the table; on a card, a pill top right — present → paid */}
                <td className="text-right pr-3 num max-lg:absolute max-lg:top-3 max-lg:right-3 max-lg:!px-3 max-lg:!py-0 max-lg:h-8 max-lg:rounded-full max-lg:bg-[var(--color-fill)] max-lg:inline-flex max-lg:items-center max-lg:gap-1.5 max-lg:text-[13px] max-lg:font-bold max-lg:whitespace-nowrap max-lg:before:content-[attr(data-label)] max-lg:before:font-sans max-lg:before:text-[11.5px] max-lg:before:font-semibold max-lg:before:text-steel" data-label="Days">{l.days_present}{l.basis === "monthly" && <span className="text-steel"> → {Number(l.paid_days)}</span>}</td>
                <td className={cn("text-right pr-3 num", cell)} data-label="Gross">{inr(l.gross)}</td>
                <td className={cn("text-right pr-3", cell)} data-label="Bonus">{final ? <span className="num">{Number(l.bonus) ? inr(l.bonus) : "—"}</span> : <input inputMode="decimal" className="!w-24 !h-10 num text-right max-lg:!w-full max-lg:!h-10 max-lg:!min-h-10 max-lg:text-left max-lg:text-[15px]" value={e.bonus} placeholder="+ 0" onChange={(x) => setEdits((all) => ({ ...all, [l.id]: { ...e, bonus: x.target.value.replace(/[^\d.]/g, "") } }))} aria-label={`${l.name}: bonus`} />}</td>
                <td className={cn("text-right pr-3 num", cell)} data-label="PF">{Number(l.pf_employee) ? <span>{inr(l.pf_employee)}{Number(l.pf_wage ?? 0) > 0 && <span className="block text-[11.5px] font-normal text-steel whitespace-nowrap" data-pf-wage>on {formatINR(Number(l.pf_wage), { whole: true })}</span>}</span> : <span className="text-steel">—</span>}</td>
                <td className={cn("text-right pr-3 num", cell)} data-label="ESI">{Number(l.esi_employee) ? inr(l.esi_employee) : <span className="text-steel">—</span>}</td>
                <td className={cn("text-right pr-3 num", cell)} data-label="Advance">{Number(l.advances) ? inr(l.advances) : <span className="text-steel">—</span>}</td>
                <td className={cn("text-right pr-3", cell)} data-label="Other">{final ? <span className="num">{Number(l.other_deduction) ? inr(l.other_deduction) : "—"}</span> : <input inputMode="decimal" className="!w-24 !h-10 num text-right max-lg:!w-full max-lg:!h-10 max-lg:!min-h-10 max-lg:text-left max-lg:text-[15px]" value={e.other} placeholder="− 0" onChange={(x) => setEdits((all) => ({ ...all, [l.id]: { ...e, other: x.target.value.replace(/[^\d.]/g, "") } }))} aria-label={`${l.name}: other deductions`} />}</td>
                {/* net: a tinted bar across the card */}
                <td className="text-right pr-3 num font-extrabold text-[15px] max-lg:col-span-2 max-lg:flex max-lg:items-center max-lg:justify-between max-lg:gap-3 max-lg:!px-3.5 max-lg:!py-3 max-lg:rounded-xl max-lg:bg-[color-mix(in_srgb,var(--color-tint)_13%,transparent)] max-lg:text-[19px] max-lg:before:content-[attr(data-label)] max-lg:before:font-sans max-lg:before:text-[13px] max-lg:before:font-bold max-lg:before:text-[var(--color-tint)]" data-label="Net pay" data-net>{inr(l.net)}</td>
                <td className="pr-4 py-2 max-lg:col-span-2 max-lg:!p-0 max-lg:has-[>div:empty]:hidden"><div className="flex flex-wrap justify-end gap-1.5">
                  {!final && dirty && <button type="button" disabled={pending} className="svc-btn go sm !px-3" onClick={() => act(setLine(l.id, Number(e.bonus || 0), Number(e.other || 0), l.note ?? ""), `${l.name} updated`)} data-save-line>Save</button>}
                  {final && !l.paid_at && <select disabled={pending} defaultValue="" onChange={(x) => { const m = x.target.value; if (m) act(payLine(l.id, m), `${l.name} paid · in Salaries`); }} className="!w-auto !h-10 !min-h-10 text-[13px] font-bold" aria-label={`Pay ${l.name}`} data-pay><option value="" disabled>Pay…</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank</option></select>}
                  {l.paid_at && <span className="self-center rounded-full px-2.5 py-1 text-[12px] font-extrabold bg-[var(--color-green-2)] text-[var(--color-green)]" data-paid>Paid · {(l.paid_method ?? "").toUpperCase()}</span>}
                  {final && <button type="button" className="h-10 w-10 grid place-items-center rounded-xl bg-[var(--color-fill)]" onClick={() => void payslip(l)} aria-label={`Payslip for ${l.name}`} title="Payslip (PDF)" data-payslip><FileText size={16} /></button>}
                </div></td>
              </tr>); })}</tbody>
            <tfoot className="max-lg:hidden"><tr className="border-t-2 border-[var(--color-separator)] font-extrabold"><td className="py-3 pl-4">Total · {lines.length}</td><td /><td className="text-right pr-3 num">{inr(t.gross)}</td><td /><td className="text-right pr-3 num">{inr(t.pf)}</td><td className="text-right pr-3 num">{inr(t.esi)}</td><td className="text-right pr-3 num">{inr(t.adv)}</td><td className="text-right pr-3 num">{inr(t.other)}</td><td className="text-right pr-3 num text-[16px]" data-net-total>{inr(t.net)}</td><td /></tr></tfoot>
          </table></div>
          <div className="lg:hidden mx-3 mb-3 rounded-2xl ring-1 ring-inset ring-[var(--color-separator)] px-4 py-3 flex items-center justify-between gap-3" data-net-total-phone>
            <span className="min-w-0"><span className="block text-[12px] font-semibold text-steel">Net pay · {lines.length} people</span><span className="block text-[12px] font-semibold text-steel num">Gross {inr(t.gross)}</span></span>
            <span className="font-display num text-[22px] leading-none">{inr(t.net)}</span></div>
          {/* PF and ESI owed: the total big, the date it is due, and the split — staff's share and yours — as a bar
              with its legend (2026-10-21; was one sentence of sums) */}
          {(run.pf || run.esi) && <div className="p-4 border-t border-[var(--color-separator)] grid sm:grid-cols-2 gap-3" data-statutory>
            {([["pf", "PF to deposit", "EPFO", t.pf, t.pfr, run.pf], ["esi", "ESI to deposit", "ESIC", t.esi, t.esir, run.esi]] as const).filter((x) => x[5]).map(([k, title, office, staff, you]) => (
              <div key={k} className="rounded-2xl bg-[var(--color-fill)] p-4 min-w-0" data-deposit={k}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="h-9 w-9 shrink-0 rounded-xl grid place-items-center bg-[color-mix(in_srgb,var(--color-blue)_16%,transparent)] text-[var(--color-blue)]" aria-hidden><Landmark size={17} /></span>
                    <div className="min-w-0"><div className="text-[14.5px] font-bold leading-tight">{title}</div><div className="text-[12px] text-steel">{office}</div></div>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 h-7 text-[11.5px] font-bold bg-[var(--color-orange-2)] text-[var(--color-orange)] num"><CalendarClock size={13} aria-hidden />Due {dueOn}</span>
                </div>
                <div className="mt-3 font-display num text-[26px] leading-none" data-deposit-total>{inr(staff + you)}</div>
                <div className="mt-3 flex h-2 gap-[2px] rounded-full overflow-hidden" aria-hidden>
                  <span className="rounded-l-full bg-[var(--color-tint)]" style={{ flexGrow: staff || 0.0001 }} /><span className="rounded-r-full bg-[var(--color-blue)]" style={{ flexGrow: you || 0.0001 }} />
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-3 text-[12px] text-steel">
                  <div className="min-w-0"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--color-tint)]" aria-hidden />From staff</span><b className="block text-[14px] text-[var(--color-label)] num">{inr(staff)}</b></div>
                  <div className="min-w-0 text-right"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--color-blue)]" aria-hidden />From you</span><b className="block text-[14px] text-[var(--color-label)] num">{inr(you)}</b></div>
                </div>
              </div>))}
          </div>}
        </>)}
      </Card>
      <p className="text-[12.5px] text-steel">PF: 12% + 12% of basic + DA{cfg.rule ? " (≥50% pay)" : ""}, to ₹15,000/month</p>
    </div>
  );
}

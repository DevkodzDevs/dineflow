"use client";
import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Upload, Leaf, Drumstick, BedDouble, HardHat, Boxes, UtensilsCrossed, RotateCcw, Check, Zap, Keyboard, ArrowRight, QrCode, Barcode, Image as ImageIcon, Receipt, X, type LucideIcon } from "lucide-react";
import { Button, Field, Card, Pill, cn, PhoneInput } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { QUICK_QTY, INGREDIENT_CATEGORIES, LABOUR_SKILLS, UNITS, type ScanResult } from "@dineflow/shared";
import { lookupCode, createProductFromScan, stockFromScan, createDishFromScan, createLabourFromScan, punch, punchStaff, roomQuick } from "./actions";

type Mode = "idle" | "camera" | "result";
type Found = Awaited<ReturnType<typeof lookupCode>>;
type HintKey = "auto" | "ingredient" | "dish" | "room" | "labour";

/* one hue per kind of thing, as a token — the dock, the stage, the lanes and the log all read `--hue` (2026-11-11) */
const HUE: Record<string, string> = {
  auto: "var(--color-violet)", ingredient: "var(--color-orange)", product: "var(--color-orange)", dish: "var(--color-green)", room: "var(--color-blue)",
  booking: "var(--color-blue)", labour: "var(--color-cyan)", staff: "var(--color-cyan)", bill: "var(--color-tint)", unknown: "var(--color-label-3)",
};
const MODE_ICON: Record<HintKey, LucideIcon> = { auto: Zap, ingredient: Boxes, dish: UtensilsCrossed, room: BedDouble, labour: HardHat };
const KIND_LABEL: Record<string, string> = { ingredient: "Product", product: "Product", dish: "Dish", room: "Room", booking: "Booking", labour: "Labour", staff: "Staff", bill: "Bill" };
const KIND_ICON: Record<string, LucideIcon> = { ingredient: Boxes, product: Boxes, dish: UtensilsCrossed, room: BedDouble, booking: BedDouble, labour: HardHat, staff: HardHat, bill: Receipt };
const hueStyle = (k: string) => ({ "--hue": HUE[k] ?? HUE.unknown }) as CSSProperties;

export function ScanClient({ categories, recent, aiEnabled, idScan = false, propertyType }: { categories: { id: string; name: string }[]; recent: { id: string; source: string; kind: string | null; action: string | null; created_at: string; result: ScanResult | null }[]; aiEnabled: boolean; idScan?: boolean; propertyType: string }) {
  const videoRef = useRef<HTMLVideoElement>(null); const readerRef = useRef<{ stop: () => void } | null>(null);
  const [mode, setMode] = useState<Mode>("idle"); const [hint, setHint] = useState<HintKey>("auto");
  const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null); const [ai, setAi] = useState<ScanResult | null>(null); const [found, setFound] = useState<Found | null>(null);
  const [manual, setManual] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  // ── camera + live barcode/QR reading ──
  const startCamera = async () => {
    setErr(null); setMode("camera"); setAi(null); setFound(null); setPhoto(null);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      const back = devices.find((d) => /back|rear|environment/i.test(d.label)) ?? devices[0];
      const controls = await reader.decodeFromVideoDevice(back?.deviceId, videoRef.current!, (res) => { if (res) { const text = res.getText(); controls.stop(); readerRef.current = null; handleCode(text, "barcode"); } });
      readerRef.current = controls;
    } catch { setErr("No camera — allow access, or Upload / type a code."); setMode("idle"); }
  };
  const stopCamera = () => { readerRef.current?.stop(); readerRef.current = null; const v = videoRef.current; (v?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop()); if (v) v.srcObject = null; };
  useEffect(() => { const code = new URLSearchParams(window.location.search).get("code"); if (code) handleCode(code, "manual"); return () => stopCamera(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCode = async (code: string, source: "barcode" | "manual") => {
    setBusy("Looking up…"); setErr(null);
    const r = await lookupCode(code);
    setFound(r); setMode("result"); setBusy(null); stopCamera();
    if (r.kind === "labour" && "labourer" in r) { /* badge scan → punch */ const p = await punch(r.labourer.code); if ("event" in p) setToast(`${p.name} punched ${p.event === "in" ? "IN" : p.event === "out" ? `OUT · ${p.hours} h` : "(already done today)"}`); }
    if (r.kind === "staff" && "person" in r && r.person) { const p = await punchStaff(String(r.person.staff_code)); if ("event" in p) setToast(`${p.name} punched ${p.event === "in" ? "IN" : p.event === "out" ? `OUT · ${p.hours} h` : "(already done today)"}`); else if ("error" in p) setErr(p.error ?? null); }
    if (r.kind === "unknown" && source === "barcode") setAi({ kind: "ingredient", name: "", confidence: 0, unit: "kg", barcode: code, category: "grocery" });
  };
  const snap = async () => {
    const v = videoRef.current; if (!v) return;
    const c = document.createElement("canvas"); c.width = Math.min(1280, v.videoWidth); c.height = (c.width / v.videoWidth) * v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    stopCamera(); await recognise(c.toDataURL("image/jpeg", 0.85));
  };
  const onUpload = (f: File) => { const r = new FileReader(); r.onload = () => recognise(String(r.result)); r.readAsDataURL(f); };
  const recognise = async (dataUrl: string) => {
    setPhoto(dataUrl); setMode("result"); setFound(null); setAi(null); setErr(null); setBusy("Recognising…");
    const res = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: dataUrl, hint }) });
    const j = await res.json(); setBusy(null);
    if (!res.ok) { setErr(j.error ?? "failed"); setAi({ kind: hint === "auto" ? "ingredient" : hint, name: "", confidence: 0, unit: "kg" }); return; }
    if (j.barcode) { const r = await lookupCode(j.barcode); if (r.kind !== "unknown") { setFound(r); return; } }
    setAi(j);
  };
  const reset = () => { stopCamera(); setMode("idle"); setAi(null); setFound(null); setPhoto(null); setErr(null); setToast(null); };

  const modes: { k: HintKey; label: string }[] = [
    { k: "auto", label: "Auto" }, { k: "ingredient", label: "Vegetable / product" }, { k: "dish", label: "Dish" },
    ...(propertyType !== "restaurant" ? [{ k: "room" as const, label: "Room" }] : []), ...(idScan ? [{ k: "labour" as const, label: "Labour / ID" }] : []),
  ];
  // the screen's hue: the chosen mode while scanning, the recognised kind once there is a result
  const kindNow = found && found.kind !== "unknown" ? found.kind : ai?.kind;
  const hueKey = mode === "result" && kindNow ? kindNow : hint;
  const ModeIcon = MODE_ICON[hint];
  const hasRooms = propertyType !== "restaurant";

  return (
    <div data-scan className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]" style={hueStyle(hueKey)}>
      <div className="space-y-4 min-w-0">
        <div className="scan-modes" role="tablist" aria-label="What to scan">
          {modes.map(({ k, label }) => { const Icon = MODE_ICON[k]; const on = hint === k; return (
            <button key={k} type="button" role="tab" aria-selected={on} data-on={on} onClick={() => setHint(k)} className="scan-mode" style={hueStyle(k)}>
              {on && <motion.span layoutId="scan-mode-thumb" className="scan-mode-thumb" transition={{ type: "spring", stiffness: 520, damping: 42 }} />}
              <span className="scan-mode-ico"><Icon size={16} /></span><span>{label}</span>
            </button>); })}
        </div>

        <div className="scan-stage" data-mode={mode} data-photo={!!photo}>
          <div className="scan-view">
            <video ref={videoRef} className={cn(mode !== "camera" && "hidden")} muted playsInline autoPlay />
            {photo && mode === "result" && <img src={photo} alt="" />}
            <div className="scan-hud">
              <span className="scan-tag" data-live={mode === "camera" || undefined}><b />{mode === "camera" ? "Live" : mode === "result" ? "Result" : modes.find((m) => m.k === hint)?.label ?? "Auto"}</span>
              {!aiEnabled && <span className="scan-tag" data-sample title="Photos are a sample until the add-on is on">Sample mode</span>}
            </div>
            {mode !== "result" && <div className="scan-frame" aria-hidden><i /><i /><i /><i /></div>}
            {mode === "camera" && <><div className="scan-dim" /><motion.div className="scan-sweep" animate={{ top: ["20%", "80%", "20%"] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} /><div className="scan-foot">Codes auto-read · <b>Capture</b> photos</div></>}
            {mode === "idle" && <div className="scan-idle"><div><div className="scan-orb"><ModeIcon size={30} /></div><h2>Ready to scan</h2>
              <div className="scan-inputs"><span><Barcode size={13} /> Barcode</span><span><QrCode size={13} /> QR</span><span><ImageIcon size={13} /> Photo</span></div></div></div>}
            {mode === "result" && !photo && !busy && (() => { const I = KIND_ICON[kindNow ?? ""] ?? QrCode; return <div className="scan-idle"><div><div className="scan-orb"><I size={30} /></div><h2>{KIND_LABEL[kindNow ?? ""] ?? "Not found"}</h2>
              <div className="scan-inputs"><span>{kindNow ? "Details below" : "Try another code"}</span></div></div></div>; })()}
            {busy && <div className="scan-busy"><span><motion.span className="inline-flex" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}><RotateCcw size={16} /></motion.span>{busy}</span></div>}
          </div>
          <div className="scan-dock">
            {mode !== "camera" ? <Button onClick={startCamera}><Camera size={18} /> Open camera</Button> : <><Button onClick={snap}><Camera size={18} /> Capture photo</Button><Button variant="outline" onClick={reset}><X size={16} /> Close</Button></>}
            <label className="btn btn-gray cursor-pointer"><Upload size={16} /> Upload photo<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} /></label>
            <form className="scan-code" onSubmit={(e) => { e.preventDefault(); if (manual) handleCode(manual, "manual"); }}>
              <Keyboard size={16} className="shrink-0" /><input placeholder="Type code / room no." value={manual} onChange={(e) => setManual(e.target.value)} className="num" aria-label="Code or room number" />
              <button type="submit" aria-label="Look up" disabled={!manual}><ArrowRight size={17} /></button>
            </form>
          </div>
          {err && <p className="scan-err">{err}</p>}
        </div>

        <AnimatePresence>
          {toast && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="feather p-4 flex items-center gap-2 border-mint"><Check size={16} className="text-mint" /> {toast}</motion.div>}
          {found && found.kind !== "unknown" && <FoundCard key="found" found={found} onDone={(m) => { setToast(m); }} onReset={reset} />}
          {ai && (!found || found.kind === "unknown") && <AiCard key="ai" ai={ai} setAi={setAi} categories={categories} onDone={(m) => { setToast(m); setAi(null); }} onReset={reset} />}
        </AnimatePresence>
      </div>

      <aside className="space-y-4 min-w-0">
        <Card>
          <div className="card-title"><h3>Where it lands</h3><Link href="/labour?tab=labels" className="more">Print labels</Link></div>
          <div className="scan-lanes">
            <Lane k="ingredient" Icon={Boxes} label="Vegetable / packet" to="Pantry" />
            <Lane k="dish" Icon={UtensilsCrossed} label="Dish" to="Menu" />
            {hasRooms && <Lane k="room" Icon={BedDouble} label="Room door / key tag" to="Room" />}
            <Lane k="labour" Icon={HardHat} label="Worker / ID card" to="Labour" />
            <Lane k="bill" Icon={Receipt} label="Bill QR" to="Bill" />
          </div>
        </Card>
        <Card>
          <div className="card-title"><h3>Recent scans</h3>{recent.length > 0 && <span className="more num">{recent.length}</span>}</div>
          <ul className="scan-log">
            {recent.map((r) => { const Icon = KIND_ICON[r.kind ?? ""] ?? QrCode; return (
              <li key={r.id} style={hueStyle(r.kind ?? "unknown")}>
                <span className="scan-ico sm"><Icon size={14} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{r.result?.name ?? r.action ?? r.source}</span><span className="kind">{r.kind ?? "?"}</span></span>
                <span className="num text-xs text-steel">{new Date(r.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
              </li>); })}
            {recent.length === 0 && <li className="text-sm text-steel">Nothing yet</li>}
          </ul>
        </Card>
      </aside>
    </div>
  );
}

/* a row of the "Where it lands" panel: a hue square, what you point at, where it goes */
function Lane({ k, Icon, label, to }: { k: string; Icon: LucideIcon; label: string; to: string }) {
  return <div className="scan-lane" style={hueStyle(k)}><span className="scan-ico"><Icon size={16} /></span><b>{label}</b><span className="to">{to} <ArrowRight size={12} /></span></div>;
}

/* ── an existing thing was recognised by code ── */
function FoundCard({ found, onDone, onReset }: { found: Found; onDone: (m: string) => void; onReset: () => void }) {
  const [pending, start] = useTransition(); const [qty, setQty] = useState(0); const [reason, setReason] = useState<"purchase" | "wastage" | "adjustment">("purchase");
  if (found.kind === "ingredient" && "ingredient" in found) {
    const i = found.ingredient; const quick = QUICK_QTY[i.unit] ?? QUICK_QTY.pcs; const pack = Number(i.pack_qty ?? 0);
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="feather p-5">
        <div className="flex items-start justify-between"><div><Pill tone="ready">product</Pill><h3 className="text-2xl mt-2">{i.name}</h3><div className="text-sm text-steel">{i.brand ? `${i.brand} · ` : ""}{i.category ?? ""} · in stock <b className="num text-ink">{Number(i.current_stock).toFixed(2)} {i.unit}</b></div></div><Link href="/inventory" className="text-xs underline text-steel">Pantry</Link></div>
        <div className="mt-4 flex gap-1 p-1 bg-porcelain-2 rounded-xl w-fit">{(["purchase", "wastage", "adjustment"] as const).map((r) => <button key={r} onClick={() => setReason(r)} className={cn("h-8 px-3 rounded-lg text-xs font-semibold capitalize", reason === r ? "bg-card shadow-feather" : "text-steel")}>{r === "purchase" ? "Add stock" : r}</button>)}</div>
        <div className="mt-3 flex flex-wrap gap-1.5">{pack > 0 && <button onClick={() => setQty(pack)} className={cn("chip", qty === pack && "on")}>1 pack · {pack} {i.unit}</button>}{quick.map((q) => <button key={q.label} onClick={() => setQty(q.qty)} className={cn("chip", qty === q.qty && "on")}>{q.label}</button>)}<input type="number" step="0.001" className="num !w-28" placeholder={`custom ${i.unit}`} value={qty || ""} onChange={(e) => setQty(Number(e.target.value))} /></div>
        <div className="mt-4 flex gap-2"><Button disabled={pending || !qty} onClick={() => start(async () => { const r = await stockFromScan(i.id, qty, reason, reason === "wastage" ? "out" : "in"); if ("ok" in r) onDone(`${i.name}: ${reason === "wastage" ? "−" : "+"}${qty} ${i.unit} recorded`); })}><Check size={16} /> {reason === "wastage" ? "Record wastage" : "Add to storage"}</Button><Button variant="outline" onClick={onReset}>Scan next</Button></div>
      </motion.div>
    );
  }
  if (found.kind === "dish" && "dish" in found) return <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="feather p-5"><Pill tone="preparing">dish</Pill><h3 className="text-2xl mt-2">{found.dish.name}</h3><div className="num text-steel">{formatINR(Number(found.dish.price))} · {found.dish.is_available ? "available" : "sold out"}</div><div className="mt-4 flex gap-2"><Link href="/orders/new"><Button>Order it</Button></Link><Link href="/menu"><Button variant="outline">Menu</Button></Link><Button variant="ghost" onClick={onReset}>Scan next</Button></div></motion.div>;
  if (found.kind === "room" && "room" in found) { const r = found.room as unknown as { id: string; number: string; floor: number; status: string; room_types: { name: string; base_rate: number } | null }; const b = found.booking as unknown as { id: string; guests: { full_name: string } | null; check_out: string } | null;
    return <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="feather p-5"><Pill tone="sky">room</Pill><h3 className="text-2xl mt-2">Room {r.number} <span className="text-steel text-base font-sans">· {r.room_types?.name} · floor {r.floor}</span></h3>
      <div className="mt-1 text-sm">{b ? <>Occupied by <b>{b.guests?.full_name}</b> · check-out <span className="num">{b.check_out}</span></> : <span className="capitalize">{r.status}</span>}</div>
      <div className="mt-4 flex flex-wrap gap-2">{b ? <Link href={`/frontdesk/${b.id}`}><Button>Open folio</Button></Link> : <Link href="/frontdesk"><Button>Book this room</Button></Link>}
        {r.status !== "occupied" && r.status !== "available" && <Button variant="outline" disabled={pending} onClick={() => start(async () => { const res = await roomQuick(r.id, "available"); onDone("error" in res ? res.error! : `Room ${r.number} marked ready`); })}>Mark ready</Button>}
        {r.status === "available" && <Button variant="outline" disabled={pending} onClick={() => start(async () => { const res = await roomQuick(r.id, "cleaning"); onDone("error" in res ? res.error! : `Room ${r.number} sent to cleaning`); })}>Needs cleaning</Button>}
        <Button variant="ghost" onClick={onReset}>Scan next</Button></div></motion.div>; }
  if (found.kind === "labour" && "labourer" in found) { const l = found.labourer as unknown as { id: string; code: string; full_name: string; skill: string | null; daily_wage: number };
    return <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="feather p-5"><Pill tone="gold">labour · {l.code}</Pill><h3 className="text-2xl mt-2">{l.full_name}</h3><div className="text-sm text-steel">{l.skill} · {formatINR(Number(l.daily_wage))}/day · attendance marked</div><div className="mt-4 flex gap-2"><Link href={`/labour?open=${l.id}`}><Button>Open profile</Button></Link><Button variant="ghost" onClick={onReset}>Scan next</Button></div></motion.div>; }
  if (found.kind === "staff" && "person" in found) { const p = found.person as unknown as { full_name: string; staff_code: string; role: string };
    return <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="feather p-5"><Pill tone="sky">staff · {p.staff_code}</Pill><h3 className="text-2xl mt-2">{p.full_name}</h3><div className="text-sm text-steel capitalize">{p.role} · attendance marked</div><div className="mt-4 flex gap-2"><Link href="/staff"><Button>Staff</Button></Link><Button variant="ghost" onClick={onReset}>Scan next</Button></div></motion.div>; }
  if (found.kind === "bill" && "bill" in found) { const b = found.bill as unknown as { id: string; bill_no: number; order_id: string; total: number; status: string; created_at: string }; return <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="feather p-5"><div className="flex items-center gap-2"><Pill tone={b.status === "paid" ? "ready" : "pending"}>{b.status === "paid" ? "paid" : "unpaid"}</Pill><span className="text-xs text-steel num">{new Date(b.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span></div><h3 className="text-2xl mt-2">Bill #{b.bill_no} · <span className="num">{formatINR(Number(b.total))}</span></h3><div className="mt-4"><Link href={`/billing/${b.order_id}`}><Button>Open bill</Button></Link></div></motion.div>; }
  if (found.kind === "booking" && "booking" in found) { const b = found.booking as unknown as { id: string; booking_no: number; rooms: { number: string } | null; guests: { full_name: string } | null }; return <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="feather p-5"><Pill tone="sky">booking #{b.booking_no}</Pill><h3 className="text-2xl mt-2">Room {b.rooms?.number} · {b.guests?.full_name}</h3><div className="mt-4"><Link href={`/frontdesk/${b.id}`}><Button>Open folio</Button></Link></div></motion.div>; }
  return null;
}

/* ── the photo model recognised something new → confirm & create ── */
function AiCard({ ai, setAi, categories, onDone, onReset }: { ai: ScanResult; setAi: (a: ScanResult) => void; categories: { id: string; name: string }[]; onDone: (m: string) => void; onReset: () => void }) {
  const [pending, start] = useTransition(); const [err, setErr] = useState<string | null>(null);
  const [qty, setQty] = useState(ai.estimated_qty ?? 0); const [reason, setReason] = useState<"purchase" | "opening">("purchase");
  const [price, setPrice] = useState(ai.price_estimate_inr ?? 0); const [wage, setWage] = useState(500); const [catId, setCatId] = useState(categories[0]?.id ?? "");
  const set = (k: keyof ScanResult, v: unknown) => setAi({ ...ai, [k]: v });
  const unit = ai.unit ?? "kg"; const quick = QUICK_QTY[unit] ?? QUICK_QTY.pcs;
  const kinds: { k: ScanResult["kind"]; label: string; Icon: typeof Leaf }[] = [{ k: "ingredient", label: "Product", Icon: Boxes }, { k: "dish", label: "Dish", Icon: UtensilsCrossed }, { k: "room", label: "Room", Icon: BedDouble }, { k: "labour", label: "Labour", Icon: HardHat }];
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="feather p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap"><span className="text-xs font-semibold uppercase tracking-wide text-steel">Recognised as</span>{kinds.map(({ k, label, Icon }) => <button key={k} onClick={() => set("kind", k)} className={cn("chip gap-1.5 !h-8 text-xs", ai.kind === k && "on")}><Icon size={13} /> {label}</button>)}{(ai as { demo?: boolean }).demo ? <span className="ml-auto pill pill-gold">sample</span> : ai.confidence > 0 ? <span className={cn("ml-auto num text-xs", ai.confidence >= 0.7 ? "text-mint" : "text-chili")}>{Math.round(ai.confidence * 100)}% sure</span> : null}</div>
      {ai.notes && <p className="text-xs text-steel">{ai.notes}</p>}

      {(ai.kind === "ingredient" || ai.kind === "product" || ai.kind === "unknown") && (<>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Product name"><input value={ai.name} onChange={(e) => set("name", e.target.value)} placeholder="Tomato" autoFocus /></Field>
          <Field label="Category"><select value={ai.category ?? "vegetable"} onChange={(e) => set("category", e.target.value)}>{INGREDIENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Unit"><select value={unit} onChange={(e) => { set("unit", e.target.value); setQty(0); }}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></Field>
          <Field label={`Cost per ${unit} (₹)`}><input type="number" className="num" value={price || ""} onChange={(e) => setPrice(Number(e.target.value))} /></Field>
          <Field label="Brand (packaged)"><input value={ai.brand ?? ""} onChange={(e) => set("brand", e.target.value)} placeholder="—" /></Field>
          <Field label="Barcode" hint="Next scan adds stock"><input className="num" value={ai.barcode ?? ""} onChange={(e) => set("barcode", e.target.value)} placeholder="optional" /></Field>
        </div>
        <div><label>Quantity in hand · {unit}</label><div className="mt-1.5 flex flex-wrap gap-1.5">{quick.map((q) => <button key={q.label} onClick={() => setQty(q.qty)} className={cn("chip", qty === q.qty && "on")}>{q.label}</button>)}<input type="number" step="0.001" className="num !w-28" placeholder="custom" value={qty || ""} onChange={(e) => setQty(Number(e.target.value))} /></div>
          <div className="mt-2 flex gap-1 p-1 bg-porcelain-2 rounded-xl w-fit">{(["purchase", "opening"] as const).map((r) => <button key={r} onClick={() => setReason(r)} className={cn("h-8 px-3 rounded-lg text-xs font-semibold", reason === r ? "bg-card shadow-feather" : "text-steel")}>{r === "purchase" ? "Just bought" : "Already in store"}</button>)}</div></div>
        {err && <p className="text-sm text-chili">{err}</p>}
        <div className="flex gap-2"><Button disabled={pending || !ai.name} onClick={() => start(async () => { const r = await createProductFromScan({ name: ai.name, unit, category: ai.category, brand: ai.brand, barcode: ai.barcode, pack_qty: ai.barcode ? qty || null : null, cost_per_unit: price, qty, reason, note: ai.notes }); if ("error" in r) setErr(r.error!); else onDone(`${ai.name} created in Pantry${qty ? ` with ${qty} ${unit}` : ""}`); })}><Boxes size={16} /> Create product{qty ? ` + stock ${qty} ${unit}` : ""}</Button><Button variant="outline" onClick={onReset}>Discard</Button></div>
      </>)}

      {ai.kind === "dish" && (<>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Dish name"><input value={ai.name} onChange={(e) => set("name", e.target.value)} autoFocus /></Field>
          <Field label="Price (₹)"><input type="number" className="num" value={price || ""} onChange={(e) => setPrice(Number(e.target.value))} /></Field>
          <Field label="Category"><select value={catId} onChange={(e) => setCatId(e.target.value)}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Type"><div className="flex gap-2 pt-1"><button onClick={() => set("is_veg", true)} className={cn("chip gap-1", ai.is_veg !== false && "on")}><Leaf size={13} /> Veg</button><button onClick={() => set("is_veg", false)} className={cn("chip gap-1", ai.is_veg === false && "on")}><Drumstick size={13} /> Non-veg</button></div></Field>
          <div className="sm:col-span-2"><Field label="Description"><input value={ai.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field></div>
        </div>
        {err && <p className="text-sm text-chili">{err}</p>}
        <div className="flex gap-2"><Button disabled={pending || !ai.name || !price} onClick={() => start(async () => { const r = await createDishFromScan({ name: ai.name, price, is_veg: ai.is_veg ?? true, description: ai.description, barcode: ai.barcode, category_id: catId || null }); if ("error" in r) setErr(r.error!); else onDone(`${ai.name} added to the Menu at ${formatINR(price)}`); })}><UtensilsCrossed size={16} /> Add to menu</Button><Button variant="outline" onClick={onReset}>Discard</Button></div>
      </>)}

      {ai.kind === "room" && (<>
        <p className="text-sm text-steel">Looks like <b className="text-ink">Room {ai.room_number ?? "?"}</b></p>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const n = (e.currentTarget.elements.namedItem("n") as HTMLInputElement).value; if (n) window.location.href = `/scan?code=${n}`; }}><input name="n" defaultValue={ai.room_number ?? ""} className="num !w-32" placeholder="104" /><Link href={`/rooms`}><Button variant="outline">Rooms</Button></Link><Link href="/labour?tab=labels"><Button variant="outline">Print labels</Button></Link></form>
      </>)}

      {ai.kind === "labour" && (<>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Full name"><input value={ai.labour?.full_name ?? ai.name} onChange={(e) => set("labour", { ...ai.labour, full_name: e.target.value })} autoFocus /></Field>
          <Field label="Phone"><PhoneInput value={ai.labour?.phone ?? ""} onValue={(v) => set("labour", { ...ai.labour, phone: v })} /></Field>
          <Field label="Skill"><select value={ai.labour?.skill ?? "other"} onChange={(e) => set("labour", { ...ai.labour, skill: e.target.value })}>{LABOUR_SKILLS.map((k) => <option key={k}>{k}</option>)}</select></Field>
          <Field label="Daily wage (₹)"><input type="number" className="num" value={wage || ""} onChange={(e) => setWage(Number(e.target.value))} /></Field>
          <Field label="ID type"><input value={ai.labour?.id_type ?? ""} onChange={(e) => set("labour", { ...ai.labour, id_type: e.target.value })} placeholder="Aadhaar" /></Field>
          <Field label="ID last 4" hint="Only last 4 stored"><input maxLength={4} className="num" value={ai.labour?.id_last4 ?? ""} onChange={(e) => set("labour", { ...ai.labour, id_last4: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="Address"><input value={ai.labour?.address ?? ""} onChange={(e) => set("labour", { ...ai.labour, address: e.target.value })} /></Field></div>
        </div>
        {err && <p className="text-sm text-chili">{err}</p>}
        <div className="flex gap-2"><Button disabled={pending || !(ai.labour?.full_name ?? ai.name)} onClick={() => start(async () => { const r = await createLabourFromScan({ full_name: ai.labour?.full_name ?? ai.name, phone: ai.labour?.phone, skill: ai.labour?.skill, daily_wage: wage, id_type: ai.labour?.id_type, id_last4: ai.labour?.id_last4, address: ai.labour?.address, notes: ai.notes }); if ("error" in r) setErr(r.error!); else onDone(`${ai.labour?.full_name ?? ai.name} added to Labour · badge ${r.code}`); })}><HardHat size={16} /> Add labourer</Button><Button variant="outline" onClick={onReset}>Discard</Button></div>
      </>)}
    </motion.div>
  );
}

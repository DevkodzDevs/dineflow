"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, ScanLine, Upload, Leaf, Drumstick, BedDouble, HardHat, Boxes, UtensilsCrossed, RotateCcw, Check, Zap, Keyboard } from "lucide-react";
import { Button, Field, Card, Pill, cn } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { QUICK_QTY, INGREDIENT_CATEGORIES, LABOUR_SKILLS, UNITS, type ScanResult } from "@dineflow/shared";
import { lookupCode, createProductFromScan, stockFromScan, createDishFromScan, createLabourFromScan, punch, roomQuick } from "./actions";

type Mode = "idle" | "camera" | "result";
type Found = Awaited<ReturnType<typeof lookupCode>>;

export function ScanClient({ categories, recent, aiEnabled, propertyType }: { categories: { id: string; name: string }[]; recent: { id: string; source: string; kind: string | null; action: string | null; created_at: string; result: ScanResult | null }[]; aiEnabled: boolean; propertyType: string }) {
  const videoRef = useRef<HTMLVideoElement>(null); const readerRef = useRef<{ stop: () => void } | null>(null);
  const [mode, setMode] = useState<Mode>("idle"); const [hint, setHint] = useState<"auto" | "ingredient" | "dish" | "room" | "labour">("auto");
  const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null); const [ai, setAi] = useState<ScanResult | null>(null); const [found, setFound] = useState<Found | null>(null);
  const [manual, setManual] = useState("");

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
    } catch (e) { setErr("Camera not available — allow camera access, or use Upload / type a code."); setMode("idle"); }
  };
  const stopCamera = () => { readerRef.current?.stop(); readerRef.current = null; const v = videoRef.current; (v?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop()); if (v) v.srcObject = null; };
  useEffect(() => { const code = new URLSearchParams(window.location.search).get("code"); if (code) handleCode(code, "manual"); return () => stopCamera(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCode = async (code: string, source: "barcode" | "manual") => {
    setBusy("Looking up…"); setErr(null);
    const r = await lookupCode(code);
    setFound(r); setMode("result"); setBusy(null); stopCamera();
    if (r.kind === "labour" && "labourer" in r) { /* badge scan → punch */ const p = await punch(r.labourer.code); if ("event" in p) setToast(`${p.name} punched ${p.event === "in" ? "IN" : p.event === "out" ? `OUT · ${p.hours} h` : "(already done today)"}`); }
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
  const [toast, setToast] = useState<string | null>(null);

  const Hint = ({ k, label, Icon }: { k: typeof hint; label: string; Icon: typeof Leaf }) => <button onClick={() => setHint(k)} className={cn("chip gap-1.5", hint === k && "on")}><Icon size={14} /> {label}</button>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2"><Hint k="auto" label="Auto" Icon={Zap} /><Hint k="ingredient" label="Vegetable / product" Icon={Boxes} /><Hint k="dish" label="Dish" Icon={UtensilsCrossed} />{propertyType !== "restaurant" && <Hint k="room" label="Room" Icon={BedDouble} />}<Hint k="labour" label="Labour / ID" Icon={HardHat} /></div>

        <div className="glass overflow-hidden">
          <div className="relative aspect-[4/3] md:aspect-video bg-ink">
            <video ref={videoRef} className={cn("absolute inset-0 h-full w-full object-cover", mode !== "camera" && "hidden")} muted playsInline autoPlay />
            {photo && mode === "result" && <img src={photo} alt="" className="absolute inset-0 h-full w-full object-contain" />}
            {mode === "camera" && <><div className="absolute inset-x-[12%] inset-y-[18%] border-2 border-saffron/80 rounded-2xl [box-shadow:0_0_0_9999px_rgb(16_32_26/.35)]" /><motion.div className="absolute left-[12%] right-[12%] h-0.5 bg-saffron/90 shadow-[0_0_16px_rgb(232_163_61)]" animate={{ top: ["20%", "80%", "20%"] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} /><div className="absolute bottom-3 inset-x-0 text-center text-xs text-white/80">Barcodes & QR read automatically · tap <b>Capture</b> for photos</div></>}
            {mode === "idle" && <div className="absolute inset-0 grid place-items-center text-center text-white/70 p-6"><div><ScanLine size={40} className="mx-auto mb-3 text-saffron" /><div className="font-display text-2xl text-white">Ready to scan</div><div className="text-sm mt-1">Barcode, DineFlow QR label, or a photo of the thing itself</div></div></div>}
            {busy && <div className="absolute inset-0 grid place-items-center bg-ink/60 text-white"><div className="flex items-center gap-2 text-sm"><motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}><RotateCcw size={16} /></motion.span>{busy}</div></div>}
          </div>
          <div className="p-3 flex flex-wrap gap-2 items-center">
            {mode !== "camera" ? <Button onClick={startCamera}><Camera size={16} /> Open camera</Button> : <><Button onClick={snap}><Camera size={16} /> Capture photo</Button><Button variant="outline" onClick={reset}>Close</Button></>}
            <label className="btn-like inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-line bg-card text-sm font-semibold cursor-pointer hover:bg-porcelain"><Upload size={16} /> Upload photo<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} /></label>
            <form className="ml-auto flex gap-1" onSubmit={(e) => { e.preventDefault(); if (manual) handleCode(manual, "manual"); }}><input placeholder="Type code / room no." value={manual} onChange={(e) => setManual(e.target.value)} className="!w-40 !py-2 num" /><Button variant="outline" size="md" aria-label="Look up"><Keyboard size={16} /></Button></form>
          </div>
          {!aiEnabled && <p className="px-4 pb-3 text-xs text-steel">Running in <b>sample mode</b>: photos return an example result so you can try the whole flow. Add <span className="num">ANTHROPIC_API_KEY</span> to <span className="num">apps/web/.env.local</span> for real recognition. Barcode and QR scanning are real either way.</p>}
          {err && <p className="px-4 pb-3 text-sm text-chili">{err}</p>}
        </div>

        <AnimatePresence>
          {toast && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="feather p-4 flex items-center gap-2 border-mint"><Check size={16} className="text-mint" /> {toast}</motion.div>}
          {found && found.kind !== "unknown" && <FoundCard key="found" found={found} onDone={(m) => { setToast(m); }} onReset={reset} />}
          {ai && (!found || found.kind === "unknown") && <AiCard key="ai" ai={ai} setAi={setAi} categories={categories} onDone={(m) => { setToast(m); setAi(null); }} onReset={reset} />}
        </AnimatePresence>
      </div>

      <aside className="space-y-4">
        <Card><div className="text-xs font-semibold uppercase tracking-wide text-steel mb-2">How it lands</div>
          <ul className="text-sm space-y-2 text-steel">
            <li className="flex gap-2"><Boxes size={15} className="shrink-0 mt-0.5 text-ink" /><span><b className="text-ink">Vegetable / packet</b> → new product in Pantry with unit, category, price; pick 200 g / ½ kg / 1 kg and it's stocked. Scan the same barcode next time → adds stock in one tap.</span></li>
            <li className="flex gap-2"><UtensilsCrossed size={15} className="shrink-0 mt-0.5 text-ink" /><span><b className="text-ink">Dish</b> → new item on the Menu with a suggested price and veg/non-veg.</span></li>
            {propertyType !== "restaurant" && <li className="flex gap-2"><BedDouble size={15} className="shrink-0 mt-0.5 text-ink" /><span><b className="text-ink">Room door / key tag</b> → opens the room: who's in it, mark cleaning or ready.</span></li>}
            <li className="flex gap-2"><HardHat size={15} className="shrink-0 mt-0.5 text-ink" /><span><b className="text-ink">Worker / ID card</b> → new labourer with name, ID type, last 4 digits, wage. Their badge QR then punches attendance.</span></li>
          </ul>
          <Link href="/labour?tab=labels" className="mt-3 inline-block text-xs font-semibold underline">Print QR labels for rooms, products, workers →</Link></Card>
        <Card><div className="text-xs font-semibold uppercase tracking-wide text-steel mb-2">Recent scans</div>
          <ul className="space-y-1.5 text-sm">{recent.map((r) => <li key={r.id} className="flex items-center gap-2"><Pill tone={r.kind === "labour" ? "gold" : r.kind === "room" ? "sky" : r.kind === "dish" ? "preparing" : "ready"}>{r.kind ?? "?"}</Pill><span className="flex-1 truncate">{r.result?.name ?? r.action ?? r.source}</span><span className="num text-xs text-steel">{new Date(r.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span></li>)}{recent.length === 0 && <li className="text-steel">Nothing scanned yet.</li>}</ul></Card>
      </aside>
    </div>
  );
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
        {r.status !== "occupied" && r.status !== "available" && <Button variant="outline" disabled={pending} onClick={() => start(async () => { await roomQuick(r.id, "available"); onDone(`Room ${r.number} marked ready`); })}>Mark ready</Button>}
        {r.status === "available" && <Button variant="outline" disabled={pending} onClick={() => start(async () => { await roomQuick(r.id, "cleaning"); onDone(`Room ${r.number} sent to cleaning`); })}>Needs cleaning</Button>}
        <Button variant="ghost" onClick={onReset}>Scan next</Button></div></motion.div>; }
  if (found.kind === "labour" && "labourer" in found) { const l = found.labourer as unknown as { id: string; code: string; full_name: string; skill: string | null; daily_wage: number };
    return <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="feather p-5"><Pill tone="gold">labour · {l.code}</Pill><h3 className="text-2xl mt-2">{l.full_name}</h3><div className="text-sm text-steel">{l.skill} · {formatINR(Number(l.daily_wage))}/day · attendance punched automatically</div><div className="mt-4 flex gap-2"><Link href={`/labour?open=${l.id}`}><Button>Open profile</Button></Link><Button variant="ghost" onClick={onReset}>Scan next</Button></div></motion.div>; }
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
          <Field label="Barcode" hint="Scan the pack next time → adds stock directly"><input className="num" value={ai.barcode ?? ""} onChange={(e) => set("barcode", e.target.value)} placeholder="optional" /></Field>
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
        <p className="text-sm text-steel">Looks like <b className="text-ink">Room {ai.room_number ?? "?"}</b>. Type the number to open it, or print QR labels so doors scan instantly.</p>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const n = (e.currentTarget.elements.namedItem("n") as HTMLInputElement).value; if (n) window.location.href = `/scan?code=${n}`; }}><input name="n" defaultValue={ai.room_number ?? ""} className="num !w-32" placeholder="104" /><Link href={`/rooms`}><Button variant="outline">Rooms</Button></Link><Link href="/labour?tab=labels"><Button variant="outline">Print labels</Button></Link></form>
      </>)}

      {ai.kind === "labour" && (<>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Full name"><input value={ai.labour?.full_name ?? ai.name} onChange={(e) => set("labour", { ...ai.labour, full_name: e.target.value })} autoFocus /></Field>
          <Field label="Phone"><input value={ai.labour?.phone ?? ""} onChange={(e) => set("labour", { ...ai.labour, phone: e.target.value })} /></Field>
          <Field label="Skill"><select value={ai.labour?.skill ?? "other"} onChange={(e) => set("labour", { ...ai.labour, skill: e.target.value })}>{LABOUR_SKILLS.map((k) => <option key={k}>{k}</option>)}</select></Field>
          <Field label="Daily wage (₹)"><input type="number" className="num" value={wage || ""} onChange={(e) => setWage(Number(e.target.value))} /></Field>
          <Field label="ID type"><input value={ai.labour?.id_type ?? ""} onChange={(e) => set("labour", { ...ai.labour, id_type: e.target.value })} placeholder="Aadhaar" /></Field>
          <Field label="ID last 4" hint="Only the last 4 digits are stored"><input maxLength={4} className="num" value={ai.labour?.id_last4 ?? ""} onChange={(e) => set("labour", { ...ai.labour, id_last4: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="Address"><input value={ai.labour?.address ?? ""} onChange={(e) => set("labour", { ...ai.labour, address: e.target.value })} /></Field></div>
        </div>
        {err && <p className="text-sm text-chili">{err}</p>}
        <div className="flex gap-2"><Button disabled={pending || !(ai.labour?.full_name ?? ai.name)} onClick={() => start(async () => { const r = await createLabourFromScan({ full_name: ai.labour?.full_name ?? ai.name, phone: ai.labour?.phone, skill: ai.labour?.skill, daily_wage: wage, id_type: ai.labour?.id_type, id_last4: ai.labour?.id_last4, address: ai.labour?.address, notes: ai.notes }); if ("error" in r) setErr(r.error!); else onDone(`${ai.labour?.full_name ?? ai.name} added to Labour · badge ${r.code}`); })}><HardHat size={16} /> Add labourer</Button><Button variant="outline" onClick={onReset}>Discard</Button></div>
      </>)}
    </motion.div>
  );
}

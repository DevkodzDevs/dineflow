"use client";
import { useEffect, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Plus, Printer as P, Bluetooth, Usb, Wifi, Monitor, Trash2, Play, Info } from "lucide-react";
import { Button, Sheet, Field, Card, Pill, Empty, ask } from "@/components/ui";
import { billHtml } from "@/lib/print/html";
import { sendToPrinter, type PrinterCfg, type Script } from "@/lib/print/transport";
import { buildBillBytes, decideScript, getScript, sampleBill, setScript, SCRIPTS } from "@/lib/print/script";
import { savePrinter, deletePrinter } from "./actions";

type Pr = { id: string; name: string; kind: string; transport: string; width: number; address: string | null; station: string | null; copies: number; cut: boolean; drawer: boolean; footer: string | null; is_default: boolean };
const TIcon = ({ t }: { t: string }) => (t === "bluetooth" ? <Bluetooth size={15} /> : t === "usb" ? <Usb size={15} /> : t === "network" ? <Wifi size={15} /> : <Monitor size={15} />);

export function PrintersClient({ printers, restaurant }: { printers: Pr[]; restaurant: { name: string; address: string | null; phone: string | null; gstin: string | null } }) {
  const [edit, setEdit] = useState<Partial<Pr> | null>(null); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null); const [pending, start] = useTransition();
  /* Script (text or picture) is this device's choice, read after mount — the server does not know it. */
  const [scripts, setScripts] = useState<Record<string, Script>>({});
  useEffect(() => { setScripts(Object.fromEntries(printers.map((p) => [p.id, getScript(p.id)]))); }, [printers]);
  const choose = (id: string, s: Script) => { setScript(id, s); setScripts((m) => ({ ...m, [id]: s })); };
  const cfgOf = (p: Pr): PrinterCfg => ({ id: p.id, name: p.name, transport: p.transport as never, width: p.width, address: p.address, copies: 1, script: scripts[p.id] ?? "auto" });
  /* The sample is in three scripts on purpose: on Text only the Tamil and Hindi lines print as symbols, which is the point. */
  const test = async (p: Pr) => {
    setErr(null); setMsg(null);
    const d = sampleBill(restaurant, p.footer), cfg = cfgOf(p);
    try { await sendToPrinter(cfg, await buildBillBytes(d, cfg), billHtml(d)); setMsg(`Test sent to ${p.name}${cfg.transport === "browser" ? "" : decideScript(cfg, d) === "raster" ? " as a picture" : " as text"}`); }
    catch (e) { setErr((e as Error).message); }
  };
  return (
    <div className="space-y-5">
      <Card className="flex items-start gap-3 !bg-sky-2 border-sky"><Info size={18} className="shrink-0 mt-0.5" /><div className="text-sm">
        <b>Which connection?</b> <b>Bluetooth</b>: 58 mm, Chrome on Android/Windows. <b>USB</b>: this machine, Chrome desktop. <b>Network</b>: run <span className="num">node scripts/print-bridge.mjs</span> once (or <span className="num">Print-Bridge.bat</span>). <b>Browser</b>: print dialog, works everywhere. <b>Tamil / Hindi</b>: leave Script on Auto — a line in another script prints as a picture.</div></Card>
      <div className="flex justify-end"><Button onClick={() => setEdit({ kind: "bill", transport: "browser", width: 80, copies: 1, cut: true })}><Plus size={16} /> Add printer</Button></div>
      {msg && <p className="text-sm text-mint">{msg}</p>}{err && <p className="text-sm text-chili">{err}</p>}
      {printers.length === 0 ? <Empty title="No printers yet" hint="Or use browser printing" /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{printers.map((p, i) => (
          <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card lift className="h-full"><div className="flex items-start gap-3"><span className="h-10 w-10 rounded-2xl bg-ink text-on-label grid place-items-center"><P size={17} /></span>
              <div className="flex-1 min-w-0"><div className="font-semibold truncate">{p.name} {p.is_default && <Pill tone="gold">default</Pill>}</div><div className="text-xs text-steel flex items-center gap-1.5"><TIcon t={p.transport} /> {p.transport}{p.address ? ` · ${p.address}` : ""} · {p.width} mm</div></div></div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs"><Pill tone={p.kind === "kot" ? "preparing" : "ready"}>{p.kind}</Pill>{p.station && <Pill tone="sky">{p.station}</Pill>}{p.copies > 1 && <Pill tone="pending">{p.copies} copies</Pill>}{p.drawer && <Pill tone="pending">opens drawer</Pill>}</div>
              {p.transport !== "browser" && (
                <div className="mt-3" data-print-script={p.id}>
                  <div className="text-xs font-semibold text-steel mb-1.5">Script</div>
                  <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={`Script for ${p.name}`}>
                    {SCRIPTS.map((s) => { const on = (scripts[p.id] ?? "auto") === s.value; return (
                      <button key={s.value} type="button" role="radio" aria-checked={on} data-script={s.value} onClick={() => choose(p.id, s.value)}
                        className={`btn ${on ? "btn-filled" : "btn-gray"} !h-11 !min-h-[44px] !px-2 !rounded-xl !text-[13px] min-w-0`}>{s.label}</button>); })}
                  </div>
                  <p className="footnote mt-1.5">{SCRIPTS.find((s) => s.value === (scripts[p.id] ?? "auto"))?.hint}</p>
                </div>
              )}
              <div className="mt-3 flex gap-2"><Button size="sm" variant="outline" className="flex-1" onClick={() => test(p)}><Play size={14} /> Test print</Button><Button size="sm" variant="ghost" onClick={() => setEdit(p)}>Edit</Button><Button size="sm" variant="ghost" onClick={async () => { if (await ask({ title: `Remove ${p.name}?`, body: "Tickets stop printing on it.", ok: "Remove", tone: "danger", icon: "trash" })) start(async () => { const r = await deletePrinter(p.id); if ("error" in r) setErr(r.error!); }); }}><Trash2 size={14} /></Button></div>
            </Card></motion.div>))}</div>
      )}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? edit.name ?? "" : "Add printer"}>
        <form className="space-y-4" action={(fd) => start(async () => { const r = await savePrinter(fd); if ("error" in r) setErr(r.error!); else setEdit(null); })}>
          {edit?.id && <input type="hidden" name="id" value={edit.id} />}
          <Field label="Name"><input name="name" defaultValue={edit?.name} required placeholder="Counter 80mm" autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prints"><select name="kind" defaultValue={edit?.kind ?? "bill"}><option value="bill">Bills / invoices</option><option value="kot">Kitchen tickets (KOT)</option><option value="both">Both</option><option value="label">Labels</option></select></Field>
            <Field label="Paper"><select name="width" defaultValue={edit?.width ?? 80}><option value={80}>80 mm</option><option value={58}>58 mm</option></select></Field>
            <Field label="Connection"><select name="transport" defaultValue={edit?.transport ?? "browser"}><option value="browser">Browser dialog</option><option value="bluetooth">Bluetooth</option><option value="usb">USB</option><option value="network">Network (LAN)</option></select></Field>
            <Field label="Address" hint="Network only, e.g. 192.168.1.50:9100"><input name="address" className="num" defaultValue={edit?.address ?? ""} /></Field>
            <Field label="Kitchen station" hint="KOT only · blank = all"><input name="station" defaultValue={edit?.station ?? ""} placeholder="Tandoor" /></Field>
            <Field label="Copies"><input name="copies" type="number" min={1} max={5} className="num" defaultValue={edit?.copies ?? 1} /></Field>
          </div>
          <Field label="Footer line"><input name="footer" defaultValue={edit?.footer ?? ""} placeholder="Thank you, visit again" /></Field>
          <div className="flex gap-4 text-sm"><label className="flex items-center gap-2 normal-case"><input type="checkbox" name="cut" defaultChecked={edit?.cut ?? true} /> Auto-cut paper</label><label className="flex items-center gap-2 normal-case"><input type="checkbox" name="drawer" defaultChecked={edit?.drawer} /> Open cash drawer</label><label className="flex items-center gap-2 normal-case"><input type="checkbox" name="is_default" defaultChecked={edit?.is_default} /> Default</label></div>
          <Button className="w-full" disabled={pending}>Save printer</Button>
        </form>
      </Sheet>
    </div>
  );
}

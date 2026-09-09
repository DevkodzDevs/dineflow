"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { ClipboardCheck, ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, Card, Flip, Sheet, useToast } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { stockCount } from "../actions";
import { enqueue } from "@/lib/offline/sync";
import { useOffline } from "@/lib/offline/OfflineProvider";

type Item = { name: string; unit: string; bought: number; used: number; wasted: number; gap_qty: number; gap_value: number; gap_pct: number | null; counted: boolean; since: string };
type Report = { since_days: number; items: Item[]; lost_value: number; found_value: number; worst: string | null; uncounted: number; logged_wastage_value: number };
type Ing = { id: string; name: string; unit: string; current_stock: number };

/**
 * The leak finder: what the recipes say you should have against what you counted.
 * A count is the only way to know — so the screen makes counting a two-minute job.
 */
export function LeaksClient({ report, ingredients }: { report: Report; ingredients: Ing[] }) {
  const [counting, setCounting] = useState(false); const [vals, setVals] = useState<Record<string, string>>({}); const [pending, start] = useTransition(); const toast = useToast(); const { online } = useOffline();
  const leaks = report.items.filter((i) => i.gap_value < 0); const found = report.items.filter((i) => i.gap_value > 0);
  return (
    <div>
      <Link href="/inventory" className="inline-flex items-center gap-1 text-sm text-steel mb-3"><ChevronLeft size={16} /> Pantry</Link>
      <PageHeader eyebrow="Recipes versus the shelf" title="Leak finder" sub="Every dish sold takes its recipe out of stock. When a count comes in lower, that gap is the leak: over-portioning, spoilage nobody logged, or hands in the store." actions={<Button onClick={() => setCounting(true)}><ClipboardCheck size={16} /> Count stock now</Button>} />
      <div className="flip-row mb-8">
        <Flip value={Math.round(report.lost_value / 100) / 10} label="k ₹ lost" tone={report.lost_value > 0 ? "alert" : "live"} />
        <Flip value={leaks.length} label="leaking" />
        <Flip value={report.uncounted} label="never counted" tone={report.uncounted > 0 ? undefined : "live"} />
        <Flip value={Math.round(report.logged_wastage_value / 100) / 10} label="k ₹ logged waste" />
      </div>
      {report.uncounted === report.items.length && <Card className="mb-6"><p className="text-[15px]">Nothing has been counted yet, so there is nothing to compare. <b>Count stock now</b> takes about two minutes for a small pantry, and from then on this page tells you exactly where the money goes.</p></Card>}
      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div>
          <div className="card-title"><h3>Where it's going</h3><span className="more">last {report.since_days} days or since last count</span></div>
          <div className="group">
            {leaks.length === 0 && <div className="row text-sm text-steel">No unexplained losses since the last count.</div>}
            {leaks.map((i) => <div key={i.name} className="row">
              <span className="h-2 w-2 rounded-full bg-chili" /><span className="flex-1">{i.name}<span className="block text-xs text-steel">used {i.used} {i.unit} · bought {i.bought} · logged waste {i.wasted}</span></span>
              <span className="num text-steel text-sm w-20 text-right">{i.gap_pct != null && `${i.gap_pct}% of use`}</span>
              <span className="num text-chili w-24 text-right">−{Math.abs(i.gap_qty)} {i.unit}</span>
              <span className="num text-lg w-24 text-right">{formatINR(-i.gap_value)}</span>
            </div>)}
          </div>
          {found.length > 0 && <><div className="card-title mt-8"><h3>Counted higher than expected</h3><span className="more">recipes may be over-stated</span></div>
            <div className="group">{found.map((i) => <div key={i.name} className="row"><span className="h-2 w-2 rounded-full bg-mint" /><span className="flex-1">{i.name}</span><span className="num text-mint w-24 text-right">+{i.gap_qty} {i.unit}</span><span className="num text-lg w-24 text-right">{formatINR(i.gap_value)}</span></div>)}</div></>}
        </div>
        <Card>
          <div className="card-title"><h3>How to read this</h3></div>
          <ol className="space-y-3 text-[14px] text-steel list-decimal pl-4">
            <li>Count the shelf. The ledger is set to what you counted.</li>
            <li>From then on, every sale deducts its recipe.</li>
            <li>Next count, the gap between recipe and shelf is the leak, in rupees.</li>
            <li>Log wastage when it happens; logged waste is not a leak.</li>
          </ol>
          <p className="text-xs text-steel mt-4">Count the five dearest items weekly — chicken, mutton, fish, ghee, paneer — and the rest monthly. That catches most of the money.</p>
        </Card>
      </div>
      <Sheet open={counting} onClose={() => setCounting(false)} title="Count stock" wide>
        <p className="text-sm text-steel mb-4">Type what is actually on the shelf. Leave blank to skip an item.</p>
        <div className="group max-h-[50dvh] overflow-y-auto">
          {ingredients.map((g) => <div key={g.id} className="row"><span className="flex-1">{g.name}<span className="block text-xs text-steel">system says {Number(g.current_stock).toFixed(2)} {g.unit}</span></span><input type="number" inputMode="decimal" step="any" placeholder={g.unit} className="num !w-32 !text-right" value={vals[g.id] ?? ""} onChange={(e) => setVals({ ...vals, [g.id]: e.target.value })} /></div>)}
        </div>
        <Button className="w-full mt-4 !h-[52px] !text-base" disabled={pending || Object.values(vals).every((v) => v === "")} onClick={() => start(async () => {
          const counts = Object.entries(vals).filter(([, v]) => v !== "").map(([ingredient_id, v]) => ({ ingredient_id, counted: Number(v) }));
          if (!online) { await enqueue("stock_count", { counts }, `Stock count · ${counts.length} items`); toast(`${counts.length} counted — will send when the line is back`); setCounting(false); setVals({}); return; }
          const r = await stockCount(counts); if ("error" in r) toast(r.error ?? "Could not save the count", "err"); else { toast(`${r.counted} items counted · ${formatINR(r.gap_value)} moved`); setCounting(false); setVals({}); }
        })}><ClipboardCheck size={16} /> Save count</Button>
      </Sheet>
    </div>
  );
}

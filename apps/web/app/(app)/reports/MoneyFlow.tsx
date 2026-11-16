"use client";
import { useId } from "react";
import { Card } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { sankeyLayout, tillSlots, type FlowNode } from "@/lib/touches";

/**
 * Where the money went (2026-11-16, the owner's "dashboard where your money flows" video): one picture from how the money
 * came in (by order type — dine-in, takeaway, delivery, room service) through the till to how it was paid (UPI, cash, card,
 * other), drawn as ribbons whose thickness is the amount; beside it the spend by head for whoever may see expenses. Hand-drawn
 * SVG, no library (the dashboard's gauge is drawn the same way), with `sankeyLayout` (lib/touches.ts) deciding the bands.
 * Under 40rem of card (an iPad's half, a phone) the ribbons would be hairlines, so the same numbers become two lists of bars.
 */
const HUE = ["var(--color-green)", "var(--color-orange)", "var(--color-blue)", "var(--color-violet)", "var(--color-cyan)", "var(--color-red)"];
const PAID_HUE: Record<string, string> = { UPI: "var(--color-cyan)", Cash: "var(--color-green)", Card: "var(--color-blue)", Other: "var(--color-violet)" };
const W = 760, H = 240, TOP = 18, GAP = 10, BAR = 12, XL = 128, XM = 374, XR = 620;
const inr = (v: number) => formatINR(v, { whole: true });
const pc = (share: number) => `${Math.round(share * 100)}%`;

export function MoneyFlow({ sources, ways, heads = [], period }: { sources: FlowNode[]; ways: FlowNode[]; heads?: FlowNode[]; period: string }) {
  const id = useId().replace(/:/g, "");
  const lay = sankeyLayout(sources, ways, { height: H, top: TOP, gap: GAP });
  const total = Math.max(lay.leftTotal, lay.rightTotal);
  const spent = heads.reduce((s, h) => s + Math.max(0, Number(h.amount) || 0), 0);
  const headRows = heads.map((h) => ({ name: h.name, amount: Math.max(0, Number(h.amount) || 0) })).filter((h) => h.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 6);
  const lSlots = tillSlots(lay.left, TOP, H), rSlots = tillSlots(lay.right, TOP, H);
  const hueL = (i: number) => HUE[i % HUE.length], hueR = (b: FlowNode, i: number) => PAID_HUE[b.name] ?? HUE[(i + 2) % HUE.length];
  const ribbon = (x0: number, y0: number, h0: number, x1: number, y1: number, h1: number) => { const xm = (x0 + x1) / 2; return `M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1} L${x1},${y1 + h1} C${xm},${y1 + h1} ${xm},${y0 + h0} ${x0},${y0 + h0} Z`; };
  const dust = Array.from({ length: 54 }, (_, i) => ({ cx: 150 + ((i * 97) % 460), cy: TOP + ((i * 53) % H), r: 0.6 + (i % 3) * 0.45, o: 0.12 + (i % 5) * 0.07 }));

  return (
    <Card className="!p-0 overflow-hidden" data-money-flow>
      <div className="px-5 pt-5 pb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 className="text-xl">Where the money went</h3>
        <span className="text-xs text-steel">{period} · how it came in, and how it was paid</span>
      </div>
      {total <= 0 ? (
        <div className="mx-5 mb-5 h-56 grid place-items-center rounded-2xl border border-dashed border-[var(--color-separator)] text-sm text-[var(--color-label-2)] text-center px-6" data-empty-chart>No paid bills in this window</div>
      ) : (
        <div className="@container px-5 pb-5">
          <div className={headRows.length ? "grid gap-4 @[52rem]:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]" : ""}>
            <div className="min-w-0 rounded-2xl bg-[var(--color-bg-3)] p-4 mf-panel">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-1">
                <span className="text-[13.5px] font-bold">Sources → the till → how it was paid</span>
                <span className="mf-legend text-[11px] font-bold text-steel inline-flex gap-3"><i style={{ background: "var(--color-green)" }} />Came in<i style={{ background: "var(--color-tint)" }} />Till<i style={{ background: "var(--color-cyan)" }} />Paid</span>
              </div>
              {/* the ribbons, where the card is wide enough to read them */}
              <svg viewBox={`0 0 ${W} ${H + TOP * 2 + 10}`} className="hidden @[40rem]:block w-full h-auto" role="img" aria-label={`${inr(total)} came in; ${lay.left.map((b) => `${b.name} ${inr(b.amount)}`).join(", ")}; paid ${lay.right.map((b) => `${b.name} ${inr(b.amount)}`).join(", ")}`} data-flow-svg>
                <defs>
                  {lay.left.map((b, i) => <linearGradient key={b.name} id={`${id}l${i}`} x1="0" x2="1"><stop offset="0" stopColor={hueL(i)} stopOpacity=".6" /><stop offset="1" stopColor="var(--color-tint)" stopOpacity=".2" /></linearGradient>)}
                  {lay.right.map((b, i) => <linearGradient key={b.name} id={`${id}r${i}`} x1="0" x2="1"><stop offset="0" stopColor="var(--color-tint)" stopOpacity=".2" /><stop offset="1" stopColor={hueR(b, i)} stopOpacity=".62" /></linearGradient>)}
                </defs>
                {dust.map((d, i) => <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill="currentColor" opacity={d.o} className="mf-dust" />)}
                {lay.left.map((b, i) => (
                  <g key={b.name}>
                    <path d={ribbon(XL + BAR, b.y, b.h, XM, lSlots[i].y, lSlots[i].h)} fill={`url(#${id}l${i})`} className="mf-rib" style={{ color: hueL(i) }} />
                    <rect x={XL} y={b.y} width={BAR} height={b.h} rx="3" fill={hueL(i)} />
                    <text x={XL - 10} y={b.y + b.h / 2 - 2} textAnchor="end" className="mf-name">{b.name}</text>
                    <text x={XL - 10} y={b.y + b.h / 2 + 12} textAnchor="end" className="mf-amt">{inr(b.amount)} · {pc(b.share)}</text>
                  </g>
                ))}
                {lay.right.map((b, i) => (
                  <g key={b.name}>
                    <path d={ribbon(XM + BAR, rSlots[i].y, rSlots[i].h, XR, b.y, b.h)} fill={`url(#${id}r${i})`} className="mf-rib" style={{ color: hueR(b, i) }} />
                    <rect x={XR} y={b.y} width={BAR} height={b.h} rx="3" fill={hueR(b, i)} />
                    <text x={XR + BAR + 10} y={b.y + b.h / 2 - 2} className="mf-name">{b.name}</text>
                    <text x={XR + BAR + 10} y={b.y + b.h / 2 + 12} className="mf-amt">{inr(b.amount)} · {pc(b.share)}</text>
                  </g>
                ))}
                <rect x={XM} y={TOP} width={BAR} height={H} rx="4" fill="var(--color-tint)" />
                <text x={XM + BAR / 2} y={TOP - 6} textAnchor="middle" className="mf-cap">TILL</text>
                <text x={XM + BAR / 2} y={TOP + H + 16} textAnchor="middle" className="mf-till">{inr(total)}</text>
              </svg>
              {/* the same numbers as two lists of bars where the ribbons would be hairlines */}
              <div className="@[40rem]:hidden grid gap-4 mt-2" data-flow-bars>
                <Bars title="Came in" rows={lay.left} hue={(_b, i) => hueL(i)} />
                <Bars title="Paid by" rows={lay.right} hue={hueR} />
              </div>
            </div>
            {headRows.length > 0 && (
              <div className="min-w-0 rounded-2xl bg-[var(--color-bg-3)] p-4" data-flow-heads>
                <div className="text-[13.5px] font-bold">Spend by head</div>
                <div className="text-xs text-steel mb-2">{inr(spent)} out in {period}</div>
                {headRows.map((h, i) => (
                  <div key={h.name} className="py-2 border-t border-[var(--color-separator)] first:border-t-0">
                    <div className="flex items-center gap-2 text-[13px] font-semibold"><span className="truncate">{h.name}</span><span className="ml-auto num shrink-0">{inr(h.amount)}<span className="text-steel text-[11px]"> · {spent ? pc(h.amount / spent) : "0%"}</span></span></div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-[var(--color-fill-2)] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${spent ? (h.amount / spent) * 100 : 0}%`, background: HUE[i % HUE.length] }} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function Bars({ title, rows, hue }: { title: string; rows: { name: string; amount: number; share: number }[]; hue: (b: FlowNode, i: number) => string }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-[.08em] text-steel mb-1.5">{title}</div>
      {rows.length === 0 && <p className="text-sm text-steel">Nothing yet</p>}
      {rows.map((b, i) => (
        <div key={b.name} className="py-1.5">
          <div className="flex justify-between gap-3 text-[13px]"><span className="truncate font-semibold">{b.name}</span><span className="num shrink-0">{inr(b.amount)} <span className="text-steel text-[11px]">· {pc(b.share)}</span></span></div>
          <div className="mt-1 h-1.5 rounded-full bg-[var(--color-fill-2)] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${b.share * 100}%`, background: hue(b, i) }} /></div>
        </div>
      ))}
    </div>
  );
}

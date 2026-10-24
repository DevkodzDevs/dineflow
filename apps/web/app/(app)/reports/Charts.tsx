"use client";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Pie, PieChart, Cell, Legend, CartesianGrid } from "recharts";

/** The same box a chart fills, saying why it is empty — a blank 224px card read as a broken one. */
function Empty({ text }: { text: string }) {
  return <div className="h-56 grid place-items-center rounded-2xl border border-dashed border-[var(--color-separator)] text-sm text-[var(--color-label-2)] text-center px-6" data-empty-chart>{text}</div>;
}

/** Split out so the charting library loads only when Reports is opened, not with the app shell. */
export function SalesChart({ data }: { data: { day: string; total: number }[] }) {
  if (!data.some((d) => Number(d.total) > 0)) return <Empty text="No paid bills in this period yet." />;
  return (
    <div className="h-56"><ResponsiveContainer>
      <AreaChart data={data}>
        <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-tint)" stopOpacity={0.45} /><stop offset="100%" stopColor="var(--color-tint)" stopOpacity={0} /></linearGradient></defs>
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--color-label-2)" }} axisLine={false} tickLine={false} />
        <YAxis hide />
        <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} contentStyle={{ borderRadius: 12, border: "1px solid var(--color-separator)", background: "var(--color-bg-2)", fontSize: 12, color: "var(--color-label)" }} />
        <Area type="monotone" dataKey="total" stroke="var(--color-tint)" strokeWidth={2.5} fill="url(#g)" animationDuration={700} />
      </AreaChart>
    </ResponsiveContainer></div>
  );
}
export function TopChart({ data }: { data: { name: string; qty: number }[] }) {
  if (!data.some((d) => Number(d.qty) > 0)) return <Empty text="Nothing sold in this window yet." />;
  return (
    <div className="h-56"><ResponsiveContainer>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 8 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: "var(--color-label-2)" }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v: number) => `${v} plates`} contentStyle={{ borderRadius: 12, border: "1px solid var(--color-separator)", background: "var(--color-bg-2)", fontSize: 12, color: "var(--color-label)" }} />
        <Bar dataKey="qty" fill="var(--color-label)" radius={[0, 8, 8, 0]} animationDuration={700} />
      </BarChart>
    </ResponsiveContainer></div>
  );
}

/* ── by department (0140, 2026-10-24) ── */
const SLICE = ["var(--color-tint)", "var(--color-blue)", "var(--color-violet)", "var(--color-orange)", "var(--color-cyan)", "var(--color-red)", "var(--color-label-3)"];
const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;
const tip = { borderRadius: 12, border: "1px solid var(--color-separator)", background: "var(--color-bg-2)", fontSize: 12, color: "var(--color-label)" } as const;

/** Income beside outgoings, one pair of bars per day — the shape of the period at a glance. */
export function MoneyChart({ data }: { data: { label: string; income: number; outgoings: number }[] }) {
  if (!data.some((d) => d.income > 0 || d.outgoings > 0)) return <Empty text="Nothing came in or went out in this period yet." />;
  const many = data.length > 31;
  return (
    <div className="h-60"><ResponsiveContainer>
      <BarChart data={data} margin={{ left: 0, right: 4, top: 8 }} barGap={2} barCategoryGap={many ? "10%" : "28%"}>
        <CartesianGrid vertical={false} stroke="var(--color-separator)" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-label-2)" }} axisLine={false} tickLine={false} interval={many ? Math.ceil(data.length / 8) - 1 : data.length > 10 ? Math.ceil(data.length / 10) - 1 : 0} />
        <YAxis hide />
        <Tooltip formatter={(v: number, name: string) => [inr(v), name === "income" ? "Income" : "Outgoings"]} contentStyle={tip} cursor={{ fill: "var(--color-fill)" }} />
        <Bar dataKey="income" fill="var(--color-tint)" radius={[6, 6, 0, 0]} animationDuration={600} />
        <Bar dataKey="outgoings" fill="var(--color-red)" radius={[6, 6, 0, 0]} animationDuration={600} />
      </BarChart>
    </ResponsiveContainer></div>
  );
}

/** Where the money came from, or went — a ring, the biggest slice first. */
export function ShareChart({ slices, label }: { slices: { name: string; value: number }[]; label: string }) {
  const data = slices.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  if (!data.length) return <Empty text={`No ${label.toLowerCase()} in this period yet.`} />;
  const total = data.reduce((a, s) => a + s.value, 0);
  return (
    <div className="h-60"><ResponsiveContainer>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2} stroke="var(--color-bg-2)" strokeWidth={2} animationDuration={600}>
          {data.map((_, i) => <Cell key={i} fill={SLICE[i % SLICE.length]} />)}
        </Pie>
        <Tooltip formatter={(v: number, name: string) => [`${inr(v)} · ${Math.round((v / total) * 100)}%`, name]} contentStyle={tip} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--color-label-2)" }} formatter={(v: string) => <span style={{ color: "var(--color-label)" }}>{v}</span>} />
      </PieChart>
    </ResponsiveContainer></div>
  );
}

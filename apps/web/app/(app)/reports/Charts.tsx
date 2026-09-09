"use client";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Split out so the charting library loads only when Reports is opened, not with the app shell. */
export function SalesChart({ data }: { data: { day: string; total: number }[] }) {
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

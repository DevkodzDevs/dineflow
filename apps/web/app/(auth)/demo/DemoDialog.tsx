"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UtensilsCrossed, Building2, Palmtree, Clock, Sparkles, X } from "lucide-react";
import { Button, cn } from "@/components/ui";
import type { PropertyType } from "@dineflow/shared";
import { createDemo } from "./actions";

const TYPES: { v: PropertyType; l: string; icon: typeof UtensilsCrossed; desc: string }[] = [
  { v: "restaurant", l: "Restaurant", icon: UtensilsCrossed, desc: "Orders, menu, kitchen, billing, pantry" },
  { v: "hotel", l: "Hotel", icon: Building2, desc: "Front desk, rooms, orders, billing, reports" },
  { v: "resort", l: "Resort", icon: Palmtree, desc: "Rooms, front desk, orders, kitchen, reports" },
];

export function DemoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sel, setSel] = useState<PropertyType>("restaurant");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const go = () => start(async () => {
    setErr(null);
    const r = await createDemo(sel);
    if ("error" in r) { setErr(r.error!); return; }
    router.push("/dashboard");
    router.refresh();
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-3xl bg-[var(--color-bg-2)] border border-[var(--color-separator)] shadow-[var(--shadow-pop)] overflow-hidden">
        {/* header */}
        <div className="px-6 pt-6 pb-4 flex items-start gap-3">
          <span className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[var(--color-tint)] to-[var(--color-blue,#4a7dff)] grid place-items-center shrink-0">
            <Sparkles size={18} className="text-white" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-display">Try DineFlow</h2>
            <p className="text-sm text-steel mt-0.5">A full working app, yours for 8 hours. No sign-up needed.</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-[var(--color-fill)] grid place-items-center text-steel hover:text-[var(--color-label)] transition-colors shrink-0">
            <X size={15} />
          </button>
        </div>

        {/* type picker */}
        <div className="px-6 space-y-2">
          {TYPES.map(({ v, l, icon: I, desc }) => (
            <button key={v} type="button" onClick={() => setSel(v)}
              className={cn("w-full rounded-2xl border p-4 text-left transition-all flex items-center gap-4",
                sel === v ? "border-[var(--color-tint)] bg-[var(--color-green-2)] shadow-[0_0_0_1px_var(--color-tint)]" : "border-[var(--color-separator)] hover:border-[var(--color-label-3)]")}>
              <span className={cn("h-11 w-11 rounded-xl grid place-items-center shrink-0 transition-colors",
                sel === v ? "bg-[var(--color-tint)] text-white" : "bg-[var(--color-fill)] text-steel")}>
                <I size={20} />
              </span>
              <div className="flex-1 min-w-0">
                <div className={cn("font-semibold", sel === v && "text-[var(--color-tint)]")}>{l}</div>
                <div className="text-xs text-steel mt-0.5">{desc}</div>
              </div>
              {sel === v && <span className="h-5 w-5 rounded-full bg-[var(--color-tint)] grid place-items-center shrink-0">
                <svg viewBox="0 0 12 12" className="w-3 h-3 text-white"><path d="M10 3L4.5 8.5 2 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>}
            </button>
          ))}
        </div>

        {/* info + action */}
        <div className="px-6 pt-4 pb-6 space-y-3">
          <div className="flex items-center gap-2 text-xs text-steel">
            <Clock size={13} /> <span>Expires in 8 hours. All data is erased after that.</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-steel">
            <Sparkles size={13} /> <span>Comes with a sample menu, orders, rooms and bookings so every screen has something to show.</span>
          </div>
          {err && <p className="text-sm text-chili">{err}</p>}
          <Button size="lg" className="w-full" loading={pending} onClick={go}>
            {pending ? "Setting up your demo" : `Start ${sel === "restaurant" ? "restaurant" : sel === "hotel" ? "hotel" : "resort"} demo`}
          </Button>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { Receipt, QrCode, ChefHat, Bike, BedDouble, Users, Package, BarChart3, Check, ArrowRight, type LucideIcon } from "lucide-react";
import { formatINR } from "@dineflow/shared";
import { FEATURES, INDIA, KINDS, FAQ } from "@/lib/site/content";

/**
 * dineflow.cloud's front page (2026-10-29, item 18). What DineFlow is in one line, what it does in eight cards, why it fits an
 * Indian business, who it is for, what it costs (the plans' own prices — Master control sets them, 0151/0152) and the
 * questions people ask first. No JavaScript of its own: it is HTML and CSS, so it opens at once on a phone.
 */
export type PublicPlan = { key: string; label: string; monthly: number | null; yearly: number | null };
const ICON: Record<string, LucideIcon> = { receipt: Receipt, qr: QrCode, chef: ChefHat, bike: Bike, bed: BedDouble, people: Users, box: Package, chart: BarChart3 };
const HUE: Record<string, string> = { billing: "var(--color-green)", qr: "var(--color-blue)", kitchen: "var(--color-orange)", online: "var(--color-violet)", rooms: "var(--color-blue)", team: "var(--color-green)", stock: "var(--color-orange)", insight: "var(--color-violet)" };

export function FeatureCard({ k }: { k: string }) {
  const f = FEATURES.find((x) => x.key === k)!; const I = ICON[f.icon];
  return (
    <div className="card !p-5 min-w-0" style={{ ["--hue" as string]: HUE[f.key] }} data-feature={f.key}>
      <span className="h-11 w-11 rounded-2xl grid place-items-center bg-[color-mix(in_srgb,var(--hue)_16%,transparent)] text-[var(--hue)]"><I size={21} aria-hidden /></span>
      <h3 className="text-[20px] mt-3 leading-snug">{f.title}</h3>
      <p className="text-[14px] text-[var(--color-label-2)] mt-1.5 leading-relaxed">{f.body}</p>
    </div>
  );
}

export function Landing({ plans }: { plans: PublicPlan[] }) {
  return (
    <main data-landing>
      {/* ── the one line ── */}
      <section className="mx-auto max-w-6xl px-4 pt-14 sm:pt-20 pb-10 grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] items-center">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-tint)]">Restaurant · Hotel · Resort</div>
          <h1 className="font-display text-[44px] sm:text-[60px] leading-[1.02] mt-3">Your restaurant — or your whole hotel — in one app.</h1>
          <p className="text-[17px] text-[var(--color-label-2)] mt-5 max-w-xl leading-relaxed">Orders at the table and the till, the kitchen screen, bills with GST done right, rooms and housekeeping, staff and payroll — in English, தமிழ் and हिंदी.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/signup" className="btn btn-filled !h-12 !px-6 !text-[16px]" data-hero-trial>Start your free 7 days <ArrowRight size={18} aria-hidden /></Link>
            <Link href="/login" className="btn btn-gray !h-12 !px-6 !text-[16px]">Sign in</Link>
          </div>
          <p className="text-[13px] text-steel mt-3">No card needed. Everything switched on.</p>
        </div>
        {/* a glance of the product — drawn, not a screenshot */}
        <div className="min-w-0 relative" aria-hidden>
          <div className="card !p-4 rotate-[-1.5deg] shadow-[0_30px_60px_-30px_rgb(0_0_0/.6)]">
            <div className="flex items-center justify-between text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--color-blue)]"><span>Table T4 · your order</span><span className="text-steel">#1412</span></div>
            <div className="text-[18px] font-bold mt-1">Cooking now</div>
            <div className="grid grid-cols-6 gap-1.5 mt-3">{[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className={`h-1.5 rounded-full ${i < 2 ? "bg-[var(--color-orange)]" : i === 2 ? "bg-[var(--color-orange)] opacity-60" : "bg-[var(--color-fill-2)]"}`} />)}</div>
          </div>
          <div className="card !p-4 mt-4 ml-8 rotate-[1deg] shadow-[0_30px_60px_-30px_rgb(0_0_0/.6)] text-[14px]">
            <div className="flex justify-between"><span>Paneer tikka</span><span className="num">₹320.00</span></div>
            <div className="flex justify-between"><span>Mineral water</span><span className="num">₹40.00</span></div>
            <div className="border-t border-dashed border-[var(--color-separator)] mt-2 pt-2 space-y-0.5 text-[13px] text-[var(--color-label-2)]">
              <div className="flex justify-between"><span>GST 5% on food</span><span className="num">₹16.00</span></div>
              <div className="flex justify-between"><span>GST 18% on water</span><span className="num">₹7.20</span></div>
            </div>
            <div className="flex justify-between font-bold text-[16px] mt-2"><span>Total</span><span className="num">₹383.00</span></div>
          </div>
        </div>
      </section>

      {/* ── what it does ── */}
      <section id="features" className="mx-auto max-w-6xl px-4 pt-10 scroll-mt-20">
        <h2 className="font-display text-[34px] sm:text-[42px] leading-tight">Everything the day needs</h2>
        <p className="text-[16px] text-[var(--color-label-2)] mt-2 max-w-2xl">One app for the floor, the kitchen, the rooms and the books — each person sees only what their job needs.</p>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{FEATURES.map((f) => <FeatureCard key={f.key} k={f.key} />)}</div>
      </section>

      {/* ── why it fits ── */}
      <section className="mx-auto max-w-6xl px-4 pt-16">
        <h2 className="font-display text-[34px] sm:text-[42px] leading-tight">Made for how India eats and stays</h2>
        <div className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {INDIA.map((x) => (
            <div key={x.title} className="flex gap-3 min-w-0"><span className="h-7 w-7 shrink-0 rounded-full grid place-items-center bg-[var(--color-green-2)] text-[var(--color-tint)]"><Check size={15} strokeWidth={3} aria-hidden /></span>
              <div className="min-w-0"><div className="font-bold text-[16px]">{x.title}</div><p className="text-[14px] text-[var(--color-label-2)] mt-0.5">{x.body}</p></div></div>
          ))}
        </div>
      </section>

      {/* ── who it's for ── */}
      <section id="kinds" className="mx-auto max-w-6xl px-4 pt-16 scroll-mt-20">
        <h2 className="font-display text-[34px] sm:text-[42px] leading-tight">Who it's for</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {KINDS.map((k) => (
            <Link key={k.slug} href={`/for/${k.slug}`} className="card !p-5 min-w-0 group/kind hover:-translate-y-0.5 transition-transform" data-kind={k.slug}>
              <h3 className="text-[22px] leading-snug">{k.name}</h3>
              <p className="text-[14px] text-[var(--color-label-2)] mt-1.5 leading-relaxed">{k.intro}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-[14px] font-semibold text-[var(--color-tint)]">See how <ArrowRight size={15} aria-hidden className="group-hover/kind:translate-x-0.5 transition-transform" /></span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── what it costs: the plans' own prices ── */}
      <section id="pricing" className="mx-auto max-w-6xl px-4 pt-16 scroll-mt-20">
        <h2 className="font-display text-[34px] sm:text-[42px] leading-tight">Simple pricing</h2>
        <p className="text-[16px] text-[var(--color-label-2)] mt-2">Per property, everything included. Start with 7 days free.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {plans.map((p) => {
            const save = p.monthly && p.yearly ? Math.round(12 - Number(p.yearly) / Number(p.monthly)) : 0;
            return (
              <div key={p.key} className="card !p-6 min-w-0" data-price-plan={p.key}>
                <div className="font-bold text-[20px]">{p.label}</div>
                <div className="text-[13px] text-steel">{p.key === "restaurant" ? "Restaurants, cafés and cloud kitchens" : "Hotels and resorts — rooms and dining"}</div>
                <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
                  {p.monthly != null && <div><div className="font-display text-[40px] leading-none num">{formatINR(Number(p.monthly), { whole: true })}</div><div className="text-[13px] text-steel mt-1">a month</div></div>}
                  {p.yearly != null && <div><div className="font-display text-[28px] leading-none num">{formatINR(Number(p.yearly), { whole: true })}</div><div className="text-[13px] text-steel mt-1">a year{save >= 1 ? ` · ${save} month${save === 1 ? "" : "s"} free` : ""}</div></div>}
                </div>
                <Link href="/signup" className="btn btn-filled w-full mt-5">Start free</Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── the first questions ── */}
      <section className="mx-auto max-w-3xl px-4 pt-16">
        <h2 className="font-display text-[34px] sm:text-[42px] leading-tight">Questions</h2>
        <div className="mt-5 divide-y divide-[var(--color-separator)] border-y border-[var(--color-separator)]">
          {FAQ.map((f) => (
            <details key={f.q} className="group/faq py-4" data-faq>
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-3 text-left font-bold text-[16px] min-h-11">{f.q}<span className="text-[var(--color-tint)] text-xl transition-transform group-open/faq:rotate-45 shrink-0" aria-hidden>+</span></summary>
              <p className="text-[15px] text-[var(--color-label-2)] mt-1.5 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link href="/signup" className="btn btn-filled !h-12 !px-7 !text-[16px]">Start your free 7 days <ArrowRight size={18} aria-hidden /></Link>
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { KINDS } from "@/lib/site/content";
import { SiteHeader, SiteFooter } from "./Site";
import { FeatureCard } from "./Landing";

/** One kind of business (item 18): what DineFlow does for it, the four features it leans on, and the way to start. */
export function KindPage({ slug }: { slug: string }) {
  const k = KINDS.find((x) => x.slug === slug)!;
  return (
    <div className="min-h-dvh bg-[var(--color-bg)]">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4" data-kind-page={k.slug}>
        <section className="pt-14 sm:pt-20 max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-tint)]">DineFlow</div>
          <h1 className="font-display text-[42px] sm:text-[56px] leading-[1.04] mt-3">{k.title}</h1>
          <p className="text-[17px] text-[var(--color-label-2)] mt-4 leading-relaxed">{k.intro}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/signup" className="btn btn-filled !h-12 !px-6 !text-[16px]">Start your free 7 days <ArrowRight size={18} aria-hidden /></Link>
            <Link href="/#pricing" className="btn btn-gray !h-12 !px-6 !text-[16px]">See pricing</Link>
          </div>
        </section>
        <section className="pt-14 grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {k.points.map((p) => (
            <div key={p.title} className="flex gap-3 min-w-0"><span className="h-7 w-7 shrink-0 rounded-full grid place-items-center bg-[var(--color-green-2)] text-[var(--color-tint)]"><Check size={15} strokeWidth={3} aria-hidden /></span>
              <div className="min-w-0"><h2 className="font-bold text-[18px]">{p.title}</h2><p className="text-[15px] text-[var(--color-label-2)] mt-1 leading-relaxed">{p.body}</p></div></div>
          ))}
        </section>
        <section className="pt-14">
          <h2 className="font-display text-[30px] sm:text-[38px] leading-tight">What you'll use most</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{k.features.map((f) => <FeatureCard key={f} k={f} />)}</div>
        </section>
        <section className="pt-14">
          <h2 className="font-display text-[26px] leading-tight">Also for</h2>
          <div className="mt-4 flex flex-wrap gap-2">{KINDS.filter((x) => x.slug !== k.slug).map((x) => <Link key={x.slug} href={`/for/${x.slug}`} className="chip !h-11 !px-4">{x.name}</Link>)}</div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

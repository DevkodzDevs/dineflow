import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site/Site";
import { POSTS } from "@/lib/site/posts";

/** /blog/<slug> (2026-10-29, item 18): one article, built at deploy. An article's text is lib/site/posts.ts. */
export const dynamicParams = false;
export function generateStaticParams() { return POSTS.map((p) => ({ slug: p.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const p = POSTS.find((x) => x.slug === slug);
  return p ? { title: `${p.title} · DineFlow`, description: p.summary } : { title: "Not found" };
}
const day = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const p = POSTS.find((x) => x.slug === slug);
  if (!p) notFound();
  return (
    <div className="min-h-dvh bg-[var(--color-bg)]">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 pt-10" data-post-page={p.slug}>
        <Link href="/blog" className="inline-flex items-center gap-1 h-11 -ml-1 text-[14px] font-semibold text-[var(--color-label-2)] hover:text-[var(--color-label)]"><ArrowLeft size={16} aria-hidden /> Blog</Link>
        <article className="mt-2">
          <div className="text-[13px] text-steel">{day(p.date)}{p.updated ? ` · updated ${day(p.updated)}` : ""} · {p.minutes} min read</div>
          <h1 className="font-display text-[36px] sm:text-[46px] leading-[1.08] mt-2">{p.title}</h1>
          <p className="text-[18px] text-[var(--color-label-2)] mt-4 leading-relaxed">{p.summary}</p>
          <div className="mt-8 space-y-5 text-[16.5px] leading-[1.75]">
            {p.body.map((b, i) => (
              <section key={i}>
                {b.h && <h2 className="text-[22px] font-bold leading-snug mb-2">{b.h}</h2>}
                {b.p && <p>{b.p}</p>}
                {b.list && <ul className="list-disc pl-6 space-y-1.5 mt-2">{b.list.map((x) => <li key={x}>{x}</li>)}</ul>}
                {b.note && <p className="text-[14px] text-steel border-l-2 border-[var(--color-separator)] pl-3">{b.note}</p>}
              </section>
            ))}
          </div>
        </article>
        <div className="card !p-6 mt-12 text-center">
          <div className="font-display text-[26px]">Try DineFlow free for 7 days</div>
          <p className="text-[15px] text-[var(--color-label-2)] mt-1">Everything switched on. No card needed.</p>
          <Link href="/signup" className="btn btn-filled !h-12 !px-6 mt-4">Start free <ArrowRight size={18} aria-hidden /></Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

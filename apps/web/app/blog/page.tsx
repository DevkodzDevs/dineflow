import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/site/Site";
import { POSTS } from "@/lib/site/posts";

/** /blog (2026-10-29, item 18): the articles, newest first — static. */
export const metadata = { title: "Blog · DineFlow", description: "Plain guides for restaurant and hotel owners in India — GST, delivery platforms, service charge and running the floor." };
const day = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function Blog() {
  const posts = [...POSTS].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="min-h-dvh bg-[var(--color-bg)]">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pt-14" data-blog>
        <h1 className="font-display text-[44px] sm:text-[56px] leading-tight">Blog</h1>
        <p className="text-[16px] text-[var(--color-label-2)] mt-2">Plain guides for restaurant and hotel owners in India.</p>
        <div className="mt-8 space-y-4">
          {posts.map((p) => (
            <Link key={p.slug} href={`/blog/${p.slug}`} className="card !p-5 block hover:-translate-y-0.5 transition-transform" data-post={p.slug}>
              <div className="text-[12.5px] text-steel">{day(p.date)} · {p.minutes} min read</div>
              <h2 className="text-[20px] font-bold mt-1 leading-snug">{p.title}</h2>
              <p className="text-[15px] text-[var(--color-label-2)] mt-1.5 leading-relaxed">{p.summary}</p>
            </Link>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

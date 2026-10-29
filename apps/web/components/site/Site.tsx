import Link from "next/link";
import { LegalFooter } from "@/components/LegalFooter";
import { KINDS } from "@/lib/site/content";
import { LangSwitch } from "./LangSwitch";

/**
 * The public site's frame (2026-10-29, item 18): the mark and name, the few places a visitor goes, the language, Sign in and
 * the trial; under the page, the kinds of business, the blog and the four legal documents. Server-rendered and light — a
 * stranger's first page must open fast on a phone. The same tokens and faces as the app, so the site and the app are one.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-separator)] bg-[color-mix(in_srgb,var(--color-bg)_86%,transparent)] backdrop-blur-xl" data-site-header>
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2.5 min-w-0 shrink-0" aria-label="DineFlow home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mark.png" alt="" width={34} height={34} className="h-[34px] w-[34px] object-contain" />
          <span className="font-display text-[22px] tracking-wide">DineFlow</span>
        </Link>
        <nav className="hidden md:flex items-center gap-1 ml-6 text-[14px] font-semibold text-[var(--color-label-2)]" aria-label="Site">
          <Link href="/#features" className="px-3 h-10 inline-flex items-center rounded-xl hover:text-[var(--color-label)] hover:bg-[var(--color-fill)]">Features</Link>
          <Link href="/#kinds" className="px-3 h-10 inline-flex items-center rounded-xl hover:text-[var(--color-label)] hover:bg-[var(--color-fill)]">Who it's for</Link>
          <Link href="/#pricing" className="px-3 h-10 inline-flex items-center rounded-xl hover:text-[var(--color-label)] hover:bg-[var(--color-fill)]">Pricing</Link>
          <Link href="/blog" className="px-3 h-10 inline-flex items-center rounded-xl hover:text-[var(--color-label)] hover:bg-[var(--color-fill)]">Blog</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LangSwitch />
          <Link href="/login" className="hidden sm:inline-flex h-10 px-4 items-center rounded-xl text-[14px] font-semibold hover:bg-[var(--color-fill)]" data-site-signin>Sign in</Link>
          <Link href="/signup" className="btn btn-filled !h-10 !px-4 !text-[14px]" data-site-trial>Start free</Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-separator)] mt-20" data-site-footer>
      <div className="mx-auto max-w-6xl px-4 py-10 grid gap-8 sm:grid-cols-3 text-[14px]">
        <div>
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mark.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
            <span className="font-display text-xl tracking-wide">DineFlow</span>
          </div>
          <p className="text-steel mt-2 max-w-xs">Restaurant and hotel software for India — one app for the floor, the kitchen, the rooms and the books.</p>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-steel mb-2">Who it's for</div>
          <ul className="space-y-1.5">{KINDS.map((k) => <li key={k.slug}><Link href={`/for/${k.slug}`} className="hover:underline">{k.name}</Link></li>)}</ul>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-steel mb-2">DineFlow</div>
          <ul className="space-y-1.5">
            <li><Link href="/blog" className="hover:underline">Blog</Link></li>
            <li><Link href="/signup" className="hover:underline">Start a free trial</Link></li>
            <li><Link href="/login" className="hover:underline">Sign in</Link></li>
          </ul>
        </div>
      </div>
      <LegalFooter className="!pt-0 pb-8" />
    </footer>
  );
}

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { COMPANY, missingFacts } from "@/lib/company";

/**
 * The public shell the four legal documents share. It is deliberately outside every auth group:
 * a payment gateway's reviewer, a regulator and a customer who has not signed up yet all have to
 * be able to read these, so nothing here may touch the session.
 */

const DOCS = [
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/refunds", label: "Refunds" },
  { href: "/legal/contact", label: "Contact" },
];

const production = process.env.NODE_ENV === "production";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const missing = missingFacts();
  // one line in the build output, so a deploy with blanks in it is not a silent one
  if (missing.length > 0) console.warn(`[legal] ${missing.length} company fact(s) still unset in lib/company.ts: ${missing.map((f) => f.label).join(", ")}`);
  return (
    <div className="min-h-dvh deck">
      <div className="mx-auto max-w-3xl px-5 py-8 md:py-12">
        <header className="flex items-center gap-3 mb-8">
          <Link href="/login" className="h-10 w-10 grid place-items-center rounded-xl border border-line bg-card shrink-0" aria-label="Back to sign in"><ChevronLeft size={18} /></Link>
          <div className="flex items-center gap-2.5 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mark.png" alt="" width={28} height={28} className="h-7 w-7 object-contain shrink-0" />
            <span className="font-display text-xl tracking-wide">{COMPANY.product}</span>
          </div>
        </header>

        <nav className="flex flex-wrap gap-2 mb-8" aria-label="Legal documents">
          {DOCS.map((d) => <Link key={d.href} href={d.href} className="chip">{d.label}</Link>)}
        </nav>

        {/* These pages are public and static, so anyone can read whatever is rendered here — which
            is exactly why this banner is kept out of production. A gateway's reviewer reading "not
            ready to publish" would be worse than the gap itself. In development it is loud; in
            production the inline [not set] markers still show, so a half-filled page can never look
            finished, and the build prints the same list into the deploy log. */}
        {missing.length > 0 && !production && (
          <div className="rounded-2xl border border-[var(--color-orange)]/40 bg-[rgb(255_179_64/.08)] p-4 mb-8">
            <div className="font-semibold text-[var(--color-orange)] text-sm">These pages are not ready to publish yet</div>
            <p className="text-sm text-steel mt-1">
              {missing.length} fact{missing.length === 1 ? "" : "s"} about the business {missing.length === 1 ? "is" : "are"} still blank.
              Fill {missing.length === 1 ? "it" : "them"} in at <code className="num text-xs">apps/web/lib/company.ts</code> — every page below reads from that one file.
            </p>
            <ul className="mt-2.5 space-y-1.5 text-sm">
              {missing.map((f) => (
                <li key={f.key} className="flex gap-2">
                  <span className="font-semibold text-ink shrink-0">{f.label}</span>
                  <span className="text-steel">— {f.why}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {children}

        <footer className="mt-12 pt-6 border-t border-line text-xs text-steel space-y-1">
          <div>{COMPANY.legalName ?? COMPANY.product} · {COMPANY.site}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {DOCS.map((d) => <Link key={d.href} href={d.href} className="hover:text-[var(--color-label)]">{d.label}</Link>)}
            <Link href="/login" className="hover:text-[var(--color-label)]">Sign in</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}

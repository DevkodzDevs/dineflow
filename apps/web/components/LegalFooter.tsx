import Link from "next/link";
import { COMPANY } from "@/lib/company";

/**
 * The four documents, on every public screen. They have to be reachable from the page a stranger
 * lands on — a payment gateway's onboarding review checks exactly that, and so does anyone deciding
 * whether to hand their restaurant's takings to a piece of software they have not bought yet.
 */
export function LegalFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`w-full pt-6 text-[11px] text-steel ${className}`}>
      <nav className="legal-links flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5" aria-label="Legal">
        <Link href="/legal/terms" className="hover:text-[var(--color-label)]">Terms</Link>
        <Link href="/legal/privacy" className="hover:text-[var(--color-label)]">Privacy</Link>
        <Link href="/legal/refunds" className="hover:text-[var(--color-label)]">Refunds</Link>
        <Link href="/legal/contact" className="hover:text-[var(--color-label)]">Contact</Link>
      </nav>
      <p className="text-center mt-2">
        {COMPANY.legalName ?? COMPANY.product} · {COMPANY.site}
      </p>
    </footer>
  );
}

import Link from "next/link";

/**
 * The line a guest reads before giving their details on a public page: who uses them, for what, and where
 * DineFlow says how they are looked after. The property is the business the guest is dealing with; DineFlow
 * runs the page for it (a processor of the property's guest data — see Terms §8 and the Privacy Policy).
 */
export function GuestNotice({ property, use, className = "" }: { property?: string | null; use: string; className?: string }) {
  return (
    <p className={`text-[11px] leading-snug text-[var(--color-label-3)] text-center ${className}`} data-guest-notice>
      {property || "The property"} uses your details {use}. DineFlow runs this page for them —{" "}
      <Link href="/legal/privacy" className="underline">how your details are looked after</Link>.
    </p>
  );
}

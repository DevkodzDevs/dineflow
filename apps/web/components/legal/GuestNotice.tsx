"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * The line a guest reads before giving their details on a public page: who uses them, for what, and where
 * DineFlow says how they are looked after. The property is the business the guest is dealing with; DineFlow
 * runs the page for it (a processor of the property's guest data — see Terms §8 and the Privacy Policy).
 * The link carries the page it was opened from (`?from=`), so the policy's Back returns the guest there — it went to
 * /login, which forwards a signed-in phone into the app (2026-10-27, the owner: "back went to Master control").
 */
export function GuestNotice({ property, use, className = "" }: { property?: string | null; use: string; className?: string }) {
  const [from, setFrom] = useState("");
  useEffect(() => { setFrom(window.location.pathname + window.location.search); }, []);
  return (
    <p className={`text-[11px] leading-snug text-[var(--color-label-3)] text-center ${className}`} data-guest-notice>
      {property || "The property"} uses your details {use}. DineFlow runs this page for them —{" "}
      <Link href={from ? `/legal/privacy?from=${encodeURIComponent(from)}` : "/legal/privacy"} className="underline inline-block py-[15px] -my-[15px]">how your details are looked after</Link>.
    </p>
  );
}

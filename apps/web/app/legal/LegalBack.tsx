"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

const KEY = "df-legal-from";
/** a path on this site, never another site ("//x", "/\x") or a scheme */
const safe = (v: string | null) => (v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : null);

/** The page a guest opened the legal pages from (GuestNotice's `?from=`), kept for this tab while they read. */
function useFrom() {
  const [from, setFrom] = useState<{ path: string; direct: boolean } | null>(null);
  useEffect(() => {
    const q = safe(new URLSearchParams(window.location.search).get("from"));
    if (q) { try { sessionStorage.setItem(KEY, q); } catch { /* private */ } setFrom({ path: q, direct: true }); return; }
    try { const k = safe(sessionStorage.getItem(KEY)); if (k) setFrom({ path: k, direct: false }); } catch { /* private */ }
  }, []);
  return from;
}

/**
 * Back on the legal pages (2026-10-27, the owner: "the QR order page's privacy link, then Back, went straight to Master
 * control — a security flaw"). It was a link to /login, and /login forwards a signed-in phone into the app; a guest's phone
 * landed on a staff sign-in. Opened from a guest page it now goes back there: the browser's own Back when the policy was
 * opened straight from it (the menu and its basket come back as they were), else to that page. Otherwise it is the old
 * Back to sign in.
 */
export function LegalBack() {
  const from = useFrom(); const router = useRouter();
  if (!from) return <Link href="/login" className="h-10 w-10 grid place-items-center rounded-xl border border-line bg-card shrink-0" aria-label="Back to sign in" data-legal-back="login"><ChevronLeft size={18} /></Link>;
  const menu = from.path.startsWith("/dine/");
  return (
    <button type="button" onClick={() => { if (from.direct && window.history.length > 1) router.back(); else router.push(from.path); }}
      className="h-11 pl-2.5 pr-4 inline-flex items-center gap-1 rounded-xl border border-line bg-card shrink-0 text-[14px] font-semibold" aria-label={menu ? "Back to the menu" : "Back"} data-legal-back="guest">
      <ChevronLeft size={18} aria-hidden />{menu ? "Back to the menu" : "Back"}
    </button>
  );
}

/** "Sign in" in the footer is for the business's staff; a guest who came from a menu is not shown it. */
export function LegalSignIn() {
  const from = useFrom();
  if (from) return null;
  return <Link href="/login" className="hover:text-[var(--color-label)]">Sign in</Link>;
}

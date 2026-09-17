"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Compass, LayoutDashboard, LogIn } from "lucide-react";
import { Flip } from "@/components/ui/flip";
import { reducedMotion } from "@/components/ui/flip";

/**
 * The page that is not there.
 *
 * The number is built from the same split-flap tiles the dashboard and the sign-in wall use, so a
 * wrong turn still looks like this app rather than a framework default. It lands on 000 and turns
 * over to 404 a beat later, which is what makes the flaps move — they animate on a change of value,
 * not on mount.
 *
 * It also says which address was tried. Someone who mistyped can see the typo without opening the
 * address bar again, and someone reporting the problem has something to quote.
 */

/** Routes worth offering when the address is close to one of them. */
const KNOWN = [
  { path: "/dashboard", label: "Dashboard" }, { path: "/login", label: "Sign in" },
  { path: "/orders", label: "Orders" }, { path: "/billing", label: "Billing" },
  { path: "/menu", label: "Menu" }, { path: "/inventory", label: "Pantry" },
  { path: "/rooms", label: "Rooms" }, { path: "/frontdesk", label: "Front desk" },
  { path: "/reports", label: "Reports" }, { path: "/tax", label: "Tax & GST" },
  { path: "/staff", label: "Staff" }, { path: "/settings", label: "Settings" },
  { path: "/reservations", label: "Reservations" }, { path: "/admin", label: "Master control" },
];

/** Levenshtein, small and good enough to catch a typo or a missing letter. */
function distance(a: string, b: string) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export default function NotFound() {
  const path = usePathname();
  const router = useRouter();
  const [digits, setDigits] = useState("000");

  useEffect(() => {
    if (reducedMotion()) { setDigits("404"); return; }
    const t = setTimeout(() => setDigits("404"), 380);
    return () => clearTimeout(t);
  }, []);

  const first = (path ?? "").split("/")[1]?.toLowerCase() ?? "";
  const near = first
    ? KNOWN.map((k) => ({ ...k, d: distance(first, k.path.slice(1)) }))
        .filter((k) => k.d <= Math.max(2, Math.floor(k.path.length / 3)))
        .sort((a, b) => a.d - b.d).slice(0, 3)
    : [];

  const rise = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } };

  return (
    <main className="relative min-h-dvh grid place-items-center overflow-hidden px-6 py-16">
      {/* two slow lights behind everything; they drift rather than pulse, so nothing competes with
          the flaps for attention */}
      <motion.div aria-hidden className="pointer-events-none absolute -top-40 -left-32 h-[36rem] w-[36rem] rounded-full blur-[130px]"
        style={{ background: "radial-gradient(circle, var(--color-tint) 0%, transparent 70%)", opacity: 0.16 }}
        animate={{ x: [0, 60, 0], y: [0, 40, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div aria-hidden className="pointer-events-none absolute -bottom-48 -right-32 h-[32rem] w-[32rem] rounded-full blur-[130px]"
        style={{ background: "radial-gradient(circle, var(--color-blue, #4a7dff) 0%, transparent 70%)", opacity: 0.12 }}
        animate={{ x: [0, -50, 0], y: [0, -30, 0] }}
        transition={{ duration: 32, repeat: Infinity, ease: "easeInOut" }} />

      <motion.div initial="hidden" animate="show" transition={{ staggerChildren: 0.07 }}
        className="relative w-full max-w-lg text-center">
        <motion.div variants={rise} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
          <Flip value={digits} label="page not found" />
        </motion.div>

        <motion.h1 variants={rise} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="text-4xl sm:text-5xl mt-8">
          That page isn&rsquo;t on the menu
        </motion.h1>

        <motion.p variants={rise} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="text-steel mt-3 text-[15px] leading-relaxed">
          Nothing lives at this address. It may have been renamed, or the link that brought you here
          is out of date.
        </motion.p>

        {path && (
          <motion.p variants={rise} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="num text-xs text-[var(--color-label-3)] mt-4 break-all">
            you asked for <span className="text-[var(--color-label-2)]">{path}</span>
          </motion.p>
        )}

        {near.length > 0 && (
          <motion.div variants={rise} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }} className="mt-6">
            <div className="text-xs font-semibold uppercase tracking-wide text-steel mb-2 flex items-center justify-center gap-1.5">
              <Compass size={12} /> Did you mean
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {near.map((k) => <Link key={k.path} href={k.path} className="chip">{k.label}</Link>)}
            </div>
          </motion.div>
        )}

        <motion.div variants={rise} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="mt-9 flex flex-wrap items-center justify-center gap-2.5">
          <button onClick={() => router.back()} className="btn btn-gray">
            <ArrowLeft size={15} /> Take me back
          </button>
          <Link href="/dashboard" className="btn btn-filled">
            <LayoutDashboard size={15} /> Go to the dashboard
          </Link>
          <Link href="/login" className="btn btn-plain">
            <LogIn size={15} /> Sign in
          </Link>
        </motion.div>
      </motion.div>
    </main>
  );
}

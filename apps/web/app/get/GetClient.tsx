"use client";
import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, Download, Lock, RefreshCw, Store, WifiOff } from "lucide-react";
import { InstallPanel } from "@/components/shell/InstallPanel";
import { SendInstallLink } from "@/components/shell/SendInstallLink";
import { useInstallOffer } from "@/components/shell/useInstall";
import { deviceName } from "@/lib/install";

/**
 * One address to hand anybody — an owner, a new waiter, a cook on their own phone — that works out what
 * they are holding and gives them the one thing to do on it (InstallPanel, the same as the in-app sheet,
 * Settings and the sign-in page): the browser's one-tap install; one tap to Edge or Chrome from a browser
 * that cannot install; the drawn Share → Add to Home Screen on an iPhone or iPad. The other half of the
 * page is for the person setting up a floor of devices from one screen: a QR for the next phone, the link
 * to WhatsApp to a new waiter, and the steps for each kind of device.
 *
 * The card flips with the theme like the sign-in page (it was dark-only, in fixed colours), so the drawn
 * iPhone steps — which are in the app's tokens — read in both.
 */

/**
 * Whether anybody *other than the person reading this* can open the address.
 *
 * A deployment sitting behind Vercel's Deployment Protection looks perfectly normal to the account
 * that owns it — the browser carries a Vercel cookie, every page loads, the install button works.
 * It is the waiter's phone that discovers the truth: a Vercel sign-in screen, for an account they
 * will never have. And because the installed app remembers the address it was installed from, that
 * screen is now what the app opens to, every time.
 *
 * So the page asks the only question that matters, and asks it honestly: fetch something public
 * with the cookies deliberately left off, which is exactly the request a stranger's phone makes. A
 * wall answers that with a refusal; the real app answers "ok". A request that never arrives at all
 * proves nothing either way, so it is not held against the address.
 */
type Reach = "checking" | "open" | "gated";

export function GetClient({ pageUrl }: { pageUrl: string }) {
  const { env, plan } = useInstallOffer();
  const [reach, setReach] = useState<Reach>("checking");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/health", { credentials: "omit", cache: "no-store" });
        if (alive) setReach(r.ok ? "open" : "gated");
      } catch {
        if (alive) setReach("open");   // no answer is a flaky line, not a locked door
      }
    })();
    return () => { alive = false; };
  }, []);

  const name = env ? deviceName(env.device) : "device";

  return (
    <main className="min-h-dvh deck flex justify-center items-start lg:items-center sm:p-3">
      <div className="deck-card w-full max-w-[1080px] px-5 py-9 sm:px-10 sm:py-12 lg:px-14" data-get>
        <header className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- the app's own icon, as it will look once installed */}
          <img src="/apple-touch-icon.png" alt="" width={72} height={72} className="h-[72px] w-[72px] rounded-[20px] shadow-[0_10px_28px_-12px_rgb(0_0_0/.55)]" />
          <h1 className="font-display text-[34px] sm:text-[40px] mt-5 tracking-wide leading-none">Install DineFlow</h1>
          <p className="text-[15px] text-[var(--color-label-2)] mt-3 max-w-[34rem] leading-relaxed">
            The restaurant and hotel app for any phone, tablet or computer.
          </p>
          <ul className="mt-4 flex flex-wrap justify-center gap-2 text-[12.5px] font-semibold text-[var(--color-label-2)]">
            <Fact icon={<Store size={13} />}>Windows · Android · Apple</Fact>
            <Fact icon={<RefreshCw size={13} />}>Updates itself</Fact>
            <Fact icon={<WifiOff size={13} />}>Works when the line drops</Fact>
          </ul>
        </header>

        {reach === "gated" && <Gated url={pageUrl} />}

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:gap-12">
          <section className="min-w-0" aria-label="This device">
            <Label>{plan === "installed" ? "This device" : `On this ${name}`}</Label>
            <div className={reach === "gated" ? "opacity-60" : undefined}><InstallPanel size="lg" url={pageUrl} /></div>
          </section>

          <section className="min-w-0" aria-label="Another device">
            <Label>On another phone, tablet or computer</Label>
            <SendInstallLink url={pageUrl} />
            {/* the other two platforms are in the panel on the left (three platforms only, 2026-11-25) */}

            {/* the printed manual, for whoever is setting the place up rather than using it */}
            <a href="/DineFlow-Manual.pdf" download
              className="mt-5 flex items-center gap-3 rounded-2xl border border-[var(--color-separator)] p-3.5 hover:bg-[var(--color-fill)] transition-colors">
              <span className="h-9 w-9 rounded-xl bg-[var(--color-fill)] grid place-items-center shrink-0 text-[var(--color-label-2)]"><BookOpen size={16} /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold">The manual</span>
                <span className="block text-xs text-[var(--color-label-2)] mt-0.5">Every screen explained, with pictures · PDF</span>
              </span>
              <Download size={15} className="text-[var(--color-label-2)] shrink-0" />
            </a>
          </section>
        </div>
      </div>
    </main>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-label-2)] mb-3.5">{children}</h2>;
}

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <li className="h-8 px-3 rounded-full bg-[var(--color-fill)] inline-flex items-center gap-1.5">{icon}{children}</li>;
}

/**
 * The address is behind a wall that only this account can pass. Installing from here would produce
 * an app that opens on a Vercel sign-in screen on every phone but this one — so this says so before
 * anybody does it, and says exactly which switch turns it off.
 */
function Gated({ url }: { url: string }) {
  const host = (() => { try { return new URL(url).host; } catch { return url; } })();
  return (
    <div className="mt-8 rounded-2xl border border-[color-mix(in_srgb,var(--color-orange)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-orange)_8%,transparent)] p-4" data-gated>
      <div className="flex items-start gap-3">
        <span className="h-9 w-9 rounded-xl bg-[color-mix(in_srgb,var(--color-orange)_15%,transparent)] grid place-items-center shrink-0 text-[var(--color-orange)]"><Lock size={16} /></span>
        <div className="min-w-0">
          <div className="text-sm font-semibold">Only you can open this address</div>
          <p className="text-[13px] leading-relaxed text-[var(--color-label-2)] mt-1">
            <b className="text-[var(--color-label)]">{host}</b> is behind Vercel&apos;s Deployment Protection. Staff phones get a
            <b className="text-[var(--color-label)]"> Vercel sign-in screen</b>, not DineFlow — and an app installed now opens to it.
          </p>
          <p className="text-[13px] leading-relaxed text-[var(--color-label-2)] mt-2.5">
            Turn it off first: <b className="text-[var(--color-label)]">Vercel → your project → Settings → Deployment Protection → Vercel
            Authentication → Disabled</b>, then reload. This banner goes once any phone can get in.
          </p>
        </div>
      </div>
    </div>
  );
}

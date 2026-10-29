"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Lock, Eye, MousePointerClick, ShieldCheck } from "lucide-react";
import { Sheet, Button } from "@/components/ui";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { releaseDisplay, clearStaleLock } from "@/app/(app)/lock/actions";
import { reach } from "@/lib/reach";

export type ShownLock = { key: string; mode: "view" | "work"; label: string; href: string; allowed: string[] };
const under = (path: string, p: string) => path === p || path.startsWith(p + "/");
/** keys that scroll a page; everything else is held back on a view lock */
const SCROLL_KEYS = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "];

/**
 * A locked device (0141, Display lock — lib/displayLock.ts). The layout has already left out the menu, the top bar, the
 * tab bar and Back; this keeps the device where it was put:
 *  - work: a link to a page outside the lock's steps does nothing (the hint says why); Back, a typed address or a
 *    script's push to one comes straight back to the locked page (the middleware does the same on the server).
 *  - view: nothing in the page can be clicked, typed into or focused — `[data-lock-area]` takes no pointer events but its
 *    scrolling boxes do, so the page and its rails still scroll; only scroll keys pass.
 * A small pill says what it is locked to; tapping it asks an owner, a general manager or a manager to sign in to unlock.
 */
export function DisplayLock({ lock }: { lock: ShownLock }) {
  const path = usePathname();
  const router = useRouter();
  const [hint, setHint] = useState(false);
  const [open, setOpen] = useState(false);
  const [login, setLogin] = useState(""); const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const hintT = useRef<number | null>(null);
  const flash = () => { setHint(true); if (hintT.current) window.clearTimeout(hintT.current); hintT.current = window.setTimeout(() => setHint(false), 2600); };
  const allowed = (p: string) => lock.allowed.some((a) => under(p, a));

  /* the page this device may show — anything else goes back to the locked one */
  useEffect(() => { if (path && !allowed(path)) { flash(); router.replace(lock.href); } }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const root = document.documentElement; root.dataset.lock = lock.mode;
    const inLock = (t: EventTarget | null) => !!(t as Element | null)?.closest?.("[data-lock-area]");
    /* a link out of the lock: stopped before Next's own handler sees it */
    const click = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (lock.mode === "view" && inLock(e.target)) { e.preventDefault(); e.stopPropagation(); return; }
      if (!a || a.target === "_blank") return;
      let url: URL; try { url = new URL(a.href, location.href); } catch { return; }
      if (url.origin !== location.origin) { e.preventDefault(); e.stopPropagation(); flash(); return; }
      if (!allowed(url.pathname)) { e.preventDefault(); e.stopPropagation(); flash(); }
    };
    /* a view lock: only the keys that scroll — never inside the unlock dialog or the pill */
    const key = (e: KeyboardEvent) => {
      if (lock.mode !== "view") return;
      if ((e.target as Element | null)?.closest?.("[data-lock-ui], [role=dialog]")) return;
      if (!SCROLL_KEYS.includes(e.key)) e.preventDefault();
    };
    const focus = (e: FocusEvent) => { if (lock.mode === "view" && inLock(e.target)) (e.target as HTMLElement).blur?.(); };
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", key, true);
    document.addEventListener("focusin", focus, true);
    return () => { delete root.dataset.lock; document.removeEventListener("click", click, true); document.removeEventListener("keydown", key, true); document.removeEventListener("focusin", focus, true); };
  }, [lock.mode, lock.href]); // eslint-disable-line react-hooks/exhaustive-deps

  const unlock = () => start(async () => {
    setErr(null);
    const r = await reach(() => releaseDisplay(login, password));
    if ("error" in r && r.error) { setErr(r.error); return; }
    setPassword(""); setOpen(false);
    window.location.reload(); // the layout draws the menu again
  });

  const view = lock.mode === "view";
  return (
    <>
      {/* a view lock: the page takes no pointer, its scrolling boxes do; call cards and Assist stay away */}
      <style>{`
        html[data-lock="view"] [data-lock-area] * { pointer-events: none !important; }
        html[data-lock="view"] [data-lock-area] :is([class*="overflow-x-auto"], [class*="overflow-y-auto"], [class*="overflow-auto"], [class*="overflow-x-scroll"], [class*="overflow-y-scroll"], .table-wrap) { pointer-events: auto !important; }
        html[data-lock="view"] [data-call-alert], html[data-lock="view"] [data-ready-dock] { display: none !important; }
        html[data-lock] [data-lock-area] { user-select: ${view ? "none" : "auto"}; }
      `}</style>
      <div className="fixed z-[95] right-3 bottom-[max(14px,env(safe-area-inset-bottom))] flex flex-col items-end gap-2 pointer-events-none" data-lock-ui>
        {hint && <div role="status" className="pointer-events-auto rounded-[14px] px-3.5 py-2.5 text-[13px] font-semibold bg-[var(--color-label)] text-[var(--color-on-label)] shadow-[var(--shadow-pop)] max-w-[80vw]" data-lock-hint>
          This display is locked to {lock.label}</div>}
        <button type="button" onClick={() => { setErr(null); setOpen(true); }} data-lock-pill={lock.mode}
          className="pointer-events-auto h-11 pl-1.5 pr-4 rounded-full inline-flex items-center gap-2 text-[13px] font-bold border border-[var(--color-separator)] bg-[color-mix(in_srgb,var(--color-bg-2)_88%,transparent)] backdrop-blur-md shadow-[var(--shadow-pop)] active:scale-[.97] transition">
          <span className="h-8 w-8 rounded-full grid place-items-center bg-[var(--color-label)] text-[var(--color-on-label)]"><Lock size={15} aria-hidden /></span>
          <span className="max-w-[46vw] truncate">Locked · {lock.label}</span>
          <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-bold bg-[var(--color-fill)]">{view ? <Eye size={12} aria-hidden /> : <MousePointerClick size={12} aria-hidden />}{view ? "View only" : "Work"}</span>
        </button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Unlock this display">
        <form className="space-y-4" data-lock-release onSubmit={(e) => { e.preventDefault(); unlock(); }}>
          <div className="flex items-start gap-3 rounded-[16px] bg-[var(--color-fill)] p-3.5">
            <span className="h-10 w-10 shrink-0 rounded-[12px] grid place-items-center bg-[var(--color-bg-2)]"><ShieldCheck size={19} aria-hidden /></span>
            <p className="text-[13.5px] leading-snug text-[var(--color-label-2)]">Locked to <b className="text-[var(--color-label)]">{lock.label}</b> — {view ? "view only" : "this page and its own steps"}. An owner, a general manager or a manager signs in here to unlock it. This device stays signed in as it is.</p>
          </div>
          <label className="block"><span className="block text-[13px] font-bold mb-1.5">Manager&apos;s sign-in ID or email</span>
            <input value={login} onChange={(e) => setLogin(e.target.value)} autoCapitalize="none" autoComplete="off" data-lock-login /></label>
          <label className="block"><span className="block text-[13px] font-bold mb-1.5">Password</span>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" data-lock-password /></label>
          {err && <p className="text-[13.5px] font-semibold text-[var(--color-red)]" role="alert" data-lock-error>{err}</p>}
          <div className="flex gap-2" data-sheet-foot>
            <Button type="button" variant="gray" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="flex-1" disabled={pending || !login.trim() || !password} data-lock-unlock>Unlock</Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}

/** The device holds a lock the property no longer allows: forget it, quietly, and carry on unlocked. */
export function StaleLock() {
  useEffect(() => { void clearStaleLock(); }, []);
  return null;
}

import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ShieldCheck, LogOut } from "lucide-react";
import { Suspense } from "react";
import { AdminNav } from "./AdminNav";
import { DeckScroll } from "@/components/shell/DeckScroll";
import { TouchSelect } from "@/components/ui/TouchSelect";
import { BackButton } from "@/components/shell/BackButton";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const a = await requireAdmin();
  // the Support tab's badge: requests whose latest word is the property's and is unread (0096)
  const { data: support } = await (await createClient()).rpc("admin_support_badge");
  return (
    /* admin-frame: on an iPad-size touch screen this box scrolls, not the page (globals.css) */
    <div className="min-h-dvh admin-frame">
      {/* Brand and sign-out on one line, the sections on the next on a phone; one line from md.
          As a single row it ran 13px off a 390px phone and took the sign-out button with it. */}
      <header className="ink-panel">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 md:py-4 flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-3">
          {/* Back on every Master control page but the list itself (2026-10-22) */}
          <Suspense fallback={null}><BackButton home="/admin" tone="dark" /></Suspense>
          <span className="h-10 w-10 rounded-xl bg-champagne grid place-items-center text-on-label shrink-0"><ShieldCheck size={18} /></span>
          <div className="min-w-0 flex-1 md:flex-none">
            <div className="font-display text-lg leading-tight truncate">DineFlow <em className="text-champagne">Master control</em></div>
            <div className="text-[11px] text-white/45 mt-0.5 truncate">All properties · {a.email}</div>
          </div>
          <div className="order-last basis-full md:order-none md:basis-auto md:ml-auto"><Suspense fallback={null}><AdminNav support={typeof support === "number" ? support : 0} /></Suspense></div>
          <form action="/logout" method="post" className="shrink-0 md:ml-1">
            <button title="Sign out" aria-label="Sign out" className="h-10 w-10 rounded-xl grid place-items-center text-white/60 hover:text-white hover:bg-white/[.08] transition"><LogOut size={16} /></button>
          </form>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6 min-w-0">{children}</main>
      <DeckScroll />
      <TouchSelect />
    </div>
  );
}

import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { ShieldCheck, LogOut } from "lucide-react";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const a = await requireAdmin();
  return (
    <div className="min-h-dvh">
      <header className="ink-panel">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-4 flex items-center gap-3">
          <span className="h-9 w-9 rounded-xl bg-champagne grid place-items-center text-ink"><ShieldCheck size={18} /></span>
          <div><div className="font-display text-lg leading-none">DineFlow <em className="text-champagne">Master control</em></div><div className="text-[11px] text-white/45 mt-0.5">All properties · {a.email}</div></div>
          <nav className="ml-auto flex items-center gap-4 text-sm"><Link href="/admin" className="text-white/80 hover:text-white">Properties</Link><Link href="/admin?tab=keys" className="text-white/80 hover:text-white">Keys</Link>            <form action="/logout" method="post"><button className="flex items-center gap-1.5 text-white/60 hover:text-white"><LogOut size={14} /></button></form></nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-5 md:px-8 py-6">{children}</main>
    </div>
  );
}

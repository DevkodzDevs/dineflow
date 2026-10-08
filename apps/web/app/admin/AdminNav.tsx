"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Building2, KeyRound, ShieldCheck } from "lucide-react";
import { cn } from "@/components/ui";

/**
 * The three Master control sections as tabs that say which one you are on. They were three bare
 * links on the brand's line; on a phone that line ran 13px off the screen and took sign-out with it.
 */
export function AdminNav() {
  const path = usePathname(); const q = useSearchParams();
  const at = path.startsWith("/admin/compliance") ? "compliance" : q.get("tab") === "keys" ? "keys" : path === "/admin" ? "properties" : null;
  const items = [
    { key: "properties", href: "/admin", label: "Properties", Icon: Building2 },
    { key: "keys", href: "/admin?tab=keys", label: "Keys", Icon: KeyRound },
    { key: "compliance", href: "/admin/compliance", label: "Compliance", Icon: ShieldCheck },
  ];
  return (
    <nav aria-label="Master control" className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-white/[.06] md:flex md:bg-transparent md:p-0 md:gap-1.5">
      {items.map(({ key, href, label, Icon }) => (
        <Link key={key} href={href} aria-current={at === key ? "page" : undefined}
          className={cn("h-10 min-w-0 px-3 rounded-xl inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold transition-colors",
            at === key ? "bg-white text-[#0a0a0d]" : "text-white/70 hover:text-white hover:bg-white/[.08]")}>
          <Icon size={15} className="shrink-0 max-[420px]:hidden" aria-hidden /><span className="truncate">{label}</span>
        </Link>
      ))}
    </nav>
  );
}

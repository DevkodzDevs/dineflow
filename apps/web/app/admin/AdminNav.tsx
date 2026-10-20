"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Building2, KeyRound, ShieldCheck, FlaskConical, LifeBuoy, PackageOpen } from "lucide-react";
import { cn } from "@/components/ui";

/**
 * The Master control sections as tabs that say which one you are on. They were three bare links on
 * the brand's line; on a phone that line ran 13px off the screen and took sign-out with it. Support
 * carries a red count while a property's latest word is unread.
 */
export function AdminNav({ support = 0 }: { support?: number }) {
  const path = usePathname(); const q = useSearchParams();
  const at = path.startsWith("/admin/support") ? "support" : path.startsWith("/admin/testing") ? "testing" : path.startsWith("/admin/compliance") ? "compliance" : path.startsWith("/admin/app-files") ? "app-files" : q.get("tab") === "keys" ? "keys" : path === "/admin" ? "properties" : null;
  const items = [
    { key: "properties", href: "/admin", label: "Properties", Icon: Building2 },
    { key: "keys", href: "/admin?tab=keys", label: "Keys", Icon: KeyRound },
    { key: "compliance", href: "/admin/compliance", label: "Compliance", Icon: ShieldCheck },
    { key: "support", href: "/admin/support", label: "Support", Icon: LifeBuoy },
    { key: "testing", href: "/admin/testing", label: "Testing", Icon: FlaskConical },
    // 0128: the Android and Windows app files every install screen offers — uploaded here, no deploy
    { key: "app-files", href: "/admin/app-files", label: "App files", Icon: PackageOpen },
  ];
  return (
    <nav aria-label="Master control" className="grid grid-cols-3 sm:grid-cols-6 gap-1 p-1 rounded-2xl bg-white/[.06] md:flex md:bg-transparent md:p-0 md:gap-1.5">
      {items.map(({ key, href, label, Icon }) => (
        <Link key={key} href={href} aria-current={at === key ? "page" : undefined}
          className={cn("h-10 min-w-0 px-3 rounded-xl inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold transition-colors",
            at === key ? "bg-white text-[#0a0a0d]" : "text-white/70 hover:text-white hover:bg-white/[.08]")}>
          <Icon size={15} className="shrink-0 max-[420px]:hidden" aria-hidden /><span className="truncate">{label}</span>
          {key === "support" && support > 0 && <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-red)] text-white text-[10.5px] font-bold grid place-items-center num" data-support-badge>{support}</span>}
        </Link>
      ))}
    </nav>
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ServerCog, Archive, ListChecks, RotateCcw, HeartPulse, Eraser, Sparkles, CloudUpload } from "lucide-react";
import { ServerConnection } from "./ServerConnection";
import { useNow } from "./bits";
import type { DataServer } from "./types";
import s from "./Data.module.css";

const ITEMS = [
  { href: "/admin/data", label: "Overview", Icon: LayoutDashboard },
  { href: "/admin/data/servers", label: "Servers", Icon: ServerCog },
  { href: "/admin/data/backups", label: "Backups", Icon: Archive },
  { href: "/admin/data/records", label: "Records", Icon: ListChecks },
  { href: "/admin/data/restore", label: "Restore", Icon: RotateCcw },
  { gap: true },
  { href: "/admin/data/health", label: "Database health", Icon: HeartPulse },
  { href: "/admin/data/cleanup", label: "Clean-up", Icon: Eraser },
  { href: "/admin/data/offsite", label: "Outside copies & plans", Icon: CloudUpload },
  { gap: true },
  { href: "/admin/data/advisor", label: "Advisor", Icon: Sparkles },
] as const;

/** Master control → Data's frame (0173): the Server connection key on top, the sections as a rail (wide) or a chip row, the page. */
export function DataShell({ servers, at, children }: { servers: DataServer[]; at: string; children: React.ReactNode }) {
  const path = usePathname(); const now = useNow(Date.parse(at));
  const active = servers.find((x) => x.active) ?? servers[0];
  const current = (href: string) => (href === "/admin/data" ? path === href : path.startsWith(href));
  const offline = servers.filter((x) => x.kind !== "cloud" && !x.online && x.last_seen_at).length;
  return (
    <>
      <div className={s.topbar}>
        <div className="min-w-0">
          <div className="eyebrow">Platform</div>
          <h1 className="text-[34px] md:text-[44px] mt-1 leading-none">Data <em>&amp; servers</em></h1>
        </div>
        <ServerConnection servers={servers} now={now} />
      </div>
      <div className={s.shell}>
        <nav className={s.rail} aria-label="Data sections" data-data-rail>
          {ITEMS.map((it, i) => "gap" in it ? <span key={i} className={s.railGap} aria-hidden /> : (
            <Link key={it.href} href={it.href} className={s.railItem} aria-current={current(it.href) ? "page" : undefined} data-rail={it.href.split("/").pop()}>
              <it.Icon size={16} aria-hidden />{it.label}
              {it.href === "/admin/data/servers" && offline > 0 && <span className={s.railBadge} title="servers offline">{offline}</span>}
            </Link>
          ))}
        </nav>
        <div className={s.content} data-active-server={active?.id}>{children}</div>
      </div>
    </>
  );
}

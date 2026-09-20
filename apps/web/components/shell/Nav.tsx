"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";
import { Landmark, LayoutDashboard, ClipboardList, Flame, Receipt, UtensilsCrossed, Boxes, BarChart3, Users, Settings, LogOut, BedDouble, ConciergeBell, Sparkles, Contact, Waves, ShieldCheck, ScanLine, FileText, HardHat, Bike, Radio, Sun, Users2, BadgeCheck, CalendarCheck, Activity } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "../ui";
import type { Role, PropertyType, Membership } from "@dineflow/shared";
import { ROLE_LABEL, PROPERTY_LABEL, modulesFor } from "@dineflow/shared";

const ITEMS = [
  { key: "dashboard", href: "/dashboard", label: "Control room", Icon: LayoutDashboard },
  { key: "tomorrow", href: "/tomorrow", label: "Tomorrow", Icon: Sun },
  { key: "scan", href: "/scan", label: "Scan", Icon: ScanLine },
  { key: "frontdesk", href: "/frontdesk", label: "Front desk", Icon: ConciergeBell },
  { key: "rooms", href: "/rooms", label: "Rooms", Icon: BedDouble },
  { key: "housekeeping", href: "/housekeeping", label: "Housekeeping", Icon: Sparkles },
  { key: "guests", href: "/guests", label: "Guests", Icon: Contact },
  { key: "facilities", href: "/facilities", label: "Facilities", Icon: Waves },
  { key: "reservations", href: "/reservations", label: "Reservations", Icon: CalendarCheck },
  { key: "pulse", href: "/pulse", label: "Pulse", Icon: Activity },
  { key: "orders", href: "/orders", label: "Orders", Icon: ClipboardList },
  { key: "online-orders", href: "/online-orders", label: "Online orders", Icon: Bike },
  { key: "kitchen", href: "/kitchen", label: "Kitchen", Icon: Flame },
  { key: "billing", href: "/billing", label: "Billing", Icon: Receipt },
  { key: "invoices", href: "/invoices", label: "Invoices", Icon: FileText },
  { key: "menu", href: "/menu", label: "Menu", Icon: UtensilsCrossed },
  { key: "inventory", href: "/inventory", label: "Pantry", Icon: Boxes },
  { key: "labour", href: "/labour", label: "Labour", Icon: HardHat },
  { key: "proof", href: "/proof", label: "Proof of business", Icon: BadgeCheck },
  { key: "neighbours", href: "/neighbours", label: "Neighbours", Icon: Users2 },
  { key: "channels", href: "/channels", label: "Channels", Icon: Radio },
  { key: "reports", href: "/reports", label: "Reports", Icon: BarChart3 },
  { key: "tax", href: "/tax", label: "Tax & GST", Icon: Landmark },
  { key: "staff", href: "/staff", label: "Staff", Icon: Users },
  { key: "settings", href: "/settings", label: "Settings", Icon: Settings },
];

/** One titled block of the menu. Declared here, not inside Sidebar: a component created during
 *  render is a new type every time, which unmounts and rebuilds the whole menu on each pass. */
function Group({ title, items, path }: { title?: string; items: typeof ITEMS; path: string }) {
  if (!items.length) return null;
  return (
    <div className="mb-5">
      {title && <div className="px-3 pb-2 font-display text-[12px] tracking-[.12em] uppercase text-white/35 rail-hide">{title}</div>}
      {items.map(({ key, href, label, Icon }) => {
        const active = path.startsWith(href);
        return (
          <Link key={key} href={href} data-active={active ? "true" : undefined} className={cn("relative flex items-center gap-3 px-3 h-[42px] rounded-[12px] text-[14px] font-medium transition-colors", active ? "text-white" : "text-white/60 hover:bg-white/[.06] hover:text-white")}>
            {active && <span className="absolute inset-0 rounded-[10px] bg-white/[.12] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgb(255_255_255/.12)]" />}
            {active && <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r bg-[var(--color-tint)] shadow-[0_0_14px_rgb(76_217_100/.8)]" />}
            <Icon size={17} className="relative shrink-0" strokeWidth={active ? 2.2 : 1.8} /><span className="relative rail-hide">{label}</span>
          </Link>
        );
      })}
    </div>
  );
}

/** useLayoutEffect runs before paint, which is what stops the menu flicking; on the server there is
 *  no paint to be early for, and React warns if it is called there, so fall back to useEffect. */
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The menu is taller than the rail on most screens, so it scrolls — and its scrollbar is hidden,
 *  which makes any jump feel like the menu moved on its own. A fresh page load starts it back at
 *  the top and hides whichever row you just picked. Put it back where it was before the first
 *  paint, and only nudge it if the selected row is actually out of sight. */
function useKeepMenuInPlace(path: string) {
  const ref = useRef<HTMLElement | null>(null);
  useBeforePaint(() => {
    const el = ref.current; if (!el) return;
    try {
      const saved = Number(sessionStorage.getItem("df-menu-scroll") ?? "");
      if (Number.isFinite(saved) && saved > 0) el.scrollTop = saved;
    } catch { /* private windows and blocked storage: the menu simply starts at the top */ }
    const row = el.querySelector<HTMLElement>('a[data-active="true"]');
    if (row) {
      const r = row.getBoundingClientRect(), box = el.getBoundingClientRect();
      // "nearest" leaves a row that is already on screen exactly where it is, rather than
      // pulling it to the top; it only moves the menu when the row is genuinely out of sight
      if (r.top < box.top || r.bottom > box.bottom) row.scrollIntoView({ block: "nearest" });
    }
    const remember = () => { try { sessionStorage.setItem("df-menu-scroll", String(el.scrollTop)); } catch {} };
    el.addEventListener("scroll", remember, { passive: true });
    return () => el.removeEventListener("scroll", remember);
  }, [path]);
  return ref;
}

type Props = { name: string; role: Role; restaurant: string; type: PropertyType; membership: Membership | "none"; daysLeft: number; isAdmin: boolean; enabled?: string[] | null; allowed?: string[] | null; logo?: string | null; accountHref?: string | null };

export function Sidebar({ name, role, restaurant, type, membership, daysLeft, isAdmin, enabled, allowed: personal, logo, accountHref }: Props) {
  const path = usePathname();
  const navRef = useKeepMenuInPlace(path);
  const mods = modulesFor(type, role, enabled, personal);
  const allowed = ITEMS.filter((i) => mods.includes(i.key));
  const hospitality = allowed.filter((i) => ["frontdesk", "rooms", "housekeeping", "guests", "facilities"].includes(i.key));
  const dining = allowed.filter((i) => !hospitality.includes(i) && !["dashboard", "tomorrow", "scan", "reports", "tax", "staff", "settings", "labour", "invoices", "channels", "neighbours", "proof"].includes(i.key));
  const manage = allowed.filter((i) => ["invoices", "labour", "proof", "neighbours", "channels", "reports", "tax", "staff", "settings"].includes(i.key));
  const who = (
    <>
      <span className="h-9 w-9 shrink-0 rounded-full bg-[var(--color-tint)] text-white grid place-items-center font-display text-[17px] leading-none">{name.slice(0, 1)}</span>
      <span className="rail-hide min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-white truncate leading-tight">{name}</span>
        <span className="block text-[11px] text-white/50 truncate leading-tight">{ROLE_LABEL[role]}{membership !== "none" && <> · <span className={cn(membership === "trial" ? "text-[var(--color-orange)]" : membership === "expired" ? "text-[var(--color-red)]" : "text-[var(--color-tint)]")}>{membership === "trial" ? `trial · ${daysLeft}d` : membership === "expired" ? "expired" : `${daysLeft}d left`}</span></>}</span>
      </span>
    </>
  );
  return (
    <aside className="hidden md:flex md:flex-col w-[256px] shrink-0 ink-panel sticky top-0 self-start h-dvh px-4 py-6 overflow-hidden">
      <Link href="/dashboard" className="px-2 flex items-center gap-2.5 min-w-0">
        {logo ? <img src={logo} alt="" className="h-9 w-9 shrink-0 object-contain" /> : <span className="flip xs !min-w-9 !h-9 !text-[19px] !rounded-[10px] shrink-0"><span className="flip-face">{restaurant.slice(0, 1)}</span></span>}
        <div className="min-w-0"><div className="font-display text-[17px] leading-tight text-white tracking-wide rail-hide truncate">{restaurant}</div><div className="rail-hide text-[11px] text-white/45 mt-0.5 truncate">{PROPERTY_LABEL[type]}</div></div>
      </Link>
      <nav ref={navRef} className="mt-7 flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] -mx-1 px-1 sidebar-scroll">
        <Group items={allowed.filter((i) => ["dashboard", "tomorrow", "scan"].includes(i.key))} path={path} />
        <Group title={type === "resort" ? "Resort" : "Hotel"} items={hospitality} path={path} />
        <Group title="Dining" items={dining} path={path} />
        <Group title="Manage" items={manage} path={path} />
      </nav>
      {/* the foot: who you are, and the way out. Settings keeps its own row up in Manage,
          so the second button for it down here was only costing a row of height. */}
      <div className="mt-auto pt-3">
        {isAdmin && <Link href="/admin" className="rail-hide mb-2 flex items-center gap-2 h-9 px-3 rounded-xl bg-white/[.06] text-[12px] font-semibold text-white/80 hover:bg-white/10 hover:text-white transition"><ShieldCheck size={14} /> Master control</Link>}
        {/* p-[7px] plus the 1px border puts the card at exactly 52px across — the width the rail
            leaves once it collapses, so the avatar alone still sits square inside it */}
        <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[.04] p-[7px]">
          {accountHref
            ? <Link href={accountHref} title={`${name} · settings`} className="flex items-center gap-2.5 min-w-0 flex-1 rounded-xl transition hover:brightness-125">{who}</Link>
            : <span className="flex items-center gap-2.5 min-w-0 flex-1">{who}</span>}
          <form action="/logout" method="post" className="rail-hide shrink-0">
            <button title="Sign out" aria-label="Sign out" className="h-8 w-8 grid place-items-center rounded-lg text-white/45 hover:bg-white/10 hover:text-white transition"><LogOut size={15} /></button>
          </form>
        </div>
      </div>
    </aside>
  );
}

export function BottomNav({ role, type, enabled, allowed: personal }: { role: Role; type: PropertyType; enabled?: string[] | null; allowed?: string[] | null }) {
  const path = usePathname();
  const mods = modulesFor(type, role, enabled, personal);
  const allowed = ITEMS.filter((i) => mods.includes(i.key));
  return (
    <nav className="md:hidden fixed bottom-[max(10px,env(safe-area-inset-bottom))] inset-x-3 z-30 material-thick rounded-[26px] shadow-[var(--shadow-pop)]">
      <div className="flex overflow-x-auto [scrollbar-width:none] snap-x px-1">
        {allowed.map(({ key, href, label, Icon }) => {
          const active = path.startsWith(href);
          return (
            <Link key={key} href={href} className={cn("shrink-0 snap-start flex flex-col items-center gap-0.5 py-2 text-[11px] font-display tracking-wide transition-colors", allowed.length <= 5 ? "flex-1" : "w-[20%] min-w-[76px]", active ? "text-[var(--color-tint)]" : "text-[var(--color-label-2)]")}>
              <motion.span whileTap={{ scale: .85 }} className={cn("h-8 w-12 grid place-items-center rounded-full transition", active && "bg-[rgb(76_217_100/.16)]")}><Icon size={20} strokeWidth={active ? 2.4 : 1.9} /></motion.span>{label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

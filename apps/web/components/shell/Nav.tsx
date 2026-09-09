"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ClipboardList, Flame, Receipt, UtensilsCrossed, Boxes, BarChart3, Users, Settings, LogOut, Info, BedDouble, ConciergeBell, Sparkles, Contact, Waves, ShieldCheck, ScanLine, FileText, HardHat, Bike, Radio, Sun, Users2, BadgeCheck, CalendarCheck, Activity } from "lucide-react";
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
  { key: "staff", href: "/staff", label: "Staff", Icon: Users },
  { key: "settings", href: "/settings", label: "Settings", Icon: Settings },
];

type Props = { name: string; role: Role; restaurant: string; type: PropertyType; membership: Membership | "none"; daysLeft: number; isAdmin: boolean; enabled?: string[] | null; allowed?: string[] | null; logo?: string | null };

export function Sidebar({ name, role, restaurant, type, membership, daysLeft, isAdmin, enabled, allowed: personal, logo }: Props) {
  const path = usePathname();
  const mods = modulesFor(type, role, enabled, personal);
  const allowed = ITEMS.filter((i) => mods.includes(i.key));
  const hospitality = allowed.filter((i) => ["frontdesk", "rooms", "housekeeping", "guests", "facilities"].includes(i.key));
  const dining = allowed.filter((i) => !hospitality.includes(i) && !["dashboard", "tomorrow", "scan", "reports", "staff", "settings", "labour", "invoices", "channels", "neighbours", "proof"].includes(i.key));
  const manage = allowed.filter((i) => ["invoices", "labour", "proof", "neighbours", "channels", "reports", "staff", "settings"].includes(i.key));
  const Group = ({ title, items }: { title?: string; items: typeof ITEMS }) => items.length ? (
    <div className="mb-5">
      {title && <div className="px-3 pb-2 font-display text-[12px] tracking-[.12em] uppercase text-white/35 rail-hide">{title}</div>}
      {items.map(({ key, href, label, Icon }) => {
        const active = path.startsWith(href);
        return (
          <Link key={key} href={href} className={cn("relative flex items-center gap-3 px-3 h-[42px] rounded-[12px] text-[14px] font-medium transition-colors", active ? "text-white" : "text-white/60 hover:bg-white/[.06] hover:text-white")}>
            {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-[10px] bg-white/[.12] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgb(255_255_255/.12)]" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
            {active && <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r bg-[var(--color-tint)] shadow-[0_0_14px_rgb(76_217_100/.8)]" />}
            <Icon size={17} className="relative shrink-0" strokeWidth={active ? 2.2 : 1.8} /><span className="relative rail-hide">{label}</span>
          </Link>
        );
      })}
    </div>
  ) : null;
  return (
    <aside className="hidden md:flex md:flex-col w-[256px] shrink-0 ink-panel sticky top-0 self-start h-dvh px-4 py-6 overflow-hidden">
      <Link href="/dashboard" className="px-2 flex items-center gap-2.5 min-w-0">
        {logo ? <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-[10px] object-cover bg-white" /> : <span className="flip xs !min-w-9 !h-9 !text-[19px] !rounded-[10px] shrink-0"><span className="flip-face">{restaurant.slice(0, 1)}</span></span>}
        <div className="min-w-0"><div className="font-display text-[17px] leading-tight text-white tracking-wide rail-hide truncate">{restaurant}</div><div className="rail-hide text-[11px] text-white/45 mt-0.5 truncate">{PROPERTY_LABEL[type]}</div></div>
      </Link>
      <nav className="mt-7 flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] -mx-1 px-1 sidebar-scroll">
        <Group items={allowed.filter((i) => ["dashboard", "tomorrow", "scan"].includes(i.key))} />
        <Group title={type === "resort" ? "Resort" : "Hotel"} items={hospitality} />
        <Group title="Dining" items={dining} />
        <Group title="Manage" items={manage} />
      </nav>
      {/* the foot: one compact card — who you are, one line of status, and the two things you do from here */}
      <div className="mt-auto pt-3">
        <div className="rounded-2xl bg-white/[.06] border border-white/[.08] p-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="h-9 w-9 shrink-0 rounded-full bg-[var(--color-label)] text-[var(--color-on-label)] grid place-items-center font-display text-base">{name.slice(0, 1)}</span>
            <div className="min-w-0 flex-1 rail-hide">
              <div className="text-[13px] text-white font-semibold truncate leading-tight">{name}</div>
              <div className="text-[11px] text-white/50 truncate leading-tight mt-0.5">{ROLE_LABEL[role]}{membership !== "none" && <> · <span className={cn(membership === "trial" ? "text-[var(--color-orange)]" : membership === "expired" ? "text-[var(--color-red)]" : "text-[var(--color-tint)]")}>{membership === "trial" ? `trial · ${daysLeft}d` : membership === "expired" ? "expired" : `${daysLeft}d left`}</span></>}</div>
            </div>
            <form action="/logout" method="post" className="rail-hide"><button aria-label="Sign out" title="Sign out" className="h-8 w-8 grid place-items-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition"><LogOut size={15} /></button></form>
          </div>
          {isAdmin && <Link href="/admin" className="rail-hide mt-2 flex items-center justify-center gap-1.5 h-8 rounded-xl bg-white/[.06] text-[12px] font-semibold text-white/80 hover:bg-white/10 hover:text-white transition"><ShieldCheck size={13} /> Master control</Link>}
        </div>
        <Link href="/about" className="rail-hide mt-2 flex items-center justify-center gap-1.5 text-[11px] text-white/35 hover:text-white/70 transition"><Info size={12} /> About DineFlow</Link>
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

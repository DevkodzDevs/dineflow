"use client";
import Link from "next/link";
import { useNavPath } from "./useNavPath";
import { ProfileCard } from "./ProfileCard";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LogOut, ShieldCheck, Menu, X, Fingerprint, PanelLeftClose, PanelLeftOpen, LayoutTemplate, type LucideIcon } from "lucide-react";
import { SidebarPicker } from "./SidebarPicker";
import { ICON_LOOKS, chosenSidebar, currentSidebar, defaultSidebar, toggleFold } from "@/lib/sidebar";
import { cn, Sheet, FlapMini } from "../ui";
import type { Role, PropertyType, Membership } from "@dineflow/shared";
import { ROLE_LABEL, PROPERTY_LABEL, modulesFor } from "@dineflow/shared";
import { barFor } from "@/lib/bar";
import { rowsFor, freshFor, endFor, myDayFor, isOn, menuGroups, type Section } from "./sections";
import { useSupportUnread } from "@/components/support/useUnread";

/** A menu row; `badge` is a count that wants attention (a red dot on the icon, the number beside the label). */
type NavItem = Section & { badge?: number; hint?: string };

/** One titled block of the menu. Declared here, not inside Sidebar: a component created during
 *  render is a new type every time, which unmounts and rebuilds the whole menu on each pass. */
function Group({ title, items, path, className }: { title?: string; items: NavItem[]; path: string; className?: string }) {
  if (!items.length) return null;
  return (
    /* .nav-group: a hairline under every group but the last (globals.css, the sidebar block) */
    <div className={cn("nav-group", className)}>
      {title && <div className="px-3 pb-2 font-display text-[12px] tracking-[.12em] uppercase text-white/35 rail-hide">{title}</div>}
      {items.map(({ key, href, label, Icon, badge, hint }) => {
        const active = isOn(path, href);
        return (
          <Link key={key} href={href} title={hint ?? label} data-active={active ? "true" : undefined} data-help={key === "help" ? "" : undefined} className={cn("relative flex items-center gap-3 px-3 h-[42px] [@media(pointer:coarse)]:h-11 rounded-[12px] text-[14px] font-medium transition-colors", active ? "text-white" : "text-white/60 hover:bg-white/[.06] hover:text-white")}>
            {active && <span className="absolute inset-0 rounded-[10px] bg-white/[.12] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgb(255_255_255/.12)]" />}
            {active && <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r bg-[var(--color-tint)] shadow-[0_0_14px_color-mix(in_srgb,var(--color-tint)_80%,transparent)]" />}
            <span className="relative shrink-0"><Icon size={17} strokeWidth={active ? 2.2 : 1.8} />{badge ? <span className="absolute -top-1 -right-1.5 h-2.5 w-2.5 rounded-full bg-[var(--color-red)] ring-2 ring-[#121216]" aria-hidden /> : null}</span>
            <span className="relative rail-hide nav-label flex-1 min-w-0 truncate">{label}</span>
            {badge ? <span className="relative rail-hide shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--color-red)] text-white text-[11px] font-bold grid place-items-center num">{badge}</span> : null}
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
  const loaded = useRef(false);
  useBeforePaint(() => {
    const el = ref.current; if (!el) return;
    /* A phone has no sidebar (display: none below 768px), and measuring it there still forced a layout of
       the whole new screen inside the commit, before its first paint — ~50 ms on a mid-range phone, on
       every tap of the tab bar (a CPU profile of Control room → Orders, 2026-10-13). matchMedia costs no
       layout. */
    if (!matchMedia("(min-width: 768px)").matches) return;
    const nudge = () => {
      const row = el.querySelector<HTMLElement>('a[data-active="true"]');
      if (!row) return;
      const r = row.getBoundingClientRect(), box = el.getBoundingClientRect();
      // "nearest" leaves a row that is already on screen exactly where it is, rather than
      // pulling it to the top; it only moves the menu when the row is genuinely out of sight
      if (r.top < box.top || r.bottom > box.bottom) row.scrollIntoView({ block: "nearest" });
    };
    if (!loaded.current) {
      // a fresh page load: put the menu back before the first paint, so it does not flick
      loaded.current = true;
      try {
        const saved = Number(sessionStorage.getItem("df-menu-scroll") ?? "");
        if (Number.isFinite(saved) && saved > 0) el.scrollTop = saved;
      } catch { /* private windows and blocked storage: the menu simply starts at the top */ }
      nudge();
      return;
    }
    // moving between screens: the menu stayed where it was, so the new row is checked after the new
    // screen has painted rather than holding that paint up
    let t: ReturnType<typeof setTimeout> | undefined;
    const raf = requestAnimationFrame(() => { t = setTimeout(nudge, 0); });
    return () => { cancelAnimationFrame(raf); if (t) clearTimeout(t); };
  }, [path]);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const remember = () => { try { sessionStorage.setItem("df-menu-scroll", String(el.scrollTop)); } catch {} };
    el.addEventListener("scroll", remember, { passive: true });
    return () => el.removeEventListener("scroll", remember);
  }, []);
  return ref;
}

type Props = { name: string; role: Role; dept?: string | null; restaurant: string; type: PropertyType; membership: Membership | "none"; daysLeft: number; isAdmin: boolean; enabled?: string[] | null; allowed?: string[] | null; logo?: string | null; accountHref?: string | null; attend?: boolean; grants?: string[] | null };

export function Sidebar({ name, role, dept = null, restaurant, type, membership, daysLeft, isAdmin, enabled, allowed: personal, logo, accountHref, attend, grants = null }: Props) {
  const path = useNavPath();   // lights the tapped item at once (useNavPath.ts)
  const navRef = useKeepMenuInPlace(path);
  /* The drawer. On an iPad or a tablet (768–1279) the menu is an icon rail; the hamburger at its
     top opens the whole menu over the page, labels and all, without moving the page underneath.
     Picking a screen, the scrim, or Escape closes it. Above 1279 the full menu is always out and
     the hamburger is not drawn. */
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    // the drawer belongs to the icon looks: any other look (a resize past 1280 on the default, or a new choice) closes it
    const wide = () => { if (!ICON_LOOKS.includes(currentSidebar())) setOpen(false); };
    window.addEventListener("keydown", esc); window.addEventListener("resize", wide); window.addEventListener("df-sidebar", wide);
    return () => { window.removeEventListener("keydown", esc); window.removeEventListener("resize", wide); window.removeEventListener("df-sidebar", wide); };
  }, [open]);
  /* The look (lib/sidebar.ts). With no choice on this device the default follows the width — rail under 1280, the full
     menu from 1280 — so a window dragged across 1280, or an iPad turned, still gets its own; a choice holds at any width. */
  const [folded, setFolded] = useState(false);
  /* Menu style, from the sidebar itself (2026-10-23, the owner: "the users choose the design") — the same six as My profile */
  const [styles, setStyles] = useState(false);
  useEffect(() => {
    const sync = () => { if (!chosenSidebar()) document.documentElement.setAttribute("data-sidebar", defaultSidebar(window.innerWidth)); setFolded(ICON_LOOKS.includes(currentSidebar())); };
    sync(); window.addEventListener("resize", sync); window.addEventListener("df-sidebar", sync);
    return () => { window.removeEventListener("resize", sync); window.removeEventListener("df-sidebar", sync); };
  }, []);
  const mods = modulesFor(type, role, enabled, personal);
  const allowed = rowsFor(mods, role, grants);
  const unread = useSupportUnread(path, endFor(role).some((i) => i.key === "help"));
  /* the menu under its headings (menuGroups, sections.ts — 2026-10-21) */
  const groups = menuGroups([...allowed, ...freshFor(role, dept)], myDayFor(role) ? [myDayFor(role)!] : []);
  /* the menu's last group (2026-10-20): the property's Settings (the owner), the person's own settings (/me —
     "Settings" for everyone else, "My profile" for the owner), Feedback & complaints (the owner reads it as Staff
     feedback) and, for the owner alone, Help & support — a red dot while a reply from DineFlow is unread */
  const end: NavItem[] = [
    ...allowed.filter((i) => i.key === "settings"),
    ...endFor(role).map((i): NavItem => i.key === "help" ? { ...i, badge: unread, hint: unread ? `Help & support · ${unread} new repl${unread === 1 ? "y" : "ies"}` : undefined } : i),
  ];
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
    <>
    <aside data-open={open ? "true" : undefined} className="hidden md:flex md:flex-col w-[256px] shrink-0 ink-panel sticky top-0 self-start h-dvh px-4 py-6 overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"} title={open ? "Close menu" : "Menu"}
        className="rail-only mb-4 h-11 w-11 shrink-0 rounded-xl grid place-items-center text-white/75 bg-white/[.06] hover:bg-white/10 hover:text-white transition">
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>
      <Link href={myDayFor(role) ? "/home" : "/dashboard"} className="px-2 flex items-center gap-2.5 min-w-0 [@media(pointer:coarse)]:min-h-11">
        {logo ? <img src={logo} alt="" className="h-9 w-9 shrink-0 object-contain" /> : <span className="flip xs !min-w-9 !h-9 !text-[19px] !rounded-[10px] shrink-0"><span className="flip-face">{restaurant.slice(0, 1)}</span></span>}
        <div className="min-w-0"><div className="font-display text-[17px] leading-tight text-white tracking-wide rail-hide truncate">{restaurant}</div><div className="rail-hide text-[11px] text-white/45 mt-0.5 truncate">{PROPERTY_LABEL[type]}</div></div>
      </Link>
      <nav ref={navRef} className="mt-7 flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] -mx-1 px-1 sidebar-scroll">
        {/* staff: My day first (their landing); the owner and managers: the control room */}
        {groups.map((g, i) => <Group key={g.title ?? `top-${i}`} title={g.title ?? undefined} items={g.items} path={path} />)}
        {/* the last group: Settings, the person's own settings, Feedback & complaints (and the owner's Help & support), straight after the rest and scrolling with them */}
        <Group items={end} path={path} />
      </nav>
      {/* the foot: who you are, and the way out — kept short (owner, 2026-10-13). Settings and Help & support
          are the menu's last group above; installing is the top bar's download button. */}
      <div className="mt-auto pt-3">
        {/* only when the owner has turned on a way to punch from one's own phone (fingerprint or selfie) */}
        {attend && <Link href="/attendance" title="My attendance" className={cn("mb-2 flex items-center gap-3 h-[42px] [@media(pointer:coarse)]:h-11 px-3 rounded-[12px] text-[14px] font-medium transition-colors", path.startsWith("/attendance") ? "bg-white/[.12] text-white" : "text-white/60 hover:bg-white/[.06] hover:text-white")}><Fingerprint size={17} className="shrink-0" /><span className="rail-hide">My attendance</span></Link>}
        {isAdmin && <Link href="/admin" className="rail-hide mb-2 flex items-center gap-2 h-9 px-3 rounded-xl bg-white/[.06] text-[12px] font-semibold text-white/80 hover:bg-white/10 hover:text-white transition"><ShieldCheck size={14} /> Master control</Link>}
        {/* the fold (2026-10-23): the open looks fold to icons, the icon looks unfold to the one they came from; kept on this
            device. From 768 up (.sb-fold), at every look — a phone has the bottom bar. */}
        {/* beside it, Menu style: the six looks in a sheet. A row on the open looks, a column on the icon looks (.sb-tools) */}
        <div className="sb-tools mb-2 gap-1">
        <button type="button" onClick={() => { setOpen(false); toggleFold(); }} aria-pressed={folded} data-sb-fold
          title={folded ? "Expand the menu" : "Collapse the menu to icons"} aria-label={folded ? "Expand the menu" : "Collapse the menu to icons"}
          className="sb-fold flex-1 min-w-0 items-center justify-center gap-2.5 h-10 px-3 rounded-[12px] text-[13px] font-semibold text-white/55 hover:text-white hover:bg-white/[.06] transition-colors [@media(pointer:coarse)]:min-h-11">
          {folded ? <PanelLeftOpen size={18} aria-hidden className="shrink-0" /> : <PanelLeftClose size={18} aria-hidden className="shrink-0" />}
          <span className="rail-hide flex-1 text-left truncate">{folded ? "Expand menu" : "Collapse menu"}</span>
        </button>
        <button type="button" onClick={() => { setOpen(false); setStyles(true); }} title="Menu style" aria-label="Menu style" aria-haspopup="dialog" data-sb-style
          className="shrink-0 h-10 w-10 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 mx-auto grid place-items-center rounded-[12px] text-white/55 hover:text-white hover:bg-white/[.06] transition-colors">
          <LayoutTemplate size={18} aria-hidden />
        </button>
        </div>
        {/* p-[7px] plus the 1px border puts the card at exactly 52px across — the width the rail
            leaves once it collapses, so the avatar alone still sits square inside it */}
        <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[.04] p-[7px]">
          {accountHref
            ? <Link href={accountHref} title={`${name} · settings`} className="flex items-center gap-2.5 min-w-0 flex-1 rounded-xl transition hover:brightness-125 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11">{who}</Link>
            : <span className="flex items-center gap-2.5 min-w-0 flex-1">{who}</span>}
          <form action="/logout" method="post" className="rail-hide shrink-0">
            <button title="Sign out" aria-label="Sign out" className="h-8 w-8 grid place-items-center rounded-lg text-white/45 hover:bg-white/10 hover:text-white transition"><LogOut size={15} /></button>
          </form>
        </div>
      </div>
    </aside>
    {/* holds the rail's 76px in the row while the open drawer floats over the page */}
    <div aria-hidden className="nav-spacer" />
    {open && <div className="nav-scrim" onClick={() => setOpen(false)} aria-hidden />}
    <Sheet open={styles} onClose={() => setStyles(false)} title="Menu style" wide><SidebarPicker inSheet /></Sheet>
    </>
  );
}

/** The four a phone keeps in reach, by kind of property; the rest live under More. Only modules
 *  this person may open are used, and the gaps fill from the menu's own order. */
const PIN_KEY = "df-bar-pins";

type MoreProps = { role: Role; type: PropertyType; dept?: string | null; enabled?: string[] | null; allowed?: string[] | null; name: string; membership: Membership | "none"; daysLeft: number; isAdmin: boolean; accountHref?: string | null; lateKots?: number; attend?: boolean; grants?: string[] | null };

/* a count on a tab stays a red pill: a flap tile cannot be read at 18px (2026-10-20, design-system.md "Flap numbers") */
const count = (n: number) => n > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-red)] text-white text-[10px] font-bold grid place-items-center ring-2 ring-[var(--color-bg-2)] num" data-tab-count={n}>{n > 99 ? "99+" : n}</span>;
/* A tab's icon. Declared here, not inside BottomNav: a component made during render is a new type every render, so
   React remounted every icon on each re-render of the bar (2026-10-22, the tab-bar full-reload hunt, useNavPath.ts). */
/* The capsule's slot (2026-10-22, the owner's picture): a 60×48 place for the icon (narrower only on the smallest phones); the open one gets the soft pill
   behind it (`.tab-pill`, globals.css). Every icon is in the ink colour — the pill alone says which is open, as in the
   picture. A press shrinks the icon (CSS, no animation library in the tap's way). */
function TabSlot({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span className="relative h-12 w-[min(60px,100%)] grid place-items-center" aria-hidden>
      {active && <span className="tab-pill df-thumb absolute inset-0 rounded-full" data-tab-pill />}
      <span className="relative grid place-items-center transition-transform duration-150 group-active/tab:scale-[.88]">{children}</span>
    </span>
  );
}
function TabIcon({ active, Icon, n }: { active: boolean; Icon: LucideIcon; n: number }) {
  return <TabSlot active={active}><Icon size={26} strokeWidth={active ? 2.25 : 2} />{count(n)}</TabSlot>;
}

/**
 * The phone's navigation: four sections and More. It used to be one sideways-scrolling strip of
 * every section — five fitted, nothing said it scrolled, so most of the app looked missing — and a
 * phone had no way to sign out at all. More opens every section this person can use, grouped the
 * way the sidebar groups them, with the account, Master control and Sign out at the foot.
 */
export function BottomNav({ role, type, dept = null, enabled, allowed: personal, name, membership, daysLeft, isAdmin, accountHref, lateKots = 0, attend, grants = null }: MoreProps) {
  const path = useNavPath();   // lights the tapped item at once (useNavPath.ts)
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [path]);
  const mods = modulesFor(type, role, enabled, personal);
  const allowed = rowsFor(mods, role, grants);
  /* The bar's four: the person's own pins if they set any on this device (Square lets staff pin the
     applets they use most), else what their role does all day, else the property's default. */
  const [pins, setPins] = useState<string[] | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(PIN_KEY) ?? "null"); if (Array.isArray(v)) setPins(v.filter((x) => typeof x === "string")); } catch { /* none saved */ } }, []);
  useEffect(() => { if (!open) setEditing(false); }, [open]);
  /* The sheet opened at its top every time, so after choosing a section far down the list (Manage,
     Insights & control) and coming back to More, the one you were on was below the fold — it looked lost.
     On open, the sheet's own scroller brings the current section to the middle. Only that scroller
     moves; scrollIntoView would also nudge the page behind it. */
  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const box = sheetRef.current?.closest(".sheet-body") as HTMLElement | null;
      const cur = sheetRef.current?.querySelector('[aria-current="page"]') as HTMLElement | null;
      if (!box || !cur) return;
      const b = box.getBoundingClientRect(), c = cur.getBoundingClientRect();
      if (c.top >= b.top + 8 && c.bottom <= b.bottom - 8) return;
      box.scrollTo({ top: box.scrollTop + (c.top - b.top) - (b.height - c.height) / 2, behavior: "smooth" });
    }, 80);
    return () => clearTimeout(t);
  }, [open]);
  const savePins = (v: string[] | null) => { setPins(v); try { if (v) localStorage.setItem(PIN_KEY, JSON.stringify(v)); else localStorage.removeItem(PIN_KEY); } catch { /* fine */ } };
  const fresh = freshFor(role, dept);
  // the Cleaning and Work boards are no modules, but they are the day of the people who clean and fix: the bar may carry them (lib/bar.ts)
  const onBar = [...allowed, ...fresh.filter((i) => i.key === "cleaning" || i.key === "work")];
  /* A screen inside another section (Join by QR, the Order board) goes on the bar only when pinned — it never
     fills a gap by itself. */
  const fills = onBar.filter((i) => !i.mod || (pins ?? []).includes(i.key));
  const primary = barFor(role, type, fills.map((i) => i.key), pins, dept).map((k) => fills.find((i) => i.key === k)!);
  /* what the bar shows: staff keep My day in the first place (2026-10-20), then three of their own */
  const myDay = myDayFor(role);
  const full = myDay ? [myDay, ...primary.filter((i) => i.key !== "home").slice(0, 3)] : primary;
  const bar = full;
  /* What the person chose — not what the bar shows. When fewer than four are pinned the bar fills the
     gaps from the menu; counting those fillers as pins made a newly pinned section push itself out. */
  const pinned = pins ? pins.filter((k) => onBar.some((i) => i.key === k)) : primary.map((i) => i.key);
  const togglePin = (k: string) => {
    const cur = pinned;
    if (cur.includes(k)) { if (cur.length > 1) savePins(cur.filter((x) => x !== k)); }
    else savePins(cur.length >= 4 ? [...cur.slice(0, 3), k] : [...cur, k]);
  };
  /* what needs attention, as a count on its section: tickets over 15 minutes in the kitchen */
  const badge = (key: string) => (key === "kitchen" && lateKots > 0 ? lateKots : 0);
  const rest = allowed.filter((i) => !bar.includes(i));
  const onMore = rest.some((i) => isOn(path, i.href)) || fresh.some((i) => isOn(path, i.href)) || endFor(role).some((i) => isOn(path, i.href));
  const unread = useSupportUnread(path, endFor(role).some((i) => i.key === "help"));
  const owner = role === "owner";
  const moreBadge = rest.reduce((n, i) => n + badge(i.key), 0) + (owner ? unread : 0);
  /* the foot's links: the menu's last group less the one the account row already is (/settings or /me) */
  const foot = endFor(role).filter((i) => i.href !== accountHref);
  /* the same headings as the sidebar (menuGroups); a "fresh" link already on the bar is not repeated here */
  const groups = menuGroups([...allowed, ...fresh.filter((i) => !bar.some((p) => p.key === i.key))], myDay ? [myDay] : []);
  /* The bar (2026-10-22, the owner's picture, "exactly"): a floating capsule (`nav.tabbar`, globals.css) of icons only —
     four sections, More, and the person's avatar in a ring at the end (their settings, or My profile, as the top bar's
     avatar). The names are each slot's aria-label and title. It replaced "Lift" (2026-10-21: the open icon lifted out of
     a docked bar in a green circle, labels under every icon). */
  const tab = "group/tab relative flex-1 min-w-0 h-full grid place-items-center text-[var(--color-label)]";
  const slot = ({ key, href, label, Icon }: Section) => { const active = isOn(path, href); return (
    <Link key={key} href={href} aria-current={active ? "page" : undefined} aria-label={label} title={label} className={tab} data-tab={key}>
      <TabIcon active={active} Icon={Icon} n={badge(key)} />
    </Link>); };
  const moreOn = open || onMore;
  const meHref = accountHref ?? "/me";
  const meOn = !open && isOn(path, meHref);
  const [card, setCard] = useState(false);
  return (
    <>
      <nav aria-label="Sections" className="tabbar md:hidden fixed z-30" data-tabbar>
        <div className="flex h-full items-center">
          {bar.map(slot)}
          <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-label="More" title="More" className={tab} data-tab="more">
            <TabIcon active={moreOn} Icon={Menu} n={moreBadge} />
          </button>
          {/* the avatar opens the profile card (2026-10-23), as the top bar's does; Edit my profile and Settings are in it */}
          <button type="button" onClick={() => setCard(true)} aria-haspopup="dialog" aria-label={`${name} · your profile`} title={name} className={tab} data-tab="me">
            <TabSlot active={meOn || card}>
              <span className="h-[34px] w-[34px] rounded-full grid place-items-center bg-[var(--color-tint)] text-[var(--color-on-tint)] font-display text-[16px] leading-none ring-[2.5px] ring-[var(--color-label)]">{name.slice(0, 1)}</span>
            </TabSlot>
          </button>
        </div>
      </nav>

      <ProfileCard open={card} onClose={() => setCard(false)} accountHref={accountHref} />
      <Sheet open={open} onClose={() => setOpen(false)} title="Menu">
        <div className="space-y-5" ref={sheetRef} data-more>
          <div className={cn("flex items-center gap-2 rounded-2xl p-2.5 pl-3.5", editing ? "bg-[var(--color-green-2)]" : "bg-[var(--color-fill)]")}>
            <span className="flex-1 min-w-0 text-[12.5px] leading-snug">{editing ? <><b>Tap to pin</b> up to 4 sections to your bar.</> : <>Your bar: <b>{bar.map((i) => i.label).join(" · ")}</b></>}</span>
            {editing && pins && <button type="button" onClick={() => savePins(null)} className="h-10 px-3 rounded-xl text-[12.5px] font-semibold text-[var(--color-label-2)] hover:text-[var(--color-label)]">Reset</button>}
            <button type="button" onClick={() => setEditing((v) => !v)} aria-pressed={editing}
              className={cn("h-10 px-3.5 rounded-xl text-[13px] font-semibold shrink-0 transition-colors", editing ? "bg-[var(--color-tint)] text-[var(--color-on-tint)]" : "bg-[var(--color-bg-2)] text-[var(--color-label)] shadow-[0_1px_2px_rgb(0_0_0/.15)]")}>{editing ? "Done" : "Edit bar"}</button>
          </div>
          {groups.map((g) => (
            <section key={g.title ?? "top"}>
              {g.title && <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--color-label-3)] mb-2">{g.title}</div>}
              <div className="grid grid-cols-3 gap-2">
                {g.items.map(({ key, href, label, Icon }) => {
                  const active = isOn(path, href);
                  if (editing) {
                    const on = pinned.includes(key);
                    return (
                      <button key={key} type="button" onClick={() => togglePin(key)} aria-pressed={on}
                        className={cn("relative min-w-0 min-h-[76px] rounded-2xl p-2.5 flex flex-col items-center justify-center gap-1.5 text-center text-[12px] font-semibold leading-tight transition-colors",
                          on ? "bg-[color-mix(in_srgb,var(--color-tint)_14%,transparent)] text-[var(--color-tint)] ring-2 ring-[var(--color-tint)]" : "bg-[var(--color-fill)] text-[var(--color-label)] border border-dashed border-[var(--color-label-3)]")}>
                        <span className={cn("absolute top-1.5 right-1.5 h-5 w-5 rounded-full grid place-items-center text-[10px] font-bold num", on ? "bg-[var(--color-tint)] text-[var(--color-on-tint)]" : "bg-[var(--color-bg-2)] text-[var(--color-label-3)]")}>{on ? pinned.indexOf(key) + 1 : "+"}</span>
                        <Icon size={20} /><span className="line-clamp-2">{label}</span>
                      </button>
                    );
                  }
                  return (
                    <Link key={key} href={href} aria-current={active ? "page" : undefined}
                      className={cn("min-w-0 min-h-[76px] rounded-2xl p-2.5 flex flex-col items-center justify-center gap-1.5 text-center text-[12px] font-semibold leading-tight transition-colors",
                        active ? "bg-[color-mix(in_srgb,var(--color-tint)_14%,transparent)] text-[var(--color-tint)] ring-1 ring-[color-mix(in_srgb,var(--color-tint)_40%,transparent)]" : "bg-[var(--color-fill)] text-[var(--color-label)] hover:bg-[var(--color-fill-2)]")}>
                      <span className="relative"><Icon size={20} strokeWidth={active ? 2.3 : 1.9} />{count(badge(key))}</span><span className="line-clamp-2">{label}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}

          <div className="pt-4 border-t border-[var(--color-separator)] space-y-2">
            {(() => {
              const who = (
                <>
                  <span className="h-10 w-10 shrink-0 rounded-full bg-[var(--color-tint)] text-[var(--color-on-tint)] grid place-items-center font-display text-[17px]">{name.slice(0, 1)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold truncate">{name}</span>
                    <span className="block text-xs text-[var(--color-label-2)] truncate">{ROLE_LABEL[role]}{membership !== "none" && <> · <span className={cn(membership === "trial" ? "text-[var(--color-orange)]" : membership === "expired" ? "text-[var(--color-red)]" : "text-[var(--color-tint)]")}>{membership === "trial" ? `trial · ${daysLeft}d` : membership === "expired" ? "expired" : `${daysLeft}d left`}</span></>}</span>
                  </span>
                </>
              );
              return accountHref
                ? <Link href={accountHref} className="flex items-center gap-3 rounded-2xl p-2.5 bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] transition-colors">{who}<span className="text-xs text-[var(--color-label-2)] shrink-0">Settings</span></Link>
                : <div className="flex items-center gap-3 rounded-2xl p-2.5 bg-[var(--color-fill)]">{who}</div>;
            })()}
            {foot.map(({ key, href, label, Icon }) => (
              <Link key={key} href={href} aria-current={isOn(path, href) ? "page" : undefined} className="flex items-center gap-3 h-12 px-3.5 rounded-2xl bg-[var(--color-fill)] text-[14px] font-semibold hover:bg-[var(--color-fill-2)] transition-colors" data-help={key === "help" ? "" : undefined} data-end={key}>
                <Icon size={17} /> {label}
                {key === "help" && unread > 0 && <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-bold text-[var(--color-red)]"><FlapMini value={unread} say={`${unread} new`} />new</span>}
              </Link>))}
            {attend && <Link href="/attendance" className="flex items-center gap-3 h-12 px-3.5 rounded-2xl bg-[var(--color-fill)] text-[14px] font-semibold hover:bg-[var(--color-fill-2)] transition-colors"><Fingerprint size={17} /> My attendance</Link>}
            {isAdmin && <Link href="/admin" className="flex items-center gap-3 h-12 px-3.5 rounded-2xl bg-[var(--color-fill)] text-[14px] font-semibold hover:bg-[var(--color-fill-2)] transition-colors"><ShieldCheck size={17} /> Master control</Link>}
            <form action="/logout" method="post">
              <button className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-[var(--color-red-2)] text-[var(--color-red)] text-[15px] font-semibold hover:brightness-110 transition"><LogOut size={17} /> Sign out</button>
            </form>
          </div>
        </div>
      </Sheet>
    </>
  );
}

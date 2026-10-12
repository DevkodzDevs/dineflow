import { HeartHandshake, Landmark, LayoutDashboard, ClipboardList, Flame, Receipt, UtensilsCrossed, Boxes, BarChart3, Users, Settings, BedDouble, ConciergeBell, Sparkles, Contact, Waves, ScanLine, FileText, HardHat, Bike, Radio, Sun, Users2, BadgeCheck, CalendarCheck, Activity, BrainCircuit, Wallet, ScrollText } from "lucide-react";
import type { Role } from "@dineflow/shared";

/**
 * Every section of the app, in menu order — one list for the sidebar, the phone's More sheet and
 * anything else that needs to know where things live. `key` is the module key that `modulesFor`
 * checks; `href` is the route.
 */
export const ITEMS = [
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
  { key: "customers", href: "/customers", label: "Customers", Icon: HeartHandshake },
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

/**
 * "Insights & control": the screens added in the 2026-10-11 upgrade — Intelligence, Cash & controls,
 * the Audit trail. They are not modules (no row in role_modules, no tick in Staff → Access); each page
 * checks the role on the server itself. The role list here only decides who sees the link.
 */
const FRESH = [
  { key: "intelligence", href: "/intelligence", label: "Intelligence", Icon: BrainCircuit, roles: ["owner", "manager", "supervisor"] },
  { key: "controls", href: "/controls", label: "Cash & controls", Icon: Wallet, roles: ["owner", "manager", "supervisor", "cashier"] },
  { key: "audit", href: "/audit", label: "Audit trail", Icon: ScrollText, roles: ["owner", "manager", "supervisor"] },
];
export const freshFor = (role: Role) => FRESH.filter((i) => i.roles.includes(role));

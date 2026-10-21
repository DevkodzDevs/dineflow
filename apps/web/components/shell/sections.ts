import { Armchair, HeartHandshake, Landmark, LayoutDashboard, ClipboardList, Flame, Receipt, UtensilsCrossed, Boxes, BarChart3, Users, Settings, BedDouble, ConciergeBell, Sparkles, Contact, Waves, ScanLine, FileText, HardHat, Bike, Radio, Sun, Users2, BadgeCheck, CalendarCheck, Activity, BrainCircuit, Wallet, ScrollText, IndianRupee, ListChecks, Store, HandCoins, SprayCan, ListTodo, ClipboardCheck, QrCode, Tv, MessagesSquare, UserRoundCog, LifeBuoy, type LucideIcon } from "lucide-react";
import { positionByKey, type Role } from "@dineflow/shared";

/** A menu row. `key` names it (React, the phone bar's pins); `mod` is the module whose tick opens it when that is
 *  not its own key — Join by QR is a Pulse screen, the Order board a Kitchen one. */
export type Section = { key: string; href: string; label: string; Icon: LucideIcon; mod?: string };

/**
 * Every section of the app, in menu order — one list for the sidebar, the phone's More sheet and
 * anything else that needs to know where things live. `key` is the module key that `modulesFor`
 * checks (or `mod`, for a screen inside another section's module); `href` is the route.
 */
export const ITEMS: Section[] = [
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
  // 2026-10-20: the door QR on a screen of its own, and the customer-facing board, each a menu row of its own
  { key: "pulse-qr", mod: "pulse", href: "/pulse/qr", label: "Join by QR", Icon: QrCode },
  { key: "orders", href: "/orders", label: "Orders", Icon: ClipboardList },
  { key: "online-orders", href: "/online-orders", label: "Online orders", Icon: Bike },
  { key: "customers", href: "/customers", label: "Customers", Icon: HeartHandshake },
  { key: "kitchen", href: "/kitchen", label: "Kitchen", Icon: Flame },
  { key: "order-board", mod: "kitchen", href: "/kitchen/board", label: "Order board", Icon: Tv },
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
  // 2026-10-21: every table and everything about one — a screen of the Orders module (last here: the phone bar fills
  // from this order, and its defaults must not move); the menu shows it first under Guests & tables
  { key: "tables", mod: "orders", href: "/tables", label: "Tables", Icon: Armchair },
];

/**
 * "Insights & control": the screens added in the 2026-10-11 upgrade — Intelligence, Cash & controls,
 * the Audit trail. They are not modules (no row in role_modules, no tick in Staff → Access); each page
 * checks the role on the server itself. The role list here only decides who sees the link.
 *
 * 2026-10-20 (the owner: "the internal controls follow the job — don't show unwanted control sections"): a link may
 * also name the teams (`depts`) it is for, and then only the owner, a manager, a supervisor with no team (who runs the
 * whole floor, as on Work) and the people of those teams see it (`anyDept`: a job that sees it whatever its team) —
 * Cleaning is for service, housekeeping and the front desk, not a chef, a guard, a gardener or a bellboy; the drawer (Cash & controls, Expenses) for the money teams, not a kitchen
 * or an engineering supervisor. Intelligence, the Audit trail and Outlets are the owner's and managers' now (they were
 * every supervisor's too). Each page asks `seesFresh` the same question on the server.
 */
type Fresh = Section & { roles: string[]; depts?: string[]; anyDept?: string[] };
const EVERYONE = ["owner", "manager", "supervisor", "supervisor_2", "employee", "cashier", "waiter", "chef", "store", "frontdesk", "housekeeping"];
/** The teams that run the drawer: the floor, the front office, accounts, and the management team itself. */
const MONEY = ["service", "front_office", "finance", "management"];
/** The teams that turn tables and rooms round after a guest — and the front desk (by job), who hands out the rooms
 *  checked out; not the rest of the front office (a bellboy, a driver). */
const CLEANERS = ["service", "housekeeping"];
const FRESH: Fresh[] = [
  { key: "intelligence", href: "/intelligence", label: "Intelligence", Icon: BrainCircuit, roles: ["owner", "manager"] },
  { key: "controls", href: "/controls", label: "Cash & controls", Icon: Wallet, roles: ["owner", "manager", "supervisor", "cashier"], depts: MONEY },
  { key: "audit", href: "/audit", label: "Audit trail", Icon: ScrollText, roles: ["owner", "manager"] },
  // 0106: every outlet at once (opening a second one starts here), and the month's pay
  { key: "chain", href: "/chain", label: "Outlets", Icon: Store, roles: ["owner", "manager"] },
  { key: "payroll", href: "/payroll", label: "Payroll", Icon: HandCoins, roles: ["owner", "manager"] },
  // 0105: what the business spends (the drawer roles of the money teams), and the day's duty lists (everyone)
  { key: "expenses", href: "/expenses", label: "Expenses", Icon: IndianRupee, roles: ["owner", "manager", "supervisor", "cashier"], depts: MONEY },
  { key: "tasks", href: "/tasks", label: "Checklists", Icon: ListChecks, roles: EVERYONE },
  // 0111: tables paid and left, rooms checked out — whoever cleans them, and whoever gives the jobs out
  { key: "cleaning", href: "/cleaning", label: "Cleaning", Icon: SprayCan, roles: ["owner", "manager", "supervisor", "supervisor_2", "employee", "cashier", "waiter", "frontdesk", "housekeeping"], depts: CLEANERS, anyDept: ["frontdesk"] },
  // 0113: every job on the property — a repair, a request, the grounds, a setup — routed to its department; everyone
  { key: "work", href: "/work", label: "Work", Icon: ListTodo, roles: EVERYONE },
  // 0116: the whole property's record of the work — who took what, from when to when — the owner's and managers' own menu
  { key: "work-records", href: "/work-records", label: "Work records", Icon: ClipboardCheck, roles: ["owner", "manager"] },
];
/** A person's team: the one set on their profile, else their position's, else their role's — the database's
 *  _my_dept() (0116) plus the position, so a cleaner whose profile carries no team still reads as Housekeeping. */
const ROLE_DEPT: Record<string, string> = { housekeeping: "housekeeping", waiter: "service", cashier: "service", chef: "kitchen", frontdesk: "front_office", store: "stores" };
export const deptOf = (role: string, department?: string | null, position?: string | null): string | null =>
  department || positionByKey(position)?.dept || ROLE_DEPT[role] || null;
const sees = (i: Fresh, role: string, dept: string | null) =>
  i.roles.includes(role) && (!i.depts || role === "owner" || role === "manager" || !!i.anyDept?.includes(role) || (dept ? i.depts.includes(dept) : role === "supervisor" || role === "supervisor_2"));
/** The "Insights & control" links this person sees — by their role, and for the team-bound ones by their team. */
export const freshFor = (role: Role, dept: string | null = null) => FRESH.filter((i) => sees(i, role, dept));
/** May this person open that screen? The page's own guard — the same answer as the link. */
export const seesFresh = (key: string, role: string, dept: string | null) => { const i = FRESH.find((x) => x.key === key); return !!i && sees(i, role, dept); };

/**
 * The menu's last group (2026-10-20). Help & support — talking to DineFlow — is the owner's alone; everyone else has
 * **Feedback & complaints** (`/voice`), where staff tell the owner what is wrong or what could be better and see the
 * owner's answer; the owner reads the same screen as **Staff feedback**. **`/me`** is a person's own profile settings:
 * "Settings" for anyone who cannot open the property's Settings, "My profile" for the owner, beside Settings.
 */
const END: Section[] = [
  { key: "me", href: "/me", label: "Settings", Icon: UserRoundCog },
  { key: "voice", href: "/voice", label: "Feedback & complaints", Icon: MessagesSquare },
  { key: "help", href: "/help", label: "Help & support", Icon: LifeBuoy },
];
export const endFor = (role: Role): Section[] => role === "owner"
  ? [{ ...END[0], label: "My profile" }, { ...END[1], label: "Staff feedback" }, END[2]]
  : [END[0], END[1]];

/**
 * **My day** (`/home`, 2026-10-20 — the owner: "when a staff member signs in they go straight to their own dashboard"):
 * everyone but the owner and a manager lands there and finds it first in the menu and first on the phone's bar. It is
 * no module — every signed-in person may open it (the layout's ROUTE_MODULE does not list it).
 */
const MY_DAY: Section = { key: "home", href: "/home", label: "My day", Icon: Sun };
export const myDayFor = (role: Role): Section | null => (role === "owner" || role === "manager" ? null : MY_DAY);

/**
 * The menu's groups and their headings (2026-10-21, the owner: "rearrange every menu under a heading that suits it").
 * One list for the sidebar and the phone's More sheet; each group lists its rows in the order shown. "Dining" had held
 * eleven unrelated rows (tables, kitchen, money, the menu), "Manage" and "Insights & control" a mix of money, people and
 * reports. A row lands where its job is; who sees it does not change (`modulesFor` and `freshFor` still decide). The
 * first group has no heading (the day at a glance); Settings and the person's own rows stay the last group (`endFor`).
 * `ITEMS`' own order is untouched — the phone bar fills from it.
 */
const MENU_GROUPS: { title: string | null; keys: string[] }[] = [
  { title: null, keys: ["dashboard", "tomorrow", "scan"] },
  { title: "Rooms & stays", keys: ["frontdesk", "rooms", "housekeeping", "guests", "facilities"] },
  { title: "Guests & tables", keys: ["tables", "reservations", "pulse", "pulse-qr", "customers"] },
  { title: "Orders & kitchen", keys: ["orders", "online-orders", "kitchen", "order-board", "billing"] },
  { title: "Menu & stock", keys: ["menu", "inventory"] },
  { title: "Team & work", keys: ["staff", "tasks", "cleaning", "work", "work-records", "labour", "payroll"] },
  { title: "Money", keys: ["invoices", "expenses", "controls", "tax"] },
  { title: "Reports & insights", keys: ["reports", "intelligence", "audit"] },
  { title: "Business & growth", keys: ["chain", "channels", "proof", "neighbours"] },
];
/** The rows this person may open, under their headings: `rows` is everything they hold (modules and "fresh" links,
 *  Settings left to the last group). A row no group names still shows, in a last "More" group, so a new section is
 *  never lost from the menu. Empty groups are left out. */
export const menuGroups = (rows: Section[], lead: Section[] = []): { title: string | null; items: Section[] }[] => {
  const byKey = new Map(rows.filter((r) => r.key !== "settings").map((r) => [r.key, r]));
  const placed = new Set<string>();
  const out = MENU_GROUPS.map((g) => ({ title: g.title, items: g.keys.flatMap((k) => { const r = byKey.get(k); if (!r) return []; placed.add(k); return [r]; }) }));
  out[0].items = [...lead, ...out[0].items];
  const loose = [...byKey.values()].filter((r) => !placed.has(r.key));
  if (loose.length) out.push({ title: "More", items: loose });
  return out.filter((g) => g.items.length);
};

/** The module a section's link needs: its own key, or the section it lives inside. */
export const modOf = (s: Section) => s.mod ?? s.key;

const HREFS = [...ITEMS, ...FRESH, ...END, MY_DAY].map((i) => i.href);
const under = (path: string, href: string) => path === href || path.startsWith(href + "/");
/**
 * Is this row the screen you are on? A row owns its path and everything under it — except a deeper row's own:
 * on /kitchen/board the Order board is lit, not Kitchen too; on /work-records, Work records and not Work (a bare
 * `startsWith` lit both).
 */
export const isOn = (path: string, href: string) => under(path, href) && !HREFS.some((h) => h !== href && h.startsWith(href + "/") && under(path, h));

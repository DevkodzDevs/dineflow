export const ROLES = ["owner", "manager", "supervisor", "supervisor_2", "employee", "cashier", "waiter", "chef", "store", "frontdesk", "housekeeping"] as const;
export type Role = (typeof ROLES)[number];

/**
 * The ladder. Someone may only manage — and only hand out — a rank strictly below their own, so a
 * supervisor runs the second-level supervisors and employees under them and can never touch a peer,
 * a manager or the owner. An owner is exempt from the strictly-below rule so one owner can hand the
 * property to another. Mirrors role_rank() in migration 0058, which is what actually enforces it.
 */
export const ROLE_RANK: Record<Role, number> = {
  owner: 100, manager: 80, supervisor: 60, supervisor_2: 40,
  employee: 20, cashier: 20, waiter: 20, chef: 20, store: 20, frontdesk: 20, housekeeping: 20,
};
/** Can this role manage anyone at all, and open the Staff screen to do it? */
export const canManagePeople = (role: Role) => ROLE_RANK[role] >= ROLE_RANK.supervisor_2;
/** The roles `me` is allowed to appoint someone to. */
export const rolesIMayAssign = (me: Role): Role[] =>
  ROLES.filter((r) => (me === "owner" ? true : ROLE_RANK[r] < ROLE_RANK[me]));
/** May `me` change this person's access at all? */
export const canManage = (me: Role, target: Role) => canManagePeople(me) && (me === "owner" || ROLE_RANK[target] < ROLE_RANK[me]);

export const PROPERTY_TYPES = ["restaurant", "hotel", "resort"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export const PROPERTY_LABEL: Record<PropertyType, string> = { restaurant: "Restaurant", hotel: "Hotel", resort: "Resort" };

export const MEMBERSHIP = ["trial", "active", "expired", "suspended"] as const;
export type Membership = (typeof MEMBERSHIP)[number];
export const TRIAL_DAYS = 7;

export const ORDER_TYPES = ["dine_in", "takeaway", "delivery", "room_service"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_STATUS = ["open", "billed", "cancelled"] as const;
export const ITEM_STATUS = ["pending", "preparing", "ready", "served", "cancelled"] as const;
export type ItemStatus = (typeof ITEM_STATUS)[number];
export const KOT_STATUS = ["pending", "preparing", "ready", "served"] as const;
export type KotStatus = (typeof KOT_STATUS)[number];

export const TABLE_STATUS = ["free", "occupied", "reserved"] as const;
export const ROOM_STATUS = ["available", "occupied", "reserved", "cleaning", "maintenance"] as const;
export type RoomStatus = (typeof ROOM_STATUS)[number];
export const BOOKING_STATUS = ["reserved", "checked_in", "checked_out", "cancelled", "no_show"] as const;
export const UNITS = ["kg", "g", "l", "ml", "pcs"] as const;
export const LEDGER_REASONS = ["opening", "purchase", "sale", "wastage", "adjustment"] as const;
export const PAYMENT_METHODS = ["cash", "upi", "card", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Modules each property type gets. Restaurant modules are always present (hotels have dining). */
export const MODULES_BY_TYPE: Record<PropertyType, string[]> = {
  restaurant: ["dashboard", "tomorrow", "scan", "reservations", "pulse", "orders", "online-orders", "kitchen", "billing", "invoices", "menu", "inventory", "labour", "proof", "neighbours", "channels", "reports", "tax", "staff", "settings"],
  hotel: ["dashboard", "tomorrow", "scan", "frontdesk", "rooms", "housekeeping", "guests", "reservations", "pulse", "orders", "online-orders", "kitchen", "billing", "invoices", "menu", "inventory", "labour", "proof", "neighbours", "channels", "reports", "tax", "staff", "settings"],
  resort: ["dashboard", "tomorrow", "scan", "frontdesk", "rooms", "housekeeping", "guests", "facilities", "reservations", "pulse", "orders", "online-orders", "kitchen", "billing", "invoices", "menu", "inventory", "labour", "proof", "neighbours", "channels", "reports", "tax", "staff", "settings"],
};

/**
 * The most each role may ever be given — the ceiling a tick list cannot pass. The three supervisory
 * ranks have a wide ceiling on purpose: their sections are chosen by whoever appoints them, not fixed
 * by the job title, which is the point of the ladder. Mirrors role_modules.ceiling in migration 0058.
 */
export const ROLE_ACCESS: Record<Role, string[]> = {
  owner: MODULES_BY_TYPE.resort,
  manager: MODULES_BY_TYPE.resort.filter((m) => m !== "settings"),
  supervisor: MODULES_BY_TYPE.resort.filter((m) => m !== "settings"),
  supervisor_2: MODULES_BY_TYPE.resort.filter((m) => !["settings", "tax", "channels"].includes(m)),
  employee: MODULES_BY_TYPE.resort.filter((m) => !["settings", "staff", "tax", "reports", "proof", "neighbours", "channels"].includes(m)),
  // every role keeps "dashboard": it is where the app puts you when you sign in and where it sends
  // you off a section you cannot open, so a role without it has nowhere to land. This list and
  // role_modules.ceiling in migration 0058 must agree — they drifted once and a housekeeper signing
  // in was redirected to a dashboard they did not have, then redirected again, forever.
  cashier: ["dashboard", "scan", "reservations", "pulse", "orders", "online-orders", "billing", "invoices", "reports", "frontdesk"],
  waiter: ["dashboard", "scan", "orders", "reservations", "pulse"],
  chef: ["dashboard", "scan", "kitchen", "menu", "online-orders", "tomorrow"],
  store: ["dashboard", "scan", "inventory", "labour", "tomorrow", "neighbours"],
  frontdesk: ["dashboard", "scan", "frontdesk", "rooms", "guests", "facilities", "housekeeping", "reservations", "invoices", "labour", "channels"],
  housekeeping: ["dashboard", "scan", "housekeeping", "rooms"],
};

/**
 * What a role holds until someone ticks a narrower set. For the job roles this is simply their
 * ceiling — a waiter is a waiter. For the supervisory ranks it is a modest starting point, so an
 * unconfigured supervisor is not silently handed the till and the books. Mirrors role_modules.default_set.
 */
export const ROLE_DEFAULT: Record<Role, string[]> = {
  ...({} as Record<Role, string[]>),
  owner: ROLE_ACCESS.owner,
  manager: ROLE_ACCESS.manager,
  supervisor: ["dashboard", "scan", "orders", "kitchen", "billing", "pulse", "reservations", "inventory", "staff", "reports"],
  supervisor_2: ["dashboard", "scan", "orders", "kitchen", "pulse", "reservations", "staff"],
  employee: ["dashboard", "scan", "orders", "pulse"],
  cashier: ROLE_ACCESS.cashier,
  waiter: ROLE_ACCESS.waiter,
  chef: ROLE_ACCESS.chef,
  store: ROLE_ACCESS.store,
  frontdesk: ROLE_ACCESS.frontdesk,
  housekeeping: ROLE_ACCESS.housekeeping,
};

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner", manager: "Manager", supervisor: "Supervisor", supervisor_2: "Supervisor (2nd level)", employee: "Employee",
  cashier: "Cashier", waiter: "Waiter", chef: "Chef", store: "Store keeper", frontdesk: "Front desk", housekeeping: "Housekeeping",
};
/** A line of help under each role in the Staff screen, so the ladder explains itself. */
export const ROLE_HINT: Record<Role, string> = {
  owner: "The property is theirs. Every section, including Settings.",
  manager: "Runs the place day to day. Everything except Settings.",
  supervisor: "Runs a shift or a department, and the team under it.",
  supervisor_2: "Runs a team inside a department. Manages employees only.",
  employee: "Does the work. Manages nobody.",
  cashier: "Till, bills and invoices.", waiter: "Takes orders on the floor.", chef: "The kitchen screen and the menu.",
  store: "Pantry, stock and labour.", frontdesk: "Arrivals, rooms and guests.", housekeeping: "Room turnaround.",
};

/** Modules the master may switch off per property. The rest are always on: an owner must always be able to land somewhere and reach settings. */
export const ALWAYS_ON = ["dashboard", "settings"] as const;

/** Plan presets — a quick way to set which modules a property gets. */
export type PlanPreset = "basic" | "premium" | "advanced" | "all";
export const PLAN_PRESETS: { key: PlanPreset; label: string; hint: string; modules: string[] }[] = [
  { key: "basic", label: "Basic", hint: "Orders, billing, menu, kitchen and reports",
    modules: ["orders", "billing", "menu", "kitchen", "reports", "scan", "inventory"] },
  { key: "premium", label: "Premium", hint: "Basic + reservations, online orders, invoices, tax, staff",
    modules: ["orders", "billing", "menu", "kitchen", "reports", "scan", "inventory",
              "reservations", "pulse", "online-orders", "channels", "invoices", "tax", "staff", "labour", "tomorrow"] },
  { key: "advanced", label: "Advanced", hint: "Everything the property type supports",
    modules: [] }, // empty means all — resolved at runtime from MODULES_BY_TYPE
  { key: "all", label: "All", hint: "Every module, no restrictions",
    modules: [] },
];

/** Property type filter for the access sheet. */
export const PROPERTY_FILTERS = [
  { key: "all", label: "All" },
  { key: "restaurant", label: "Restaurant" },
  { key: "hotel", label: "Hotel" },
  { key: "resort", label: "Resort" },
] as const;
export const MODULE_GROUPS: { title: string; keys: { key: string; label: string; hint: string }[] }[] = [
  { title: "Front of house", keys: [{ key: "orders", label: "Orders & tables", hint: "Take orders, the floor" }, { key: "reservations", label: "Reservations", hint: "Bookings from the storefront" }, { key: "pulse", label: "Pulse", hint: "Wait times and the walk-in queue" }, { key: "online-orders", label: "Online orders", hint: "Delivery and takeaway" }, { key: "channels", label: "Channels", hint: "Swiggy, Zomato, OTAs" }] },
  { title: "Hotel", keys: [{ key: "frontdesk", label: "Front desk", hint: "Check-in, folios" }, { key: "rooms", label: "Rooms", hint: "The board and keys" }, { key: "housekeeping", label: "Housekeeping", hint: "Turnaround" }, { key: "guests", label: "Guests", hint: "Guest records" }, { key: "facilities", label: "Facilities", hint: "Spa, pool, hall" }] },
  { title: "Kitchen & stock", keys: [{ key: "kitchen", label: "Kitchen", hint: "Tickets" }, { key: "menu", label: "Menu", hint: "Dishes and recipes" }, { key: "inventory", label: "Pantry", hint: "Stock, counts, leaks" }, { key: "scan", label: "Scan", hint: "Barcodes and photos" }, { key: "tomorrow", label: "Tomorrow", hint: "The brief" }] },
  { title: "Money", keys: [{ key: "billing", label: "Billing", hint: "Bills, payments, shift close" }, { key: "invoices", label: "Invoices", hint: "GST invoices" }, { key: "reports", label: "Reports", hint: "Sales and costs" }, { key: "tax", label: "Tax & GST", hint: "Returns, audit, documents" }, { key: "proof", label: "Proof of business", hint: "Sealed months, share links" }] },
  { title: "People & network", keys: [{ key: "labour", label: "Labour", hint: "Attendance, wages" }, { key: "staff", label: "Staff", hint: "Logins and roles" }, { key: "neighbours", label: "Neighbours", hint: "The district network" }] },
];
/**
 * What this person can open here: the property type's modules ∩ the role's modules ∩ what the master
 * switched on. `enabled` = null means the master hasn't restricted anything.
 */
/**
 * What one person can actually open: the property type ∩ the role's ceiling ∩ the master's set for
 * the property ∩ the ticks whoever appointed them left. With no ticks the role's default applies —
 * which for a supervisor is deliberately narrower than their ceiling, so an unconfigured one starts
 * modest and is widened on purpose rather than by omission. Mirrors effective_modules() in 0058.
 */
export const modulesFor = (type: PropertyType, role: Role, enabled?: string[] | null, allowed?: string[] | null) => {
  const granted = allowed ?? ROLE_DEFAULT[role];
  return MODULES_BY_TYPE[type].filter((m) =>
    ROLE_ACCESS[role].includes(m)
    && (!enabled || enabled.includes(m) || (ALWAYS_ON as readonly string[]).includes(m))          // the master's set for the property
    && (role === "owner" || granted.includes(m) || m === "dashboard"));                           // the ticks left for this person
};

export const INGREDIENT_CATEGORIES = ["vegetable", "fruit", "grocery", "dairy", "meat", "seafood", "beverage", "packaged", "cleaning", "other"] as const;
export const LABOUR_SKILLS = ["cook helper", "cleaner", "housekeeping", "gardener", "security", "driver", "porter", "electrician", "plumber", "other"] as const;
/** Quick-pick quantities when a scan recognises a loose product (vegetables, grains…). */
export const QUICK_QTY: Record<string, { label: string; qty: number }[]> = {
  kg: [{ label: "100 g", qty: 0.1 }, { label: "200 g", qty: 0.2 }, { label: "250 g", qty: 0.25 }, { label: "½ kg", qty: 0.5 }, { label: "1 kg", qty: 1 }, { label: "2 kg", qty: 2 }, { label: "5 kg", qty: 5 }],
  l: [{ label: "250 ml", qty: 0.25 }, { label: "½ l", qty: 0.5 }, { label: "1 l", qty: 1 }, { label: "5 l", qty: 5 }],
  pcs: [{ label: "1", qty: 1 }, { label: "6", qty: 6 }, { label: "12", qty: 12 }, { label: "1 bunch", qty: 1 }, { label: "1 crate", qty: 24 }],
  g: [{ label: "50 g", qty: 50 }, { label: "100 g", qty: 100 }, { label: "200 g", qty: 200 }, { label: "500 g", qty: 500 }],
  ml: [{ label: "100 ml", qty: 100 }, { label: "250 ml", qty: 250 }, { label: "500 ml", qty: 500 }],
};

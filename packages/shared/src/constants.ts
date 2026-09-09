export const ROLES = ["owner", "manager", "cashier", "waiter", "chef", "store", "frontdesk", "housekeeping"] as const;
export type Role = (typeof ROLES)[number];

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
  restaurant: ["dashboard", "tomorrow", "scan", "reservations", "pulse", "orders", "online-orders", "kitchen", "billing", "invoices", "menu", "inventory", "labour", "proof", "neighbours", "channels", "reports", "staff", "settings"],
  hotel: ["dashboard", "tomorrow", "scan", "frontdesk", "rooms", "housekeeping", "guests", "reservations", "pulse", "orders", "online-orders", "kitchen", "billing", "invoices", "menu", "inventory", "labour", "proof", "neighbours", "channels", "reports", "staff", "settings"],
  resort: ["dashboard", "tomorrow", "scan", "frontdesk", "rooms", "housekeeping", "guests", "facilities", "reservations", "pulse", "orders", "online-orders", "kitchen", "billing", "invoices", "menu", "inventory", "labour", "proof", "neighbours", "channels", "reports", "staff", "settings"],
};

/** What each role may open. Intersected with MODULES_BY_TYPE at runtime. */
export const ROLE_ACCESS: Record<Role, string[]> = {
  owner: MODULES_BY_TYPE.resort,
  manager: MODULES_BY_TYPE.resort.filter((m) => m !== "settings"),
  cashier: ["scan", "reservations", "pulse", "pulse", "orders", "online-orders", "billing", "invoices", "reports", "frontdesk"],
  waiter: ["scan", "orders", "reservations", "pulse"],
  chef: ["scan", "kitchen", "menu", "online-orders", "tomorrow"],
  store: ["scan", "inventory", "labour", "tomorrow", "neighbours"],
  frontdesk: ["scan", "frontdesk", "rooms", "guests", "facilities", "housekeeping", "reservations", "invoices", "labour", "channels"],
  housekeeping: ["scan", "housekeeping", "rooms"],
};

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner", manager: "Manager", cashier: "Cashier", waiter: "Waiter", chef: "Chef", store: "Store keeper", frontdesk: "Front desk", housekeeping: "Housekeeping",
};

/** Modules the master may switch off per property. The rest are always on: an owner must always be able to land somewhere and reach settings. */
export const ALWAYS_ON = ["dashboard", "settings"] as const;
export const MODULE_GROUPS: { title: string; keys: { key: string; label: string; hint: string }[] }[] = [
  { title: "Front of house", keys: [{ key: "orders", label: "Orders & tables", hint: "Take orders, the floor" }, { key: "reservations", label: "Reservations", hint: "Bookings from the storefront" }, { key: "pulse", label: "Pulse", hint: "Wait times and the walk-in queue" }, { key: "online-orders", label: "Online orders", hint: "Delivery and takeaway" }, { key: "channels", label: "Channels", hint: "Swiggy, Zomato, OTAs" }] },
  { title: "Hotel", keys: [{ key: "frontdesk", label: "Front desk", hint: "Check-in, folios" }, { key: "rooms", label: "Rooms", hint: "The board and keys" }, { key: "housekeeping", label: "Housekeeping", hint: "Turnaround" }, { key: "guests", label: "Guests", hint: "Guest records" }, { key: "facilities", label: "Facilities", hint: "Spa, pool, hall" }] },
  { title: "Kitchen & stock", keys: [{ key: "kitchen", label: "Kitchen", hint: "Tickets" }, { key: "menu", label: "Menu", hint: "Dishes and recipes" }, { key: "inventory", label: "Pantry", hint: "Stock, counts, leaks" }, { key: "scan", label: "Scan", hint: "Barcodes and photos" }, { key: "tomorrow", label: "Tomorrow", hint: "The brief" }] },
  { title: "Money", keys: [{ key: "billing", label: "Billing", hint: "Bills, payments, shift close" }, { key: "invoices", label: "Invoices", hint: "GST invoices" }, { key: "reports", label: "Reports", hint: "Sales and costs" }, { key: "proof", label: "Proof of business", hint: "Sealed months, share links" }] },
  { title: "People & network", keys: [{ key: "labour", label: "Labour", hint: "Attendance, wages" }, { key: "staff", label: "Staff", hint: "Logins and roles" }, { key: "neighbours", label: "Neighbours", hint: "The district network" }] },
];
/**
 * What this person can open here: the property type's modules ∩ the role's modules ∩ what the master
 * switched on. `enabled` = null means the master hasn't restricted anything.
 */
export const modulesFor = (type: PropertyType, role: Role, enabled?: string[] | null, allowed?: string[] | null) =>
  MODULES_BY_TYPE[type].filter((m) =>
    ROLE_ACCESS[role].includes(m)
    && (!enabled || enabled.includes(m) || (ALWAYS_ON as readonly string[]).includes(m))          // the master's set for the property
    && (role === "owner" || !allowed || allowed.includes(m) || m === "dashboard"));              // the owner's ticks for this person

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

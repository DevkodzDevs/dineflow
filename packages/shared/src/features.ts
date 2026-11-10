import type { PropertyType } from "./constants";

/**
 * Add-ons (0175, 2026-11-09 — the owner: "everything you called unwanted: make each one an option, switched in Master control,
 * per property, set by the subscription").
 *
 * A module (constants.ts, MODULES_BY_TYPE) is a whole screen with a row in the menu and a tick in Staff → Access. An add-on is
 * finer: a screen that was never a module (Intelligence, Cash & controls, the Audit trail, Outlets, Payroll…), a piece inside a
 * screen (the till's spoken order, the "Goes well with" rail, the on-time promise, the receipt's extras), or a paid thing
 * (the AI, a white-label receipt). Each has a key here; Master control switches them per plan and per property.
 *
 * Who decides, in order (featuresFor):
 *   1. the property's own list  — restaurants.enabled_features (Master control → Access → Add-ons, "Custom")
 *   2. else the plan's list      — plans.features (Master control → Keys → Plans & prices → Included add-ons)
 *   3. else the defaults below   — `on: true`
 * and an add-on marked for some property kinds only (`types`) is never on for the others.
 *
 * The database says the same: default_features(), effective_features(rid) and has_feature(key) in migration 0175 (0177 re-creates default_features with 'whatsapp'). **The list
 * of `on: true` keys here and default_features() there must agree** — features.test.ts reads the migration and checks.
 *
 * A saved list is explicit: an add-on added here later is off for a plan or property that already saved a list until the
 * master ticks it (the Access sheet shows it as off). NULL — "follow the plan" / "the defaults" — picks new ones up.
 */
export type Feature = {
  key: string;
  label: string;
  hint: string;
  /** the heading it sits under in Master control */
  group: string;
  /** a whole screen (a menu row the layout gates), or a piece inside one */
  kind: "screen" | "feature";
  /** on by default — for a plan with no saved list, and a property that follows its plan */
  on: boolean;
  /** only these kinds of property have it (default: all) */
  types?: PropertyType[];
  /** handles personal data — Master control says so beside the switch */
  sensitive?: boolean;
};

export const FEATURE_GROUPS = ["Insight screens", "Team screens", "Floor screens", "Hotel screens", "Till & paper", "AI & scanning", "Channels"] as const;

export const FEATURES: Feature[] = [
  // ── screens that were never modules ──────────────────────────────────────────────────────────────────────────────
  { key: "intelligence", label: "Intelligence", hint: "Menu engineering, exceptions, the owner's briefing", group: "Insight screens", kind: "screen", on: true },
  { key: "controls", label: "Cash & controls", hint: "The drawer, cash in and out, voids and cancellations", group: "Insight screens", kind: "screen", on: true },
  { key: "audit", label: "Audit trail", hint: "Every change, who and when", group: "Insight screens", kind: "screen", on: true },
  { key: "chain", label: "Outlets", hint: "Several outlets as one business", group: "Team screens", kind: "screen", on: true },
  { key: "payroll", label: "Payroll", hint: "The month's pay, PF and ESI", group: "Team screens", kind: "screen", on: true },
  { key: "expenses", label: "Expenses", hint: "What the business spends", group: "Team screens", kind: "screen", on: true },
  { key: "tasks", label: "Checklists", hint: "The day's duty lists", group: "Team screens", kind: "screen", on: true },
  { key: "work-records", label: "Work records", hint: "Who took which job, from when to when", group: "Team screens", kind: "screen", on: true },
  { key: "voice", label: "Staff feedback", hint: "Feedback & complaints, staff to their owner", group: "Team screens", kind: "screen", on: true },
  { key: "cleaning", label: "Cleaning board", hint: "Tables and rooms after every guest. Off, the jobs stay on Work", group: "Floor screens", kind: "screen", on: true },
  { key: "tables", label: "Tables screen", hint: "Every table in detail. Orders keeps its own Tables view", group: "Floor screens", kind: "screen", on: true },
  { key: "lock", label: "Display lock", hint: "Pin a device to one page", group: "Floor screens", kind: "screen", on: true },
  { key: "connections", label: "Connections", hint: "Every outside link on one page. Channels has the same cards", group: "Channels", kind: "screen", on: true },
  { key: "night-audit", label: "Night audit", hint: "The rooms side's daily close", group: "Hotel screens", kind: "screen", on: true, types: ["hotel", "resort"] },
  // ── pieces inside a screen ────────────────────────────────────────────────────────────────────────────────────────
  { key: "promise", label: "On-time promise", hint: "A fee the guest chooses; the food is free if late. On the till, the bill and the invoice", group: "Till & paper", kind: "feature", on: true },
  { key: "till-pairings", label: "Goes well with", hint: "Dishes this property's guests order together, suggested at the till", group: "Till & paper", kind: "feature", on: true },
  { key: "receipt-extras", label: "Receipt extras", hint: "The amount in words, a barcode and the 'goods once sold' line", group: "Till & paper", kind: "feature", on: true },
  { key: "white-label", label: "White label", hint: "No 'Powered by DineFlow' on the receipt", group: "Till & paper", kind: "feature", on: false },
  { key: "ai", label: "AI help", hint: "Assist and every AI suggestion. Needs the server's key; costs per call", group: "AI & scanning", kind: "feature", on: true },
  { key: "till-voice", label: "Say the order", hint: "Speak or type an order at the till; the AI fills the ticket", group: "AI & scanning", kind: "feature", on: true },
  { key: "scan-vision", label: "Photo recognition", hint: "Scan a vegetable, a pack, a dish or a room number from a photo", group: "AI & scanning", kind: "feature", on: true },
  { key: "scan-id", label: "ID card reading", hint: "Read a labourer's name, phone and address off an Aadhaar or voter ID photo", group: "AI & scanning", kind: "feature", on: false, sensitive: true },
  { key: "ota-push", label: "Push rates & menu", hint: "Push buttons and API fields for partner connections that are not built yet", group: "Channels", kind: "feature", on: false },
  { key: "whatsapp", label: "WhatsApp messages", hint: "Confirmations, e-bills, the day close and alerts through the Business API", group: "Channels", kind: "feature", on: true },
];

export const FEATURE_KEYS: string[] = FEATURES.map((f) => f.key);
/** What a plan with no saved list, and a property that follows its plan, has on. */
export const DEFAULT_FEATURES: string[] = FEATURES.filter((f) => f.on).map((f) => f.key);
/** The add-ons this kind of property can have at all. */
export const featuresForType = (type: PropertyType): Feature[] => FEATURES.filter((f) => !f.types || f.types.includes(type));
export const featureByKey = (key: string): Feature | null => FEATURES.find((f) => f.key === key) ?? null;

/**
 * What one property has on: its own list, else its plan's, else the defaults — never an add-on its kind of property
 * cannot have, never a key this build does not know.
 */
export function featuresFor(type: PropertyType, enabled?: string[] | null, plan?: string[] | null): string[] {
  const chosen = enabled ?? plan ?? DEFAULT_FEATURES;
  return featuresForType(type).filter((f) => chosen.includes(f.key)).map((f) => f.key);
}
/** Does the list hold the add-on? `features` undefined means "nothing is switched off" (a caller with no property). */
export const hasFeature = (features: readonly string[] | null | undefined, key: string): boolean => !features || features.includes(key);

/** A screen add-on's key is the menu row's key; a route's first segment(s) → the add-on that gates it. */
export const FEATURE_ROUTES: Record<string, string> = {
  intelligence: "intelligence", controls: "controls", audit: "audit", chain: "chain", payroll: "payroll", expenses: "expenses",
  tasks: "tasks", "work-records": "work-records", voice: "voice", cleaning: "cleaning", tables: "tables", lock: "lock",
  connections: "connections", "frontdesk/night-audit": "night-audit",
};
/** The add-on a path needs, if any: the longest listed prefix wins ("/frontdesk/night-audit" before "/frontdesk"). */
export function featureForPath(path: string): string | null {
  const segs = path.replace(/^\/+/, "").split("/").filter(Boolean);
  for (let n = Math.min(2, segs.length); n >= 1; n--) { const k = FEATURE_ROUTES[segs.slice(0, n).join("/")]; if (k) return k; }
  return null;
}

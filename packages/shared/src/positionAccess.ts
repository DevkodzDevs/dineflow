/**
 * What each job position opens — job-based defaults, the way Toast ("each job carries a default permission set …
 * individual overrides"), Cloudbeds (suggested privileges by role) and Petpooja (a biller takes orders and settles
 * bills; a manager handles cancellations and large discounts) set staff up. Everyone given a position starts with its
 * sections; a person can still be given more or less, which the Staff screen shows as "custom".
 *
 * Each list stays inside its position's suggested role's ceiling (ROLE_ACCESS — a test checks), so the database never
 * has to trim it. `null` = the role's own default (owners and managers: everything they may have). `home` = the screen
 * they start on after signing in. The control room (dashboard) is always open and is never listed.
 *
 * 2026-10-20 (the owner: "each job sees only the sections it needs"): the floor and back-of-house jobs lost Scan (it is
 * the stock-receiving camera — the store, the kitchen leads and the managers keep it), the gardener lost Housekeeping, and
 * the guard, the cleaner, the kitchen steward and the maintenance helper hold no module at all: Work and Checklists (open
 * to everyone) are their day. 0126 moved everyone still on an untouched position list to the narrower one.
 *
 * 2026-10-30 (the owner: "rename Housekeeping, and show it only to the owner, managers and supervisors"): Room status
 * (the module key stays `housekeeping`) is gone from every staff-level list — the attendants, the trainee, the night
 * auditor, the engineering trades. They turn rooms round on the Cleaning and Work boards; the role ceilings (constants.ts,
 * 0157) took it off too.
 */
import type { PropertyType } from "./constants";

export type PositionAccess = { open: string[] | null; home?: string };
/** Screens everyone signed in may open, so a position can start on one without listing it (0111: the Cleaning board). */
export const OPEN_HOMES = ["cleaning", "work"];
const FO = ["frontdesk", "rooms", "guests"];
const MGR_FNB = ["orders", "reservations", "pulse", "online-orders", "customers", "kitchen", "billing", "invoices", "menu", "inventory", "reports", "staff", "labour", "channels", "tomorrow", "scan"];

export const POSITION_ACCESS: Record<string, PositionAccess> = {
  // management — everything their role allows
  owner_md: { open: null }, general_manager: { open: null }, resident_manager: { open: null }, resort_manager: { open: null }, operations_manager: { open: null },
  executive_assistant: { open: ["reservations", "frontdesk", "guests", "customers", "tomorrow"] },
  // front office
  front_office_manager: { open: [...FO, "reservations", "housekeeping", "channels", "invoices", "customers", "facilities", "reports", "staff", "labour", "pulse", "tomorrow", "scan"], home: "frontdesk" },
  asst_front_office_manager: { open: [...FO, "reservations", "housekeeping", "channels", "invoices", "customers", "facilities", "reports", "staff", "scan"], home: "frontdesk" },
  duty_manager: { open: [...FO, "reservations", "housekeeping", "invoices", "customers", "facilities", "orders", "billing", "pulse", "reports", "scan"], home: "frontdesk" },
  front_desk_supervisor: { open: [...FO, "reservations", "housekeeping", "invoices", "customers", "staff", "scan"], home: "frontdesk" },
  guest_relations_manager: { open: [...FO, "customers", "reservations", "facilities"], home: "guests" },
  gre: { open: ["guests", "customers", "frontdesk", "reservations", "facilities"], home: "guests" },
  reservations_executive: { open: [...FO, "reservations", "channels", "customers"], home: "frontdesk" },
  concierge: { open: ["frontdesk", "guests", "facilities", "reservations"], home: "guests" },
  bell_captain: { open: ["rooms", "guests"], home: "rooms" },
  front_office_associate: { open: [...FO, "reservations", "invoices", "customers"], home: "frontdesk" },
  night_auditor: { open: [...FO, "invoices", "channels"], home: "frontdesk" },
  telephone_operator: { open: ["frontdesk", "guests", "reservations"], home: "frontdesk" },
  bellboy: { open: ["rooms"], home: "rooms" },
  driver: { open: ["guests"], home: "work" },
  front_office_trainee: { open: FO, home: "frontdesk" },
  // housekeeping
  executive_housekeeper: { open: ["housekeeping", "rooms", "inventory", "labour", "staff", "reports", "tomorrow", "scan"], home: "housekeeping" },
  asst_housekeeper: { open: ["housekeeping", "rooms", "inventory", "labour", "staff", "scan"], home: "housekeeping" },
  floor_supervisor: { open: ["housekeeping", "rooms", "staff", "scan"], home: "housekeeping" },
  laundry_supervisor: { open: ["housekeeping", "inventory", "scan"], home: "housekeeping" },
  room_attendant: { open: ["rooms"], home: "cleaning" },
  public_area_attendant: { open: [], home: "cleaning" },
  laundry_attendant: { open: [], home: "cleaning" },
  cleaner: { open: [], home: "cleaning" },
  housekeeping_trainee: { open: ["rooms"], home: "cleaning" },
  // restaurant & bar service
  fnb_manager: { open: MGR_FNB },
  restaurant_manager: { open: MGR_FNB },
  asst_restaurant_manager: { open: ["orders", "reservations", "pulse", "online-orders", "customers", "kitchen", "billing", "menu", "reports", "staff", "tomorrow", "scan"], home: "orders" },
  bar_manager: { open: ["orders", "billing", "menu", "inventory", "kitchen", "reports", "staff", "scan"], home: "orders" },
  senior_captain: { open: ["orders", "reservations", "pulse", "customers", "kitchen", "billing", "staff"], home: "orders" },
  captain: { open: ["orders", "reservations", "pulse", "customers"], home: "orders" },
  sommelier: { open: ["orders", "customers"], home: "orders" },
  host: { open: ["reservations", "pulse", "customers"], home: "pulse" },
  senior_steward: { open: ["orders", "pulse", "reservations"], home: "orders" },
  steward: { open: ["orders", "pulse"], home: "orders" },
  bartender: { open: ["orders"], home: "orders" },
  room_service_order_taker: { open: ["orders", "customers"], home: "orders" },
  fnb_cashier: { open: ["billing", "orders", "invoices", "online-orders", "customers"], home: "billing" },
  busser: { open: ["orders"], home: "orders" },
  service_trainee: { open: ["orders"], home: "orders" },
  // kitchen
  executive_chef: { open: ["kitchen", "menu", "inventory", "tomorrow", "online-orders", "reports", "staff", "labour", "scan"], home: "kitchen" },
  head_chef: { open: ["kitchen", "menu", "inventory", "tomorrow", "online-orders", "reports", "staff", "scan"], home: "kitchen" },
  sous_chef: { open: ["kitchen", "menu", "inventory", "tomorrow", "staff", "scan"], home: "kitchen" },
  junior_sous_chef: { open: ["kitchen", "inventory", "tomorrow", "scan"], home: "kitchen" },
  cdp: { open: ["kitchen", "tomorrow"], home: "kitchen" },
  pastry_chef: { open: ["kitchen", "menu", "tomorrow"], home: "kitchen" },
  dcdp: { open: ["kitchen"], home: "kitchen" },
  commis_1: { open: ["kitchen"], home: "kitchen" },
  commis_2: { open: ["kitchen"], home: "kitchen" },
  commis_3: { open: ["kitchen"], home: "kitchen" },
  cook: { open: ["kitchen"], home: "kitchen" },
  kitchen_steward_supervisor: { open: ["kitchen", "inventory", "staff", "scan"], home: "kitchen" },
  kitchen_steward: { open: [], home: "work" },
  kitchen_helper: { open: ["kitchen"], home: "kitchen" },
  kitchen_trainee: { open: ["kitchen"], home: "kitchen" },
  // banquets & events
  banquet_manager: { open: ["reservations", "orders", "kitchen", "billing", "menu", "customers", "facilities", "staff", "reports", "scan"], home: "reservations" },
  event_coordinator: { open: ["reservations", "customers", "facilities", "orders"], home: "reservations" },
  banquet_captain: { open: ["orders", "reservations", "customers"], home: "orders" },
  banquet_steward: { open: ["orders"], home: "orders" },
  // spa & wellness
  spa_manager: { open: ["facilities", "guests", "customers", "reservations", "inventory", "staff", "reports", "scan"], home: "facilities" },
  spa_therapist: { open: ["facilities", "guests"], home: "facilities" },
  spa_receptionist: { open: ["facilities", "guests", "customers", "reservations"], home: "facilities" },
  fitness_trainer: { open: ["facilities"], home: "facilities" },
  // recreation & activities
  recreation_manager: { open: ["facilities", "guests", "staff", "labour", "reports", "scan"], home: "facilities" },
  activities_coordinator: { open: ["facilities", "guests", "staff"], home: "facilities" },
  lifeguard: { open: ["facilities"], home: "facilities" },
  naturalist: { open: ["facilities"], home: "facilities" },
  kids_club_host: { open: ["facilities"], home: "facilities" },
  // engineering & maintenance
  chief_engineer: { open: ["housekeeping", "rooms", "inventory", "labour", "staff", "reports", "scan"], home: "work" },
  asst_engineer: { open: ["housekeeping", "rooms", "inventory", "labour", "scan"], home: "work" },
  shift_engineer: { open: ["housekeeping", "rooms", "inventory", "labour", "scan"], home: "work" },
  // the people who fix and grow start on the Work board (0113): the jobs of their department, given to them or waiting
  technician: { open: ["rooms"], home: "work" },
  plumber: { open: ["rooms"], home: "work" },
  electrician: { open: ["rooms"], home: "work" },
  ac_technician: { open: ["rooms"], home: "work" },
  carpenter: { open: [], home: "work" },
  gardener: { open: [], home: "work" },
  maintenance_helper: { open: [], home: "work" },
  // security
  security_manager: { open: ["labour", "guests", "staff", "reports"], home: "work" },
  security_supervisor: { open: ["labour", "staff"], home: "work" },
  security_guard: { open: [], home: "work" },
  // sales & marketing
  sales_director: { open: ["reservations", "frontdesk", "rooms", "guests", "customers", "channels", "facilities", "reports", "proof", "neighbours"] },
  sales_manager: { open: ["reservations", "frontdesk", "rooms", "guests", "customers", "channels", "reports"], home: "customers" },
  revenue_manager: { open: ["channels", "reports", "frontdesk", "rooms", "reservations"], home: "channels" },
  sales_executive: { open: ["customers", "reservations", "guests"], home: "customers" },
  marketing_executive: { open: ["customers", "menu", "reservations"], home: "customers" },
  // accounts & finance
  finance_controller: { open: ["reports", "tax", "invoices", "billing", "proof", "inventory", "labour", "customers", "channels"], home: "reports" },
  accounts_manager: { open: ["reports", "tax", "invoices", "billing", "proof", "inventory", "labour"], home: "reports" },
  income_auditor: { open: ["billing", "invoices", "reports"], home: "reports" },
  accountant: { open: ["billing", "invoices", "reports"], home: "invoices" },
  accounts_assistant: { open: ["billing", "invoices"], home: "billing" },
  // human resources
  hr_manager: { open: ["staff", "labour", "reports", "scan"], home: "staff" },
  training_manager: { open: ["staff", "labour"], home: "staff" },
  hr_executive: { open: ["labour"], home: "labour" },
  // stores & purchase
  purchase_manager: { open: ["inventory", "menu", "reports", "tomorrow", "neighbours", "scan"], home: "inventory" },
  store_keeper: { open: ["inventory", "tomorrow", "scan"], home: "inventory" },
  store_assistant: { open: ["inventory", "scan"], home: "inventory" },
  // delivery
  delivery_supervisor: { open: ["online-orders", "orders", "customers", "staff"], home: "online-orders" },
  delivery_rider: { open: ["online-orders"], home: "online-orders" },
};

/** The sections a position opens on this kind of property (a hotel has no Facilities screen, a restaurant no Front
 *  desk), or null for "everything the role allows" — and null for a position not in the table. */
/** A position's entry — own keys only, so "constructor" or "__proto__" find nothing rather than Object's own. */
export const positionAccessOf = (key: string | null | undefined): PositionAccess | undefined => (key && Object.prototype.hasOwnProperty.call(POSITION_ACCESS, key) ? POSITION_ACCESS[key] : undefined);
export function positionModules(key: string | null | undefined, type: PropertyType, modulesByType: Record<PropertyType, string[]>): string[] | null {
  const a = positionAccessOf(key);
  if (!a || a.open === null) return null;
  return a.open.filter((m) => modulesByType[type].includes(m));
}
/** The screen this position starts on — when it is one they hold (or one open to everyone), else the control room. */
export function positionHome(key: string | null | undefined, held: string[]): string {
  const h = positionAccessOf(key)?.home;
  return h && (held.includes(h) || OPEN_HOMES.includes(h)) ? h : "dashboard";
}
/** Where to send someone who has no control room (2026-10-18): their position's screen, else the first of the screens a
 *  role lives on that they hold, else the Work board — which everyone signed in may open, so nobody is left with nowhere. */
const HOME_ORDER = ["orders", "frontdesk", "kitchen", "billing", "housekeeping", "rooms", "inventory", "reservations", "pulse", "online-orders", "reports", "facilities", "customers", "guests", "staff", "scan"];
export function homeFor(held: string[], position?: string | null): string {
  if (held.includes("dashboard")) return "dashboard";
  const p = positionHome(position, held); if (p !== "dashboard") return p;
  return HOME_ORDER.find((m) => held.includes(m)) ?? "work";
}
/** Everyone but the owner and a manager starts on **My day** (`/home`, 2026-10-20 — the owner: "staff go straight to their
 *  own dashboard, not some screen"); the owner and managers keep the control room (or, without it, homeFor). */
export const landsOnMyDay = (role: string) => role !== "owner" && role !== "manager";
/** Where a person lands — after signing in, and when they reach a section they cannot open. */
export function landingFor(role: string, held: string[], position?: string | null): string {
  return landsOnMyDay(role) ? "home" : homeFor(held, position);
}
/** Do two tick lists open the same sections (order and the always-open control room aside)? Null means "the role's
 *  default", which only equals another null. */
export function sameModules(a: string[] | null | undefined, b: string[] | null | undefined) {
  if (!a || !b) return a == null && b == null;
  const x = new Set(a.filter((m) => m !== "dashboard")), y = new Set(b.filter((m) => m !== "dashboard"));
  return x.size === y.size && [...x].every((m) => y.has(m));
}

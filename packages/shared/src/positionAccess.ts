/**
 * What each job position opens — job-based defaults, the way Toast ("each job carries a default permission set …
 * individual overrides"), Cloudbeds (suggested privileges by role) and Petpooja (a biller takes orders and settles
 * bills; a manager handles cancellations and large discounts) set staff up. Everyone given a position starts with its
 * sections; a person can still be given more or less, which the Staff screen shows as "custom".
 *
 * Each list stays inside its position's suggested role's ceiling (ROLE_ACCESS — a test checks), so the database never
 * has to trim it. `null` = the role's own default (owners and managers: everything they may have). `home` = the screen
 * they start on after signing in. The control room (dashboard) is always open and is never listed.
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
  bell_captain: { open: ["rooms", "guests", "scan"], home: "rooms" },
  front_office_associate: { open: [...FO, "reservations", "invoices", "customers", "scan"], home: "frontdesk" },
  night_auditor: { open: [...FO, "invoices", "channels", "housekeeping"], home: "frontdesk" },
  telephone_operator: { open: ["frontdesk", "guests", "reservations"], home: "frontdesk" },
  bellboy: { open: ["rooms", "scan"], home: "rooms" },
  driver: { open: ["scan", "guests"], home: "work" },
  front_office_trainee: { open: FO, home: "frontdesk" },
  // housekeeping
  executive_housekeeper: { open: ["housekeeping", "rooms", "inventory", "labour", "staff", "reports", "tomorrow", "scan"], home: "housekeeping" },
  asst_housekeeper: { open: ["housekeeping", "rooms", "inventory", "labour", "staff", "scan"], home: "housekeeping" },
  floor_supervisor: { open: ["housekeeping", "rooms", "staff", "scan"], home: "housekeeping" },
  laundry_supervisor: { open: ["housekeeping", "inventory", "scan"], home: "housekeeping" },
  room_attendant: { open: ["housekeeping", "rooms"], home: "cleaning" },
  public_area_attendant: { open: ["housekeeping"], home: "cleaning" },
  laundry_attendant: { open: ["housekeeping"], home: "housekeeping" },
  cleaner: { open: ["scan"], home: "cleaning" },
  housekeeping_trainee: { open: ["housekeeping", "rooms"], home: "cleaning" },
  // restaurant & bar service
  fnb_manager: { open: MGR_FNB },
  restaurant_manager: { open: MGR_FNB },
  asst_restaurant_manager: { open: ["orders", "reservations", "pulse", "online-orders", "customers", "kitchen", "billing", "menu", "reports", "staff", "tomorrow", "scan"], home: "orders" },
  bar_manager: { open: ["orders", "billing", "menu", "inventory", "kitchen", "reports", "staff", "scan"], home: "orders" },
  senior_captain: { open: ["orders", "reservations", "pulse", "customers", "kitchen", "billing", "staff", "scan"], home: "orders" },
  captain: { open: ["orders", "reservations", "pulse", "customers", "scan"], home: "orders" },
  sommelier: { open: ["orders", "customers"], home: "orders" },
  host: { open: ["reservations", "pulse", "customers"], home: "pulse" },
  senior_steward: { open: ["orders", "pulse", "reservations", "scan"], home: "orders" },
  steward: { open: ["orders", "pulse", "scan"], home: "orders" },
  bartender: { open: ["orders", "scan"], home: "orders" },
  room_service_order_taker: { open: ["orders", "customers"], home: "orders" },
  fnb_cashier: { open: ["billing", "orders", "invoices", "online-orders", "customers", "scan"], home: "billing" },
  busser: { open: ["orders"], home: "orders" },
  service_trainee: { open: ["orders"], home: "orders" },
  // kitchen
  executive_chef: { open: ["kitchen", "menu", "inventory", "tomorrow", "online-orders", "reports", "staff", "labour", "scan"], home: "kitchen" },
  head_chef: { open: ["kitchen", "menu", "inventory", "tomorrow", "online-orders", "reports", "staff", "scan"], home: "kitchen" },
  sous_chef: { open: ["kitchen", "menu", "inventory", "tomorrow", "staff", "scan"], home: "kitchen" },
  junior_sous_chef: { open: ["kitchen", "inventory", "tomorrow", "scan"], home: "kitchen" },
  cdp: { open: ["kitchen", "tomorrow", "scan"], home: "kitchen" },
  pastry_chef: { open: ["kitchen", "menu", "tomorrow", "scan"], home: "kitchen" },
  dcdp: { open: ["kitchen", "scan"], home: "kitchen" },
  commis_1: { open: ["kitchen", "scan"], home: "kitchen" },
  commis_2: { open: ["kitchen", "scan"], home: "kitchen" },
  commis_3: { open: ["kitchen", "scan"], home: "kitchen" },
  cook: { open: ["kitchen", "scan"], home: "kitchen" },
  kitchen_steward_supervisor: { open: ["kitchen", "inventory", "staff", "scan"], home: "kitchen" },
  kitchen_steward: { open: ["scan"], home: "work" },
  kitchen_helper: { open: ["kitchen"], home: "kitchen" },
  kitchen_trainee: { open: ["kitchen"], home: "kitchen" },
  // banquets & events
  banquet_manager: { open: ["reservations", "orders", "kitchen", "billing", "menu", "customers", "facilities", "staff", "reports", "scan"], home: "reservations" },
  event_coordinator: { open: ["reservations", "customers", "facilities", "orders"], home: "reservations" },
  banquet_captain: { open: ["orders", "reservations", "customers"], home: "orders" },
  banquet_steward: { open: ["orders"], home: "orders" },
  // spa & wellness
  spa_manager: { open: ["facilities", "guests", "customers", "reservations", "inventory", "staff", "reports", "scan"], home: "facilities" },
  spa_therapist: { open: ["facilities", "guests", "scan"], home: "facilities" },
  spa_receptionist: { open: ["facilities", "guests", "customers", "reservations"], home: "facilities" },
  fitness_trainer: { open: ["facilities", "scan"], home: "facilities" },
  // recreation & activities
  recreation_manager: { open: ["facilities", "guests", "staff", "labour", "reports", "scan"], home: "facilities" },
  activities_coordinator: { open: ["facilities", "guests", "staff", "scan"], home: "facilities" },
  lifeguard: { open: ["facilities", "scan"], home: "facilities" },
  naturalist: { open: ["facilities", "scan"], home: "facilities" },
  kids_club_host: { open: ["facilities", "scan"], home: "facilities" },
  // engineering & maintenance
  chief_engineer: { open: ["housekeeping", "rooms", "inventory", "labour", "staff", "reports", "scan"], home: "work" },
  asst_engineer: { open: ["housekeeping", "rooms", "inventory", "labour", "scan"], home: "work" },
  shift_engineer: { open: ["housekeeping", "rooms", "inventory", "labour", "scan"], home: "work" },
  // the people who fix and grow start on the Work board (0113): the jobs of their department, given to them or waiting
  technician: { open: ["housekeeping", "rooms", "scan"], home: "work" },
  plumber: { open: ["housekeeping", "rooms", "scan"], home: "work" },
  electrician: { open: ["housekeeping", "rooms", "scan"], home: "work" },
  ac_technician: { open: ["housekeeping", "rooms", "scan"], home: "work" },
  carpenter: { open: ["housekeeping", "scan"], home: "work" },
  gardener: { open: ["housekeeping", "scan"], home: "work" },
  maintenance_helper: { open: ["scan"], home: "work" },
  // security
  security_manager: { open: ["scan", "labour", "guests", "staff", "reports"], home: "work" },
  security_supervisor: { open: ["scan", "labour", "staff"], home: "work" },
  security_guard: { open: ["scan"], home: "work" },
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
  hr_executive: { open: ["labour", "scan"], home: "labour" },
  // stores & purchase
  purchase_manager: { open: ["inventory", "menu", "reports", "tomorrow", "neighbours", "scan"], home: "inventory" },
  store_keeper: { open: ["inventory", "tomorrow", "scan"], home: "inventory" },
  store_assistant: { open: ["inventory", "scan"], home: "inventory" },
  // delivery
  delivery_supervisor: { open: ["online-orders", "orders", "customers", "staff", "scan"], home: "online-orders" },
  delivery_rider: { open: ["online-orders", "scan"], home: "online-orders" },
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
/** Do two tick lists open the same sections (order and the always-open control room aside)? Null means "the role's
 *  default", which only equals another null. */
export function sameModules(a: string[] | null | undefined, b: string[] | null | undefined) {
  if (!a || !b) return a == null && b == null;
  const x = new Set(a.filter((m) => m !== "dashboard")), y = new Set(b.filter((m) => m !== "dashboard"));
  return x.size === y.size && [...x].every((m) => y.has(m));
}

/**
 * Job positions — who someone IS on the property (a Sous Chef in the Kitchen, level 3), as against their `Role`, which
 * decides which screens they may open. A position suggests a role; the owner can still give another.
 *
 * The ladder follows the usual Indian hotel and restaurant structure: the General Manager over the heads of
 * department, assistant heads, supervisors, senior staff, staff, and trainees — the kitchen brigade (Executive Chef →
 * Sous Chef → CDP → DCDP → Commis I/II/III → trainee) and the service brigade (F&B Manager → Restaurant Manager →
 * Senior Captain → Captain → Senior Steward → Steward → trainee) included. Titles vary from place to place; anyone may
 * be given a title of their own.
 */
import type { PropertyType, Role } from "./constants";

export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const LEVELS: { level: Level; label: string; hint: string }[] = [
  { level: 1, label: "Leadership", hint: "Runs the whole property" },
  { level: 2, label: "Head of department", hint: "Runs a department and its budget" },
  { level: 3, label: "Assistant head", hint: "Second in a department; stands in for the head" },
  { level: 4, label: "Supervisor", hint: "Runs a shift, a section or a station" },
  { level: 5, label: "Senior staff", hint: "Experienced; leads others on the floor" },
  { level: 6, label: "Staff", hint: "Does the work" },
  { level: 7, label: "Trainee & helper", hint: "Learning, or helping the team" },
];

const ALL: PropertyType[] = ["restaurant", "hotel", "resort"];
const STAY: PropertyType[] = ["hotel", "resort"];
const RESORT: PropertyType[] = ["resort"];

export type Department = { key: string; label: string; types: PropertyType[] };
export const DEPARTMENTS: Department[] = [
  { key: "management", label: "Management", types: ALL },
  { key: "front_office", label: "Front office", types: STAY },
  { key: "housekeeping", label: "Housekeeping", types: ALL },
  { key: "service", label: "Restaurant & bar service", types: ALL },
  { key: "kitchen", label: "Kitchen", types: ALL },
  { key: "banquets", label: "Banquets & events", types: STAY },
  { key: "spa", label: "Spa & wellness", types: STAY },
  { key: "recreation", label: "Recreation & activities", types: RESORT },
  { key: "engineering", label: "Engineering & maintenance", types: ALL },
  { key: "security", label: "Security", types: ALL },
  { key: "sales", label: "Sales & marketing", types: ALL },
  { key: "finance", label: "Accounts & finance", types: ALL },
  { key: "hr", label: "Human resources", types: ALL },
  { key: "stores", label: "Stores & purchase", types: ALL },
  { key: "delivery", label: "Delivery", types: ["restaurant", "hotel"] },
];

/** `levelFor` moves a title on a property where it sits elsewhere — a Restaurant Manager heads a restaurant but is an
 *  outlet manager under the F&B Manager in a hotel. */
export type Position = { key: string; title: string; dept: string; level: Level; types: PropertyType[]; role: Role; levelFor?: Partial<Record<PropertyType, Level>> };
const p = (key: string, title: string, dept: string, level: Level, types: PropertyType[], role: Role, levelFor?: Position["levelFor"]): Position => ({ key, title, dept, level, types, role, levelFor });

export const POSITIONS: Position[] = [
  // ── management ──
  p("owner_md", "Owner / Managing Director", "management", 1, ALL, "owner"),
  p("general_manager", "General Manager", "management", 1, ALL, "manager"),
  p("resident_manager", "Resident Manager", "management", 2, STAY, "manager"),
  p("resort_manager", "Resort Manager", "management", 2, RESORT, "manager"),
  p("operations_manager", "Operations Manager", "management", 2, ALL, "manager"),
  p("executive_assistant", "Executive Assistant to the GM", "management", 5, STAY, "employee"),
  // ── front office ──
  p("front_office_manager", "Front Office Manager", "front_office", 2, STAY, "supervisor"),
  p("asst_front_office_manager", "Assistant Front Office Manager", "front_office", 3, STAY, "supervisor"),
  p("duty_manager", "Duty Manager", "front_office", 3, STAY, "supervisor"),
  p("front_desk_supervisor", "Front Desk Supervisor", "front_office", 4, STAY, "supervisor_2"),
  p("guest_relations_manager", "Guest Relations Manager", "front_office", 4, STAY, "supervisor_2"),
  p("gre", "Guest Relations Executive (GRE)", "front_office", 5, STAY, "frontdesk"),
  p("reservations_executive", "Reservations Executive", "front_office", 5, STAY, "frontdesk"),
  p("concierge", "Concierge", "front_office", 5, STAY, "frontdesk"),
  p("bell_captain", "Bell Captain", "front_office", 5, STAY, "employee"),
  p("front_office_associate", "Front Office Associate / Receptionist", "front_office", 6, STAY, "frontdesk"),
  p("night_auditor", "Night Auditor", "front_office", 6, STAY, "frontdesk"),
  p("telephone_operator", "Telephone Operator", "front_office", 6, STAY, "frontdesk"),
  p("bellboy", "Bellboy / Porter", "front_office", 6, STAY, "employee"),
  p("driver", "Driver / Chauffeur", "front_office", 6, STAY, "employee"),
  p("front_office_trainee", "Front Office Trainee", "front_office", 7, STAY, "frontdesk"),
  // ── housekeeping ──
  p("executive_housekeeper", "Executive Housekeeper", "housekeeping", 2, STAY, "supervisor"),
  p("asst_housekeeper", "Assistant Housekeeper", "housekeeping", 3, STAY, "supervisor"),
  p("floor_supervisor", "Floor Supervisor", "housekeeping", 4, STAY, "supervisor_2"),
  p("laundry_supervisor", "Laundry Supervisor", "housekeeping", 4, STAY, "supervisor_2"),
  p("room_attendant", "Room Attendant", "housekeeping", 6, STAY, "housekeeping"),
  p("public_area_attendant", "Public Area Attendant", "housekeeping", 6, STAY, "housekeeping"),
  p("laundry_attendant", "Laundry Attendant", "housekeeping", 6, STAY, "housekeeping"),
  p("cleaner", "Cleaner / Utility Worker", "housekeeping", 6, ["restaurant"], "employee"),
  p("housekeeping_trainee", "Housekeeping Trainee", "housekeeping", 7, STAY, "housekeeping"),
  // ── restaurant & bar service ──
  p("fnb_manager", "Food & Beverage Manager", "service", 2, STAY, "manager"),
  p("restaurant_manager", "Restaurant Manager / Outlet Manager", "service", 3, ALL, "manager", { restaurant: 2 }),
  p("asst_restaurant_manager", "Assistant Restaurant Manager", "service", 4, ALL, "supervisor", { restaurant: 3 }),
  p("bar_manager", "Bar Manager", "service", 3, ALL, "supervisor"),
  p("senior_captain", "Senior Captain / Head Waiter", "service", 4, ALL, "supervisor_2"),
  p("captain", "Captain", "service", 5, ALL, "waiter"),
  p("sommelier", "Sommelier", "service", 5, STAY, "waiter"),
  p("host", "Host / Hostess", "service", 5, ALL, "waiter"),
  p("senior_steward", "Senior Steward", "service", 5, ALL, "waiter"),
  p("steward", "Steward / Waiter", "service", 6, ALL, "waiter"),
  p("bartender", "Bartender", "service", 6, ALL, "waiter"),
  p("room_service_order_taker", "Room Service Order Taker", "service", 6, STAY, "waiter"),
  p("fnb_cashier", "Cashier", "service", 6, ALL, "cashier"),
  p("busser", "Busser / Assistant Steward", "service", 7, ALL, "waiter"),
  p("service_trainee", "Service Trainee", "service", 7, ALL, "waiter"),
  // ── kitchen ──
  p("executive_chef", "Executive Chef", "kitchen", 2, ALL, "supervisor"),
  p("head_chef", "Head Chef / Chef de Cuisine", "kitchen", 3, ALL, "supervisor", { restaurant: 2 }),
  p("sous_chef", "Sous Chef", "kitchen", 3, ALL, "supervisor_2"),
  p("junior_sous_chef", "Junior Sous Chef", "kitchen", 4, STAY, "supervisor_2"),
  p("cdp", "Chef de Partie (CDP)", "kitchen", 4, ALL, "chef"),
  p("pastry_chef", "Pastry Chef", "kitchen", 4, ALL, "chef"),
  p("dcdp", "Demi Chef de Partie (DCDP)", "kitchen", 5, ALL, "chef"),
  p("commis_1", "Commis I", "kitchen", 6, ALL, "chef"),
  p("commis_2", "Commis II", "kitchen", 6, ALL, "chef"),
  p("commis_3", "Commis III", "kitchen", 6, ALL, "chef"),
  p("cook", "Cook (Tandoor, Chinese, South Indian…)", "kitchen", 6, ALL, "chef"),
  p("kitchen_steward_supervisor", "Kitchen Stewarding Supervisor", "kitchen", 4, STAY, "supervisor_2"),
  p("kitchen_steward", "Kitchen Steward / Dishwasher", "kitchen", 7, ALL, "employee"),
  p("kitchen_helper", "Kitchen Helper", "kitchen", 7, ALL, "chef"),
  p("kitchen_trainee", "Kitchen Trainee / Apprentice", "kitchen", 7, ALL, "chef"),
  // ── banquets & events ──
  p("banquet_manager", "Banquet Manager", "banquets", 3, STAY, "supervisor"),
  p("event_coordinator", "Event Coordinator", "banquets", 5, STAY, "employee"),
  p("banquet_captain", "Banquet Captain", "banquets", 5, STAY, "waiter"),
  p("banquet_steward", "Banquet Steward", "banquets", 6, STAY, "waiter"),
  // ── spa & wellness ──
  p("spa_manager", "Spa Manager", "spa", 2, STAY, "supervisor"),
  p("spa_therapist", "Spa Therapist", "spa", 6, STAY, "employee"),
  p("spa_receptionist", "Spa Receptionist", "spa", 6, STAY, "frontdesk"),
  p("fitness_trainer", "Fitness Trainer / Yoga Instructor", "spa", 6, STAY, "employee"),
  // ── recreation & activities ──
  p("recreation_manager", "Recreation Manager", "recreation", 2, RESORT, "supervisor"),
  p("activities_coordinator", "Activities Coordinator", "recreation", 4, RESORT, "supervisor_2"),
  p("lifeguard", "Lifeguard", "recreation", 6, RESORT, "employee"),
  p("naturalist", "Naturalist / Activity Guide", "recreation", 6, RESORT, "employee"),
  p("kids_club_host", "Kids Club Host", "recreation", 6, RESORT, "employee"),
  // ── engineering & maintenance ──
  p("chief_engineer", "Chief Engineer", "engineering", 2, STAY, "supervisor"),
  p("asst_engineer", "Assistant Engineer", "engineering", 3, STAY, "supervisor"),
  p("shift_engineer", "Shift Engineer / Maintenance Supervisor", "engineering", 4, ALL, "supervisor_2"),
  p("technician", "Technician (general)", "engineering", 6, ALL, "employee"),
  p("plumber", "Plumber", "engineering", 6, ALL, "employee"),
  p("electrician", "Electrician", "engineering", 6, ALL, "employee"),
  p("ac_technician", "AC / Refrigeration Technician", "engineering", 6, ALL, "employee"),
  p("carpenter", "Carpenter / Painter", "engineering", 6, STAY, "employee"),
  p("gardener", "Gardener / Landscaper", "engineering", 6, STAY, "employee"),
  p("maintenance_helper", "Maintenance Helper", "engineering", 7, ALL, "employee"),
  // ── security ──
  p("security_manager", "Security Manager", "security", 2, STAY, "supervisor"),
  p("security_supervisor", "Security Supervisor", "security", 4, ALL, "supervisor_2"),
  p("security_guard", "Security Guard", "security", 6, ALL, "employee"),
  // ── sales & marketing ──
  p("sales_director", "Director of Sales & Marketing", "sales", 2, STAY, "manager"),
  p("sales_manager", "Sales Manager", "sales", 3, STAY, "supervisor"),
  p("revenue_manager", "Revenue Manager", "sales", 3, STAY, "supervisor"),
  p("sales_executive", "Sales Executive", "sales", 5, STAY, "employee"),
  p("marketing_executive", "Marketing / Social Media Executive", "sales", 5, ALL, "employee"),
  // ── accounts & finance ──
  p("finance_controller", "Financial Controller", "finance", 2, STAY, "manager"),
  p("accounts_manager", "Accounts Manager", "finance", 3, ALL, "supervisor"),
  p("income_auditor", "Income Auditor", "finance", 5, STAY, "cashier"),
  p("accountant", "Accountant", "finance", 5, ALL, "cashier"),
  p("accounts_assistant", "Accounts Assistant", "finance", 6, ALL, "cashier"),
  // ── human resources ──
  p("hr_manager", "HR Manager", "hr", 2, STAY, "supervisor"),
  p("training_manager", "Training Manager", "hr", 3, STAY, "supervisor"),
  p("hr_executive", "HR Executive", "hr", 5, ALL, "employee"),
  // ── stores & purchase ──
  p("purchase_manager", "Purchase Manager", "stores", 3, ALL, "supervisor"),
  p("store_keeper", "Store Keeper", "stores", 5, ALL, "store"),
  p("store_assistant", "Store Assistant", "stores", 6, ALL, "store"),
  // ── delivery ──
  p("delivery_supervisor", "Delivery Supervisor", "delivery", 4, ["restaurant", "hotel"], "supervisor_2"),
  p("delivery_rider", "Delivery Rider", "delivery", 6, ["restaurant", "hotel"], "employee"),
];

export const positionByKey = (key: string | null | undefined) => (key ? POSITIONS.find((x) => x.key === key) ?? null : null);
export const levelOf = (pos: Position, type: PropertyType): Level => pos.levelFor?.[type] ?? pos.level;
export const departmentByKey = (key: string | null | undefined) => (key ? DEPARTMENTS.find((d) => d.key === key) ?? null : null);

/** The departments and positions a property of this kind has, each department's positions from the top down. */
export function hierarchyFor(type: PropertyType) {
  return DEPARTMENTS.filter((d) => d.types.includes(type)).map((d) => ({
    ...d,
    positions: POSITIONS.filter((x) => x.dept === d.key && x.types.includes(type))
      .map((x) => ({ ...x, level: levelOf(x, type) }))
      .sort((a, b) => a.level - b.level || POSITIONS.indexOf(a) - POSITIONS.indexOf(b)),
  })).filter((d) => d.positions.length > 0);
}

/** The role a position suggests, brought down to one the appointer may give (they can only hand out ranks below
 *  their own; `assignable` is `rolesIMayAssign(me)`), else the highest they may give. */
export function suggestedRole(pos: Position | null, assignable: Role[]): Role | null {
  if (!pos || !assignable.length) return null;
  if (assignable.includes(pos.role)) return pos.role;
  const order: Role[] = ["owner", "manager", "supervisor", "supervisor_2"];
  const at = order.indexOf(pos.role);
  if (at >= 0) for (const r of order.slice(at + 1)) if (assignable.includes(r)) return r;
  return assignable.includes("employee") ? "employee" : assignable[assignable.length - 1];
}

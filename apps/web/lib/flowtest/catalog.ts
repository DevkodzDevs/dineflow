/**
 * Master control → Flow tests (2026-11-02, the owner: "the testing flow, as a tool — start to end; by the menu's headings;
 * by a whole flow such as an order, a bill or a room booking; and by one page"). One list for the screen that runs it
 * (app/admin/flow-tests) and the server that does each step (app/api/admin/flowtest): the flows of the testing document
 * ("DineFlow — Full Application Testing Flow"), their steps in order, and every app page under its menu heading.
 *
 * Everything runs on two throwaway demo properties made for the run (a restaurant `r` and a hotel `h`) as their owner and
 * staff, and both are deleted at the end — no real property's data is read or written. A step is one short server call,
 * so a whole run never meets the host's time limit and the screen shows each result as it lands.
 */
import { MODULES_BY_TYPE } from "@dineflow/shared";
import { ITEMS, MENU_GROUPS, endFor, freshFor, modOf } from "@/components/shell/sections";

export type Kind = "r" | "h";
export const KIND_WORD: Record<Kind, string> = { r: "Restaurant", h: "Hotel" };
export type FlowKey = "signin" | "order" | "billing" | "cleaning" | "booking" | "reservation" | "guest" | "security";
export type Step = { id: string; title: string; flow: FlowKey | "setup" | "pages"; kind: Kind | null; group?: string };

/** The flows, in the order of the testing document's stages, each with its steps in order. */
export const FLOWS: { key: FlowKey; title: string; what: string; stage: string; needs: Kind[]; steps: { id: string; title: string; kind: Kind }[] }[] = [
  { key: "signin", title: "Sign-in & roles", stage: "Stage 2", what: "Owner and staff sign in; each role opens only its own menu; a temporary password goes to Choose your password", needs: ["r"], steps: [
    { id: "signin:owner", title: "The owner signs in and opens the Control room", kind: "r" },
    { id: "signin:roles", title: "Each role holds only its own sections", kind: "r" },
    { id: "signin:home", title: "Staff land on My day, not the Control room", kind: "r" },
    { id: "signin:temp", title: "A temporary password opens Choose your password first", kind: "r" },
  ] },
  { key: "order", title: "Order", stage: "Stage 3", what: "Table → order → kitchen → ready → served, a second round, and a cancelled order", needs: ["r"], steps: [
    { id: "order:place", title: "The waiter takes an order at a free table", kind: "r" },
    { id: "order:kitchen", title: "The kitchen cooks it: preparing, then ready", kind: "r" },
    { id: "order:ready", title: "Ready food reaches the waiter's list", kind: "r" },
    { id: "order:served", title: "Served closes the ticket", kind: "r" },
    { id: "order:more", title: "A second round on the same table", kind: "r" },
    { id: "order:cancel", title: "A cancelled order leaves nothing at Ready and frees its table", kind: "r" },
  ] },
  { key: "billing", title: "Billing", stage: "Stage 3", what: "Generate the bill, check every rupee, take the money, refund part of it, void another", needs: ["r"], steps: [
    { id: "billing:generate", title: "The cashier generates the bill with 10% off", kind: "r" },
    { id: "billing:math", title: "The bill adds up to the paisa", kind: "r" },
    // the second round's bill is voided and the round cancelled first: a table frees only when no order on it is open
    { id: "billing:void", title: "An unpaid bill is voided with a reason", kind: "r" },
    { id: "billing:settle", title: "Paid in cash: the bill closes and the table frees", kind: "r" },
    { id: "billing:refund", title: "A part refund makes a numbered credit note", kind: "r" },
  ] },
  { key: "cleaning", title: "Cleaning & work", stage: "Stage 2–3", what: "A table to clean: only cleaners take it, bosses assign, and nobody's job goes out by itself after 5 minutes", needs: ["r"], steps: [
    { id: "cleaning:rules", title: "Only a cleaner takes the table; the waiter and the owner are refused", kind: "r" },
    { id: "cleaning:done", title: "Done frees the table", kind: "r" },
    { id: "cleaning:assign", title: "The owner assigns a table to a cleaner", kind: "r" },
    { id: "cleaning:auto", title: "Nobody took it in 5 minutes → a free cleaner gets it", kind: "r" },
  ] },
  { key: "booking", title: "Room booking", stage: "Stage 4", what: "Book → check in → a meal on the room → check out with the invoice → clean the room → night audit", needs: ["h"], steps: [
    { id: "booking:create", title: "Front desk books a room for tonight", kind: "h" },
    { id: "booking:checkin", title: "Check in: the room is occupied", kind: "h" },
    { id: "booking:charge", title: "A meal goes on the room's folio", kind: "h" },
    { id: "booking:checkout", title: "Check out: paid in full, the invoice made", kind: "h" },
    { id: "booking:clean", title: "The room attendant cleans the room", kind: "h" },
    { id: "booking:audit", title: "The night audit runs", kind: "h" },
  ] },
  { key: "reservation", title: "Table booking", stage: "Stage 3", what: "Book a table, then seat the guest at it", needs: ["r"], steps: [
    { id: "reservation:add", title: "A table booking for tonight", kind: "r" },
    { id: "reservation:seat", title: "Seat now puts the guest at a table", kind: "r" },
  ] },
  { key: "guest", title: "Guest pages", stage: "Stage 6", what: "The pages a guest opens without signing in", needs: ["r", "h"], steps: [
    { id: "guest:site", title: "The front page, install and legal pages", kind: "r" },
    { id: "guest:dine", title: "The restaurant's menu, queue and feedback pages", kind: "r" },
    { id: "guest:book", title: "The hotel's room booking page", kind: "h" },
  ] },
  { key: "security", title: "Security & money", stage: "Stage 8", what: "Properties walled off; staff cannot change money through the API", needs: ["r", "h"], steps: [
    { id: "security:walls", title: "One property cannot read another's orders", kind: "r" },
    { id: "security:money", title: "A waiter cannot rewrite a price, a bill or a role", kind: "r" },
    { id: "security:anon", title: "A stranger reads nothing", kind: "r" },
  ] },
];

/** Every page of the app under its menu heading, and which kind of property has it. */
export type PageDef = { key: string; href: string; label: string; group: string; kinds: Kind[] };
const kindsOf = (mod: string | null): Kind[] => (mod ? (["r", "h"] as Kind[]).filter((k) => MODULES_BY_TYPE[k === "r" ? "restaurant" : "hotel"].includes(mod)) : ["r", "h"]);
export const PAGES: PageDef[] = (() => {
  const titleOf = new Map<string, string>();
  MENU_GROUPS.forEach((g) => g.keys.forEach((k) => titleOf.set(k, g.title ?? "Overview")));
  const out: PageDef[] = [];
  const seen = new Set<string>();
  const add = (key: string, href: string, label: string, mod: string | null, group: string) => {
    if (seen.has(href)) return; seen.add(href);
    const kinds = kindsOf(mod); if (kinds.length) out.push({ key, href, label, group, kinds });
  };
  for (const s of ITEMS) add(s.key, s.href, s.label, modOf(s), titleOf.get(s.key) ?? "More");
  for (const s of freshFor("owner")) add(s.key, s.href, s.label, null, titleOf.get(s.key) ?? "More");
  for (const s of endFor("owner")) add(s.key, s.href, s.label, null, "Account & help");
  add("settings", "/settings", "Settings", "settings", "Account & help");
  return out;
})();
/** The menu's headings, in the menu's order, each with the flows that belong under it. */
export const GROUP_FLOWS: Record<string, FlowKey[]> = {
  "Overview": ["signin"], "Rooms & stays": ["booking"], "Guests & tables": ["reservation"], "Orders & kitchen": ["order", "billing"],
  "Menu & stock": [], "Team & work": ["cleaning"], "Money": ["billing"], "Reports & insights": [], "Business & growth": ["guest"],
  "Devices": [], "Account & help": ["security"], "More": [],
};
export const GROUPS: string[] = [...new Set(PAGES.map((p) => p.group))];

export type Mode = { kind: "full" } | { kind: "group"; group: string } | { kind: "flow"; flow: FlowKey } | { kind: "page"; href: string; on: Kind };

const pageStep = (p: PageDef, k: Kind): Step => ({ id: `page:${k}:${p.href}`, title: `${p.label} · ${KIND_WORD[k]}`, flow: "pages", kind: k, group: p.group });

/** The steps a run takes, in order: the throwaway properties it needs and their staff, then the flows, then the pages. */
export function planFor(m: Mode): Step[] {
  const flows = m.kind === "full" ? FLOWS : m.kind === "flow" ? FLOWS.filter((f) => f.key === m.flow)
    : m.kind === "group" ? FLOWS.filter((f) => (GROUP_FLOWS[m.group] ?? []).includes(f.key)) : [];
  const pages: Step[] = m.kind === "full" ? PAGES.flatMap((p) => p.kinds.map((k) => pageStep(p, k)))
    : m.kind === "group" ? PAGES.filter((p) => p.group === m.group).flatMap((p) => p.kinds.map((k) => pageStep(p, k)))
    : m.kind === "page" ? PAGES.filter((p) => p.href === m.href).map((p) => pageStep(p, m.on)) : [];
  const need = new Set<Kind>([...flows.flatMap((f) => f.needs), ...pages.map((s) => s.kind as Kind)]);
  const setup: Step[] = [];
  if (need.has("r")) setup.push({ id: "setup:r", title: "Make a throwaway restaurant", flow: "setup", kind: "r" }, { id: "staff:r", title: "Its staff: waiter, chef, cashier, cleaner", flow: "setup", kind: "r" });
  if (need.has("h")) setup.push({ id: "setup:h", title: "Make a throwaway hotel", flow: "setup", kind: "h" }, { id: "staff:h", title: "Its staff: front desk, room attendant", flow: "setup", kind: "h" });
  return [...setup, ...flows.flatMap((f) => f.steps.map((s): Step => ({ id: s.id, title: s.title, flow: f.key, kind: s.kind }))), ...pages];
}
export const flowTitle = (k: Step["flow"]) => (k === "setup" ? "Setting up" : k === "pages" ? "Pages" : FLOWS.find((f) => f.key === k)?.title ?? k);
export const modeLabel = (m: Mode) => m.kind === "full" ? "Full application" : m.kind === "group" ? `Section · ${m.group}` : m.kind === "flow" ? `Flow · ${FLOWS.find((f) => f.key === m.flow)?.title}` : `Page · ${PAGES.find((p) => p.href === m.href)?.label ?? m.href} (${KIND_WORD[m.on]})`;

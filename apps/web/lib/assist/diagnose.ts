import "server-only";
import { formatINR } from "@dineflow/shared";
import type { createClient } from "@/lib/supabase/server";
import type { Session } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { modulesOf, addDays, nice } from "./data";
import type { Finding } from "./protocol";

/**
 * Assist's health check (2026-10-21): the things that go quietly wrong in a working day — an order nobody billed,
 * a guest still "checked in" two days after leaving, stock below zero, a channel that stopped syncing — each found
 * by a plain query, each with its usual cause and the fix. A check runs only if the person holds its section.
 * Where a fix is safe it comes with an action the person confirms with a tap (`api/assist/act`, through the same
 * RPCs the screens use); everything else is a screen to open.
 */
type DB = Awaited<ReturnType<typeof createClient>>;
type R = Record<string, unknown>;
export type { Finding } from "./protocol";

const rows = async (q: PromiseLike<{ data: unknown }>) => ((await q).data ?? []) as R[];
const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => Number(v ?? 0) || 0;
const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as R | undefined;
const mins = (iso: unknown) => Math.round((Date.now() - Date.parse(str(iso))) / 60000);
const ago = (m: number) => (m >= 2880 ? `${Math.round(m / 1440)} days` : m >= 120 ? `${Math.round(m / 60)} hours` : `${m} minutes`);
const list = (xs: string[], k = 4) => xs.slice(0, k).join(", ") + (xs.length > k ? ` and ${xs.length - k} more` : "");
/** An error from a channel can carry its feed address, and a feed address can carry a token. */
export const noLinks = (s: string) => s.replace(/https?:\/\/\S+/g, "[link]").slice(0, 160);

type Check = { area: string; needs: string[]; boss?: boolean; run: (s: DB, rid: string, session: Session) => Promise<Finding[]> };

const CHECKS: Check[] = [
  { area: "Orders", needs: ["orders"], run: async (s, rid) => {
    const open = await rows(s.from("orders").select("order_no, type, created_at, dining_tables(name)").eq("restaurant_id", rid).eq("status", "open").order("created_at").limit(200));
    const stale = open.filter((o) => mins(o.created_at) > 240);
    return stale.length ? [{ level: "problem", area: "Orders", what: `${stale.length} order${stale.length > 1 ? "s have" : " has"} been open for hours: ${list(stale.map((o) => `#${o.order_no}${one(o.dining_tables)?.name ? ` (${one(o.dining_tables)?.name})` : ""}, ${ago(mins(o.created_at))}`), 3)}.`,
      cause: "An order stays open until it is billed or cancelled. This usually means the guest left and the table was cleared without pressing Bill, or a test order was left behind. Until it closes, its sales are missing from today's reports and the table shows as busy.",
      fix: "Open each one in Orders: bill it if it was served, or cancel it with a reason if it wasn't.", go: "/orders" }] : [];
  } },
  { area: "Tables", needs: ["orders"], run: async (s, rid) => {
    const [tb, open] = await Promise.all([rows(s.from("dining_tables").select("id, name, status").eq("restaurant_id", rid)), rows(s.from("orders").select("table_id").eq("restaurant_id", rid).eq("status", "open").not("table_id", "is", null))]);
    const busy = new Set(open.map((o) => str(o.table_id)));
    const ghost = tb.filter((t) => t.status === "occupied" && !busy.has(str(t.id))), hidden = tb.filter((t) => t.status === "free" && busy.has(str(t.id)));
    const out: Finding[] = [];
    if (ghost.length) out.push({ level: "warning", area: "Tables", what: `${list(ghost.map((t) => str(t.name)))} ${ghost.length > 1 ? "show" : "shows"} occupied but ${ghost.length > 1 ? "have" : "has"} no open order.`, cause: "The table was marked occupied (a party was seated) but no order was started on it, or its order was billed or moved and the table was never freed. Hosts will skip it as busy.", fix: "Open Tables: take the order if the guests are there, or free the table.", go: "/tables" });
    if (hidden.length) out.push({ level: "warning", area: "Tables", what: `${list(hidden.map((t) => str(t.name)))} ${hidden.length > 1 ? "show" : "shows"} free but still ${hidden.length > 1 ? "have" : "has"} an open order.`, cause: "The table was freed by hand while its order stayed open, so a new party could be seated onto an unbilled table.", fix: "Open the order from Orders and bill it, or move it to the right table.", go: "/orders" });
    return out;
  } },
  { area: "Billing", needs: ["billing"], run: async (s, rid) => {
    const unpaid = (await rows(s.from("bills").select("bill_no, total, created_at").eq("restaurant_id", rid).eq("status", "unpaid").order("created_at").limit(100))).filter((b) => mins(b.created_at) > 60);
    return unpaid.length ? [{ level: "problem", area: "Billing", what: `${unpaid.length} bill${unpaid.length > 1 ? "s were" : " was"} printed over an hour ago and still unpaid: ${list(unpaid.map((b) => `#${b.bill_no} ${formatINR(num(b.total))}`), 3)}.`,
      cause: "A bill stays unpaid until someone presses Settle. Most often the guest paid by cash or UPI and the payment was never recorded, which leaves the cash-up short and the bill counted as money owed.",
      fix: "In Billing, settle each one with the way it was really paid, or void it with a reason if it was a mistake.", go: "/billing" }] : [];
  } },
  { area: "Kitchen", needs: ["kitchen"], run: async (s, rid) => {
    const ks = await rows(s.from("kots").select("kot_no, status, created_at, ready_at").eq("restaurant_id", rid).in("status", ["pending", "preparing", "ready"]).order("created_at").limit(200));
    const stuck = ks.filter((k) => k.status !== "ready" && mins(k.created_at) > 25), waiting = ks.filter((k) => k.status === "ready" && k.ready_at && mins(k.ready_at) > 15);
    const out: Finding[] = [];
    if (stuck.length) out.push({ level: stuck.some((k) => mins(k.created_at) > 120) ? "problem" : "warning", area: "Kitchen", what: `${stuck.length} ticket${stuck.length > 1 ? "s are" : " is"} still not ready: ${list(stuck.map((k) => `KOT #${k.kot_no} (${ago(mins(k.created_at))})`), 3)}.`, cause: "A ticket stays open until the kitchen taps Ready. If it is hours old the food almost certainly went out and the tap was missed, so the kitchen screen and its speed figures are wrong. If it is minutes old, the station is behind.", fix: "Open Kitchen and bump the old ones; for the recent ones, check the station.", go: "/kitchen" });
    if (waiting.length) out.push({ level: "warning", area: "Kitchen", what: `${waiting.length} ticket${waiting.length > 1 ? "s have" : " has"} been ready for over 15 minutes and not marked served.`, cause: "Food is ready on the pass but no one has carried it out, or it went out and Served wasn't tapped.", fix: "Check the pass, then mark them served in Kitchen.", go: "/kitchen" });
    return out;
  } },
  { area: "Pantry", needs: ["inventory"], run: async (s, rid) => {
    const ing = await rows(s.from("ingredients").select("name, current_stock, reorder_level").eq("restaurant_id", rid).eq("is_active", true).limit(2000));
    const neg = ing.filter((i) => num(i.current_stock) < 0), low = ing.filter((i) => num(i.current_stock) >= 0 && num(i.current_stock) <= num(i.reorder_level) && num(i.reorder_level) > 0);
    const out: Finding[] = [];
    if (neg.length) out.push({ level: "problem", area: "Pantry", what: `${neg.length} ingredient${neg.length > 1 ? "s are" : " is"} below zero: ${list(neg.map((i) => str(i.name)))}.`, cause: "Every dish sold takes its recipe out of stock. Stock goes below zero when sales keep taking it but the purchase that brought it in was never recorded, or the opening count was never entered. Food cost and the buy list are wrong until it is fixed.", fix: "In Pantry, record the purchase (or receive its PO), or do a stock count to set the real quantity.", go: "/inventory" });
    if (low.length) out.push({ level: "warning", area: "Pantry", what: `${low.length} ingredient${low.length > 1 ? "s are" : " is"} at or below the reorder level: ${list(low.map((i) => str(i.name)))}.`, cause: "Normal use has brought them down to the level you set for reordering.", fix: "Order them today. I can draft the supplier message.", go: "/inventory", action: { kind: "reorder_message", label: "Draft the supplier message", arg: "" } });
    return out;
  } },
  { area: "Menu", needs: ["menu"], run: async (s, rid) => {
    const bad = await rows(s.from("menu_items").select("name, price").eq("restaurant_id", rid).eq("is_active", true).eq("is_available", true).lte("price", 0).limit(50));
    return bad.length ? [{ level: "warning", area: "Menu", what: `${bad.length} dish${bad.length > 1 ? "es are" : " is"} on sale at ₹0: ${list(bad.map((i) => str(i.name)))}.`, cause: "The dish was saved without a price (or the price was cleared), so it bills as free.", fix: "Set a price in Menu, or switch it off until it has one.", go: "/menu" }] : [];
  } },
  { area: "Stays", needs: ["frontdesk", "rooms"], run: async (s, rid) => {
    const t = todayIST();
    const [over, late, rm, inn] = await Promise.all([
      rows(s.from("bookings").select("booking_no, check_out, guests(full_name), rooms(number)").eq("restaurant_id", rid).eq("status", "checked_in").lt("check_out", t).limit(100)),
      rows(s.from("bookings").select("booking_no, check_in, guests(full_name), rooms(number)").eq("restaurant_id", rid).eq("status", "reserved").eq("is_block", false).lt("check_in", t).limit(100)),
      rows(s.from("rooms").select("id, number, status").eq("restaurant_id", rid).eq("status", "occupied")),
      rows(s.from("bookings").select("room_id").eq("restaurant_id", rid).eq("status", "checked_in")),
    ]);
    const out: Finding[] = [];
    if (over.length) out.push({ level: "problem", area: "Stays", what: `${over.length} guest${over.length > 1 ? "s are" : " is"} still checked in after their checkout date: ${list(over.map((b) => `${str(one(b.guests)?.full_name)} in ${str(one(b.rooms)?.number)} (due ${nice(str(b.check_out))})`), 3)}.`, cause: "Checkout was not done in the app when they left (or the stay was extended by word of mouth). The room stays occupied, can't be sold, and the folio isn't closed into an invoice.", fix: "At the front desk, check them out (or extend the stay if they are still here).", go: "/frontdesk" });
    if (late.length) out.push({ level: "warning", area: "Stays", what: `${late.length} booking${late.length > 1 ? "s" : ""} from earlier days ${late.length > 1 ? "were" : "was"} never checked in or marked no-show: ${list(late.map((b) => `#${b.booking_no} ${str(one(b.guests)?.full_name)} (${nice(str(b.check_in))})`), 3)}.`, cause: "An arrival that never came stays 'reserved' and keeps holding its room in availability and on the channels.", fix: "At the front desk, check them in if they are here, or mark no-show to free the room.", go: "/frontdesk" });
    const held = new Set(inn.map((b) => str(b.room_id))); const ghost = rm.filter((r) => !held.has(str(r.id)));
    if (ghost.length) out.push({ level: "warning", area: "Stays", what: `Room ${list(ghost.map((r) => str(r.number)))} ${ghost.length > 1 ? "show" : "shows"} occupied with no guest checked in.`, cause: "The room's status was set by hand, or a checkout didn't move it on to cleaning. It won't be offered for sale.", fix: "In Rooms, set its real status (cleaning or available).", go: "/rooms" });
    return out;
  } },
  { area: "Housekeeping", needs: ["housekeeping"], run: async (s, rid) => {
    const old = (await rows(s.from("housekeeping_tasks").select("kind, created_at, place, rooms(number)").eq("restaurant_id", rid).neq("status", "done").order("created_at").limit(200))).filter((t) => mins(t.created_at) > 24 * 60);
    return old.length ? [{ level: "warning", area: "Housekeeping", what: `${old.length} housekeeping task${old.length > 1 ? "s have" : " has"} been open for over a day: ${list(old.map((t) => `${str(one(t.rooms)?.number || t.place)} ${str(t.kind)}`))}.`, cause: "The work was probably done but never marked done, or it was assigned to someone who is off.", fix: "Open Housekeeping and close them, or give them to someone on shift.", go: "/housekeeping" }] : [];
  } },
  { area: "Room channels", needs: ["channels"], run: async (s, rid) => {
    const [ch, log] = await Promise.all([
      rows(s.from("ota_channels").select("label, kind, last_error, last_import_at").eq("restaurant_id", rid).eq("is_live", true)),
      rows(s.from("ota_sync_log").select("ok").eq("restaurant_id", rid).eq("ok", false).gte("created_at", new Date(Date.now() - 864e5).toISOString())),
    ]);
    const broken = ch.filter((c) => c.last_error);
    return broken.length ? [{ level: "problem", area: "Room channels", what: `${list(broken.map((c) => str(c.label || c.kind)))} ${broken.length > 1 ? "are" : "is"} failing to sync (${log.length} failed attempt${log.length === 1 ? "" : "s"} in the last day). Last error: "${noLinks(str(broken[0].last_error))}".`,
      cause: "A channel stops syncing when its iCal link or API details change on the OTA's side, or the OTA is down. While it fails, new OTA bookings don't arrive and your availability there goes stale — the main way double bookings happen.",
      fix: "Open Channels, check the channel's link or details against the OTA extranet, and press Sync now.", go: "/channels" }] : [];
  } },
  { area: "Online orders", needs: ["online-orders"], run: async (s, rid) => {
    const um = (await rows(s.from("online_orders").select("display_id, unmatched").eq("restaurant_id", rid).not("status", "in", "(rejected,cancelled)").gte("placed_at", new Date(Date.now() - 7 * 864e5).toISOString()).limit(500))).filter((o) => Array.isArray(o.unmatched) && o.unmatched.length);
    return um.length ? [{ level: "warning", area: "Online orders", what: `${um.length} online order${um.length > 1 ? "s" : ""} this week had dishes that didn't match your menu.`, cause: "Swiggy and Zomato send dish names as they appear on their menus. When a name differs from yours, the dish can't be put on the kitchen ticket or taken out of stock.", fix: "In Online orders, map each unmatched name to your dish once; it matches by itself from then on.", go: "/online-orders" }] : [];
  } },
  { area: "Queue", needs: ["pulse"], run: async (s, rid) => {
    const q = await rows(s.from("walkins").select("id, name, status, joined_at, called_at").eq("restaurant_id", rid).in("status", ["waiting", "called"]).order("joined_at").limit(100));
    const gone = q.filter((w) => w.status === "waiting" && mins(w.joined_at) > 120), called = q.filter((w) => w.status === "called" && mins(w.called_at || w.joined_at) > 30);
    const out: Finding[] = [];
    if (gone.length) out.push({ level: "warning", area: "Queue", what: `${list(gone.map((w) => str(w.name)))} ${gone.length > 1 ? "have" : "has"} been "waiting" for over two hours.`, cause: "Parties who give up and leave stay in the queue until someone marks them left, which makes the wait quoted to everyone behind them too long.", fix: "In Pulse, mark them left if they are gone.", go: "/pulse", action: { kind: "walkin_left", label: `Mark ${str(gone[0].name)} as left`, arg: str(gone[0].id) } });
    if (called.length) out.push({ level: "note", area: "Queue", what: `${list(called.map((w) => str(w.name)))} ${called.length > 1 ? "were" : "was"} called over 30 minutes ago and never seated.`, cause: "They were seated without tapping Seat, or didn't come back.", fix: "In Pulse, seat them at their table or mark them left.", go: "/pulse" });
    return out;
  } },
  { area: "Reservations", needs: ["reservations"], run: async (s, rid) => {
    const t = todayIST();
    const rs = await rows(s.from("reservations").select("id, guest_name, on_date, at_time").eq("restaurant_id", rid).in("status", ["requested", "confirmed"]).gte("on_date", addDays(t, -3)).lte("on_date", t).limit(200));
    const missed = rs.filter((x) => Date.now() - Date.parse(`${x.on_date}T${str(x.at_time).slice(0, 5)}:00+05:30`) > 2 * 3600e3);
    return missed.length ? [{ level: "note", area: "Reservations", what: `${missed.length} reservation${missed.length > 1 ? "s are" : " is"} more than two hours past their time and not seated: ${list(missed.map((x) => `${str(x.guest_name)} (${nice(str(x.on_date))} ${str(x.at_time).slice(0, 5)})`), 3)}.`, cause: "Either they didn't come, or they were seated without tapping Seated. Left as they are, they inflate the no-show-free figures and hold the table in the plan.", fix: "In Reservations, mark each one seated or no-show.", go: "/reservations", action: { kind: "reservation_no_show", label: `Mark ${str(missed[0].guest_name)} as no-show`, arg: str(missed[0].id) } }] : [];
  } },
  { area: "Cash-up", needs: ["billing"], run: async (s, rid) => {
    const last = (await rows(s.from("shift_closes").select("business_date, variance").eq("restaurant_id", rid).order("closed_at", { ascending: false }).limit(1)))[0];
    return last && Math.abs(num(last.variance)) >= 100 ? [{ level: "warning", area: "Cash-up", what: `The last cash-up (${nice(str(last.business_date))}) was ${formatINR(Math.abs(num(last.variance)))} ${num(last.variance) < 0 ? "short" : "over"}.`, cause: num(last.variance) < 0 ? "Cash went out of the drawer without being entered as a cash movement or expense, or a UPI or card payment was settled as cash." : "A cash payment was settled as UPI or card, or a cash top-up wasn't recorded.", fix: "In Billing, look over that day's cash movements and settled bills for the mismatch.", go: "/billing" }] : [];
  } },
  { area: "Tax details", needs: ["settings"], boss: true, run: async (_s, _rid, session) => {
    const r = session.restaurant; const out: Finding[] = [];
    if (!r.gstin && (num(r.gst_rate) > 0 || num(r.room_gst_rate) > 0)) out.push({ level: "problem", area: "Tax details", what: "Bills charge GST but no GSTIN is saved for this property.", cause: "Without your GSTIN on them, your bills and invoices aren't valid tax invoices, and business guests can't claim input credit.", fix: "Add the GSTIN in Settings → General.", go: "/settings" });
    if (!r.address || !r.phone) out.push({ level: "note", area: "Tax details", what: `Your property's ${!r.address ? "address" : "phone number"} is missing.`, cause: "It prints on every bill and invoice; a tax invoice must carry the supplier's address.", fix: "Add it in Settings → General.", go: "/settings" });
    return out;
  } },
  { area: "Staff sign-in", needs: ["staff"], boss: true, run: async (s, rid) => {
    const temp = await rows(s.from("profiles").select("full_name").eq("restaurant_id", rid).eq("is_active", true).eq("must_change_password", true).limit(50));
    return temp.length ? [{ level: "note", area: "Staff sign-in", what: `${list(temp.map((p) => str(p.full_name)))} ${temp.length > 1 ? "are" : "is"} still on the temporary password they were given.`, cause: "They haven't signed in since their login was made, or skipped setting their own password. Anyone who saw the temporary one can sign in as them.", fix: "Ask them to sign in and set their own password; the app will prompt them.", go: "/staff" }] : [];
  } },
];

/** Every check this person may run, at once. A check that errors is skipped, never fatal. */
export async function diagnose(s: DB, session: Session) {
  const mods = modulesOf(session); const boss = ["owner", "manager"].includes(session.profile.role);
  const mine = CHECKS.filter((c) => c.needs.some((n) => mods.includes(n)) && (!c.boss || boss));
  const found = (await Promise.all(mine.map((c) => c.run(s, session.restaurant.id, session).catch(() => [] as Finding[])))).flat();
  const rank = { problem: 0, warning: 1, note: 2 } as const;
  return { checked: mine.map((c) => c.area), findings: found.sort((a, b) => rank[a.level] - rank[b.level]) };
}

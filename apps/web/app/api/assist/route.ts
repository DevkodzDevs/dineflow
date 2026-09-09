import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";

/**
 * Assist: one assistant on every screen. It is given only the facts of the screen it is on —
 * numbers already visible to the person — and it answers in plain words. It never writes to the
 * database; every suggestion it makes is something the person then does on the screen.
 * Without ANTHROPIC_API_KEY it still answers the arithmetic questions from the facts alone.
 */
export const dynamic = "force-dynamic";
type Msg = { role: "user" | "assistant"; content: string };

const SCREEN: Record<string, string> = { dashboard: "Control room", orders: "Orders", kitchen: "Kitchen", billing: "Billing", inventory: "Pantry", menu: "Menu", rooms: "Rooms", frontdesk: "Front desk", housekeeping: "Housekeeping", guests: "Guests", facilities: "Facilities", reservations: "Reservations", pulse: "Pulse", tomorrow: "Tomorrow's brief", neighbours: "Neighbours", proof: "Proof of business", labour: "Labour", reports: "Reports", staff: "Staff", settings: "Settings", "online-orders": "Online orders", invoices: "Invoices", channels: "Channels", scan: "Scan" };

/** Gather the facts for the screen. Every branch reads; none writes. */
async function facts(section: string, s: Awaited<ReturnType<typeof createClient>>) {
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const since = `${today}T00:00:00+05:30`;
  const j = async <T,>(p: PromiseLike<{ data: T }>) => (await p).data;
  switch (section) {
    case "kitchen": {
      const kots = await j(s.from("kots").select("kot_no, status, created_at, orders(order_no, type, dining_tables(name)), order_items(name_snapshot, qty, status, notes)").in("status", ["pending", "preparing", "ready"]).order("created_at"));
      return { tickets: (kots ?? []).map((k: Record<string, unknown>) => ({ ...k, minutes: Math.round((Date.now() - new Date(String(k.created_at)).getTime()) / 60000) })) };
    }
    case "inventory": { const [low, leak] = await Promise.all([j(s.from("v_low_stock").select("name, unit, current_stock, reorder_level")), j(s.rpc("leak_report", { p_days: 30 }))]); return { low_stock: low, leaks: leak }; }
    case "pulse": { const [p, q] = await Promise.all([j(s.rpc("table_pulse")), j(s.from("walkins").select("name, party, quoted_min, status, joined_at").in("status", ["waiting", "called"]).order("joined_at"))]); return { tables: p, queue: q }; }
    case "billing": { const [e, open] = await Promise.all([j(s.rpc("shift_expected")), j(s.from("bills").select("bill_no, total, status, created_at").eq("status", "unpaid"))]); return { till: e, unpaid_bills: open }; }
    case "tomorrow": return { brief: await j(s.rpc("forecast_day")) };
    case "neighbours": { const [st, pr] = await Promise.all([j(s.rpc("network_status")), j(s.rpc("network_prices", { p_days: 21 }))]); return { status: st, price_index: pr }; }
    case "proof": return { chain: await j(s.rpc("verify_chain")), record: await j(s.rpc("business_record")) };
    case "reservations": return { today: await j(s.from("reservations").select("at_time, guest_name, party, occasion, note, status").eq("on_date", today).order("at_time")) };
    case "rooms": case "frontdesk": case "housekeeping": {
      const [rooms, bk, hk] = await Promise.all([j(s.from("rooms").select("number, status, room_types(name)")), j(s.from("bookings").select("status, check_in, check_out, rate, rooms(number), guests(full_name)").in("status", ["reserved", "checked_in"])), j(s.from("housekeeping_tasks").select("status, rooms(number)").neq("status", "done"))]);
      return { rooms, bookings: bk, housekeeping: hk };
    }
    case "menu": { const [items, sold] = await Promise.all([j(s.from("menu_items").select("name, price, is_veg, is_available, category_id").eq("is_active", true)), j(s.from("order_items").select("name_snapshot, qty").gte("created_at", since).neq("status", "cancelled"))]); return { items, sold_today: sold }; }
    case "labour": return { today: await j(s.from("labour_attendance").select("work_date, in_at, out_at, wage, labourers(full_name, skill)").eq("work_date", today)) };
    case "reports": return { months: await j(s.from("day_closes").select("business_date, total_sales, orders_count").order("business_date", { ascending: false }).limit(31)) };
    case "orders": case "online-orders": return { open_orders: await j(s.from("orders").select("order_no, type, status, created_at, customer_name, dining_tables(name), order_items(name_snapshot, qty, status)").eq("status", "open")), online: await j(s.from("online_orders").select("status, gross, placed_at").gte("placed_at", since)) };
    default: {
      const [bills, open, kots, low, tables] = await Promise.all([j(s.from("bills").select("total").eq("status", "paid").gte("paid_at", since)), j(s.from("orders").select("id", { count: "exact", head: true }).eq("status", "open")), j(s.from("kots").select("status, created_at").in("status", ["pending", "preparing", "ready"])), j(s.from("v_low_stock").select("name, current_stock, unit").limit(8)), j(s.from("dining_tables").select("status"))]);
      return { sales_today: (bills ?? []).reduce((t: number, b: { total: number }) => t + Number(b.total), 0), bills_today: bills?.length ?? 0, open_orders: open, tickets_in_kitchen: kots?.length ?? 0, late_tickets: (kots ?? []).filter((k: { created_at: string; status: string }) => k.status !== "ready" && Date.now() - new Date(k.created_at).getTime() > 15 * 60000).length, low_stock: low, tables_occupied: (tables ?? []).filter((t: { status: string }) => t.status === "occupied").length, tables: tables?.length ?? 0 };
    }
  }
}

/** A light snapshot of the whole house, sent with every screen so answers can cross sections. */
async function house(s: Awaited<ReturnType<typeof createClient>>) {
  const since = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10) + "T00:00:00+05:30";
  const j = async <T,>(p: PromiseLike<{ data: T }>) => (await p).data;
  const [bills, kots, low, tables, queue, unpaid, hk, arr] = await Promise.all([
    j(s.from("bills").select("total").eq("status", "paid").gte("paid_at", since)),
    j(s.from("kots").select("kot_no, status, created_at, orders(dining_tables(name))").in("status", ["pending", "preparing", "ready"])),
    j(s.from("v_low_stock").select("name, current_stock, unit, reorder_level")),
    j(s.from("dining_tables").select("name, status")),
    j(s.from("walkins").select("name, party, joined_at, status").in("status", ["waiting", "called"])),
    j(s.from("bills").select("bill_no, total, created_at").eq("status", "unpaid")),
    j(s.from("housekeeping_tasks").select("status, rooms(number)").neq("status", "done")),
    j(s.from("bookings").select("check_in, status, guests(full_name), rooms(number, status)").eq("status", "reserved").lte("check_in", since.slice(0, 10))),
  ]);
  const late = (kots ?? []).filter((k: { created_at: string; status: string }) => k.status !== "ready" && Date.now() - new Date(k.created_at).getTime() > 15 * 60000);
  return {
    sales_today: (bills ?? []).reduce((t: number, b: { total: number }) => t + Number(b.total), 0), bills_today: bills?.length ?? 0,
    tickets: kots?.length ?? 0, late_tickets: late.map((k: Record<string, unknown>) => ({ kot: k.kot_no, table: (k.orders as { dining_tables?: { name?: string } })?.dining_tables?.name, minutes: Math.round((Date.now() - new Date(String(k.created_at)).getTime()) / 60000) })),
    ready_to_serve: (kots ?? []).filter((k: { status: string }) => k.status === "ready").length,
    low_stock: low ?? [], tables_occupied: (tables ?? []).filter((t: { status: string }) => t.status === "occupied").length, tables: tables?.length ?? 0,
    queue: (queue ?? []).map((w: { name: string; party: number; joined_at: string; status: string }) => ({ ...w, minutes: Math.round((Date.now() - new Date(w.joined_at).getTime()) / 60000) })),
    unpaid_bills: (unpaid ?? []).map((b: { bill_no: number; total: number; created_at: string }) => ({ ...b, minutes: Math.round((Date.now() - new Date(b.created_at).getTime()) / 60000) })),
    rooms_to_turn: (hk ?? []).length, arrivals_waiting_on_rooms: ((arr ?? []) as unknown as { rooms?: { status?: string } | { status?: string }[] }[]).filter((b) => { const r = Array.isArray(b.rooms) ? b.rooms[0] : b.rooms; return !!r?.status && r.status !== "available"; }).length,
  };
}
type House = Awaited<ReturnType<typeof house>>;
export type Insight = { tone: "alert" | "warn" | "good" | "info"; text: string; go?: string; action?: Action };
export type Action = { kind: "call_walkin" | "reorder_message" | "open"; label: string; args: Record<string, string | number> };

/** Things worth saying before anyone asks. Plain rules, no model — they run on every open and show on the mark. */
function insights(h: House, section: string): Insight[] {
  const out: Insight[] = [];
  for (const k of h.late_tickets.slice(0, 2)) out.push({ tone: "alert", text: `KOT #${k.kot}${k.table ? ` for ${k.table}` : ""} has been in the kitchen ${k.minutes} minutes.`, go: "/kitchen" });
  if (h.ready_to_serve >= 2) out.push({ tone: "warn", text: `${h.ready_to_serve} tickets are ready and waiting to be carried out.`, go: "/kitchen" });
  const q = h.queue.filter((w) => w.status === "waiting"); const oldest = q.sort((a, b) => b.minutes - a.minutes)[0];
  if (oldest && oldest.minutes >= 15) out.push({ tone: "warn", text: `${oldest.name} (party of ${oldest.party}) has waited ${oldest.minutes} minutes — call them before they walk.`, go: "/pulse" });
  if (h.tables && h.tables_occupied / h.tables >= 0.9 && q.length === 0 && section !== "pulse") out.push({ tone: "info", text: `Floor is ${Math.round(h.tables_occupied / h.tables * 100)}% full. Open Pulse if a queue starts.`, go: "/pulse" });
  for (const b of h.unpaid_bills.filter((b) => b.minutes > 20).slice(0, 1)) out.push({ tone: "warn", text: `Bill #${b.bill_no} (₹${Number(b.total).toLocaleString("en-IN")}) was printed ${b.minutes} minutes ago and is still unpaid.`, go: "/billing" });
  if (h.low_stock.length) { const names = h.low_stock.slice(0, 3).map((i: { name: string }) => i.name).join(", "); out.push({ tone: h.low_stock.length >= 3 ? "alert" : "warn", text: `${h.low_stock.length} ingredient${h.low_stock.length > 1 ? "s" : ""} below reorder: ${names}${h.low_stock.length > 3 ? "…" : ""}.`, go: "/inventory", action: { kind: "reorder_message", label: "Draft the supplier message", args: {} } }); }
  if (h.arrivals_waiting_on_rooms) out.push({ tone: "alert", text: `${h.arrivals_waiting_on_rooms} arrival${h.arrivals_waiting_on_rooms > 1 ? "s" : ""} today whose room isn't ready yet.`, go: "/housekeeping" });
  else if (h.rooms_to_turn >= 4) out.push({ tone: "info", text: `${h.rooms_to_turn} rooms still to turn.`, go: "/housekeeping" });
  if (out.length === 0) out.push({ tone: "good", text: h.bills_today ? `Quiet and in order: ₹${h.sales_today.toLocaleString("en-IN")} from ${h.bills_today} bills so far, nothing late.` : "Nothing needs you right now." });
  return out.slice(0, 4);
}

export async function POST(req: Request) {
  const { path, messages, mode } = (await req.json()) as { path: string; messages?: Msg[]; mode?: "insights" | "chat" };
  const session = await requireSession(); const s = await createClient();
  const section = (path.split("/")[1] || "dashboard").toLowerCase();
  const screen = SCREEN[section] ?? "DineFlow";
  const h = await house(s);
  if (mode === "insights") return NextResponse.json({ screen, insights: insights(h, section), house: { sales: h.sales_today, late: h.late_tickets.length, waiting: h.queue.length, low: h.low_stock.length } });
  const ctx = { ...(await facts(section, s)), whole_house: h };
  const key = process.env.ANTHROPIC_API_KEY;
  const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
  if (!key) {
    return NextResponse.json({ reply: `I can read this screen, but answering in words needs an Anthropic key on the server (ANTHROPIC_API_KEY). Here is what I can see right now:\n\n${summarise(ctx)}`, demo: true, screen });
  }
  const acts = `You may end a reply with at most one action the person can confirm with a tap, on its own line, in exactly this form: <action kind="…" label="…" arg="…"/>. Allowed kinds: call_walkin (arg = the walk-in's id, to page a waiting party), reorder_message (arg empty, drafts a WhatsApp message to the supplier for everything below reorder), open (arg = a path like /kitchen, to jump to a screen). Use one only when it is clearly the next step; otherwise none. Never claim an action has happened — it runs only after the tap.`;
  const system = `You are Assist inside DineFlow, a hospitality app for restaurants, hotels and resorts in India. The person is ${session.profile.full_name} (${session.profile.role}) at ${session.restaurant.name}, a ${session.restaurant.property_type}. It is ${now} IST. They are looking at the "${screen}" screen.
Answer only from the facts below and general hospitality sense. Be brief and concrete: a number, a name, the next thing to do. Use ₹ and Indian grouping (1,84,320). Plain words, no headings, no bullet lists unless listing more than three things. If the facts don't contain the answer, say what to open or count instead of guessing. Think first about what actually matters for this person at this moment — service is running, so lead with the most urgent thing and give the reason in one clause. Compare against the whole house when it helps (kitchen load vs the queue, cash vs bills, arrivals vs rooms). ${acts} Never invent figures.
FACTS (JSON): ${JSON.stringify(ctx).slice(0, 14000)}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 600, stream: true, system, messages: (messages ?? []).slice(-8).map((m) => ({ role: m.role, content: m.content })) }),
  });
  if (!res.ok || !res.body) return NextResponse.json({ error: `Assist could not reach Claude (${res.status})` }, { status: 502 });
  // pass the text deltas straight through as a plain stream — the panel renders as the words arrive
  const reader = res.body.getReader(); const dec = new TextDecoder(); const enc = new TextEncoder();
  const stream = new ReadableStream({
    async pull(ctrl) {
      const { value, done } = await reader.read(); if (done) { ctrl.close(); return; }
      for (const line of dec.decode(value, { stream: true }).split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try { const ev = JSON.parse(line.slice(6)); if (ev.type === "content_block_delta" && ev.delta?.text) ctrl.enqueue(enc.encode(ev.delta.text)); } catch { /* keep-alive lines */ }
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "x-assist-screen": screen, "cache-control": "no-store" } });
}

/** The no-key fallback: the facts, readably. */
function summarise(ctx: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(ctx)) {
    if (v == null) continue;
    if (typeof v === "number" || typeof v === "string") lines.push(`${k.replace(/_/g, " ")}: ${typeof v === "number" ? v.toLocaleString("en-IN") : v}`);
    else if (Array.isArray(v)) lines.push(`${k.replace(/_/g, " ")}: ${v.length} item${v.length === 1 ? "" : "s"}`);
    else if (typeof v === "object") { const o = v as Record<string, unknown>; const nums = Object.entries(o).filter(([, x]) => typeof x === "number" || typeof x === "string").slice(0, 6); if (nums.length) lines.push(`${k.replace(/_/g, " ")}: ` + nums.map(([a, b]) => `${a.replace(/_/g, " ")} ${b}`).join(" · ")); }
  }
  return lines.join("\n") || "Nothing to report on this screen yet.";
}

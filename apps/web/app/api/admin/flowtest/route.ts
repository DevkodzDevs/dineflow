import { NextResponse } from "next/server";
import { createClient as createSb, type SupabaseClient, type Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { loginCandidates, modulesFor, type PropertyType, type Role } from "@dineflow/shared";
import { todayIST } from "@/lib/format";
import { FLOWS, type Kind } from "@/lib/flowtest/catalog";

/**
 * Master control → Flow tests: the server side (2026-11-02). POST, master only:
 *   { op: "step", id, ctx }   one step of a run — returns its checks and the run's context, grown by what it made
 *   { op: "finish", ctx }     expire and sweep the run's throwaway properties (their logins go with them)
 *   { op: "save", ... }       keep the run's result in selftest_runs as suite "flow:<mode>" (Testing leaves those out)
 *
 * A run works on two demo properties made for it (create_demo_sandbox), as their owner and their staff, through the very
 * functions the screens call — place_order, generate_bill, settle_bill, create_booking, check_out, clean_take … — so a flow
 * that passes here is one a person can do. The master's own session is used only for flowtest_admin (0161: every section
 * on, staff without the forced password change, a table freed, a job aged, the sweep), which refuses a real property.
 * Pages are fetched from this same deployment with the demo person's session cookie, exactly as a browser would.
 * The run's context (the demo sessions and the ids made so far) lives in the master's browser between steps; it opens
 * nothing but the throwaway properties, which expire in 8 hours even if a run is abandoned.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Status = "pass" | "warn" | "fail" | "skip";
type Check = { name: string; status: Status; detail?: string; ms?: number; fix?: string };
type Who = { id: string; email: string; role: string; session: Session };
type Prop = { rid: string; slug: string; booking_slug: string | null; type: PropertyType; owner: Who; staff: Record<string, Who> };
type Ctx = { r?: Prop; h?: Prop; vars: Record<string, string | number | null> };
type Sb = SupabaseClient;
type Env = { ctx: Ctx; origin: string; master: Awaited<ReturnType<typeof createClient>>; anon: Sb; as: (w: Who) => Sb; p: (k: Kind) => Prop };

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const REF = SB ? new URL(SB).hostname.split(".")[0] : "";
const quiet = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const anonClient = () => createSb(SB, KEY, quiet);
const userClient = (w: Who) => createSb(SB, KEY, { ...quiet, global: { headers: { Authorization: `Bearer ${w.session.access_token}` } } });

class Stop extends Error {}
const pass = (name: string, detail?: string, ms?: number): Check => ({ name, status: "pass", detail, ms });
const fail = (name: string, detail: string, fix?: string): Check => ({ name, status: "fail", detail, fix });
const warn = (name: string, detail: string, fix?: string): Check => ({ name, status: "warn", detail, fix });
/** a check that must hold for the step to go on */
const must = <T,>(v: T | null | undefined, name: string, detail: string, fix?: string): T => { if (v === null || v === undefined || v === false) throw Object.assign(new Stop(name), { check: fail(name, detail, fix) }); return v; };
const near = (a: number, b: number, d = 0.011) => Math.abs(Number(a) - Number(b)) <= d;
const money = (n: number) => `₹${Number(n).toFixed(2)}`;
const tomorrow = () => { const d = new Date(`${todayIST()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

async function signIn(login: string, password: string, role: string): Promise<Who> {
  const c = anonClient(); let last = "no such login";
  for (const email of loginCandidates(login).concat(login.includes("@") ? [login] : [])) {
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (!error && data.session) return { id: data.session.user.id, email, role, session: data.session };
    last = error?.message ?? last;
  }
  throw new Error(`${login}: ${last}`);
}

/** the session cookie @supabase/ssr reads, chunked the way it writes it */
function cookieFor(s: Session) {
  const val = "base64-" + Buffer.from(JSON.stringify(s)).toString("base64url");
  const parts = val.length <= 3180 ? [[`sb-${REF}-auth-token`, val]] : Array.from({ length: Math.ceil(val.length / 3180) }, (_, i) => [`sb-${REF}-auth-token.${i}`, val.slice(i * 3180, (i + 1) * 3180)]);
  return parts.map(([k, v]) => `${k}=${v}`).join("; ");
}

/** A page as a browser gets it: redirects followed (HTTP or Next's meta refresh), where it ended, how long, and whether it crashed. */
async function page(origin: string, path: string, who: Who | null) {
  const t0 = Date.now(); let url = new URL(path, origin).toString(); let status = 0; let html = "";
  for (let hop = 0; hop < 4; hop++) {
    const r = await fetch(url, { headers: { ...(who ? { cookie: cookieFor(who.session) } : {}), "user-agent": "DineFlow flow test" }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(25000) });
    status = r.status;
    if (status >= 300 && status < 400 && r.headers.get("location")) { url = new URL(r.headers.get("location")!, url).toString(); continue; }
    html = await r.text();
    const meta = html.match(/<meta[^>]+id="__next-page-redirect"[^>]+content="\d+;url=([^"]+)"/i);
    if (meta && hop < 3) { url = new URL(meta[1].replace(/&amp;/g, "&"), url).toString(); continue; }
    break;
  }
  const at = new URL(url);
  return { status, at: at.pathname, query: at.search, ms: Date.now() - t0, crashed: /data-error-screen|Application error: a (client|server)-side exception/i.test(html), size: html.length };
}
const pageCheck = (name: string, r: Awaited<ReturnType<typeof page>>, want: string): Check => {
  if (r.status >= 500) return fail(name, `server error ${r.status} after ${r.ms} ms`, "Open the page while acting as a property and read the error card; the crash log under Testing has it too.");
  if (r.crashed) return fail(name, `the error screen showed (${r.ms} ms)`, "The crash log under Master control → Testing names the error.");
  if (r.at !== want) return fail(name, `ended on ${r.at}${r.query} instead of ${want}`, r.at === "/login" ? "The session did not reach the page — check the middleware." : "The layout sent this person elsewhere: a section they do not hold, or a redirect.");
  if (r.status !== 200) return fail(name, `answered ${r.status}`);
  return r.ms > 2500 ? warn(name, `${r.ms} ms — slow`, "Over 2.5 s for a whole page: a cold start, or a slow query on this screen (Testing → Speed).") : pass(name, `${r.ms} ms`, r.ms);
};

/* ── the run's people ─────────────────────────────────────────────────────────────────────────────────────────────────── */
const STAFF: Record<Kind, [key: string, name: string, role: Role, position: string, dept: string][]> = {
  r: [["waiter", "Wendy Waiter", "waiter", "steward", "service"], ["chef", "Chandra Chef", "chef", "commis_2", "kitchen"],
      ["cashier", "Kavi Cashier", "cashier", "fnb_cashier", "service"], ["cleaner", "Cathy Cleaner", "employee", "cleaner", "housekeeping"]],
  h: [["desk", "Divya Desk", "frontdesk", "front_office_associate", "front_office"], ["attendant", "Ravi Attendant", "housekeeping", "room_attendant", "housekeeping"]],
};
const staffOf = (e: Env, k: Kind, key: string) => must(e.p(k).staff[key], `${key} is on the staff`, "the setup step did not make this person — run the whole flow, not a single step");

/* ── the steps ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
type Run = (e: Env) => Promise<Check[]>;
const setup = (k: Kind): Run => async (e) => {
  const t0 = Date.now(); const what = k === "r" ? "restaurant" : "hotel";
  const { data, error } = await e.anon.rpc("create_demo_sandbox", { p_type: what });
  if (error) return [fail(`A throwaway ${what} is made`, error.message, /Too many/.test(error.message) ? "Ten demo properties an hour is the limit — wait a few minutes." : undefined)];
  const d = data as { login_email: string; password: string };
  const owner = await signIn(d.login_email, d.password, "owner");
  const oc = e.as(owner);
  const { data: me } = await oc.from("profiles").select("restaurant_id").eq("id", owner.id).single();
  const rid = must((me as { restaurant_id: string } | null)?.restaurant_id, "The owner belongs to it", "the demo owner has no property");
  const { data: prep, error: pe } = await e.master.rpc("flowtest_admin", { p_op: "prepare", p_rid: rid });
  if (pe) return [fail("Every section switched on for the test", pe.message, "Migration 0161 adds flowtest_admin: run node scripts/migrate.mjs.")];
  const pr = prep as { slug: string; booking_slug: string | null; type: PropertyType };
  e.ctx[k] = { rid, slug: pr.slug, booking_slug: pr.booking_slug, type: pr.type, owner, staff: {} };
  const [{ count: tables }, { count: dishes }, { count: rooms }] = await Promise.all([
    oc.from("dining_tables").select("id", { count: "exact", head: true }), oc.from("menu_items").select("id", { count: "exact", head: true }).eq("is_available", true),
    oc.from("rooms").select("id", { count: "exact", head: true })]);
  const checks = [pass(`A throwaway ${what} is made`, `Flow test · ${what === "restaurant" ? "Restaurant" : "Hotel"} · deleted at the end`, Date.now() - t0),
    (tables ?? 0) >= 3 && (dishes ?? 0) >= 3 ? pass("It has tables and a menu", `${tables} tables · ${dishes} dishes`) : fail("It has tables and a menu", `${tables} tables · ${dishes} dishes`, "create_demo_sandbox's sample data is missing.")];
  if (k === "h") checks.push((rooms ?? 0) >= 2 ? pass("It has rooms", `${rooms} rooms`) : fail("It has rooms", `${rooms} rooms`));
  return checks;
};
const staff = (k: Kind): Run => async (e) => {
  const P = e.p(k); const oc = e.as(P.owner); const out: Check[] = []; const made: [string, string, string, Role][] = [];
  for (const [key, name, role, position, dept] of STAFF[k]) {
    const { data, error } = await oc.rpc("staff_create_login", { p_full_name: name, p_role: role, p_modules: null, p_login_id: null, p_contact_email: `flowtest.${key}.${Date.now()}@example.invalid`, p_phone: null });
    if (error) { out.push(fail(`${name} added through Staff`, error.message)); continue; }
    const s = data as { user_id: string; login_id: string; temp_password: string };
    const { error: pe } = await oc.rpc("staff_set_position", { p_user: s.user_id, p_position: position, p_department: dept, p_title: null, p_reports_to: null, p_joined_on: null });
    if (pe) out.push(warn(`${name}'s position`, pe.message));
    made.push([key, s.login_id, s.temp_password, role]);
  }
  await e.master.rpc("flowtest_admin", { p_op: "staff", p_rid: P.rid });
  for (const [key, login, pw, role] of made) {
    try { P.staff[key] = await signIn(login, pw, role); out.push(pass(`${STAFF[k].find((x) => x[0] === key)![1]} signs in`, `${role} · ${login}`)); }
    catch (err) { out.push(fail(`${key} signs in`, (err as Error).message)); }
  }
  return out;
};

const STEPS: Record<string, Run> = {
  "setup:r": setup("r"), "setup:h": setup("h"), "staff:r": staff("r"), "staff:h": staff("h"),

  /* Sign-in & roles */
  "signin:owner": async (e) => {
    const P = e.p("r"); const { data } = await e.as(P.owner).rpc("session_bundle");
    const b = data as { profile?: { role: string } } | null;
    return [b?.profile?.role === "owner" ? pass("The owner's session knows them", "role owner") : fail("The owner's session knows them", JSON.stringify(b?.profile ?? null)),
      pageCheck("The Control room opens", await page(e.origin, "/dashboard", P.owner), "/dashboard")];
  },
  "signin:roles": async (e) => {
    const P = e.p("r"); const out: Check[] = [];
    // a cleaner (employee) holds no section of their own — they land on My day and the Cleaning board, both open to every role
    const want: Record<string, [string | null, string[]]> = { waiter: ["orders", ["settings", "billing", "staff", "housekeeping"]], chef: ["kitchen", ["settings", "billing", "orders"]], cashier: ["billing", ["settings", "kitchen", "staff"]], cleaner: [null, ["settings", "staff", "housekeeping", "reports", "billing"]] };
    for (const [key, w] of Object.entries(P.staff)) {
      if (!want[key]) continue;
      const { data } = await e.as(w).rpc("session_bundle");
      const b = data as { profile: { role: Role; allowed_modules?: string[] | null }; restaurant: { property_type: PropertyType; enabled_modules?: string[] | null } };
      const mods = modulesFor(b.restaurant.property_type, b.profile.role, b.restaurant.enabled_modules ?? null, b.profile.allowed_modules ?? null);
      const [has, not] = want[key]; const wrong = not.filter((m) => mods.includes(m));
      out.push((!has || mods.includes(has)) && !wrong.length ? pass(`${key[0].toUpperCase()}${key.slice(1)} holds their own sections only`, mods.join(", ") || "none — My day and the Cleaning board")
        : fail(`${key[0].toUpperCase()}${key.slice(1)} holds their own sections only`, `has ${mods.join(", ") || "nothing"}${wrong.length ? ` — should not have ${wrong.join(", ")}` : ` — missing ${has}`}`, "Staff → their ticks, and role_modules' ceiling (Stage 2 of the testing flow)."));
    }
    out.push(pageCheck("The cleaner's Cleaning board opens", await page(e.origin, "/cleaning", staffOf(e, "r", "cleaner")), "/cleaning"));
    const pg = await page(e.origin, "/settings", staffOf(e, "r", "waiter"));
    out.push(pg.at !== "/settings" ? pass("A waiter cannot open Settings", `sent to ${pg.at}`) : fail("A waiter cannot open Settings", "Settings opened for a waiter"));
    return out;
  },
  "signin:home": async (e) => {
    const w = staffOf(e, "r", "waiter"); const r = await page(e.origin, "/dashboard", w);
    return [r.at === "/home" ? pass("The Control room sends a waiter to My day", `${r.ms} ms`) : fail("The Control room sends a waiter to My day", `ended on ${r.at}`),
      pageCheck("My day opens", await page(e.origin, "/home", w), "/home")];
  },
  "signin:temp": async (e) => {
    const P = e.p("r");
    const { data, error } = await e.as(P.owner).rpc("staff_create_login", { p_full_name: "Tina Temporary", p_role: "waiter", p_modules: null, p_login_id: null, p_contact_email: `flowtest.temp.${Date.now()}@example.invalid`, p_phone: null });
    if (error) return [fail("A login with a temporary password", error.message)];
    const s = data as { login_id: string; temp_password: string };
    const t = await signIn(s.login_id, s.temp_password, "waiter"); P.staff.temp = t;
    const r = await page(e.origin, "/home", t);
    return [pass("A login with a temporary password signs in", s.login_id),
      r.at === "/account/password" ? pass("It is sent to Choose your password first", `${r.ms} ms`) : fail("It is sent to Choose your password first", `ended on ${r.at}`, "app/(app)/layout.tsx: must_change_password → /account/password.")];
  },

  /* Order */
  "order:place": async (e) => {
    const w = e.as(staffOf(e, "r", "waiter"));
    // 0166: a free table being cleaned takes no order — the run starts on tables nobody is cleaning
    const [{ data: free }, { data: cleans }] = await Promise.all([w.from("dining_tables").select("id, name").eq("status", "free").order("sort_order").limit(30),
      w.from("table_cleanings").select("table_id").in("status", ["pending", "in_progress"])]);
    const dirty = new Set(((cleans ?? []) as { table_id: string }[]).map((c) => c.table_id));
    const tables = ((free ?? []) as { id: string; name: string }[]).filter((t) => !dirty.has(t.id)).slice(0, 6);
    const { data: linked } = await w.from("menu_item_addon_groups").select("menu_item_id");
    const skip = new Set(((linked ?? []) as { menu_item_id: string }[]).map((x) => x.menu_item_id));
    const { data: menu } = await w.from("menu_items").select("id, name, price").eq("is_available", true).order("name").limit(60);
    const dishes = ((menu ?? []) as { id: string; name: string; price: number }[]).filter((m) => !skip.has(m.id)).slice(0, 3);
    const T = (tables ?? []) as { id: string; name: string }[];
    must(T.length >= 4 && dishes.length >= 2, "A free table and two dishes", `${T.length} free tables · ${dishes.length} plain dishes`);
    e.ctx.vars = { ...e.ctx.vars, table: T[0].id, tableName: T[0].name, table2: T[1].id, table3: T[2].id, table4: T[3].id, dish1: dishes[0].id, dish2: dishes[1].id };
    const t0 = Date.now();
    const { data: oid, error } = await w.rpc("place_order", { p_table_id: T[0].id, p_type: "dine_in", p_items: [{ menu_item_id: dishes[0].id, qty: 2 }, { menu_item_id: dishes[1].id, qty: 1 }], p_customer: { name: null, phone: null }, p_note: "flow test", p_client_id: null, p_placed_at: null, p_promise: false });
    if (error) return [fail("The waiter takes an order", error.message)];
    e.ctx.vars.order = oid as string;
    const [{ data: o }, { data: lines }, { data: t }, { data: k }] = await Promise.all([
      w.from("orders").select("status, created_by").eq("id", oid).single(), w.from("order_items").select("qty").eq("order_id", oid),
      w.from("dining_tables").select("status").eq("id", T[0].id).single(), w.from("kots").select("id").eq("order_id", oid)]);
    const qty = ((lines ?? []) as { qty: number }[]).reduce((a, l) => a + l.qty, 0);
    return [pass("The waiter takes an order", `${T[0].name} · ${dishes[0].name} ×2, ${dishes[1].name} ×1`, Date.now() - t0),
      (o as { status: string })?.status === "open" && qty === 3 ? pass("The order is open with its three dishes", `${(lines ?? []).length} lines · ${qty} dishes`) : fail("The order is open with its three dishes", `${(o as { status: string })?.status} · ${qty} dishes`),
      (t as { status: string })?.status === "occupied" ? pass(`${T[0].name} is in use`) : fail(`${T[0].name} is in use`, `table is ${(t as { status: string })?.status}`),
      (k ?? []).length ? pass("A kitchen ticket is made", `${(k ?? []).length} ticket`) : fail("A kitchen ticket is made", "no ticket")];
  },
  "order:kitchen": async (e) => {
    const c = e.as(staffOf(e, "r", "chef")); const oid = must(e.ctx.vars.order as string, "The order from the step before", "run the Order flow from its first step");
    const st = async () => ((await c.from("kots").select("status").eq("order_id", oid)).data ?? []).map((x) => (x as { status: string }).status);
    const a = await c.from("order_items").update({ status: "preparing" }).eq("order_id", oid).neq("status", "cancelled");
    const s1 = await st();
    const b = await c.from("order_items").update({ status: "ready" }).eq("order_id", oid).neq("status", "cancelled");
    const s2 = await st();
    return [!a.error && s1.every((x) => x === "preparing") ? pass("Start cooking: the ticket is preparing") : fail("Start cooking: the ticket is preparing", a.error?.message ?? s1.join(", ")),
      !b.error && s2.every((x) => x === "ready") ? pass("Ready: the ticket is at the pass") : fail("Ready: the ticket is at the pass", b.error?.message ?? s2.join(", "))];
  },
  "order:ready": async (e) => {
    const w = staffOf(e, "r", "waiter"); const oid = e.ctx.vars.order as string;
    const { data } = await e.as(w).from("kots").select("id, orders!inner(created_by, status)").eq("status", "ready").eq("order_id", oid);
    const row = ((data ?? []) as unknown as { orders: { created_by: string } }[])[0];
    return [row && row.orders.created_by === w.id ? pass("It is in the waiter's Your orders ready", "taken by them, at the pass") : fail("It is in the waiter's Your orders ready", row ? "taken by someone else" : "not found")];
  },
  "order:served": async (e) => {
    const w = e.as(staffOf(e, "r", "waiter")); const oid = e.ctx.vars.order as string;
    const { error } = await w.from("order_items").update({ status: "served" }).eq("order_id", oid).neq("status", "cancelled");
    const { data } = await w.from("kots").select("status, served_at").eq("order_id", oid);
    const k = (data ?? []) as { status: string; served_at: string | null }[];
    return [!error && k.length && k.every((x) => x.status === "served" && x.served_at) ? pass("Served: the ticket is closed and timed") : fail("Served: the ticket is closed and timed", error?.message ?? JSON.stringify(k))];
  },
  "order:more": async (e) => {
    const w = e.as(staffOf(e, "r", "waiter")); const v = e.ctx.vars;
    // 0166: a table with an order open takes no second one — the next round joins the order (Add items, 0165), and a part of
    // it billed on its own is a Split bill (two orders on one table, on purpose)
    const { error: refused } = await w.rpc("place_order", { p_table_id: v.table, p_type: "dine_in", p_items: [{ menu_item_id: v.dish2, qty: 1 }], p_customer: { name: null, phone: null }, p_note: null, p_client_id: null, p_placed_at: null, p_promise: false });
    const { error } = await w.rpc("order_add_items", { p_order_id: v.order, p_items: [{ menu_item_id: v.dish2, qty: 1 }], p_note: null });
    if (error) return [fail("A second round on the same table", error.message)];
    const { data: added } = await w.from("order_items").select("id, kot_id").eq("order_id", v.order).eq("menu_item_id", v.dish2).order("created_at", { ascending: false }).limit(1);
    const line = ((added ?? []) as { id: string }[])[0];
    const { data: oid, error: se } = await w.rpc("split_order", { p_order_id: v.order, p_lines: [{ id: line?.id }] });
    if (se) return [fail("A second round on the same table", `split: ${se.message}`)];
    e.ctx.vars.order2 = oid as string;
    const { data } = await w.from("orders").select("id").eq("table_id", v.table).eq("status", "open");
    return [refused && /already has #/.test(refused.message) ? pass("A busy table takes no second order", refused.message) : fail("A busy table takes no second order", refused?.message ?? "a second order was opened", "0166's place_order refuses a table with an order open."),
      (data ?? []).length >= 2 ? pass("A second round on the same table", `added, then split off: ${(data ?? []).length} open tickets on ${v.tableName}`) : fail("A second round on the same table", `${(data ?? []).length} open`)];
  },
  "order:cancel": async (e) => {
    const P = e.p("r"); const w = e.as(staffOf(e, "r", "waiter")); const v = e.ctx.vars;
    const { data: oid, error } = await w.rpc("place_order", { p_table_id: v.table2, p_type: "dine_in", p_items: [{ menu_item_id: v.dish1, qty: 1 }], p_customer: { name: null, phone: null }, p_note: null, p_client_id: null, p_placed_at: null, p_promise: false });
    if (error) return [fail("An order to cancel", error.message)];
    await e.as(staffOf(e, "r", "chef")).from("order_items").update({ status: "ready" }).eq("order_id", oid);
    const oc = e.as(P.owner);
    const { error: ce } = await oc.rpc("cancel_order", { p_order_id: oid, p_reason: "Flow test — guest left" });
    const [{ data: o }, { data: k }, { data: t }] = await Promise.all([oc.from("orders").select("status").eq("id", oid).single(), oc.from("kots").select("status").eq("order_id", oid), oc.from("dining_tables").select("status").eq("id", v.table2).single()]);
    const stuck = ((k ?? []) as { status: string }[]).filter((x) => x.status === "ready").length;
    return [!ce && (o as { status: string })?.status === "cancelled" ? pass("The owner cancels it with a reason") : fail("The owner cancels it with a reason", ce?.message ?? (o as { status: string })?.status),
      stuck === 0 ? pass("Its ready ticket leaves the pass (0158)") : fail("Its ready ticket leaves the pass (0158)", `${stuck} ticket still at Ready`, "sync_kot_status: a ticket of only cancelled dishes must close."),
      (t as { status: string })?.status !== "occupied" ? pass("Its table is free again", (t as { status: string })?.status) : fail("Its table is free again", "still in use")];
  },

  /* Billing */
  "billing:generate": async (e) => {
    const c = e.as(staffOf(e, "r", "cashier")); const oid = must(e.ctx.vars.order as string, "The order from the Order flow", "the Billing flow bills the order the Order flow took — run them together, or the full test");
    const t0 = Date.now();
    const { data: bid, error } = await c.rpc("generate_bill", { p_order_id: oid, p_discount_pct: 10, p_discount_amount: 0, p_promise_kept: null, p_customer_phone: null, p_customer_name: null, p_redeem_points: 0, p_coupon: null });
    if (error) return [fail("The cashier generates the bill", error.message)];
    e.ctx.vars.bill = bid as string;
    const { data: b } = await c.from("bills").select("bill_no, total, status").eq("id", bid).single();
    const B = b as { bill_no: number; total: number; status: string };
    return [B && B.status !== "void" && B.status !== "paid" ? pass("The cashier generates the bill", `bill ${B.bill_no} · ${money(B.total)} · ${B.status}`, Date.now() - t0) : fail("The cashier generates the bill", B ? `the new bill is ${B.status}` : "no bill")];
  },
  "billing:math": async (e) => {
    const c = e.as(e.p("r").owner); const bid = must(e.ctx.vars.bill as string, "The bill from the step before", "run Billing from its first step");
    const { data: b } = await c.from("bills").select("order_id, subtotal, discount_pct, discount_amount, service_charge, cgst, sgst, round_off, total, promise_fee, promise_waived, charges").eq("id", bid).single();
    const B = b as Record<string, number> & { order_id: string };
    const { data: lines } = await c.from("order_items").select("price_snapshot, qty, status").eq("order_id", B.order_id);
    const sub = ((lines ?? []) as { price_snapshot: number; qty: number; status: string }[]).filter((l) => l.status !== "cancelled").reduce((a, l) => a + Number(l.price_snapshot) * l.qty, 0);
    const built = Number(B.subtotal) - Number(B.discount_amount) - Number(B.promise_waived ?? 0) + Number(B.service_charge) + Number(B.promise_fee ?? 0) + Number(B.charges ?? 0) + Number(B.cgst) + Number(B.sgst) + Number(B.round_off);
    return [near(Number(B.subtotal), sub) ? pass("Subtotal = the dishes", money(sub)) : fail("Subtotal = the dishes", `bill ${money(B.subtotal)}, dishes ${money(sub)}`),
      near(Number(B.discount_amount), Math.round(Number(B.subtotal) * 10) / 100, 0.02) ? pass("10% off is 10% of the subtotal", money(B.discount_amount)) : fail("10% off is 10% of the subtotal", `${money(B.discount_amount)} on ${money(B.subtotal)}`),
      near(Number(B.cgst), Number(B.sgst)) ? pass("CGST equals SGST", `${money(B.cgst)} + ${money(B.sgst)}`) : fail("CGST equals SGST", `${money(B.cgst)} / ${money(B.sgst)}`),
      near(built, Number(B.total)) ? pass("The total adds up to the paisa", `${money(B.subtotal)} − ${money(B.discount_amount)} + ${money(B.service_charge)} service + ${money(Number(B.cgst) + Number(B.sgst))} GST ${Number(B.round_off) >= 0 ? "+" : "−"} ${money(Math.abs(Number(B.round_off)))} = ${money(B.total)}`) : fail("The total adds up to the paisa", `parts make ${money(built)}, total ${money(B.total)}`, "generate_bill / bill_tax: the bill's arithmetic (billing-and-invoices.md)."),
      Math.abs(Number(B.round_off)) <= 0.5 ? pass("Round-off within 50 paise", money(B.round_off)) : fail("Round-off within 50 paise", money(B.round_off))];
  },
  "billing:void": async (e) => {
    const P = e.p("r"); const oc = e.as(P.owner); const c = e.as(staffOf(e, "r", "cashier")); const o2 = must(e.ctx.vars.order2 as string, "The second round", "run the Order flow first");
    const { data: bid, error } = await c.rpc("generate_bill", { p_order_id: o2, p_discount_pct: 0, p_discount_amount: 0, p_promise_kept: null, p_customer_phone: null, p_customer_name: null, p_redeem_points: 0, p_coupon: null });
    if (error) return [fail("A bill for the second round", error.message)];
    const { error: ve } = await oc.rpc("void_bill", { p_bill_id: bid, p_reason: "Flow test — billed by mistake" });
    const { data: b } = await oc.from("bills").select("status, void_reason").eq("id", bid).single();
    // the round is then cancelled, so the table frees once the first bill is paid
    const { error: ce } = await oc.rpc("cancel_order", { p_order_id: o2, p_reason: "Flow test — round not wanted" });
    const { data: o } = await oc.from("orders").select("status").eq("id", o2).single();
    return [!ve && (b as { status: string })?.status === "void" ? pass("An unpaid bill is voided with its reason", (b as { void_reason: string }).void_reason) : fail("An unpaid bill is voided with its reason", ve?.message ?? (b as { status: string })?.status),
      !ce && (o as { status: string })?.status === "cancelled" ? pass("Its order can then be cancelled", "the voided bill does not hold it") : fail("Its order can then be cancelled", ce?.message ?? `order is ${(o as { status: string })?.status}`, "cancel_order refuses an order with a bill that is not void.")];
  },
  "billing:settle": async (e) => {
    const c = e.as(staffOf(e, "r", "cashier")); const v = e.ctx.vars; const bid = must(v.bill as string, "The bill", "run Billing from its first step");
    const { data: b0 } = await c.from("bills").select("total").eq("id", bid).single();
    const total = Number((b0 as { total: number }).total);
    const { error } = await c.rpc("settle_bill", { p_bill_id: bid, p_payments: [{ method: "cash", amount: total }], p_client_id: null });
    if (error) return [fail("Paid in cash", error.message)];
    const [{ data: b }, { data: pay }, { data: t }, { data: job }] = await Promise.all([c.from("bills").select("status, paid_at").eq("id", bid).single(), c.from("payments").select("amount, method").eq("bill_id", bid),
      c.from("dining_tables").select("status").eq("id", v.table).single(), c.from("table_cleanings").select("id").eq("table_id", v.table).eq("status", "pending").order("created_at", { ascending: false }).limit(1)]);
    const paid = ((pay ?? []) as { amount: number }[]).reduce((a, p) => a + Number(p.amount), 0);
    const j = ((job ?? []) as { id: string }[])[0]; if (j) e.ctx.vars.job = j.id;
    return [(b as { status: string })?.status === "paid" ? pass("The bill is paid", money(total)) : fail("The bill is paid", (b as { status: string })?.status),
      near(paid, total) ? pass("The payment equals the bill", `${money(paid)} cash`) : fail("The payment equals the bill", `${money(paid)} paid on ${money(total)}`),
      (t as { status: string })?.status === "free" ? pass(`${v.tableName} is free`) : fail(`${v.tableName} is free`, `table is ${(t as { status: string })?.status}`),
      j ? pass(`${v.tableName} is waiting to be cleaned`) : warn(`${v.tableName} is waiting to be cleaned`, "no cleaning job opened", "Cleaning → Clean tables after payment is off for this property?")];
  },
  "billing:refund": async (e) => {
    const c = e.as(staffOf(e, "r", "cashier")); const bid = must(e.ctx.vars.bill as string, "The paid bill", "run Billing from its first step");
    const { data, error } = await c.rpc("issue_credit_note", { p_bill_id: bid, p_amount: 50, p_reason: "Flow test — part refund", p_method: "cash" });
    if (error) return [fail("A ₹50 refund", error.message)];
    const { data: cn } = await c.from("credit_notes").select("cn_no, amount, cgst, sgst").eq("bill_id", bid);
    const n = ((cn ?? []) as { cn_no: number | string; amount: number }[])[0];
    const { data: b } = await c.from("bills").select("total, status").eq("id", bid).single();
    return [n && near(Number(n.amount), 50) ? pass("A ₹50 refund makes a numbered credit note", `CN ${String(n.cn_no)} · ${JSON.stringify(data).slice(0, 80)}`) : fail("A ₹50 refund makes a numbered credit note", JSON.stringify(cn)),
      (b as { status: string })?.status === "paid" ? pass("The bill itself is unchanged", `${money((b as { total: number }).total)} · paid`) : fail("The bill itself is unchanged", (b as { status: string })?.status)];
  },

  /* Cleaning & work */
  "cleaning:rules": async (e) => {
    const P = e.p("r"); let job = e.ctx.vars.job as string | undefined;
    if (!job) { const { data } = await e.master.rpc("flowtest_admin", { p_op: "free_table", p_rid: P.rid, p_ref: e.ctx.vars.table3 ?? (await e.as(P.owner).from("dining_tables").select("id").eq("status", "free").limit(1).single()).data?.id }); job = (data as { job: string }).job; e.ctx.vars.job = job; }
    must(job, "A table waiting to be cleaned", "no cleaning job could be opened");
    const take = (w: Who) => e.as(w).rpc("clean_take", { p_kind: "table", p_id: job });
    const w = await take(staffOf(e, "r", "waiter")); const o = await take(P.owner); const c = await take(staffOf(e, "r", "cleaner"));
    const { data: j } = await e.as(P.owner).from("table_cleanings").select("status, taken_by").eq("id", job).single();
    return [w.error ? pass("The waiter is refused", w.error.message) : fail("The waiter is refused", "a waiter took a table to clean", "clean_take / _clean_fits (0158)."),
      o.error ? pass("The owner is told to Assign", o.error.message) : fail("The owner is told to Assign", "the owner took it"),
      !c.error && (j as { taken_by: string })?.taken_by === staffOf(e, "r", "cleaner").id ? pass("The cleaner takes it", "on it now") : fail("The cleaner takes it", c.error?.message ?? JSON.stringify(j))];
  },
  "cleaning:done": async (e) => {
    const job = must(e.ctx.vars.job as string, "The table being cleaned", "run Cleaning from its first step"); const cl = e.as(staffOf(e, "r", "cleaner"));
    const { error } = await cl.rpc("clean_done", { p_kind: "table", p_id: job, p_note: null });
    const { data } = await cl.from("table_cleanings").select("status, done_by").eq("id", job).single();
    return [!error && (data as { status: string })?.status === "done" ? pass("Done: the table is clean, by the cleaner") : fail("Done: the table is clean, by the cleaner", error?.message ?? JSON.stringify(data))];
  },
  "cleaning:assign": async (e) => {
    const P = e.p("r"); const cl = staffOf(e, "r", "cleaner");
    const { data: f } = await e.master.rpc("flowtest_admin", { p_op: "free_table", p_rid: P.rid, p_ref: e.ctx.vars.table3 });
    const job = must((f as { job: string | null })?.job, "Another table to clean", "free_table opened no job");
    const { error } = await e.as(P.owner).rpc("clean_assign", { p_kind: "table", p_id: job, p_profile: cl.id });
    const { data: board } = await e.as(cl).rpc("clean_board");
    const mine = ((board as { jobs: { id: string; assigned_to: string | null; status: string }[] })?.jobs ?? []).find((x) => x.id === job);
    const out = [!error ? pass("The owner gives it to the cleaner") : fail("The owner gives it to the cleaner", error.message),
      mine?.assigned_to === cl.id && mine.status === "pending" ? pass("The cleaner sees it under Assigned") : fail("The cleaner sees it under Assigned", JSON.stringify(mine ?? null))];
    await e.as(cl).rpc("clean_take", { p_kind: "table", p_id: job }); await e.as(cl).rpc("clean_done", { p_kind: "table", p_id: job, p_note: null });   // free again for the next step
    return out;
  },
  "cleaning:auto": async (e) => {
    const P = e.p("r"); const cl = staffOf(e, "r", "cleaner");
    const { data: f } = await e.master.rpc("flowtest_admin", { p_op: "free_table", p_rid: P.rid, p_ref: e.ctx.vars.table4 });
    const job = must((f as { job: string | null })?.job, "A table nobody takes", "free_table opened no job");
    await e.master.rpc("flowtest_admin", { p_op: "age_job", p_rid: P.rid, p_ref: job });
    const { data: n, error } = await e.as(staffOf(e, "r", "waiter")).rpc("clean_auto_assign");
    const { data: j } = await e.as(P.owner).from("table_cleanings").select("assigned_to, assigned_by").eq("id", job).single();
    const J = j as { assigned_to: string | null; assigned_by: string | null };
    return [!error && J?.assigned_to === cl.id && J.assigned_by === null ? pass("After 5 minutes it goes to the free cleaner, automatically", `${n} handed out`)
      : fail("After 5 minutes it goes to the free cleaner, automatically", error?.message ?? `given to ${J?.assigned_to ?? "nobody"}`, "clean_auto_assign (0158) — a cleaner who is busy, or not clocked in where attendance is kept, is skipped.")];
  },

  /* Room booking */
  "booking:create": async (e) => {
    const d = e.as(staffOf(e, "h", "desk"));
    const { data: rooms } = await d.from("rooms").select("id, number, status, condition").neq("status", "occupied").neq("status", "maintenance").order("number").limit(40);
    const { data: busy } = await d.from("bookings").select("room_id").in("status", ["reserved", "checked_in"]).lte("check_in", todayIST()).gt("check_out", todayIST());
    const taken = new Set(((busy ?? []) as { room_id: string }[]).map((b) => b.room_id));
    const room = ((rooms ?? []) as { id: string; number: string; condition: string }[]).find((r) => !taken.has(r.id) && ["inspected", "clean"].includes(r.condition)) ?? ((rooms ?? []) as { id: string; number: string }[]).find((r) => !taken.has(r.id));
    must(room, "A free room for tonight", `${(rooms ?? []).length} rooms, none free`);
    const t0 = Date.now();
    const { data: bid, error } = await d.rpc("create_booking", { p_guest: { full_name: "Flow Test Guest", phone: "9000000001" }, p_room_id: room!.id, p_check_in: todayIST(), p_check_out: tomorrow(), p_adults: 2, p_children: 0, p_rate: 2500, p_advance: 0, p_source: "walk_in", p_notes: "flow test" });
    if (error) return [fail("Front desk books a room", error.message)];
    e.ctx.vars = { ...e.ctx.vars, booking: bid as string, room: room!.id, roomNo: room!.number };
    const { data: b } = await d.from("bookings").select("booking_no, status").eq("id", bid).single();
    return [(b as { status: string })?.status === "reserved" ? pass("Front desk books a room for tonight", `Room ${room!.number} · ₹2,500 a night · booking ${(b as { booking_no: number }).booking_no}`, Date.now() - t0) : fail("Front desk books a room for tonight", JSON.stringify(b))];
  },
  "booking:checkin": async (e) => {
    const d = e.as(staffOf(e, "h", "desk")); const bid = must(e.ctx.vars.booking as string, "The booking", "run Room booking from its first step");
    const { error } = await d.rpc("check_in", { p_booking_id: bid });
    const [{ data: b }, { data: r }] = await Promise.all([d.from("bookings").select("status").eq("id", bid).single(), d.from("rooms").select("status").eq("id", e.ctx.vars.room).single()]);
    return [!error && (b as { status: string })?.status === "checked_in" ? pass("Checked in") : fail("Checked in", error?.message ?? (b as { status: string })?.status),
      (r as { status: string })?.status === "occupied" ? pass(`Room ${e.ctx.vars.roomNo} is occupied`) : fail(`Room ${e.ctx.vars.roomNo} is occupied`, (r as { status: string })?.status)];
  },
  "booking:charge": async (e) => {
    const P = e.p("h"); const oc = e.as(P.owner); const bid = must(e.ctx.vars.booking as string, "The stay", "run Room booking from its first step");
    const [{ data: t }, { data: tc }] = await Promise.all([oc.from("dining_tables").select("id").eq("status", "free").limit(30), oc.from("table_cleanings").select("table_id").in("status", ["pending", "in_progress"])]);
    const { data: m } = await oc.from("menu_items").select("id").eq("is_available", true).limit(1);
    const dirty = new Set(((tc ?? []) as { table_id: string }[]).map((c) => c.table_id));   // 0166: not a table being cleaned
    const table = ((t ?? []) as { id: string }[]).find((x) => !dirty.has(x.id))?.id ?? null; const dish = must(((m ?? []) as { id: string }[])[0]?.id, "A dish on the hotel's menu", "the hotel has no menu");
    const { data: oid, error } = await oc.rpc("place_order", { p_table_id: table, p_type: table ? "dine_in" : "takeaway", p_items: [{ menu_item_id: dish, qty: 1 }], p_customer: { name: null, phone: null }, p_note: null, p_client_id: null, p_placed_at: null, p_promise: false });
    if (error) return [fail("A meal for the guest", error.message)];
    const { error: pe } = await oc.rpc("post_order_to_room", { p_order_id: oid, p_booking_id: bid });
    const { data: ch } = await oc.from("booking_charges").select("amount").eq("booking_id", bid).eq("ref_id", oid);
    const { data: ft } = await oc.rpc("folio_totals", { p_booking_id: bid });
    const F = ((ft ?? []) as { extras: number; total: number; balance: number }[])[0];
    return [!pe && (ch ?? []).length ? pass("The meal is on the room's folio", money(((ch ?? []) as { amount: number }[])[0].amount)) : fail("The meal is on the room's folio", pe?.message ?? "no charge"),
      F && Number(F.extras) > 0 ? pass("The folio counts it", `extras ${money(F.extras)} · total ${money(F.total)} · to pay ${money(F.balance)}`) : fail("The folio counts it", JSON.stringify(F ?? null))];
  },
  "booking:checkout": async (e) => {
    const d = e.as(staffOf(e, "h", "desk")); const bid = must(e.ctx.vars.booking as string, "The stay", "run Room booking from its first step");
    const { data: ft } = await d.rpc("folio_totals", { p_booking_id: bid });
    const due = Number(((ft ?? []) as { balance: number }[])[0]?.balance ?? 0);
    const { data: inv, error } = await d.rpc("check_out", { p_booking_id: bid, p_payments: due > 0 ? [{ method: "cash", amount: due }] : [] });
    if (error) return [fail("Check out", error.message)];
    const [{ data: b }, { data: task }, { data: r }] = await Promise.all([d.from("bookings").select("status").eq("id", bid).single(),
      d.from("housekeeping_tasks").select("id").eq("room_id", e.ctx.vars.room).eq("status", "pending").order("created_at", { ascending: false }).limit(1),
      d.from("rooms").select("condition").eq("id", e.ctx.vars.room).single()]);
    const tk = ((task ?? []) as { id: string }[])[0]; if (tk) e.ctx.vars.task = tk.id;
    return [(b as { status: string })?.status === "checked_out" ? pass("Checked out, paid in full", `${money(due)} cash`) : fail("Checked out, paid in full", (b as { status: string })?.status),
      inv ? pass("The invoice is made") : warn("The invoice is made", "check_out returned no invoice"),
      (r as { condition: string })?.condition === "dirty" && tk ? pass(`Room ${e.ctx.vars.roomNo} is dirty and on the cleaning board`) : fail(`Room ${e.ctx.vars.roomNo} is dirty and on the cleaning board`, `condition ${(r as { condition: string })?.condition} · task ${tk ? "yes" : "none"}`)];
  },
  "booking:clean": async (e) => {
    const a = e.as(staffOf(e, "h", "attendant")); const task = must(e.ctx.vars.task as string, "The room's cleaning task", "run Room booking from its first step");
    const t = await a.rpc("clean_take", { p_kind: "room", p_id: task }); const d = await a.rpc("clean_done", { p_kind: "room", p_id: task, p_note: null });
    const { data: r } = await a.from("rooms").select("condition").eq("id", e.ctx.vars.room).single();
    return [!t.error ? pass("The room attendant takes the room") : fail("The room attendant takes the room", t.error.message),
      !d.error && ["clean", "inspected"].includes((r as { condition: string })?.condition) ? pass("Done: the room is clean", (r as { condition: string }).condition) : fail("Done: the room is clean", d.error?.message ?? (r as { condition: string })?.condition)];
  },
  "booking:audit": async (e) => {
    const { data, error } = await e.as(e.p("h").owner).rpc("run_night_audit", { p_date: todayIST(), p_mark_no_shows: false, p_notes: "flow test" });
    return [!error ? pass("The night audit runs", JSON.stringify(data ?? {}).slice(0, 120)) : fail("The night audit runs", error.message)];
  },

  /* Table booking */
  "reservation:add": async (e) => {
    const P = e.p("r"); const oc = e.as(P.owner);
    const { data: last } = await oc.from("reservations").select("reservation_no").order("reservation_no", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await oc.from("reservations").insert({ restaurant_id: P.rid, reservation_no: ((last as { reservation_no: number } | null)?.reservation_no ?? 0) + 1, guest_name: "Flow Test Party", guest_phone: "9000000002", on_date: todayIST(), at_time: "21:00", party_size: 2, note: "flow test", status: "confirmed", source: "phone" }).select("id").single();
    if (error) return [fail("A table booking for tonight", error.message)];
    e.ctx.vars.reservation = (data as { id: string }).id;
    return [pass("A table booking for tonight", "2 guests · 9:00 PM")];
  },
  "reservation:seat": async (e) => {
    const oc = e.as(e.p("r").owner); const id = must(e.ctx.vars.reservation as string, "The booking", "run Table booking from its first step");
    const { data: t } = await oc.from("dining_tables").select("id, name").eq("status", "free").limit(1).single();
    const { error } = await oc.rpc("reservation_set", { p_id: id, p_status: "seated", p_table: (t as { id: string }).id });
    const { data: r } = await oc.from("reservations").select("status, table_id").eq("id", id).single();
    return [!error && (r as { status: string })?.status === "seated" ? pass("Seated", (t as { name: string }).name) : fail("Seated", error?.message ?? (r as { status: string })?.status)];
  },

  /* Guest pages */
  "guest:site": async (e) => Promise.all([["/", "The front page"], ["/get", "Install DineFlow"], ["/legal/terms", "Terms"], ["/legal/privacy", "Privacy"]].map(async ([p, n]) => pageCheck(n, await page(e.origin, p, null), p))),
  "guest:dine": async (e) => { const s = e.p("r").slug; return Promise.all([[`/dine/${s}`, "The menu by QR"], [`/queue/${s}`, "The queue"], [`/feedback/${s}`, "Feedback"]].map(async ([p, n]) => pageCheck(n, await page(e.origin, p, null), p))); },
  "guest:book": async (e) => { const s = e.p("h").booking_slug ?? e.p("h").slug; return [pageCheck("The room booking page", await page(e.origin, `/book/${s}`, null), `/book/${s}`)]; },

  /* Security & money */
  "security:walls": async (e) => {
    const R = e.p("r"), H = e.p("h");
    const [{ data: a }, { data: b }] = await Promise.all([e.as(R.owner).from("orders").select("id").eq("restaurant_id", H.rid).limit(5), e.as(H.owner).from("orders").select("id").eq("restaurant_id", R.rid).limit(5)]);
    return [(a ?? []).length === 0 ? pass("The restaurant's owner reads none of the hotel's orders") : fail("The restaurant's owner reads none of the hotel's orders", `${(a ?? []).length} read`, "Row security on orders (tenant_all)."),
      (b ?? []).length === 0 ? pass("The hotel's owner reads none of the restaurant's orders") : fail("The hotel's owner reads none of the restaurant's orders", `${(b ?? []).length} read`)];
  },
  "security:money": async (e) => {
    const P = e.p("r"); const ws = staffOf(e, "r", "waiter"); const w = e.as(ws); const oc = e.as(P.owner); const out: Check[] = [];
    const { data: line } = await oc.from("order_items").select("id, price_snapshot").limit(1).single();
    if (line) {
      const L = line as { id: string; price_snapshot: number };
      const { error } = await w.from("order_items").update({ price_snapshot: 1 }).eq("id", L.id);
      const { data: after } = await oc.from("order_items").select("price_snapshot").eq("id", L.id).single();
      out.push(near(Number((after as { price_snapshot: number }).price_snapshot), Number(L.price_snapshot)) ? pass("A waiter cannot rewrite a dish's price", error?.message ?? "nothing changed") : fail("A waiter cannot rewrite a dish's price", "the price changed", "money_fence (0150)."));
    }
    const { data: bill } = await oc.from("bills").select("id, total").limit(1).maybeSingle();
    if (bill) {
      const B = bill as { id: string; total: number };
      const { error } = await w.from("bills").update({ total: 1 }).eq("id", B.id);
      const { data: after } = await oc.from("bills").select("total").eq("id", B.id).single();
      out.push(near(Number((after as { total: number }).total), Number(B.total)) ? pass("A waiter cannot rewrite a bill", error?.message ?? "nothing changed") : fail("A waiter cannot rewrite a bill", "the total changed"));
    }
    const { error: re } = await w.from("profiles").update({ role: "owner" }).eq("id", ws.id);
    const { data: me } = await oc.from("profiles").select("role").eq("id", ws.id).single();
    out.push((me as { role: string })?.role === "waiter" ? pass("A waiter cannot make themselves owner", re?.message ?? "nothing changed") : fail("A waiter cannot make themselves owner", "the role changed"));
    return out;
  },
  "security:anon": async (e) => {
    const [{ data: o }, { error: ae }] = await Promise.all([e.anon.from("orders").select("id").limit(5), e.anon.rpc("admin_overview")]);
    return [(o ?? []).length === 0 ? pass("A stranger reads no orders") : fail("A stranger reads no orders", `${(o ?? []).length} read`),
      ae ? pass("A stranger cannot open Master control's data", ae.message) : fail("A stranger cannot open Master control's data", "admin_overview answered")];
  },
};

const runPage = (id: string): Run | null => {
  const m = id.match(/^page:(r|h):(\/.*)$/); if (!m) return null;
  const k = m[1] as Kind, href = m[2];
  return async (e) => [pageCheck(`${href} opens for the owner`, await page(e.origin, href, e.p(k).owner), href.split("?")[0])];
};

export async function POST(req: Request) {
  const s = await createClient();
  const { data: master } = await s.rpc("is_master");
  if (!master) return NextResponse.json({ error: "master only" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { op?: string; id?: string; ctx?: Ctx; mode?: string; label?: string; status?: string; ms?: number; checks?: unknown[] } | null;
  if (!body?.op) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const ctx: Ctx = { vars: {}, ...(body.ctx ?? {}) };

  if (body.op === "finish") {
    const out: Check[] = [];
    for (const k of ["r", "h"] as Kind[]) {
      const P = ctx[k]; if (!P) continue;
      const { data, error } = await s.rpc("flowtest_admin", { p_op: "finish", p_rid: P.rid });
      out.push(error ? fail(`The throwaway ${k === "r" ? "restaurant" : "hotel"} is deleted`, error.message, "It expires by itself within 8 hours.") : pass(`The throwaway ${k === "r" ? "restaurant" : "hotel"} is deleted`, `with its logins · ${(data as { swept: number }).swept} swept`));
    }
    return NextResponse.json({ checks: out, ctx: { vars: {} } });
  }
  if (body.op === "save") {
    const { data: { user } } = await s.auth.getUser();
    const { error } = await s.from("selftest_runs").insert({ suite: `flow:${String(body.mode ?? "run").slice(0, 60)}`, status: body.status === "fail" ? "fail" : body.status === "warn" ? "warn" : "pass", ms: Math.round(Number(body.ms) || 0), checks: (body.checks ?? []).slice(0, 400), ran_by: user?.id ?? null });
    return NextResponse.json(error ? { error: error.message } : { ok: true });
  }
  if (body.op !== "step" || !body.id) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const run = STEPS[body.id] ?? runPage(body.id);
  if (!run) return NextResponse.json({ error: `no such step ${body.id}` }, { status: 400 });
  const env: Env = {
    ctx, origin: new URL(req.url).origin, master: s, anon: anonClient(), as: userClient,
    p: (k) => must(ctx[k], `The throwaway ${k === "r" ? "restaurant" : "hotel"}`, "it was not made — the run's setup failed or was skipped"),
  };
  const t0 = Date.now();
  let checks: Check[];
  try { checks = await run(env); }
  catch (err) { checks = [err instanceof Stop ? (err as Stop & { check: Check }).check : fail("The step ran", (err as Error).message, "An error the step did not expect — the detail names it.")]; }
  const ms = Date.now() - t0;
  return NextResponse.json({ checks: checks.map((c) => ({ ...c, ms: c.ms ?? undefined })), ms, ctx });
}

/** the flows' step ids, so the screen can tell a typo from a real step */
export async function GET() {
  const s = await createClient(); const { data: master } = await s.rpc("is_master");
  if (!master) return NextResponse.json({ error: "master only" }, { status: 401 });
  return NextResponse.json({ steps: Object.keys(STEPS), flows: FLOWS.map((f) => f.key) });
}

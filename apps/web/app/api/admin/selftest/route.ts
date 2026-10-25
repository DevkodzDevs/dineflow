import { NextResponse } from "next/server";
import { resolveMx } from "node:dns/promises";
import { createClient } from "@/lib/supabase/server";
import { formatINR, computeBill, findStandardRecipe, fmtQty } from "@dineflow/shared";
import { todayIST } from "@/lib/format";
import { dishMatch } from "@/lib/tillSearch";
import { missingFacts, COMPANY } from "@/lib/company";

/**
 * Master control → Testing: the server-side suites. POST { suite, restaurant? } — master only.
 *
 * Each suite is a list of checks that pass, warn or fail, with what was seen and, for a warning or a failure, what to
 * do about it (`fix`); the suite's status is the worst of them, and the run is kept in selftest_runs so the page shows
 * the last result. The budgets are the ones the trade uses: a server answer under 600 ms is good and over 1.5 s is a
 * failure (the Lighthouse lab figure for TTFB), a database call under 1.5 s passes, and the security headers are the
 * set a scanner such as securityheaders.com grades.
 *
 * What runs here never writes tenant data. "functions" calls the read-only report and screen RPCs for one property
 * inside selftest_functions(), which sets the master's acting context for the calls and puts it back. "performance"
 * and "load" fetch the app's own screens with this request's cookies. The four deep suites (0142) read the database's
 * catalogue and the property tables through master-only functions.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Status = "pass" | "warn" | "fail" | "skip";
type Check = { name: string; status: Status; detail?: string; ms?: number; fix?: string };
type Suite = "database" | "dbsecurity" | "integrity" | "ops" | "dbperf" | "functions" | "api" | "security" | "performance" | "load" | "unit";
type Db = Awaited<ReturnType<typeof createClient>>;

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const T = 8000;

const worst = (checks: Check[]): "pass" | "warn" | "fail" => checks.some((c) => c.status === "fail") ? "fail" : checks.some((c) => c.status === "warn") ? "warn" : "pass";
const timed = async (url: string, init?: RequestInit) => {
  const t0 = Date.now();
  try { const r = await fetch(url, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(T), ...init }); return { r, ms: Date.now() - t0, err: null as string | null }; }
  catch (e) { return { r: null, ms: Date.now() - t0, err: (e as Error).name === "TimeoutError" ? `no answer in ${T} ms` : (e as Error).message }; }
};
const speed = (ms: number, good = 600, bad = 1500): Status => ms < good ? "pass" : ms < bad ? "warn" : "fail";
/** a count that should be nil: pass at 0, else the given level, with the fix only when it is needed */
const nil = (name: string, n: number, what: string, fix: string, level: Status = "fail"): Check =>
  ({ name, status: n ? level : "pass", detail: `${n} ${what}`, ...(n ? { fix } : {}) });
const list = (xs: string[], max = 8) => xs.slice(0, max).join(", ") + (xs.length > max ? ` and ${xs.length - max} more` : "");
const rpc = async <T,>(s: Db, fn: string, args?: Record<string, unknown>) => {
  const t0 = Date.now(); const { data, error } = await s.rpc(fn, args); return { data: data as T, error, ms: Date.now() - t0 };
};

async function database(s: Db): Promise<Check[]> {
  const { data: d, error, ms } = await rpc<{ migrations: { count: number; latest: string }; tables: number; rls_off: string[]; bare_policies: number; missing_functions: string[]; missing_triggers: string[]; missing_indexes: string[];
    integrity: Record<string, number>; counts: Record<string, number>; size: string; active_queries: number; longest_query_s: number; now: string }>(s, "selftest_db");
  if (error) return [{ name: "Database answers", status: "fail", detail: error.message, ms, fix: "Check the Supabase project is up (Supabase → Project → Status) and the URL and key on Vercel." }];
  const skew = d.now ? Math.abs(Date.now() - ms / 2 - new Date(d.now).getTime()) : 0;
  return [
    { name: "Database answers", status: speed(ms, 800, 2500), detail: `${ms} ms round trip · ${d.size} · ${d.tables} tables`, ms, ...(ms >= 800 ? { fix: "The database is on Supabase Micro (shared CPU). A slow round trip under no load points at the compute size." } : {}) },
    { name: "Migrations applied", status: "pass", detail: `${d.migrations.count}, latest ${d.migrations.latest}` },
    { name: "Row security on every table", status: d.rls_off.length ? "fail" : "pass", detail: d.rls_off.length ? `off: ${d.rls_off.join(", ")}` : "every table in public", ...(d.rls_off.length ? { fix: "A new migration: alter table … enable row level security, with its policy in the same file." } : {}) },
    { name: "Policies ask once per query", status: d.bare_policies ? "warn" : "pass", detail: d.bare_policies ? `${d.bare_policies} policies call auth_restaurant_id() per row (0091)` : "no bare auth calls", ...(d.bare_policies ? { fix: "Wrap the call as (select auth_restaurant_id()) so Postgres runs it once per query (see 0091)." } : {}) },
    { name: "Required functions present", status: d.missing_functions.length ? "fail" : "pass", detail: d.missing_functions.length ? `missing: ${d.missing_functions.join(", ")}` : "19 checked", ...(d.missing_functions.length ? { fix: "A migration was not applied: run node scripts/migrate.mjs." } : {}) },
    { name: "Triggers present", status: d.missing_triggers.length ? "fail" : "pass", detail: d.missing_triggers.length ? `missing: ${d.missing_triggers.join(", ")}` : "stock draw, audit" },
    { name: "Indexes present", status: d.missing_indexes.length ? "warn" : "pass", detail: d.missing_indexes.length ? `missing: ${d.missing_indexes.join(", ")}` : "ledger, bills, invoices, order lines" },
    { name: "No negative stock", status: d.integrity.negative_stock ? "warn" : "pass", detail: `${d.integrity.negative_stock} ingredient(s) below zero`, ...(d.integrity.negative_stock ? { fix: "Pantry → count the shelf and record a stock take; a sale drew more than was recorded as bought." } : {}) },
    { name: "No order open over 24 h", status: d.integrity.orders_open_over_24h ? "warn" : "pass", detail: `${d.integrity.orders_open_over_24h} open`, ...(d.integrity.orders_open_over_24h ? { fix: "Orders → bill or cancel yesterday's open tickets; they hold tables and skew the reports." } : {}) },
    { name: "Paid bills match their payments", status: d.integrity.paid_bills_payments_off ? "fail" : "pass", detail: `${d.integrity.paid_bills_payments_off} off by more than 1 paisa` },
    { name: "Every property has an owner", status: d.integrity.properties_without_owner ? "fail" : "pass", detail: `${d.integrity.properties_without_owner} without` },
    { name: "Server and database clocks agree", status: skew > 30000 ? "fail" : skew > 5000 ? "warn" : "pass", detail: d.now ? `${Math.round(skew / 100) / 10} s apart` : "not reported", ...(skew > 5000 ? { fix: "A clock off by seconds misdates bills near midnight IST. The server's clock is set by the host." } : {}) },
    { name: "Load", status: d.longest_query_s > 30 ? "warn" : "pass", detail: `${d.active_queries} active quer${d.active_queries === 1 ? "y" : "ies"}, longest ${d.longest_query_s} s` },
    { name: "Rows", status: "pass", detail: Object.entries(d.counts).map(([k, v]) => `${v} ${k}`).join(" · ") },
  ];
}

/** 0142: the database's own defences */
async function dbsecurity(s: Db): Promise<Check[]> {
  const { data: d, error, ms } = await rpc<{ secdef_total: number; secdef_no_path: string[]; anon_admin_fns: string[]; open_tenant_policies: string[]; views_without_invoker: string[];
    buckets: Record<string, boolean>; key_shaped: number; masters: number; master_default_password: boolean; tables_rls_no_policy: string[] }>(s, "selftest_security");
  if (error) return [{ name: "Database security scan", status: "fail", detail: error.message, ms, fix: "Migration 0142 adds selftest_security(): run node scripts/migrate.mjs." }];
  const priv = ["attendance", "support"].filter((b) => d.buckets[b] === true);
  return [
    { name: "Every SECURITY DEFINER function pins its search_path", status: d.secdef_no_path.length ? "fail" : "pass", ms,
      detail: d.secdef_no_path.length ? `not pinned: ${list(d.secdef_no_path)}` : `${d.secdef_total} functions, all pinned`,
      ...(d.secdef_no_path.length ? { fix: "Re-create each with `set search_path = public` — without it a caller can shadow a table and run as the owner." } : {}) },
    { name: "Master-only functions refuse anonymous", status: d.anon_admin_fns.length ? "warn" : "pass", detail: d.anon_admin_fns.length ? `anonymous may call: ${list(d.anon_admin_fns)}` : "admin_*, selftest_*, staff_set*, sweeps — none callable",
      ...(d.anon_admin_fns.length ? { fix: "revoke execute on function … from public, anon; — the body checks the caller too, but the door should be shut." } : {}) },
    { name: "No policy opens a property's table to everyone", status: d.open_tenant_policies.length ? "fail" : "pass", detail: d.open_tenant_policies.length ? list(d.open_tenant_policies) : "no `using (true)` for anon or public on a table with restaurant_id",
      ...(d.open_tenant_policies.length ? { fix: "Scope the policy to restaurant_id = (select auth_restaurant_id()), or move the read into a security definer function." } : {}) },
    { name: "Views run as the caller", status: d.views_without_invoker.length ? "fail" : "pass", detail: d.views_without_invoker.length ? `skip row security: ${list(d.views_without_invoker)}` : "every view has security_invoker",
      ...(d.views_without_invoker.length ? { fix: "alter view … set (security_invoker = true); — a plain view reads as its owner and skips every policy." } : {}) },
    { name: "Private buckets stay private", status: priv.length ? "fail" : "pass", detail: priv.length ? `public: ${priv.join(", ")}` : `attendance and support private · public: ${Object.entries(d.buckets).filter(([, v]) => v).map(([k]) => k).join(", ") || "none"}`,
      ...(priv.length ? { fix: "Supabase → Storage → the bucket → make it private; attendance photos and support files are personal data." } : {}) },
    { name: "No key in a function body", status: d.key_shaped ? "fail" : "pass", detail: d.key_shaped ? `${d.key_shaped} function(s) hold a key-shaped string` : "no Razorpay, Stripe, Anthropic key or JWT in any body",
      ...(d.key_shaped ? { fix: "Move the key to Vercel's environment or the vault, rotate it, and re-create the function without it." } : {}) },
    { name: "The master password was changed", status: d.master_default_password ? "fail" : "pass", detail: d.master_default_password ? "this login still signs in with the password 0011 shipped with" : "not the shipped password",
      ...(d.master_default_password ? { fix: "Master control → the red notice → change it now; the shipped password is in the repository's history." } : {}) },
    { name: "Masters", status: d.masters > 3 ? "warn" : "pass", detail: `${d.masters} account(s) can see every property`, ...(d.masters > 3 ? { fix: "Each master sees every property's money. Remove the ones not in use (platform_admins)." } : {}) },
    { name: "Locked tables are reached only through functions", status: "pass", detail: d.tables_rls_no_policy.length ? `${d.tables_rls_no_policy.length} with row security and no policy: ${list(d.tables_rls_no_policy, 4)}` : "none" },
  ];
}

/** 0142: the money and the data */
async function integrity(s: Db): Promise<Check[]> {
  const { data: d, error, ms } = await rpc<Record<string, number> & { cross_tenant: { link: string; rows: number }[]; tenant_pairs: number }>(s, "selftest_integrity");
  if (error) return [{ name: "Integrity scan", status: "fail", detail: error.message, ms, fix: "Migration 0142 adds selftest_integrity(): run node scripts/migrate.mjs." }];
  const cross = d.cross_tenant ?? [];
  return [
    { name: "No row points at another property's row", status: cross.length ? "fail" : "pass", ms,
      detail: cross.length ? list(cross.map((c) => `${c.link} (${c.rows})`), 5) : `${d.tenant_pairs} links between property tables checked`,
      ...(cross.length ? { fix: "A write crossed properties. Find who wrote the rows (audit) and the function that let it through; it must check restaurant_id." } : {}) },
    { name: "Every paid bill adds up", status: d.bills_not_adding_up ? "fail" : "pass", detail: d.bills_not_adding_up ? `${d.bills_not_adding_up} of ${d.bills_paid} differ from subtotal − discount + service + GST + round-off` : `${d.bills_paid} paid bills, each to the paisa`,
      ...(d.bills_not_adding_up ? { fix: "A bill was changed after generate_bill wrote it. bills is writable by staff (the 2026-10-13 money review) — check its audit trail." } : {}) },
    nil("CGST equals SGST", d.gst_halves_differ, "bills with unequal halves", "Intra-state GST is split evenly; an uneven bill was edited by hand."),
    nil("Round-off within 50 paise", d.round_off_wide, "bills rounded by more than 50 paise", "The round-off is the total less the exact sum; more than ₹0.50 means a figure was edited."),
    nil("Bill numbers unique", d.bill_no_dupes, "numbers used twice", "Two bills share a number in one property — the numbering sequence was bypassed."),
    nil("Invoice numbers unique", d.invoice_no_dupes, "numbers used twice", "GST invoices must carry a unique serial (rule 46). Re-issue one of each pair."),
    nil("Invoice numbers without gaps", d.invoice_gaps, "missing numbers in the series", "A gap must be explained to the tax officer — a cancelled invoice keeps its number with status cancelled.", "warn"),
    nil("No zero or negative lines", d.bad_lines, "lines with qty ≤ 0 or a negative price", "order_items is writable by staff (the money review). Find who wrote them; prices belong to the till's function."),
    nil("Nothing added after the bill", d.lines_after_bill, "lines added to an order after its bill was paid", "A dish went on after payment — sold and not charged. Check who added it (audit).", "warn"),
    nil("Nothing cancelled after payment", d.cancelled_after_paid, "lines cancelled after the bill was paid", "Cancelling after payment moves stock and reports without a refund. Check who did it.", "warn"),
    nil("Payments are positive", d.payments_not_positive, "payments of zero or less", "A refund should be a credit note, not a negative payment."),
    nil("Unpaid bills are really unpaid", d.unpaid_but_covered, "unpaid bills whose payments cover them", "Mark them paid from Billing, or the day's takings understate.", "warn"),
    nil("Void bills hold no payment", d.void_with_payments, "void bills with money on them", "A voided bill with a payment hides takings. Refund it or reverse the void."),
    nil("Loyalty points never negative", d.negative_points, "guests below zero", "Points were spent twice; the ledger and the balance need a correcting entry."),
    nil("Loyalty points match their ledger", d.points_off_ledger, "guests whose balance differs from the ledger", "customers.points is writable by staff (the money review). Correct from loyalty_ledger.", "warn"),
    nil("No room booked twice", d.rooms_double_booked, "pairs of stays on the same room and nights", "Front desk → move one guest; check the OTA sync for the source."),
    nil("Every stay ends after it starts", d.impossible_stays, "stays with check-out on or before check-in", "Fix the dates on the booking; nights and the room rate read wrong."),
    nil("No negative room rates", d.negative_rates, "bookings with a negative rate", "bookings.rate is writable by staff (the money review); set the right rate."),
    nil("No negative charges", d.negative_charges, "folio charges below zero (not discounts)", "A negative charge should be a discount line, so the invoice shows it."),
  ];
}

/** 0142: what is stuck right now */
async function ops(s: Db): Promise<Check[]> {
  const { data: d, error, ms } = await rpc<Record<string, number>>(s, "selftest_ops");
  if (error) return [{ name: "Operations scan", status: "fail", detail: error.message, ms, fix: "Migration 0142 adds selftest_ops(): run node scripts/migrate.mjs." }];
  return [
    { name: "Properties", status: "pass", ms, detail: `${d.properties} live · ${d.active_today} took an order in the last 24 h · ${d.demos_live} demo(s) running` },
    nil("Online orders answered in 30 minutes", d.online_new_30m, "still 'new' after 30 min", "Online orders → accept or reject; Swiggy and Zomato cancel and penalise unanswered orders.", "warn"),
    nil("Online orders finished in 6 hours", d.online_cooking_6h, "accepted and not picked up after 6 h", "Online orders → mark them picked up or cancelled so the counts and payouts read right.", "warn"),
    nil("Deliveries closed in 6 hours", d.deliveries_out_6h, "riders still out after 6 h", "The rider's page has Delivered; or close it from Online orders.", "warn"),
    nil("Guests checked out on time", d.overstays, "guests still checked in past their check-out date", "Front desk → check them out (or extend); the room shows occupied and the night is not charged.", "warn"),
    nil("No-shows marked", d.unmarked_no_shows, "reservations past arrival never marked", "Front desk → mark no-show or cancel; the room stays held on every OTA.", "warn"),
    { name: "Room-site syncs succeed", status: d.ota_failed_24h ? (d.ota_failed_24h === d.ota_runs_24h ? "fail" : "warn") : "pass", detail: d.ota_runs_24h ? `${d.ota_failed_24h} of ${d.ota_runs_24h} failed in 24 h` : "no syncs in 24 h",
      ...(d.ota_failed_24h ? { fix: "Connections → Room booking sites → the failing card's Sync shows the site's answer. Check CRON_SECRET on Vercel." } : {}) },
    nil("Cash-ups balance", d.cash_variance_30d, "shift closes off by more than ₹500 in 30 days", "Billing → the shift's close: what was expected and what was counted. Front-desk cash is not in the cash-up yet.", "warn"),
    nil("Orders closed within a day", d.orders_open_24h, "orders open over 24 h", "Orders → bill or cancel them; they hold tables and the day's figures.", "warn"),
    nil("Bills paid within a day", d.unpaid_bills_24h, "bills unpaid after 24 h", "Billing → collect or void with a reason.", "warn"),
    nil("Expired demos swept", d.demos_expired, "expired demo properties still stored", "Master control → Overview runs the sweep; demos expire after a day.", "warn"),
  ];
}

/** 0142: how the database is holding up */
async function dbperf(s: Db): Promise<Check[]> {
  const { data: d, error, ms } = await rpc<{ heap_hit_pct: number | null; index_hit_pct: number | null; fk_without_index: string[]; seq_heavy: { table: string; seq: number; idx: number; rows: number }[];
    dead_heavy: { table: string; dead: number; live: number }[]; unused_indexes: number; connections: number; max_connections: number; idle_in_tx: number; largest: { table: string; size: string }[];
    slow: { q: string; calls: number; mean_ms: number }[] | null }>(s, "selftest_dbperf");
  if (error) return [{ name: "Database performance scan", status: "fail", detail: error.message, ms, fix: "Migration 0142 adds selftest_dbperf(): run node scripts/migrate.mjs." }];
  const hit = (p: number | null) => (p == null ? "skip" : p >= 99 ? "pass" : p >= 95 ? "warn" : "fail") as Status;
  const conn = d.connections / Math.max(1, d.max_connections);
  const slow = d.slow ?? [];
  const worstSlow = slow[0]?.mean_ms ?? 0;
  return [
    { name: "Table cache hit ratio", status: hit(d.heap_hit_pct), ms, detail: d.heap_hit_pct == null ? "no reads yet" : `${d.heap_hit_pct}% of reads from memory`, ...(hit(d.heap_hit_pct) !== "pass" ? { fix: "Under 99% the working set no longer fits in memory — a larger compute size (Supabase → Settings → Compute)." } : {}) },
    { name: "Index cache hit ratio", status: hit(d.index_hit_pct), detail: d.index_hit_pct == null ? "no reads yet" : `${d.index_hit_pct}%` },
    { name: "Every foreign key has an index", status: d.fk_without_index.length > 10 ? "warn" : "pass", detail: d.fk_without_index.length ? `${d.fk_without_index.length} without: ${list(d.fk_without_index, 6)}` : "all indexed",
      ...(d.fk_without_index.length > 10 ? { fix: "A delete of the parent or a join on these scans the whole child table. One migration: create index on each, busiest first (jobs, table_cleanings, deliveries)." } : {}) },
    { name: "Large tables are read by index", status: d.seq_heavy.length ? "warn" : "pass", detail: d.seq_heavy.length ? d.seq_heavy.map((t) => `${t.table}: ${t.seq} scans, ${t.idx} by index, ${t.rows} rows`).join(" · ") : "no table over 5,000 rows read mostly by scanning",
      ...(d.seq_heavy.length ? { fix: "Add an index on the column these reads filter by (often restaurant_id, created_at)." } : {}) },
    { name: "Dead rows cleared", status: d.dead_heavy.length ? "warn" : "pass", detail: d.dead_heavy.length ? d.dead_heavy.map((t) => `${t.table}: ${t.dead} dead of ${t.live}`).join(" · ") : "autovacuum is keeping up",
      ...(d.dead_heavy.length ? { fix: "Run vacuum (analyze) on the table; if it recurs, lower its autovacuum_vacuum_scale_factor." } : {}) },
    { name: "No unused large index", status: d.unused_indexes ? "warn" : "pass", detail: `${d.unused_indexes} index(es) over 1 MB never used`, ...(d.unused_indexes ? { fix: "Each slows every write. Drop it in a migration after a week of statistics." } : {}) },
    { name: "Connections in use", status: conn > 0.9 ? "fail" : conn > 0.75 ? "warn" : "pass", detail: `${d.connections} of ${d.max_connections}`, ...(conn > 0.75 ? { fix: "Near the limit new sign-ins fail. Use the pooler (port 6543) for serverless, or a larger compute size." } : {}) },
    nil("No session idle in a transaction", d.idle_in_tx, "sessions idle in a transaction over 5 min", "They hold locks and stop autovacuum. Find them in Supabase → Database → Query performance and end them.", "warn"),
    { name: "Slowest statements", status: d.slow == null ? "skip" : worstSlow > 1000 ? "warn" : "pass", detail: d.slow == null ? "pg_stat_statements not readable" : slow.length ? slow.map((x) => `${x.mean_ms} ms × ${x.calls}: ${x.q}`).join(" · ") : "none called 20 times yet",
      ...(worstSlow > 1000 ? { fix: `The slowest averages ${worstSlow} ms. explain analyze it; a sweep run on every page load belongs on a schedule.` } : {}) },
    { name: "Largest tables", status: "pass", detail: d.largest.map((t) => `${t.table} ${t.size}`).join(" · ") },
  ];
}

async function functions(s: Db, restaurant: string | null): Promise<Check[]> {
  if (!restaurant) return [{ name: "Pick a property", status: "skip", detail: "the function sweep runs for one property" }];
  const { data, error } = await s.rpc("selftest_functions", { p_restaurant: restaurant });
  if (error) return [{ name: "Function sweep", status: "fail", detail: error.message }];
  return (data as { name: string; ok: boolean; ms: number; error: string | null }[]).map((f) => ({
    name: f.name, status: f.ok ? speed(f.ms, 800, 1500) : "fail", detail: f.ok ? `${f.ms} ms` : f.error ?? "failed", ms: f.ms,
    ...(!f.ok ? { fix: "The call raised an error for this property: run it in the SQL editor as the owner to see the line." } : f.ms >= 800 ? { fix: "Slow for one property's data — explain analyze the function's heaviest query." } : {}) }));
}

async function api(origin: string, slug: string | null): Promise<Check[]> {
  const out: Check[] = [];
  const hit = async (name: string, url: string, okStatus: (s: number) => boolean, init?: RequestInit, good = 600, bad = 1500) => {
    const { r, ms, err } = await timed(url, init);
    if (!r) return out.push({ name, status: "fail", detail: err ?? "unreachable", ms });
    out.push({ name, status: okStatus(r.status) ? speed(ms, good, bad) : "fail", detail: `http ${r.status} · ${ms} ms`, ms });
  };
  const sb = { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } };
  await hit("Supabase REST", `${SB}/rest/v1/restaurants?select=id&limit=1`, (c) => c === 200, sb);
  await hit("Supabase Auth", `${SB}/auth/v1/health`, (c) => c === 200, sb);
  await hit("Supabase Storage", `${SB}/storage/v1/bucket`, (c) => c < 500, sb);
  await hit("App: health (deep)", `${origin}/api/health?deep=1`, (c) => c === 200);
  await hit("App: manifest", `${origin}/manifest.json`, (c) => c === 200);
  await hit("App: service worker", `${origin}/sw.js`, (c) => c === 200);
  await hit("App: robots", `${origin}/robots.txt`, (c) => c === 200);
  await hit("App: sign-in page", `${origin}/login`, (c) => c === 200);
  await hit("App: install page", `${origin}/get`, (c) => c === 200);
  if (slug) { await hit("App: public storefront", `${origin}/dine/${slug}`, (c) => c === 200, undefined, 1000, 2500); await hit("App: public queue", `${origin}/queue/${slug}`, (c) => c === 200, undefined, 1000, 2500); }
  await hit("Wikimedia (dish photos)", "https://en.wikipedia.org/w/api.php?action=query&format=json&meta=siteinfo", (c) => c === 200, undefined, 1500, 4000);
  // the mail domains on the legal pages must take mail: a bounce is a complaint that never arrives
  for (const domain of [...new Set([COMPANY.supportEmail, COMPANY.grievanceEmail, COMPANY.privacyEmail].filter(Boolean).map((e) => String(e).split("@")[1]))]) {
    const t0 = Date.now();
    try { const mx = await resolveMx(domain); out.push({ name: `Mail domain ${domain} takes mail`, status: mx.length ? "pass" : "fail", detail: mx.length ? `MX ${mx.sort((a, b) => a.priority - b.priority)[0].exchange}` : "no MX record", ms: Date.now() - t0 }); }
    catch (e) { out.push({ name: `Mail domain ${domain} takes mail`, status: "fail", detail: `no MX record (${(e as { code?: string }).code ?? "lookup failed"})`, ms: Date.now() - t0, fix: "support@, grievance@ and privacy@ bounce. Add MX records at the domain's DNS (Zoho, Google Workspace or ImprovMX for forwarding)." }); }
  }
  const env = (k: string) => Boolean(process.env[k]);
  const key = (k: string, why: string, level: Status = "warn", on?: string): Check => ({ name: `${k} set`, status: env(k) ? "pass" : level, detail: env(k) ? on : why, ...(env(k) ? {} : { fix: `Vercel → Settings → Environment Variables → add ${k} (Production), then redeploy.` }) });
  out.push({ name: "Supabase keys set", status: env("NEXT_PUBLIC_SUPABASE_URL") && env("NEXT_PUBLIC_SUPABASE_ANON_KEY") ? "pass" : "fail" });
  out.push(key("SUPABASE_SERVICE_ROLE_KEY", "forgot-password, card pay links, phone attendance, OTA sync, the sign-in throttle and the feedback limit are off"));
  out.push(key("CRON_SECRET", "the nightly channel sync fails closed without it"));
  out.push(key("NEXT_PUBLIC_CLOUD_URL", "links sent to guests and riders fall back to the request's host"));
  out.push(key("RATE_LIMIT_SECRET", "the per-visitor feedback limit falls back to the service-role key"));
  out.push(key("RESEND_API_KEY", "emails (receipts, password codes) are not sent", "warn", "email on"));
  out.push(key("ANTHROPIC_API_KEY", "AI fill-ins answer with samples", "warn", "AI fill-ins on"));
  return out;
}

async function security(origin: string): Promise<Check[]> {
  const out: Check[] = [];
  const { r } = await timed(`${origin}/login`);
  const h = (k: string) => r?.headers.get(k) ?? "";
  const want: [string, string, RegExp, Status][] = [
    ["Content-Security-Policy", "content-security-policy", /frame-ancestors/i, "fail"], ["X-Frame-Options", "x-frame-options", /SAMEORIGIN|DENY/i, "fail"],
    ["X-Content-Type-Options", "x-content-type-options", /nosniff/i, "fail"], ["Referrer-Policy", "referrer-policy", /./, "fail"], ["Permissions-Policy", "permissions-policy", /camera/i, "warn"]];
  for (const [name, key, re, miss] of want) out.push({ name: `Header: ${name}`, status: re.test(h(key)) ? "pass" : miss, detail: h(key) ? h(key).slice(0, 80) : "missing", ...(re.test(h(key)) ? {} : { fix: "next.config: the headers() block sets these for every route." }) });
  const https = origin.startsWith("https://");
  out.push({ name: "Header: Strict-Transport-Security", status: /max-age/.test(h("strict-transport-security")) ? "pass" : https ? "fail" : "skip", detail: https ? h("strict-transport-security") || "missing" : "only over https" });
  const csp = h("content-security-policy");
  out.push({ name: "Scripts limited by a nonce", status: /script-src[^;]*'nonce-/.test(csp) ? "pass" : "warn", detail: /script-src[^;]*'unsafe-inline'/.test(csp) ? "script-src allows 'unsafe-inline'" : "no nonce in script-src",
    ...(/script-src[^;]*'nonce-/.test(csp) ? {} : { fix: "Known open item: a nonce-based script-src in middleware stops an injected script from running." }) });
  out.push({ name: "The server does not name itself", status: /\d/.test(h("x-powered-by") + h("server")) ? "warn" : "pass", detail: h("x-powered-by") || h("server") || "no x-powered-by" });
  // anonymous reads on tenant tables must come back empty — row security, not luck
  const anon = { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } };
  for (const t of ["restaurants", "profiles", "bills", "payments", "orders", "order_items", "customers", "guests", "bookings", "stock_ledger", "invoices", "audit_events", "payment_gateways", "order_channels", "selftest_runs", "platform_admins"]) {
    const { r: x, err } = await timed(`${SB}/rest/v1/${t}?select=*&limit=1`, anon);
    const body = x ? await x.text().catch(() => "") : "";
    const rows = x && x.ok ? (() => { try { return (JSON.parse(body) as unknown[]).length; } catch { return 0; } })() : 0;
    out.push({ name: `Anonymous read of ${t}`, status: x ? (rows === 0 ? "pass" : "fail") : "warn", detail: x ? `${rows} row(s) · http ${x.status}` : err ?? "", ...(rows ? { fix: `A policy on ${t} lets anyone read it. Scope it to the property, today.` } : {}) });
  }
  // anonymous writes must be refused too
  const { r: w } = await timed(`${SB}/rest/v1/selftest_runs`, { method: "POST", ...anon, headers: { ...anon.headers, "content-type": "application/json", prefer: "return=minimal" }, body: JSON.stringify({ suite: "probe", status: "pass", ms: 0 }) });
  out.push({ name: "Anonymous write refused", status: w && w.status >= 400 ? "pass" : "fail", detail: `insert into selftest_runs · http ${w?.status ?? "—"}` });
  for (const fn of ["admin_overview", "selftest_db", "selftest_integrity", "admin_act_as"]) {
    const { r: ao } = await timed(`${SB}/rest/v1/rpc/${fn}`, { method: "POST", ...anon, headers: { ...anon.headers, "content-type": "application/json" }, body: "{}" });
    out.push({ name: `Anonymous call of ${fn}`, status: ao && ao.status >= 400 ? "pass" : "fail", detail: `http ${ao?.status ?? "—"}` });
  }
  for (const p of ["/dashboard", "/admin", "/admin/testing", "/orders/new", "/reports", "/connections"]) {
    const { r: x } = await timed(`${origin}${p}`);
    const to = x?.headers.get("location") ?? "";
    out.push({ name: `Signed-out visit to ${p}`, status: x && [301, 302, 303, 307, 308].includes(x.status) && /\/login/.test(to) ? "pass" : "fail", detail: x ? `http ${x.status} → ${to || "no redirect"}` : "no answer" });
  }
  const { r: me } = await timed(`${origin}/api/admin/selftest`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
  out.push({ name: "This test route without a session", status: me && me.status === 401 ? "pass" : "fail", detail: `http ${me?.status ?? "—"}` });
  const { r: cron } = await timed(`${origin}/api/ota/sync`);
  out.push({ name: "Nightly sync without its secret", status: cron && cron.status === 401 ? "pass" : "warn", detail: `http ${cron?.status ?? "—"}` });
  for (const p of ["/api/assist", "/api/box/push"]) {
    const { r: x } = await timed(`${origin}${p}`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
    // refused either way: an error, or the middleware sending the stranger to sign in
    const to = x?.headers.get("location") ?? "";
    const refused = !!x && (x.status >= 400 || ([301, 302, 303, 307, 308].includes(x.status) && /\/login/.test(to)));
    out.push({ name: `Signed-out POST to ${p}`, status: refused ? "pass" : "fail", detail: x ? `http ${x.status}${to ? ` → ${to}` : ""}` : "no answer",
      ...(refused ? {} : { fix: "This route answered a stranger. It must check the session (or its own secret) before doing anything." }) });
  }
  // a stranger's site must not be allowed to read answers with the master's cookies
  const { r: cors } = await timed(`${origin}/api/admin/selftest`, { method: "OPTIONS", headers: { origin: "https://evil.example", "access-control-request-method": "POST" } });
  const acao = cors?.headers.get("access-control-allow-origin") ?? "";
  out.push({ name: "Other sites cannot call the app with your cookies", status: acao === "*" || /evil\.example/.test(acao) ? "fail" : "pass", detail: acao ? `allow-origin: ${acao}` : "no CORS allowance" });
  const leaked = Object.keys(process.env).filter((k) => k.startsWith("NEXT_PUBLIC_") && /SECRET|SERVICE_ROLE|PRIVATE|API_KEY/i.test(k));
  out.push({ name: "No secret under a public env name", status: leaked.length ? "fail" : "pass", detail: leaked.join(", ") || "NEXT_PUBLIC_* holds only the URL and the anon key", ...(leaked.length ? { fix: "NEXT_PUBLIC_ variables are shipped to every browser. Rename, rotate the key, redeploy." } : {}) });
  const prod = process.env.NODE_ENV === "production" && https;
  out.push({ name: "Sign-in codes are not echoed", status: process.env.DINEFLOW_OTP_ECHO && prod ? "fail" : "pass", detail: process.env.DINEFLOW_OTP_ECHO ? (prod ? "DINEFLOW_OTP_ECHO is on in production" : "on, but this is not production") : "DINEFLOW_OTP_ECHO off",
    ...(process.env.DINEFLOW_OTP_ECHO && prod ? { fix: "Remove DINEFLOW_OTP_ECHO from Vercel: with it anyone can read a password-reset code." } : {}) });
  const facts = missingFacts().length;
  out.push({ name: "Legal facts on the public pages", status: facts ? "warn" : "pass", detail: facts ? `${facts} still unset in lib/company.ts` : "complete", ...(facts ? { fix: "lib/company.ts — they block launch and subscription checkout (legal.md)." } : {}) });
  return out;
}

async function performance(origin: string, cookie: string, s: Db, acting: boolean): Promise<Check[]> {
  const out: Check[] = [];
  // public screens are timed as a stranger sees them (no cookie — a signed-in master is sent on from /login)
  const page = async (p: string, signedIn = true) => {
    const { r, ms, err } = await timed(`${origin}${p}`, signedIn ? { headers: { cookie } } : undefined);
    const html = r ? await r.text().catch(() => "") : ""; const kb = Math.round(html.length / 1024);
    const st: Status = r && r.status === 200 ? speed(ms) : "fail";
    out.push({ name: `Screen ${p}`, status: kb > 600 && st === "pass" ? "warn" : st, detail: r ? `${ms} ms · ${kb} KB · http ${r.status}` : err ?? "", ms,
      ...(st !== "pass" && ms >= 600 ? { fix: "A cold start or a slow query — run it twice; if the second is slow, time its database calls (Functions)." } : st === "pass" && kb > 600 ? { fix: "Over 600 KB of HTML: a list rendered in full on the server; page it or move it to the client." } : {}) });
  };
  await page("/login", false); await page("/get", false); await page("/admin");
  if (acting) for (const p of ["/dashboard", "/orders", "/orders/new", "/kitchen", "/billing", "/menu", "/inventory", "/invoices", "/reports", "/tomorrow", "/settings", "/connections", "/work", "/cleaning"]) await page(p);
  else out.push({ name: "Property screens", status: "skip", detail: "open a property (Master control → Open) to time its screens" });
  // the same screen twice: the second answer shows what a warm server costs, the first what a visitor after a lull waits
  const { ms: cold } = await timed(`${origin}/api/health`); const { ms: warm } = await timed(`${origin}/api/health`);
  out.push({ name: "Warm answer", status: speed(warm, 300, 1000), detail: `/api/health first ${cold} ms, then ${warm} ms`, ms: warm });
  for (const [name, fn] of [["session_bundle", () => s.rpc("session_bundle")], ["is_master", () => s.rpc("is_master")], ...(acting ? [["dashboard_figures", () => s.rpc("dashboard_figures")]] : [])] as [string, () => PromiseLike<{ error: { message: string } | null }>][]) {
    const t0 = Date.now(); const { error } = await fn(); const ms = Date.now() - t0;
    out.push({ name: `Database call ${name}`, status: error ? "fail" : speed(ms, 400, 1500), detail: error ? error.message : `${ms} ms`, ms });
  }
  return out;
}

/** many visitors at once: bursts of parallel requests, the median and the 95th percentile, and any error */
async function load(origin: string, cookie: string, s: Db): Promise<Check[]> {
  const out: Check[] = [];
  const burst = async (name: string, n: number, one: () => Promise<{ ok: boolean; ms: number }>, good: number, bad: number, fix: string) => {
    const t0 = Date.now(); const rs = await Promise.all(Array.from({ length: n }, one)); const wall = Date.now() - t0;
    const ms = rs.map((r) => r.ms).sort((a, b) => a - b); const p = (q: number) => ms[Math.min(ms.length - 1, Math.floor(q * ms.length))];
    const errors = rs.filter((r) => !r.ok).length; const st: Status = errors ? "fail" : speed(p(0.95), good, bad);
    out.push({ name, status: st, detail: `${n} at once · median ${p(0.5)} ms · 95th ${p(0.95)} ms · slowest ${ms.at(-1)} ms · ${errors} error(s) · ${wall} ms in all`, ms: p(0.95), ...(st !== "pass" ? { fix } : {}) });
  };
  const get = (url: string, init?: RequestInit) => async () => { const { r, ms } = await timed(url, init); return { ok: !!r && r.status < 400, ms }; };
  await burst("20 visitors open the health check", 20, get(`${origin}/api/health`), 800, 2000, "The server queues requests under load: Vercel → Settings → Functions → Fluid compute on.");
  await burst("10 visitors open the sign-in page", 10, get(`${origin}/login`), 1200, 3000, "Sign-in is rendered per request; a burst after an ad or a shift change waits this long.");
  await burst("8 signed-in sessions load at once", 8, async () => { const t0 = Date.now(); const { error } = await s.rpc("session_bundle"); return { ok: !error, ms: Date.now() - t0 }; }, 800, 2000,
    "Every screen calls session_bundle first. Slow under 8 at once means the database's CPU (Supabase Micro is shared).");
  await burst("6 dashboards at once", 6, get(`${origin}/admin`, { headers: { cookie } }), 1500, 4000, "Master control's overview under load — check its database calls in Speed.");
  return out;
}

function unit(): Check[] {
  const t = (name: string, f: () => boolean) => { try { return { name, status: f() ? "pass" : "fail" } as Check; } catch (e) { return { name, status: "fail", detail: (e as Error).message } as Check; } };
  return [
    t("formatINR keeps paise on a bill", () => formatINR(1234.5) === "₹1,234.50"),
    t("formatINR drops paise on a menu price", () => formatINR(280, { whole: true }) === "₹280"),
    t("formatINR groups lakhs the Indian way", () => formatINR(1234567) === "₹12,34,567.00"),
    t("todayIST is a date in Asia/Kolkata", () => /^\d{4}-\d{2}-\d{2}$/.test(todayIST())),
    t("todayIST turns over at IST midnight, not UTC", () => { const ist = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10); return todayIST() === ist; }),
    t("computeBill adds 5% GST to a ₹200 bill", () => { const b = computeBill({ lines: [{ price: 100, qty: 2 }], gstRate: 5 }); return b.subtotal === 200 && b.cgst === 5 && b.sgst === 5 && b.total === 210; }),
    t("computeBill splits GST into equal halves", () => { const b = computeBill({ lines: [{ price: 333, qty: 1 }], gstRate: 5 }); return Math.abs(b.cgst - b.sgst) < 0.001; }),
    t("computeBill of nothing is nothing", () => { const b = computeBill({ lines: [], gstRate: 5 }); return b.subtotal === 0 && b.total === 0; }),
    t("the recipe library finds a plate", () => findStandardRecipe("Chicken Biryani")?.dish === "Chicken biryani"),
    t("the recipe library refuses a wrong plate", () => findStandardRecipe("Mango juice") === null),
    t("fmtQty reads as a cook does", () => fmtQty(0.18, "kg") === "180 g" && fmtQty(0.015, "l") === "15 ml"),
    t("till search matches initials", () => Boolean(dishMatch("Chicken biryani", "cb")) && !dishMatch("Chicken biryani", "zz")),
    t("till search ignores case", () => Boolean(dishMatch("Paneer Tikka", "PANEER"))),
  ];
}

export async function POST(req: Request) {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in" }, { status: 401 });
  const { data: admin } = await s.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!admin) return NextResponse.json({ error: "master only" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { suite?: Suite; restaurant?: string | null };
  const suite = body.suite ?? "database";
  const origin = new URL(req.url).origin;
  const cookie = req.headers.get("cookie") ?? "";
  const { data: bundle } = await s.rpc("session_bundle");
  const acting = Boolean((bundle as { acting_as?: string | null } | null)?.acting_as);
  let slug: string | null = null;
  if (suite === "api") { const { data: r } = await s.from("restaurants").select("booking_slug").not("booking_slug", "is", null).is("demo_expires_at", null).limit(1).maybeSingle(); slug = (r as { booking_slug?: string } | null)?.booking_slug ?? null; }
  const t0 = Date.now();
  let checks: Check[];
  try {
    checks = suite === "database" ? await database(s) : suite === "dbsecurity" ? await dbsecurity(s) : suite === "integrity" ? await integrity(s) : suite === "ops" ? await ops(s)
      : suite === "dbperf" ? await dbperf(s) : suite === "functions" ? await functions(s, body.restaurant ?? null) : suite === "api" ? await api(origin, slug)
      : suite === "security" ? await security(origin) : suite === "performance" ? await performance(origin, cookie, s, acting) : suite === "load" ? await load(origin, cookie, s) : unit();
  } catch (e) {
    // a suite that throws is a failing suite, not a broken page
    checks = [{ name: "The suite itself", status: "fail", detail: (e as Error).message.slice(0, 200), fix: "The test code threw — the route's log on Vercel has the stack." }];
  }
  const ms = Date.now() - t0; const status = worst(checks);
  await s.from("selftest_runs").insert({ suite, status, ms, checks, ran_by: user.id });
  return NextResponse.json({ suite, status, ms, checks, ran_at: new Date().toISOString() });
}

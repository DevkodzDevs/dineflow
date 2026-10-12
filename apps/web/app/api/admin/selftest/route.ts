import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { formatINR, computeBill, findStandardRecipe, fmtQty } from "@dineflow/shared";
import { todayIST } from "@/lib/format";
import { dishMatch } from "@/lib/tillSearch";
import { missingFacts } from "@/lib/company";

/**
 * Master control → Testing: the server-side suites. POST { suite, restaurant? } — master only.
 *
 * Each suite is a list of checks that pass, warn or fail, with what was seen; the suite's status is
 * the worst of them, and the run is kept in selftest_runs so the page shows the last result. The
 * budgets are the ones the trade uses: a server answer under 600 ms is good and over 1.5 s is a
 * failure (the Lighthouse lab figure for TTFB), a database call under 1.5 s passes, and the security
 * headers are the set a scanner such as securityheaders.com grades.
 *
 * What runs here never writes tenant data. "functions" calls the read-only report and screen RPCs
 * for one property inside selftest_functions(), which sets the master's acting context for the
 * calls and puts it back. "performance" fetches the app's own screens with this request's cookies.
 */
export const dynamic = "force-dynamic";

type Status = "pass" | "warn" | "fail" | "skip";
type Check = { name: string; status: Status; detail?: string; ms?: number };
type Suite = "database" | "functions" | "api" | "security" | "performance" | "unit";

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

async function database(s: Awaited<ReturnType<typeof createClient>>): Promise<Check[]> {
  const t0 = Date.now(); const { data, error } = await s.rpc("selftest_db"); const ms = Date.now() - t0;
  if (error) return [{ name: "Database answers", status: "fail", detail: error.message, ms }];
  const d = data as { migrations: { count: number; latest: string }; tables: number; rls_off: string[]; bare_policies: number; missing_functions: string[]; missing_triggers: string[]; missing_indexes: string[];
    integrity: Record<string, number>; counts: Record<string, number>; size: string; active_queries: number; longest_query_s: number; ms: number };
  return [
    { name: "Database answers", status: speed(ms, 800, 2500), detail: `${ms} ms round trip · ${d.size} · ${d.tables} tables`, ms },
    { name: "Migrations applied", status: "pass", detail: `${d.migrations.count}, latest ${d.migrations.latest}` },
    { name: "Row security on every table", status: d.rls_off.length ? "fail" : "pass", detail: d.rls_off.length ? `off: ${d.rls_off.join(", ")}` : "every table in public" },
    { name: "Policies ask once per query", status: d.bare_policies ? "warn" : "pass", detail: d.bare_policies ? `${d.bare_policies} policies call auth_restaurant_id() per row (0091)` : "no bare auth calls" },
    { name: "Required functions present", status: d.missing_functions.length ? "fail" : "pass", detail: d.missing_functions.length ? `missing: ${d.missing_functions.join(", ")}` : "19 checked" },
    { name: "Triggers present", status: d.missing_triggers.length ? "fail" : "pass", detail: d.missing_triggers.length ? `missing: ${d.missing_triggers.join(", ")}` : "stock draw, audit" },
    { name: "Indexes present", status: d.missing_indexes.length ? "warn" : "pass", detail: d.missing_indexes.length ? `missing: ${d.missing_indexes.join(", ")}` : "ledger, bills, invoices, order lines" },
    { name: "No negative stock", status: d.integrity.negative_stock ? "warn" : "pass", detail: `${d.integrity.negative_stock} ingredient(s) below zero` },
    { name: "No order open over 24 h", status: d.integrity.orders_open_over_24h ? "warn" : "pass", detail: `${d.integrity.orders_open_over_24h} open` },
    { name: "Paid bills match their payments", status: d.integrity.paid_bills_payments_off ? "fail" : "pass", detail: `${d.integrity.paid_bills_payments_off} off by more than 1 paisa` },
    { name: "Every property has an owner", status: d.integrity.properties_without_owner ? "fail" : "pass", detail: `${d.integrity.properties_without_owner} without` },
    { name: "Load", status: d.longest_query_s > 30 ? "warn" : "pass", detail: `${d.active_queries} active quer${d.active_queries === 1 ? "y" : "ies"}, longest ${d.longest_query_s} s` },
    { name: "Rows", status: "pass", detail: Object.entries(d.counts).map(([k, v]) => `${v} ${k}`).join(" · ") },
  ];
}

async function functions(s: Awaited<ReturnType<typeof createClient>>, restaurant: string | null): Promise<Check[]> {
  if (!restaurant) return [{ name: "Pick a property", status: "skip", detail: "the function sweep runs for one property" }];
  const { data, error } = await s.rpc("selftest_functions", { p_restaurant: restaurant });
  if (error) return [{ name: "Function sweep", status: "fail", detail: error.message }];
  return (data as { name: string; ok: boolean; ms: number; error: string | null }[]).map((f) => ({
    name: f.name, status: f.ok ? speed(f.ms, 800, 1500) : "fail", detail: f.ok ? `${f.ms} ms` : f.error ?? "failed", ms: f.ms }));
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
  await hit("App: robots", `${origin}/robots.txt`, (c) => c === 200);
  await hit("App: sign-in page", `${origin}/login`, (c) => c === 200);
  await hit("App: install page", `${origin}/get`, (c) => c === 200);
  if (slug) { await hit("App: public storefront", `${origin}/dine/${slug}`, (c) => c === 200, undefined, 1000, 2500); await hit("App: public queue", `${origin}/queue/${slug}`, (c) => c === 200, undefined, 1000, 2500); }
  await hit("Wikimedia (dish photos)", "https://en.wikipedia.org/w/api.php?action=query&format=json&meta=siteinfo", (c) => c === 200, undefined, 1500, 4000);
  const env = (k: string) => Boolean(process.env[k]);
  out.push({ name: "Supabase keys set", status: env("NEXT_PUBLIC_SUPABASE_URL") && env("NEXT_PUBLIC_SUPABASE_ANON_KEY") ? "pass" : "fail" });
  out.push({ name: "CRON_SECRET set", status: env("CRON_SECRET") ? "pass" : "warn", detail: env("CRON_SECRET") ? undefined : "the nightly channel sync fails closed without it" });
  out.push({ name: "Service role key set", status: env("SUPABASE_SERVICE_ROLE_KEY") ? "pass" : "warn", detail: env("SUPABASE_SERVICE_ROLE_KEY") ? undefined : "attendance photo links and the nightly sync need it" });
  out.push({ name: "Anthropic key set", status: env("ANTHROPIC_API_KEY") ? "pass" : "warn", detail: env("ANTHROPIC_API_KEY") ? "AI fill-ins on" : "AI fill-ins answer with samples" });
  return out;
}

async function security(origin: string, s: Awaited<ReturnType<typeof createClient>>): Promise<Check[]> {
  const out: Check[] = [];
  const { r } = await timed(`${origin}/login`);
  const h = (k: string) => r?.headers.get(k) ?? "";
  const want: [string, string, RegExp, Status][] = [
    ["Content-Security-Policy", "content-security-policy", /frame-ancestors/i, "fail"], ["X-Frame-Options", "x-frame-options", /SAMEORIGIN|DENY/i, "fail"],
    ["X-Content-Type-Options", "x-content-type-options", /nosniff/i, "fail"], ["Referrer-Policy", "referrer-policy", /./, "fail"], ["Permissions-Policy", "permissions-policy", /camera/i, "warn"]];
  for (const [name, key, re, miss] of want) out.push({ name: `Header: ${name}`, status: re.test(h(key)) ? "pass" : miss, detail: h(key) ? h(key).slice(0, 80) : "missing" });
  const https = origin.startsWith("https://");
  out.push({ name: "Header: Strict-Transport-Security", status: /max-age/.test(h("strict-transport-security")) ? "pass" : https ? "fail" : "skip", detail: https ? h("strict-transport-security") || "missing" : "only over https" });
  // anonymous reads on tenant tables must come back empty — row security, not luck
  const anon = { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } };
  for (const t of ["restaurants", "profiles", "bills", "orders", "order_items", "stock_ledger", "invoices", "audit_events", "payment_gateways", "selftest_runs"]) {
    const { r: x, err } = await timed(`${SB}/rest/v1/${t}?select=id&limit=1`, anon);
    const body = x ? await x.text().catch(() => "") : "";
    const rows = x && x.ok ? (() => { try { return (JSON.parse(body) as unknown[]).length; } catch { return 0; } })() : 0;
    out.push({ name: `Anonymous read of ${t}`, status: x ? (rows === 0 ? "pass" : "fail") : "warn", detail: x ? `${rows} row(s) · http ${x.status}` : err ?? "" });
  }
  const { r: ao } = await timed(`${SB}/rest/v1/rpc/admin_overview`, { method: "POST", ...anon, body: "{}" });
  out.push({ name: "Anonymous call of admin_overview", status: ao && ao.status >= 400 ? "pass" : "fail", detail: `http ${ao?.status ?? "—"}` });
  for (const p of ["/dashboard", "/admin", "/orders/new"]) {
    const { r: x } = await timed(`${origin}${p}`);
    const to = x?.headers.get("location") ?? "";
    out.push({ name: `Signed-out visit to ${p}`, status: x && [301, 302, 303, 307, 308].includes(x.status) && /\/login/.test(to) ? "pass" : "fail", detail: x ? `http ${x.status} → ${to || "no redirect"}` : "no answer" });
  }
  const { r: me } = await timed(`${origin}/api/admin/selftest`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
  out.push({ name: "This test route without a session", status: me && me.status === 401 ? "pass" : "fail", detail: `http ${me?.status ?? "—"}` });
  const { r: cron } = await timed(`${origin}/api/ota/sync`);
  out.push({ name: "Nightly sync without its secret", status: cron && cron.status === 401 ? "pass" : "warn", detail: `http ${cron?.status ?? "—"}` });
  const leaked = Object.keys(process.env).filter((k) => k.startsWith("NEXT_PUBLIC_") && /SECRET|SERVICE_ROLE|PRIVATE/i.test(k));
  out.push({ name: "No secret under a public env name", status: leaked.length ? "fail" : "pass", detail: leaked.join(", ") || "NEXT_PUBLIC_* holds only the URL and the anon key" });
  const { data: d } = await s.rpc("selftest_db");
  const bare = (d as { bare_policies?: number } | null)?.bare_policies ?? 0;
  out.push({ name: "Row-security policies tight", status: bare ? "warn" : "pass", detail: bare ? `${bare} bare` : "every tenant table scoped to its property" });
  const facts = missingFacts().length;
  out.push({ name: "Legal facts on the public pages", status: facts ? "warn" : "pass", detail: facts ? `${facts} still unset in lib/company.ts` : "complete" });
  return out;
}

async function performance(origin: string, cookie: string, s: Awaited<ReturnType<typeof createClient>>, acting: boolean): Promise<Check[]> {
  const out: Check[] = [];
  // public screens are timed as a stranger sees them (no cookie — a signed-in master is sent on from /login)
  const page = async (p: string, signedIn = true) => {
    const { r, ms, err } = await timed(`${origin}${p}`, signedIn ? { headers: { cookie } } : undefined);
    const kb = r ? Math.round(((await r.text().catch(() => "")).length) / 1024) : 0;
    out.push({ name: `Screen ${p}`, status: r && r.status === 200 ? speed(ms) : "fail", detail: r ? `${ms} ms · ${kb} KB · http ${r.status}` : err ?? "", ms });
  };
  await page("/login", false); await page("/get", false); await page("/admin");
  if (acting) for (const p of ["/dashboard", "/orders", "/orders/new", "/kitchen", "/billing", "/menu", "/inventory", "/invoices", "/reports", "/tomorrow", "/settings"]) await page(p);
  else out.push({ name: "Property screens", status: "skip", detail: "open a property (Master control → Open) to time its screens" });
  for (const [name, fn] of [["session_bundle", () => s.rpc("session_bundle")], ["is_master", () => s.rpc("is_master")], ...(acting ? [["dashboard_figures", () => s.rpc("dashboard_figures")]] : [])] as [string, () => PromiseLike<{ error: { message: string } | null }>][]) {
    const t0 = Date.now(); const { error } = await fn(); const ms = Date.now() - t0;
    out.push({ name: `Database call ${name}`, status: error ? "fail" : speed(ms, 400, 1500), detail: error ? error.message : `${ms} ms`, ms });
  }
  return out;
}

function unit(): Check[] {
  const t = (name: string, f: () => boolean) => { try { return { name, status: f() ? "pass" : "fail" } as Check; } catch (e) { return { name, status: "fail", detail: (e as Error).message } as Check; } };
  return [
    t("formatINR keeps paise on a bill", () => formatINR(1234.5) === "₹1,234.50"),
    t("formatINR drops paise on a menu price", () => formatINR(280, { whole: true }) === "₹280"),
    t("todayIST is a date in Asia/Kolkata", () => /^\d{4}-\d{2}-\d{2}$/.test(todayIST())),
    t("computeBill adds 5% GST to a ₹200 bill", () => { const b = computeBill({ lines: [{ price: 100, qty: 2 }], gstRate: 5 }); return b.subtotal === 200 && b.cgst === 5 && b.sgst === 5 && b.total === 210; }),
    t("the recipe library finds a plate", () => findStandardRecipe("Chicken Biryani")?.dish === "Chicken biryani"),
    t("the recipe library refuses a wrong plate", () => findStandardRecipe("Mango juice") === null),
    t("fmtQty reads as a cook does", () => fmtQty(0.18, "kg") === "180 g" && fmtQty(0.015, "l") === "15 ml"),
    t("till search matches initials", () => Boolean(dishMatch("Chicken biryani", "cb")) && !dishMatch("Chicken biryani", "zz")),
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
  const checks = suite === "database" ? await database(s) : suite === "functions" ? await functions(s, body.restaurant ?? null) : suite === "api" ? await api(origin, slug)
    : suite === "security" ? await security(origin, s) : suite === "performance" ? await performance(origin, cookie, s, acting) : unit();
  const ms = Date.now() - t0; const status = worst(checks);
  await s.from("selftest_runs").insert({ suite, status, ms, checks, ran_by: user.id });
  return NextResponse.json({ suite, status, ms, checks, ran_at: new Date().toISOString() });
}

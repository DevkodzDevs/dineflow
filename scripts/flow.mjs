import { PGlite } from "/tmp/node_modules/@electric-sql/pglite/dist/index.js";
import { readFileSync, readdirSync } from "node:fs";
const dir = "/home/claude/dineflow/supabase/migrations";
const db = await PGlite.create();
const clean = (t) => t.replace(/create extension[^;]*;/gi, "");
await db.exec(`create schema if not exists auth;
create table auth.users (id uuid primary key, instance_id uuid, aud text, role text, email text unique, encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz default now(), updated_at timestamptz default now(), confirmation_token text, recovery_token text, email_change_token_new text, email_change text);
create table auth.identities (id uuid primary key, user_id uuid references auth.users(id) on delete cascade, provider_id text, identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
create schema realtime; create publication supabase_realtime; create role anon; create role authenticated; create role service_role;
create function gen_random_bytes(int) returns bytea language sql as $f$ select decode(md5(random()::text||clock_timestamp()::text),'hex') $f$;
create function crypt(text,text) returns text language sql as $f$ select md5($1||$2) $f$;
create function gen_salt(text) returns text language sql as $f$ select md5(random()::text) $f$;
create function digest(text,text) returns bytea language sql as $f$ select decode(md5($1),'hex') $f$;`);
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await db.exec(clean(readFileSync(`${dir}/${f}`, "utf8")));

const q = async (sql, label) => { try { const r = await db.query(sql); return r; } catch (e) { console.log("✗", label, "→", e.message.split("\n")[0]); return null; } };
const ok = (label, extra = "") => console.log("✓", label, extra);

// act as the master (created by 0011)
const [{ id: master }] = (await db.query(`select id from auth.users where email='master@dineflow.in'`)).rows;
await db.exec(`set app.uid = '${master}'`);
ok("master login exists");

// RLS is on; run as a superuser session but with auth.uid set — that is what security-definer RPCs see
let r = await q(`select install_sample_estate() j`, "install_sample_estate");
if (r) {
  const props = r.rows[0].j.properties;
  ok("sample estate", `${props.length} properties`);
  const [{ c: rests }] = (await db.query(`select count(*) c from restaurants`)).rows;
  const [{ c: orders }] = (await db.query(`select count(*) c from orders`)).rows;
  const [{ c: bills }] = (await db.query(`select count(*) c from bills`)).rows;
  const [{ c: rooms }] = (await db.query(`select count(*) c from rooms`)).rows;
  const [{ c: bk }] = (await db.query(`select count(*) c from bookings`)).rows;
  const [{ c: per }] = (await db.query(`select count(*) c from business_periods`)).rows;
  ok("seeded data", `${rests} properties · ${orders} orders · ${bills} bills · ${rooms} rooms · ${bk} bookings · ${per} sealed months`);

  // act as one property
  const rid = props.find((p) => p.type === "resort").id;
  await db.exec(`insert into admin_context(user_id, restaurant_id) values ('${master}','${rid}') on conflict (user_id) do update set restaurant_id=excluded.restaurant_id`);

  for (const [sql, label] of [
    [`select forecast_day(current_date + 1) j`, "forecast_day (Tomorrow brief)"],
    [`select business_record() j`, "business_record (Proof)"],
    [`select verify_chain() j`, "verify_chain"],
    [`select network_status() j`, "network_status"],
    [`select jsonb_agg(to_jsonb(x)) j from network_prices(21) x`, "network_prices (Neighbours)"],
    [`select network_demand() j`, "network_demand"],
    [`select jsonb_agg(to_jsonb(a)) j from availability(current_date, current_date+7) a`, "availability"],
    [`select dine_discover(null,null,null,null,null) j`, "dine_discover"],
    [`select forecast_scorecard(30) j`, "forecast_scorecard"],
    [`select admin_overview() is not null j`, "admin_overview"],
  ]) { const x = await q(sql, label); if (x) ok(label); }

  // storefront + booking + ordering, as an anonymous guest would
  const [{ slug }] = (await db.query(`select booking_slug slug from restaurants where id='${rid}'`)).rows;
  const sf = await q(`select dine_storefront('${slug}') j`, "dine_storefront");
  if (sf?.rows[0].j) ok("dine_storefront", `${sf.rows[0].j.menu.length} categories, ${sf.rows[0].j.offers.length} offers`);
  const sl = await q(`select dine_slots('${slug}', current_date + 1, 2) j`, "dine_slots");
  if (sl) ok("dine_slots", `${sl.rows[0].j.length} slots`);
  const t = sl?.rows[0].j?.find((s) => !s.full)?.time;
  if (t) {
    const rv = await q(`select dine_reserve('${slug}', '{"full_name":"Test Guest","phone":"9840000000"}'::jsonb, current_date + 1, '${t}'::time, 4, 'Birthday', 'window table', null) j`, "dine_reserve");
    if (rv) ok("dine_reserve", `booking #${rv.rows[0].j.no} at ${rv.rows[0].j.time}`);
  }
  const item = (await db.query(`select id from menu_items where restaurant_id='${rid}' limit 1`)).rows[0].id;
  const od = await q(`select dine_order('${slug}', '{"full_name":"Test Guest","phone":"9840000000","address":"12 Test St"}'::jsonb, '[{"id":"${item}","qty":3}]'::jsonb, 'takeaway', null, null) j`, "dine_order");
  if (od) ok("dine_order", `ref ${od.rows[0].j.ref} · total ${od.rows[0].j.total}`);
  const oo = (await db.query(`select id from online_orders where restaurant_id='${rid}' order by placed_at desc limit 1`)).rows[0].id;
  const ac = await q(`select accept_online_order('${oo}') j`, "accept_online_order");
  if (ac) ok("accept_online_order → kitchen");

  // core restaurant cycle
  const tbl = (await db.query(`select id from dining_tables where restaurant_id='${rid}' limit 1`)).rows[0].id;
  const po = await q(`select place_order('${tbl}','dine_in','[{"menu_item_id":"${item}","qty":2}]'::jsonb,'{}'::jsonb,null,null,null) id`, "place_order");
  if (po) { ok("place_order");
    const oid = po.rows[0].id;
    const gb = await q(`select generate_bill('${oid}', 0, 0) id`, "generate_bill");
    if (gb) { ok("generate_bill");
      const sb = await q(`select settle_bill('${gb.rows[0].id}','[{"method":"upi","amount":999999}]'::jsonb, null)`, "settle_bill");
      if (sb) ok("settle_bill");
      const inv = await q(`select generate_dining_invoice('${gb.rows[0].id}', 'Test', null, null) id`, "generate_dining_invoice");
      if (inv) ok("generate_dining_invoice");
    }
  }
  // hotel cycle
  const bkid = (await db.query(`select id from bookings where restaurant_id='${rid}' and status='checked_in' limit 1`)).rows[0]?.id;
  if (bkid) {
    const ft = await q(`select to_jsonb(f) j from folio_totals('${bkid}') f`, "folio_totals");
    if (ft) ok("folio_totals", `total ${ft.rows[0].j.total}`);
    const co = await q(`select check_out('${bkid}', '[{"method":"cash","amount":999999}]'::jsonb) id`, "check_out");
    if (co) ok("check_out → invoice", co.rows[0].id ? "invoice created" : "");
  }
  // labour + scan
  const lab = (await db.query(`select code from labourers where restaurant_id='${rid}' limit 1`)).rows[0].code;
  const pu = await q(`select labour_punch('${lab}') j`, "labour_punch");
  if (pu) ok("labour_punch", pu.rows[0].j.event);
  const sp = await q(`select seal_all_periods(6) n`, "seal_all_periods");
  if (sp) ok("seal_all_periods");
  const pl = await q(`select proof_create('Bank','bank', (current_date - interval '3 months')::date, current_date, 30, true) j`, "proof_create");
  if (pl) { ok("proof_create");
    const po2 = await q(`select proof_open('${pl.rows[0].j.token}', 'test') j`, "proof_open");
    if (po2) ok("proof_open", `${po2.rows[0].j.months} months, chain ${po2.rows[0].j.chain_intact ? "intact" : "BROKEN"}`);
  }
}
await db.close();

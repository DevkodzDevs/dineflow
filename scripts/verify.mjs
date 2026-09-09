import { PGlite } from "/tmp/node_modules/@electric-sql/pglite/dist/index.js";
import { readFileSync, readdirSync } from "node:fs";
const dir = "/home/claude/dineflow/supabase/migrations";
const db = await PGlite.create();
await db.exec(`create schema auth;
create table auth.users (id uuid primary key, instance_id uuid, aud text, role text, email text unique, encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz default now(), updated_at timestamptz default now(), confirmation_token text, recovery_token text, email_change_token_new text, email_change text);
create table auth.identities (id uuid primary key, user_id uuid, provider_id text, identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true),'')::uuid $$;
create schema realtime; create publication supabase_realtime; create role anon; create role authenticated; create role service_role;
create function gen_random_bytes(int) returns bytea language sql as $f$ select decode(md5(random()::text||clock_timestamp()::text),'hex') $f$;
create function crypt(text,text) returns text language sql as $f$ select md5($1||$2) $f$;
create function gen_salt(text) returns text language sql as $f$ select md5(random()::text) $f$;
create function digest(text,text) returns bytea language sql as $f$ select decode(md5($1),'hex') $f$;`);
for (const f of readdirSync(dir).filter(x=>x.endsWith(".sql")).sort()) await db.exec(readFileSync(`${dir}/${f}`,"utf8").replace(/create extension[^;]*;/gi,""));
const [{id:master}] = (await db.query(`select id from auth.users where email='master@dineflow.in'`)).rows;
await db.exec(`set app.uid = '${master}'`);
await db.query(`select install_sample_estate()`);
const one = async (s) => (await db.query(s)).rows[0];
const props = (await db.query(`select id, name, property_type from restaurants order by name`)).rows;
const rid = props.find(p=>p.property_type==='resort').id;
await db.exec(`insert into admin_context(user_id,restaurant_id) values ('${master}','${rid}') on conflict (user_id) do update set restaurant_id=excluded.restaurant_id`);
const chk = (label, cond, detail="") => console.log(cond ? "✓" : "✗ FAIL", label, detail);

// 1. tenant isolation: my restaurant only
const mine = await one(`select count(*) c from orders where restaurant_id='${rid}'`);
const all = await one(`select count(*) c from orders`);
chk("multi-tenant data separated", Number(mine.c) > 0 && Number(all.c) > Number(mine.c), `${mine.c} of ${all.c} orders are this property's`);

// 2. stock actually moves on a sale
const ing = await one(`select id, name, current_stock from ingredients where restaurant_id='${rid}' and name='Basmati rice'`);
const item = await one(`select id from menu_items where restaurant_id='${rid}' and name='Chicken biryani'`);
const tbl = await one(`select id from dining_tables where restaurant_id='${rid}' limit 1`);
await db.query(`select place_order('${tbl.id}','dine_in','[{"menu_item_id":"${item.id}","qty":5}]'::jsonb,'{}'::jsonb,null,null,null)`);
const after = await one(`select current_stock from ingredients where id='${ing.id}'`);
chk("recipe deducts stock", Number(after.current_stock) < Number(ing.current_stock), `${ing.current_stock} → ${after.current_stock} kg after 5 biryanis`);

// 3. bill maths
const o = await one(`select id from orders where restaurant_id='${rid}' and status='open' limit 1`);
const b = await one(`select generate_bill('${o.id}',0,0) id`);
const bill = await one(`select subtotal, cgst, sgst, total from bills where id='${b.id}'`);
const gstRate = Number((await one(`select gst_rate from restaurants where id='${rid}'`)).gst_rate);
const expect = Math.round(Number(bill.subtotal) * (1 + gstRate/100));
chk("bill GST maths", Math.abs(Number(bill.total) - expect) <= 1, `sub ${bill.subtotal} + ${gstRate}% = ${bill.total} (expected ~${expect})`);
chk("GST split evenly", Math.abs(Number(bill.cgst) - Number(bill.sgst)) < 0.02, `CGST ${bill.cgst} / SGST ${bill.sgst}`);

// 4. no double-booking a room
const rm = await one(`select id from rooms where restaurant_id='${rid}' limit 1`);
const gj = `'{"full_name":"Overlap Test","phone":"9800000000"}'::jsonb`;
await db.query(`select create_booking(${gj},'${rm.id}', current_date+30, current_date+32, 2, 0, 2500, 0, 'walk_in', null)`);
let blocked = false;
try { await db.query(`select create_booking(${gj},'${rm.id}', current_date+31, current_date+33, 2, 0, 2500, 0, 'walk_in', null)`); }
catch { blocked = true; }
chk("room double-booking blocked", blocked);

// 5. Proof chain detects tampering
const before = await one(`select verify_chain() j`);
await db.query(`update business_periods set total_revenue = total_revenue + 50000 where restaurant_id='${rid}' and period = (select min(period) from business_periods where restaurant_id='${rid}')`);
const afterT = await one(`select verify_chain() j`);
chk("chain intact before tampering", before.j.intact === true, `${before.j.periods} months`);
chk("chain DETECTS tampering", afterT.j.intact === false, afterT.j.broken?.[0]?.reason ?? "");

// 6. Neighbours k-anonymity
const st = await one(`select network_status() j`);
const pr = await db.query(`select * from network_prices(21)`);
chk("neighbours has 5 peers", Number(st.j.peers_prices) === 5, `${st.j.peers_prices} peers, min ${st.j.min_contributors}`);
chk("price index returns rows", pr.rows.length > 0, `${pr.rows.length} items compared, e.g. ${pr.rows[0]?.item} you ${pr.rows[0]?.my_price} vs median ${pr.rows[0]?.area_median}`);
// turn sharing off for 2 peers → should fall below the minimum and return nothing
await db.query(`update network_settings set share_prices=false where restaurant_id in (select id from restaurants where id<>'${rid}' limit 2)`);
const pr2 = await db.query(`select * from network_prices(21)`);
chk("k-anonymity hides data below 5", pr2.rows.length === 0, `${pr2.rows.length} rows with only 3 peers`);
await db.query(`update network_settings set share_prices=true`);

// 7. storefront capacity
const slug = (await one(`select booking_slug s from restaurants where id='${rid}'`)).s;
const cap = (await one(`select coalesce(sum(capacity),0) c from dining_tables where restaurant_id='${rid}'`)).c;
let filled = 0, err = null;
for (let i=0;i<40;i++){ try { await db.query(`select dine_reserve('${slug}','{"full_name":"G${i}","phone":"9${i}"}'::jsonb, current_date+2, '19:00'::time, 4, null, null, null)`); filled += 4; } catch(e){ err = e.message; break; } }
chk("booking stops at capacity", err !== null, `filled ${filled} of ${cap} seats then refused: "${String(err).slice(0,50)}"`);

// 8. Tomorrow brief produces a real number
const fc = await one(`select forecast_day(current_date+1) j`);
chk("forecast predicts", fc.j.predicted_covers > 0 && fc.j.samples > 0, `${fc.j.predicted_covers} covers, ${fc.j.samples} comparable days, ${Math.round(fc.j.confidence*100)}% confidence`);
chk("forecast writes a market list", Array.isArray(fc.j.purchase), `${fc.j.purchase.length} items to buy, ~₹${fc.j.est_purchase_cost}`);

// 9. offers actually discount
const mi = await one(`select id from menu_items where restaurant_id='${rid}' order by price desc limit 1`);
const ord = await one(`select dine_order('${slug}','{"full_name":"Off","phone":"98","address":"x"}'::jsonb,'[{"id":"${mi.id}","qty":4}]'::jsonb,'takeaway',null,(select id from offers where restaurant_id='${rid}' and kind='flat_pct' and scope='both' limit 1)) j`);
chk("offer discounts the order", Number(ord.j.discount) > 0, `sub ${ord.j.subtotal} − ${ord.j.discount} = ${ord.j.total}`);

// 10. membership gate
await db.query(`update restaurants set membership='expired', trial_ends_at=now()-interval '1 day' where id='${rid}'`);
const state = await one(`select membership_state_for('${rid}') s`);
chk("expired membership detected", state.s === 'expired', state.s);
await db.query(`update restaurants set membership='active', membership_ends_at=now()+interval '300 days' where id='${rid}'`);
await db.close();

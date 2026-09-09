import { PGlite } from "/tmp/node_modules/@electric-sql/pglite/dist/index.js";
import { readFileSync, readdirSync } from "node:fs";
const dir = "/home/claude/dineflow/supabase/migrations";
const db = await PGlite.create();
await db.exec(readFileSync("/tmp/sqltest/shim.sql","utf8"));
let failed = null;
for (const f of readdirSync(dir).filter(x=>x.endsWith(".sql")).sort()) { try { await db.exec(readFileSync(`${dir}/${f}`,"utf8").replace(/create extension[^;]*;/gi,"")); } catch (e) { failed = [f, e.message]; break; } }
if (failed) { console.log("✗", failed[0], failed[1].split("\n")[0]); process.exit(0); }
console.log("✓ all 17 migrations apply");
const [{id:master}] = (await db.query(`select id from auth.users where email='master@dineflow.in'`)).rows;
await db.exec(`set app.uid = '${master}'`); await db.query(`select install_sample_estate()`);
const one = async (s) => (await db.query(s)).rows[0];
const rid = (await one(`select id from restaurants where property_type='restaurant' order by name limit 1`)).id;
await db.exec(`insert into admin_context(user_id,restaurant_id) values ('${master}','${rid}')`);
const chk = (l, c, d="") => console.log(c ? "✓" : "✗ FAIL", l, d);
// leak finder: count rice 3 kg below what recipes say
const rice = await one(`select id, name, current_stock, cost_per_unit from ingredients where restaurant_id='${rid}' and name ilike '%rice%' limit 1`);
const sc = await one(`select stock_count('[{"ingredient_id":"${rice.id}","counted":${Number(rice.current_stock)-3}}]'::jsonb) j`);
chk("stock count writes an adjustment", sc.j.counted === 1, `gap value ₹${sc.j.gap_value}`);
const after = await one(`select current_stock from ingredients where id='${rice.id}'`);
chk("stock now equals what was counted", Math.abs(Number(after.current_stock) - (Number(rice.current_stock)-3)) < 0.001);
const lr = await one(`select leak_report(30) j`);
const riceRow = lr.j.items.find(i => i.name === rice.name);
chk("leak report names the loss", lr.j.worst === rice.name && riceRow.gap_qty === -3 && riceRow.counted === true, `${lr.j.worst}: ${riceRow.gap_qty} ${riceRow.unit} = ₹${-riceRow.gap_value} lost · ${lr.j.uncounted} never counted`);
chk("lost value adds up", Math.round(lr.j.lost_value) === Math.round(3 * Number(rice.cost_per_unit)), `₹${lr.j.lost_value}`);
// shift close: settle two bills today, then close
const tbl = (await db.query(`select id from dining_tables where restaurant_id='${rid}' limit 2`)).rows;
const item = (await one(`select id, price from menu_items where restaurant_id='${rid}' limit 1`));
let cash = 0, upi = 0;
for (const [i, t] of tbl.entries()) { const o = await one(`select place_order('${t.id}','dine_in','[{"menu_item_id":"${item.id}","qty":2}]'::jsonb,'{}'::jsonb,null,null,null) id`); const b = await one(`select generate_bill('${o.id}',0,0) id`); const tot = (await one(`select total from bills where id='${b.id}'`)).total; await db.query(`select settle_bill('${b.id}','[{"method":"${i ? "upi" : "cash"}","amount":${tot}}]'::jsonb, null)`); if (i) upi += Number(tot); else cash += Number(tot); }
const ex = await one(`select shift_expected() j`);
chk("expected till matches the day's payments", Math.abs(Number(ex.j.cash) - cash) < 0.01 && Math.abs(Number(ex.j.upi) - upi) < 0.01, `cash ₹${ex.j.cash} · upi ₹${ex.j.upi} · ${ex.j.bills} bills`);
const cl = await one(`select shift_close(${cash - 50 + 2000}, 2000, 'Gas cylinder paid from till') j`);
chk("close records a ₹50 short", Math.round(Number(cl.j.variance)) === -50, `variance ${cl.j.variance}`);
chk("summary reads like a message", /short/.test(cl.j.summary) && /Gas cylinder/.test(cl.j.summary), `"${cl.j.summary.slice(0, 120)}…"`);
const ex2 = await one(`select shift_expected() j`);
chk("next shift starts from zero", Number(ex2.j.total) === 0, `₹${ex2.j.total} since close`);
await db.close();

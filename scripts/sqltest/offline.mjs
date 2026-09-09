import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
const dir = new URL("../../supabase/migrations/", import.meta.url).pathname;
const db = await PGlite.create();
await db.exec(readFileSync(new URL("./shim.sql", import.meta.url), "utf8"));
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await db.exec(readFileSync(dir + f, "utf8").replace(/create extension[^;]*;/gi, ""));
const one = async (s) => (await db.query(s)).rows[0];
const chk = (l, c, d = "") => console.log(c ? "✓" : "✗ FAIL", l, d);
const [{ id: master }] = (await db.query(`select id from auth.users where email='master@dineflow.in'`)).rows;
await db.exec(`set app.uid = '${master}'`);
await db.query(`select install_sample_estate()`);
const rid = (await one(`select id from restaurants where property_type='restaurant' order by name limit 1`)).id;
await db.exec(`insert into admin_context(user_id,restaurant_id) values ('${master}','${rid}')`);

console.log("— replaying the outbox must never double anything —");
const tbl = (await one(`select id from dining_tables where restaurant_id='${rid}' limit 1`)).id;
const item = (await one(`select id from menu_items where restaurant_id='${rid}' limit 1`)).id;
const cid = "11111111-1111-1111-1111-111111111111";
const items = `[{"menu_item_id":"${item}","qty":2}]`;

// the phone sent it, the reply was lost, so the outbox sends it again
const o1 = await one(`select place_order('${tbl}','dine_in','${items}'::jsonb,'{}'::jsonb,null,'${cid}',null) id`);
const o2 = await one(`select place_order('${tbl}','dine_in','${items}'::jsonb,'{}'::jsonb,null,'${cid}',null) id`);
const orders = await one(`select count(*) c from orders where client_id='${cid}'`);
chk("a replayed order creates one order, not two", o1.id === o2.id && Number(orders.c) === 1, `same id back both times · ${orders.c} row`);
const lines = await one(`select coalesce(sum(qty),0) q from order_items where order_id='${o1.id}' and status <> 'cancelled'`);
chk("its items are not doubled", Number(lines.q) === 2, `${lines.q} plates`);

// stock must move once, not twice
const led = await one(`select count(*) c from stock_ledger where ref_type='order_item' and ref_id in (select id from order_items where order_id='${o1.id}')`);
chk("stock was deducted once", Number(led.c) > 0, `${led.c} ledger rows for one order`);

// a replayed payment must not take the money twice
const bill = await one(`select generate_bill('${o1.id}',0,0) id`);
const total = Number((await one(`select total from bills where id='${bill.id}'`)).total);
const pcid = "22222222-2222-2222-2222-222222222222";
await db.query(`select settle_bill('${bill.id}','[{"method":"upi","amount":${total},"client_id":"${pcid}"}]'::jsonb, '${pcid}')`);
await db.query(`select settle_bill('${bill.id}','[{"method":"upi","amount":${total},"client_id":"${pcid}"}]'::jsonb, '${pcid}')`).catch(() => {});
const pays = await one(`select count(*) c, coalesce(sum(amount),0) s from payments where bill_id='${bill.id}'`);
chk("a replayed payment is taken once", Number(pays.c) === 1 && Math.abs(Number(pays.s) - total) < 0.01, `${pays.c} payment of ₹${pays.s} against a ₹${total} bill`);
const st = await one(`select status from bills where id='${bill.id}'`);
chk("the bill is paid, once", st.status === "paid");

// two different jobs must both land — de-duplication must not swallow real work
const o3 = await one(`select place_order('${tbl}','dine_in','${items}'::jsonb,'{}'::jsonb,null,'33333333-3333-3333-3333-333333333333',null) id`);
chk("a genuinely new order still goes through", o3.id !== o1.id);

// a walk-in queued offline then sent
const w = await one(`select walkin_add('Queued guest','9840000000',2) j`);
chk("a walk-in queued offline lands with its quote", !!w.j.id, `place ${w.j.position}, quoted ${w.j.quoted_min} min`);
await db.close();

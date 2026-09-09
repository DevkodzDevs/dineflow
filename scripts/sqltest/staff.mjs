import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
const dir = new URL("../../supabase/migrations/", import.meta.url).pathname;
const db = await PGlite.create(); await db.exec(readFileSync(new URL("./shim.sql", import.meta.url),"utf8"));
let failed=null; for (const f of readdirSync(dir).filter(x=>x.endsWith(".sql")).sort()) { try { await db.exec(readFileSync(dir+f,"utf8").replace(/create extension[^;]*;/gi,"")); } catch(e) { failed=[f,e.message.split("\n")[0]]; break; } }
if (failed) { console.log("✗", ...failed); process.exit(0); } console.log("✓ all 19 migrations apply");
const one = async (s) => (await db.query(s)).rows[0]; const chk=(l,c,d="")=>console.log(c?"✓":"✗ FAIL",l,d);
const [{id:master}] = (await db.query(`select id from auth.users where email='master@dineflow.in'`)).rows;
await db.exec(`set app.uid = '${master}'`); await db.query(`select install_sample_estate()`);
const owner = await one(`select p.id, p.restaurant_id rid from profiles p join auth.users u on u.id=p.id where u.email='owner@annapoorna.in'`);
// hire a waiter and a manager into the same property
const mk = async (email, role) => { const id = (await one(`insert into auth.users(id,email) values (gen_random_uuid(),'${email}') returning id`)).id; await db.query(`insert into profiles(id, restaurant_id, full_name, role, is_active) values ('${id}','${owner.rid}','${email}','${role}',true)`); return id; };
const waiter = await mk("waiter@annapoorna.in","waiter"); const manager = await mk("manager@annapoorna.in","manager");
await db.exec(`set app.uid = '${owner.id}'`);
await db.query(`select owner_set_access('${waiter}','waiter', array['orders','pulse'])`);
const w = await one(`select role, allowed_modules m from profiles where id='${waiter}'`);
chk("owner limits a waiter to two sections", w.role==='waiter' && w.m.join()==='orders,pulse', w.m.join(", "));
await db.query(`select owner_set_access('${waiter}','cashier', null)`);
chk("owner changes a role; NULL means the role's default", (await one(`select role, allowed_modules m from profiles where id='${waiter}'`)).role==='cashier');
let b=false; try { await db.query(`select owner_set_access('${owner.id}','waiter', null)`); } catch(e){ b=/own role/.test(e.message); } chk("owner cannot change their own role", b);
b=false; try { await db.query(`select owner_set_access('${owner.id}','owner', null, false)`); } catch(e){ b=/own role/.test(e.message); } chk("owner cannot deactivate themselves", b);
await db.query(`select owner_set_access('${manager}','owner', null)`);   // a second owner
await db.exec(`set app.uid = '${manager}'`);
await db.query(`select owner_set_access('${owner.id}','manager', null)`);
chk("with two owners, one can demote the other", (await one(`select role from profiles where id='${owner.id}'`)).role==='manager');
b=false; try { await db.query(`select owner_set_access('${manager}','manager', null)`); } catch(e){ b=/own role/.test(e.message); } chk("the remaining owner cannot demote themselves (last owner)", b);
await db.exec(`set app.uid = '${owner.id}'`);   // now a manager
b=false; try { await db.query(`select owner_set_access('${manager}','waiter', null)`); } catch(e){ b=/cannot change an owner/.test(e.message); } chk("a manager cannot touch an owner", b);
b=false; try { await db.query(`select owner_set_access('${waiter}','owner', null)`); } catch(e){ b=/cannot change an owner/.test(e.message); } chk("a manager cannot make an owner", b);
await db.query(`select owner_set_access('${waiter}','chef', array['kitchen'])`);
chk("a manager can set a waiter's access", (await one(`select role from profiles where id='${waiter}'`)).role==='chef');
await db.exec(`set app.uid = '${waiter}'`);
b=false; try { await db.query(`select owner_set_access('${manager}','waiter', null)`); } catch(e){ b=/only an owner or manager/.test(e.message); } chk("an employee cannot set anyone's access", b);
const other = await one(`select p.id from profiles p join auth.users u on u.id=p.id where u.email='owner@marina.in'`);
await db.exec(`set app.uid = '${manager}'`);
b=false; try { await db.query(`select owner_set_access('${other.id}','waiter', null)`); } catch(e){ b=/not a member/.test(e.message); } chk("nobody can reach into another property", b);
await db.close();

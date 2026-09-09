import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
const dir = new URL("../../supabase/migrations/", import.meta.url).pathname;
const db = await PGlite.create(); await db.exec(readFileSync(new URL("./shim.sql", import.meta.url),"utf8"));
let failed=null; for (const f of readdirSync(dir).filter(x=>x.endsWith(".sql")).sort()) { try { await db.exec(readFileSync(dir+f,"utf8").replace(/create extension[^;]*;/gi,"")); } catch(e) { failed=[f,e.message.split("\n")[0]]; break; } }
if (failed) { console.log("✗", ...failed); process.exit(0); } console.log("✓ all 18 migrations apply");
const one = async (s) => (await db.query(s)).rows[0]; const chk=(l,c,d="")=>console.log(c?"✓":"✗ FAIL",l,d);
const [{id:master}] = (await db.query(`select id from auth.users where email='master@dineflow.in'`)).rows;
await db.exec(`set app.uid = '${master}'`); await db.query(`select install_sample_estate()`);
const rid = (await one(`select id from restaurants where property_type='restaurant' order by name limit 1`)).id;
chk("master is recognised", (await one(`select is_master() m`)).m === true);
await db.query(`select master_set_modules('${rid}', array['dashboard','orders','kitchen','billing','settings'])`);
const r = await one(`select enabled_modules m from restaurants where id='${rid}'`);
chk("master limits an owner to five modules", r.m.length === 5, r.m.join(", "));
chk("the change is logged", Number((await one(`select count(*) c from admin_log where action='set_modules'`)).c) === 1);
// an owner must not be able to do this
const owner = (await one(`select id from auth.users where email='owner@annapoorna.in'`)).id;
await db.exec(`set app.uid = '${owner}'`);
chk("an owner is not the master", (await one(`select is_master() m`)).m === false);
let blocked=false; try { await db.query(`select master_set_modules('${rid}', null)`); } catch { blocked=true; } chk("an owner cannot change access", blocked);
await db.exec(`set app.uid = '${master}'`); await db.query(`select master_set_modules('${rid}', null)`);
chk("NULL restores everything", (await one(`select enabled_modules m from restaurants where id='${rid}'`)).m === null);
await db.close();

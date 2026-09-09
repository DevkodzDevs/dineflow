// Runs supabase/migrations/*.sql in order against DATABASE_URL, or adds a master admin with --admin email.
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "packages/db/package.json"));
const postgres = require("postgres");
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL missing"); process.exit(1); }
const sql = postgres(url, { ssl: process.env.PGSSLMODE === "disable" ? false : "require", max: 1, onnotice: () => {} });
try {
  const adminIdx = process.argv.indexOf("--admin");
  if (adminIdx > -1) {
    const email = process.argv[adminIdx + 1];
    const r = await sql`insert into platform_admins(user_id, label) select id, 'master' from auth.users where lower(email) = lower(${email}) on conflict do nothing returning user_id`;
    console.log(r.length ? `✔ ${email} is now MASTER admin — open /admin after signing in.` : `! No user with email ${email} yet. Sign up in the app first, then run option 7 again.`);
  } else {
    await sql`create table if not exists _dineflow_migrations (name text primary key, applied_at timestamptz default now())`;
    const done = new Set((await sql`select name from _dineflow_migrations`).map((r) => r.name));
    const dir = join(ROOT, "supabase/migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      if (done.has(f)) { console.log(`· ${f} already applied`); continue; }
      process.stdout.write(`→ ${f} … `);
      await sql.unsafe(readFileSync(join(dir, f), "utf8"));
      await sql`insert into _dineflow_migrations(name) values (${f})`;
      console.log("done");
    }
    console.log("✔ Database ready");
  }
} catch (e) { console.error("✖ " + e.message); process.exit(1); } finally { await sql.end(); }

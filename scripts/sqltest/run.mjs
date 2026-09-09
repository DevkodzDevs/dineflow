import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
const dir = "/home/claude/dineflow/supabase/migrations";
const db = await PGlite.create({ extensions: {} });

// Supabase pieces the migrations assume exist
await db.exec(`
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key, instance_id uuid, aud text, role text, email text unique,
  encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  confirmation_token text, recovery_token text, email_change_token_new text, email_change text);
create table if not exists auth.identities (
  id uuid primary key, user_id uuid references auth.users(id) on delete cascade, provider_id text,
  identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema if not exists realtime;
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'gen_random_bytes') then
    create function gen_random_bytes(int) returns bytea language sql as $f$ select decode(md5(random()::text||clock_timestamp()::text), 'hex') $f$;
  end if;
  if not exists (select 1 from pg_proc where proname = 'crypt') then
    create function crypt(text, text) returns text language sql as $f$ select md5($1 || $2) $f$;
    create function gen_salt(text) returns text language sql as $f$ select md5(random()::text) $f$;
  end if;
  if not exists (select 1 from pg_proc where proname = 'digest') then
    create function digest(text, text) returns bytea language sql as $f$ select decode(md5($1), 'hex') $f$;
  end if;
end $$;
create publication supabase_realtime;
create role anon; create role authenticated; create role service_role;
`);
let fails = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  try { await db.exec(readFileSync(`${dir}/${f}`, "utf8").replace(/create extension[^;]*;/gi, "")); console.log("✓", f); }
  catch (e) { console.log("✗", f, "\n   ", String(e.message).split("\n")[0], "\n   near:", String(e.query||"").slice(0,180).replace(/\s+/g," "));  fails.push([f, e.message]); }
}
console.log(fails.length ? `\nFAILED: ${fails.length}` : "\nALL MIGRATIONS APPLIED");
await db.close();

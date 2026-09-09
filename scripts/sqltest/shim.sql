create schema auth;
create table auth.users (id uuid primary key, instance_id uuid, aud text, role text, email text unique, encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz default now(), updated_at timestamptz default now(), confirmation_token text, recovery_token text, email_change_token_new text, email_change text);
create table auth.identities (id uuid primary key, user_id uuid, provider_id text, identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true),'')::uuid $$;
create schema realtime; create publication supabase_realtime; create role anon; create role authenticated; create role service_role;
create function gen_random_bytes(int) returns bytea language sql as $f$ select decode(md5(random()::text||clock_timestamp()::text),'hex') $f$;
create function crypt(text,text) returns text language sql as $f$ select md5($1||$2) $f$;
create function gen_salt(text) returns text language sql as $f$ select md5(random()::text) $f$;
create function digest(text,text) returns bytea language sql as $f$ select decode(md5($1),'hex') $f$;
-- Runs once when the box database is first created. Passwords come from the env at start.
\set pw `echo "$POSTGRES_PASSWORD"`
alter user authenticator with password :'pw';
alter user supabase_auth_admin with password :'pw';
alter user supabase_admin with password :'pw';
do $$ begin create publication supabase_realtime; exception when duplicate_object then null; end $$;

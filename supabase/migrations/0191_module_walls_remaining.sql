-- 0191 — Module walls on the tables that had only the tenant wall (2026-11-22, the owner: "start" on the open security
-- item before a first pilot property). A read-only sweep of the live database that day found 32 tables a signed-in login
-- could still write straight through the API with nothing in the way but `tenant_all`: a waiter's login could, from a
-- browser's developer tools, add a labour payment, write stock in or out, rewrite a room type's rate, delete rooms and
-- tables, edit loyalty points' ledger, purchases, suppliers, guests' details and the tax filings of its own property.
--
-- The app's screens never needed that. Each of these tables is written either (a) only by security-definer functions,
-- which run as the owner and pass RLS — those tables get "no direct writes"; or (b) by a screen's server action through
-- the person's own session — those get the same `module_wall_*` restrictive policies 0084 put on the menu tables: the
-- write passes only for someone who holds the screen that makes it (`effective_modules`, so the owner's Access ticks,
-- the property's enabled modules and a master acting for a property all count as they do in the app).
--
-- What the app writes directly, and so what stays open, was read from every `.from("…").insert/update/delete/upsert` in
-- apps/web, apps/mobile and the offline queue on 2026-11-22. One trigger writes as the caller: `apply_ledger` (on
-- stock_ledger) updates `ingredients`, so whoever may add a ledger line may update an ingredient.
--
-- Additive: no table, column, grant or permissive policy changes; RPCs and the service role are untouched.
-- Undo: drop the three module_wall_* policies on a table.

create or replace function public.has_any_module(p_modules text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(effective_modules(auth.uid()) && p_modules, false);
$$;
revoke execute on function public.has_any_module(text[]) from public;
grant execute on function public.has_any_module(text[]) to authenticated, anon;

do $$
declare w record; c text;
begin
  for w in select * from (values
    -- table                    insert                               update                                                    delete
    ('compliance_docs',        array['tax'],                         array['tax'],                                              array['tax']),
    ('compliance_filings',     array['tax'],                         array['tax'],                                              array['tax']),
    ('dining_tables',          array['settings'],                    array['settings','orders','billing','reservations'],       array['settings']),
    ('facilities',             array['facilities'],                  array['facilities'],                                       null::text[]),
    ('facility_bookings',      array['facilities','frontdesk'],      array['facilities','frontdesk'],                           null::text[]),
    ('forecast_runs',          null::text[],                         null::text[],                                              null::text[]),
    ('guests',                 null::text[],                         array['frontdesk','guests'],                               null::text[]),
    ('ingredients',            array['inventory','scan'],            array['inventory','scan','kitchen'],                       null::text[]),
    ('kots',                   null::text[],                         array['kitchen','orders'],                                 null::text[]),
    ('labour_payments',        array['labour'],                      null::text[],                                              null::text[]),
    ('labour_standby',         null::text[],                         null::text[],                                              null::text[]),
    ('labourers',              array['labour','scan'],               array['labour'],                                           null::text[]),
    ('loyalty_ledger',         null::text[],                         null::text[],                                              null::text[]),
    ('network_settings',       null::text[],                         null::text[],                                              null::text[]),
    ('online_orders',          null::text[],                         array['online-orders'],                                    null::text[]),
    ('ota_sync_log',           null::text[],                         null::text[],                                              null::text[]),
    ('print_jobs',             null::text[],                         null::text[],                                              null::text[]),
    ('proof_links',            null::text[],                         null::text[],                                              null::text[]),
    ('purchase_items',         array['inventory'],                   null::text[],                                              null::text[]),
    ('purchase_order_items',   null::text[],                         null::text[],                                              null::text[]),
    ('purchase_orders',        null::text[],                         null::text[],                                              null::text[]),
    ('purchases',              array['inventory'],                   null::text[],                                              null::text[]),
    ('rate_inventory',         null::text[],                         null::text[],                                              null::text[]),
    ('reservations',           array['reservations'],                null::text[],                                              null::text[]),
    ('reviews',                null::text[],                         array['reservations'],                                     null::text[]),
    ('room_types',             array['rooms'],                       array['rooms'],                                            null::text[]),
    ('rooms',                  array['rooms'],                       array['rooms','frontdesk','housekeeping','scan'],          array['rooms']),
    ('scan_log',               array['scan'],                        null::text[],                                              null::text[]),
    ('stock_ledger',           array['inventory','scan','kitchen'],  null::text[],                                              null::text[]),
    ('suppliers',              array['inventory'],                   array['inventory'],                                        null::text[]),
    ('surplus_listings',       null::text[],                         null::text[],                                              null::text[]),
    ('walkins',                null::text[],                         null::text[],                                              null::text[])
  ) as v(t, ins, upd, del) loop
    execute format('drop policy if exists module_wall_insert on public.%I', w.t);
    execute format('drop policy if exists module_wall_update on public.%I', w.t);
    execute format('drop policy if exists module_wall_delete on public.%I', w.t);
    c := case when w.ins is null then 'false' else format('(select has_any_module(%L::text[]))', w.ins) end;
    execute format('create policy module_wall_insert on public.%I as restrictive for insert to authenticated, anon with check (%s)', w.t, c);
    c := case when w.upd is null then 'false' else format('(select has_any_module(%L::text[]))', w.upd) end;
    execute format('create policy module_wall_update on public.%I as restrictive for update to authenticated, anon using (%s) with check (%s)', w.t, c, c);
    c := case when w.del is null then 'false' else format('(select has_any_module(%L::text[]))', w.del) end;
    execute format('create policy module_wall_delete on public.%I as restrictive for delete to authenticated, anon using (%s)', w.t, c);
  end loop;
end $$;

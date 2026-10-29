-- 0151 — Plans the master prices, and paying DineFlow online (2026-10-29, the owner: "complete every open upgrade" — items 10
-- and 8). Until now the membership page printed ₹2,499 / ₹24,999 from the code, and a property could only pay by asking for
-- a key. Now:
--   * plans: one row per kind of property — 'restaurant' (a restaurant only) and 'hotel' (a hotel or a resort, rooms and
--     dining) — each with a monthly and a yearly price the master sets in Master control → Keys (admin_set_plan). Seeded
--     with today's prices; the cheaper restaurant plan is the owner's number to type.
--   * membership_payments: a property paying through DineFlow's own Razorpay account. The owner (or a manager) starts it
--     (membership_checkout_begin: the price comes from the plan, never the browser); the server, holding DineFlow's keys,
--     creates the Razorpay order (membership_checkout_order) and, once Razorpay's signature checks out, calls
--     membership_paid — which only the service role may call — to mark it paid and extend the membership exactly as a key
--     does (from today, or from the current end if that is later). Paid twice (the browser's answer and the webhook) is
--     paid once.
-- A guest's payment is unaffected: guests pay the property on the property's own keys; a property pays DineFlow on DineFlow's.

create table if not exists plans (
  key text primary key check (key in ('restaurant', 'hotel')),
  label text not null,
  property_types text[] not null,
  monthly numeric(10,2) check (monthly is null or monthly > 0),     -- null: not sold online by the month
  yearly numeric(10,2) check (yearly is null or yearly > 0),
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into plans(key, label, property_types, monthly, yearly) values
  ('restaurant', 'Restaurant', array['restaurant'], 2499, 24999),
  ('hotel', 'Hotel & resort', array['hotel', 'resort'], 2499, 24999)
on conflict (key) do nothing;
alter table plans enable row level security;
drop policy if exists plans_read on plans;
create policy plans_read on plans for select to authenticated using (true);   -- prices are not a secret
-- no write policy: admin_set_plan alone

create or replace function public.admin_set_plan(p_key text, p_label text, p_monthly numeric, p_yearly numeric, p_active boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_master() then raise exception 'only Master control sets prices' using errcode = '42501'; end if;
  if p_monthly is not null and p_monthly <= 0 or p_yearly is not null and p_yearly <= 0 then raise exception 'a price is more than zero, or left empty'; end if;
  update plans set label = coalesce(nullif(trim(p_label), ''), label), monthly = round(p_monthly, 2), yearly = round(p_yearly, 2), is_active = coalesce(p_active, true),
                   updated_at = now(), updated_by = auth.uid() where key = p_key;
  if not found then raise exception 'no such plan'; end if;
  insert into admin_log(actor, action, meta) values (auth.uid(), 'plan.price', jsonb_build_object('plan', p_key, 'monthly', p_monthly, 'yearly', p_yearly, 'active', p_active));
end $$;
revoke all on function public.admin_set_plan(text, text, numeric, numeric, boolean) from public, anon;
grant execute on function public.admin_set_plan(text, text, numeric, numeric, boolean) to authenticated;

/** The plan for the signed-in property, by its kind. */
create or replace function public.plan_for_me() returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(p) from plans p join restaurants r on r.property_type::text = any(p.property_types)
   where r.id = auth_restaurant_id() and p.is_active limit 1;
$$;
revoke all on function public.plan_for_me() from public, anon;
grant execute on function public.plan_for_me() to authenticated;

create table if not exists membership_payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  plan_key text not null,
  period text not null check (period in ('month', 'year')),
  days integer not null,
  amount numeric(10,2) not null check (amount > 0),
  provider_order_id text unique,
  provider_payment_id text,
  status text not null default 'created' check (status in ('created', 'paid')),
  created_by uuid,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists membership_payments_rid_idx on membership_payments(restaurant_id, created_at desc);
alter table membership_payments enable row level security;
drop policy if exists membership_payments_read on membership_payments;
create policy membership_payments_read on membership_payments for select to authenticated
  using ((restaurant_id = (select auth_restaurant_id()) and auth_role() in ('owner', 'manager')) or (select is_master()));
-- no write policy: the three functions below

create or replace function public.membership_checkout_begin(p_period text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); p plans%rowtype; amt numeric; d int; pid uuid; nm text;
begin
  if rid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if auth_role() not in ('owner', 'manager') then raise exception 'only the owner pays for the membership' using errcode = '42501'; end if;
  if p_period not in ('month', 'year') then raise exception 'choose monthly or yearly'; end if;
  if not _hit('membership-checkout:' || rid, 20, interval '1 hour') then raise exception 'too many tries — wait a few minutes'; end if;
  select pl.* into p from plans pl join restaurants r on r.property_type::text = any(pl.property_types) where r.id = rid and pl.is_active limit 1;
  if not found then raise exception 'no plan for this property — ask DineFlow'; end if;
  amt := case when p_period = 'month' then p.monthly else p.yearly end;
  if amt is null then raise exception 'this plan is not sold % online — ask DineFlow', case when p_period = 'month' then 'by the month' else 'by the year' end; end if;
  d := case when p_period = 'month' then 30 else 365 end;   -- the same days a key gives
  select name into nm from restaurants where id = rid;
  insert into membership_payments(restaurant_id, plan_key, period, days, amount, created_by) values (rid, p.key, p_period, d, amt, auth.uid()) returning id into pid;
  return jsonb_build_object('id', pid, 'amount', amt, 'plan', p.key, 'label', p.label, 'period', p_period, 'days', d, 'name', nm);
end $$;
revoke all on function public.membership_checkout_begin(text) from public, anon;
grant execute on function public.membership_checkout_begin(text) to authenticated;

/** The server records Razorpay's order on the payment it was made for (service role only). */
create or replace function public.membership_checkout_order(p_id uuid, p_order_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update membership_payments set provider_order_id = p_order_id where id = p_id and status = 'created' and provider_order_id is null;
  if not found then raise exception 'payment not found'; end if;
end $$;
revoke all on function public.membership_checkout_order(uuid, text) from public, anon, authenticated;
grant execute on function public.membership_checkout_order(uuid, text) to service_role;

/** Paid: the server has checked Razorpay's signature and the amount (service role only). Extends the membership the way a
 *  key does. Twice is once. */
create or replace function public.membership_paid(p_order_id text, p_payment_id text, p_amount_paise bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare mp membership_payments%rowtype; base timestamptz; ends timestamptz;
begin
  select * into mp from membership_payments where provider_order_id = p_order_id for update;
  if not found then raise exception 'payment not found'; end if;
  if mp.status = 'paid' then return jsonb_build_object('ok', true, 'already', true, 'ends_at', (select membership_ends_at from restaurants where id = mp.restaurant_id)); end if;
  if round(mp.amount * 100) <> p_amount_paise then raise exception 'the amount paid is not the price'; end if;
  select greatest(now(), coalesce(membership_ends_at, now())) into base from restaurants where id = mp.restaurant_id;
  ends := base + make_interval(days => mp.days);
  update restaurants set membership = 'active', membership_plan = case when mp.period = 'year' then 'yearly' else 'monthly' end, membership_ends_at = ends where id = mp.restaurant_id;
  update membership_payments set status = 'paid', provider_payment_id = p_payment_id, paid_at = now() where id = mp.id;
  insert into admin_log(actor, action, target, meta) values (null, 'membership.paid', mp.restaurant_id, jsonb_build_object( 'amount', mp.amount, 'period', mp.period, 'order', p_order_id, 'payment', p_payment_id));
  return jsonb_build_object('ok', true, 'ends_at', ends);
end $$;
revoke all on function public.membership_paid(text, text, bigint) from public, anon, authenticated;
grant execute on function public.membership_paid(text, text, bigint) to service_role;

notify pgrst, 'reload schema';

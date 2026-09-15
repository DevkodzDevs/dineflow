-- ═══════════ Pay by scanning the bill ═══════════
-- Every bill carries an opaque token. The QR printed on it opens /pay/<token>: a public page
-- with the total and the ways to settle it — UPI through the property's own UPI ID (no gateway
-- needed), and card / netbanking / wallet through Razorpay when the owner has added their keys.
--
-- Trust boundaries, in one place:
--   pay_link           anyone with the token: the bill, and WHICH ways to pay exist. Never a secret.
--   pay_link_claim     anyone with the token: "I've paid by UPI, ref …". Only a note for the counter.
--   pay_link_gateway   the server only (service role): the gateway keys, to create and verify an order.
--   pay_link_settle    the server only (service role): mark the bill paid after the gateway proved it.
-- Gateway secrets live in their own owner-only table, so they are never part of the session
-- row that every screen of the app receives.

alter table restaurants
  add column if not exists upi_vpa text,      -- e.g. hotelname@okaxis
  add column if not exists upi_payee text;    -- name shown inside the UPI app; blank = the property name

alter table bills
  add column if not exists pay_token text,
  add column if not exists pay_claim_ref text,          -- what the guest typed after paying by UPI (UTR / reference)
  add column if not exists pay_claimed_at timestamptz;
update bills set pay_token = encode(gen_random_bytes(12), 'hex') where pay_token is null;
alter table bills alter column pay_token set default encode(gen_random_bytes(12), 'hex');
create unique index if not exists bills_pay_token_idx on bills(pay_token);

create table if not exists payment_gateways (
  restaurant_id uuid primary key references restaurants(id) on delete cascade,
  provider text not null default 'razorpay',
  key_id text not null,
  key_secret text,
  webhook_secret text,
  updated_at timestamptz not null default now()
);
alter table payment_gateways enable row level security;
drop policy if exists owner_only on payment_gateways;
create policy owner_only on payment_gateways for all
  using (restaurant_id = auth_restaurant_id() and auth_role() = 'owner')
  with check (restaurant_id = auth_restaurant_id() and auth_role() = 'owner');

-- ── what the guest's phone sees ───────────────────────────────────────────────
create or replace function pay_link(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'bill_no', b.bill_no, 'status', b.status, 'total', b.total, 'subtotal', b.subtotal,
    'discount', b.discount_amount, 'service', b.service_charge, 'cgst', b.cgst, 'sgst', b.sgst, 'round_off', b.round_off,
    'created_at', b.created_at, 'paid_at', b.paid_at, 'claim_ref', b.pay_claim_ref,
    'where', case when t.name is not null then 'Table ' || t.name else initcap(replace(o.type::text, '_', ' ')) end,
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name_snapshot, 'qty', i.qty, 'price', i.price_snapshot) order by i.created_at), '[]'::jsonb)
              from order_items i where i.order_id = o.id and i.status <> 'cancelled'),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('method', p.method, 'amount', p.amount, 'ref', p.ref) order by p.created_at), '[]'::jsonb)
                 from payments p where p.bill_id = b.id),
    'restaurant', jsonb_build_object('name', r.name, 'address', r.address, 'phone', r.phone, 'gstin', r.gstin, 'logo_url', r.logo_url, 'brand_colour', r.brand_colour),
    'upi', case when nullif(trim(r.upi_vpa), '') is not null
                then jsonb_build_object('vpa', trim(r.upi_vpa), 'payee', coalesce(nullif(trim(r.upi_payee), ''), r.name)) end,
    'gateway', case when g.key_id is not null and nullif(g.key_secret, '') is not null
                    then jsonb_build_object('kind', g.provider, 'key_id', g.key_id) end
  )
  from bills b
  join orders o on o.id = b.order_id
  join restaurants r on r.id = b.restaurant_id
  left join dining_tables t on t.id = o.table_id
  left join payment_gateways g on g.restaurant_id = r.id
  where b.pay_token = p_token and b.status <> 'void'
$$;

-- "I've paid by UPI." Nothing changes on the bill except a note the counter can act on.
create or replace function pay_link_claim(p_token text, p_ref text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b bills%rowtype;
begin
  select * into b from bills where pay_token = p_token and status = 'unpaid';
  if not found then raise exception 'this bill is not open for payment'; end if;
  update bills set pay_claim_ref = left(coalesce(nullif(trim(p_ref), ''), 'UPI'), 40), pay_claimed_at = now() where id = b.id;
  return jsonb_build_object('ok', true);
end $$;

-- ── the server's side of a card payment ───────────────────────────────────────
create or replace function pay_link_gateway(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed'; end if;
  select jsonb_build_object('key_id', g.key_id, 'key_secret', g.key_secret, 'webhook_secret', g.webhook_secret, 'provider', g.provider,
                            'total', b.total, 'bill_no', b.bill_no, 'status', b.status, 'bill_id', b.id, 'name', r.name)
    into out
  from bills b join restaurants r on r.id = b.restaurant_id join payment_gateways g on g.restaurant_id = r.id
  where b.pay_token = p_token and b.status <> 'void' and nullif(g.key_secret, '') is not null;
  return out;   -- null when there is no such bill, or the property has no gateway
end $$;

-- Marks the bill paid in full. Same side effects as settle_bill, without needing a signed-in cashier.
create or replace function pay_link_settle(p_token text, p_method payment_method, p_ref text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b bills%rowtype; tid uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed'; end if;
  select * into b from bills where pay_token = p_token and status <> 'void';
  if not found then raise exception 'bill not found'; end if;
  if b.status = 'paid' then return jsonb_build_object('ok', true, 'already', true); end if;   -- replay-safe: verify and webhook may both arrive
  insert into payments(restaurant_id, bill_id, method, amount, ref) values (b.restaurant_id, b.id, p_method, b.total, p_ref);
  update bills set status = 'paid', paid_at = now(), pay_claim_ref = null where id = b.id;
  update orders set status = 'billed' where id = b.order_id;
  update order_items set status = 'served' where order_id = b.order_id and status <> 'cancelled';
  update kots set status = 'served' where order_id = b.order_id;
  select table_id into tid from orders where id = b.order_id;
  if tid is not null and not exists (select 1 from orders where table_id = tid and status = 'open') then
    update dining_tables set status = 'free' where id = tid;
  end if;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function pay_link(text), pay_link_claim(text, text) to anon, authenticated, service_role;
revoke execute on function pay_link_gateway(text), pay_link_settle(text, payment_method, text) from public, anon, authenticated;
grant execute on function pay_link_gateway(text), pay_link_settle(text, payment_method, text) to service_role;

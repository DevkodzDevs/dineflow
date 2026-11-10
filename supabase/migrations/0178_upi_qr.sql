-- 0178 — UPI that marks the bill paid by itself (2026-11-09, the owner: "UPI auto-match at the counter").
--
-- Until now the counter's QR was a plain upi://pay request to the property's own UPI ID: the guest paid, said so, and the
-- cashier checked their phone and pressed Mark paid. A property that has connected Razorpay (0022, Settings → Payments /
-- Connections) can instead show a **dynamic UPI QR** that Razorpay issues for exactly this bill and amount: the money lands in
-- the property's Razorpay account, Razorpay sends `qr_code.credited` to /api/webhooks/razorpay, and the bill settles the way
-- a card payment does (pay_link_settle) — no claim, no checking, no Mark paid. Without a gateway nothing changes.
--
-- The QR is created by the server (/api/pay/<token>/qr, service role) and remembered on the bill, so the webhook can check
-- that the credited QR is the one issued for this bill, and so a re-opened bill screen shows the same code. The amount is
-- kept too: a bill whose total changes (a discount after the code was drawn) gets a new code and the old one is closed.

alter table bills
  add column if not exists pay_qr_id text,                 -- Razorpay's qr_… id
  add column if not exists pay_qr_url text,                -- the image Razorpay serves for it
  add column if not exists pay_qr_amount numeric(12,2);    -- what that code asks for (the whole bill, or the UPI part of a split)

-- the server's view of the gateway for one bill (0022's body) now carries the code too
create or replace function pay_link_gateway(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed'; end if;
  select jsonb_build_object('key_id', g.key_id, 'key_secret', g.key_secret, 'webhook_secret', g.webhook_secret, 'provider', g.provider,
                            'total', b.total, 'bill_no', b.bill_no, 'status', b.status, 'bill_id', b.id, 'name', r.name,
                            'qr_id', b.pay_qr_id, 'qr_url', b.pay_qr_url, 'qr_amount', b.pay_qr_amount)
    into out
  from bills b join restaurants r on r.id = b.restaurant_id join payment_gateways g on g.restaurant_id = r.id
  where b.pay_token = p_token and b.status <> 'void' and nullif(g.key_secret, '') is not null;
  return out;   -- null when there is no such bill, or the property has no gateway
end $$;

/** The server remembers the code it issued for an unpaid bill (nulls forget it). Service role only. */
create or replace function pay_link_qr_set(p_token text, p_id text, p_url text, p_amount numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed'; end if;
  update bills set pay_qr_id = p_id, pay_qr_url = p_url, pay_qr_amount = p_amount where pay_token = p_token and status = 'unpaid';
  if not found then raise exception 'bill not open'; end if;
end $$;
revoke execute on function pay_link_gateway(text), pay_link_qr_set(text, text, text, numeric) from public, anon, authenticated;
grant execute on function pay_link_gateway(text), pay_link_qr_set(text, text, text, numeric) to service_role;

notify pgrst, 'reload schema';

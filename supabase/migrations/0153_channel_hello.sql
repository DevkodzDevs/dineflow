-- 0153 — The delivery webhook answers who it is (2026-10-29, the owner: "the delivery, room-booking and tracking links should
-- behave like Razorpay — wait for the link, then work"). A delivery platform's partner tools usually check a webhook address
-- before they send orders to it. GET /api/webhooks/aggregator/<token> said "ok" for any token at all, so a mistyped address
-- passed their check and then lost every order. channel_hello(token) says whether that channel exists, its name and kind,
-- and whether it is taking orders — nothing else; the token is the secret, as for the POST.

create or replace function public.channel_hello(p_token text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('label', c.label, 'kind', c.kind, 'live', c.is_live)
    from order_channels c where c.webhook_token = p_token and length(coalesce(p_token, '')) >= 8 limit 1;
$$;
revoke all on function public.channel_hello(text) from public;
grant execute on function public.channel_hello(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- 0183 — a coupon code box on the storefront (2026-11-10).
--
-- The storefront already applies the best automatic offer, and dine_order already validates an offer id passed as p_offer
-- (scope, days, hours, dates, minimum). What was missing was a way for a guest to TYPE a code they were given. This adds one
-- public resolver, dine_coupon, that checks a code for an online order and hands back the offer id and the money off; the
-- storefront passes that id to dine_order, which validates it again at order time. No till code changes (coupon_check, 0072,
-- is the authenticated till path and stays as it is); nothing here writes.
--
-- Codes are matched case-insensitively against offers.code for this property. The bucketed rate limit (_hit) stops a code
-- from being guessed. Only flat_pct / flat_amount offers scoped 'delivery' or 'both' apply online — the same rule dine_order uses.

create or replace function public.dine_coupon(p_slug text, p_code text, p_subtotal numeric, p_mode text default 'delivery')
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r restaurants%rowtype; o offers%rowtype;
        nowl timestamp := now() at time zone 'Asia/Kolkata';
        dow int := extract(isodow from (now() at time zone 'Asia/Kolkata'))::int;   -- 1..7 (offers.days is isodow)
        codex text := upper(trim(coalesce(p_code, ''))); sub numeric := greatest(0, coalesce(p_subtotal, 0)); disc numeric;
        want text := case when p_mode in ('dine_in', 'room') then 'dining' else 'delivery' end;
begin
  select * into r from restaurants where booking_slug = p_slug and membership_state_for(id) in ('trial', 'active');
  if not found then return jsonb_build_object('ok', false, 'error', 'this place is not taking orders'); end if;
  if length(codex) < 2 then return jsonb_build_object('ok', false, 'error', 'enter a code'); end if;
  -- a few tries per property per hour: a code cannot be brute-forced from the public page
  if not _hit('coupon:' || r.id, 60, interval '1 hour') then return jsonb_build_object('ok', false, 'error', 'too many tries — please try again later'); end if;
  select * into o from offers where restaurant_id = r.id and code is not null and codex = upper(trim(code)) order by created_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'that code is not valid here'); end if;
  if not o.is_active then return jsonb_build_object('ok', false, 'error', 'that code is switched off'); end if;
  if o.kind::text not in ('flat_pct', 'flat_amount') then return jsonb_build_object('ok', false, 'error', 'that code cannot be used online'); end if;
  if o.scope::text not in (want, 'both') then return jsonb_build_object('ok', false, 'error', 'that code is not for this kind of order'); end if;
  if o.starts_on is not null and o.starts_on > nowl::date then return jsonb_build_object('ok', false, 'error', 'that code has not started yet'); end if;
  if o.ends_on is not null and o.ends_on < nowl::date then return jsonb_build_object('ok', false, 'error', 'that code has ended'); end if;
  if coalesce(cardinality(o.days), 0) > 0 and not (dow = any(o.days)) then return jsonb_build_object('ok', false, 'error', 'that code is not valid today'); end if;
  if o.from_time is not null and o.to_time is not null and not (nowl::time between o.from_time and o.to_time) then
    return jsonb_build_object('ok', false, 'error', 'that code runs ' || to_char(o.from_time, 'HH12:MI am') || '–' || to_char(o.to_time, 'HH12:MI am') || ' only');
  end if;
  if sub < o.min_order then return jsonb_build_object('ok', false, 'error', 'this code needs an order of at least ₹' || trim(to_char(o.min_order, 'FM999999'))); end if;
  disc := case when o.kind::text = 'flat_pct' then round(sub * o.value / 100, 2) else least(o.value, sub) end;
  return jsonb_build_object('ok', true, 'id', o.id, 'title', o.title, 'code', o.code,
                           'kind', o.kind::text, 'value', o.value, 'discount', disc, 'min_order', o.min_order);
end $$;
revoke all on function public.dine_coupon(text, text, numeric, text) from public;
grant execute on function public.dine_coupon(text, text, numeric, text) to anon, authenticated;

notify pgrst, 'reload schema';

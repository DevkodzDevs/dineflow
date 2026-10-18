-- 0110 · The Tally names screen keeps the four ledgers that stay invoices use (0109): Room revenue, Guest services,
-- Discount allowed, Sundry debtors. tally_settings_save dropped any key it did not know, so they could not be renamed.
-- Same function, same grants; no table changes.
create or replace function public.tally_settings_save(p_company text, p_ledgers jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); clean jsonb;
begin
  if rid is null or auth_role()::text not in ('owner', 'manager') then raise exception 'only the owner or a manager can change the Tally names' using errcode = '42501'; end if;
  select coalesce(jsonb_object_agg(key, left(trim(value), 60)), '{}'::jsonb) into clean
    from jsonb_each_text(coalesce(p_ledgers, '{}'::jsonb))
   where key in ('sales', 'service', 'cgst', 'sgst', 'round_off', 'other_income', 'cash', 'upi', 'card', 'other', 'bank', 'expense_prefix', 'input_gst',
                 'room_sales', 'guest_services', 'discount', 'debtors')
     and length(trim(value)) > 0;
  update restaurants set tally_company = nullif(left(trim(coalesce(p_company, '')), 80), ''), tally_ledgers = clean where id = rid;
  return 1;
end $$;
revoke all on function public.tally_settings_save(text, jsonb) from public, anon;
grant execute on function public.tally_settings_save(text, jsonb) to authenticated, service_role;

-- ═══════════ Master control can edit a property's details ═══════════

create or replace function admin_update_property(p_restaurant_id uuid, p_fields jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r restaurants%rowtype;
begin
  if not is_platform_admin() then raise exception 'only master control can do this'; end if;
  select * into r from restaurants where id = p_restaurant_id;
  if not found then raise exception 'that property no longer exists'; end if;

  update restaurants set
    name             = coalesce(p_fields->>'name',             r.name),
    legal_name       = case when p_fields ? 'legal_name'       then nullif(trim(p_fields->>'legal_name'), '')       else r.legal_name end,
    phone            = case when p_fields ? 'phone'            then nullif(trim(p_fields->>'phone'), '')            else r.phone end,
    address          = case when p_fields ? 'address'          then nullif(trim(p_fields->>'address'), '')          else r.address end,
    district         = case when p_fields ? 'district'         then nullif(trim(p_fields->>'district'), '')         else r.district end,
    pincode          = case when p_fields ? 'pincode'          then nullif(trim(p_fields->>'pincode'), '')          else r.pincode end,
    gstin            = case when p_fields ? 'gstin'            then nullif(upper(trim(p_fields->>'gstin')), '')     else r.gstin end,
    pan              = case when p_fields ? 'pan'              then nullif(upper(trim(p_fields->>'pan')), '')       else r.pan end,
    fssai_no         = case when p_fields ? 'fssai_no'         then nullif(trim(p_fields->>'fssai_no'), '')         else r.fssai_no end,
    ca_name          = case when p_fields ? 'ca_name'          then nullif(trim(p_fields->>'ca_name'), '')          else r.ca_name end,
    ca_firm          = case when p_fields ? 'ca_firm'          then nullif(trim(p_fields->>'ca_firm'), '')          else r.ca_firm end,
    ca_phone         = case when p_fields ? 'ca_phone'         then nullif(trim(p_fields->>'ca_phone'), '')         else r.ca_phone end,
    ca_email         = case when p_fields ? 'ca_email'         then nullif(trim(p_fields->>'ca_email'), '')         else r.ca_email end,
    tagline          = case when p_fields ? 'tagline'          then nullif(trim(p_fields->>'tagline'), '')          else r.tagline end,
    booking_slug     = case when p_fields ? 'booking_slug'     then nullif(trim(p_fields->>'booking_slug'), '')     else r.booking_slug end
  where id = p_restaurant_id;

  insert into admin_log(actor, action, target, meta)
    values (auth.uid(), 'update_property', p_restaurant_id, p_fields);

  return jsonb_build_object('ok', true);
end $$;

revoke all on function admin_update_property(uuid, jsonb) from public, anon;
grant execute on function admin_update_property(uuid, jsonb) to authenticated;

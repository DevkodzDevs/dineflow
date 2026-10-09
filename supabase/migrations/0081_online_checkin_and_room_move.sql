-- 0081 · Online check-in, and moving an arrival to a ready room.
--
-- 1. Online check-in. Every booking gets an unguessable check-in token. The guest opens
--    /checkin/<token> on their own phone before they arrive — or on the desk's tablet, handed to
--    them — and confirms their name, address, ID type and the last four characters of the ID,
--    nationality, arrival time and any requests. The desk sees "Checked in online" on the arrival
--    and the details on the folio, so arrival is a key and a smile, not a form.
--    Only the last four characters of an ID are ever stored, as they already were at the desk.
--
-- 2. booking_move_room. When an arrival's room is not ready, the front desk is offered a ready room
--    of the same type and moves the booking in one tap. Same checks as create_booking.
--
-- New columns on bookings only; the existing tenant_all policy on bookings covers them. The two
-- public functions are security definer and answer for a token alone.

alter table bookings add column if not exists checkin_token text unique default encode(gen_random_bytes(12), 'hex');
alter table bookings add column if not exists precheckin jsonb;
alter table bookings add column if not exists precheckin_at timestamptz;

-- What the guest's page may show: their own booking, by token, and nothing else.
create or replace function checkin_view(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'property', r.name, 'address', r.address, 'phone', r.phone,
    'booking_no', b.booking_no, 'status', b.status, 'check_in', b.check_in, 'check_out', b.check_out,
    'nights', greatest(1, b.check_out - b.check_in), 'adults', b.adults, 'children', b.children,
    'room_type', rt.name,
    'guest', jsonb_build_object('full_name', g.full_name, 'email', g.email, 'address', g.address,
      'id_type', g.id_type, 'id_last4', g.id_last4,
      'phone_tail', right(regexp_replace(coalesce(g.phone, ''), '\D', '', 'g'), 4)),
    'precheckin', b.precheckin, 'done_at', b.precheckin_at)
  from bookings b
  join restaurants r on r.id = b.restaurant_id
  left join guests g on g.id = b.guest_id
  left join rooms rm on rm.id = b.room_id
  left join room_types rt on rt.id = rm.room_type_id
  where p_token is not null and length(p_token) >= 16 and b.checkin_token = p_token
    and b.status in ('reserved', 'checked_in');
$$;

create or replace function checkin_submit(p_token text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b bookings%rowtype;
  v_name text := btrim(coalesce(p_data->>'full_name', ''));
  v_email text := nullif(btrim(coalesce(p_data->>'email', '')), '');
  v_addr text := btrim(coalesce(p_data->>'address', ''));
  v_idt text := coalesce(p_data->>'id_type', '');
  v_id4 text := upper(btrim(coalesce(p_data->>'id_last4', '')));
  v_nat text := coalesce(nullif(btrim(coalesce(p_data->>'nationality', '')), ''), 'Indian');
  v_time text := nullif(btrim(coalesce(p_data->>'arrival_time', '')), '');
  v_req text := nullif(btrim(coalesce(p_data->>'requests', '')), '');
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select * into b from bookings where checkin_token = p_token and p_token is not null and length(p_token) >= 16;
  if not found then raise exception 'this check-in link is not valid'; end if;
  if b.status <> 'reserved' then raise exception 'this booking is already checked in or closed'; end if;
  if b.check_out < v_today then raise exception 'this booking has ended'; end if;
  if length(v_name) < 2 or length(v_name) > 80 then raise exception 'please give your full name'; end if;
  if length(v_addr) < 5 or length(v_addr) > 240 then raise exception 'please give your home address'; end if;
  if v_email is not null and (length(v_email) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'that email does not look right'; end if;
  if v_idt not in ('Aadhaar', 'Passport', 'Driving licence', 'Voter ID', 'Other') then raise exception 'choose the ID you will show'; end if;
  if v_id4 !~ '^[A-Z0-9]{4}$' then raise exception 'give the last 4 characters of your ID'; end if;
  if length(v_nat) > 40 then raise exception 'nationality is too long'; end if;
  if v_time is not null and v_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'arrival time should look like 14:30'; end if;
  if v_req is not null and length(v_req) > 300 then raise exception 'please keep requests under 300 characters'; end if;
  if coalesce((p_data->>'agree')::boolean, false) is not true then raise exception 'please confirm the details are correct'; end if;

  update guests set full_name = v_name, email = coalesce(v_email, email), address = v_addr, id_type = v_idt, id_last4 = v_id4
    where id = b.guest_id;
  update bookings set precheckin = jsonb_build_object('nationality', v_nat, 'arrival_time', v_time, 'requests', v_req,
      'id_type', v_idt, 'id_last4', v_id4),
    precheckin_at = now()
    where id = b.id;
  return jsonb_build_object('ok', true, 'at', now());
end $$;

revoke all on function checkin_view(text) from public;
revoke all on function checkin_submit(text, jsonb) from public;
grant execute on function checkin_view(text) to anon, authenticated;
grant execute on function checkin_submit(text, jsonb) to anon, authenticated;

-- Move a booking that has not checked in yet to another room of this property.
create or replace function booking_move_room(p_booking uuid, p_room uuid) returns text
language plpgsql security definer set search_path = public as $$
declare rid uuid := auth_restaurant_id(); b bookings%rowtype; r rooms%rowtype; v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if rid is null then raise exception 'not signed in'; end if;
  select * into b from bookings where id = p_booking and restaurant_id = rid for update;
  if not found then raise exception 'booking not found'; end if;
  if b.status <> 'reserved' then raise exception 'only a booking that has not checked in can change room'; end if;
  select * into r from rooms where id = p_room and restaurant_id = rid;
  if not found then raise exception 'room not found'; end if;
  if r.id = b.room_id then return r.number; end if;
  if r.status in ('maintenance', 'occupied') then raise exception 'room % is not free', r.number; end if;
  if exists (select 1 from bookings x where x.room_id = p_room and x.id <> b.id and x.status in ('reserved', 'checked_in')
             and x.check_in < b.check_out and x.check_out > b.check_in)
    then raise exception 'room % is booked for some of those nights', r.number; end if;
  -- the old room is released if this booking was what held it today
  update rooms set status = 'available' where id = b.room_id and status = 'reserved'
    and not exists (select 1 from bookings x where x.room_id = b.room_id and x.id <> b.id and x.status = 'reserved' and x.check_in = v_today);
  update bookings set room_id = p_room where id = b.id;
  if b.check_in <= v_today then update rooms set status = 'reserved' where id = p_room and status = 'available'; end if;
  return r.number;
end $$;

revoke all on function booking_move_room(uuid, uuid) from public, anon;
grant execute on function booking_move_room(uuid, uuid) to authenticated;

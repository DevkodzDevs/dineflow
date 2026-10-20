-- 0126 · Each job sees its own sections (2026-10-20)
--
-- The owner: "the menu's options show only what each job category and position needs, and the internal controls follow
-- the job too — don't show the unwanted control sections." Only DEFAULTS narrow here; nobody's ceiling moves
-- (role_modules.ceiling is untouched), so the owner can still tick anything more for anyone in Staff → Access, and an
-- owner's or a manager's view does not change at all.
--
--  1. role_modules.default_set — what a job role holds while nobody has ticked a set for them — loses the back office:
--     a front-desk person Channels and Labour (and Scan), a cashier Reports and Front desk (and Scan), a store keeper
--     Labour and Neighbours, a chef Online orders, a waiter and a housekeeper Scan; an unconfigured `employee` (a guard,
--     a gardener) Orders, Pulse and Scan — Work and Checklists, open to everyone, are their day; a supervisor Reports.
--  2. The position lists (packages/shared positionAccess.ts) lost Scan for the floor and back-of-house jobs and the
--     gardener lost Housekeeping; the guard, the cleaner, the kitchen steward and the maintenance helper hold nothing.
--     People still on such a list exactly as the Staff screen wrote it move to the narrower list (step 2).
--
-- The "Insights & control" links (Cash & controls, Expenses, Cleaning, Intelligence, Audit, Outlets…) are not modules
-- and follow the job in code (apps/web components/shell/sections.ts, each page's guard). effective_modules() keeps its
-- shape (0120) — it already reads default_set and allowed_modules — so nothing else changes. Additive: no column, no
-- function, no policy; the deployed screens read the same tables the same way.

-- 1 · the job roles' defaults (packages/shared constants.ts ROLE_DEFAULT says the same; a test compares them)
update public.role_modules set default_set = array['dashboard', 'scan', 'orders', 'kitchen', 'billing', 'pulse', 'reservations', 'inventory', 'staff']::text[] where role = 'supervisor';
update public.role_modules set default_set = array['dashboard']::text[] where role = 'employee';
update public.role_modules set default_set = array['dashboard', 'billing', 'orders', 'invoices', 'online-orders', 'customers', 'reservations', 'pulse']::text[] where role = 'cashier';
update public.role_modules set default_set = array['dashboard', 'orders', 'reservations', 'pulse', 'customers']::text[] where role = 'waiter';
update public.role_modules set default_set = array['dashboard', 'kitchen', 'menu', 'tomorrow', 'scan']::text[] where role = 'chef';
update public.role_modules set default_set = array['dashboard', 'inventory', 'scan', 'tomorrow']::text[] where role = 'store';
update public.role_modules set default_set = array['dashboard', 'frontdesk', 'rooms', 'guests', 'facilities', 'housekeeping', 'reservations', 'invoices', 'customers']::text[] where role = 'frontdesk';
update public.role_modules set default_set = array['dashboard', 'housekeeping', 'rooms']::text[] where role = 'housekeeping';

-- 2 · everyone still on an untouched position list moves to the narrower one. "Untouched" is exact: the person's ticks
--     (the control room aside) are the position's old list as the Staff screen wrote it — that kind of property's
--     sections, inside the role's ceiling and the property's switched-on set. A list anyone changed by hand is custom
--     and is left exactly as it is: the owner's own ticks win.
with chg(position, old_list, removed) as (values
    ('front_office_associate', array['frontdesk', 'rooms', 'guests', 'reservations', 'invoices', 'customers', 'scan']::text[], array['scan']::text[]),
    ('bell_captain', array['rooms', 'guests', 'scan']::text[], array['scan']::text[]),
    ('bellboy', array['rooms', 'scan']::text[], array['scan']::text[]),
    ('driver', array['scan', 'guests']::text[], array['scan']::text[]),
    ('cleaner', array['scan']::text[], array['scan']::text[]),
    ('senior_captain', array['orders', 'reservations', 'pulse', 'customers', 'kitchen', 'billing', 'staff', 'scan']::text[], array['scan']::text[]),
    ('captain', array['orders', 'reservations', 'pulse', 'customers', 'scan']::text[], array['scan']::text[]),
    ('senior_steward', array['orders', 'pulse', 'reservations', 'scan']::text[], array['scan']::text[]),
    ('steward', array['orders', 'pulse', 'scan']::text[], array['scan']::text[]),
    ('bartender', array['orders', 'scan']::text[], array['scan']::text[]),
    ('fnb_cashier', array['billing', 'orders', 'invoices', 'online-orders', 'customers', 'scan']::text[], array['scan']::text[]),
    ('cdp', array['kitchen', 'tomorrow', 'scan']::text[], array['scan']::text[]),
    ('pastry_chef', array['kitchen', 'menu', 'tomorrow', 'scan']::text[], array['scan']::text[]),
    ('dcdp', array['kitchen', 'scan']::text[], array['scan']::text[]),
    ('commis_1', array['kitchen', 'scan']::text[], array['scan']::text[]),
    ('commis_2', array['kitchen', 'scan']::text[], array['scan']::text[]),
    ('commis_3', array['kitchen', 'scan']::text[], array['scan']::text[]),
    ('cook', array['kitchen', 'scan']::text[], array['scan']::text[]),
    ('kitchen_steward', array['scan']::text[], array['scan']::text[]),
    ('spa_therapist', array['facilities', 'guests', 'scan']::text[], array['scan']::text[]),
    ('fitness_trainer', array['facilities', 'scan']::text[], array['scan']::text[]),
    ('activities_coordinator', array['facilities', 'guests', 'staff', 'scan']::text[], array['scan']::text[]),
    ('lifeguard', array['facilities', 'scan']::text[], array['scan']::text[]),
    ('naturalist', array['facilities', 'scan']::text[], array['scan']::text[]),
    ('kids_club_host', array['facilities', 'scan']::text[], array['scan']::text[]),
    ('technician', array['housekeeping', 'rooms', 'scan']::text[], array['scan']::text[]),
    ('plumber', array['housekeeping', 'rooms', 'scan']::text[], array['scan']::text[]),
    ('electrician', array['housekeeping', 'rooms', 'scan']::text[], array['scan']::text[]),
    ('ac_technician', array['housekeeping', 'rooms', 'scan']::text[], array['scan']::text[]),
    ('carpenter', array['housekeeping', 'scan']::text[], array['scan']::text[]),
    ('gardener', array['housekeeping', 'scan']::text[], array['housekeeping', 'scan']::text[]),
    ('maintenance_helper', array['scan']::text[], array['scan']::text[]),
    ('security_manager', array['scan', 'labour', 'guests', 'staff', 'reports']::text[], array['scan']::text[]),
    ('security_supervisor', array['scan', 'labour', 'staff']::text[], array['scan']::text[]),
    ('security_guard', array['scan']::text[], array['scan']::text[]),
    ('hr_executive', array['labour', 'scan']::text[], array['scan']::text[]),
    ('delivery_supervisor', array['online-orders', 'orders', 'customers', 'staff', 'scan']::text[], array['scan']::text[]),
    ('delivery_rider', array['online-orders', 'scan']::text[], array['scan']::text[])
),
kinds(t, mods) as (values
    ('restaurant', array['dashboard', 'tomorrow', 'scan', 'reservations', 'pulse', 'orders', 'online-orders', 'customers', 'kitchen', 'billing', 'invoices', 'menu', 'inventory', 'labour', 'proof', 'neighbours', 'channels', 'reports', 'tax', 'staff', 'settings']::text[]),
    ('hotel', array['dashboard', 'tomorrow', 'scan', 'frontdesk', 'rooms', 'housekeeping', 'guests', 'reservations', 'pulse', 'orders', 'online-orders', 'customers', 'kitchen', 'billing', 'invoices', 'menu', 'inventory', 'labour', 'proof', 'neighbours', 'channels', 'reports', 'tax', 'staff', 'settings']::text[]),
    ('resort', array['dashboard', 'tomorrow', 'scan', 'frontdesk', 'rooms', 'housekeeping', 'guests', 'facilities', 'reservations', 'pulse', 'orders', 'online-orders', 'customers', 'kitchen', 'billing', 'invoices', 'menu', 'inventory', 'labour', 'proof', 'neighbours', 'channels', 'reports', 'tax', 'staff', 'settings']::text[])
),
cand as (
  select p.id, c.removed,
    array(select distinct m from unnest(p.allowed_modules) m where m <> 'dashboard' order by m) as mine,
    array(select distinct m from unnest(c.old_list) m
           where m = any(k.mods) and m = any(rm.ceiling) and (r.enabled_modules is null or m = any(r.enabled_modules)) order by m) as was
  from public.profiles p
  join chg c on c.position = p.position
  join public.restaurants r on r.id = p.restaurant_id
  join kinds k on k.t = r.property_type::text
  join public.role_modules rm on rm.role = p.role
  where p.allowed_modules is not null
)
update public.profiles p
   set allowed_modules = array(select m from unnest(p.allowed_modules) m where m <> all(cand.removed))
  from cand
 where cand.id = p.id and cand.mine = cand.was;

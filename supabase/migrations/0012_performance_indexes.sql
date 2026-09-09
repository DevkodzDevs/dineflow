-- DineFlow v12.1 — indexes for every query a screen runs on load. Run AFTER 0011.
-- Each one turns a table scan into an index seek; on a busy property this is the difference
-- between a 40 ms and a 400 ms screen.
create index if not exists orders_rid_status_idx        on orders(restaurant_id, status, created_at desc);
create index if not exists orders_rid_created_idx       on orders(restaurant_id, created_at desc);
create index if not exists orders_table_open_idx        on orders(table_id) where status = 'open';
create index if not exists order_items_order_idx        on order_items(order_id);
create index if not exists order_items_kot_idx          on order_items(kot_id);
create index if not exists order_items_rid_created_idx  on order_items(restaurant_id, created_at desc);
create index if not exists kots_rid_status_idx          on kots(restaurant_id, status, created_at);
create index if not exists bills_rid_paid_idx           on bills(restaurant_id, status, paid_at desc);
create index if not exists bills_order_idx              on bills(order_id);
create index if not exists payments_bill_idx            on payments(bill_id);
create index if not exists stock_ledger_ing_idx         on stock_ledger(ingredient_id, created_at desc);
create index if not exists stock_ledger_rid_reason_idx  on stock_ledger(restaurant_id, reason, created_at desc);
create index if not exists ingredients_rid_active_idx   on ingredients(restaurant_id) where is_active;
create index if not exists menu_items_rid_active_idx    on menu_items(restaurant_id) where is_active;
create index if not exists bookings_rid_status_idx      on bookings(restaurant_id, status, check_in, check_out);
create index if not exists bookings_room_active_idx     on bookings(room_id, check_in, check_out) where status in ('reserved','checked_in');
create index if not exists booking_charges_booking_idx  on booking_charges(booking_id);
create index if not exists rooms_rid_sort_idx           on rooms(restaurant_id, sort_order);
create index if not exists hk_rid_status_idx            on housekeeping_tasks(restaurant_id, status, created_at);
create index if not exists online_orders_rid_placed_idx on online_orders(restaurant_id, placed_at desc);
create index if not exists online_orders_rid_status_idx on online_orders(restaurant_id, status);
create index if not exists invoices_rid_issued_idx      on invoices(restaurant_id, issued_at desc);
create index if not exists labour_att_lab_date_idx      on labour_attendance(labourer_id, work_date desc);
create index if not exists labour_att_rid_date_idx      on labour_attendance(restaurant_id, work_date desc);
create index if not exists labour_pay_rid_idx           on labour_payments(restaurant_id, created_at desc);
create index if not exists scan_log_rid_idx             on scan_log(restaurant_id, created_at desc);
create index if not exists print_jobs_rid_idx           on print_jobs(restaurant_id, status, created_at);
create index if not exists profiles_rid_idx             on profiles(restaurant_id);
create index if not exists facility_bookings_rid_idx    on facility_bookings(restaurant_id, starts_at);
-- the tenant lookup behind every RLS check
create index if not exists profiles_id_rid_idx          on profiles(id, restaurant_id);
analyze;

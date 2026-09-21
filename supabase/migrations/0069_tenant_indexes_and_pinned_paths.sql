-- 0069 · The index every multi-tenant query needs, and four functions that were not pinned down
--
-- ── Why these indexes are the important ones ──
-- Row-level security adds "restaurant_id = auth_restaurant_id()" to every single read this app
-- makes. That predicate is therefore the most-run piece of SQL in the whole system, and nineteen
-- tables had no index to answer it with. Today that costs nothing: a property has sixteen
-- categories and the whole table fits in a page. It stops being free the moment the table holds
-- every property's rows at once — five hundred properties with twenty categories each is ten
-- thousand rows, and without this index every menu screen reads all ten thousand to find its own
-- twenty, for every customer, forever. The table that hurts first is purchase_items, which already
-- grows fastest.
--
-- Small tables are indexed too. The planner will ignore the index while a seq scan is genuinely
-- cheaper, so there is no cost to being early — only a cost to being late, because adding an index
-- to a busy table later means locking it.
--
-- ── Why the search_path matters ──
-- A security definer function runs with its owner's rights. If it does not pin its search_path, the
-- caller chooses where its unqualified names resolve: create a schema of your own holding a table
-- called "orders", put it first on the path, and the function reads yours while holding the owner's
-- privileges. Every other definer function here was already pinned; these four were missed.

-- ── the tenant predicate, indexed everywhere it was missing ──
create index if not exists admin_context_rid_idx      on admin_context(restaurant_id);
create index if not exists categories_rid_idx         on categories(restaurant_id);
create index if not exists dining_tables_rid_idx      on dining_tables(restaurant_id);
create index if not exists facilities_rid_idx         on facilities(restaurant_id);
create index if not exists guests_rid_idx             on guests(restaurant_id);
create index if not exists invites_rid_idx            on invites(restaurant_id);
create index if not exists labour_standby_rid_idx     on labour_standby(restaurant_id);
create index if not exists membership_keys_rid_idx    on membership_keys(restaurant_id);
create index if not exists offers_rid_idx             on offers(restaurant_id);
create index if not exists ota_channels_rid_idx       on ota_channels(restaurant_id);
create index if not exists ota_sync_log_rid_idx       on ota_sync_log(restaurant_id);
create index if not exists printers_rid_idx           on printers(restaurant_id);
create index if not exists proof_links_rid_idx        on proof_links(restaurant_id);
create index if not exists purchases_rid_idx          on purchases(restaurant_id);
create index if not exists recipe_items_rid_idx       on recipe_items(restaurant_id);
create index if not exists reviews_rid_idx            on reviews(restaurant_id);
create index if not exists room_types_rid_idx         on room_types(restaurant_id);
create index if not exists surplus_listings_rid_idx   on surplus_listings(restaurant_id);

-- purchase_items is read by purchase, not on its own, so the property leads and the purchase follows
create index if not exists purchase_items_rid_purchase_idx on purchase_items(restaurant_id, purchase_id);

-- a recipe is always looked up by dish; putting the property first keeps one tenant's rows together
create index if not exists recipe_items_rid_item_idx on recipe_items(restaurant_id, menu_item_id);

-- ── the four definer functions that never pinned their path ──
-- ALTER rather than CREATE OR REPLACE: the bodies are correct and do not need to be rewritten.
alter function facility_to_folio()   set search_path = public;
alter function purchase_to_ledger()  set search_path = public;
alter function queue_kot_print()     set search_path = public;
alter function refresh_rating()      set search_path = public;

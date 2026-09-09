-- DineFlow v21 — the property's own brand on its control page.
-- Run AFTER 0019. The owner's control page shows the property's name and logo, not DineFlow's.
alter table restaurants add column if not exists logo_url text;
alter table restaurants add column if not exists brand_colour text;   -- optional accent, e.g. '#c9302c'; NULL = signal green

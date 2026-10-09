-- 0083 · The property logo is uploaded, not pasted as a URL.
--
-- A public Storage bucket, `brand`, holds one folder per property: `<restaurant_id>/logo-<time>.<ext>`.
-- Public, because the logo is shown where nobody is signed in (storefront, booking page, receipts),
-- and a logo is not a secret. The bucket itself enforces the limits, so a request that skips the
-- app is refused too: 1 MB at most, and PNG, JPEG or WebP only — no SVG, which can carry script.
-- (The app shrinks a photo to 512 px before sending it, so a real logo is well under the limit.)
--
-- Writes: an owner or a manager (or Master control standing in a property — auth_role() is 'owner'
-- there) may add, replace or remove files in their own property's folder, and nowhere else.
-- restaurants.logo_url keeps holding the address; nothing about the column changes.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand', 'brand', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists brand_insert on storage.objects;
create policy brand_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'brand'
    and (storage.foldername(name))[1] = public.auth_restaurant_id()::text
    and public.auth_role() in ('owner', 'manager'));

drop policy if exists brand_update on storage.objects;
create policy brand_update on storage.objects for update to authenticated
  using (bucket_id = 'brand'
    and (storage.foldername(name))[1] = public.auth_restaurant_id()::text
    and public.auth_role() in ('owner', 'manager'))
  with check (bucket_id = 'brand'
    and (storage.foldername(name))[1] = public.auth_restaurant_id()::text
    and public.auth_role() in ('owner', 'manager'));

drop policy if exists brand_delete on storage.objects;
create policy brand_delete on storage.objects for delete to authenticated
  using (bucket_id = 'brand'
    and (storage.foldername(name))[1] = public.auth_restaurant_id()::text
    and public.auth_role() in ('owner', 'manager'));

-- listing the folder (to clear old logos after a new one is saved) needs select on the same rows;
-- the files themselves are served publicly by the bucket either way
drop policy if exists brand_select on storage.objects;
create policy brand_select on storage.objects for select to authenticated
  using (bucket_id = 'brand' and (storage.foldername(name))[1] = public.auth_restaurant_id()::text);

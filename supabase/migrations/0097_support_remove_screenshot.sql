-- 0097 · Master control can remove a screenshot from a support request.
--
-- A screenshot sent with a request can show more than it should — a guest's name and phone on the
-- Front desk, a bill with a card's last digits — and a privacy & consent request may ask for exactly
-- that to go. Storage refuses a direct delete from storage.objects (protect_objects_delete), so the
-- file goes through the Storage API under this policy, which only Master control meets; then
-- admin_support_drop_file takes the path off its message and says so in the thread, which the
-- property sees. The property itself still cannot delete: what it sent stays as evidence until
-- Master control removes it.

drop policy if exists support_files_delete on storage.objects;
create policy support_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'support' and (select public.is_platform_admin()));

create or replace function public.admin_support_drop_file(p_message uuid, p_path text)
returns void language plpgsql security definer
set search_path = public
as $$
declare m support_messages%rowtype;
begin
  if not is_platform_admin() then raise exception 'master only' using errcode = '42501'; end if;
  select * into m from support_messages where id = p_message;
  if not found or not (p_path = any(m.attachments)) then raise exception 'That screenshot is not on this message.'; end if;
  update support_messages set attachments = array_remove(attachments, p_path) where id = m.id;
  insert into support_messages(ticket_id, author, author_name, side, event, body)
  values (m.ticket_id, auth.uid(), 'DineFlow support', 'support', 'file:removed', 'A screenshot was removed by DineFlow support');
  insert into admin_log(actor, action, target, meta)
  select auth.uid(), 'support_file_removed', t.restaurant_id, jsonb_build_object('ticket', t.ticket_no, 'path', p_path) from support_tickets t where t.id = m.ticket_id;
end $$;
revoke all on function public.admin_support_drop_file(uuid, text) from public, anon;
grant execute on function public.admin_support_drop_file(uuid, text) to authenticated;

-- ═══════════ First-time password change without OTP ═══════════
--
-- When an owner signs in on a temporary password and there is no contact address on the account,
-- OTP cannot be sent. Before this, the owner was trapped: the page demanded a code that could not
-- arrive, and there was no way forward, backward or out except signing out.
--
-- The fix: clear_password_change_flag_forced() works only when must_change_password is still true,
-- meaning it is the first-time change right after signing in with a temporary password. The owner
-- already proved their identity by holding the temp password. For all later changes (from Settings,
-- after the flag is cleared), the OTP path is still required.
--
-- The temp_passwords vault row is also blanked, because the password has just been replaced.

create or replace function clear_password_change_flag_forced() returns void
language plpgsql security definer set search_path = public as $$
begin
  -- only works during the forced first-time change
  if not exists (select 1 from profiles where id = auth.uid() and must_change_password = true) then
    raise exception 'This can only be used during the first-time password change.';
  end if;
  update profiles set must_change_password = false where id = auth.uid();
  update temp_passwords set password = null, consumed_at = now()
   where user_id = auth.uid() and password is not null;
end $$;

grant execute on function clear_password_change_flag_forced() to authenticated;
revoke all on function clear_password_change_flag_forced() from public, anon;

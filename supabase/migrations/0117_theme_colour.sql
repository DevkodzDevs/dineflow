-- 0117 · A third theme: "colour" (2026-10-18, the owner's "one more theme — colourful").
--
-- Beside dark (the graphite board) and paper (the bright room) there is now a colourful one: deep
-- indigo surfaces, a magenta tint, every hue brighter. A person's choice is kept on their login
-- (user_prefs, 0078), so the check on the column and the guard in set_my_theme both learn the new
-- value. Nothing else changes: the policy, the grants and session_bundle stay as 0078 left them, and
-- every row already saved ('dark', 'paper', 'system') is still allowed.
--
-- RLS: user_prefs keeps 0078's policy (a person reads only their own row) and still has no write
-- policy — the browser does not write the table; set_my_theme does, for the caller's own row only.

alter table user_prefs drop constraint if exists user_prefs_theme_check;
alter table user_prefs add constraint user_prefs_theme_check check (theme in ('dark', 'paper', 'colour', 'system'));

create or replace function set_my_theme(p_theme text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_theme is null or p_theme not in ('dark', 'paper', 'colour', 'system') then raise exception 'unknown theme: %', p_theme; end if;
  insert into user_prefs (user_id, theme, updated_at) values (auth.uid(), p_theme, now())
  on conflict (user_id) do update set theme = excluded.theme, updated_at = now();
end;
$$;
revoke all on function set_my_theme(text) from public, anon;
grant execute on function set_my_theme(text) to authenticated;

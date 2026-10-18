-- 0118 · A fourth theme: "bright" — colourful on a light background (2026-10-18, the owner's "one more colourful
-- theme, light-background based").
--
-- 0117 added "colour" (bright hues on deep indigo). This one is its daylight sibling: white cards on a soft lavender
-- page inside a jewel-toned frame, the same magenta-to-orange buttons. The app draws it on top of the paper theme
-- (html data-theme="paper" + data-palette="bright"), so every light-surface rule already written stays right; the
-- database only has to accept the new name. The policy and grants are 0078's, as 0117 left them.
--
-- RLS: user_prefs keeps 0078's read-own policy and has no write policy — set_my_theme writes the caller's row only.

alter table user_prefs drop constraint if exists user_prefs_theme_check;
alter table user_prefs add constraint user_prefs_theme_check check (theme in ('dark', 'paper', 'colour', 'bright', 'system'));

create or replace function set_my_theme(p_theme text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_theme is null or p_theme not in ('dark', 'paper', 'colour', 'bright', 'system') then raise exception 'unknown theme: %', p_theme; end if;
  insert into user_prefs (user_id, theme, updated_at) values (auth.uid(), p_theme, now())
  on conflict (user_id) do update set theme = excluded.theme, updated_at = now();
end;
$$;
revoke all on function set_my_theme(text) from public, anon;
grant execute on function set_my_theme(text) to authenticated;

-- 0119 · A fifth theme: "royal" — rich royal colours on ivory, classic, no gradients (2026-10-18, the owner's "rich royal
-- colour base with classic feel … don't use multi-gradient … light background based").
--
-- 0117 added "colour" and 0118 "bright"; this is the classic one: navy, burgundy, emerald and gold on an ivory page,
-- every surface a solid colour with gold hairlines, serif headings. Like "bright" the app draws it on top of the paper
-- theme (html data-theme="paper" + data-palette="royal"); the database only has to accept the name. The policy and
-- grants are 0078's, as 0118 left them.
--
-- RLS: user_prefs keeps 0078's read-own policy and has no write policy — set_my_theme writes the caller's row only.

alter table user_prefs drop constraint if exists user_prefs_theme_check;
alter table user_prefs add constraint user_prefs_theme_check check (theme in ('dark', 'paper', 'colour', 'bright', 'royal', 'system'));

create or replace function set_my_theme(p_theme text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_theme is null or p_theme not in ('dark', 'paper', 'colour', 'bright', 'royal', 'system') then raise exception 'unknown theme: %', p_theme; end if;
  insert into user_prefs (user_id, theme, updated_at) values (auth.uid(), p_theme, now())
  on conflict (user_id) do update set theme = excluded.theme, updated_at = now();
end;
$$;
revoke all on function set_my_theme(text) from public, anon;
grant execute on function set_my_theme(text) to authenticated;

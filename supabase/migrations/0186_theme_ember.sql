-- 0186 · The theme set becomes four: dark, paper, royal and the new "ember" — a walnut side menu, graphite cards and
-- orange light (2026-11-16, the owner's "one more theme, exactly like this video": the Mercato commerce console) — and
-- the two colourful themes of 0117 ("colour") and 0118 ("bright") are retired (the owner, the same day: "keep these
-- four only, remove the rest").
--
-- The app draws ember on the dark theme (html data-theme="dark" + data-palette="ember"), as royal rides on paper; the
-- database only has to accept the name. A login whose saved theme is one of the retired two is moved to the theme it
-- was built on — colour to dark, bright to paper — before the check tightens, so the constraint can be added and no
-- one's row is left invalid (on 2026-11-16 the live table had none: 1 dark, 3 royal). The policy and grants are 0078's,
-- as 0119 left them.
--
-- RLS: user_prefs keeps 0078's read-own policy and has no write policy — set_my_theme writes the caller's row only.

update user_prefs set theme = 'dark', updated_at = now() where theme = 'colour';
update user_prefs set theme = 'paper', updated_at = now() where theme = 'bright';

alter table user_prefs drop constraint if exists user_prefs_theme_check;
alter table user_prefs add constraint user_prefs_theme_check check (theme in ('dark', 'paper', 'royal', 'ember', 'system'));

create or replace function set_my_theme(p_theme text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_theme is null or p_theme not in ('dark', 'paper', 'royal', 'ember', 'system') then raise exception 'unknown theme: %', p_theme; end if;
  insert into user_prefs (user_id, theme, updated_at) values (auth.uid(), p_theme, now())
  on conflict (user_id) do update set theme = excluded.theme, updated_at = now();
end;
$$;
revoke all on function set_my_theme(text) from public, anon;
grant execute on function set_my_theme(text) to authenticated;

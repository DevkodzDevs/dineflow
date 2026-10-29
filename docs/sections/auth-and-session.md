# Auth, session and the middleware

**Routes** `/login` · `/signup` · `/join` · `/forgot` · `/account/password`
**Files** `middleware.ts` · `lib/auth.ts` · `lib/supabase/{server,client,middleware}.ts` ·
`app/(auth)/**` · `app/account/password/**` · `components/SignedOutCleanup.tsx`
**Writes** `create_restaurant`, `create_demo_sandbox`, `join_restaurant`, `is_master`,
`request_password_reset`, `reset_password_with_code`, `enforce_temp_password_lockout`,
`request_password_otp`, `request_password_otp_for`, `verify_password_otp`, `clear_password_change_flag`,
`defer_password_change`, `login_gate`, `login_failed`

## What it is

How a person gets in, how the app knows who they are on every request, and which routes need that
at all.

## How it works

### `requireSession()` — one call answers the whole shell

`lib/auth.ts` calls a single RPC, `session_bundle`, which returns who you are, the property you are
standing in, whether its membership is live, and how many tickets are running late for the bell
badge. It is `cache()`d per request, so the layout and the page share one trip to Mumbai.

**There is no separate auth call.** PostgREST verifies the token's signature before the function
runs, so a bundle carrying a `user_id` *is* proof of a valid session.

**A rejected token and an unreachable database look identical from here**, and must not be treated
the same:

```ts
const AUTH_CODES = new Set(["PGRST301", "PGRST302", "42501"]);
const AUTH_WORDS = ["jwt", "token is expired", "not authenticated", "invalid claim", "invalid signature"];
```

Only an answer that actually says "this token is no good" means sign in again. Anything else — a
dropped connection, a timeout, a 500 — is **thrown**, which lands on the error boundary with a Try
again button. Sending an unreachable database to `/login` starts a redirect loop that presents as a
dead app: the middleware finds the token perfectly valid and sends the person straight back to the
page that just bounced them, until the browser gives up with `ERR_TOO_MANY_REDIRECTS`.

### `middleware.ts` — three bands of route

```ts
SESSION_FREE   // returns immediately: no auth work at all  (see guest-facing.md)
PUBLIC_PREFIX  // reachable without a session, but still processed
everything else // needs a session, else → /login
```

`SESSION_FREE` is checked **first**, before any Supabase work. `/attend/` is in it and in `PUBLIC_PREFIX`
(a labourer's punch link has no session; the token is the identity — but `/attendance`, the staff
screen, is not, and the two must not share a prefix match: `"/attendance".startsWith("/attend/")` is false). Cookies are read and written through
`getAll`/`setAll` on `createServerClient` from `@supabase/ssr`.

### Signing in

Three ways: an owner signs up and `create_restaurant` makes a property; a staff member uses a join
code and `join_restaurant`; a staff member uses a login the owner created and is forced through
`/account/password` on first use (`must_change_password`, enforced by
`enforce_temp_password_lockout`). A demo sandbox comes from `create_demo_sandbox` and is swept by
`sweep_expired_demos`.

## Before you edit

- **Sign-in starts on the position's screen (2026-10-17).** After `signInWithPassword`, `startScreen()` reads the
  person's own `profiles.position` (filtered by their id — an owner can read the whole team) and the session bundle,
  works out the sections they hold (`modulesFor`), and redirects to the position's start screen (`positionHome`) — a
  commis to `/kitchen`, a cashier to `/billing` — else `/dashboard`, which the layout turns into the person's own screen
  (`homeFor`) unless they hold the control room (owner, or a manager it was given to). Any error falls back to `/dashboard`, the same way.
  **Since 2026-10-20 staff (everyone but the owner and a manager) go to `/home` instead** — their own My day
  (`landsOnMyDay`, [my-day.md](my-day.md)); the position's screen is one tap away on their bar.
- **Outlets (0106).** `session_bundle` answers the outlet this sign-in chose (`outlet_session` + `outlet_access`):
  `restaurant` is that outlet, `profile.restaurant_id` is that outlet and `profile.home_restaurant_id` the person's own,
  and `outlets` lists them for the switcher (empty for a one-outlet person). `requireSession` passes `outlets` on as
  `Session.outlets`. The membership lock is per outlet; `/membership` shows the switcher. See
  [chain-and-payroll.md](chain-and-payroll.md).
- **`session_bundle` also carries `theme`** (0078) — the caller's saved light/dark choice from
  `user_prefs`, or null. It is per login, so it works for masters, who have no profiles row.

- **`AuthApiError: Invalid Refresh Token` in the server log is not a bug.** A browser presenting a
  dead refresh token already gets redirected to `/login` with the stale cookie cleared — the trace
  is `@supabase/auth-js` logging a condition we handle.
- **`@supabase/auth-js` is stock — there is no hand-edit any more.** A local edit once softened
  those logs to `console.warn`; checked 2026-10-10, the installed 2.112.4 is byte-identical to the
  npm tarball (`npm pack` + `diff -r`: no differences), so a past `pnpm install` removed it. Decided:
  keep it stock and accept the log line — it is harmless and the same on Vercel. If it is ever
  wanted quieter, do it with `pnpm patch`, never by editing `node_modules`.
- **Adding a public route means both lists.** See [guest-facing.md](guest-facing.md).
- **Never widen `AUTH_CODES`/`AUTH_WORDS` to "be safe".** Every extra word is another outage that
  presents as a sign-out loop.
- **The session payload is the whole `restaurants` row except `box_token`** (0098 — it reached every
  signed-in browser, and a Box token rewrites the menu). A column added in [settings.md](settings.md)
  ships on every request; a secret added there must be taken out here too.

## Verify

```
node stale.mjs           # presents a dead refresh token: /dashboard and /orders must 302 to
                         # /login and clear the auth cookies; no cookie at all does the same
node legal-shot.mjs      # public paths make no auth call
pnpm --filter @dineflow/web build
```

## See also

[guest-facing.md](guest-facing.md) · [staff-and-labour.md](staff-and-labour.md) ·
[shell-and-nav.md](shell-and-nav.md) · [data-and-rls.md](data-and-rls.md)

- **A voluntary password change checks the emailed code first** (`changePassword`): it used to set the
  new password and check the code afterwards, so a picked-up session could change it without the
  code. A forced first-time change still needs no code — the temporary password is the proof.
- **`DINEFLOW_OTP_ECHO` works only on a development server** (`otpEcho()` also requires
  `NODE_ENV !== "production"`). Shown on screen, a reset code lets anyone who knows a login id take the
  account; a production build — Vercel, a Box in the building — ignores the variable.

### Since 0098 (2026-10-13) — see [data-and-rls.md](data-and-rls.md) for the database side

- **Failed sign-ins are counted** (`login` in `app/(auth)/actions.ts`): `login_gate(id, ip)` before
  trying, `login_failed(id, ip)` after a failure — ten for one typed id or thirty from one address in
  15 minutes and the form answers *Too many sign-in attempts. Wait 15 minutes and try again.* It counts
  what was typed, so an id that does not exist behaves the same. The address is `x-forwarded-for`'s
  first entry, which Vercel sets itself. **It needs `SUPABASE_SERVICE_ROLE_KEY`**, like the
  forgotten-password flow; without it (a dev machine) the form signs in as before. Supabase's own
  per-address limits still apply to direct calls to its sign-in endpoint.
- **Temporary passwords** come from the cryptographic generator: Dine + a word (32) + six digits + a
  symbol, about 160 million — was about 500,000 from `random()`. The four-day lockout checks each stale
  one once and clears it from the vault; it used to bcrypt-check every stale one on every attempt.
- **A wrong code is an answer, not an error.** `verify_password_otp` and `reset_password_with_code`
  return `{ok:false, error}` for a wrong code or too many tries — raising rolled the try counter back,
  so the five-tries limit never counted. `verifyCode` and `resetPassword` show `error`.
- **The password-change code is minted by the server** — `request_password_otp_for(user.id)` with the
  service role, for the user the session proves (falls back to the session's own
  `request_password_otp` where there is no service role). The session's RPC handed the plain code to
  whoever held the session; 0121 (2026-10-19) closed it, so the fallback is gone — **the code needs
  `SUPABASE_SERVICE_ROLE_KEY` on Vercel**.
  Still true: Supabase's *Secure password change* (Auth settings) decides whether a session can change
  its password through the Auth API without signing in again — turn it on.
- **Forgot password says "mail is not set up" up front, for every id alike.** It used to say so only
  after finding a real account, which told a stranger which ids exist. A send that fails for a real
  account is logged and answered like any other request.
- **"Try a demo"** no longer calls `sweep_expired_demos` (Master control's only, since it deletes
  sign-ins); `create_demo_sandbox` sweeps expired sandboxes itself.
- **"Install on this phone"** sits under the form on sign-in, Join and Open a restaurant (`InstallRow`,
  see [shell-and-nav.md](shell-and-nav.md)): one tap where the browser has offered its install, otherwise the
  install sheet for the device. It is the first screen on a new device, and installing before signing in is
  the right order — on an iPhone the Home Screen app keeps its own sign-in. Hidden once installed.

- **New sign-in ids end in `@dineflow.cloud` (0130, 2026-10-20 — the owner: "don't add @dineflow.local").** The house
  domain is `DINEFLOW_DOMAIN` in `packages/shared/src/login.ts` and the database's `to_login_address` /
  `admin_create_property` agree. The six logins issued before on `@dineflow.local` are untouched and still sign in:
  `loginCandidates(raw)` turns a bare id into `[id@dineflow.cloud, id@dineflow.local]`, and the sign-in action and both
  forgot-password steps try them in that order (a full address is tried once, as typed). 0130 refuses a new id whose name
  already exists on the old domain, so a bare id never means two accounts. Tests: `lib/login.test.ts`.
- **Short copy** (2026-10-23): /account/password hints cut to a few words (the 10- and 15-minute limits kept).

- **The Login ID placeholder** (2026-10-23, the owner): "Login ID or email" (Forgot: "Your login ID") instead of a sample
  `dine-htl-mano-00001`, which read as something to copy. Hints shortened.

- **POST route handlers check where the request came from (2026-10-25 audit).** `/logout`, `/admin/open` and `/admin/leave` are
  plain route handlers, so they do not get Next's cross-site check that server actions have; they relied on the sign-in
  cookies being SameSite=Lax. `lib/sameOrigin.ts` `crossSite(req)` refuses (403) a request the browser marks
  `Sec-Fetch-Site: cross-site`/`same-site`, or whose `Origin` host is not this request's host.
- **Sign-in waits on fewer trips (2026-10-29).** `login` asks `login_gate` and `enforce_temp_password_lockout` together (both
  before the attempt, neither needs the other), and `is_master` together with `startScreen` — a trip fewer each. Most of
  sign-in's time is Supabase checking the password, and a cold function (shell-and-nav.md, speed pass 2026-10-29).
- **`/` is the public front page (2026-10-29, site.md).** `app/page.tsx` no longer redirects to /login. The middleware still sends
  a signed-in person on `/` to their screens, and now sends the **Windows app** (user agent `DineFlowDesktop/`) to /login when
  signed out. `/for/` and `/blog` joined `PUBLIC_PREFIX` and `SESSION_FREE`.
- **Shorter copy (2026-10-29, the owner: "maximum 3 or 4 words, try 2 or 3 — clean and neat").** Subtitles, hints, helper
  lines and empty-state hints cut to two–four words, or removed where they said the obvious. Error and refusal messages,
  steps to follow outside the app, printed and exported text, WhatsApp bodies and tooltips were left as they were.

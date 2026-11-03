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
- **A pasted "id / password" is split (2026-10-30).** `app/(auth)/pasteLogin.ts` `splitPastedLogin` (7 tests,
  `pasteLogin.test.ts`) reads "id / password", a tab, two lines or labelled lines ("Login ID:", "Temporary password:"; a "DineFlow
  code:" line ignored) and splits only when the first part looks like a login (no spaces, 3+ characters, at most one @). Pasted into
  **Password**: the ID goes to Login ID only if that is empty or the same login; pasted into **Login ID**: the password moves to
  Password if that is empty. On the device, at paste time — sign-in, the throttle and the log are unchanged. shots157 checks it.

## 2026-11-01 — into the app by a full page load
- **The owner's iPad: "after signing in — with a temporary password, Continue or Save — *Application error*; closed and
  reopened it is fine."** Reproduced on the live site and on a local build in WebKit: the page reached /home, then Next's
  router re-committed `/home` every 30–50 ms with no request (186 `history.replaceState` calls) until Safari threw
  `SecurityError: … replaceState() more than 100 times per 10 seconds`. A client-side move that starts outside the app's
  layout (/login, /account/password) and meets the layout's own `redirect()` (/dashboard → /home for staff) loops; a full
  load takes the same redirects as HTTP ones.
- So `login`, `signup`, `join` and `changePassword` **return `{ go }`** instead of calling `redirect()`, and AuthForm /
  PasswordClient go there with `window.location.replace` (the button stays "One moment…" / "Saving"); *Continue with
  temporary password* does the same instead of `router.push("/dashboard"); router.refresh()`. **Do not put a `redirect()` or
  a `router.push` from these screens into the app back.** Checked: `r159.mjs` (login, three paths), `live159b.mjs`.

## 2026-11-02 — the wall's live board; Join's placeholders
- **The owner's iPad: "the section under the clock is empty — ultra modern, 3D, animated; don't touch the flap clock."** On a touch
  screen from 768px the frame is `align-items: flex-start` (globals.css, the no-bounce frame), so the wall was only as tall as its
  words and `justify-between` spread nothing — the bottom half sat empty. The wall is now `lg:self-stretch` and a flex column: the
  logo, then the clock + headline + line + **the live board** (`Showcase.tsx` / `Showcase.module.css`, `[data-auth-showcase]`)
  taking what is left, then the tagline at the foot. The board: a glass panel tilted in perspective, four tiles (Kitchen, Front
  desk, Pantry, Till) with one lifting toward the viewer every 2.8 s, a bar chart, a grid floor and a soft orb. Pure CSS motion,
  still for reduced motion. Under 960px tall it drops the chart and the small labels and tilts less (at 834 its near corner
  reached the tagline; at 1440×900 the full board made the wall 978px and the page scrolled); under 700px it is hidden. The
  flap clock is untouched. shots49: at 1194×834 dark/royal, 1366×1024 paper, 1440×900, 1920×1080 the wall is the screen's
  height, the tagline 48px from the foot, the board clear of it, no sideways scroll.
- **Join's placeholders** read as what to type, not samples to copy (the owner: "placeholder not good"): *Your full name* (also on
  Open a restaurant), *Code from your manager*, *Your email address* — were `Priya Kumar`, `dine-res-mano-00001`, `you@restaurant.in`.

- **The wall's board fits the room it is given (2026-11-02, the owner's iPad: "screen design breaking" — the board ran onto the
  tagline and, in Safari with its bars, off the screen).** The 960/700px *screen*-height steps could not see what the clock, the
  headline and the line had left. `.stage` is now a size container (`container: board / size`) filling the slot (the slot's `pt-4`,
  stretch, not centred), and the board steps by **its own** height: full (> 400) · compact, no chart or small labels, less tilt
  (`driftLow` — keyframes nested in a container query are not honoured by Safari) · one row of two tiles (≤ 218) · none (≤ 180).
  shots163: 1194×834 four compact tiles 515–725 with the tagline at 769; 1180×820 one row; 1194×744, 1024×768, 1280×720 none;
  1366×1024, 1440×900, 1920×1080 clear of the tagline; 834 and 412 have no wall. Never under the tagline, never past the foot.

## 2026-11-03 — the wall's headline, redesigned
- **The owner's iPad (royal): "upgrade this marked section — ultra modern, unique, user friendly"** — the headline *Orders, rooms
  and stock on one board.* and its grey line under the clock. Now `Headline.tsx` / `Headline.module.css` (`[data-auth-headline]`,
  a server component, pure CSS): three glass word tokens — **Orders · Rooms · Stock**, in the live board's hues (kitchen orange,
  front desk blue, pantry violet) — on a wire a light runs along, each token lighting as it passes; then **All on one board.** in
  a slow sheen (the theme's own display face — royal's serif, dark's condensed); then what it does as two chips, *Phone orders
  reach the kitchen at once* and *Stock updates by itself*. Still for reduced motion. The h1 keeps the full sentence for screen
  readers (`sr-only`; the tokens and the line are `aria-hidden`).
- **Each visible phrase is one text node** so the whole-app Tamil / Hindi pass translates it whole; do not split a phrase into
  spans. Under `html[data-lang-all]` the line and chips step down (wider glyphs), so the live board keeps its room: at 1194×834
  in Tamil the board shows (two tiles). A short wall (`max-height: 860px`) is tighter too. The flap clock is untouched.
- Probe `head.mjs` (WebKit, production build on :3171): five themes × 1920×1080, 1440×900, 1194×834, 1366×1024, 1180×820 — the
  headline above the tagline, the board between them, the wall the screen's height, no sideways scroll, no page errors; 834 and
  412 have no wall; Tamil reads *எல்லாம் ஒரே போர்டில்.*; reduced motion stops every animation. 208/208.

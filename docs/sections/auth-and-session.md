# Auth, session and the middleware

**Routes** `/login` · `/signup` · `/join` · `/forgot` · `/account/password`
**Files** `middleware.ts` · `lib/auth.ts` · `lib/supabase/{server,client,middleware}.ts` ·
`app/(auth)/**` · `app/account/password/**` · `components/SignedOutCleanup.tsx`
**Writes** `create_restaurant`, `create_demo_sandbox`, `join_restaurant`, `is_master`,
`request_password_reset`, `reset_password_with_code`, `enforce_temp_password_lockout`,
`request_password_otp`, `verify_password_otp`, `clear_password_change_flag`,
`defer_password_change`, `sweep_expired_demos`

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

`SESSION_FREE` is checked **first**, before any Supabase work. Cookies are read and written through
`getAll`/`setAll` on `createServerClient` from `@supabase/ssr`.

### Signing in

Three ways: an owner signs up and `create_restaurant` makes a property; a staff member uses a join
code and `join_restaurant`; a staff member uses a login the owner created and is forced through
`/account/password` on first use (`must_change_password`, enforced by
`enforce_temp_password_lockout`). A demo sandbox comes from `create_demo_sandbox` and is swept by
`sweep_expired_demos`.

## Before you edit

- **`session_bundle` also carries `theme`** (0078) — the caller's saved light/dark choice from
  `user_prefs`, or null. It is per login, so it works for masters, who have no profiles row.

- **`AuthApiError: Invalid Refresh Token` in the server log is not a bug.** A browser presenting a
  dead refresh token already gets redirected to `/login` with the stale cookie cleared — the trace
  is `@supabase/auth-js` logging a condition we handle.
- **`node_modules/@supabase/auth-js` currently carries an unmanaged hand-edit** softening those logs
  from `console.error` to `console.warn`. It is not a pnpm patch, so it is not on Vercel and it
  vanishes on the next `pnpm install`. Decide it deliberately — make it a patch, or revert it and
  accept the log — rather than rediscovering it.
- **Adding a public route means both lists.** See [guest-facing.md](guest-facing.md).
- **Never widen `AUTH_CODES`/`AUTH_WORDS` to "be safe".** Every extra word is another outage that
  presents as a sign-out loop.
- **The session payload is the whole `restaurants` row.** A column added in
  [settings.md](settings.md) ships on every request.

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

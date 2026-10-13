# API routes

**Files** `app/api/**/route.ts`

## What they are

- **`POST /api/admin/selftest`** — Master control → Testing's server suites (`{ suite:
  database|functions|api|security|performance|unit, restaurant? }`). Master only: no session → 401,
  a non-master → 403. It records every run in `selftest_runs`. The performance suite fetches the
  app's own screens with the caller's cookie; the security suite fetches them without one.
  See [admin-and-membership.md](admin-and-membership.md).


Fifteen HTTP endpoints for things a page cannot do: inbound webhooks, device sync, feeds and
health.

| Route | Public? | What it is |
| --- | --- | --- |
| `api/health` | yes | liveness, for uptime monitoring |
| `api/webhooks/razorpay` | yes | payment result — **verify the signature** |
| `api/webhooks/aggregator/[token]` | yes | Swiggy/Zomato push an order in |
| `api/ical/[token]` | yes | availability as an iCal feed for OTAs |
| `api/ota/sync` | yes | channel sync |
| `api/box/{ping,pull,push,sync}` | yes | the on-premise box talks to the cloud |
| `api/pay/[token]/order` | yes | create a gateway order for a pay link |
| `api/pay/[token]/verify` | yes | confirm it |
| `api/scan` | session | the recogniser behind `/scan` |
| `api/assist`, `api/assist/act` | session | the AI panel: answer, and act |
| `api/download/[file]` | session | installers (`lib/installers.ts`) |

`middleware.ts` lets the public ones through: `/api/webhooks/`, `/api/ical/`, `/api/ota/`,
`/api/box/` are in `PUBLIC_PREFIX`.

## Before you edit

- **`/api/pay/[token]/verify` settles only a captured payment** (2026-10-13): an *authorized* one is
  captured first (`POST /payments/{id}/capture` with the checked amount); still authorized → 502 with
  "will show as paid in a minute", and the webhook settles it on `payment.captured`. An authorized
  payment on an account that captures by hand is released back to the guest after a few days.
- **`/api/ota/sync` resolves a feed's host** before fetching (`lib/netguard.ts`, tested): every address
  must be public — the text-only check passed names like `10.0.0.5.nip.io`.
- **A public endpoint is reachable by anyone on the internet.** Its only protection is the token in
  the path or the signature in the header. Verify, then validate every field, then write.
- **Razorpay's signature check is not optional** and must happen before anything is recorded.
- **Webhooks retry.** Every handler must be idempotent — the same event twice must not place two
  orders or credit two payments.
- **Never echo an internal id or a tenant id in an error body** on a public route.
- **`api/assist/act` can change data.** It is the one place where a model's output reaches a write;
  it must go through the same RPCs with the same permission checks as a human action, never a
  direct table write.
- **A new public route needs its prefix in `PUBLIC_PREFIX`**, and if it should skip auth work
  entirely, in `SESSION_FREE` too. See [auth-and-session.md](auth-and-session.md).

## Verify

```
curl -fsS http://127.0.0.1:3141/api/health
pnpm --filter @dineflow/web build
```

Replay a webhook twice and confirm the second one changes nothing.

## See also

[auth-and-session.md](auth-and-session.md) · [online-and-channels.md](online-and-channels.md) ·
[guest-facing.md](guest-facing.md) · [settings.md](settings.md)

## Security notes (2026-10-10)

- **`api/ota/sync`** — runs for the scheduler (`Authorization: Bearer $CRON_SECRET`, which Vercel Cron
  sends, or `?key=`) or for a signed-in user, who gets only their own property's feeds (read through
  RLS). **With `CRON_SECRET` unset the nightly run is refused** — set it on Vercel. Writes need
  `SUPABASE_SERVICE_ROLE_KEY` (0085). Feed URLs must be public `https://` (no localhost, private or
  link-local addresses), no redirects, 10 s timeout, 2 MB cap. It used to run for anyone, for every
  property, whenever no key was given.
- **`api/pay/[token]/verify` and `api/webhooks/razorpay`** settle a bill only when the Razorpay
  **order** (created server-side by `/order` with `notes.pay_token`) names this bill and covers it —
  a payment's own notes come from the guest's browser. Razorpay unreachable → not settled (verify
  answers 502; the webhook answers 503 so Razorpay retries). One payment id, one bill (0085 index).
  "No secret saved" and "bad signature" give the same answer.
- **`api/scan`, `api/assist`** — per-user limits (`lib/ratelimit.ts`: 40 scans, 30 chats per 10 min;
  in-memory per instance — a speed bump, not a quota) and size caps (8 MB image, 2,000-character
  messages).
- **`api/webhooks/aggregator`** answers "unknown channel" or "could not record the order", never the
  database's message.
- **Headers** add `object-src 'none'; base-uri 'self'` to the CSP. No `script-src` yet: Next's inline
  bootstrap needs per-request nonces (a middleware change).

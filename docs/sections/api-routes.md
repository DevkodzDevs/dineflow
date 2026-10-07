# API routes

**Files** `app/api/**/route.ts`

## What they are

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

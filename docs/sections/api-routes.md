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
| `api/dine/pay/[token]/qr` | yes | 0181: POST issues or re-uses a **held online order's** dynamic UPI QR for its whole total (prepay). Mirror of the bill route, keyed by the order's `pay_token`; 404 without a gateway |
| `api/pay/[token]/qr` | yes | 0178: POST issues or re-uses the bill's dynamic UPI QR (Razorpay, exact amount, single use); DELETE closes it. 404 without a gateway. 12 a bill per 10 min |
| `api/screen/[key]` | yes | the counter TV's feed (0103 `screen_feed`): menu and parcel tokens, by the secret screen key; 404 on a wrong or rotated key. Since 2026-11-10 the TV reads `screen_feed` straight from the database's API (`lib/screenFeed.ts`); this route is the **fallback** when that cannot be reached, and the check before the TV's 12-hour reload |
| `api/screen/[key]/queue` | yes | 0179: the waiting-list board's feed (`screen_queue`) — numbers, party sizes, held tables; never a name or a phone. Same as above since 2026-11-10: the board reads `screen_queue` directly and this is the fallback (it is also what answers until 0179 is applied) |
| `api/scan` | session | the recogniser behind `/scan` |
| `api/assist`, `api/assist/act` | session | the AI panel: answer, check, make PDFs, and act — see *Assist* below |
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
  direct table write. Its whitelist (2026-10-21): `call_walkin` and `walkin_left` (`walkin_set`),
  `reservation_no_show` (`reservation_set`), `reorder_message` (drafts text, writes nothing), `open`.
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
- **`api/webhooks/razorpay` also settles a prepaid online order (0181).** A `qr_code.credited` whose notes carry a
  `prepay_token` (not a bill `pay_token`) is verified with the property's signature and settled through `dine_prepay_settle`,
  which releases the held order to the counter. The bill path below is unchanged; the two are told apart by which note the code carries.
- **`api/pay/[token]/verify` and `api/webhooks/razorpay`** settle a bill only when the Razorpay
  **order** (created server-side by `/order` with `notes.pay_token`) names this bill and covers it —
  a payment's own notes come from the guest's browser. Razorpay unreachable → not settled (verify
  answers 502; the webhook answers 503 so Razorpay retries). One payment id, one bill (0085 index).
  "No secret saved" and "bad signature" give the same answer.
- **`api/scan`, `api/assist`** — per-user limits (`lib/ratelimit.ts`: 40 scans, 30 chats per 10 min;
  in-memory per instance — a speed bump, not a quota) and size caps (8 MB image, 2,000-character
  messages).
- **`api/webhooks/aggregator`** answers "unknown channel" or "could not record the order", never the
  database's message. Its **GET** (a platform checking the address, 0153 `channel_hello`) answers 200 with the channel's
  name, kind and taking-orders, or 404 for an unknown token; the token is never echoed.
- **Headers** add `object-src 'none'; base-uri 'self'` to the CSP. No `script-src` yet: Next's inline
  bootstrap needs per-request nonces (a middleware change).

## Assist (rebuilt 2026-10-21)

`api/assist` (chat) streams **NDJSON** events, one per line (`lib/assist/protocol.ts`): `text`, `think` (the
model's reasoning summary — shown faint, folded under "How I worked it out"), `step` ("Reading Collections · This
month"), `findings` (health-check cards), `doc` (a PDF's contents, drawn in the browser by `lib/tablePdf.ts`),
`action` (a button), `error`. `mode: "insights"` is unchanged and now also returns the person's `topics`.

- **With `ANTHROPIC_API_KEY`:** Claude Opus 5.5 (`claude-opus-5-5`), adaptive thinking with `display: "summarized"`,
  effort `medium`, `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`), a manual tool loop (≤ 8 turns,
  `maxDuration` 120 s) over four tools: `look_up` (topics × period), `check_health`, `make_pdf` (≤ 2 per answer; the
  model writes only the title and summary — every figure comes from the records), `offer_action` (≤ 3, validated).
  Tool inputs are checked with zod. The stable system prompt is cached; the person, screen, language (`df-lang`) and
  browser errors (the panel keeps the last 8 `error`/`unhandledrejection` messages) ride in a second block.
  **This path has not been run against the live API** — no key exists on the development machine (2026-10-21); it is
  typechecked against `@anthropic-ai/sdk` 0.127. The first real run is on Vercel, where the key lives.
- **Without a key:** the same health check and documents, chosen from the words of the request
  (`lib/assist/intent.ts`): "check for problems", "PDF of last month's collections", "complete documentation of staff,
  pantry and rooms". Otherwise the screen's facts, read out.
- **What it may read** — `lib/assist/data.ts`, 15 topics (collections, expenses, staff, payroll, pantry, rooms, menu,
  orders, customers, reservations, labour, housekeeping, online, tables, kitchen). Each opens only for a role whose
  modules hold it (`modulesFor`, the same answer as the menu); payroll only for owner and manager; expenses for owner,
  manager, supervisor, cashier (as `/expenses`). Every query is pinned `restaurant_id = rid` (the master's RLS sees
  every property) and goes through the person's own client.
- **What it never reads:** gateway keys, webhook/export/import links and tokens, pay/QR/punch/check-in tokens,
  passwords, OTPs, ID numbers, login emails. `lib/assist/assist.test.ts` reads the selects in `data.ts` and
  `diagnose.ts` and fails if one names such a column, and checks every `s.from` in `data.ts` is pinned. `redact()`
  blanks key-shaped strings in what the model says (text is released at whitespace so a split key is still caught),
  and a channel's error loses its links before Assist repeats it.
- **The health check** (`lib/assist/diagnose.ts`): 15 checks — orders open > 4 h, tables occupied with no order /
  free with one, bills unpaid > 1 h, KOTs not ready > 25 min or ready > 15 min, stock below zero / at reorder, dishes
  at ₹0, guests past checkout, reserved arrivals never checked in, rooms occupied with no guest, housekeeping open
  > 1 day, OTA channels failing, unmatched online dishes, the queue (waiting > 2 h, called > 30 min), reservations
  2 h past, the last cash-up ±₹100, GSTIN/address missing (owner), staff on a temporary password (owner/manager).
  Each finding: level, area, what, **cause**, **fix**, a screen to open, and sometimes a safe action. A check runs
  only if the person holds its section; a check that errors is skipped.
- **Only the person's sections** (2026-10-21): the panel says which screen it is on, and a screen the person cannot
  open now gets no facts of its own (a waiter's panel claiming `/billing` was handed the till's figures); the house
  snapshot and the home screen's facts read only what `reach(modules)` allows.
- **The i18n scan skips `lib/assist/`** like `lib/ai.ts` and the API: its words are server text (the model answers
  in the person's language; documents are English, like printed bills).

## Data (0172, 2026-11-05)
| Route | Public? | What it is |
| --- | --- | --- |
| `api/admin/data` | master | Master control → Data: `backup`, `verify`, `download` (10-min signed link), `delete`, `contents`, `restore` (`apply` needs `confirm: "RESTORE"`), `export` (one property), `offsite-test`, `offsite-copy`, `supabase-test`, `cleanup`. No session → 401, not the master → 403. `maxDuration` 300. |
| `api/cron/backup` | scheduler | The nightly backup: `Authorization: Bearer $CRON_SECRET` (Vercel Cron) or `?key=`. CRON_SECRET unset → 503; wrong key → 401; no `SUPABASE_SERVICE_ROLE_KEY` → 503 (it says which). Then back up, check, keep the newest N, off-site copy if on, the clean-up rules switched on. |
- `/api/cron/` joined `PUBLIC_PREFIX` (the scheduler has no session; the route checks its key and fails closed). `apps/web/vercel.json` runs it at
  **20:30 UTC = 02:00 IST**, half an hour before the OTA sync. Hobby allows once a day.

- **0173:** `api/admin/data` adds `servers`, `server-add`, `server-set`, `server-delete` (`confirm: "REMOVE"`), `server-rotate`,
  `server-command` (`restore` needs `confirm: "RESTORE"`), `command`, `server-files`, `server-commands`, `active-server`, `records`,
  `activity`. New `api/admin/data/advisor` (POST {question}, master only, reads only; Claude when a key exists). The node itself
  talks to PostgREST directly (`rpc/data_node_call`), not to an app route.

## WhatsApp (0177, 2026-11-10)
| Route | Public? | What it is |
| --- | --- | --- |
| `api/cron/whatsapp` | scheduler | The sweeper, once a day (`apps/web/vercel.json` `0 1 * * *` — Vercel Hobby allows daily crons only). Messages do not wait for it: `queueWhatsApp` drains the outbox itself after the action's response (`after()` from next/server) whenever this server holds the service-role key, so a confirmation leaves within seconds; the cron picks up retries and a server without the key. `Authorization: Bearer $CRON_SECRET` or `?key=`. CRON_SECRET unset → 503; wrong → 401; no `SUPABASE_SERVICE_ROLE_KEY` → 503. Then `drainOutbox` (lib/whatsapp.ts): `wa_outbox_take(50)` → Graph `POST /v21.0/{phone_number_id}/messages` per row with the property's own token → `wa_outbox_done`. Answers `{taken, sent, failed, errors}`. |
| `api/webhooks/whatsapp` | yes | Meta's webhook, one URL per deployment. **GET** is the handshake: `hub.mode=subscribe` + `hub.verify_token` = `WHATSAPP_VERIFY_TOKEN` → `hub.challenge` as text; no env → 503; wrong → 403. **POST**: `X-Hub-Signature-256` = HMAC-SHA256 of the raw body with `WHATSAPP_APP_SECRET`, constant-time (`metaSignatureOk`, tested); no env → 503, bad → 401 and nothing read. The statuses (sent/delivered/read/failed by wamid) go to `wa_outbox_status` with the service role; inbound messages are acknowledged and dropped. Idempotent. |

- **Env names:** `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` (per deployment; never `NEXT_PUBLIC_`), plus the existing
  `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY`. The sending credentials themselves are each property's own (Settings → WhatsApp,
  `wa_settings`), never the server's. Both prefixes were already in `PUBLIC_PREFIX` (`/api/webhooks/`, `/api/cron/`).
- The sender never runs from a page. Only the owner's *Send me a test* calls `drainOutbox` directly, and only when this server
  holds the service-role key; otherwise it says the cloud's sender will.

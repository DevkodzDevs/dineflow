# Go-live runbook — November upgrades + own online ordering (0175–0184)

Written 2026-11-10, after migrations 0175–0184 were built, verified and committed (`928018b`). This is the order to take
them live. Everything new is **off by default**: applying the migrations changes nothing a guest sees until the code is
deployed, the keys are set, and the owner switches each feature on.

## 1. Order of operations

| # | Step | Command / where |
| --- | --- | --- |
| 1 | Apply the 9 migrations to live | `node scripts/migrate.mjs --live` (refuses the live DB without `--live`) |
| 2 | Deploy the committed code | `vercel --prod` from the working folder |
| 3 | Set the env vars on Vercel, then redeploy | Vercel → Settings → Environment Variables |
| 4 | Create the Meta WhatsApp templates | WhatsApp Manager, per property that uses WhatsApp |
| 5 | Flip the in-app switches | the Settings screens below, per property |

The 9 pending migrations, in order: `0175_addons`, `0177_whatsapp`, `0178_upi_qr`, `0179_queue_board`, `0180_joined_tables`,
`0181_online_prepay`, `0182_whatsapp_order_updates`, `0183_storefront_coupon`, `0184_storefront_loyalty`. Each file runs
atomically — a failure rolls that file back and stops, and `migrate.mjs` records only what succeeded.

## 2. Env vars (Vercel) and what each unlocks

| Var | Unlocks | Notes |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Online **prepay** — issue the UPI QR, webhook settles the held order | Also powers forgot-password, card links, OTA sync, rate limits |
| `NEXT_PUBLIC_CLOUD_URL` | Correct public links (the `/track/<token>` link in the "out for delivery" message) | e.g. `https://dineflow.cloud` |
| `WHATSAPP_VERIFY_TOKEN` | The WhatsApp status webhook (delivered / read / failed) | Any phrase; Meta asks once when the webhook is added |
| `WHATSAPP_APP_SECRET` | Verifies every WhatsApp webhook delivery | Meta app → Settings → Basic → App secret |
| `CRON_SECRET` | The 5-min WhatsApp sender + nightly backup | |

Leave `RAZORPAY_API_BASE` unset in production (it is a test stand-in). These are **not** env vars — they are per-property,
set in the app: the Razorpay keys (Settings → Payments), the WhatsApp number + token (Settings → WhatsApp), the loyalty rate
(Settings).

## 3. Razorpay webhook

One webhook at `https://<your-site>/api/webhooks/razorpay`, subscribed to **both** events:

- `payment.captured` — card / UPI on a bill (existing)
- `qr_code.credited` — the dynamic UPI QR, used by **storefront prepay** (0181) and the counter's bill QR (0178)

The per-property webhook secret goes in Settings → Payments; one URL serves every property, each verified with its own secret.

## 4. Meta WhatsApp templates

None exist yet (0177 was not live). The app knows **11** templates; create each verbatim in WhatsApp Manager, in the chosen
language. The full list with Tamil and Hindi bodies is in-app at **Settings → WhatsApp → Template texts** (a Copy button on
each name and body), sourced from `apps/web/lib/whatsapp-templates.ts`.

The three for online orders (0182):

| Template name | Body (English) | The `{{n}}` |
| --- | --- | --- |
| `dineflow_order_accepted` | Hi {{1}}, {{2}} has accepted your order #{{3}}. It will be ready in about {{4}} minutes. We will message you when it is on its way. | name · property · order no · minutes |
| `dineflow_order_ready` | Hi {{1}}, your order #{{3}} at {{2}} is ready. {{4}} | name · property · order no · next step |
| `dineflow_order_out` | Hi {{1}}, your order #{{3}} from {{2}} is out for delivery with {{4}}. Track it here: {{5}} | name · property · order no · rider · track link |

The other eight: `dineflow_reservation`, `dineflow_booking`, `dineflow_bill`, `dineflow_day_close`, `dineflow_alert`,
`dineflow_shift_reminder`, `dineflow_table_ready`, `dineflow_test`.

## 5. In-app switches to flip (per property)

| Feature | Where | Needs first |
| --- | --- | --- |
| Online prepay | Settings → Storefront → "Ask guests to pay by UPI before the order is accepted" | A connected Razorpay gateway + `SUPABASE_SERVICE_ROLE_KEY` |
| WhatsApp order updates | Settings → WhatsApp → "Online order updates" | WhatsApp number + token + the 3 templates approved |
| Loyalty points | Settings → the loyalty programme on (rate, point value) | Nothing extra — earns on delivery / takeaway storefront orders |
| Coupon codes | Live once the code is deployed | Create coded offers (Settings → Storefront → Offers) |

## 6. Quick "is it on?" map

- **Prepay** works when: gateway connected + service-role key set + switch on. Without a gateway the order is never held.
- **WhatsApp order updates** work when: number / token set + templates approved + `on_order` on. Own ('website') channel only.
- **Loyalty earn** works when: the programme is switched on. Delivery / takeaway storefront orders only; redeeming stays at the
  counter (redeem-online is deferred — an anonymous page cannot be shown a phone's balance safely).
- **Coupon box + one-tap repeat** work as soon as the code is deployed; the coupon box needs coded offers to exist.

## 7. Still open (not fixed by this work)

- A **refund** when the counter rejects a *paid* prepaid order — manual from the Razorpay dashboard for now.
- **Redeem loyalty points online** — deferred, needs a privacy decision.
- The pre-existing launch blockers in `CLAUDE.md` (the seven legal facts in `lib/company.ts`, the live master password still
  `0011`, staging project, etc.) are unchanged.

See `docs/sections/data-and-rls.md` (migration entries 0175–0184), `docs/sections/online-and-channels.md`,
`docs/sections/guest-facing.md` and `docs/sections/settings.md` for the detail behind each.

# SQL test harnesses

Run every migration against a real PostgreSQL engine (PGlite — in-process, nothing to install) and
then exercise the product end to end. This is how the fifteen SQL bugs in v15.1 were found, and how
replay safety is proven.

```sh
npm i @electric-sql/pglite              # once, anywhere on the path
node scripts/sqltest/run.mjs            # every migration applies, in order
node scripts/sqltest/flow.mjs           # every RPC, end to end, on the sample estate
node scripts/sqltest/verify.mjs         # tenancy, stock, GST, chain tamper-detection, k-anonymity
node scripts/sqltest/pulse.mjs          # Pulse: dwell, stages, quotes, the guest queue
node scripts/sqltest/v15.mjs            # Leak finder and Shift close
node scripts/sqltest/access.mjs         # the master sets owner access; an owner cannot
node scripts/sqltest/staff.mjs          # the owner sets employee access; eleven guard rails
node scripts/sqltest/offline.mjs        # replay safety: a resent job can never double an order or a payment
```

`shim.sql` stands in for the parts of Supabase that are not Postgres (`auth.users`, `auth.uid()`,
roles, the realtime publication) and for pgcrypto. Its `digest()` is a deterministic md5 — enough to
prove the chain logic, not a substitute for the real SHA-256 in production.

# Link check

`python3 scripts/check-links.py` (run from the repo root) lists every `href`, `redirect`, `router.push`
and `fetch("/api/…")` in both apps and checks each against the routes that actually exist. It also
lists any `.rpc("name")` or `.from("table")` the app uses that the migrations do not define.
Four targets are reported as unresolved by the regex but are fine: `/api/ota/sync${id…}` (nested
template), `/(tabs)/${next}` (the deck swipe, names come from the tab list), and `/order/${id}`
(the phone's order screen, `app/order/[id].tsx`).

-- 0139 — Who took each payment (2026-10-24, the owner: "show the name of who is billing — register it from the login").
--
-- bills.created_by already names who generated a bill (generate_bill sets it). A payment named no one: settle_bill inserts
-- method, amount and ref only. payments.received_by now defaults to the signed-in person (auth.uid() — the caller's own
-- id inside settle_bill and the offline sync alike), so every payment from here on says who took it. Rows before this
-- have no name. Billing shows both: "Billed by" and "Paid to".
-- Additive: one column with a default. RLS on payments is unchanged (the property's staff read their property's rows).

alter table public.payments add column if not exists received_by uuid default auth.uid();
comment on column public.payments.received_by is 'Who took this payment — the signed-in person at the time (0139).';

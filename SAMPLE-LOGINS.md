# DineFlow — sample logins

Load them from **Master control → Sample estate → Load the sample estate** (about a minute).
Then sign in at `/login` as any of these, or press **Open** on their row in Master control to walk in as Master.

## Master (built in, no sign-up needed)

| | |
|---|---|
| **Email** | `master@dineflow.in` |
| **Password** | `DineFlow@Master2026` |

Sees every property. Has none of its own — that is why Master control is empty until you create one.
**Change this password before going live:** Master control → Change master password.

## The six sample properties

Every owner uses the same password: **`Dine@1234`**

| Property | Type | Owner login | Where |
|---|---|---|---|
| Annapoorna Mess | Restaurant | `owner@annapoorna.in` | Nagercoil |
| Marina Grill House | Restaurant | `owner@marina.in` | Kanyakumari |
| Hotel Tamizh Residency | Hotel | `owner@tamizh.in` | Nagercoil |
| Pearl City Hotel | Hotel | `owner@pearl.in` | Kanyakumari |
| Kanyakumari Bay Resort | Resort | `owner@bayresort.in` | Kanyakumari |
| Ooty Pine Hill Resort | Resort | `owner@pinehill.in` | Kanyakumari |

## What each one already contains

- 17 dishes across 5 categories, with recipes so stock moves when they sell
- 13 pantry items (4 with real barcodes you can scan off a packet), restocked weekly for two months **at slightly different prices per property** — that is what the Neighbours price index compares
- 12 tables, **two live orders sitting in the kitchen**, and 60 days of completed orders and paid bills
- One waiting **online order** on a demo Swiggy channel, with a line that needs mapping so you can try that flow
- 5 labourers with a month of attendance and a fortnight payment
- A browser printer, ready to test print
- **Hotels and resorts also get:** 20 rooms on 2 floors, 3 room types with 60 days of rates, past stays, one guest in house, one arriving today, one room being cleaned, one under maintenance
- **Resorts also get:** 5 spa and activity facilities
- Sealed months, so **Proof of business** has a verified record you can share

## Why six, and why one district

The Neighbours network refuses to show any pooled figure until **at least five properties** contribute — otherwise you could work out one neighbour's costs from the numbers. Six properties in one district is exactly enough, so **Neighbours → What things cost** shows a real median and tells each property what it is overpaying. With one property it correctly says *not enough neighbours yet*.

Two months of history is also what the **Tomorrow brief** needs before it predicts properly rather than saying it is still learning.

## Good ways to use these

- **See the same feature in three shapes.** Open Annapoorna Mess (restaurant), Hotel Tamizh Residency (hotel) and Kanyakumari Bay Resort (resort) in turn. The sidebar changes; the dining screens stay identical.
- **Test Neighbours properly.** Sign in as Annapoorna Mess → Neighbours → What things cost. Then sign in as Marina Grill House and compare — each sees itself against the other five.
- **Test the trial lock.** Master control → Manage on any row → Suspend. Sign in as that owner: locked to the membership page. Issue a key, redeem it at `/membership`, unlocked.
- **Test the phone app.** Sign in as any owner on the web, Staff → Invite staff → waiter code, then join from the phone.

## Before you go live

These are test accounts with a published password. Delete them, or at minimum change every password, before a single real customer touches the system.

```sql
-- remove all six sample properties and their owners
delete from auth.users where email in (
  'owner@annapoorna.in','owner@marina.in','owner@tamizh.in',
  'owner@pearl.in','owner@bayresort.in','owner@pinehill.in');
delete from restaurants where name in (
  'Annapoorna Mess','Marina Grill House','Hotel Tamizh Residency',
  'Pearl City Hotel','Kanyakumari Bay Resort','Ooty Pine Hill Resort');
```

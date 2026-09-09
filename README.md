# DineFlow
Works offline · prints to thermal printers · takes Swiggy/Zomato orders · syncs rooms to OTAs.
Restaurants, hotels & resorts — pantry, kitchen, orders, billing, rooms, front desk, housekeeping, facilities. One control room per property, one Master control over all clients, 7-day trial → membership. Web + Android/iOS.

**Never done this before? → [BEGINNER-GUIDE.md](./BEGINNER-GUIDE.md)** (every click, what you should see, what to do if not).
**In a hurry? → [QUICK-START.md](./QUICK-START.md)** — install Node, double-click `Start-DineFlow` (Windows `.bat` / Mac `.command` / Linux `start.sh`), press 1.
Details: [START-GUIDE.md](./START-GUIDE.md) (local → live, costs) · [SETUP-GUIDE.md](./SETUP-GUIDE.md) (reference) · mockups in `design/`

```bash
node launcher.mjs          # menu: 1 local · 2 mobile · 3 Vercel · 4 Docker · 5 app builds
node launcher.mjs local    # or straight to local
node launcher.mjs live     # or straight to Vercel deploy
```
Stack: Next.js 15 · Tailwind v4 · framer-motion · Expo 52 · Reanimated · Supabase (Postgres, Auth, Realtime) · Drizzle · pnpm + turbo.

**Connecting things? `CONNECTIONS-GUIDE.md` covers every database and outside connection, key by key.**

**The complete documentation is `DineFlow-Documentation.docx` (and `.pdf`): 69 pages — an overview, both applications screen by screen, seven diagrams, highlighted panels, every connection, the full installation procedure (section 8), operations, and about Devkodz (section 11).**

**New here? Read `STARTUP-GUIDE.md` — from an empty computer to a running property, thirty parts, every command checked.**

## What's new since v12

- **Flip** design system (v13): split-flap numerals on a graphite wall, every screen a card in a deck, dark and light with *follow device*.
- **Pulse** (v14): honest wait times learned from your own service, and a walk-in queue guests join by QR and watch from their phone.
- **Leak finder** and **Shift close** (v15): recipe-theoretical stock against the shelf, in rupees; and the till reconciled in sixty seconds with a WhatsApp-ready summary.
- **Assist** (v16): one assistant on every screen that reads that screen's numbers, answers in plain words, and never writes.
- **Offline everywhere** (v17): a whole shift works with no line — orders, kitchen, queue, stock, housekeeping — stored on the device and sent when the connection returns, exactly once.
- Every migration (0001–0017) is executed against a real Postgres in `scripts/sqltest/` before it ships.

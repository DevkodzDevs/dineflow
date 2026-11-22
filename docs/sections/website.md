# A property's own website

**Routes** `/site/[slug]` (public, no sign-in) · `/site/[slug]/opengraph-image` (the share card) · `/site/sitemap.xml` ·
the Website card on `/settings` (General)
**Files** `app/site/layout.tsx` · `app/site/site.css` · `app/site/sitemap.ts` · in `app/site/[slug]/`: `page.tsx` · `data.ts`
(the one read) · `hit/route.ts` (the visitor count) · `meta.ts` (the head) · `card.tsx` + `opengraph-image.tsx` (the share card) · `SiteView.tsx` · `SiteFx.tsx` ·
`SiteShow.tsx` · `SiteDishBox.tsx` · `SiteMap.tsx` · `SiteExtras.tsx` · `SiteMore.tsx` (room sheet, Instagram, 3D) ·
`SiteWords.tsx` (the client pieces' words) — and `lib/siteWords.ts` (Tamil / Hindi) · `lib/siteDomain.ts` + `middleware.ts` (a client's own domain) ·
`app/(app)/settings/WebsiteMedia.tsx` (photos, film, 3D file) — `lib/website.ts` · `app/(app)/settings/WebsiteCard.tsx` ·
`app/(app)/settings/actions.ts` (`saveWebsite`) · `packages/shared/src/website.ts` · `app/robots.ts`
**Reads** `website_setup()` (owner, manager) · `website_public(slug)` (anon) · `website_index()` (anon, the sitemap) ·
`website_stats(days)` (owner, manager) · `website_by_domain(host)` (anon, the middleware) · tables `website_plans`,
`website_subscriptions` (Master control)
**Writes** `website_save(sections, headline, about, published, email, links, options, domain)` — table `websites` (0185) ·
`website_hit(slug, kind)` (anon) — table `website_hits` (0185) · `website_media_save(photos, rooms)` (owner, manager) —
`restaurants.photos`, `room_types.photos` · storage bucket `site` (0185) · `admin_set_website_plan(…)`, `master_set_website_plan(rid, plan)` (master)

## What it is

Built 2026-11-14 (the owner: "in Settings a Create website button; a checklist opens for that client's restaurant, hotel or
resort; from what is ticked, the website is made"). Every property can have one public website. It has no content of its own
beyond a headline and an About text: the menu, room types, facilities, offers, photos and hours are the property's own, so a
price changed in Menu is the price on the website.

## How it works

- **The checklist** (`websiteChecklist`, shared): every section this kind of property can have — `WEBSITE_SECTIONS`, the
  same lists as `_website_sections()` in 0185 (`lib/website.test.ts` reads the SQL and checks) — each **ready** (something to
  show; ticked by default), **empty** (no dishes, no photos — with the screen to add them) or **off** (needs *Listed
  publicly*, Delivery / Takeaway, table booking or the booking page — with the screen that has the switch). A row that is not
  ready cannot be ticked. Two groups: *On the page* (blocks) and *Buttons for guests* (order, book a table, queue, book a room).
- **Create** → `saveWebsite` → `website_save`: the owner only (a master acting as the property counts as its owner), the
  `website` add-on must be on, the sections must be ones this kind of property can have; they are stored in the page's own
  order. A property with no `booking_slug` gets one from its name. One row per property; saving again changes it.
  *Show to the public* off (editing only) hides the site without losing it.
- **The page** is a server component, whole without JavaScript (links and `<details>`). `page.tsx` fetches and decides,
  `SiteView.tsx` draws, `SiteFx.tsx` is the one small client piece (see *The look*). `website_public` answers nothing unless the site is published, the
  trial or membership has not ended (0100's rule) and the add-on is on; it fills only the ticked sections and never sends an
  id. A ticked section with nothing in it is left out (`siteBlocks`), not shown empty.
- **Ordering and booking are not rebuilt.** The buttons open `/dine/<slug>?tab=order|book`, `/queue/<slug>` and
  `/book/<slug>`; `can.*` in the answer says which of those will answer today, and a button that would 404 is not drawn.
- **Speed.** One database call per property per 30 s per server (`lib/keepFor.ts`, the menu page's rule: a hard age limit,
  never the old answer first); a place that is not there is not kept; a malformed slug never reaches the database; no
  session is read (`/site/` is in `SESSION_FREE` and `PUBLIC_PREFIX`). An edit shows within half a minute — the dialog says so.
- **Search.** See *Seventh pass* below — the head, the search data, the share card and the sitemap write themselves from
  the property's kind, cuisine and town. A demo is `noindex` and is not in the sitemap. `robots.ts` allows `/site/`.
- **The add-on** `website` (features.ts, on by default; `default_features()` re-created in 0185): Master control → Access →
  Add-ons switches it per property, Keys → Plans & prices per plan. Off, the card is not drawn and the public page is a 404.

## The look — "night service" (2026-11-16)

The first page was a list of white cards; the owner: "this is a dummy — ultra modern, the latest animation, realistic food
photos, stylish, right on every screen". It was redrawn.

- **Its own palette, in `site.css`** (loaded by the site layout only — no other page pays for it): a warm near-black room,
  ivory text, one accent per kind (`.site[data-site]`: a restaurant's ember, a hotel's champagne, a resort's lagoon). `.site`
  re-declares the colour tokens, so it looks the same whatever theme the visitor's browser carries; the hexes there are a
  theme definition, everything else uses the tokens. It uses its own classes (`site-btn`, `site-tile`), **not** `.card` /
  `.btn` / `.material` — those have `[data-theme="paper"]` overrides that would leak in.
- **The first screen**: the cover (the property's first photo, else the drawn scene) a full screen tall, the name very large
  and rising word by word, and — for a restaurant, or any place with no photo of its own — up to three **real dish photos
  cut round** that drift on slow orbits (one on a phone and a tablet, three from 1024). A floating glass menu marks the
  section being read; a phone keeps the main action in a bottom bar.
- **Signature plates** (`siteSignature`): up to eight dishes that have a photo, a category at a time, in a rail you swipe;
  a card tips toward the pointer. Shown from three. **Library photos are now shown, with their credit**: on the card
  (*Illustrative · author*) and in *photo credits* under the menu for the small squares.
- **The menu** flows into columns (CSS `columns`), so a short category never leaves a hole beside a long one; rooms take
  the property's other photos in turn (a room type has no photo of its own) or a drawn panel; facilities and the gallery
  are flex rows that always fill, whatever the count; offers are tickets; the page ends on a band and the name in outline.
- **Motion, and what it costs.** First-screen entrances are CSS keyframes with a `backwards` fill — the server-drawn page
  is never blank (design-system.md, the `opacity:0` lesson). Further down, `SiteFx` puts `rv-wait` on what is still below
  the screen and one IntersectionObserver takes it off; without JavaScript or with reduced motion nothing is ever hidden.
  Parallax and the progress line are scroll-driven CSS (`animation-timeline`) behind `@supports` — **no scroll listener**;
  a browser without it gets a still page. The pointer light is one `pointermove` listener, one frame at a time, mouse only.
  Everything animates transform or opacity.
- **A reveal uses `translate` / `scale`, a hover uses `transform`** — they are separate properties on purpose, so a card can
  do both. A card off to the side of a rail is never made to wait (it would not "arrive" by scrolling down).
- `h1, h2, h3` in globals.css are unlayered, so a Tailwind `leading-*` / `text-*` utility on a heading loses to them; the
  site's headings are sized in `site.css`.

### Second pass, the same day — "more"

The owner: "too good, but more — ultra modern, realistic animation, unique techniques, viral banners". Added, all in
`site.css` / `SiteView` / `SiteFx`:

- **A curtain**: the name on a black screen, then it lifts (1.25 s, CSS). It is drawn **only inside
  `prefers-reduced-motion: no-preference`** — globals.css stops every animation under reduced motion, and a curtain that
  never lifts would hide the page. `--lead` (900 ms) holds the first screen's entrances back until it has gone.
- **The turning badge** (words on a circle, `Ring`, `textLength` closes the ring) — a link to the main action; **steam** off
  the big plate (three blurred wisps; the blur is fixed, only transform and opacity move); the plates **shift with depth**
  under a mouse (`--px` / `--py` on `.site-float`, `translate`, so the bob on `transform` goes on); a **cursor ring** (made by
  `SiteFx`, the real cursor stays); film grain from 1024.
- **The story is lit as it is read** and a heading's outlined word takes its ink — `background-size` / `color` on a
  `view()` timeline. Without the feature the text is simply there.
- **Signature plates are pinned** on a wide screen with a mouse (`.site-pin[data-pin]`, five plates or more): the section
  is `100vh + n × 15vw` tall, its inside sticks, and a view timeline carries the rail across. A touch screen, a narrow
  one, reduced motion, or a browser without view timelines keeps the swipe rail. `.site` clips with `overflow-x: clip`,
  **not `hidden`** — `hidden` would make it a scroll container and the pin would not stick.
- **The offer of the day is a banner** (`site-promo`: the first offer, a sheen through its title, a turning sticker, a
  slowly turning dish photo); the other offers stay tickets. **Crossed ribbons** of running words before the closing band.
- **Whole numbers count up** once (`Count`, `[data-count]`): the server writes the finished figure and `SiteFx` puts that
  exact text back at the end, so the format is never the script's.
- **Not done, on purpose:** real 3D models (three.js and model files would add hundreds of kB and a GPU context to a page
  whose brief is "no lag"); the depth here is CSS.

### Third pass, the same day — the showcase

The owner sent five reference videos (a biryani site, a pie site, a tasting-menu turntable, a burger builder, an AI clip)
and called a first 3D ring of plates "old". What the references share: **one dish at a time on a full screen, its word
very large in a serif, a round plate that turns to change, and a new stage colour per dish.** The ring was removed and
`SiteShow.tsx` (client) was built on that:

- **The turntable.** Plates sit on a disc of radius `--R`; the disc's one `rotate` (`--at − --turn × --step`) brings the
  next plate to the front, and each plate's transform turns it back by as much, so a photo is always upright. `--turn`
  **counts on past n** (state in `SiteShow`), so going from the last dish to the first never spins the long way back.
  The dish in front is full size (`--P`), the rest 46 %; the neighbours show at the upper corners.
- **The word** (`siteShowWord`, website.ts, tested): the last word of the name when it is a real word ("Biryani"), else
  the longest ("Chicken 65" → "Chicken"). Its size is `98vw / (letters × .52)`, so any word fits the screen. Behind the
  plate from 768; **on a phone the plate is as wide as a short word, so there it stands in front across the plate's lower edge.**
- **The colour**: `data-tone` 0–7 in turn — a theme block in `site.css` (`oklch`), like the palette. The button takes the tone as its ink.
- **The serif** is DM Serif Display (SIL Open Font Licence, Latin, two woff2 files ≈ 49 kB in `public/fonts`), loaded by
  `app/site/layout.tsx` alone as `--font-site-serif`. A heading's second word (`.site-h2 em`) is now its italic. A Tamil
  name falls back to the system serif.
- **It moves on by itself** every 5.2 s once 35 % of it is on screen, and stops under a pointer or with focus inside; also
  the small plates (48px buttons, each named for its dish), the arrows (from 640), a swipe (`touch-action: pan-y`), and
  the arrow keys. With reduced motion it never moves by itself. The server draws it whole with the first dish.
- Six drawn garnish pieces swirl on with each change (one `rotate`). **The photos are the menu's own rectangles cut
  round, not cut-outs** — the references use studio cut-outs made for one site; a dish photographed from the side looks
  less like theirs than one shot from above.
- **Where:** a restaurant, straight after the running band; a hotel or resort, just before its menu. From three plates.
  A library photo's credit is on the card (`data-photo-credit`), as on the rail.
- Kept from the first try at depth: the first screen's plate **tips toward the mouse** (fine pointers from 1024; its
  highlight repaints one plate per frame — the one place "transform and opacity only" is bent), and **room cards and
  gallery photos stand up** as they come on screen (`siteUnfold`, the `rotate` property on a `view()` timeline). **A card
  below the screen is drawn tipped back, so its buttons measure short by `getBoundingClientRect`** — a probe checking
  44px must use `offsetHeight`. That cost six false failures once.
- **Under `next dev` a long probe run once lost a page to a reload and once logged a hydration error; neither came back in
  four single runs nor in a production build (`next build` + `next start`, 228 of 228).** Run the long suite on a build.

### Fourth pass, the same day — glass, the story, the fan

Three more reference videos (an AI clip of dishes rising from a menu book, a pizza site told as a scroll story, a bakery
with glass cards on leader lines). Taken from them:

- **The showcase's words sit on a glass card** (`.site-show-card`, `backdrop-filter`). From 1100 it floats beside the
  plate, tipped a little, tied to a pulsing point on the dish by a **lead** (`.site-show-lead`, one rotated line); there
  `.site-show-copy` is `position: static` **on purpose**, so the card is placed from the stage and not from the row
  below. Narrower, the card is in the flow under the plate and there is no lead. The count (`01 / 08`) moved out of the
  card to the bottom left. Steam rises from the dish in front.
- **The story said large** (`.site-saga`, after About): two to four two-colour lines the page can vouch for — the first
  cuisine, the hours, the number of dishes, the town; for a hotel or resort the room types and lowest rate, check-in, the
  facilities, the town — over the place's second photo (or a dish, or nothing). With view timelines the section is
  `100vh + n × 62vh` tall, its inside sticks, and each line has its own slice of the scroll (`animation-range` from
  `--i` / `--n`): one line on screen at a time. Without the feature, or with reduced motion, the lines stand in a column.
- **The pin moved here from the signature rail.** Two pinned stretches on one page was too much scrolling, and the
  showcase already leads with those dishes; the rail is a swipe rail on every screen again (`.site-pin[data-pin]` is gone).
- **Reviews stand in a fan round the score** (`.site-quotes[data-fan]`): three to six reviews, from 1100, **only where
  there is a mouse** — the cards overlap and it is the hover that lifts one clear, so a touch screen keeps the plain
  list. The big score under the fan replaces the one in the heading there (`:has()`); an owner's reply is not shown on a
  fanned card (it is in the list everywhere else).
- **Not taken:** the clips themselves (dishes flying out of a menu book, a chef tossing dough) are generated video made
  for one business — the page has no such footage to play. A hero video would need an upload in Settings.

### Fifth pass, the same day — daylight, callouts, the closing photo

Seven more reference videos (a chai café told as a story, a pasta site, a coffee roaster, a tableware shop, three AI
clips). What the built sites share is **a cream page set in a serif, with dark bands between**. Taken from them:

- **Daylight sheets** (`.site-day` on About, the menu and the reviews): a rounded sheet of warm paper laid on the dark
  room, standing in from both edges. It is a third theme block in `site.css` — it **re-declares the colour tokens**
  (paper, ink, a deepened accent per kind), so everything inside keeps using tokens. Headings on a sheet are the serif in
  sentence case with the second word in accent italic. **Rules that name white directly** (`.site-tile`, `.site-chip`,
  `.site-btn-ghost`, the category pills, a dish row's line) have a `.site-day` twin — a new component that paints with
  `rgb(255 255 255 / …)` needs one too, or it vanishes on paper.
- **A signature card on a sheet keeps the night's accent** (`--site-night`): it is a photo with dark under its words, and
  the paper accent was dim there. Probe: the card's price must stay bright.
- **The rail on a sheet** pads by `max(pad, edge − sheet margin)` so its first card stays on the heading's edge.
- **Callouts** (`.site-show-tags`, from 1100): two glass pills right of the showcase plate on short leads — vegetarian or
  not, and the price — balancing the card on the left. They are inside the `aria-hidden` table; the same facts are read
  from the price row below.
- **The closing band carries a photo** (`.site-close-bg`: the place's last photo, else the cover photo, else the third
  signature dish) under a shade; with view timelines it opens through an **iris** (`clip-path: circle()` on the band's own
  named timeline — the band is `overflow: hidden`, so an anonymous `view()` inside it would find the wrong scroller).
  This is a second place where something other than transform or opacity animates.
- **Not taken:** scroll-driven food film (a pour, pasta lifting off a fork, a samosa coming apart) is footage generated
  for one business, played frame by frame; ingredient labels need ingredients, which the menu does not hold.

### Sixth pass, the same day — a dish opens; what is off screen rests

The owner: "too good — now more unique, the latest techniques, and very smooth". Two things, both measured:

- **A dish opens** (`SiteDishBox.tsx`, client, +2 kB): a menu row is now `li > button.site-dish`, a signature card is
  `role="button"`; both carry the dish as `data-*` (`dishData` — the words the page already shows, so nothing but text
  crosses from the server). One click listener on the document opens a native modal `<dialog>` drawn as a paper sheet
  (`.site-day`): centred from 768, a bottom sheet on a phone. **With view transitions the thumbnail itself grows into
  the large photo and shrinks back** — `view-transition-name: site-dish` is put on the thumbnail for the old picture
  and belongs to the sheet's `img` in the new one; it is taken off the thumbnail afterwards (a name left behind would
  make the next transition fail: two elements, one name). Elsewhere and with reduced motion the sheet fades up
  (`@starting-style`, `transition-behavior: allow-discrete`); `[data-vt]` turns that fade off where the photo flies.
  **Focus is handed back to the row by name** — a click does not focus a button in Safari, so `dialog.close()` alone
  returned it to nothing. Inside a `button` everything is a `span` (a `p` or `div` there is invalid HTML).
- **What is off screen rests** (`SiteFx`, one more IntersectionObserver, 25 % margin): header, running band, showcase,
  each child of `main` and the footer get `data-away` while outside, and `site.css` pauses every animation inside.
  The page had ~85 animations running at any moment; now ~17. Scrolled end to end at 1400 px/s with the processor
  slowed 4× (headless Chrome, `perf.mjs`, the middle of three runs): **frames later than 25 ms — a phone 25.7 % → 3 %,
  1440 wide 57.8 % → 14.5 %**; LCP ≈ 0.8 s and CLS 0 before and after. The resort page swung between 4 % and 17 % in
  two runs — the figure is a direction, not a promise, and it is not a real phone.
- `text-wrap: balance` on headings, `pretty` on running text; a `speculationrules` script fetches the main action's
  page as the pointer settles on it (`prefetch`, `moderate` — a GET of a public page; never `prerender`).
- **Tried in thought and left:** `content-visibility: auto` on the sections (it would fight the pinned story's height
  and the anchors), animated `@property` gradients (a repaint a frame — the opposite of the brief).

### Seventh pass, 2026-11-16 — found and shared; the client's own mark; where it is

The owner: "the website should follow the client's kind — restaurant, hotel or resort; whatever that kind needs for SEO,
social media and digital marketing should fill itself in when the website is made; take the client's own logo and the
contact details from Settings; the map from the address, in an ultra-modern location section with an animation".

- **Nothing here is typed by the owner except links.** The head, the search data, the questions, the share card and the
  sitemap entry are written on every request from what the property keeps, so they are right the moment the website is
  created and stay right when a price or the hours change. Nothing claims what the property has not said — no "best", no
  award, no distance.
- **The head** (`meta.ts`, `siteTitle` / `siteDescription` / `siteKeywords`): the title is the name and what guests type
  next — *Anjappar — Chettinad restaurant in Madurai*, *Tan — Resort in Madurai* — and **when the name already says the
  kind the kind is not said twice** (*Hotel Temple View — Rooms & rates in Madurai*). The description is the owner's own
  words; a short line (a tagline) is followed by the facts — what, where, when, what you can do. Open Graph, a large
  Twitter card, `en_IN`, `geo.position` / `ICBM` from the pin, and **the tab icon is the property's logo**.
- **The search data is one graph** (`siteGraph`): the place (`websiteLd` — now with `geo`, `hasMap`, `postalCode`, `email`,
  `sameAs`, order / reserve actions; a restaurant's menu as `Menu` → sections → items with INR prices, at most 8 × 12; a
  hotel's or resort's rooms as `HotelRoom` + offers, facilities as amenities), a `WebSite`, the `WebPage`, and a `FAQPage`
  **only when the questions are on the page** (three or more).
- **Questions, answered** (`siteFaq`, `#faq`, a daylight sheet after the reviews): what guests search for this kind of
  place, answered from its records — hours, where, cuisine, vegetarian dishes (counted, never assumed), the cost for two,
  ordering, table booking; for a stay: check-in, the lowest rate, how to book, things to do. Native `<details>`, the first
  open; where the browser can size to `auto` (`interpolate-size`) an answer opens to its height. It is not a checklist
  section: it appears by itself when there are three answers to give.
- **The share card** (`card.tsx`, served by `opengraph-image.tsx`): 1200×630 — the logo, the kind and town, the name very
  large, one line, the main action and two facts. **It leaves as a JPEG** (sharp; a PNG of a photo was 927 kB and chat
  apps skip a preview that heavy — now ≈110 kB) **kept for an hour**, not ImageResponse's own year. **A photo is fetched
  only from our own storage or Wikimedia** (the dish library): a typed photo address can point anywhere, and a server that
  fetches any address it is given can be aimed at what a browser cannot reach — any other host means a card with no
  photo. The card's font is Latin: a name in Tamil is not drawn as boxes, the kind and the town carry the card.
- **The sitemap** (`app/site/sitemap.ts` → `/site/sitemap.xml`, read from `website_index()` an hour at a time, named in
  `robots.ts`): published, not a demo, membership alive, the add-on on. (It was an empty list on the live site until 0185 was
  applied there on 2026-11-22 — see *On the real database* at the end.)
- **The client's own mark** (`Mark`): the logo — else the initial on the accent — on the curtain, over the first screen's
  kicker (`.site-crest`), in the map's pin, on the contact card and in the foot. It was only in the floating menu.
- **Where it is** (`#contact` is now this section; the closing band follows it and keeps the invitation and the
  buttons): a **drawn map** (`MapArt`, an SVG of streets with the place at their crossing, the way in as a route, and by
  kind a river, a park or the sea) in a window, with the **pin standing in it wearing the logo**, radar rings, a compass
  and the town · pincode. With view timelines **the ground arrives tipped back and far and lands flat as the section comes
  up, then the pin drops** (`siteLand`, `sitePinDrop` on the window's own named timeline — it is `overflow: hidden`). The
  crossing is the middle of the picture and the plane turns about its middle, so the pin is on its square at every size.
  It says *Drawn, not to scale*.
- **The live map is Google's, in a frame, and only on a tap** (`SiteMap.tsx`, client): a frame from another company is
  a megabyte of script and a request to them, so the scroll never loads it. Without JavaScript the same button is a link
  to the place on Google Maps. The frame is toned to the room with a CSS filter; **while it is open our buttons move to the
  top so Google's own line at the foot stays readable.** *Directions* goes to the pin when there is one
  (`restaurants.lat/lng`, **else the point set in Settings → Attendance**), else to the name and address.
  **No address and no pin → no map at all**; the card stands alone.
- **The card beside it**: the address as a door line in the serif and the rest under it (`siteAddress`; the pincode is
  added once when the address lacks it), then rows — Directions, Call, WhatsApp (a chat with a first line written), Email,
  hours or check-in — Copy address, Share (the phone's share sheet, else it copies the link) and the social links. Copy and
  Share are `.site-js`: a `<noscript>` rule hides them, so a page without JavaScript offers nothing that does nothing.
- **The foot** signs with the mark, the address, Directions and the same links; **a place that sells food shows its FSSAI
  licence number** when the property has entered one (Tax & GST).
- **The fetch-ahead rule fetches our own pages only** (`href_matches: "/*"`): the Directions button wears the main
  button's class, and on a phone the browser had started fetching Google's directions page before any tap.
- **Links** (`websites.links`, `websites.email`): Instagram, Facebook, YouTube, the Google Maps link, a WhatsApp number, a
  public email — typed in the dialog (*Contact & social*). `websiteLinks` (shared) tidies them and says why one is refused;
  `_website_links()` in 0185 is the wall (each key must be an https address on its own service; a non-object is nothing).
  **The owner's sign-in email is never used.**
- **Reach** — the card's *Search & social* row, its sheet and the ready posts: see [settings.md](settings.md).
- **Not done, and why:** an embedded map without a tap (speed and privacy, above); posting to Instagram or Facebook for the
  owner (needs Meta's review and the owner's account); Google Business Profile itself (the owner pastes the website's
  address there — Storefront → *Bookings from Google* has the steps); analytics; a real-phone speed measurement.

### Eighth pass, 2026-11-16 — extras the client switches on

The owner, shown twelve possible upgrades: "build all twelve, but as choices — each client switches on what it wants;
and it must stay fast". **The rule this sets: an upgrade to the website is an extra, off by default, chosen per property.**

- **Where a choice lives:** `websites.options` (jsonb). `_website_options()` in 0185 keeps any short key whose value is a
  yes/no, a number or one short plain line (no markup, quotes or control characters; forty at most) — **so a new extra
  needs no migration**: add its key to `WebsiteOptions` / `WEBSITE_EXTRAS` (shared), tidy it in `websiteOptions`, draw it.
  What a value *means* is checked where it is used: an address in an option is matched against its hosts again on the
  page (`reviewUrl`), never trusted because it was saved.
- **An extra that is off is not drawn, on the server or the client, and makes no request.** `shoot10.mjs` loads a page
  with nothing chosen, waits nine seconds, taps a button and requires zero requests and none of the five in the DOM.
- **Built so far (four of the twelve — five switches):**
  - **Google review button** (`review_url`): *Review us on Google* under the reviews (in the closing band when the page
    has no reviews section). Google's own review and maps addresses only (`isReviewUrl`). Its QR is in Settings → Reach.
    **Its marker is `data-site-rate`** — `data-site-review` is a review card, and using it for the button made every
    "is there a review button" check answer yes.
  - **Enquiry form** (`enquiry`, needs the WhatsApp number; `SiteExtras.tsx` → `SiteAsk`): a sheet with a name, a date or
    check-in, people or guests and a line of text; **Send opens WhatsApp to the property's number with the message
    written** — nothing is stored and nothing reaches DineFlow. Inputs are 16px (a phone does not zoom). `.site-js`.
  - **Announcement** (`banner_text`, `banner_until`): one line in a glass pill under the floating menu, over the first
    screen; gone after its last day in India (`siteBanner`, decided on the server).
  - **Offer pop-up** (`offer_popup`; `SiteOffer`): the first running offer in a corner, 6.5 s in, once per visit
    (`sessionStorage`), above the phone's bar, with a 44px close. No offer running → nothing.
  - **Visitor count** (`stats`): `SiteFx` sends one `view` per open and a kind per tap on a thing to do (order, reserve,
    queue, book, call, whatsapp, directions, map, share, enquiry, review, dish) to `POST /site/<slug>/hit`, which calls
    `website_hit`. **A tally by day and kind — no cookie, no address, no device, no third party.** The route always
    answers 204 with nothing. It is a guide, not an audit: anyone can open a page many times (a day's tally of one kind
    stops at 20,000), and a visitor without JavaScript is not counted. The owner reads it on the Settings card
    (`website_stats(30)`). The kinds are one list (`WEBSITE_HIT_KINDS`) and a unit test holds the SQL to it.
- **Still to build, each as a switch** (the owner asked for all; none is started): gallery photo upload · a first-screen
  video · the page in Tamil / Hindi · the client's own domain · room photos and a room sheet · Instagram posts on a tap ·
  other looks (templates) · a 3D dish viewer. Uploads need a storage bucket; the domain needs it added on Vercel.

### Ninth pass, 2026-11-17 — the other eight: files, rooms, looks, languages, a film, Instagram, 3D, a domain

The owner: "complete all twelve". The eight that were left, each a choice (`websites.options`, or a file the owner adds):

- **The website's own files** — storage bucket **`site`** (0185: public, 12 MB, images + `video/mp4` / `webm` +
  `model/gltf-binary`, the logo bucket's four policies: owner and managers, their own folder). **Not the `brand` bucket:
  `clearOldLogos` empties that folder whenever a logo is saved.** `WebsiteMedia.tsx` (in the website's dialog) shrinks a
  photo to 1600 px WebP on the device, asks `siteUploadUrl` for a signed address in the property's folder and sends the
  file **straight to storage** — a server action's body stops at 1 MB and a film is not that small. Photos save
  themselves (`saveSiteMedia` → `website_media_save`: the gallery keeps what it already had and takes new addresses only
  from this property's folder, twelve at most; a room type takes six, its own folder only). A file no longer used is
  removed (`removeSiteFile`, own folder only, best effort).
- **Room photos and the room sheet** — `room_types.photos` (0185; `'{}'` for every existing room type). A room card
  leads with the room's own first photo (else the place's photos in turn, as before) and **opens a sheet**
  (`SiteMore.tsx` → `SiteRoomBox`): the photos side by side (swipe or arrows, scroll-snap), amenities, how many it
  sleeps, the rate, *Book this room*. A card is `role="button"` carrying the room as `data-*`; the Book link inside it is
  still a link.
- **Looks** (`look`): **night** as built · **calm** — no curtain, running bands, cursor ring, steam, orbits, badge or
  aurora (the lightest the page gets) · **day** — every section between the photo bands is a paper sheet
  (`.site-day` on rooms, facilities, offers, gallery, Instagram and the map section too). The first screen, the showcase
  and the closing band stay the night's: they are photographs with words on them. **A section that was only ever dark
  needs `.site-day` twins for whatever it paints with white** — the map's streets (`--map-road`), the contact card, a
  ticket, a room's drawn panel; `shoot11.mjs` measures ink against paper in each.
- **Tamil / Hindi** (`lang_ta`, `lang_hi`; `lib/siteWords.ts`): a language button in the floating menu (`?lang=ta`,
  `?lang=hi` — only a language the client switched on; anything else is English). **The page's own words change —
  headings, buttons, labels, the questions and their answers, the story's lines; what the owner typed is never
  translated.** The key is the English line itself, so a line with no entry shows in English and nothing can be blank.
  Client pieces get their forty-odd lines through a context (`SiteWords.tsx`, `useW()`), empty in English, so a
  server-drawn piece says the same thing after hydration and the default page ships no table. The display face and the
  serif are Latin: in another script headings use the system face with no capitals, tracking or outline and a
  line-height above 1 (a vowel sign was cut). Each language is told to search engines as an alternate (`hreflang`).
  The share card, the title and the description stay English. Not reviewed by a native reader yet.
- **A film behind the first screen** (`video_url`, a file in the bucket): `<video muted loop playsinline preload="none">`
  with no `src`; `SiteFx` sets it 1.5 s after load — **only from 768 px, never with reduced motion or a data-saving
  connection** — and fades it in when it plays; it pauses when the first screen is off screen. A phone never fetches it.
- **Instagram posts** (`insta_1..3`): quiet cards after the gallery; **a tap loads that one post's own frame**
  (`instagram.com/p/<id>/embed` — a frame, no script of theirs on our page). Without JavaScript the card is a link.
- **A dish in 3D** (`model_url` + `model_name`, a `.glb`): *See … in 3D* beside the menu's heading opens a sheet and
  **only then** fetches `@google/model-viewer` — its single-file build (`dist/model-viewer.min.js`, which carries the 3D
  engine; the package's module build expects the app to provide `three`). About 1 MB, in its own chunk, never on the
  page until asked. No model, no button: this needs a real `.glb` of the dish from the client.
- **The client's own domain** (`websites.domain`; `lib/siteDomain.ts`, `middleware.ts`): on a host that is not ours the
  middleware asks `website_by_domain(host)` (kept a minute per host; a lookup that fails serves the app as usual) and
  rewrites **only the front door** `/` to `/site/<slug>`; every other path is the app's own, so ordering and booking work
  on the client's address. The page's canonical address, share tags and search data use the domain (`siteHome`).
  **Two things are not the app's to do:** the domain must be added to the Vercel project by DineFlow, and the client
  must point its DNS there — the dialog says support connects it. `website_save` refuses our own hosts and a domain
  another website holds.
- **Cost, measured on the build:** first load 118 kB (115 before): the room sheet, the Instagram card and the 3D
  button's shell. The viewer, the film and Instagram's frame are fetched only when asked — `shoot11.mjs` loads the page
  and requires that none of the three was requested.
- **Exercised on the real database on 2026-11-22** (`website-upload.mjs`, 8 — the bucket arrived with 0185 that day): on Basic
  the gallery is a locked row; on Standard an 800 px PNG is shrunk on the device, lands in `site/<property>/photo-….webp`,
  is kept in `restaurants.photos`, shows on the public page, and Remove takes it out of the row and the bucket (the file
  removal is not awaited by the dialog — it was gone within a second). A photo under 400 px is refused with the reason.
  **Still not exercised:** a real client domain; a real `.glb`.

### Tenth pass, 2026-11-17 — website plans

The owner: "the website a client can make follows the client's **website subscription** — four plans, like Basic; the
plans are kept in Master control, a client is put on one there, and in the client's own Settings the website's options
are chosen from what that plan includes."

- **Four plans, fixed in number** (`website_plans`, 0185): `basic` · `standard` · `premium` · `elite`. Each has a
  name, a monthly and a yearly price (empty = "Ask us", 0 = "Free") and a list of the **thirteen extras** it includes
  (`WEBSITE_PLAN_FEATURES`, shared — the same names as the table's constraint; a unit test reads the SQL). Seeded so each
  includes the one below: Basic none · Standard *review, enquiry, banner, stats, upload* · Premium + *offer pop-up, looks,
  Tamil / Hindi, Instagram, room photos* · Elite + *video, 3D, own domain*. **What every plan has is not a switch**: the
  page and its sections, the contact card and map, the links and logo, the search data, share card and sitemap.
- **A property is on one plan** (`website_subscriptions`; **no row = basic**). It is a table of its own, not a column on
  `restaurants`, so the big `guard_restaurant_update` did not have to be re-created: it has no write policy at all.
- **The database decides, the screens only show it.** `_website_can(rid)` is asked by `website_save` (an option the plan
  does not include is not kept — `_website_options_for`; a domain is refused with the reason), `website_public` (the
  options and the domain are cut to the plan **at read**, and room photos only on a plan with them), `website_hit`,
  `website_media_save` (photo upload and room photos refused with the reason) and `website_by_domain`. So **a plan
  change takes effect at once, both ways, with nothing re-saved**: down to Basic and the extras leave the page while the
  owner's choices stay in the row; back up and they return.
- **Because of that filter, a new extra now does need the migration's help**: its option key must be mapped to an extra in
  `_website_options_for`, or it is dropped (an unmapped key belongs to no plan). The eighth pass's "the list grows in the
  app, not in the database" stopped being true here.
- **Master control → Keys → Website plans** (`admin/WebsitePlans.tsx` `WebsitePlansCard`, under Plans & prices): four
  editors — Name, Monthly ₹, Yearly ₹, thirteen ticks, Save (`admin_set_website_plan`, master only, logged).
  **A property's own sheet → Website plan** (`WebsitePlanPick`, above Membership control): four radio cards, saved on the
  tap (`master_set_website_plan`, logged as `website_plan.assign`); a refusal leaves the old plan marked and says why.
  Before 0185 neither is drawn (`admin/page.tsx` reads both tables and tolerates nothing coming back).
- **The client's Settings** (`WebsiteCard.tsx`, `WebsiteMedia.tsx`): the card says *Standard plan · 5 of 13 extras included*
  and opens a sheet of the four plans — price, the thirteen with a tick or a lock, *Your plan*, what every plan has, and
  **who to ask** (Help & support): the owner cannot change a plan, so there is no button that pretends to. In the dialog
  every extra is either open or a **locked row** (`[data-website-locked]`: its name, and the plan it starts in —
  `websitePlanWith`) with nothing to press.
- **Not built:** paying for a website plan online (the plan is assigned by hand in Master control; Razorpay checkout exists
  only for the membership), a trial of a higher plan, a per-property override of one extra.

## Before you edit

- **A new fixed line on the page goes through `t("…")` (server) or `w("…")` (a client piece) and gets an entry in
  `lib/siteWords.ts`** — else it stays English on the Tamil and Hindi pages. A heading uses `<H>` inside `SiteView`
  (the translating wrapper), never `<Head>` directly; and a script that rewrites `<Head` → `<H` must not touch `H`'s own
  body (it once made the heading call itself).
- **`/site` is English-only as far as the app's own translation scan goes** (`ENGLISH_ONLY_SRC`, `scripts/i18n-check.mjs`), like the
  other guest pages. The Settings card is staff text: **its strings are not in the Tamil / Hindi dictionaries yet.**
- **Only https photos.** `sitePhotos` drops anything that is not a clean https address. A library dish photo (it has
  `image_credit`) is CC BY / BY-SA: wherever one is shown its credit must be reachable — keep the card's line and the list.
- **The cover is the storefront's** (`StoreCover`), drawn for a 17rem strip; here it is a full screen with a headline and buttons
  on it, so `site-hero-shade` darkens it and the drawn steam is hidden (a metre tall at this height). Change the cover's art and look at both pages.
- **Not built:** the client's own domain or a `name.dineflow.cloud` address (needs a wildcard domain on Vercel and a host
  branch in `middleware.ts`), photo upload for the gallery (photos are the Storefront's list of addresses), templates, one
  website for a chain. (The sitemap is built now — `/site/sitemap.xml`, seventh pass.)
- The root layout's manifest and service worker are on this page too, as on `/dine` — it is the same address.

## Verify

```
pnpm test                      # lib/website.test.ts 32 · lib/siteWords.test.ts 8 · lib/siteDomain.test.ts 3 (sections = the SQL, the checklist, the page's pieces; the title,
                               #       search words, questions, address lines, map links, search graph, links, reach, ready posts;
                               #       the extras: choices tidied, the review link's hosts, the announcement's last day, the count's kinds = the SQL)
node dry185.mjs                # 105 checks, rolled back: owner / waiter / anon / another property / add-on off / lapsed; the email
                               #       and links (tidy kept; another host, a script address, an unknown key dropped), the pin,
                               #       pincode and licence in the public answer, the sitemap list (no demo, no hidden site); the choices
                               #       (yes/no, numbers, short plain lines kept; markup, quotes, lists, odd keys dropped), the count
                               #       (off until switched on, tallied by kind, capped, read by its owner only); the site bucket and its
                               #       policies, gallery and room photos (own files only, 12 and 6), the domain (bare host kept, ours
                               #       and a taken one refused, the lookup with and without www, a hidden site answers nothing); the plans
                               #       (four seeded, an owner cannot change one or assign itself, the master renames / prices /
                               #       re-ticks and assigns; down to basic → the extras, the domain, the count and uploads stop at
                               #       once; premium keeps exactly its own; no row = basic)
node shoot5.mjs all            # 228 — the showcase, three kinds × five widths: upright and centred, word fits, a small plate brings
                               #       its dish / word / colour, arrow or swipe, moves on by itself, 44px; reduced motion; JS off
node shoot6.mjs all            # 167 — glass card (floating + lead from 1100, in flow below), the story pinned and one line
                               #       at a time, the fan with a mouse / the list without; reduced motion; JS off
node shoot7.mjs all            # 305 — the sheets (light, rounded, inset; ink, eyebrow and notes read on paper; serif headings;
                               #       44px; the rail on the heading's edge; a bright price on a signature card), two callouts
                               #       clear of card / price row / other plates, the closing photo and its iris; reduced motion; JS off
node shoot8.mjs all            # 242 — a row and a signature card open their own dish (name, category, words, price, veg), the
                               #       photo in flight, sheet inside the screen (bottom sheet on a phone), Escape / close / backdrop,
                               #       focus back on the row, no name left on a thumbnail, a dish with no photo; parts resting
                               #       at the top and at the foot; reduced motion; JS off
node shoot9.mjs all            # 398 — the head for each kind (title, description, search words, share tags, geo, the logo as the tab icon),
                               #       the search graph (place + pin + links + menu or rooms, page, questions), the share card (a 1200×630
                               #       JPEG under 300 KB); the logo on the curtain / first screen / pin / foot; the map inside the screen,
                               #       the pin on its square, the landing, the way in drawn, river / park / sea by kind, nothing asked of
                               #       Google before a tap, the live map on a tap and its buttons clear of Google's line; the card's
                               #       rows, copy, share, social links, 44px; questions on a sheet, this kind's own; the closing band;
                               #       the foot and the licence number; a place that gave nothing extra; no address → no map;
                               #       reduced motion; JS off; /site/sitemap.xml and robots.txt
node shoot11.mjs all           # the ninth pass: a room opens (its own photos, arrows, Book, focus back; Book on a card stays a link;
                               #       a room with no photos), the film (asked for only from 768 px and only after the page settled;
                               #       never on a phone or with reduced motion), 3D (nothing fetched until the tap; a real tiny .glb
                               #       loads and is shown; a file that cannot be fetched says so), Instagram (cards, one frame on a
                               #       tap), looks calm and day × three kinds (ink against paper in every section), Tamil and Hindi ×
                               #       three kinds (menu, headings, questions, buttons, the enquiry sheet; the owner's words untouched;
                               #       nothing cut; hreflang), nothing chosen → none of it on the page
node card13probe.mjs           # 211 — website plans: the client's card and dialog on each of the four plans (exactly that plan's
                               #       extras open, every other one locked and naming the plan it starts in, nothing to press), the
                               #       plans sheet (four plans, thirteen rows each, prices as typed, this one marked, who to ask);
                               #       Master control's four editors (name, prices, thirteen ticks, Save) and a property's plan
                               #       picker; a refusal leaves the old plan marked; four themes × widths
node card11probe.mjs           # 79 — Settings → Website: Photos & files (gallery, each room type, the film, the 3D dish), a file of the
                               #       wrong kind refused with the reason, the look, languages, Instagram posts and the domain as saved
node shoot10.mjs all           # 259 — the extras, three kinds × five widths: the announcement under the menu and clear of the name; the
                               #       open counted once and taps by kind; the offer in the corner after 6.5 s, above the phone's
                               #       bar, closed for the visit; Review us on Google once, 44px; the enquiry sheet (this kind's
                               #       questions, 16px type, a bottom sheet on a phone), nothing sent without a name, WhatsApp opened
                               #       with the message written, focus back; **everything off → not drawn and not one request**;
                               #       a past announcement, a review link that is not Google's, no WhatsApp number; reduced motion;
                               #       JS off; POST /site/<slug>/hit answers 204 whatever is sent
node card10probe.mjs           # 97 — Settings → Website in four themes × widths: Extras (three switches, three labelled boxes, 44px),
                               #       the hint that names what a switch needs, Edit opens as saved, the card's 30-day count and
                               #       "n extras", the review QR in Reach; count on but nothing yet
node card9probe.mjs            # 103 — Settings → Website in four themes × widths: the Search & social row and its count, the sheet's
                               #       three groups, Auto rows, where each gap is fixed, Add opens the dialog, six labelled boxes at
                               #       44px, ready posts and hashtags (copy), a resort's and a hotel's rows, a manager's view
node perf.mjs <label>          # LCP, CLS, long tasks and frame times over a full scroll, processor slowed 4×
node site-probe.mjs site       # 213 — three kinds × five widths: no sideways scroll, 44px, blocks in order, reveals, no console errors;
                               #       reduced motion (nothing hidden, nothing moving); JavaScript off (the whole page)
node site-probe.mjs card       # 61 — the card's states and the dialog in five themes
```

The browser probes of 2026-11-14 to 2026-11-17 ran on fixtures, on a temporary page, because 0185 was not on the database.

## On the real database (2026-11-22)

**0185 had never been applied to the live database.** 0186–0190 were applied around it (each by its own dry-run script with
`--live`, which records one file), so the live site served the whole website code against a database with no `websites`
table, no `website_*` function, no `site` bucket and a `default_features()` without `website`: Settings → Website showed
*Not on this database yet. It arrives with the next update.* and `/site/sitemap.xml` was an empty list. The owner reported
"the client website section does not work". Found by listing `_dineflow_migrations`; applied with `dry185.mjs --live`
(24 checks inside the same transaction — a dry run of 23 first). Nothing in 0186–0190 re-creates a function 0185 defines,
so applying it after them changes nothing else; `default_features()` now carries `website` as `features.ts` says.

Then the real path, on a private dev server against the live database (`website-e2e.mjs`, 27; `website-upload.mjs`, 8;
the demo properties removed afterwards): a restaurant at 1440 dark and a resort at 412 paper — the card with *Create
website* and the *Basic plan · 0 of 13 extras* row, the plans sheet (four, this one marked), the checklist (9 rows / 3
ready for the restaurant, 11 / 6 with rooms for the resort, the ready ones ticked), Create → *Website ready* with the
address, the card *Live* with Copy / Open / Edit, the row in `websites`, a stranger's `/site/<slug>` at 200 with the name
and the sections, `noindex` for a demo, the share card as a JPEG, no errors and no sideways scroll on either page; *Show
to the public* off → *Hidden*, and the public page a 404 **after the 30 s keep** (`lib/keepFor.ts` — a probe that reads
it at once still gets the old answer; that is the documented half-minute, not a bug). Uploads: the bullet under the ninth
pass. The live Vercel deployment of 2026-11-22 predates the tenth pass (plans); the plan row and the two Master control
editors reach the live site with the next deploy — the functions are already there.

## See also

[guest-facing.md](guest-facing.md) · [settings.md](settings.md) · [data-and-rls.md](data-and-rls.md) ·
[admin-and-membership.md](admin-and-membership.md) (add-ons) · [auth-and-session.md](auth-and-session.md) (the route lists)

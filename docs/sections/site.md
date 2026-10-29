# The public site — dineflow.cloud's front page, the kinds, the blog

**Routes** `/` · `/for/[kind]` (restaurants, cafes, cloud-kitchens, hotels-resorts) · `/blog` · `/blog/[slug]`
**Files** `app/page.tsx` · `app/for/[kind]/page.tsx` · `app/blog/page.tsx` · `app/blog/[slug]/page.tsx` ·
`components/site/{Site,Landing,KindPage,LangSwitch}.tsx` · `lib/site/content.ts` · `lib/site/posts.ts`
**Reads** `public_plans()` (0152) — nothing else; no sign-in

## What it is

Built 2026-10-29 (the owner's item 18 — "a landing page, pages for each restaurant type, a blog"). Until then `/` was a
redirect to `/login`, so a stranger learned nothing. Now: what DineFlow is in one line, eight feature cards, why it fits an
Indian business, who it is for, the prices, the first questions; a page for each kind of business; plain articles.

## How it works

- **Static and fast.** `/` is ISR (`revalidate = 600`) and `setPlan` (Master control) revalidates it, so a saved price shows
  at once; `/for/*` and `/blog/*` are built at deploy (`generateStaticParams`, `dynamicParams = false` — an unknown slug is a
  404). The pages are server components with no JavaScript of their own except the language select. Measured: first paint
  0.6 s on a phone-width load of the local build.
- **Who still never sees it** (middleware.ts): a signed-in person on `/` is sent to their screens, as before; **the Windows
  app** opens `dineflow.cloud` itself, so a signed-out request whose user agent carries `DineFlowDesktop/` (apps/desktop
  main.cjs) is sent to `/login`. The installed web app starts at `/dashboard` (manifest). `/for/` and `/blog` are in
  `PUBLIC_PREFIX` and `SESSION_FREE`.
- **The prices are the plans'** (`public_plans`, 0152 → 0151's `plans`, set in Master control → Keys → Plans & prices), the
  same numbers /membership shows and online payment charges. "N months free" is `round(12 − yearly / monthly)`.
- **Languages.** `/` and `/for/*` translate with the whole app (`df-lang=ta-all|hi-all`, `LangSwitch` in the header sets it;
  `/` was taken out of `ENGLISH_ONLY` in lib/i18n/scope.ts). The blog is English-only (in `ENGLISH_ONLY` and skipped by
  scripts/i18n-check.mjs, with `lib/site/posts.ts`), like the guest pages.
- **SEO.** `sitemap.ts` lists `/`, the four kinds and every post; `robots.ts` allows `/for/` and `/blog`.

## Before you edit

- **Only claims the app keeps.** `lib/site/content.ts` says only what DineFlow does today — no customer counts, no
  testimonials, no "fastest". Take a feature out of the app, take it out of here. Swiggy, Zomato and ONDC say "once
  connected" because they need the platform's partner access.
- **No tax claims about our own prices** ("including GST" and the like) until the company's GST registration is settled
  (legal.md).
- **Blog posts are true on their date.** Rates and rules change: correct a post and set `updated`, or take it down. The tax
  posts end with "a guide, not tax advice".
- **Do not use Tailwind's bare `group`** here: the app has its own global `.group` class (a grouped-list card), so a
  `group` utility paints a card. Use named groups — `group/faq`, `group/kind` (2026-10-29: the FAQ rows came out as boxed,
  centred buttons).
- `h1, h2, h3` take the display face globally (unlayered); a utility cannot override it without `!`.

## Verify

`pw/site154.mjs` (9, testing-and-gates.md): the front page at 1440 dark and 412 paper (8 features, 4 kinds, 2 prices from
the database, 6 questions, no sideways scroll), the Windows app → /login, signed in → /dashboard, the four kinds, the blog
and a post, an unknown kind 404, Tamil, the sitemap.

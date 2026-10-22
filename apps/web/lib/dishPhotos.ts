/**
 * Photos for dishes, found on Wikipedia and Wikimedia Commons.
 *
 * Why there: every dish a menu in India (or anywhere) is likely to carry — biryani, masala dosa,
 * kuzhambu, pongal, filter coffee, croissant, pad thai, a mojito — has an encyclopedia article whose
 * lead photo was chosen by people to show exactly that dish, and every file there is freely licensed.
 * No key, no account, no bill. The licence asks for a credit, which is kept beside the photo.
 *
 * A plain search is not enough: "Filter coffee" finds *Drip coffee* first and "Lime soda" finds a kind
 * of glass. So each article is scored on whether its one-line description says it is something you eat
 * or drink, how much of the dish's name its title shares, and where the search placed it; anything
 * non-free (an enwiki "fair use" file) is dropped. Commons photos follow as more choices.
 *
 * Pure apart from `fetch`, so the scoring is unit-tested (dishPhotos.test.ts).
 */

export type PhotoCandidate = { url: string; thumb: string; title: string; source: string; credit: string; score: number };

const UA = "DineFlow/1.0 (https://dineflow.cloud; restaurant menu photos)";
const FOOD = /\b(dish|dishes|food|cuisine|drink|beverage|dessert|sweet|sweets|bread|flatbread|snack|curry|rice|coffee|tea|cocktail|mocktail|juice|soup|salad|cake|pastry|noodle|noodles|sandwich|stew|confection|confectionery|meal|breakfast|beer|wine|liquor|spirit|milk|milkshake|cheese|meat|chicken|mutton|lamb|fish|seafood|prawn|vegetable|fruit|sauce|chutney|pickle|biscuit|cookie|pizza|pasta|burger|dumpling|pancake|porridge|fritter|kebab|lentil|pulse|condiment|spice|ice cream|pudding|smoothie|lemonade|soda|soft drink|sherbet|beverages|appetizer|street food)\b/i;
const NOT_FOOD = /\b(film|movie|album|song|single|band|singer|television|tv series|village|town|city|district|state|politician|actor|actress|cricketer|footballer|company|brand|glass|festival|river|temple|church|novel|magazine|video game|ship|railway|station|airport|university|school|disambiguation|list of)\b/i;

const CORE = /\b(dish|drink|beverage|dessert|sweet|snack|curry|bread|flatbread|soup|salad|cocktail|cake|pastry|food|delicacy|porridge|stew|pudding|confection)\b/i;
const KIT = /\b(used to|utensil|appliance|machine|device|method of|equipment|tool|vessel|cookware|container|brewing method)\b/i;
const words = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, " ").split(/[^a-z0-9]+/).filter((w) => w.length > 1);
/** Spellings menus use for the same word ("briyani", "biriyani" for biryani). */
const norm = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w).replace(/^bir?i?y?a?ni$|^briyani$|^biriyani$/, "biryani").replace(/^dosai$/, "dosa").replace(/^idly$/, "idli").replace(/^vadai$/, "vada").replace(/^kulambu$|^kozhambu$/, "kuzhambu");

/** A Commons photo, by its file name: every word of the dish in it → 7, else a share of 3. */
export function scoreFile(dish: string, fileTitle: string): number {
  const want = [...new Set(words(dish).map(norm))], got = new Set(words(fileTitle).map(norm));
  const shared = want.filter((w) => got.has(w)).length;
  return shared === want.length && want.length > 0 ? 7 : (shared / Math.max(1, want.length)) * 3;
}

/** How good an article is as the photo for this dish. Higher is better; below zero is not a dish. */
export function scoreArticle(dish: string, title: string, description: string | undefined, index: number): number {
  const want = new Set(words(dish).map(norm)), got = new Set(words(title).map(norm));
  const shared = [...want].filter((w) => got.has(w)).length;
  let s = (shared / Math.max(1, want.size)) * 4;
  if ([...want].join(" ") === [...got].join(" ")) s += 3;
  const d = `${title} ${description ?? ""}`;
  // a thing you eat or drink, said outright, beats a description that merely mentions food
  if (CORE.test(description ?? "")) s += 5; else if (FOOD.test(description ?? "")) s += 2.5; else if (FOOD.test(title)) s += 1.5;
  if (KIT.test(description ?? "")) s -= 4;     // "Filter used to brew coffee" is the paper, not the coffee
  if (NOT_FOOD.test(d)) s -= 10;
  return s - index * 0.3;
}

type WikiPage = { title: string; index: number; description?: string; thumbnail?: { source: string; width: number; height: number }; pageimage?: string };
type ImageInfo = { title: string; imageinfo?: { thumburl?: string; descriptionurl?: string; extmetadata?: Record<string, { value: string }> }[] };

async function api(host: string, params: Record<string, string>): Promise<{ query?: { pages?: Record<string, unknown> } }> {
  const u = new URL(`https://${host}/w/api.php`);
  for (const [k, v] of Object.entries({ action: "query", format: "json", formatversion: "2", origin: "*", ...params })) u.searchParams.set(k, v);
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 7000);
  try {
    const r = await fetch(u, { headers: { "User-Agent": UA, "Api-User-Agent": UA }, signal: ctl.signal, next: { revalidate: 86400 } } as RequestInit);
    if (!r.ok) return {};
    return await r.json();
  } catch { return {}; } finally { clearTimeout(t); }
}
const pagesOf = <T,>(j: { query?: { pages?: unknown } }) => (Array.isArray(j.query?.pages) ? (j.query!.pages as T[]) : Object.values((j.query?.pages ?? {}) as Record<string, T>));

const strip = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, " ").trim();
/** "Photo: A. Kumar · CC BY-SA 4.0 · Wikimedia Commons", or null for a file that is not free to use. */
export function creditFrom(meta: Record<string, { value: string }> | undefined): string | null {
  if (!meta) return null;
  const lic = strip(meta.LicenseShortName?.value ?? "");
  if (meta.NonFree || /fair use|non-free/i.test(lic) || /fair use|non-free/i.test(strip(meta.UsageTerms?.value ?? ""))) return null;
  const who = strip(meta.Artist?.value ?? "").slice(0, 60) || "Unknown author";
  return `Photo: ${who}${lic ? ` · ${lic}` : ""} · Wikimedia Commons`;
}

/** Up to `limit` photos for a dish, best first. `context` is a word that says what kind of thing it is — its category. */
export async function findDishPhotos(dish: string, context?: string | null, limit = 8): Promise<PhotoCandidate[]> {
  const name = dish.trim().slice(0, 80);
  if (name.length < 2) return [];
  const ctx = (context ?? "").trim().toLowerCase();
  const kind = /drink|beverage|juice|coffee|tea|shake|mocktail|cocktail|bar|soda/.test(ctx) ? "drink" : /dessert|sweet|cake|bakery|ice/.test(ctx) ? "dessert" : "dish";
  const queries = [...new Set([name, `${name} ${kind}`, `${name} food`])];
  const searched = await Promise.all(queries.map((q) => api("en.wikipedia.org", {
    generator: "search", gsrsearch: q, gsrlimit: "8", prop: "pageimages|description", piprop: "thumbnail|name", pithumbsize: "640", pilicense: "free",
  })));
  // one row per article, keeping its best position across the searches
  const best = new Map<string, WikiPage & { score: number }>();
  searched.forEach((j, qi) => pagesOf<WikiPage>(j).forEach((p) => {
    if (!p.thumbnail?.source || !p.pageimage) return;
    const score = scoreArticle(name, p.title, p.description, (p.index ?? 9) + qi);
    const had = best.get(p.title); if (!had || had.score < score) best.set(p.title, { ...p, score });
  }));
  const articles = [...best.values()].filter((p) => p.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);

  // Commons: more photos of the same thing, for choice
  const commons = pagesOf<ImageInfo & { index?: number }>(await api("commons.wikimedia.org", {
    generator: "search", gsrsearch: `${name} ${kind} filetype:bitmap`, gsrnamespace: "6", gsrlimit: "10",
    prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "640",
  })).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  // the article photos need their licence: one batch on Commons' shared file repository
  const files = articles.map((a) => `File:${a.pageimage}`);
  const info = files.length ? pagesOf<ImageInfo>(await api("en.wikipedia.org", { titles: files.join("|"), prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "640" })) : [];
  const byFile = new Map(info.map((i) => [i.title.replace(/_/g, " "), i.imageinfo?.[0]]));

  const out: PhotoCandidate[] = []; const seen = new Set<string>();
  for (const a of articles) {
    const ii = byFile.get(`File:${a.pageimage!.replace(/_/g, " ")}`);
    const credit = creditFrom(ii?.extmetadata); if (!credit || !ii?.thumburl || seen.has(ii.thumburl)) continue;
    seen.add(ii.thumburl);
    out.push({ url: ii.thumburl, thumb: a.thumbnail!.source.replace(/\/\d+px-/, "/330px-"), title: a.title, source: `https://en.wikipedia.org/wiki/${encodeURIComponent(a.title.replace(/ /g, "_"))}`, credit, score: a.score });
  }
  for (const c of commons) {
    if (out.length >= limit + 6) break;
    const ii = c.imageinfo?.[0]; const credit = creditFrom(ii?.extmetadata);
    if (!ii?.thumburl || !credit || seen.has(ii.thumburl) || !/\.(jpe?g|png|webp)$/i.test(c.title)) continue;
    seen.add(ii.thumburl);
    const title = c.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, "");
    out.push({ url: ii.thumburl, thumb: ii.thumburl.replace(/\/\d+px-/, "/330px-"), title, source: ii.descriptionurl ?? "https://commons.wikimedia.org", credit, score: scoreFile(name, title) - out.length * 0.05 });
  }
  /* a photo whose own name carries every word of the dish ("Hakka Noodles, Veg Manchurian") beats an
     article that only shares one ("Lanzhou beef noodles"); an article that is the dish still wins */
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * A dish photo at the size it is shown (2026-10-22, the owner: "a lightweight feel"). A chosen photo is stored as
 * Wikimedia's 960 px thumbnail, 150–400 KB, and the till, the menu, the website and the kiosk drew that file into tiles
 * 60–250 px wide — a till of 30 dishes fetched ~7 MB on a phone. Wikimedia serves thumbnails only at fixed widths (250,
 * 330, 500, 960, 1280; 320 or 400 answer 400), so this asks for the smallest one at least `w` px wide. A thumbnail is
 * only ever made smaller. An original Commons file (a JPEG, PNG, WebP or GIF the picker kept because it was under 640 px)
 * is asked for as a thumbnail too — it can be narrower than the step, and then Wikimedia answers an error, so the photo
 * goes through `DishImage`, which falls back to the stored URL. The property's own upload (900 px WebP already) and
 * anything else come back as they are.
 */
const STEPS = [250, 330, 500, 960, 1280];
const THUMB = /^(https:\/\/(?:upload|thumb)\.wikimedia\.org\/.+\/thumb\/.+\/)(\d+)px-([^/?#]+)(.*)$/;
const ORIGINAL = /^(https:\/\/upload\.wikimedia\.org\/wikipedia\/[a-z]+\/)([0-9a-f]\/[0-9a-f]{2}\/)([^/?#]+\.(?:jpe?g|png|webp|gif))([?#].*)?$/i;
export function photoAt<T extends string | null | undefined>(url: T, w: number): T {
  if (!url) return url;
  const want = STEPS.find((s) => s >= w) ?? STEPS[STEPS.length - 1];
  const m = THUMB.exec(url);
  if (m) return (Number(m[2]) <= want ? url : `${m[1]}${want}px-${m[3]}${m[4]}`) as T;
  const o = ORIGINAL.exec(url);
  if (o) return `${o[1]}thumb/${o[2]}${o[3]}/${want}px-${o[3]}${o[4] ?? ""}` as T;
  return url;
}

import { z } from "zod/v4";

/**
 * Menu photo → a working menu: the pure parts of the import (menu/actions.ts asks the model and writes;
 * menu/MenuImport.tsx shows the tick-and-fix pass). Everything here is plain data in, plain data out, so
 * lib/menuImport.test.ts can check it without a model or a database.
 *
 * What the model is asked for, per dish (`menuPhotoSchema`, enforced by the API against the Zod schema):
 * the English name and the name as printed when it was in another script; the section heading; every printed
 * price with its size label; veg; whether it is a sealed packaged product sold as bought; one line of
 * description; spicy / Jain when printed; and how sure it is. Tax is **not** asked of the model — a model is a
 * poor tax adviser — it is derived here from `packaged_goods` and the name (`taxFor`).
 */

export const PRICE_SCHEMA = z.object({
  label: z.string().max(20).describe("The size as printed — Half, Full, Quarter, Small, Medium, Large, 250 ml… — or empty when the dish has one price"),
  price: z.number().nonnegative().describe("The printed price in rupees; 0 when none is printed"),
});
export const menuPhotoSchema = z.object({
  dishes: z.array(z.object({
    name: z.string().max(80).describe("The dish's name in English, as a menu in English would print it"),
    name_local: z.string().max(80).describe("The name exactly as printed when it is in Tamil, Hindi, Kannada, Telugu, Malayalam or another script; empty when the menu printed it in English"),
    category: z.string().max(40).describe("The section heading the dish sits under on the menu, or empty"),
    prices: z.array(PRICE_SCHEMA).min(1).max(6).describe("One entry per printed price. A dish in sizes (Half/Full, Quarter/Half/Full, S/M/L) is one dish with one entry per size, lowest first"),
    is_veg: z.boolean().describe("true when the dish has no meat, fish or egg — from the green/red mark or the dish itself"),
    packaged_goods: z.boolean().describe("true only for a sealed packaged product sold as bought: bottled or packaged water, a canned or bottled aerated drink, a packet of chips. Anything cooked, poured or mixed here is false"),
    description: z.string().max(140).describe("One line: what is printed under the dish, or empty. Never invent one"),
    spicy: z.boolean().describe("true when the menu marks it spicy (chilli symbol or word)"),
    jain: z.boolean().describe("true when the menu marks it Jain"),
    confidence: z.number().min(0).max(1).describe("How sure you are of the name and the price together: 1 printed clearly, 0.5 partly hidden or guessed"),
  })).max(150),
});
export type MenuPhotoResult = z.infer<typeof menuPhotoSchema>;
export type PhotoDish = MenuPhotoResult["dishes"][number];

/** One size a dish is sold in. */
export type ImportVariant = { name: string; price: number };
/** A dish as the review form holds it, and as importDishes() receives it. */
export type ImportDish = {
  name: string;
  /** the name as printed when it was in another script — shown in the form; menu_items has no column for it yet */
  name_local: string;
  category: string;
  /** the sell price — the lowest size when there are variants */
  price: number;
  /** [] for a single-price dish; two or more sizes otherwise */
  variants: ImportVariant[];
  is_veg: boolean;
  /** null = the property's rate */
  gst_rate: number | null;
  /** null = restaurant service (SAC 996331 at bill time) */
  hsn: string | null;
  description: string;
  spicy: boolean;
  jain: boolean;
  confidence: number;
};

export type TaxContext = { gst_rate: number; gst_scheme?: string | null };

/** A name as it is compared: lower case, one space between words, punctuation and the veg/size suffixes gone. */
export function normName(s: string): string {
  return s.toLowerCase().normalize("NFKC")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(veg|non veg|nonveg)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}
/** A category as it is compared: case- and space-insensitive, "&" and "and" the same, no trailing "s". */
export function normCategory(s: string): string {
  return s.toLowerCase().normalize("NFKC").replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim().replace(/s$/, "");
}

/** The existing category the model's heading means, by name (case/space-insensitive), or null when it is new. */
export function matchCategory(heading: string, existing: readonly string[]): string | null {
  const h = normCategory(heading); if (!h) return null;
  for (const e of existing) if (normCategory(e) === h) return e;
  // "Main course" ≈ "Mains" ≈ "Main"; "Rice & biryani" ≈ "Biryani": one side holds the other whole, and both are words
  for (const e of existing) { const n = normCategory(e); if (n.length >= 4 && h.length >= 4 && (n.startsWith(h) || h.startsWith(n))) return e; }
  return null;
}

const SIZE_WORDS: Record<string, string> = {
  h: "Half", half: "Half", f: "Full", full: "Full", q: "Quarter", qtr: "Quarter", quarter: "Quarter",
  s: "Small", sm: "Small", small: "Small", m: "Medium", med: "Medium", medium: "Medium", l: "Large", lg: "Large", large: "Large",
  r: "Regular", reg: "Regular", regular: "Regular", mini: "Mini", single: "Single", double: "Double", jumbo: "Jumbo", family: "Family",
  plate: "Plate", "1/2": "Half", "1/4": "Quarter",
};
const UNLABELLED: Record<number, string[]> = { 2: ["Half", "Full"], 3: ["Small", "Medium", "Large"], 4: ["Quarter", "Half", "Full", "Family"] };

/**
 * Sizes from a printed price cell: "120/220" → Half ₹120 · Full ₹220; "Half ₹90 Full ₹160"; "S 80 M 110 L 150";
 * "Qtr 90 / Half 160 / Full 300". One price → [] (not a variant). Labels missing: two prices are Half/Full, three are
 * Small/Medium/Large, four Quarter/Half/Full/Family — the convention on Indian menu cards.
 */
export function parseVariants(text: string): ImportVariant[] {
  const t = text.replace(/₹|rs\.?|inr/gi, " ").replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return [];
  // label + number pairs, in either order ("Half 90" / "90 Half")
  const pairs: ImportVariant[] = [];
  const re = /(?:([A-Za-z]+|1\/2|1\/4)\s*[:.]?\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*([A-Za-z]+|1\/2|1\/4))/g;
  let m: RegExpExecArray | null; const seen = new Set<number>();
  while ((m = re.exec(t))) {
    const word = (m[1] ?? m[4]).toLowerCase(), price = Number(m[2] ?? m[3]);
    const name = SIZE_WORDS[word] ?? (word.length > 2 ? word[0].toUpperCase() + word.slice(1) : null);
    if (!name || seen.has(m.index)) continue;
    seen.add(m.index); pairs.push({ name, price });
  }
  if (pairs.length >= 2) return pairs;
  const nums = (t.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (nums.length < 2 || nums.length > 4) return [];
  return nums.map((price, i) => ({ name: UNLABELLED[nums.length][i], price }));
}

/** The model's price list as the form's price + variants. One entry → a price; two or more → sizes, lowest first. */
export function pricesToVariants(prices: readonly { label: string; price: number }[]): { price: number; variants: ImportVariant[] } {
  const clean = prices.filter((p) => Number.isFinite(p.price) && p.price >= 0);
  if (clean.length <= 1) return { price: clean[0]?.price ?? 0, variants: [] };
  const named = clean.map((p, i) => ({ name: SIZE_WORDS[p.label.trim().toLowerCase()] ?? (p.label.trim() || UNLABELLED[Math.min(4, clean.length)]?.[i] || `Size ${i + 1}`), price: p.price }));
  // the same label twice is one size (a page read twice): keep the first
  const uniq = named.filter((v, i) => named.findIndex((x) => x.name.toLowerCase() === v.name.toLowerCase()) === i);
  if (uniq.length < 2) return { price: uniq[0]?.price ?? 0, variants: [] };
  return { price: Math.min(...uniq.map((v) => v.price)), variants: uniq };
}

const WATER = /\b(packaged|mineral|bottled|drinking)\s+water\b|\bwater\s+bottle\b|\b(bisleri|aquafina|kinley|bailley|himalayan)\b/i;
const AERATED = /\b(coke|coca\s*cola|pepsi|sprite|thums\s*up|fanta|limca|7\s*up|mirinda|mountain\s*dew|maaza|red\s*bull|aerated|soft\s*drink|cold\s*drink)s?\b/i;
const MADE_HERE = /\b(fresh|lime|lemon|masala|nimbu|jeera|ginger|mint)\b/i;

/**
 * The dish's tax: null/null means "as the property", the normal case for anything cooked or poured here (restaurant
 * service, SAC 996331 at bill time). On the regular scheme a sealed product sold as bought is goods at its own rate:
 * packaged water 18% (HSN 2201), an aerated drink 40% (HSN 2202 — the 2025 rate for carbonated drinks; the 2026 bill
 * still allows 40). A composition or unregistered property charges no per-dish GST, so everything stays null.
 */
export function taxFor(d: Pick<PhotoDish, "name" | "category" | "packaged_goods">, ctx: TaxContext): { gst_rate: number | null; hsn: string | null } {
  const none = { gst_rate: null, hsn: null };
  if ((ctx.gst_scheme ?? "regular") !== "regular") return none;
  const text = `${d.name} ${d.category}`;
  if (WATER.test(text)) return { gst_rate: 18, hsn: "2201" };
  if (AERATED.test(text) && !MADE_HERE.test(d.name)) return { gst_rate: 40, hsn: "2202" };
  if (d.packaged_goods && /\b(soda|water)\b/i.test(d.name) && !MADE_HERE.test(d.name)) return { gst_rate: 18, hsn: "2201" };
  return none;
}

/** What the model read, as the form's rows: sizes from the price list, tax from the name, nothing trusted beyond the schema. */
export function toImportDishes(read: MenuPhotoResult, ctx: TaxContext): ImportDish[] {
  const out: ImportDish[] = [];
  for (const d of read.dishes) {
    const name = d.name.trim().slice(0, 80); if (!name) continue;
    const { price, variants } = pricesToVariants(d.prices);
    const tax = taxFor(d, ctx);
    out.push({ name, name_local: d.name_local.trim() === name ? "" : d.name_local.trim().slice(0, 80), category: d.category.trim().slice(0, 40), price, variants,
      is_veg: !!d.is_veg, gst_rate: tax.gst_rate, hsn: tax.hsn, description: d.description.trim().slice(0, 140), spicy: !!d.spicy, jain: !!d.jain,
      confidence: Math.max(0, Math.min(1, Number(d.confidence) || 0)) });
  }
  return out;
}

/**
 * Several photos' results as one list: the same dish (by normalised name) on two pages — or twice on one — is one row.
 * The surer reading keeps the price and sizes; a blank on the kept row (description, the printed name, the section)
 * is filled from the other. Order is the pages' order.
 */
export function mergePhotos(pages: readonly (readonly ImportDish[])[]): ImportDish[] {
  const byKey = new Map<string, ImportDish>(); const order: string[] = [];
  for (const page of pages) for (const d of page) {
    const key = normName(d.name); if (!key) continue;
    const have = byKey.get(key);
    if (!have) { byKey.set(key, { ...d, variants: [...d.variants] }); order.push(key); continue; }
    const [keep, other] = d.confidence > have.confidence ? [d, have] : [have, d];
    byKey.set(key, {
      ...keep, variants: keep.variants.length ? [...keep.variants] : [...other.variants],
      price: keep.price || other.price,
      name_local: keep.name_local || other.name_local, category: keep.category || other.category, description: keep.description || other.description,
      spicy: keep.spicy || other.spicy, jain: keep.jain || other.jain, confidence: Math.max(keep.confidence, other.confidence),
    });
  }
  return order.map((k) => byKey.get(k)!);
}

export type ExistingDish = { id: string; name: string; category: string | null; price: number };
/** The dish already on the menu this row means — the same normalised name; when it is in several sections, the same section. */
export function findExisting(d: Pick<ImportDish, "name" | "category">, items: readonly ExistingDish[]): ExistingDish | null {
  const key = normName(d.name); if (!key) return null;
  const same = items.filter((i) => normName(i.name) === key);
  if (!same.length) return null;
  const cat = normCategory(d.category);
  return same.find((i) => normCategory(i.category ?? "") === cat) ?? same[0];
}

/** The sections a batch needs that the menu lacks, in the order they appear, each once. */
export function newCategories(rows: readonly Pick<ImportDish, "category">[], existing: readonly string[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const c = r.category.trim(); if (!c || matchCategory(c, existing)) continue;
    if (!out.some((o) => normCategory(o) === normCategory(c))) out.push(c);
  }
  return out;
}

export const GST_RATES = [0, 5, 12, 18, 28, 40] as const;
export const gstRateOk = (r: number | null) => r === null || (GST_RATES as readonly number[]).includes(r);
export const hsnOk = (h: string | null) => h === null || /^[0-9]{4,8}$/.test(h);

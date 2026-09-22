/**
 * Menu options — variants, add-ons and combos — as the till and the storefront see them.
 *
 * The database prices every line for real in price_line() (migration 0070); what is here is the
 * same arithmetic for the screen, so the cart shows the number the server will charge, and the
 * same rules, so a required choice is asked for before Send rather than refused after.
 */
export type Variant = { id: string; name: string; price: number; is_default?: boolean };
export type Addon = { id: string; name: string; price: number; is_veg?: boolean };
export type AddonGroup = { id: string; name: string; min: number; max: number; addons: Addon[] };
export type Optioned = { id: string; name: string; price: number; variants?: Variant[]; addon_groups?: AddonGroup[]; is_combo?: boolean; components?: { name: string; qty: number }[] };

/** Does this dish ask a question before it can go on a ticket? */
export const hasOptions = (i: Optioned) => (i.variants?.length ?? 0) > 0 || (i.addon_groups?.length ?? 0) > 0;

/** The variant a dish is sold in when nobody chose: the default, else the first. */
export const defaultVariant = (i: Optioned): Variant | null =>
  i.variants?.length ? (i.variants.find((v) => v.is_default) ?? i.variants[0]) : null;

/** What one unit costs with these choices: the variant's price stands in for the dish's, add-ons are added. */
export const linePrice = (i: Optioned, variant: Variant | null, addons: Addon[]) =>
  Number(variant ? variant.price : i.price) + addons.reduce((t, a) => t + Number(a.price), 0);

/** The price to show on a menu tile: a dish sold in sizes shows its cheapest, marked "from". */
export const tilePrice = (i: Optioned): { price: number; from: boolean } => {
  if (!i.variants?.length) return { price: Number(i.price), from: false };
  const prices = i.variants.map((v) => Number(v.price));
  return { price: Math.min(...prices), from: prices.some((p) => p !== prices[0]) };
};

/** One cart line per distinct choice: the same dish as Half and as Full are two lines. */
export const lineKey = (itemId: string, variantId: string | null | undefined, addonIds: string[]) =>
  [itemId, variantId ?? "", [...addonIds].sort().join(",")].join("|");

/** What the line is called: "Biryani · Half", with add-ons listed under it by the screens. */
export const lineName = (i: Optioned, variant: Variant | null) => variant ? `${i.name} · ${variant.name}` : i.name;

/**
 * The first rule the choice breaks, in the words the server would use — or null when it is fine.
 * A group's minimum and maximum are counted over the add-ons picked from that group.
 */
export const optionProblem = (i: Optioned, addons: Addon[]): string | null => {
  for (const g of i.addon_groups ?? []) {
    const n = addons.filter((a) => g.addons.some((x) => x.id === a.id)).length;
    if (n < g.min) return `${i.name} needs ${g.min} choice${g.min === 1 ? "" : "s"} from "${g.name}"`;
    if (g.max > 0 && n > g.max) return `"${g.name}" allows at most ${g.max} for ${i.name}`;
  }
  return null;
};

/** The lines a ticket or receipt prints under a dish: a combo's parts, then its add-ons. */
export const lineExtras = (l: { addons?: { name: string }[] | null; components?: { name: string; qty: number }[] | null }): string[] => [
  ...(l.components ?? []).map((c) => `${c.qty}\u00d7 ${c.name}`),
  ...(l.addons ?? []).map((a) => `+ ${a.name}`),
];

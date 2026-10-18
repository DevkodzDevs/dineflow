/** The TV screen (/screen/[key], 0103) — the parts that are arithmetic, kept here so they can be tested. */

export type Section<D> = { cat: string; part: number; parts: number; items: D[] };

/**
 * Lay the menu out as pages of `rows` rows, `cols` dishes a row. Short categories share a page (a category of three
 * on a page of its own left most of the wall empty); a long one is cut into parts that each fill a page, marked
 * "2/3". A category always starts on a fresh row, and empty ones are skipped.
 */
export function menuPages<D>(menu: { name: string; items: D[] }[], cols: number, rows: number) {
  const c = Math.max(1, Math.floor(cols)), r = Math.max(1, Math.floor(rows)), per = c * r;
  const pages: Section<D>[][] = []; let page: Section<D>[] = []; let used = 0;
  const flush = () => { if (page.length) pages.push(page); page = []; used = 0; };
  for (const cat of menu) {
    if (!cat.items?.length) continue;
    const parts = Math.ceil(cat.items.length / per);
    for (let p = 0; p < parts; p++) {
      const items = cat.items.slice(p * per, (p + 1) * per); const need = Math.ceil(items.length / c);
      if (used + need > r) flush();
      page.push({ cat: cat.name, part: p + 1, parts, items }); used += need;
    }
  }
  flush();
  return pages;
}

/** Which ready tokens are new since the last look — the ones the screen makes glow. */
export const freshTokens = (before: Iterable<number>, now: number[]) => { const seen = new Set(before); return now.filter((t) => !seen.has(t)); };

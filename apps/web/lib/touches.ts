/**
 * The six touches of 2026-11-16 (the owner's six videos, approved from mock-ups on the real screens): the pure parts,
 * tested. Reports' money flow (a Sankey from where the money came from to how it was paid), the guest page's
 * constellation stars, the booking sheet's stitched seam, the checklist burn, the menu import's orbit and the bell
 * that rings. The drawing lives with each screen; what can be reasoned about without a browser lives here.
 */

export type FlowNode = { name: string; amount: number };
export type FlowBand = FlowNode & { y: number; h: number; share: number };
export type FlowLayout = { left: FlowBand[]; right: FlowBand[]; leftTotal: number; rightTotal: number; top: number; height: number; gap: number };

/**
 * Lay the two sides of the flow out as vertical bands of one shared height. Each side is scaled to its own total
 * (what came in by order type and what was paid by method need not agree to the paisa — a pending bill is on one side
 * only), biggest first, rows of nothing dropped, and a gap between bands that the till bar in the middle does not have:
 * a band's share of its side is also its share of the till.
 */
export function sankeyLayout(leftIn: FlowNode[], rightIn: FlowNode[], { height = 240, top = 16, gap = 10 } = {}): FlowLayout {
  const clean = (xs: FlowNode[]) => xs.map((x) => ({ name: x.name, amount: Math.max(0, Number(x.amount) || 0) })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
  const stack = (xs: FlowNode[]): { bands: FlowBand[]; total: number } => {
    const total = xs.reduce((s, x) => s + x.amount, 0);
    const usable = height - gap * Math.max(0, xs.length - 1);
    let y = top;
    const bands = xs.map((x) => { const share = total ? x.amount / total : 0; const h = Math.max(total ? 2 : 0, share * usable); const b = { ...x, y, h, share }; y += h + gap; return b; });
    return { bands, total };
  };
  const l = stack(clean(leftIn)), r = stack(clean(rightIn));
  return { left: l.bands, right: r.bands, leftTotal: l.total, rightTotal: r.total, top, height, gap };
}

/** Where a side's bands land on the till bar (no gaps): the same shares, stacked from the top. */
export function tillSlots(bands: FlowBand[], top: number, height: number): { y: number; h: number }[] {
  let y = top; return bands.map((b) => { const h = b.share * height; const s = { y, h }; y += h; return s; });
}

/** The tone a rating lights the sky in: coral for a complaint, amber for "okay", blue for a good night. */
export const starTone = (n: number): "low" | "mid" | "high" | "none" => (n <= 0 ? "none" : n <= 2 ? "low" : n === 3 ? "mid" : "high");

/**
 * The seam's needle: the first step that is not done is the one being sewn; with every step done the needle rests on the
 * last. `pct` is how far along the seam the thread has been pulled, 0 at the first dot and 1 at the last.
 */
export function seamStep(done: boolean[]): { current: number; pct: number } {
  const n = done.length; if (n === 0) return { current: 0, pct: 0 };
  const first = done.findIndex((d) => !d); const current = first === -1 ? n - 1 : first;
  return { current, pct: n === 1 ? 1 : current / (n - 1) };
}

/** The bell swings when something new arrives — not on the first count it learns, and not when the count goes down. */
export const shouldRing = (prev: number | null, next: number) => prev !== null && next > prev;

/** How far an import is: pages that have finished (read or failed) over every page asked for; nothing asked → 0. */
export const importProgress = (pages: { status: "reading" | "done" | "error" }[]) => (pages.length ? pages.filter((p) => p.status !== "reading").length / pages.length : 0);

/** A charge someone can pick: its words, and what it cost the last time it went on a folio here (when it has). */
export type Preset = { name: string; amount: number | null; used: boolean };

/** The usual extras and discounts a desk posts — offered after the ones this property has used (2026-11-04). No "Late check-out":
 *  0171 works that fee out and adds it to the folio itself — a hand-posted one would charge it twice. */
export const EXTRA_PRESETS = ["Laundry", "Minibar", "Airport pickup", "Airport drop", "Extra bed", "Early check-in", "Breakfast", "Room service", "Spa", "Damage charge"];
export const DISCOUNT_PRESETS = ["Loyal guest", "Corporate rate", "Long stay", "Service recovery", "Manager's discount"];

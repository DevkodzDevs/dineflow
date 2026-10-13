/**
 * The answer of a write that must change a row.
 *
 * With RLS and the role walls (0098), a write the caller may not make changes no row and returns no error —
 * and a write aimed at a row that has moved on (a room that is now occupied) matches nothing. Screens used to
 * say "saved" either way. Ask for `.select("id")` on the write and pass the result here with what to tell the
 * person when nothing changed.
 */
export function wrote(r: { data: unknown[] | null; error: { message: string; code?: string } | null }, nothing: string): { error: string } | null {
  if (r.error) return { error: r.error.message };
  if (!r.data || r.data.length === 0) return { error: nothing };
  return null;
}

/** A GSTIN: two digits of state, a PAN, the entity number, Z, a check character. */
export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

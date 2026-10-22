/** The screens a tab has shown, oldest first (components/shell/BackButton.tsx keeps it in sessionStorage). */
export type Trail = string[];

/** One level up from a path, for Back when no app screen is behind it: its parent, or for a section, home —
 *  /orders/new → /orders, /billing/<id> → /billing, /orders → home. */
export const parentOf = (path: string, home: string) => {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 1 ? `/${parts.slice(0, -1).join("/")}` : home;
};

/** The trail after arriving at `url`: the same screen again (a refresh) changes nothing; a step back (`back`: the
 *  browser's back, or Back opening the screen before) onto the screen before takes the last one off; anything else —
 *  even the screen before, reached from the menu — is a new screen on the end. Going up a level (`up`) stands in for the
 *  screen it left, so the next Back goes up again rather than down to where it came from. */
export function step(t: Trail, url: string, back = false, up = false): Trail {
  if (t[t.length - 1] === url) return t;
  if (up) return [...t.slice(0, -1), url];
  if (back && t.length > 1 && t[t.length - 2] === url) return t.slice(0, -1);
  return [...t, url];
}

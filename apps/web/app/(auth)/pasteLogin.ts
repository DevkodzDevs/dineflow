/**
 * A login pasted whole (2026-10-30, the owner: "I need only the password to copy"). Master control used to copy
 * "<id> / <password>" as one string, and pasted into the Password box that whole string became the password. Sign-in
 * now takes such a paste apart on the device, at paste time — nothing is sent anywhere and sign-in itself is unchanged.
 *
 * `splitPastedLogin(text)` returns `{ id, password }` when the text is clearly an id and a password together, or `null`
 * for anything else (an ordinary password, which pastes as it always did). Understood shapes:
 *   "<id> / <password>"   ·   "<id>\t<password>"   ·   two lines   ·   labelled lines ("User ID: …", "Login ID: …",
 *   "Temporary password: …", "Password: …"; a "DineFlow code: …" line is ignored).
 * The id part must look like a login — no spaces, at least three characters, at most one @ — so a password that
 * merely contains " / " is left alone unless it starts with something id-shaped.
 */
export type PastedLogin = { id: string; password: string };

const ID_SHAPE = /^[^\s/@]{3,}(@[^\s@/]+\.[a-z]{2,})?$/i;
const looksLikeId = (s: string) => s.length <= 254 && ID_SHAPE.test(s);

function fromLabelled(lines: string[]): PastedLogin | null {
  let id: string | null = null, password: string | null = null, labelled = 0;
  for (const line of lines) {
    const m = /^([a-z][a-z \-]{1,30}?)\s*:\s*(.*)$/i.exec(line);
    if (!m) return null;                         // a stray unlabelled line in a labelled block: not ours
    const key = m[1].trim().toLowerCase(), value = m[2].trim();
    labelled++;
    if (/password/.test(key)) password = value;
    else if (/^(user ?id|login ?id|login|id|user|email|username)$/.test(key)) id = value;
    else if (/code/.test(key)) continue;         // "DineFlow code: …" — the property code, not needed to sign in
    else return null;
  }
  if (!labelled || !id || !password || !looksLikeId(id)) return null;
  return { id, password };
}

export function splitPastedLogin(raw: string): PastedLogin | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\r\n?/g, "\n").trim();
  if (!text) return null;

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    const labelled = fromLabelled(lines);
    if (labelled) return labelled;
    if (lines.length === 2 && looksLikeId(lines[0])) return { id: lines[0], password: lines[1] };
    return null;
  }

  const one = lines[0];
  for (const sep of ["\t", " / "]) {
    const at = one.indexOf(sep);
    if (at <= 0) continue;
    const id = one.slice(0, at).trim(), password = one.slice(at + sep.length).trim();
    if (password && looksLikeId(id)) return { id, password };
  }
  return null;
}

/** The same login, as far as the form is concerned: equal ignoring case, or a bare id against its full address. */
export function sameLogin(a: string, b: string): boolean {
  const x = a.trim().toLowerCase(), y = b.trim().toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  const local = (s: string) => s.split("@")[0];
  return (x.includes("@") !== y.includes("@")) && local(x) === local(y);
}

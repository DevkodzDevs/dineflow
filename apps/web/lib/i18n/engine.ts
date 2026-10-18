/**
 * The whole app in Tamil or in Hindi (2026-10-18) — the matching half, kept pure so it can be tested.
 *
 * Every screen writes its English straight into its own code, so the full-language modes do not touch
 * the screens: `components/ui/FullLanguage.tsx` walks what is on the page and swaps each piece of
 * English it knows for the chosen language, using a dictionary built from the app's own strings
 * (`public/i18n/{ta,hi}.json`, made by `scripts/i18n-check.mjs` + translation). This file decides what
 * a piece of text becomes:
 *
 * 1. an exact match on the text, whitespace collapsed ("Save expense" → "செலவைச் சேமி");
 * 2. the same with its trailing colon/full stop set aside ("Guest:" → "விருந்தினர்:");
 * 3. a template with values in it ("{0} min ago", "Room {0} · {1}") — the values are kept, or
 *    translated themselves when they are known words, and may move where the grammar needs them;
 * 4. in a date or time ("Sun, 18 Oct"), the month and day names.
 *
 * Anything else stays as it is — a name, a dish, a room number, a price.
 */
export type Dict = { strings: Record<string, string>; patterns?: [string, string][]; words?: Record<string, string> };
export type Translate = (text: string) => string | null;

export const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const letters = (s: string) => (s.match(/[A-Za-z]/g) ?? []).length;

type Pat = { re: RegExp; out: string; key: string; size: number; tails: Set<number> };

/** Month and day names, for dates the app formats itself. */
export const DATE_WORDS: Record<"ta" | "hi", Record<string, string>> = {
  ta: {
    January: "ஜனவரி", February: "பிப்ரவரி", March: "மார்ச்", April: "ஏப்ரல்", May: "மே", June: "ஜூன்", July: "ஜூலை", August: "ஆகஸ்ட்", September: "செப்டம்பர்", October: "அக்டோபர்", November: "நவம்பர்", December: "டிசம்பர்",
    Jan: "ஜன", Feb: "பிப்", Mar: "மார்", Apr: "ஏப்", Jun: "ஜூன்", Jul: "ஜூலை", Aug: "ஆக", Sep: "செப்", Sept: "செப்", Oct: "அக்", Nov: "நவ", Dec: "டிச",
    Sunday: "ஞாயிறு", Monday: "திங்கள்", Tuesday: "செவ்வாய்", Wednesday: "புதன்", Thursday: "வியாழன்", Friday: "வெள்ளி", Saturday: "சனி",
    Sun: "ஞாயி", Mon: "திங்", Tue: "செவ்", Wed: "புத", Thu: "வியா", Fri: "வெள்", Sat: "சனி",
  },
  hi: {
    January: "जनवरी", February: "फ़रवरी", March: "मार्च", April: "अप्रैल", May: "मई", June: "जून", July: "जुलाई", August: "अगस्त", September: "सितंबर", October: "अक्टूबर", November: "नवंबर", December: "दिसंबर",
    Jan: "जन", Feb: "फ़र", Mar: "मार्च", Apr: "अप्रै", Jun: "जून", Jul: "जुला", Aug: "अग", Sep: "सित", Sept: "सित", Oct: "अक्टू", Nov: "नव", Dec: "दिस",
    Sunday: "रविवार", Monday: "सोमवार", Tuesday: "मंगलवार", Wednesday: "बुधवार", Thursday: "गुरुवार", Friday: "शुक्रवार", Saturday: "शनिवार",
    Sun: "रवि", Mon: "सोम", Tue: "मंगल", Wed: "बुध", Thu: "गुरु", Fri: "शुक्र", Sat: "शनि",
  },
};

/** Builds the translate function for one dictionary. Results are cached per distinct text. */
export function makeTranslator(d: Dict): Translate {
  const exact = new Map<string, string>();
  // an empty translation is allowed on purpose: the second half of a word split across two elements
  // ("Neigh" + "bours") has nothing left to say once the first half carries the whole word
  for (const [k, v] of Object.entries(d.strings)) if (typeof v === "string") exact.set(norm(k), v);

  const pats: Pat[] = [];
  for (const [en, out] of d.patterns ?? []) {
    const parts = en.split(/(\{\d+\})/);
    const lit = parts.filter((p) => !/^\{\d+\}$/.test(p));
    if (letters(lit.join("")) < 2) continue;                       // "{0} · {1}" would match everything
    if (/</.test(en)) continue;                                      // printed HTML, not a screen's text
    const groups = parts.filter((p) => /^\{\d+\}$/.test(p)).map((p) => Number(p.slice(1, -1)));
    // a value glued straight onto a letter ("section{1}") is an English ending — "s", "y", "ies" — with
    // nothing to join in Tamil or Hindi, so it is dropped
    const tails = new Set<number>();
    for (const m of en.matchAll(/[A-Za-z]\{(\d+)\}/g)) tails.add(groups.indexOf(Number(m[1])));
    // group i of the expression is placeholder groups[i]; a placeholder appears once. An ending may be
    // empty ("1 section"), anything else holds at least one character
    let gi = -1;
    const src = "^" + parts.map((p) => (/^\{\d+\}$/.test(p) ? (tails.has(++gi) ? "([a-z]{0,3})" : "(.+?)") : esc(p))).join("") + "$";
    const key = lit.slice().sort((a, b) => b.length - a.length)[0] ?? "";
    pats.push({ re: new RegExp(src), out: out.replace(/\{(\d+)\}/g, (_, n) => `\u0000${groups.indexOf(Number(n))}\u0000`), key, size: letters(lit.join("")), tails });
  }
  pats.sort((a, b) => b.size - a.size);                            // the more specific template first

  const words = d.words ?? {};
  const wordRe = Object.keys(words).length ? new RegExp(`\\b(${Object.keys(words).sort((a, b) => b.length - a.length).map(esc).join("|")})\\b`, "g") : null;

  const dated = (v: string) => { if (!wordRe || !/\d/.test(v)) return v; wordRe.lastIndex = 0; return v.replace(wordRe, (w) => words[w] ?? w); };
  // a value may bring a separator with it ("Clean ·" from "{0} Room {1}"): the word inside is still known
  const value = (v: string) => {
    const hit = exact.get(norm(v)); if (hit !== undefined) return hit;
    const m = v.match(/^([\s·:—–-]*)(.*?)([\s·:—–-]*)$/);
    const inner = m && exact.get(norm(m[2]));
    return inner !== undefined && inner !== null && m ? m[1] + inner + m[3] : dated(v);
  };
  /* What fills a template is a value — a number, a name, a room, an amount, a date — not a sentence. Without
     this, "{0} to {1}" swallowed "11 dishes have no recipe, so no plate cost — add recipes in Menu to place
     them." and came out half-translated. A template with little of its own text is held to short values. */
  const fits = (p: Pat, v: string) => {
    if (/[.!?;]\s|—/.test(v)) return false;
    const words = v.trim().split(/\s+/).length;
    return p.size < 6 ? v.length <= 24 && words <= 3 : v.length <= 48 && words <= 6;
  };
  const core = (t: string): string | null => {
    const hit = exact.get(t); if (hit !== undefined) return hit;
    const tail = t.match(/^(.*?[A-Za-z)])\s*([:.…]+)$/);
    if (tail) { const h = exact.get(tail[1]); if (h !== undefined) return h + tail[2]; }
    for (const p of pats) {
      if (p.key && !t.includes(p.key)) continue;
      const m = p.re.exec(t); if (!m) continue;
      if (!m.slice(1).every((v, i) => p.tails.has(i) || fits(p, v))) continue;
      return p.out.replace(/\u0000(\d+)\u0000/g, (_, i) => { const v = m[Number(i) + 1] ?? ""; return p.tails.has(Number(i)) && /^[a-z]{0,3}$/.test(v) ? "" : value(v); });
    }
    // a day or month on its own ("Sunday", "October"), or inside a date or a time ("Sun, 18 Oct")
    if (words[t] && t.length > 3) return words[t];
    if (wordRe && /\d/.test(t)) { wordRe.lastIndex = 0; if (wordRe.test(t)) { wordRe.lastIndex = 0; return t.replace(wordRe, (w) => words[w] ?? w); } }
    return null;
  };

  const cache = new Map<string, string | null>();
  return (text: string) => {
    if (!/[A-Za-z]/.test(text)) return null;
    const t = norm(text); if (!t) return null;
    let out = cache.get(t);
    if (out === undefined) { out = core(t); if (cache.size > 20000) cache.clear(); cache.set(t, out); }
    if (out == null || out === t) return null;
    const lead = text.match(/^\s*/)![0], trail = text.match(/\s*$/)![0];
    return lead + out + trail;
  };
}

/** An English plural ending glued on in code ("arrival" + "s") has nothing to join once its word is translated. */
export const isPluralTail = (s: string) => /^(s|es)$/.test(norm(s));

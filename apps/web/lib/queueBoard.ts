/**
 * The waiting-list TV board (/screen/[key]/queue, 0179) — the parts that are arithmetic or words, kept here so they can
 * be tested: which numbers were just called (the board says them aloud), and the sentence it says, in English, Tamil or
 * Hindi.
 */
export type BoardCalled = { no: number; party: number; table: string | null; at: string | null };
export type BoardWaiting = { no: number; party: number; since: string; held: boolean; quoted?: number | null };
export type BoardFeed = { name: string; logo: string | null; slug: string | null; called: BoardCalled[]; waiting: BoardWaiting[]; at: string };
export type BoardLang = "en" | "ta" | "hi";

/** The called numbers that are new since the last look — oldest first, so two calls at once are said in order. */
export function newlyCalled(before: Iterable<number>, now: BoardCalled[]): BoardCalled[] {
  const seen = new Set(before);
  return now.filter((c) => !seen.has(c.no)).sort((a, b) => (a.at ?? "").localeCompare(b.at ?? "") || a.no - b.no);
}

const SPEECH: Record<BoardLang, { lang: string; say: (no: number, table: string | null) => string }> = {
  en: { lang: "en-IN", say: (no, t) => t ? `Number ${no}, your table ${t} is ready. Please come to the host stand.` : `Number ${no}, your table is ready. Please come to the host stand.` },
  ta: { lang: "ta-IN", say: (no, t) => t ? `எண் ${no}, உங்கள் மேசை ${t} தயார். தயவுசெய்து வரவேற்பு இடத்திற்கு வாருங்கள்.` : `எண் ${no}, உங்கள் மேசை தயார். தயவுசெய்து வரவேற்பு இடத்திற்கு வாருங்கள்.` },
  hi: { lang: "hi-IN", say: (no, t) => t ? `नंबर ${no}, आपकी टेबल ${t} तैयार है। कृपया काउंटर पर आइए।` : `नंबर ${no}, आपकी टेबल तैयार है। कृपया काउंटर पर आइए।` },
};
/** What the board says for one called number: the sentence and the BCP-47 tag a voice is picked by. */
export const boardLine = (lang: BoardLang, no: number, table: string | null) => ({ text: SPEECH[lang].say(no, table), lang: SPEECH[lang].lang });

/** The board's languages, in the order they are said: the chosen one first, then English once more when it was not English —
 *  a mixed room hears both. */
export const boardLangs = (lang: BoardLang): BoardLang[] => (lang === "en" ? ["en"] : [lang, "en"]);

export const readBoardLang = (v: string | null | undefined): BoardLang => (v === "ta" || v === "hi" ? v : "en");

/** Minutes waited, as the board prints them: "12 min", "1h 05m". */
export const waitedText = (sinceIso: string, now: number) => {
  const m = Math.max(0, Math.floor((now - Date.parse(sinceIso)) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};

/** Where a waiting guest stands against the minutes they were told: minutes left (0 when over or when a table is already
 *  held for them), and how much of the told wait has passed (0..1; 1 when over, held or nothing was told). */
export function waitLeft(w: { since: string; held: boolean; quoted?: number | null }, now: number): { left: number; share: number; soon: boolean } {
  const waited = Math.max(0, (now - Date.parse(w.since)) / 60000);
  if (w.held) return { left: 0, share: 1, soon: true };
  if (w.quoted == null || w.quoted <= 0) return { left: 0, share: 1, soon: false };
  const left = Math.max(0, Math.ceil(w.quoted - waited));
  return { left, share: Math.min(1, waited / w.quoted), soon: left <= 0 };
}

/** The wait a newcomer hears right now: the median of what the waiting were told, null when nobody was told anything. */
export function typicalWait(waiting: { quoted?: number | null }[]): number | null {
  const q = waiting.map((w) => w.quoted).filter((n): n is number => typeof n === 'number' && n > 0).sort((a, b) => a - b);
  if (!q.length) return null;
  return q[Math.floor((q.length - 1) / 2)];
}

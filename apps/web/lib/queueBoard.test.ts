import { describe, it, expect } from "vitest";
import { newlyCalled, boardLine, boardLangs, readBoardLang, waitedText, waitLeft, typicalWait } from "./queueBoard";

describe("the waiting-list board (0179)", () => {
  const c = (no: number, at: string | null = null, table: string | null = null) => ({ no, party: 2, table, at });
  it("says the numbers called since the last look, oldest call first", () => {
    const now = [c(14, "2026-11-10T10:05:00Z", "T4"), c(12, "2026-11-10T10:04:00Z"), c(9, "2026-11-10T09:50:00Z")];
    expect(newlyCalled([9], now).map((x) => x.no)).toEqual([12, 14]);
    expect(newlyCalled([9, 12, 14], now)).toEqual([]);
    expect(newlyCalled([], []).length).toBe(0);
  });
  it("two calls with the same time are said in number order", () => {
    expect(newlyCalled([], [c(7, "2026-11-10T10:00:00Z"), c(3, "2026-11-10T10:00:00Z")]).map((x) => x.no)).toEqual([3, 7]);
  });
  it("the sentence names the number and the table when one is held, in the right tongue", () => {
    expect(boardLine("en", 12, "T4")).toEqual({ text: "Number 12, your table T4 is ready. Please come to the host stand.", lang: "en-IN" });
    expect(boardLine("en", 12, null).text).toBe("Number 12, your table is ready. Please come to the host stand.");
    expect(boardLine("ta", 12, "T4").text).toContain("எண் 12");
    expect(boardLine("ta", 12, "T4").lang).toBe("ta-IN");
    expect(boardLine("hi", 5, null).text).toContain("नंबर 5");
  });
  it("a Tamil or Hindi board says it in English too; English once", () => {
    expect(boardLangs("ta")).toEqual(["ta", "en"]);
    expect(boardLangs("hi")).toEqual(["hi", "en"]);
    expect(boardLangs("en")).toEqual(["en"]);
  });
  it("reads a language from the link and falls back to English", () => {
    expect(readBoardLang("ta")).toBe("ta"); expect(readBoardLang("hi")).toBe("hi");
    expect(readBoardLang("fr")).toBe("en"); expect(readBoardLang(undefined)).toBe("en");
  });
  it("prints the wait as a person says it", () => {
    const t = Date.parse("2026-11-10T10:00:00Z");
    expect(waitedText("2026-11-10T09:48:00Z", t)).toBe("12 min");
    expect(waitedText("2026-11-10T08:55:00Z", t)).toBe("1h 05m");
    expect(waitedText("2026-11-10T10:01:00Z", t)).toBe("0 min");
  });
  it("a waiting card knows how much of the told wait is left", () => {
    const t = Date.parse("2026-11-10T10:00:00Z");
    expect(waitLeft({ since: "2026-11-10T09:48:00Z", held: false, quoted: 20 }, t)).toEqual({ left: 8, share: 0.6, soon: false });
    expect(waitLeft({ since: "2026-11-10T09:30:00Z", held: false, quoted: 20 }, t)).toEqual({ left: 0, share: 1, soon: true });
    expect(waitLeft({ since: "2026-11-10T09:58:00Z", held: true, quoted: 20 }, t)).toEqual({ left: 0, share: 1, soon: true });
    expect(waitLeft({ since: "2026-11-10T09:58:00Z", held: false, quoted: null }, t)).toEqual({ left: 0, share: 1, soon: false });
  });
  it("the wait a newcomer hears is the median of what the waiting were told", () => {
    expect(typicalWait([{ quoted: 10 }, { quoted: 40 }, { quoted: 20 }])).toBe(20);
    expect(typicalWait([{ quoted: 10 }, { quoted: 40 }])).toBe(10);
    expect(typicalWait([{ quoted: null }, {}])).toBeNull();
  });
});

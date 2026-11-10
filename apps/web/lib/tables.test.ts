import { describe, it, expect } from "vitest";
import { pickTables, tablesLabel, seatsOf } from "./tables";

/** Joined tables for a big party (0180). manoooo's floor: eight 4-seaters in Main, a 2 and a 4 in Garden, 4/6/4/4 on the Terrace. */
const t = (name: string, capacity: number, zone: string, sort_order: number) => ({ id: name, name, capacity, zone, sort_order });
const FLOOR = [t("T1", 4, "Main", 1), t("T2", 4, "Main", 2), t("T3", 4, "Main", 3), t("T4", 4, "Main", 4), t("T9", 2, "Garden", 9), t("T10", 4, "Garden", 10), t("T11", 4, "Terrace", 11), t("T12", 6, "Terrace", 12), t("T13", 4, "Terrace", 13)];
const names = (ts: ReturnType<typeof pickTables>) => ts.map((x) => x.name);

describe("picking tables for a party", () => {
  it("a party that fits one table gets the smallest that fits", () => {
    expect(names(pickTables(FLOOR, 2))).toEqual(["T9"]);
    expect(names(pickTables(FLOOR, 4))).toEqual(["T1"]);
    expect(names(pickTables(FLOOR, 6))).toEqual(["T12"]);
  });
  it("a party of 8 gets two tables in one zone, the fewest seats that fit, nearest first", () => {
    expect(names(pickTables(FLOOR, 8))).toEqual(["T1", "T2"]);
  });
  it("a party of 10 gets the 6 and a 4 on the Terrace rather than three 4s", () => {
    expect(names(pickTables(FLOOR, 10))).toEqual(["T11", "T12"]);
  });
  it("a party of 12 takes three tables in one zone when no pair reaches", () => {
    expect(names(pickTables(FLOOR, 12))).toEqual(["T1", "T2", "T3"]);
  });
  it("never joins across zones, never more than three, and copes with nothing", () => {
    expect(pickTables([t("A", 4, "Main", 1), t("B", 4, "Garden", 2)], 8)).toEqual([]);
    expect(pickTables(FLOOR, 20)).toEqual([]);
    expect(pickTables([], 2)).toEqual([]);
    expect(pickTables(FLOOR, 0)).toEqual([]);
  });
  it("names and seats", () => {
    const pick = pickTables(FLOOR, 8);
    expect(tablesLabel(names(pick))).toBe("T1 + T2");
    expect(seatsOf(pick)).toBe(8);
  });
});

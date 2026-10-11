import { describe, expect, it } from "vitest";
import { ticketsFor } from "./route";
import type { KotData } from "./escpos";

const kot: KotData = {
  kotNo: "KOT 12", when: "19:04", tableOrType: "T4",
  items: [
    { name: "Chicken tikka", qty: 1, station: "Grill" },
    { name: "Masala dosa", qty: 2, station: "Dosa" },
    { name: "Lime soda", qty: 1, station: null },
  ],
};
const counter = { name: "Counter", station: null };
const grill = { name: "Grill printer", station: "Grill" };
const dosa = { name: "Dosa printer", station: "Dosa" };
const bar = { name: "Bar printer", station: "Bar" };

describe("kitchen ticket routing by station", () => {
  it("a printer with no station prints the whole ticket", () => {
    const [t] = ticketsFor([counter], kot);
    expect(t.printer).toBe(counter);
    expect(t.ticket.items.map((i) => i.name)).toEqual(["Chicken tikka", "Masala dosa", "Lime soda"]);
    expect(t.ticket.station).toBeNull();
  });
  it("a station printer prints only its own lines, headed with its station", () => {
    const out = ticketsFor([grill, dosa], kot);
    expect(out.map((t) => [t.printer.name, t.ticket.items.map((i) => `${i.qty} ${i.name}`), t.ticket.station])).toEqual([
      ["Grill printer", ["1 Chicken tikka"], "Grill"],
      ["Dosa printer", ["2 Masala dosa"], "Dosa"],
    ]);
  });
  it("a station with nothing on the ticket prints nothing", () => {
    expect(ticketsFor([bar], kot)).toEqual([]);
  });
  it("a ticket already addressed to one station reaches that station's printer even when its lines carry none", () => {
    const addressed: KotData = { ...kot, station: "Bar", items: [{ name: "Old monk", qty: 2 }] };
    const out = ticketsFor([bar, grill, counter], addressed);
    expect(out.map((t) => t.printer.name)).toEqual(["Bar printer", "Counter"]);
  });
});

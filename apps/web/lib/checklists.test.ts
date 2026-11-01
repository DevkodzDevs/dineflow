import { describe, it, expect } from "vitest";
import { listByPosition, listFor, changedFor } from "./checklists";

// the database's _checklist_default / _checklist_for_me (0123, 0162)
const everyone = { id: "e" };
const kitchen = { id: "k", departments: ["kitchen"] };
const captain = { id: "c", positions: ["captain"] };
const waiter = { id: "w", jobs: ["waiter"] };
const cook = { id: "u1", role: "chef", department: null, position: "commis_2" };
const host = { id: "u2", role: "waiter", department: "service", position: "captain" };

describe("checklists — by position", () => {
  it("a list naming nobody is everyone's", () => { expect(listByPosition(everyone, cook)).toBe(true); });
  it("a team: the person's department, else their role's", () => {
    expect(listByPosition(kitchen, cook)).toBe(true);           // chef → Kitchen
    expect(listByPosition(kitchen, host)).toBe(false);
  });
  it("a job and a position", () => {
    expect(listByPosition(waiter, host)).toBe(true);
    expect(listByPosition(captain, host)).toBe(true);
    expect(listByPosition(captain, cook)).toBe(false);
  });
});

describe("checklists — per person (0162)", () => {
  it("someone given a list gets it whatever their position", () => { expect(listFor({ ...kitchen, people: ["u2"] }, host)).toBe(true); });
  it("someone taken off a list loses it, an Everyone list too", () => {
    expect(listFor({ ...kitchen, people_off: ["u1"] }, cook)).toBe(false);
    expect(listFor({ ...everyone, people_off: ["u1"] }, cook)).toBe(false);
  });
  it("a new person (no id yet) follows the position", () => { expect(listFor({ ...kitchen, people_off: ["u1"] }, { ...cook, id: null })).toBe(true); });
  it("changedFor says whether anything was changed for them", () => {
    expect(changedFor([kitchen, { ...everyone, people_off: ["u1"] }], "u1")).toBe(true);
    expect(changedFor([kitchen, everyone], "u1")).toBe(false);
  });
});

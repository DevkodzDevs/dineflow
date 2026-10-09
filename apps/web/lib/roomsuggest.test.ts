import { describe, it, expect } from "vitest";
import { suggestRoom, type SRoom, type SStay } from "./roomsuggest";

const room = (id: string, floor: number, condition: string, type = "std", status = "available"): SRoom => ({ id, number: id, floor, status, condition, room_type_id: type });
const stay = (id: string, room_id: string, status = "reserved", check_in = "2026-10-09", check_out = "2026-10-11"): SStay => ({ id, room_id, status, check_in, check_out });
const ROOMS = [room("101", 1, "dirty"), room("102", 1, "clean"), room("103", 1, "inspected"), room("201", 2, "inspected"), room("301", 3, "inspected", "suite")];

describe("suggestRoom", () => {
  it("offers nothing when the booked room is ready", () => {
    expect(suggestRoom(stay("a", "103"), ROOMS, [], false)).toBeNull();
  });
  it("prefers inspected on the same floor, same type only", () => {
    expect(suggestRoom(stay("a", "101"), ROOMS, [], false)?.number).toBe("103");
  });
  it("skips a room another stay holds for those nights", () => {
    expect(suggestRoom(stay("a", "101"), ROOMS, [stay("b", "103")], false)?.number).toBe("201");
  });
  it("takes a cleaned room only when inspection is not required", () => {
    const rooms = [room("101", 1, "dirty"), room("102", 1, "clean")];
    expect(suggestRoom(stay("a", "101"), rooms, [], false)?.number).toBe("102");
    expect(suggestRoom(stay("a", "101"), rooms, [], true)).toBeNull();
  });
});

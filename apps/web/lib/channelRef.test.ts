import { describe, it, expect } from "vitest";
import { shortRef, channelSource, channelChip, roomLabel } from "./channelRef";

describe("roomLabel", () => {
  it("heads a room-service ticket with the room alone (it read 'Room · Room 1…')", () => {
    expect(roomLabel("Room 102 · Priya Raman")).toBe("Room 102");
    expect(roomLabel("Room 2B")).toBe("Room 2B");
    expect(roomLabel("Mr Rao")).toBe("Room · Mr Rao");
    expect(roomLabel(null)).toBe("Room service");
  });
});

// 0163: a channel order's reference on its kitchen ticket
describe("shortRef", () => {
  it("keeps what follows the last dash", () => {
    expect(shortRef("0-2fee")).toBe("2fee");
    expect(shortRef("TEST-040011")).toBe("040011");
    expect(shortRef("TBL-261102223301-2fee")).toBe("2fee");
  });
  it("keeps a short tail whole, and a long number's last six", () => {
    expect(shortRef("AB-1")).toBe("AB-1");
    expect(shortRef("1234567890123")).toBe("890123");
    expect(shortRef(" 4471 ")).toBe("4471");
  });
});

describe("channelSource", () => {
  it("names a table's website order QR and a parcel's Web", () => {
    expect(channelSource("website", "My website", true).source).toBe("QR");
    expect(channelSource("website", "My website", false).source).toBe("Web");
  });
  it("names a room's QR order Room (0170)", () => {
    expect(channelSource("website", "My website", false, true)).toEqual({ source: "Room", kind: "qr" });
    expect(channelChip({ display_id: "8-60e9", external_id: "RM-261103104428-60e9", room_id: "r1", order_channels: { kind: "website", label: "My website" } })).toMatchObject({ source: "Room", ref: "60e9" });
  });
  it("names the apps, and any other channel by its label", () => {
    expect(channelSource("swiggy", "Swiggy — manoooo", false).source).toBe("Swiggy");
    expect(channelSource("zomato", "x", false).source).toBe("Zomato");
    expect(channelSource("other", "Magicpin — manoooo", false).source).toBe("Magicpin");
    expect(channelSource("other", "", false).source).toBe("Online");
    expect(channelSource("other", "A very long channel name", false).source).toBe("A very long…");
  });
});

describe("channelChip", () => {
  it("builds the chip, and none for a till ticket", () => {
    expect(channelChip({ display_id: "0-2fee", external_id: "TBL-1-2fee", table_id: "t", order_channels: { kind: "website", label: "My website" } }))
      .toEqual({ source: "QR", kind: "qr", ref: "2fee", full: "0-2fee" });
    expect(channelChip({ display_id: null, external_id: "TEST-040011", order_channels: { kind: "swiggy", label: "Swiggy" } }))
      .toEqual({ source: "Swiggy", kind: "app", ref: "040011", full: "TEST-040011" });
    expect(channelChip(null)).toBeNull();
    expect(channelChip(undefined)).toBeNull();
  });
});

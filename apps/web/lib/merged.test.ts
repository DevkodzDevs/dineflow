import { describe, expect, it } from "vitest";
import { mergedTables } from "./merged";

describe("merged tables", () => {
  const open = [{ id: "C", table_id: "t3" }, { id: "D", table_id: "t9" }];
  it("names the table of an order merged into an open one, and follows a merge of a merge", () => {
    const rows = [{ id: "B", table_id: "t5", merged_into: "C" }, { id: "A", table_id: "t7", merged_into: "B" }];
    expect(mergedTables(rows, open)).toEqual({ C: ["t5", "t7"] });
  });
  it("leaves out the order's own table, a table seated again, and merges into an order no longer open", () => {
    const rows = [
      { id: "B", table_id: "t3", merged_into: "C" },   // same table as the order it joined
      { id: "E", table_id: "t9", merged_into: "C" },   // t9 has its own open order now (D)
      { id: "F", table_id: "t2", merged_into: "Z" },   // Z is closed
      { id: "G", table_id: null, merged_into: "C" },   // a parcel merged in
    ];
    expect(mergedTables(rows, open)).toEqual({});
    expect(mergedTables(null, open)).toEqual({});
  });
});

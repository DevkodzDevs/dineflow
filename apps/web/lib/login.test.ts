import { describe, expect, it } from "vitest";
import { loginCandidates, toLoginAddress } from "@dineflow/shared";

describe("sign-in ids on @dineflow.cloud (0130)", () => {
  it("a bare id gets the new house domain", () => {
    expect(toLoginAddress("Mano Hotel")).toBe("mano-hotel@dineflow.cloud");
  });
  it("a bare id is tried on the new domain, then the old one", () => {
    expect(loginCandidates("dine-res-mano-00001")).toEqual(["dine-res-mano-00001@dineflow.cloud", "dine-res-mano-00001@dineflow.local"]);
  });
  it("a full address is tried as typed, once", () => {
    expect(loginCandidates("owner@gmail.com")).toEqual(["owner@gmail.com"]);
    expect(loginCandidates("tan-resort@dineflow.local")).toEqual(["tan-resort@dineflow.local"]);
  });
  it("nothing typed is nothing to try", () => {
    expect(loginCandidates("  ")).toEqual([]);
  });
});

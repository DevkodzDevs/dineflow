// The data node's mirror (0189): which cloud files a NAS still needs, where each lands, and what it holds.
import { describe, it, expect } from "vitest";
import path from "node:path";
import { mirrorPlan, mirrorPath, mirrorStats, VERSION } from "../../public/data-node/dineflow-data-node.mjs";

type F = { key: string; bucket: string; name: string; size: number; updated_at: string; public: boolean };
const f = (bucket: string, name: string, size: number, at = "2026-11-20T00:00:00Z"): F => ({ key: `${bucket}/${name}`, bucket, name, size, updated_at: at, public: bucket !== "compliance" });

describe("mirrorPlan", () => {
  it("copies what the NAS lacks, what changed, and leaves the rest", () => {
    const cloud = [f("brand", "a/logo.png", 100), f("menu", "a/dish.jpg", 200), f("menu", "a/new.jpg", 300), f("compliance", "a/x/gst.pdf", 400, "2026-11-21T00:00:00Z")];
    const index = { "brand/a/logo.png": { size: 100, updated_at: "2026-11-20T00:00:00Z" }, "menu/a/dish.jpg": { size: 150, updated_at: "2026-11-20T00:00:00Z" }, "compliance/a/x/gst.pdf": { size: 400, updated_at: "2026-11-20T00:00:00Z" }, "menu/gone.jpg": { size: 9, updated_at: "2026-01-01T00:00:00Z" } };
    expect(mirrorPlan(cloud, index).map((x: F) => x.key)).toEqual(["menu/a/dish.jpg", "menu/a/new.jpg", "compliance/a/x/gst.pdf"]);
  });
  it("copies everything into an empty or missing index", () => {
    expect(mirrorPlan([f("brand", "l.png", 1)], {}).length).toBe(1);
    expect(mirrorPlan([f("brand", "l.png", 1)], null).length).toBe(1);
  });
});

describe("mirrorPath", () => {
  const root = path.resolve("/nas/files");
  it("keeps the bucket and the folder path", () => {
    expect(mirrorPath(root, "menu", "rest-1/dish.jpg")).toBe(path.join(root, "menu", "rest-1", "dish.jpg"));
  });
  it("never steps outside the files folder, however the name is spelt", () => {
    // a ".." is dropped, not honoured: the file lands inside the bucket folder whatever the name tried
    expect(mirrorPath(root, "menu", "../../etc/passwd").startsWith(path.join(root, "menu") + path.sep)).toBe(true);
    expect(() => mirrorPath(root, "menu", "")).toThrow();
    expect(mirrorPath(root, "menu", "./a/./b.png")).toBe(path.join(root, "menu", "a", "b.png"));
  });
});

describe("mirrorStats", () => {
  it("counts files and bytes, tolerating a missing size", () => {
    expect(mirrorStats({ a: { size: 10 }, b: { size: 5 }, c: {} })).toEqual({ files: 3, bytes: 15 });
    expect(mirrorStats(undefined)).toEqual({ files: 0, bytes: 0 });
  });
  it("is the 1.2 node, the one with the mirror", () => { expect(VERSION).toBe("1.2.0"); });
});

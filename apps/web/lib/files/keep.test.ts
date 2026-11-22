import { describe, expect, it } from "vitest";
import { downloadSection } from "./keep";

describe("where a download is kept (0194)", () => {
  it("names the folder after the screen", () => {
    expect(downloadSection("/reports")).toEqual({ master: false, section: "Reports" });
    expect(downloadSection("/tax?tab=gst")).toEqual({ master: false, section: "Tax" });
    expect(downloadSection("/work-records")).toEqual({ master: false, section: "Work records" });
    expect(downloadSection("/payroll/2026-11")).toEqual({ master: false, section: "Payroll" });
  });
  it("puts Master control's downloads in its own space", () => {
    expect(downloadSection("/admin/testing")).toEqual({ master: true, section: "Testing" });
    expect(downloadSection("/admin/data/records")).toEqual({ master: true, section: "Data" });
    expect(downloadSection("/admin")).toEqual({ master: true, section: "Master control" });
  });
  it("keeps nothing from Home (a person's own payslip), the File Manager itself, or the front page", () => {
    expect(downloadSection("/home")).toBeNull();
    expect(downloadSection("/files")).toBeNull();
    expect(downloadSection("/admin/files")).toBeNull();
    expect(downloadSection("/")).toBeNull();
  });
});

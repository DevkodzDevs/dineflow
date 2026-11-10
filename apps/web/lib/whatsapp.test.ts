import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Map<string, string>() }));
import { waPhone, cleanParam, templatePayload, documentPayload, metaSignatureOk, statusesOf } from "./whatsapp";
import { WA_TEMPLATES, WA_TEMPLATE_LIST, renderTemplate } from "./whatsapp-templates";

/** WhatsApp through the Business API (0177). */
describe("the templates the owner creates in Meta", () => {
  it("every body, in every language, uses exactly {{1}}…{{n}} for its n parameters, on one line", () => {
    for (const t of WA_TEMPLATE_LIST) {
      for (const lang of ["en", "ta", "hi"] as const) {
        const body = t.body[lang];
        const used = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
        expect(new Set(used), `${t.name} ${lang}`).toEqual(new Set(t.params.map((_, i) => i + 1)));
        expect(body, `${t.name} ${lang} has a newline`).not.toMatch(/\n/);
        expect(body, `${t.name} ${lang} has four spaces`).not.toMatch(/ {4}/);
      }
    }
  });
  it("names are unique, shaped as wa_queue's check allows, and each sits under its own kind", () => {
    const names = WA_TEMPLATE_LIST.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of WA_TEMPLATE_LIST) expect(t.name).toMatch(/^dineflow_[a-z_]{2,40}$/);
    for (const [kind, t] of Object.entries(WA_TEMPLATES)) expect(t.kind).toBe(kind);
  });
  it("renders in order", () => {
    expect(renderTemplate(WA_TEMPLATES.test, "en", ["Tan Resort"])).toBe("This is a test from Tan Resort on DineFlow. WhatsApp messages are working.");
    expect(renderTemplate(WA_TEMPLATES.alert, "en", ["Tan Resort", "Bill 214 voided: wrong table", "1,240.00", "Priya"])).toBe("Tan Resort: Bill 214 voided: wrong table — ₹1,240.00 — by Priya.");
  });
});

describe("waPhone — the number the API takes", () => {
  it("puts 91 in front of a ten-digit Indian mobile, whatever it was typed with", () => {
    expect(waPhone("98430 22118")).toBe("919843022118");
    expect(waPhone("+91 98430-22118")).toBe("919843022118");
    expect(waPhone("09843022118")).toBe("919843022118");
  });
  it("keeps a full international number and refuses the unusable", () => {
    expect(waPhone("+44 7700 900123")).toBe("447700900123");
    expect(waPhone("12345")).toBeNull();
    expect(waPhone(null)).toBeNull();
    expect(waPhone("1234567890123456")).toBeNull();
  });
});

describe("the payload Graph receives", () => {
  it("a body parameter is one line, trimmed, capped, never empty", () => {
    expect(cleanParam("  Table\n 4  for   two ")).toBe("Table 4 for two");
    expect(cleanParam("")).toBe("-");
    expect(cleanParam(null)).toBe("-");
    expect(cleanParam("x".repeat(2000)).length).toBe(1024);
  });
  it("a template message names the template, the language and the body parameters in order", () => {
    const p = templatePayload("919843022118", "dineflow_reservation", "ta", ["Arjun", "Tan Resort", "Fri 10 Oct", "7:30 pm", "4", "17"]);
    expect(p).toMatchObject({ messaging_product: "whatsapp", to: "919843022118", type: "template", template: { name: "dineflow_reservation", language: { code: "ta" } } });
    const comps = p.template.components as { type: string; parameters: { type: string; text: string }[] }[];
    expect(comps).toHaveLength(1);
    expect(comps[0].type).toBe("body");
    expect(comps[0].parameters.map((x) => x.text)).toEqual(["Arjun", "Tan Resort", "Fri 10 Oct", "7:30 pm", "4", "17"]);
    expect(comps[0].parameters.every((x) => x.type === "text")).toBe(true);
  });
  it("a button suffix adds a url button component at index 0", () => {
    const p = templatePayload("919843022118", "dineflow_bill", "en", ["Guest", "Tan", "100.00", "x"], "abc123");
    const comps = p.template.components as { type: string; sub_type?: string; index?: string; parameters: { text: string }[] }[];
    expect(comps).toHaveLength(2);
    expect(comps[1]).toMatchObject({ type: "button", sub_type: "url", index: "0" });
    expect(comps[1].parameters[0].text).toBe("abc123");
  });
  it("a document carries its link, and a filename or caption only when given", () => {
    expect(documentPayload("919843022118", "https://x/y.pdf")).toEqual({ messaging_product: "whatsapp", to: "919843022118", type: "document", document: { link: "https://x/y.pdf" } });
    expect(documentPayload("919843022118", "https://x/y.pdf", "Bill 214.pdf", "Your bill").document).toEqual({ link: "https://x/y.pdf", filename: "Bill 214.pdf", caption: "Your bill" });
  });
});

describe("the webhook", () => {
  const secret = "app-secret-123"; const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const sign = (s: string, body: string) => "sha256=" + createHmac("sha256", s).update(body, "utf8").digest("hex");
  it("accepts Meta's signature over the raw body and nothing else", () => {
    expect(metaSignatureOk(secret, raw, sign(secret, raw))).toBe(true);
    expect(metaSignatureOk(secret, raw, sign(secret, raw).toUpperCase().replace("SHA256=", "sha256="))).toBe(true);   // hex case does not matter
    expect(metaSignatureOk(secret, raw, sign("other", raw))).toBe(false);
    expect(metaSignatureOk(secret, raw + " ", sign(secret, raw))).toBe(false);
    expect(metaSignatureOk(secret, raw, null)).toBe(false);
    expect(metaSignatureOk(secret, raw, "sha256=nothex")).toBe(false);
    expect(metaSignatureOk("", raw, sign("", raw))).toBe(false);
  });
  it("reads the statuses out of a delivery, with the failure's reason, and ignores inbound messages", () => {
    const body = { object: "whatsapp_business_account", entry: [{ id: "1", changes: [
      { field: "messages", value: { messaging_product: "whatsapp", statuses: [
        { id: "wamid.A", status: "delivered", timestamp: "1", recipient_id: "919843022118" },
        { id: "wamid.B", status: "failed", errors: [{ code: 131026, title: "Message undeliverable" }] },
        { id: "wamid.C", status: "weird" },
      ] } },
      { field: "messages", value: { messages: [{ from: "919843022118", id: "wamid.in", type: "text", text: { body: "hi" } }] } },
    ] }] };
    expect(statusesOf(body)).toEqual([
      { id: "wamid.A", status: "delivered", error: null },
      { id: "wamid.B", status: "failed", error: "Message undeliverable" },
    ]);
    expect(statusesOf(null)).toEqual([]);
    expect(statusesOf({ entry: "no" })).toEqual([]);
  });
});

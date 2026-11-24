import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { emailConfigured, emailVia, gmailFrom } from "./email";

const KEYS = ["RESEND_API_KEY", "EMAIL_FROM", "GMAIL_USER", "GMAIL_APP_PASSWORD"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const set = (env: Partial<Record<(typeof KEYS)[number], string>>) => { for (const k of KEYS) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; } };
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe("email — which way the codes go (2026-11-25)", () => {
  it("off with nothing set: no code goes anywhere", () => {
    set({});
    expect(emailConfigured()).toBe(false);
    expect(emailVia()).toBe(null);
  });
  it("Gmail with an account and an App Password", () => {
    set({ GMAIL_USER: "dineflow.otp@gmail.com", GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop" });
    expect(emailVia()).toBe("gmail");
    expect(emailConfigured()).toBe(true);
  });
  it("half a Gmail setup is off, not a silent failure later", () => {
    set({ GMAIL_USER: "dineflow.otp@gmail.com", GMAIL_APP_PASSWORD: "  " });
    expect(emailVia()).toBe(null);
  });
  it("Resend wins when both are set", () => {
    set({ RESEND_API_KEY: "re_x", EMAIL_FROM: "DineFlow <no-reply@dineflow.cloud>", GMAIL_USER: "a@gmail.com", GMAIL_APP_PASSWORD: "x" });
    expect(emailVia()).toBe("resend");
  });
  it("the Gmail sender is always the account, with EMAIL_FROM's display name", () => {
    expect(gmailFrom("dineflow.otp@gmail.com")).toBe("DineFlow <dineflow.otp@gmail.com>");
    expect(gmailFrom("dineflow.otp@gmail.com", "DineFlow Codes <no-reply@dineflow.cloud>")).toBe("DineFlow Codes <dineflow.otp@gmail.com>");
    expect(gmailFrom(" x@gmail.com ", "\"Tan Resort\" <a@b.c>")).toBe("Tan Resort <x@gmail.com>");
    expect(gmailFrom("x@gmail.com", "just-an-address@b.c")).toBe("DineFlow <x@gmail.com>");
  });
});

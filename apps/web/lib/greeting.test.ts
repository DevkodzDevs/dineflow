import { describe, expect, it } from "vitest";
import { dayPart, greetingAt, istHour } from "./greeting";

/* an instant whose time in India is hh:mm on 26 Nov 2026 (IST = UTC+5:30) */
const ist = (hh: number, mm = 0) => new Date(Date.UTC(2026, 10, 26, hh, mm) - 5.5 * 3600e3);

describe("greeting", () => {
  it("reads the hour in India, not the device's zone", () => {
    expect(istHour(new Date("2026-11-26T15:00:00Z"))).toBe(20);   // 3 pm UTC is 8:30 pm in India
    expect(istHour(new Date("2026-11-26T20:00:00Z"))).toBe(1);    // past midnight in India, still the 26th in UTC
  });

  it("splits the day into four at 5, 12, 17 and 21", () => {
    const parts = Array.from({ length: 24 }, (_, h) => dayPart(h));
    expect(parts.slice(0, 5).every((p) => p === "night")).toBe(true);
    expect(parts.slice(5, 12).every((p) => p === "morning")).toBe(true);
    expect(parts.slice(12, 17).every((p) => p === "afternoon")).toBe(true);
    expect(parts.slice(17, 21).every((p) => p === "evening")).toBe(true);
    expect(parts.slice(21).every((p) => p === "night")).toBe(true);
  });

  it("changes on the minute each part begins", () => {
    expect(greetingAt(ist(4, 59))).toBe("Good night");
    expect(greetingAt(ist(5, 0))).toBe("Good morning");
    expect(greetingAt(ist(11, 59))).toBe("Good morning");
    expect(greetingAt(ist(12, 0))).toBe("Good afternoon");
    expect(greetingAt(ist(16, 59))).toBe("Good afternoon");
    expect(greetingAt(ist(17, 0))).toBe("Good evening");
    expect(greetingAt(ist(20, 59))).toBe("Good evening");
    expect(greetingAt(ist(21, 0))).toBe("Good night");
    expect(greetingAt(ist(23, 59))).toBe("Good night");
    expect(greetingAt(ist(0, 0))).toBe("Good night");
  });
});

/* The greeting over the control room (2026-11-26, the owner: "it is night and it still says Good morning — it should move
   through Good morning, Good afternoon, Good evening and Good night"). The business day is India's (UTC+5:30, no daylight
   saving), so the hour is read in IST whatever the device's own zone is.
     05:00–11:59 morning · 12:00–16:59 afternoon · 17:00–20:59 evening · 21:00–04:59 night */

export type DayPart = "morning" | "afternoon" | "evening" | "night";

const IST = 5.5 * 3600e3;

/** The hour (0–23) in India at `at`. */
export const istHour = (at: Date = new Date()): number => new Date(at.getTime() + IST).getUTCHours();

export const dayPart = (hour: number): DayPart =>
  hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 17 ? "afternoon" : hour >= 17 && hour < 21 ? "evening" : "night";

/* The words are whole literals so the Tamil and Hindi dictionaries find them (scripts/i18n-check.mjs). */
export const GREETING: Record<DayPart, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
  night: "Good night",
};

/** "Good morning" … "Good night" for the time in India at `at`. */
export const greetingAt = (at: Date = new Date()): string => GREETING[dayPart(istHour(at))];

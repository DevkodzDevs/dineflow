/**
 * WhatsApp messages to a guest, with the words already typed. No API and no cost: a wa.me link
 * opens WhatsApp on this phone or computer and the person presses send. Ten digits on their own
 * are an Indian mobile, so 91 goes in front. Null when there is no number worth trying.
 */
export function waHref(phone: string | null | undefined, text: string): string | null {
  const d = (phone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length < 10) return null;
  return `https://wa.me/${d.length === 10 ? "91" + d : d}?text=${encodeURIComponent(text)}`;
}

/** "Fri 10 Oct" — a date as a guest reads it in a message. Takes a plain YYYY-MM-DD. */
export const waDate = (ymd: string) =>
  new Date(`${ymd.slice(0, 10)}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/** "7:30 pm" from "19:30" or "19:30:00". */
export const waTime = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

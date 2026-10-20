/**
 * Feedback & complaints (0124) — the words only, so a server page can import them; the icons are resolved on the client
 * (VoiceClient), as a server component cannot hand a Lucide icon across.
 */
export type VoiceKind = "complaint" | "feedback" | "suggestion" | "appreciation";
export type VoiceAbout = "work" | "pay" | "colleague" | "customers" | "equipment" | "safety" | "other";
export type VoiceStatus = "new" | "seen" | "in_progress" | "resolved";

/** What it is — each with its colour token and one line of help. */
export const VOICE_KINDS: { key: VoiceKind; label: string; plural: string; hint: string; hue: string }[] = [
  { key: "complaint", label: "Complaint", plural: "Complaints", hint: "Something is wrong and should be put right", hue: "var(--color-red)" },
  { key: "feedback", label: "Feedback", plural: "Feedback", hint: "How things are going, good or bad", hue: "var(--color-blue)" },
  { key: "suggestion", label: "Idea", plural: "Ideas", hint: "Something that would make the work better", hue: "var(--color-orange)" },
  { key: "appreciation", label: "Thanks", plural: "Thanks", hint: "Someone or something worth a word of praise", hue: "var(--color-green)" },
];
/** What it is about — optional. */
export const VOICE_TOPICS: { key: VoiceAbout; label: string }[] = [
  { key: "work", label: "Work & shifts" },
  { key: "pay", label: "Pay & leave" },
  { key: "colleague", label: "A colleague" },
  { key: "customers", label: "Customers" },
  { key: "equipment", label: "Equipment" },
  { key: "safety", label: "Safety" },
  { key: "other", label: "Something else" },
];
/** Where it stands — as the owner moves it, and as the person who sent it reads it. */
export const VOICE_STATUS: Record<VoiceStatus, { label: string; staff: string; hue: string }> = {
  new: { label: "New", staff: "Sent", hue: "var(--color-blue)" },
  seen: { label: "Seen", staff: "Seen by the owner", hue: "var(--color-violet)" },
  in_progress: { label: "Working on it", staff: "The owner is on it", hue: "var(--color-orange)" },
  resolved: { label: "Resolved", staff: "Resolved", hue: "var(--color-green)" },
};
export const kindOf = (k: string) => VOICE_KINDS.find((x) => x.key === k) ?? VOICE_KINDS[1];
export const topicOf = (k: string | null) => VOICE_TOPICS.find((x) => x.key === k)?.label ?? null;

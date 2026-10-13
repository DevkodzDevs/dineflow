/**
 * Help & support — the words, in one place, for the property's page and Master control's desk alike.
 * No icons here: a server component cannot hand a Lucide icon across the boundary, so the icons live in
 * components/support/icons.tsx and are looked up by key on the client.
 */
import { COMPANY } from "@/lib/company";

export type Kind = "complaint" | "problem" | "question" | "idea" | "billing" | "privacy";
export type Topic = "withdraw" | "access" | "correct" | "erase" | "other";
export type Priority = "low" | "normal" | "high" | "urgent";
export type Status = "open" | "in_progress" | "waiting" | "resolved" | "closed";

/** what a request is about, in the order the form offers them */
export const KINDS: { key: Kind; label: string; hint: string; tone: string }[] = [
  { key: "problem", label: "Problem", hint: "A screen, a button or a printer is not working", tone: "--color-red" },
  { key: "complaint", label: "Complaint", hint: "Something about DineFlow let you down", tone: "--color-orange" },
  { key: "question", label: "Question", hint: "How do I… / where is…", tone: "--color-blue" },
  { key: "idea", label: "Feedback & ideas", hint: "Tell us what to make better", tone: "--color-tint" },
  { key: "billing", label: "Billing", hint: "Membership, renewals, invoices", tone: "--color-label-2" },
  { key: "privacy", label: "Privacy & consent", hint: "Your data, your consent — a grievance", tone: "--color-blue" },
];
export const kindOf = (k: string) => KINDS.find((x) => x.key === k) ?? KINDS[0];

/** a privacy & consent request: what the person wants done (the rights under the DPDP Act 2023) */
export const TOPICS: { key: Topic; label: string }[] = [
  { key: "withdraw", label: "Withdraw consent" },
  { key: "access", label: "See my data" },
  { key: "correct", label: "Correct my data" },
  { key: "erase", label: "Delete my data" },
  { key: "other", label: "Something else" },
];
export const topicLabel = (t: string | null | undefined) => TOPICS.find((x) => x.key === t)?.label ?? null;

export const PRIORITIES: { key: Priority; label: string; hint: string }[] = [
  { key: "low", label: "Low", hint: "Whenever you can" },
  { key: "normal", label: "Normal", hint: "Today or tomorrow" },
  { key: "high", label: "High", hint: "It is slowing us down" },
  { key: "urgent", label: "Urgent", hint: "The till or front desk is stopped" },
];

/** the states a request moves through, in the words each side reads them */
export const STATUS: Record<Status, { label: string; customer: string; tone: string }> = {
  open: { label: "Open", customer: "Received", tone: "--color-orange" },
  in_progress: { label: "In progress", customer: "Being worked on", tone: "--color-blue" },
  waiting: { label: "Waiting on customer", customer: "Waiting for your answer", tone: "--color-tint" },
  resolved: { label: "Resolved", customer: "Sorted", tone: "--color-green" },
  closed: { label: "Closed", customer: "Closed", tone: "--color-label-3" },
};
export const statusOf = (s: string) => STATUS[(s in STATUS ? s : "open") as Status];

/** #SUP-0012 */
export const ticketNo = (n: number | string) => `SUP-${String(n).padStart(4, "0")}`;

/** how to reach DineFlow other than this form — from lib/company.ts, so the legal pages and this agree */
export const CONTACT = {
  email: COMPANY.supportEmail,
  grievance: COMPANY.grievanceEmail,
  privacy: COMPANY.privacyEmail,
  hours: COMPANY.supportHours,
  phone: COMPANY.phone,
  grievanceDays: COMPANY.grievanceDays,
  officer: COMPANY.grievanceOfficer,
};

/** "2 min ago", "3h ago", "yesterday", "12 Oct" — for a thread and a list */
export const when = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime(), m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  if (h < 48) return "yesterday";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
};
export const stamp = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** days left to answer a privacy & consent request (negative once late) */
export const daysLeft = (due: string | null | undefined) => (due ? Math.ceil((new Date(due).getTime() - Date.now()) / 86400000) : null);

/** An event line in a thread (status, priority, access, a removed screenshot), in each side's words:
 *  the property reads "Now waiting for your answer", Master control "Status → Waiting on customer". */
export const eventText = (event: string, body: string, desk = false) => {
  const [k, v] = event.split(":");
  if (k === "status") return desk ? `Status → ${statusOf(v).label}` : v === "resolved" ? "Marked as sorted" : v === "open" ? "Opened again" : `Now ${statusOf(v).customer.toLowerCase()}`;
  if (k === "priority") return `Priority → ${PRIORITIES.find((p) => p.key === v)?.label ?? v}`;
  if (k === "access") return v === "on" ? "Access to the property allowed" : "Access to the property taken back";
  return body;
};

/** a screenshot: shrunk in the browser to a JPEG no wider or taller than 1600px before it goes up */
export const SHOT_MAX = 3;

import type { Table } from "@/lib/tablePdf";

/**
 * What `api/assist` streams to the panel: one JSON object per line. Shared by the route and the panel, so both
 * sides agree on the shape. `think` is the model's own short summary of its reasoning (shown faint, folded away);
 * `step` is what it is doing right now ("Reading this month's collections"); `doc` is a finished PDF's contents,
 * drawn in the browser; `action` is a button the person must tap before anything happens.
 */
export type AssistDoc = { title: string; subtitle: string; summary: string; tables: Table[]; file: string };
export type AssistAction = { kind: string; label: string; arg: string };
/** One thing the health check found (lib/assist/diagnose.ts), drawn as a card: what, why, the fix, and a button when the fix is safe. */
export type Fix = { kind: "call_walkin" | "walkin_left" | "reservation_no_show" | "reorder_message" | "open"; label: string; arg: string };
export type Finding = { level: "problem" | "warning" | "note"; area: string; what: string; cause: string; fix: string; go?: string; action?: Fix };
export type AssistEvent =
  | { t: "text"; d: string }
  | { t: "think"; d: string }
  | { t: "step"; d: string }
  | { t: "findings"; f: Finding[]; checked: string[] }
  | { t: "doc"; doc: AssistDoc }
  | { t: "action"; a: AssistAction }
  | { t: "error"; d: string };

/**
 * The last line of defence on anything Assist says or is told: key-shaped strings are blanked. Assist is never given
 * a secret to begin with (lib/assist/data.ts), so this should never fire — it is here in case a note, an error
 * message or a pasted line carries one.
 */
const SECRETS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g,                                  // Anthropic keys
  /\brzp_(?:live|test)_[A-Za-z0-9]{6,}/g,                       // Razorpay key ids
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/g, // JWTs (session and service-role tokens)
  /\b(?:sk|pk|whsec|ghp|gho|xox[abp])_[A-Za-z0-9]{12,}/g,      // other common secret prefixes
  /\b[0-9a-f]{40,}\b/gi,                                        // long hex tokens
];
export const redact = (s: string) => SECRETS.reduce((t, re) => t.replace(re, "[hidden]"), s);

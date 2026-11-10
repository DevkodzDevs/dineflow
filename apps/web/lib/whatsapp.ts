import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { adminClient, serviceRoleConfigured } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { WA_TEMPLATES, type WaKind, type WaLang } from "./whatsapp-templates";

/**
 * WhatsApp through the Meta WhatsApp Business Cloud API (0177) — the property's own number, the property's own token.
 *
 * Nothing here is sent from a screen. A server action calls `queueWhatsApp` (→ `wa_queue`, which says no when the add-on,
 * the settings or the event's switch is off, and never raises); the sender — `/api/cron/whatsapp` every five minutes, or
 * the owner's *Send me a test* when the server holds the service-role key — calls `drainOutbox`, which takes queued rows
 * with their credentials (`wa_outbox_take`, service role only), posts each to Graph and records the answer
 * (`wa_outbox_done`). Meta's status webhook (`/api/webhooks/whatsapp`) later marks delivered / read / failed.
 *
 * Like lib/email.ts: off until the keys are set, and it says so rather than pretending. The server needs nothing of its
 * own to send — the credentials are the property's, read inside the database — but the webhook needs two per-deployment
 * values: WHATSAPP_VERIFY_TOKEN (any phrase; Meta asks for it once when the webhook is added) and WHATSAPP_APP_SECRET
 * (Meta app → App settings → Basic → App secret; signs every delivery). Neither is NEXT_PUBLIC_.
 */
export const GRAPH_URL = "https://graph.facebook.com/v21.0";

/** lib/wa.ts's rule for the API: digits only, no leading zeros, ten digits are an Indian mobile so 91 goes in front; null when unusable. */
export function waPhone(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  const full = d.length === 10 ? "91" + d : d;
  return full.length >= 11 && full.length <= 15 ? full : null;
}

/** A body parameter Meta accepts: one line, no runs of spaces, at most 1,024 characters, never empty. */
export const cleanParam = (text: unknown): string => String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 1024) || "-";

/** The message body for a template: `{{1}}…{{n}}` in order; `button` fills a "Visit website" button's dynamic URL suffix when the template has one. */
export function templatePayload(to: string, name: string, lang: WaLang, params: string[], button?: string) {
  const components: Record<string, unknown>[] = [
    { type: "body", parameters: params.map((p) => ({ type: "text", text: cleanParam(p) })) },
  ];
  if (button) components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: cleanParam(button) }] });
  return { messaging_product: "whatsapp", to, type: "template", template: { name, language: { code: lang }, components } };
}

/** A document (a PDF at a public https link) with an optional caption and filename. */
export function documentPayload(to: string, link: string, filename?: string, caption?: string) {
  return {
    messaging_product: "whatsapp", to, type: "document",
    document: { link, ...(filename ? { filename: cleanParam(filename).slice(0, 240) } : {}), ...(caption ? { caption: cleanParam(caption) } : {}) },
  };
}

/** Meta signs every webhook delivery: `X-Hub-Signature-256: sha256=<hmac of the raw body with the app secret>`. Constant-time, like the Razorpay check. */
export function metaSignatureOk(appSecret: string, rawBody: string, header: string | null | undefined): boolean {
  if (!appSecret || !header) return false;
  const given = header.trim().replace(/^sha256=/i, "");
  if (!/^[0-9a-f]{64}$/i.test(given)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8"), b = Buffer.from(given.toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type WaStatus = { id: string; status: "sent" | "delivered" | "read" | "failed"; error: string | null };
/** The statuses in a webhook body — entry[].changes[].value.statuses[] — in order; anything else (inbound messages) is left out. */
export function statusesOf(body: unknown): WaStatus[] {
  const out: WaStatus[] = [];
  const entries = (body as { entry?: unknown[] } | null)?.entry;
  if (!Array.isArray(entries)) return out;
  for (const e of entries) {
    const changes = (e as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const c of changes) {
      const statuses = (c as { value?: { statuses?: unknown[] } })?.value?.statuses;
      if (!Array.isArray(statuses)) continue;
      for (const s of statuses) {
        const st = s as { id?: unknown; status?: unknown; errors?: { title?: string; message?: string; code?: number }[] };
        if (typeof st.id !== "string" || typeof st.status !== "string") continue;
        if (!["sent", "delivered", "read", "failed"].includes(st.status)) continue;
        const err = st.status === "failed" ? (st.errors?.[0]?.title ?? st.errors?.[0]?.message ?? (st.errors?.[0]?.code != null ? `error ${st.errors[0].code}` : "failed")) : null;
        out.push({ id: st.id, status: st.status as WaStatus["status"], error: err });
      }
    }
  }
  return out;
}

export type WaCreds = { phoneNumberId: string; accessToken: string };
export type SendOut = { ok: true; id: string } | { ok: false; error: string };

async function post(creds: WaCreds, payload: unknown): Promise<SendOut> {
  try {
    const res = await fetch(`${GRAPH_URL}/${encodeURIComponent(creds.phoneNumberId)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${creds.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json().catch(() => ({})) as { messages?: { id: string }[]; error?: { message?: string; code?: number; error_data?: { details?: string } } };
    if (res.ok && data.messages?.[0]?.id) return { ok: true, id: data.messages[0].id };
    const e = data.error;
    return { ok: false, error: (e?.error_data?.details || e?.message || `HTTP ${res.status}`).slice(0, 300) + (e?.code ? ` (code ${e.code})` : "") };
  } catch (err) {
    return { ok: false, error: `WhatsApp unreachable: ${(err as Error).message}`.slice(0, 300) };
  }
}

export const sendTemplate = (creds: WaCreds, to: string, name: string, lang: WaLang, params: string[], button?: string) =>
  post(creds, templatePayload(to, name, lang, params, button));
export const sendDocument = (creds: WaCreds, to: string, link: string, filename?: string, caption?: string) =>
  post(creds, documentPayload(to, link, filename, caption));

type Taken = { id: string; to: string; kind: WaKind; template: string; lang: WaLang; params: string[]; document_url: string | null; attempts: number; name: string; phone_number_id: string; access_token: string };

/**
 * The sender: claim queued rows, post each, record the answer. `db` is a service-role client — the take and done
 * functions refuse anyone else. A document rides after its template and its failure is noted on the row, not retried.
 */
export async function drainOutbox(db: SupabaseClient, limit = 20): Promise<{ taken: number; sent: number; failed: number; errors: string[] }> {
  const { data, error } = await db.rpc("wa_outbox_take", { p_limit: limit });
  if (error) return { taken: 0, sent: 0, failed: 0, errors: [error.message] };
  const rows = (data ?? []) as Taken[];
  let sent = 0, failed = 0; const errors: string[] = [];
  for (const r of rows) {
    const creds = { phoneNumberId: r.phone_number_id, accessToken: r.access_token };
    const out = await sendTemplate(creds, r.to, r.template, (["en", "ta", "hi"].includes(r.lang) ? r.lang : "en") as WaLang, Array.isArray(r.params) ? r.params.map(String) : []);
    if (out.ok) {
      sent++;
      let note: string | null = null;
      if (r.document_url) { const d = await sendDocument(creds, r.to, r.document_url); if (!d.ok) note = `document not sent: ${d.error}`; }
      await db.rpc("wa_outbox_done", { p_id: r.id, p_provider_id: out.id, p_error: note });
    } else {
      failed++; errors.push(out.error);
      await db.rpc("wa_outbox_done", { p_id: r.id, p_provider_id: null, p_error: out.error });
    }
  }
  return { taken: rows.length, sent, failed, errors: errors.slice(0, 5) };
}

/** Is WhatsApp set up for the signed-in property (a phone number id and a token saved)? The caller's own client; owner or manager. */
export async function waReady(db: SupabaseClient): Promise<boolean> {
  const { data } = await db.rpc("wa_settings_get");
  const s = data as { phone_number_id?: string; has_token?: boolean } | null;
  return !!(s?.phone_number_id && s.has_token);
}

/** The public address links are built on: NEXT_PUBLIC_CLOUD_URL, else this request's host (as the Channels and Connections pages do). */
export async function publicBase(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_CLOUD_URL?.replace(/\/+$/, "");
  if (env) return env;
  try { const h = await headers(); return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`; }
  catch { return "https://dineflow.cloud"; }
}

export type QueueInput = { kind: WaKind; to: string | null | undefined; params: string[]; documentUrl?: string | null; dedupe?: string | null; amount?: number | null };
/**
 * Queue one message from a server action, after the write it announces has succeeded. Best effort by design: the add-on
 * off (`features`), no number, no settings or a switch off all answer null and change nothing; an error is swallowed —
 * a bill is paid whether or not its e-bill goes. Returns the outbox row's id when one was queued.
 */
export async function queueWhatsApp(db: SupabaseClient, session: { features: string[] }, q: QueueInput): Promise<string | null> {
  if (!session.features.includes("whatsapp")) return null;
  if (!waPhone(q.to)) return null;
  const t = WA_TEMPLATES[q.kind];
  const params = t.params.map((_, i) => cleanParam(q.params[i]));
  try {
    const { data, error } = await db.rpc("wa_queue", {
      p_kind: q.kind, p_to: q.to, p_template: t.name, p_params: params,
      p_document_url: q.documentUrl ?? null, p_dedupe: q.dedupe ?? null, p_amount: q.amount ?? null,
    });
    const id = error ? null : ((data as string | null) ?? null);
    /* Sent now, not at the next cron: once the action's answer is on its way, this server drains the outbox itself when it holds
       the service-role key (`after` runs after the response, inside the same request). Vercel's Hobby plan allows a daily cron
       only, so the scheduler (vercel.json, 01:00 UTC) is the sweeper for retries and for a server without the key. */
    if (id && serviceRoleConfigured()) {
      try { after(async () => { try { await drainOutbox(adminClient(), 20); } catch { /* the sweeper retries */ } }); } catch { /* outside a request: the sweeper sends it */ }
    }
    return id;
  } catch { return null; }
}

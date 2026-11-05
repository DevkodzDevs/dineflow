import { createHash, createHmac } from "node:crypto";

/**
 * The off-site copy (0172): any S3-compatible store — Cloudflare R2 (10 GB free), Backblaze B2 (10 GB free), AWS S3 (paid),
 * or another. Signed with AWS Signature Version 4 by hand, so there is no SDK to install; path-style addresses
 * (https://endpoint/bucket/key), which all four accept. `s3Test` writes a small file, reads it back and deletes it.
 */
export type S3Target = { endpoint: string; region: string; bucket: string; keyId: string; secret: string; prefix?: string | null };

export { PROVIDERS, type Provider } from "./providers";

const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
export const encodeKey = (key: string) => key.split("/").map(enc).join("/");
const hex = (b: string | Buffer | Uint8Array) => createHash("sha256").update(b).digest("hex");
const hmac = (k: Buffer | string, s: string) => createHmac("sha256", k).update(s).digest();
export const EMPTY_SHA = hex("");

/** AWS Signature Version 4 for one request. Returns the headers to send (with Authorization). */
export function sign(req: { method: string; url: string; headers?: Record<string, string>; payloadHash?: string; region: string; keyId: string; secret: string; service?: string; now?: Date }): Record<string, string> & { authorization: string; signature: string } {
  const u = new URL(req.url); const service = req.service ?? "s3";
  const amz = (req.now ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = amz.slice(0, 8);
  const payload = req.payloadHash ?? EMPTY_SHA;
  const h: Record<string, string> = { host: u.host, "x-amz-content-sha256": payload, "x-amz-date": amz };
  for (const [k, v] of Object.entries(req.headers ?? {})) h[k.toLowerCase()] = String(v).trim().replace(/\s+/g, " ");
  const names = Object.keys(h).sort();
  const query = [...u.searchParams.entries()].map(([k, v]) => [enc(k), enc(v)]).sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join("&");
  const canonical = [req.method.toUpperCase(), u.pathname || "/", query, names.map((n) => `${n}:${h[n]}\n`).join(""), names.join(";"), payload].join("\n");
  const scope = `${day}/${req.region}/${service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amz, scope, hex(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac("AWS4" + req.secret, day), req.region), service), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  return { ...h, authorization: `AWS4-HMAC-SHA256 Credential=${req.keyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`, signature };
}

export const objectUrl = (t: S3Target, key: string) => `${t.endpoint.replace(/\/$/, "")}/${enc(t.bucket)}/${encodeKey(key)}`;
export const withPrefix = (t: S3Target, key: string) => (t.prefix ? `${t.prefix.replace(/^\/|\/$/g, "")}/${key}` : key);

/** What the store said, in words: S3 answers errors as <Code>…</Code><Message>…</Message>. */
export function s3Error(status: number, body: string): string {
  const code = body.match(/<Code>([^<]+)<\/Code>/)?.[1]; const msg = body.match(/<Message>([^<]+)<\/Message>/)?.[1];
  if (code === "SignatureDoesNotMatch" || code === "InvalidAccessKeyId" || status === 401) return "The key was refused — check the access key and secret.";
  if (code === "NoSuchBucket") return "That bucket does not exist at this address.";
  if (code === "AccessDenied" || status === 403) return "The key is not allowed to write to this bucket.";
  if (status === 0) return "The store did not answer — check the address.";
  return `${status}${code ? " " + code : ""}${msg ? ": " + msg : ""}`;
}

type Fetch = typeof fetch;
export async function s3Send(t: S3Target, method: "PUT" | "GET" | "DELETE" | "HEAD", key: string, body?: Buffer, contentType?: string, f: Fetch = fetch): Promise<{ status: number; ok: boolean; body: Buffer; error?: string }> {
  const url = objectUrl(t, key);
  const headers: Record<string, string> = {};
  if (body && contentType) headers["content-type"] = contentType;
  const s = sign({ method, url, headers, payloadHash: body ? hex(body) : EMPTY_SHA, region: t.region, keyId: t.keyId, secret: t.secret });
  const { signature: _s, host: _h, ...send } = s; void _s; void _h;
  let res: Response;
  try { res = await f(url, { method, headers: send, body: body ? new Uint8Array(body) : undefined, signal: AbortSignal.timeout(60_000), redirect: "error" }); }
  catch { return { status: 0, ok: false, body: Buffer.alloc(0), error: s3Error(0, "") }; }
  const b = Buffer.from(await res.arrayBuffer());
  return { status: res.status, ok: res.ok, body: b, error: res.ok ? undefined : s3Error(res.status, b.toString("utf8")) };
}

export type Step = { name: string; ok: boolean; ms: number; detail?: string };
/** Write, read back, delete — each timed. Nothing is left behind when it passes. */
export async function s3Test(t: S3Target, f: Fetch = fetch): Promise<{ ok: boolean; steps: Step[] }> {
  const key = withPrefix(t, `dineflow-test-${Date.now()}.txt`); const text = Buffer.from(`DineFlow off-site test ${new Date().toISOString()}`);
  const steps: Step[] = [];
  const run = async (name: string, fn: () => Promise<{ ok: boolean; detail?: string }>) => {
    const t0 = Date.now(); const r = await fn(); steps.push({ name, ok: r.ok, ms: Date.now() - t0, detail: r.detail }); return r.ok;
  };
  const okPut = await run("Write a test file", async () => { const r = await s3Send(t, "PUT", key, text, "text/plain", f); return { ok: r.ok, detail: r.error }; });
  if (!okPut) return { ok: false, steps };
  await run("Read it back", async () => { const r = await s3Send(t, "GET", key, undefined, undefined, f); return { ok: r.ok && r.body.equals(text), detail: r.ok ? (r.body.equals(text) ? undefined : "It came back different.") : r.error }; });
  await run("Delete it", async () => { const r = await s3Send(t, "DELETE", key, undefined, undefined, f); return { ok: r.ok || r.status === 204, detail: r.error }; });
  return { ok: steps.every((s) => s.ok), steps };
}

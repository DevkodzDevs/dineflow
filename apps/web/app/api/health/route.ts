/**
 * Two questions, one URL.
 *
 *   GET /api/health          — liveness. "Is this process answering?" Costs nothing, touches nothing,
 *                              and is what the offline layer pings to tell a real connection from a
 *                              browser that has not noticed yet, and what the launcher waits on.
 *   GET /api/health?deep=1   — readiness. "Can it actually serve a page?" Also checks that the
 *                              database is reachable, and answers 503 when it is not.
 *
 * The split matters: a readiness probe wired to liveness restarts a healthy app every time the
 * database sneezes, which is how a brief upstream blip becomes an outage. Point an orchestrator's
 * liveness probe at the plain URL and its readiness/alerting at ?deep=1.
 */
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 2500;

async function dbOk(): Promise<{ up: boolean; ms: number; detail?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { up: false, ms: 0, detail: "no database configured" };
  const started = Date.now();
  try {
    // One row id from the smallest table the app always has. It proves the whole chain — PostgREST
    // reachable, Postgres behind it answering, this key still valid — for the cost of an index hit,
    // and RLS returning an empty array is still a healthy answer.
    //
    // Not PostgREST's root path: with the newer publishable key format (sb_publishable_…) the root
    // is a secret-key-only endpoint and answers 401, which reads as a database outage when nothing
    // is wrong. A readiness probe that cries wolf is worse than no readiness probe.
    const r = await fetch(`${url}/rest/v1/restaurants?select=id&limit=1`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { up: r.ok, ms: Date.now() - started, detail: r.ok ? undefined : `http ${r.status}` };
  } catch (e) {
    return { up: false, ms: Date.now() - started, detail: (e as Error).name === "TimeoutError" ? `no answer in ${TIMEOUT_MS}ms` : "unreachable" };
  }
}

export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.has("deep");
  if (!deep) return new Response("ok", { headers: { "cache-control": "no-store" } });

  const db = await dbOk();
  return Response.json(
    { ok: db.up, db: db.up ? "up" : "down", db_ms: db.ms, ...(db.detail ? { detail: db.detail } : {}), at: new Date().toISOString() },
    { status: db.up ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}

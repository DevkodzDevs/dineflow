import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { runBackup, verifyStored, pruneBackups, offsiteCopy } from "@/lib/backup/run";

/**
 * The nightly backup (0172) — vercel.json runs it at 20:30 UTC (02:00 IST). Vercel Cron sends `Authorization: Bearer
 * <CRON_SECRET>`; any other scheduler may call it with ?key=<CRON_SECRET>. It fails closed: with CRON_SECRET unset it is
 * refused, and with no SUPABASE_SERVICE_ROLE_KEY it cannot read (there is no sign-in at 2 am). Then: back up, check it,
 * keep the newest N, copy off-site if that is on, and run the clean-up rules switched on in Master control → Data.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set on the server, so the nightly backup is off." }, { status: 503 });
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") || new URL(req.url).searchParams.get("key") || "";
  if (!same(given, secret)) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set on the server, so the nightly backup cannot read." }, { status: 503 });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: s, error } = await db.rpc("data_settings_get");
  if (error || !s) return NextResponse.json({ error: error?.message ?? "The backup settings could not be read — apply migration 0172." }, { status: 500 });
  if (!s.nightly) return NextResponse.json({ skipped: "The nightly backup is switched off in Master control → Data." });

  const r = await runBackup(db, { kind: "nightly", includeFiles: s.include_files, filesCapMb: s.files_cap_mb });
  if (!r.ok) return NextResponse.json(r, { status: 500 });
  const checked = await verifyStored(db, r.id);
  const pruned = await pruneBackups(db, s.keep_count).catch(() => 0);
  const offsite = s.offsite_on ? await offsiteCopy(db, r.id) : null;

  const rules = Object.entries((s.cleanup ?? {}) as Record<string, { on?: boolean; days?: number }>).filter(([, v]) => v?.on);
  let cleanup: unknown = null;
  if (rules.length) {
    const { data } = await db.rpc("data_cleanup", { p_days: Object.fromEntries(rules.map(([k, v]) => [k, v.days ?? null])), p_apply: true, p_only: rules.map(([k]) => k) });
    cleanup = data;
  }
  return NextResponse.json({ ok: true, id: r.id, size: r.size, rows: r.rows, ms: r.ms, checked, pruned, offsite, cleanup });
}

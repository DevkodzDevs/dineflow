/**
 * Supabase's own backups, read through its Management API (0172). On the Free plan there are none; on Pro (about $25 a
 * month) there is one a day, kept 7 days, and point-in-time recovery is an add-on. The page shows what the plan keeps once
 * an access token (supabase.com/dashboard/account/tokens) is saved — the token is free; the backups come with the plan.
 */
export const projectRef = (url: string | undefined | null) => (url ?? "").match(/https:\/\/([a-z0-9]{20})\.supabase\.co/)?.[1] ?? null;

export type SupabaseBackups =
  | { ok: true; region: string | null; pitr: boolean; walg: boolean; backups: { at: string; status: string; physical: boolean }[] }
  | { ok: false; status: number; error: string };

export async function supabaseBackups(token: string, ref: string, f: typeof fetch = fetch): Promise<SupabaseBackups> {
  let res: Response;
  try {
    res = await f(`https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}/database/backups`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" }, signal: AbortSignal.timeout(15_000), cache: "no-store",
    });
  } catch { return { ok: false, status: 0, error: "Supabase did not answer — try again in a minute." }; }
  if (res.status === 401) return { ok: false, status: 401, error: "The access token was refused — make a new one at supabase.com/dashboard/account/tokens." };
  if (res.status === 403) return { ok: false, status: 403, error: "This token cannot see this project — use a token from the account that owns it." };
  if (res.status === 404) return { ok: false, status: 404, error: "This token's account has no such project." };
  if (!res.ok) return { ok: false, status: res.status, error: `Supabase answered ${res.status}.` };
  const j = await res.json().catch(() => null) as { region?: string; pitr_enabled?: boolean; walg_enabled?: boolean; backups?: { inserted_at?: string; status?: string; is_physical_backup?: boolean }[] } | null;
  if (!j) return { ok: false, status: res.status, error: "Supabase's answer could not be read." };
  return {
    ok: true, region: j.region ?? null, pitr: !!j.pitr_enabled, walg: !!j.walg_enabled,
    backups: (j.backups ?? []).map((b) => ({ at: b.inserted_at ?? "", status: b.status ?? "", physical: !!b.is_physical_backup })).sort((a, b) => b.at.localeCompare(a.at)),
  };
}

/** The plans, as Supabase prices them (checked 2026-11) — shown on the page so the owner can decide. */
export const PLANS = [
  { key: "free", label: "Free", price: "₹0", db: "500 MB", files: "1 GB", backups: "None — DineFlow's own backups cover it", pauses: true },
  { key: "pro", label: "Pro", price: "$25 a month", db: "8 GB", files: "100 GB", backups: "Daily, kept 7 days", pauses: false },
  { key: "pitr", label: "Pro + point-in-time", price: "from $100 a month more", db: "8 GB", files: "100 GB", backups: "Back to any minute, 7 days", pauses: false },
] as const;
export const FREE_LIMITS = { db: 500 * 1048576, files: 1024 * 1048576, file: 50 * 1048576 };

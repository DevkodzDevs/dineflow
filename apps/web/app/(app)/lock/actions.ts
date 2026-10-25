"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { loginCandidates } from "@dineflow/shared";
import { LOCK_COOKIE, lockValue, lockHref, lockable, parseLock, type LockMode } from "@/lib/displayLock";

/** Who may set, lock and release: the owner, and a manager — a General Manager's position carries the manager role. */
const MAY = (role: string) => role === "owner" || role === "manager";
const YEAR = 60 * 60 * 24 * 365;

/** Turn a page's display lock on (with its kind) or off. The database checks the role itself (0141). */
export async function setPageLock(key: string, mode: LockMode | null) {
  if (!lockable(key)) return { error: "That page cannot be locked." };
  const s = await createClient();
  const { data, error } = await s.rpc("display_lock_set", { p_key: key, p_mode: mode });
  if (error) return { error: error.message };
  revalidatePath("/lock");
  return { ok: true as const, setting: (data ?? {}) as Record<string, LockMode> };
}

/** Lock this device to a page, in the kind the property set for it. Only the owner or a manager, only a page that is on. */
export async function lockThisDisplay(key: string) {
  const s = await requireSession();
  if (!MAY(s.profile.role)) return { error: "Only the owner, a general manager or a manager can lock a display." };
  const mode = ((s.restaurant as { display_lock?: Record<string, LockMode> }).display_lock ?? {})[key];
  if (!lockable(key) || (mode !== "view" && mode !== "work")) return { error: "Turn the lock on for this page first." };
  const db = await createClient();
  const { error } = await db.rpc("display_lock_note", { p_action: "lock", p_key: key, p_mode: mode, p_by: s.profile.full_name });
  if (error) return { error: error.message };
  (await cookies()).set(LOCK_COOKIE, lockValue({ key, mode, rid: s.restaurant.id }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: YEAR });
  return { ok: true as const, href: lockHref(key), mode };
}

/**
 * Release this device: an owner, a general manager or a manager signs in on it — their own sign-in ID or email and
 * password, checked on a separate client so the device's own sign-in is untouched (as the kiosk's leave does). Counted
 * against the same sign-in limits as the login form when the service key is set. The person must belong to this
 * property, or be the one signed in here.
 */
export async function releaseDisplay(login: string, password: string) {
  const s = await requireSession();
  const jar = await cookies();
  const lock = parseLock(jar.get(LOCK_COOKIE)?.value);
  if (!lock) return { ok: true as const };
  const tries = loginCandidates(String(login ?? "").trim());
  if (!tries.length || !password) return { error: "Type a manager's sign-in ID or email, and their password." };
  const { adminClient, serviceRoleConfigured } = await import("@/lib/supabase/admin");
  const gate = serviceRoleConfigured() ? adminClient() : null;
  /* the lockout is this property's own (2026-10-25 audit): one shared "display-lock" bucket let anyone block every property's
     unlock with thirty bad passwords */
  const bucket = `display-lock:${lock.rid}`;
  if (gate) { const { data: open } = await gate.rpc("login_gate", { p_login: tries[0], p_ip: bucket }); if (open === false) return { error: "Too many tries. Wait 15 minutes." }; }
  const { createClient: plain } = await import("@supabase/supabase-js");
  const check = plain(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  let signed: { user: { id: string } } | null = null;
  for (const email of tries) { const { data, error } = await check.auth.signInWithPassword({ email, password }); if (!error && data.user) { signed = { user: { id: data.user.id } }; break; } }
  if (!signed) { if (gate) await gate.rpc("login_failed", { p_login: tries[0], p_ip: bucket }); return { error: "That sign-in did not work." }; }
  const { data: who } = await check.from("profiles").select("full_name, role, restaurant_id").eq("id", signed.user.id).maybeSingle();
  const p = who as { full_name: string; role: string; restaurant_id: string } | null;
  /* a manager of the property that set the lock — not of whatever property this device is signed in to now */
  const ofLock = !!p && (p.restaurant_id === lock.rid || (signed.user.id === s.userId && s.restaurant.id === lock.rid));
  if (!p || !MAY(p.role) || !ofLock) {
    await check.auth.signOut({ scope: "local" });
    return { error: !p || !MAY(p.role) ? "Only the owner, a general manager or a manager can unlock a display." : "That manager is not part of the property that locked this display." };
  }
  /* the audit line is written as that manager, on their own sign-in (0143 refuses a release from anyone else) */
  await check.rpc("display_lock_note", { p_action: "release", p_key: lock.key, p_mode: lock.mode, p_by: p.full_name });
  await check.auth.signOut({ scope: "local" });
  jar.delete(LOCK_COOKIE);
  return { ok: true as const, by: p.full_name };
}

/**
 * A lock the property no longer allows — its page turned off, or its kind changed: forget it quietly. Only then (2026-10-25
 * audit): this action is reachable from any page, and it used to delete any lock, no questions asked. A lock set by
 * another property than the one signed in here is not stale — it stays until a manager of that property releases it.
 */
export async function clearStaleLock() {
  const s = await requireSession();
  const jar = await cookies();
  const lock = parseLock(jar.get(LOCK_COOKIE)?.value);
  if (!lock) return { ok: true as const };
  if (lock.rid !== s.restaurant.id) return { error: "This display was locked by another property." };
  const kind = ((s.restaurant as { display_lock?: Record<string, LockMode> }).display_lock ?? {})[lock.key];
  if (kind === lock.mode) return { error: "This display is locked." };
  jar.delete(LOCK_COOKIE);
  return { ok: true as const };
}

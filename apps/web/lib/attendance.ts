import "server-only";
import { headers } from "next/headers";
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { adminClient, serviceRoleConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Attendance that is not a manager's tick or a scanned card: Biometric (a passkey — the person's
 * fingerprint or Face ID on their own phone, or on a shared device) and Selfie + location (a photo and a
 * GPS fix inside the property's radius). Both end in public._attend, which refuses a method the owner
 * has switched off; that function is the service role's alone, so a browser cannot punch by calling it.
 *
 * Who is punching is decided here, never taken from the browser: a labourer by the secret token in their
 * personal link (/attend/<token>), a staff member by their signed-in session.
 *
 * A fingerprint never leaves the device. A passkey proves that whoever is enrolled on *that device*
 * unlocked it — on a worker's own phone that is the worker; on a shared tablet it is anyone enrolled
 * there, which the screens say plainly.
 */

export type Subject = { restaurant: string; labourer: string | null; profile: string | null; name: string; property: string };
export type Methods = { methods: string[]; lat: number | null; lng: number | null; radius: number };

const db = () => {
  if (!serviceRoleConfigured()) throw new Error("Phone attendance is not switched on here yet");
  return adminClient();
};

/** The labourer behind a personal link, or null. */
export async function subjectFromToken(token: string): Promise<Subject | null> {
  if (!/^[a-f0-9]{24,64}$/i.test(token)) return null;
  const { data } = await db().from("labourers").select("id, full_name, restaurant_id, status, restaurants(name)").eq("punch_token", token).maybeSingle();
  if (!data || data.status !== "active") return null;
  return { restaurant: data.restaurant_id, labourer: data.id, profile: null, name: data.full_name, property: (data.restaurants as unknown as { name: string } | null)?.name ?? "" };
}

/** The signed-in staff member, or null (Master control has no profile in the property). */
export async function subjectFromSession(): Promise<Subject | null> {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return null;
  const { data } = await db().from("profiles").select("id, full_name, restaurant_id, is_active, restaurants(name)").eq("id", user.id).maybeSingle();
  if (!data || !data.restaurant_id || data.is_active === false) return null;
  return { restaurant: data.restaurant_id, labourer: null, profile: data.id, name: data.full_name, property: (data.restaurants as unknown as { name: string } | null)?.name ?? "" };
}

export async function methodsFor(restaurant: string): Promise<Methods> {
  const { data } = await db().from("restaurants").select("attendance_methods, attend_lat, attend_lng, attend_radius_m").eq("id", restaurant).single();
  return { methods: data?.attendance_methods ?? ["manual", "qr"], lat: data?.attend_lat ?? null, lng: data?.attend_lng ?? null, radius: data?.attend_radius_m ?? 150 };
}

/** Today (IST) for this person: in, out, how, and whether a passkey is set up. */
export async function todayFor(sub: Subject) {
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const s = db();
  const att = sub.labourer
    ? await s.from("labour_attendance").select("in_at, out_at, method_in, method_out, hours").eq("labourer_id", sub.labourer).eq("work_date", today).maybeSingle()
    : await s.from("staff_attendance").select("in_at, out_at, method_in, method_out, hours").eq("profile_id", sub.profile!).eq("work_date", today).maybeSingle();
  const keys = await s.from("attendance_passkeys").select("id", { count: "exact", head: true }).eq(sub.labourer ? "labourer_id" : "profile_id", (sub.labourer ?? sub.profile)!);
  return { today: att.data ?? null, passkeys: keys.count ?? 0 };
}

async function rp() {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost").split(",")[0].trim();
  const proto = (h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https")).split(",")[0].trim();
  return { rpID: host.replace(/:\d+$/, ""), origin: `${proto}://${host}` };
}

const who = (sub: Subject) => (sub.labourer ? { labourer_id: sub.labourer } : { profile_id: sub.profile });
const whoCol = (sub: Subject) => (sub.labourer ? "labourer_id" : "profile_id");
const enabled = async (sub: Subject, m: string) => (await methodsFor(sub.restaurant)).methods.includes(m);

async function saveChallenge(sub: Subject, purpose: "register" | "punch", challenge: string) {
  const s = db();
  await s.from("attendance_challenges").delete().eq(whoCol(sub), (sub.labourer ?? sub.profile)!).eq("purpose", purpose);
  await s.from("attendance_challenges").insert({ restaurant_id: sub.restaurant, ...who(sub), purpose, challenge });
}
async function takeChallenge(sub: Subject, purpose: "register" | "punch") {
  const s = db();
  const { data } = await s.from("attendance_challenges").select("id, challenge, expires_at").eq(whoCol(sub), (sub.labourer ?? sub.profile)!).eq("purpose", purpose).order("expires_at", { ascending: false }).limit(1).maybeSingle();
  if (data) await s.from("attendance_challenges").delete().eq("id", data.id);   // one use only
  if (!data || new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.challenge as string;
}

// ── Biometric: set up a passkey on this device ─────────────────────────────
export async function registerOptions(sub: Subject) {
  if (!(await enabled(sub, "biometric"))) return { error: "Fingerprint / Face ID attendance is turned off" };
  const { rpID } = await rp();
  const { data: existing } = await db().from("attendance_passkeys").select("credential_id, transports").eq(whoCol(sub), (sub.labourer ?? sub.profile)!);
  const opts = await generateRegistrationOptions({
    rpName: `DineFlow · ${sub.property}`, rpID,
    userName: sub.name, userDisplayName: sub.name,
    userID: new TextEncoder().encode((sub.labourer ?? sub.profile)!),
    attestationType: "none",
    excludeCredentials: (existing ?? []).map((c) => ({ id: c.credential_id, transports: (c.transports ?? undefined) as never })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required", authenticatorAttachment: "platform" },
  });
  await saveChallenge(sub, "register", opts.challenge);
  return { options: opts };
}

export async function registerFinish(sub: Subject, response: RegistrationResponseJSON, label: string) {
  const challenge = await takeChallenge(sub, "register");
  if (!challenge) return { error: "That took too long — try again" };
  const { rpID, origin } = await rp();
  let v;
  try { v = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true }); }
  catch (e) { return { error: `This device could not be set up: ${(e as Error).message}` }; }
  if (!v.verified) return { error: "This device could not be set up" };
  const c = v.registrationInfo.credential;
  const { error } = await db().from("attendance_passkeys").insert({
    restaurant_id: sub.restaurant, ...who(sub), credential_id: c.id, public_key: Buffer.from(c.publicKey).toString("base64url"),
    counter: c.counter, transports: c.transports ?? null, label: label.slice(0, 60) || "This device",
  });
  if (error) return { error: error.message };
  return { ok: true };
}

// ── Biometric: punch ───────────────────────────────────────────────────────
export async function punchOptions(sub: Subject) {
  if (!(await enabled(sub, "biometric"))) return { error: "Fingerprint / Face ID attendance is turned off" };
  const { rpID } = await rp();
  const { data: keys } = await db().from("attendance_passkeys").select("credential_id, transports").eq(whoCol(sub), (sub.labourer ?? sub.profile)!);
  if (!keys?.length) return { error: "Set up fingerprint / Face ID on this device first" };
  const opts = await generateAuthenticationOptions({ rpID, userVerification: "required", allowCredentials: keys.map((k) => ({ id: k.credential_id, transports: (k.transports ?? undefined) as never })) });
  await saveChallenge(sub, "punch", opts.challenge);
  return { options: opts };
}

export async function punchFinish(sub: Subject, response: AuthenticationResponseJSON, device: string) {
  const challenge = await takeChallenge(sub, "punch");
  if (!challenge) return { error: "That took too long — try again" };
  const s = db();
  const { data: key } = await s.from("attendance_passkeys").select("id, credential_id, public_key, counter, transports").eq(whoCol(sub), (sub.labourer ?? sub.profile)!).eq("credential_id", response.id).maybeSingle();
  if (!key) return { error: "This fingerprint / Face ID is not set up for you" };
  const { rpID, origin } = await rp();
  let v;
  try {
    v = await verifyAuthenticationResponse({ response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
      credential: { id: key.credential_id, publicKey: new Uint8Array(Buffer.from(key.public_key, "base64url")), counter: Number(key.counter), transports: (key.transports ?? undefined) as never } });
  } catch (e) { return { error: `Not recognised: ${(e as Error).message}` }; }
  if (!v.verified) return { error: "Not recognised" };
  await s.from("attendance_passkeys").update({ counter: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq("id", key.id);
  return attend(sub, "biometric", { device });
}

// ── Selfie + location ──────────────────────────────────────────────────────
/** metres between two points on the earth */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000, r = (d: number) => (d * Math.PI) / 180;
  const x = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}

export async function selfiePunch(sub: Subject, fd: FormData) {
  const m = await methodsFor(sub.restaurant);
  if (!m.methods.includes("selfie")) return { error: "Selfie + location attendance is turned off" };
  if (m.lat == null || m.lng == null) return { error: "The owner has not set the property's location yet" };
  const lat = Number(fd.get("lat")), lng = Number(fd.get("lng")), acc = Math.round(Number(fd.get("accuracy")) || 0);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { error: "No location — allow location and try again" };
  const photo = fd.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return { error: "Take a selfie first" };
  if (photo.size > 1_500_000) return { error: "That photo is too large" };
  const head = new Uint8Array(await photo.slice(0, 12).arrayBuffer());
  const jpeg = head[0] === 0xff && head[1] === 0xd8, png = head[0] === 0x89 && head[1] === 0x50, webp = head[8] === 0x57 && head[9] === 0x45;
  if (!jpeg && !png && !webp) return { error: "That is not a photo" };
  const d = distanceM(m.lat, m.lng, lat, lng);
  // the phone's own uncertainty, capped: a fix that might be inside is given the benefit, a wild one is not
  if (d - Math.min(acc, 100) > m.radius) return { error: `You are ${d >= 1000 ? (d / 1000).toFixed(1) + " km" : d + " m"} from the property — attendance by selfie works within ${m.radius} m` };
  const day = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const path = `${sub.restaurant}/${day}/${(sub.labourer ?? sub.profile)!}-${Date.now()}.${jpeg ? "jpg" : png ? "png" : "webp"}`;
  const up = await db().storage.from("attendance").upload(path, photo, { contentType: jpeg ? "image/jpeg" : png ? "image/png" : "image/webp", upsert: false });
  if (up.error) return { error: `The photo did not upload: ${up.error.message}` };
  return attend(sub, "selfie", { lat, lng, distance: d, accuracy: acc, photo: path, device: "phone" });
}

async function attend(sub: Subject, method: string, x: { lat?: number; lng?: number; distance?: number; accuracy?: number; photo?: string; device?: string }) {
  const { data, error } = await db().rpc("_attend", {
    p_restaurant: sub.restaurant, p_labourer: sub.labourer, p_profile: sub.profile, p_method: method,
    p_lat: x.lat ?? null, p_lng: x.lng ?? null, p_distance: x.distance ?? null, p_accuracy: x.accuracy ?? null,
    p_photo: x.photo ?? null, p_by: sub.profile, p_device: x.device ?? null,
  });
  if (error) return { error: error.message };
  return { ok: true as const, ...(data as { name: string; event: "in" | "out" | "done"; at?: string; hours?: number }) };
}

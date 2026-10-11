"use server";
import { revalidatePath } from "next/cache";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { punchFinish, punchOptions, registerFinish, registerOptions, selfiePunch, subjectFromSession, subjectFromToken } from "@/lib/attendance";

/**
 * One set of actions for both punch screens. `token` is a labourer's personal link; null means the
 * signed-in staff member. Identity is resolved on the server every time — the browser never names who
 * is punching.
 */
async function who(token: string | null) {
  try { return token ? await subjectFromToken(token) : await subjectFromSession(); }
  catch (e) { return { error: (e as Error).message } as const; }
}
const bump = () => ["/labour", "/staff", "/attendance"].forEach((p) => revalidatePath(p));
type R = { error: string } | { ok: true; name?: string; event?: string; at?: string; hours?: number } | { options: unknown };

async function run(token: string | null, fn: (sub: NonNullable<Awaited<ReturnType<typeof subjectFromToken>>>) => Promise<unknown>): Promise<R> {
  const sub = await who(token);
  if (!sub) return { error: token ? "This attendance link is not valid any more — ask for a new one" : "Sign in first" };
  if ("error" in sub) return { error: sub.error };
  try { const r = (await fn(sub)) as R; if ("ok" in r) bump(); return r; }
  catch (e) { return { error: (e as Error).message }; }
}

export async function attendRegisterBegin(token: string | null) { return run(token, (s) => registerOptions(s)); }
export async function attendRegisterFinish(token: string | null, response: RegistrationResponseJSON, label: string) { return run(token, (s) => registerFinish(s, response, label)); }
export async function attendPunchBegin(token: string | null) { return run(token, (s) => punchOptions(s)); }
export async function attendPunchFinish(token: string | null, response: AuthenticationResponseJSON, device: string) { return run(token, (s) => punchFinish(s, response, device)); }
export async function attendSelfie(token: string | null, fd: FormData) { return run(token, (s) => selfiePunch(s, fd)); }

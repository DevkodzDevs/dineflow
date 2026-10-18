"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { newOrderSchema } from "@dineflow/shared";

/**
 * A guest's order from the kiosk: a parcel order placed as the signed-in tablet (`place_order` prices every line
 * itself), then the day's token the database gave it (0103). The guest pays at the counter, where the bill is made.
 */
export async function kioskOrder(input: { name: string; items: { menu_item_id: string; qty: number; variant_id: string | null; addon_ids: string[] }[] }) {
  const parsed = newOrderSchema.safeParse({ type: "takeaway", customer_name: input.name.trim() || null, items: input.items, note: "Kiosk" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data; const s = await createClient();
  const { data: id, error } = await s.rpc("place_order", {
    p_type: "takeaway", p_table_id: null, p_items: d.items, p_customer: { name: d.customer_name ?? null, phone: null },
    p_note: d.note, p_client_id: null, p_placed_at: null, p_promise: false,
  });
  if (error) return { error: error.message };
  const { data: o } = await s.from("orders").select("order_no, token_no").eq("id", id as string).single();
  ["/orders", "/kitchen", "/billing", "/dashboard"].forEach((p) => revalidatePath(p));
  return { ok: true, token: (o?.token_no ?? null) as number | null, orderNo: (o?.order_no ?? null) as number | null };
}

/**
 * Leaving the kiosk needs this tablet's own sign-in password — the corner gesture alone dropped a guest into the staff
 * app. The password is checked on a separate, throwaway sign-in (no cookies), which is then ended, so the tablet's own
 * session — and the outlet it is standing in — is untouched. Failed tries count like failed sign-ins (login_gate /
 * login_failed, when the service role is configured).
 */
export async function kioskLeave(password: string) {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user?.email) return { error: "This tablet is not signed in." };
  const { adminClient, serviceRoleConfigured } = await import("@/lib/supabase/admin");
  const db = serviceRoleConfigured() ? adminClient() : null;
  if (db) { const { data: open } = await db.rpc("login_gate", { p_login: user.email, p_ip: "kiosk" }); if (open === false) return { error: "Too many tries. Wait 15 minutes." }; }
  const { createClient: plain } = await import("@supabase/supabase-js");
  const check = plain(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await check.auth.signInWithPassword({ email: user.email, password });
  if (error) { if (db) await db.rpc("login_failed", { p_login: user.email, p_ip: "kiosk" }); return { error: "That is not this tablet's password." }; }
  await check.auth.signOut({ scope: "local" });
  return { ok: true as const };
}

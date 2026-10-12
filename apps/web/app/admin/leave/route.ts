import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * "Back to Master control", as a plain form post — the same shape as /logout. A form works the instant
 * the page is on screen; the button's old onClick only worked once the page had hydrated, so a tap in
 * the first second after opening a property was silently lost and the master was left inside it.
 * admin_stop_acting checks the caller itself (a non-master changes nothing); then on to /admin.
 */
export async function POST() {
  const s = await createClient();
  try { await s.rpc("admin_stop_acting"); } catch { /* /admin shows the truth either way */ }
  revalidatePath("/", "layout");
  // a relative Location: the browser stays on the host it is on (req.url can name another, behind a proxy)
  return new NextResponse(null, { status: 303, headers: { Location: "/admin" } });
}

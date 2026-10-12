import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Master control's "Open", as a plain form post, in the same tab. A form works the moment the list is
 * on screen (an onClick waited for hydration and a quick tap was lost), and the same tab matters:
 * which property the master is inside is one value for the account, not per tab — a second tab
 * turned the first into the same property, and on an installed iPhone app a new tab opened in Safari
 * without the app's sign-in. admin_act_as checks that the caller is a master itself.
 */
export async function POST(req: Request) {
  const id = String((await req.formData()).get("id") ?? "");
  const s = await createClient();
  const { error } = id ? await s.rpc("admin_act_as", { p_restaurant: id }) : { error: { message: "No property chosen" } };
  revalidatePath("/", "layout");
  const to = error ? `/admin?error=${encodeURIComponent(error.message)}` : "/dashboard";
  // a relative Location: the browser stays on the host it is on (req.url can name another, behind a proxy)
  return new NextResponse(null, { status: 303, headers: { Location: to } });
}

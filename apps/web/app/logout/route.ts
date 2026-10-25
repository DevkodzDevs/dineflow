import { NextResponse } from "next/server";
import { crossSite } from "@/lib/sameOrigin";
import { createClient } from "@/lib/supabase/server";
export async function POST(req: Request) {
  if (crossSite(req)) return new NextResponse("Forbidden", { status: 403 }); // only this app's own pages (2026-10-25 audit)
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/", "/login", "/signup", "/join", "/membership", "/offline"];
const PUBLIC_PREFIX = ["/queue/", "/dine", "/book/", "/record/", "/api/webhooks/", "/api/ical/", "/api/ota/", "/api/box/"];

export async function middleware(req: NextRequest) {
  req.headers.set("x-pathname", req.nextUrl.pathname);
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (all: { name: string; value: string; options?: Record<string, unknown> }[]) => { all.forEach(({ name, value }) => req.cookies.set(name, value)); res = NextResponse.next({ request: req }); all.forEach(({ name, value, options }) => res.cookies.set(name, value, options as never)); },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC.includes(path) || PUBLIC_PREFIX.some((x) => path.startsWith(x));
  if (!user && !isPublic) return NextResponse.redirect(new URL("/login", req.url));
  if (user && (path === "/login" || path === "/signup" || path === "/")) {
    const { data: master } = await supabase.rpc("is_master");
    return NextResponse.redirect(new URL(master ? "/admin" : "/dashboard", req.url));
  }
  return res;
}
export const config = { matcher: ["/((?!_next|api|.*\\..*).*)"] };

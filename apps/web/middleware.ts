import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/", "/login", "/signup", "/join", "/forgot", "/membership", "/offline"];
const PUBLIC_PREFIX = ["/queue/", "/dine", "/book/", "/record/", "/pay/", "/api/webhooks/", "/api/ical/", "/api/ota/", "/api/box/"];
/** Pages a signed-in user must always be able to reach, even with must_change_password set. Without
 *  this the password-change screen has no way out: the middleware bounces /login to /dashboard, and
 *  the app layout bounces /dashboard back to /account/password. */
const ALWAYS_REACHABLE = ["/account/password", "/logout", "/join"];

/**
 * The addresses people actually type. "signin" is at least as natural a guess as "login", and a
 * dead end is a poor answer to someone trying to reach their own sign-in page.
 *
 * These are resolved here rather than through next.config redirects because this middleware answers
 * first: for a signed-out visitor the gate below turns every unknown path into /login, so a redirect
 * declared further down the stack never ran and /sign-up landed on the sign-in page.
 */
const ALIASES: Record<string, string> = {
  "/signin": "/login", "/sign-in": "/login", "/log-in": "/login", "/signon": "/login",
  "/sign-up": "/signup", "/register": "/signup", "/create-account": "/signup",
  "/forgot-password": "/forgot", "/reset-password": "/forgot", "/password-reset": "/forgot",
  // No /signout alias: /logout only answers POST, by design. Signing someone out on a GET means a
  // prefetch or a stray link can end their session, so a redirect there would be a 405 at best.
};

export async function middleware(req: NextRequest) {
  req.headers.set("x-pathname", req.nextUrl.pathname);
  const alias = ALIASES[req.nextUrl.pathname.replace(/\/+$/, "").toLowerCase()];
  if (alias) return NextResponse.redirect(new URL(alias, req.url));
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
  if (user) {
    // A signed-in user on /login, /signup or / is sent where they belong.
    // But NOT if they are on a page they must always be able to reach (password change, sign out).
    const reachable = ALWAYS_REACHABLE.some((p) => path.startsWith(p));
    if (!reachable && (path === "/login" || path === "/signup" || path === "/")) {
      const { data: master } = await supabase.rpc("is_master");
      return NextResponse.redirect(new URL(master ? "/admin" : "/dashboard", req.url));
    }
  }
  return res;
}
export const config = { matcher: ["/((?!_next|api|.*\\..*).*)"] };

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/", "/login", "/signup", "/join", "/forgot", "/membership", "/offline", "/get"];
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
  /**
   * getClaims() verifies the token's signature against the project's public keys, which it caches, so
   * on a project with asymmetric keys this gate costs no network call at all — where getUser() asked
   * the auth server on every single navigation. Projects still on a shared secret fall back to exactly
   * that call inside getClaims(), so this is never slower and never less checked.
   */
  /* getClaims() reports a refused refresh either way depending on the path it took — returned in
     `error`, or thrown out of the call. The server log for this one carries a stack trace, which is
     the thrown shape, and a handler that only reads `error` would never run. Both are caught here;
     neither is worth a stack trace, because being signed out is not a failure. */
  type AuthFail = { code?: string; message?: string };
  let claims: Awaited<ReturnType<typeof supabase.auth.getClaims>>["data"] = null;
  let authError: AuthFail | null = null;
  try {
    const got = await supabase.auth.getClaims();
    claims = got.data;
    authError = (got.error as AuthFail | null) ?? null;
  } catch (e) {
    authError = e as AuthFail;
  }
  const user = claims ? { id: claims.claims.sub } : null;

  /**
   * A refresh token the auth server will not honour — revoked, rotated away, or simply older than the
   * session it belonged to. Being signed out is an ordinary state, not an error, but the cookie that
   * proves it has to go: left in place the browser sends it again on the very next request, the auth
   * server refuses it again, and the console fills with
   *
   *     AuthApiError: Invalid Refresh Token: Refresh Token Not Found
   *
   * once per request, for as long as that browser lives. It costs a round trip to Supabase every time
   * and buries anything that matters underneath it.
   *
   * Only these codes clear the session. A network failure reaching the auth server must never sign
   * anyone out — that is the same distinction the app makes when the database cannot be reached.
   */
  const DEAD_SESSION = new Set(["refresh_token_not_found", "refresh_token_already_used", "session_not_found", "session_expired"]);
  const sessionIsDead = !user && !!authError && DEAD_SESSION.has((authError as { code?: string }).code ?? "");
  const forget = (r: NextResponse) => {
    if (!sessionIsDead) return r;
    for (const c of req.cookies.getAll()) {
      // supabase-js splits a large token across sb-<ref>-auth-token.0, .1, …
      if (/^sb-.+-auth-token(\.\d+)?$/.test(c.name)) r.cookies.set(c.name, "", { path: "/", maxAge: 0 });
    }
    return r;
  };
  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC.includes(path) || PUBLIC_PREFIX.some((x) => path.startsWith(x));
  if (!user && !isPublic) return forget(NextResponse.redirect(new URL("/login", req.url)));
  if (user) {
    // A signed-in user on /login, /signup or / is sent where they belong.
    // But NOT if they are on a page they must always be able to reach (password change, sign out).
    const reachable = ALWAYS_REACHABLE.some((p) => path.startsWith(p));
    if (!reachable && (path === "/login" || path === "/signup" || path === "/")) {
      const { data: master } = await supabase.rpc("is_master");
      return NextResponse.redirect(new URL(master ? "/admin" : "/dashboard", req.url));
    }
  }
  return forget(res);
}
export const config = { matcher: ["/((?!_next|api|.*\\..*).*)"] };

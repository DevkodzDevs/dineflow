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
  /**
   * What the auth client asks us to write back: a freshly rotated token, or the cleared cookie of a
   * session it has given up on. These are set on `res` as usual — but they are also kept here,
   * because two of the three ways out of this function build a *new* response (a redirect), and a
   * cookie set on `res` does not travel with it. A refreshed token dropped that way is not lost
   * data, but it does mean the browser keeps presenting the old one and pays for another refresh
   * on the very next request.
   */
  const pending: { name: string; value: string; options?: Record<string, unknown> }[] = [];
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (all: { name: string; value: string; options?: Record<string, unknown> }[]) => { pending.push(...all); all.forEach(({ name, value }) => req.cookies.set(name, value)); res = NextResponse.next({ request: req }); all.forEach(({ name, value, options }) => res.cookies.set(name, value, options as never)); },
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
   *
   * "validation_failed" belongs here too, and its absence was the whole of this bug: a token the
   * server has simply never heard of comes back refresh_token_not_found, but one that is *malformed*
   * — truncated by a botched copy, half-written by a crashed tab, left over from another project —
   * comes back validation_failed, which nothing matched. The cookie therefore survived, the browser
   * presented it again on the next request, and the console filled with the same refusal forever.
   * It can only be reached here after a refresh was attempted and refused, so there is nothing else
   * it could mean; a connection that never arrived is an AuthRetryableFetchError and is not in this
   * set.
   */
  const DEAD_SESSION = new Set(["refresh_token_not_found", "refresh_token_already_used", "session_not_found", "session_expired", "validation_failed"]);
  const sessionIsDead = !user && !!authError && DEAD_SESSION.has((authError as { code?: string }).code ?? "");
  /**
   * Everything the auth client wanted written, applied to whichever response is actually going back
   * — and, for a session that is past saving, the cookie removed so the browser stops offering it.
   */
  const finish = (r: NextResponse) => {
    for (const { name, value, options } of pending) r.cookies.set(name, value, options as never);
    if (!sessionIsDead) return r;
    for (const c of req.cookies.getAll()) {
      // supabase-js splits a large token across sb-<ref>-auth-token.0, .1, …
      if (/^sb-.+-auth-token(\.\d+)?$/.test(c.name)) r.cookies.set(c.name, "", { path: "/", maxAge: 0 });
    }
    return r;
  };
  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC.includes(path) || PUBLIC_PREFIX.some((x) => path.startsWith(x));
  if (!user && !isPublic) return finish(NextResponse.redirect(new URL("/login", req.url)));
  if (user) {
    // A signed-in user on /login, /signup or / is sent where they belong.
    // But NOT if they are on a page they must always be able to reach (password change, sign out).
    const reachable = ALWAYS_REACHABLE.some((p) => path.startsWith(p));
    if (!reachable && (path === "/login" || path === "/signup" || path === "/")) {
      const { data: master } = await supabase.rpc("is_master");
      return finish(NextResponse.redirect(new URL(master ? "/admin" : "/dashboard", req.url)));
    }
  }
  return finish(res);
}
export const config = { matcher: ["/((?!_next|api|.*\\..*).*)"] };

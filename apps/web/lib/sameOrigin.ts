/**
 * A state-changing route handler (POST) answers only its own pages (2026-10-25 audit). Server actions get Next's own
 * cross-site check; a plain route handler does not — /admin/open (which property the master stands in), /admin/leave
 * and /logout relied on the sign-in cookies being SameSite=Lax alone. The browser says where a request came from
 * (`Sec-Fetch-Site`); an older one sends `Origin`, compared with this request's own host.
 */
export function crossSite(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site !== "same-origin" && site !== "none";
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  try { return new URL(origin).host !== host; } catch { return true; }
}

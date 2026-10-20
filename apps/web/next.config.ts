import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@dineflow/shared"],
  /**
   * The live-reload server writes Turbopack output; `next build` writes webpack output. Sharing one
   * folder lets the second one run leave the first half-overwritten, and `next start` then dies on
   * every request with "Cannot find module '[turbopack]_runtime.js'" — a production build that looks
   * complete but cannot serve. The launcher points dev at .next-dev so the two never meet.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: process.env.DOCKER ? "standalone" : undefined,   // a self-contained server for Docker and the Box
  productionBrowserSourceMaps: false,
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
    // tree-shake the big icon and animation libraries so each screen only ships what it uses
    optimizePackageImports: ["lucide-react", "framer-motion", "recharts", "@supabase/supabase-js"],
    /**
     * Keep a screen the browser has already rendered for 30 seconds, so going back to it is
     * instant instead of another round trip to the server. Every server action revalidates the
     * paths it changed, which drops those from this cache at once, and the live screens re-read
     * through useLive — so this saves the wait, not the freshness.
     *
     * `static` is 30 too, not Next's 300 or the 180 it was: it is also how long a *full* prefetch is
     * reused, and IntentPrefetch (components/shell) fetches the next screen in full the moment a finger
     * touches a link or a mouse rests on one. A screen fetched on a hover must not be shown three
     * minutes later as if it were current. The only static pages are sign-in and the legal pages.
     */
    // 2026-10-20: 120 s, with IntentPrefetch's warm-up and its "show, then freshen" re-read on arrival — a screen
    // from this cache is shown at once and re-read in the background 250 ms later, so it is never shown stale.
    staleTimes: { dynamic: 120, static: 120 },
  },
  // The name aliases (/signin → /login and friends) are handled in middleware.ts, not here. The auth
  // gate in that middleware answers first for a signed-out visitor, so a redirect declared at this
  // level never got the chance to run and every alias became /login regardless of what it meant.

  async headers() {
    return [
      { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      /**
       * Applied to every response. X-Frame-Options and the frame-ancestors directive keep the app out
       * of someone else's iframe, which is what a clickjacked "settle bill" button needs to exist.
       * Permissions-Policy keeps the camera (the scanner) and the microphone (Assist's voice input)
       * for this origin, and the location for selfie attendance (Settings → Attendance sets where the
       * property is; a selfie punch is accepted only inside that radius). Everything else stays shut.
       * HSTS is set only in production: on localhost it would pin a certificate the dev server
       * has not got, and lock the machine out of http://localhost for six months.
       */
      { source: "/(.*)", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        // object-src/base-uri: no plugins, and no injected <base> re-pointing relative URLs. A script-src
        // policy is not set yet: Next's inline bootstrap needs nonces, which means a middleware change.
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), interest-cohort=()" },
        ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
      ] },
    ];
  },
};
export default config;

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
  },
  // The name aliases (/signin → /login and friends) are handled in middleware.ts, not here. The auth
  // gate in that middleware answers first for a signed-out visitor, so a redirect declared at this
  // level never got the chance to run and every alias became /login regardless of what it meant.

  async headers() {
    return [
      { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      { source: "/(.*)", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }, { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }] },
    ];
  },
};
export default config;

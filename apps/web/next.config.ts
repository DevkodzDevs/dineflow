import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@dineflow/shared"],
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
  async headers() {
    return [
      { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      { source: "/(.*)", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }, { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }] },
    ];
  },
};
export default config;

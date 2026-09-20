import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { THEME_BOOT } from "@/components/ui/Theme";
import { INSTALL_CAPTURE } from "@/components/InstallApp";
import { ServiceWorker } from "@/components/ServiceWorker";
import { NavProgress } from "@/components/ui";

// Fonts ship inside the app, so builds and the on-premise Box need no internet.
const oswald = localFont({ src: "../public/fonts/Oswald.ttf", variable: "--font-oswald", display: "swap" });
const manrope = localFont({ src: "../public/fonts/Manrope.ttf", variable: "--font-manrope", display: "swap" });
const jet = localFont({ src: "../public/fonts/JetBrainsMono.ttf", variable: "--font-jetbrains", display: "swap" });

/**
 * Where this app answers from, used to turn the relative image paths below into the absolute URLs
 * that Open Graph and Twitter cards require. Without it Next assumes http://localhost:3000, warns on
 * every boot, and any link shared to WhatsApp or a search result carries a preview image pointing at
 * the sharer's own laptop.
 *
 * It comes from the same NEXT_PUBLIC_CLOUD_URL that the Proof, Channels and booking-page links
 * already use, so a deployment sets its address once. It cannot be read off the request instead:
 * metadata is a static export, and reaching for headers() here would drag every route in the app
 * back out of the route cache. A malformed value falls back rather than throwing — a typo in an env
 * var should not be the reason a property cannot open its own till.
 */
const siteUrl = (() => {
  const raw = process.env.NEXT_PUBLIC_CLOUD_URL?.trim();
  try { return new URL(raw || "http://localhost:3000"); } catch { return new URL("http://localhost:3000"); }
})();

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: "DineFlow", template: "%s · DineFlow" },
  description: "Pantry, kitchen, orders and billing — one live control room for your restaurant.",
  manifest: "/manifest.json",
  applicationName: "DineFlow",
  // the manifest listed icon-192 and icon-512 for months while neither file existed, so an installed
  // app fell back to a screenshot of the page; these are the real mark
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "DineFlow", statusBarStyle: "black-translucent" },
  openGraph: { title: "DineFlow", description: "One live control room for your restaurant.", images: ["/icon-512.png"], type: "website" },
};
export const viewport: Viewport = { themeColor: "#0a0a0d", width: "device-width", initialScale: 1, viewportFit: "cover" };

/**
 * The theme is settled in the browser, not here, and that is a performance decision as much as a
 * rendering one. Reading the cookie in the ROOT layout made every route in the application dynamic —
 * a cookie read anywhere in a layout opts its whole subtree out of the route cache — so the guest
 * pages that have no session at all (a hotel's booking link, a storefront, a bill's pay page) were
 * re-rendered from the database on every single view, and no `revalidate` anywhere below could take
 * effect. THEME_BOOT already writes data-theme onto <html> from the same cookie inside <head>, which
 * runs before the first paint, so nobody sees a flash; suppressHydrationWarning is there because the
 * attribute is expected to differ. Pages that must be live still say so themselves.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${oswald.variable} ${manrope.variable} ${jet.variable} deck`}>
      <head>{process.env.NEXT_PUBLIC_SUPABASE_URL && <><link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} crossOrigin="anonymous" /><link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL} /></>}<script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} /><script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE }} /></head>
      <body><NavProgress />{children}<ServiceWorker /></body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { THEME_BOOT, ThemeKeeper } from "@/components/ui/Theme";
import { FullLanguage } from "@/components/ui/FullLanguage";
import { LANG_BOOT } from "@/lib/i18n/scope";
import { SIDEBAR_BOOT } from "@/lib/sidebar";
import { SPLASH_BOOT, LAUNCH_IMAGES } from "@/lib/splash";
import { INSTALL_CAPTURE } from "@/lib/install";
import { STALE_BOOT } from "@/components/shell/staleBoot";
import { ServiceWorker } from "@/components/ServiceWorker";
import { FirstPaint } from "@/components/FirstPaint";
import { NavProgress, ConfirmHost } from "@/components/ui";

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
  // a production build with no address set falls back to the public site, not to this machine — the live share
  // card pointed at http://localhost:3000/icon-512.png
  const fallback = process.env.NODE_ENV === "production" ? "https://www.dineflow.cloud" : "http://localhost:3000";   // www: the primary host (the bare name 308s to it)
  try { return new URL(raw || fallback); } catch { return new URL(fallback); }
})();

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: "DineFlow", template: "%s · DineFlow" },
  description: "Pantry, kitchen, orders and billing — one live control room for your restaurant.",
  // the manifest and the home-screen tags are written into <head> by the layout below, not here: Next 15
  // streams metadata into <body> for an ordinary browser on a dynamic page, and Chrome looks for the
  // manifest — Safari for apple-touch-icon / apple-mobile-web-app-* — only in <head>. Chrome's
  // installability check said "no-manifest" on /get itself, so no browser offered to install.
  applicationName: "DineFlow",
  // the manifest listed icon-192 and icon-512 for months while neither file existed, so an installed
  // app fell back to a screenshot of the page; these are the real mark
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
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
      <head>
        {/* first in <head>: a build file that is gone (a tab older than the last deploy) reloads the page once onto the new
            build, instead of Next's bare "Application error" — components/shell/staleBoot.ts */}
        <script dangerouslySetInnerHTML={{ __html: STALE_BOOT }} />
        {/* installing: Chrome/Edge (Android, Windows, Mac) read the manifest; Safari (iPhone, iPad) reads
            these apple-* tags. Both only from <head> — see the metadata note above. The original
            apple-mobile-web-app-capable spelling is kept for iPads older than iOS 16.4. */}
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="DineFlow" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {LAUNCH_IMAGES.map(([f, m]) => <link key={f} rel="apple-touch-startup-image" href={`/splash/${f}`} media={`screen and ${m}`} />)}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && <><link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} crossOrigin="anonymous" /><link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL} /></>}<script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} /><script dangerouslySetInnerHTML={{ __html: LANG_BOOT }} /><script dangerouslySetInnerHTML={{ __html: SIDEBAR_BOOT }} /><script dangerouslySetInnerHTML={{ __html: SPLASH_BOOT }} /><script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE }} /></head>
      <body><NavProgress /><ThemeKeeper /><FullLanguage /><FirstPaint>{children}</FirstPaint><ServiceWorker /><ConfirmHost /></body>
    </html>
  );
}

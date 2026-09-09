import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { cookies } from "next/headers";
import { THEME_BOOT } from "@/components/ui/Theme";
import { ServiceWorker } from "@/components/ServiceWorker";
import { NavProgress } from "@/components/ui";

// Fonts ship inside the app, so builds and the on-premise Box need no internet.
const oswald = localFont({ src: "../public/fonts/Oswald.ttf", variable: "--font-oswald", display: "swap" });
const manrope = localFont({ src: "../public/fonts/Manrope.ttf", variable: "--font-manrope", display: "swap" });
const jet = localFont({ src: "../public/fonts/JetBrainsMono.ttf", variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "DineFlow", template: "%s · DineFlow" },
  description: "Pantry, kitchen, orders and billing — one live control room for your restaurant.",
  manifest: "/manifest.json",
};
export const viewport: Viewport = { themeColor: "#0a0a0d", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pref = (await cookies()).get("df-theme")?.value ?? "dark";
  const theme = pref === "paper" ? "paper" : "dark";   // "system" resolves in the browser before paint
  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning className={`${oswald.variable} ${manrope.variable} ${jet.variable} deck`}>
      <head>{process.env.NEXT_PUBLIC_SUPABASE_URL && <><link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} crossOrigin="anonymous" /><link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL} /></>}<script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} /></head>
      <body><NavProgress />{children}<ServiceWorker /></body>
    </html>
  );
}

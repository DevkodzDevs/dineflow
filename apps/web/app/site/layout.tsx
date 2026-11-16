import localFont from "next/font/local";
import "./site.css";

/* DM Serif Display (SIL Open Font Licence), Latin only, for the website's large words; loaded on /site alone. */
const serif = localFont({ src: [{ path: "../../public/fonts/DMSerifDisplay.woff2", style: "normal" }, { path: "../../public/fonts/DMSerifDisplay-Italic.woff2", style: "italic" }], weight: "400", variable: "--font-site-serif", display: "swap" });

/** The wrapper is paper for the not-found page; the website itself wears its own night palette (`.site`, site.css). */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div data-theme="paper" className={`${serif.variable} min-h-dvh bg-[var(--color-bg)] text-[var(--color-label)]`}>{children}</div>;
}

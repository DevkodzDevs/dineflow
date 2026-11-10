import { ForceDark } from "./ForceDark";
/** The TV screen is dark whatever the app's theme: a bright wall of white in a dim dining room is a lamp. ForceDark puts
 *  dark on <html> itself — the themes live there, so this div's attribute alone did not win over a paper cookie. */
export default function ScreenLayout({ children }: { children: React.ReactNode }) {
  return <div data-theme="dark" className="h-dvh overflow-hidden bg-[var(--color-bg)] text-[var(--color-label)]"><ForceDark />{children}</div>;
}

/** The TV screen is dark whatever the app's theme: a bright wall of white in a dim dining room is a lamp. */
export default function ScreenLayout({ children }: { children: React.ReactNode }) {
  return <div data-theme="dark" className="h-dvh overflow-hidden bg-[var(--color-bg)] text-[var(--color-label)]">{children}</div>;
}

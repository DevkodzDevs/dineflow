/** Guest-facing pages are bright — a menu on a phone in daylight — while the staff board stays dark. */
export default function PaperLayout({ children }: { children: React.ReactNode }) {
  return <div data-theme="paper" className="min-h-dvh bg-[var(--color-bg)] text-[var(--color-label)]">{children}</div>;
}

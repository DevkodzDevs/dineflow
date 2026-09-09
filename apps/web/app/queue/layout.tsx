export default function PaperLayout({ children }: { children: React.ReactNode }) {
  return <div data-theme="paper" className="min-h-dvh bg-[var(--color-bg)] text-[var(--color-label)]">{children}</div>;
}

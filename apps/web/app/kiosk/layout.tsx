/** The kiosk is paper and fills the tablet: no sidebar, no top bar, nothing a guest could wander into. */
export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return <div data-theme="paper" className="h-dvh overflow-hidden bg-[var(--color-bg)] text-[var(--color-label)] select-none">{children}</div>;
}

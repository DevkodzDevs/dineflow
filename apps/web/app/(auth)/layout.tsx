import { FlipClock } from "@/components/ui/flip";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh grid lg:grid-cols-[1.1fr_1fr] deck">
      <section className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden wall">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl" />
          <span className="font-display text-2xl tracking-wide">DineFlow</span>
        </div>
        <div className="relative">
          <FlipClock className="mb-10" />
          <h1 className="text-5xl xl:text-6xl max-w-[16ch]">Every ticket, every room key, every ladle of stock, on one board.</h1>
          <p className="mt-6 text-[#9a9aa6] max-w-md text-[16px] leading-relaxed">Waiters punch orders on their phones, the kitchen sees them the same second, the front desk posts dinner to the room, and the pantry drops with every dish sold.</p>
        </div>
        <div className="flip-label !text-left !mt-0">Restaurant · Hotel · Resort · GST ready · Any device</div>
      </section>
      <section className="deck-card flex items-center justify-center p-6 lg:my-3 lg:mr-3">{children}</section>
    </div>
  );
}

import { FlipClock } from "@/components/ui/flip";
import { SignedOutCleanup } from "@/components/SignedOutCleanup";
import { LegalFooter } from "@/components/LegalFooter";
import { Showcase } from "./Showcase";
import { Headline } from "./Headline";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh grid lg:grid-cols-[1.1fr_minmax(0,1fr)] min-[1800px]:!grid-cols-[minmax(0,1fr)_clamp(560px,37vw,760px)] deck">
      <SignedOutCleanup />
      {/* self-stretch: on a touch screen from iPad size the frame is `align-items: flex-start` (globals.css, the no-bounce
          frame), so this column was only as tall as its words — justify-between had nothing to spread and the bottom half of
          the wall sat empty (2026-11-02, the owner's iPad). Stretched, the logo is at the top, the tagline at the foot and the
          live board takes what is left under the clock.
          From 1800px wide (2026-11-03, the owner at 1920: "that spacing gap is not good looking") the clock and the headline
          stood in a 560px column of a 1000px wall, an empty band between them and a form card twice the form's width. There the
          card is capped (37vw, 560–760px) and the board stands beside the words, centred in the room left, instead of under. */}
      <section className="hidden lg:flex lg:self-stretch flex-col gap-8 p-12 relative overflow-hidden wall">
        <div className="flex items-center gap-3 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mark.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 object-contain" />
          <span className="font-display text-2xl tracking-wide">DineFlow</span>
        </div>
        <div className="relative flex-1 min-h-0 flex flex-col min-[1800px]:grid min-[1800px]:grid-cols-[auto_minmax(0,1fr)] min-[1800px]:grid-rows-[minmax(0,1fr)] min-[1800px]:gap-x-16">
          <div className="min-w-0 min-[1800px]:self-center">
            <FlipClock className="mb-10" />
            <Headline />
          </div>
          <div className="flex-1 min-h-0 flex pt-4 min-[1800px]:pt-0 min-[1800px]:justify-center min-[1800px]:self-center min-[1800px]:h-[min(100%,34rem)]"><Showcase /></div>
        </div>
        <div className="flip-label !text-left !mt-0 shrink-0">Restaurant · Hotel · Resort · GST ready · Any device</div>
      </section>
      <section className="deck-card flex flex-col items-center justify-center p-6 lg:my-3 lg:mr-3">
        <div className="flex-1 flex items-center w-full justify-center">{children}</div>
        {/* Reachable without signing in, on purpose: a gateway reviewer and anyone deciding
            whether to sign up both start here. */}
        <LegalFooter />
      </section>
    </div>
  );
}

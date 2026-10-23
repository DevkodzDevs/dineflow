"use client";
import { useState, useTransition } from "react";
import { Power, Globe, QrCode, Bike, Check } from "lucide-react";
import { Sheet, cn, useToast } from "@/components/ui";
import { setOnlineTaking } from "./actions";

/**
 * Online orders on and off (2026-10-23, 0133 — the owner: "a switch to stop or start taking online orders, with an
 * are-you-sure first"). In the header beside Payouts: a pill that says what is happening — green "Taking orders" with its
 * switch on, red "Not taking orders" with it off. A tap asks first, in a dialog that says what changes: the website's
 * delivery and takeaway stop (or start), the table QR keeps taking orders, and Swiggy and Zomato are switched in their own
 * partner apps. Off is a pause with no end (set_online_taking); Kitchen pace cannot turn it back on. Who may: the owner, a
 * manager, the chef, or a supervisor holding Online orders (the same rule as Dishes online); anyone else sees the state.
 */
export function OnlineSwitch({ off: initialOff, canEdit }: { off: boolean; canEdit: boolean }) {
  const [off, setOff] = useState(initialOff);
  const [ask, setAsk] = useState(false);
  const [pending, start] = useTransition(); const toast = useToast();
  const flip = () => start(async () => {
    const r = await setOnlineTaking(off);
    if ("error" in r) { toast(r.error!, "err"); return; }
    setOff(!r.taking); setAsk(false);
    toast(r.taking ? "Online orders are on" : "Online orders are off");
  });
  const tone = off ? "var(--color-red)" : "var(--color-green)";
  const body = <>
    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: tone }} aria-hidden />
    <span className="truncate">{off ? "Not taking orders" : "Taking orders"}</span>
    {canEdit && <span className="switch !pointer-events-none shrink-0" data-on={off ? "false" : "true"} aria-hidden />}
  </>;
  const cls = "relative inline-flex items-center justify-center gap-2.5 h-11 pl-4 pr-3 rounded-full text-[14px] font-extrabold border transition-colors";
  const style = { background: `color-mix(in srgb, ${tone} 12%, var(--color-bg-2))`, borderColor: `color-mix(in srgb, ${tone} 40%, transparent)`, color: off ? "var(--color-red)" : "var(--color-label)" };
  return (<>
    {canEdit
      ? <button type="button" onClick={() => setAsk(true)} className={cn(cls, "hover:brightness-110")} style={style} role="switch" aria-checked={!off} aria-label={off ? "Online orders are off — turn them on" : "Online orders are on — turn them off"} data-online-switch={off ? "off" : "on"}>{body}</button>
      : <span className={cls} style={style} data-online-switch={off ? "off" : "on"}>{body}</span>}
    <Sheet open={ask} onClose={() => setAsk(false)} title={off ? "Start taking online orders?" : "Stop taking online orders?"}>
      <div className="space-y-4" data-online-confirm={off ? "start" : "stop"}>
        <div className="flex items-center gap-3.5 rounded-[20px] p-4 border" style={{ background: `color-mix(in srgb, ${off ? "var(--color-green)" : "var(--color-red)"} 9%, var(--color-bg-2))`, borderColor: `color-mix(in srgb, ${off ? "var(--color-green)" : "var(--color-red)"} 35%, transparent)` }}>
          <span className="h-12 w-12 shrink-0 rounded-full grid place-items-center" style={{ background: `color-mix(in srgb, ${off ? "var(--color-green)" : "var(--color-red)"} 18%, transparent)`, color: off ? "var(--color-green)" : "var(--color-red)" }}><Power size={22} aria-hidden /></span>
          <p className="text-[14.5px] font-semibold leading-snug">{off ? "Your website takes delivery and takeaway orders again." : "Your website stops delivery and takeaway orders."}</p>
        </div>
        <ul className="space-y-2.5 text-[13.5px] text-[var(--color-label-2)]">
          <li className="flex gap-2.5"><Globe size={17} className="shrink-0 mt-0.5" aria-hidden /><span>{off ? "Guests can order on your website again." : "Guests see “not taking orders” on your website."}</span></li>
          <li className="flex gap-2.5"><QrCode size={17} className="shrink-0 mt-0.5" aria-hidden /><span>Table QR orders keep coming in.</span></li>
          <li className="flex gap-2.5"><Bike size={17} className="shrink-0 mt-0.5" aria-hidden /><span>Swiggy, Zomato: switch in their own apps.</span></li>
        </ul>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="svc-btn quiet sm" onClick={() => setAsk(false)}>Cancel</button>
          <button type="button" disabled={pending} onClick={flip} className={cn("svc-btn sm", off ? "go" : "")} style={off ? undefined : { background: "var(--color-red)", color: "#fff" }} data-online-confirm-go>
            {off ? <><Check size={17} aria-hidden /> Yes, start</> : <><Power size={17} aria-hidden /> Yes, stop</>}</button>
        </div>
      </div>
    </Sheet>
  </>);
}

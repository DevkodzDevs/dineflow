"use client";
import { useEffect, useState } from "react";
import { Check, Copy, MessageCircle, Share2 } from "lucide-react";
import { QR } from "@/components/QR";
import { cn } from "../ui";
import { copyText, shareText } from "@/lib/clipboard";
import { waShareHref } from "@/lib/install";

const TEXT = "Install the DineFlow app on your phone or computer:";

/**
 * Getting the install page onto another device: the other phone's camera, a WhatsApp from the owner to a
 * new waiter, the phone's own share sheet, or the address. Whoever opens it gets /get, which works out
 * what they are holding.
 */
export function SendInstallLink({ url }: { url: string }) {
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === "function"), []);
  const copy = async () => { if (await copyText(url)) { setCopied(true); setTimeout(() => setCopied(false), 2200); } };
  const btn = "h-12 min-w-0 rounded-2xl bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] text-[13.5px] font-semibold inline-flex items-center justify-center gap-2 px-2 transition-colors";
  return (
    <div className="space-y-2.5" data-send-link>
      <div className="flex items-center gap-4 rounded-2xl border border-[var(--color-separator)] bg-[var(--color-bg-2)] p-3.5">
        {/* white under the code in both themes: a scanner wants dark on light */}
        <div className="rounded-xl bg-white p-2 shrink-0"><QR value={url} size={104} /></div>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold leading-tight">Scan to install</div>
        </div>
      </div>
      <div className={cn("grid gap-2", canShare ? "grid-cols-3" : "grid-cols-2")}>
        {canShare && <button type="button" onClick={() => void shareText({ title: "Install DineFlow", text: TEXT, url })} className={btn} data-share><Share2 size={16} className="shrink-0" /> Share</button>}
        <a href={waShareHref(`${TEXT} ${url}`)} target="_blank" rel="noopener noreferrer" className={btn} data-whatsapp><MessageCircle size={16} className="shrink-0" /> WhatsApp</a>
        <button type="button" onClick={copy} className={btn} data-copy-link>{copied ? <><Check size={16} className="shrink-0" /> Copied</> : <><Copy size={16} className="shrink-0" /> Copy link</>}</button>
      </div>
    </div>
  );
}

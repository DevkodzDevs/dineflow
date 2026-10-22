"use client";
import Link from "next/link";
import { QrCode, Copy, ExternalLink, Printer, Share2, ScanLine, UserPlus, BellRing, Activity, DoorOpen, Settings } from "lucide-react";
import { QR, qrDataUrl } from "@/components/QR";
import { Card, useToast } from "@/components/ui";
import { SvcHead } from "@/components/ui/Service";
import { copyText, shareText } from "@/lib/clipboard";

/** A door sign for the queue: the property, the code, how to use it — printed from a window of its own. */
async function printPoster(url: string, name: string) {
  const img = await qrDataUrl(url, 640);
  const w = window.open("", "_blank", "width=720,height=960"); if (!w) return;
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Join the queue · ${esc(name)}</title><style>
    @page{size:A4;margin:18mm}body{font-family:system-ui,-apple-system,sans-serif;color:#111;text-align:center;margin:0;padding:40px 24px}
    h1{font-size:44px;margin:0 0 6px;letter-spacing:-.02em}h2{font-size:22px;font-weight:500;color:#555;margin:0 0 28px}
    img{width:340px;height:340px;border:1px solid #ddd;border-radius:24px;padding:16px}ol{display:inline-block;text-align:left;font-size:19px;line-height:1.7;margin:28px 0 0}
    .u{margin-top:22px;font:14px ui-monospace,monospace;color:#666}</style></head><body>
    <h1>Join the queue</h1><h2>${esc(name)}</h2><img src="${img}" alt=""><ol><li>Scan with your phone camera</li><li>Add your name and party size</li><li>We'll message you when your table is ready</li></ol>
    <div class="u">${esc(url)}</div><script>onload=()=>{print()}</script></body></html>`);
  w.document.close();
}

const STEPS = [
  { Icon: ScanLine, title: "Scan at the door", text: "With the phone camera. No app, no sign-in." },
  { Icon: UserPlus, title: "Add name and party size", text: "They see their place and wait time, live." },
  { Icon: BellRing, title: "You tap Table ready", text: "On Pulse. Their phone shows it — WhatsApp too, if given." },
];

/**
 * Join by QR: the code guests scan to put themselves on the waiting list. The code sits on white in every theme (a
 * scanner wants dark on light); Print poster opens an A4 door sign. A property that is not Listed publicly has no
 * public queue page, so it gets the way to turn that on instead.
 */
export function QrClient({ slug, base, listed, restaurant }: { slug: string; base: string; listed: boolean; restaurant: string }) {
  const toast = useToast();
  const joinUrl = `${base}/queue/${slug}`;
  const copy = async () => { if (await copyText(joinUrl)) toast("Link copied"); else toast("Could not copy — hold the link to copy it", "err"); };
  const share = async () => {
    const r = await shareText({ title: `Join the queue · ${restaurant}`, text: `Join the waiting list at ${restaurant}`, url: joinUrl });
    if (r === "unavailable") void copy();
  };

  if (!listed || !slug) return (
    <div>
      <SvcHead icon="qr" title="Join by QR" sub="Guests scan at the door to join the waiting list" />
      <Card className="!rounded-[24px] max-w-2xl mx-auto text-center !p-8" data-joinqr-off>
        <span className="mx-auto h-16 w-16 rounded-[20px] grid place-items-center bg-[var(--color-fill)] text-[var(--color-label-2)]"><QrCode size={30} aria-hidden /></span>
        <h2 className="mt-4 text-[22px] font-extrabold">Join by QR is off</h2>
        <p className="mt-2 text-[14px] text-steel leading-relaxed">Turn on <b>Listed publicly</b> in Storefront settings to get the code.</p>
        <Link href="/settings/storefront" className="svc-btn go sm mt-5 inline-flex"><Settings size={18} aria-hidden /><span>Open Storefront settings</span></Link>
      </Card>
    </div>
  );

  return (
    <div>
      <SvcHead icon="qr" title="Join by QR" sub="Guests scan this at the door to join the waiting list" />
      {/* Left: the code itself, large, with the moves on it (copy, open, share, print). Right: how a guest uses it and
          where to put it. Stacked under lg; the code is never wider than the screen. */}
      <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-5 items-start">
        <Card className="!rounded-[28px] !p-5 sm:!p-7 flex flex-col items-center text-center" data-joinqr>
          <div className="inline-flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[0.16em] text-[var(--color-tint)]"><QrCode size={14} aria-hidden /> Scan to join the queue</div>
          <div className="font-display text-[26px] sm:text-[30px] leading-tight mt-1 max-w-full truncate">{restaurant}</div>
          <div className="mt-5 w-full max-w-[19rem] rounded-[24px] bg-white p-4 shadow-[0_0_0_1px_var(--color-separator),0_18px_40px_-24px_rgb(0_0_0/.45)] [&_img]:w-full [&_img]:h-auto [&_div]:!w-full [&_.shimmer]:!h-auto [&_.shimmer]:aspect-square" data-code>
            <QR value={joinUrl} size={320} className="w-full" />
          </div>
          <button type="button" onClick={() => void copy()} title="Copy the link" data-copy-link
            className="mt-5 max-w-full inline-flex items-center gap-2 min-h-11 pl-4 pr-3 rounded-full bg-[var(--color-fill)] text-[13px] num text-[var(--color-label-2)] hover:text-[var(--color-label)] hover:bg-[var(--color-fill-2)] transition-colors">
            <span className="truncate">{joinUrl.replace(/^https?:\/\//, "")}</span><Copy size={14} className="shrink-0" aria-hidden />
          </button>
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-2 w-full max-w-md">
            <button type="button" className="svc-btn go sm col-span-2 sm:col-span-3" onClick={() => void printPoster(joinUrl, restaurant)} data-print-poster><Printer size={18} aria-hidden /><span>Print poster</span></button>
            <button type="button" className="svc-btn quiet sm" onClick={() => window.open(joinUrl, "_blank", "noopener")}><ExternalLink size={17} aria-hidden /><span>Open</span></button>
            <button type="button" className="svc-btn quiet sm" onClick={() => void share()}><Share2 size={17} aria-hidden /><span>Share</span></button>
            <button type="button" className="svc-btn quiet sm col-span-2 sm:col-span-1" onClick={() => void copy()}><Copy size={17} aria-hidden /><span>Copy link</span></button>
          </div>
        </Card>

        <div className="space-y-5 min-w-0">
          <Card className="!rounded-[24px]">
            <h2 className="text-[18px] font-extrabold">How guests use it</h2>
            <p className="text-[13px] text-steel mt-0.5">Three steps on their phone. Nothing to download.</p>
            <ol className="mt-4 space-y-3">
              {STEPS.map(({ Icon, title, text }, i) => (
                <li key={title} className="flex gap-3.5 items-start rounded-[18px] bg-[var(--color-fill)] p-3.5">
                  <span className="relative h-12 w-12 shrink-0 rounded-[14px] grid place-items-center bg-[var(--color-bg-2)] text-[var(--color-tint)]">
                    <Icon size={22} aria-hidden />
                    <span className="absolute -top-1.5 -left-1.5 h-6 w-6 rounded-full bg-[var(--color-label)] text-[var(--color-on-label)] grid place-items-center text-[12px] font-bold num">{i + 1}</span>
                  </span>
                  <div className="min-w-0"><div className="text-[15px] font-bold leading-tight">{title}</div><p className="text-[13px] text-steel mt-1 leading-snug">{text}</p></div>
                </li>
              ))}
            </ol>
          </Card>
          <Card className="!rounded-[24px]">
            <div className="flex gap-3.5 items-start">
              <span className="h-12 w-12 shrink-0 rounded-[14px] grid place-items-center bg-[var(--color-orange-2)] text-[var(--color-orange)]"><DoorOpen size={22} aria-hidden /></span>
              <div className="min-w-0">
                <h2 className="text-[16px] font-extrabold leading-tight">Where to put it</h2>
                <p className="text-[13px] text-steel mt-1 leading-snug">At the door, host stand and waiting bench. Scans join your Pulse list.</p>
              </div>
            </div>
            <Link href="/pulse" className="mt-4 svc-btn quiet sm w-full"><Activity size={18} aria-hidden /><span>See who is waiting on Pulse</span></Link>
          </Card>
        </div>
      </div>
    </div>
  );
}

"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Tv, Copy, ExternalLink, RefreshCw, Tablet, Star, Printer, Lock } from "lucide-react";
import { Card, cn, useToast } from "@/components/ui";
import { QR } from "@/components/QR";
import { screenKey } from "../actions";

const SHOW = [["both", "Menu + tokens"], ["menu", "Menu only"], ["tokens", "Tokens only"]] as const;

/**
 * Three self-service pieces (0103). The TV link is a secret: anyone holding it sees the menu and the token numbers,
 * nothing else — "New link" switches every old screen off. The kiosk opens on a tablet that is signed in here. The
 * feedback QR is public and prints on one page.
 */
export function ScreensClient({ base, name, slug, initialKey }: { base: string; name: string; slug: string | null; initialKey: string | null }) {
  const toast = useToast(); const [pending, start] = useTransition();
  const [key, setKey] = useState(initialKey); const [show, setShow] = useState<(typeof SHOW)[number][0]>("both");
  const tv = key ? `${base}/screen/${key}${show === "both" ? "" : `?show=${show}`}` : null;
  const fb = slug ? `${base}/feedback/${slug}` : null;
  const copy = (v: string) => { void navigator.clipboard?.writeText(v).then(() => toast("Link copied")); };

  return (
    <div className="grid gap-4 xl:grid-cols-2 max-w-[1200px]">
      <Card className="min-w-0 xl:col-span-2" data-screen-card>
        <div className="flex items-start gap-3">
          <span className="h-11 w-11 shrink-0 rounded-xl grid place-items-center bg-[var(--color-fill)]"><Tv size={20} aria-hidden /></span>
          <div className="min-w-0"><div className="text-[17px] font-extrabold">Counter TV screen</div>
            <p className="text-[13.5px] text-steel mt-0.5">Open on the TV</p></div>
        </div>
        {!key ? <p className="mt-4 text-[14px] text-steel flex items-center gap-2"><Lock size={15} aria-hidden /> Owner and managers only.</p> : <>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="What the screen shows">
            {SHOW.map(([k, label]) => <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)} className={cn("!min-h-11 rounded-full px-4 text-[13.5px] font-extrabold", show === k ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)]")}>{label}</button>)}
          </div>
          <div className="mt-3 rounded-2xl bg-[var(--color-fill)] px-4 py-3 text-[13.5px] font-semibold break-all" data-screen-link>{tv}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="svc-btn go sm !px-4" onClick={() => copy(tv!)}><Copy size={16} aria-hidden /> Copy link</button>
            <a href={tv!} target="_blank" rel="noreferrer" className="svc-btn quiet sm !px-4"><ExternalLink size={16} aria-hidden /> Open</a>
            <button type="button" disabled={pending} className="svc-btn quiet sm !px-4" data-rotate-screen
              onClick={() => { if (!confirm("Make a new link? Screens on the old link will stop.")) return; start(async () => { const r = await screenKey(true); if ("error" in r) toast(r.error!, "err"); else { setKey(r.key!); toast("New link made"); } }); }}>
              <RefreshCw size={16} aria-hidden /> New link</button>
          </div>
          <p className="mt-2 text-[12.5px] text-steel">Tokens reset daily</p>
        </>}
      </Card>

      <Card className="min-w-0" data-kiosk-card>
        <div className="flex items-start gap-3">
          <span className="h-11 w-11 shrink-0 rounded-xl grid place-items-center bg-[var(--color-fill)]"><Tablet size={20} aria-hidden /></span>
          <div className="min-w-0"><div className="text-[17px] font-extrabold">Self-order kiosk</div>
            <p className="text-[13.5px] text-steel mt-0.5">Tablet order, counter pay</p></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/kiosk" className="svc-btn go sm !px-4" data-open-kiosk><Tablet size={16} aria-hidden /> Open kiosk here</Link>
        </div>
        <p className="mt-2 text-[12.5px] text-steel">Order-taking login · exit: hold top-left 2 s</p>
      </Card>

      <Card className="min-w-0" data-feedback-card>
        <div className="flex items-start gap-3">
          <span className="h-11 w-11 shrink-0 rounded-xl grid place-items-center bg-[var(--color-fill)]"><Star size={20} aria-hidden /></span>
          <div className="min-w-0"><div className="text-[17px] font-extrabold">Feedback QR</div>
            <p className="text-[13.5px] text-steel mt-0.5">≤3 stars alerts staff</p></div>
        </div>
        {!fb ? <p className="mt-4 text-[14px] text-steel">Set storefront link first — <Link href="/settings/storefront" className="underline">Storefront & offers</Link>.</p> : (
          <div className="mt-4 flex flex-col sm:flex-row items-center gap-4">
            <div className="rounded-2xl bg-white p-3 shadow-[0_0_0_1px_var(--color-separator)] shrink-0"><QR value={fb} size={168} /></div>
            <div className="min-w-0 w-full space-y-2">
              <div className="rounded-2xl bg-[var(--color-fill)] px-4 py-3 text-[13.5px] font-semibold break-all" data-feedback-link>{fb}</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="svc-btn quiet sm !px-4" onClick={() => copy(fb)}><Copy size={16} aria-hidden /> Copy</button>
                <a href={fb} target="_blank" rel="noreferrer" className="svc-btn quiet sm !px-4"><ExternalLink size={16} aria-hidden /> Open</a>
                <button type="button" className="svc-btn go sm !px-4" onClick={() => printCard(name, fb)}><Printer size={16} aria-hidden /> Print card</button>
              </div>
              <p className="text-[12.5px] text-steel">Table QRs include &ldquo;Rate us&rdquo;</p>
            </div>
          </div>)}
      </Card>
    </div>
  );
}

/** One A6-ish card to stand on the counter: the name, "How was your meal?", the code. Printed from a blank window. */
async function printCard(name: string, url: string) {
  const { qrDataUrl } = await import("@/components/QR");
  const src = await qrDataUrl(url, 520);
  const w = window.open("", "_blank", "width=480,height=640"); if (!w) return;
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Feedback QR</title><style>body{font-family:system-ui,sans-serif;text-align:center;margin:40px;color:#10201a}h1{font-size:30px;margin:0 0 4px}p{font-size:18px;margin:0 0 20px}img{width:300px;height:300px}small{display:block;margin-top:14px;font-size:13px;color:#555}</style><h1>${esc(name)}</h1><p>How was your meal? Scan to rate us ★</p><img src="${src}" alt=""><small>Takes ten seconds · only the manager reads it</small><script>onload=()=>{print()}</script>`);
  w.document.close();
}

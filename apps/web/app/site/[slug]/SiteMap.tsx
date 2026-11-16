"use client";
import { useState } from "react";
import { Map as MapIcon, X, Navigation, Copy, Check, Share2 } from "lucide-react";
import { useW } from "./SiteWords";

/**
 * The map's window (2026-11-16). The server draws the map as art (`children`) — a page that opens with a drawing costs
 * nothing and tells no one that the visitor came. **The live map is Google's, in a frame, and only when it is asked for**:
 * a frame from another company is a megabyte of script and a request to them, so it is the visitor's tap that loads it,
 * not the scroll. Without JavaScript the same button is a plain link that opens the place on Google Maps.
 */
export function SiteMap({ embed, place, directions, name, children }: { embed: string | null; place: string | null; directions: string | null; name: string; children: React.ReactNode }) {
  const [live, setLive] = useState(false); const w = useW();
  return (
    <div className="site-map" data-site-map data-rv="zoom" {...(live ? { "data-live": "" } : {})}>
      <div className="site-map-art" aria-hidden>{children}</div>
      {live && embed && <iframe className="site-map-frame" src={embed} title={`${name} on the map`} loading="lazy" allowFullScreen data-site-map-frame />}
      <div className="site-map-bar">
        {embed && (
          <a href={place ?? embed} target="_blank" rel="noreferrer" role="button" aria-pressed={live} className="site-btn site-btn-ghost site-btn-sm" data-site-map-live
            onClick={(e) => { e.preventDefault(); setLive((v) => !v); }}>
            {live ? <><X size={16} aria-hidden /> {w("Close map")}</> : <><MapIcon size={16} aria-hidden /> {w("Live map")}</>}
          </a>
        )}
        {directions && <a href={directions} target="_blank" rel="noreferrer" className="site-btn site-btn-main site-btn-sm" data-site-directions><Navigation size={16} aria-hidden /> {w("Directions")}</a>}
      </div>
    </div>
  );
}

/** Copies a line (the address) and says so for a moment. Not drawn without JavaScript (`.site-js`). */
export function SiteCopy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false); const w = useW();
  const copy = async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* a browser that will not copy: the address is on the page to select */ } };
  return <button type="button" className="site-btn site-btn-ghost site-btn-sm site-js" onClick={copy} data-site-copy>{done ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}<span aria-live="polite">{w(done ? "Copied" : label)}</span></button>;
}

/** Hands the page to the phone's own share sheet (WhatsApp, Instagram, Messages…); where there is none, copies the link. */
export function SiteShare({ title, text, url }: { title: string; text: string; url: string }) {
  const [done, setDone] = useState(false); const w = useW();
  const share = async () => {
    try {
      if (typeof navigator.share === "function") { await navigator.share({ title, text, url }); return; }
      await navigator.clipboard.writeText(url); setDone(true); setTimeout(() => setDone(false), 1800);
    } catch { /* the visitor closed the sheet */ }
  };
  return <button type="button" className="site-btn site-btn-ghost site-btn-sm site-js" onClick={share} data-site-share>{done ? <Check size={16} aria-hidden /> : <Share2 size={16} aria-hidden />}<span aria-live="polite">{w(done ? "Link copied" : "Share")}</span></button>;
}

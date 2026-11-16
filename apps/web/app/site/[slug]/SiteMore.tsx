"use client";
import { createElement, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { X, ArrowRight, BedDouble, Users, Instagram, Box, ChevronLeft, ChevronRight } from "lucide-react";
import { useW } from "./SiteWords";

/**
 * Three more of the website's client pieces (ninth pass). Each is on the page only where it has something to show:
 *
 * SiteRoomBox — a room opens in a sheet: its own photos side by side (swipe, or the arrows), what is in it, how many
 *   it sleeps, the rate, and Book. One listener for every room card; the card carries the room as `data-*`, as a dish does.
 * SiteInsta — an Instagram post is a quiet card until it is tapped; only then is Instagram's own frame loaded. A frame
 *   from another company on a page is a megabyte and a request to them — the visitor's tap asks for it, the scroll never.
 * SiteModel — a dish in 3D. The viewer (and the 3D library under it) is fetched only when the sheet is opened.
 */
type Room = { name: string; rate: string; sleeps: string; amenities: string[]; photos: string[] };

export function SiteRoomBox({ book }: { book: string | null }) {
  const box = useRef<HTMLDialogElement>(null), from = useRef<HTMLElement | null>(null), rail = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<Room | null>(null); const w = useW();
  useEffect(() => {
    const open = (el: HTMLElement) => {
      const d = el.dataset; let photos: string[] = [];
      try { photos = (JSON.parse(d.photos || "[]") as unknown[]).filter((p): p is string => typeof p === "string" && /^https:\/\/[^\s"'<>]+$/i.test(p)); } catch { /* a card with no photos */ }
      from.current = el;
      flushSync(() => setRoom({ name: d.name ?? "", rate: d.rate ?? "", sleeps: d.sleeps ?? "", amenities: (d.amenities ?? "").split("|").filter(Boolean), photos }));
      box.current?.showModal(); rail.current?.scrollTo({ left: 0 });
    };
    const click = (e: MouseEvent) => { const t = e.target as Element | null; if (!t || t.closest("a, dialog")) return; const el = t.closest<HTMLElement>("[data-room]"); if (el && !box.current?.open) open(el); };
    const key = (e: KeyboardEvent) => { if (e.key !== "Enter" && e.key !== " ") return; const el = e.target as HTMLElement | null; if (el?.matches?.("[data-room]") && !box.current?.open) { e.preventDefault(); open(el); } };
    document.addEventListener("click", click); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("click", click); document.removeEventListener("keydown", key); };
  }, []);
  const close = () => { box.current?.close(); from.current?.focus({ preventScroll: true }); };
  const slide = (by: number) => { const r = rail.current; if (r) r.scrollBy({ left: by * r.clientWidth, behavior: "smooth" }); };
  return (
    <dialog ref={box} className="site-dishbox site-roombox" aria-label={room?.name ?? w("Room")} onClick={(e) => { if (e.target === box.current) close(); }} onClose={() => from.current?.focus({ preventScroll: true })} data-site-roombox>
      <div className="site-day site-dishbox-in">
        <div className="site-dishbox-art">
          {room && room.photos.length > 0 ? (<>
            <div className="site-roombox-rail" ref={rail} data-site-room-rail>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {room.photos.map((p, i) => <img key={p} src={p} alt={`${room.name} — photo ${i + 1}`} loading={i === 0 ? "eager" : "lazy"} decoding="async" />)}
            </div>
            {room.photos.length > 1 && (<>
              <button type="button" className="site-roombox-nav" data-dir="prev" aria-label={w("Previous photo")} onClick={() => slide(-1)}><ChevronLeft size={20} aria-hidden /></button>
              <button type="button" className="site-roombox-nav" data-dir="next" aria-label={w("Next photo")} onClick={() => slide(1)}><ChevronRight size={20} aria-hidden /></button>
              <span className="site-roombox-count num" aria-hidden>{room.photos.length} {w("photos")}</span>
            </>)}
          </>) : <BedDouble size={84} strokeWidth={1} aria-hidden />}
        </div>
        <div className="site-dishbox-body">
          <p className="site-eyebrow">{w("Room")}</p>
          <h3 className="site-dishbox-name">{room?.name}</h3>
          {room?.sleeps && <p className="site-dishbox-about"><Users size={16} aria-hidden className="inline -mt-0.5 mr-1.5" />{w("Sleeps")} {room.sleeps}</p>}
          {room && room.amenities.length > 0 && <ul className="site-tags">{room.amenities.map((a) => <li key={a}>{a}</li>)}</ul>}
          <div className="site-dishbox-facts"><span className="site-note">{w("per night, plus taxes")}</span><span className="site-dishbox-price">{room?.rate}</span></div>
          {book && <a href={book} className="site-btn site-btn-main site-btn-wide">{w("Book this room")}<ArrowRight size={20} aria-hidden /></a>}
        </div>
        <button type="button" className="site-dishbox-close" aria-label={w("Close")} onClick={close}><X size={20} aria-hidden /></button>
      </div>
    </dialog>
  );
}

export function SiteInsta({ href, embed, place, n }: { href: string; embed: string; place: string; n: number }) {
  const [live, setLive] = useState(false); const w = useW();
  return (
    <div className="site-insta" data-site-insta {...(live ? { "data-live": "" } : {})}>
      {live ? <iframe src={embed} title={`${place} on Instagram — post ${n}`} loading="lazy" allowFullScreen scrolling="no" data-site-insta-frame />
        : (
          <a href={href} target="_blank" rel="noopener noreferrer" className="site-insta-face" onClick={(e) => { e.preventDefault(); setLive(true); }} data-site-insta-open>
            <span className="site-icon"><Instagram size={22} aria-hidden /></span>
            <b>{w("See post")} {n}</b>
            <small>{w("Loads from Instagram when you tap")}</small>
          </a>
        )}
    </div>
  );
}

export function SiteModel({ url, name }: { url: string; name: string }) {
  const box = useRef<HTMLDialogElement>(null), from = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "failed">("idle"); const w = useW();
  const open = async () => {
    box.current?.showModal();
    if (state === "ready" || state === "loading") return;
    setState("loading");
    // the viewer registers the <model-viewer> element; nothing of it is in the page until this moment
    // the library's own single-file build: it carries the 3D engine with it (the package's module build expects the app to)
    try { await import("@google/model-viewer/dist/model-viewer.min.js"); setState("ready"); } catch { setState("failed"); }
  };
  const close = () => { box.current?.close(); from.current?.focus({ preventScroll: true }); };
  return (<>
    <button ref={from} type="button" className="site-btn site-btn-ghost site-js" onClick={open} aria-haspopup="dialog" data-site-model><Box size={18} aria-hidden /> {[w("See"), name, w("in 3D")].filter(Boolean).join(" ")}</button>
    <dialog ref={box} className="site-dishbox site-modelbox" aria-label={`${name} in 3D`} onClick={(e) => { if (e.target === box.current) close(); }} data-site-modelbox>
      <div className="site-day site-modelbox-in">
        <div className="site-modelbox-stage" data-state={state}>
          {state === "ready" ? createElement("model-viewer", { ref: (el: HTMLElement | null) => { el?.addEventListener("error", () => setState("failed"), { once: true }); }, src: url, alt: `${name}, in 3D`, "camera-controls": "", "auto-rotate": "", "touch-action": "pan-y", "shadow-intensity": "1", exposure: "1", loading: "eager", style: { width: "100%", height: "100%" } })
            : <p className="site-note" role="status">{w(state === "failed" ? "The 3D view could not be loaded on this device." : "Loading the 3D view…")}</p>}
        </div>
        <div className="site-modelbox-foot"><h3 className="site-dishbox-name">{name}</h3><p className="site-note">{w("Drag to turn it. Pinch or scroll to come closer.")}</p></div>
        <button type="button" className="site-dishbox-close" aria-label={w("Close")} onClick={close}><X size={20} aria-hidden /></button>
      </div>
    </dialog>
  </>);
}

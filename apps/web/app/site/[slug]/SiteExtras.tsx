"use client";
import { useEffect, useRef, useState } from "react";
import { X, Send, Ticket, ArrowRight } from "lucide-react";
import { useW } from "./SiteWords";

/**
 * Two of the extras a client can switch on (eighth pass). Neither is drawn — on the server or here — unless it is on.
 *
 * SiteAsk: "Send an enquiry". A short form in a sheet; Send opens WhatsApp with the message already written, to the
 * property's own number. Nothing is stored and nothing is sent to us: the guest sees the message and presses send.
 * SiteOffer: the first running offer, in a corner, once per visit, a few seconds after the page has settled.
 */
const say = (slug: string, k: string) => { try { void fetch(`/site/${slug}/hit`, { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ k }) }); } catch { /* never the visitor's problem */ } };

export function SiteAsk({ slug, place, whatsapp, stay, count, wide }: { slug: string; place: string; whatsapp: string; stay: boolean; count: boolean; wide?: boolean }) {
  const box = useRef<HTMLDialogElement>(null), from = useRef<HTMLButtonElement>(null), w = useW();
  const [v, setV] = useState({ name: "", day: "", people: "", note: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const close = () => { box.current?.close(); from.current?.focus({ preventScroll: true }); };
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const lines = [`Hi ${place}! An enquiry from your website.`, `Name: ${v.name.trim()}`, v.day && `${stay ? "Check-in" : "Date"}: ${v.day}`, v.people && `${stay ? "Guests" : "People"}: ${v.people}`, v.note.trim()].filter(Boolean);
    window.open(`https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener,noreferrer");
    if (count) say(slug, "enquiry");
    close();
  };
  return (<>
    <button ref={from} type="button" className={`site-btn site-btn-ghost site-js ${wide ? "site-btn-wide" : "site-btn-sm"}`} onClick={() => box.current?.showModal()} aria-haspopup="dialog" data-site-ask>
      {wide ? <>{w("Send an enquiry")}<Send size={20} aria-hidden /></> : <><Send size={16} aria-hidden /> {w("Enquiry")}</>}
    </button>
    <dialog ref={box} className="site-dishbox site-ask" aria-label={w("Send an enquiry")} onClick={(e) => { if (e.target === box.current) close(); }} data-site-askbox>
      <form className="site-day site-ask-in" onSubmit={send}>
        <p className="site-eyebrow">{w(stay ? "Plan your stay" : "Parties · orders · questions")}</p>
        <h3 className="site-dishbox-name">{w("Send an|enquiry").split("|")[0]} <em>{w("Send an|enquiry").split("|")[1] ?? ""}</em></h3>
        <label className="site-field"><span>{w("Your name")}</span><input required maxLength={60} autoComplete="name" value={v.name} onChange={set("name")} data-site-ask-name /></label>
        <div className="site-ask-two">
          <label className="site-field"><span>{w(stay ? "Check-in" : "Date")}</span><input type="date" value={v.day} onChange={set("day")} /></label>
          <label className="site-field"><span>{w(stay ? "Guests" : "People")}</span><input type="number" inputMode="numeric" min={1} max={999} value={v.people} onChange={set("people")} /></label>
        </div>
        <label className="site-field"><span>{w("What would you like to ask?")}</span><textarea rows={3} maxLength={400} value={v.note} onChange={set("note")} /></label>
        <button type="submit" className="site-btn site-btn-main site-btn-wide" data-site-ask-send>{w("Open WhatsApp")}<Send size={20} aria-hidden /></button>
        <p className="site-note">{w("Opens WhatsApp with your message written. You press send.")}</p>
        <button type="button" className="site-dishbox-close" aria-label={w("Close")} onClick={close}><X size={20} aria-hidden /></button>
      </form>
    </dialog>
  </>);
}

export function SiteOffer({ slug, title, note, code, action }: { slug: string; title: string; note: string; code: string | null; action: { href: string; label: string } | null }) {
  const [on, setOn] = useState(false); const w = useW();
  useEffect(() => {
    const key = `site-offer:${slug}`;
    try { if (sessionStorage.getItem(key)) return; } catch { /* a browser that keeps nothing shows it each time */ }
    const t = setTimeout(() => { setOn(true); try { sessionStorage.setItem(key, "1"); } catch { /* as above */ } }, 6500);
    return () => clearTimeout(t);
  }, [slug]);
  if (!on) return null;
  return (
    <aside className="site-pop" role="status" aria-label={w("Offer")} data-site-pop>
      <span className="site-icon !flex-none"><Ticket size={20} aria-hidden /></span>
      <div className="min-w-0">
        <p className="site-pop-title">{title}</p>
        <p className="site-note">{note}{code ? <> · <b className="num">{code}</b></> : null}</p>
        {action && <a href={action.href} className="site-btn site-btn-main site-btn-sm mt-3">{action.label}<ArrowRight size={16} aria-hidden /></a>}
      </div>
      <button type="button" className="site-pop-x" aria-label={w("Close")} onClick={() => setOn(false)}><X size={18} aria-hidden /></button>
    </aside>
  );
}

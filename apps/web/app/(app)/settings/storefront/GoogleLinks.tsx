"use client";
import { Copy, ExternalLink, Search } from "lucide-react";
import { Card, useToast } from "@/components/ui";

/**
 * Bookings and orders straight from Google Search and Maps, with no commission: the links to paste
 * into the property's Google Business Profile, and where each one goes. Google's own "Reserve with
 * Google" button needs a certified booking partner; these links are the part a property can do
 * today, in five minutes, and they are what Google shows as Website, Menu, Reserve and Order.
 * The public pages also carry schema.org data (see dine/[slug]/page.tsx) so Google can read them.
 */
export function GoogleLinks({ base, slug, listed, dining, ordering, rooms }: { base: string; slug: string | null; listed: boolean; dining: boolean; ordering: boolean; rooms: boolean }) {
  const toast = useToast();
  if (!slug) return null;
  const site = `${base}/dine/${slug}`;
  const links = [
    { label: "Website", hint: "Edit profile → Contact → Website", url: site },
    ...(ordering ? [{ label: "Menu link", hint: "Edit profile → Contact → Menu link", url: `${site}?tab=order` }] : []),
    ...(dining ? [{ label: "Reservations link", hint: "Edit profile → Contact → Reservations", url: `${site}?tab=book` }] : []),
    ...(ordering ? [{ label: "Order ahead link", hint: "Edit profile → Contact → Order ahead / Delivery", url: `${site}?tab=order` }] : []),
    ...(rooms ? [{ label: "Room booking link", hint: "Edit profile → Contact → Booking link (or use it as the Website)", url: `${base}/book/${slug}` }] : []),
  ];
  const copy = (u: string, label: string) => { void navigator.clipboard.writeText(u).then(() => toast(`${label} copied`), () => toast(u)); };

  return (
    <Card>
      <div className="flex items-start gap-3 mb-1">
        <span className="h-9 w-9 rounded-xl bg-[var(--color-fill)] grid place-items-center shrink-0 text-[var(--color-tint)]"><Search size={17} /></span>
        <div className="min-w-0">
          <h2 className="text-xl">Bookings from Google</h2>
          <p className="text-xs text-[var(--color-label-2)] mt-0.5">When someone finds you on Google Search or Maps, these buttons send them straight here — <b>0% commission</b>. Paste each link into your Google Business Profile.</p>
        </div>
      </div>
      {!listed && <p className="mt-3 rounded-xl bg-[rgb(255_179_64/.12)] text-[var(--color-orange)] text-xs font-semibold p-3">Turn on “Listed publicly” above first — until then these pages are not open to guests.</p>}
      <div className="mt-4 divide-y divide-[var(--color-separator)] rounded-2xl border border-[var(--color-separator)] overflow-hidden">
        {links.map((l) => (
          <div key={l.label} className="flex items-center gap-3 p-3">
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold">{l.label}</div>
              <div className="text-[11px] text-[var(--color-label-2)]">{l.hint}</div>
              <div className="num text-[11px] text-[var(--color-label-2)] truncate mt-0.5">{l.url}</div>
            </div>
            <button type="button" onClick={() => copy(l.url, l.label)} aria-label={`Copy the ${l.label}`} className="icon-btn !rounded-full bg-[var(--color-fill)] shrink-0"><Copy size={15} /></button>
          </div>
        ))}
      </div>
      <ol className="mt-4 space-y-1.5 text-[13px] text-[var(--color-label-2)] list-decimal pl-5">
        <li>Open your Business Profile — search your business name on Google while signed in, or use the button below.</li>
        <li>Choose <b className="text-[var(--color-label)]">Edit profile</b>, then <b className="text-[var(--color-label)]">Contact</b>, and paste each link into its box.</li>
        <li>Save. Google checks new links, which can take a few days.</li>
      </ol>
      {rooms && <p className="mt-3 text-xs text-[var(--color-label-2)]">Google’s hotel price box (“Free booking links”) needs a certified connectivity partner; until then the room booking link above is how guests reach you directly.</p>}
      <a href="https://business.google.com/" target="_blank" rel="noreferrer" className="mt-4 min-h-11 rounded-full px-4 flex items-center justify-center gap-2 text-sm font-semibold bg-[var(--color-fill)] hover:brightness-110 transition"><ExternalLink size={15} /> Open Google Business Profile</a>
    </Card>
  );
}

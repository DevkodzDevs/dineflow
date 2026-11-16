import { ImageResponse } from "next/og";
import { clock, sitePhotos, siteActions, siteSignature, type SiteData } from "@/lib/website";

/**
 * The share card (2026-11-16): what WhatsApp, Instagram, Facebook and X show when a property's link is pasted — its
 * logo, its name very large, what it is and where, and one thing to do. Drawn on the server from the same read as the
 * page; a property never has to make a banner.
 *
 * A photo is put behind the words only when it lives on a host this server may fetch from: our own storage (logos, and
 * photos uploaded there) and Wikimedia (the dish library). A typed photo address can point anywhere, and a server
 * that fetches whatever address it is given can be aimed at things a browser could never reach — so any other host is
 * simply not fetched and the card is drawn without a photo.
 */
export const size = { width: 1200, height: 630 };
/** The card goes out as a JPEG: a PNG of a photo is close to a megabyte, and chat apps skip a preview that heavy. */
export const cardType = "image/jpeg";
/* a card follows the property — a new name or photo shows within the hour, not in a year (ImageResponse's own default) */
const KEEP = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";
async function send(img: ImageResponse): Promise<Response> {
  const png = Buffer.from(await img.arrayBuffer());
  try {
    const sharp = (await import("sharp")).default;
    return new Response(new Uint8Array(await sharp(png).jpeg({ quality: 84, mozjpeg: true }).toBuffer()), { headers: { "content-type": cardType, "cache-control": KEEP } });
  } catch { return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": KEEP } }); }
}

const INK = { restaurant: ["#f4a63a", "#ff7445", "#1a1004"], hotel: ["#e3c27c", "#c9915a", "#17110a"], resort: ["#3fd0b8", "#58a6ff", "#04130f"] } as const;
const WORD = { restaurant: "Restaurant", hotel: "Hotel", resort: "Resort" } as const;

const allowed = (u: string) => {
  try {
    const h = new URL(u), own = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : null;
    return h.protocol === "https:" && (h.host === "upload.wikimedia.org" || (!!own && h.host === own && h.pathname.startsWith("/storage/v1/object/public/")));
  } catch { return false; }
};
/** A picture as a data address the card can draw (JPEG — the drawing library reads no WebP), or null. Never throws. */
async function picture(u: string | null | undefined, width: number): Promise<string | null> {
  if (!u || !allowed(u)) return null;
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(2500), redirect: "error", headers: { "user-agent": "DineFlow-ShareCard/1.0" } });
    if (!r.ok || !/^image\//.test(r.headers.get("content-type") ?? "")) return null;
    const raw = Buffer.from(await r.arrayBuffer()); if (raw.byteLength > 6e6) return null;
    const sharp = (await import("sharp")).default;
    const out = await sharp(raw).rotate().resize({ width, withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 78 }).toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch { return null; }
}
const latin = (s: string) => /^[ -ɏ‐-‧]*$/.test(s);

export async function siteCard(d: SiteData | null): Promise<Response> {
  const [a, b, on] = INK[d?.type ?? "restaurant"];
  if (!d) return send(new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", background: "#0b0a09" }} />, size));
  const dish = d.sections.includes("menu") ? siteSignature(d, 1)[0]?.image_url : null;
  const [photo, logo] = await Promise.all([picture(sitePhotos(d.photos, 3).find(allowed) ?? dish, 760), picture(d.logo_url, 192)]);
  // the card's font is Latin: a name in another script is not drawn as boxes — the kind and the town carry the card
  const name = latin(d.name) ? d.name : WORD[d.type], line = [d.headline, d.tagline].find((t) => !!t && latin(t)) ?? null;
  const fs = name.length <= 12 ? 112 : name.length <= 20 ? 88 : name.length <= 32 ? 66 : 52;
  const low = d.rooms.map((r) => Number(r.base_rate)).filter((n) => n > 0).sort((x, y) => x - y)[0];
  const facts = [
    d.rating && d.rating_count ? `${d.rating} / 5 · ${d.rating_count} reviews` : null,
    d.type === "restaurant" && d.opens_at && d.closes_at ? `Open ${clock(d.opens_at)} – ${clock(d.closes_at)}` : null,
    d.type === "restaurant" && d.cuisines?.length && latin(d.cuisines.join("")) ? d.cuisines.slice(0, 2).join(" · ") : null,
    d.type !== "restaurant" && low ? `From Rs ${new Intl.NumberFormat("en-IN").format(Math.round(low))} a night` : null,
  ].filter((f): f is string => !!f).slice(0, 2);
  const act = siteActions(d)[0]?.label ?? (d.sections.includes("menu") ? "See the menu" : "Visit us");
  const town = d.district && latin(d.district) ? d.district : null;

  /* the words keep the left; a photo, when there is one, takes the right and fades into the dark under them */
  const W = photo ? 690 : 1056;
  return send(new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#0b0a09", color: "#f6f1e7", fontFamily: "sans-serif" }}>
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      {photo && <img src={photo} width={560} height={630} style={{ position: "absolute", left: 640, top: 0, width: 560, height: 630, objectFit: "cover" }} />}
      {photo && <div style={{ position: "absolute", left: 640, top: 0, width: 560, height: 630, display: "flex", backgroundImage: "linear-gradient(90deg, rgba(11,10,9,1) 0%, rgba(11,10,9,0.55) 26%, rgba(11,10,9,0.08) 70%, rgba(11,10,9,0) 100%)" }} />}
      {!photo && <div style={{ position: "absolute", right: -160, top: -180, width: 720, height: 720, borderRadius: 720, display: "flex", background: `radial-gradient(closest-side, ${a}66, transparent)` }} />}
      {!photo && <div style={{ position: "absolute", right: 140, bottom: -320, width: 620, height: 620, borderRadius: 620, display: "flex", background: `radial-gradient(closest-side, ${b}55, transparent)` }} />}
      <div style={{ position: "absolute", left: 72, top: 60, width: W, height: 500, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          {logo ? <img src={logo} width={84} height={84} style={{ width: 84, height: 84, borderRadius: 84, objectFit: "cover", border: "2px solid rgba(255,255,255,.3)" }} />
            : <div style={{ width: 84, height: 84, borderRadius: 84, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, color: on, background: `linear-gradient(135deg, ${a}, ${b})` }}>{name.trim().charAt(0).toUpperCase()}</div>}
          <div style={{ display: "flex", fontSize: 24, letterSpacing: 5, textTransform: "uppercase", color: a, maxWidth: W - 110, overflow: "hidden" }}>{`${WORD[d.type]}${town ? ` · ${town}` : ""}`}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: photo ? Math.min(fs, 92) : fs, lineHeight: 1.02, letterSpacing: -2, maxHeight: 250, overflow: "hidden" }}>{name}</div>
          {line && <div style={{ display: "flex", marginTop: 22, fontSize: 32, lineHeight: 1.25, color: "#b6aea1", maxHeight: 84, overflow: "hidden" }}>{line.length > (photo ? 64 : 84) ? `${line.slice(0, photo ? 62 : 82)}…` : line}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", maxHeight: 136, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", height: 62, padding: "0 30px", borderRadius: 62, fontSize: 27, color: on, background: `linear-gradient(135deg, ${a}, ${b})` }}>{act}</div>
          {facts.map((f) => <div key={f} style={{ display: "flex", alignItems: "center", height: 62, padding: "0 24px", borderRadius: 62, fontSize: 24, color: "#f6f1e7", background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)" }}>{f}</div>)}
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 10, display: "flex", background: `linear-gradient(90deg, ${a}, ${b})` }} />
    </div>, size));
}

"use client";
import { useRef, useState } from "react";
import { ImagePlus, Trash2, Film, Box, Loader2 } from "lucide-react";
import { cn } from "@/components/ui";
import { websiteCan, websitePlanWith, type WebsiteSetup, type WebsitePlanFeature } from "@dineflow/shared";
import { Lock } from "lucide-react";
import { siteUploadUrl, saveSiteMedia, removeSiteFile } from "./actions";

/**
 * The website's own files (0185 bucket `site`; ninth pass): gallery photos, each room type's photos, a first-screen
 * video and a dish in 3D. The owner had to type a photo's address into Storefront — a photo that lived nowhere could
 * not be shown.
 *
 * A photo is shrunk here to 1600 px (WebP, a few hundred kB) before it leaves the phone; a video or a 3D file goes as
 * it is, 12 MB at most. The file is sent **straight to storage** on an address the server signs for this property's
 * folder (`siteUploadUrl`) — a server action's own body stops at 1 MB, and a film is not that small. Photos save
 * themselves as they are added or removed (`saveSiteMedia` → `website_media_save`, which keeps only this property's
 * own files); the video's and the model's addresses ride with the website's Save, like every other extra.
 */
const EDGE = 1600, BIG = 12 * 1024 * 1024, PHOTO_MAX = 12, ROOM_MAX = 6;
const PICS = ["image/jpeg", "image/png", "image/webp"];

async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  if (Math.max(bmp.width, bmp.height) < 400) throw new Error("That photo is too small — use one at least 400 px wide.");
  const k = Math.min(1, EDGE / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d")!; g.imageSmoothingQuality = "high"; g.drawImage(bmp, 0, 0, w, h);
  const out = (type: string, q: number) => new Promise<Blob | null>((r) => c.toBlob(r, type, q));
  let blob = await out("image/webp", 0.82);
  if (!blob || blob.type !== "image/webp") blob = await out("image/jpeg", 0.84);
  if (!blob) throw new Error("This browser could not read that photo.");
  return blob;
}
/** Send one file to this property's folder; answers its public address. */
async function send(kind: "photo" | "room" | "video" | "model", blob: Blob, type: string): Promise<string> {
  const a = await siteUploadUrl(kind, type);
  if ("error" in a) throw new Error(a.error);
  // the storage client is fetched here, when a file is actually being sent — Settings must not carry it for everyone who opens the page
  const { createClient } = await import("@/lib/supabase/client");
  const up = await createClient().storage.from("site").uploadToSignedUrl(a.path, a.token, blob, { contentType: type, cacheControl: "31536000" });
  if (up.error) throw new Error(up.error.message);
  return a.url;
}

export type MediaExtras = { video_url: string; model_url: string; model_name: string };

export function WebsiteMedia({ setup, extras, onExtras }: { setup: WebsiteSetup; extras: MediaExtras; onExtras: (patch: Partial<MediaExtras>) => void }) {
  const [photos, setPhotos] = useState<string[]>(() => setup.photo_list ?? []);
  const [rooms, setRooms] = useState<Record<string, string[]>>(() => Object.fromEntries((setup.room_list ?? []).map((r) => [r.id, r.photos ?? []])));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stay = setup.type !== "restaurant" && (setup.room_list?.length ?? 0) > 0;
  /* what the property's website plan includes: a file kind it does not include is shown locked, with the plan it starts in */
  const can = (f: WebsitePlanFeature) => websiteCan(setup, f);
  const locked = (f: WebsitePlanFeature, title: string, hint: string) => (
    <div key={f} className="mt-3 rounded-2xl border border-dashed border-[var(--color-separator)] px-4 py-3 flex items-center gap-3 min-h-[60px]" data-website-locked={f}>
      <span className="flex-1 min-w-0"><span className="block text-[15px] font-semibold text-[var(--color-label-2)]">{title}</span><span className="block text-[12.5px] text-steel mt-0.5">{hint}</span></span>
      <span className="shrink-0 h-7 px-2.5 rounded-full inline-flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide bg-[var(--color-fill)] text-[var(--color-label-2)]"><Lock size={12} aria-hidden /> {websitePlanWith(setup, f) ?? "Not in a plan"}</span>
    </div>);

  /* photos: shrink, send, then save the new list at once */
  const addPhotos = async (files: FileList | null, room?: string) => {
    if (!files?.length) return; setError(null);
    const have = room ? rooms[room] ?? [] : photos, max = room ? ROOM_MAX : PHOTO_MAX, list = [...files].slice(0, Math.max(0, max - have.length));
    if (!list.length) { setError(`That is the most ${room ? "a room" : "the gallery"} can hold (${max}). Remove one first.`); return; }
    const bad = list.find((f) => !PICS.includes(f.type)); if (bad) { setError("Use JPG, PNG or WebP photos."); return; }
    setBusy(room ?? "photos");
    try {
      const added: string[] = [];
      for (const f of list) added.push(await send(room ? "room" : "photo", await shrink(f), "image/webp").catch(async (e) => { if (/webp/i.test(String(e))) return send(room ? "room" : "photo", await shrink(f), "image/jpeg"); throw e; }));
      const next = [...have, ...added];
      const r = room ? await saveSiteMedia(null, { [room]: next }) : await saveSiteMedia(next, null);
      if ("error" in r) throw new Error(r.error);
      if (room) setRooms((x) => ({ ...x, [room]: next })); else setPhotos(r.photos ?? next);
    } catch (e) { setError(e instanceof Error ? e.message : "The photo could not be added."); }
    setBusy(null);
  };
  const dropPhoto = async (url: string, room?: string) => {
    setError(null); setBusy(room ?? "photos");
    const next = (room ? rooms[room] ?? [] : photos).filter((p) => p !== url);
    const r = room ? await saveSiteMedia(null, { [room]: next }) : await saveSiteMedia(next, null);
    if ("error" in r) setError(r.error ?? "The photo could not be removed."); else { if (room) setRooms((x) => ({ ...x, [room]: next })); else setPhotos(r.photos ?? next); void removeSiteFile(url); }
    setBusy(null);
  };
  /* a film or a 3D file: sent as it is; its address rides with the website's Save */
  const addBig = async (file: File | undefined, kind: "video" | "model") => {
    if (!file) return; setError(null);
    const type = kind === "model" ? "model/gltf-binary" : file.type;
    if (kind === "video" && !["video/mp4", "video/webm"].includes(file.type)) { setError("Use an MP4 or WebM video."); return; }
    if (kind === "model" && !/\.glb$/i.test(file.name)) { setError("Use a .glb file (a 3D model exported as GLB)."); return; }
    if (file.size > BIG) { setError(`That file is ${(file.size / 1048576).toFixed(1)} MB — the most is 12 MB. ${kind === "video" ? "Ten to fifteen seconds at 720p is plenty." : "Ask for a compressed GLB."}`); return; }
    setBusy(kind);
    try { const url = await send(kind, file, type); const old = kind === "video" ? extras.video_url : extras.model_url; onExtras(kind === "video" ? { video_url: url } : { model_url: url }); if (old) void removeSiteFile(old); }
    catch (e) { setError(e instanceof Error ? e.message : "The file could not be added."); }
    setBusy(null);
  };

  return (
    <div data-website-media>
      <div className="text-[12px] font-bold uppercase tracking-[.12em] text-steel">Photos &amp; files</div>
      <p className="footnote mt-1">Photos save as you add them. Shrunk on this device first.</p>
      {!can("upload") ? locked("upload", "Photo upload", "Gallery photos from this device") : <Strip title="Gallery" count={`${photos.length}/${PHOTO_MAX}`} list={photos} busy={busy === "photos"} full={photos.length >= PHOTO_MAX} onAdd={(f) => addPhotos(f)} onDrop={(u) => dropPhoto(u)} name="gallery" />}
      {stay && !can("rooms") && locked("rooms", "Room photos", "Each room type's own photos")}
      {stay && can("rooms") && (setup.room_list ?? []).map((r) => (
        <Strip key={r.id} title={r.name} count={`${(rooms[r.id] ?? []).length}/${ROOM_MAX}`} list={rooms[r.id] ?? []} busy={busy === r.id} full={(rooms[r.id] ?? []).length >= ROOM_MAX} onAdd={(f) => addPhotos(f, r.id)} onDrop={(u) => dropPhoto(u, r.id)} name={`room-${r.id}`} />
      ))}
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {!can("video") ? <div className="-mt-3">{locked("video", "First-screen video", "Short, silent; wide screens only")}</div> : <Big icon={<Film size={18} aria-hidden />} title="First-screen video" hint="MP4, silent, 10–15 s, up to 12 MB. Wide screens only." has={!!extras.video_url} busy={busy === "video"} accept="video/mp4,video/webm" onPick={(f) => addBig(f, "video")} onClear={() => { const u = extras.video_url; onExtras({ video_url: "" }); if (u) void removeSiteFile(u); }} name="video" />}
        {!can("model") ? <div className="-mt-3">{locked("model", "A dish in 3D", "From a .glb file; opens on a tap")}</div> : <Big icon={<Box size={18} aria-hidden />} title="A dish in 3D" hint=".glb file, up to 12 MB. Opens when a guest taps." has={!!extras.model_url} busy={busy === "model"} accept=".glb,model/gltf-binary" onPick={(f) => addBig(f, "model")} onClear={() => { const u = extras.model_url; onExtras({ model_url: "", model_name: "" }); if (u) void removeSiteFile(u); }} name="model" />}
      </div>
      {extras.model_url && (
        <div className="mt-2.5 space-y-1.5"><label htmlFor="ws-model-name">Which dish is it?</label>
          <input id="ws-model-name" value={extras.model_name} maxLength={60} onChange={(e) => onExtras({ model_name: e.target.value })} placeholder="Chicken dum biryani" data-website-model-name /></div>
      )}
      {error && <p role="alert" className="mt-3 rounded-xl px-3.5 py-2.5 text-[13.5px] bg-[var(--color-red-2)] text-[var(--color-red)]" data-website-media-error>{error}</p>}
    </div>
  );
}

function Strip({ title, count, list, busy, full, onAdd, onDrop, name }: { title: string; count: string; list: string[]; busy: boolean; full: boolean; onAdd: (f: FileList | null) => void; onDrop: (url: string) => void; name: string }) {
  const pick = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-3 rounded-2xl border border-[var(--color-separator)] p-3" data-website-strip={name}>
      <div className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-[14.5px] font-semibold">{title}</span><span className="shrink-0 num text-[12.5px] text-steel">{count}</span></div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {list.map((u, i) => (
          <span key={u} className="relative h-[84px] w-[84px] shrink-0 overflow-hidden rounded-xl bg-[var(--color-fill)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt={`${title} photo ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
            <button type="button" onClick={() => onDrop(u)} disabled={busy} aria-label={`Remove ${title} photo ${i + 1}`} className="absolute inset-0 grid place-items-end p-1 text-white"><span className="grid h-7 w-7 place-items-center rounded-full bg-black/60"><Trash2 size={14} aria-hidden /></span></button>
          </span>
        ))}
        <button type="button" onClick={() => pick.current?.click()} disabled={busy || full} className={cn("h-[84px] w-[84px] shrink-0 rounded-xl border-2 border-dashed border-[var(--color-separator)] grid place-items-center text-[var(--color-tint)]", (busy || full) && "opacity-50")} aria-label={`Add ${title} photos`} data-website-add={name}>
          {busy ? <Loader2 size={20} className="animate-spin" aria-hidden /> : <ImagePlus size={22} aria-hidden />}
        </button>
        <input ref={pick} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden style={{ display: "none" }} onChange={(e) => { onAdd(e.target.files); e.target.value = ""; }} data-website-file={name} />
      </div>
    </div>
  );
}

function Big({ icon, title, hint, has, busy, accept, onPick, onClear, name }: { icon: React.ReactNode; title: string; hint: string; has: boolean; busy: boolean; accept: string; onPick: (f: File | undefined) => void; onClear: () => void; name: string }) {
  const pick = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-2xl border border-[var(--color-separator)] p-3.5 min-w-0" data-website-big={name} data-has={has ? "1" : "0"}>
      <div className="flex items-center gap-2.5"><span className="h-9 w-9 shrink-0 rounded-xl grid place-items-center bg-[var(--color-fill)] text-[var(--color-tint)]">{icon}</span><span className="min-w-0 text-[14.5px] font-semibold">{title}</span></div>
      <p className={cn("mt-1.5 text-[12.5px] leading-snug", has ? "text-[var(--color-green)]" : "text-steel")}>{has ? "Added. Save the website to put it on the page." : hint}</p>
      <div className="mt-2.5 flex gap-2">
        <button type="button" className="svc-btn quiet sm !px-3.5" onClick={() => pick.current?.click()} disabled={busy} data-website-pick={name}>{busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : null} {busy ? "Sending…" : has ? "Replace" : "Choose file"}</button>
        {has && <button type="button" className="svc-btn quiet sm !px-3.5" onClick={onClear} disabled={busy} data-website-clear={name}><Trash2 size={15} aria-hidden /> Remove</button>}
      </div>
      <input ref={pick} type="file" accept={accept} hidden style={{ display: "none" }} onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ""; }} data-website-file={name} />
    </div>
  );
}

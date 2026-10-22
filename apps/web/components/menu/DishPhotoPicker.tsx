"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Check, ImageOff, Loader2, Search, Upload, X } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { findPhotos, uploadDishPhoto } from "@/app/(app)/menu/actions";

export type DishPhoto = { url: string; credit?: string | null; source?: string | null };
type Candidate = { url: string; thumb: string; title: string; source: string; credit: string; score: number };

/** A photo shrunk to `max` px on its long side, as WebP — a 5 MB phone photo becomes ~80 KB. */
async function shrink(file: File, max = 900): Promise<File> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/webp", 0.82));
  return new File([blob ?? file], "dish.webp", { type: blob ? "image/webp" : file.type });
}

/**
 * The photo for one dish: the chosen one large, and below it what was found for the dish's name —
 * Wikipedia's own photo of that dish first, then more from Wikimedia Commons — or the property's own.
 * As the name is typed the search runs again (after a pause), and on a new dish the best match is
 * chosen by itself when it is a confident one; a tap on any other changes it.
 */
export function DishPhotoPicker({ name, category, value, onChange, autoPick = false }: {
  name: string; category?: string | null; value: DishPhoto | null; onChange: (p: DishPhoto | null) => void; autoPick?: boolean;
}) {
  const [found, setFound] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  /* the camera: a phone or tablet opens its own camera app (capture="environment"); a laptop has no
     camera app to hand over to, so a live preview opens here with a shutter button */
  const [live, setLive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopCam = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setLive(false); };
  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);
  const takePhoto = async () => {
    setErr(null);
    const touch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
    if (touch || !navigator.mediaDevices?.getUserMedia) { camRef.current?.click(); return; }
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
      streamRef.current = st; setLive(true);
      requestAnimationFrame(() => { if (videoRef.current) { videoRef.current.srcObject = st; void videoRef.current.play(); } });
    } catch { setErr("Camera blocked or missing. Allow it, or upload a photo."); }
  };
  const snap = async () => {
    const v = videoRef.current; if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.9));
    stopCam();
    if (blob) await upload(new File([blob], "camera.jpg", { type: "image/jpeg" }));
  };
  const touched = useRef(false);           // once the person picks or removes, the search never overrides them
  const last = useRef("");

  useEffect(() => {
    const q = name.trim();
    if (q.length < 3 || q === last.current) return;
    const t = setTimeout(async () => {
      last.current = q; setBusy(true); setErr(null);
      const r = await findPhotos(q, category ?? null);
      setBusy(false);
      if ("error" in r) { setErr(r.error ?? "Could not search"); return; }
      setFound(r.photos as Candidate[]);
      const top = r.photos[0];
      if (autoPick && !touched.current && top && top.score >= 6) onChange({ url: top.url, credit: top.credit, source: top.source });
    }, 650);
    return () => clearTimeout(t);
  }, [name, category, autoPick]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (p: DishPhoto | null) => { touched.current = true; onChange(p); };
  const upload = async (f: File) => {
    setUploading(true); setErr(null);
    try {
      const fd = new FormData(); fd.set("file", await shrink(f));
      const r = await uploadDishPhoto(fd);
      if (r.error || !r.url) setErr(r.error ?? "Upload failed"); else pick({ url: r.url, credit: null, source: null });
    } catch { setErr("That file is not a photo."); }
    finally { setUploading(false); }
  };

  /* Two columns once the dialog is wide enough — the photo on the left; what was found, and your own, on the right —
     and the photo never taller than 42% of the screen (2026-10-20). Stacked in a 512px dialog the 4:3 photo alone was
     348px, so on an iPad held sideways the dialog filled the screen and the found photos and Upload sat below the
     fold, looking cut off. Now the Photo dialog (wide) is as tall as what is in it; the dish form stays stacked. */
  return (
    <div className="@container" data-photo-picker>
    <div className="grid gap-3 @[34rem]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] @[34rem]:gap-5 @[34rem]:items-start">
    <div className="space-y-2 min-w-0">
      {/* the live camera takes the photo's place while it is open, so the shutter is where the eye already is */}
      {live && (
        <div className="space-y-2" data-live-camera>
          <div className="relative aspect-[4/3] w-full max-h-[42dvh] overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            <span className="absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-black/55 text-white text-[12px] px-2.5 py-1 backdrop-blur"><span className="h-2 w-2 rounded-full bg-[var(--color-red)]" /> Camera</span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Button type="button" onClick={() => { void snap(); }} data-shutter><Camera size={16} /> Capture</Button>
            <Button type="button" variant="outline" onClick={stopCam}>Cancel</Button>
          </div>
        </div>
      )}
      {/* the chosen photo, as guests will see it */}
      <div className={cn("relative aspect-[4/3] w-full max-h-[42dvh] overflow-hidden rounded-2xl bg-[var(--color-fill)]", live && "hidden")}>
        {value?.url
          // eslint-disable-next-line @next/next/no-img-element -- a Wikimedia thumbnail or the property's own upload
          ? <img src={value.url} alt={name || "Dish photo"} className="h-full w-full object-cover" data-chosen />
          : <div className="h-full w-full grid place-items-center text-center px-6 text-[var(--color-label-3)]">
              <div><ImageOff size={28} className="mx-auto" /><p className="mt-2 text-[13px]">{busy ? "Looking for a photo…" : name.trim().length < 3 ? "Type the dish name — a photo is found for it" : "No photo chosen"}</p></div>
            </div>}
        {value?.url && <button type="button" onClick={() => pick(null)} aria-label="Remove the photo" title="Remove the photo"
          className="absolute top-2 right-2 h-10 w-10 rounded-full grid place-items-center bg-black/55 text-white backdrop-blur hover:bg-black/70 transition"><X size={18} /></button>}
        {busy && <span className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-black/55 text-white text-[12px] px-2.5 py-1 backdrop-blur"><Loader2 size={12} className="animate-spin" /> Finding photos</span>}
      </div>
      {value?.credit && <p className="text-[11px] text-[var(--color-label-3)] leading-snug truncate" title={value.credit}>{value.source ? <a href={value.source} target="_blank" rel="noreferrer" className="hover:underline">{value.credit}</a> : value.credit}</p>}
    </div>

    <div className="space-y-3 min-w-0">
      {/* what was found */}
      {found && found.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2"><Search size={13} className="text-steel" /><span className="text-[12px] font-semibold text-[var(--color-label-2)]">Photos of “{last.current}” — tap one</span></div>
          <div className="grid grid-cols-4 gap-2" data-candidates>
            {found.map((c) => { const on = value?.url === c.url; return (
              <button key={c.url} type="button" onClick={() => pick({ url: c.url, credit: c.credit, source: c.source })} title={`${c.title} · ${c.credit}`} aria-pressed={on}
                className={cn("relative aspect-square min-w-0 overflow-hidden rounded-xl bg-[var(--color-fill)] transition !min-h-0", on ? "ring-[3px] ring-[var(--color-tint)] ring-offset-2 ring-offset-[var(--color-bg-2)]" : "hover:opacity-85")}>
                {/* eslint-disable-next-line @next/next/no-img-element -- Wikimedia thumbnails */}
                <img src={c.thumb} alt={c.title} className="h-full w-full object-cover" />
                {on && <span className="absolute top-1 right-1 h-5 w-5 rounded-full grid place-items-center bg-[var(--color-tint)] text-[var(--color-on-tint)]"><Check size={12} strokeWidth={3} /></span>}
              </button>); })}
          </div>
        </div>
      )}
      {found && found.length === 0 && !busy && <p className="text-[13px] text-[var(--color-label-2)]">No photo found. Try a common name, or upload your own.</p>}
      {err && <p className="text-[13px] text-[var(--color-red)]">{err}</p>}

      <div className="grid grid-cols-2 gap-2" data-own-photo>
        <Button type="button" variant="outline" size="sm" loading={uploading && !live} onClick={() => { void takePhoto(); }} data-take-photo><Camera size={14} /> Take a photo</Button>
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()} data-upload><Upload size={14} /> Upload</Button>
      </div>
      <p className="text-[11px] text-[var(--color-label-3)]">Found photos are free to use (Wikimedia Commons).</p>
    </div>
    </div>
      <input ref={fileRef} type="file" accept="image/*" hidden style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden style={{ display: "none" }} data-camera-input onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
    </div>
  );
}

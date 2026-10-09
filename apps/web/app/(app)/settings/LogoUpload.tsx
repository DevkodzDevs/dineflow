"use client";
import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, CheckCircle2, AlertTriangle, Upload } from "lucide-react";
import { cn, useToast } from "@/components/ui";
import { uploadLogo, removeLogo } from "./actions";

const RAW_MAX = 5 * 1024 * 1024;     // what may be picked: a phone photo of a sign is often 3–4 MB
const SEND_MAX = 1024 * 1024;        // what is sent after shrinking — the bucket's own limit (0083)
const EDGE = 512;                    // the longest side kept; sidebar, receipts and the storefront never show it larger
const MIN_EDGE = 128;                // below this a logo is a smudge
const OK_TYPES = ["image/png", "image/jpeg", "image/webp"];
const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Shrink to at most 512 px on the long side, keep transparency (WebP, or PNG where WebP cannot be
 *  written), and only fall back to JPEG if the result is somehow still over the limit. */
async function shrink(file: File): Promise<{ blob: Blob; w: number; h: number; srcW: number; srcH: number }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, EDGE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d")!; g.imageSmoothingQuality = "high"; g.drawImage(bmp, 0, 0, w, h);
  const out = (type: string, q?: number) => new Promise<Blob | null>((r) => c.toBlob(r, type, q));
  let blob = await out("image/webp", 0.9);
  if (!blob || blob.type !== "image/webp") blob = await out("image/png");
  if (blob && blob.size > SEND_MAX) blob = await out("image/jpeg", 0.85);
  if (!blob) throw new Error("This browser could not read that image.");
  return { blob, w, h, srcW: bmp.width, srcH: bmp.height };
}

/**
 * The property logo: pick an image, see it, done. Replaces a "Logo URL" text box nobody could fill
 * in without hosting a file somewhere first. The picture is checked here (type, 5 MB, at least
 * 128 px), shrunk to 512 px, uploaded by `uploadLogo`, and saved at once — no separate Save needed.
 * A hidden `logo_url` input keeps the details form in step, so pressing that form's Save later
 * keeps the new logo instead of writing back the old address.
 */
export function LogoUpload({ restaurantId, initial, name }: { restaurantId: string; initial: string | null; name: string }) {
  const toast = useToast();
  const [url, setUrl] = useState(initial);
  const [busy, setBusy] = useState<"up" | "rm" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const pick = useRef<HTMLInputElement>(null);

  const take = async (file: File | undefined) => {
    setErr(null); setInfo(null);
    if (!file) return;
    if (!OK_TYPES.includes(file.type)) { setErr(file.type === "image/svg+xml" ? "SVG cannot be used — save the logo as PNG instead." : "Use a PNG, JPG or WebP image."); return; }
    if (file.size > RAW_MAX) { setErr(`That image is ${kb(file.size)} — the limit is 5 MB. Choose a smaller one.`); return; }
    setBusy("up");
    try {
      const s = await shrink(file);
      if (Math.min(s.srcW, s.srcH) < MIN_EDGE) { setErr(`That image is only ${s.srcW} × ${s.srcH} px — use one at least 256 px across so it stays sharp.`); return; }
      if (s.blob.size > SEND_MAX) { setErr("That image is still over 1 MB after shrinking — try a simpler one."); return; }
      const fd = new FormData(); fd.set("id", restaurantId);
      fd.set("file", new File([s.blob], `logo.${s.blob.type.split("/")[1]}`, { type: s.blob.type }));
      const r = await uploadLogo(fd);
      if (r.error) { setErr(r.error); return; }
      setUrl(r.url ?? null);
      setInfo(`${s.w} × ${s.h} px · ${kb(s.blob.size)}${file.size > s.blob.size ? ` (from ${kb(file.size)})` : ""}${Math.min(s.srcW, s.srcH) < 256 ? " · a little small, may look soft" : ""}`);
      toast("Logo saved");
    } catch (e) { setErr(e instanceof Error ? e.message : "That image could not be read."); }
    finally { setBusy(null); }
  };
  const drop = async () => {
    setErr(null); setInfo(null); setBusy("rm");
    const r = await removeLogo(restaurantId); setBusy(null);
    if (r.error) { setErr(r.error); return; }
    setUrl(null); toast("Logo removed");
  };

  return (
    <div className="min-w-0">
      <span className="block text-[13px] font-semibold mb-1.5">Logo</span>
      <input type="hidden" name="logo_url" value={url ?? ""} />
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void take(e.dataTransfer.files?.[0]); }}
        className={cn("rounded-2xl border border-dashed p-3.5 flex items-center gap-3.5 transition-colors",
          drag ? "border-[var(--color-tint)] bg-[color-mix(in_srgb,var(--color-tint)_8%,transparent)]" : err ? "border-[color-mix(in_srgb,var(--color-red)_55%,transparent)]" : "border-[var(--color-separator)] bg-[var(--color-fill)]")}>
        {/* the logo as it will look, on a checkerboard so a transparent edge shows */}
        <span className="logo-well h-[72px] w-[72px] shrink-0 rounded-2xl overflow-hidden grid place-items-center border border-[var(--color-separator)]">
          {busy === "up" ? <Loader2 size={22} className="animate-spin text-steel" />
            : url
              // a 72px preview of a file on Supabase Storage: next/image would only proxy it
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={url} alt={`${name} logo`} className="h-full w-full object-contain" />
              : <ImagePlus size={24} className="text-steel" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold truncate">{busy === "up" ? "Uploading…" : url ? "Your logo" : "Upload your logo"}</span>
          <span className="block text-[11.5px] text-steel leading-snug mt-0.5">PNG, JPG or WebP · up to 5 MB · square, at least 256 px</span>
          <span className="flex flex-wrap gap-2 mt-2.5">
            <button type="button" disabled={!!busy} onClick={() => pick.current?.click()} className="btn btn-filled !h-10 px-3.5 text-[13px] inline-flex items-center gap-1.5"><Upload size={14} /> {url ? "Replace" : "Choose image"}</button>
            {url && <button type="button" disabled={!!busy} onClick={() => void drop()} className="btn btn-gray !h-10 px-3 text-[13px] inline-flex items-center gap-1.5" aria-label="Remove logo">{busy === "rm" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Remove</button>}
          </span>
        </span>
        <input ref={pick} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" tabIndex={-1} aria-label="Logo image"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void take(f); }} />
      </div>
      {err && <p role="alert" className="mt-2 text-xs text-[var(--color-red)] flex items-start gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-px" />{err}</p>}
      {!err && info && <p className="mt-2 text-xs text-[var(--color-green)] flex items-start gap-1.5"><CheckCircle2 size={13} className="shrink-0 mt-px" />Saved · {info}</p>}
    </div>
  );
}

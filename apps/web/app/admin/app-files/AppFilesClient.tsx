"use client";
import { useRef, useState, useTransition } from "react";
import { Monitor, Smartphone, UploadCloud, Download, Check, AlertTriangle, RotateCcw, FileUp, X, Link2 } from "lucide-react";
import { cn } from "@/components/ui";
import { getClient } from "@/lib/supabase/lazy";
import { publishRelease, publishLink, makeCurrent } from "./actions";

/** An upload in the bucket (file_path) or, since 0129, a link to a file kept elsewhere (external_url) — never both. */
export type Release = { id: string; platform: "android" | "windows"; version: string; file_path: string | null; external_url?: string | null; file_name: string; size_bytes: number | null; notes: string | null; created_at: string; is_current: boolean; uploaded_by: string | null; url: string };
type Kind = "android" | "windows";

const LIMIT = 104857600;   // the bucket's own limit (0128)
const KIND: Record<Kind, { title: string; ext: string; Icon: typeof Smartphone; mime: string; hint: string }> = {
  android: { title: "Android app", ext: ".apk", Icon: Smartphone, mime: "application/vnd.android.package-archive", hint: "apps/android-app → app/build/outputs/apk/release/app-release.apk" },
  windows: { title: "Windows app", ext: ".exe", Icon: Monitor, mime: "application/vnd.microsoft.portable-executable", hint: "apps/desktop/dist/DineFlow-Setup-<version>.exe" },
};
const mb = (n: number | null) => (n ? `${(n / 1048576).toFixed(n > 10485760 ? 0 : 1)} MB` : "size not given");
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const versionIn = (name: string) => name.match(/(\d+\.\d+(?:\.\d+){0,2})/)?.[1] ?? "";

/** What Storage's refusal means, in words the owner can act on. */
function why(status: number, body: string): string {
  if (status === 413 || /maximum allowed size|too large|exceeded/i.test(body))
    return "The file is larger than your Supabase upload limit (50 MB on the Free plan) — put it on Cloudflare R2 and paste its link below, or raise Supabase → Storage → Settings → “Upload file size limit”.";
  if (/bucket not found/i.test(body)) return "App files storage is not set up yet — migration 0128 has to be applied first.";
  if (/mime|content type|not supported/i.test(body)) return "Supabase refused this kind of file. An Android file must be an .apk and a Windows file an .exe.";
  if (status === 403 || /row-level security|unauthori[sz]ed|policy/i.test(body)) return "Only Master control can upload app files — sign in again as Master control.";
  if (/already exists|duplicate/i.test(body)) return "A file with this name is already uploaded — give it a new version number.";
  return `Upload failed (${status || "no connection"}). Check the internet and try again.`;
}

/** One file, straight from the browser to the bucket with this session — with real progress (XHR, not supabase-js,
 *  which reports none). Resolves with the stored path, or rejects with a sentence. */
async function send(file: File, path: string, contentType: string, onProgress: (p: number) => void): Promise<void> {
  const sb = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, ""), key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const { data } = await (await getClient()).auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You are signed out — sign in as Master control and try again.");
  await new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", `${sb}/storage/v1/object/app-files/${path.split("/").map(encodeURIComponent).join("/")}`);
    x.setRequestHeader("authorization", `Bearer ${token}`); x.setRequestHeader("apikey", key);
    x.setRequestHeader("content-type", contentType); x.setRequestHeader("x-upsert", "false"); x.setRequestHeader("cache-control", "3600");
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(why(x.status, x.responseText))));
    x.onerror = () => reject(new Error(why(0, "")));
    x.send(file);
  });
}

function Card({ kind, rows, ready }: { kind: Kind; rows: Release[]; ready: boolean }) {
  const k = KIND[kind]; const cur = rows.find((r) => r.is_current); const old = rows.filter((r) => !r.is_current).slice(0, 5);
  const [file, setFile] = useState<File | null>(null); const [version, setVersion] = useState(""); const [notes, setNotes] = useState("");
  const [over, setOver] = useState(false); const [pct, setPct] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null); const [pending, start] = useTransition();
  const pick = useRef<HTMLInputElement>(null);
  const choose = (f: File | undefined) => {
    setMsg(null); if (!f) return;
    if (!f.name.toLowerCase().endsWith(k.ext)) { setMsg({ ok: false, text: `The ${k.title} must be a ${k.ext} file — “${f.name}” is not.` }); return; }
    if (f.size > LIMIT) { setMsg({ ok: false, text: `${mb(f.size)} is over the 100 MB limit for an app file.` }); return; }
    setFile(f); setVersion(versionIn(f.name));
  };
  const taken = rows.some((r) => r.version === version.trim());
  const valid = !!file && /^\d+(\.\d+){1,3}$/.test(version.trim()) && !taken;
  const upload = () => {
    if (!file || !valid) return;
    const v = version.trim(); const name = kind === "android" ? `DineFlow-${v}.apk` : `DineFlow-Setup-${v}.exe`; const path = `${kind}/${name}`;
    setMsg(null); setPct(0);
    start(async () => {
      try { await send(file, path, file.type || k.mime, setPct); }
      catch (e) { setPct(null); setMsg({ ok: false, text: (e as Error).message }); return; }
      const r = await publishRelease({ platform: kind, version: v, path, name, size: file.size, notes });
      setPct(null);
      if ("error" in r) { setMsg({ ok: false, text: r.error ?? "Could not publish" }); return; }
      setFile(null); setVersion(""); setNotes(""); setMsg({ ok: true, text: `Version ${v} is live — every install screen offers it within a minute.` });
    });
  };
  return (
    <section className="card p-0 overflow-hidden flex flex-col min-w-0" data-app-file={kind}>
      <div className="p-5 flex items-center gap-3 border-b border-[var(--color-separator)]">
        <span className="h-11 w-11 rounded-2xl grid place-items-center bg-[var(--color-fill)] text-[var(--color-tint)] shrink-0"><k.Icon size={20} aria-hidden /></span>
        <div className="min-w-0 flex-1"><div className="text-[17px] font-bold">{k.title} <span className="text-[var(--color-label-2)] font-semibold">({k.ext})</span></div>
          <div className="text-[12.5px] text-[var(--color-label-2)] truncate">{cur ? <>v{cur.version} · {cur.external_url ? "link" : "uploaded"} · {mb(cur.size_bytes)} · {when(cur.created_at)}</> : "Nothing uploaded yet — the install screens use the file built on this machine, or show “coming soon”."}</div></div>
        {cur && <a href={cur.url} download={cur.file_name} className="h-10 px-3.5 rounded-xl inline-flex items-center gap-1.5 text-[13px] font-semibold bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] shrink-0" data-app-file-current><Download size={15} aria-hidden /> Test download</a>}
      </div>

      <div className="p-5 grid gap-3">
        <button type="button" disabled={!ready || pending} onClick={() => pick.current?.click()} data-app-file-drop
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); choose(e.dataTransfer.files?.[0]); }}
          className={cn("w-full min-h-[120px] rounded-2xl border-2 border-dashed grid place-items-center gap-2 px-4 py-5 text-center transition-colors disabled:opacity-50",
            over ? "border-[var(--color-tint)] bg-[color-mix(in_srgb,var(--color-tint)_8%,transparent)]" : "border-[var(--color-separator)] hover:bg-[var(--color-fill)]")}>
          {file ? <span className="grid justify-items-center gap-1"><FileUp size={22} className="text-[var(--color-tint)]" aria-hidden /><b className="text-[14px] break-all">{file.name}</b><span className="text-[12.5px] text-[var(--color-label-2)]">{mb(file.size)} · tap to choose another</span></span>
            : <span className="grid justify-items-center gap-1"><UploadCloud size={24} className="text-[var(--color-label-2)]" aria-hidden /><b className="text-[14px]">Drop the new {k.ext} here, or tap to choose</b><span className="text-[12px] text-[var(--color-label-3)] break-all">Built at {k.hint}</span></span>}
        </button>
        <input ref={pick} type="file" accept={k.ext} hidden style={{ display: "none" }} data-app-file-input onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />

        {file && <div className="grid sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-3">
          <label className="grid gap-1"><span className="text-[12.5px] font-semibold text-[var(--color-label-2)]">Version</span>
            <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.1" inputMode="decimal" className="num" data-app-file-version />
            {taken && <span className="text-[12px] text-[var(--color-red)]">v{version} is already uploaded — use a new number.</span>}</label>
          <label className="grid gap-1 min-w-0"><span className="text-[12.5px] font-semibold text-[var(--color-label-2)]">What changed — optional</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Faster start-up" data-app-file-notes /></label>
        </div>}

        {pct !== null && <div className="grid gap-1" data-app-file-progress><div className="h-2 rounded-full bg-[var(--color-fill)] overflow-hidden"><div className="h-full rounded-full bg-[var(--color-tint)] transition-[width] duration-200" style={{ width: `${Math.round(pct * 100)}%` }} /></div>
          <div className="text-[12px] text-[var(--color-label-2)] num">{pct < 1 ? `Uploading ${Math.round(pct * 100)}% · ${mb((file?.size ?? 0) * pct)} of ${mb(file?.size ?? 0)}` : "Uploaded — publishing…"}</div></div>}

        {msg && <p role="status" className={cn("flex items-start gap-2 text-[13.5px] rounded-xl px-3 py-2.5", msg.ok ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[var(--color-red-2)] text-[var(--color-red)]")} data-app-file-msg={msg.ok ? "ok" : "error"}>
          {msg.ok ? <Check size={16} className="shrink-0 mt-0.5" aria-hidden /> : <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden />}<span>{msg.text}</span></p>}

        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!valid || pending || !ready} onClick={upload} className="btn btn-filled !h-11 !px-5 disabled:opacity-50" data-app-file-upload><UploadCloud size={16} aria-hidden /> {pending ? "Uploading…" : "Upload"}</button>
          {file && !pending && <button type="button" onClick={() => { setFile(null); setVersion(""); setMsg(null); }} className="btn btn-gray !h-11"><X size={15} aria-hidden /> Clear</button>}
        </div>
        <LinkForm kind={kind} rows={rows} ready={ready} onDone={setMsg} />
      </div>

      {old.length > 0 && <div className="border-t border-[var(--color-separator)] px-5 py-3 grid gap-1.5" data-app-file-history>
        <div className="text-[11.5px] font-semibold uppercase tracking-[.12em] text-[var(--color-label-2)]">Earlier uploads</div>
        {old.map((r) => (
          <div key={r.id} className="flex items-center gap-3 min-h-11">
            <span className="min-w-0 flex-1 text-[13px]"><b className="num">v{r.version}</b> <span className="text-[var(--color-label-2)]">· {r.external_url ? "Link" : "Uploaded"} · {mb(r.size_bytes)} · {when(r.created_at)}{r.notes ? ` · ${r.notes}` : ""}</span></span>
            <button type="button" disabled={pending} onClick={() => start(async () => { const x = await makeCurrent(r.id); setMsg("error" in x ? { ok: false, text: x.error ?? "Could not switch" } : { ok: true, text: `v${r.version} is handed out again.` }); })}
              className="h-10 px-3 rounded-xl inline-flex items-center gap-1.5 text-[12.5px] font-semibold bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] shrink-0" data-app-file-rollback={r.version}><RotateCcw size={14} aria-hidden /> Make current</button>
          </div>))}
      </div>}
    </section>
  );
}

/** "Or paste a download link" (0129): for a file kept elsewhere — the ~78 MB Windows installer on Cloudflare R2, over
 *  Supabase Free's 50 MB upload cap. https only, the right extension; the version is read from the link's file name. */
function LinkForm({ kind, rows, ready, onDone }: { kind: Kind; rows: Release[]; ready: boolean; onDone: (m: { ok: boolean; text: string } | null) => void }) {
  const k = KIND[kind];
  const [open, setOpen] = useState(false); const [url, setUrl] = useState(""); const [version, setVersion] = useState(""); const [size, setSize] = useState("");
  const [pending, start] = useTransition();
  const path = url.trim().split("?")[0].split("#")[0];
  const urlOk = /^https:\/\/[^\s/]+\/\S+$/.test(url.trim()) && path.toLowerCase().endsWith(k.ext);
  const taken = rows.some((r) => r.version === version.trim());
  const valid = urlOk && /^\d+(\.\d+){1,3}$/.test(version.trim()) && !taken;
  const onUrl = (v: string) => {
    setUrl(v);
    let name = v.trim().split("?")[0].split("/").pop() || ""; try { name = decodeURIComponent(name); } catch { /* keep it raw */ }
    const found = versionIn(name); if (found) setVersion(found);
  };
  const close = () => { setOpen(false); setUrl(""); setVersion(""); setSize(""); };
  const publish = () => start(async () => {
    onDone(null);
    const v = version.trim();
    const r = await publishLink({ platform: kind, version: v, url, sizeMb: Number(size) || null, notes: "" });
    if ("error" in r) { onDone({ ok: false, text: r.error ?? "Could not publish the link" }); return; }
    onDone({ ok: true, text: `Version ${v} is live from the link — every install screen offers it within a minute.` });
    close();
  });
  return (
    <div className="grid gap-2 border-t border-[var(--color-separator)] pt-3" data-app-file-link>
      {kind === "windows" && <p className="text-[12.5px] text-[var(--color-label-2)]">Bigger than 50 MB? Put it on Cloudflare R2 and paste its public link here.</p>}
      {!open
        ? <button type="button" disabled={!ready} onClick={() => setOpen(true)} className="justify-self-start h-11 px-3.5 rounded-xl inline-flex items-center gap-1.5 text-[13px] font-semibold bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] disabled:opacity-50" data-app-file-link-open><Link2 size={15} aria-hidden /> or paste a download link</button>
        : <div className="grid gap-3">
            <label className="grid gap-1 min-w-0"><span className="text-[12.5px] font-semibold text-[var(--color-label-2)]">Public link to the {k.ext} file</span>
              <input value={url} onChange={(e) => onUrl(e.target.value)} inputMode="url" placeholder={kind === "windows" ? "https://pub-xxxx.r2.dev/DineFlow-Setup-1.1.0.exe" : "https://pub-xxxx.r2.dev/DineFlow-1.0.1.apk"} data-app-file-link-url />
              {url.trim() !== "" && !urlOk && <span className="text-[12px] text-[var(--color-red)]">The link must start with https:// and end in {k.ext}.</span>}</label>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
              <label className="grid gap-1 min-w-0"><span className="text-[12.5px] font-semibold text-[var(--color-label-2)]">Version</span>
                <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.1.0" inputMode="decimal" className="num" data-app-file-link-version />
                {taken && <span className="text-[12px] text-[var(--color-red)]">v{version} is already published — use a new number.</span>}</label>
              <label className="grid gap-1 min-w-0"><span className="text-[12.5px] font-semibold text-[var(--color-label-2)]">Size in MB — optional</span>
                <input value={size} onChange={(e) => setSize(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="78" inputMode="decimal" className="num" data-app-file-link-size /></label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!valid || pending || !ready} onClick={publish} className="btn btn-filled !h-11 !px-5 disabled:opacity-50" data-app-file-link-publish><Link2 size={16} aria-hidden /> {pending ? "Publishing…" : "Publish link"}</button>
              {!pending && <button type="button" onClick={close} className="btn btn-gray !h-11"><X size={15} aria-hidden /> Cancel</button>}
            </div>
          </div>}
    </div>
  );
}

export function AppFilesClient({ rows, ready }: { rows: Release[]; ready: boolean }) {
  return (
    <div className="mt-6 grid gap-4">
      {!ready && <p className="card p-4 text-[13.5px] text-[var(--color-orange)]" data-app-files-not-ready>App files storage is not set up yet — migration 0128 has to be applied before files can be uploaded.</p>}
      <div className="grid gap-4 lg:grid-cols-2" data-app-files>
        <Card kind="android" rows={rows.filter((r) => r.platform === "android")} ready={ready} />
        <Card kind="windows" rows={rows.filter((r) => r.platform === "windows")} ready={ready} />
      </div>
      <div className="card p-4 text-[13px] text-[var(--color-label-2)] grid gap-1" data-app-files-help>
        <b className="text-[var(--color-label)]">One-time Supabase setting.</b>
        <span>Supabase limits every upload to 50 MB (fixed on the Free plan), and the Windows app is about 78 MB. Put that file on <b>Cloudflare R2</b> (free) and use <b>or paste a download link</b> on the Windows card — the steps are in docs/install-builds.md. On a paid Supabase plan you can instead raise <b>Storage → Settings → Upload file size limit</b> to 100 MB and upload it here. The Android app (under 1 MB) uploads without either.</span>
      </div>
    </div>
  );
}

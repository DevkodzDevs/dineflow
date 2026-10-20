"use client";
import { useEffect, useState } from "react";
import { Download, Monitor, Smartphone } from "lucide-react";
import { cn } from "../ui";
import type { Download as File, Downloads } from "@/lib/installers";

/**
 * The app as a file, one click: the Android APK and the Windows installer (2026-10-20 — the owner: "a
 * single-click install option for the .apk and .exe; today there are only the published installs"). Shown by
 * InstallPanel on every install screen — the in-app sheet, /get, Settings and the sign-in page's sheet.
 *
 * Which files exist is the server's answer (/api/download: a hosted release, or the file this machine built),
 * fetched once per page. Since 2026-10-20 a device sees only its own file, and only when it exists (installPlanFor in
 * lib/install.ts); the other platforms' files are listed once, on /get's "Other devices".
 */
let asked: Promise<Downloads | null> | null = null;
export function useDownloads() {
  const [files, setFiles] = useState<Downloads | null>(null);
  useEffect(() => {
    let alive = true;
    asked ??= fetch("/api/download", { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<Downloads>) : null)).catch(() => null);
    void asked.then((d) => { if (alive) setFiles(d ?? { android: null, windows: null }); });
    return () => { alive = false; };
  }, []);
  return files;
}

type Kind = "android" | "windows";
const META: Record<Kind, { title: string; ext: string; Icon: typeof Smartphone; note: string }> = {
  android: { title: "Download for Android", ext: ".apk", Icon: Smartphone, note: "Open the file, allow this browser to install apps once, tap Install" },
  windows: { title: "Download for Windows", ext: ".exe", Icon: Monitor, note: "Run it — it installs and opens by itself. On “Windows protected your PC”: More info → Run anyway" },
};
const mb = (n: number | null) => (n ? `${(n / 1048576).toFixed(n > 10485760 ? 0 : 1)} MB` : null);

/** One file as a button: a real download link, or its greyed slot. `big` is the device's own file, first. */
export function FileButton({ kind, file, big }: { kind: Kind; file: File | null | undefined; big?: boolean }) {
  const m = META[kind];
  const facts = [file?.version && `v${file.version}`, mb(file?.size ?? null)].filter(Boolean).join(" · ");
  const inner = <>
    <span className={cn("grid place-items-center shrink-0 rounded-2xl", big ? "h-12 w-12" : "h-10 w-10",
      file ? (big ? "bg-[color-mix(in_srgb,var(--color-on-tint)_14%,transparent)]" : "bg-[var(--color-fill)] text-[var(--color-tint)]") : "bg-[var(--color-fill)] text-[var(--color-label-3)]")}>
      <m.Icon size={big ? 22 : 18} aria-hidden /></span>
    <span className="flex-1 min-w-0">
      <span className={cn("block font-bold leading-tight", big ? "text-[17px]" : "text-[14.5px]")}>{m.title} <span className={cn("font-semibold", big ? "opacity-75" : "text-[var(--color-label-2)]")}>({m.ext})</span></span>
      <span className={cn("block mt-1 leading-snug", big ? "text-[12.5px] opacity-80" : "text-[12px] text-[var(--color-label-2)]")}>
        {file ? <>{facts && <b className="font-semibold">{facts} · </b>}{m.note}</> : "Coming soon — the build is being prepared"}</span>
    </span>
    {file && <Download size={big ? 20 : 17} aria-hidden className={cn("shrink-0", big ? "opacity-80" : "text-[var(--color-label-2)]")} />}
  </>;
  const cls = cn("w-full flex items-center gap-3.5 text-left rounded-[20px] transition", big ? "px-4 py-4" : "px-3.5 py-3 min-h-14");
  if (!file) return <div className={cn(cls, "border border-dashed border-[var(--color-separator)] text-[var(--color-label-2)] opacity-80")} aria-disabled="true" data-download={kind} data-download-soon>{inner}</div>;
  return (
    <a href={file.url} download={file.file} data-download={kind} rel="noopener"
      className={cn(cls, big ? "bg-[var(--color-tint)] text-[var(--color-on-tint)] hover:brightness-105 active:scale-[.99]" : "border border-[var(--color-separator)] bg-[var(--color-bg-2)] hover:bg-[var(--color-fill)]")}
      style={big ? { boxShadow: "0 16px 34px -20px var(--color-tint)" } : undefined}>{inner}</a>
  );
}

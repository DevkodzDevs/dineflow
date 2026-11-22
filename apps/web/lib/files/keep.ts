import { FILE_MAX } from "./shared";

/**
 * Downloads are kept (0194, 2026-11-23 — the owner: "downloaded files must be saved in folders"). Whatever a screen hands
 * the browser to save — a report, a payroll sheet, a GST file, a customer list — a copy goes to the File Manager:
 * **Downloads → the section's folder → the file**, in the property's space, or Master control's for a page under /admin.
 *
 * It never gets in the way of the download itself: it starts after the browser has the file, says nothing, and gives up
 * quietly — a person who is not the owner or a manager has no File Manager (the server refuses before anything is sent), a
 * property with the add-on off keeps nothing, a file over 50 MB is not kept. A file of the same name replaces the copy.
 */

/** Where a download made on this page is kept, or null when it is not kept. A payslip opened from Home is the person's
 *  own and stays out of a folder the other managers can read; the File Manager's own downloads are already in it. */
export function downloadSection(pathname: string): { master: boolean; section: string } | null {
  const seg = pathname.split(/[?#]/)[0].split("/").filter(Boolean);
  const title = (s: string) => { const w = decodeURIComponent(s).replace(/[-_]+/g, " ").trim().slice(0, 60); return w ? w[0].toUpperCase() + w.slice(1) : ""; };
  if (seg[0] === "admin") return seg[1] === "files" ? null : { master: true, section: title(seg[1] ?? "") || "Master control" };
  if (!seg.length || seg[0] === "home" || seg[0] === "files") return null;
  const section = title(seg[0]);
  return section ? { master: false, section } : null;
}

/** Keep a copy of a file the browser was just handed. Fire and forget. */
export function keepDownload(name: string, blob: Blob, at?: string): void {
  if (typeof window === "undefined" || !name || !blob.size || blob.size > FILE_MAX) return;
  const where = downloadSection(at ?? window.location.pathname);
  if (!where) return;
  void (async () => {
    try {
      const { filesKeepUrl, filesKeepDownload } = await import("./actions");
      const a = await filesKeepUrl(where.master, name, blob.size);
      if ("error" in a) return;
      const { createClient } = await import("@/lib/supabase/client");
      const up = await createClient().storage.from("files").uploadToSignedUrl(a.path, a.token, blob, { contentType: blob.type || "application/octet-stream", cacheControl: "3600" });
      if (up.error) return;
      await filesKeepDownload(where.master, where.section, name, a.path, blob.size, blob.type || null);
    } catch { /* the download itself is done; the copy is a convenience */ }
  })();
}

import { requireAdmin } from "@/lib/auth";
import { FileManager } from "@/components/files/FileManager";
import { filesFolders, filesList } from "@/lib/files/actions";
export const metadata = { title: "File Manager · Master control" };
export const dynamic = "force-dynamic";

/**
 * Master control → File Manager (0192, 2026-11-22 — the owner: "a File Manager in Master control, a real file-manager
 * design: new folder, delete, rename, edit, folders inside folders; the backup of a deleted property goes in a folder
 * there"). Master control's own space of the private `files` bucket. The locked "Deleted properties" folder is written
 * by the delete-property action (admin/actions.ts) — every other folder and file is the master's own.
 */
export default async function AdminFilesPage() {
  await requireAdmin();
  const [l, f] = await Promise.all([filesList(true, null), filesFolders(true)]);
  return (
    <div>
      <div className="eyebrow">Platform</div>
      <h1 className="text-[34px] md:text-[48px] mt-1">File <em>Manager</em></h1>
      <p className="text-sm text-[var(--color-label-2)] mt-2 max-w-2xl">Master control&apos;s own folders and files — and, under <b>Deleted properties</b>, the backup kept of every property deleted from here.</p>
      <div className="mt-6">
        <FileManager master initial={{ listing: "error" in l ? null : l.listing, folders: "error" in f ? [] : f.folders, error: "error" in l ? l.error : null }} />
      </div>
    </div>
  );
}

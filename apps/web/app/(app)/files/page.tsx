import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { modulesFor, landingFor } from "@dineflow/shared";
import { seesFresh } from "@/components/shell/sections";
import { PageHeader } from "@/components/shell/PageHeader";
import { FileManager } from "@/components/files/FileManager";
import { filesFolders, filesList } from "@/lib/files/actions";
export const metadata = { title: "File Manager" };
export const dynamic = "force-dynamic";

/**
 * The owner's File Manager (0192, 2026-11-22 — the owner: "the File Manager in the owner's section too"). The property's
 * own space of the private `files` bucket: the owner and managers, 500 MB. The `files` add-on gates the menu row and this
 * path (features.ts); the page itself asks `seesFresh` like every other fresh row.
 */
export default async function FilesPage() {
  const s = await requireSession();
  const role = s.profile.role;
  if (!seesFresh("files", role, s.profile.department ?? null, s.features)) {
    const mods = modulesFor(s.restaurant.property_type, role, s.restaurant.enabled_modules ?? null, s.profile.allowed_modules ?? null);
    redirect(`/${landingFor(role, mods, s.profile.position ?? null)}`);
  }
  const [l, f] = await Promise.all([filesList(false, null), filesFolders(false)]);
  return (
    <>
      <PageHeader eyebrow="Your property" title="File" accent="Manager" sub="Licences, agreements, menus, photos — kept in your own folders" />
      <FileManager master={false} initial={{ listing: "error" in l ? null : l.listing, folders: "error" in f ? [] : f.folders, error: "error" in l ? l.error : null }} />
    </>
  );
}

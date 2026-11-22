"use server";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { FILE_MAX, TEXT_MAX, isTextFile } from "./shared";

/**
 * File Manager (0192) — the one set of actions behind Master control → File Manager (`master` true: Master control's
 * own space) and the owner's File Manager at /files (the property's space). Every write is a `files_*` function that
 * checks the caller itself; the bucket `files` is private and its policies allow only the space's own folder
 * (`master/…` or `<property id>/…`). A file goes from the browser straight to the bucket on a signed address
 * (a server action's body stops at 2 MB) and is then registered with `filesPut`; a text file under 1 MB can be
 * read and saved here, through the session. Nothing here revalidates the page: the component keeps its own listing, and a
 * server re-render after every click would reset what it holds (the open folders — seen once).
 */
export type FileNode = { id: string; parent_id: string | null; kind: "folder" | "file"; name: string; bytes: number; mime: string | null; locked: boolean; object_path: string | null; bucket?: string; created_at: string; updated_at: string; children?: number };
export type Crumb = { id: string; name: string };
export type Listing = { parent: string | null; path: Crumb[]; items: FileNode[]; used: number; files: number; folders: number; cap: number | null; space: string };
export type Folder = { id: string; parent_id: string | null; name: string; locked: boolean };
type Err = { error: string };

const safeName = (name: string) => (name.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+/, "").slice(0, 80) || "file");
/** The space's own top folder in the bucket. */
async function top(master: boolean): Promise<string> {
  if (master) return "master";
  const session = await requireSession();
  return session.restaurant.id;
}
const fail = (e: { message: string } | null, fallback: string): Err => ({ error: e?.message ? /schema cache|does not exist/i.test(e.message) ? "The File Manager is not on this database yet. It arrives with the next update." : e.message : fallback });

export async function filesList(master: boolean, parent: string | null): Promise<{ ok: true; listing: Listing } | Err> {
  const s = await createClient();
  const { data, error } = await s.rpc("files_list", { p_master: master, p_parent: parent });
  if (error) return fail(error, "Could not read the folder.");
  return { ok: true, listing: data as Listing };
}
export async function filesFolders(master: boolean): Promise<{ ok: true; folders: Folder[] } | Err> {
  const s = await createClient();
  const { data, error } = await s.rpc("files_folders", { p_master: master });
  if (error) return fail(error, "Could not read the folders.");
  return { ok: true, folders: (data ?? []) as Folder[] };
}
export async function filesMkdir(master: boolean, parent: string | null, name: string): Promise<{ ok: true; node: FileNode } | Err> {
  const s = await createClient();
  const { data, error } = await s.rpc("files_mkdir", { p_master: master, p_parent: parent, p_name: name });
  if (error) return fail(error, "Could not make the folder.");
  return { ok: true, node: data as FileNode };
}
export async function filesRename(master: boolean, id: string, name: string): Promise<{ ok: true; node: FileNode } | Err> {
  const s = await createClient();
  const { data, error } = await s.rpc("files_rename", { p_master: master, p_id: id, p_name: name });
  if (error) return fail(error, "Could not rename it.");
  return { ok: true, node: data as FileNode };
}
export async function filesMove(master: boolean, id: string, parent: string | null): Promise<{ ok: true; node: FileNode } | Err> {
  const s = await createClient();
  const { data, error } = await s.rpc("files_move", { p_master: master, p_id: id, p_parent: parent });
  if (error) return fail(error, "Could not move it.");
  return { ok: true, node: data as FileNode };
}
/** Delete folders (with everything inside) and files: the rows go first, then their objects leave the bucket. */
export async function filesDelete(master: boolean, ids: string[]): Promise<{ ok: true; removed: number; files: number } | Err> {
  const s = await createClient();
  const { data, error } = await s.rpc("files_delete", { p_master: master, p_ids: ids });
  if (error) return fail(error, "Could not delete it.");
  const r = data as { removed: number; files: number; paths: string[] };
  for (let i = 0; i < r.paths.length; i += 100) { const { error: e } = await s.storage.from("files").remove(r.paths.slice(i, i + 100)); if (e) console.error("files: object removal", e.message); }
  return { ok: true, removed: r.removed, files: r.files };
}
/** A signed address for the browser to send one file to, inside this space's folder of the bucket. */
export async function filesUploadUrl(master: boolean, name: string, bytes: number): Promise<{ ok: true; path: string; token: string } | Err> {
  if (!Number.isFinite(bytes) || bytes < 0) return { error: "That file could not be read." };
  if (bytes > FILE_MAX) return { error: `That file is ${(bytes / 1048576).toFixed(1)} MB — a file is 50 MB at most.` };
  const s = await createClient();
  const path = `${await top(master)}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}-${safeName(name)}`;
  const signed = await s.storage.from("files").createSignedUploadUrl(path);
  if (signed.error || !signed.data) return { error: /not found|bucket/i.test(signed.error?.message ?? "") ? "The File Manager's storage is not on this database yet. It arrives with the next update." : signed.error?.message ?? "The file could not be sent." };
  return { ok: true, path, token: signed.data.token };
}
/** Register a file the browser has sent; a file of the same name in the folder is replaced. */
export async function filesPut(master: boolean, parent: string | null, name: string, path: string, bytes: number, mime: string | null, replace: string | null = null): Promise<{ ok: true; node: FileNode } | Err> {
  const s = await createClient();
  const { data, error } = await s.rpc("files_put", { p_master: master, p_parent: parent, p_name: name, p_object_path: path, p_bytes: Math.round(bytes), p_mime: mime, p_replace: replace });
  if (error) { await s.storage.from("files").remove([path]).catch(() => null); return fail(error, "Could not keep the file."); }
  const r = data as { node: FileNode; old_path: string | null };
  if (r.old_path) await s.storage.from("files").remove([r.old_path]).catch(() => null);
  return { ok: true, node: r.node };
}
/** A five-minute signed address to open or download a file. */
export async function filesUrl(master: boolean, id: string, download = false): Promise<{ ok: true; url: string; node: FileNode } | Err> {
  const s = await createClient();
  const { data: node, error } = await s.from("file_nodes").select("id, parent_id, kind, name, bytes, mime, locked, object_path, bucket, created_at, updated_at").eq("id", id).maybeSingle();
  if (error) return fail(error, "Could not find the file.");
  if (!node || node.kind !== "file" || !node.object_path) return { error: "That file is not here any more." };
  if (master !== (await isMasterSpace(s, node.object_path))) return { error: "That file is not in this space." };
  const signed = await s.storage.from(node.bucket || "files").createSignedUrl(node.object_path, 300, download ? { download: node.name } : undefined);
  if (signed.error || !signed.data) return { error: signed.error?.message ?? "The file could not be opened." };
  return { ok: true, url: signed.data.signedUrl, node: node as FileNode };
}
const isMasterSpace = async (_s: unknown, path: string) => path.startsWith("master/");
/** The words of a text file (1 MB at most), for the editor. */
export async function filesText(master: boolean, id: string): Promise<{ ok: true; text: string; node: FileNode } | Err> {
  const s = await createClient();
  const { data: node, error } = await s.from("file_nodes").select("id, parent_id, kind, name, bytes, mime, locked, object_path, bucket, created_at, updated_at").eq("id", id).maybeSingle();
  if (error) return fail(error, "Could not find the file.");
  if (!node || node.kind !== "file" || !node.object_path) return { error: "That file is not here any more." };
  if (master !== node.object_path.startsWith("master/")) return { error: "That file is not in this space." };
  if (!isTextFile(node.name, node.mime)) return { error: "Only a text file can be edited here." };
  if (Number(node.bytes) > TEXT_MAX) return { error: "A text file over 1 MB is downloaded, not edited here." };
  const { data, error: e } = await s.storage.from(node.bucket || "files").download(node.object_path);
  if (e || !data) return { error: e?.message ?? "The file could not be read." };
  return { ok: true, text: await data.text(), node: node as FileNode };
}
/** Save the editor's words as the file: a new object, the row re-pointed, the old object removed. */
export async function filesSaveText(master: boolean, id: string, text: string): Promise<{ ok: true; node: FileNode } | Err> {
  if (typeof text !== "string") return { error: "Nothing to save." };
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > TEXT_MAX) return { error: "A text file over 1 MB cannot be saved here." };
  const s = await createClient();
  const { data: node, error } = await s.from("file_nodes").select("name, mime, object_path").eq("id", id).maybeSingle();
  if (error || !node?.object_path) return { error: "That file is not here any more." };
  const path = `${await top(master)}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}-${safeName(node.name)}`;
  const up = await s.storage.from("files").upload(path, Buffer.from(text, "utf8"), { contentType: node.mime ?? "text/plain; charset=utf-8", upsert: false });
  if (up.error) return { error: up.error.message };
  return filesPut(master, null, node.name, path, bytes, node.mime ?? "text/plain", id);
}
/** Make a small text file in a folder (a note, a list). */
export async function filesNewText(master: boolean, parent: string | null, name: string, text = ""): Promise<{ ok: true; node: FileNode } | Err> {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > TEXT_MAX) return { error: "A text file over 1 MB cannot be made here." };
  const nm = name.trim(); if (!nm) return { error: "Give it a name." };
  const s = await createClient();
  const path = `${await top(master)}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}-${safeName(nm)}`;
  const mime = /\.md$/i.test(nm) ? "text/markdown" : /\.json$/i.test(nm) ? "application/json" : /\.csv$/i.test(nm) ? "text/csv" : "text/plain";
  const up = await s.storage.from("files").upload(path, Buffer.from(text, "utf8"), { contentType: `${mime}; charset=utf-8`, upsert: false });
  if (up.error) return { error: /not found|bucket/i.test(up.error.message) ? "The File Manager's storage is not on this database yet. It arrives with the next update." : up.error.message };
  return filesPut(master, parent, nm, path, bytes, mime);
}

/** Bring the property's locked **Uploads** folder up to date (0194): every dish photo, the logo, the website's photos and
 *  film, the tax documents, the punch photos and the help requests' screenshots, each kind in its own folder — rows that
 *  point at the objects where they already are. Called when /files opens and on Refresh; quiet where 0194 is not applied. */
export async function filesSyncUploads(): Promise<{ ok: true; added: number; removed: number } | Err> {
  const s = await createClient();
  const { data, error } = await s.rpc("files_sync_uploads");
  if (error) return fail(error, "Could not read the uploads.");
  const r = data as { added: number; removed: number };
  return { ok: true, added: r.added, removed: r.removed };
}
/** Keep a copy of a file the app has just handed the browser (0194): Downloads → the section's folder → the file. The
 *  browser sent it to this space's folder on `filesUploadUrl`'s signed address first. A file of the same name is replaced. */
export async function filesKeepDownload(master: boolean, section: string, name: string, path: string, bytes: number, mime: string | null): Promise<{ ok: true; node: FileNode } | Err> {
  const s = await createClient();
  const { data, error } = await s.rpc("files_keep_download", { p_master: master, p_section: section, p_name: name, p_object_path: path, p_bytes: Math.round(bytes), p_mime: mime });
  if (error) { await s.storage.from("files").remove([path]).catch(() => null); return fail(error, "Could not keep the download."); }
  const r = data as { node: FileNode; old_path: string | null };
  if (r.old_path) await s.storage.from("files").remove([r.old_path]).catch(() => null);
  return { ok: true, node: r.node };
}
/** A signed address for a download's copy — only for someone who has this File Manager (the owner or a manager with the
 *  add-on on; the master for Master control's): asked first, so nobody else's browser sends a file that would be refused. */
export async function filesKeepUrl(master: boolean, name: string, bytes: number): Promise<{ ok: true; path: string; token: string } | Err> {
  const s = await createClient();
  if (!master) { const { data: on } = await s.rpc("has_feature", { p_key: "files" }); if (on === false) return { error: "The File Manager is off for this property." }; }
  const { error } = await s.rpc("files_folders", { p_master: master });
  if (error) return fail(error, "No File Manager here.");
  return filesUploadUrl(master, name, bytes);
}

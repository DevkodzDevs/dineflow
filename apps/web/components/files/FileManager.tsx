"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, CloudUpload, Download, File, FileArchive, FileCode, FileImage, FilePlus2, FileSpreadsheet, FileText, Film, Folder, FolderInput, FolderOpen, FolderPlus, HardDrive, Home, LayoutGrid, List, Lock, MoreHorizontal, Music, Pencil, Plus, RefreshCw, Save, Search, Trash2, Upload, X, type LucideIcon } from "lucide-react";
import { Button, Sheet, ask, cn } from "@/components/ui";
import { fmtBytes } from "@/lib/backup/bytes";
import { filesDelete, filesFolders, filesList, filesMkdir, filesMove, filesNewText, filesPut, filesRename, filesSaveText, filesSyncUploads, filesText, filesUploadUrl, filesUrl, type FileNode, type Folder as FolderRow, type Listing } from "@/lib/files/actions";
import { isTextFile, FILE_MAX } from "@/lib/files/shared";
import s from "./FileManager.module.css";

/**
 * The File Manager (0192) — Master control's own space (`master`) and the owner's (/files) draw the same thing.
 * The look (2026-11-25, the owner: "ultra modern, like the main apps' file managers") is one window: a sidebar from 1024px
 * (the folder tree and a storage card), a toolbar (Upload · New ▾ · search · sort · list / grid · refresh), and a pane with
 * its own path bar, the folder's rows (list) or folder cards and file cards (grid, Drive-style), an empty view that is a
 * drop zone, and a status foot. The selection and the upload progress float at the bottom of the window. A file's kind has
 * its own colour (folder amber, picture violet, PDF red, sheet green…). Keys: `/` search, Esc clear, Delete, Ctrl+A.
 * Everything is a `files_*` call that checks the caller; nothing here trusts the id it holds. The page hands the first
 * listing and the folders so there is no empty flash.
 */
export type FileManagerProps = { master: boolean; initial: { listing: Listing | null; folders: FolderRow[]; error: string | null } };
type Dialog = { kind: "mkdir" } | { kind: "newtext" } | { kind: "rename"; node: FileNode } | { kind: "move"; ids: string[] } | { kind: "preview"; node: FileNode; url: string | null } | { kind: "edit"; node: FileNode; text: string; was: string } | null;
type Job = { id: number; name: string; pct: number; done: boolean; error: string | null };
type Kind = "folder" | "image" | "pdf" | "video" | "audio" | "sheet" | "archive" | "code" | "text" | "file";

const whenIST = (iso: string | null | undefined) => {
  if (!iso) return "";
  try { return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).replace(",", ""); } catch { return iso.slice(0, 16).replace("T", " "); }
};
const kindOf = (n: FileNode): Kind => {
  if (n.kind === "folder") return "folder";
  const m = n.mime ?? "", x = n.name.toLowerCase();
  if (/^image\//.test(m) || /\.(png|jpe?g|webp|gif|svg|avif|heic)$/.test(x)) return "image";
  if (m === "application/pdf" || /\.pdf$/.test(x)) return "pdf";
  if (/^video\//.test(m) || /\.(mp4|webm|mov|m4v)$/.test(x)) return "video";
  if (/^audio\//.test(m) || /\.(mp3|m4a|wav|ogg|aac)$/.test(x)) return "audio";
  if (/spreadsheet|excel|csv/.test(m) || /\.(xlsx?|csv|tsv|ods)$/.test(x)) return "sheet";
  if (/zip|gzip|tar|7z|rar|compressed/.test(m) || /\.(zip|gz|tgz|7z|rar|tar)$/.test(x)) return "archive";
  if (/\.(js|ts|tsx|jsx|py|sql|json|xml|yml|yaml|html?|css|sh|ps1|bat)$/.test(x)) return "code";
  if (isTextFile(n.name, n.mime)) return "text";
  return "file";
};
const GLYPH: Record<Kind, LucideIcon> = { folder: Folder, image: FileImage, pdf: FileText, video: Film, audio: Music, sheet: FileSpreadsheet, archive: FileArchive, code: FileCode, text: FileText, file: File };
/** The kind's icon in its own colour (`data-k` picks the hue in the CSS), filled faintly — duotone, as Drive and Finder draw them. A kept node wears a lock badge. */
const Icon = ({ n, open, size = "md" }: { n: FileNode; open?: boolean; size?: "md" | "lg" }) => {
  const k = kindOf(n);
  const I = k === "folder" && open ? FolderOpen : GLYPH[k];
  return (
    <span className={cn(s.ico, size === "lg" && s.lg)} data-k={k}>
      <I size={size === "lg" ? 30 : 18} strokeWidth={1.8} fill="currentColor" fillOpacity={0.16} />
      {n.locked && <span className={s.badge} title="Kept by DineFlow"><Lock size={size === "lg" ? 11 : 9} strokeWidth={2.6} /></span>}
    </span>
  );
};
/** An upload made elsewhere in the app (0194): which screen it belongs to — it is changed there, not here. */
const UPLOAD_WORD: Record<string, string> = { menu: "Menu photo", brand: "Logo", site: "Website", compliance: "Tax document", attendance: "Punch photo", support: "Help request" };
const typeWord = (n: FileNode) => n.kind === "folder" ? (n.locked ? "Kept folder" : "Folder") : n.bucket && n.bucket !== "files" ? UPLOAD_WORD[n.bucket] ?? "Upload" : ({ image: "Image", pdf: "PDF", video: "Video", audio: "Sound", sheet: "Sheet", archive: "Archive", code: "Code", text: "Text", file: "File", folder: "Folder" } as const)[kindOf(n)];
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function FileManager({ master, initial }: FileManagerProps) {
  const [listing, setListing] = useState<Listing | null>(initial.listing);
  const [folders, setFolders] = useState<FolderRow[]>(initial.folders);
  const [err, setErr] = useState<string | null>(initial.error);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"list" | "grid">("list");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"name" | "newest" | "size">("name");
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [open, setOpen] = useState<Set<string>>(() => new Set((initial.listing?.path ?? []).map((c) => c.id)));
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [drop, setDrop] = useState(false);
  const [over, setOver] = useState<string | null>(null);   // the folder a dragged row hangs over ("" = the top)
  const [name, setName] = useState("");
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const jobId = useRef(0);
  const cur = listing?.parent ?? null;
  const unavailable = !!err && /not on this database/i.test(err);

  /* ── reading ─────────────────────────────────────────────────────────────────────────────────── */
  const load = useCallback(async (parent: string | null, keepSel = false) => {
    setBusy(true);
    const [l, f] = await Promise.all([filesList(master, parent), filesFolders(master)]);
    setBusy(false);
    if ("error" in l) { setErr(l.error); return; }
    setErr(null); setListing(l.listing); if (!("error" in f)) setFolders(f.folders);
    if (!keepSel) setSel(new Set());
    setOpen((o) => { const n = new Set(o); for (const c of l.listing.path) n.add(c.id); return n; });
  }, [master]);
  const go = (parent: string | null) => { setQ(""); void load(parent); };
  useEffect(() => { const close = () => { setMenu(null); setNewOpen(false); }; window.addEventListener("click", close); window.addEventListener("scroll", close, true); return () => { window.removeEventListener("click", close); window.removeEventListener("scroll", close, true); }; }, []);

  const items = useMemo(() => {
    const all = listing?.items ?? []; const k = q.trim().toLowerCase();
    const hit = k ? all.filter((n) => n.name.toLowerCase().includes(k)) : [...all];
    const by = sort === "newest" ? (a: FileNode, b: FileNode) => b.updated_at.localeCompare(a.updated_at) : sort === "size" ? (a: FileNode, b: FileNode) => Number(b.bytes) - Number(a.bytes) : (a: FileNode, b: FileNode) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    return hit.sort((a, b) => (a.kind === b.kind ? by(a, b) : a.kind === "folder" ? -1 : 1));   // folders first, always
  }, [listing, q, sort]);
  /* the grid shows a picture's own thumbnail: one signed address per picture, fetched when the grid is open, kept for the visit */
  useEffect(() => {
    if (view !== "grid") return;
    const want = (listing?.items ?? []).filter((n) => n.kind === "file" && kindOf(n) === "image" && !thumbs[n.id]).slice(0, 40);
    if (!want.length) return;
    let gone = false;
    (async () => { for (const n of want) { const r = await filesUrl(master, n.id, false); if (gone) return; if (!("error" in r)) setThumbs((t) => ({ ...t, [n.id]: r.url })); } })();
    return () => { gone = true; };
  }, [view, listing, master, thumbs]);
  const byId = useMemo(() => new Map((listing?.items ?? []).map((n) => [n.id, n])), [listing]);
  const selected = [...sel].map((id) => byId.get(id)).filter(Boolean) as FileNode[];
  const children = useMemo(() => { const m = new Map<string | null, FolderRow[]>(); for (const f of folders) { const a = m.get(f.parent_id) ?? []; a.push(f); m.set(f.parent_id, a); } return m; }, [folders]);
  const subtree = useCallback((id: string): Set<string> => { const out = new Set<string>([id]); const walk = (p: string) => { for (const c of children.get(p) ?? []) { out.add(c.id); walk(c.id); } }; walk(id); return out; }, [children]);
  const curLocked = cur !== null && !!folders.find((f) => f.id === cur)?.locked;

  /* ── writes ──────────────────────────────────────────────────────────────────────────────────── */
  const run = async (fn: () => Promise<{ error?: string } | { ok: true }>, after?: () => void) => {
    setBusy(true); setErr(null);
    const r = await fn(); setBusy(false);
    if ("error" in r && r.error) { setErr(r.error); return false; }
    after?.(); return true;
  };
  const mkdir = () => run(() => filesMkdir(master, cur, name), () => { setDialog(null); setName(""); void load(cur); });
  const newText = () => run(() => filesNewText(master, cur, /\.[a-z0-9]+$/i.test(name.trim()) ? name.trim() : `${name.trim()}.txt`), () => { setDialog(null); setName(""); void load(cur); });
  const rename = (node: FileNode) => run(() => filesRename(master, node.id, name), () => { setDialog(null); setName(""); void load(cur); });
  const move = (ids: string[], to: string | null) => run(async () => { for (const id of ids) { const r = await filesMove(master, id, to); if ("error" in r) return r; } return { ok: true as const }; }, () => { setDialog(null); void load(cur); });
  const remove = async (nodes: FileNode[]) => {
    if (!nodes.length) return;
    const folders = nodes.filter((n) => n.kind === "folder").length, files = nodes.length - folders;
    const what = [folders ? `${folders} folder${folders === 1 ? "" : "s"} and everything inside` : "", files ? `${files} file${files === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ");
    if (!(await ask({ title: `Delete ${nodes.length === 1 ? `“${nodes[0].name}”` : what}?`, body: nodes.length === 1 ? `${nodes[0].kind === "folder" ? "The folder and everything inside it go" : "The file goes"} for good. This cannot be undone.` : "They go for good. This cannot be undone.", ok: "Delete", icon: "trash", tone: "danger" }))) return;
    await run(() => filesDelete(master, nodes.map((n) => n.id)), () => void load(cur));
  };
  const download = async (node: FileNode) => { const r = await filesUrl(master, node.id, true); if ("error" in r) { setErr(r.error); return; } window.open(r.url, "_blank", "noopener"); };
  const openNode = async (node: FileNode) => {
    if (node.kind === "folder") { go(node.id); return; }
    const k = kindOf(node);
    if ((k === "text" || k === "code") && Number(node.bytes) <= 1048576) { setBusy(true); const r = await filesText(master, node.id); setBusy(false); if ("error" in r) { setErr(r.error); return; } setDialog({ kind: "edit", node, text: r.text, was: r.text }); return; }
    setDialog({ kind: "preview", node, url: null });
    const r = await filesUrl(master, node.id, false); if ("error" in r) { setErr(r.error); setDialog(null); return; } setDialog({ kind: "preview", node, url: r.url });
  };
  const saveText = (node: FileNode, text: string) => run(() => filesSaveText(master, node.id, text), () => { setDialog(null); void load(cur, true); });
  const startRename = (n: FileNode) => { setMenu(null); setName(n.name); setDialog({ kind: "rename", node: n }); };
  const startMove = (ids: string[]) => { setMenu(null); setMoveTo(cur); setDialog({ kind: "move", ids }); };
  const newFolder = () => { setNewOpen(false); setName(""); setDialog({ kind: "mkdir" }); };
  const newTextFile = () => { setNewOpen(false); setName(""); setDialog({ kind: "newtext" }); };
  const pickFiles = () => { setNewOpen(false); fileInput.current?.click(); };
  const refresh = () => void (async () => { if (!master) { setBusy(true); await filesSyncUploads(); } await load(cur, true); })();

  /* ── uploads: each file to the bucket on its signed address, then registered; progress per file ─ */
  const upload = async (files: FileList | File[] | null, parent: string | null = cur) => {
    const list = [...(files ?? [])]; if (!list.length) return;
    const { createClient } = await import("@/lib/supabase/client"); const sb = createClient();
    for (const f of list) {
      const id = ++jobId.current; setJobs((j) => [...j, { id, name: f.name, pct: 0, done: false, error: null }]);
      const fail = (m: string) => setJobs((j) => j.map((x) => x.id === id ? { ...x, error: m, done: true } : x));
      if (f.size > FILE_MAX) { fail(`${fmtBytes(f.size)} — a file is 50 MB at most`); continue; }
      const a = await filesUploadUrl(master, f.name, f.size);
      if ("error" in a) { fail(a.error); continue; }
      setJobs((j) => j.map((x) => x.id === id ? { ...x, pct: 15 } : x));
      const up = await sb.storage.from("files").uploadToSignedUrl(a.path, a.token, f, { contentType: f.type || "application/octet-stream", cacheControl: "3600" });
      if (up.error) { fail(up.error.message); continue; }
      setJobs((j) => j.map((x) => x.id === id ? { ...x, pct: 85 } : x));
      const r = await filesPut(master, parent, f.name, a.path, f.size, f.type || null);
      if ("error" in r) { fail(r.error); continue; }
      setJobs((j) => j.map((x) => x.id === id ? { ...x, pct: 100, done: true } : x));
    }
    await load(parent, true);
    setTimeout(() => setJobs((j) => j.filter((x) => x.error)), 2500);
  };

  /* ── drag & drop: desk files onto the pane; a row onto a folder row or tree node ─────────────── */
  const dragRow = (e: DragEvent, node: FileNode) => { const ids = sel.has(node.id) ? [...sel] : [node.id]; e.dataTransfer.setData("application/x-dineflow-nodes", JSON.stringify(ids)); e.dataTransfer.effectAllowed = "move"; };
  const canDropOn = (e: DragEvent) => e.dataTransfer.types.includes("application/x-dineflow-nodes") || e.dataTransfer.types.includes("Files");
  const dropOn = async (e: DragEvent, folder: string | null) => {
    e.preventDefault(); e.stopPropagation(); setOver(null); setDrop(false);
    const raw = e.dataTransfer.getData("application/x-dineflow-nodes");
    if (raw) { const ids = (JSON.parse(raw) as string[]).filter((id) => id !== folder && !(folder && byId.get(id)?.kind === "folder" && subtree(id).has(folder))); if (ids.length && (folder ?? null) !== cur) await move(ids, folder); return; }
    if (e.dataTransfer.files?.length) await upload(e.dataTransfer.files, folder);
  };

  /* ── keys, as every desktop file manager has them: / search · Esc clear · Delete · Ctrl+A ───────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (dialog || document.querySelector("[data-ask], [role='dialog']") || (t instanceof Element && t.closest("input, textarea, select, [contenteditable='true']"))) return;
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === "Escape") { setMenu(null); setNewOpen(false); setSel(new Set()); }
      else if (e.key === "Delete" && selected.length && selected.every((n) => !n.locked)) { e.preventDefault(); void remove(selected); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && items.length) { e.preventDefault(); setSel(new Set(items.map((n) => n.id))); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ── pieces ──────────────────────────────────────────────────────────────────────────────────── */
  const toggle = (id: string) => setSel((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = items.length > 0 && items.every((n) => sel.has(n.id));
  const someOn = !allOn && items.some((n) => sel.has(n.id));
  const Tree = ({ parent, depth }: { parent: string | null; depth: number }): ReactNode => {
    const list = children.get(parent) ?? [];
    if (!list.length) return null;
    return (<ul>{list.map((f) => { const kids = (children.get(f.id) ?? []).length > 0, isOpen = open.has(f.id); return (
      <li key={f.id}>
        <div className={s.node}>
          <button type="button" className={cn(s.twist, !kids && s.none)} aria-label={isOpen ? `Fold ${f.name}` : `Unfold ${f.name}`} onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; })}><ChevronRight size={14} className={cn(s.chev, isOpen && s.chevOpen)} /></button>
          <button type="button" className={cn(s.leaf, over === f.id && s.over)} aria-current={cur === f.id ? "true" : undefined} onClick={() => go(f.id)} data-tree-folder={f.id}
            onDragOver={(e) => { if (canDropOn(e)) { e.preventDefault(); setOver(f.id); } }} onDragLeave={() => setOver((o) => (o === f.id ? null : o))} onDrop={(e) => void dropOn(e, f.id)}>
            <span className={s.leafIco} data-k="folder">{cur === f.id ? <FolderOpen size={16} fill="currentColor" fillOpacity={0.16} /> : <Folder size={16} fill="currentColor" fillOpacity={0.16} />}{f.locked && <span className={s.badge}><Lock size={8} strokeWidth={2.8} /></span>}</span><span className={s.leafName}>{f.name}</span>
          </button>
        </div>
        {kids && isOpen && depth < 12 && <Tree parent={f.id} depth={depth + 1} />}
      </li>); })}</ul>);
  };
  const Pick = ({ parent, depth, blocked }: { parent: string | null; depth: number; blocked: Set<string> }): ReactNode => (children.get(parent) ?? []).map((f) => blocked.has(f.id) ? null : (
    <div key={f.id} style={{ paddingLeft: depth * 16 }}>
      <button type="button" className={s.leaf} aria-current={moveTo === f.id ? "true" : undefined} onClick={() => setMoveTo(f.id)} data-pick-folder={f.id}><span className={s.leafIco} data-k="folder"><Folder size={16} fill="currentColor" fillOpacity={0.16} /></span><span className={s.leafName}>{f.name}</span></button>
      <Pick parent={f.id} depth={depth + 1} blocked={blocked} />
    </div>));
  const rowMenu = (n: FileNode) => (
    <div className={s.menu} style={{ right: Math.max(8, menu!.x), top: menu!.y }} role="menu" data-row-menu onClick={(e) => e.stopPropagation()}>
      <div className={s.menuHead}><Icon n={n} /><span><b>{n.name}</b><small>{n.kind === "folder" ? plural(n.children ?? 0, "item") : `${fmtBytes(n.bytes)} · ${typeWord(n)}`}</small></span></div>
      <button type="button" role="menuitem" onClick={() => { setMenu(null); void openNode(n); }}>{n.kind === "folder" ? <FolderOpen size={16} /> : (kindOf(n) === "text" || kindOf(n) === "code") ? <Pencil size={16} /> : <FileText size={16} />} {n.kind === "folder" ? "Open" : (kindOf(n) === "text" || kindOf(n) === "code") ? "Edit" : "Preview"}</button>
      {n.kind === "file" && <button type="button" role="menuitem" onClick={() => { setMenu(null); void download(n); }}><Download size={16} /> Download</button>}
      {!n.locked && <button type="button" role="menuitem" onClick={() => startRename(n)}><Pencil size={16} /> Rename</button>}
      {!n.locked && <button type="button" role="menuitem" onClick={() => startMove([n.id])}><FolderInput size={16} /> Move to…</button>}
      {!n.locked && <><hr /><button type="button" role="menuitem" className={s.danger} onClick={() => { setMenu(null); void remove([n]); }}><Trash2 size={16} /> Delete</button></>}
    </div>);
  const moreBtn = (n: FileNode) => <button type="button" className={s.more} aria-label={`More for ${n.name}`} onClick={(e) => { e.stopPropagation(); setNewOpen(false); /* the menu hangs in the pane, so it is placed in the pane's own coordinates (it was given the screen's, and opened offset by the pane's corner) — by its right edge, under the ⋯, whatever its width */
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect(), p = paneRef.current?.getBoundingClientRect(); setMenu(menu?.id === n.id ? null : { id: n.id, x: (p?.right ?? window.innerWidth) - r.right, y: r.bottom - (p?.top ?? 0) + 6 }); }}><MoreHorizontal size={18} /></button>;
  const box = (on: boolean, some = false) => <span className={cn(s.box, (on || some) && s.boxOn)}>{on ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.5l2.5 2.5 4.5-5" /></svg> : some ? <i /> : null}</span>;
  const checkBtn = (n: FileNode) => <button type="button" role="checkbox" aria-checked={sel.has(n.id)} aria-label={`Select ${n.name}`} className={s.check} onClick={(e) => { e.stopPropagation(); toggle(n.id); }}>{box(sel.has(n.id))}</button>;
  /* a row's quick keys, shown on hover on a desk (Drive's hover actions) — the ⋯ menu carries the same on touch */
  const quick = (n: FileNode) => (
    <span className={s.quick}>
      {n.kind === "file" && <button type="button" aria-label={`Download ${n.name}`} title="Download" onClick={(e) => { e.stopPropagation(); void download(n); }}><Download size={16} /></button>}
      {!n.locked && <button type="button" aria-label={`Rename ${n.name}`} title="Rename" onClick={(e) => { e.stopPropagation(); startRename(n); }}><Pencil size={16} /></button>}
      {!n.locked && <button type="button" aria-label={`Move ${n.name}`} title="Move to…" onClick={(e) => { e.stopPropagation(); startMove([n.id]); }}><FolderInput size={16} /></button>}
      {!n.locked && <button type="button" className={s.danger} aria-label={`Delete ${n.name}`} title="Delete" onClick={(e) => { e.stopPropagation(); void remove([n]); }}><Trash2 size={16} /></button>}
    </span>);
  const dragProps = (n: FileNode) => ({
    draggable: !n.locked, onDragStart: (e: DragEvent) => dragRow(e, n),
    onDragOver: n.kind === "folder" ? (e: DragEvent) => { if (canDropOn(e)) { e.preventDefault(); e.stopPropagation(); setOver(n.id); } } : undefined,
    onDragLeave: n.kind === "folder" ? () => setOver((o) => (o === n.id ? null : o)) : undefined,
    onDrop: n.kind === "folder" ? (e: DragEvent) => void dropOn(e, n.id) : undefined,
  });
  const sortHead = (key: typeof sort, label: string, cls?: string) => (
    <button type="button" className={cn(s.hcell, sort === key && s.hcellOn, cls)} onClick={() => setSort(key)} aria-pressed={sort === key} title={`Sort by ${key === "newest" ? "newest" : key === "size" ? "largest" : "name"}`}>
      {label}{sort === key ? (key === "name" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : null}
    </button>);

  const title = master ? "Master control's files" : "Your files";
  const here = listing?.path.at(-1)?.name ?? title;
  const used = listing?.used ?? 0, cap = listing?.cap ?? null, pct = cap ? Math.min(100, (100 * used) / cap) : 0;
  const folderItems = items.filter((n) => n.kind === "folder"), fileItems = items.filter((n) => n.kind === "file");
  const live = jobs.filter((j) => !j.done).length, bad = jobs.filter((j) => j.error).length;
  if (unavailable) return <div className={cn(s.err, "mt-4")} data-files-unavailable>{err}</div>;

  return (
    <div className={s.fm} data-file-manager={master ? "master" : "property"} data-busy={busy ? "1" : "0"} data-picking={sel.size ? "1" : "0"}>
      {/* toolbar */}
      <div className={s.bar}>
        <div className={s.actions}>
          <button type="button" className={cn(s.tool, s.primary)} onClick={pickFiles} data-fm-upload><Upload size={17} /> Upload</button>
          <span className={s.newWrap}>
            <button type="button" className={s.tool} aria-haspopup="menu" aria-expanded={newOpen} onClick={(e) => { e.stopPropagation(); setMenu(null); setNewOpen((o) => !o); }} data-fm-new><Plus size={17} /> New <ChevronDown size={15} className={cn(s.chev, newOpen && s.chevFlip)} /></button>
            {newOpen && (
              <div className={cn(s.menu, s.newMenu)} role="menu" onClick={(e) => e.stopPropagation()} data-fm-new-menu>
                <button type="button" role="menuitem" onClick={newFolder} data-fm-new-folder><span className={s.ico} data-k="folder"><FolderPlus size={17} /></span><span><b>Folder</b><small>Inside {here}</small></span></button>
                <button type="button" role="menuitem" onClick={newTextFile} data-fm-new-text><span className={s.ico} data-k="text"><FilePlus2 size={17} /></span><span><b>Text file</b><small>.txt, .md, .csv or .json</small></span></button>
                <hr />
                <button type="button" role="menuitem" onClick={pickFiles}><span className={s.ico} data-k="image"><CloudUpload size={17} /></span><span><b>Upload files</b><small>Up to {fmtBytes(FILE_MAX)} each</small></span></button>
              </div>)}
          </span>
          <input ref={fileInput} type="file" multiple hidden style={{ display: "none" }} onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} data-fm-file-input />
        </div>
        <div className={s.finder}>
          <label className={s.search}>
            <Search size={16} />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); e.currentTarget.blur(); } }} placeholder={cur === null ? "Search files" : `Search ${here}`} aria-label="Search this folder" data-fm-search />
            {q ? <button type="button" className={s.clear} aria-label="Clear the search" onClick={() => { setQ(""); searchRef.current?.focus(); }}><X size={14} /></button> : <kbd className={s.kbd}>/</kbd>}
          </label>
          <span className={s.sort}><ArrowUpDown size={15} className={s.sortIco} /><select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort by" data-fm-sort><option value="name">Name</option><option value="newest">Newest</option><option value="size">Largest</option></select><ChevronDown size={14} className={s.sortChev} /></span>
          <span className={s.seg} role="group" aria-label="View" data-no-busy>
            <button type="button" aria-pressed={view === "list"} aria-label="List" title="List" onClick={() => setView("list")}><List size={17} /></button>
            <button type="button" aria-pressed={view === "grid"} aria-label="Grid" title="Grid" onClick={() => setView("grid")}><LayoutGrid size={17} /></button>
          </span>
          <button type="button" className={cn(s.tool, s.icon)} aria-label="Refresh" title="Refresh" onClick={refresh} data-fm-refresh><RefreshCw size={16} className={busy ? "animate-spin" : undefined} /></button>
        </div>
      </div>
      {err && <div className={s.err} role="alert" data-fm-error><span>{err}</span><button type="button" aria-label="Dismiss" onClick={() => setErr(null)}><X size={15} /></button></div>}

      <div className={s.shell}>
        {/* the sidebar: the tree, and the space's storage */}
        <nav className={s.tree} aria-label="Folders" data-fm-tree>
          <div className={s.treeHead}><span>Folders</span><b>{listing?.folders ?? 0}</b></div>
          <div className={s.treeBody}>
            <div className={s.node}><span className={cn(s.twist, s.none)} /><button type="button" className={cn(s.leaf, over === "" && s.over)} aria-current={cur === null ? "true" : undefined} onClick={() => go(null)} data-tree-folder="top"
              onDragOver={(e) => { if (canDropOn(e)) { e.preventDefault(); setOver(""); } }} onDragLeave={() => setOver((o) => (o === "" ? null : o))} onDrop={(e) => void dropOn(e, null)}><span className={s.leafIco} data-k="home"><Home size={16} /></span><span className={s.leafName}>{title}</span></button></div>
            <Tree parent={null} depth={0} />
          </div>
          <div className={s.store} data-fm-storage>
            <div className={s.storeHead}><span className={s.storeIco}><HardDrive size={16} /></span><span>Storage</span>{cap ? <em>{Math.round(pct)}%</em> : null}</div>
            <div className={s.storeBig}><b>{fmtBytes(used)}</b><span>{cap ? ` of ${fmtBytes(cap)}` : " in use"}</span></div>
            {cap ? <span className={s.meter}><i style={{ width: `${Math.max(pct, used > 0 ? 2 : 0)}%` }} /></span> : null}
            <small>{plural(listing?.files ?? 0, "file")} · {plural(listing?.folders ?? 0, "folder")}</small>
          </div>
        </nav>

        <div ref={paneRef} className={cn(s.pane, drop && s.drop)} data-fm-pane
          onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDrop(true); } else if (canDropOn(e)) e.preventDefault(); }}
          onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDrop(false); }}
          onDrop={(e) => void dropOn(e, cur)}>
          {/* the path bar */}
          <div className={s.pathBar}>
            <button type="button" className={s.back} aria-label="Up one folder" disabled={cur === null} onClick={() => go(listing?.path.at(-2)?.id ?? null)} data-fm-up><ArrowLeft size={17} /></button>
            <div className={s.crumbs} aria-label="Where you are" data-fm-crumbs>
              <button type="button" className={s.crumb} aria-current={cur === null ? "page" : undefined} onClick={() => go(null)}><Home size={15} /><span>{title}</span></button>
              {(listing?.path ?? []).map((c, i, a) => (<span key={c.id} className={s.crumbStep}><ChevronRight size={14} className={s.sep} /><button type="button" className={s.crumb} aria-current={i === a.length - 1 ? "page" : undefined} onClick={() => go(c.id)}>{i === a.length - 1 && curLocked && <Lock size={13} />}<span>{c.name}</span></button></span>))}
            </div>
            <span className={s.count} data-fm-count>{plural(items.length, "item")}{q ? " found" : ""}</span>
          </div>

          {items.length === 0 ? (
            <div className={s.empty} data-fm-empty>
              <div className={s.emptyArt} aria-hidden><span className={s.emptyBack} /><span className={s.emptyIco} data-k="folder">{q ? <Search size={30} /> : <FolderOpen size={32} fill="currentColor" fillOpacity={0.16} />}</span>{!q && !curLocked && <span className={s.emptyBadge}><CloudUpload size={15} /></span>}</div>
              <b>{q ? "Nothing matches" : curLocked ? "Nothing here yet" : "This folder is empty"}</b>
              <span>{q ? `Nothing named “${q.trim()}”` : curLocked && master && here === "Deleted properties" ? "Backups of deleted properties" : curLocked ? "Kept by DineFlow" : "Drop files here"}</span>
              {q ? <button type="button" className={s.tool} onClick={() => setQ("")}><X size={16} /> Clear the search</button>
                : !curLocked && <div className={s.emptyActs}><button type="button" className={cn(s.tool, s.primary)} onClick={pickFiles}><Upload size={16} /> Upload files</button><button type="button" className={s.tool} onClick={newFolder}><FolderPlus size={16} /> New folder</button></div>}
            </div>
          ) : view === "list" ? (
            <div role="grid" aria-label="Files" className={s.list}>
              <div className={s.head}>
                <button type="button" role="checkbox" aria-checked={allOn ? true : someOn ? "mixed" : false} aria-label="Select all" className={s.check} onClick={() => setSel(allOn ? new Set() : new Set(items.map((n) => n.id)))}>{box(allOn, someOn)}</button>
                {sortHead("name", "Name")}{sortHead("size", "Size", s.hide)}<span className={cn(s.hcell, s.hide, s.type)}>Type</span>{sortHead("newest", "Changed", s.hide)}<span />
              </div>
              {items.map((n) => (
                <div key={n.id} className={cn(s.row, over === n.id && s.over)} role="row" aria-selected={sel.has(n.id)} data-fm-row={n.id} data-kind={n.kind} data-name={n.name} {...dragProps(n)}>
                  {checkBtn(n)}
                  <button type="button" className={s.name} onClick={() => void openNode(n)} data-fm-open><Icon n={n} /><span className={s.nameText}><span className={s.nameMain}>{n.name}</span>{n.kind === "folder" ? <small>{plural(n.children ?? 0, "item")}{n.locked ? " · kept by DineFlow" : ""}</small> : <small className={s.meta}>{fmtBytes(n.bytes)} · {typeWord(n)} · {whenIST(n.updated_at)}</small>}</span></button>
                  <span className={cn(s.dim, s.num, s.hide)}>{n.kind === "file" ? fmtBytes(n.bytes) : "—"}</span>
                  <span className={cn(s.hide, s.type)}><span className={s.chip} data-k={kindOf(n)}>{typeWord(n)}</span></span>
                  <span className={cn(s.dim, s.num, s.hide, s.when)}>{whenIST(n.updated_at)}</span>
                  {quick(n)}
                  {moreBtn(n)}
                </div>))}
            </div>
          ) : (
            <div className={s.gridWrap} role="grid" aria-label="Files">
              {folderItems.length > 0 && <>
                <div className={s.groupHead}>Folders <span>{folderItems.length}</span></div>
                <div className={s.folderGrid}>
                  {folderItems.map((n) => (
                    <div key={n.id} className={cn(s.fcard, over === n.id && s.over)} role="row" aria-selected={sel.has(n.id)} data-fm-row={n.id} data-kind={n.kind} data-name={n.name} {...dragProps(n)}>
                      {checkBtn(n)}
                      <button type="button" className={s.fcardMain} onClick={() => void openNode(n)} data-fm-open><Icon n={n} /><span className={s.nameText}><span className={s.nameMain}>{n.name}</span><small>{plural(n.children ?? 0, "item")}</small></span></button>
                      {moreBtn(n)}
                    </div>))}
                </div>
              </>}
              {fileItems.length > 0 && <>
                <div className={s.groupHead}>Files <span>{fileItems.length}</span></div>
                <div className={s.fileGrid}>
                  {fileItems.map((n) => (
                    <div key={n.id} className={cn(s.card, over === n.id && s.over)} role="row" aria-selected={sel.has(n.id)} data-fm-row={n.id} data-kind={n.kind} data-name={n.name} {...dragProps(n)}>
                      <button type="button" className={s.cardMain} onClick={() => void openNode(n)} data-fm-open>
                        <span className={s.preview} data-k={kindOf(n)}>
                          {thumbs[n.id] ? (
                            // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived address of a private file
                            <img src={thumbs[n.id]} alt="" className={s.thumb} loading="lazy" />) : <Icon n={n} size="lg" />}
                        </span>
                        <span className={s.cardFoot}><span className={s.t}>{n.name}</span><span className={s.dim}>{fmtBytes(n.bytes)} · {typeWord(n)}</span></span>
                      </button>
                      {checkBtn(n)}{moreBtn(n)}
                    </div>))}
                </div>
              </>}
            </div>
          )}
          {menu && byId.get(menu.id) && rowMenu(byId.get(menu.id)!)}
          {drop && <div className={s.dropZone} aria-hidden><span className={s.dropIco}><CloudUpload size={30} /></span><b>Drop to upload</b><span>into {here}</span></div>}
          <div className={s.status} data-fm-status>
            <span>{plural(listing?.folders ?? 0, "folder")} · {plural(listing?.files ?? 0, "file")}</span>
            <span className={s.num}>{fmtBytes(used)}{cap ? ` of ${fmtBytes(cap)}` : ""}</span>
            {cap ? <span className={s.meter}><i style={{ width: `${pct}%` }} /></span> : null}
            <span className={s.grow} />
            <span>Up to {fmtBytes(FILE_MAX)} a file<span className={s.dropHint}> · drop files here</span></span>
          </div>
        </div>
      </div>

      {/* the dock: the selection and the uploads float at the foot of the window */}
      {(sel.size > 0 || jobs.length > 0) && (
        <div className={s.dock}>
          {jobs.length > 0 && (
            <div className={s.jobs} data-fm-jobs>
              <div className={s.jobsHead}><CloudUpload size={16} /><b>{live ? `Uploading ${plural(live, "file")}` : bad ? `${plural(bad, "upload")} failed` : "Uploads done"}</b>{!live && <button type="button" className={s.x} aria-label="Close" onClick={() => setJobs([])}><X size={15} /></button>}</div>
              {jobs.map((j) => (
                <div key={j.id} className={cn(s.job, j.error && s.bad)} data-job={j.error ? "error" : j.done ? "done" : "busy"}>
                  <span className={s.t}>{j.name}</span><span className={s.jobSt}>{j.error ?? (j.done ? "Added" : `${j.pct}%`)}</span>
                  {!j.done && <span className={s.meter}><i style={{ width: `${j.pct}%` }} /></span>}
                  {j.error && <button type="button" className={s.x} aria-label="Dismiss" onClick={() => setJobs((x) => x.filter((y) => y.id !== j.id))}><X size={15} /></button>}
                </div>))}
            </div>
          )}
          {sel.size > 0 && (
            <div className={s.sel} data-fm-selection>
              <button type="button" className={s.x} aria-label="Clear selection" onClick={() => setSel(new Set())}><X size={16} /></button>
              <span className={s.selN}><span className={s.n}>{sel.size}</span> selected</span>
              <span className={s.selActs}>
                {selected.length === 1 && selected[0].kind === "file" && <button type="button" className={s.selBtn} onClick={() => void download(selected[0])} data-fm-download><Download size={16} /><span className={s.lbl}>Download</span></button>}
                {selected.length === 1 && !selected[0].locked && <button type="button" className={s.selBtn} onClick={() => startRename(selected[0])} data-fm-rename><Pencil size={16} /><span className={s.lbl}>Rename</span></button>}
                {selected.every((n) => !n.locked) && <button type="button" className={s.selBtn} onClick={() => startMove([...sel])} data-fm-move><FolderInput size={16} /><span className={s.lbl}>Move to…</span></button>}
                {selected.every((n) => !n.locked) && <button type="button" className={cn(s.selBtn, s.danger)} onClick={() => void remove(selected)} data-fm-delete><Trash2 size={16} /><span className={s.lbl}>Delete</span></button>}
              </span>
            </div>
          )}
        </div>
      )}

      {/* dialogs */}
      <Sheet open={dialog?.kind === "mkdir"} onClose={() => setDialog(null)} title="New folder">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void mkdir(); }}>
          <label className={s.field}><span className={s.ico} data-k="folder"><FolderPlus size={17} /></span><input className={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Folder name" autoFocus maxLength={120} aria-label="Folder name" data-fm-name /></label>
          <p className="footnote">Inside {here}.</p>
          <div className="grid grid-cols-2 gap-2"><Button variant="gray" type="button" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" loading={busy} disabled={!name.trim()} data-fm-ok>Create</Button></div>
        </form>
      </Sheet>
      <Sheet open={dialog?.kind === "newtext"} onClose={() => setDialog(null)} title="New text file">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void newText(); }}>
          <label className={s.field}><span className={s.ico} data-k="text"><FilePlus2 size={17} /></span><input className={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="notes.txt" autoFocus maxLength={120} aria-label="File name" data-fm-name /></label>
          <p className="footnote">A .txt, .md, .csv or .json you can write here. It opens in the editor once made.</p>
          <div className="grid grid-cols-2 gap-2"><Button variant="gray" type="button" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" loading={busy} disabled={!name.trim()} data-fm-ok>Create</Button></div>
        </form>
      </Sheet>
      <Sheet open={dialog?.kind === "rename"} onClose={() => setDialog(null)} title="Rename">
        {dialog?.kind === "rename" && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void rename(dialog.node); }}>
          <label className={s.field}><Icon n={dialog.node} /><input className={s.input} value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={120} aria-label="New name" data-fm-name onFocus={(e) => { const i = dialog.node.kind === "file" ? e.target.value.lastIndexOf(".") : -1; e.target.setSelectionRange(0, i > 0 ? i : e.target.value.length); }} /></label>
          <div className="grid grid-cols-2 gap-2"><Button variant="gray" type="button" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" loading={busy} disabled={!name.trim() || name.trim() === dialog.node.name} data-fm-ok>Rename</Button></div>
        </form>}
      </Sheet>
      <Sheet open={dialog?.kind === "move"} onClose={() => setDialog(null)} title={dialog?.kind === "move" ? `Move ${dialog.ids.length === 1 ? `“${byId.get(dialog.ids[0])?.name ?? "it"}”` : `${dialog.ids.length} items`} to…` : "Move"}>
        {dialog?.kind === "move" && (() => { const blocked = new Set<string>(); for (const id of dialog.ids) if (byId.get(id)?.kind === "folder") for (const x of subtree(id)) blocked.add(x); return (
          <div className="space-y-4">
            <div className={s.pick} data-fm-pick>
              <button type="button" className={s.leaf} aria-current={moveTo === null ? "true" : undefined} onClick={() => setMoveTo(null)} data-pick-folder="top"><span className={s.leafIco} data-k="home"><Home size={16} /></span><span className={s.leafName}>{title}</span></button>
              <Pick parent={null} depth={1} blocked={blocked} />
            </div>
            <div className="grid grid-cols-2 gap-2"><Button variant="gray" onClick={() => setDialog(null)}>Cancel</Button><Button loading={busy} disabled={moveTo === cur} onClick={() => void move(dialog.ids, moveTo)} data-fm-ok>Move here</Button></div>
          </div>); })()}
      </Sheet>
      <Sheet open={dialog?.kind === "preview"} onClose={() => setDialog(null)} title={dialog?.kind === "preview" ? dialog.node.name : "Preview"} wide>
        {dialog?.kind === "preview" && (() => { const n = dialog.node, k = kindOf(n); return (
          <div className="space-y-4" data-fm-preview={k}>
            <div className={s.stage}>
              {!dialog.url ? <span className={s.stageNote}><RefreshCw size={16} className="animate-spin" /> Opening…</span>
                : k === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived address of a private file: next/image cannot cache or size it
                  <img src={dialog.url} alt={n.name} className={s.img} />)
                : k === "pdf" ? <iframe src={dialog.url} title={n.name} className={s.frame} />
                : k === "video" ? <video src={dialog.url} controls className={s.img} />
                : k === "audio" ? <div className={s.stageNote}><Icon n={n} size="lg" /><audio src={dialog.url} controls className="w-full max-w-md" /></div>
                : <span className={s.stageNote}><Icon n={n} size="lg" />No preview for this kind of file — download it to open it.</span>}
            </div>
            <div className={s.facts}>
              <div className={s.fact}><small>Size</small><b>{fmtBytes(n.bytes)}</b></div><div className={s.fact}><small>Type</small><b>{n.mime || typeWord(n)}</b></div>
              <div className={s.fact}><small>Changed</small><b>{whenIST(n.updated_at)}</b></div><div className={s.fact}><small>Added</small><b>{whenIST(n.created_at)}</b></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void download(n)} data-fm-preview-download><Download size={16} /> Download</Button>
              {!n.locked && <Button variant="gray" onClick={() => { setName(n.name); setDialog({ kind: "rename", node: n }); }}><Pencil size={16} /> Rename</Button>}
              {!n.locked && <Button variant="gray" onClick={() => { setDialog(null); void remove([n]); }}><Trash2 size={16} /> Delete</Button>}
            </div>
          </div>); })()}
      </Sheet>
      <Sheet open={dialog?.kind === "edit"} onClose={() => { if (dialog?.kind === "edit" && dialog.text !== dialog.was && !confirm("Close without saving?")) return; setDialog(null); }} title={dialog?.kind === "edit" ? dialog.node.name : "Edit"} wide>
        {dialog?.kind === "edit" && (
          <div className="space-y-3" data-fm-editor>
            <textarea className={s.editor} value={dialog.text} onChange={(e) => setDialog({ ...dialog, text: e.target.value })} spellCheck={false} aria-label={`The words of ${dialog.node.name}`} data-fm-editor-text
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void saveText(dialog.node, dialog.text); } }} />
            <div className={cn(s.status, s.editStatus)}><span className={s.num}>{dialog.text.length.toLocaleString("en-IN")} characters · {fmtBytes(new Blob([dialog.text]).size)}</span><span className={s.grow} /><span className={cn(s.saved, dialog.text !== dialog.was && s.unsaved)}>{dialog.text !== dialog.was ? "Unsaved changes" : "Saved"}</span></div>
            <div className="flex flex-wrap gap-2">
              <Button loading={busy} disabled={dialog.text === dialog.was || dialog.node.locked} onClick={() => void saveText(dialog.node, dialog.text)} data-fm-save><Save size={16} /> Save</Button>
              <Button variant="gray" onClick={() => void download(dialog.node)}><Download size={16} /> Download</Button>
              <Button variant="gray" onClick={() => { if (dialog.text === dialog.was || confirm("Close without saving?")) setDialog(null); }}>Close</Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

# File Manager, and a property's backup before it is deleted

**Routes** `/files` (the owner and managers) · `/admin/files` (Master control, the rail's *Files*) · the *Delete this
property* sheet in Master control
**Files** `components/files/FileManager.tsx` + `FileManager.module.css` (the one component both pages draw) ·
`lib/files/actions.ts` (every write) · `lib/files/shared.ts` (the sizes and `isTextFile`) · `app/(app)/files/page.tsx` ·
`app/admin/files/page.tsx` · `app/admin/actions.ts` (`deleteProperty`, the backup first) · `app/admin/AdminClient.tsx`
(the delete sheet's *Deleted, backup kept* view) · `components/shell/sections.ts` (the FRESH row `files`) ·
`packages/shared/src/features.ts` (the `files` add-on)
**Reads** `files_list(master, parent)` · `files_folders(master)` · `file_nodes` (RLS: the space's own people) · the private
bucket `files` on signed addresses
**Writes** `files_mkdir` · `files_rename` · `files_move` · `files_put` · `files_delete` · `files_keep_deleted_property`
(Master control, after the export) — table `file_nodes`, bucket `files` (0192; `files_delete` re-made in 0193)

## What it is

Built 2026-11-22/23 (the owner: "when Master control deletes a property, take a backup of its important data first,
then delete it completely — carefully; put that backup in a folder of a new File Manager in Master control, a real
file-manager design: new folder, delete, rename, edit, folders inside folders; and the File Manager in the owner's
section too"). Two spaces of one private bucket: Master control's own (`master/…`) and each property's (`<id>/…`, 500 MB,
the owner and managers). The master's space has a locked **Deleted properties** folder that the delete action fills.

## How it works

- **One component, two pages.** `FileManager` takes `master` and the first listing; the page fetches it so there is no
  empty flash. Everything after is the component's own state — the actions **do not revalidate** (a server re-render
  after each click reset the open folders, seen once). Tree on the left from 1024px (folders only, `files_folders`;
  unfold with the chevron; the current folder's ancestors are opened on arrival), crumbs and a back button, the
  toolbar (New folder · New text · Upload · search this folder · list / grid · refresh), rows or tiles, a selection bar
  (Rename for one, Move to…, Download for one file, Delete), a row menu (⋯), drag-and-drop (files from the desk onto
  the pane or a folder; a row onto a folder row or tree node), a status line (folders, files, size against the cap).
- **A file goes from the browser to the bucket** on a signed address (`filesUploadUrl` — a server action's body stops
  at 2 MB), then `filesPut` registers it; a file of the same name in the folder is replaced and its old object removed.
  `files_put` refuses an object outside the space's own top folder, over 50 MB, or past the property's 500 MB.
- **Preview / edit.** An image, PDF, video or sound opens in a sheet on a five-minute signed address; a text file under
  1 MB (`isTextFile`: by mime or ending) opens in an editor with Save (Ctrl+S) — the new words become a new object, the
  row is re-pointed, the old object removed; *New text* makes one. Anything else: Download.
- **Delete** asks (`ask`, the in-app dialog), removes the rows in one statement (the subtree, `RETURNING object_path`)
  and then the objects from the bucket — a locked node anywhere in the tree refuses. Rename, move (never into itself)
  and names (unique in a folder, case blind; no `/` or `\`; 120 letters) are checked in the database.
- **The delete of a property (`deleteProperty`):** the name typed must match; then `runBackup(kind: "property")` —
  the same export Data → Backups makes (every row of the property's tables with secrets left out, its own stored files
  up to the files cap; a private file the master cannot read is noted, not lost), written to the `backups` bucket and
  recorded as *Before delete: name*; the file is read back and copied into `files` as `master/deleted-…json.gz` with an
  `about.md` beside it (who, when, the counts from `admin_delete_preview`, how to bring it back); then
  `files_keep_deleted_property` makes *Deleted properties* (locked, once) → *name · YYYY-MM-DD HH.MM* (a suffix if that
  exists) with the two files and logs `delete_property.backup`; **only then** `admin_delete_property`. If any step
  before it fails, nothing is deleted and the sheet says so. The sheet ends on *Deleted, backup kept* with the folder's
  name, the counts and *Open File Manager*. The property's own File Manager rows cascade with it; its objects in the
  bucket stay (nothing in the browser can delete another space's objects) — the backup carries their bytes when under
  the cap.
- **The owner's row** is a FRESH row (`files`, owner and manager, under *Business & growth*) and an add-on
  (`files`, on by default; `FEATURE_ROUTES` gates `/files`; `default_features()` re-made in 0192). Master control →
  Access → Add-ons switches it per property.

## Before you edit

- **`DELETE` without `WHERE` is refused on the live database** (Supabase's safeupdate guard on the API roles): 0192's
  `files_delete` cleared a temp table with a bare `delete from _files_gone` and every delete failed with "DELETE requires
  a WHERE clause" — 0193 re-made it without the table. Collect with a CTE and delete in one statement.
- **A `"use server"` file may export only functions** — `FILE_MAX`, `TEXT_MAX`, `isTextFile` live in `lib/files/shared.ts`.
- **No `revalidatePath` from these actions** (above). The page's `initial` prop would change and reset the component.
- **`--font-mono` is Oswald** (the figures' face), not a code face: the editor names `ui-monospace, …` itself.
- The row menu's x is clamped to the screen (`Math.max(8, …)`) — on a phone it opened off the left edge.
- A probe cannot sign in as the master: the probes make a **throwaway master** (a demo owner given a `platform_admins`
  row for the run, removed after) and a second demo property to delete, renamed and with `demo_expires_at` nulled —
  the Properties list hides demos. testing-and-gates.md, 2026-11-23.

## Verify

```
node dry192.mjs                 # 26 — the table, bucket, policies, add-on; master's space (mkdir, rename, move, put, replace,
                                #      delete with paths); the keeper (locked root, a subfolder per delete, logged); a
                                #      property's space (cap, its own folder only, cannot see or touch the master's); anon
node dry193.mjs                 # 5  — files_delete as the API role: a tree and a file in one call, the locked root refuses
node pw/files-owner.mjs         # 27 — /files at 1440 dark, 834 ember, 412 paper (see testing-and-gates.md)
node pw/files-master.mjs        # 15 — the throwaway master: Manage → Danger zone → Back up, then delete → the folder, about.md
```

## See also

[admin-and-membership.md](admin-and-membership.md) (Master control, Data → Backups) · [settings.md](settings.md) ·
[data-and-rls.md](data-and-rls.md) · [testing-and-gates.md](testing-and-gates.md)

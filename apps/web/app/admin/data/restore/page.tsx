import { createClient } from "@/lib/supabase/server";
import { RestorePanel } from "../BackupsPanel";
import { NodeRestore } from "./NodeRestore";
import type { Backup, DataServer, NodeFile } from "../types";
export const metadata = { title: "Restore · Data · Master control" };
export const dynamic = "force-dynamic";

/** Data → Restore: bring back missing rows from a backup on the connected server (or the server named in ?server=). */
export default async function RestorePage({ searchParams }: { searchParams: Promise<{ server?: string; file?: string }> }) {
  const { server, file } = await searchParams;
  const s = await createClient();
  const { data: sv } = await s.rpc("data_servers_get");
  const servers = (sv ?? []) as DataServer[];
  const x = (server && servers.find((y) => y.id === server)) || servers.find((y) => y.active) || servers[0];
  if (x.kind === "cloud") {
    const { data: bk } = await s.from("data_backups").select("id, kind, status, label, restaurant_id, started_at, finished_at, file_path, size_bytes, raw_bytes, tables, rows_total, files, files_bytes, verified_at, verify_ok, verify_note, offsite_at, offsite_ok, offsite_note, error, server_id")
      .eq("server_id", x.id).eq("status", "done").order("started_at", { ascending: false }).limit(60);
    return <div className="grid gap-4"><RestoreHead servers={servers} x={x} /><RestorePanel backups={(bk ?? []) as Backup[]} /></div>;
  }
  const [{ data: files }, { data: bk }] = await Promise.all([s.rpc("data_server_files", { p_id: x.id }), s.from("data_backups").select("id, file_path, manifest, kind, label, rows_total, tables, started_at, size_bytes").eq("server_id", x.id).eq("status", "done").order("started_at", { ascending: false }).limit(60)]);
  const { data: meta } = await s.rpc("data_tables");
  return <div className="grid gap-4"><RestoreHead servers={servers} x={x} /><NodeRestore server={x} files={(files ?? []) as NodeFile[]} backups={(bk ?? []) as Backup[]} fks={(meta as { fks?: { child: string; parent: string }[] } | null)?.fks ?? []} preselect={file ?? null} /></div>;
}

function RestoreHead({ servers, x }: { servers: DataServer[]; x: DataServer }) {
  const others = servers.filter((y) => y.id !== x.id && (y.kind === "cloud" || y.backups > 0));
  return (
    <div className="flex items-center gap-2 flex-wrap text-[13px] text-[var(--color-label-2)]" data-restore-from={x.kind}>
      <span>Restoring from <b className="text-[var(--color-label)]">{x.name}</b>.</span>
      {others.length > 0 && <span>Or from: {others.map((y, i) => <span key={y.id}>{i ? " · " : ""}<a className="font-semibold underline" href={`/admin/data/restore?server=${y.id}`}>{y.name}</a></span>)}</span>}
    </div>
  );
}

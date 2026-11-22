"use client";
import { useState } from "react";
import { Copy, Check, Download } from "lucide-react";
import { Note } from "../bits";
import type { SetupInfo } from "../servers/Setup";
import { Setup } from "../servers/Setup";
import s from "../Data.module.css";

/** The NAS brands a node can live on. Synology, QNAP and any other NAS with Docker run it as a container from a compose file; a
 *  Linux box or a Windows PC beside the NAS runs it the way an own server does (the Servers tab's installers), with its folder on
 *  the NAS share. */
export type NasBrand = "synology" | "qnap" | "docker" | "linux" | "windows";
export const BRANDS: { key: NasBrand; label: string; sub: string; how: string }[] = [
  { key: "synology", label: "Synology", sub: "DSM 7 · Container Manager", how: "docker" },
  { key: "qnap", label: "QNAP", sub: "QTS · Container Station", how: "docker" },
  { key: "docker", label: "Other NAS with Docker", sub: "Asustor, TrueNAS, Unraid, a Pi…", how: "docker" },
  { key: "linux", label: "Linux box beside the NAS", sub: "The NAS share mounted as a folder", how: "installer" },
  { key: "windows", label: "Windows PC beside the NAS", sub: "The NAS share as a drive letter", how: "installer" },
];
export const BRAND_LABEL: Record<NasBrand, string> = Object.fromEntries(BRANDS.map((b) => [b.key, b.label])) as Record<NasBrand, string>;

function CopyBlock({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className={s.code} data-setup-code={label}>{text}
      <button type="button" className={s.copy} onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* selectable */ } }} aria-label={`Copy ${label}`}>
        {done ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />} {done ? "Copied" : "Copy"}</button>
    </div>
  );
}

/** Where things land on the NAS: one shared folder, two sub-folders. */
export const NAS_PATH: Record<NasBrand, string> = { synology: "/volume1/DineFlow", qnap: "/share/DineFlow", docker: "/mnt/DineFlow", linux: "/mnt/nas/DineFlow", windows: "Z:\\DineFlow" };

/** The compose file for a NAS: the official Node image, the node program fetched from the cloud at start (so an update is a container
 *  restart, nothing to copy), the NAS folder mounted at /data, and the three settings from the .env. */
export function composeFor(brand: NasBrand, setup: SetupInfo, token: string | null, base: string) {
  const dir = NAS_PATH[brand];
  return `services:
  dineflow-node:
    image: node:20-alpine
    container_name: dineflow-node
    restart: unless-stopped
    working_dir: /app
    command: sh -c "wget -qO /app/dineflow-data-node.mjs ${base}/data-node/dineflow-data-node.mjs && node /app/dineflow-data-node.mjs"
    environment:
      DINEFLOW_URL: "${setup.url}"
      DINEFLOW_ANON_KEY: "${setup.anonKey}"
      DINEFLOW_NODE_TOKEN: "${token ?? "<the token shown when the NAS was added — Rotate token makes a new one>"}"
      DINEFLOW_NODE_DIR: "/data/backups"
      DINEFLOW_FILES_DIR: "/data/files"
      DINEFLOW_CLOUD_URL: "${base}"
      DINEFLOW_NIGHTLY_HOUR: "2"
    volumes:
      - ${dir}:/data
`;
}

const DOCKER_STEPS: Record<"synology" | "qnap" | "docker", { open: string; make: string; paste: string }> = {
  synology: { open: "DSM → Package Center → install Container Manager (free). File Station → make a shared folder DineFlow.", make: "Container Manager → Project → Create → name dineflow-node → Path: the DineFlow folder → Source: Create docker-compose.yml.", paste: "Paste the compose file below, Next, Done. The container starts and stays started after a reboot." },
  qnap: { open: "QTS → App Center → install Container Station (free). File Station → make a shared folder DineFlow.", make: "Container Station → Applications → Create → name dineflow-node.", paste: "Paste the compose file below, Validate YAML, Create. It starts and stays started after a reboot." },
  docker: { open: "Make a folder DineFlow on the NAS (a share you will keep).", make: "Open a shell on the NAS (SSH, or the NAS's Docker app) and make docker-compose.yml in that folder.", paste: "Paste the compose file below, then: docker compose up -d" },
};

/** How to put the node on a NAS. A Docker brand gets the compose file; a box beside the NAS gets the Servers tab's installer with the
 *  NAS share as its folder. The token shows only when it was just made. */
export function NasSetup({ brand, name, token, setup }: { brand: NasBrand; name: string; token: string | null; setup: SetupInfo }) {
  const base = setup.base || (typeof window !== "undefined" ? window.location.origin : "");
  if (brand === "linux" || brand === "windows") {
    return (
      <div className="grid gap-3" data-nas-setup={brand}>
        <Note>This box runs the node like an own server; point its folder at the NAS share — <code>{NAS_PATH[brand]}</code> — in the <code>.env</code> below (<code>DINEFLOW_NODE_DIR</code>), so the files sit on the NAS, not on the box.</Note>
        <Setup kind="own" name={name} token={token} setup={setup} />
      </div>
    );
  }
  const st = DOCKER_STEPS[brand];
  return (
    <div className="grid gap-4" data-nas-setup={brand}>
      {token ? <Note tone="warn" data-setup-token>This token is shown <b>once</b>. The compose file below already carries it — copy it now; if it is lost, use Rotate token for a new one.</Note>
        : <Note>The token was shown when {name} was added. If you no longer have it, press <b>Rotate token</b> and set up again with the new compose file.</Note>}
      <ol className={s.stepsList}>
        <li className={s.stepRow}><div><b>Make the folder</b><span className="text-[var(--color-label-2)]">{st.open}</span></div></li>
        <li className={s.stepRow}><div><b>Make the project</b><span className="text-[var(--color-label-2)]">{st.make}</span></div></li>
        <li className={s.stepRow}><div><b>Paste this compose file</b><CopyBlock text={composeFor(brand, setup, token, base)} label="docker-compose.yml" /><span className="text-[var(--color-label-2)]">{st.paste}</span></div></li>
        <li className={s.stepRow}><div><b>Come back here</b><span className="text-[var(--color-label-2)]">Within a minute <b>{name}</b> shows online with its disk. Backups go to <code>{NAS_PATH[brand]}/backups</code>, copied files to <code>{NAS_PATH[brand]}/files</code>.</span></div></li>
      </ol>
      <Note>The node opens no port and never holds the database password: it asks the cloud for work every minute and needs only outgoing internet to {base || "the cloud"}. <a className="underline" href="/data-node/dineflow-data-node.mjs" download data-setup-download="node"><Download size={12} className="inline" aria-hidden /> The program itself</a>, if you would rather read it first.</Note>
    </div>
  );
}

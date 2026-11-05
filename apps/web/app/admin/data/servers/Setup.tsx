"use client";
import { useState } from "react";
import { Copy, Check, Download, Laptop, Server as ServerIcon } from "lucide-react";
import { Note } from "../bits";
import type { ServerKind } from "../types";
import s from "../Data.module.css";

export type SetupInfo = { url: string; anonKey: string; base: string };

function CopyBlock({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className={s.code} data-setup-code={label}>{text}
      <button type="button" className={s.copy} onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* the text is selectable */ } }} aria-label={`Copy ${label}`}>
        {done ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />} {done ? "Copied" : "Copy"}</button>
    </div>
  );
}

/** How to put the data node on a machine (0173): one folder, three files, one command. The token shows only when it was just made. */
export function Setup({ kind, name, token, setup }: { kind: ServerKind; name: string; token: string | null; setup: SetupInfo }) {
  const base = setup.base || (typeof window !== "undefined" ? window.location.origin : "");
  const win = kind === "laptop";
  const [os, setOs] = useState<"windows" | "linux">(win ? "windows" : "linux");
  const envText = `DINEFLOW_URL=${setup.url}\nDINEFLOW_ANON_KEY=${setup.anonKey}\nDINEFLOW_NODE_TOKEN=${token ?? "<the token shown when the server was added — Rotate token makes a new one>"}\n# where backups go on this machine (optional)\n# DINEFLOW_NODE_DIR=${os === "windows" ? "D:\\DineFlow-Backups" : "/srv/dineflow-backups"}\n`;
  return (
    <div className="grid gap-4" data-setup={kind}>
      {token ? <Note tone="warn" data-setup-token>This token is shown <b>once</b>. Copy the .env below now — if it is lost, use Rotate token for a new one.</Note>
        : <Note>The token was shown when {name} was added. If you no longer have it, press <b>Rotate token</b> above and set up again with the new one.</Note>}
      <div className="flex gap-2 flex-wrap">
        <button type="button" className={s.key} aria-pressed={os === "windows"} onClick={() => setOs("windows")} data-setup-os="windows" style={os === "windows" ? { boxShadow: "inset 0 0 0 2px var(--color-tint)" } : undefined}><Laptop size={14} aria-hidden /> Windows</button>
        <button type="button" className={s.key} aria-pressed={os === "linux"} onClick={() => setOs("linux")} data-setup-os="linux" style={os === "linux" ? { boxShadow: "inset 0 0 0 2px var(--color-tint)" } : undefined}><ServerIcon size={14} aria-hidden /> Linux / Ubuntu / Raspberry Pi</button>
      </div>
      <ol className={s.stepsList}>
        <li className={s.stepRow}><div><b>Install Node.js 20 or newer</b><span className="text-[var(--color-label-2)]">{os === "windows" ? "nodejs.org → Download the LTS → Next, Next, Finish." : "Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"}</span></div></li>
        <li className={s.stepRow}><div><b>Make a folder and download the program into it</b>
          <div className="flex gap-2 flex-wrap">
            <a className={s.key} href="/data-node/dineflow-data-node.mjs" download data-setup-download="node"><Download size={14} aria-hidden /> dineflow-data-node.mjs</a>
            {os === "windows" ? <a className={s.key} href="/data-node/install-windows.ps1" download data-setup-download="win"><Download size={14} aria-hidden /> install-windows.ps1</a>
              : <a className={s.key} href="/data-node/install-linux.sh" download data-setup-download="linux"><Download size={14} aria-hidden /> install-linux.sh</a>}
          </div>
          <span className="text-[var(--color-label-2)]">For example {os === "windows" ? "C:\\DineFlow-node" : "/opt/dineflow-node"}. Backups land in a <i>dineflow-backups</i> folder inside it unless you set another place.</span></div></li>
        <li className={s.stepRow}><div><b>Save this as a file named <code>.env</code> in that folder</b><CopyBlock text={envText} label=".env" /></div></li>
        <li className={s.stepRow}><div><b>Run the installer once</b>
          <CopyBlock text={os === "windows" ? `cd ${"C:\\DineFlow-node"}\npowershell -ExecutionPolicy Bypass -File .\\install-windows.ps1` : `cd /opt/dineflow-node\nsudo bash install-linux.sh`} label="install" />
          <span className="text-[var(--color-label-2)]">{os === "windows" ? "It tests the connection and makes a task that starts the node at every sign-in and keeps it running." : "It tests the connection and installs a service that starts at boot and restarts itself."}</span></div></li>
        <li className={s.stepRow}><div><b>Come back here</b><span className="text-[var(--color-label-2)]">Within a minute {name} shows <b>online</b> with its disk and memory. Then press <b>Connect</b> to make it the server backups go to, or leave the cloud connected and use it as a second copy.</span></div></li>
      </ol>
      <Note>To try it by hand first: <code>node dineflow-data-node.mjs --check</code> in that folder says whether it connects. The node needs only outgoing internet to {base || "the cloud"} — no port, no router change.</Note>
    </div>
  );
}

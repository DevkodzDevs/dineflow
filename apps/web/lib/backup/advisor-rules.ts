import { fmtBytes } from "./bytes";
import { FREE_LIMITS } from "./supabaseApi";
import type { Facts, Finding } from "./advisor";
export type { Facts, Finding } from "./advisor";

/** The advisor's rules (0173): findings over the facts, and the answers given without a model. Pure — tested in advisor.test.ts. */
const hours = (iso: string | null | undefined, now: number) => (iso ? (now - Date.parse(iso)) / 3600000 : Infinity);
export function findings(f: Facts, now = Date.now()): Finding[] {
  const out: Finding[] = [];
  const a = f.active; const last = a?.last_backup;
  if (!last) out.push({ level: "bad", key: "no-backup", title: "No backup on the connected server", detail: `${a?.name ?? "The connected server"} has never made a backup.`, fix: "Press Back up now.", href: "/admin/data" });
  else if (hours(last.at, now) > 30) out.push({ level: "warn", key: "stale", title: `Last backup ${Math.round(hours(last.at, now) / 24)} days ago`, detail: `${a.name}'s newest backup is from ${new Date(last.at).toDateString()}.`, fix: "Back up now, and check why the nightly did not run.", href: "/admin/data/backups" });
  else if (last.verify_ok === false) out.push({ level: "bad", key: "check-failed", title: "The newest backup failed its check", detail: "Its rows do not match what was written.", fix: "Back up again now and delete the damaged one.", href: "/admin/data/backups" });
  else out.push({ level: "ok", key: "fresh", title: "Data is backed up", detail: `${a.name} · ${Math.round(hours(last.at, now))} h ago · ${fmtBytes(last.size_bytes)}${last.verify_ok ? " · checked" : ""}.` });
  if (a?.kind === "cloud") {
    if (!f.settings.nightly) out.push({ level: "warn", key: "nightly-off", title: "The nightly backup is switched off", detail: "Only hand-made backups are taken.", fix: "Switch it on under Backups.", href: "/admin/data/backups" });
    else if (!f.env.cron || !f.env.serviceRole) out.push({ level: "warn", key: "nightly-keys", title: "The nightly backup is waiting for Vercel keys", detail: `${[!f.env.cron && "CRON_SECRET", !f.env.serviceRole && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean).join(" and ")} not set on Vercel, so the 2:00 am run cannot start.`, fix: "Set both on Vercel → Settings → Environment Variables, then deploy.", href: "/admin/data/backups" });
  } else if (a) {
    if (!a.online) out.push({ level: a.last_seen_at ? "warn" : "bad", key: "node-offline", title: `${a.name} is offline`, detail: a.last_seen_at ? `Last heard ${Math.round(hours(a.last_seen_at, now))} h ago. Its jobs wait until it is back.` : "It has never connected.", fix: a.last_seen_at ? "Check the machine is on and the node is running." : "Follow its setup on the dashboard.", href: `/admin/data/servers/${a.id}` });
    if (a.paused) out.push({ level: "warn", key: "node-paused", title: `${a.name} is paused`, detail: "It ignores new jobs and skips the nightly.", fix: "Resume it on the dashboard.", href: `/admin/data/servers/${a.id}` });
    if (!a.nightly) out.push({ level: "warn", key: "node-nightly-off", title: `${a.name}'s nightly is off`, detail: "Only hand-made backups are taken there.", href: `/admin/data/servers/${a.id}` });
  }
  for (const x of f.servers.filter((x) => x.kind !== "cloud")) {
    const r = x.last_report;
    if (r?.disk_total && r.disk_free != null && r.disk_free / r.disk_total < 0.1) out.push({ level: "bad", key: `disk-${x.id}`, title: `${x.name}'s disk is nearly full`, detail: `${fmtBytes(r.disk_free)} free of ${fmtBytes(r.disk_total)}.`, fix: `Lower "Keep the newest" or free space on the machine.`, href: `/admin/data/servers/${x.id}` });
    if (x.failed_24h > 0) out.push({ level: "warn", key: `failed-${x.id}`, title: `${x.failed_24h} job${x.failed_24h > 1 ? "s" : ""} failed on ${x.name}`, detail: r?.last_error ?? "See its job log.", href: `/admin/data/servers/${x.id}` });
    if (x.id !== a?.id && !x.online && x.last_seen_at && hours(x.last_seen_at, now) > 48) out.push({ level: "warn", key: `gone-${x.id}`, title: `${x.name} has not connected for ${Math.round(hours(x.last_seen_at, now) / 24)} days`, detail: "Its backups are only as new as its last run.", href: `/admin/data/servers/${x.id}` });
  }
  const copies = f.servers.filter((x) => x.backups > 0).length + (f.settings.offsite_on ? 1 : 0);
  if (copies < 2) out.push({ level: "warn", key: "one-place", title: "Backups live in one place only", detail: a?.kind === "cloud" ? "They sit beside the live database inside Supabase. If the project is lost, they go with it." : `Only ${a?.name} holds them.`, fix: "Add your laptop or own server (free), or switch on the outside copy to Cloudflare R2 (free to 10 GB).", href: "/admin/data/servers" });
  else out.push({ level: "ok", key: "copies", title: `Backups in ${copies} places`, detail: "A second copy outside the live project exists." });
  if (hours(f.settings.last_download_at, now) > 7 * 24 && a?.kind === "cloud") out.push({ level: "warn", key: "download", title: "No download for over a week", detail: f.settings.last_download_at ? `Last downloaded ${Math.round(hours(f.settings.last_download_at, now) / 24)} days ago.` : "Never downloaded.", fix: "Download the newest backup to a computer once a week.", href: "/admin/data/backups" });
  const pct = (f.db_bytes / FREE_LIMITS.db) * 100;
  if (pct > 80) out.push({ level: pct > 95 ? "bad" : "warn", key: "space", title: `The database is ${Math.round(pct)}% of the Free plan`, detail: `${fmtBytes(f.db_bytes)} of 500 MB.${f.days_to_full ? ` At this pace it is full in about ${f.days_to_full} days.` : ""}`, fix: "Clean up old rows, or move to Supabase Pro (8 GB).", href: "/admin/data/cleanup" });
  else out.push({ level: "ok", key: "space", title: `Database at ${Math.round(pct)}% of the Free plan`, detail: `${fmtBytes(f.db_bytes)} of 500 MB${f.days_to_full ? ` · about ${f.days_to_full} days of room at the current pace` : ""}.` });
  if (f.cleanup.total > 1000) out.push({ level: "warn", key: "cleanup", title: `${f.cleanup.total.toLocaleString("en-IN")} old rows can go`, detail: Object.entries(f.cleanup.rules).filter(([, v]) => v.rows > 0).map(([k, v]) => `${k.replace(/_/g, " ")} ${v.rows.toLocaleString("en-IN")}`).join(" · "), fix: "Run Clean-up (it asks first). Back up first if you want to be safe.", href: "/admin/data/cleanup" });
  if (f.records.check_failed) out.push({ level: "bad", key: "rec-bad", title: `${f.records.check_failed} backup${f.records.check_failed > 1 ? "s" : ""} failed a check`, detail: "Their rows do not match what was written.", fix: "Delete them and back up again.", href: "/admin/data/records?status=bad" });
  if (f.records.file_gone) out.push({ level: "warn", key: "rec-gone", title: `${f.records.file_gone} backup file${f.records.file_gone > 1 ? "s are" : " is"} gone from a server`, detail: "The record exists; the file does not.", href: "/admin/data/records" });
  if (f.records.failed_7d >= 2) out.push({ level: "warn", key: "rec-failed", title: `${f.records.failed_7d} backups failed this week`, detail: "See the errors under Records.", href: "/admin/data/records" });
  if (f.demos > 0) out.push({ level: "ok", key: "demos", title: `${f.demos} demo propert${f.demos > 1 ? "ies" : "y"} in the data`, detail: "They expire on their own and are swept." });
  if (f.health) {
    if (f.health.cache_heap != null && f.health.cache_heap < 95) out.push({ level: "warn", key: "cache", title: `Cache hits at ${f.health.cache_heap}%`, detail: "Good is 99% or more — the database is reading from disk.", href: "/admin/data/health" });
    if (f.health.connections / Math.max(1, f.health.max_connections) > 0.8) out.push({ level: "warn", key: "conn", title: "Connections nearly used up", detail: `${f.health.connections} of ${f.health.max_connections}.`, href: "/admin/data/health" });
    if (f.health.xid_pct > 20) out.push({ level: f.health.xid_pct > 50 ? "bad" : "warn", key: "xid", title: "Transaction-ID age is high", detail: `${f.health.xid_pct.toFixed(1)}% of the limit — the automatic vacuum should bring it down.`, href: "/admin/data/health" });
  }
  const order = { bad: 0, warn: 1, ok: 2 };
  return out.sort((x, y) => order[x.level] - order[y.level]);
}

export const SUGGESTED = ["Is my data safe?", "Which server should I use?", "How much space is left?", "What can I clean up?", "What happened last night?", "What should I do this week?"];

export function rulesAnswer(q: string, f: Facts, fs: Finding[]): { answer: string; steps: string[]; links: { label: string; href: string }[] } {
  const l = q.toLowerCase(); const bad = fs.filter((x) => x.level === "bad"), warn = fs.filter((x) => x.level === "warn");
  const steps = (xs: Finding[]) => xs.filter((x) => x.fix).slice(0, 5).map((x) => `${x.title}: ${x.fix}`);
  const links = (xs: Finding[]) => Array.from(new Map(xs.filter((x) => x.href).map((x) => [x.href!, { label: x.title, href: x.href! }])).values()).slice(0, 4);
  if (/safe|secure|protect|risk|danger|lose|lost/.test(l)) {
    const top = fs[0];
    return { answer: bad.length ? `Not yet. ${bad.map((x) => x.title).join("; ")}. ${top.detail}` : warn.length ? `Mostly. ${fs.find((x) => x.level === "ok")?.detail ?? ""} But ${warn.length} thing${warn.length > 1 ? "s" : ""} need${warn.length > 1 ? "" : "s"} attention: ${warn.slice(0, 2).map((x) => x.title.toLowerCase()).join(" and ")}.` : `Yes. ${fs.filter((x) => x.level === "ok").map((x) => x.detail).join(" ")}`, steps: steps([...bad, ...warn]), links: links([...bad, ...warn]).length ? links([...bad, ...warn]) : [{ label: "Overview", href: "/admin/data" }] };
  }
  if (/server|laptop|own|cloud|supabase|which|connect/.test(l)) {
    const nodes = f.servers.filter((x) => x.kind !== "cloud");
    return { answer: nodes.length ? `The live database stays on Supabase whichever server is connected — a server only holds backups. Right now ${f.active.name} is connected. ${nodes.some((x) => x.online) ? `Keep the cloud connected for speed and use ${nodes.find((x) => x.online)!.name} as the second copy, or connect it if you want the backups off Supabase.` : "Your added server is offline, so leave the cloud connected until it is back."}` : `Right now only the cloud (Supabase) holds backups — beside the live data. The cheapest second copy is your laptop or an own server running the data node: free, one file, no port to open. Add it under Servers; then either connect it or keep the cloud connected and let it hold a second copy. Supabase Pro ($25 a month) adds Supabase's own daily backups but is not needed for this.`, steps: nodes.length ? ["Servers → the server's Dashboard → Back up now, to make sure it holds a fresh copy", "Server connection (top right) → pick the one you want backups made on", "Keep both: whichever is not connected still keeps what it has"] : ["Servers → Set up your laptop (or own server) → follow the five steps", "When it shows online, press Back up now on its dashboard", "Outside copies & plans → Cloudflare R2 for a free copy outside both"], links: [{ label: "Servers", href: "/admin/data/servers" }, { label: "Outside copies & plans", href: "/admin/data/offsite" }] };
  }
  if (/space|size|room|full|big|large|grow|mb|gb/.test(l)) {
    const pct = Math.round((f.db_bytes / FREE_LIMITS.db) * 100);
    return { answer: `The database is ${fmtBytes(f.db_bytes)} — ${pct}% of the Free plan's 500 MB — and files are ${fmtBytes(f.files_bytes)} of 1 GB.${f.growth_per_day != null ? ` It grows about ${fmtBytes(Math.abs(f.growth_per_day))} a day${f.days_to_full ? `, so about ${f.days_to_full} days of room at this pace` : ""}.` : ""} The biggest tables are ${f.top_tables.slice(0, 3).map((t) => `${t.name} (${fmtBytes(t.bytes)})`).join(", ")}.${f.cleanup.total > 500 ? ` ${f.cleanup.total.toLocaleString("en-IN")} old rows can go in Clean-up.` : ""}`, steps: [f.cleanup.total > 500 ? "Clean-up → Clean all (it asks first)" : "Nothing to clean yet", pct > 70 ? "Outside copies & plans → compare Supabase Pro (8 GB) when you near 80%" : "Check back monthly — Overview → Growth"], links: [{ label: "Overview", href: "/admin/data" }, { label: "Clean-up", href: "/admin/data/cleanup" }] };
  }
  if (/clean|old|delete|remove|prune|junk/.test(l)) {
    const rules = Object.entries(f.cleanup.rules).filter(([, v]) => v.rows > 0);
    return { answer: rules.length ? `${f.cleanup.total.toLocaleString("en-IN")} old rows can go: ${rules.map(([k, v]) => `${v.rows.toLocaleString("en-IN")} ${k.replace(/_/g, " ")} older than ${v.days} days`).join("; ")}. None of it is business data — bills, orders, payments, guests and bookings are never cleaned.` : "Nothing is waiting to be cleaned right now.", steps: rules.length ? ["Back up now first, if you want to be safe", "Clean-up → Clean all, or one rule at a time", "Switch on Every night for the rules you want kept tidy"] : [], links: [{ label: "Clean-up", href: "/admin/data/cleanup" }] };
  }
  if (/night|yesterday|last run|happened|recent|log/.test(l)) {
    const ln = f.records.last_nightly_at;
    return { answer: ln ? `The last nightly backup ran ${new Date(ln).toDateString()}${hours(ln, Date.now()) > 30 ? " — that is more than a day ago, so last night's did not run" : ""}. ${f.records.failed_7d ? `${f.records.failed_7d} backup${f.records.failed_7d > 1 ? "s" : ""} failed this week.` : "No failures this week."}` : `No nightly backup has run yet. ${f.active.kind === "cloud" ? (f.env.cron && f.env.serviceRole ? "It is switched on for 2:00 am." : "It is waiting for CRON_SECRET and SUPABASE_SERVICE_ROLE_KEY on Vercel.") : `${f.active.name} runs it at 2:00 am on its own clock while it is on.`}`, steps: steps(fs.filter((x) => /nightly|stale|offline/.test(x.key))), links: [{ label: "Records", href: "/admin/data/records" }, { label: "Backups", href: "/admin/data/backups" }] };
  }
  // the general answer: the findings, in order
  return { answer: bad.length || warn.length ? `${bad.length + warn.length} thing${bad.length + warn.length > 1 ? "s" : ""} to look at, most serious first: ${[...bad, ...warn].slice(0, 3).map((x) => x.title.toLowerCase()).join("; ")}.` : "Everything looks fine. Back up, keep a second copy, download once a week, and clean up now and then.", steps: steps([...bad, ...warn]).length ? steps([...bad, ...warn]) : ["Overview → Back up now", "Backups → Download the newest, once a week", "Servers → add your laptop for a free second copy"], links: links([...bad, ...warn]).length ? links([...bad, ...warn]) : [{ label: "Overview", href: "/admin/data" }] };
}

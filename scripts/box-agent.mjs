#!/usr/bin/env node
/**
 * DineFlow Box agent — runs inside the Box, forever.
 *   every minute : if the internet is reachable → PUSH what changed in the building to the cloud,
 *                  then PULL what the world sent (online orders, OTA & direct bookings, membership,
 *                  Neighbours results). Both are idempotent, so a flaky connection is harmless.
 *   every night  : pg_dump to ./backups (keeps 14) and to the USB path if mounted.
 * No internet? It simply waits. Nothing in the building depends on this agent.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, unlinkSync, copyFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let postgres; try { postgres = require("postgres"); } catch { postgres = require("/usr/local/lib/node_modules/postgres"); }

const DB = process.env.DATABASE_URL, CLOUD = (process.env.CLOUD_URL || "").replace(/\/$/, ""), TOKEN = process.env.BOX_SYNC_TOKEN || "";
const BACKUP_HOUR = Number(process.env.BACKUP_HOUR || 2), EVERY = Number(process.env.SYNC_SECONDS || 60) * 1000;
const log = (m) => console.log(`[box ${new Date().toISOString().slice(0, 19)}] ${m}`);
const sql = postgres(DB, { max: 1, onnotice: () => {} });
let wasOnline = null;

async function online() {
  try { const r = await fetch(`${CLOUD || "https://www.google.com/generate_204"}${CLOUD ? "/api/box/ping" : ""}`, { signal: AbortSignal.timeout(5000) }); return r.ok || r.status === 204; } catch { return false; }
}
async function cursor(key) { const r = await sql`select cursor from sync_state where key = ${key}`; return r[0]?.cursor ?? null; }
async function setCursor(key, at, note) { await sql`insert into sync_state(key, cursor, note) values (${key}, ${at}, ${note}) on conflict (key) do update set cursor = excluded.cursor, note = excluded.note, updated_at = now()`; }

async function push() {
  const since = await cursor("push");
  const [{ box_export: body }] = await sql`select box_export(${since})`;
  const res = await fetch(`${CLOUD}/api/box/push`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`push: cloud said ${res.status}`);
  const j = await res.json(); await setCursor("push", j.at, `${j.received} rows`); return j;
}
async function pull() {
  const since = await cursor("pull");
  const res = await fetch(`${CLOUD}/api/box/pull?since=${encodeURIComponent(since ?? "")}`, { headers: { authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`pull: cloud said ${res.status}`);
  const j = await res.json();
  const [{ box_apply: r }] = await sql`select box_apply(${j})`;
  return { ...r, orders: (j.online_orders ?? []).length, bookings: (j.bookings ?? []).length, membership: j.membership };
}

async function tick() {
  if (!CLOUD || !TOKEN) return;                           // standalone Box: nothing to do
  const up = await online();
  if (up !== wasOnline) { log(up ? "internet is back — syncing" : "internet is down — the building keeps working on its own"); wasOnline = up; }
  if (!up) return;
  try { await push(); const p = await pull(); if (p.orders || p.bookings) log(`pulled ${p.orders} online order(s), ${p.bookings} booking(s) · membership ${p.membership}`); }
  catch (e) { log(`sync problem: ${e.message}`); }
}

function backup() {
  try {
    mkdirSync("backups", { recursive: true });
    const name = `dineflow-${new Date().toISOString().slice(0, 10)}.sql.gz`;
    execSync(`pg_dump "${DB}" --no-owner --no-privileges | gzip > backups/${name}`, { stdio: "inherit", shell: "/bin/sh" });
    const files = readdirSync("backups").filter((f) => f.endsWith(".sql.gz")).sort();
    while (files.length > 14) unlinkSync(`backups/${files.shift()}`);
    if (existsSync("usb") && statSync("usb").isDirectory()) { try { copyFileSync(`backups/${name}`, `usb/${name}`); log("backup copied to USB"); } catch (e) { log(`USB copy failed: ${e.message}`); } }
    log(`backup written: ${name}`);
  } catch (e) { log(`backup failed: ${e.message}`); }
}

log(`agent up · ${CLOUD ? `hybrid, cloud = ${CLOUD}` : "standalone (no cloud configured)"}`);
let lastBackupDay = "";
setInterval(() => { const now = new Date(), day = now.toISOString().slice(0, 10); if (now.getHours() === BACKUP_HOUR && lastBackupDay !== day) { lastBackupDay = day; backup(); } }, 60_000);
await tick(); setInterval(tick, EVERY);

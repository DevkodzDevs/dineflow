#!/usr/bin/env node
/**
 * DineFlow print bridge — lets the browser reach LAN thermal printers (port 9100).
 * Run on the billing computer:  node scripts/print-bridge.mjs
 * Then add a printer in DineFlow with transport "network" and address 192.168.1.50:9100
 *
 * It relays only to a printer on this network — a private IPv4 address (or a name that resolves to
 * one) on a raw-print port, 9100–9109 — only for a DineFlow page, and it never reports why a
 * connection failed (that goes to this window). It used to send any bytes to any host and port named
 * in the request, for any web page, and answer with the socket error: anyone on the same Wi-Fi, or
 * any site open in the cashier's browser, had a relay and a port scanner for the whole network.
 *
 *   PRINT_BRIDGE_PORT     the port this listens on (9110)
 *   PRINT_BRIDGE_HOST     the address it listens on (all of them; 127.0.0.1 if only this computer prints)
 *   PRINT_BRIDGE_PORTS    printer ports it may reach, e.g. "9100-9109,515" (9100-9109)
 *   PRINT_BRIDGE_ORIGINS  more web origins allowed to use it, comma-separated (dineflow.cloud, its
 *                         subdomains, localhost and addresses on this network are always allowed)
 */
import { createServer } from "node:http";
import { Socket, isIPv4 } from "node:net";
import { lookup } from "node:dns/promises";

const PORT = Number(process.env.PRINT_BRIDGE_PORT || 9110);
const HOST = process.env.PRINT_BRIDGE_HOST || "0.0.0.0";
const PORTS = new Set((process.env.PRINT_BRIDGE_PORTS || "9100-9109").split(",").flatMap((r) => {
  const [a, b = a] = r.trim().split("-").map(Number);
  return Number.isInteger(a) && Number.isInteger(b) && b >= a ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [];
}));
const EXTRA = (process.env.PRINT_BRIDGE_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
const MAX_BYTES = 2 * 1024 * 1024;   // a receipt is a few kilobytes; a logo raster still fits well under this

const privateV4 = (h) => {
  if (!isIPv4(h)) return false;
  const [a, b] = h.split(".").map(Number);
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
};
const thisNetwork = (h) => h === "localhost" || h === "127.0.0.1" || h === "[::1]" || privateV4(h);
function originOk(origin) {
  if (!origin) return true;            // not a browser page: the desktop app, a script on this computer
  if (EXTRA.includes(origin)) return true;
  let u; try { u = new URL(origin); } catch { return false; }
  return thisNetwork(u.hostname) || u.hostname === "dineflow.cloud" || u.hostname.endsWith(".dineflow.cloud");
}
async function printerAddress(target) {
  const m = /^([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/.exec(target);
  if (!m) return null;
  const port = Number(m[2] || 9100);
  if (!PORTS.has(port)) return null;
  let ip = m[1];
  if (!isIPv4(ip)) { try { ip = (await lookup(ip, { family: 4 })).address; } catch { return null; } }
  return privateV4(ip) ? { ip, port } : null;
}

createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (!originOk(origin)) { res.statusCode = 403; return res.end(); }
  if (origin) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "origin");
    res.setHeader("access-control-allow-headers", "content-type,x-printer");
    res.setHeader("access-control-allow-private-network", "true");
  }
  if (req.method === "OPTIONS") return res.end();
  if (req.url === "/health") return res.end("ok");
  if (req.method !== "POST" || req.url !== "/print") { res.statusCode = 404; return res.end(); }
  const to = await printerAddress(String(req.headers["x-printer"] || "").trim());
  if (!to) { res.statusCode = 400; return res.end("x-printer must be a printer on this network, like 192.168.1.50:9100"); }
  const chunks = []; let size = 0; let tooBig = false;
  req.on("data", (c) => { size += c.length; if (size > MAX_BYTES) { tooBig = true; req.destroy(); } else chunks.push(c); });
  req.on("end", () => {
    if (tooBig) return;
    const sock = new Socket();
    sock.setTimeout(5000);
    sock.connect(to.port, to.ip, () => sock.end(Buffer.concat(chunks)));
    sock.on("close", () => { if (!res.writableEnded) { res.statusCode = 200; res.end("printed"); } });
    sock.on("timeout", () => { sock.destroy(); if (!res.writableEnded) { res.statusCode = 504; res.end("printer timeout"); } });
    sock.on("error", (e) => { console.error(`✖ ${to.ip}:${to.port} — ${e.message}`); if (!res.writableEnded) { res.statusCode = 502; res.end("printer unreachable"); } });
  });
  req.on("close", () => { if (tooBig && !res.writableEnded) { res.statusCode = 413; res.end("too large"); } });
}).listen(PORT, HOST, () => console.log(`✔ DineFlow print bridge on http://localhost:${PORT} — leave this window open`));

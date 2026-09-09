#!/usr/bin/env node
/**
 * DineFlow print bridge — lets the browser reach LAN thermal printers (port 9100).
 * Run on the billing computer:  node scripts/print-bridge.mjs
 * Then add a printer in DineFlow with transport "network" and address 192.168.1.50:9100
 */
import { createServer } from "node:http";
import { Socket } from "node:net";
const PORT = process.env.PRINT_BRIDGE_PORT || 9110;
createServer((req, res) => {
  res.setHeader("access-control-allow-origin", "*"); res.setHeader("access-control-allow-headers", "content-type,x-printer");
  if (req.method === "OPTIONS") return res.end();
  if (req.url === "/health") return res.end("ok");
  if (req.method !== "POST" || req.url !== "/print") { res.statusCode = 404; return res.end(); }
  const target = String(req.headers["x-printer"] || "");
  const [host, port = "9100"] = target.split(":");
  if (!host) { res.statusCode = 400; return res.end("missing x-printer"); }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const sock = new Socket();
    sock.setTimeout(5000);
    sock.connect(Number(port), host, () => sock.end(Buffer.concat(chunks)));
    sock.on("close", () => { res.statusCode = 200; res.end("printed"); });
    sock.on("timeout", () => { sock.destroy(); res.statusCode = 504; res.end("printer timeout"); });
    sock.on("error", (e) => { res.statusCode = 502; res.end(e.message); });
  });
}).listen(PORT, () => console.log(`✔ DineFlow print bridge on http://localhost:${PORT} — leave this window open`));
